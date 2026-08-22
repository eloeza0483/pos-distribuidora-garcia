export const movementSchema = {
  $id: 'movement',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    product_id: { type: 'integer' },
    product_name: { type: 'string' },
    type: { type: 'string', enum: ['entrada', 'salida', 'ajuste'] },
    quantity: { type: 'number' },
    unit_label: { type: ['string', 'null'] },
    base_qty: { type: 'number' },
    quantity_base: { type: 'number' },
    stock_after: { type: 'number' },
    reason: { type: ['string', 'null'] },
    order_id: { type: ['integer', 'null'] },
    // Apunta al movimiento que este renglón corrige (si es una reversa).
    reverted_movement_id: { type: ['integer', 'null'] },
    // true si ALGÚN otro movimiento ya deshizo a este.
    is_reverted: { type: 'boolean' },
    created_at: { type: 'string' }
  }
}

export const createMovementBodySchema = {
  $id: 'createMovementBody',
  type: 'object',
  required: ['product_id', 'type', 'quantity'],
  additionalProperties: false,
  properties: {
    product_id: { type: 'integer' },
    type: { type: 'string', enum: ['entrada', 'salida', 'ajuste'] },
    // En 'entrada'/'salida' es la cantidad a mover; en 'ajuste' es el nuevo
    // saldo absoluto en la unidad indicada (ver services/inventory.js).
    quantity: { type: 'number', exclusiveMinimum: 0 },
    // Unidad en que se capturó (pieza/bulto/caja); si se omite, usa la unidad
    // por omisión del producto.
    unit_label: { type: 'string', minLength: 1, maxLength: 30 },
    reason: { type: 'string', maxLength: 255 }
  }
}
