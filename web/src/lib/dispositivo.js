// En tablets/celulares el puntero primario es táctil (dedo), no mouse/lápiz.
// Ahí no hay teclado físico ni lector de código de barras, así que enfocar
// inputs automáticamente solo abre el teclado en pantalla sin motivo.
export function esPunteroTactil() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false
}

// Solo en Android hay una app puente (escbridge) instalada que recibe el
// intent: de impresión ESC/POS. En cualquier otro dispositivo ese botón no
// tiene nada que hacer, así que ni se muestra.
export function esAndroid() {
  return /android/i.test(navigator.userAgent)
}
