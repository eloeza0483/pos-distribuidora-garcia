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

// El mensaje dice qué hacer, no solo qué falló: cuando la existencia del
// sistema no coincide con la real, la salida correcta es un ajuste por conteo.
export class NegativeStockError extends Error {
  constructor(productName, available, requested) {
    super(
      `Solo hay ${available} piezas de ${productName} y se intentan sacar ${requested}. ` +
      `Si la existencia real no coincide, usa "Ajuste — conteo físico" para poner el número correcto.`
    )
    this.name = 'NegativeStockError'
  }
}

export class MovementNotFoundError extends Error {
  constructor() {
    super('El movimiento no existe.')
    this.name = 'MovementNotFoundError'
  }
}

export class MovementNotRevertibleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MovementNotRevertibleError'
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
    // Se reporta el faltante real (el delta), no quantity*baseQty: en un
    // 'ajuste' esos dos números no son el mismo.
    if (stockAfter < 0) throw new NegativeStockError(product.product_name, currentStock, -quantityBase)

    await client.query('UPDATE products SET stock_base = $1 WHERE id = $2', [stockAfter, product_id])

    const { rows } = await client.query(
      `INSERT INTO inventory_movements
         (product_id, type, quantity, unit_label, base_qty, quantity_base, stock_after, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [product_id, type, quantity, unit.unit_label, baseQty, quantityBase, stockAfter, reason ?? null]
    )

    return { ...rows[0], product_name: product.product_name, is_reverted: false }
  })
}

// Deshace un movimiento mal capturado insertando el movimiento inverso. No
// borra nada: el renglón original se queda en la bitácora y la reversa apunta
// a él con reverted_movement_id (índice único = solo se puede deshacer una vez).
export async function revertMovement(fastify, movementId) {
  return fastify.withTransaction(async (client) => {
    const { rows: movRows } = await client.query(
      'SELECT * FROM inventory_movements WHERE id = $1',
      [movementId]
    )
    const original = movRows[0]
    if (!original) throw new MovementNotFoundError()

    // Una venta descuenta stock desde el trigger sobre order_items: deshacer
    // solo el movimiento dejaría la existencia y el pedido contando distinto.
    if (original.order_id !== null) {
      throw new MovementNotRevertibleError(
        'Este movimiento lo generó una venta. Para corregirlo hay que cancelar la venta, no el movimiento.'
      )
    }
    if (original.reverted_movement_id !== null) {
      throw new MovementNotRevertibleError('Este movimiento ya es la corrección de otro.')
    }

    const { rows: dupRows } = await client.query(
      'SELECT id FROM inventory_movements WHERE reverted_movement_id = $1',
      [movementId]
    )
    if (dupRows.length > 0) {
      throw new MovementNotRevertibleError('Este movimiento ya se deshizo antes.')
    }

    const productRes = await client.query(
      'SELECT id, product_name, stock_base FROM products WHERE id = $1 FOR UPDATE',
      [original.product_id]
    )
    const product = productRes.rows[0]
    if (!product) throw new ProductNotFoundError()

    const currentStock = Number(product.stock_base)
    const quantityBase = -Number(original.quantity_base)
    const stockAfter = currentStock + quantityBase

    if (stockAfter < 0) {
      throw new NegativeStockError(product.product_name, currentStock, -quantityBase)
    }

    await client.query('UPDATE products SET stock_base = $1 WHERE id = $2', [stockAfter, product.id])

    // El tipo se invierte para que la bitácora se lea sola: deshacer una
    // entrada es una salida. Un 'ajuste' se compensa con otro 'ajuste'.
    const type = original.type === 'entrada' ? 'salida' : original.type === 'salida' ? 'entrada' : 'ajuste'

    const { rows } = await client.query(
      `INSERT INTO inventory_movements
         (product_id, type, quantity, unit_label, base_qty, quantity_base, stock_after, reason, reverted_movement_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        product.id, type, original.quantity, original.unit_label, original.base_qty,
        quantityBase, stockAfter, `Corrección del movimiento #${original.id}`, original.id
      ]
    )

    return { ...rows[0], product_name: product.product_name, is_reverted: false }
  })
}

export async function listMovements(fastify, { product_id, limit = 50 } = {}) {
  const { rows } = await fastify.pg.query(
    `SELECT m.*, p.product_name,
            EXISTS (SELECT 1 FROM inventory_movements r WHERE r.reverted_movement_id = m.id) AS is_reverted
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     WHERE $1::int IS NULL OR m.product_id = $1
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $2`,
    [product_id ?? null, limit]
  )
  return rows
}
