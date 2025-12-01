import express, { type Express, type Request, type Response } from 'express';
import { storage } from './storage';
import { stripeService } from './stripeService';
import { getStripePublishableKey } from './stripeClient';

export function registerRoutes(app: Express) {
  app.get('/api/stripe/publishable-key', async (req: Request, res: Response) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error('Error getting publishable key:', error);
      res.status(500).json({ error: 'Failed to get Stripe key' });
    }
  });

  app.get('/api/products', async (req: Request, res: Response) => {
    try {
      const products = await storage.listProducts();
      res.json({ data: products });
    } catch (error: any) {
      console.error('Error listing products:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.get('/api/products-with-prices', async (req: Request, res: Response) => {
    try {
      const rows = await storage.listProductsWithPrices();

      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
            metadata: row.price_metadata,
          });
        }
      }

      res.json({ data: Array.from(productsMap.values()) });
    } catch (error: any) {
      console.error('Error listing products with prices:', error);
      res.status(500).json({ error: 'Failed to list products' });
    }
  });

  app.get('/api/prices', async (req: Request, res: Response) => {
    try {
      const prices = await storage.listPrices();
      res.json({ data: prices });
    } catch (error: any) {
      console.error('Error listing prices:', error);
      res.status(500).json({ error: 'Failed to list prices' });
    }
  });

  app.post('/api/checkout', async (req: Request, res: Response) => {
    try {
      const { priceId, clubId, email } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: 'priceId is required' });
      }

      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${host}`;

      const session = await stripeService.createCheckoutSession(
        priceId,
        `${baseUrl}/app/admin?subscription=success`,
        `${baseUrl}/app/pricing?subscription=cancelled`,
        undefined,
        { clubId: clubId || '', email: email || '' }
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  app.post('/api/customer-portal', async (req: Request, res: Response) => {
    try {
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${host}`;

      const session = await stripeService.createCustomerPortalSession(
        customerId,
        `${baseUrl}/app/admin`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Error creating portal session:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });
}
