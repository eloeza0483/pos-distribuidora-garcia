import { buildTicket } from './tickets.js'
import { getDefaultClientId } from './clients.js'

export class PriceMismatchError extends Error {
  constructor(details) {
    super('El precio de uno o más productos cambió antes de cobrar.')
    this.name = 'PriceMismatchError'
    this.details = details
  }
}

export class MissingBaseQtyError extends Error {
  constructor(productName, unitLabel) {
    super(`Falta definir cuántas piezas trae "${unitLabel}" de ${productName}.`)
    this.name = 'MissingBaseQtyError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(productId) {
    super(`Producto ${productId} no encontrado.`)
    this.name = 'ProductNotFoundError'
  }
}

export class CashTooLowError extends Error {
  constructor(total, cashReceived) {
    super(`El efectivo recibido (${cashReceived}) no alcanza para cubrir el total (${total}).`)
    this.name = 'CashTooLowError'
  }
}

export class SaleNotFoundError extends Error {
  constructor() {
    super('La venta no existe.')
    this.name = 'SaleNotFoundError'
  }
}

export class SaleAlreadyCancelledError extends Error {
  constructor() {
    super('Esta venta ya está cancelada.')
    this.name = 'SaleAlreadyCancelledError'
  }
}

// Trae una venta con sus renglones y el nombre del cliente, para armar el
// ticket o el detalle. Acepta cualquier "queryable" (fastify.pg fuera de una
// transacción, o el client de una transacción en curso) para poder reusarse
// en el camino de replay idempotente de createSale.
async function fetchOrderWithItems(queryable, orderId) {
  const { rows: orderRows } = await queryable.query(
    `SELECT o.*, c.client_name
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.id = $1`,
    [orderId]
  )
  const order = orderRows[0]
  if (!order) return null

  const { rows: items } = await queryable.query(
    `SELECT oi.*, p.product_name AS resolved_product_name
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId]
  )

  return {
    order,
    items: items.map((item) => ({
      ...item,
      // n8n a veces guarda solo product_raw_name (producto no resuelto).
      product_name: item.resolved_product_name ?? item.product_raw_name ?? 'Producto'
    }))
  }
}

// El cobro de mostrador. Todo en una transacción con lock de renglón sobre
// cada producto del carrito (en orden de id, para no cruzar candados entre
// dos cobros simultáneos y provocar un deadlock).
export async function createSale(fastify, { items, client_id, payment_method, cash_received, idempotencyKey }) {
  return fastify.withTransaction(async (client) => {
    // Replay idempotente: si esta clave ya generó una venta, se devuelve tal
    // cual — un doble Enter o un reintento de red no puede cobrar dos veces,
    // y sí reimprime el mismo ticket en lugar de quedarse sin él.
    const existing = await client.query(
      'SELECT id FROM orders WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    if (existing.rows.length > 0) {
      const { order, items: existingItems } = await fetchOrderWithItems(client, existing.rows[0].id)
      return {
        order_id: order.id,
        order_hash: order.order_hash,
        total_amount: Number(order.total_amount),
        created_at: order.created_at,
        ticket: buildTicket({ order, items: existingItems, client: { client_name: order.client_name } }),
        replay: true
      }
    }

    const productIds = [...new Set(items.map((i) => i.product_id))].sort((a, b) => a - b)
    const { rows: products } = await client.query(
      `SELECT id, product_name FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [productIds]
    )
    const productById = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      if (!productById.has(id)) throw new ProductNotFoundError(id)
    }

    const mismatches = []
    const resolvedItems = []
    let total = 0

    for (const item of items) {
      const product = productById.get(item.product_id)
      const { rows: unitRows } = await client.query(
        `SELECT unit_label, price, base_qty
         FROM product_units
         WHERE product_id = $1
           AND (
             ($2::text IS NOT NULL AND lower(unit_label) = lower($2))
             OR ($2::text IS NULL AND is_default)
           )
         ORDER BY is_default DESC
         LIMIT 1`,
        [item.product_id, item.unit_label ?? null]
      )
      const unit = unitRows[0]
      if (!unit) throw new ProductNotFoundError(item.product_id)
      if (unit.base_qty === null) throw new MissingBaseQtyError(product.product_name, unit.unit_label)

      const authoritativePrice = Number(unit.price)
      if (Math.abs(authoritativePrice - item.unit_price) > 0.005) {
        mismatches.push({
          product_id: item.product_id,
          product_name: product.product_name,
          unit_label: unit.unit_label,
          expected_price: authoritativePrice,
          sent_price: item.unit_price
        })
        continue
      }

      const subtotal = Math.round(item.quantity * authoritativePrice * 100) / 100
      total += subtotal
      resolvedItems.push({
        product_id: item.product_id,
        product_name: product.product_name,
        quantity: item.quantity,
        unit_label: unit.unit_label,
        unit_price: authoritativePrice,
        subtotal
      })
    }

    if (mismatches.length > 0) throw new PriceMismatchError(mismatches)

    total = Math.round(total * 100) / 100

    let changeGiven = null
    if (payment_method === 'efectivo' && cash_received !== undefined && cash_received !== null) {
      if (cash_received < total) throw new CashTooLowError(total, cash_received)
      changeGiven = Math.round((cash_received - total) * 100) / 100
    }

    const resolvedClientId = client_id ?? await getDefaultClientId(client)
    const orderHash = `ORD-${Date.now()}`

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (order_hash, client_id, total_amount, status, channel, payment_method, cash_received, change_given, idempotency_key)
       VALUES ($1, $2, $3, 'COBRADO', 'mostrador', $4, $5, $6, $7)
       RETURNING *`,
      [orderHash, resolvedClientId, total, payment_method ?? null, cash_received ?? null, changeGiven, idempotencyKey]
    )
    const order = orderRows[0]

    for (const item of resolvedItems) {
      // El trigger trg_venta_descuenta_stock (una vez activado, ver
      // 002_activar_descuento_ventas.sql) descuenta stock_base aquí mismo —
      // este servicio no toca inventario por su cuenta para no descontar doble.
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, is_taxable, subtotal, unit_label)
         VALUES ($1, $2, $3, $4, true, $5, $6)`,
        [order.id, item.product_id, item.quantity, item.unit_price, item.subtotal, item.unit_label]
      )
    }

    let clientName = 'Público en General'
    if (resolvedClientId) {
      const { rows: clientRows } = await client.query('SELECT client_name FROM clients WHERE id = $1', [resolvedClientId])
      clientName = clientRows[0]?.client_name ?? clientName
    }

    return {
      order_id: order.id,
      order_hash: order.order_hash,
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
      ticket: buildTicket({ order, items: resolvedItems, client: { client_name: clientName } }),
      replay: false
    }
  })
}

