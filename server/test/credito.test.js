import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../src/app.js'

describe('ventas a crédito: pendientes, abonos y corte', () => {
  let app
  let productId
  let clientId

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
      payload: { product_name: `Producto crédito ${Date.now()}`, price: 100, base_qty: 1 }
    })
    productId = res.json().id
    await app.inject({
      method: 'POST',
      url: '/api/inventory/movements',
      payload: { product_id: productId, type: 'entrada', quantity: 100, unit_label: 'pieza' }
    })

    const cliente = await app.inject({
      method: 'POST',
      url: '/api/clients',
      payload: { client_name: `Deudor de prueba ${Date.now()}`, phone: '5512345678' }
    })
    clientId = cliente.json().id
  })

  afterEach(async () => {
    await app.pg.query('DELETE FROM products WHERE id = $1', [productId])
    // La FK orders.client_id es ON DELETE SET NULL: borrar el cliente no
    // arrastra las órdenes que dejó, así que no hace falta limpiarlas aparte.
    await app.pg.query('DELETE FROM clients WHERE id = $1', [clientId])
  })

  // total = quantity * 100. `client_id: null` (explícito, no `undefined`) deja
  // la venta SIN cliente, para probar el guardarrail de crédito — un
  // parámetro con valor por omisión no se activa con `undefined` explícito
  // si se resuelve con `??` en vez de la destructuración.
  async function venderACredito({ quantity = 5, amount_paid, payment_method, cash_received, client_id } = {}) {
    const resolvedClientId = client_id === undefined ? clientId : client_id
    const payload = { items: [{ product_id: productId, quantity, unit_price: 100 }], amount_paid, payment_method, cash_received }
    if (resolvedClientId !== null) payload.client_id = resolvedClientId

    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload
    })
    return res
  }

  async function corteDeHoy() {
    const res = await app.inject({ method: 'GET', url: '/api/sales/corte' })
    return res.json()
  }

  it('deja una venta pendiente completa (amount_paid: 0) con cliente real', async () => {
    const res = await venderACredito({ amount_paid: 0 })

    expect(res.statusCode).toBe(201)
    const venta = res.json()
    expect(venta.payment_status).toBe('PENDIENTE')
    expect(venta.amount_paid).toBe(0)
    expect(venta.saldo).toBe(500)
    expect(venta.ticket.pendiente).toBe(true)
    expect(venta.ticket.pagos).toHaveLength(0)

    const { rows } = await app.pg.query('SELECT count(*) FROM order_payments WHERE order_id = $1', [venta.order_id])
    expect(Number(rows[0].count)).toBe(0)
  })

  it('rechaza una venta pendiente sin cliente o a Público en General (422)', async () => {
    const sinCliente = await venderACredito({ amount_paid: 0, client_id: null })
    expect(sinCliente.statusCode).toBe(422)
    expect(sinCliente.json().error).toBe('credit_requires_client')

    const clientesResp = await app.inject({ method: 'GET', url: '/api/clients?q=Público en General' })
    const publicoGeneral = clientesResp.json().find((c) => c.client_name === 'Público en General')
    const conPublicoGeneral = await venderACredito({ amount_paid: 0, client_id: publicoGeneral.id })
    expect(conPublicoGeneral.statusCode).toBe(422)
    expect(conPublicoGeneral.json().error).toBe('credit_requires_client')
  })

  it('una venta pendiente no mueve el corte de "cobrado" pero sí la cartera', async () => {
    const antes = await corteDeHoy()

    const venta = await venderACredito({ amount_paid: 0 })
    expect(venta.statusCode).toBe(201)

    const despues = await corteDeHoy()
    expect(despues.cobrado).toBeCloseTo(antes.cobrado, 2)
    expect(despues.pendiente_generado - antes.pendiente_generado).toBeCloseTo(500, 2)
    expect(despues.por_cobrar_total - antes.por_cobrar_total).toBeCloseTo(500, 2)
  })

  it('venta con abono inicial parcial queda PARCIAL con un pago registrado', async () => {
    const res = await venderACredito({ amount_paid: 200, payment_method: 'efectivo', cash_received: 200 })

    expect(res.statusCode).toBe(201)
    const venta = res.json()
    expect(venta.payment_status).toBe('PARCIAL')
    expect(venta.amount_paid).toBe(200)
    expect(venta.saldo).toBe(300)
    expect(venta.ticket.saldo).toBe(300)

    const { rows } = await app.pg.query('SELECT count(*) FROM order_payments WHERE order_id = $1', [venta.order_id])
    expect(Number(rows[0].count)).toBe(1)
  })

  it('POST /:id/payments registra un abono parcial y mueve el corte de hoy', async () => {
    const venta = (await venderACredito({ amount_paid: 0 })).json()
    const antes = await corteDeHoy()

    const abono = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 200, payment_method: 'tarjeta' }
    })
    expect(abono.statusCode).toBe(201)
    expect(abono.json().payment_status).toBe('PARCIAL')
    expect(abono.json().saldo).toBe(300)

    const despues = await corteDeHoy()
    expect(despues.cobrado - antes.cobrado).toBeCloseTo(200, 2)
    const tarjeta = despues.por_forma_de_pago.find((p) => p.payment_method === 'tarjeta')
    expect(tarjeta).toBeTruthy()
  })

  it('un abono que completa el saldo deja la venta PAGADA; un tercer abono da 409', async () => {
    const venta = (await venderACredito({ amount_paid: 200 })).json()

    const completa = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 300 }
    })
    expect(completa.statusCode).toBe(201)
    expect(completa.json().payment_status).toBe('PAGADA')
    expect(completa.json().saldo).toBe(0)

    const tercero = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 10 }
    })
    expect(tercero.statusCode).toBe(409)
    expect(tercero.json().error).toBe('already_paid')
  })

  it('un abono mayor al saldo da 422 con el saldo real en los detalles', async () => {
    const venta = (await venderACredito({ amount_paid: 200 })).json() // saldo 300

    const res = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 500 }
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toBe('amount_exceeds_balance')
    expect(res.json().details.saldo).toBe(300)
  })

  it('la misma clave de idempotencia no abona dos veces', async () => {
    const venta = (await venderACredito({ amount_paid: 0 })).json()
    const key = randomUUID()

    const primero = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': key },
      payload: { amount: 200 }
    })
    const segundo = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': key },
      payload: { amount: 200 }
    })

    expect(primero.statusCode).toBe(201)
    expect(segundo.statusCode).toBe(200)
    expect(segundo.json().payment.id).toBe(primero.json().payment.id)

    const { rows } = await app.pg.query('SELECT count(*) FROM order_payments WHERE order_id = $1', [venta.order_id])
    expect(Number(rows[0].count)).toBe(1)
  })

  it('abono en efectivo valida el efectivo recibido y calcula el cambio', async () => {
    const venta = (await venderACredito({ amount_paid: 0 })).json() // saldo 500

    const insuficiente = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 100, payment_method: 'efectivo', cash_received: 50 }
    })
    expect(insuficiente.statusCode).toBe(422)
    expect(insuficiente.json().error).toBe('cash_too_low')

    const conCambio = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 100, payment_method: 'efectivo', cash_received: 120 }
    })
    expect(conCambio.statusCode).toBe(201)
    expect(conCambio.json().payment.change_given).toBe(20)
  })

  it('no deja abonar a una venta cancelada (409)', async () => {
    const venta = (await venderACredito({ amount_paid: 0 })).json()
    await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })

    const res = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 10 }
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('sale_cancelled')
  })

  it('cancelar una venta con abonos devuelve el dinero y regresa el stock', async () => {
    const antes = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    const stockAntes = antes.json().stock_base

    const venta = (await venderACredito({ quantity: 5, amount_paid: 200, payment_method: 'efectivo', cash_received: 200 })).json()

    const cancelacion = await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })
    expect(cancelacion.statusCode).toBe(200)
    expect(cancelacion.json().devuelto).toBe(200)

    const detalle = await app.inject({ method: 'GET', url: `/api/sales/${venta.order_id}` })
    expect(detalle.json().amount_paid).toBe(0)
    expect(detalle.json().pagos).toHaveLength(2) // el abono original + su reverso

    const despues = await app.inject({ method: 'GET', url: `/api/products/${productId}` })
    expect(despues.json().stock_base).toBe(stockAntes)
  })

  it('cancelar dos veces no duplica la devolución de los abonos', async () => {
    const venta = (await venderACredito({ amount_paid: 200 })).json()

    const primera = await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })
    const segunda = await app.inject({ method: 'POST', url: `/api/sales/${venta.order_id}/cancel`, payload: {} })

    expect(primera.statusCode).toBe(200)
    expect(segunda.statusCode).toBe(409)

    const { rows } = await app.pg.query('SELECT count(*) FROM order_payments WHERE order_id = $1', [venta.order_id])
    expect(Number(rows[0].count)).toBe(2) // el abono original + su reverso, no más
  })

  it('el filtro payment_status=CON_SALDO incluye pendientes/parciales, excluye pagadas y canceladas', async () => {
    const pendiente = (await venderACredito({ amount_paid: 0 })).json()
    const pagada = (await venderACredito({ amount_paid: 500 })).json()
    const canceladaPendiente = (await venderACredito({ amount_paid: 0 })).json()
    await app.inject({ method: 'POST', url: `/api/sales/${canceladaPendiente.order_id}/cancel`, payload: {} })

    const listado = await app.inject({ method: 'GET', url: '/api/sales?payment_status=CON_SALDO' })
    const ids = listado.json().map((v) => v.order_id)

    expect(ids).toContain(pendiente.order_id)
    expect(ids).not.toContain(pagada.order_id)
    expect(ids).not.toContain(canceladaPendiente.order_id)

    const porCliente = await app.inject({ method: 'GET', url: `/api/sales?client_id=${clientId}` })
    expect(porCliente.statusCode).toBe(200)
    expect(porCliente.json().map((v) => v.order_id)).toEqual(expect.arrayContaining([pendiente.order_id, pagada.order_id, canceladaPendiente.order_id]))
  })

  it('GET /api/clients/deudores suma el saldo de varias ventas del mismo cliente', async () => {
    await venderACredito({ quantity: 2, amount_paid: 0 }) // $200
    await venderACredito({ quantity: 3, amount_paid: 100 }) // $300 - $100 = $200 de saldo

    const res = await app.inject({ method: 'GET', url: '/api/clients/deudores' })
    expect(res.statusCode).toBe(200)
    const deudor = res.json().find((d) => d.id === clientId)
    expect(deudor).toBeTruthy()
    expect(deudor.saldo).toBe(400)
    expect(deudor.ventas).toBe(2)
  })

  it('POST /api/clients crea un cliente y rechaza nombres repetidos (409)', async () => {
    const nombre = `Cliente único ${Date.now()}`
    const primero = await app.inject({ method: 'POST', url: '/api/clients', payload: { client_name: nombre } })
    expect(primero.statusCode).toBe(201)

    const repetido = await app.inject({ method: 'POST', url: '/api/clients', payload: { client_name: nombre } })
    expect(repetido.statusCode).toBe(409)
    expect(repetido.json().error).toBe('duplicate')

    await app.pg.query('DELETE FROM clients WHERE id = $1', [primero.json().id])
  })

  it('el ticket de un abono trae abono_actual y la lista completa de pagos', async () => {
    const venta = (await venderACredito({ amount_paid: 100 })).json()

    const abono = await app.inject({
      method: 'POST',
      url: `/api/sales/${venta.order_id}/payments`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { amount: 150 }
    })
    expect(abono.json().ticket.abono_actual).toBe(150)
    expect(abono.json().ticket.pagos).toHaveLength(2)
    expect(abono.json().ticket.saldo).toBe(250)
  })
})

describe('regresión: una venta de contado normal sigue quedando PAGADA', () => {
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
      payload: { product_name: `Producto contado ${Date.now()}`, price: 10, base_qty: 1 }
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

  it('sin amount_paid, la venta queda PAGADA con saldo 0 y un solo pago', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { 'idempotency-key': randomUUID() },
      payload: { items: [{ product_id: productId, quantity: 2, unit_price: 10 }], payment_method: 'efectivo', cash_received: 100 }
    })

    expect(res.statusCode).toBe(201)
    const venta = res.json()
    expect(venta.payment_status).toBe('PAGADA')
    expect(venta.amount_paid).toBe(20)
    expect(venta.saldo).toBe(0)

    const { rows } = await app.pg.query('SELECT count(*) FROM order_payments WHERE order_id = $1', [venta.order_id])
    expect(Number(rows[0].count)).toBe(1)
  })
})
