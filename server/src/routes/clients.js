import { listClients, createClient, patchClient, listDebtors } from '../services/clients.js'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } }
}

export default async function clientsRoutes(fastify) {
  // OJO: '/deudores' va declarada ANTES que '/:id', o Fastify la tomaría como
  // un id y reventaría la validación del parámetro entero (mismo motivo que
  // '/corte' en routes/sales.js).
  fastify.get('/deudores', {
    schema: { response: { 200: { type: 'array', items: { $ref: 'debtor#' } } } }
  }, async () => listDebtors(fastify))

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' } }
      },
      response: { 200: { type: 'array', items: { $ref: 'client#' } } }
    }
  }, async (req) => listClients(fastify, req.query))

  fastify.post('/', {
    schema: {
      body: { $ref: 'createClientBody#' },
      response: { 201: { $ref: 'client#' } }
    }
  }, async (req, reply) => {
    try {
      const client = await createClient(fastify, { ...req.body, client_name: req.body.client_name.trim() })
      reply.code(201)
      return client
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: `Ya existe un cliente llamado "${req.body.client_name.trim()}".` })
      }
      throw err
    }
  })

  fastify.patch('/:id', {
    schema: {
      params: idParams,
      body: { $ref: 'patchClientBody#' },
      response: { 200: { $ref: 'client#' } }
    }
  }, async (req, reply) => {
    try {
      const body = { ...req.body }
      if (body.client_name !== undefined) body.client_name = body.client_name.trim()
      const client = await patchClient(fastify, req.params.id, body)
      if (!client) return reply.code(404).send({ error: 'not_found', message: 'El cliente no existe.' })
      return client
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe un cliente con ese nombre.' })
      }
      throw err
    }
  })
}
