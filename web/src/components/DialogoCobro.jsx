import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { dinero } from '../lib/formato.js'
import { esPunteroTactil } from '../lib/dispositivo.js'
import { MS_ENTRE_TECLAS } from '../hooks/useEscaner.js'
import { FORMAS_PAGO } from '../lib/formasPago.js'
import SelectorClienteModal from './SelectorClienteModal.jsx'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL_ANCHO, CLASE_MODAL_ANCHO_MEDIO, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
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

const MONEDAS = [
  { valor: 10, imagen: '/monedas/moneda-10.png' },
  { valor: 5, imagen: '/monedas/moneda-5.png' },
  { valor: 2, imagen: '/monedas/moneda-2.png' },
  { valor: 1, imagen: '/monedas/moneda-1.png' }
]

const DENOMINACIONES = [...BILLETES.map((b) => b.valor), ...MONEDAS.map((m) => m.valor)]
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

function partesDeConteo(conteo) {
  return Object.entries(conteo)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([valor, cantidad]) => ({ valor: Number(valor), cantidad }))
    .sort((a, b) => b.valor - a.valor)
}

function IconoDenominacion({ valor, chico = false }) {
  const billete = BILLETES.find((b) => b.valor === valor)
  const moneda = billete ? null : MONEDAS.find((m) => m.valor === valor)
  // Si la foto no carga (archivo faltante) se cae a la ficha dibujada, para que
  // el teclado nunca quede con huecos.
  const [sinImagen, setSinImagen] = useState(false)

  if ((billete || moneda) && !sinImagen) {
    return (
      <img
        src={(billete ?? moneda).imagen}
        alt={`${billete ? 'Billete' : 'Moneda'} de ${dinero(valor)}`}
        className={billete
          ? `${chico ? 'w-9 h-[1.35rem]' : 'w-full aspect-[2.85]'} object-cover object-center rounded-sm bg-bg`
          : `${chico ? 'w-6 h-6' : 'w-11 h-11'} shrink-0 object-contain`}
        draggable="false"
        onError={() => setSinImagen(true)}
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

function TecladoBilletes({ onTap }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5 mt-2">
      {DENOMINACIONES.map((valor) => (
        <button
          key={valor}
          type="button"
          onClick={() => onTap(valor)}
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
  )
}

function LoQueLlevas({ conteo }) {
  if (!Object.values(conteo).some((c) => c > 0)) return null
  return (
    <div className="mt-3">
      <p className="m-0 mb-1 text-xs font-semibold text-text-muted uppercase tracking-wide">Lo que llevas</p>
      <ChipsDenominaciones partes={partesDeConteo(conteo)} />
    </div>
  )
}

// El modal de cobro: reemplaza al useConfirmacion() genérico en el camino de
// venta porque necesita capturar forma de pago, efectivo/cambio y cliente —
// datos que la confirmación simple no soporta. Mismo contrato de teclado que
// Confirmacion.jsx (Enter cobra, Escape cancela).
//
// `modo` gobierna si se cobra de contado (como siempre) o se deja la venta
// pendiente/con abono parcial. En modo 'pago' el diálogo se ve y se comporta
// exactamente como antes — el modo 'credito' solo agrega campos, nunca quita
// ni cambia los del camino rápido de siempre.
export default function DialogoCobro({ abierto, resumen, onCancelar, onConfirmar, cobrando, teclasVistas, escaneoEnCurso }) {
  const [modo, setModo] = useState('pago')
  const [formaPago, setFormaPago] = useState('efectivo')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [montoAbono, setMontoAbono] = useState('')
  // Mientras esto sea false, el campo muestra el total como sugerencia (pago
  // exacto) y el primer billete que se toque reinicia el conteo desde cero
  // en vez de sumarse a esa sugerencia.
  const [billetesTocados, setBilletesTocados] = useState(false)
  const atajoPendiente = useRef(null)
  // Cuántas piezas de cada denominación tocó el usuario, solo para mostrar
  // "lo que llevas" — se limpia en cuanto edita el monto a mano o cambia de modo.
  const [conteo, setConteo] = useState({})
  const [clientes, setClientes] = useState([])
  const [clientId, setClientId] = useState('')
  const [modalClienteAbierto, setModalClienteAbierto] = useState(false)
  const [error, setError] = useState(null)
  const inputEfectivo = useRef(null)

  const modoCredito = modo === 'credito'

  function cambiarModo(nuevoModo) {
    setModo(nuevoModo)
    setConteo({})
    setBilletesTocados(false)
    if (nuevoModo === 'pago') setMontoAbono('')
    // Al pasar a crédito sin un cliente con nombre elegido todavía, el modal
    // de selección se abre solo — así no hay que buscar el botón aparte.
    if (nuevoModo === 'credito' && clienteEsPublicoGeneral) setModalClienteAbierto(true)
  }

  useEffect(() => {
    if (!abierto) return
    setModo('pago')
    setFormaPago('efectivo')
    setEfectivoRecibido(resumen?.total ? String(resumen.total) : '')
    setMontoAbono('')
    setBilletesTocados(false)
    setConteo({})
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

  const montoAbonoNum = montoAbono === '' ? 0 : Number(montoAbono)
  const abonoExcedeTotal = montoAbonoNum > total + 0.005
  const clienteSeleccionado = clientes.find((c) => String(c.id) === String(clientId))
  const clienteEsPublicoGeneral = !clienteSeleccionado || clienteSeleccionado.client_name === CLIENTE_POR_OMISION

  const puedeConfirmar = modoCredito
    ? !clienteEsPublicoGeneral && !abonoExcedeTotal
    : (formaPago !== 'efectivo' || (efectivoRecibido !== '' && !efectivoInsuficiente))

  // Alimenta el campo activo según el modo: "Con cuánto paga" en contado,
  // "Abono inicial" en crédito — el mismo teclado de billetes sirve para
  // ambos, cada uno construye su propio monto.
  function agregarBillete(valor) {
    const actual = modoCredito ? montoAbono : efectivoRecibido
    const setter = modoCredito ? setMontoAbono : setEfectivoRecibido
    const base = billetesTocados ? Number(actual) || 0 : 0
    setter(String(Math.round((base + valor) * 100) / 100))
    setConteo((prev) => (billetesTocados ? { ...prev, [valor]: (prev[valor] || 0) + 1 } : { [valor]: 1 }))
    setBilletesTocados(true)
  }

  function confirmar() {
    if (!puedeConfirmar || cobrando) return
    if (modoCredito) {
      onConfirmar({
        payment_method: formaPago,
        cash_received: montoAbonoNum > 0 && formaPago === 'efectivo' ? montoAbonoNum : undefined,
        client_id: clientId ? Number(clientId) : undefined,
        amount_paid: montoAbonoNum
      })
      return
    }
    onConfirmar({
      payment_method: formaPago,
      cash_received: formaPago === 'efectivo' && efectivoRecibido !== '' ? Number(efectivoRecibido) : undefined,
      client_id: clientId ? Number(clientId) : undefined
    })
  }

  useEffect(() => {
    if (!abierto) return

    function alTeclear(e) {
      // Mientras el selector de cliente está abierto encima, sus propios
      // atajos (Escape para cerrarlo) mandan — este listener se hace a un
      // lado para no cerrar también el diálogo de cobro de fondo.
      if (modalClienteAbierto) return
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
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault()
        cambiarModo(modoCredito ? 'pago' : 'credito')
        return
      }
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
  }, [abierto, modo, formaPago, efectivoRecibido, montoAbono, clientId, cobrando, puedeConfirmar, teclasVistas, escaneoEnCurso, modalClienteAbierto])

  if (!abierto) return null

  return (
    <>
    <div className={CLASE_MODAL_FONDO} onClick={onCancelar}>
      <div
        className={`${formaPago === 'efectivo' ? `${CLASE_MODAL_ANCHO} xl:max-w-[1200px]` : CLASE_MODAL_ANCHO_MEDIO} max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobro-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-[0.9rem]">
          <h2 id="cobro-titulo" className={`${CLASE_MODAL_TITULO} mb-0`}>{modoCredito ? 'Dejar venta pendiente' : 'Cobrar venta'}</h2>
          <div className="sm:w-[260px] sm:shrink-0">
            <button
              type="button"
              className={`${CLASE_BTN_GHOST} w-full text-left truncate`}
              onClick={() => setModalClienteAbierto(true)}
            >
              {clienteSeleccionado?.client_name ?? CLIENTE_POR_OMISION}
              {clienteSeleccionado?.saldo > 0 ? ` — debe ${dinero(clienteSeleccionado.saldo)}` : ''}
            </button>
            {modoCredito && clienteEsPublicoGeneral && (
              <p className="m-0 mt-1 text-xs text-danger">Elige o crea un cliente con nombre — no se le puede fiar a "Público en General".</p>
            )}
          </div>
        </div>

        {error && <div className={`${CLASE_ERROR_BANNER} shrink-0`}>{error}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto scroll-fina">
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 lg:items-stretch lg:h-full">
        {resumen.items?.length > 0 && (
          <div className="mb-4 lg:mb-0 flex flex-col rounded-lg bg-bg border border-border overflow-hidden lg:h-full min-w-0">
            <div className="shrink-0 flex justify-between gap-3 px-[0.9rem] py-2 border-b border-border">
              <span className="text-[0.8rem] font-semibold text-text-muted uppercase tracking-wide">Productos</span>
              <span className="text-[0.8rem] font-semibold text-text-muted whitespace-nowrap">
                {resumen.renglones} artículo{resumen.renglones === 1 ? '' : 's'} · {resumen.piezas} pza{resumen.piezas === 1 ? '' : 's'}
              </span>
            </div>
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-fina">
              {resumen.items.map((item) => (
                <div key={item.key} className="px-[0.9rem] py-[0.4rem] text-[0.85rem] border-b border-border last:border-b-0">
                  <p className="m-0 truncate font-medium">{item.product_name}</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-text-muted whitespace-nowrap">× {item.quantity} {item.unit_label}</span>
                    <span className="font-semibold whitespace-nowrap">{dinero(item.unit_price * item.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`${formaPago === 'efectivo' ? 'lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:items-start' : ''} min-w-0 lg:h-full`}>
          <div>
            <dl className={CLASE_MODAL_DETALLES}>
              <div className="py-[0.28rem]">
                <dt className="text-[0.72rem] font-semibold text-text-muted uppercase tracking-wide">Total a cobrar</dt>
                <dd className="m-0 text-[1.9rem] leading-tight font-bold [font-variant-numeric:tabular-nums]">{dinero(total)}</dd>
              </div>
              {!modoCredito && cambio !== null && !efectivoInsuficiente && (
                <div className={CLASE_MODAL_DETALLE}>
                  <dt className="text-text-muted">Cambio a dar</dt>
                  <dd className="m-0 font-semibold text-right text-success">{dinero(cambio)}</dd>
                </div>
              )}
              {modoCredito && (
                <div className={CLASE_MODAL_DETALLE}>
                  <dt className="text-text-muted">Queda pendiente</dt>
                  <dd className="m-0 font-semibold text-right text-[#8a5417]">{dinero(Math.max(0, total - montoAbonoNum))}</dd>
                </div>
              )}
            </dl>

            {!modoCredito && cambio > 0 && !efectivoInsuficiente && (
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

          </div>

          <div>
            {!modoCredito && formaPago === 'efectivo' && (
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
                  className="!py-[0.7rem] !text-[1.15rem]"
                  type="number"
                  min="0"
                  step="any"
                  value={efectivoRecibido}
                  onChange={(e) => { setEfectivoRecibido(e.target.value); setBilletesTocados(true); setConteo({}) }}
                />
                <TecladoBilletes onTap={agregarBillete} />
                <LoQueLlevas conteo={conteo} />
                {efectivoRecibido !== '' && (
                  <p className={`m-0 mt-[0.6rem] text-[1.4rem] font-bold ${efectivoInsuficiente ? 'text-danger' : 'text-success'}`}>
                    {efectivoInsuficiente ? 'Falta ' + dinero(total - Number(efectivoRecibido)) : `Cambio: ${dinero(cambio)}`}
                  </p>
                )}
              </div>
            )}

            {modoCredito && (
              <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
                <div className="flex items-center justify-between">
                  <label htmlFor="cobro-abono" className="font-semibold text-text">Abono inicial</label>
                  {montoAbono !== '' && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-text-muted hover:text-primary underline-offset-2 hover:underline"
                      onClick={() => { setMontoAbono(''); setBilletesTocados(true); setConteo({}) }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <input
                  id="cobro-abono"
                  className="!py-[0.7rem] !text-[1.15rem]"
                  type="number"
                  min="0"
                  max={total}
                  step="any"
                  placeholder="0 = queda pendiente completa"
                  value={montoAbono}
                  onChange={(e) => { setMontoAbono(e.target.value); setBilletesTocados(true); setConteo({}) }}
                />
                {formaPago === 'efectivo' && <TecladoBilletes onTap={agregarBillete} />}
                <LoQueLlevas conteo={conteo} />
                {abonoExcedeTotal && (
                  <p className="m-0 mt-[0.6rem] text-sm font-semibold text-danger">El abono no puede ser mayor al total.</p>
                )}
                {!abonoExcedeTotal && montoAbonoNum > 0 && (
                  <p className="m-0 mt-[0.6rem] text-[1.4rem] font-bold text-[#8a5417]">
                    Saldo pendiente: {dinero(total - montoAbonoNum)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
        </div>

        <div className={`${CLASE_MODAL_ACCIONES} shrink-0 border-t border-border pt-4`}>
          <button className={CLASE_BTN_GHOST} onClick={onCancelar}>Cancelar</button>
          <button className={CLASE_BTN_GHOST} onClick={() => cambiarModo(modoCredito ? 'pago' : 'credito')}>
            {modoCredito ? 'Cobro de contado (P)' : 'Dejar pendiente (P)'}
          </button>
          <button className={CLASE_BTN_ACCENT} disabled={!puedeConfirmar || cobrando} onClick={confirmar}>
            {cobrando ? (modoCredito ? 'Guardando…' : 'Cobrando…') : (modoCredito ? 'Guardar pendiente' : 'Sí, cobrar')}
          </button>
        </div>
      </div>
    </div>

    <SelectorClienteModal
      abierto={modalClienteAbierto}
      clientes={clientes}
      onSeleccionar={(cliente) => { setClientId(String(cliente.id)); setModalClienteAbierto(false) }}
      onCrear={async (nombre, telefono) => {
        const cliente = await api.clients.create({ client_name: nombre, phone: telefono || undefined })
        setClientes((prev) => [...prev, cliente].sort((a, b) => a.client_name.localeCompare(b.client_name)))
        return cliente
      }}
      onCerrar={() => setModalClienteAbierto(false)}
    />
    </>
  )
}
