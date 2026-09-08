import { dinero, fecha } from './formato.js'
import { NOMBRE_FORMA_PAGO } from './formasPago.js'

// Debe coincidir con el applicationId y el scheme de la app Android puente
// (impresora-termica/app/build.gradle.kts y AndroidManifest.xml). Mecanismo
// validado end-to-end en tablet real.
const APP_SCHEME = 'escbridge'
const APP_PACKAGE = 'mx.distribuidoragarcia.escbridge'

// Impresoras térmicas de 58mm caben ~32 caracteres por línea en fuente
// normal; las de 80mm, ~48. No hay tamaños intermedios en uso.
function columnasPara(anchoMm) {
  return anchoMm >= 80 ? 48 : 32
}

function lineaDosColumnas(izquierda, derecha, columnas) {
  const espacio = columnas - izquierda.length - derecha.length
  if (espacio < 1) return izquierda.slice(0, Math.max(0, columnas - derecha.length - 1)) + ' ' + derecha
  return izquierda + ' '.repeat(espacio) + derecha
}

function bytesToBinaryString(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return s
}

function construirTicketEscPos(ticket) {
  const columnas = columnasPara(ticket.ancho_mm)
  const bytes = []
  const push = (...vals) => bytes.push(...vals)
  const pushText = (str) => {
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff)
  }
  const separador = '-'.repeat(columnas) + '\n'

  push(0x1b, 0x40) // ESC @ : inicializa impresora

  if (ticket.cancelado) {
    push(0x1b, 0x61, 0x01, 0x1b, 0x45, 0x01)
    pushText('*** CANCELADO ***\n')
    push(0x1b, 0x45, 0x00)
  }

  push(0x1b, 0x61, 0x01) // centrado
  push(0x1b, 0x21, 0x30) // texto grande
  pushText(ticket.negocio + '\n')
  push(0x1b, 0x21, 0x00) // texto normal
  if (ticket.direccion) pushText(ticket.direccion + '\n')
  if (ticket.telefono) pushText('Tel. ' + ticket.telefono + '\n')
  if (ticket.rfc) pushText('RFC ' + ticket.rfc + '\n')

  push(0x1b, 0x61, 0x00) // alineado izquierda
  pushText(separador)
  pushText('Folio #' + ticket.folio + '\n')
  pushText(fecha(ticket.fecha) + '\n')
  pushText('Cliente: ' + ticket.cliente + '\n')
  pushText(separador)

  for (const item of ticket.items) {
    const nombre = item.product_name + (item.unit_label ? ` (${item.unit_label})` : '')
    pushText(nombre + '\n')
    pushText(lineaDosColumnas(`  ${item.quantity} pz`, dinero(item.subtotal), columnas) + '\n')
  }
  pushText(separador)

  push(0x1b, 0x21, 0x10) // negrita/doble alto para el total
  pushText(lineaDosColumnas('TOTAL', dinero(ticket.total), columnas) + '\n')
  push(0x1b, 0x21, 0x00)

  if (ticket.payment_method) {
    pushText('Forma de pago: ' + (NOMBRE_FORMA_PAGO[ticket.payment_method] ?? ticket.payment_method) + '\n')
    if (ticket.cash_received != null) pushText('Recibido: ' + dinero(ticket.cash_received) + '\n')
    if (ticket.change_given != null) pushText('Cambio: ' + dinero(ticket.change_given) + '\n')
  }

  if (ticket.pie) {
    push(0x1b, 0x61, 0x01)
    pushText(ticket.pie + '\n')
  }

  pushText('\n\n\n')

  return new Uint8Array(bytes)
}

function construirUrlImpresion(bytes) {
  const b64 = btoa(bytesToBinaryString(bytes))
  return 'intent:base64,' + b64 + '#Intent;scheme=' + APP_SCHEME + ';package=' + APP_PACKAGE + ';end;'
}

// Tiene que llamarse desde un manejador de clic: Chrome exige un gesto del
// usuario para lanzar un intent:, si no lo ignora.
export function imprimirTicketApp(ticket) {
  window.location.href = construirUrlImpresion(construirTicketEscPos(ticket))
}
