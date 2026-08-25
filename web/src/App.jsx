import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Mostrador from './pages/Mostrador.jsx'
import Inventario from './pages/Inventario.jsx'
import Productos from './pages/Productos.jsx'
import Ventas from './pages/Ventas.jsx'
import { ProveedorConfirmacion } from './components/Confirmacion.jsx'
import { obtenerTemaGuardado, aplicarTema } from './lib/tema.js'

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
      className="flex-shrink-0 rounded-full border border-white/35 bg-white/10 text-white px-3 py-[0.35rem] text-[0.82rem] font-medium cursor-pointer transition-colors duration-150 hover:bg-white/20"
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
        <div className="flex min-h-full flex-col">
          <header className="flex items-center gap-4 px-4 h-14 bg-primary text-white shadow-sm">
            <NavLink to="/mostrador" className="flex-shrink font-bold tracking-wide"> Distribuidora García</NavLink>
            <nav className="flex gap-1 mr-auto overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    'flex-shrink-0 text-white/80 no-underline px-[0.85rem] py-[0.4rem] rounded-full text-sm font-medium transition-colors duration-150 hover:bg-white/10 hover:text-white' +
                    (isActive ? ' bg-accent text-[#201304] hover:bg-accent hover:text-[#201304]' : '')
                  }
                >
                  {item.label }
                </NavLink>
              ))}
            </nav>
            <BotonTema />
          </header>
          <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
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
