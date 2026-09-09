export const clientSchema = {
  $id: 'client',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    client_name: { type: 'string' },
    phone: { type: ['string', 'null'] },
    saldo: { type: 'number' }
  }
}

export const createClientBodySchema = {
  $id: 'createClientBody',
  type: 'object',
  required: ['client_name'],
  additionalProperties: false,
  properties: {
    client_name: { type: 'string', minLength: 1, maxLength: 150 },
    phone: { type: 'string', maxLength: 20 }
  }
}

export const patchClientBodySchema = {
  $id: 'patchClientBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    client_name: { type: 'string', minLength: 1, maxLength: 150 },
    phone: { type: 'string', maxLength: 20 }
  }
}

export const debtorSchema = {
  $id: 'debtor',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    client_name: { type: 'string' },
    phone: { type: ['string', 'null'] },
    saldo: { type: 'number' },
    ventas: { type: 'integer' },
    deuda_mas_antigua: { type: 'string' }
  }
}
