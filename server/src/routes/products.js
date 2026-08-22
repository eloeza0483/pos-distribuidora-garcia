import { listProducts, getProduct, createProduct, patchProduct, createUnit } from '../services/products.js'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } }
}

export default async function productsRoutes(fastify) {
  fastify.get('/', {
    schema: {
      querystring: { type: 'object', properties: { q: { type: 'string' } } },
      response: { 200: { type: 'array', items: { $ref: 'product#' } } }
    }
  }, async (req) => listProducts(fastify, req.query))

  fastify.get('/:id', {
    schema: { params: idParams, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    const product = await getProduct(fastify, req.params.id)
    if (!product) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
    return product
  })

  fastify.post('/', {
    schema: { body: { $ref: 'createProductBody#' }, response: { 201: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const id = await createProduct(fastify, req.body)
      reply.code(201)
      return await getProduct(fastify, id)
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe un producto con ese nombre.' })
      }
      throw err
    }
  })

  fastify.patch('/:id', {
    schema: { params: idParams, body: { $ref: 'patchProductBody#' }, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const product = await patchProduct(fastify, req.params.id, req.body)
      if (!product) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
      return product
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe un producto con ese nombre.' })
      }
      throw err
    }
  })

  fastify.post('/:id/units', {
    schema: { params: idParams, body: { $ref: 'createUnitBody#' }, response: { 201: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const unitId = await createUnit(fastify, req.params.id, req.body)
      if (unitId === null) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
      reply.code(201)
      return await getProduct(fastify, req.params.id)
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe esa unidad o ese código de barras en otro producto.' })
      }
      throw err
    }
  })
}
