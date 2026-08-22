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
    // El reintento reimprime en lugar de quedarse sin ticket.
    expect(second.json().ticket.folio).toBe(first.json().ticket.folio)

    const { rows } = await app.pg.query('SELECT count(*) FROM orders WHERE id = $1', [first.json().order_id])
    expect(Number(rows[0].count)).toBe(1)
  })

  it('cobra en efectivo, calcula el cambio y arma el ticket', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload: { items: [{ product_id: productId, quantity: 2, unit_price: 10 }], payment_method: 'efectivo', cash_received: 25 }
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.ticket.folio).toBe(body.order_id)
    expect(body.ticket.total).toBe(20)
    expect(body.ticket.payment_method).toBe('efectivo')
    expect(body.ticket.cash_received).toBe(25)
    expect(body.ticket.change_given).toBe(5)
    expect(body.ticket.cliente).toBe('Público en General')
    expect(body.ticket.cancelado).toBe(false)

    const { rows } = await app.pg.query('SELECT client_id FROM orders WHERE id = $1', [body.order_id])
    expect(rows[0].client_id).not.toBeNull()
  })

  it('rechaza el cobro en efectivo si no alcanza (422)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload: { items: [{ product_id: productId, quantity: 2, unit_price: 10 }], payment_method: 'efectivo', cash_received: 5 }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error).toBe('cash_too_low')
  })
})
