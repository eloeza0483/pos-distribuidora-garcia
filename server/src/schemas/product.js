// JSON Schema compartido por $id/$ref — Fastify los usa tanto para validar
// request.body/params/querystring como para serializar la respuesta (lo que
// evita filtrar columnas internas por accidente, p.ej. created_at sin querer).

export const unitSchema = {
  $id: 'unit',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    product_id: { type: 'integer' },
    unit_label: { type: 'string' },
    price: { type: 'number' },
    base_qty: { type: ['number', 'null'] },
    barcode: { type: ['string', 'null'] },
    sat_unit_code: { type: ['string', 'null'] },
    is_default: { type: 'boolean' }
  }
}

export const productSchema = {
  $id: 'product',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    product_name: { type: 'string' },
    aliases: { type: ['string', 'null'] },
    list_price: { type: 'number' },
    sat_product_code: { type: 'string' },
    sat_unit_code: { type: 'string' },
    is_taxable: { type: 'boolean' },
    has_variable_weight: { type: 'boolean' },
    stock_base: { type: 'number' },
    min_stock_base: { type: ['number', 'null'] },
    low_stock: { type: 'boolean' },
    units: { type: 'array', items: { $ref: 'unit#' } }
  }
}

export const createProductBodySchema = {
  $id: 'createProductBody',
  type: 'object',
  required: ['product_name', 'price'],
  additionalProperties: false,
  properties: {
    product_name: { type: 'string', minLength: 1, maxLength: 200 },
    aliases: { type: 'string', maxLength: 500 },
    sat_product_code: { type: 'string', maxLength: 10 },
    sat_unit_code: { type: 'string', maxLength: 10 },
    is_taxable: { type: 'boolean', default: true },
    has_variable_weight: { type: 'boolean', default: false },
    min_stock_base: { type: 'number', minimum: 0 },
    // La unidad por omisión se crea junto con el producto, en la misma
    // transacción (regla de n8n: todo producto nace con una unidad default).
    unit_label: { type: 'string', minLength: 1, maxLength: 30, default: 'pieza' },
    price: { type: 'number', exclusiveMinimum: 0 },
    base_qty: { type: 'number', exclusiveMinimum: 0, default: 1 },
    barcode: { type: 'string', maxLength: 64 }
  }
}

export const patchProductBodySchema = {
  $id: 'patchProductBody',
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    product_name: { type: 'string', minLength: 1, maxLength: 200 },
    aliases: { type: 'string', maxLength: 500 },
    sat_product_code: { type: 'string', maxLength: 10 },
    sat_unit_code: { type: 'string', maxLength: 10 },
    is_taxable: { type: 'boolean' },
    has_variable_weight: { type: 'boolean' },
    min_stock_base: { type: ['number', 'null'], minimum: 0 }
  }
}

export const createUnitBodySchema = {
  $id: 'createUnitBody',
  type: 'object',
  required: ['unit_label', 'price'],
  additionalProperties: false,
  properties: {
    unit_label: { type: 'string', minLength: 1, maxLength: 30 },
    price: { type: 'number', exclusiveMinimum: 0 },
    // Opcional a propósito: si no se sabe todavía cuántas piezas trae (p.ej.
    // un bulto recién dado de alta), queda NULL y se captura después desde
    // la vista "Captura de factores" — no se puede inventar un valor aquí.
    base_qty: { type: 'number', exclusiveMinimum: 0 },
    barcode: { type: 'string', maxLength: 64 },
    sat_unit_code: { type: 'string', maxLength: 10 },
    is_default: { type: 'boolean', default: false }
  }
}

export const patchUnitBodySchema = {
  $id: 'patchUnitBody',
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    price: { type: 'number', exclusiveMinimum: 0 },
    base_qty: { type: 'number', exclusiveMinimum: 0 },
    barcode: { type: ['string', 'null'], maxLength: 64 },
    sat_unit_code: { type: 'string', maxLength: 10 }
  }
}
