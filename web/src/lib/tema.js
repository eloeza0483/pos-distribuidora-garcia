const CLAVE = 'tema'

// null = "seguir al sistema" (no se guarda nada, se borra la clave).
export function obtenerTemaGuardado() {
  const valor = localStorage.getItem(CLAVE)
  return valor === 'dark' || valor === 'light' ? valor : null
}

export function aplicarTema(tema) {
  if (tema === null) {
    localStorage.removeItem(CLAVE)
    document.documentElement.removeAttribute('data-theme')
    return
  }
  localStorage.setItem(CLAVE, tema)
  document.documentElement.setAttribute('data-theme', tema)
}
