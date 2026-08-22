// SQL puro — sin saber nada de HTTP. Las rutas traducen estos resultados
// (y los errores de Postgres) a códigos de estado.

const UNIT_JSON = `json_build_object(
  'id', u.id, 'product_id', u.product_id, 'unit_label', u.unit_label,
  'price', u.price, 'base_qty', u.base_qty, 'barcode', u.barcode,
  'sat_unit_code', u.sat_unit_code, 'is_default', u.is_default
)`

const PRODUCT_WITH_UNITS_SELECT = `
  SELECT p.id, p.product_name, p.aliases, p.list_price, p.sat_product_code, p.sat_unit_code,
         p.is_taxable, p.has_variable_weight, p.stock_base, p.min_stock_base, p.image_path,
         p.category_id, c.name AS category_name,
         (p.min_stock_base IS NOT NULL AND p.stock_base <= p.min_stock_base) AS low_stock,
         COALESCE(
           json_agg(${UNIT_JSON} ORDER BY u.is_default DESC, u.unit_label)
           FILTER (WHERE u.id IS NOT NULL),
           '[]'
         ) AS units
  FROM products p
  LEFT JOIN product_units u ON u.product_id = p.id
  LEFT JOIN categories c ON c.id = p.category_id
`
const PRODUCT_GROUP_BY = 'GROUP BY p.id, c.name'

export async function listProducts(fastify, { q, category_id } = {}) {
  const term = q?.trim() || null
  // Si lo que se escribió es un número, además de nombre/alias/código se busca
  // por precio — en el mostrador es común acordarse del precio, no del nombre.
  const priceTerm = term !== null && term !== '' && !Number.isNaN(Number(term)) ? Number(term) : null

  const { rows } = await fastify.pg.query(
    `${PRODUCT_WITH_UNITS_SELECT}
     WHERE ($1::text IS NULL
        OR immutable_unaccent(lower(p.product_name)) ILIKE '%' || immutable_unaccent(lower($1)) || '%'
        OR immutable_unaccent(lower(coalesce(p.aliases,''))) ILIKE '%' || immutable_unaccent(lower($1)) || '%'
        OR EXISTS (SELECT 1 FROM product_units u2 WHERE u2.product_id = p.id AND u2.barcode = $1)
        OR ($2::numeric IS NOT NULL AND EXISTS (
              SELECT 1 FROM product_units u3 WHERE u3.product_id = p.id AND u3.price = $2
            )))
       AND ($3::int IS NULL OR p.category_id = $3)
     ${PRODUCT_GROUP_BY}
     ORDER BY p.product_name`,
    [term, priceTerm, category_id ?? null]
  )
  return rows
}

// Los más vendidos, para el panel de acceso rápido del mostrador. Cuenta TODAS
// las ventas (mostrador + los pedidos que mete n8n por Telegram) porque es la
// única fuente con historial suficiente. Los renglones que n8n no logró
// resolver quedan con product_id NULL y se ignoran.
export async function listPopularProducts(fastify, { limit = 12, days = 30 } = {}) {
  const { rows } = await fastify.pg.query(
    `${PRODUCT_WITH_UNITS_SELECT}
     JOIN (
       SELECT oi.product_id, COUNT(*) AS veces, SUM(oi.quantity) AS piezas
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id IS NOT NULL
         AND o.created_at > now() - ($2::int * INTERVAL '1 day')
       GROUP BY oi.product_id
     ) v ON v.product_id = p.id
     GROUP BY p.id, c.name, v.veces, v.piezas
     ORDER BY v.veces DESC, v.piezas DESC, p.product_name
     LIMIT $1`,
    [limit, days]
  )
  return rows
}

export async function getProduct(fastify, id) {
  const { rows } = await fastify.pg.query(
    `${PRODUCT_WITH_UNITS_SELECT} WHERE p.id = $1 ${PRODUCT_GROUP_BY}`,
    [id]
  )
  return rows[0] ?? null
}

