export async function listCategories(fastify) {
  const { rows } = await fastify.pg.query('SELECT id, name FROM categories ORDER BY name')
  return rows
}

export async function createCategory(fastify, name) {
  const { rows } = await fastify.pg.query(
    'INSERT INTO categories (name) VALUES ($1) RETURNING id, name',
    [name]
  )
  return rows[0]
}
