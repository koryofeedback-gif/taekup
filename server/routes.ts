import express, { type Express, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from './storage';
import { stripeService } from './stripeService';
import { getStripePublishableKey, getUncachableStripeClient } from './stripeClient';
import { generateTaekBotResponse, generateClassPlan, generateWelcomeEmail } from './aiService';
import emailService from './services/emailService';
import { db } from './db';
import { sql } from 'drizzle-orm';

let cachedProducts: any[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function registerRoutes(app: Express) {
  app.post('/api/signup', async (req: Request, res: Response) => {
    try {
      const { clubName, email, password, country } = req.body;

      if (!clubName || !email || !password) {
        return res.status(400).json({ error: 'Club name, email, and password are required' });
      }

      const existingClub = await db.execute(
        sql`SELECT id FROM clubs WHERE owner_email = ${email}`
      );

      if ((existingClub as any[]).length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      const clubResult = await db.execute(sql`
        INSERT INTO clubs (name, owner_email, country, trial_start, trial_end, trial_status, status, created_at)
        VALUES (${clubName}, ${email}, ${country || 'United States'}, NOW(), ${trialEnd}, 'active', 'active', NOW())
        RETURNING id, name, owner_email, trial_start, trial_end
      `);

      const club = (clubResult as any[])[0];

      await db.execute(sql`
        INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
        VALUES (${email}, ${passwordHash}, 'owner', ${club.id}, true, NOW())
        ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, club_id = ${club.id}
      `);

      await db.execute(sql`
        INSERT INTO activity_log (event_type, description, metadata, created_at)
        VALUES ('club_signup', ${'New club signup: ' + clubName}, ${JSON.stringify({ clubId: club.id, email, country })}, NOW())
      `);

      const emailResult = await emailService.sendWelcomeEmail(email, {
        ownerName: clubName,
        clubName: clubName
      });

      if (emailResult.success) {
        console.log('[Signup] Welcome email sent to:', email);
        await db.execute(sql`
          INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
          VALUES (${club.id}, ${email}, 'welcome', 'Welcome to TaekUp', 'sent', NOW())
        `);
      }

      console.log('[Signup] New club created:', club.id, clubName);

      return res.status(201).json({
        success: true,
        club: {
          id: club.id,
          name: club.name,
          email: club.owner_email,
          trialStart: club.trial_start,
          trialEnd: club.trial_end
        }
      });

    } catch (error: any) {
      console.error('[Signup] Error:', error.message);
      return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
  });

  app.post('/api/verify-password', (req: Request, res: Response) => {
    const sitePassword = process.env.SITE_PASSWORD;
    
    if (!sitePassword) {
      return res.json({ valid: true });
    }

    const { password } = req.body || {};

    if (password === sitePassword) {
      return res.json({ valid: true });
    }

    return res.status(401).json({ valid: false, error: 'Incorrect password' });
  });

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

      console.log(`[/api/checkout] Received request:`, { priceId, clubId, email });

      if (!priceId) {
        console.error('[/api/checkout] Missing priceId');
        return res.status(400).json({ error: 'priceId is required' });
      }

      // Use APP_URL for production, fallback to request host for development
      const baseUrl = process.env.APP_URL || (() => {
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

      console.log(`[/api/checkout] Creating session with:`, { priceId, baseUrl });

      const session = await stripeService.createCheckoutSession(
        priceId,
        `${baseUrl}/wizard?subscription=success`,
        `${baseUrl}/pricing?subscription=cancelled`,
        undefined,
        { clubId: clubId || '', email: email || '' }
      );

      console.log(`[/api/checkout] Session created:`, { sessionId: session.id, url: session.url });
      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[/api/checkout] Error creating checkout session:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/customer-portal', async (req: Request, res: Response) => {
    try {
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      // Use APP_URL for production, fallback to request host for development
      const baseUrl = process.env.APP_URL || (() => {
        const host = req.headers.host || 'localhost:5000';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        return `${protocol}://${host}`;
      })();

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

  app.post('/api/test-email', async (req: Request, res: Response) => {
    try {
      const { emailType, to } = req.body;

      if (!to) {
        return res.status(400).json({ error: 'Email address (to) is required' });
      }

      if (!emailType) {
        return res.status(400).json({ error: 'Email type is required' });
      }

      const testData = {
        ownerName: 'Master Hamed',
        clubName: 'Elite Taekwondo Academy',
        coachName: 'Coach Kim',
        coachEmail: to,
        tempPassword: 'TempPass123!',
        userName: 'Test User',
        resetToken: 'test-token-12345',
        studentName: 'Sarah Johnson',
        beltLevel: 'Yellow Belt',
        studentAge: '10',
        parentName: 'John Johnson',
        studentId: 'stu_test123',
        daysLeft: 3,
        monthName: 'December',
        totalEarnings: '350',
        premiumParents: 25,
        newThisMonth: 5,
        className: 'Little Tigers',
        classDate: 'Dec 4, 2025',
        feedbackText: 'Sarah showed excellent focus today and nailed her turning kick! Her dedication is really paying off.',
        highlights: '✨ Perfect form on front kicks<br>✨ Helped younger students<br>✨ Earned 50 XP',
        feedbackId: 'fb_test456',
        beltColor: 'YELLOW',
        promotionDate: 'December 4, 2025',
        totalXp: '2,500',
        classesAttended: 48,
        monthsTrained: 6,
        promotionId: 'promo_test789',
        daysSinceLastClass: 14,
      };

      let result;
      
      switch (emailType) {
        case 'welcome':
          result = await emailService.sendWelcomeEmail(to, testData);
          break;
        case 'day3':
          result = await emailService.sendDay3CheckinEmail(to, testData);
          break;
        case 'day7':
          result = await emailService.sendDay7MidTrialEmail(to, testData);
          break;
        case 'trial-ending':
          result = await emailService.sendTrialEndingSoonEmail(to, testData);
          break;
        case 'trial-expired':
          result = await emailService.sendTrialExpiredEmail(to, testData);
          break;
        case 'coach-invite':
          result = await emailService.sendCoachInviteEmail(to, testData);
          break;
        case 'reset-password':
          result = await emailService.sendResetPasswordEmail(to, testData);
          break;
        case 'new-student':
          result = await emailService.sendNewStudentAddedEmail(to, testData);
          break;
        case 'revenue-report':
          result = await emailService.sendMonthlyRevenueReportEmail(to, testData);
          break;
        case 'parent-welcome':
          result = await emailService.sendParentWelcomeEmail(to, testData);
          break;
        case 'class-feedback':
          result = await emailService.sendClassFeedbackEmail(to, testData);
          break;
        case 'belt-promotion':
          result = await emailService.sendBeltPromotionEmail(to, testData);
          break;
        case 'attendance-alert':
          result = await emailService.sendAttendanceAlertEmail(to, testData);
          break;
        case 'birthday':
          result = await emailService.sendBirthdayWishEmail(to, testData);
          break;
        default:
          return res.status(400).json({ 
            error: 'Invalid email type',
            validTypes: [
              'welcome', 'day3', 'day7', 'trial-ending', 'trial-expired',
              'coach-invite', 'reset-password', 'new-student', 'revenue-report',
              'parent-welcome', 'class-feedback', 'belt-promotion', 
              'attendance-alert', 'birthday'
            ]
          });
      }

      if (result.success) {
        res.json({ 
          success: true, 
          message: `Test email "${emailType}" sent to ${to}`,
          messageId: result.messageId 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error: any) {
      console.error('Test email error:', error);
      res.status(500).json({ error: error.message || 'Failed to send test email' });
    }
  });

  app.get('/api/test-email/types', (req: Request, res: Response) => {
    res.json({
      types: [
        { id: 'welcome', name: 'Welcome Email', from: 'hello@mytaek.com' },
        { id: 'day3', name: 'Day 3 Check-in', from: 'hello@mytaek.com' },
        { id: 'day7', name: 'Day 7 Mid-Trial', from: 'hello@mytaek.com' },
        { id: 'trial-ending', name: 'Trial Ending Soon', from: 'hello@mytaek.com' },
        { id: 'trial-expired', name: 'Trial Expired', from: 'hello@mytaek.com' },
        { id: 'coach-invite', name: 'Coach Invite', from: 'noreply@mytaek.com' },
        { id: 'reset-password', name: 'Reset Password', from: 'noreply@mytaek.com' },
        { id: 'new-student', name: 'New Student Added', from: 'noreply@mytaek.com' },
        { id: 'revenue-report', name: 'Monthly Revenue Report', from: 'hello@mytaek.com' },
        { id: 'parent-welcome', name: 'Parent Welcome', from: 'hello@mytaek.com' },
        { id: 'class-feedback', name: 'Class Feedback', from: 'hello@mytaek.com' },
        { id: 'belt-promotion', name: 'Belt Promotion', from: 'hello@mytaek.com' },
        { id: 'attendance-alert', name: 'Attendance Alert', from: 'hello@mytaek.com' },
        { id: 'birthday', name: 'Birthday Wish', from: 'hello@mytaek.com' },
      ]
    });
  });
}
