import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes';
import { WebhookHandlers } from './webhookHandlers';
import { superAdminRouter, addSuperAdminSession } from './superAdminRoutes';
import * as emailAutomation from './services/emailAutomationService';
import { deleteVideo } from './services/s3StorageService';
import { db } from './db';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Super Admin credentials
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Super Admin GET-based authentication (workaround for POST blocking)
// Using unique paths to avoid edge caching
app.get('/api/sa-init', (req, res) => {
  const sessionId = crypto.randomBytes(16).toString('hex');
  console.log('[SA Init API] Created session:', sessionId);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({ sessionId });
});

app.get('/api/sa-submit', async (req, res) => {
  const sessionId = req.query.s as string;
  const encoded = req.query.d as string;
  
  console.log('[SA Submit API] Request received');
  
  if (!sessionId || !encoded) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const { email, password } = JSON.parse(decoded);
    
    console.log('[SA Submit API] Login attempt from:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      const token = crypto.randomBytes(32).toString('hex');
      console.log('[SA Submit API] SUCCESS for:', email);
      
      // Register session for token validation (database-backed for serverless)
      await addSuperAdminSession(token, email);
      
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.json({
        success: true,
        token,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        email
      });
    } else {
      console.log('[SA Submit API] Invalid credentials for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('[SA Submit API] Error:', err);
    return res.status(400).json({ error: 'Invalid data format' });
  }
});

// Alternative auth endpoints with .json extension to force JSON response
app.get('/api/auth/init.json', (req, res) => {
  const sessionId = crypto.randomBytes(16).toString('hex');
  console.log('[SA Init JSON] Created session:', sessionId);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(JSON.stringify({ sessionId }));
});

app.get('/api/auth/verify.json', async (req, res) => {
  const encoded = req.query.d as string;
  
  console.log('[SA Verify JSON] Request received');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (!encoded) {
    return res.status(400).send(JSON.stringify({ error: 'Missing parameters' }));
  }
  
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const { email, password } = JSON.parse(decoded);
    
    console.log('[SA Verify JSON] Login attempt from:', email);
    
    if (!email || !password) {
      return res.status(400).send(JSON.stringify({ error: 'Email and password required' }));
    }
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      const token = crypto.randomBytes(32).toString('hex');
      console.log('[SA Verify JSON] SUCCESS for:', email);
      
      // Register session for token validation (database-backed for serverless)
      await addSuperAdminSession(token, email);
      
      return res.send(JSON.stringify({
        success: true,
        token,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        email
      }));
    } else {
      console.log('[SA Verify JSON] Invalid credentials for:', email);
      return res.status(401).send(JSON.stringify({ error: 'Invalid credentials' }));
    }
  } catch (err) {
    console.error('[SA Verify JSON] Error:', err);
    return res.status(400).send(JSON.stringify({ error: 'Invalid data format' }));
  }
});

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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

// Serve static files in production only
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
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
}

async function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server v2.1.0 running on port ${PORT}`);
  });
  
  initStripe().catch(err => {
    console.error('Stripe init failed:', err.message);
  });

  console.log('[EmailAutomation] Starting email scheduler...');
  
  setTimeout(() => {
    console.log('[EmailAutomation] Running initial scheduled email tasks...');
    emailAutomation.runScheduledEmailTasks().catch(err => {
      console.error('[EmailAutomation] Initial run error:', err.message);
    });
  }, 10000);
  
  setInterval(() => {
    console.log('[EmailAutomation] Running scheduled email tasks...');
    emailAutomation.runScheduledEmailTasks().catch(err => {
      console.error('[EmailAutomation] Scheduler error:', err.message);
    });
  }, 60 * 60 * 1000);

  async function cleanupOldApprovedVideos() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const oldVideos = await db.execute(sql`
        SELECT id, video_key, video_url FROM challenge_videos 
        WHERE status = 'approved' AND created_at < ${thirtyDaysAgo.toISOString()}
        AND (video_key IS NOT NULL AND video_key != '' OR video_url IS NOT NULL AND video_url != '')
        LIMIT 50
      `);
      
      const rows = oldVideos as any[];
      if (rows.length === 0) return;
      
      console.log(`[VideoCleanup] Found ${rows.length} approved videos older than 30 days`);
      let deleted = 0;
      
      for (const video of rows) {
        try {
          if (video.video_key) {
            await deleteVideo(video.video_key);
          }
          await db.execute(sql`
            UPDATE challenge_videos 
            SET video_url = NULL, video_key = NULL
            WHERE id = ${video.id}
          `);
          deleted++;
        } catch (err: any) {
          console.error(`[VideoCleanup] Failed to delete video ${video.id}:`, err.message);
        }
      }
      console.log(`[VideoCleanup] Cleaned ${deleted}/${rows.length} old videos`);
    } catch (err: any) {
      console.error('[VideoCleanup] Error:', err.message);
    }
  }

  setTimeout(() => cleanupOldApprovedVideos(), 30000);
  setInterval(() => cleanupOldApprovedVideos(), 24 * 60 * 60 * 1000);
}

startServer();
