import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.js'

describe('cobro de mostrador', () => {
  let app
  let productId

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { product_name: `Producto de venta ${Date.now()}`, price: 10, base_qty: 1 }
    })
    productId = res.json().id
    // Con stock inicial para que la venta no choque con validaciones de inventario
    // (el trigger que descuenta stock aún no está activo — ver migración 002).
  })

  afterEach(async () => {
    await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
  })

  it('rechaza el cobro si el precio enviado ya no coincide con el real (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload: { items: [{ product_id: productId, quantity: 1, unit_price: 999 }] }
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('price_mismatch')
  })

  it('la misma clave de idempotencia no cobra dos veces', async () => {
    const key = randomUUID()
    const payload = { items: [{ product_id: productId, quantity: 1, unit_price: 10 }] }

    const first = await app.inject({ method: 'POST', url: '/api/sales', headers: { 'idempotency-key': key }, payload })
    const second = await app.inject({ method: 'POST', url: '/api/sales', headers: { 'idempotency-key': key }, payload })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(second.json().order_id).toBe(first.json().order_id)

    const { rows } = await app.pg.query('SELECT count(*) FROM orders WHERE id = $1', [first.json().order_id])
    expect(Number(rows[0].count)).toBe(1)
  })
})
