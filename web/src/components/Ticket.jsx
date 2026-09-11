import { dinero, fecha } from '../lib/formato.js'
import { NOMBRE_FORMA_PAGO } from '../lib/formasPago.js'

// Un solo componente sirve para el ticket recién cobrado y para la
// reimpresión desde Ventas: ambos reciben el mismo payload `ticket` que arma
// el servidor (services/tickets.js).
export default function Ticket({ ticket }) {
  if (!ticket) return null

  return (
    <div
      className="max-w-full min-w-[17rem] print:min-w-0 bg-surface border border-border rounded-lg p-4 font-mono text-[0.82rem] text-text break-words"
      style={{ width: `${ticket.ancho_mm}mm` }}
    >
      {ticket.cancelado && (
        <div className="text-center font-bold text-danger border-2 border-danger rounded-md p-1 mb-[0.6rem]">CANCELADO</div>
      )}
      {!ticket.cancelado && ticket.abono_actual != null && (
        <div className="text-center font-bold text-[#8a5417] border-2 border-accent rounded-md p-1 mb-[0.6rem]">RECIBO DE ABONO</div>
      )}
      {!ticket.cancelado && ticket.abono_actual == null && ticket.pendiente && (
        <div className="text-center font-bold text-[#8a5417] border-2 border-accent rounded-md p-1 mb-[0.6rem]">PENDIENTE POR COBRAR</div>
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

      <table className="w-full table-fixed text-[0.8rem] mb-2">
        <thead>
          <tr>
            <th className="!py-[0.2rem] !px-[0.15rem] !border-none text-left !normal-case !tracking-normal">Producto</th>
            <th className="w-[3.2rem] !py-[0.2rem] !px-[0.15rem] !border-none text-right !normal-case !tracking-normal">Cant.</th>
            <th className="w-[4.6rem] !py-[0.2rem] !px-[0.15rem] !border-none text-right !normal-case !tracking-normal">Importe</th>
          </tr>
        </thead>
        <tbody>
          {ticket.items.map((item, i) => (
            <tr key={i}>
              <td className="!py-[0.2rem] !px-[0.15rem] !border-none text-left break-words">{item.product_name}{item.unit_label ? ` (${item.unit_label})` : ''}</td>
              <td className="!py-[0.2rem] !px-[0.15rem] !border-none text-right whitespace-nowrap">{item.quantity}</td>
              <td className="!py-[0.2rem] !px-[0.15rem] !border-none text-right whitespace-nowrap">{dinero(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between font-bold text-base border-t border-dashed border-border pt-[0.4rem] mb-[0.4rem]">
        <span>Total</span>
        <span>{dinero(ticket.total)}</span>
      </div>

      {ticket.abono_actual != null && (
        <p className="my-[0.1rem] font-bold text-[1.05rem]">Abono de hoy: {dinero(ticket.abono_actual)}</p>
      )}

      {ticket.payment_method && (
        <div>
          <p className="my-[0.1rem]">Forma de pago: {NOMBRE_FORMA_PAGO[ticket.payment_method] ?? ticket.payment_method}</p>
          {ticket.cash_received !== null && <p className="my-[0.1rem]">Recibido: {dinero(ticket.cash_received)}</p>}
          {ticket.change_given !== null && <p className="my-[0.1rem]">Cambio: {dinero(ticket.change_given)}</p>}
        </div>
      )}

      {ticket.pagos?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-dashed border-border">
          <p className="my-[0.1rem] font-semibold">Pagos</p>
          {ticket.pagos.map((pago, i) => (
            <div key={i} className="flex justify-between gap-2 my-[0.1rem]">
              <span className="min-w-0 break-words">{fecha(pago.created_at)} · {NOMBRE_FORMA_PAGO[pago.payment_method] ?? pago.payment_method ?? 'Sin forma de pago'}</span>
              <span className="whitespace-nowrap">{dinero(pago.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between mt-1 font-semibold">
            <span>Abonado</span>
            <span>{dinero(ticket.amount_paid)}</span>
          </div>
        </div>
      )}

      {ticket.pendiente && (
        <div className="flex justify-between font-bold text-base border-t border-dashed border-border pt-[0.4rem] mt-[0.4rem] text-[#8a5417]">
          <span>SALDO PENDIENTE</span>
          <span>{dinero(ticket.saldo)}</span>
        </div>
      )}

      {ticket.pie && <p className="text-center mt-[0.6rem] text-text-muted">{ticket.pie}</p>}
    </div>
  )
}
