import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Mostrador from './pages/Mostrador.jsx'
import Inventario from './pages/Inventario.jsx'
import Productos from './pages/Productos.jsx'
import Ventas from './pages/Ventas.jsx'
import { ProveedorConfirmacion } from './components/Confirmacion.jsx'
import { obtenerTemaGuardado, aplicarTema } from './lib/tema.js'
import './App.css'

const navItems = [
  { to: '/mostrador', label: 'Mostrador' },
  { to: '/ventas', label: 'Ventas' },
  { to: '/inventario', label: 'Inventario' },
  { to: '/productos', label: 'Productos' }
]

// Ciclo de 3 estados con un solo botón: cabe en el header angosto sin
// necesitar un menú. null = sigue al sistema.
const OPCIONES_TEMA = [
  { valor: null, icono: '🖥', etiqueta: 'Automático' },
  { valor: 'light', icono: '☀︎', etiqueta: 'Claro' },
  { valor: 'dark', icono: '☾', etiqueta: 'Oscuro' }
]

function BotonTema() {
  const [tema, setTema] = useState(() => obtenerTemaGuardado())

  useEffect(() => {
    aplicarTema(tema)
  }, [tema])

  const indice = OPCIONES_TEMA.findIndex((o) => o.valor === tema)
  const actual = OPCIONES_TEMA[indice]

  function siguiente() {
    setTema(OPCIONES_TEMA[(indice + 1) % OPCIONES_TEMA.length].valor)
  }

  return (
    <button
      className="btn-tema"
      onClick={siguiente}
      title={`Tema: ${actual.etiqueta} (clic para cambiar)`}
    >
      <span aria-hidden="true">{actual.icono}</span> {actual.etiqueta}
    </button>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorConfirmacion>
        <div className="app-shell">
          <header className="app-header">
            <span className="app-brand"> Distribuidora García</span>
            <nav className="app-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => 'app-nav-link' + (isActive ? ' active' : '')}
                >
                  {item.label }
                </NavLink>
              ))}
            </nav>
            <BotonTema />
          </header>
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Navigate to="/mostrador" replace />} />
              <Route path="/mostrador" element={<Mostrador />} />
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/productos" element={<Productos />} />
            </Routes>
          </main>
        </div>
      </ProveedorConfirmacion>
    </BrowserRouter>
  )
}
