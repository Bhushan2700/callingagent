import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
      '/tool': 'http://localhost:8000',
      '/webhook': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
      '/static': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  }
})
