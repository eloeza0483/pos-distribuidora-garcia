import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero } from '../lib/formato.js'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_ANCHO, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
  CLASE_MODAL_DETALLE, CLASE_MODAL_ACCIONES, CLASE_BTN, CLASE_BTN_GHOST,
  CLASE_BTN_ACCENT, CLASE_BTN_PRIMARY, CLASE_FIELD, CLASE_ERROR_BANNER
} from '../lib/clasesUi.js'

const FORMAS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo', tecla: '1' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta', tecla: '2' },
  { valor: 'transferencia', etiqueta: 'Transferencia', tecla: '3' }
]

const CLIENTE_POR_OMISION = 'Público en General'

const BILLETES = [
  { valor: 20, imagen: '/billetes/billete-20.png' },
  { valor: 50, imagen: '/billetes/billete-50.png' },
  { valor: 100, imagen: '/billetes/billete-100.png' },
  { valor: 200, imagen: '/billetes/billete-200.png' },
  { valor: 500, imagen: '/billetes/billete-500.png' },
  { valor: 1000, imagen: '/billetes/billete-1000.png' }
]

// El modal de cobro: reemplaza al useConfirmacion() genérico en el camino de
// venta porque necesita capturar forma de pago, efectivo/cambio y cliente —
// datos que la confirmación simple no soporta. Mismo contrato de teclado que
// Confirmacion.jsx (Enter cobra, Escape cancela).
export default function DialogoCobro({ abierto, resumen, onCancelar, onConfirmar, cobrando }) {
  const [formaPago, setFormaPago] = useState('efectivo')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [clientes, setClientes] = useState([])
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState(null)
  const inputEfectivo = useRef(null)

  useEffect(() => {
    if (!abierto) return
    setFormaPago('efectivo')
    setEfectivoRecibido('')
    setError(null)
    api.clients.list()
      .then((lista) => {
        setClientes(lista)
        const porOmision = lista.find((c) => c.client_name === CLIENTE_POR_OMISION)
        setClientId(String(porOmision?.id ?? lista[0]?.id ?? ''))
      })
      .catch((err) => setError(mensajeDeError(err)))
    const id = setTimeout(() => inputEfectivo.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [abierto])

  const total = resumen?.total ?? 0
  const cambio = formaPago === 'efectivo' && efectivoRecibido !== ''
    ? Math.round((Number(efectivoRecibido) - total) * 100) / 100
    : null
  const efectivoInsuficiente = formaPago === 'efectivo' && efectivoRecibido !== '' && Number(efectivoRecibido) < total
  const puedeCobrar = formaPago !== 'efectivo' || (efectivoRecibido !== '' && !efectivoInsuficiente)

  function agregarBillete(valor) {
    setEfectivoRecibido(String((Number(efectivoRecibido) || 0) + valor))
  }

  function confirmar() {
    if (!puedeCobrar || cobrando) return
    onConfirmar({
      payment_method: formaPago,
      cash_received: formaPago === 'efectivo' && efectivoRecibido !== '' ? Number(efectivoRecibido) : undefined,
      client_id: clientId ? Number(clientId) : undefined
    })
  }

  useEffect(() => {
    if (!abierto) return

    function alTeclear(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancelar()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmar()
        return
      }
      const activo = document.activeElement
      const enCampo = activo instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activo.tagName)
      if (enCampo) return
      const forma = FORMAS_PAGO.find((f) => f.tecla === e.key)
      if (forma) {
        e.preventDefault()
        setFormaPago(forma.valor)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, formaPago, efectivoRecibido, clientId, cobrando, puedeCobrar])

  if (!abierto) return null

  return (
    <div className={CLASE_MODAL_FONDO} onClick={onCancelar}>
      <div
        className={formaPago === 'efectivo' ? CLASE_MODAL_ANCHO : CLASE_MODAL}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobro-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cobro-titulo" className={CLASE_MODAL_TITULO}>Cobrar venta</h2>

        {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

        <div className={formaPago === 'efectivo' ? 'lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:items-start' : ''}>
          <div>
            <dl className={CLASE_MODAL_DETALLES}>
              <div className={CLASE_MODAL_DETALLE}>
                <dt className="text-text-muted">Renglones</dt>
                <dd className="m-0 font-semibold text-right">{resumen.renglones}</dd>
              </div>
              <div className={CLASE_MODAL_DETALLE}>
                <dt className="text-text-muted">Piezas</dt>
                <dd className="m-0 font-semibold text-right">{resumen.piezas}</dd>
              </div>
              <div className={CLASE_MODAL_DETALLE}>
                <dt className="text-text-muted">Total a cobrar</dt>
                <dd className="m-0 font-semibold text-right">{dinero(total)}</dd>
              </div>
            </dl>

            <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
              <label className="font-semibold text-text">Forma de pago</label>
              <div className="flex gap-2 flex-wrap lg:flex-col">
                {FORMAS_PAGO.map((f) => (
                  <button
                    key={f.valor}
                    type="button"
                    className={`${CLASE_BTN} flex-1 min-w-[100px] lg:w-full lg:text-left ${formaPago === f.valor ? CLASE_BTN_PRIMARY : CLASE_BTN_GHOST}`}
                    onClick={() => setFormaPago(f.valor)}
                  >
                    <span className="inline-block min-w-[1.1rem] opacity-70 text-[0.8rem] mr-[0.3rem]">{f.tecla}</span> {f.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
              <label htmlFor="cobro-cliente" className="font-semibold text-text">Cliente</label>
              <select id="cobro-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.client_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            {formaPago === 'efectivo' && (
              <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
                <div className="flex items-center justify-between">
                  <label htmlFor="cobro-efectivo" className="font-semibold text-text">Con cuánto paga</label>
                  {efectivoRecibido !== '' && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-text-muted hover:text-primary underline-offset-2 hover:underline"
                      onClick={() => setEfectivoRecibido('')}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <input
                  id="cobro-efectivo"
                  ref={inputEfectivo}
                  type="number"
                  min="0"
                  step="any"
                  value={efectivoRecibido}
                  onChange={(e) => setEfectivoRecibido(e.target.value)}
                />
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-2">
                  {BILLETES.map(({ valor, imagen }) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => agregarBillete(valor)}
                      aria-label={`Agregar billete de ${dinero(valor)}`}
                      className="group flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-1.5 cursor-pointer transition-[border-color,box-shadow,transform] duration-150 hover:border-primary hover:shadow-sm active:scale-95"
                    >
                      <img
                        src={imagen}
                        alt={`Billete de ${dinero(valor)}`}
                        className="w-full aspect-[2.85] object-cover object-center rounded-sm bg-bg"
                        draggable="false"
                      />
                      <span className="text-[0.7rem] font-semibold text-text-muted [font-variant-numeric:tabular-nums] group-hover:text-primary">
                        {dinero(valor)}
                      </span>
                    </button>
                  ))}
                </div>
                {efectivoRecibido !== '' && (
                  <p className={`m-0 mt-[0.4rem] text-[1.4rem] font-bold ${efectivoInsuficiente ? 'text-danger' : 'text-success'}`}>
                    {efectivoInsuficiente ? 'Falta ' + dinero(total - Number(efectivoRecibido)) : `Cambio: ${dinero(cambio)}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={CLASE_MODAL_ACCIONES}>
          <button className={CLASE_BTN_GHOST} onClick={onCancelar}>Cancelar</button>
          <button className={CLASE_BTN_ACCENT} disabled={!puedeCobrar || cobrando} onClick={confirmar}>
            {cobrando ? 'Cobrando…' : 'Sí, cobrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
