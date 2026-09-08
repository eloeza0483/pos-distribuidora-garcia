import { buildTicket } from './tickets.js'
import { getDefaultClientId } from './clients.js'
import { insertPayment, listPayments, refundPayments } from './payments.js'
import {
  PriceMismatchError, MissingBaseQtyError, ProductNotFoundError, CashTooLowError,
  SaleNotFoundError, SaleAlreadyCancelledError, PaymentExceedsBalanceError,
  CreditRequiresClientError
} from './errores.js'

// Re-exportadas para que routes/sales.js y las pruebas existentes sigan
// importándolas desde aquí sin cambiar ni una línea — el módulo hoja real
// es errores.js (evita el ciclo de imports con payments.js).
export {
  PriceMismatchError, MissingBaseQtyError, ProductNotFoundError, CashTooLowError,
  SaleNotFoundError, SaleAlreadyCancelledError, PaymentExceedsBalanceError,
  SaleAlreadyPaidError, SaleCancelledError, CreditRequiresClientError
} from './errores.js'

// Trae una venta con sus renglones, sus pagos y el nombre del cliente, para
// armar el ticket o el detalle. Acepta cualquier "queryable" (fastify.pg fuera
// de una transacción, o el client de una transacción en curso) para poder
// reusarse en el camino de replay idempotente de createSale.
async function fetchOrderWithItems(queryable, orderId) {
  const { rows: orderRows } = await queryable.query(
    `SELECT o.*, (o.total_amount - o.amount_paid) AS saldo, c.client_name
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

  const payments = await listPayments(queryable, orderId)

  return {
    order,
    payments,
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
//
// `amount_paid` gobierna si la venta queda de contado o a crédito:
//   - ausente o igual al total: contado, como antes — se abona el total.
//   - 0: pendiente completa, sin renglón de pago.
//   - entre 0 y el total: abono inicial parcial.
//   - mayor al total: 422 (pagar de más es cambio, no sobrepago).
export async function createSale(fastify, { items, client_id, payment_method, cash_received, amount_paid, idempotencyKey }) {
  return fastify.withTransaction(async (client) => {
    // Replay idempotente: si esta clave ya generó una venta, se devuelve tal
    // cual — un doble Enter o un reintento de red no puede cobrar dos veces,
    // y sí reimprime el mismo ticket en lugar de quedarse sin él.
    const existing = await client.query(
      'SELECT id FROM orders WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    if (existing.rows.length > 0) {
      const { order, items: existingItems, payments } = await fetchOrderWithItems(client, existing.rows[0].id)
      return {
        order_id: order.id,
        order_hash: order.order_hash,
        total_amount: Number(order.total_amount),
        payment_status: order.payment_status,
        amount_paid: Number(order.amount_paid),
        saldo: Number(order.saldo),
        created_at: order.created_at,
        ticket: buildTicket({ order, items: existingItems, client: { client_name: order.client_name }, payments }),
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

    // Cuánto se abona al cobrar: el total completo si no se especifica (el
    // camino de contado de siempre), o lo que decida el mostrador si se está
    // dejando la venta pendiente o con un abono parcial.
    const abonoInicial = amount_paid ?? total
    if (abonoInicial > total + 0.005) throw new PaymentExceedsBalanceError(total, abonoInicial)

    // El cambio se calcula contra lo que se está aplicando, no contra el
    // total: con $200 sobre una venta de $500 no falta efectivo, es un abono.
    let changeGiven = null
    if (abonoInicial > 0 && payment_method === 'efectivo' && cash_received !== undefined && cash_received !== null) {
      if (cash_received < abonoInicial) throw new CashTooLowError(abonoInicial, cash_received)
      changeGiven = Math.round((cash_received - abonoInicial) * 100) / 100
    }

    const defaultClientId = await getDefaultClientId(client)
    const resolvedClientId = client_id ?? defaultClientId
    if (abonoInicial < total && (!resolvedClientId || resolvedClientId === defaultClientId)) {
      throw new CreditRequiresClientError()
    }

    const orderHash = `ORD-${Date.now()}`

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (order_hash, client_id, total_amount, status, channel, payment_method, cash_received, change_given, idempotency_key)
       VALUES ($1, $2, $3, 'COBRADO', 'mostrador', $4, $5, $6, $7)
       RETURNING *`,
      [
        orderHash, resolvedClientId, total,
        abonoInicial > 0 ? (payment_method ?? null) : null,
        abonoInicial > 0 ? (cash_received ?? null) : null,
        changeGiven,
        idempotencyKey
      ]
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

    // El cobro inicial también es un renglón de la bitácora de pagos — así el
    // corte de caja (services/sales.js:cashCut) es una sola consulta sobre
    // order_payments, sin dos caminos distintos que mantener sincronizados.
    let payment = null
    if (abonoInicial > 0) {
      payment = await insertPayment(client, {
        order_id: order.id,
        amount: abonoInicial,
        payment_method: payment_method ?? null,
        cash_received: cash_received ?? null,
        change_given: changeGiven,
        // El ":0" nunca choca con la clave (UUID) de un abono posterior.
        idempotency_key: `${idempotencyKey}:0`
      })
    }

    let clientName = 'Público en General'
    if (resolvedClientId) {
      const { rows: clientRows } = await client.query('SELECT client_name FROM clients WHERE id = $1', [resolvedClientId])
      clientName = clientRows[0]?.client_name ?? clientName
    }

    // amount_paid/payment_status los puso el trigger al insertar el pago
    // inicial. Cuando abonoInicial es 0 no hay pago que insertar (el CHECK de
    // order_payments no admite renglones en $0), así que el trigger nunca
    // corrió y la orden se quedó en el default de la columna: 'PAGADA'/0 —
    // correcto para amount_paid, pero equivocado para payment_status en una
    // venta con total > 0. Se corrige aquí, el único caso que el trigger no
    // puede alcanzar por diseño.
    if (payment === null && total > 0) {
      await client.query(`UPDATE orders SET payment_status = 'PENDIENTE' WHERE id = $1`, [order.id])
    }

    const { rows: finalRows } = await client.query(
      `SELECT payment_status, amount_paid, (total_amount - amount_paid) AS saldo FROM orders WHERE id = $1`,
      [order.id]
    )
    const finalState = finalRows[0]

    return {
      order_id: order.id,
      order_hash: order.order_hash,
      total_amount: Number(order.total_amount),
      payment_status: finalState.payment_status,
      amount_paid: Number(finalState.amount_paid),
      saldo: Number(finalState.saldo),
      created_at: order.created_at,
      ticket: buildTicket({
        order: { ...order, ...finalState },
        items: resolvedItems,
        client: { client_name: clientName },
        payments: payment ? [payment] : [],
        abono_actual: null
      }),
      replay: false
    }
  })
}

