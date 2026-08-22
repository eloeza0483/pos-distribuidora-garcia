import {
  listProducts, listPopularProducts, getProduct, createProduct,
  patchProduct, createUnit, setProductImage
} from '../services/products.js'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../plugins/uploads.js'

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } }
}

export default async function productsRoutes(fastify) {
  // OJO: '/populares' va declarada ANTES que '/:id', o Fastify la tomaría como
  // un id y reventaría la validación del parámetro entero.
  fastify.get('/populares', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
          days: { type: 'integer', minimum: 1, maximum: 365, default: 30 }
        }
      },
      response: { 200: { type: 'array', items: { $ref: 'product#' } } }
    }
  }, async (req) => listPopularProducts(fastify, req.query))

  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: { q: { type: 'string' }, category_id: { type: 'integer' } }
      },
      response: { 200: { type: 'array', items: { $ref: 'product#' } } }
    }
  }, async (req) => listProducts(fastify, req.query))

  fastify.get('/:id', {
    schema: { params: idParams, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    const product = await getProduct(fastify, req.params.id)
    if (!product) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
    return product
  })

  fastify.post('/', {
    schema: { body: { $ref: 'createProductBody#' }, response: { 201: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const id = await createProduct(fastify, req.body)
      reply.code(201)
      return await getProduct(fastify, id)
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe un producto con ese nombre.' })
      }
      throw err
    }
  })

  fastify.patch('/:id', {
    schema: { params: idParams, body: { $ref: 'patchProductBody#' }, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const product = await patchProduct(fastify, req.params.id, req.body)
      if (!product) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
      return product
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe un producto con ese nombre.' })
      }
      throw err
    }
  })

  fastify.post('/:id/image', {
    schema: { params: idParams, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    const productId = req.params.id

    let file
    try {
      file = await req.file()
    } catch {
      return reply.code(400).send({ error: 'bad_upload', message: 'No se pudo leer el archivo enviado.' })
    }
    if (!file) {
      return reply.code(400).send({ error: 'bad_upload', message: 'No se envió ninguna foto.' })
    }

    const extension = ALLOWED_IMAGE_TYPES[file.mimetype]
    if (!extension) {
      return reply.code(415).send({
        error: 'unsupported_type',
        message: 'La foto debe ser JPG, PNG o WEBP.'
      })
    }

    // toBuffer() lanza cuando el archivo pasa el límite de @fastify/multipart.
    let buffer
    try {
      buffer = await file.toBuffer()
    } catch {
      return reply.code(413).send({
        error: 'file_too_large',
        message: `La foto pesa más de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Usa una más ligera.`
      })
    }
    if (file.file.truncated) {
      return reply.code(413).send({
        error: 'file_too_large',
        message: `La foto pesa más de ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Usa una más ligera.`
      })
    }

    const imagePath = await fastify.uploads.saveProductImage(productId, extension, buffer)
    const result = await setProductImage(fastify, productId, imagePath)

    if (result === null) {
      // El producto no existía: no dejar el archivo tirado en disco.
      await fastify.uploads.removeImage(imagePath)
      return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
    }

    await fastify.uploads.removeImage(result.previous_path)
    return await getProduct(fastify, productId)
  })

  fastify.delete('/:id/image', {
    schema: { params: idParams, response: { 200: { $ref: 'product#' } } }
  }, async (req, reply) => {
    const result = await setProductImage(fastify, req.params.id, null)
    if (result === null) {
      return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
    }
    await fastify.uploads.removeImage(result.previous_path)
    return await getProduct(fastify, req.params.id)
  })

  fastify.post('/:id/units', {
    schema: { params: idParams, body: { $ref: 'createUnitBody#' }, response: { 201: { $ref: 'product#' } } }
  }, async (req, reply) => {
    try {
      const unitId = await createUnit(fastify, req.params.id, req.body)
      if (unitId === null) return reply.code(404).send({ error: 'not_found', message: 'Producto no encontrado.' })
      reply.code(201)
      return await getProduct(fastify, req.params.id)
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe esa unidad o ese código de barras en otro producto.' })
      }
      throw err
    }
  })
}
