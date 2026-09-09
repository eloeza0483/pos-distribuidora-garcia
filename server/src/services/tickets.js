import { loadTicketConfig } from '../config/ticket.js'

// Arma el payload del ticket a partir de la venta ya guardada. Es el punto de
// extensión para ESC/POS: un módulo de impresora térmica futuro recibe este
// mismo objeto y no necesita nada más que este servicio ya no le dé.
//
// `payments` es la bitácora completa de order_payments (para el desglose de
// abonos); `abono_actual` es el monto del pago que se acaba de registrar,
// cuando el ticket es el recibo de un abono (null para el ticket de la venta).
export function buildTicket({ order, items, client, payments = [], abono_actual = null }) {
  const ticketConfig = loadTicketConfig()

  // El saldo se toma de lo que ya calculó SQL (order.saldo), nunca restando
  // en JS: total_amount y amount_paid son numeric, y restar floats de JS dejaría
  // residuos de centavos que nunca dejarían cerrar una venta como pagada.
  const saldo = order.saldo !== undefined && order.saldo !== null
    ? Number(order.saldo)
    : Math.round((Number(order.total_amount) - Number(order.amount_paid ?? order.total_amount)) * 100) / 100

  return {
    negocio: ticketConfig.negocio,
    direccion: ticketConfig.direccion,
    telefono: ticketConfig.telefono,
    rfc: ticketConfig.rfc,
    pie: ticketConfig.pie,
    ancho_mm: ticketConfig.ancho_mm,
    folio: order.id,
    order_hash: order.order_hash,
    fecha: order.created_at,
    cliente: client?.client_name ?? 'Público en General',
    items: items.map((item) => ({
      product_name: item.product_name,
      unit_label: item.unit_label,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal)
    })),
    total: Number(order.total_amount),
    payment_method: order.payment_method ?? null,
    cash_received: order.cash_received !== null && order.cash_received !== undefined ? Number(order.cash_received) : null,
    change_given: order.change_given !== null && order.change_given !== undefined ? Number(order.change_given) : null,
    cancelado: order.status === 'CANCELADO',
    payment_status: order.payment_status ?? 'PAGADA',
    amount_paid: order.amount_paid !== undefined && order.amount_paid !== null ? Number(order.amount_paid) : Number(order.total_amount),
    saldo,
    pendiente: saldo > 0.005 && order.status !== 'CANCELADO',
    pagos: payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        amount: Number(p.amount),
        payment_method: p.payment_method,
        created_at: p.created_at
      })),
    abono_actual
  }
}
