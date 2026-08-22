import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

describe('categorías de producto', () => {
  let app

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('crea una categoría y la rechaza duplicada (409)', async () => {
    const nombre = `Categoría de prueba ${Date.now()}`

    try {
      const primera = await app.inject({ method: 'POST', url: '/api/categories', payload: { name: nombre } })
      expect(primera.statusCode).toBe(201)
      expect(primera.json().name).toBe(nombre)

      const segunda = await app.inject({ method: 'POST', url: '/api/categories', payload: { name: nombre } })
      expect(segunda.statusCode).toBe(409)
      expect(segunda.json().error).toBe('duplicate')
    } finally {
      await app.pg.query('DELETE FROM categories WHERE name = $1', [nombre])
    }
  })

  it('un producto nuevo se puede dar de alta con categoría y filtrar por ella', async () => {
    const nombreCategoria = `Categoría filtro ${Date.now()}`
    const categoria = await app.inject({ method: 'POST', url: '/api/categories', payload: { name: nombreCategoria } })
    const categoryId = categoria.json().id

    const producto = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { product_name: `Producto con categoría ${Date.now()}`, price: 10, base_qty: 1, category_id: categoryId }
    })
    const productId = producto.json().id

    try {
      expect(producto.json().category_id).toBe(categoryId)
      expect(producto.json().category_name).toBe(nombreCategoria)

      const filtrado = await app.inject({ method: 'GET', url: `/api/products?category_id=${categoryId}` })
      expect(filtrado.json().map((p) => p.id)).toContain(productId)
    } finally {
      await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
      await app.pg.query('DELETE FROM categories WHERE id = $1', [categoryId])
    }
  })
})
