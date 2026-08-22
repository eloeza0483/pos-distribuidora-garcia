import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'

// Corre contra la base real distribuidora_garcia (requiere DATABASE_URL en
// .env). Cada prueba crea su propio producto de prueba y lo borra al final,
// para no dejar basura ni interferir con los 34 productos reales.
describe('inventario', () => {
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
      payload: { product_name: `Producto de prueba ${Date.now()}`, price: 10, base_qty: 1 }
    })
    productId = res.json().id
  })

  afterEach(async () => {
    // ON DELETE CASCADE se lleva sus unidades y movimientos.
    await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
  })

  it('rechaza una salida en una unidad sin factor de conversión (422)', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/units`,
      payload: { unit_label: 'bulto', price: 500 } // sin base_qty -> queda NULL
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'salida', quantity: 1, unit_label: 'bulto' }
    })

    expect(res.statusCode).toBe(422)
    expect(res.json().error).toBe('missing_base_qty')
  })

  it('rechaza una salida mayor al stock disponible (409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'salida', quantity: 5, unit_label: 'pieza' }
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('insufficient_stock')
  })

  it('una entrada de 2 bultos con factor 90 suma 180 piezas al stock', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/products/${productId}/units`,
      payload: { unit_label: 'bulto', price: 500, base_qty: 90 }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'entrada', quantity: 2, unit_label: 'bulto' }
    })

    expect(res.statusCode).toBe(201)
    const movement = res.json()
    expect(movement.quantity_base).toBe(180)
    expect(movement.stock_after).toBe(180)

    const product = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(product.json().stock_base).toBe(180)
  })
})
