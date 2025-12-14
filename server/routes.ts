import express, { type Express, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { storage } from './storage';
import { stripeService } from './stripeService';
import { getStripePublishableKey, getUncachableStripeClient } from './stripeClient';
import { generateTaekBotResponse, generateClassPlan, generateWelcomeEmail } from './aiService';
import emailService from './services/emailService';
import * as emailAutomation from './services/emailAutomationService';
import { db } from './db';
import { sql } from 'drizzle-orm';
import s3Storage from './services/s3StorageService';

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
        VALUES (${clubName}, ${email}, ${country || 'US'}, NOW(), ${trialEnd.toISOString()}::timestamptz, 'active', 'active', NOW())
        RETURNING id, name, owner_email, trial_start, trial_end
      `);

      const club = (clubResult as any[])[0];

      await db.execute(sql`
        INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
        VALUES (${email}, ${passwordHash}, 'owner', ${club.id}, true, NOW())
        ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}, club_id = ${club.id}
      `);

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
        VALUES ('club_signup', 'New Club Signup', ${'New club signup: ' + clubName}, ${JSON.stringify({ clubId: club.id, email, country })}::jsonb, NOW())
      `);

      await emailAutomation.sendWelcomeEmailAuto(club.id, email, clubName, clubName);

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
      console.error('[Signup] Full error:', error);
      console.error('[Signup] Request body:', req.body);
      return res.status(500).json({ error: 'Failed to create account. Please try again.', details: error.message });
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

  app.post('/api/club/save-wizard-data', async (req: Request, res: Response) => {
    try {
      const { clubId, wizardData } = req.body;
      
      if (!clubId || !wizardData) {
        return res.status(400).json({ error: 'Club ID and wizard data are required' });
      }

      await db.execute(sql`
        UPDATE clubs 
        SET wizard_data = ${JSON.stringify(wizardData)}::jsonb,
            updated_at = NOW()
        WHERE id = ${clubId}::uuid
      `);

      // Try to update onboarding_progress (may not exist on all databases)
      try {
        await db.execute(sql`
          INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
          VALUES (${clubId}::uuid, true, NOW())
          ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true
        `);
      } catch (onboardingErr: any) {
        console.log('[Wizard] onboarding_progress table may not exist, continuing:', onboardingErr);
      }

      // Create user accounts for coaches
      const coaches = wizardData.coaches || [];
      for (const coach of coaches) {
        if (coach.email) {
          try {
            const coachEmail = coach.email.toLowerCase().trim();
            const tempPassword = coach.password || crypto.randomBytes(8).toString('hex');
            const passwordHash = await bcrypt.hash(tempPassword, 10);
            
            // Check if user already exists
            const existingUser = await db.execute(sql`
              SELECT id FROM users WHERE email = ${coachEmail} LIMIT 1
            `);
            
            let userId;
            if ((existingUser as any[]).length > 0) {
              userId = (existingUser as any[])[0].id;
              await db.execute(sql`
                UPDATE users SET 
                  password_hash = ${passwordHash},
                  name = ${coach.name},
                  club_id = ${clubId}::uuid,
                  role = 'coach',
                  updated_at = NOW()
                WHERE id = ${userId}::uuid
              `);
            } else {
              const userResult = await db.execute(sql`
                INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
                VALUES (${coachEmail}, ${passwordHash}, ${coach.name}, 'coach', ${clubId}::uuid, true, NOW())
                RETURNING id
              `);
              userId = (userResult as any[])[0]?.id;
            }
            
            const existingCoach = await db.execute(sql`
              SELECT id FROM coaches WHERE club_id = ${clubId}::uuid AND email = ${coachEmail} LIMIT 1
            `);
            
            if ((existingCoach as any[]).length > 0) {
              await db.execute(sql`
                UPDATE coaches SET user_id = ${userId}::uuid, name = ${coach.name}, is_active = true, updated_at = NOW()
                WHERE id = ${(existingCoach as any[])[0].id}::uuid
              `);
            } else {
              await db.execute(sql`
                INSERT INTO coaches (club_id, user_id, name, email, is_active, created_at)
                VALUES (${clubId}::uuid, ${userId}::uuid, ${coach.name}, ${coachEmail}, true, NOW())
              `);
            }
            console.log('[Wizard] Created user account for coach:', coachEmail);
          } catch (coachErr: any) {
            console.error('[Wizard] Error creating coach account:', coach.email, coachErr.message);
          }
        }
      }

      // Create user accounts for parents and save students
      const students = wizardData.students || [];
      for (const student of students) {
        try {
          const parentEmail = student.parentEmail?.toLowerCase().trim() || null;
          
          const existingStudent = await db.execute(sql`
            SELECT id FROM students WHERE club_id = ${clubId}::uuid AND name = ${student.name} LIMIT 1
          `);
          
          let studentId;
          if ((existingStudent as any[]).length > 0) {
            studentId = (existingStudent as any[])[0].id;
            const birthdateValue = student.birthday ? student.birthday + 'T00:00:00Z' : null;
            await db.execute(sql`
              UPDATE students SET 
                parent_email = ${parentEmail},
                parent_name = ${student.parentName || null},
                parent_phone = ${student.parentPhone || null},
                belt = ${student.beltId || 'white'},
                birthdate = ${birthdateValue}::timestamptz,
                total_points = ${student.totalPoints || 0},
                updated_at = NOW()
              WHERE id = ${studentId}::uuid
            `);
          } else {
            const birthdateValue = student.birthday ? student.birthday + 'T00:00:00Z' : null;
            const insertResult = await db.execute(sql`
              INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, created_at)
              VALUES (${clubId}::uuid, ${student.name}, ${parentEmail}, ${student.parentName || null}, ${student.parentPhone || null}, ${student.beltId || 'white'}, ${birthdateValue}::timestamptz, ${student.totalPoints || 0}, NOW())
              RETURNING id
            `);
            studentId = (insertResult as any[])[0]?.id;
          }
          
          if (parentEmail && student.parentPassword) {
            const existingParent = await db.execute(sql`
              SELECT id FROM users WHERE email = ${parentEmail} LIMIT 1
            `);
            
            const parentPasswordHash = await bcrypt.hash(student.parentPassword, 10);
            
            if ((existingParent as any[]).length > 0) {
              await db.execute(sql`
                UPDATE users SET 
                  password_hash = ${parentPasswordHash},
                  name = COALESCE(${student.parentName || student.name + "'s Parent"}, name),
                  club_id = ${clubId}::uuid,
                  role = 'parent',
                  updated_at = NOW()
                WHERE id = ${(existingParent as any[])[0].id}::uuid
              `);
            } else {
              await db.execute(sql`
                INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
                VALUES (${parentEmail}, ${parentPasswordHash}, ${student.parentName || student.name + "'s Parent"}, 'parent', ${clubId}::uuid, true, NOW())
              `);
            }
            console.log('[Wizard] Created user account for parent:', parentEmail);
          }
        } catch (studentErr: any) {
          console.error('[Wizard] Error saving student:', student.name, studentErr.message);
        }
      }

      console.log('[Wizard] Saved wizard data for club:', clubId, `(${coaches.length} coaches, ${students.length} students)`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error('[Wizard] Save error:', error);
      return res.status(500).json({ error: 'Failed to save wizard data' });
    }
  });

  app.get('/api/club/:clubId/data', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }

      const clubResult = await db.execute(sql`
        SELECT id, name, owner_email, owner_name, country, city, art_type, 
               wizard_data, trial_start, trial_end, trial_status, status
        FROM clubs WHERE id = ${clubId}::uuid
      `);
      const club = (clubResult as any[])[0];

      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const studentsResult = await db.execute(sql`
        SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
               total_xp, current_streak, stripe_count
        FROM students WHERE club_id = ${clubId}::uuid
      `);

      const coachesResult = await db.execute(sql`
        SELECT id, name, email
        FROM coaches WHERE club_id = ${clubId}::uuid AND is_active = true
      `);

      const savedWizardData = club.wizard_data || {};
      const savedBelts = savedWizardData.belts || [];
      
      const getBeltIdFromName = (beltName: string): string => {
        if (!beltName) return savedBelts[0]?.id || 'white';
        const matchedBelt = savedBelts.find((b: any) => 
          b.name?.toLowerCase() === beltName.toLowerCase() ||
          b.id?.toLowerCase() === beltName.toLowerCase()
        );
        return matchedBelt?.id || savedBelts[0]?.id || 'white';
      };
      
      const students = (studentsResult as any[]).map(s => ({
        id: s.id,
        name: s.name,
        parentEmail: s.parent_email,
        parentName: s.parent_name,
        parentPhone: s.parent_phone,
        beltId: getBeltIdFromName(s.belt),
        birthday: s.birthdate,
        totalXP: s.total_xp || 0,
        currentStreak: s.current_streak || 0,
        stripeCount: s.stripe_count || 0,
        performanceHistory: [],
        homeDojo: { character: [], chores: [], school: [], health: [] }
      }));

      const coaches = (coachesResult as any[]).map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        location: c.location || '',
        assignedClasses: c.assigned_classes || []
      }));

      const wizardData = {
        ...savedWizardData,
        students,
        coaches,
        clubName: savedWizardData.clubName || club.name,
        ownerName: savedWizardData.ownerName || club.owner_name || '',
        country: savedWizardData.country || club.country || 'US',
      };

      return res.json({
        success: true,
        club: {
          id: club.id,
          name: club.name,
          ownerEmail: club.owner_email,
          ownerName: club.owner_name,
          trialStart: club.trial_start,
          trialEnd: club.trial_end,
          trialStatus: club.trial_status,
          status: club.status
        },
        wizardData
      });
    } catch (error: any) {
      console.error('[Club Data] Fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch club data' });
    }
  });

  app.post('/api/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      const userResult = await db.execute(
        sql`SELECT u.id, u.email, u.password_hash, u.role, u.name, u.club_id, u.is_active,
                   c.name as club_name, c.owner_email, c.status as club_status, c.trial_status, c.trial_end,
                   c.wizard_data IS NOT NULL as has_wizard_data
            FROM users u
            LEFT JOIN clubs c ON u.club_id = c.id
            WHERE LOWER(u.email) = ${normalizedEmail} AND u.is_active = true
            LIMIT 1`
      );

      const user = (userResult as any[])[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.password_hash) {
        return res.status(401).json({ error: 'Please set up your password first. Check your email for an invitation link.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      console.log('[Login] User authenticated:', user.email, 'Role:', user.role);

      let wizardCompleted = false;
      let wizardData = null;
      
      if (user.club_id) {
        // Fetch wizard_data from clubs table
        const clubDataResult = await db.execute(
          sql`SELECT wizard_data FROM clubs WHERE id = ${user.club_id}::uuid LIMIT 1`
        );
        const clubData = (clubDataResult as any[])[0];
        if (clubData?.wizard_data && Object.keys(clubData.wizard_data).length > 0) {
          wizardData = clubData.wizard_data;
          wizardCompleted = true;
        }
        
        // Also check onboarding_progress table
        const progressResult = await db.execute(
          sql`SELECT wizard_completed FROM onboarding_progress WHERE club_id = ${user.club_id}::uuid LIMIT 1`
        );
        const progress = (progressResult as any[])[0];
        if (progress?.wizard_completed) {
          wizardCompleted = true;
        }
        
        // Auto-recover if wizard_data exists but onboarding_progress doesn't
        if (wizardData && !progress?.wizard_completed) {
          await db.execute(sql`
            INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
            VALUES (${user.club_id}::uuid, true, NOW())
            ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true
          `);
          console.log('[Login] Auto-recovered wizard_completed for club:', user.club_id);
        }
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('user_login', 'User Login', ${'User logged in: ' + user.email}, ${user.club_id}::uuid, ${JSON.stringify({ email: user.email, role: user.role })}::jsonb, NOW())
      `);

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.club_name,
          role: user.role,
          clubId: user.club_id,
          clubName: user.club_name,
          clubStatus: user.club_status,
          trialStatus: user.trial_status,
          trialEnd: user.trial_end,
          wizardCompleted
        },
        wizardData
      });

    } catch (error: any) {
      console.error('[Login] Error:', error.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
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

  app.post('/api/stripe-connect/onboard', async (req: Request, res: Response) => {
    try {
      const { clubId, email, clubName } = req.body;
      
      if (!clubId) {
        return res.status(400).json({ error: 'Club ID is required' });
      }

      const stripe = await getUncachableStripeClient();
      const appUrl = process.env.APP_URL || 'https://mytaek.com';

      const clubResult = await db.execute(sql`
        SELECT stripe_connect_account_id, owner_email, name FROM clubs WHERE id = ${clubId}
      `);
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const ownerEmail = email || club.owner_email;
      const ownerClubName = clubName || club.name;
      
      if (!ownerEmail) {
        return res.status(400).json({ error: 'Email is required for bank connection' });
      }
      
      let accountId = club?.stripe_connect_account_id;

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: ownerEmail,
          business_profile: {
            name: ownerClubName || 'Martial Arts Club',
            product_description: 'Martial arts training and curriculum videos'
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        await db.execute(sql`
          UPDATE clubs SET stripe_connect_account_id = ${accountId} WHERE id = ${clubId}
        `);
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${appUrl}/app/admin?tab=creator&connect=refresh`,
        return_url: `${appUrl}/app/admin?tab=creator&connect=success`,
        type: 'account_onboarding',
      });

      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error('Stripe Connect onboarding error:', error);
      res.status(500).json({ error: 'Failed to create bank connection link' });
    }
  });

  app.get('/api/stripe-connect/status/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      const clubResult = await db.execute(sql`
        SELECT stripe_connect_account_id FROM clubs WHERE id = ${clubId}
      `);
      const club = (clubResult as any[])[0];
      
      if (!club?.stripe_connect_account_id) {
        return res.json({ connected: false, chargesEnabled: false, payoutsEnabled: false });
      }

      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(club.stripe_connect_account_id);
      
      res.json({
        connected: true,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ error: 'Failed to get connect status' });
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

      // Use APP_URL for production, fallback to Replit domain or request host
      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
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

  app.get('/api/verify-checkout-session', async (req: Request, res: Response) => {
    try {
      const { session_id } = req.query;
      
      if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ error: 'session_id is required' });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      res.json({
        success: session.payment_status === 'paid',
        email: session.customer_email || session.customer_details?.email,
        planName: session.metadata?.planName || 'Premium Plan',
        customerId: session.customer,
        subscriptionId: session.subscription,
      });
    } catch (error: any) {
      console.error('Error verifying checkout session:', error);
      res.status(500).json({ error: 'Failed to verify session' });
    }
  });

  app.post('/api/customer-portal', async (req: Request, res: Response) => {
    try {
      const { customerId } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'customerId is required' });
      }

      // Use APP_URL for production, fallback to Replit domain or request host
      const baseUrl = process.env.APP_URL || (() => {
        const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        if (replitDomain) return `https://${replitDomain}`;
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

  app.post('/api/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const userResult = await db.execute(
        sql`SELECT id, email, name FROM users WHERE email = ${email} AND is_active = true LIMIT 1`
      );
      
      const user = (userResult as any[])[0];
      
      if (!user) {
        return res.json({ 
          success: true, 
          message: 'If an account exists with this email, a password reset link has been sent.' 
        });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.execute(sql`
        UPDATE users 
        SET reset_token = ${resetToken}, reset_token_expires_at = ${expiresAt.toISOString()}::timestamptz
        WHERE id = ${user.id}
      `);

      const emailResult = await emailService.sendResetPasswordEmail(user.email, {
        userName: user.name || 'User',
        resetToken: resetToken
      });

      if (emailResult.success) {
        console.log('[Password Reset] Email sent to:', email);
        
        await db.execute(sql`
          INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
          VALUES ('password_reset_requested', 'Password Reset Requested', ${'Password reset requested for ' + email}, ${JSON.stringify({ email })}::jsonb, NOW())
        `);
      } else {
        console.error('[Password Reset] Failed to send email:', emailResult.error);
      }

      res.json({ 
        success: true, 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      });
    } catch (error: any) {
      console.error('[Forgot Password] Error:', error.message);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  });

  app.post('/api/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      const updateResult = await db.execute(sql`
        UPDATE users 
        SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
        WHERE reset_token = ${token} 
        AND reset_token_expires_at > NOW()
        AND is_active = true
        RETURNING id, email, name
      `);
      
      const user = (updateResult as any[])[0];
      
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
        VALUES ('password_reset_completed', 'Password Reset Completed', ${'Password reset completed for ' + user.email}, ${JSON.stringify({ email: user.email })}::jsonb, NOW())
      `);

      console.log('[Password Reset] Password updated for:', user.email);

      res.json({ success: true, message: 'Password has been reset successfully' });
    } catch (error: any) {
      console.error('[Reset Password] Error:', error.message);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.post('/api/students', async (req: Request, res: Response) => {
    try {
      const { clubId, name, parentEmail, parentName, parentPhone, belt, birthdate } = req.body;
      
      if (!clubId || !name) {
        return res.status(400).json({ error: 'Club ID and student name are required' });
      }

      const clubResult = await db.execute(
        sql`SELECT id, name, owner_email, owner_name FROM clubs WHERE id = ${clubId}::uuid`
      );
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const studentResult = await db.execute(sql`
        INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, created_at)
        VALUES (${clubId}::uuid, ${name}, ${parentEmail || null}, ${parentName || null}, ${parentPhone || null}, ${belt || 'White'}, ${birthdate ? birthdate + 'T00:00:00Z' : null}::timestamptz, NOW())
        RETURNING id, name, parent_email, parent_name, belt
      `);
      
      const student = (studentResult as any[])[0];

      const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

      const notifyEmailResult = await emailService.sendNewStudentAddedEmail(club.owner_email, {
        studentName: name,
        clubName: club.name,
        beltLevel: belt || 'White',
        studentAge: age ? `${age} years old` : 'Not specified',
        parentName: parentName || 'Not specified',
        studentId: student.id
      });

      if (notifyEmailResult.success) {
        console.log('[New Student] Notification email sent to club owner:', club.owner_email);
      }

      if (parentEmail) {
        await emailAutomation.sendParentWelcomeEmailAuto(
          clubId,
          student.id,
          parentEmail,
          parentName || 'Parent',
          name,
          club.name
        );
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('student_added', 'New Student Added', ${'New student added: ' + name}, ${clubId}::uuid, ${JSON.stringify({ studentId: student.id, studentName: name, parentEmail })}::jsonb, NOW())
      `);

      res.status(201).json({
        success: true,
        student: {
          id: student.id,
          name: student.name,
          parentEmail: student.parent_email,
          parentName: student.parent_name,
          belt: student.belt
        }
      });
    } catch (error: any) {
      console.error('[Add Student] Error:', error.message);
      res.status(500).json({ error: 'Failed to add student' });
    }
  });

  app.post('/api/invite-coach', async (req: Request, res: Response) => {
    try {
      const { clubId, name, email, location, assignedClasses } = req.body;
      
      if (!clubId || !name || !email) {
        return res.status(400).json({ error: 'Club ID, coach name, and email are required' });
      }

      const clubResult = await db.execute(sql`
        SELECT id, name, owner_email FROM clubs WHERE id = ${clubId}::uuid
      `);
      
      const club = (clubResult as any[])[0];
      
      if (!club) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const tempPassword = crypto.randomBytes(8).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Insert into users table for authentication
      const userResult = await db.execute(sql`
        INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
        VALUES (${email}, ${passwordHash}, ${name}, 'coach', ${clubId}::uuid, true, NOW())
        ON CONFLICT (email) DO UPDATE SET name = ${name}, club_id = ${clubId}::uuid, role = 'coach', is_active = true
        RETURNING id
      `);
      const userId = (userResult as any[])[0]?.id;

      // Also insert into coaches table for data fetching
      // First check if coach already exists
      const existingCoach = await db.execute(sql`
        SELECT id FROM coaches WHERE email = ${email} LIMIT 1
      `);
      
      if ((existingCoach as any[]).length > 0) {
        await db.execute(sql`
          UPDATE coaches SET name = ${name}, club_id = ${clubId}::uuid, is_active = true, invite_sent_at = NOW()
          WHERE email = ${email}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO coaches (id, club_id, user_id, name, email, is_active, invite_sent_at, created_at)
          VALUES (gen_random_uuid(), ${clubId}::uuid, ${userId}::uuid, ${name}, ${email}, true, NOW(), NOW())
        `);
      }

      await emailService.sendCoachInviteEmail(email, {
        coachName: name,
        clubName: club.name,
        coachEmail: email,
        tempPassword: tempPassword,
        ownerName: club.name
      });

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('coach_invited', 'Coach Invited', ${'Coach invited: ' + name}, ${clubId}::uuid, ${JSON.stringify({ coachEmail: email, coachName: name })}::jsonb, NOW())
      `);

      console.log('[Invite Coach] Coach invited:', email, 'to club:', club.name);

      res.status(201).json({
        success: true,
        coach: {
          email: email,
          name: name,
          location: location,
          assignedClasses: assignedClasses
        }
      });
    } catch (error: any) {
      console.error('[Invite Coach] Error:', error.message);
      res.status(500).json({ error: 'Failed to invite coach' });
    }
  });

  app.put('/api/students/:id/link-parent', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { parentEmail, parentName, parentPhone } = req.body;
      
      if (!parentEmail) {
        return res.status(400).json({ error: 'Parent email is required' });
      }

      const studentResult = await db.execute(sql`
        SELECT s.id, s.name, s.parent_email, c.id as club_id, c.name as club_name 
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE s.id = ${id}::uuid
        LIMIT 1
      `);
      
      const student = (studentResult as any[])[0];
      
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const hadParentBefore = !!student.parent_email;

      await db.execute(sql`
        UPDATE students 
        SET parent_email = ${parentEmail}, parent_name = ${parentName || null}, parent_phone = ${parentPhone || null}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);

      if (!hadParentBefore) {
        await emailAutomation.sendParentWelcomeEmailAuto(
          student.club_id,
          student.id,
          parentEmail,
          parentName || 'Parent',
          student.name,
          student.club_name
        );
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES ('parent_linked', 'Parent Linked', ${'Parent linked to student: ' + student.name}, ${student.club_id}::uuid, ${JSON.stringify({ studentId: id, parentEmail })}::jsonb, NOW())
      `);

      res.json({ 
        success: true, 
        message: hadParentBefore ? 'Parent information updated' : 'Parent linked and welcome email sent'
      });
    } catch (error: any) {
      console.error('[Link Parent] Error:', error.message);
      res.status(500).json({ error: 'Failed to link parent to student' });
    }
  });

  // Content Analytics - Record content view/completion
  app.post('/api/content/view', async (req: Request, res: Response) => {
    try {
      const { contentId, studentId, completed, xpAwarded } = req.body;
      
      if (!contentId) {
        return res.status(400).json({ error: 'Content ID is required' });
      }

      // Check if view already exists for this content/student
      const existingView = await db.execute(sql`
        SELECT id, completed FROM content_views 
        WHERE content_id = ${contentId}::uuid 
        ${studentId ? sql`AND student_id = ${studentId}::uuid` : sql`AND student_id IS NULL`}
        LIMIT 1
      `);

      if ((existingView as any[]).length > 0) {
        // Update existing view if completing
        if (completed && !(existingView as any[])[0].completed) {
          await db.execute(sql`
            UPDATE content_views 
            SET completed = true, completed_at = NOW(), xp_awarded = ${xpAwarded || 0}
            WHERE id = ${(existingView as any[])[0].id}::uuid
          `);
          
          // Increment completion count on content
          await db.execute(sql`
            UPDATE curriculum_content 
            SET completion_count = COALESCE(completion_count, 0) + 1
            WHERE id = ${contentId}::uuid
          `);
        }
        return res.json({ success: true, action: 'updated' });
      }

      // Create new view record
      await db.execute(sql`
        INSERT INTO content_views (content_id, student_id, completed, completed_at, xp_awarded, viewed_at)
        VALUES (
          ${contentId}::uuid, 
          ${studentId ? sql`${studentId}::uuid` : sql`NULL`}, 
          ${completed || false}, 
          ${completed ? sql`NOW()` : sql`NULL`}, 
          ${xpAwarded || 0}, 
          NOW()
        )
      `);

      // Increment view count on content
      await db.execute(sql`
        UPDATE curriculum_content 
        SET view_count = COALESCE(view_count, 0) + 1
        ${completed ? sql`, completion_count = COALESCE(completion_count, 0) + 1` : sql``}
        WHERE id = ${contentId}::uuid
      `);

      res.json({ success: true, action: 'created' });
    } catch (error: any) {
      console.error('[Content View] Error:', error.message);
      res.status(500).json({ error: 'Failed to record content view' });
    }
  });

  // Content Analytics - Get analytics for a club's content
  app.get('/api/content/analytics/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;

      // Get total views and completions per content
      const contentStats = await db.execute(sql`
        SELECT 
          cc.id,
          cc.title,
          cc.content_type,
          cc.belt_id,
          cc.pricing_type,
          cc.xp_reward,
          COALESCE(cc.view_count, 0) as view_count,
          COALESCE(cc.completion_count, 0) as completion_count,
          COUNT(cv.id) as tracked_views,
          COUNT(CASE WHEN cv.completed = true THEN 1 END) as tracked_completions
        FROM curriculum_content cc
        LEFT JOIN content_views cv ON cc.id = cv.content_id
        WHERE cc.club_id = ${clubId}::uuid
        GROUP BY cc.id, cc.title, cc.content_type, cc.belt_id, cc.pricing_type, cc.xp_reward
        ORDER BY cc.created_at DESC
      `);

      // Get total XP awarded
      const xpStats = await db.execute(sql`
        SELECT COALESCE(SUM(cv.xp_awarded), 0) as total_xp_awarded
        FROM content_views cv
        JOIN curriculum_content cc ON cv.content_id = cc.id
        WHERE cc.club_id = ${clubId}::uuid
      `);

      res.json({
        success: true,
        content: contentStats,
        totalXpAwarded: (xpStats as any[])[0]?.total_xp_awarded || 0
      });
    } catch (error: any) {
      console.error('[Content Analytics] Error:', error.message);
      res.status(500).json({ error: 'Failed to get content analytics' });
    }
  });

  // =====================================================
  // RIVALS CHALLENGES API - Real-time student challenges
  // =====================================================

  app.post('/api/challenges', async (req: Request, res: Response) => {
    try {
      const challenge = req.body;
      const id = `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await db.execute(sql`
        INSERT INTO challenges (id, from_student_id, from_student_name, to_student_id, to_student_name, challenge_id, challenge_name, challenge_xp, status, created_at, expires_at)
        VALUES (${id}, ${challenge.from_student_id}, ${challenge.from_student_name}, ${challenge.to_student_id}, ${challenge.to_student_name}, ${challenge.challenge_id}, ${challenge.challenge_name}, ${challenge.challenge_xp}, 'pending', NOW(), ${expiresAt}::timestamptz)
      `);

      res.json({ success: true, id, expires_at: expiresAt });
    } catch (error: any) {
      console.error('[Challenges] Create error:', error.message);
      res.status(500).json({ error: 'Failed to create challenge' });
    }
  });

  app.get('/api/challenges/received/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const challenges = await db.execute(sql`
        SELECT * FROM challenges WHERE to_student_id = ${studentId} ORDER BY created_at DESC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[Challenges] Fetch received error:', error.message);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  app.get('/api/challenges/sent/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      const challenges = await db.execute(sql`
        SELECT * FROM challenges WHERE from_student_id = ${studentId} ORDER BY created_at DESC
      `);
      res.json(challenges);
    } catch (error: any) {
      console.error('[Challenges] Fetch sent error:', error.message);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  app.put('/api/challenges/:challengeId/accept', async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;
      const { score } = req.body;

      const existing = await db.execute(sql`SELECT * FROM challenges WHERE id = ${challengeId}`);
      if (!(existing as any[])[0]) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = (existing as any[])[0];
      const fromScore = Math.floor(Math.random() * 100);
      const winnerId = score > fromScore ? challenge.to_student_id : challenge.from_student_id;

      await db.execute(sql`
        UPDATE challenges 
        SET status = 'completed', to_score = ${score}, from_score = ${fromScore}, winner_id = ${winnerId}, completed_at = NOW()
        WHERE id = ${challengeId}
      `);

      res.json({ success: true, winner_id: winnerId, from_score: fromScore, to_score: score });
    } catch (error: any) {
      console.error('[Challenges] Accept error:', error.message);
      res.status(500).json({ error: 'Failed to accept challenge' });
    }
  });

  app.put('/api/challenges/:challengeId/decline', async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;
      await db.execute(sql`UPDATE challenges SET status = 'declined' WHERE id = ${challengeId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Challenges] Decline error:', error.message);
      res.status(500).json({ error: 'Failed to decline challenge' });
    }
  });

  // =====================================================
  // VIDEO VERIFICATION ENDPOINTS
  // =====================================================

  app.post('/api/videos/presigned-upload', async (req: Request, res: Response) => {
    try {
      const { studentId, challengeId, filename, contentType } = req.body;
      
      console.log('[Videos] Presigned upload request:', { studentId, challengeId, filename, contentType });
      
      if (!studentId || !challengeId || !filename) {
        return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
      }

      // Check if S3 credentials are configured
      if (!process.env.IDRIVE_E2_ACCESS_KEY || !process.env.IDRIVE_E2_SECRET_KEY || !process.env.IDRIVE_E2_BUCKET_NAME || !process.env.IDRIVE_E2_ENDPOINT) {
        console.error('[Videos] Missing S3 configuration:', {
          hasAccessKey: !!process.env.IDRIVE_E2_ACCESS_KEY,
          hasSecretKey: !!process.env.IDRIVE_E2_SECRET_KEY,
          hasBucket: !!process.env.IDRIVE_E2_BUCKET_NAME,
          hasEndpoint: !!process.env.IDRIVE_E2_ENDPOINT
        });
        return res.status(500).json({ error: 'Video storage not configured. Please contact support.' });
      }

      const result = await s3Storage.getPresignedUploadUrl(
        studentId,
        challengeId,
        filename,
        contentType || 'video/mp4'
      );

      console.log('[Videos] Presigned URL generated successfully');
      res.json(result);
    } catch (error: any) {
      console.error('[Videos] Presigned upload error:', error.message);
      console.error('[Videos] Full error:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  app.post('/api/videos', async (req: Request, res: Response) => {
    try {
      const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, score } = req.body;
      
      console.log('[Videos] Save request:', { studentId, clubId, challengeId, challengeName });
      
      if (!studentId || !clubId || !challengeId || !videoUrl) {
        console.log('[Videos] Missing fields:', { studentId: !!studentId, clubId: !!clubId, challengeId: !!challengeId, videoUrl: !!videoUrl });
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(studentId)) {
        console.log('[Videos] Invalid student ID format:', studentId);
        return res.status(400).json({ error: 'Invalid student ID format. Please log out and log back in.' });
      }
      if (!uuidRegex.test(clubId)) {
        console.log('[Videos] Invalid club ID format:', clubId);
        return res.status(400).json({ error: 'Invalid club ID format. Please log out and log back in.' });
      }

      const result = await db.execute(sql`
        INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, score, status, created_at, updated_at)
        VALUES (${studentId}::uuid, ${clubId}::uuid, ${challengeId}, ${challengeName || ''}, ${challengeCategory || ''}, ${videoUrl}, ${videoKey || ''}, ${score || 0}, 'pending', NOW(), NOW())
        RETURNING id
      `);

      const video = (result as any[])[0];
      
      // Send email notification to coaches
      try {
        const studentResult = await db.execute(sql`SELECT name FROM students WHERE id = ${studentId}::uuid`);
        const clubResult = await db.execute(sql`
          SELECT c.name as club_name, co.email as coach_email, co.name as coach_name
          FROM clubs c
          LEFT JOIN coaches co ON co.club_id = c.id AND co.is_active = true
          WHERE c.id = ${clubId}::uuid
        `);
        
        const studentName = (studentResult as any[])[0]?.name || 'Student';
        const clubData = clubResult as any[];
        
        for (const coach of clubData.filter(c => c.coach_email)) {
          emailService.sendVideoSubmittedNotification(coach.coach_email, {
            coachName: coach.coach_name || 'Coach',
            studentName,
            challengeName: challengeName || challengeId,
            clubName: coach.club_name || 'Your Club'
          }).catch(err => console.error('[Videos] Email notification error:', err));
        }
      } catch (emailErr) {
        console.error('[Videos] Email notification setup error:', emailErr);
      }
      
      res.json({ success: true, videoId: video?.id });
    } catch (error: any) {
      console.error('[Videos] Create error:', error.message);
      console.error('[Videos] Full error:', error);
      res.status(500).json({ error: `Failed to save video record: ${error.message}` });
    }
  });

  app.get('/api/videos/pending/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      
      const videos = await db.execute(sql`
        SELECT cv.*, s.name as student_name, s.belt as student_belt
        FROM challenge_videos cv
        JOIN students s ON cv.student_id = s.id
        WHERE cv.club_id = ${clubId}::uuid AND cv.status = 'pending'
        ORDER BY cv.created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch pending error:', error.message);
      res.status(500).json({ error: 'Failed to get pending videos' });
    }
  });

  app.get('/api/videos/approved/:clubId', async (req: Request, res: Response) => {
    try {
      const { clubId } = req.params;
      const { studentId } = req.query;
      
      const videos = await db.execute(sql`
        SELECT cv.*, s.name as student_name, s.belt as student_belt,
               CASE WHEN cvv.id IS NOT NULL THEN true ELSE false END as has_voted
        FROM challenge_videos cv
        JOIN students s ON cv.student_id = s.id
        LEFT JOIN challenge_video_votes cvv ON cv.id = cvv.video_id 
          AND cvv.voter_student_id = ${studentId ? studentId : null}::uuid
        WHERE cv.club_id = ${clubId}::uuid AND cv.status = 'approved'
        ORDER BY cv.vote_count DESC, cv.created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch approved error:', error.message);
      res.status(500).json({ error: 'Failed to get approved videos' });
    }
  });

  app.put('/api/videos/:videoId/verify', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const { status, coachNotes, coachId, xpAwarded } = req.body;
      
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be approved or rejected' });
      }

      await db.execute(sql`
        UPDATE challenge_videos 
        SET status = ${status}::video_status, 
            coach_notes = ${coachNotes || null}, 
            verified_by = ${coachId ? coachId : null}::uuid, 
            verified_at = NOW(),
            xp_awarded = ${xpAwarded || 0},
            updated_at = NOW()
        WHERE id = ${videoId}::uuid
      `);

      // Send email notification to parent
      try {
        const videoResult = await db.execute(sql`
          SELECT cv.challenge_name, s.name as student_name, s.parent_email, s.parent_name
          FROM challenge_videos cv
          JOIN students s ON cv.student_id = s.id
          WHERE cv.id = ${videoId}::uuid
        `);
        
        const videoData = (videoResult as any[])[0];
        if (videoData?.parent_email) {
          emailService.sendVideoVerifiedNotification(videoData.parent_email, {
            parentName: videoData.parent_name || 'Parent',
            studentName: videoData.student_name,
            challengeName: videoData.challenge_name,
            status: status as 'approved' | 'rejected',
            coachNotes: coachNotes || undefined,
            xpAwarded: status === 'approved' ? (xpAwarded || 0) : undefined
          }).catch(err => console.error('[Videos] Parent notification error:', err));
        }
      } catch (emailErr) {
        console.error('[Videos] Parent notification setup error:', emailErr);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Videos] Verify error:', error.message);
      res.status(500).json({ error: 'Failed to verify video' });
    }
  });

  app.post('/api/videos/:videoId/vote', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      const { voterStudentId } = req.body;
      
      if (!voterStudentId) {
        return res.status(400).json({ error: 'voterStudentId is required' });
      }

      const existing = await db.execute(sql`
        SELECT id FROM challenge_video_votes 
        WHERE video_id = ${videoId}::uuid AND voter_student_id = ${voterStudentId}::uuid
      `);

      if ((existing as any[]).length > 0) {
        return res.status(400).json({ error: 'Already voted on this video' });
      }

      await db.execute(sql`
        INSERT INTO challenge_video_votes (video_id, voter_student_id, vote_value, created_at)
        VALUES (${videoId}::uuid, ${voterStudentId}::uuid, 1, NOW())
      `);

      await db.execute(sql`
        UPDATE challenge_videos 
        SET vote_count = vote_count + 1, updated_at = NOW()
        WHERE id = ${videoId}::uuid
      `);

      res.json({ success: true });
    } catch (error: any) {
      console.error('[Videos] Vote error:', error.message);
      res.status(500).json({ error: 'Failed to vote' });
    }
  });

  app.get('/api/videos/student/:studentId', async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;
      
      const videos = await db.execute(sql`
        SELECT * FROM challenge_videos 
        WHERE student_id = ${studentId}::uuid
        ORDER BY created_at DESC
      `);

      res.json(videos);
    } catch (error: any) {
      console.error('[Videos] Fetch student videos error:', error.message);
      res.status(500).json({ error: 'Failed to get student videos' });
    }
  });
}
