import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

// El build de web/ se copia aquí solo en la imagen Docker de producción
// (ver server/Dockerfile). En dev no existe, así que el plugin no hace nada.
const WEB_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web-dist')

async function spaPlugin(fastify) {
  if (!fs.existsSync(WEB_DIST)) return

  await fastify.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    decorateReply: false
  })

  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    reply.sendFile('index.html', WEB_DIST)
  })
}

export default fp(spaPlugin, { name: 'spa' })
