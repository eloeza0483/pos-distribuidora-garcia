import { ApiError, ErrorDeRed } from '../api/client.js'

// Respaldo por código, para cuando el backend no mandó texto. Los mensajes del
// servidor ya vienen en español y suelen ser más específicos (traen el nombre
// del producto), así que esos tienen prioridad.
const MENSAJES_POR_CODIGO = {
  unknown_barcode: 'Ese código de barras no está registrado en ningún producto.',
  not_found: 'No se encontró lo que buscabas.',
  unit_not_found: 'Ese producto no maneja esa unidad.',
  missing_base_qty: 'Falta capturar cuántas piezas trae esa presentación.',
  insufficient_stock: 'No hay suficiente existencia para ese movimiento.',
  not_revertible: 'Ese movimiento ya no se puede deshacer.',
  duplicate: 'Ya existe un registro con esos datos.',
  price_mismatch: 'El precio cambió antes de cobrar. Vuelve a agregar los productos.',
  cash_too_low: 'El efectivo recibido no alcanza para cubrir el total.',
  already_cancelled: 'Esta venta ya está cancelada.',
  amount_exceeds_balance: 'El abono es mayor que el saldo pendiente de esta venta.',
  already_paid: 'Esta venta ya está pagada por completo.',
  sale_cancelled: 'No se puede abonar a una venta cancelada.',
  credit_requires_client: 'Una venta pendiente necesita un cliente con nombre.',
  unsupported_type: 'La foto debe ser JPG, PNG o WEBP.',
  file_too_large: 'La foto pesa demasiado. Usa una más ligera.',
  bad_upload: 'No se pudo leer el archivo que enviaste.'
}

// Único lugar donde un error se convierte en texto para el usuario. Sin esto,
// un fallo de red se muestra como "Failed to fetch" (mensaje del navegador,
// en inglés) — que fue justo lo que se veía en pantalla.
export function mensajeDeError(err) {
  if (err instanceof ErrorDeRed) {
    return 'No se pudo conectar con el servidor. Revisa que esté encendido e inténtalo de nuevo.'
  }

  if (err instanceof ApiError) {
    if (err.payload?.error && MENSAJES_POR_CODIGO[err.payload.error]) {
      return MENSAJES_POR_CODIGO[err.payload.error]
    }
    // Los errores propios del framework (código FST_*) traen texto en inglés
    // pensado para quien programa, no para quien atiende el mostrador.
    const esErrorDeFramework = typeof err.payload?.code === 'string' && err.payload.code.startsWith('FST_')
    if (err.payload?.message && !esErrorDeFramework) return err.payload.message
    if (esErrorDeFramework) {
      return 'La aplicación mandó una petición mal formada. Vuelve a cargar la página e inténtalo de nuevo.'
    }
    if (err.status >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en un momento.'
    return 'No se pudo completar la operación.'
  }

  return 'Ocurrió un problema inesperado. Inténtalo de nuevo.'
}
