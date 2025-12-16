import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Stripe from 'stripe';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sgMail from '@sendgrid/mail';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

const EMAIL_TEMPLATES = {
  WELCOME: 'd-c75234cb326144f68395a66668081ee8',
  PARENT_WELCOME: 'd-7747be090c32477e8589d8985608d055',
  COACH_INVITE: 'd-60ecd12425c14aa3a7f5ef5fb2c374d5',
  RESET_PASSWORD: 'd-ec4e0df3381549f6a3cfc6d202a62d8b',
};

async function sendTemplateEmail(to: string, templateId: string, dynamicData: Record<string, any>): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[SendGrid] No API key configured, skipping email');
    return false;
  }
  
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to,
      from: { email: 'hello@mytaek.com', name: 'TaekUp' },
      templateId,
      dynamicTemplateData: {
        ...dynamicData,
        dashboardUrl: 'https://www.mytaek.com/app/admin',
        loginUrl: 'https://www.mytaek.com/login',
        upgradeUrl: 'https://www.mytaek.com/pricing',
      },
    });
    console.log(`[SendGrid] Email sent to ${to} with template ${templateId}`);
    return true;
  } catch (error: any) {
    console.error('[SendGrid] Failed to send email:', error.message);
    return false;
  }
}

async function logAutomatedEmail(client: any, triggerType: string, recipient: string, templateId: string, status: string, clubId?: string) {
  try {
    await client.query(
      `INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, club_id)
       VALUES ($1, $2, $3, $4::email_status, $5::uuid)`,
      [triggerType, recipient, templateId, status, clubId]
    );
  } catch (err) {
    console.error('[EmailLog] Failed to log:', err);
  }
}

function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.SANDBOX_STRIPE_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI | null {
  if (!geminiClient && process.env.GOOGLE_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req: VercelRequest) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { email, password } = parseBody(req);
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const client = await pool.connect();
  try {
    const userResult = await client.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.name, u.club_id, u.is_active,
              c.name as club_name, c.status as club_status, c.trial_status, c.trial_end, c.wizard_data
       FROM users u LEFT JOIN clubs c ON u.club_id = c.id
       WHERE LOWER(u.email) = $1 AND u.is_active = true LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.password_hash) return res.status(401).json({ error: 'Please set up your password first.' });
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    // Check if wizard is completed (wizard_data exists in clubs table or onboarding_progress)
    let wizardCompleted = false;
    if (user.wizard_data && Object.keys(user.wizard_data).length > 0) {
      wizardCompleted = true;
    } else {
      // Fallback: check onboarding_progress table
      const onboardingResult = await client.query(
        `SELECT wizard_completed FROM onboarding_progress WHERE club_id = $1::uuid LIMIT 1`,
        [user.club_id]
      );
      if (onboardingResult.rows.length > 0 && onboardingResult.rows[0].wizard_completed) {
        wizardCompleted = true;
      }
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('user_login', 'User Login', $1, $2, $3, NOW())`,
      ['User logged in: ' + user.email, user.club_id, JSON.stringify({ email: user.email, role: user.role })]
    );

    // CRITICAL: For parent users, look up their student by parent_email
    let studentId = null;
    if (user.role === 'parent') {
      const studentResult = await client.query(
        `SELECT id FROM students WHERE LOWER(parent_email) = $1 AND club_id = $2::uuid LIMIT 1`,
        [user.email.toLowerCase().trim(), user.club_id]
      );
      if (studentResult.rows.length > 0) {
        studentId = studentResult.rows[0].id;
        console.log('[Login] Found student for parent:', user.email, '-> studentId:', studentId);
      } else {
        console.log('[Login] No student found for parent email:', user.email);
      }
    }

    return res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name || user.club_name, role: user.role,
              clubId: user.club_id, clubName: user.club_name, clubStatus: user.club_status,
              trialStatus: user.trial_status, trialEnd: user.trial_end, wizardCompleted,
              studentId: studentId },
      wizardData: user.wizard_data || null
    });
  } finally { client.release(); }
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubName, email, password, country } = parseBody(req);
  if (!clubName || !email || !password) return res.status(400).json({ error: 'Club name, email, and password are required' });

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM clubs WHERE owner_email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 14);

    const clubResult = await client.query(
      `INSERT INTO clubs (name, owner_email, country, trial_start, trial_end, trial_status, status, created_at)
       VALUES ($1, $2, $3, NOW(), $4, 'active', 'active', NOW()) RETURNING id, name, owner_email, trial_start, trial_end`,
      [clubName, email, country || 'United States', trialEnd]
    );
    const club = clubResult.rows[0];

    await client.query(
      `INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
       VALUES ($1, $2, 'owner', $3, true, NOW()) ON CONFLICT (email) DO UPDATE SET password_hash = $2, club_id = $3`,
      [email, passwordHash, club.id]
    );

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
       VALUES ('club_signup', 'New Club Signup', $1, $2, NOW())`,
      ['New club signup: ' + clubName, JSON.stringify({ clubId: club.id, email, country })]
    );

    const emailSent = await sendTemplateEmail(email, EMAIL_TEMPLATES.WELCOME, {
      ownerName: clubName,
      clubName: clubName,
    });
    await logAutomatedEmail(client, 'welcome', email, EMAIL_TEMPLATES.WELCOME, emailSent ? 'sent' : 'failed', club.id);

    return res.status(201).json({ success: true, club: { id: club.id, name: club.name, email: club.owner_email, trialStart: club.trial_start, trialEnd: club.trial_end } });
  } finally { client.release(); }
}

async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = parseBody(req);
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const client = await pool.connect();
  try {
    const userResult = await client.query('SELECT id, email, name FROM users WHERE email = $1 AND is_active = true LIMIT 1', [email]);
    if (userResult.rows.length === 0) return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    
    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await client.query('UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3', [resetToken, expiresAt, user.id]);

    await sendTemplateEmail(user.email, EMAIL_TEMPLATES.RESET_PASSWORD, {
      userName: user.name || 'User',
      resetToken: resetToken,
      resetUrl: `https://www.mytaek.com/reset-password?token=${resetToken}`,
    });

    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } finally { client.release(); }
}

