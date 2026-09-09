import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    // Todas las pruebas comparten una sola base Postgres real (ver test/setup.js).
    // El corte de caja y el tablero de deudores son consultas globales del día
    // ("today"), así que dos archivos de prueba corriendo en paralelo pueden
    // contaminar las aserciones de delta del uno con las ventas del otro.
    // Sin esto, credito.test.js es intermitente contra sales.test.js.
    fileParallelism: false
  }
})
