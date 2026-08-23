import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client.js'
import { mensajeDeError } from '../lib/errores.js'
import { useConfirmacion } from '../components/Confirmacion.jsx'
import {
  piezas, fecha, TIPOS_MOVIMIENTO, etiquetaTipo, existenciaResultante
} from '../lib/formato.js'
import {
  CLASE_CARD, CLASE_PAGE_TITLE, CLASE_FIELD, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE,
  CLASE_AYUDA, CLASE_BTN_PRIMARY, CLASE_BTN_DANGER, CLASE_PILL_ENTRADA, CLASE_PILL_SALIDA,
  CLASE_PILL_AJUSTE, CLASE_FILA_TACHADA
} from '../lib/clasesUi.js'

const CLASES_PILL_TIPO = {
  entrada: CLASE_PILL_ENTRADA,
  salida: CLASE_PILL_SALIDA,
  ajuste: CLASE_PILL_AJUSTE
}

const formularioVacio = { product_id: '', type: 'entrada', quantity: '', unit_label: '', reason: '' }

export default function Inventario() {
  const [movimientos, setMovimientos] = useState([])
  const [productos, setProductos] = useState([])
  const [form, setForm] = useState(formularioVacio)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const confirmar = useConfirmacion()

  const productoElegido = useMemo(
    () => productos.find((p) => p.id === Number(form.product_id)) ?? null,
    [productos, form.product_id]
  )

  // Unidad seleccionada (o la de por omisión si no se eligió ninguna).
  const unidadElegida = useMemo(() => {
    if (!productoElegido) return null
    const unidades = productoElegido.units ?? []
    if (!form.unit_label) return unidades.find((u) => u.is_default) ?? unidades[0] ?? null
    return unidades.find((u) => u.unit_label === form.unit_label) ?? null
  }, [productoElegido, form.unit_label])

  async function cargarMovimientos() {
    setMovimientos(await api.inventory.list({ limit: 50 }))
  }

  async function cargarTodo() {
    setCargando(true)
    try {
      const [, listaProductos] = await Promise.all([cargarMovimientos(), api.products.list()])
      setProductos(listaProductos)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargarTodo() }, [])

  function actualizarCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function alEnviar(e) {
    e.preventDefault()
    setError(null)
    setAviso(null)

    if (!productoElegido || !unidadElegida) {
      setError('Elige un producto y una presentación válida.')
      return
    }

    const cantidad = Number(form.quantity)
    const piezasQueTrae = unidadElegida.base_qty

    // Sin este dato no se puede saber cuántas piezas mueve la operación; el
    // servidor lo rechazaría igual, pero conviene decirlo antes de confirmar.
    if (piezasQueTrae === null || piezasQueTrae === undefined) {
      setError(
        `Falta capturar cuántas piezas trae un ${unidadElegida.unit_label} de ${productoElegido.product_name}. ` +
        'Captúralo en la pestaña Productos y vuelve a intentarlo.'
      )
      return
    }

    const existenciaActual = Number(productoElegido.stock_base)
    const despues = existenciaResultante({
      tipo: form.type, cantidad, piezasQueTrae, existenciaActual
    })

    const detalles = [
      { etiqueta: 'Producto', valor: productoElegido.product_name },
      { etiqueta: 'Movimiento', valor: etiquetaTipo(form.type) },
      { etiqueta: 'Cantidad', valor: `${cantidad} ${unidadElegida.unit_label}` },
      { etiqueta: 'Existencia ahora', valor: piezas(existenciaActual) },
      { etiqueta: 'Existencia después', valor: piezas(despues) }
    ]

    const ok = await confirmar({
      titulo: '¿Registrar este movimiento?',
      mensaje: 'Revisa que los datos estén bien antes de guardar.',
      detalles,
      advertencia: despues < 0
        ? 'La existencia quedaría en negativo, así que el servidor va a rechazar el movimiento. Usa "Ajuste — conteo físico" para poner el número real.'
        : null,
      textoConfirmar: 'Sí, registrar'
    })
    if (!ok) return

    setGuardando(true)
    try {
      const body = {
        product_id: productoElegido.id,
        type: form.type,
        quantity: cantidad,
        unit_label: unidadElegida.unit_label
      }
      if (form.reason.trim()) body.reason = form.reason.trim()

      await api.inventory.create(body)
      setForm(formularioVacio)
      setAviso('Movimiento registrado.')
      // Se recargan también los productos: la existencia cambió.
      await cargarTodo()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function deshacer(movimiento) {
    setError(null)
    setAviso(null)

    const ok = await confirmar({
      titulo: '¿Deshacer este movimiento?',
      mensaje: 'No se borra del historial: se registra el movimiento contrario para dejar la existencia como estaba.',
      detalles: [
        { etiqueta: 'Producto', valor: movimiento.product_name },
        { etiqueta: 'Movimiento', valor: `${etiquetaTipo(movimiento.type)} de ${movimiento.quantity} ${movimiento.unit_label ?? 'pieza'}` },
        { etiqueta: 'Registrado', valor: fecha(movimiento.created_at) }
      ],
      textoConfirmar: 'Sí, deshacer',
      peligroso: true
    })
    if (!ok) return

    try {
      await api.inventory.revert(movimiento.id)
      setAviso('Movimiento deshecho.')
      await cargarTodo()
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  function motivoNoSePuedeDeshacer(m) {
    if (m.order_id !== null) return 'Lo generó una venta: hay que cancelar la venta.'
    if (m.reverted_movement_id !== null) return 'Este renglón ya es una corrección.'
    if (m.is_reverted) return 'Este movimiento ya se deshizo.'
    return null
  }

  return (
    <div>
      <h1 className={CLASE_PAGE_TITLE}>Inventario</h1>

      {error && <div className={CLASE_ERROR_BANNER}>{error}</div>}
      {aviso && <div className={`${CLASE_CARD} mb-4 border-success`}>{aviso}</div>}

      <form onSubmit={alEnviar} className={`${CLASE_CARD} mb-5`}>
        <div className="grid grid-cols-5 gap-3 items-end">
          <label className={CLASE_FIELD}>
            Producto
            <select value={form.product_id} onChange={(e) => actualizarCampo('product_id', e.target.value)} required>
              <option value="" disabled>Selecciona…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.product_name}</option>
              ))}
            </select>
          </label>

          <label className={CLASE_FIELD}>
            ¿Qué pasó?
            <select value={form.type} onChange={(e) => actualizarCampo('type', e.target.value)}>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </label>

          <label className={CLASE_FIELD}>
            {form.type === 'ajuste' ? 'Cantidad contada' : 'Cantidad'}
            <input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => actualizarCampo('quantity', e.target.value)}
              required
            />
          </label>

          <label className={CLASE_FIELD}>
            ¿En qué se cuenta?
            <select
              value={form.unit_label}
              onChange={(e) => actualizarCampo('unit_label', e.target.value)}
              disabled={!productoElegido}
            >
              <option value="">Como se vende normalmente</option>
              {(productoElegido?.units ?? []).map((u) => (
                <option key={u.id} value={u.unit_label}>
                  {u.unit_label}{u.base_qty === null ? ' (falta saber cuántas piezas trae)' : ''}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={CLASE_BTN_PRIMARY} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </div>

        {productoElegido && (
          <p className={CLASE_AYUDA}>
            Existencia actual de {productoElegido.product_name}: <strong>{piezas(productoElegido.stock_base)}</strong>
            {unidadElegida && unidadElegida.base_qty !== null && unidadElegida.base_qty !== 1 && (
              <> · un {unidadElegida.unit_label} trae {unidadElegida.base_qty} piezas</>
            )}
          </p>
        )}

        <label className={`${CLASE_FIELD} mt-3`}>
          Motivo (opcional)
          <input
            type="text"
            value={form.reason}
            onChange={(e) => actualizarCampo('reason', e.target.value)}
            placeholder="Compra a proveedor, merma, conteo físico…"
          />
        </label>
      </form>

      <div className={CLASE_CARD}>
        {cargando ? (
          <div className={CLASE_EMPTY_STATE}>Cargando…</div>
        ) : movimientos.length === 0 ? (
          <div className={CLASE_EMPTY_STATE}>Todavía no hay movimientos registrados.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>¿Qué pasó?</th>
                <th>Cantidad</th>
                <th>Existencia después</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const impedimento = motivoNoSePuedeDeshacer(m)
                return (
                  <tr key={m.id} className={m.is_reverted ? CLASE_FILA_TACHADA : undefined}>
                    <td>{fecha(m.created_at)}</td>
                    <td>{m.product_name}</td>
                    <td><span className={CLASES_PILL_TIPO[m.type]}>{etiquetaTipo(m.type)}</span></td>
                    <td>{m.quantity} {m.unit_label || 'pieza'}</td>
                    <td>{piezas(m.stock_after)}</td>
                    <td>{m.reason || '—'}</td>
                    <td>
                      <button
                        className={CLASE_BTN_DANGER}
                        onClick={() => deshacer(m)}
                        disabled={impedimento !== null}
                        title={impedimento ?? 'Registra el movimiento contrario'}
                      >
                        Deshacer
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
