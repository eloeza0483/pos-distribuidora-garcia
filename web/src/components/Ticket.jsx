import { dinero, fecha } from '../lib/formato.js'

const NOMBRE_FORMA_PAGO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia'
}

// Un solo componente sirve para el ticket recién cobrado y para la
// reimpresión desde Ventas: ambos reciben el mismo payload `ticket` que arma
// el servidor (services/tickets.js).
export default function Ticket({ ticket }) {
  if (!ticket) return null

  return (
    <div className="ticket" style={{ '--ticket-ancho': `${ticket.ancho_mm}mm` }}>
      {ticket.cancelado && <div className="ticket-cancelado">CANCELADO</div>}

      <div className="ticket-encabezado">
        <p className="ticket-negocio">{ticket.negocio}</p>
        {ticket.direccion && <p>{ticket.direccion}</p>}
        {ticket.telefono && <p>Tel. {ticket.telefono}</p>}
        {ticket.rfc && <p>RFC {ticket.rfc}</p>}
      </div>

      <div className="ticket-datos">
        <p>Folio #{ticket.folio}</p>
        <p>{fecha(ticket.fecha)}</p>
        <p>Cliente: {ticket.cliente}</p>
      </div>

      <table className="ticket-tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {ticket.items.map((item, i) => (
            <tr key={i}>
              <td>{item.product_name}{item.unit_label ? ` (${item.unit_label})` : ''}</td>
              <td>{item.quantity}</td>
              <td>{dinero(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ticket-total">
        <span>Total</span>
        <span>{dinero(ticket.total)}</span>
      </div>

      {ticket.payment_method && (
        <div className="ticket-pago">
          <p>Forma de pago: {NOMBRE_FORMA_PAGO[ticket.payment_method] ?? ticket.payment_method}</p>
          {ticket.cash_received !== null && <p>Recibido: {dinero(ticket.cash_received)}</p>}
          {ticket.change_given !== null && <p>Cambio: {dinero(ticket.change_given)}</p>}
        </div>
      )}

      {ticket.pie && <p className="ticket-pie">{ticket.pie}</p>}
    </div>
  )
}
