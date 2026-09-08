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
    payment_method: { type: 'string', enum: ['efectivo', 'tarjeta', 'transferencia'] },
    cash_received: { type: 'number', minimum: 0 },
    // Ausente = se cobra el total (de contado, como siempre). 0 = venta
    // pendiente completa. Entre 0 y el total = abono inicial parcial.
    amount_paid: { type: 'number', minimum: 0 }
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

export const ticketItemSchema = {
  $id: 'ticketItem',
  type: 'object',
  properties: {
    product_name: { type: 'string' },
    unit_label: { type: ['string', 'null'] },
    quantity: { type: 'number' },
    unit_price: { type: 'number' },
    subtotal: { type: 'number' }
  }
}

export const ticketPaymentSchema = {
  $id: 'ticketPayment',
  type: 'object',
  properties: {
    amount: { type: 'number' },
    payment_method: { type: ['string', 'null'] },
    created_at: { type: 'string' }
  }
}

export const ticketSchema = {
  $id: 'ticket',
  type: 'object',
  properties: {
    negocio: { type: 'string' },
    direccion: { type: 'string' },
    telefono: { type: 'string' },
    rfc: { type: 'string' },
    pie: { type: 'string' },
    ancho_mm: { type: 'integer' },
    folio: { type: 'integer' },
    order_hash: { type: 'string' },
    fecha: { type: 'string' },
    cliente: { type: 'string' },
    items: { type: 'array', items: { $ref: 'ticketItem#' } },
    total: { type: 'number' },
    payment_method: { type: ['string', 'null'] },
    cash_received: { type: ['number', 'null'] },
    change_given: { type: ['number', 'null'] },
    cancelado: { type: 'boolean' },
    payment_status: { type: 'string' },
    amount_paid: { type: 'number' },
    saldo: { type: 'number' },
    pendiente: { type: 'boolean' },
    pagos: { type: 'array', items: { $ref: 'ticketPayment#' } },
    abono_actual: { type: ['number', 'null'] }
  }
}

export const saleResultSchema = {
  $id: 'saleResult',
  type: 'object',
  properties: {
    order_id: { type: 'integer' },
    order_hash: { type: 'string' },
    total_amount: { type: 'number' },
    payment_status: { type: 'string' },
    amount_paid: { type: 'number' },
    saldo: { type: 'number' },
    created_at: { type: 'string' },
    ticket: { $ref: 'ticket#' }
  }
}

export const saleListItemSchema = {
  $id: 'saleListItem',
  type: 'object',
  properties: {
    order_id: { type: 'integer' },
    order_hash: { type: 'string' },
    created_at: { type: 'string' },
    client_name: { type: ['string', 'null'] },
    payment_method: { type: ['string', 'null'] },
    total_amount: { type: 'number' },
    item_count: { type: 'integer' },
    cancelled_at: { type: ['string', 'null'] },
    payment_status: { type: 'string' },
    amount_paid: { type: 'number' },
    saldo: { type: 'number' }
  }
}

export const saleDetailPaymentSchema = {
  $id: 'saleDetailPayment',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    amount: { type: 'number' },
    payment_method: { type: ['string', 'null'] },
    cash_received: { type: ['number', 'null'] },
    change_given: { type: ['number', 'null'] },
    note: { type: ['string', 'null'] },
    created_at: { type: 'string' }
  }
}

export const saleDetailSchema = {
  $id: 'saleDetail',
  type: 'object',
  properties: {
    order_id: { type: 'integer' },
    order_hash: { type: 'string' },
    client_id: { type: ['integer', 'null'] },
    total_amount: { type: 'number' },
    status: { type: 'string' },
    payment_status: { type: 'string' },
    amount_paid: { type: 'number' },
    saldo: { type: 'number' },
    payment_method: { type: ['string', 'null'] },
    cash_received: { type: ['number', 'null'] },
    change_given: { type: ['number', 'null'] },
    created_at: { type: 'string' },
    cancelled_at: { type: ['string', 'null'] },
    cancel_reason: { type: ['string', 'null'] },
    pagos: { type: 'array', items: { $ref: 'saleDetailPayment#' } },
    ticket: { $ref: 'ticket#' }
  }
}

export const cashCutPaymentMethodSchema = {
  $id: 'cashCutPaymentMethod',
  type: 'object',
  properties: {
    payment_method: { type: ['string', 'null'] },
    tickets: { type: 'integer' },
    total: { type: 'number' }
  }
}

export const cashCutSchema = {
  $id: 'cashCut',
  type: 'object',
  properties: {
    date: { type: 'string' },
    tickets: { type: 'integer' },
    vendido: { type: 'number' },
    cobrado: { type: 'number' },
    total: { type: 'number' },
    devuelto: { type: 'number' },
    pendiente_generado: { type: 'number' },
    abonos_de_otros_dias: { type: 'number' },
    por_cobrar_total: { type: 'number' },
    ventas_con_saldo: { type: 'integer' },
    clientes_con_saldo: { type: 'integer' },
    por_forma_de_pago: { type: 'array', items: { $ref: 'cashCutPaymentMethod#' } },
    cancelados: { type: 'integer' }
  }
}

export const cancelSaleBodySchema = {
  $id: 'cancelSaleBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string', maxLength: 300 }
  }
}
