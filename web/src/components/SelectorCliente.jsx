import { useState } from 'react'
import { dinero } from '../lib/formato.js'
import { CLASE_BTN_GHOST, CLASE_FIELD } from '../lib/clasesUi.js'

const NUEVO_CLIENTE = '__nuevo__'

// Select de clientes + "+ Nuevo cliente…" (mismo patrón que SelectorCategoria):
// revela un formulario inline para dar de alta un cliente sin salir del
// cobro. Cada opción muestra el saldo pendiente cuando el cliente ya debe,
// justo en el momento en que sirve saberlo (antes de fiarle más).
export default function SelectorCliente({ clientes, value, onChange, onCrear, id }) {
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [telefonoNuevo, setTelefonoNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function confirmarNuevo() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    setError(null)
    try {
      const cliente = await onCrear(nombre, telefonoNuevo.trim())
      if (cliente) {
        onChange(cliente.id)
        setCreando(false)
        setNombreNuevo('')
        setTelefonoNuevo('')
      }
    } catch (err) {
      setError(err?.payload?.message ?? 'No se pudo crear el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  const clienteSeleccionado = clientes.find((c) => String(c.id) === String(value))

  return (
    <div className="flex flex-col gap-[0.35rem]">
      <select
        id={id}
        value={creando ? NUEVO_CLIENTE : (value ?? '')}
        onChange={(e) => {
          if (e.target.value === NUEVO_CLIENTE) {
            setCreando(true)
            return
          }
          setCreando(false)
          onChange(e.target.value ? Number(e.target.value) : null)
        }}
      >
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.client_name}{c.saldo > 0 ? ` — debe ${dinero(c.saldo)}` : ''}
          </option>
        ))}
        <option value={NUEVO_CLIENTE}>+ Nuevo cliente…</option>
      </select>

      {!creando && clienteSeleccionado?.saldo > 0 && (
        <p className="m-0 text-xs font-semibold text-[#8a5417]">
          Este cliente ya debe {dinero(clienteSeleccionado.saldo)}.
        </p>
      )}

      {creando && (
        <div className="flex flex-col gap-[0.35rem] rounded-lg border border-border bg-bg p-[0.6rem]">
          {error && <p className="m-0 text-xs text-danger">{error}</p>}
          <div className={CLASE_FIELD}>
            <label htmlFor={`${id}-nombre`}>Nombre del cliente</label>
            <input
              id={`${id}-nombre`}
              type="text"
              placeholder="Nombre"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              autoFocus
            />
          </div>
          <div className={CLASE_FIELD}>
            <label htmlFor={`${id}-telefono`}>Teléfono (opcional)</label>
            <input
              id={`${id}-telefono`}
              type="tel"
              placeholder="Para poder localizarlo"
              value={telefonoNuevo}
              onChange={(e) => setTelefonoNuevo(e.target.value)}
            />
          </div>
          <div className="flex gap-[0.4rem]">
            <button
              type="button"
              className={CLASE_BTN_GHOST}
              onClick={confirmarNuevo}
              disabled={guardando || !nombreNuevo.trim()}
            >
              {guardando ? 'Creando…' : 'Crear cliente'}
            </button>
            <button
              type="button"
              className={CLASE_BTN_GHOST}
              onClick={() => { setCreando(false); setError(null) }}
              disabled={guardando}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
