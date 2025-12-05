import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

function superAdminLoginPlugin(): Plugin {
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  
  // Pending login requests (for SSE-based auth)
  const pendingLogins = new Map<string, { email: string; password: string; resolve: (data: any) => void }>();
  
  return {
    name: 'super-admin-login',
    configureServer(server) {
      // Step 1: Client initiates login via GET (creates a pending login session)
      server.middlewares.use('/sa-init', (req, res, next) => {
        if (req.method !== 'GET') return next();
        
        const sessionId = crypto.randomBytes(16).toString('hex');
        console.log('[SA Init] Created session:', sessionId);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.end(JSON.stringify({ sessionId }));
      });
      
      // Step 2: Client sends credentials via query params (base64 encoded for obfuscation)
      server.middlewares.use('/sa-submit', (req, res, next) => {
        if (req.method !== 'GET') return next();
        
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const sessionId = url.searchParams.get('s');
        const encoded = url.searchParams.get('d');
        
        if (!sessionId || !encoded) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing parameters' }));
          return;
        }
        
        try {
          const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
          const { email, password } = JSON.parse(decoded);
          
          console.log('[SA Submit] Login attempt from:', email);
          
          if (!email || !password) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Email and password required' }));
            return;
          }
          
          if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
            const token = crypto.randomBytes(32).toString('hex');
            console.log('[SA Submit] SUCCESS for:', email);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache, no-store');
            res.end(JSON.stringify({
              success: true,
              token,
              expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
              email
            }));
          } else {
            console.log('[SA Submit] Invalid credentials for:', email);
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
          }
        } catch (err) {
          console.error('[SA Submit] Error:', err);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid data format' }));
        }
      });
      
      console.log('[SA Auth] Endpoints ready at /sa-init and /sa-submit');
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
