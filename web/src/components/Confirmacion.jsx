import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ConfirmacionContext = createContext(null)

// Confirmación propia en vez de window.confirm(): el confirm() del navegador
// pone sus botones en el idioma del navegador (sale "OK/Cancel" en inglés) y
// no deja mostrar el resumen del movimiento, que es justo lo que evita el error.
export function ProveedorConfirmacion({ children }) {
  const [solicitud, setSolicitud] = useState(null)
  const resolverRef = useRef(null)
  const botonConfirmarRef = useRef(null)

  const confirmar = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setSolicitud(opciones)
    })
  }, [])

  const responder = useCallback((valor) => {
    setSolicitud(null)
    resolverRef.current?.(valor)
    resolverRef.current = null
  }, [])

  useEffect(() => {
    if (!solicitud) return

    // Enter confirma y Escape cancela: en mostrador se trabaja con teclado.
    function alTeclear(e) {
      if (e.key === 'Escape') responder(false)
      if (e.key === 'Enter') responder(true)
    }
    window.addEventListener('keydown', alTeclear)
    botonConfirmarRef.current?.focus()
    return () => window.removeEventListener('keydown', alTeclear)
  }, [solicitud, responder])

  return (
    <ConfirmacionContext.Provider value={confirmar}>
      {children}
      {solicitud && (
        <div className="modal-fondo" onClick={() => responder(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-titulo" className="modal-titulo">{solicitud.titulo}</h2>

            {solicitud.mensaje && <p className="modal-mensaje">{solicitud.mensaje}</p>}

            {solicitud.detalles?.length > 0 && (
              <dl className="modal-detalles">
                {solicitud.detalles.map((detalle) => (
                  <div key={detalle.etiqueta} className="modal-detalle">
                    <dt>{detalle.etiqueta}</dt>
                    <dd>{detalle.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            {solicitud.advertencia && <p className="modal-advertencia">{solicitud.advertencia}</p>}

            <div className="modal-acciones">
              <button className="btn btn-ghost" onClick={() => responder(false)}>
                {solicitud.textoCancelar || 'Cancelar'}
              </button>
              <button
                ref={botonConfirmarRef}
                className={`btn ${solicitud.peligroso ? 'btn-peligro-solido' : 'btn-accent'}`}
                onClick={() => responder(true)}
              >
                {solicitud.textoConfirmar || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmacionContext.Provider>
  )
}

export function useConfirmacion() {
  const confirmar = useContext(ConfirmacionContext)
  if (!confirmar) throw new Error('useConfirmacion debe usarse dentro de <ProveedorConfirmacion>')
  return confirmar
}
