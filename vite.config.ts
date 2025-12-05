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
      // Universal middleware to catch all SA auth requests
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        
        // Step 1: Client initiates login via GET
        if (url.startsWith('/sa-init')) {
          console.log('[SA Init] Request received:', req.method, url);
          
          if (req.method !== 'GET') {
            return next();
          }
          
          const sessionId = crypto.randomBytes(16).toString('hex');
          console.log('[SA Init] Created session:', sessionId);
          
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.end(JSON.stringify({ sessionId }));
          return;
        }
        
        // Step 2: Client sends credentials
        if (url.startsWith('/sa-submit')) {
          console.log('[SA Submit] Request received:', req.method, url);
          
          if (req.method !== 'GET') {
            return next();
          }
          
          const parsedUrl = new URL(url, `http://${req.headers.host}`);
          const sessionId = parsedUrl.searchParams.get('s');
          const encoded = parsedUrl.searchParams.get('d');
          
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
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
          return;
        }
        
        next();
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
