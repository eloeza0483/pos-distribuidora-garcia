import { useState } from 'react'
import Ticket from './Ticket.jsx'
import { imprimirTicket } from '../lib/imprimir.js'
import { imprimirTicketApp } from '../lib/imprimirEscBridge.js'
import { esAndroid } from '../lib/dispositivo.js'
import {
  CLASE_SECCION_TITULO, CLASE_BTN_PRIMARY, CLASE_BTN_ACCENT,
  CLASE_PANEL_TICKET, CLASE_PANEL_TICKET_ACCIONES,
  CLASE_MODAL_FONDO, CLASE_MODAL, CLASE_MODAL_CERRAR
} from '../lib/clasesUi.js'

// Modal genérico para mostrar/imprimir un ticket recién generado — cobro de
// contado, venta guardada como pendiente, o recibo de un abono. Antes vivía
// solo dentro de Mostrador.jsx; se extrajo para reusarlo también en el
// recibo de abono y en el panel de Ventas (que hoy solo podía reimprimir
// por el sistema, sin el botón de impresión directa de la app puente).
export default function ModalTicket({ ticket, titulo, onCerrar }) {
  const [yaImprimio, setYaImprimio] = useState(false)

  if (!ticket) return null

  return (
    <div className={CLASE_MODAL_FONDO} onClick={onCerrar}>
      <div
        className={`${CLASE_MODAL} relative max-w-[480px] max-h-[85vh] flex flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-ticket-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={CLASE_MODAL_CERRAR} aria-label="Cerrar" onClick={onCerrar}>×</button>
        <p id="modal-ticket-titulo" className={`${CLASE_SECCION_TITULO} m-0 shrink-0`}>
          {titulo ?? (ticket.pendiente ? `Venta #${ticket.folio} guardada` : `Venta #${ticket.folio} cobrada`)}
        </p>
        <div className={`${CLASE_PANEL_TICKET} flex-1 min-h-0 overflow-y-auto`}>
          <div id="area-impresion">
            <Ticket ticket={ticket} />
          </div>
        </div>
        <div className={`${CLASE_PANEL_TICKET_ACCIONES} shrink-0 pt-4`}>
          {esAndroid() && (
            <button className={CLASE_BTN_ACCENT} onClick={() => { imprimirTicketApp(ticket); setYaImprimio(true) }}>
              {yaImprimio ? 'Imprimir de nuevo' : 'Imprimir directo'}
            </button>
          )}
          <button className={CLASE_BTN_PRIMARY} onClick={() => { imprimirTicket(ticket.ancho_mm); setYaImprimio(true) }}>
            {esAndroid() ? 'Imprimir con el sistema' : (yaImprimio ? 'Imprimir de nuevo' : 'Imprimir')}
          </button>
        </div>
      </div>
    </div>
  )
}
