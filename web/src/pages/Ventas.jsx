import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { useConfirmacion } from '../components/Confirmacion.jsx'
import Ticket from '../components/Ticket.jsx'
import { imprimirTicket } from '../lib/imprimir.js'
import { dinero, fecha } from '../lib/formato.js'
import {
  CLASE_CARD, CLASE_PAGE_TITLE, CLASE_FIELD, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE,
  CLASE_BTN_PRIMARY, CLASE_BTN_PELIGRO_SOLIDO, CLASE_PANEL_TICKET, CLASE_PANEL_TICKET_ACCIONES,
  CLASE_PILL_INFO, CLASE_PILL_CANCELADA
} from '../lib/clasesUi.js'

const NOMBRE_FORMA_PAGO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia'
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function Ventas() {
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState(hoyISO())
  const [formaPago, setFormaPago] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ventas, setVentas] = useState([])
  const [corte, setCorte] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const confirmar = useConfirmacion()

  useEffect(() => {
    setCargando(true)
    setError(null)
    api.sales.list({ from: desde, to: hasta, payment_method: formaPago, q: busqueda.trim() })
      .then(setVentas)
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false))
  }, [desde, hasta, formaPago, busqueda])

  useEffect(() => {
    // El corte de caja siempre es del día de hoy, sin importar el filtro del
    // listado (que puede estar consultando otras fechas).
    api.sales.corte(hoyISO())
      .then(setCorte)
      .catch((err) => setError(mensajeDeError(err)))
  }, [detalle])

  async function abrirDetalle(orderId) {
    setError(null)
    try {
      setDetalle(await api.sales.get(orderId))
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  async function cancelarVenta() {
    if (!detalle) return
    const ok = await confirmar({
      titulo: '¿Cancelar esta venta?',
      detalles: [
        { etiqueta: 'Folio', valor: `#${detalle.order_id}` },
        { etiqueta: 'Total', valor: dinero(detalle.total_amount) }
      ],
      advertencia: 'El stock vendido regresa al inventario. Esto no se puede deshacer.',
      textoConfirmar: 'Sí, cancelar venta',
      peligroso: true
    })
    if (!ok) return

    setError(null)
    try {
      await api.sales.cancel(detalle.order_id)
      const actualizado = await api.sales.get(detalle.order_id)
      setDetalle(actualizado)
      setVentas((prev) => prev.map((v) => (v.order_id === detalle.order_id ? { ...v, cancelled_at: actualizado.cancelled_at } : v)))
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  return (
    <div>
      <h1 className={CLASE_PAGE_TITLE}>Ventas</h1>

      {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

      {corte && (
        <div className={`${CLASE_CARD} flex flex-wrap gap-6 mb-4`}>
          <div className="flex flex-col gap-[0.2rem]">
            <span className="text-[1.4rem] font-bold text-primary-dark">{dinero(corte.total)}</span>
            <span className="text-xs text-text-muted uppercase tracking-wide">Corte de hoy</span>
          </div>
          <div className="flex flex-col gap-[0.2rem]">
            <span className="text-[1.4rem] font-bold text-primary-dark">{corte.tickets}</span>
            <span className="text-xs text-text-muted uppercase tracking-wide">Tickets</span>
          </div>
          {corte.por_forma_de_pago.map((p) => (
            <div className="flex flex-col gap-[0.2rem]" key={p.payment_method ?? 'sin_forma'}>
              <span className="text-[1.4rem] font-bold text-primary-dark">{dinero(p.total)}</span>
              <span className="text-xs text-text-muted uppercase tracking-wide">{p.payment_method ? NOMBRE_FORMA_PAGO[p.payment_method] ?? p.payment_method : 'Sin forma de pago'}</span>
            </div>
          ))}
          {corte.cancelados > 0 && (
            <div className="flex flex-col gap-[0.2rem]">
              <span className="text-[1.4rem] font-bold text-primary-dark">{corte.cancelados}</span>
              <span className="text-xs text-text-muted uppercase tracking-wide">Cancelados</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[1fr_340px] gap-5 items-stretch max-[900px]:grid-cols-1">
        <div>
          <div className={CLASE_CARD}>
            <div className="flex flex-wrap gap-[0.6rem] mb-4">
              <div className={`${CLASE_FIELD} flex-1 min-w-[150px]`}>
                <label htmlFor="ventas-desde">Desde</label>
                <input id="ventas-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className={`${CLASE_FIELD} flex-1 min-w-[150px]`}>
                <label htmlFor="ventas-hasta">Hasta</label>
                <input id="ventas-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <div className={`${CLASE_FIELD} flex-1 min-w-[150px]`}>
                <label htmlFor="ventas-forma-pago">Forma de pago</label>
                <select id="ventas-forma-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
              <div className={`${CLASE_FIELD} flex-1 min-w-[150px]`}>
                <label htmlFor="ventas-busqueda">Folio</label>
                <input
                  id="ventas-busqueda"
                  type="search"
                  placeholder="Buscar folio…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>

            {cargando ? (
              <div className={CLASE_EMPTY_STATE}>Cargando…</div>
            ) : ventas.length === 0 ? (
              <div className={CLASE_EMPTY_STATE}>No hay ventas con ese filtro.</div>
            ) : (
              ventas.map((v) => (
                <div
                  key={v.order_id}
                  className={`flex items-center gap-3 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-bg ${detalle?.order_id === v.order_id ? 'bg-bg' : ''}`}
                  onClick={() => abrirDetalle(v.order_id)}
                >
                  <div className={`flex-1 min-w-0 ${v.cancelled_at ? 'opacity-60 line-through' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[0.92rem]">#{v.order_id}</span>
                      <span className={CLASE_PILL_INFO}>
                        {v.payment_method ? NOMBRE_FORMA_PAGO[v.payment_method] ?? v.payment_method : 'Sin forma de pago'}
                      </span>
                      {v.cancelled_at && <span className={CLASE_PILL_CANCELADA}>Cancelada</span>}
                    </div>
                    <p className="text-[0.85rem] text-text-muted mt-0.5">
                      {fecha(v.created_at)} · {v.client_name ?? 'Público en General'} · {v.item_count} renglón{v.item_count === 1 ? '' : 'es'}
                    </p>
                  </div>
                  <span className="flex-none font-bold text-primary-dark">{dinero(v.total_amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <aside>
          {detalle ? (
            <div className={`${CLASE_CARD} ${CLASE_PANEL_TICKET}`}>
              <div id="area-impresion">
                <Ticket ticket={detalle.ticket} />
              </div>
              <div className={CLASE_PANEL_TICKET_ACCIONES}>
                <button className={CLASE_BTN_PRIMARY} onClick={() => imprimirTicket(detalle.ticket.ancho_mm)}>Imprimir</button>
                {detalle.status !== 'CANCELADO' && (
                  <button className={CLASE_BTN_PELIGRO_SOLIDO} onClick={cancelarVenta}>Cancelar venta</button>
                )}
              </div>
            </div>
          ) : (
            <div className={`${CLASE_CARD} ${CLASE_EMPTY_STATE} flex items-center justify-center text-center min-h-full`}>Elige una venta del listado para ver su detalle.</div>
          )}
        </aside>
      </div>
    </div>
  )
}
