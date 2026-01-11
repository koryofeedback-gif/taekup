import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { Pool } from 'pg';

function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.SANDBOX_STRIPE_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { priceId, clubId, email } = body;

    console.log(`[/api/checkout] Received request:`, { priceId, clubId, email });

    if (!priceId) {
      console.error('[/api/checkout] Missing priceId');
      return res.status(400).json({ error: 'priceId is required' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Use APP_URL for production, fallback to request host
    const baseUrl = process.env.APP_URL || (() => {
      const host = req.headers.host || 'mytaek.com';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      return `${protocol}://${host}`;
    })();

    // Check if user already has a trial status - skip Stripe trial if so
    let shouldSkipTrial = false;
    if (clubId) {
      const pool = getPool();
      if (pool) {
        const client = await pool.connect();
        try {
          const result = await client.query(
            `SELECT trial_status FROM clubs WHERE id = $1::uuid`,
            [clubId]
          );
          if (result.rows.length > 0 && result.rows[0].trial_status) {
            shouldSkipTrial = true;
            console.log('[/api/checkout] Skipping Stripe trial - already has trial_status:', result.rows[0].trial_status);
          }
        } catch (e) {
          console.error('[/api/checkout] Error checking trial status:', e);
        } finally {
          client.release();
        }
      }
    }

    console.log(`[/api/checkout] Creating session with:`, { priceId, baseUrl, shouldSkipTrial });

    const subscriptionData: any = { metadata: { clubId: clubId || '', email: email || '' } };
    if (!shouldSkipTrial) {
      subscriptionData.trial_period_days = 14;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/app/admin?subscription=success`,
      cancel_url: `${baseUrl}/app/pricing?subscription=cancelled`,
      metadata: { clubId: clubId || '', email: email || '' },
      subscription_data: subscriptionData,
    });

    console.log(`[/api/checkout] Session created:`, { sessionId: session.id, url: session.url });
    return res.json({ url: session.url });
  } catch (error: any) {
    console.error('[/api/checkout] Error creating checkout session:', error);
    return res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
