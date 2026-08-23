import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_TITULO, CLASE_MODAL_DETALLES,
  CLASE_MODAL_DETALLE, CLASE_MODAL_ACCIONES, CLASE_BTN_GHOST, CLASE_BTN_ACCENT, CLASE_BTN_PELIGRO_SOLIDO
} from '../lib/clasesUi.js'

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
        <div className={CLASE_MODAL_FONDO} onClick={() => responder(false)}>
          <div
            className={CLASE_MODAL}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-titulo" className={CLASE_MODAL_TITULO}>{solicitud.titulo}</h2>

            {solicitud.mensaje && <p className="m-0 mb-4 text-text-muted text-[0.92rem] leading-[1.45]">{solicitud.mensaje}</p>}

            {solicitud.detalles?.length > 0 && (
              <dl className={CLASE_MODAL_DETALLES}>
                {solicitud.detalles.map((detalle) => (
                  <div key={detalle.etiqueta} className={CLASE_MODAL_DETALLE}>
                    <dt className="text-text-muted">{detalle.etiqueta}</dt>
                    <dd className="m-0 font-semibold text-right">{detalle.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            {solicitud.advertencia && <p className="m-0 mb-4 bg-accent-soft text-[#8a5417] rounded-lg px-[0.8rem] py-[0.6rem] text-[0.85rem]">{solicitud.advertencia}</p>}

            <div className={CLASE_MODAL_ACCIONES}>
              <button className={CLASE_BTN_GHOST} onClick={() => responder(false)}>
                {solicitud.textoCancelar || 'Cancelar'}
              </button>
              <button
                ref={botonConfirmarRef}
                className={solicitud.peligroso ? CLASE_BTN_PELIGRO_SOLIDO : CLASE_BTN_ACCENT}
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
