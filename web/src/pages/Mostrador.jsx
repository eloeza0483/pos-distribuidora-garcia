import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, urlDeImagen } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import DialogoCobro from '../components/DialogoCobro.jsx'
import Ticket from '../components/Ticket.jsx'
import { imprimirTicket } from '../lib/imprimir.js'
import { dinero } from '../lib/formato.js'
import {
  CLASE_PAGE_TITLE, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE, CLASE_CARD, CLASE_AYUDA,
  CLASE_SECCION_TITULO, CLASE_BTN_PRIMARY, CLASE_BTN_ACCENT, CLASE_BTN_DANGER,
  CLASE_FOTO, CLASE_FOTO_VACIA, CLASE_PANEL_TICKET, CLASE_PANEL_TICKET_ACCIONES,
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_CERRAR
} from '../lib/clasesUi.js'

function nuevaClaveIdempotencia() {
  return crypto.randomUUID()
}

function Foto({ imagePath, alt }) {
  const url = urlDeImagen(imagePath)
  if (!url) return <div className={CLASE_FOTO_VACIA} aria-hidden="true">📦</div>
  return <img className={CLASE_FOTO} src={url} alt={alt} />
}

// Las primeras 9 tarjetas de "Más vendidos" tienen atajo de teclado (1-9).
const TECLAS_ATAJO = 9

