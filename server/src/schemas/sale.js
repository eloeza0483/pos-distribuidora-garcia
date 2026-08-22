export const saleItemInputSchema = {
  $id: 'saleItemInput',
  type: 'object',
  required: ['product_id', 'quantity', 'unit_price'],
  additionalProperties: false,
  properties: {
    product_id: { type: 'integer' },
    unit_label: { type: 'string', minLength: 1, maxLength: 30 },
    quantity: { type: 'number', exclusiveMinimum: 0 },
    // El precio que trae el ticket armado en el navegador. El servidor lo
    // revalida contra product_units y solo lo usa para detectar discrepancia
    // (ver services/sales.js) — nunca se confía en él a ciegas.
    unit_price: { type: 'number', exclusiveMinimum: 0 }
  }
}

export const createSaleBodySchema = {
  $id: 'createSaleBody',
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: { type: 'array', minItems: 1, items: { $ref: 'saleItemInput#' } },
    client_id: { type: 'integer' },
    payment_method: { type: 'string', maxLength: 20 }
  }
}

export const createSaleHeadersSchema = {
  $id: 'createSaleHeaders',
  type: 'object',
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 64 }
  }
}

export const saleResultSchema = {
  $id: 'saleResult',
  type: 'object',
  properties: {
    order_id: { type: 'integer' },
    order_hash: { type: 'string' },
    total_amount: { type: 'number' },
    created_at: { type: 'string' }
  }
}
