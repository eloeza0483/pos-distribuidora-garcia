import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero } from '../lib/formato.js'
import { FORMAS_PAGO } from '../lib/formasPago.js'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
  CLASE_MODAL_DETALLE, CLASE_MODAL_ACCIONES, CLASE_BTN, CLASE_BTN_GHOST,
  CLASE_BTN_ACCENT, CLASE_BTN_PRIMARY, CLASE_FIELD, CLASE_ERROR_BANNER
} from '../lib/clasesUi.js'

function nuevaClaveIdempotencia() {
  return crypto.randomUUID()
}

// Registra un abono a una venta pendiente/parcial ya existente. Mismo
// contrato de teclado que DialogoCobro (Enter confirma, Escape cancela,
// 1/2/3 eligen forma de pago) pero sin la protección contra la pistola de
// códigos de barras: este diálogo se abre desde Ventas, no desde el
// Mostrador con el lector activo.
export default function DialogoAbono({ abierto, venta, onCancelar, onAbonado }) {
  const [monto, setMonto] = useState('')
  const [formaPago, setFormaPago] = useState('efectivo')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [abonando, setAbonando] = useState(false)
  const [error, setError] = useState(null)
  const claveIdempotencia = useRef(nuevaClaveIdempotencia())
  const inputMonto = useRef(null)

  const saldo = venta?.saldo ?? 0

  useEffect(() => {
    if (!abierto) return
    setMonto(saldo ? String(saldo) : '')
    setFormaPago('efectivo')
    setEfectivoRecibido('')
    setError(null)
    claveIdempotencia.current = nuevaClaveIdempotencia()
    const id = setTimeout(() => {
      inputMonto.current?.focus()
      inputMonto.current?.select()
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al abrir/cerrar
  }, [abierto])

  const montoNum = monto === '' ? 0 : Number(monto)
  const excedeSaldo = montoNum > saldo + 0.005
  // Dejar "Con cuánto paga" en blanco significa "paga exacto" (el campo
  // muestra el monto del abono como placeholder) — igual de vacío no cuenta
  // como "sin llenar": se resuelve al monto del abono, no a 0.
  const cashRecibido = efectivoRecibido === '' ? montoNum : Number(efectivoRecibido)
  const cambio = formaPago === 'efectivo'
    ? Math.round((cashRecibido - montoNum) * 100) / 100
    : null
  const efectivoInsuficiente = formaPago === 'efectivo' && cashRecibido < montoNum
  const puedeConfirmar = montoNum > 0 && !excedeSaldo && (formaPago !== 'efectivo' || !efectivoInsuficiente)

  async function confirmar() {
    if (!puedeConfirmar || abonando) return
    setAbonando(true)
    setError(null)
    try {
      const resultado = await api.sales.registrarAbono(
        venta.order_id,
        {
          amount: montoNum,
          payment_method: formaPago,
          cash_received: formaPago === 'efectivo' ? cashRecibido : undefined
        },
        claveIdempotencia.current
      )
      claveIdempotencia.current = nuevaClaveIdempotencia()
      onAbonado(resultado)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setAbonando(false)
    }
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
  }, [abierto, monto, formaPago, efectivoRecibido, abonando, puedeConfirmar]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!abierto || !venta) return null

  return (
    <div className={CLASE_MODAL_FONDO} onClick={onCancelar}>
      <div className={CLASE_MODAL} role="dialog" aria-modal="true" aria-labelledby="abono-titulo" onClick={(e) => e.stopPropagation()}>
        <h2 id="abono-titulo" className={CLASE_MODAL_TITULO}>Registrar abono — venta #{venta.order_id}</h2>

        {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

        <dl className={CLASE_MODAL_DETALLES}>
          <div className={CLASE_MODAL_DETALLE}>
            <dt className="text-text-muted">Saldo pendiente</dt>
            <dd className="m-0 font-bold text-right text-[1.15rem] text-[#8a5417]">{dinero(saldo)}</dd>
          </div>
          {cambio !== null && !efectivoInsuficiente && (
            <div className={CLASE_MODAL_DETALLE}>
              <dt className="text-text-muted">Cambio a dar</dt>
              <dd className="m-0 font-semibold text-right text-success">{dinero(cambio)}</dd>
            </div>
          )}
        </dl>

        <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
          <div className="flex items-center justify-between">
            <label htmlFor="abono-monto" className="font-semibold text-text">Monto del abono</label>
            <div className="flex gap-3">
              <button type="button" className="text-xs font-semibold text-text-muted hover:text-primary underline-offset-2 hover:underline" onClick={() => setMonto(String(Math.round((saldo / 2) * 100) / 100))}>
                Mitad
              </button>
              <button type="button" className="text-xs font-semibold text-text-muted hover:text-primary underline-offset-2 hover:underline" onClick={() => setMonto(String(saldo))}>
                Saldo completo
              </button>
            </div>
          </div>
          <input
            id="abono-monto"
            ref={inputMonto}
            type="number"
            min="0"
            max={saldo}
            step="any"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
          {excedeSaldo && <p className="m-0 mt-1 text-xs font-semibold text-danger">El abono no puede ser mayor al saldo.</p>}
        </div>

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
            <label htmlFor="abono-efectivo" className="font-semibold text-text">Con cuánto paga</label>
            <input
              id="abono-efectivo"
              type="number"
              min="0"
              step="any"
              placeholder={monto || '0'}
              value={efectivoRecibido}
              onChange={(e) => setEfectivoRecibido(e.target.value)}
            />
            {efectivoRecibido !== '' && (
              <p className={`m-0 mt-[0.6rem] text-[1.2rem] font-bold ${efectivoInsuficiente ? 'text-danger' : 'text-success'}`}>
                {efectivoInsuficiente ? 'Falta ' + dinero(montoNum - Number(efectivoRecibido)) : `Cambio: ${dinero(cambio)}`}
              </p>
            )}
          </div>
        )}

        <div className={CLASE_MODAL_ACCIONES}>
          <button className={CLASE_BTN_GHOST} onClick={onCancelar}>Cancelar</button>
          <button className={CLASE_BTN_ACCENT} disabled={!puedeConfirmar || abonando} onClick={confirmar}>
            {abonando ? 'Guardando…' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  )
}
