import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // El celular/tablet (túnel o IP de la red local en 5173) pega al mismo origen;
    // Vite reenvía al API local.
    host: true,
    allowedHosts: ['.trycloudflare.com', '.devtunnels.ms'],
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/uploads': 'http://127.0.0.1:3001',
      '/health': 'http://127.0.0.1:3001',
    },
  },
})
