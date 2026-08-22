import fp from 'fastify-plugin'
import cors from '@fastify/cors'

async function corsPlugin(fastify) {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  })
}

export default fp(corsPlugin, { name: 'cors' })
