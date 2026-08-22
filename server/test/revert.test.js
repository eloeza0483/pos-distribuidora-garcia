import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'

// Deshacer un movimiento no borra nada: inserta el movimiento inverso. Estas
// pruebas cuidan justamente eso — que la bitácora crezca en vez de encogerse.
describe('deshacer movimientos de inventario', () => {
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
      payload: { product_name: `Producto reversa ${Date.now()}`, price: 10, base_qty: 1 }
    })
    productId = res.json().id
  })

  afterEach(async () => {
    await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
  })

  async function crearEntrada(quantity = 10) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'entrada', quantity, unit_label: 'pieza' }
    })
    return res.json()
  }

  it('deshacer una entrada regresa la existencia y deja dos renglones en la bitácora', async () => {
    const entrada = await crearEntrada(10)
    expect(entrada.stock_after).toBe(10)

    const res = await app.inject({ method: 'POST', url: `/api/inventory/movements/${entrada.id}/revert` })

    expect(res.statusCode).toBe(201)
    const reversa = res.json()
    expect(reversa.type).toBe('salida')
    expect(reversa.quantity_base).toBe(-10)
    expect(reversa.stock_after).toBe(0)
    expect(reversa.reverted_movement_id).toBe(entrada.id)

    const producto = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(producto.json().stock_base).toBe(0)

    // El original sigue ahí, marcado como ya revertido.
    const bitacora = await app.inject({ method: 'GET', url: `/api/inventory/movements?product_id=${productId}` })
    const movimientos = bitacora.json()
    expect(movimientos).toHaveLength(2)
    expect(movimientos.find((m) => m.id === entrada.id).is_reverted).toBe(true)
  })

  it('no deja deshacer dos veces el mismo movimiento (409)', async () => {
    const entrada = await crearEntrada(10)

    const primera = await app.inject({ method: 'POST', url: `/api/inventory/movements/${entrada.id}/revert` })
    const segunda = await app.inject({ method: 'POST', url: `/api/inventory/movements/${entrada.id}/revert` })

    expect(primera.statusCode).toBe(201)
    expect(segunda.statusCode).toBe(409)
    expect(segunda.json().error).toBe('not_revertible')

    const producto = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(producto.json().stock_base).toBe(0)
  })

  it('no deja deshacer una reversa (409)', async () => {
    const entrada = await crearEntrada(10)
    const reversa = await app.inject({ method: 'POST', url: `/api/inventory/movements/${entrada.id}/revert` })

    const res = await app.inject({ method: 'POST', url: `/api/inventory/movements/${reversa.json().id}/revert` })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('not_revertible')
  })

  it('rechaza deshacer si la existencia ya no alcanza (409)', async () => {
    const entrada = await crearEntrada(10)
    // Se vendió/salió la mercancía: ya no hay 10 piezas que devolver.
    await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'salida', quantity: 6, unit_label: 'pieza' }
    })

    const res = await app.inject({ method: 'POST', url: `/api/inventory/movements/${entrada.id}/revert` })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('insufficient_stock')
    expect(res.json().message).toContain('Ajuste')
  })

  it('devuelve 404 si el movimiento no existe', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/inventory/movements/99999999/revert' })
    expect(res.statusCode).toBe(404)
  })
})
