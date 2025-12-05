import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

function superAdminLoginPlugin(): Plugin {
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  
  return {
    name: 'super-admin-login',
    configureServer(server) {
      server.middlewares.use('/direct-sa-login', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }
        
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { email, password } = JSON.parse(body);
            console.log('[Direct SA Login] Attempt from:', email);
            
            if (!email || !password) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Email and password required' }));
              return;
            }
            
            if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
              const token = crypto.randomBytes(32).toString('hex');
              console.log('[Direct SA Login] Success for:', email);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                token,
                expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
                email
              }));
            } else {
              console.log('[Direct SA Login] Invalid credentials for:', email);
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid credentials' }));
            }
          } catch (err) {
            console.error('[Direct SA Login] Error:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Login failed' }));
          }
        });
      });
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
