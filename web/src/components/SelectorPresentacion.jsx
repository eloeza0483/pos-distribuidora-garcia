import { useState } from 'react'
import { PRESENTACIONES_COMUNES, OTRA_PRESENTACION } from '../lib/formato.js'

// Select con las presentaciones ya en uso (pieza/bulto/caja) + "Otra…" que
// revela un input de texto libre. Evita variantes como "Bulto"/"cja" que no
// calzarían con las presentaciones que ya existen en la base.
//
// El modo "libre" se guarda aparte del valor: si solo se derivara de
// `value === ''`, escribir "Otra…" y borrar el texto haría que el select
// saltara de vuelta a "Selecciona…" en cada tecla.
export default function SelectorPresentacion({ value, onChange, id }) {
  const [modoLibre, setModoLibre] = useState(() => value !== '' && !PRESENTACIONES_COMUNES.includes(value))

  const opcionSeleccionada = modoLibre ? OTRA_PRESENTACION : value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <select
        id={id}
        value={opcionSeleccionada}
        onChange={(e) => {
          const elegido = e.target.value
          if (elegido === OTRA_PRESENTACION) {
            setModoLibre(true)
            onChange('')
            return
          }
          setModoLibre(false)
          onChange(elegido)
        }}
      >
        <option value="" disabled>Selecciona…</option>
        {PRESENTACIONES_COMUNES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
        <option value={OTRA_PRESENTACION}>Otra…</option>
      </select>

      {modoLibre && (
        <input
          type="text"
          placeholder="Escribe la presentación"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}