async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, newPassword } = parseBody(req);
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await client.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
       WHERE reset_token = $2 AND reset_token_expires_at > NOW() AND is_active = true RETURNING id, email`,
      [passwordHash, token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset token' });
    return res.json({ success: true, message: 'Password has been reset successfully' });
  } finally { client.release(); }
}

async function handleVerifyPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return res.json({ valid: true });
  const { password } = parseBody(req);
  if (password === sitePassword) return res.json({ valid: true });
  return res.status(401).json({ valid: false, error: 'Incorrect password' });
}

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { priceId, clubId, email } = parseBody(req);
  if (!priceId) return res.status(400).json({ error: 'priceId is required' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const host = req.headers.host || 'mytaek.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${baseUrl}/app/admin?subscription=success`,
    cancel_url: `${baseUrl}/app/pricing?subscription=cancelled`,
    metadata: { clubId: clubId || '', email: email || '' },
    subscription_data: { trial_period_days: 14, metadata: { clubId: clubId || '', email: email || '' } },
  });
  return res.json({ url: session.url });
}

async function handleCustomerPortal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { customerId } = parseBody(req);
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const host = req.headers.host || 'mytaek.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${baseUrl}/app/admin` });
  return res.json({ url: session.url });
}

async function handleProductsWithPrices(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const products = await stripe.products.list({ active: true, limit: 20 });
  const prices = await stripe.prices.list({ active: true, limit: 100 });

  const pricesByProduct = new Map<string, any[]>();
  for (const price of prices.data) {
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    if (!pricesByProduct.has(productId)) pricesByProduct.set(productId, []);
    pricesByProduct.get(productId)!.push({
      id: price.id, unit_amount: price.unit_amount, currency: price.currency,
      recurring: price.recurring, active: price.active, metadata: price.metadata,
    });
  }

  const result = products.data.map(p => ({
    id: p.id, name: p.name, description: p.description, active: p.active,
    metadata: p.metadata, prices: pricesByProduct.get(p.id) || [],
  }));
  return res.json({ data: result });
}

async function handleStripePublishableKey(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || process.env.SANDBOX_STRIPE_PUBLISHABLE_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe publishable key not configured' });
  return res.json({ publishableKey: key });
}

async function handleGetClubData(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  if (!clubId) {
    return res.status(400).json({ error: 'Club ID is required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      `SELECT id, name, owner_email, owner_name, country, city, art_type, 
              wizard_data, trial_start, trial_end, trial_status, status
       FROM clubs WHERE id = $1::uuid`,
      [clubId]
    );
    const club = clubResult.rows[0];

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const studentsResult = await client.query(
      `SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
              total_points, total_xp, current_streak, stripe_count
       FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const coachesResult = await client.query(
      `SELECT id, name, email
       FROM coaches WHERE club_id = $1::uuid AND is_active = true`,
      [clubId]
    );

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
    
    const students = studentsResult.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      parentEmail: s.parent_email,
      parentName: s.parent_name,
      parentPhone: s.parent_phone,
      beltId: getBeltIdFromName(s.belt),
      birthday: s.birthdate,
      totalXP: s.total_xp || 0,
      totalPoints: s.total_points || 0,
      currentStreak: s.current_streak || 0,
      stripeCount: s.stripe_count || 0,
      performanceHistory: [],
      homeDojo: { character: [], chores: [], school: [], health: [] }
    }));

    const coaches = coachesResult.rows.map((c: any) => ({
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
  } finally {
    client.release();
  }
}

async function handleSaveWizardData(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubId, wizardData } = parseBody(req);

  if (!clubId || !wizardData) {
    return res.status(400).json({ error: 'Club ID and wizard data are required' });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE clubs 
       SET wizard_data = $1::jsonb, updated_at = NOW()
       WHERE id = $2::uuid`,
      [JSON.stringify(wizardData), clubId]
    );

    // Try to update onboarding_progress (may not exist on all databases)
    try {
      await client.query(
        `INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
         VALUES ($1::uuid, true, NOW())
         ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true`,
        [clubId]
      );
    } catch (onboardingErr: any) {
      console.log('[Wizard] onboarding_progress table may not exist, continuing:', onboardingErr.message);
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
          const existingUser = await client.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [coachEmail]
          );
          
          let userId;
          if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id;
            await client.query(
              `UPDATE users SET 
                 password_hash = $1,
                 name = $2,
                 club_id = $3::uuid,
                 role = 'coach',
                 updated_at = NOW()
               WHERE id = $4::uuid`,
              [passwordHash, coach.name, clubId, userId]
            );
          } else {
            const userResult = await client.query(
              `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
               VALUES ($1, $2, $3, 'coach', $4::uuid, true, NOW())
               RETURNING id`,
              [coachEmail, passwordHash, coach.name, clubId]
            );
            userId = userResult.rows[0]?.id;
          }
          
          // Check if coach exists, then create or update
          const existingCoach = await client.query(
            `SELECT id FROM coaches WHERE club_id = $1::uuid AND email = $2 LIMIT 1`,
            [clubId, coachEmail]
          );
          
          if (existingCoach.rows.length > 0) {
            await client.query(
              `UPDATE coaches SET user_id = $1::uuid, name = $2, is_active = true, updated_at = NOW()
               WHERE id = $3::uuid`,
              [userId, coach.name, existingCoach.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO coaches (club_id, user_id, name, email, is_active, created_at)
               VALUES ($1::uuid, $2::uuid, $3, $4, true, NOW())`,
              [clubId, userId, coach.name, coachEmail]
            );
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
        
        // Check if student exists
        const existingStudent = await client.query(
          `SELECT id FROM students WHERE club_id = $1::uuid AND name = $2 AND (parent_email = $3 OR (parent_email IS NULL AND $3 IS NULL)) LIMIT 1`,
          [clubId, student.name, parentEmail]
        );
        
        let studentId;
        if (existingStudent.rows.length > 0) {
          studentId = existingStudent.rows[0].id;
          await client.query(
            `UPDATE students SET 
               parent_name = COALESCE($1, parent_name),
               parent_phone = COALESCE($2, parent_phone),
               belt = COALESCE($3, belt),
               birthdate = COALESCE($4::timestamptz, birthdate),
               total_points = COALESCE($5, total_points),
               updated_at = NOW()
             WHERE id = $6::uuid`,
            [
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0,
              studentId
            ]
          );
        } else {
          const insertResult = await client.query(
            `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, created_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, NOW())
             RETURNING id`,
            [
              clubId, 
              student.name, 
              parentEmail,
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0
            ]
          );
          studentId = insertResult.rows[0]?.id;
        }
        
        // Create parent user account if email and password provided
        if (parentEmail && student.parentPassword) {
          const existingParent = await client.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [parentEmail]
          );
          
          const parentPasswordHash = await bcrypt.hash(student.parentPassword, 10);
          
          if (existingParent.rows.length > 0) {
            await client.query(
              `UPDATE users SET 
                 password_hash = $1,
                 name = COALESCE($2, name),
                 club_id = $3::uuid,
                 role = 'parent',
                 updated_at = NOW()
               WHERE id = $4::uuid`,
              [parentPasswordHash, student.parentName || student.name + "'s Parent", clubId, existingParent.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
               VALUES ($1, $2, $3, 'parent', $4::uuid, true, NOW())`,
              [parentEmail, parentPasswordHash, student.parentName || student.name + "'s Parent", clubId]
            );
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
  } finally {
    client.release();
  }
}

async function handleTaekBot(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { message, clubName, artType, language } = parseBody(req);
  if (!message) return res.status(400).json({ error: 'message is required' });

  const openai = getOpenAIClient();
  if (!openai) {
    return res.json({ response: `Thank you for your question! For specific inquiries about ${clubName || 'your dojo'}, please contact your instructor.` });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `You are TaekBot, an AI assistant for ${clubName || 'your dojo'}, a ${artType || 'martial arts'} academy. Be friendly and helpful. Respond in ${language || 'English'}.` },
      { role: 'user', content: message }
    ],
    max_tokens: 500, temperature: 0.7,
  });
  return res.json({ response: completion.choices[0]?.message?.content || 'Thank you for your question!' });
}

async function handleClassPlan(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { beltLevel, focusArea, classDuration, studentCount, language } = parseBody(req);

  const openai = getOpenAIClient();
  if (!openai) {
    return res.json({ plan: `## ${beltLevel || 'All Levels'} Class Plan\n\n### Warm-up (10 min)\n- Jogging and stretches\n\n### Main Training (${Math.floor((classDuration || 60) * 0.6)} min)\n- Technique drills\n\n### Cool-down (10 min)\n- Stretching` });
  }

  const prompt = `Create a martial arts class plan: Belt Level: ${beltLevel || 'All Levels'}, Focus: ${focusArea || 'General'}, Duration: ${classDuration || 60} min, Students: ${studentCount || 10}. Include warm-up, technique drills, partner work, cool-down. Respond in ${language || 'English'}.`;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: 'You are an experienced martial arts instructor.' }, { role: 'user', content: prompt }],
    max_tokens: 1000, temperature: 0.7,
  });
  return res.json({ plan: completion.choices[0]?.message?.content || 'Class plan generated.' });
}

