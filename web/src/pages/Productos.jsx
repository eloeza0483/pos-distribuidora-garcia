import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api, urlDeImagen } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { useConfirmacion } from '../components/Confirmacion.jsx'
import { dinero, piezas, preguntaPiezasQueTrae } from '../lib/formato.js'
import SelectorPresentacion from '../components/SelectorPresentacion.jsx'
import SelectorCategoria from '../components/SelectorCategoria.jsx'
import {
  CLASE_CARD, CLASE_PAGE_TITLE, CLASE_FIELD, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE,
  CLASE_AYUDA, CLASE_BTN_PRIMARY, CLASE_BTN_GHOST, CLASE_SECCION_TITULO,
  CLASE_PILL_LOW, CLASE_FOTO, CLASE_FOTO_VACIA, CLASE_BTN_ACCENT
} from '../lib/clasesUi.js'

const productoVacio = { product_name: '', price: '', unit_label: 'pieza', barcode: '', category_id: null }
const unidadVacia = { unit_label: '', price: '', base_qty: '', barcode: '' }
const SIN_CATEGORIA = 'Sin categoría'

export default function Productos() {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [q, setQ] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [nuevoProducto, setNuevoProducto] = useState(productoVacio)
  const [creando, setCreando] = useState(false)
  const [formulariosUnidad, setFormulariosUnidad] = useState({})
  const confirmar = useConfirmacion()

  async function cargar(termino, categoryId) {
    setCargando(true)
    try {
      const [listaProductos, listaCategorias] = await Promise.all([
        api.products.list(termino, categoryId || undefined),
        api.categories.list()
      ])
      setProductos(listaProductos)
      setCategorias(listaCategorias)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  function alBuscar(e) {
    e.preventDefault()
    cargar(q, filtroCategoria)
  }

  function alCambiarFiltroCategoria(valor) {
    setFiltroCategoria(valor)
    cargar(q, valor)
  }

  async function crearCategoria(nombre) {
    setError(null)
    try {
      const categoria = await api.categories.create(nombre)
      setCategorias((prev) => [...prev, categoria].sort((a, b) => a.name.localeCompare(b.name)))
      setAviso(`Se creó la categoría "${nombre}".`)
      return categoria
    } catch (err) {
      setError(mensajeDeError(err))
      return null
    }
  }

  async function crearProducto(e) {
    e.preventDefault()
    setError(null)
    setAviso(null)

    const nombre = nuevoProducto.product_name.trim()
    const precio = Number(nuevoProducto.price)
    const unidad = nuevoProducto.unit_label.trim() || 'pieza'
    const nombreCategoria = categorias.find((c) => c.id === nuevoProducto.category_id)?.name

    const ok = await confirmar({
      titulo: '¿Dar de alta este producto?',
      detalles: [
        { etiqueta: 'Nombre', valor: nombre },
        { etiqueta: 'Categoría', valor: nombreCategoria ?? SIN_CATEGORIA },
        { etiqueta: 'Se vende por', valor: unidad },
        { etiqueta: 'Precio', valor: dinero(precio) }
      ],
      textoConfirmar: 'Sí, dar de alta'
    })
    if (!ok) return

    setCreando(true)
    try {
      // base_qty siempre 1: la presentación con la que nace el producto ES la
      // pieza suelta, la referencia contra la que se miden bultos y cajas.
      const body = { product_name: nombre, price: precio, unit_label: unidad, base_qty: 1 }
      if (nuevoProducto.barcode.trim()) body.barcode = nuevoProducto.barcode.trim()
      if (nuevoProducto.category_id) body.category_id = nuevoProducto.category_id

      await api.products.create(body)
      setNuevoProducto(productoVacio)
      setAviso(`"${nombre}" quedó dado de alta.`)
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCreando(false)
    }
  }

  function formularioUnidad(productId) {
    return formulariosUnidad[productId] || unidadVacia
  }

  function actualizarFormularioUnidad(productId, campo, valor) {
    setFormulariosUnidad((prev) => ({
      ...prev,
      [productId]: { ...formularioUnidad(productId), [campo]: valor }
    }))
  }

  async function agregarUnidad(producto) {
    const form = formularioUnidad(producto.id)
    const etiqueta = form.unit_label.trim()
    setError(null)
    setAviso(null)

    if (!etiqueta) {
      setError('Elige o escribe una presentación.')
      return
    }

    const ok = await confirmar({
      titulo: '¿Agregar esta presentación?',
      detalles: [
        { etiqueta: 'Producto', valor: producto.product_name },
        { etiqueta: 'Presentación', valor: etiqueta },
        { etiqueta: 'Precio', valor: dinero(Number(form.price)) },
        { etiqueta: 'Piezas que trae', valor: form.base_qty ? `${form.base_qty} piezas` : 'Falta capturar' }
      ],
      advertencia: form.base_qty
        ? null
        : 'Sin saber cuántas piezas trae, no se podrá mover inventario ni vender con esta presentación.',
      textoConfirmar: 'Sí, agregar'
    })
    if (!ok) return

    try {
      const body = { unit_label: etiqueta, price: Number(form.price) }
      if (form.base_qty) body.base_qty = Number(form.base_qty)
      if (form.barcode.trim()) body.barcode = form.barcode.trim()

      await api.products.createUnit(producto.id, body)
      setFormulariosUnidad((prev) => ({ ...prev, [producto.id]: unidadVacia }))
      setAviso(`Se agregó la presentación "${etiqueta}".`)
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  async function editarUnidad(producto, unidad, campo, valor, resumen) {
    setError(null)
    setAviso(null)

    const ok = await confirmar({
      titulo: '¿Guardar el cambio?',
      detalles: [
        { etiqueta: 'Producto', valor: producto.product_name },
        { etiqueta: 'Presentación', valor: unidad.unit_label },
        ...resumen
      ],
      textoConfirmar: 'Sí, guardar'
    })
    if (!ok) {
      // Se revierte lo escrito: la fuente de verdad sigue siendo la base.
      await cargar(q, filtroCategoria)
      return
    }

    try {
      await api.units.patch(unidad.id, { [campo]: valor })
      setAviso('Cambio guardado.')
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
      await cargar(q, filtroCategoria)
    }
  }

  async function cambiarCategoria(producto, categoryId) {
    setError(null)
    setAviso(null)
    const nuevaCategoria = categorias.find((c) => c.id === categoryId)?.name ?? SIN_CATEGORIA
    const categoriaActual = producto.category_name ?? SIN_CATEGORIA

    if (categoryId === (producto.category_id ?? null)) return

    const ok = await confirmar({
      titulo: '¿Cambiar la categoría?',
      detalles: [
        { etiqueta: 'Producto', valor: producto.product_name },
        { etiqueta: 'Categoría', valor: `${categoriaActual} → ${nuevaCategoria}` }
      ],
      textoConfirmar: 'Sí, cambiar'
    })
    if (!ok) {
      await cargar(q, filtroCategoria)
      return
    }

    try {
      await api.products.patch(producto.id, { category_id: categoryId })
      setAviso('Categoría actualizada.')
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
      await cargar(q, filtroCategoria)
    }
  }

  async function subirFoto(producto, file) {
    if (!file) return
    setError(null)
    setAviso(null)
    try {
      await api.products.subirImagen(producto.id, file)
      setAviso(`Se actualizó la foto de "${producto.product_name}".`)
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  async function quitarFoto(producto) {
    const ok = await confirmar({
      titulo: '¿Quitar la foto?',
      detalles: [{ etiqueta: 'Producto', valor: producto.product_name }],
      textoConfirmar: 'Sí, quitar',
      peligroso: true
    })
    if (!ok) return

    try {
      await api.products.borrarImagen(producto.id)
      setAviso('Foto eliminada.')
      await cargar(q, filtroCategoria)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  // Agrupa por categoría (orden alfabético) y deja "Sin categoría" al final.
  const grupos = useMemo(() => {
    const porNombre = new Map()
    for (const p of productos) {
      const clave = p.category_name ?? SIN_CATEGORIA
      if (!porNombre.has(clave)) porNombre.set(clave, [])
      porNombre.get(clave).push(p)
    }
    const nombres = [...porNombre.keys()].sort((a, b) => {
      if (a === SIN_CATEGORIA) return 1
      if (b === SIN_CATEGORIA) return -1
      return a.localeCompare(b)
    })
    return nombres.map((nombre) => ({ nombre, productos: porNombre.get(nombre) }))
  }, [productos])

  return (
    <div>
      <h1 className={CLASE_PAGE_TITLE}>Productos</h1>

      {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}
      {aviso && <div className={`${CLASE_CARD} mb-4 border-success`}>{aviso}</div>}

      <form onSubmit={alBuscar} className={`${CLASE_CARD} mb-5 flex flex-col sm:flex-row gap-[0.6rem]`}>
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por nombre, código de barras o precio…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="!pl-9"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={(e) => alCambiarFiltroCategoria(e.target.value)}
          className="sm:max-w-[200px]"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className={CLASE_BTN_GHOST}>Buscar</button>
      </form>

      <details className={`${CLASE_CARD} mb-5`}>
        <summary className="cursor-pointer font-semibold text-primary-dark">
          Dar de alta un producto nuevo
        </summary>
        <form onSubmit={crearProducto} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
          <label className={CLASE_FIELD}>
            Nombre
            <input
              type="text"
              required
              value={nuevoProducto.product_name}
              onChange={(e) => setNuevoProducto((p) => ({ ...p, product_name: e.target.value }))}
            />
          </label>
          <label className={CLASE_FIELD}>
            Precio por pieza
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={nuevoProducto.price}
              onChange={(e) => setNuevoProducto((p) => ({ ...p, price: e.target.value }))}
            />
          </label>
          <label className={CLASE_FIELD}>
            ¿Cómo se vende suelto?
            <SelectorPresentacion
              value={nuevoProducto.unit_label}
              onChange={(valor) => setNuevoProducto((p) => ({ ...p, unit_label: valor }))}
            />
          </label>
          <label className={CLASE_FIELD}>
            Categoría
            <SelectorCategoria
              categorias={categorias}
              value={nuevoProducto.category_id}
              onChange={(categoryId) => setNuevoProducto((p) => ({ ...p, category_id: categoryId }))}
              onCrear={crearCategoria}
            />
          </label>
          <label className={CLASE_FIELD}>
            Código de barras (opcional)
            <input
              type="text"
              value={nuevoProducto.barcode}
              onChange={(e) => setNuevoProducto((p) => ({ ...p, barcode: e.target.value }))}
            />
          </label>
          <button type="submit" className={`${CLASE_BTN_PRIMARY} col-span-full justify-self-start`} disabled={creando}>
            {creando ? 'Guardando…' : 'Dar de alta'}
          </button>
        </form>
        <p className={CLASE_AYUDA}>
          Después puedes agregarle presentaciones más grandes (bulto, caja) desde el botón «Presentaciones».
        </p>
      </details>

      {cargando ? (
        <div className={CLASE_CARD}><div className={CLASE_EMPTY_STATE}>Cargando…</div></div>
      ) : productos.length === 0 ? (
        <div className={CLASE_CARD}><div className={CLASE_EMPTY_STATE}>Ningún producto coincide con esa búsqueda.</div></div>
      ) : (
        grupos.map((grupo) => (
          <div key={grupo.nombre} className={`${CLASE_CARD} mb-4`}>
            <p className={CLASE_SECCION_TITULO}>{grupo.nombre} · {grupo.productos.length}</p>
            {grupo.productos.map((p) => (
              <Fragment key={p.id}>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-3 border-b border-border last:border-b-0">
                  <ControlFoto producto={p} onSubir={subirFoto} onQuitar={quitarFoto} />
                  <div className="flex-1 min-w-[160px]">
                    <p className="font-semibold text-[0.92rem] leading-[1.25]">{p.product_name}</p>
                    <p className="flex items-center gap-2 flex-wrap text-[0.85rem] text-text-muted mt-0.5">
                      <span className="text-primary font-bold">{dinero(p.list_price)}</span>
                      <span>· {piezas(p.stock_base)}</span>
                      {p.low_stock && <span className={CLASE_PILL_LOW}>bajo</span>}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto flex items-center gap-3">
                    <div className="flex-1 sm:flex-none sm:w-[190px]">
                      <SelectorCategoria
                        categorias={categorias}
                        value={p.category_id}
                        onChange={(categoryId) => cambiarCategoria(p, categoryId)}
                        onCrear={crearCategoria}
                      />
                    </div>
                    <button
                      className={`${CLASE_BTN_GHOST} flex-none`}
                      aria-expanded={expandido === p.id}
                      onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                    >
                      {expandido === p.id ? 'Ocultar' : 'Presentaciones'}
                    </button>
                  </div>
                </div>
                {expandido === p.id && (
                  <div className="bg-bg rounded-xl p-4 mb-3">
                    <div className="flex flex-col gap-3 mb-3">
                      {(p.units || []).map((u) => (
                        <div key={u.id} className="flex flex-wrap items-center gap-3 pb-3 border-b border-border last:border-b-0 last:pb-0">
                          <span className="font-medium text-[0.88rem] min-w-[110px]">
                            {u.unit_label}{u.is_default ? ' (se vende suelta)' : ''}
                          </span>
                          <span className="text-primary font-semibold text-[0.88rem] min-w-[70px]">{dinero(u.price)}</span>
                          <label className="flex items-center gap-1.5 text-[0.8rem] text-text-muted">
                            Piezas que trae
                            <input
                              type="number"
                              min="0"
                              step="any"
                              defaultValue={u.base_qty ?? ''}
                              placeholder={preguntaPiezasQueTrae(u.unit_label)}
                              title={preguntaPiezasQueTrae(u.unit_label)}
                              className="!w-24"
                              onBlur={(e) => {
                                const valor = Number(e.target.value)
                                if (valor > 0 && valor !== u.base_qty) {
                                  editarUnidad(p, u, 'base_qty', valor, [
                                    { etiqueta: 'Piezas que trae', valor: `${u.base_qty ?? '—'} → ${valor}` }
                                  ])
                                }
                              }}
                            />
                          </label>
                          <label className="flex items-center gap-1.5 flex-1 min-w-[180px] text-[0.8rem] text-text-muted">
                            Código
                            <input
                              type="text"
                              defaultValue={u.barcode ?? ''}
                              placeholder="Escanea aquí para asignarlo"
                              className="flex-1"
                              onBlur={(e) => {
                                const valor = e.target.value.trim()
                                if (valor !== (u.barcode ?? '')) {
                                  editarUnidad(p, u, 'barcode', valor || null, [
                                    { etiqueta: 'Código de barras', valor: valor || 'sin código' }
                                  ])
                                }
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    <p className={CLASE_AYUDA}>
                      Una presentación es cómo viene empaquetado el producto. Si un bulto trae 50 piezas,
                      escribe 50 en «Piezas que trae»: con eso el sistema sabe cuánto descontar del inventario.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto] gap-3 mt-3 items-start">
                      <label className={CLASE_FIELD}>
                        Nueva presentación
                        <SelectorPresentacion
                          value={formularioUnidad(p.id).unit_label}
                          onChange={(valor) => actualizarFormularioUnidad(p.id, 'unit_label', valor)}
                        />
                      </label>
                      <label className={CLASE_FIELD}>
                        Precio
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formularioUnidad(p.id).price}
                          onChange={(e) => actualizarFormularioUnidad(p.id, 'price', e.target.value)}
                        />
                      </label>
                      <label className={CLASE_FIELD}>
                        Piezas que trae
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={formularioUnidad(p.id).base_qty}
                          onChange={(e) => actualizarFormularioUnidad(p.id, 'base_qty', e.target.value)}
                        />
                      </label>
                      <label className={CLASE_FIELD}>
                        Código de barras
                        <input
                          type="text"
                          value={formularioUnidad(p.id).barcode}
                          onChange={(e) => actualizarFormularioUnidad(p.id, 'barcode', e.target.value)}
                        />
                      </label>
                      <button className={`${CLASE_BTN_ACCENT} justify-self-start lg:justify-self-auto`} onClick={() => agregarUnidad(p)}>Agregar</button>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

function ControlFoto({ producto, onSubir, onQuitar }) {
  const inputRef = useRef(null)
  const url = urlDeImagen(producto.image_path)

  return (
    <div className="flex flex-col gap-1 items-center">
      {url
        ? <img className={CLASE_FOTO} src={url} alt={producto.product_name} />
        : <div className={CLASE_FOTO_VACIA} aria-hidden="true">📦</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          onSubir(producto, e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <button
        className={`${CLASE_BTN_GHOST} py-[0.15rem] px-[0.4rem] text-[0.7rem]`}
        onClick={() => (url ? onQuitar(producto) : inputRef.current?.click())}
        title={url ? 'Quitar la foto' : 'Subir una foto'}
      >
        {url ? 'Quitar' : 'Subir'}
      </button>
    </div>
  )
}
