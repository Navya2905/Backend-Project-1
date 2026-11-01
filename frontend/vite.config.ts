import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser talks to Vite only; Vite forwards /api to the
    // NestJS backend, so there is no cross-origin setup to get wrong.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
