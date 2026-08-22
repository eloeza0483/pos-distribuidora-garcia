export async function listClients(fastify, { q } = {}) {
  const { rows } = await fastify.pg.query(
    `SELECT id, client_name FROM clients
     WHERE $1::text IS NULL OR client_name ILIKE '%' || $1 || '%'
     ORDER BY client_name
     LIMIT 50`,
    [q || null]
  )
  return rows
}

// El cliente por omisión de mostrador, sembrado por la migración 001. Se
// resuelve por nombre (no por un id fijo) porque nada garantiza que su id sea
// el mismo en cada base. Recibe un "queryable" (fastify.pg o el client de una
// transacción en curso) para poder resolverse dentro del mismo BEGIN/COMMIT
// que crea la venta.
export async function getDefaultClientId(queryable) {
  const { rows } = await queryable.query(
    `SELECT id FROM clients WHERE client_name = 'Público en General' LIMIT 1`
  )
  return rows[0]?.id ?? null
}
