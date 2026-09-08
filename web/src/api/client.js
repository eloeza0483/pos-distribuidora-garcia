// Vacío = mismo origen (Vite proxy en dev). Si hay VITE_API_URL, se usa esa.
const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || `Error ${status}`)
    this.status = status
    this.payload = payload
  }
}

// El servidor no contestó (apagado, sin red, CORS). fetch() lanza un TypeError
// con mensaje del navegador —"Failed to fetch"— así que se envuelve en un tipo
// propio para que la capa de mensajes lo traduzca (ver lib/errores.js).
export class ErrorDeRed extends Error {
  constructor(cause) {
    super('No se pudo conectar con el servidor.')
    this.name = 'ErrorDeRed'
    this.cause = cause
  }
}

// La URL pública de las fotos: el backend las sirve como estáticos en /uploads.
export function urlDeImagen(imagePath) {
  return imagePath ? `${BASE_URL}/uploads/${imagePath}` : null
}

async function request(path, { method = 'GET', body, headers, rawBody } = {}) {
  // El Content-Type solo se manda cuando de verdad va un cuerpo JSON:
  //  - con multipart lo pone el navegador (necesita agregar el boundary);
  //  - en un POST sin cuerpo (p.ej. deshacer un movimiento) declarar JSON hace
  //    que Fastify lo rechace con "Body cannot be empty".
  const enviaJson = rawBody === undefined && body !== undefined

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: enviaJson ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
    })
  } catch (err) {
    throw new ErrorDeRed(err)
  }

  if (res.status === 204) return null

  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, payload)
  return payload
}

export const api = {
  products: {
    list: (q, categoryId) => {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (categoryId) params.set('category_id', categoryId)
      const qs = params.toString()
      return request(`/api/products${qs ? `?${qs}` : ''}`)
    },
    populares: ({ limit = 12, days = 30 } = {}) =>
      request(`/api/products/populares?limit=${limit}&days=${days}`),
    get: (id) => request(`/api/products/${id}`),
    create: (body) => request('/api/products', { method: 'POST', body }),
    patch: (id, body) => request(`/api/products/${id}`, { method: 'PATCH', body }),
    createUnit: (id, body) => request(`/api/products/${id}/units`, { method: 'POST', body }),
    subirImagen: (id, file) => {
      const form = new FormData()
      form.append('file', file)
      return request(`/api/products/${id}/image`, { method: 'POST', rawBody: form })
    },
    borrarImagen: (id) => request(`/api/products/${id}/image`, { method: 'DELETE' })
  },
  categories: {
    list: () => request('/api/categories'),
    create: (name) => request('/api/categories', { method: 'POST', body: { name } })
  },
  units: {
    patch: (id, body) => request(`/api/units/${id}`, { method: 'PATCH', body })
  },
  scan: (barcode) => request(`/api/scan/${encodeURIComponent(barcode)}`),
  inventory: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString()
      return request(`/api/inventory/movements${qs ? `?${qs}` : ''}`)
    },
    create: (body) => request('/api/inventory/movements', { method: 'POST', body }),
    revert: (id) => request(`/api/inventory/movements/${id}/revert`, { method: 'POST' })
  },
  sales: {
    create: (body, idempotencyKey) =>
      request('/api/sales', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
    list: (params = {}) => {
      const limpio = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
      const qs = new URLSearchParams(limpio).toString()
      return request(`/api/sales${qs ? `?${qs}` : ''}`)
    },
    get: (id) => request(`/api/sales/${id}`),
    cancel: (id, reason) => request(`/api/sales/${id}/cancel`, { method: 'POST', body: reason ? { reason } : {} }),
    corte: (date) => request(`/api/sales/corte${date ? `?date=${date}` : ''}`),
    registrarAbono: (id, body, idempotencyKey) =>
      request(`/api/sales/${id}/payments`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
    pagos: (id) => request(`/api/sales/${id}/payments`)
  },
  clients: {
    list: (q) => request(`/api/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    create: (body) => request('/api/clients', { method: 'POST', body }),
    patch: (id, body) => request(`/api/clients/${id}`, { method: 'PATCH', body }),
    deudores: () => request('/api/clients/deudores')
  }
}
