import fp from 'fastify-plugin'
import cors from '@fastify/cors'

async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    // Content-Type queda abierto a propósito: la subida de fotos manda
    // multipart/form-data con boundary, no application/json.
    allowedHeaders: ['Content-Type', 'Idempotency-Key']
  })
}

export default fp(corsPlugin, { name: 'cors' })
