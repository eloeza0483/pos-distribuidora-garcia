import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { useConfirmacion } from '../components/Confirmacion.jsx'
import Ticket from '../components/Ticket.jsx'
import { imprimirTicket } from '../lib/imprimir.js'
import { dinero, fecha } from '../lib/formato.js'

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
      <h1 className="page-title">Ventas</h1>

      {error && <div className="error-banner">{error}</div>}

      {corte && (
        <div className="card ventas-corte">
          <div className="ventas-corte-cifra">
            <span className="valor">{dinero(corte.total)}</span>
            <span className="etiqueta">Corte de hoy</span>
          </div>
          <div className="ventas-corte-cifra">
            <span className="valor">{corte.tickets}</span>
            <span className="etiqueta">Tickets</span>
          </div>
          {corte.por_forma_de_pago.map((p) => (
            <div className="ventas-corte-cifra" key={p.payment_method ?? 'sin_forma'}>
              <span className="valor">{dinero(p.total)}</span>
              <span className="etiqueta">{p.payment_method ? NOMBRE_FORMA_PAGO[p.payment_method] ?? p.payment_method : 'Sin forma de pago'}</span>
            </div>
          ))}
          {corte.cancelados > 0 && (
            <div className="ventas-corte-cifra">
              <span className="valor">{corte.cancelados}</span>
              <span className="etiqueta">Cancelados</span>
            </div>
          )}
        </div>
      )}

      <div className="ventas-layout">
        <div>
          <div className="card">
            <div className="ventas-filtros">
              <div className="field">
                <label htmlFor="ventas-desde">Desde</label>
                <input id="ventas-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ventas-hasta">Hasta</label>
                <input id="ventas-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ventas-forma-pago">Forma de pago</label>
                <select id="ventas-forma-pago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
              <div className="field">
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
              <div className="empty-state">Cargando…</div>
            ) : ventas.length === 0 ? (
              <div className="empty-state">No hay ventas con ese filtro.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Renglones</th>
                    <th>Forma de pago</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr
                      key={v.order_id}
                      className={`fila-venta ${v.cancelled_at ? 'fila-cancelada' : ''}`}
                      onClick={() => abrirDetalle(v.order_id)}
                    >
                      <td>#{v.order_id}</td>
                      <td>{fecha(v.created_at)}</td>
                      <td>{v.client_name ?? 'Público en General'}</td>
                      <td>{v.item_count}</td>
                      <td>{v.payment_method ? NOMBRE_FORMA_PAGO[v.payment_method] ?? v.payment_method : '—'}</td>
                      <td>{dinero(v.total_amount)}{v.cancelled_at ? ' (cancelada)' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside>
          {detalle ? (
            <div className="card panel-ticket">
              <div id="area-impresion">
                <Ticket ticket={detalle.ticket} />
              </div>
              <div className="panel-ticket-acciones">
                <button className="btn btn-primary" onClick={imprimirTicket}>Imprimir</button>
                {detalle.status !== 'CANCELADO' && (
                  <button className="btn btn-peligro-solido" onClick={cancelarVenta}>Cancelar venta</button>
                )}
              </div>
            </div>
          ) : (
            <div className="card empty-state empty-state-detalle">Elige una venta del listado para ver su detalle.</div>
          )}
        </aside>
      </div>
    </div>
  )
}
