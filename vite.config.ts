
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy] ${req.method} ${req.url} -> ${proxyReq.path}`);
          });
          proxy.on('error', (err, req, res) => {
            console.error('[Vite Proxy Error]', err.message);
          });
        }
      },
      '/sa-login': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[Vite Proxy SA] ${req.method} ${req.url} -> ${proxyReq.path}`);
          });
        }
      }
    },
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
