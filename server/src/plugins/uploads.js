import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'

// Las fotos de producto viven en disco (server/uploads), no en la base: son
// archivos binarios que no se consultan ni se respaldan con el resto de los
// datos, y servirlos como estáticos es mucho más barato que sacarlos de Postgres.
const UPLOADS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')
const PRODUCTS_DIR = path.join(UPLOADS_ROOT, 'productos')

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Se valida por mimetype Y por extensión resultante: el nombre de archivo lo
// controla el cliente, así que nunca se usa tal cual para armar la ruta.
export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

async function uploadsPlugin(fastify) {
  await fs.mkdir(PRODUCTS_DIR, { recursive: true })

  await fastify.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }
  })

  await fastify.register(fastifyStatic, {
    root: UPLOADS_ROOT,
    prefix: '/uploads/'
  })

  fastify.decorate('uploads', {
    productsDir: PRODUCTS_DIR,

    // Devuelve la ruta relativa que se guarda en products.image_path.
    async saveProductImage(productId, extension, buffer) {
      const filename = `${productId}-${Date.now()}.${extension}`
      await fs.writeFile(path.join(PRODUCTS_DIR, filename), buffer)
      return `productos/${filename}`
    },

    // Borrar la foto vieja es "mejor esfuerzo": si el archivo ya no está, el
    // registro en base sigue siendo correcto y no vale la pena fallar por eso.
    async removeImage(relativePath) {
      if (!relativePath) return
      try {
        await fs.unlink(path.join(UPLOADS_ROOT, relativePath))
      } catch (err) {
        if (err.code !== 'ENOENT') fastify.log.warn({ err, relativePath }, 'No se pudo borrar la imagen')
      }
    }
  })
}

export default fp(uploadsPlugin, { name: 'uploads' })
