import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'

function superAdminLoginPlugin(): Plugin {
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  
  return {
    name: 'super-admin-login',
    configureServer(server) {
      // Create WebSocket server for secure authentication
      const wss = new WebSocketServer({ noServer: true });
      
      wss.on('connection', (ws: WebSocket) => {
        console.log('[SA WS] Client connected');
        
        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'login') {
              const { email, password } = message;
              console.log('[SA WS] Login attempt from:', email);
              
              if (!email || !password) {
                ws.send(JSON.stringify({ type: 'error', error: 'Email and password required' }));
                return;
              }
              
              if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
                const token = crypto.randomBytes(32).toString('hex');
                console.log('[SA WS] Login SUCCESS for:', email);
                
                ws.send(JSON.stringify({
                  type: 'success',
                  token,
                  expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                  email
                }));
              } else {
                console.log('[SA WS] Invalid credentials for:', email);
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid credentials' }));
              }
            }
          } catch (err) {
            console.error('[SA WS] Error:', err);
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
          }
        });
        
        ws.on('close', () => {
          console.log('[SA WS] Client disconnected');
        });
      });
      
      // Handle WebSocket upgrade for /sa-auth path
      server.httpServer?.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        
        if (url.pathname === '/sa-auth') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });
      
      console.log('[SA Auth] WebSocket endpoint ready at /sa-auth');
    }
  };
}

export default defineConfig({
  plugins: [react(), superAdminLoginPlugin()],
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
        secure: false
      }
    },
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
