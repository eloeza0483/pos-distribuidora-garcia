// El saldo es una subconsulta correlacionada (no un JOIN + GROUP BY): son a
// lo más 50 renglones y así se muestra justo cuando más sirve — al elegir a
// quién fiarle más. `channel = 'mostrador'` no es opcional: sin él, cada
// orden de Telegram (con amount_paid = 0 por default) contaría como deuda.
export async function listClients(fastify, { q } = {}) {
  const { rows } = await fastify.pg.query(
    `SELECT c.id, c.client_name, c.phone,
            coalesce((
              SELECT sum(o.total_amount - o.amount_paid) FROM orders o
              WHERE o.client_id = c.id AND o.channel = 'mostrador'
                AND o.status != 'CANCELADO' AND o.payment_status != 'PAGADA'
            ), 0) AS saldo
     FROM clients c
     WHERE $1::text IS NULL OR c.client_name ILIKE '%' || $1 || '%'
     ORDER BY c.client_name
     LIMIT 50`,
    [q || null]
  )
  return rows.map((row) => ({ ...row, saldo: Number(row.saldo) }))
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

export async function createClient(fastify, { client_name, phone }) {
  const { rows } = await fastify.pg.query(
    `INSERT INTO clients (client_name, phone) VALUES ($1, $2) RETURNING id, client_name, phone`,
    [client_name, phone ?? null]
  )
  return { ...rows[0], saldo: 0 }
}

export async function patchClient(fastify, id, { client_name, phone }) {
  const { rows } = await fastify.pg.query(
    `UPDATE clients SET
       client_name = coalesce($2, client_name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END
     WHERE id = $1
     RETURNING id, client_name, phone`,
    [id, client_name ?? null, phone !== undefined, phone ?? null]
  )
  return rows[0] ?? null
}

// El tablero de deudores: un renglón por cliente con saldo, sin importar
// cuántas ventas pendientes tenga. Mismos dos candados que listClients.
export async function listDebtors(fastify) {
  const { rows } = await fastify.pg.query(
    `SELECT c.id, c.client_name, c.phone,
            sum(o.total_amount - o.amount_paid) AS saldo,
            count(*) AS ventas,
            min(o.created_at) AS deuda_mas_antigua
     FROM orders o
     JOIN clients c ON c.id = o.client_id
     WHERE o.channel = 'mostrador' AND o.status != 'CANCELADO' AND o.payment_status != 'PAGADA'
     GROUP BY c.id, c.client_name, c.phone
     ORDER BY saldo DESC`
  )
  return rows.map((row) => ({ ...row, saldo: Number(row.saldo), ventas: Number(row.ventas) }))
}