async function handleWelcomeEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubName, studentName, parentName, artType, language } = parseBody(req);

  const gemini = getGeminiClient();
  if (!gemini) {
    return res.json({ email: `Dear ${parentName || 'Parent'},\n\nWelcome to ${clubName || 'Your Dojo'}! We're thrilled to have ${studentName || 'your child'} join us.\n\nBest regards,\nThe ${clubName || 'Your Dojo'} Team` });
  }

  const model = gemini.getGenerativeModel({ model: 'gemini-pro' });
  const prompt = `Write a welcome email for ${studentName || 'Student'} joining ${clubName || 'Your Dojo'}, addressed to ${parentName || 'Parent'}. Art type: ${artType || 'martial arts'}. Write in ${language || 'English'}.`;
  const result = await model.generateContent(prompt);
  return res.json({ email: result.response.text() });
}

async function handleAddStudent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubId, name, parentEmail, parentName, parentPhone, parentPassword, belt, birthdate } = parseBody(req);

  if (!clubId || !name) {
    return res.status(400).json({ error: 'Club ID and student name are required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      'SELECT id, name, owner_email FROM clubs WHERE id = $1::uuid',
      [clubId]
    );
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const studentResult = await client.query(
      `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, NOW())
       RETURNING id, name, parent_email, parent_name, belt`,
      [clubId, name, parentEmail || null, parentName || null, parentPhone || null, belt || 'White', birthdate ? birthdate + 'T00:00:00Z' : null]
    );
    const student = studentResult.rows[0];

    // Create parent user account if email and password provided
    if (parentEmail && parentPassword) {
      try {
        const parentPasswordHash = await bcrypt.hash(parentPassword, 10);
        const existingParent = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [parentEmail.toLowerCase()]);
        if (existingParent.rows.length > 0) {
          await client.query(
            `UPDATE users SET password_hash = $1, name = $2, club_id = $3::uuid, role = 'parent', updated_at = NOW() WHERE id = $4::uuid`,
            [parentPasswordHash, parentName || name + "'s Parent", clubId, existingParent.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at) VALUES ($1, $2, $3, 'parent', $4::uuid, true, NOW())`,
            [parentEmail.toLowerCase(), parentPasswordHash, parentName || name + "'s Parent", clubId]
          );
        }
        console.log('[AddStudent] Created parent user account:', parentEmail);
      } catch (parentErr: any) {
        console.error('[AddStudent] Error creating parent account:', parentErr.message);
      }
    }

    const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    const notifySent = await sendTemplateEmail(club.owner_email, EMAIL_TEMPLATES.WELCOME, {
      ownerName: club.name,
      clubName: club.name,
      studentName: name,
      beltLevel: belt || 'White',
      studentAge: age ? `${age} years old` : 'Not specified',
      parentName: parentName || 'Not specified',
    });
    console.log(`[AddStudent] Owner notification email ${notifySent ? 'sent' : 'failed'} to:`, club.owner_email);

    if (parentEmail) {
      const parentSent = await sendTemplateEmail(parentEmail, EMAIL_TEMPLATES.PARENT_WELCOME, {
        parentName: parentName || 'Parent',
        studentName: name,
        clubName: club.name,
      });
      await logAutomatedEmail(client, 'parent_welcome', parentEmail, EMAIL_TEMPLATES.PARENT_WELCOME, parentSent ? 'sent' : 'failed', clubId);
      console.log(`[AddStudent] Parent welcome email ${parentSent ? 'sent' : 'failed'} to:`, parentEmail);
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('student_added', 'New Student Added', $1, $2::uuid, $3::jsonb, NOW())`,
      ['New student added: ' + name, clubId, JSON.stringify({ studentId: student.id, studentName: name, parentEmail })]
    );

    return res.status(201).json({
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
    console.error('[AddStudent] Error:', error.message);
    return res.status(500).json({ error: 'Failed to add student' });
  } finally {
    client.release();
  }
}

async function handleInviteCoach(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubId, name, email, location, assignedClasses, password } = parseBody(req);

  if (!clubId || !name || !email) {
    return res.status(400).json({ error: 'Club ID, coach name, and email are required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query('SELECT id, name, owner_email FROM clubs WHERE id = $1::uuid', [clubId]);
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const tempPassword = password || crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Insert into users table for authentication
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
       VALUES ($1, $2, $3, 'coach', $4::uuid, true, NOW())
       ON CONFLICT (email) DO UPDATE SET name = $3, club_id = $4::uuid, role = 'coach', is_active = true
       RETURNING id`,
      [email, passwordHash, name, clubId]
    );
    const userId = userResult.rows[0]?.id;

    // Also insert into coaches table for data fetching
    // First check if coach already exists
    const existingCoach = await client.query(
      `SELECT id FROM coaches WHERE email = $1 LIMIT 1`,
      [email]
    );
    
    if (existingCoach.rows.length > 0) {
      await client.query(
        `UPDATE coaches SET name = $1, club_id = $2::uuid, is_active = true, invite_sent_at = NOW()
         WHERE email = $3`,
        [name, clubId, email]
      );
    } else {
      await client.query(
        `INSERT INTO coaches (id, club_id, user_id, name, email, is_active, invite_sent_at, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, true, NOW(), NOW())`,
        [clubId, userId, name, email]
      );
    }

    const coachSent = await sendTemplateEmail(email, EMAIL_TEMPLATES.COACH_INVITE, {
      coachName: name,
      clubName: club.name,
      coachEmail: email,
      tempPassword: tempPassword,
      ownerName: club.name,
    });
    await logAutomatedEmail(client, 'coach_invite', email, EMAIL_TEMPLATES.COACH_INVITE, coachSent ? 'sent' : 'failed', clubId);
    console.log(`[InviteCoach] Coach invite email ${coachSent ? 'sent' : 'failed'} to:`, email);

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('coach_invited', 'Coach Invited', $1, $2::uuid, $3::jsonb, NOW())`,
      ['Coach invited: ' + name, clubId, JSON.stringify({ coachEmail: email, coachName: name })]
    );

    return res.status(201).json({
      success: true,
      coach: { email, name, location, assignedClasses }
    });
  } catch (error: any) {
    console.error('[InviteCoach] Error:', error.message);
    return res.status(500).json({ error: 'Failed to invite coach' });
  } finally {
    client.release();
  }
}

async function handleLinkParent(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const { parentEmail, parentName, parentPhone } = parseBody(req);

  if (!parentEmail) {
    return res.status(400).json({ error: 'Parent email is required' });
  }

  const client = await pool.connect();
  try {
    const studentResult = await client.query(
      `SELECT s.id, s.name, s.parent_email, c.id as club_id, c.name as club_name 
       FROM students s
       JOIN clubs c ON s.club_id = c.id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const hadParentBefore = !!student.parent_email;

    await client.query(
      `UPDATE students 
       SET parent_email = $1, parent_name = $2, parent_phone = $3, updated_at = NOW()
       WHERE id = $4::uuid`,
      [parentEmail, parentName || null, parentPhone || null, studentId]
    );

    if (!hadParentBefore) {
      const parentSent = await sendTemplateEmail(parentEmail, EMAIL_TEMPLATES.PARENT_WELCOME, {
        parentName: parentName || 'Parent',
        studentName: student.name,
        clubName: student.club_name,
      });
      await logAutomatedEmail(client, 'parent_welcome', parentEmail, EMAIL_TEMPLATES.PARENT_WELCOME, parentSent ? 'sent' : 'failed', student.club_id);
      console.log(`[LinkParent] Parent welcome email ${parentSent ? 'sent' : 'failed'} to:`, parentEmail);
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('parent_linked', 'Parent Linked', $1, $2::uuid, $3::jsonb, NOW())`,
      ['Parent linked to student: ' + student.name, student.club_id, JSON.stringify({ studentId, parentEmail })]
    );

    return res.json({ 
      success: true, 
      message: hadParentBefore ? 'Parent information updated' : 'Parent linked and welcome email sent'
    });
  } catch (error: any) {
    console.error('[LinkParent] Error:', error.message);
    return res.status(500).json({ error: 'Failed to link parent to student' });
  } finally {
    client.release();
  }
}

// S3 client for video uploads
function getS3Client(): S3Client | null {
  if (!process.env.IDRIVE_E2_ACCESS_KEY || !process.env.IDRIVE_E2_SECRET_KEY || !process.env.IDRIVE_E2_ENDPOINT) {
    return null;
  }
  return new S3Client({
    endpoint: `https://${process.env.IDRIVE_E2_ENDPOINT}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY,
      secretAccessKey: process.env.IDRIVE_E2_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

async function handlePresignedUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, challengeId, filename, contentType } = parseBody(req);
  
  if (!studentId || !challengeId || !filename) {
    return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
  }

  const s3Client = getS3Client();
  const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
  
  if (!s3Client || !bucketName) {
    console.error('[Videos] Missing S3 configuration');
    return res.status(500).json({ error: 'Video storage not configured. Please contact support.' });
  }

  try {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `challenge-videos/${studentId}/${challengeId}/${timestamp}-${sanitizedFilename}`;
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType || 'video/mp4',
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `https://${bucketName}.${process.env.IDRIVE_E2_ENDPOINT}/${key}`;
    
    return res.json({ uploadUrl, key, publicUrl });
  } catch (error: any) {
    console.error('[Videos] Presigned upload error:', error.message);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
}

async function handleSaveVideo(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, score } = parseBody(req);
  
  if (!studentId || !clubId || !challengeId || !videoUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, score, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
       RETURNING id`,
      [studentId, clubId, challengeId, challengeName || '', challengeCategory || '', videoUrl, videoKey || '', score || 0]
    );
    
    const video = result.rows[0];
    return res.json({ success: true, videoId: video?.id });
  } catch (error: any) {
    console.error('[Videos] Create error:', error.message);
    return res.status(500).json({ error: 'Failed to save video record' });
  } finally {
    client.release();
  }
}

async function handleGetStudentVideos(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, challenge_id as "challengeId", challenge_name as "challengeName", 
              video_url as "videoUrl", status, score, vote_count as "voteCount", 
              coach_notes as "coachNotes", created_at as "createdAt"
       FROM challenge_videos 
       WHERE student_id = $1::uuid
       ORDER BY created_at DESC`,
      [studentId]
    );
    
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Videos] Get student videos error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch videos' });
  } finally {
    client.release();
  }
}

async function handleGetPendingVideos(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cv.*, s.name as student_name, s.belt as student_belt
       FROM challenge_videos cv
       JOIN students s ON cv.student_id = s.id
       WHERE cv.club_id = $1::uuid AND cv.status = 'pending'
       ORDER BY cv.created_at DESC`,
      [clubId]
    );
    
    // Generate presigned URLs for each video
    const s3Client = getS3Client();
    const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
    
    const videosWithSignedUrls = await Promise.all(result.rows.map(async (video) => {
      if (s3Client && bucketName && video.video_key) {
        try {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: video.video_key,
          });
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          return { ...video, video_url: signedUrl };
        } catch (e) {
          console.error('[Videos] Failed to generate signed URL:', e);
          return video;
        }
      }
      return video;
    }));
    
    return res.json(videosWithSignedUrls);
  } catch (error: any) {
    console.error('[Videos] Fetch pending error:', error.message);
    return res.status(500).json({ error: 'Failed to get pending videos' });
  } finally {
    client.release();
  }
}

async function handleGetApprovedVideos(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cv.id, cv.student_id, s.name as student_name, cv.challenge_id, cv.challenge_name,
              cv.video_key, cv.video_url, cv.score, cv.vote_count, cv.created_at
       FROM challenge_videos cv
       JOIN students s ON cv.student_id = s.id
       WHERE cv.club_id = $1::uuid AND cv.status = 'approved'
       ORDER BY cv.created_at DESC`,
      [clubId]
    );
    
    const s3Client = getS3Client();
    const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
    
    const videosWithData = await Promise.all(result.rows.map(async (video) => {
      let videoUrl = video.video_url;
      
      if (s3Client && bucketName && video.video_key) {
        try {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: video.video_key,
          });
          videoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        } catch (e) {
          console.error('[Videos] Failed to generate signed URL:', e);
        }
      }
      
      let hasVoted = false;
      if (studentId) {
        const voteCheck = await client.query(
          `SELECT id FROM challenge_video_votes WHERE video_id = $1::uuid AND voter_student_id = $2::uuid`,
          [video.id, studentId]
        );
        hasVoted = voteCheck.rows.length > 0;
      }
      
      return {
        ...video,
        video_url: videoUrl,
        has_voted: hasVoted
      };
    }));
    
    return res.json(videosWithData);
  } catch (error: any) {
    console.error('[Videos] Fetch approved error:', error.message);
    return res.status(500).json({ error: 'Failed to get approved videos' });
  } finally {
    client.release();
  }
}

