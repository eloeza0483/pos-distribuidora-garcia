import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.js'

describe('consulta, corte y cancelación de ventas', () => {
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
      payload: { product_name: `Producto ventas ${Date.now()}`, price: 10, base_qty: 1 }
    })
    productId = res.json().id
    await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'entrada', quantity: 100, unit_label: 'pieza' }
    })
  })

  afterEach(async () => {
    await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
  })

  async function cobrar(quantity = 2) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload: { items: [{ product_id: productId, quantity, unit_price: 10 }], payment_method: 'efectivo', cash_received: 100 }
    })
    return res.json()
  }

  it('el detalle trae el ticket completo y el listado incluye la venta', async () => {
    const venta = await cobrar(3)

    const detalle = await app.inject({ method: 'GET', url: `/api/sales/${venta.order_id}` })
    expect(detalle.statusCode).toBe(200)
    expect(detalle.json().ticket.items).toHaveLength(1)
    expect(detalle.json().status).toBe('COBRADO')

    const listado = await app.inject({ method: 'GET', url: '/api/sales?payment_method=efectivo' })
    expect(listado.statusCode).toBe(200)
    expect(listado.json().find((v) => v.order_id === venta.order_id)).toBeTruthy()
  })

  it('devuelve 404 al pedir el detalle de una venta inexistente', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sales/999999999' })
    expect(res.statusCode).toBe(404)
  })

  it('el corte de caja del día cuadra con las ventas cobradas', async () => {
    const venta = await cobrar(2) // $20

    const corte = await app.inject({ method: 'GET', url: '/api/sales/corte' })
    expect(corte.statusCode).toBe(200)
    const body = corte.json()
    expect(body.total).toBeGreaterThanOrEqual(20)
    expect(body.tickets).toBeGreaterThanOrEqual(1)
    const efectivo = body.por_forma_de_pago.find((p) => p.payment_method === 'efectivo')
    expect(efectivo).toBeTruthy()
    expect(efectivo.total).toBeGreaterThanOrEqual(20)

    // La venta de esta prueba está adentro del corte.
    const detalle = await app.inject({ method: 'GET', url: `/api/sales/${venta.order_id}` })
    expect(detalle.statusCode).toBe(200)
  })

  it('cancelar una venta regresa el stock vendido al inventario', async () => {
    const antes = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    const stockAntes = antes.json().stock_base

    const venta = await cobrar(4)

    const conVenta = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(conVenta.json().stock_base).toBe(stockAntes - 4)

    const cancelacion = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/cancel`,
      payload: { reason: 'Cliente se arrepintió' }
    })
    expect(cancelacion.statusCode).toBe(200)
    expect(cancelacion.json().status).toBe('CANCELADO')
    expect(cancelacion.json().ticket.cancelado).toBe(true)

    const despues = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(despues.json().stock_base).toBe(stockAntes)

    const detalle = await app.inject({ method: 'GET', url: `/api/sales/${venta.order_id}` })
    expect(detalle.json().status).toBe('CANCELADO')
    expect(detalle.json().cancel_reason).toBe('Cliente se arrepintió')
  })

  it('no deja cancelar dos veces la misma venta (409)', async () => {
    const venta = await cobrar(1)

    const primera = await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })
    const segunda = await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })

    expect(primera.statusCode).toBe(200)
    expect(segunda.statusCode).toBe(409)
    expect(segunda.json().error).toBe('already_cancelled')
  })

  it('devuelve 404 al cancelar una venta inexistente', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sales/999999999/cancel', payload: {} })
    expect(res.statusCode).toBe(404)
  })
})
