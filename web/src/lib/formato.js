export function dinero(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0)
}

export function piezas(n) {
  const valor = Number(n ?? 0)
  // Los numeric de Postgres traen 3 decimales; en mostrador casi todo es
  // entero, así que solo se muestran decimales cuando de verdad los hay.
  const texto = Number.isInteger(valor) ? valor.toString() : valor.toFixed(3).replace(/0+$/, '')
  return `${texto} ${valor === 1 ? 'pieza' : 'piezas'}`
}

export function fecha(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

// El vocabulario que ve el usuario. "entrada/salida/ajuste" son los valores que
// guarda la base; aquí se traducen a algo que se entiende sin explicación.
export const TIPOS_MOVIMIENTO = [
  { valor: 'entrada', etiqueta: 'Entrada — llegó mercancía', corta: 'Entrada' },
  { valor: 'salida', etiqueta: 'Salida — se retiró mercancía', corta: 'Salida' },
  { valor: 'ajuste', etiqueta: 'Ajuste — conteo físico', corta: 'Ajuste' }
]

export function etiquetaTipo(tipo) {
  return TIPOS_MOVIMIENTO.find((t) => t.valor === tipo)?.corta ?? tipo
}

// Presentaciones ya en uso en la base real (pieza/bulto/caja). Un select con
// estas opciones evita variantes como "Bulto" o "cja" que no calzarían con
// las presentaciones que ya existen. "Otra…" abre un campo libre para no
// bloquear una presentación nueva el día que aparezca.
export const PRESENTACIONES_COMUNES = ['pieza', 'bulto', 'caja']
export const OTRA_PRESENTACION = '__otra__'

// "base_qty" en la base = cuántas piezas trae una presentación. Nunca se le
// dice "factor de conversión" al usuario.
export function preguntaPiezasQueTrae(unitLabel) {
  return unitLabel ? `¿Cuántas piezas trae un ${unitLabel}?` : '¿Cuántas piezas trae?'
}

// Calcula cómo quedaría la existencia, para mostrarlo en la confirmación antes
// de mandar el movimiento. Misma aritmética que services/inventory.js.
export function existenciaResultante({ tipo, cantidad, piezasQueTrae, existenciaActual }) {
  const enPiezas = cantidad * piezasQueTrae
  if (tipo === 'entrada') return existenciaActual + enPiezas
  if (tipo === 'salida') return existenciaActual - enPiezas
  return enPiezas // ajuste: la cantidad capturada ES el nuevo saldo
}
