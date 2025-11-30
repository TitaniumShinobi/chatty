import path from 'node:path'
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
      // Redirect Node.js-only modules to browser-friendly stubs
      'better-sqlite3': path.resolve(__dirname, 'src/lib/browserShims/betterSqlite3Stub.ts'),
      fs: path.resolve(__dirname, 'src/lib/browserShims/nodeFsStub.ts'),
      path: path.resolve(__dirname, 'src/lib/browserShims/nodePathStub.ts'),
      crypto: path.resolve(__dirname, 'src/lib/browserShims/nodeCryptoStub.ts'),
      util: path.resolve(__dirname, 'src/lib/browserShims/nodeUtilStub.ts'),
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
