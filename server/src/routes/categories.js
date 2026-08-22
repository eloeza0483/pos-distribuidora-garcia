import { listCategories, createCategory } from '../services/categories.js'

export default async function categoriesRoutes(fastify) {
  fastify.get('/', {
    schema: { response: { 200: { type: 'array', items: { $ref: 'category#' } } } }
  }, async () => listCategories(fastify))

  fastify.post('/', {
    schema: { body: { $ref: 'createCategoryBody#' }, response: { 201: { $ref: 'category#' } } }
  }, async (req, reply) => {
    try {
      const categoria = await createCategory(fastify, req.body.name.trim())
      reply.code(201)
      return categoria
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'duplicate', message: 'Ya existe una categoría con ese nombre.' })
      }
      throw err
    }
  })
}
