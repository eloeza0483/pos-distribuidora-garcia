import { patchUnit } from '../services/products.js'

export default async function unitsRoutes(fastify) {
  fastify.patch('/:id', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
      body: { $ref: 'patchUnitBody#' },
      response: { 200: { $ref: 'product#' } }
    }
  }, async (req, reply) => {
    try {
      const product = await patchUnit(fastify, req.params.id, req.body)
      if (!product) return reply.code(404).send({ error: 'not_found', message: 'Unidad no encontrada.' })
      return product
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ese código de barras ya está en uso.' })
      }
      throw err
    }
  })
}