export default function Mostrador() {
  const [codigo, setCodigo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [categorias, setCategorias] = useState([])
  const [resultados, setResultados] = useState([])
  const [populares, setPopulares] = useState([])
  const [carrito, setCarrito] = useState([])
  const [error, setError] = useState(null)
  const [cobrando, setCobrando] = useState(false)
  const [dialogoCobroAbierto, setDialogoCobroAbierto] = useState(false)
  const [ticket, setTicket] = useState(null)
  const [yaImprimio, setYaImprimio] = useState(false)
  const inputCodigo = useRef(null)
  const claveIdempotencia = useRef(nuevaClaveIdempotencia())
  // Recuerda si la última interacción de puntero fue con el dedo, para no
  // regresar el foco al código de barras al tocar una tarjeta: eso abre el
  // teclado en pantalla en tablets, algo que solo estorba porque ahí no hay
  // un lector físico escribiendo en ese campo.
  const ultimoPunteroEsTouch = useRef(false)

  const total = carrito.reduce((suma, item) => suma + item.unit_price * item.quantity, 0)

  useEffect(() => {
    inputCodigo.current?.focus()
    api.products.populares({ limit: 16, days: 30 })
      .then(setPopulares)
      .catch((err) => setError(mensajeDeError(err)))
    api.categories.list()
      .then(setCategorias)
      .catch((err) => setError(mensajeDeError(err)))
  }, [])

  // Catálogo completo (con filtro por nombre/precio y categoría). Se vuelve a
  // pedir con cada cambio, con un respiro para no pegarle al servidor en cada
  // tecla. La búsqueda del backend cubre nombre, alias, código y precio.
  useEffect(() => {
    const termino = busqueda.trim()
    const id = setTimeout(() => {
      api.products.list(termino || undefined, categoriaId || undefined)
        .then(setResultados)
        .catch((err) => setError(mensajeDeError(err)))
    }, 250)
    return () => clearTimeout(id)
  }, [busqueda, categoriaId])

  const agregarAlCarrito = useCallback(({ product_id, product_name, image_path, unit }) => {
    setTicket(null)
    setYaImprimio(false)
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.unit_id === unit.id)
      if (idx >= 0) {
        const copia = [...prev]
        copia[idx] = { ...copia[idx], quantity: copia[idx].quantity + 1 }
        return copia
      }
      return [...prev, {
        key: `${product_id}-${unit.id}`,
        product_id,
        product_name,
        image_path,
        unit_id: unit.id,
        unit_label: unit.unit_label,
        unit_price: Number(unit.price),
        quantity: 1
      }]
    })
  }, [])

  // Campo de código vacío: Enter (o Espacio) ya no tiene nada que buscar, así
  // que se interpreta como "terminé de escanear, cobra".
  async function alEscanear(e) {
    e.preventDefault()
    const valor = codigo.trim()
    if (!valor) {
      cobrar()
      return
    }
    setError(null)
    try {
      const encontrado = await api.scan(valor)
      agregarAlCarrito({
        product_id: encontrado.product_id,
        product_name: encontrado.product_name,
        image_path: encontrado.image_path,
        unit: {
          id: encontrado.unit_id,
          unit_label: encontrado.unit_label,
          price: encontrado.price
        }
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(`El código ${valor} no está registrado. Búscalo por nombre abajo o captúralo en Productos.`)
      } else {
        setError(mensajeDeError(err))
      }
    } finally {
      setCodigo('')
    }
  }

  // Al elegir a mano se agrega con la presentación de venta normal; la unidad
  // se puede cambiar después en el propio renglón del carrito. Al usar un
  // atajo de teclado no se regresa el foco al código de barras, para poder
  // encadenar varios números seguidos sin que se cuelen en ese campo.
  function agregarProducto(producto, { refocus = true } = {}) {
    const unidad = (producto.units ?? []).find((u) => u.is_default) ?? producto.units?.[0]
    if (!unidad) {
      setError(`${producto.product_name} no tiene ninguna presentación configurada.`)
      return
    }
    setError(null)
    agregarAlCarrito({
      product_id: producto.id,
      product_name: producto.product_name,
      image_path: producto.image_path,
      unit: unidad
    })
    if (refocus && !ultimoPunteroEsTouch.current) inputCodigo.current?.focus()
  }

  function alTocarTarjeta(e) {
    ultimoPunteroEsTouch.current = e.pointerType === 'touch'
  }

  function cambiarCantidad(key, quantity) {
    if (quantity <= 0) {
      setCarrito((prev) => prev.filter((i) => i.key !== key))
      return
    }
    setCarrito((prev) => prev.map((i) => (i.key === key ? { ...i, quantity } : i)))
  }

  // Cambiar de presentación cambia precio Y unit_id. El servidor revalida el
  // precio contra la base, así que el renglón debe quedar coherente.
  async function cambiarUnidad(item, nuevaUnidadId) {
    try {
      const producto = await api.products.get(item.product_id)
      const unidad = producto.units.find((u) => u.id === Number(nuevaUnidadId))
      if (!unidad) return

      setCarrito((prev) => {
        const sinEste = prev.filter((i) => i.key !== item.key)
        const yaExiste = sinEste.find((i) => i.unit_id === unidad.id)
        if (yaExiste) {
          return sinEste.map((i) =>
            i.unit_id === unidad.id ? { ...i, quantity: i.quantity + item.quantity } : i
          )
        }
        return [...sinEste, {
          ...item,
          key: `${item.product_id}-${unidad.id}`,
          unit_id: unidad.id,
          unit_label: unidad.unit_label,
          unit_price: Number(unidad.price)
        }]
      })
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  function quitar(key) {
    setCarrito((prev) => prev.filter((i) => i.key !== key))
  }

  // Los tres orígenes posibles (botón, Enter/Espacio, y el propio diálogo
  // reintentando) comparten esta guarda para no abrir dos diálogos ni mandar
  // la venta dos veces.
  function cobrar() {
    if (carrito.length === 0 || cobrando || dialogoCobroAbierto) return
    setDialogoCobroAbierto(true)
  }

  function cancelarCobro() {
    if (cobrando) return
    setDialogoCobroAbierto(false)
  }

  async function confirmarCobro({ payment_method, cash_received, client_id }) {
    setCobrando(true)
    setError(null)
    try {
      const resultado = await api.sales.create(
        {
          items: carrito.map((i) => ({
            product_id: i.product_id,
            unit_label: i.unit_label,
            quantity: i.quantity,
            unit_price: i.unit_price
          })),
          payment_method,
          cash_received,
          client_id
        },
        claveIdempotencia.current
      )
      setTicket(resultado.ticket)
      setCarrito([])
      claveIdempotencia.current = nuevaClaveIdempotencia()
      setDialogoCobroAbierto(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCobrando(false)
      inputCodigo.current?.focus()
    }
  }

  // Atajos de teclado para operar sin mouse: 1-9 agregan el producto en esa
  // posición de "Más vendidos"; Enter o Espacio cobran. Se ignoran mientras se
  // está escribiendo en un campo (para no chocar con el escaneo, que también
  // llega por teclado) o mientras hay una confirmación abierta (que ya tiene
  // sus propios atajos de Enter/Escape).
  useEffect(() => {
    function alTecla(e) {
      if (e.key === 'Escape' && ticket) {
        e.preventDefault()
        setTicket(null)
        return
      }
      if (dialogoCobroAbierto) return

      const activo = document.activeElement
      const enCampo = activo instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activo.tagName)
      const enBoton = activo instanceof HTMLElement && activo.tagName === 'BUTTON'

      if ((e.key === ' ' || e.key === 'Enter') && !enCampo && !enBoton) {
        e.preventDefault()
        cobrar()
        return
      }

      if (enCampo) return
      if (/^[1-9]$/.test(e.key)) {
        const producto = populares[Number(e.key) - 1]
        if (!producto) return
        e.preventDefault()
        agregarProducto(producto, { refocus: false })
      }
    }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [populares, carrito, cobrando, dialogoCobroAbierto, ticket])

  return (
    <div>
      <h1 className={CLASE_PAGE_TITLE}>Mostrador</h1>

      {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}

      {ticket && (
        <div className={CLASE_MODAL_FONDO} onClick={() => setTicket(null)}>
          <div
            className={`${CLASE_MODAL} relative max-w-[480px] max-h-[85vh] overflow-y-auto`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={CLASE_MODAL_CERRAR}
              aria-label="Cerrar"
              onClick={() => setTicket(null)}
            >
              ×
            </button>
            <p id="ticket-titulo" className={`${CLASE_SECCION_TITULO} m-0`}>Venta #{ticket.folio} cobrada</p>
            <div className={CLASE_PANEL_TICKET}>
              <div id="area-impresion">
                <Ticket ticket={ticket} />
              </div>
              <div className={CLASE_PANEL_TICKET_ACCIONES}>
                <button className={CLASE_BTN_PRIMARY} onClick={() => { imprimirTicket(ticket.ancho_mm); setYaImprimio(true) }}>
                  {yaImprimio ? 'Imprimir de nuevo' : 'Imprimir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_400px] gap-5 items-start max-[900px]:grid-cols-1">
        <div className="min-w-0 flex flex-col gap-4">
          <form onSubmit={alEscanear} className={`${CLASE_CARD} flex gap-[0.6rem]`}>
            <input
              ref={inputCodigo}
              type="text"
              className="py-[0.9rem] px-4 text-[1.1rem]"
              placeholder="Escanea el código de barras (o captúralo y presiona Enter)"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === ' ' && codigo.trim() === '') {
                  e.preventDefault()
                  cobrar()
                }
              }}
            />
            <button type="submit" className={`${CLASE_BTN_PRIMARY} px-6 text-base`}>Agregar</button>
          </form>

          <div className={CLASE_CARD}>
            <p className={CLASE_SECCION_TITULO}>Más vendidos</p>
            <p className={`${CLASE_AYUDA} -mt-[0.4rem] mb-[0.8rem]`}>
              Atajos: teclas 1–9 agregan estos productos · Enter o Espacio cobra la venta
            </p>
            {populares.length === 0 ? (
              <div className={CLASE_EMPTY_STATE}>Todavía no hay historial de ventas.</div>
            ) : (
              <div className="grid [grid-auto-flow:column] [grid-template-rows:repeat(2,auto)] [grid-auto-columns:160px] gap-[0.7rem] overflow-x-auto pt-[0.3rem] px-[0.2rem] pb-[0.6rem]">
                {populares.map((p, i) => {
                  const unidad = (p.units ?? []).find((u) => u.is_default) ?? p.units?.[0]
                  return (
                    <button
                      key={p.id}
                      className="w-40 relative flex items-center gap-[0.6rem] text-left p-[0.6rem] border border-border rounded-[10px] bg-surface cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-sm"
                      onPointerDown={alTocarTarjeta}
                      onClick={() => agregarProducto(p)}
                    >
                      {i < TECLAS_ATAJO && (
                        <span
                          className="absolute -top-2 -left-2 min-w-[22px] h-[22px] px-[5px] rounded-[6px] bg-primary text-white text-xs font-bold flex items-center justify-center shadow-sm border-2 border-surface"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                      )}
                      <Foto imagePath={p.image_path} alt={p.product_name} />
                      <span>
                        <span className="text-[0.82rem] font-semibold leading-[1.25]">{p.product_name}</span>
                        <br />
                        <span className="text-[0.82rem] text-primary font-bold">{dinero(unidad?.price)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className={CLASE_CARD}>
            <p className={CLASE_SECCION_TITULO}>Todos los productos</p>
            <div className="flex gap-[0.6rem] mb-[0.9rem]">
              <input
                type="search"
                placeholder="Buscar por nombre o precio…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="flex-1"
              />
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="max-w-[220px]"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {resultados.length === 0 ? (
              <div className={CLASE_EMPTY_STATE}>
                {busqueda.trim() || categoriaId ? 'Ningún producto coincide con ese filtro.' : 'Todavía no hay productos capturados.'}
              </div>
            ) : (
              <div className="grid gap-[0.7rem] [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
                {resultados.map((p) => {
                  const unidad = (p.units ?? []).find((u) => u.is_default) ?? p.units?.[0]
                  return (
                    <button
                      key={p.id}
                      className="relative flex items-center gap-[0.6rem] text-left p-[0.6rem] border border-border rounded-[10px] bg-surface cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-sm"
                      onPointerDown={alTocarTarjeta}
                      onClick={() => agregarProducto(p)}
                    >
                      <Foto imagePath={p.image_path} alt={p.product_name} />
                      <span>
                        <span className="text-[0.82rem] font-semibold leading-[1.25]">{p.product_name}</span>
                        <br />
                        <span className="text-[0.82rem] text-primary font-bold">{dinero(unidad?.price)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="sticky top-4 max-[900px]:static">
          <div className={`${CLASE_CARD} flex flex-col max-h-[calc(100vh-7rem)] max-[900px]:max-h-none`}>
            <p className={CLASE_SECCION_TITULO}>Venta actual</p>
            {carrito.length === 0 ? (
              <div className={CLASE_EMPTY_STATE}>Escanea o elige un producto para empezar la venta.</div>
            ) : (
              <div className="flex-1 overflow-y-auto -mx-2 px-2 max-[900px]:overflow-y-visible">
                {carrito.map((item) => (
                  <RenglonCarrito
                    key={item.key}
                    item={item}
                    onCantidad={cambiarCantidad}
                    onUnidad={cambiarUnidad}
                    onQuitar={quitar}
                  />
                ))}
              </div>
            )}

            <div className="border-t border-border mt-[0.9rem] pt-4 flex flex-col gap-[0.7rem]">
              <div className="flex justify-between items-baseline text-[1.3rem] font-bold">
                <span>Total</span>
                <span className="text-primary-dark">{dinero(total)}</span>
              </div>
              <button
                className={`${CLASE_BTN_ACCENT} w-full py-[0.9rem] text-[1.05rem]`}
                disabled={carrito.length === 0 || cobrando}
                onClick={cobrar}
              >
                {cobrando ? 'Cobrando…' : 'Cobrar'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <DialogoCobro
        abierto={dialogoCobroAbierto}
        resumen={{
          renglones: carrito.length,
          piezas: carrito.reduce((s, i) => s + i.quantity, 0),
          total
        }}
        cobrando={cobrando}
        onCancelar={cancelarCobro}
        onConfirmar={confirmarCobro}
      />
    </div>
  )
}

// Las presentaciones se cargan solo cuando el renglón está en pantalla, para no
// pedir el producto completo en cada escaneo.
function RenglonCarrito({ item, onCantidad, onUnidad, onQuitar }) {
  const [unidades, setUnidades] = useState(null)

  useEffect(() => {
    let vigente = true
    api.products.get(item.product_id)
      .then((p) => { if (vigente) setUnidades(p.units ?? []) })
      .catch(() => { if (vigente) setUnidades([]) })
    return () => { vigente = false }
  }, [item.product_id])

  return (
    <div className="flex gap-[0.65rem] py-[0.8rem] border-b border-border first:pt-0 last:border-b-0 last:pb-0">
      <Foto imagePath={item.image_path} alt={item.product_name} />
      <div className="flex-1 min-w-0 flex flex-col gap-[0.45rem]">
        <span className="font-semibold text-[0.92rem] leading-[1.25]">{item.product_name}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {unidades === null || unidades.length <= 1 ? (
            <span>{item.unit_label}</span>
          ) : (
            <select
              className="!w-auto flex-1 min-w-[90px] !py-[0.4rem] !px-[0.55rem] !text-[0.88rem]"
              value={item.unit_id}
              onChange={(e) => onUnidad(item, e.target.value)}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.unit_label}</option>
              ))}
            </select>
          )}
          <input
            type="number"
            min="0"
            step="any"
            className="!w-[4.5rem] flex-none !py-[0.4rem] !px-[0.5rem] !text-[0.88rem] text-center"
            value={item.quantity}
            onChange={(e) => onCantidad(item.key, Number(e.target.value))}
          />
          <span className="text-[0.82rem] text-text-muted whitespace-nowrap">{dinero(item.unit_price)} c/u</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-primary">{dinero(item.unit_price * item.quantity)}</span>
          <button className={`${CLASE_BTN_DANGER} py-[0.3rem] px-[0.7rem] text-[0.8rem]`} onClick={() => onQuitar(item.key)}>Quitar</button>
        </div>
      </div>
    </div>
  )
}
