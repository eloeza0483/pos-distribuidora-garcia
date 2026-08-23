import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero } from '../lib/formato.js'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
  CLASE_MODAL_DETALLE, CLASE_MODAL_ACCIONES, CLASE_BTN, CLASE_BTN_GHOST,
  CLASE_BTN_ACCENT, CLASE_BTN_PRIMARY, CLASE_FIELD, CLASE_ERROR_BANNER
} from '../lib/clasesUi.js'

const FORMAS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo', tecla: '1' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta', tecla: '2' },
  { valor: 'transferencia', etiqueta: 'Transferencia', tecla: '3' }
]

const CLIENTE_POR_OMISION = 'Público en General'

const BILLETES = [20, 50, 100, 200, 500, 1000]

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
        className={CLASE_MODAL}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobro-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cobro-titulo" className={CLASE_MODAL_TITULO}>Cobrar venta</h2>

        {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

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
          <div className="flex gap-2 flex-wrap">
            {FORMAS_PAGO.map((f) => (
              <button
                key={f.valor}
                type="button"
                className={`${CLASE_BTN} flex-1 min-w-[100px] ${formaPago === f.valor ? CLASE_BTN_PRIMARY : CLASE_BTN_GHOST}`}
                onClick={() => setFormaPago(f.valor)}
              >
                <span className="inline-block min-w-[1.1rem] opacity-70 text-[0.8rem] mr-[0.3rem]">{f.tecla}</span> {f.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {formaPago === 'efectivo' && (
          <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
            <label htmlFor="cobro-efectivo" className="font-semibold text-text">Con cuánto paga</label>
            <input
              id="cobro-efectivo"
              ref={inputEfectivo}
              type="number"
              min="0"
              step="any"
              value={efectivoRecibido}
              onChange={(e) => setEfectivoRecibido(e.target.value)}
            />
            <div className="flex gap-[0.4rem] flex-wrap mt-2">
              {BILLETES.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className={`${CLASE_BTN_GHOST} flex-1 min-w-[72px] py-[0.4rem] px-[0.5rem] [font-variant-numeric:tabular-nums]`}
                  onClick={() => agregarBillete(valor)}
                >
                  +{dinero(valor)}
                </button>
              ))}
              {efectivoRecibido !== '' && (
                <button
                  type="button"
                  className={`${CLASE_BTN_GHOST} flex-1 min-w-[72px] py-[0.4rem] px-[0.5rem] [font-variant-numeric:tabular-nums]`}
                  onClick={() => setEfectivoRecibido('')}
                >
                  Limpiar
                </button>
              )}
            </div>
            {efectivoRecibido !== '' && (
              <p className={`m-0 mt-[0.4rem] text-[1.4rem] font-bold ${efectivoInsuficiente ? 'text-danger' : 'text-success'}`}>
                {efectivoInsuficiente ? 'Falta ' + dinero(total - Number(efectivoRecibido)) : `Cambio: ${dinero(cambio)}`}
              </p>
            )}
          </div>
        )}

        <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
          <label htmlFor="cobro-cliente" className="font-semibold text-text">Cliente</label>
          <select id="cobro-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.client_name}</option>
            ))}
          </select>
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
