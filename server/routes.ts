import express, { type Express, type Request, type Response } from 'express';
import { storage } from './storage';
import { stripeService } from './stripeService';
import { getStripePublishableKey, getUncachableStripeClient } from './stripeClient';
import { generateTaekBotResponse, generateClassPlan, generateWelcomeEmail } from './aiService';

let cachedProducts: any[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function registerRoutes(app: Express) {
  app.post('/api/ai/taekbot', async (req: Request, res: Response) => {
    try {
      const { message, clubName, artType, language } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }
      
      const response = await generateTaekBotResponse(message, {
        name: clubName || 'your dojo',
        artType: artType || 'martial arts',
        language: language || 'English'
      });
      
      res.json({ response });
    } catch (error: any) {
      console.error('TaekBot error:', error.message);
      res.status(500).json({ error: 'Failed to generate response' });
    }
  });

  app.post('/api/ai/class-plan', async (req: Request, res: Response) => {
    try {
      const { beltLevel, focusArea, classDuration, studentCount, language } = req.body;
      
      const plan = await generateClassPlan({
        beltLevel: beltLevel || 'All Levels',
        focusArea: focusArea || 'General Training',
        classDuration: classDuration || 60,
        studentCount: studentCount || 10,
        language: language || 'English'
      });
      
      res.json({ plan });
    } catch (error: any) {
      console.error('Class plan error:', error.message);
      res.status(500).json({ error: 'Failed to generate class plan' });
    }
  });

  app.post('/api/ai/welcome-email', async (req: Request, res: Response) => {
    try {
      const { clubName, studentName, parentName, artType, language } = req.body;
      
      const email = await generateWelcomeEmail({
        clubName: clubName || 'Your Dojo',
        studentName: studentName || 'Student',
        parentName: parentName || 'Parent',
        artType: artType || 'martial arts',
        language: language || 'English'
      });
      
      res.json({ email });
    } catch (error: any) {
      console.error('Welcome email error:', error.message);
      res.status(500).json({ error: 'Failed to generate welcome email' });
    }
  });
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

      if (rows && (rows as any[]).length > 0) {
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
      } else {
        const now = Date.now();
        if (cachedProducts && (now - cacheTimestamp) < CACHE_TTL_MS) {
          res.json({ data: cachedProducts });
          return;
        }
        
        const stripe = await getUncachableStripeClient();
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
        
        cachedProducts = result;
        cacheTimestamp = now;
        
        res.json({ data: result });
      }
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