export async function getSale(fastify, id) {
  const found = await fetchOrderWithItems(fastify.pg, id)
  if (!found) return null
  const { order, items, payments } = found

  return {
    order_id: order.id,
    order_hash: order.order_hash,
    client_id: order.client_id,
    total_amount: Number(order.total_amount),
    status: order.status,
    payment_status: order.payment_status,
    amount_paid: Number(order.amount_paid),
    saldo: Number(order.saldo),
    payment_method: order.payment_method,
    cash_received: order.cash_received !== null ? Number(order.cash_received) : null,
    change_given: order.change_given !== null ? Number(order.change_given) : null,
    created_at: order.created_at,
    cancelled_at: order.cancelled_at,
    cancel_reason: order.cancel_reason,
    pagos: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      payment_method: p.payment_method,
      cash_received: p.cash_received !== null ? Number(p.cash_received) : null,
      change_given: p.change_given !== null ? Number(p.change_given) : null,
      note: p.note,
      created_at: p.created_at
    })),
    ticket: buildTicket({ order, items, client: { client_name: order.client_name }, payments })
  }
}

// `payment_status` acepta también el valor virtual 'CON_SALDO' (PENDIENTE ∪
// PARCIAL, sin canceladas), que deja los chips de filtro de la UI en un solo
// parámetro en vez de mandar dos valores.
export async function listSales(fastify, { from, to, payment_method, payment_status, client_id, q, sort, limit = 50, offset = 0 } = {}) {
  const orderBy = sort === 'antigua' ? 'o.created_at ASC' : 'o.created_at DESC'
  const { rows } = await fastify.pg.query(
    `SELECT o.id AS order_id, o.order_hash, o.created_at, c.client_name, o.payment_method,
            o.total_amount, o.cancelled_at, o.payment_status, o.amount_paid,
            (o.total_amount - o.amount_paid) AS saldo,
            (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.channel = 'mostrador'
       AND ($1::date IS NULL OR o.created_at >= $1::date)
       AND ($2::date IS NULL OR o.created_at < ($2::date + interval '1 day'))
       AND ($3::text IS NULL OR o.payment_method = $3)
       AND ($4::text IS NULL OR o.id::text = $4 OR o.order_hash ILIKE '%' || $4 || '%')
       AND ($5::text IS NULL
            OR ($5 = 'CON_SALDO' AND o.payment_status <> 'PAGADA' AND o.status <> 'CANCELADO')
            OR o.payment_status = $5)
       AND ($6::int IS NULL OR o.client_id = $6)
     ORDER BY ${orderBy}
     LIMIT $7 OFFSET $8`,
    [from ?? null, to ?? null, payment_method ?? null, q ?? null, payment_status ?? null, client_id ?? null, limit, offset]
  )
  return rows.map((row) => ({
    ...row,
    item_count: Number(row.item_count),
    amount_paid: Number(row.amount_paid),
    saldo: Number(row.saldo)
  }))
}

