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

// El cobro de mostrador. Todo en una transacción con lock de renglón sobre
// cada producto del carrito (en orden de id, para no cruzar candados entre
// dos cobros simultáneos y provocar un deadlock).
export async function createSale(fastify, { items, client_id, payment_method, idempotencyKey }) {
  return fastify.withTransaction(async (client) => {
    // Replay idempotente: si esta clave ya generó una venta, se devuelve tal
    // cual — un doble Enter o un reintento de red no puede cobrar dos veces.
    const existing = await client.query(
      'SELECT id, order_hash, total_amount, created_at FROM orders WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    if (existing.rows.length > 0) {
      const o = existing.rows[0]
      return { order_id: o.id, order_hash: o.order_hash, total_amount: Number(o.total_amount), created_at: o.created_at, replay: true }
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
        quantity: item.quantity,
        unit_label: unit.unit_label,
        unit_price: authoritativePrice,
        subtotal
      })
    }

    if (mismatches.length > 0) throw new PriceMismatchError(mismatches)

    total = Math.round(total * 100) / 100
    const orderHash = `ORD-${Date.now()}`

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (order_hash, client_id, total_amount, status, channel, payment_method, idempotency_key)
       VALUES ($1, $2, $3, 'COBRADO', 'mostrador', $4, $5)
       RETURNING id, order_hash, total_amount, created_at`,
      [orderHash, client_id ?? null, total, payment_method ?? null, idempotencyKey]
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

    return {
      order_id: order.id,
      order_hash: order.order_hash,
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
      replay: false
    }
  })
}
