import { createSale, PriceMismatchError, MissingBaseQtyError, ProductNotFoundError } from '../services/sales.js'

export default async function salesRoutes(fastify) {
  fastify.post('/', {
    schema: {
      headers: { $ref: 'createSaleHeaders#' },
      body: { $ref: 'createSaleBody#' },
      response: { 201: { $ref: 'saleResult#' } }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key']
    try {
      const result = await createSale(fastify, { ...req.body, idempotencyKey })
      reply.code(result.replay ? 200 : 201)
      const { replay, ...body } = result
      return body
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: err.message })
      }
      if (err instanceof MissingBaseQtyError) {
        return reply.code(422).send({ error: 'missing_base_qty', message: err.message })
      }
      if (err instanceof PriceMismatchError) {
        return reply.code(409).send({ error: 'price_mismatch', message: err.message, details: err.details })
      }
      throw err
    }
  })
}
