import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes';
import { WebhookHandlers } from './webhookHandlers';
import { superAdminRouter } from './superAdminRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/super-admin')) {
    console.log(`[SuperAdmin] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  }
  next();
});

let stripeInitialized = false;

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('DATABASE_URL not set - Stripe sync will be skipped');
    return;
  }

  try {
    console.log('Initializing Stripe...');
    
    const { runMigrations } = await import('stripe-replit-sync');
    const { getStripeSync } = await import('./stripeClient');
    
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    const webhookBaseUrl = domains[0] ? `https://${domains[0]}` : `http://localhost:${PORT}`;
    
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`,
        {
          enabled_events: ['*'],
          description: 'TaekUp Stripe webhook',
        }
      );
      if (result && result.webhook) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook created (URL not returned)');
      }
    } catch (webhookError: any) {
      console.warn('Webhook setup skipped:', webhookError.message || webhookError);
    }

    console.log('Syncing Stripe data in background...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err.message));
    
    stripeInitialized = true;
  } catch (error: any) {
    console.error('Stripe initialization error:', error.message);
    console.log('Server will continue without Stripe - configure Stripe connection in Replit');
  }
}

app.post(
  '/api/stripe/webhook/:uuid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      const { uuid } = req.params;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', stripeInitialized });
});

app.use('/api/super-admin', superAdminRouter);

// Direct login endpoint (bypasses any /api caching issues)
app.post('/sa-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
    const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
    
    console.log('[SA-Login] Attempt from:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      console.log('[SA-Login] Success for:', email);
      return res.json({
        success: true,
        token,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        email
      });
    }
    
    console.log('[SA-Login] Invalid credentials for:', email);
    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (error: any) {
    console.error('[SA-Login] Error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

registerRoutes(app);

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

async function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
  
  initStripe().catch(err => {
    console.error('Stripe init failed:', err.message);
  });
}

startServer();
