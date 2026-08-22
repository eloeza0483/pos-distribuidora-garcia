import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

describe('catálogo de productos', () => {
  let app

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('los más vendidos vienen ordenados y con sus unidades', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/products/populares?limit=5&days=30' })

    expect(res.statusCode).toBe(200)
    const populares = res.json()
    expect(populares.length).toBeGreaterThan(0)
    expect(populares.length).toBeLessThanOrEqual(5)

    // '/populares' no debe caer en la ruta '/:id'.
    for (const producto of populares) {
      expect(producto.id).toBeTypeOf('number')
      expect(producto.units.length).toBeGreaterThan(0)
    }
  })

  it('buscar un número también empata por precio', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { product_name: `Producto precio ${Date.now()}`, price: 137.77, base_qty: 1 }
    })
    const productId = creado.json().id

    try {
      const res = await app.inject({ method: 'GET', url: '/api/products?q=137.77' })
      expect(res.statusCode).toBe(200)
      expect(res.json().map((p) => p.id)).toContain(productId)
    } finally {
      await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
    }
  })

  it('rechaza una foto que no es imagen (415)', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { product_name: `Producto foto ${Date.now()}`, price: 5, base_qty: 1 }
    })
    const productId = creado.json().id

    try {
      const boundary = '----vitest'
      const body = Buffer.from(
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="notas.txt"\r\n' +
        'Content-Type: text/plain\r\n\r\n' +
        'esto no es una foto\r\n' +
        `--${boundary}--\r\n`
      )

      const res = await app.inject({
        method: 'POST',
        url: `/api/products/${productId}/image`,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: body
      })

      expect(res.statusCode).toBe(415)
      expect(res.json().message).toContain('JPG')
    } finally {
      await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
    }
  })
})
