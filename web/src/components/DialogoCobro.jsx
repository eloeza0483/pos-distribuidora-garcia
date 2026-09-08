import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero } from '../lib/formato.js'
import { esPunteroTactil } from '../lib/dispositivo.js'
import { MS_ENTRE_TECLAS } from '../hooks/useEscaner.js'
import { FORMAS_PAGO } from '../lib/formasPago.js'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_ANCHO, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
  CLASE_MODAL_DETALLE, CLASE_MODAL_ACCIONES, CLASE_BTN, CLASE_BTN_GHOST,
  CLASE_BTN_ACCENT, CLASE_BTN_PRIMARY, CLASE_FIELD, CLASE_ERROR_BANNER
} from '../lib/clasesUi.js'

const CLIENTE_POR_OMISION = 'Público en General'

const BILLETES = [
  { valor: 20, imagen: '/billetes/billete-20.png' },
  { valor: 50, imagen: '/billetes/billete-50.png' },
  { valor: 100, imagen: '/billetes/billete-100.png' },
  { valor: 200, imagen: '/billetes/billete-200.png' },
  { valor: 500, imagen: '/billetes/billete-500.png' },
  { valor: 1000, imagen: '/billetes/billete-1000.png' }
]

// No hay fotos de monedas en el proyecto; se dibujan como fichas circulares
// en vez de bloquear la función a que alguien consiga y recorte imágenes.
const MONEDAS = [10, 5, 2, 1]

const DENOMINACIONES = [...BILLETES.map((b) => b.valor), ...MONEDAS]
const DENOMINACIONES_DESC = [...DENOMINACIONES].sort((a, b) => b - a)

// Desglose "menos billetes posibles" (algoritmo goloso). Válido porque el
// sistema de denominaciones MXN (1,2,5,10,20,50,100,200,500,1000) es canónico:
// lo goloso siempre da el mínimo de piezas, no hace falta programación dinámica.
function desglosar(monto) {
  let restante = Math.floor(monto)
  const partes = []
  for (const valor of DENOMINACIONES_DESC) {
    if (restante < valor) continue
    const cantidad = Math.floor(restante / valor)
    partes.push({ valor, cantidad })
    restante -= cantidad * valor
  }
  return partes
}

function IconoDenominacion({ valor, chico = false }) {
  const billete = BILLETES.find((b) => b.valor === valor)
  if (billete) {
    return (
      <img
        src={billete.imagen}
        alt={`Billete de ${dinero(valor)}`}
        className={`${chico ? 'w-9 h-[1.35rem]' : 'w-full aspect-[2.85]'} object-cover object-center rounded-sm bg-bg`}
        draggable="false"
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`Moneda de ${dinero(valor)}`}
      className={`${chico ? 'w-6 h-6 text-[0.62rem]' : 'w-11 h-11 text-[0.85rem]'} shrink-0 inline-flex items-center justify-center rounded-full border-2 border-amber-600/50 bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900 font-bold [font-variant-numeric:tabular-nums]`}
    >
      {valor}
    </span>
  )
}

function ChipsDenominaciones({ partes }) {
  return (
    <div className="flex flex-wrap gap-2">
      {partes.map(({ valor, cantidad }) => (
        <div key={valor} className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1">
          <IconoDenominacion valor={valor} chico />
          <span className="text-xs font-semibold text-text-muted [font-variant-numeric:tabular-nums]">×{cantidad}</span>
        </div>
      ))}
    </div>
  )
}