export async function getSale(fastify, id) {
  const found = await fetchOrderWithItems(fastify.pg, id)
  if (!found) return null
  const { order, items } = found

  return {
    order_id: order.id,
    order_hash: order.order_hash,
    client_id: order.client_id,
    total_amount: Number(order.total_amount),
    status: order.status,
    payment_method: order.payment_method,
    cash_received: order.cash_received !== null ? Number(order.cash_received) : null,
    change_given: order.change_given !== null ? Number(order.change_given) : null,
    created_at: order.created_at,
    cancelled_at: order.cancelled_at,
    cancel_reason: order.cancel_reason,
    ticket: buildTicket({ order, items, client: { client_name: order.client_name } })
  }
}

export async function listSales(fastify, { from, to, payment_method, q, limit = 50, offset = 0 } = {}) {
  const { rows } = await fastify.pg.query(
    `SELECT o.id AS order_id, o.order_hash, o.created_at, c.client_name, o.payment_method,
            o.total_amount, o.cancelled_at,
            (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.channel = 'mostrador'
       AND ($1::date IS NULL OR o.created_at >= $1::date)
       AND ($2::date IS NULL OR o.created_at < ($2::date + interval '1 day'))
       AND ($3::text IS NULL OR o.payment_method = $3)
       AND ($4::text IS NULL OR o.id::text = $4 OR o.order_hash ILIKE '%' || $4 || '%')
     ORDER BY o.created_at DESC
     LIMIT $5 OFFSET $6`,
    [from ?? null, to ?? null, payment_method ?? null, q ?? null, limit, offset]
  )
  return rows.map((row) => ({ ...row, item_count: Number(row.item_count) }))
}

