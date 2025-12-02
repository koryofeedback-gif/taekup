import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.SANDBOX_STRIPE_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

function getEnvDebug() {
  return {
    hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasSandboxStripeKey: !!process.env.SANDBOX_STRIPE_KEY,
    keyPrefix: process.env.SANDBOX_STRIPE_KEY?.substring(0, 7) || 'none',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured', debug: getEnvDebug() });
    }

    const products = await stripe.products.list({ active: true, limit: 20 });
    const prices = await stripe.prices.list({ active: true, limit: 100 });
    
    const pricesByProduct = new Map<string, any[]>();
    for (const price of prices.data) {
      const productId = typeof price.product === 'string' ? price.product : price.product.id;
      if (!pricesByProduct.has(productId)) {
        pricesByProduct.set(productId, []);
      }
      pricesByProduct.get(productId)!.push({
        id: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
        active: price.active,
        metadata: price.metadata,
      });
    }
    
    const result = products.data.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      metadata: product.metadata,
      prices: pricesByProduct.get(product.id) || [],
    }));
    
    return res.json({ data: result });
  } catch (error: any) {
    console.error('Error listing products with prices:', error);
    return res.status(500).json({ error: 'Failed to list products' });
  }
}
