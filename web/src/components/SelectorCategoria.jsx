import { useState } from 'react'

const NUEVA_CATEGORIA = '__nueva__'

// Select de categorías + "+ Nueva categoría…", que revela un campo para
// crearla al vuelo sin salir del formulario donde se está usando.
export default function SelectorCategoria({ categorias, value, onChange, onCrear, id }) {
  const [creando, setCreando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function confirmarNueva() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const categoria = await onCrear(nombre)
      if (categoria) {
        onChange(categoria.id)
        setCreando(false)
        setNombreNuevo('')
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <select
        id={id}
        value={creando ? NUEVA_CATEGORIA : (value ?? '')}
        onChange={(e) => {
          if (e.target.value === NUEVA_CATEGORIA) {
            setCreando(true)
            return
          }
          setCreando(false)
          onChange(e.target.value ? Number(e.target.value) : null)
        }}
      >
        <option value="">Sin categoría</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
        <option value={NUEVA_CATEGORIA}>+ Nueva categoría…</option>
      </select>

      {creando && (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            type="text"
            placeholder="Nombre de la categoría"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={confirmarNueva}
            disabled={guardando || !nombreNuevo.trim()}
          >
            {guardando ? 'Creando…' : 'Crear'}
          </button>
        </div>
      )}
    </div>
  )
}