export async function cashCut(fastify, { date } = {}) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)

  const { rows: totalRows } = await fastify.pg.query(
    `SELECT count(*) AS tickets, coalesce(sum(total_amount), 0) AS total
     FROM orders
     WHERE channel = 'mostrador' AND status != 'CANCELADO'
       AND created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
    [targetDate]
  )
  const { rows: byPaymentMethod } = await fastify.pg.query(
    `SELECT payment_method, count(*) AS tickets, coalesce(sum(total_amount), 0) AS total
     FROM orders
     WHERE channel = 'mostrador' AND status != 'CANCELADO'
       AND created_at >= $1::date AND created_at < ($1::date + interval '1 day')
     GROUP BY payment_method
     ORDER BY payment_method`,
    [targetDate]
  )
  const { rows: cancelledRows } = await fastify.pg.query(
    `SELECT count(*) AS cancelados
     FROM orders
     WHERE channel = 'mostrador' AND status = 'CANCELADO'
       AND created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
    [targetDate]
  )

  return {
    date: targetDate,
    tickets: Number(totalRows[0].tickets),
    total: Number(totalRows[0].total),
    por_forma_de_pago: byPaymentMethod.map((row) => ({
      payment_method: row.payment_method,
      tickets: Number(row.tickets),
      total: Number(row.total)
    })),
    cancelados: Number(cancelledRows[0].cancelados)
  }
}

// Cancela una venta: revierte el stock de cada renglón (insertando el
// movimiento compensatorio, nunca borrando la bitácora) y marca la orden
// como CANCELADO. Reusa idx_mov_revertido_una_vez (migración 003): esa misma
// restricción de "solo se revierte una vez" evita que una venta se devuelva
// dos veces al inventario.
export async function cancelSale(fastify, id, { reason } = {}) {
  return fastify.withTransaction(async (client) => {
    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id])
    const order = orderRows[0]
    if (!order) throw new SaleNotFoundError()
    if (order.status === 'CANCELADO') throw new SaleAlreadyCancelledError()

    const { rows: movements } = await client.query(
      `SELECT * FROM inventory_movements
       WHERE order_id = $1 AND type = 'salida'
       ORDER BY product_id`,
      [id]
    )

    const productIds = [...new Set(movements.map((m) => m.product_id))].sort((a, b) => a - b)
    if (productIds.length > 0) {
      await client.query('SELECT 1 FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [productIds])
    }

    for (const movement of movements) {
      const { rows: dupRows } = await client.query(
        'SELECT id FROM inventory_movements WHERE reverted_movement_id = $1',
        [movement.id]
      )
      if (dupRows.length > 0) continue // ya se devolvió antes (cancelación repetida a medias)

      const quantityBase = -Number(movement.quantity_base)
      const { rows: stockRows } = await client.query(
        'UPDATE products SET stock_base = stock_base + $1 WHERE id = $2 RETURNING stock_base',
        [quantityBase, movement.product_id]
      )
      const stockAfter = stockRows[0].stock_base

      await client.query(
        `INSERT INTO inventory_movements
           (product_id, type, quantity, unit_label, base_qty, quantity_base, stock_after, reason, order_id, reverted_movement_id)
         VALUES ($1, 'entrada', $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          movement.product_id, movement.quantity, movement.unit_label, movement.base_qty,
          quantityBase, stockAfter, `Cancelación de la venta #${id}`, id, movement.id
        ]
      )
    }

    await client.query(
      `UPDATE orders SET status = 'CANCELADO', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`,
      [id, reason ?? null]
    )

    const { order: updatedOrder, items } = await fetchOrderWithItems(client, id)
    return {
      order_id: updatedOrder.id,
      status: updatedOrder.status,
      ticket: buildTicket({ order: updatedOrder, items, client: { client_name: updatedOrder.client_name } })
    }
  })
}
