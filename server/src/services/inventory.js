// Errores tipados para que la ruta los traduzca a códigos HTTP sin adivinar
// por el texto del mensaje.
export class MissingBaseQtyError extends Error {
  constructor(productName, unitLabel) {
    super(`Falta definir cuántas piezas trae "${unitLabel}" de ${productName}.`)
    this.name = 'MissingBaseQtyError'
  }
}

export class UnitNotFoundError extends Error {
  constructor(unitLabel) {
    super(`No existe la unidad "${unitLabel}" para este producto.`)
    this.name = 'UnitNotFoundError'
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super('Producto no encontrado.')
    this.name = 'ProductNotFoundError'
  }
}

export class NegativeStockError extends Error {
  constructor(available, requested) {
    super(`Stock insuficiente: hay ${available} piezas, se pidieron ${requested}.`)
    this.name = 'NegativeStockError'
  }
}

// Resuelve la unidad de un movimiento: la que se nombró, o si no se nombró
// ninguna, la unidad por omisión del producto.
async function resolveUnit(client, productId, unitLabel) {
  const { rows } = await client.query(
    `SELECT unit_label, base_qty
     FROM product_units
     WHERE product_id = $1
       AND (
         ($2::text IS NOT NULL AND lower(unit_label) = lower($2))
         OR ($2::text IS NULL AND is_default)
       )
     ORDER BY is_default DESC
     LIMIT 1`,
    [productId, unitLabel ?? null]
  )
  return rows[0] ?? null
}

// El endpoint central del inventario manual (entrada/salida/ajuste). Las
// ventas NO pasan por aquí — las descuenta el trigger trg_venta_descuenta_stock
// sobre order_items, para que mostrador y Telegram descuenten igual.
export async function createMovement(fastify, { product_id, type, quantity, unit_label, reason }) {
  return fastify.withTransaction(async (client) => {
    const productRes = await client.query(
      'SELECT id, product_name, stock_base FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    )
    const product = productRes.rows[0]
    if (!product) throw new ProductNotFoundError()

    const unit = await resolveUnit(client, product_id, unit_label ?? null)
    if (!unit) throw new UnitNotFoundError(unit_label ?? 'pieza')
    if (unit.base_qty === null) throw new MissingBaseQtyError(product.product_name, unit.unit_label)

    const currentStock = Number(product.stock_base)
    const baseQty = Number(unit.base_qty)
    let quantityBase

    if (type === 'entrada') {
      quantityBase = quantity * baseQty
    } else if (type === 'salida') {
      quantityBase = -(quantity * baseQty)
    } else {
      // 'ajuste': quantity es el nuevo saldo absoluto, en la unidad indicada.
      const targetStock = quantity * baseQty
      quantityBase = targetStock - currentStock
    }

    const stockAfter = currentStock + quantityBase
    if (stockAfter < 0) throw new NegativeStockError(currentStock, quantity * baseQty)

    await client.query('UPDATE products SET stock_base = $1 WHERE id = $2', [stockAfter, product_id])

    const { rows } = await client.query(
      `INSERT INTO inventory_movements
         (product_id, type, quantity, unit_label, base_qty, quantity_base, stock_after, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [product_id, type, quantity, unit.unit_label, baseQty, quantityBase, stockAfter, reason ?? null]
    )

    return { ...rows[0], product_name: product.product_name }
  })
}

export async function listMovements(fastify, { product_id, limit = 50 } = {}) {
  const { rows } = await fastify.pg.query(
    `SELECT m.*, p.product_name
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     WHERE $1::int IS NULL OR m.product_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [product_id ?? null, limit]
  )
  return rows
}
