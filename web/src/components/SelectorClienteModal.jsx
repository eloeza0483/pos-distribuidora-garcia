import { useEffect, useRef, useState } from 'react'
import { dinero } from '../lib/formato.js'
import { esPunteroTactil } from '../lib/dispositivo.js'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL_ANCHO_MEDIO, CLASE_MODAL_TITULO, CLASE_MODAL_CERRAR,
  CLASE_BTN_GHOST, CLASE_BTN_ACCENT, CLASE_FIELD, CLASE_ERROR_BANNER, CLASE_EMPTY_STATE
} from '../lib/clasesUi.js'

// Modal para elegir un cliente existente (con buscador) o dar de alta uno
// nuevo, en dos vistas dentro del mismo modal — reemplaza al <select> que
// expandía un formulario inline apretado en el encabezado de DialogoCobro.
export default function SelectorClienteModal({ abierto, clientes, onSeleccionar, onCrear, onCerrar }) {
  const [vista, setVista] = useState('lista')
  const [busqueda, setBusqueda] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [telefonoNuevo, setTelefonoNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const inputBusqueda = useRef(null)

  useEffect(() => {
    if (!abierto) return
    setVista('lista')
    setBusqueda('')
    setNombreNuevo('')
    setTelefonoNuevo('')
    setError(null)
    // En tablet enfocar el buscador solo abriría el teclado sin que lo
    // hayan pedido — igual que "Con cuánto paga" en DialogoCobro.
    if (esPunteroTactil()) return
    const id = setTimeout(() => inputBusqueda.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    function alTeclear(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCerrar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const texto = busqueda.trim().toLowerCase()
  const clientesFiltrados = texto
    ? clientes.filter((c) => c.client_name.toLowerCase().includes(texto))
    : clientes

  async function confirmarNuevo() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    setError(null)
    try {
      const cliente = await onCrear(nombre, telefonoNuevo.trim())
      if (cliente) onSeleccionar(cliente)
    } catch (err) {
      setError(err?.payload?.message ?? 'No se pudo crear el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={CLASE_MODAL_FONDO} onClick={onCerrar}>
      <div
        className={`${CLASE_MODAL_ANCHO_MEDIO} relative max-h-[85vh] flex flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="selector-cliente-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={CLASE_MODAL_CERRAR} aria-label="Cerrar" onClick={onCerrar}>×</button>

        {vista === 'lista' ? (
          <>
            <h2 id="selector-cliente-titulo" className={`${CLASE_MODAL_TITULO} shrink-0`}>Elegir cliente</h2>
            <div className="shrink-0 flex gap-2 mb-3">
              <input
                ref={inputBusqueda}
                type="text"
                aria-label="Buscar cliente"
                placeholder="Buscar por nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="flex-1"
              />
              <button type="button" className={CLASE_BTN_GHOST} onClick={() => setVista('nuevo')}>
                + Nuevo cliente
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-fina -mx-6 px-6">
              {clientesFiltrados.length === 0 ? (
                <div className={CLASE_EMPTY_STATE}>Ningún cliente coincide con "{busqueda}".</div>
              ) : (
                clientesFiltrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSeleccionar(c)}
                    className="w-full flex items-center gap-3 py-3 border-b border-border last:border-b-0 text-left cursor-pointer hover:bg-bg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[0.95rem]">{c.client_name}</span>
                        {c.phone && <span className="text-xs text-text-muted">{c.phone}</span>}
                      </div>
                    </div>
                    {c.saldo > 0 && (
                      <span className="flex-none font-semibold text-[0.9rem] text-[#8a5417]">Debe {dinero(c.saldo)}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <h2 id="selector-cliente-titulo" className={`${CLASE_MODAL_TITULO} shrink-0`}>Nuevo cliente</h2>
            {error && <div className={`${CLASE_ERROR_BANNER} shrink-0`}>{error}</div>}
            <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
              <label htmlFor="nuevo-cliente-nombre">Nombre del cliente</label>
              <input
                id="nuevo-cliente-nombre"
                type="text"
                placeholder="Nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                autoFocus
              />
            </div>
            <div className={`${CLASE_FIELD} mb-[0.9rem]`}>
              <label htmlFor="nuevo-cliente-telefono">Teléfono (opcional)</label>
              <input
                id="nuevo-cliente-telefono"
                type="tel"
                placeholder="Para poder localizarlo"
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
              />
            </div>
            <div className="flex gap-[0.6rem]">
              <button type="button" className={CLASE_BTN_GHOST} onClick={() => setVista('lista')} disabled={guardando}>
                ‹ Volver a la lista
              </button>
              <button
                type="button"
                className={CLASE_BTN_ACCENT}
                onClick={confirmarNuevo}
                disabled={guardando || !nombreNuevo.trim()}
              >
                {guardando ? 'Creando…' : 'Crear y usar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
