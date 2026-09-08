import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero, fecha } from '../lib/formato.js'
import DialogoAbono from '../components/DialogoAbono.jsx'
import ModalTicket from '../components/ModalTicket.jsx'
import {
  CLASE_CARD, CLASE_PAGE_TITLE, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE, CLASE_BTN_ACCENT
} from '../lib/clasesUi.js'

function diasDesde(fechaIso) {
  return Math.floor((Date.now() - new Date(fechaIso).getTime()) / (1000 * 60 * 60 * 24))
}

// El tablero de "cuánto me debe cada quien": el listado de Ventas agrupa por
// venta, no por cliente, así que no contesta esta pregunta. Cada fila se
// expande a las ventas pendientes de ese cliente para poder abonarles ahí
// mismo sin ir y venir a Ventas.
export default function PorCobrar() {
  const [deudores, setDeudores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [ventasPorCliente, setVentasPorCliente] = useState({})
  const [ventaParaAbonar, setVentaParaAbonar] = useState(null)
  const [reciboAbono, setReciboAbono] = useState(null)

  function cargarDeudores() {
    setCargando(true)
    setError(null)
    return api.clients.deudores()
      .then(setDeudores)
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    cargarDeudores()
  }, [])

  async function alternarExpandido(clientId) {
    if (expandido === clientId) {
      setExpandido(null)
      return
    }
    setExpandido(clientId)
    if (!ventasPorCliente[clientId]) {
      try {
        const ventas = await api.sales.list({ client_id: clientId, payment_status: 'CON_SALDO', sort: 'antigua' })
        setVentasPorCliente((prev) => ({ ...prev, [clientId]: ventas }))
      } catch (err) {
        setError(mensajeDeError(err))
      }
    }
  }

  async function alAbonar(resultado) {
    setVentaParaAbonar(null)
    setReciboAbono(resultado.ticket)
    await cargarDeudores()
    // Refresca las ventas pendientes del cliente ya expandido, si aplica.
    const clientId = Object.keys(ventasPorCliente).find((id) =>
      ventasPorCliente[id].some((v) => v.order_id === resultado.order_id))
    if (clientId) {
      const ventas = await api.sales.list({ client_id: Number(clientId), payment_status: 'CON_SALDO', sort: 'antigua' })
      setVentasPorCliente((prev) => ({ ...prev, [clientId]: ventas }))
    }
  }

  return (
    <div>
      <h1 className={CLASE_PAGE_TITLE}>Por cobrar</h1>

      {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

      <div className={CLASE_CARD}>
        {cargando ? (
          <div className={CLASE_EMPTY_STATE}>Cargando…</div>
        ) : deudores.length === 0 ? (
          <div className={CLASE_EMPTY_STATE}>No hay ventas pendientes por cobrar.</div>
        ) : (
          deudores.map((d) => {
            const dias = diasDesde(d.deuda_mas_antigua)
            const ventasCliente = ventasPorCliente[d.id]
            return (
              <div key={d.id} className="border-b border-border last:border-b-0">
                <div
                  className="flex items-center gap-3 py-3 cursor-pointer hover:bg-bg"
                  onClick={() => alternarExpandido(d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[0.95rem]">{d.client_name}</span>
                      {d.phone && (
                        <a
                          href={`tel:${d.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-primary hover:underline"
                        >
                          {d.phone}
                        </a>
                      )}
                    </div>
                    <p className="text-[0.85rem] text-text-muted mt-0.5">
                      {d.ventas} venta{d.ventas === 1 ? '' : 's'} pendiente{d.ventas === 1 ? '' : 's'}
                      {dias > 7 ? ` · la más vieja hace ${dias} días` : ''}
                    </p>
                  </div>
                  <span className="flex-none font-bold text-[1.1rem] text-[#8a5417]">{dinero(d.saldo)}</span>
                </div>

                {expandido === d.id && (
                  <div className="pb-3 pl-2">
                    {!ventasCliente ? (
                      <div className={CLASE_EMPTY_STATE}>Cargando ventas…</div>
                    ) : (
                      ventasCliente.map((v) => (
                        <div key={v.order_id} className="flex items-center gap-3 py-2 border-t border-border first:border-t-0">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-[0.88rem]">#{v.order_id}</span>
                            <span className="text-[0.82rem] text-text-muted ml-2">{fecha(v.created_at)} · Debe {dinero(v.saldo)}</span>
                          </div>
                          <button
                            className={`${CLASE_BTN_ACCENT} text-xs py-1 px-3`}
                            onClick={() => setVentaParaAbonar(v)}
                          >
                            Registrar abono
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <DialogoAbono
        abierto={!!ventaParaAbonar}
        venta={ventaParaAbonar}
        onCancelar={() => setVentaParaAbonar(null)}
        onAbonado={alAbonar}
      />
      <ModalTicket
        ticket={reciboAbono}
        titulo={reciboAbono ? `Abono registrado — venta #${reciboAbono.folio}` : undefined}
        onCerrar={() => setReciboAbono(null)}
      />
    </div>
  )
}
