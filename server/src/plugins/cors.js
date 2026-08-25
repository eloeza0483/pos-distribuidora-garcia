import fp from 'fastify-plugin'
import cors from '@fastify/cors'

async function corsPlugin(fastify) {
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  await fastify.register(cors, {
    origin: origins.length === 1 ? origins[0] : origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    // Content-Type queda abierto a propósito: la subida de fotos manda
    // multipart/form-data con boundary, no application/json.
    allowedHeaders: ['Content-Type', 'Idempotency-Key']
  })
}

export default fp(corsPlugin, { name: 'cors' })
