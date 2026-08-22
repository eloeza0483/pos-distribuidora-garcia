import { listClients } from '../services/clients.js'

export default async function clientsRoutes(fastify) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' } }
      },
      response: { 200: { type: 'array', items: { $ref: 'client#' } } }
    }
  }, async (req) => listClients(fastify, req.query))
}
