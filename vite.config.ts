import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Suppress ECONNREFUSED proxy errors during startup (backend takes a moment to start)
const originalError = console.error
const originalLog = console.log
console.error = (...args: any[]) => {
  const message = args.join(' ')
  // Filter out ECONNREFUSED proxy errors - these are expected during startup
  if (message.includes('ECONNREFUSED') || 
      message.includes('http proxy error') ||
      message.includes('AggregateError') && message.includes('ECONNREFUSED')) {
    return // Suppress these errors
  }
  originalError.apply(console, args)
}
// Also filter console.log for Vite's proxy error messages
console.log = (...args: any[]) => {
  const message = args.join(' ')
  // Filter out Vite proxy error logs
  if (message.includes('[vite] http proxy error') || 
      (message.includes('ECONNREFUSED') && message.includes('[vite]'))) {
    return // Suppress these logs
  }
  originalLog.apply(console, args)
}

// https://vitejs.dev/config/
// Ensure .env.local has VITE_* vars and restart Vite after changes
export default defineConfig({
  plugins: [
    react({
      // Enable Fast Refresh to preserve component state during HMR
      fastRefresh: true,
    })
  ],
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
      'node:fs': false,
      'node:path': false,
      'node:http': false,
      'node:https': false,
      'node:url': false,
    }
  },
  build: {
    rollupOptions: {
      external: [
        'node:fs',
        'node:path', 
        'node:http',
        'node:https',
        'node:url'
      ]
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      // Prevent full page reloads - use HMR instead
      overlay: true,
      // Don't disconnect on file changes
      clientPort: 5173,
    },
    watch: {
      // Ignore certain files that don't need to trigger reloads
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/vvault/**'],
    },
    proxy: {
      // NOTE: Backend port must match PORT in server/.env
      // Backend runs on 5000, frontend on 5173, proxy forwards /api to backend
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',   // strip domain for Set-Cookie
        cookiePathRewrite: '/',      // ensure path is /
        // Suppress ECONNREFUSED errors during startup (expected when backend isn't ready yet)
        onError: (err, req, res) => {
          // Only suppress connection errors during startup
          if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
            // Send 503 Service Unavailable to prevent frontend retry loops
            // Frontend should use waitForBackendReady() before making requests
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                ok: false, 
                error: 'Backend not ready',
                retryAfter: 1 
              }));
            }
            return;
          }
          // Log other errors
          console.error('[Vite Proxy] Error:', err.message);
        }
      },
      '/chatty-sync': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',   // strip domain for Set-Cookie
        cookiePathRewrite: '/',      // ensure path is /
        // Suppress ECONNREFUSED errors during startup
        onError: (err, req, res) => {
          if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
            if (!res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                ok: false, 
                error: 'Backend not ready',
                retryAfter: 1 
              }));
            }
            return;
          }
          console.error('[Vite Proxy] Error:', err.message);
        }
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
