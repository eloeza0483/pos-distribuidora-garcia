// Formas de pago compartidas entre el modal de cobro, el ticket, la
// reimpresión en pantalla, la impresión ESC/POS y el listado de Ventas.
// Antes vivía duplicado en los 4 archivos; un solo lugar evita que se
// desincronicen las etiquetas o los atajos de teclado.
export const FORMAS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo', tecla: '1' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta', tecla: '2' },
  { valor: 'transferencia', etiqueta: 'Transferencia', tecla: '3' }
]

export const NOMBRE_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.etiqueta]))
