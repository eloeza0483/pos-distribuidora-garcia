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
    <div
      className="max-w-full bg-surface border border-border rounded-lg p-4 font-mono text-[0.82rem] text-text"
      style={{ width: `${ticket.ancho_mm}mm` }}
    >
      {ticket.cancelado && (
        <div className="text-center font-bold text-danger border-2 border-danger rounded-md p-1 mb-[0.6rem]">CANCELADO</div>
      )}

      <div className="text-center mb-[0.6rem]">
        <p className="my-[0.1rem] font-bold text-[0.95rem]">{ticket.negocio}</p>
        {ticket.direccion && <p className="my-[0.1rem]">{ticket.direccion}</p>}
        {ticket.telefono && <p className="my-[0.1rem]">Tel. {ticket.telefono}</p>}
        {ticket.rfc && <p className="my-[0.1rem]">RFC {ticket.rfc}</p>}
      </div>

      <div className="border-t border-b border-dashed border-border py-2 mb-2">
        <p className="my-[0.15rem]">Folio #{ticket.folio}</p>
        <p className="my-[0.15rem]">{fecha(ticket.fecha)}</p>
        <p className="my-[0.15rem]">Cliente: {ticket.cliente}</p>
      </div>

      <table className="w-full text-[0.8rem] mb-2">
        <thead>
          <tr>
            <th className="p-[0.2rem_0.15rem] border-none text-left normal-case tracking-normal">Producto</th>
            <th className="p-[0.2rem_0.15rem] border-none text-right normal-case tracking-normal">Cant.</th>
            <th className="p-[0.2rem_0.15rem] border-none text-right normal-case tracking-normal">Importe</th>
          </tr>
        </thead>
        <tbody>
          {ticket.items.map((item, i) => (
            <tr key={i}>
              <td className="p-[0.2rem_0.15rem] border-none text-left">{item.product_name}{item.unit_label ? ` (${item.unit_label})` : ''}</td>
              <td className="p-[0.2rem_0.15rem] border-none text-right">{item.quantity}</td>
              <td className="p-[0.2rem_0.15rem] border-none text-right">{dinero(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between font-bold text-base border-t border-dashed border-border pt-[0.4rem] mb-[0.4rem]">
        <span>Total</span>
        <span>{dinero(ticket.total)}</span>
      </div>

      {ticket.payment_method && (
        <div>
          <p className="my-[0.1rem]">Forma de pago: {NOMBRE_FORMA_PAGO[ticket.payment_method] ?? ticket.payment_method}</p>
          {ticket.cash_received !== null && <p className="my-[0.1rem]">Recibido: {dinero(ticket.cash_received)}</p>}
          {ticket.change_given !== null && <p className="my-[0.1rem]">Cambio: {dinero(ticket.change_given)}</p>}
        </div>
      )}

      {ticket.pie && <p className="text-center mt-[0.6rem] text-text-muted">{ticket.pie}</p>}
    </div>
  )
}
