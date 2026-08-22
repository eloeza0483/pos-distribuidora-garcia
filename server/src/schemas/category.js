export const categorySchema = {
  $id: 'category',
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' }
  }
}

export const createCategoryBodySchema = {
  $id: 'createCategoryBody',
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 60 }
  }
}
