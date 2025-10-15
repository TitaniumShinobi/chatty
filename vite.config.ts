import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Ensure .env.local has VITE_* vars and restart Vite after changes
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // Exclude Node.js modules from browser bundle
      'better-sqlite3': false,
      'fs': false,
      'path': false,
      'crypto': false,
      'util': false,
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',   // strip domain for Set-Cookie
        cookiePathRewrite: '/'      // ensure path is /
      },
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ollama/, '')
      }
    }
  }
  // no custom define block; use import.meta.env.VITE_*
})
