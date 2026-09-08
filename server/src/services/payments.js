import { buildTicket } from './tickets.js'
import {
  SaleNotFoundError, SaleCancelledError, SaleAlreadyPaidError,
  PaymentExceedsBalanceError, CashTooLowError
} from './errores.js'

// INSERT crudo del renglón de pago. El trigger recalcular_saldo_orden (migración
// 007) mantiene orders.amount_paid/payment_status — este servicio nunca los toca
// directo, igual que sales.js nunca toca products.stock_base directo.
// Recibe un "queryable" (fastify.pg o el client de una transacción en curso)
// para poder insertarse dentro del mismo BEGIN/COMMIT que crea la venta.
export async function insertPayment(queryable, {
  order_id, amount, payment_method = null, cash_received = null, change_given = null,
  note = null, idempotency_key = null, reverted_payment_id = null
}) {
  const { rows } = await queryable.query(
    `INSERT INTO order_payments
       (order_id, amount, payment_method, cash_received, change_given, note, idempotency_key, reverted_payment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [order_id, amount, payment_method, cash_received, change_given, note, idempotency_key, reverted_payment_id]
  )
  return rows[0]
}

export async function listPayments(queryable, orderId) {
  const { rows } = await queryable.query(
    'SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at, id',
    [orderId]
  )
  return rows
}

// Arma el resultado completo (estado de la orden + ticket) de un pago ya
// insertado. Se reusa tanto en el camino normal como en el replay idempotente
// — un doble clic en "Registrar abono" no abona dos veces, y tampoco se queda
// sin ticket para reimprimir.
async function buildPaymentResult(client, orderId, payment, { replay }) {
  const { rows: orderRows } = await client.query(
    `SELECT *, (total_amount - amount_paid) AS saldo FROM orders WHERE id = $1`,
    [orderId]
  )
  const order = orderRows[0]

  const { rows: itemRows } = await client.query(
    `SELECT oi.*, p.product_name AS resolved_product_name
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 ORDER BY oi.id`,
    [orderId]
  )
  const items = itemRows.map((item) => ({
    ...item,
    product_name: item.resolved_product_name ?? item.product_raw_name ?? 'Producto'
  }))
  const { rows: clientRows } = await client.query('SELECT client_name FROM clients WHERE id = $1', [order.client_id])
  const payments = await listPayments(client, orderId)

  return {
    order_id: order.id,
    payment_status: order.payment_status,
    amount_paid: Number(order.amount_paid),
    saldo: Number(order.saldo),
    payment: formatPayment(payment),
    ticket: buildTicket({
      order,
      items,
      client: { client_name: clientRows[0]?.client_name ?? 'Público en General' },
      payments,
      abono_actual: Number(payment.amount)
    }),
    replay
  }
}

// Registra un abono a una venta de mostrador ya cobrada (parcial o pendiente).
// Mismo patrón transaccional que createSale: candado de renglón sobre la
// orden y replay idempotente por clave.
export async function registerPayment(fastify, orderId, { amount, payment_method, cash_received, note, idempotencyKey }) {
  return fastify.withTransaction(async (client) => {
    // Replay idempotente: un doble clic en "Registrar abono" no abona dos veces.
    const existing = await client.query(
      'SELECT * FROM order_payments WHERE idempotency_key = $1',
      [idempotencyKey]
    )
    if (existing.rows.length > 0) {
      const payment = existing.rows[0]
      return buildPaymentResult(client, payment.order_id, payment, { replay: true })
    }

    // FOR UPDATE: serializa dos abonos simultáneos sobre la misma orden — el
    // trigger de la migración 007 actualiza ese mismo renglón, así que este
    // candado es exactamente el que hace falta.
    const { rows: orderRows } = await client.query(
      `SELECT *, (total_amount - amount_paid) AS saldo FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    )
    const order = orderRows[0]
    if (!order || order.channel !== 'mostrador') throw new SaleNotFoundError()
    if (order.status === 'CANCELADO') throw new SaleCancelledError()

    const saldo = Number(order.saldo)
    if (saldo <= 0) throw new SaleAlreadyPaidError()
    if (amount > saldo + 0.005) throw new PaymentExceedsBalanceError(saldo, amount)

    let changeGiven = null
    if (payment_method === 'efectivo' && cash_received != null) {
      if (cash_received < amount) throw new CashTooLowError(amount, cash_received)
      changeGiven = Math.round((cash_received - amount) * 100) / 100
    }

    const payment = await insertPayment(client, {
      order_id: orderId,
      amount,
      payment_method: payment_method ?? null,
      cash_received: cash_received ?? null,
      change_given: changeGiven,
      note: note ?? null,
      idempotency_key: idempotencyKey
    })

    return buildPaymentResult(client, orderId, payment, { replay: false })
  })
}

// Devuelve (compensa) los abonos de una venta al cancelarla — calca cancelSale
// sobre inventory_movements: nunca borra, inserta el renglón contrario. Corre
// dentro de la transacción de cancelSale (recibe el client de esa tx).
export async function refundPayments(client, orderId) {
  const { rows: payments } = await client.query(
    `SELECT p.* FROM order_payments p
     WHERE p.order_id = $1 AND p.amount > 0
       AND NOT EXISTS (SELECT 1 FROM order_payments r WHERE r.reverted_payment_id = p.id)
     ORDER BY p.id`,
    [orderId]
  )

  let total = 0
  for (const payment of payments) {
    await insertPayment(client, {
      order_id: orderId,
      amount: -Number(payment.amount),
      payment_method: payment.payment_method,
      note: `Cancelación de la venta #${orderId}`,
      reverted_payment_id: payment.id
    })
    total += Number(payment.amount)
  }
  return Math.round(total * 100) / 100
}

function formatPayment(payment) {
  return {
    id: payment.id,
    amount: Number(payment.amount),
    payment_method: payment.payment_method,
    cash_received: payment.cash_received !== null ? Number(payment.cash_received) : null,
    change_given: payment.change_given !== null ? Number(payment.change_given) : null,
    created_at: payment.created_at
  }
}