// La ruta del mostrador: producto + unidad + precio exactos a partir de un
// código de barras escaneado. Se mantiene deliberadamente simple (sin la
// búsqueda difusa que usa n8n) porque un escaneo no es ambiguo.
export async function findByBarcode(fastify, barcode) {
  const { rows } = await fastify.pg.query(
    `SELECT p.id AS product_id, p.product_name, p.stock_base, p.image_path,
            u.id AS unit_id, u.unit_label, u.price, u.base_qty, u.barcode
     FROM product_units u
     JOIN products p ON p.id = u.product_id
     WHERE u.barcode = $1
     LIMIT 1`,
    [barcode]
  )
  return rows[0] ?? null
}

// Crea el producto y su unidad por omisión en una sola transacción — regla de
// n8n: todo producto nace con una unidad is_default (ver 3.9 DB Upsert Product).
export async function createProduct(fastify, data) {
  return fastify.withTransaction(async (client) => {
    const productRes = await client.query(
      `INSERT INTO products
         (product_name, aliases, sat_product_code, sat_unit_code, is_taxable, has_variable_weight, min_stock_base, list_price, category_id)
       VALUES ($1, $2, COALESCE($3, '01010101'), COALESCE($4, 'H87'), $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        data.product_name,
        data.aliases ?? null,
        data.sat_product_code ?? null,
        data.sat_unit_code ?? null,
        data.is_taxable ?? true,
        data.has_variable_weight ?? false,
        data.min_stock_base ?? null,
        data.price,
        data.category_id ?? null
      ]
    )
    const productId = productRes.rows[0].id

    await client.query(
      `INSERT INTO product_units (product_id, unit_label, price, base_qty, barcode, is_default)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [productId, data.unit_label ?? 'pieza', data.price, data.base_qty ?? 1, data.barcode ?? null]
    )

    return productId
  })
}

const PATCHABLE_PRODUCT_FIELDS = [
  'product_name', 'aliases', 'sat_product_code', 'sat_unit_code',
  'is_taxable', 'has_variable_weight', 'min_stock_base', 'category_id'
]

export async function patchProduct(fastify, id, patch) {
  const entries = Object.entries(patch).filter(([key]) => PATCHABLE_PRODUCT_FIELDS.includes(key))
  if (entries.length === 0) return getProduct(fastify, id)

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(id)

  const { rows } = await fastify.pg.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id`,
    values
  )
  if (rows.length === 0) return null
  return getProduct(fastify, id)
}

// Si la nueva unidad llega marcada is_default, primero se apaga la anterior
// — solo puede haber una unidad por omisión por producto (es la que n8n y
// el trigger de list_price usan como precio de referencia).
export async function createUnit(fastify, productId, data) {
  return fastify.withTransaction(async (client) => {
    const product = await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [productId])
    if (product.rows.length === 0) return null

    if (data.is_default) {
      await client.query('UPDATE product_units SET is_default = false WHERE product_id = $1', [productId])
    }

    const { rows } = await client.query(
      `INSERT INTO product_units (product_id, unit_label, price, base_qty, barcode, sat_unit_code, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        productId, data.unit_label, data.price, data.base_qty ?? null,
        data.barcode ?? null, data.sat_unit_code ?? null, data.is_default ?? false
      ]
    )
    return rows[0].id
  })
}

// Devuelve la ruta anterior (si había) para que la ruta borre ese archivo del
// disco y no se acumulen fotos huérfanas al reemplazar una imagen.
export async function setProductImage(fastify, productId, imagePath) {
  return fastify.withTransaction(async (client) => {
    const { rows: before } = await client.query(
      'SELECT image_path FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    )
    if (before.length === 0) return null

    await client.query('UPDATE products SET image_path = $1 WHERE id = $2', [imagePath, productId])
    return { previous_path: before[0].image_path }
  })
}

const PATCHABLE_UNIT_FIELDS = ['price', 'base_qty', 'barcode', 'sat_unit_code']

export async function patchUnit(fastify, unitId, patch) {
  const entries = Object.entries(patch).filter(([key]) => PATCHABLE_UNIT_FIELDS.includes(key))
  if (entries.length === 0) return null

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`)
  const values = entries.map(([, value]) => value)
  values.push(unitId)

  const { rows } = await fastify.pg.query(
    `UPDATE product_units SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING product_id`,
    values
  )
  if (rows.length === 0) return null
  return getProduct(fastify, rows[0].product_id)
}