// El modal de cobro: reemplaza al useConfirmacion() genérico en el camino de
// venta porque necesita capturar forma de pago, efectivo/cambio y cliente —
// datos que la confirmación simple no soporta. Mismo contrato de teclado que
// Confirmacion.jsx (Enter cobra, Escape cancela).
export default function DialogoCobro({ abierto, resumen, onCancelar, onConfirmar, cobrando, teclasVistas, escaneoEnCurso }) {
  const [formaPago, setFormaPago] = useState('efectivo')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  // Mientras esto sea false, el campo muestra el total como sugerencia (pago
  // exacto) y el primer billete que se toque reinicia el conteo desde cero
  // en vez de sumarse a esa sugerencia.
  const [billetesTocados, setBilletesTocados] = useState(false)
  const atajoPendiente = useRef(null)
  // Cuántas piezas de cada denominación tocó el usuario, solo para mostrar
  // "lo que llevas" — se limpia en cuanto edita el monto a mano.
  const [conteo, setConteo] = useState({})
  const [mostrarProductos, setMostrarProductos] = useState(false)
  const [clientes, setClientes] = useState([])
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState(null)
  const inputEfectivo = useRef(null)

  useEffect(() => {
    if (!abierto) return
    setFormaPago('efectivo')
    setEfectivoRecibido(resumen?.total ? String(resumen.total) : '')
    setBilletesTocados(false)
    setConteo({})
    setMostrarProductos(false)
    setError(null)
    api.clients.list()
      .then((lista) => {
        setClientes(lista)
        const porOmision = lista.find((c) => c.client_name === CLIENTE_POR_OMISION)
        setClientId(String(porOmision?.id ?? lista[0]?.id ?? ''))
      })
      .catch((err) => setError(mensajeDeError(err)))
    if (esPunteroTactil()) return
    const id = setTimeout(() => {
      inputEfectivo.current?.focus()
      inputEfectivo.current?.select()
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al abrir/cerrar, `resumen` cambia de referencia en cada render del padre
  }, [abierto])

  const total = resumen?.total ?? 0
  const cambio = formaPago === 'efectivo' && efectivoRecibido !== ''
    ? Math.round((Number(efectivoRecibido) - total) * 100) / 100
    : null
  const efectivoInsuficiente = formaPago === 'efectivo' && efectivoRecibido !== '' && Number(efectivoRecibido) < total
  const puedeCobrar = formaPago !== 'efectivo' || (efectivoRecibido !== '' && !efectivoInsuficiente)

  function agregarBillete(valor) {
    const base = billetesTocados ? Number(efectivoRecibido) || 0 : 0
    setEfectivoRecibido(String(Math.round((base + valor) * 100) / 100))
    setConteo((prev) => (billetesTocados ? { ...prev, [valor]: (prev[valor] || 0) + 1 } : { [valor]: 1 }))
    setBilletesTocados(true)
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
        // El Enter que cierra un código de barras no es una orden de cobrar:
        // si alguien escanea con el diálogo abierto, no se manda la venta.
        if (escaneoEnCurso?.()) return
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
        if (!teclasVistas) {
          setFormaPago(forma.valor)
          return
        }
        // Un escaneo con el diálogo abierto empieza por un dígito cualquiera:
        // se espera un instante y, si el lector siguió tecleando, la tecla no
        // era el atajo de forma de pago.
        const marca = teclasVistas()
        clearTimeout(atajoPendiente.current)
        atajoPendiente.current = setTimeout(() => {
          if (teclasVistas() === marca) setFormaPago(forma.valor)
        }, MS_ENTRE_TECLAS)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => {
      window.removeEventListener('keydown', alTeclear)
      clearTimeout(atajoPendiente.current)
    }
  }, [abierto, formaPago, efectivoRecibido, clientId, cobrando, puedeCobrar, teclasVistas, escaneoEnCurso])

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
                <dt className="text-text-muted">
                  {resumen.items?.length > 0 ? (
                    <button
                      type="button"
                      className="cursor-pointer bg-transparent border-none p-0 text-text-muted underline decoration-dotted underline-offset-2"
                      onClick={() => setMostrarProductos((v) => !v)}
                      aria-expanded={mostrarProductos}
                    >
                      Productos {mostrarProductos ? '▴' : '▾'}
                    </button>
                  ) : 'Renglones'}
                </dt>
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
              {cambio !== null && !efectivoInsuficiente && (
                <div className={CLASE_MODAL_DETALLE}>
                  <dt className="text-text-muted">Cambio a dar</dt>
                  <dd className="m-0 font-semibold text-right text-success">{dinero(cambio)}</dd>
                </div>
              )}
            </dl>

            {mostrarProductos && resumen.items?.length > 0 && (
              <div className="-mt-3 mb-4 rounded-lg bg-bg border border-border max-h-[9.5rem] overflow-y-auto">
                {resumen.items.map((item) => (
                  <div key={item.key} className="flex justify-between gap-3 px-[0.6rem] py-[0.35rem] text-[0.82rem] border-b border-border last:border-b-0">
                    <span className="min-w-0 truncate">
                      {item.product_name} <span className="text-text-muted">× {item.quantity} {item.unit_label}</span>
                    </span>
                    <span className="font-semibold whitespace-nowrap">{dinero(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {cambio > 0 && !efectivoInsuficiente && (
              <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
                <label className="font-semibold text-text">Entrega con menos billetes</label>
                <ChipsDenominaciones partes={desglosar(cambio)} />
                {Math.round((cambio % 1) * 100) > 0 && (
                  <p className="m-0 mt-1 text-xs text-text-muted">+ {dinero(cambio % 1)} sueltos</p>
                )}
              </div>
            )}

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
                      onClick={() => { setEfectivoRecibido(''); setBilletesTocados(true); setConteo({}) }}
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
                  onChange={(e) => { setEfectivoRecibido(e.target.value); setBilletesTocados(true); setConteo({}) }}
                />
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
                  {DENOMINACIONES.map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => agregarBillete(valor)}
                      aria-label={`Agregar ${BILLETES.some((b) => b.valor === valor) ? 'billete' : 'moneda'} de ${dinero(valor)}`}
                      className="group flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-1.5 cursor-pointer transition-[border-color,box-shadow,transform] duration-150 hover:border-primary hover:shadow-sm active:scale-95"
                    >
                      <IconoDenominacion valor={valor} />
                      <span className="text-[0.7rem] font-semibold text-text-muted [font-variant-numeric:tabular-nums] group-hover:text-primary">
                        {dinero(valor)}
                      </span>
                    </button>
                  ))}
                </div>
                {Object.values(conteo).some((c) => c > 0) && (
                  <div className="mt-3">
                    <p className="m-0 mb-1 text-xs font-semibold text-text-muted uppercase tracking-wide">Lo que llevas</p>
                    <ChipsDenominaciones
                      partes={Object.entries(conteo)
                        .filter(([, cantidad]) => cantidad > 0)
                        .map(([valor, cantidad]) => ({ valor: Number(valor), cantidad }))
                        .sort((a, b) => b.valor - a.valor)}
                    />
                  </div>
                )}
                {efectivoRecibido !== '' && (
                  <p className={`m-0 mt-[0.6rem] text-[1.4rem] font-bold ${efectivoInsuficiente ? 'text-danger' : 'text-success'}`}>
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