export async function cashCut(fastify, { date } = {}) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10)

  // 1) Dinero que entró (y salió, por devoluciones) al cajón hoy, por forma
  //    de pago. Este ES el corte: incluye tanto el cobro inicial de una venta
  //    de contado como cualquier abono a una venta de días anteriores.
  const { rows: byPaymentMethod } = await fastify.pg.query(
    `SELECT p.payment_method,
            count(*) FILTER (WHERE p.amount > 0) AS tickets,
            coalesce(sum(p.amount), 0) AS total
     FROM order_payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.channel = 'mostrador'
       AND p.created_at >= $1::date AND p.created_at < ($1::date + interval '1 day')
     GROUP BY p.payment_method
     ORDER BY p.payment_method`,
    [targetDate]
  )

  // 2) Vendido hoy (facturado) y cuánto de eso se quedó a crédito.
  const { rows: vendidoRows } = await fastify.pg.query(
    `SELECT count(*) AS tickets,
            coalesce(sum(total_amount), 0) AS vendido,
            coalesce(sum(total_amount - amount_paid), 0) AS pendiente_generado
     FROM orders
     WHERE channel = 'mostrador' AND status != 'CANCELADO'
       AND created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
    [targetDate]
  )

  // 3) Abonos cobrados hoy de ventas de días anteriores (para desglosar el
  //    "cobrado" de hoy entre lo vendido hoy y la cartera vieja).
  const { rows: abonosOtrosDiasRows } = await fastify.pg.query(
    `SELECT coalesce(sum(p.amount), 0) AS total
     FROM order_payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.channel = 'mostrador' AND p.amount > 0
       AND p.created_at >= $1::date AND p.created_at < ($1::date + interval '1 day')
       AND o.created_at < $1::date`,
    [targetDate]
  )

  // 4) Cartera total a la fecha (no solo la de hoy).
  const { rows: carteraRows } = await fastify.pg.query(
    `SELECT coalesce(sum(total_amount - amount_paid), 0) AS por_cobrar,
            count(*) AS ventas, count(DISTINCT client_id) AS clientes
     FROM orders
     WHERE channel = 'mostrador' AND status != 'CANCELADO' AND payment_status != 'PAGADA'`
  )

  const { rows: cancelledRows } = await fastify.pg.query(
    `SELECT count(*) AS cancelados
     FROM orders
     WHERE channel = 'mostrador' AND status = 'CANCELADO'
       AND created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
    [targetDate]
  )

  const vendido = vendidoRows[0]
  const cartera = carteraRows[0]
  const cobrado = Math.round(byPaymentMethod.reduce((sum, row) => sum + Number(row.total), 0) * 100) / 100
  const devuelto = Math.round(
    byPaymentMethod.reduce((sum, row) => sum + Math.max(0, -Number(row.total)), 0) * 100
  ) / 100

  return {
    date: targetDate,
    tickets: Number(vendido.tickets),
    vendido: Number(vendido.vendido),
    cobrado,
    total: cobrado, // alias de "cobrado" — compatibilidad con el corte anterior
    devuelto,
    pendiente_generado: Number(vendido.pendiente_generado),
    abonos_de_otros_dias: Number(abonosOtrosDiasRows[0].total),
    por_cobrar_total: Number(cartera.por_cobrar),
    ventas_con_saldo: Number(cartera.ventas),
    clientes_con_saldo: Number(cartera.clientes),
    por_forma_de_pago: byPaymentMethod.map((row) => ({
      payment_method: row.payment_method,
      tickets: Number(row.tickets),
      total: Number(row.total)
    })),
    cancelados: Number(cancelledRows[0].cancelados)
  }
}

// Cancela una venta: revierte el stock de cada renglón (insertando el
// movimiento compensatorio, nunca borrando la bitácora), devuelve cualquier
// abono ya recibido (mismo mecanismo) y marca la orden como CANCELADO. Reusa
// idx_mov_revertido_una_vez (migración 003) y idx_pago_revertido_una_vez
// (migración 007): esas restricciones de "solo se revierte una vez" evitan
// que una venta se devuelva dos veces al inventario o a la caja.
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

    const devuelto = await refundPayments(client, id)

    await client.query(
      `UPDATE orders SET status = 'CANCELADO', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`,
      [id, reason ?? null]
    )

    const { order: updatedOrder, items, payments } = await fetchOrderWithItems(client, id)
    return {
      order_id: updatedOrder.id,
      status: updatedOrder.status,
      devuelto,
      ticket: buildTicket({ order: updatedOrder, items, client: { client_name: updatedOrder.client_name }, payments })
    }
  })
}
