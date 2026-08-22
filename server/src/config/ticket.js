// Datos del negocio para el encabezado del ticket. Única fuente de verdad:
// tanto la impresión del navegador (window.print()) como un futuro módulo
// ESC/POS leen este mismo objeto, así que agregar una impresora térmica no
// implica tocar el encabezado en dos lugares.
export function loadTicketConfig(env = process.env) {
  return {
    negocio: env.TICKET_NEGOCIO || 'Distribuidora García',
    direccion: env.TICKET_DIRECCION || '',
    telefono: env.TICKET_TELEFONO || '',
    rfc: env.TICKET_RFC || '',
    pie: env.TICKET_PIE || 'Gracias por su compra',
    ancho_mm: Number(env.TICKET_ANCHO_MM) === 58 ? 58 : 80
  }
}
