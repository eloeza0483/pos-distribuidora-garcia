// Imprime el ticket con el diálogo del sistema. Si no hay impresora, el
// usuario cancela ese diálogo y no pasa nada más: la venta ya quedó
// registrada de todas formas. Sin dependencias — el CSS @media print de
// index.css es el que oculta todo salvo #area-impresion.
//
// El tamaño de página (@page) se inyecta en cada impresión porque depende
// del ancho del ticket (58mm u 80mm, según config del servidor) y de su
// alto, que varía con la cantidad de artículos: sin esto el navegador
// imprime en tamaño Carta/A4 y el ticket queda como una franja angosta
// rodeada de una página en blanco enorme. `size` no admite mezclar un
// largo con `auto` (Chrome ignora la regla completa si se hace), así que
// el alto se mide del elemento ya renderizado y se pasa en mm.
const PX_POR_MM = 96 / 25.4

export function imprimirTicket(anchoMm = 80) {
  const elemento = document.getElementById('area-impresion')
  const altoMm = elemento ? Math.ceil(elemento.scrollHeight / PX_POR_MM) + 5 : 297

  const estilo = document.createElement('style')
  estilo.textContent = `@page { size: ${anchoMm}mm ${altoMm}mm; margin: 0; }`
  document.head.appendChild(estilo)

  window.addEventListener('afterprint', () => estilo.remove(), { once: true })

  window.print()
}
