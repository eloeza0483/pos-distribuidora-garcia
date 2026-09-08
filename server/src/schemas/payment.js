export const createPaymentBodySchema = {
  $id: 'createPaymentBody',
  type: 'object',
  required: ['amount'],
  additionalProperties: false,
  properties: {
    amount: { type: 'number', exclusiveMinimum: 0 },
    payment_method: { type: 'string', enum: ['efectivo', 'tarjeta', 'transferencia'] },
    cash_received: { type: 'number', minimum: 0 },
    note: { type: 'string', maxLength: 300 }
  }
}

export const createPaymentHeadersSchema = {
  $id: 'createPaymentHeaders',
  type: 'object',
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 64 }
  }
}

export const paymentSchema = {
  $id: 'payment',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    amount: { type: 'number' },
    payment_method: { type: ['string', 'null'] },
    cash_received: { type: ['number', 'null'] },
    change_given: { type: ['number', 'null'] },
    created_at: { type: 'string' }
  }
}

export const paymentResultSchema = {
  $id: 'paymentResult',
  type: 'object',
  properties: {
    order_id: { type: 'integer' },
    payment_status: { type: 'string' },
    amount_paid: { type: 'number' },
    saldo: { type: 'number' },
    payment: { $ref: 'payment#' },
    ticket: { $ref: 'ticket#' }
  }
}
