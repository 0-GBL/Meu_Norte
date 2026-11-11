import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const proxy = { '/api': 'http://127.0.0.1:3001' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy, fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))] } },
  preview: { proxy },
})