async function handleVoteVideo(req: VercelRequest, res: VercelResponse, videoId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { voterStudentId } = parseBody(req);
  
  if (!voterStudentId) {
    return res.status(400).json({ error: 'voterStudentId is required' });
  }
  
  const client = await pool.connect();
  try {
    // Check if already voted
    const existing = await client.query(
      `SELECT id FROM challenge_video_votes 
       WHERE video_id = $1::uuid AND voter_student_id = $2::uuid`,
      [videoId, voterStudentId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already voted on this video' });
    }
    
    // Add vote
    await client.query(
      `INSERT INTO challenge_video_votes (video_id, voter_student_id, vote_value, created_at)
       VALUES ($1::uuid, $2::uuid, 1, NOW())`,
      [videoId, voterStudentId]
    );
    
    // Update vote count
    await client.query(
      `UPDATE challenge_videos 
       SET vote_count = vote_count + 1, updated_at = NOW()
       WHERE id = $1::uuid`,
      [videoId]
    );
    
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Videos] Vote error:', error.message);
    return res.status(500).json({ error: 'Failed to vote' });
  } finally {
    client.release();
  }
}

async function handleVerifyVideo(req: VercelRequest, res: VercelResponse, videoId: string) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  
  const { status, coachNotes, xpAwarded } = parseBody(req);
  
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Valid status (approved/rejected) is required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE challenge_videos 
       SET status = $1, coach_notes = $2, xp_awarded = $3, verified_at = NOW(), updated_at = NOW()
       WHERE id = $4::uuid
       RETURNING *`,
      [status, coachNotes || '', xpAwarded || 0, videoId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const video = result.rows[0];
    
    // If approved, award XP to student
    if (status === 'approved' && xpAwarded > 0) {
      await client.query(
        `UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
        [xpAwarded, video.student_id]
      );
    }
    
    return res.json({ success: true, video: result.rows[0] });
  } catch (error: any) {
    console.error('[Videos] Verify error:', error.message);
    return res.status(500).json({ error: 'Failed to verify video' });
  } finally {
    client.release();
  }
}

