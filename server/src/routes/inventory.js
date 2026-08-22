import {
  createMovement, listMovements,
  MissingBaseQtyError, UnitNotFoundError, ProductNotFoundError, NegativeStockError
} from '../services/inventory.js'

export default async function inventoryRoutes(fastify) {
  fastify.post('/movements', {
    schema: {
      body: { $ref: 'createMovementBody#' },
      response: { 201: { $ref: 'movement#' } }
    }
  }, async (req, reply) => {
    try {
      const movement = await createMovement(fastify, req.body)
      reply.code(201)
      return movement
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: err.message })
      }
      if (err instanceof UnitNotFoundError) {
        return reply.code(404).send({ error: 'unit_not_found', message: err.message })
      }
      if (err instanceof MissingBaseQtyError) {
        return reply.code(422).send({ error: 'missing_base_qty', message: err.message })
      }
      if (err instanceof NegativeStockError) {
        return reply.code(409).send({ error: 'insufficient_stock', message: err.message })
      }
      throw err
    }
  })

  fastify.get('/movements', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          product_id: { type: 'integer' },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
        }
      },
      response: { 200: { type: 'array', items: { $ref: 'movement#' } } }
    }
  }, async (req) => listMovements(fastify, req.query))
}
