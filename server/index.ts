import express from 'express';
import { registerRoutes } from './routes';
import { WebhookHandlers } from './webhookHandlers';

const app = express();
const PORT = process.env.PORT || 3001;

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

registerRoutes(app);

async function startServer() {
  app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
  });
  
  initStripe().catch(err => {
    console.error('Stripe init failed:', err.message);
  });
}

startServer();
