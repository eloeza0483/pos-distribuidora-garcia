// Imprime el ticket con el diálogo del sistema. Si no hay impresora, el
// usuario cancela ese diálogo y no pasa nada más: la venta ya quedó
// registrada de todas formas. Sin dependencias — el CSS @media print de
// App.css es el que oculta todo salvo #area-impresion.
export function imprimirTicket() {
  window.print()
}