// =====================================================
// DAILY MYSTERY CHALLENGE - with robust fallback
// =====================================================

function getFallbackChallenge() {
  return {
    title: "Master's Wisdom",
    description: "Test your knowledge of martial arts belt symbolism!",
    type: 'quiz' as const,
    xpReward: 50,
    quizData: {
      question: "What does the color of the White Belt represent?",
      options: ["Danger", "Innocence/Beginner", "Mastery", "Fire"],
      correctIndex: 1,
      explanation: "The White Belt represents innocence and a beginner's pure mind - ready to absorb new knowledge like a blank canvas!"
    }
  };
}

async function generateDailyChallengeAI(targetBelt: string, artType: string): Promise<any> {
  const gemini = getGeminiClient();
  const openai = getOpenAIClient();
  
  const prompt = `Generate a fun daily quiz challenge for a ${targetBelt} belt ${artType} student.

Return a JSON object with:
- title: Short catchy title (max 30 chars)
- description: Brief description of the challenge (max 100 chars)
- question: The quiz question
- options: Array of 4 answer choices
- correctIndex: Index of correct answer (0-3)
- explanation: Brief explanation of the correct answer (max 100 chars)

The question should be age-appropriate, educational, and related to martial arts history, terminology, techniques, or philosophy. Make it fun and engaging!

Return ONLY valid JSON, no markdown.`;

  // Try Gemini first
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || "Daily Challenge",
        description: parsed.description || "Test your martial arts knowledge!",
        type: 'quiz',
        xpReward: 25,
        quizData: {
          question: parsed.question,
          options: parsed.options,
          correctIndex: parsed.correctIndex,
          explanation: parsed.explanation
        }
      };
    } catch (e: any) {
      console.log('[DailyChallenge] Gemini failed:', e.message);
    }
  }

  // Fallback to OpenAI
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.8,
      });
      const text = response.choices[0]?.message?.content?.replace(/```json\n?|\n?```/g, '').trim() || '';
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || "Daily Challenge",
        description: parsed.description || "Test your martial arts knowledge!",
        type: 'quiz',
        xpReward: 25,
        quizData: {
          question: parsed.question,
          options: parsed.options,
          correctIndex: parsed.correctIndex,
          explanation: parsed.explanation
        }
      };
    } catch (e: any) {
      console.log('[DailyChallenge] OpenAI failed:', e.message);
    }
  }

  throw new Error('All AI providers failed');
}

