import fp from 'fastify-plugin'
import fastifyPostgres from '@fastify/postgres'
import pg from 'pg'

// El driver 'pg' devuelve las columnas numeric/decimal como STRING por
// omisión (para no perder precisión con valores fuera del rango de un
// float de JS) — pero acá los precios y cantidades caben de sobra en un
// float, y los JSON Schema de las rutas los declaran 'number'. Sin este
// parser, cualquier respuesta con un numeric revienta la validación de
// serialización con un 500 que no dice nada útil.
// OID 1700 = numeric. Ver https://github.com/brianc/node-pg-types
pg.types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)))

// Encapsula @fastify/postgres y agrega un helper de transacción: el patrón
// BEGIN/COMMIT/ROLLBACK con lock de renglón (FOR UPDATE) se repite en varios
// servicios (cobro, movimientos de inventario), así que vive en un solo lugar.
async function dbPlugin(fastify) {
  await fastify.register(fastifyPostgres, {
    connectionString: process.env.DATABASE_URL
  })

  fastify.decorate('withTransaction', async (fn) => {
    const client = await fastify.pg.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })
}

export default fp(dbPlugin, { name: 'db' })
