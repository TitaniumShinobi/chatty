import path from 'node:path'
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to redirect seatRunner imports to browserSeatRunner in browser builds
function excludeSeatRunnerPlugin(): Plugin {
  return {
    name: 'exclude-seat-runner',
    resolveId(id, importer) {
      // Only redirect if this is being imported in browser context (not in Node.js/server)
      // Check if the import path matches seatRunner patterns
      if ((id.includes('engine/seatRunner') || id === '../engine/seatRunner' || id === '../../engine/seatRunner') 
          && importer && !importer.includes('node_modules')) {
        // Redirect to browserSeatRunner for browser builds
        return {
          id: path.resolve(__dirname, 'src/lib/browserSeatRunner.ts'),
          external: false
        }
      }
      return null
    }
  }
}

// https://vitejs.dev/config/
// Ensure .env.local has VITE_* vars and restart Vite after changes
export default defineConfig({
  plugins: [react(), excludeSeatRunnerPlugin()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: [
      // Exclude Node.js-only modules from Vite's dependency optimization
      'src/engine/seatRunner',
      '../engine/seatRunner',
      '../../engine/seatRunner'
    ]
  },
  resolve: {
    alias: [
      // Redirect Node.js-only modules to browser-friendly stubs
      { find: 'better-sqlite3', replacement: path.resolve(__dirname, 'src/lib/browserShims/betterSqlite3Stub.ts') },
      { find: 'fs', replacement: path.resolve(__dirname, 'src/lib/browserShims/nodeFsStub.ts') },
      { find: 'path', replacement: path.resolve(__dirname, 'src/lib/browserShims/nodePathStub.ts') },
      { find: 'crypto', replacement: path.resolve(__dirname, 'src/lib/browserShims/nodeCryptoStub.ts') },
      { find: 'util', replacement: path.resolve(__dirname, 'src/lib/browserShims/nodeUtilStub.ts') },
      // Force any seatRunner imports in the browser to use the browser runner
      // Match various import path patterns
      { find: /^.*\/engine\/seatRunner(\.ts)?$/, replacement: path.resolve(__dirname, 'src/lib/browserSeatRunner.ts') },
      { find: /^.*engine\/seatRunner(\.ts)?$/, replacement: path.resolve(__dirname, 'src/lib/browserSeatRunner.ts') },
      { find: '../engine/seatRunner', replacement: path.resolve(__dirname, 'src/lib/browserSeatRunner.ts') },
      { find: '../../engine/seatRunner', replacement: path.resolve(__dirname, 'src/lib/browserSeatRunner.ts') }
    ]
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      protocol: 'wss',
      clientPort: 443
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