async function handleDailyChallenge(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, clubId, belt } = req.query;
  
  if (!studentId || !belt) {
    return res.status(400).json({ error: 'studentId and belt are required' });
  }

  const today = new Date().toISOString().split('T')[0];
  const targetBelt = (belt as string).toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = uuidRegex.test(studentId as string);

  const client = await pool.connect();
  try {
    // Check if student already completed today's challenge
    if (isValidUuid) {
      const existingSubmission = await client.query(
        `SELECT cs.id, cs.is_correct, cs.xp_awarded, dc.title
         FROM challenge_submissions cs
         JOIN daily_challenges dc ON cs.challenge_id = dc.id
         WHERE cs.student_id = $1::uuid 
         AND dc.date = $2 
         AND dc.target_belt = $3`,
        [studentId, today, targetBelt]
      );

      if (existingSubmission.rows.length > 0) {
        const sub = existingSubmission.rows[0];
        return res.json({ 
          completed: true, 
          message: `You already completed today's challenge: "${sub.title}"!`,
          xpAwarded: sub.xp_awarded,
          wasCorrect: sub.is_correct
        });
      }
    }

    // Check if challenge exists for today
    const existingChallenge = await client.query(
      `SELECT * FROM daily_challenges WHERE date = $1 AND target_belt = $2 LIMIT 1`,
      [today, targetBelt]
    );

    let challenge: any;

    if (existingChallenge.rows.length > 0) {
      challenge = existingChallenge.rows[0];
      console.log(`[DailyChallenge] Using cached challenge for ${targetBelt} belt`);
    } else {
      // Generate new challenge with AI, with fallback
      let artType = 'Taekwondo';
      const clubIdStr = clubId as string;
      const isValidClubUuid = uuidRegex.test(clubIdStr);
      
      if (clubId && isValidClubUuid) {
        try {
          const clubData = await client.query(`SELECT art_type FROM clubs WHERE id = $1::uuid`, [clubIdStr]);
          if (clubData.rows.length > 0) {
            artType = clubData.rows[0].art_type || 'Taekwondo';
          }
        } catch (e) { /* ignore */ }
      }

      let generated;
      try {
        generated = await generateDailyChallengeAI(targetBelt, artType);
        console.log(`[DailyChallenge] AI generated challenge for ${targetBelt} belt`);
      } catch (aiError: any) {
        console.error(`[DailyChallenge] AI generation failed: ${aiError.message}`);
        console.log(`[DailyChallenge] Using fallback challenge`);
        generated = getFallbackChallenge();
      }
      
      // Cache in database
      try {
        const insertResult = await client.query(
          `INSERT INTO daily_challenges (date, target_belt, title, description, xp_reward, type, quiz_data, created_by_ai)
           VALUES ($1, $2, $3, $4, $5, $6::daily_challenge_type, $7::jsonb, NOW())
           RETURNING *`,
          [today, targetBelt, generated.title, generated.description, generated.xpReward, 
           generated.type, JSON.stringify(generated.quizData)]
        );
        challenge = insertResult.rows[0];
      } catch (dbError: any) {
        console.error(`[DailyChallenge] DB cache failed: ${dbError.message}`);
        return res.json({
          completed: false,
          challenge: {
            id: 'temp-' + Date.now(),
            title: generated.title,
            description: generated.description,
            type: generated.type,
            xpReward: generated.xpReward,
            quizData: generated.quizData,
          }
        });
      }
    }

    return res.json({
      completed: false,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        type: challenge.type,
        xpReward: challenge.xp_reward,
        quizData: challenge.quiz_data,
      }
    });
  } catch (error: any) {
    console.error('[DailyChallenge] Critical error:', error.message);
    const fallback = getFallbackChallenge();
    return res.json({
      completed: false,
      challenge: {
        id: 'fallback-' + Date.now(),
        title: fallback.title,
        description: fallback.description,
        type: fallback.type,
        xpReward: fallback.xpReward,
        quizData: fallback.quizData,
      }
    });
  } finally {
    client.release();
  }
}

