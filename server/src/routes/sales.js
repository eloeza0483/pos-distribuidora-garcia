import {
  createSale, getSale, listSales, cashCut, cancelSale,
  PriceMismatchError, MissingBaseQtyError, ProductNotFoundError, CashTooLowError,
  SaleNotFoundError, SaleAlreadyCancelledError, PaymentExceedsBalanceError,
  SaleAlreadyPaidError, SaleCancelledError, CreditRequiresClientError
} from '../services/sales.js'
import { registerPayment, listPayments } from '../services/payments.js'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } }
}

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
      if (err instanceof CashTooLowError) {
        return reply.code(422).send({ error: 'cash_too_low', message: err.message })
      }
      if (err instanceof PaymentExceedsBalanceError) {
        return reply.code(422).send({ error: 'amount_exceeds_balance', message: err.message, details: err.details })
      }
      if (err instanceof CreditRequiresClientError) {
        return reply.code(422).send({ error: 'credit_requires_client', message: err.message })
      }
      if (err instanceof PriceMismatchError) {
        return reply.code(409).send({ error: 'price_mismatch', message: err.message, details: err.details })
      }
      throw err
    }
  })

  // OJO: '/corte' va declarada ANTES que '/:id', o Fastify la tomaría como
  // un id y reventaría la validación del parámetro entero.
  fastify.get('/corte', {
    schema: {
      querystring: {
        type: 'object',
        properties: { date: { type: 'string', format: 'date' } }
      },
      response: { 200: { $ref: 'cashCut#' } }
    }
  }, async (req) => cashCut(fastify, req.query))

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          payment_method: { type: 'string' },
          // 'CON_SALDO' es el valor virtual PENDIENTE ∪ PARCIAL (sin canceladas).
          payment_status: { type: 'string', enum: ['PAGADA', 'PARCIAL', 'PENDIENTE', 'CON_SALDO'] },
          client_id: { type: 'integer' },
          q: { type: 'string' },
          sort: { type: 'string', enum: ['reciente', 'antigua'] },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      },
      response: { 200: { type: 'array', items: { $ref: 'saleListItem#' } } }
    }
  }, async (req) => listSales(fastify, req.query))

  fastify.get('/:id', {
    schema: { params: idParams, response: { 200: { $ref: 'saleDetail#' } } }
  }, async (req, reply) => {
    const sale = await getSale(fastify, req.params.id)
    if (!sale) return reply.code(404).send({ error: 'not_found', message: 'La venta no existe.' })
    return sale
  })

  fastify.post('/:id/cancel', {
    schema: {
      params: idParams,
      body: { $ref: 'cancelSaleBody#' },
      response: {
        200: {
          type: 'object',
          properties: {
            order_id: { type: 'integer' },
            status: { type: 'string' },
            devuelto: { type: 'number' },
            ticket: { $ref: 'ticket#' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      return await cancelSale(fastify, req.params.id, req.body ?? {})
    } catch (err) {
      if (err instanceof SaleNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: err.message })
      }
      if (err instanceof SaleAlreadyCancelledError) {
        return reply.code(409).send({ error: 'already_cancelled', message: err.message })
      }
      throw err
    }
  })

  fastify.post('/:id/payments', {
    schema: {
      params: idParams,
      headers: { $ref: 'createPaymentHeaders#' },
      body: { $ref: 'createPaymentBody#' },
      response: { 201: { $ref: 'paymentResult#' } }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key']
    try {
      const result = await registerPayment(fastify, req.params.id, { ...req.body, idempotencyKey })
      reply.code(result.replay ? 200 : 201)
      const { replay, ...body } = result
      return body
    } catch (err) {
      if (err instanceof SaleNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: err.message })
      }
      if (err instanceof SaleCancelledError) {
        return reply.code(409).send({ error: 'sale_cancelled', message: err.message })
      }
      if (err instanceof SaleAlreadyPaidError) {
        return reply.code(409).send({ error: 'already_paid', message: err.message })
      }
      if (err instanceof PaymentExceedsBalanceError) {
        return reply.code(422).send({ error: 'amount_exceeds_balance', message: err.message, details: err.details })
      }
      if (err instanceof CashTooLowError) {
        return reply.code(422).send({ error: 'cash_too_low', message: err.message })
      }
      throw err
    }
  })

  fastify.get('/:id/payments', {
    schema: {
      params: idParams,
      response: { 200: { type: 'array', items: { $ref: 'payment#' } } }
    }
  }, async (req, reply) => {
    const sale = await getSale(fastify, req.params.id)
    if (!sale) return reply.code(404).send({ error: 'not_found', message: 'La venta no existe.' })
    return listPayments(fastify.pg, req.params.id)
  })
}
