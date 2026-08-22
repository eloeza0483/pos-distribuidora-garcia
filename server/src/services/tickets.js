import { loadTicketConfig } from '../config/ticket.js'

// Arma el payload del ticket a partir de la venta ya guardada. Es el punto de
// extensión para ESC/POS: un módulo de impresora térmica futuro recibe este
// mismo objeto y no necesita nada más que este servicio ya no le dé.
export function buildTicket({ order, items, client }) {
  const ticketConfig = loadTicketConfig()
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
    cancelado: order.status === 'CANCELADO'
  }
}
