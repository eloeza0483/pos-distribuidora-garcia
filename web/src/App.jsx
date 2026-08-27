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
            <NavLink to="/mostrador" className="flex-shrink-0 flex items-center gap-2">
              <span className="flex-shrink-0 w-9 h-7 rounded-lg flex items-center justify-center overflow-hidden" style={{ background: '#16233f' }} aria-hidden="true">
                <svg width="26" height="16" viewBox="0 0 62 40">
                  <text x="0" y="31" fontFamily="'Zilla Slab', Georgia, serif" fontWeight="700" fontSize="34" fill="#6bb8dc">D</text>
                  <text x="26" y="31" fontFamily="'Zilla Slab', Georgia, serif" fontWeight="700" fontSize="34" fill="#6bb8dc">G</text>
                </svg>
              </span>
              <span className="flex flex-col leading-tight">
                <span className="font-heading font-bold text-[0.95rem]">Distribuidora García</span>
                <span className="text-[0.58rem] font-semibold tracking-wide text-white/75 -mt-0.5 hidden sm:block">venta de desechables y bolsas</span>
              </span>
            </NavLink>
            <nav className="flex gap-1 mr-auto overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    'flex-shrink-0 text-white/80 no-underline px-[0.85rem] py-[0.4rem] rounded-full text-sm font-medium transition-colors duration-150 hover:bg-white/10 hover:text-white' +
                    (isActive ? ' bg-accent !text-accent-ink hover:bg-accent hover:!text-accent-ink' : '')
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