// Database setup endpoint - creates missing tables
async function handleDbSetup(req: VercelRequest, res: VercelResponse) {
  const { password } = parseBody(req);
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  
  if (!adminPassword || password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const client = await pool.connect();
  try {
    // Create challenge_submissions table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS challenge_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL,
        student_id UUID NOT NULL,
        club_id UUID NOT NULL,
        answer TEXT,
        is_correct BOOLEAN DEFAULT false,
        xp_awarded INTEGER DEFAULT 0,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        mode TEXT,
        opponent_id UUID,
        status TEXT,
        proof_type TEXT,
        video_url TEXT,
        score INTEGER
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_student ON challenge_submissions(student_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_challenge ON challenge_submissions(challenge_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_answer ON challenge_submissions(answer)`);
    
    // Create daily_challenges table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'quiz',
        xp_reward INTEGER DEFAULT 50,
        quiz_data JSONB,
        belt_level TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true
      )
    `);
    
    // Create arena_challenges table if missing
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE challenge_category AS ENUM ('POWER', 'TECHNIQUE', 'FLEXIBILITY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE difficulty_tier AS ENUM ('EASY', 'MEDIUM', 'HARD');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS arena_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        club_id UUID,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50) DEFAULT '💪',
        category challenge_category NOT NULL,
        difficulty_tier difficulty_tier DEFAULT 'MEDIUM',
        xp_reward INTEGER DEFAULT 30,
        is_system_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // NUCLEAR WIPE: Delete ALL challenges from BOTH tables
    await client.query(`DELETE FROM arena_challenges`);
    await client.query(`DELETE FROM challenges`);
    
    // Insert fresh GPP challenges (General Physical Preparedness)
    const seedChallenges = [
      // POWER (icon: 💪)
      { name: 'Push-up Master', desc: '10 perfect pushups', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      { name: 'Squat Challenge', desc: '20 squats', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      { name: 'Burpee Blast', desc: '10 burpees', icon: '💪', cat: 'POWER', diff: 'HARD', xp: 60 },
      { name: 'Abs of Steel', desc: '20 Sit-ups', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      // TECHNIQUE (icon: 🎯)
      { name: '100 Kicks Marathon', desc: '100 kicks total', icon: '🎯', cat: 'TECHNIQUE', diff: 'HARD', xp: 60 },
      { name: 'Speed Punches', desc: '50 shadow punches', icon: '🎯', cat: 'TECHNIQUE', diff: 'EASY', xp: 15 },
      { name: 'Iron Horse Stance', desc: 'Hold stance 60s', icon: '🎯', cat: 'TECHNIQUE', diff: 'HARD', xp: 60 },
      { name: 'Jump Rope Ninja', desc: 'Jump rope 2 mins', icon: '🎯', cat: 'TECHNIQUE', diff: 'MEDIUM', xp: 30 },
      // FLEXIBILITY (icon: 🧘)
      { name: 'Plank Hold', desc: 'Hold 45s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'MEDIUM', xp: 30 },
      { name: 'Touch Your Toes', desc: 'Hold 30s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'EASY', xp: 15 },
      { name: 'The Wall Sit', desc: 'Hold 45s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'MEDIUM', xp: 30 },
      { name: 'One-Leg Balance', desc: 'Balance 60s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'EASY', xp: 15 },
    ];
    
    for (const c of seedChallenges) {
      await client.query(`
        INSERT INTO arena_challenges (name, description, icon, category, difficulty_tier, xp_reward, is_system_default, club_id)
        VALUES ($1::text, $2::text, $3::text, $4::challenge_category, $5::difficulty_tier, $6::integer, true, NULL)
      `, [c.name, c.desc, c.icon, c.cat, c.diff, c.xp]);
    }
    
    return res.json({ 
      success: true, 
      message: 'HARD RESET complete! Old challenges deleted. 12 new GPP challenges inserted with standardized XP (Easy=15, Medium=30, Hard=60).' 
    });
  } catch (error: any) {
    console.error('[DbSetup] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleDailyChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { challengeId, studentId, clubId, answer, selectedIndex } = parseBody(req);
  
  if (!challengeId || !studentId || !clubId) {
    return res.status(400).json({ error: 'challengeId, studentId, and clubId are required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidStudentUuid = uuidRegex.test(studentId);
  const isValidClubUuid = uuidRegex.test(clubId);
  const isValidChallengeUuid = uuidRegex.test(challengeId);
  const isDemoMode = !isValidStudentUuid || !isValidClubUuid || !isValidChallengeUuid;

  // Demo mode - check daily completion via database with demo marker
  if (isDemoMode) {
    const client = await pool.connect();
    try {
      const today = new Date().toISOString().split('T')[0];
      const demoKey = `demo-${studentId}-${today}`;
      
      // Check if demo user already completed today's challenge
      const existingDemo = await client.query(
        `SELECT id, xp_awarded, is_correct FROM challenge_submissions 
         WHERE answer = $1 LIMIT 1`,
        [demoKey]
      );
      
      if (existingDemo.rows.length > 0) {
        const prev = existingDemo.rows[0];
        return res.status(400).json({ 
          error: 'Already completed', 
          message: 'You already completed today\'s challenge!',
          previousXp: prev.xp_awarded,
          wasCorrect: prev.is_correct
        });
      }
      
      const fallbackXp = 50;
      const isCorrect = selectedIndex === 1;
      const xpAwarded = isCorrect ? fallbackXp : 0;
      
      // Record demo submission to prevent duplicates
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
         VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), $1, $2, $3)`,
        [demoKey, isCorrect, xpAwarded]
      );
      
      return res.json({
        success: true,
        isCorrect,
        correctIndex: 1,
        xpAwarded,
        explanation: "The White Belt represents innocence and a beginner's pure mind!",
        message: isCorrect ? `Correct! +${fallbackXp} XP` : 'Not quite! The answer was Innocence/Beginner.'
      });
    } finally {
      client.release();
    }
  }

  const client = await pool.connect();
  try {
    // BUG FIX #1: Check for duplicate submission BEFORE processing
    const existingSubmission = await client.query(
      `SELECT id, xp_awarded, is_correct FROM challenge_submissions 
       WHERE challenge_id = $1::uuid AND student_id = $2::uuid LIMIT 1`,
      [challengeId, studentId]
    );

    if (existingSubmission.rows.length > 0) {
      const prev = existingSubmission.rows[0];
      return res.status(400).json({ 
        error: 'Already completed', 
        message: 'You have already submitted this challenge!',
        previousXp: prev.xp_awarded,
        wasCorrect: prev.is_correct
      });
    }

    // Get challenge from database
    const challengeResult = await client.query(
      `SELECT * FROM daily_challenges WHERE id = $1::uuid`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = challengeResult.rows[0];
    const quizData = challenge.quiz_data || {};
    const correctIndex = quizData.correctIndex ?? 0;
    const isCorrect = selectedIndex === correctIndex;
    
    // BUG FIX #2: Use the ACTUAL xp_reward from the database, not hardcoded value
    const challengeXpReward = challenge.xp_reward || 50;
    const xpAwarded = isCorrect ? challengeXpReward : 0;

    // Save submission record
    await client.query(
      `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)`,
      [challengeId, studentId, clubId, answer || String(selectedIndex), isCorrect, xpAwarded]
    );

    // Update student XP if correct
    if (isCorrect && xpAwarded > 0) {
      await client.query(
        `UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
        [xpAwarded, studentId]
      );
    }

    return res.json({
      success: true,
      isCorrect,
      correctIndex,
      xpAwarded,
      explanation: quizData.explanation || 'Great effort!',
      message: isCorrect ? `Correct! +${xpAwarded} XP` : `Not quite! The correct answer was option ${correctIndex + 1}.`
    });
  } catch (error: any) {
    console.error('[DailyChallenge] Submit error:', error.message);
    return res.status(500).json({ error: 'Failed to submit challenge' });
  } finally {
    client.release();
  }
}

async function handleVideoFeedback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentName, challengeName, challengeCategory, score, beltLevel, coachNotes } = parseBody(req);
  
  if (!studentName || !challengeName) {
    return res.status(400).json({ error: 'Student name and challenge name are required' });
  }

  const scoreText = score ? `achieved a score of ${score}` : 'completed';
  const coachObservation = coachNotes ? `\n\nCoach's observation: "${coachNotes}". Incorporate this feedback naturally.` : '';
  const prompt = `Generate a brief, encouraging coach feedback (2 sentences max) for ${studentName}, a ${beltLevel || 'student'} belt, who ${scoreText} in the "${challengeName}" challenge (${challengeCategory || 'General'} category).${coachObservation}

IMPORTANT: You MUST mention their specific score of ${score || 'their result'} in your feedback. Be specific about their achievement. Keep it under 40 words.`;

  // Try Gemini first (cost-effective)
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      const feedback = result.response.text();
      if (feedback) return res.json({ feedback });
    } catch (error: any) {
      console.log('[VideoFeedback] Gemini failed, trying OpenAI...');
    }
  }

  // Fallback to OpenAI
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.8,
      });
      const feedback = response.choices[0]?.message?.content?.trim();
      if (feedback) return res.json({ feedback });
    } catch (error: any) {
      console.error('[VideoFeedback] OpenAI error:', error.message);
    }
  }

  // Final fallback
  const fallbacks = [
    `Outstanding work on the ${challengeName}, ${studentName}! Your dedication really shows. Keep pushing forward!`,
    `${studentName}, great effort on the ${challengeName} challenge! Your commitment to martial arts is inspiring!`,
    `Impressive submission, ${studentName}! The ${challengeName} is tough and you're showing real progress!`,
  ];
  return res.json({ feedback: fallbacks[Math.floor(Math.random() * fallbacks.length)] });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const path = url.split('?')[0].replace(/^\/api/, '');

  try {
    if (path === '/login' || path === '/login/') return await handleLogin(req, res);
    if (path === '/signup' || path === '/signup/') return await handleSignup(req, res);
    if (path === '/forgot-password' || path === '/forgot-password/') return await handleForgotPassword(req, res);
    if (path === '/reset-password' || path === '/reset-password/') return await handleResetPassword(req, res);
    if (path === '/verify-password' || path === '/verify-password/') return await handleVerifyPassword(req, res);
    if (path === '/checkout' || path === '/checkout/') return await handleCheckout(req, res);
    if (path === '/customer-portal' || path === '/customer-portal/') return await handleCustomerPortal(req, res);
    if (path === '/products-with-prices' || path === '/products-with-prices/') return await handleProductsWithPrices(req, res);
    if (path === '/stripe/publishable-key' || path === '/stripe/publishable-key/') return await handleStripePublishableKey(req, res);
    if (path === '/ai/taekbot' || path === '/ai/taekbot/') return await handleTaekBot(req, res);
    if (path === '/ai/class-plan' || path === '/ai/class-plan/') return await handleClassPlan(req, res);
    if (path === '/ai/welcome-email' || path === '/ai/welcome-email/') return await handleWelcomeEmail(req, res);
    if (path === '/ai/video-feedback' || path === '/ai/video-feedback/') return await handleVideoFeedback(req, res);
    
    // Database setup (admin only)
    if (path === '/admin/db-setup' || path === '/admin/db-setup/') return await handleDbSetup(req, res);
    
    // Daily Mystery Challenge
    if (path === '/daily-challenge' || path === '/daily-challenge/') return await handleDailyChallenge(req, res);
    if (path === '/daily-challenge/submit' || path === '/daily-challenge/submit/') return await handleDailyChallengeSubmit(req, res);
    if (path === '/students' || path === '/students/') return await handleAddStudent(req, res);
    if (path === '/invite-coach' || path === '/invite-coach/') return await handleInviteCoach(req, res);
    
    // Club data routes
    if (path === '/club/save-wizard-data' || path === '/club/save-wizard-data/') return await handleSaveWizardData(req, res);
    
    const clubDataMatch = path.match(/^\/club\/([^/]+)\/data\/?$/);
    if (clubDataMatch) return await handleGetClubData(req, res, clubDataMatch[1]);
    
    const linkParentMatch = path.match(/^\/students\/([^/]+)\/link-parent\/?$/);
    if (linkParentMatch) return await handleLinkParent(req, res, linkParentMatch[1]);

    // Video endpoints
    if (path === '/videos/presigned-upload' || path === '/videos/presigned-upload/') return await handlePresignedUpload(req, res);
    if (path === '/videos' || path === '/videos/') return await handleSaveVideo(req, res);
    
    const studentVideosMatch = path.match(/^\/videos\/student\/([^/]+)\/?$/);
    if (studentVideosMatch) return await handleGetStudentVideos(req, res, studentVideosMatch[1]);
    
    const pendingVideosMatch = path.match(/^\/videos\/pending\/([^/]+)\/?$/);
    if (pendingVideosMatch) return await handleGetPendingVideos(req, res, pendingVideosMatch[1]);
    
    const approvedVideosMatch = path.match(/^\/videos\/approved\/([^/]+)\/?$/);
    if (approvedVideosMatch) return await handleGetApprovedVideos(req, res, approvedVideosMatch[1]);
    
    const verifyVideoMatch = path.match(/^\/videos\/([^/]+)\/verify\/?$/);
    if (verifyVideoMatch) return await handleVerifyVideo(req, res, verifyVideoMatch[1]);
    
    const voteVideoMatch = path.match(/^\/videos\/([^/]+)\/vote\/?$/);
    if (voteVideoMatch) return await handleVoteVideo(req, res, voteVideoMatch[1]);

    return res.status(404).json({ error: 'Not found', path });
  } catch (error: any) {
    console.error('[API Error]', path, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
