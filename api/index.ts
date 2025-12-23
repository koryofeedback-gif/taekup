// TaekUp API v2.1 - XP persistence fix (Dec 2024)
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

// Generate deterministic UUID from challenge type string (since challenges are hardcoded, not in DB)
function generateChallengeUUID(challengeType: string): string {
  const hash = crypto.createHash('sha256').update(`taekup-challenge-${challengeType}`).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req: VercelRequest) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
}

// UNIFIED XP HELPER - Single source of truth for all XP changes
async function applyXpDelta(client: any, studentId: string, amount: number, reason: string): Promise<number> {
  if (amount === 0) return 0;
  
  // Update students.total_xp (THE SINGLE SOURCE OF TRUTH)
  const result = await client.query(
    `UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1, updated_at = NOW() 
     WHERE id = $2::uuid RETURNING total_xp`,
    [amount, studentId]
  );
  
  // Log to xp_transactions for audit trail only
  await client.query(
    `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
     VALUES ($1::uuid, $2, $3, $4, NOW())`,
    [studentId, Math.abs(amount), amount > 0 ? 'EARN' : 'SPEND', reason]
  );
  
  const newTotal = result.rows[0]?.total_xp || 0;
  console.log(`[XP] ${amount > 0 ? '+' : ''}${amount} XP to ${studentId} (${reason}) → Total: ${newTotal}`);
  return newTotal;
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
      // Try exact email match first
      let studentResult = await client.query(
        `SELECT id FROM students WHERE LOWER(parent_email) = $1 AND club_id = $2::uuid LIMIT 1`,
        [user.email.toLowerCase().trim(), user.club_id]
      );
      if (studentResult.rows.length > 0) {
        studentId = studentResult.rows[0].id;
        console.log('[Login] Found student for parent:', user.email, '-> studentId:', studentId);
      } else {
        // Fallback: Get any student from this club (for legacy parents without linked students)
        studentResult = await client.query(
          `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
          [user.club_id]
        );
        if (studentResult.rows.length > 0) {
          studentId = studentResult.rows[0].id;
          console.log('[Login] Fallback: Using first club student for parent:', user.email, '-> studentId:', studentId);
        } else {
          console.log('[Login] No student found for parent email:', user.email);
        }
      }
      
      // Read current total_xp (single source of truth - do NOT recalculate)
      if (studentId) {
        const xpResult = await client.query(
          `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
          [studentId]
        );
        console.log('[Login] Student XP:', studentId, '-> total_xp:', xpResult.rows[0]?.total_xp || 0);
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

// Simple name-based login - finds existing student or creates new one
async function handleLoginByName(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { name } = parseBody(req);
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const studentName = name.trim();
  const client = await pool.connect();
  
  try {
    // Step A: Look up existing student by name
    const existingResult = await client.query(
      `SELECT id, name, total_xp, club_id FROM students WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [studentName]
    );
    
    if (existingResult.rows.length > 0) {
      // Step B: Found existing student - return their current XP (single source of truth)
      const student = existingResult.rows[0];
      const currentXp = parseInt(student.total_xp || '0', 10);
      console.log(`[LoginByName] Found existing student: ${student.name} (${student.id}), XP: ${currentXp}`);
      
      return res.json({
        success: true,
        isNew: false,
        student: {
          id: student.id,
          name: student.name,
          totalXp: currentXp,
          clubId: student.club_id
        }
      });
    }
    
    // Step C: No existing student - create new one
    // Use the first available club (or create a demo club if needed)
    let clubId: string;
    const clubResult = await client.query(`SELECT id FROM clubs LIMIT 1`);
    if (clubResult.rows.length > 0) {
      clubId = clubResult.rows[0].id;
    } else {
      // Create a demo club if none exists
      const newClubResult = await client.query(
        `INSERT INTO clubs (name, owner_email, status, trial_status, created_at) 
         VALUES ('Demo Dojo', 'demo@taekup.com', 'active', 'active', NOW()) RETURNING id`
      );
      clubId = newClubResult.rows[0].id;
    }
    
    const insertResult = await client.query(
      `INSERT INTO students (club_id, name, belt, total_xp, created_at)
       VALUES ($1::uuid, $2, 'White', 0, NOW()) RETURNING id, name, total_xp, club_id`,
      [clubId, studentName]
    );
    const newStudent = insertResult.rows[0];
    console.log(`[LoginByName] Created new student: ${newStudent.name} (${newStudent.id})`);
    
    return res.json({
      success: true,
      isNew: true,
      student: {
        id: newStudent.id,
        name: newStudent.name,
        totalXp: 0,
        clubId: newStudent.club_id
      }
    });
  } catch (error: any) {
    console.error('[LoginByName] Error:', error.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  } finally {
    client.release();
  }
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
              total_points, total_xp, stripes, location, assigned_class, join_date, created_at
       FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const coachesResult = await client.query(
      `SELECT id, name, email, location, assigned_classes
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
      joinDate: s.join_date || s.created_at || new Date().toISOString(),
      totalXP: s.total_xp || 0,
      totalPoints: s.total_points || 0,
      currentStreak: 0,
      stripeCount: s.stripes || 0,
      location: s.location || '',
      assignedClass: s.assigned_class || '',
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
              `UPDATE coaches SET user_id = $1::uuid, name = $2, location = $3, assigned_classes = $4, is_active = true, updated_at = NOW()
               WHERE id = $5::uuid`,
              [userId, coach.name, coach.location || null, coach.assignedClasses || [], existingCoach.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO coaches (club_id, user_id, name, email, location, assigned_classes, is_active, created_at)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, true, NOW())`,
              [clubId, userId, coach.name, coachEmail, coach.location || null, coach.assignedClasses || []]
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
               location = COALESCE($6, location),
               assigned_class = COALESCE($7, assigned_class),
               updated_at = NOW()
             WHERE id = $8::uuid`,
            [
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0,
              student.location || null,
              student.assignedClass || null,
              studentId
            ]
          );
        } else {
          const joinDateValue = student.joinDate ? new Date(student.joinDate).toISOString() : new Date().toISOString();
          const insertResult = await client.query(
            `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, location, assigned_class, join_date, created_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11::timestamptz, NOW())
             RETURNING id`,
            [
              clubId, 
              student.name, 
              parentEmail,
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0,
              student.location || null,
              student.assignedClass || null,
              joinDateValue
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
  const { clubId, name, parentEmail, parentName, parentPhone, parentPassword, belt, birthdate, location, assignedClass } = parseBody(req);

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
      `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, location, assigned_class, join_date, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, NOW(), NOW())
       RETURNING id, name, parent_email, parent_name, belt, location, assigned_class, join_date`,
      [clubId, name, parentEmail || null, parentName || null, parentPhone || null, belt || 'White', birthdate ? birthdate + 'T00:00:00Z' : null, location || null, assignedClass || null]
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

async function handleStudentDelete(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const client = await pool.connect();
  try {
    // Check student exists
    const check = await client.query('SELECT id, name FROM students WHERE id = $1::uuid', [studentId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Delete related records first (in order to avoid foreign key constraints)
    await client.query('DELETE FROM habit_logs WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM challenge_submissions WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM class_feedback WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM promotions WHERE student_id = $1::uuid', [studentId]);
    try { await client.query('DELETE FROM challenge_videos WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM family_challenge_completions WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM daily_challenge_completions WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM family_logs WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM custom_habits WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM challenges WHERE from_student_id = $1 OR to_student_id = $1', [studentId]); } catch (e) { /* may not exist */ }
    
    // Now delete the student
    await client.query('DELETE FROM students WHERE id = $1::uuid', [studentId]);
    
    console.log(`[StudentDelete] Deleted student ${studentId}: ${check.rows[0].name}`);
    return res.status(200).json({ success: true, deleted: studentId });
  } catch (error: any) {
    console.error('[StudentDelete] Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleStudentUpdate(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { name, belt, stripes, location, assignedClass, parentName, parentEmail } = parseBody(req);
  
  const client = await pool.connect();
  try {
    // Auto-migrate: add columns if they don't exist
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_class VARCHAR(255)`);
    
    // Verify student exists
    const studentCheck = await client.query('SELECT id, club_id FROM students WHERE id = $1::uuid', [studentId]);
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (belt !== undefined) {
      updates.push(`belt = $${paramIndex++}`);
      values.push(belt);
    }
    if (stripes !== undefined) {
      updates.push(`stripes = $${paramIndex++}`);
      values.push(stripes);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    if (assignedClass !== undefined) {
      updates.push(`assigned_class = $${paramIndex++}`);
      values.push(assignedClass);
    }
    if (parentName !== undefined) {
      updates.push(`parent_name = $${paramIndex++}`);
      values.push(parentName);
    }
    if (parentEmail !== undefined) {
      updates.push(`parent_email = $${paramIndex++}`);
      values.push(parentEmail);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(studentId);
    
    const result = await client.query(
      `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramIndex}::uuid 
       RETURNING id, name, belt, stripes, location, assigned_class, parent_name, parent_email`,
      values
    );
    
    console.log(`[StudentUpdate] Updated student ${studentId}:`, result.rows[0]);
    return res.status(200).json({ success: true, student: result.rows[0] });
  } catch (error: any) {
    console.error('[StudentUpdate] Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleStudentGrading(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { totalPoints, lifetimeXp, sessionXp, sessionPts } = parseBody(req);
  
  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  const client = await pool.connect();
  try {
    // Use sessionXp to INCREMENT total_xp (single source of truth)
    const xpEarned = sessionXp || 0;
    
    await client.query(
      `UPDATE students SET 
        total_points = COALESCE($1, total_points),
        total_xp = COALESCE(total_xp, 0) + $2,
        last_class_at = NOW(),
        updated_at = NOW()
      WHERE id = $3::uuid`,
      [totalPoints, xpEarned, studentId]
    );

    // Log XP transaction for monthly leaderboard tracking
    if (xpEarned > 0) {
      await client.query(
        `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
         VALUES ($1::uuid, $2, 'EARN', 'Class grading', NOW())`,
        [studentId, xpEarned]
      );
      console.log('[Grading] Logged XP transaction:', studentId, '+', xpEarned, 'XP');
    }

    // Log PTS transaction for monthly effort widget tracking
    const ptsEarned = sessionPts || 0;
    if (ptsEarned > 0) {
      await client.query(
        `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
         VALUES ($1::uuid, $2, 'PTS_EARN', 'Class grading PTS', NOW())`,
        [studentId, ptsEarned]
      );
      console.log('[Grading] Logged PTS transaction:', studentId, '+', ptsEarned, 'PTS');
    }

    console.log('[Grading] Updated student:', studentId, 'totalPoints:', totalPoints, 'total_xp:', lifetimeXp);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Grading] Update error:', error.message);
    return res.status(500).json({ error: 'Failed to update student grading data' });
  } finally {
    client.release();
  }
}

async function handleGetStudentByEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const email = req.query.email as string;
  const clubId = req.query.clubId as string;
  
  if (!email || !clubId) {
    return res.status(400).json({ error: 'Email and clubId are required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE LOWER(parent_email) = $1 AND club_id = $2::uuid LIMIT 1`,
      [email.toLowerCase().trim(), clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    
    // Fallback: get first student from club
    const fallbackResult = await client.query(
      `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [clubId]
    );
    
    if (fallbackResult.rows.length > 0) {
      return res.json({ studentId: fallbackResult.rows[0].id });
    }
    
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetStudentByEmail] Error:', error.message);
    return res.json({ studentId: null });
  } finally {
    client.release();
  }
}

async function handleGetStudentByName(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const name = req.query.name as string;
  const clubId = req.query.clubId as string;
  
  if (!name || !clubId) {
    return res.status(400).json({ error: 'Name and clubId are required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE LOWER(name) = $1 AND club_id = $2::uuid LIMIT 1`,
      [name.toLowerCase().trim(), clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetStudentByName] Error:', error.message);
    return res.json({ studentId: null });
  } finally {
    client.release();
  }
}

async function handleGetFirstStudent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const clubId = req.query.clubId as string;
  
  if (!clubId) {
    return res.status(400).json({ error: 'clubId is required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at ASC LIMIT 1`,
      [clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetFirstStudent] Error:', error.message);
    return res.json({ studentId: null });
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
        `UPDATE coaches SET name = $1, club_id = $2::uuid, location = $5, assigned_classes = $6, is_active = true, invite_sent_at = NOW()
         WHERE email = $3`,
        [name, clubId, email, location || null, assignedClasses || []]
      );
    } else {
      await client.query(
        `INSERT INTO coaches (id, club_id, user_id, name, email, location, assigned_classes, is_active, invite_sent_at, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, true, NOW(), NOW())`,
        [clubId, userId, name, email, location || null, assignedClasses || []]
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

async function handleUpdateCoach(req: VercelRequest, res: VercelResponse, coachId: string) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);
  const { name, email, location, assignedClasses } = body;

  console.log('[UpdateCoach] Request body:', JSON.stringify(body));
  console.log('[UpdateCoach] coachId:', coachId);

  // Ensure assignedClasses is a valid array of strings
  let classesArray: string[] = [];
  if (Array.isArray(assignedClasses)) {
    classesArray = assignedClasses.filter((c: any) => typeof c === 'string');
  }

  const client = await pool.connect();
  try {
    // First check if coach exists
    const checkResult = await client.query(
      `SELECT id FROM coaches WHERE id = $1::uuid`,
      [coachId]
    );
    
    if (checkResult.rows.length === 0) {
      console.log('[UpdateCoach] Coach not found:', coachId);
      return res.status(404).json({ error: 'Coach not found' });
    }

    const result = await client.query(
      `UPDATE coaches SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        location = $3,
        assigned_classes = $4,
        updated_at = NOW()
       WHERE id = $5::uuid
       RETURNING id, name, email, location, assigned_classes`,
      [name || null, email || null, location || null, classesArray, coachId]
    );

    const coach = result.rows[0];
    console.log('[UpdateCoach] Updated coach:', coachId, 'result:', JSON.stringify(coach));
    return res.json({
      success: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
        location: coach.location || '',
        assignedClasses: coach.assigned_classes || []
      }
    });
  } catch (error: any) {
    console.error('[UpdateCoach] Error:', error.message, 'Stack:', error.stack);
    return res.status(500).json({ error: 'Failed to update coach', details: error.message });
  } finally {
    client.release();
  }
}

async function handleDeleteCoach(req: VercelRequest, res: VercelResponse, coachId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    // Soft delete - set is_active = false
    const result = await client.query(
      `UPDATE coaches SET is_active = false, updated_at = NOW() WHERE id = $1::uuid RETURNING id, email`,
      [coachId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found' });
    }

    // Also deactivate the user account
    const coachEmail = result.rows[0].email;
    if (coachEmail) {
      await client.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE email = $1`,
        [coachEmail]
      );
    }

    console.log('[DeleteCoach] Deleted coach:', coachId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[DeleteCoach] Error:', error.message);
    return res.status(500).json({ error: 'Failed to delete coach' });
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
    
    // If approved, award XP using unified helper
    if (status === 'approved' && xpAwarded > 0) {
      await applyXpDelta(client, video.student_id, xpAwarded, 'video_approved');
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
      // Check 1: Regular challenge_submissions table (for DB-stored challenges)
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
      
      // Check 2: xp_transactions table (for fallback/dynamic challenges)
      const fallbackSubmission = await client.query(
        `SELECT id, amount FROM xp_transactions 
         WHERE student_id = $1::uuid 
         AND reason LIKE '%daily_challenge%' 
         AND DATE(created_at) = $2::date
         LIMIT 1`,
        [studentId, today]
      );
      
      if (fallbackSubmission.rows.length > 0) {
        const xpAmount = fallbackSubmission.rows[0].amount || 0;
        return res.json({ 
          completed: true, 
          message: `You already completed today's mystery challenge!`,
          xpAwarded: xpAmount,
          wasCorrect: true
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
    
    // Add location and assigned_class columns to students table
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_class VARCHAR(255)`);
    
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
    
    // NUCLEAR RESET - Clear ALL dependencies in correct order
    // Step 1: Clear video votes (depends on videos)
    try { await client.query(`DELETE FROM challenge_video_votes`); } catch (e) { /* may not exist */ }
    // Step 2: Clear videos (depends on challenges)
    try { await client.query(`DELETE FROM challenge_videos`); } catch (e) { /* may not exist */ }
    // Step 3: Clear submissions
    await client.query(`DELETE FROM challenge_submissions`);
    try { await client.query(`DELETE FROM arena_submissions`); } catch (e) { /* may not exist */ }
    // Step 4: Now clear the challenges themselves
    try { await client.query(`DELETE FROM challenges`); } catch (e) { /* may not exist */ }
    await client.query(`DELETE FROM arena_challenges`);
    
    // Insert fresh GPP challenges into ARENA_CHALLENGES table (what /api/challenges/arena reads)
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
  
  const body = parseBody(req);
  console.log('📥 [DailyChallenge] Received Payload:', JSON.stringify(body, null, 2));
  console.log('🔍 Processing Submission:', { type: typeof body.challengeId, id: body.challengeId });
  
  // Extract fields - be very lenient with what we accept
  const { challengeId, studentId, selectedIndex, answer, isCorrect: frontendIsCorrect, xpReward: frontendXpReward } = body;
  const clubIdRaw = body.clubId;
  
  // Only require studentId and challengeId
  if (!challengeId || !studentId) {
    console.error('❌ [DailyChallenge] Missing required fields:', { challengeId, studentId });
    return res.status(400).json({ error: 'challengeId and studentId are required' });
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // studentId MUST be a valid UUID
  if (!uuidRegex.test(String(studentId))) {
    console.error('❌ [DailyChallenge] Invalid studentId format:', studentId);
    return res.status(400).json({ error: 'Invalid studentId format' });
  }
  
  // challengeId: Accept UUID OR string starting with "fallback-" or "static-"
  const challengeIdStr = String(challengeId);
  const isFallbackChallenge = challengeIdStr.startsWith('fallback-') || challengeIdStr.startsWith('static-') || !uuidRegex.test(challengeIdStr);
  const isValidUUID = uuidRegex.test(challengeIdStr);
  
  console.log('📋 [DailyChallenge] Challenge type:', { isFallbackChallenge, isValidUUID, challengeIdStr });
  
  // clubId: FULLY OPTIONAL - accept null, undefined, invalid strings, anything
  const validClubId = (clubIdRaw && typeof clubIdRaw === 'string' && uuidRegex.test(clubIdRaw)) ? clubIdRaw : null;
  
  console.log('📋 [DailyChallenge] Validated (lenient):', { studentId, challengeId: challengeIdStr, validClubId, selectedIndex, isFallbackChallenge });

  const client = await pool.connect();
  try {
    // BUG FIX: Check if user already completed a daily challenge TODAY (prevents infinite XP exploit)
    // Use xp_transactions table (correct table name) with reason containing 'daily_challenge'
    const today = new Date().toISOString().split('T')[0];
    const alreadyPlayedToday = await client.query(
      `SELECT id, amount FROM xp_transactions 
       WHERE student_id = $1::uuid 
       AND reason LIKE '%daily_challenge%' 
       AND DATE(created_at) = $2::date
       LIMIT 1`,
      [studentId, today]
    );
    
    if (alreadyPlayedToday.rows.length > 0) {
      console.log('⛔ [DailyChallenge] Already played today - blocking duplicate:', { studentId, today });
      return res.status(400).json({
        error: 'Already completed',
        message: 'You already completed today\'s challenge! Come back tomorrow.',
        previousXp: alreadyPlayedToday.rows[0].amount || 0
      });
    }
    
    // FALLBACK CHALLENGE HANDLING: Skip DB lookup, trust frontend
    if (isFallbackChallenge) {
      console.log('🎯 [DailyChallenge] Processing FALLBACK challenge - skipping DB lookup');
      
      // For fallback challenges, trust the frontend's isCorrect or default to true
      const isCorrect = frontendIsCorrect !== undefined ? frontendIsCorrect : true;
      const xpAwarded = isCorrect ? (frontendXpReward || 50) : 0;
      
      // Award XP using unified helper
      if (isCorrect && xpAwarded > 0) {
        await applyXpDelta(client, studentId, xpAwarded, 'daily_challenge');
      }
      
      return res.json({
        success: true,
        isCorrect,
        xpAwarded,
        explanation: 'Great job completing the challenge!',
        message: isCorrect ? `Correct! +${xpAwarded} XP` : 'Not quite! Try again tomorrow.'
      });
    }

    // REGULAR CHALLENGE HANDLING: Full DB lookup and validation
    // Check for duplicate submission BEFORE processing
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
    
    // Use the ACTUAL xp_reward from the database
    const challengeXpReward = challenge.xp_reward || 50;
    const xpAwarded = isCorrect ? challengeXpReward : 0;

    // Save submission record (clubId is optional for home users)
    console.log('💾 [DailyChallenge] Inserting submission:', { challengeId, studentId, validClubId, isCorrect, xpAwarded });
    await client.query(
      `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [challengeId, studentId, validClubId, answer || String(selectedIndex), isCorrect, xpAwarded]
    );

    // Update student XP using unified helper
    if (isCorrect && xpAwarded > 0) {
      await applyXpDelta(client, studentId, xpAwarded, 'daily_challenge');
    }

    console.log(`✅ [DailyChallenge] Submit Success - XP Awarded: ${xpAwarded}`);
    
    return res.json({
      success: true,
      isCorrect,
      correctIndex,
      xpAwarded,
      explanation: quizData.explanation || 'Great effort!',
      message: isCorrect ? `Correct! +${xpAwarded} XP` : `Not quite! The correct answer was option ${correctIndex + 1}.`
    });
  } catch (error: any) {
    console.error('🔥 FATAL SUBMIT ERROR:', error);
    console.error('🔥 Error stack:', error.stack);
    return res.status(500).json({ error: 'Failed to submit challenge', details: error.message });
  } finally {
    client.release();
  }
}

// Quick status check for daily challenge completion (used by frontend fallback)
async function handleDailyChallengeStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId format' });
  }
  
  const today = new Date().toISOString().split('T')[0];
  const client = await pool.connect();
  
  try {
    // Check xp_transactions for today's daily_challenge entry
    const result = await client.query(
      `SELECT id, amount FROM xp_transactions 
       WHERE student_id = $1::uuid 
       AND reason LIKE '%daily_challenge%' 
       AND DATE(created_at) = $2::date
       LIMIT 1`,
      [studentId, today]
    );
    
    if (result.rows.length > 0) {
      return res.json({
        completed: true,
        alreadyPlayed: true,
        xpAwarded: result.rows[0].amount || 50,
        message: 'You already completed today\'s challenge!'
      });
    }
    
    // Also check challenge_submissions table
    const submissionResult = await client.query(
      `SELECT cs.xp_awarded FROM challenge_submissions cs
       JOIN daily_challenges dc ON cs.challenge_id = dc.id
       WHERE cs.student_id = $1::uuid AND dc.date = $2
       LIMIT 1`,
      [studentId, today]
    );
    
    if (submissionResult.rows.length > 0) {
      return res.json({
        completed: true,
        alreadyPlayed: true,
        xpAwarded: submissionResult.rows[0].xp_awarded || 50,
        message: 'You already completed today\'s challenge!'
      });
    }
    
    return res.json({ completed: false, alreadyPlayed: false });
  } catch (error: any) {
    console.error('[DailyChallengeStatus] Error:', error.message);
    return res.json({ completed: false, alreadyPlayed: false });
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

// Arena Challenge Submit (Trust/Video)
const TRUST_PER_CHALLENGE_LIMIT = 1; // STRICT: 1 time per challenge per day
const VIDEO_XP_MULTIPLIER = 2;

// Challenge metadata mapping (since challenges are hardcoded in frontend)
const CHALLENGE_METADATA: Record<string, { name: string; icon: string; category: string }> = {
  'pushup_master': { name: 'Push-up Master', icon: '💪', category: 'Power' },
  'squat_challenge': { name: 'Squat Challenge', icon: '💪', category: 'Power' },
  'burpee_blast': { name: 'Burpee Blast', icon: '💪', category: 'Power' },
  'abs_of_steel': { name: 'Abs of Steel', icon: '💪', category: 'Power' },
  '100_kicks': { name: '100 Kicks Marathon', icon: '🎯', category: 'Technique' },
  'speed_punches': { name: 'Speed Punches', icon: '🎯', category: 'Technique' },
  'horse_stance': { name: 'Iron Horse Stance', icon: '🎯', category: 'Technique' },
  'jump_rope': { name: 'Jump Rope Ninja', icon: '🎯', category: 'Technique' },
  'plank_hold': { name: 'Plank Hold', icon: '🧘', category: 'Flexibility' },
  'touch_toes': { name: 'Touch Your Toes', icon: '🧘', category: 'Flexibility' },
  'wall_sit': { name: 'The Wall Sit', icon: '🧘', category: 'Flexibility' },
  'one_leg_balance': { name: 'One-Leg Balance', icon: '🧘', category: 'Flexibility' },
  'family_form_practice': { name: 'Family Form Practice', icon: '👨‍👧', category: 'Family' },
  'family_stretch': { name: 'Family Stretch', icon: '👨‍👧', category: 'Family' },
  'family_kicks': { name: 'Family Kicks', icon: '👨‍👧', category: 'Family' },
};

// GET /api/challenges/received/:studentId - Fetch challenges received by student
async function handleReceivedChallenges(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!studentId || !uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // Query challenge_inbox table for incomplete challenges
    const result = await client.query(
      `SELECT * FROM challenge_inbox WHERE student_id = $1::uuid AND is_completed = false ORDER BY created_at DESC`,
      [studentId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Challenges] Fetch received error:', error.message, error.stack);
    // Return empty array instead of 500 if table doesn't exist
    return res.json([]);
  } finally {
    client.release();
  }
}

// GET /api/challenges/sent/:studentId - Fetch challenges sent by student
async function handleSentChallenges(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!studentId || !uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM challenges WHERE from_student_id = $1::uuid ORDER BY created_at DESC`,
      [studentId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Challenges] Fetch sent error:', error.message);
    // Gracefully return empty array if table doesn't exist or any DB error
    return res.json([]);
  } finally {
    client.release();
  }
}

// GET /api/challenges/history - Fetch challenge submission history
async function handleChallengeHistory(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        id,
        answer as challenge_type,
        status,
        proof_type,
        xp_awarded,
        score,
        video_url,
        mode,
        completed_at
      FROM challenge_submissions 
      WHERE student_id = $1::uuid
      ORDER BY completed_at DESC
      LIMIT 50`,
      [studentId]
    );

    const history = result.rows.map(row => {
      const challengeType = row.challenge_type || 'unknown';
      let meta = CHALLENGE_METADATA[challengeType];
      if (!meta) {
        // For custom challenges, show friendly name instead of ugly ID
        if (challengeType.startsWith('custom_')) {
          meta = { name: 'Custom Challenge', icon: '⭐', category: 'Coach Picks' };
        } else {
          meta = { 
            name: challengeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), 
            icon: '⚡', 
            category: 'General' 
          };
        }
      }

      return {
        id: row.id,
        challengeType,
        challengeName: meta.name,
        icon: meta.icon,
        category: meta.category,
        status: row.status || 'COMPLETED',
        proofType: row.proof_type || 'TRUST',
        xpAwarded: row.xp_awarded || 0,
        score: row.score || 0,
        videoUrl: row.video_url,
        mode: row.mode || 'SOLO',
        completedAt: row.completed_at
      };
    });

    return res.json({ history });
  } catch (error: any) {
    console.error('[ChallengeHistory] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  } finally {
    client.release();
  }
}

// =====================================================
// HOME DOJO - HABIT TRACKING
// =====================================================
const HABIT_XP = 10;
const DAILY_HABIT_XP_CAP = 60;

async function handleHabitCheck(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, habitName } = parseBody(req);

  if (!studentId || !habitName) {
    return res.status(400).json({ error: 'studentId and habitName are required' });
  }

  // STRICT MODE: Reject invalid UUIDs - NO MORE DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trimmedStudentId = studentId.trim();
  if (!uuidRegex.test(trimmedStudentId)) {
    console.error('[HomeDojo] INVALID UUID FORMAT:', studentId);
    return res.status(400).json({
      error: 'Invalid student ID format',
      receivedId: studentId,
      message: 'Student ID must be a valid UUID'
    });
  }

  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // First verify the student exists in database (use trimmed ID)
    const studentCheck = await client.query(
      `SELECT id FROM students WHERE id = $1::uuid`,
      [trimmedStudentId]
    );
    
    if (studentCheck.rows.length === 0) {
      console.error('[HomeDojo] STUDENT NOT FOUND IN DB:', trimmedStudentId);
      return res.status(404).json({
        error: 'Student ID not found in database',
        studentId: trimmedStudentId,
        message: 'This student does not exist in the database. Please re-login.'
      });
    }
    
    // Use transaction for atomicity
    await client.query('BEGIN');

    // Check if habit already completed today
    const existing = await client.query(
      `SELECT id FROM habit_logs WHERE student_id = $1::uuid AND habit_name = $2 AND log_date = $3::date`,
      [trimmedStudentId, habitName, today]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Already completed',
        message: 'You already completed this habit today!',
        alreadyCompleted: true
      });
    }

    // Anti-cheat: Check daily XP cap (60 XP max from habits per day)
    const dailyXpResult = await client.query(
      `SELECT COALESCE(SUM(xp_awarded), 0) as total_xp_today FROM habit_logs WHERE student_id = $1::uuid AND log_date = $2::date`,
      [trimmedStudentId, today]
    );
    const totalXpToday = parseInt(dailyXpResult.rows[0]?.total_xp_today || '0');
    const atDailyLimit = totalXpToday >= DAILY_HABIT_XP_CAP;
    const xpToAward = atDailyLimit ? 0 : HABIT_XP;

    // Insert habit log (mark as done regardless of XP cap)
    await client.query(
      `INSERT INTO habit_logs (student_id, habit_name, xp_awarded, log_date) VALUES ($1::uuid, $2, $3, $4::date)`,
      [trimmedStudentId, habitName, xpToAward, today]
    );

    let newTotalXp = 0;
    if (xpToAward > 0) {
      // Use unified helper for XP updates
      newTotalXp = await applyXpDelta(client, trimmedStudentId, xpToAward, 'habit');
      console.log(`[HomeDojo] Habit "${habitName}" completed: +${xpToAward} XP, new total: ${newTotalXp}`);
    } else {
      const currentXp = await client.query(`SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`, [trimmedStudentId]);
      newTotalXp = currentXp.rows[0]?.xp || 0;
      console.log(`[HomeDojo] Habit "${habitName}" completed but daily cap reached (${totalXpToday}/${DAILY_HABIT_XP_CAP} XP)`);
    }

    await client.query('COMMIT');

    return res.json({
      success: true,
      xpAwarded: xpToAward,
      newTotalXp,
      dailyXpEarned: totalXpToday + xpToAward,
      dailyXpCap: DAILY_HABIT_XP_CAP,
      atDailyLimit: (totalXpToday + xpToAward) >= DAILY_HABIT_XP_CAP,
      message: atDailyLimit 
        ? `Habit done! Daily Dojo Limit reached (Max ${DAILY_HABIT_XP_CAP} XP).`
        : `Habit completed! +${HABIT_XP} XP earned.`
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[HomeDojo] Habit check error:', error.message, error.stack);
    return res.status(500).json({ 
      error: error.message || 'Failed to log habit',
      details: error.stack,
      code: error.code
    });
  } finally {
    client.release();
  }
}

// Self-healing XP Sync - recalculates total_xp from all log tables
async function handleXpSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = parseBody(req);

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // SIMPLE: Just return current total_xp (single source of truth)
    const result = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const totalXp = result.rows[0]?.total_xp || 0;
    return res.json({ success: true, totalXp, synced: true });
  } catch (error: any) {
    console.error('[XP Sync] Error:', error.message);
    return res.status(500).json({ error: 'Failed to sync XP' });
  } finally {
    client.release();
  }
}

// Calculate streak from habit_logs - consecutive days with at least 1 habit completed
async function calculateStreak(client: any, studentId: string): Promise<number> {
  try {
    // Get all distinct dates where student completed at least 1 habit, sorted DESC
    const result = await client.query(
      `SELECT DISTINCT log_date FROM habit_logs WHERE student_id = $1::uuid ORDER BY log_date DESC`,
      [studentId]
    );

    if (result.rows.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dates = result.rows.map((r: any) => {
      const d = new Date(r.log_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });

    // Check if streak is active (today or yesterday has activity)
    const todayTime = today.getTime();
    const yesterdayTime = yesterday.getTime();
    
    if (!dates.includes(todayTime) && !dates.includes(yesterdayTime)) {
      return 0; // Streak broken - no activity today or yesterday
    }

    // Count consecutive days backwards from the most recent activity
    let streak = 0;
    let checkDate = dates.includes(todayTime) ? today : yesterday;
    
    for (let i = 0; i < dates.length && i < 365; i++) {
      const expectedTime = checkDate.getTime();
      if (dates.includes(expectedTime)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break; // Gap found, streak ends
      }
    }

    return streak;
  } catch (error) {
    console.error('[Streak] Calculation error:', error);
    return 0;
  }
}

async function handleHabitStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];

    // First check if student exists (use COALESCE for compatibility)
    const studentResult = await client.query(
      `SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      console.log(`[HomeDojo] Student ${studentId} not found for status - returning empty`);
      return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: DAILY_HABIT_XP_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
    }
    
    const totalXp = studentResult.rows[0]?.xp || 0;

    // Fetch today's habit logs
    const result = await client.query(
      `SELECT habit_name, xp_awarded FROM habit_logs WHERE student_id = $1::uuid AND log_date = $2::date`,
      [studentId, today]
    );

    const completedHabits = result.rows.map(r => r.habit_name);
    const totalXpToday = result.rows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);

    // Calculate real streak from habit_logs
    const streak = await calculateStreak(client, studentId);

    // Return totalXp as single source of truth (also as lifetimeXp for backward compatibility)
    return res.json({ completedHabits, totalXpToday, dailyXpCap: DAILY_HABIT_XP_CAP, totalXp, lifetimeXp: totalXp, streak });
  } catch (error: any) {
    console.error('[HomeDojo] Status fetch error:', error.message);
    return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: DAILY_HABIT_XP_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
  } finally {
    client.release();
  }
}

async function handleGetCustomHabits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, title, icon, is_active FROM user_custom_habits WHERE student_id = $1::uuid AND is_active = true ORDER BY created_at ASC`,
      [studentId]
    );

    return res.json({ customHabits: result.rows });
  } catch (error: any) {
    console.error('[HomeDojo] Get custom habits error:', error.message);
    // Gracefully return empty array if table doesn't exist or any DB error
    return res.json({ customHabits: [] });
  } finally {
    client.release();
  }
}

async function handleCreateCustomHabit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, title, icon } = parseBody(req);

  if (!studentId || !title) {
    return res.status(400).json({ error: 'studentId and title are required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO user_custom_habits (student_id, title, icon) VALUES ($1::uuid, $2, $3) RETURNING id, title, icon, is_active`,
      [studentId, title.slice(0, 100), icon || '✨']
    );

    console.log(`[HomeDojo] Created custom habit: "${title}" for student ${studentId}`);
    return res.json({ success: true, habit: result.rows[0] });
  } catch (error: any) {
    console.error('[HomeDojo] Create custom habit error:', error.message);
    return res.status(500).json({ error: 'Failed to create habit' });
  } finally {
    client.release();
  }
}

async function handleDeleteCustomHabit(req: VercelRequest, res: VercelResponse, habitId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(habitId)) {
    return res.status(400).json({ error: 'Invalid habitId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE user_custom_habits SET is_active = false WHERE id = $1::uuid`,
      [habitId]
    );

    console.log(`[HomeDojo] Deleted custom habit: ${habitId}`);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[HomeDojo] Delete custom habit error:', error.message);
    return res.status(500).json({ error: 'Failed to delete habit' });
  } finally {
    client.release();
  }
}

// =====================================================
// FAMILY CHALLENGES - Trust System (Parent Verified)
// =====================================================

// Server-side family challenge definitions (canonical XP values)
const FAMILY_CHALLENGES: Record<string, { name: string; baseXp: number }> = {
  // HARD tier (100+ XP)
  'family_pushups': { name: 'Parent vs Kid: Pushups', baseXp: 100 },
  'family_plank': { name: 'Family Plank-Off', baseXp: 120 },
  'family_squat_hold': { name: 'The Squat Showdown', baseXp: 100 },
  // MEDIUM tier (80-99 XP)
  'family_statue': { name: 'The Statue Challenge', baseXp: 80 },
  'family_kicks': { name: 'Kick Count Battle', baseXp: 90 },
  'family_balance': { name: 'Flamingo Stand-Off', baseXp: 80 },
  'family_situps': { name: 'Sit-Up Showdown', baseXp: 90 },
  'family_reaction': { name: 'Reaction Time Test', baseXp: 85 },
  'family_mirror': { name: 'Mirror Challenge', baseXp: 75 },
  // EASY tier (50-79 XP)
  'family_dance': { name: 'Martial Arts Dance-Off', baseXp: 70 },
  'family_stretch': { name: 'Stretch Together', baseXp: 60 },
  'family_breathing': { name: 'Calm Warrior Breathing', baseXp: 50 }
};

async function handleFamilyChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, challengeId, won } = parseBody(req);

  if (!studentId || !challengeId) {
    return res.status(400).json({ error: 'studentId and challengeId are required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  // SERVER-SIDE XP CALCULATION - prevent client tampering
  const challenge = FAMILY_CHALLENGES[challengeId];
  if (!challenge) {
    return res.status(400).json({ error: 'Invalid challengeId' });
  }

  const baseXp = challenge.baseXp;
  const xp = won ? baseXp : Math.round(baseXp * 0.5); // Win = full XP, Loss = 50%
  const today = new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // Check if already completed today (1x daily limit per challenge)
    const existing = await client.query(
      `SELECT id FROM family_logs WHERE student_id = $1::uuid AND challenge_id = $2 AND completed_at = $3::date`,
      [studentId, challengeId, today]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'You already completed this family challenge today!'
      });
    }

    // Insert into family_logs
    await client.query(
      `INSERT INTO family_logs (student_id, challenge_id, xp_awarded, completed_at) VALUES ($1::uuid, $2, $3, $4::date)`,
      [studentId, challengeId, xp, today]
    );

    // Update student's total_xp using unified helper
    const newTotalXp = await applyXpDelta(client, studentId, xp, 'family_challenge');

    console.log(`[FamilyChallenge] "${challengeId}" completed: +${xp} XP, won: ${won}, new total_xp: ${newTotalXp}`);

    return res.json({
      success: true,
      xpAwarded: xp,
      newTotalXp,
      won: won || false,
      message: `Family challenge completed! +${xp} XP earned.`
    });
  } catch (error: any) {
    console.error('[FamilyChallenge] Submit error:', error.message);
    return res.status(500).json({ error: 'Failed to submit family challenge' });
  } finally {
    client.release();
  }
}

async function handleFamilyChallengeStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const today = new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // Get all completed family challenges for today
    const result = await client.query(
      `SELECT challenge_id, xp_awarded FROM family_logs WHERE student_id = $1::uuid AND completed_at = $2::date`,
      [studentId, today]
    );

    const completedChallenges = result.rows.map(r => r.challenge_id);
    const totalXpToday = result.rows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);

    return res.json({
      completedChallenges,
      totalXpToday
    });
  } catch (error: any) {
    console.error('[FamilyChallenge] Status error:', error.message);
    return res.json({ completedChallenges: [], totalXpToday: 0 });
  } finally {
    client.release();
  }
}

async function handleLeaderboard(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clubId = req.query.clubId as string;
  
  if (!clubId) {
    return res.status(400).json({ error: 'clubId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(clubId)) {
    return res.status(400).json({ error: 'Invalid clubId format' });
  }

  const client = await pool.connect();
  try {
    // SIMPLE: Just read from students.total_xp (the single source of truth)
    const studentsResult = await client.query(`
      SELECT id, name, belt, stripes, COALESCE(total_xp, 0) as total_xp
      FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();

    // Monthly XP from xp_transactions only (audit log)
    const monthlyXpResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as monthly_xp
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'EARN' AND created_at >= $2::timestamp
      GROUP BY student_id
    `, [clubId, monthStartStr]);

    // Monthly PTS from xp_transactions (PTS_EARN type)
    const monthlyPtsResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as monthly_pts
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'PTS_EARN' AND created_at >= $2::timestamp
      GROUP BY student_id
    `, [clubId, monthStartStr]);

    const monthlyXpMap = new Map(monthlyXpResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_xp) || 0]));
    const monthlyPtsMap = new Map(monthlyPtsResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_pts) || 0]));

    const leaderboard = studentsResult.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      belt: s.belt,
      stripes: s.stripes || 0,
      totalXP: parseInt(s.total_xp) || 0,
      monthlyXP: monthlyXpMap.get(s.id) || 0,
      monthlyPTS: monthlyPtsMap.get(s.id) || 0
    }))
    .sort((a: any, b: any) => b.totalXP - a.totalXP)
    .map((s: any, index: number) => ({ ...s, rank: index + 1 }));

    console.log('[Leaderboard] Fetched:', leaderboard.length, 'students');

    return res.json({ leaderboard });
  } catch (error: any) {
    console.error('[Leaderboard] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  } finally {
    client.release();
  }
}

async function handleSyncRivals(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // SIMPLE: Just return current total_xp (single source of truth)
    const result = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const totalXp = result.rows[0]?.total_xp || 0;
    return res.json({ success: true, totalXp, message: 'Rivals stats synced successfully' });
  } catch (error: any) {
    console.error('[SyncRivals] Error:', error.message);
    return res.status(500).json({ error: 'Failed to sync rivals stats' });
  } finally {
    client.release();
  }
}

async function handleChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, clubId, challengeType, score, proofType, videoUrl, challengeXp } = parseBody(req);

  if (!studentId || !challengeType) {
    return res.status(400).json({ error: 'studentId and challengeType are required' });
  }

  if (!proofType || !['TRUST', 'VIDEO'].includes(proofType)) {
    return res.status(400).json({ error: 'proofType must be TRUST or VIDEO' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const baseXp = challengeXp || 15;
  const finalXp = proofType === 'VIDEO' ? baseXp * VIDEO_XP_MULTIPLIER : baseXp;
  const today = new Date().toISOString().split('T')[0];

  if (proofType === 'TRUST') {
    const client = await pool.connect();
    try {
      // Check per-challenge daily limit
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'TRUST' 
         AND DATE(completed_at) = $3::date`,
        [studentId, challengeType, today]
      );

      const count = parseInt(countResult.rows[0]?.count || '0');
      if (count >= TRUST_PER_CHALLENGE_LIMIT) {
        return res.status(429).json({
          error: 'Daily mission complete',
          message: 'Daily Mission Complete! You can earn XP for this challenge again tomorrow.',
          limitReached: true,
          alreadyCompleted: true
        });
      }

      // Get student's club
      const studentResult = await client.query(
        `SELECT id, club_id FROM students WHERE id = $1::uuid`,
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const validClubId = studentResult.rows[0].club_id;

      // Create submission with deterministic challenge_id
      const challengeUUID = generateChallengeUUID(challengeType);
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, xp_awarded, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SOLO', 'COMPLETED', 'TRUST', $6, NOW())`,
        [challengeUUID, studentId, validClubId, challengeType, score || 0, finalXp]
      );

      // Award XP using unified helper
      await applyXpDelta(client, studentId, finalXp, 'arena_challenge');

      console.log(`[Arena] Trust submission for "${challengeType}": +${finalXp} XP (${count + 1}/${TRUST_PER_CHALLENGE_LIMIT} today)`);

      return res.json({
        success: true,
        status: 'COMPLETED',
        xpAwarded: finalXp,
        earned_xp: finalXp,
        remainingForChallenge: TRUST_PER_CHALLENGE_LIMIT - count - 1,
        message: `Challenge completed! +${finalXp} XP earned.`
      });
    } finally {
      client.release();
    }
  }

  if (proofType === 'VIDEO') {
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required for video proof' });
    }

    const client = await pool.connect();
    try {
      const studentResult = await client.query(
        `SELECT s.id, s.club_id, s.premium_status, c.parent_premium_enabled
         FROM students s LEFT JOIN clubs c ON s.club_id = c.id
         WHERE s.id = $1::uuid`,
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = studentResult.rows[0];
      const hasPremium = student.premium_status !== 'none' || student.parent_premium_enabled;

      if (!hasPremium) {
        return res.status(403).json({
          error: 'Premium required',
          message: 'Video proof requires premium. Upgrade to earn more XP!'
        });
      }

      const challengeUUID = generateChallengeUUID(challengeType);
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, video_url, xp_awarded, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SOLO', 'PENDING', 'VIDEO', $6, $7, NOW())`,
        [challengeUUID, studentId, student.club_id, challengeType, score || 0, videoUrl, finalXp]
      );

      return res.json({
        success: true,
        status: 'PENDING',
        xpAwarded: 0,
        pendingXp: finalXp,
        earned_xp: 0,
        message: `Video submitted! You'll earn ${finalXp} XP when verified.`
      });
    } finally {
      client.release();
    }
  }

  return res.status(400).json({ error: 'Invalid proofType' });
}

// ============ VIRTUAL DOJO ENDPOINTS ============

const DOJO_SPIN_COST = 200;

const DOJO_WHEEL_ITEMS = [
  { name: 'Rice Ball', type: 'FOOD', rarity: 'COMMON', emoji: '🍙', evolutionPoints: 10, weight: 30 },
  { name: 'Sushi', type: 'FOOD', rarity: 'COMMON', emoji: '🍣', evolutionPoints: 15, weight: 25 },
  { name: 'Ramen', type: 'FOOD', rarity: 'RARE', emoji: '🍜', evolutionPoints: 25, weight: 15 },
  { name: 'Golden Apple', type: 'FOOD', rarity: 'EPIC', emoji: '🍎', evolutionPoints: 50, weight: 8 },
  { name: 'Dragon Fruit', type: 'FOOD', rarity: 'LEGENDARY', emoji: '🐉', evolutionPoints: 100, weight: 2 },
  { name: 'Bonsai Tree', type: 'DECORATION', rarity: 'COMMON', emoji: '🌳', evolutionPoints: 0, weight: 20 },
  { name: 'Lucky Cat', type: 'DECORATION', rarity: 'RARE', emoji: '🐱', evolutionPoints: 0, weight: 10 },
  { name: 'Golden Trophy', type: 'DECORATION', rarity: 'EPIC', emoji: '🏆', evolutionPoints: 0, weight: 5 },
  { name: 'Crystal Orb', type: 'DECORATION', rarity: 'LEGENDARY', emoji: '🔮', evolutionPoints: 0, weight: 2 },
];

const DOJO_EVOLUTION_STAGES = [
  { stage: 'egg', minPoints: 0 },
  { stage: 'baby', minPoints: 50 },
  { stage: 'teen', minPoints: 150 },
  { stage: 'adult', minPoints: 400 },
  { stage: 'master', minPoints: 1000 },
];

async function calculateDojoXp(client: any, studentId: string): Promise<number> {
  // Use students.total_xp as the single source of truth
  const result = await client.query(
    `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
    [studentId]
  );
  return parseInt(result.rows[0]?.total_xp || '0', 10);
}

function selectDojoWheelItem() {
  const totalWeight = DOJO_WHEEL_ITEMS.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of DOJO_WHEEL_ITEMS) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return DOJO_WHEEL_ITEMS[0];
}

async function handleDojoState(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    const xpBalance = await calculateDojoXp(client, studentId);

    let inventory: any[] = [];
    try {
      const invResult = await client.query(
        `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
         FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
        [studentId]
      );
      inventory = invResult.rows.map((item: any) => ({
        id: item.id,
        itemName: item.item_name,
        itemType: item.item_type,
        itemRarity: item.item_rarity,
        itemEmoji: item.item_emoji,
        quantity: item.quantity,
        evolutionPoints: item.evolution_points,
      }));
    } catch (err) {
      inventory = [];
    }

    let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
    const monsterResult = await client.query(
      `SELECT dojo_monster FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    if (monsterResult.rows[0]?.dojo_monster) {
      monster = monsterResult.rows[0].dojo_monster;
    }

    return res.json({ xpBalance, inventory, monster });
  } finally {
    client.release();
  }
}

async function handleDojoSpin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = parseBody(req);
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    // Check current XP from students.total_xp (single source of truth)
    const xpResult = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const currentXp = parseInt(xpResult.rows[0]?.total_xp || '0', 10);
    
    if (currentXp < DOJO_SPIN_COST) {
      return res.status(400).json({ error: `Not enough XP! You have ${currentXp} XP but need ${DOJO_SPIN_COST} XP.` });
    }

    // Use unified helper to update BOTH students.total_xp AND log transaction
    await applyXpDelta(client, studentId, -DOJO_SPIN_COST, 'Lucky Wheel spin');

    const wonItem = selectDojoWheelItem();

    const existing = await client.query(
      `SELECT id, quantity FROM dojo_inventory 
       WHERE student_id = $1::uuid AND item_name = $2`,
      [studentId, wonItem.name]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE dojo_inventory SET quantity = quantity + 1 WHERE id = $1::uuid`,
        [existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO dojo_inventory (student_id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points)
         VALUES ($1::uuid, $2, $3, $4, $5, 1, $6)`,
        [studentId, wonItem.name, wonItem.type, wonItem.rarity, wonItem.emoji, wonItem.evolutionPoints]
      );
    }

    const newXpBalance = await calculateDojoXp(client, studentId);
    const invResult = await client.query(
      `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
       FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
      [studentId]
    );
    const inventory = invResult.rows.map((i: any) => ({
      id: i.id, itemName: i.item_name, itemType: i.item_type, itemRarity: i.item_rarity,
      itemEmoji: i.item_emoji, quantity: i.quantity, evolutionPoints: i.evolution_points,
    }));

    console.log(`[Dojo] Spin: ${studentId} won ${wonItem.emoji} ${wonItem.name} (${wonItem.rarity})`);

    return res.json({ item: wonItem, newXpBalance, inventory });
  } finally {
    client.release();
  }
}

async function handleDojoFeed(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, itemId } = parseBody(req);
  if (!studentId || !itemId) return res.status(400).json({ error: 'studentId and itemId are required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId) || !uuidRegex.test(itemId)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  const client = await pool.connect();
  try {
    const itemResult = await client.query(
      `SELECT id, item_type, evolution_points, quantity FROM dojo_inventory 
       WHERE id = $1::uuid AND student_id = $2::uuid`,
      [itemId, studentId]
    );

    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    const item = itemResult.rows[0];
    if (item.item_type !== 'FOOD') return res.status(400).json({ error: 'Only food items can be fed to the monster' });
    if (item.quantity < 1) return res.status(400).json({ error: 'No items left' });

    await client.query(`UPDATE dojo_inventory SET quantity = quantity - 1 WHERE id = $1::uuid`, [itemId]);

    const monsterResult = await client.query(
      `SELECT dojo_monster FROM students WHERE id = $1::uuid`,
      [studentId]
    );

    let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
    if (monsterResult.rows[0]?.dojo_monster) {
      monster = monsterResult.rows[0].dojo_monster;
    }

    monster.evolutionPoints += item.evolution_points;

    const sortedStages = [...DOJO_EVOLUTION_STAGES].reverse();
    const newStage = sortedStages.find(s => monster.evolutionPoints >= s.minPoints) || DOJO_EVOLUTION_STAGES[0];
    monster.stage = newStage.stage;

    await client.query(
      `UPDATE students SET dojo_monster = $1::jsonb WHERE id = $2::uuid`,
      [JSON.stringify(monster), studentId]
    );

    const invResult = await client.query(
      `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
       FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
      [studentId]
    );
    const inventory = invResult.rows.map((i: any) => ({
      id: i.id, itemName: i.item_name, itemType: i.item_type, itemRarity: i.item_rarity,
      itemEmoji: i.item_emoji, quantity: i.quantity, evolutionPoints: i.evolution_points,
    }));

    console.log(`[Dojo] Feed: ${studentId} fed monster +${item.evolution_points} EP, now at ${monster.evolutionPoints} EP (${monster.stage})`);

    return res.json({ monster, inventory });
  } finally {
    client.release();
  }
}

async function handleDojoDebugAddXP(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, amount = 1000 } = parseBody(req);
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    // Use unified helper to update BOTH students.total_xp AND log transaction
    const newTotal = await applyXpDelta(client, studentId, amount, 'DEBUG: Test XP added');

    console.log(`[Dojo DEBUG] Added ${amount} XP to student ${studentId}, new total_xp: ${newTotal}`);

    return res.json({ success: true, xpBalance: newTotal });
  } finally {
    client.release();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const path = url.split('?')[0].replace(/^\/api/, '');

  try {
    if (path === '/login' || path === '/login/') return await handleLogin(req, res);
    if (path === '/login-by-name' || path === '/login-by-name/') return await handleLoginByName(req, res);
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
    if (path === '/daily-challenge/status' || path === '/daily-challenge/status/') return await handleDailyChallengeStatus(req, res);
    
    // Arena Challenge Submit & History
    if (path === '/challenges/submit' || path === '/challenges/submit/') return await handleChallengeSubmit(req, res);
    if (path === '/challenges/history' || path === '/challenges/history/') return await handleChallengeHistory(req, res);
    
    // Family Challenges
    if (path === '/family-challenges/submit' || path === '/family-challenges/submit/') return await handleFamilyChallengeSubmit(req, res);
    if (path === '/family-challenges/status' || path === '/family-challenges/status/') return await handleFamilyChallengeStatus(req, res);
    
    // Challenges received/sent by student
    const receivedChallengesMatch = path.match(/^\/challenges\/received\/([^/]+)\/?$/);
    if (receivedChallengesMatch) return await handleReceivedChallenges(req, res, receivedChallengesMatch[1]);
    
    const sentChallengesMatch = path.match(/^\/challenges\/sent\/([^/]+)\/?$/);
    if (sentChallengesMatch) return await handleSentChallenges(req, res, sentChallengesMatch[1]);
    
    // Leaderboard
    if (path === '/leaderboard' || path === '/leaderboard/') return await handleLeaderboard(req, res);
    
    // Home Dojo - Habit Tracking
    if (path === '/habits/check' || path === '/habits/check/') return await handleHabitCheck(req, res);
    if (path === '/habits/status' || path === '/habits/status/') return await handleHabitStatus(req, res);
    if (path === '/xp/sync' || path === '/xp/sync/') return await handleXpSync(req, res);
    
    // Virtual Dojo Game
    if (path === '/dojo/state' || path === '/dojo/state/') return await handleDojoState(req, res);
    if (path === '/dojo/spin' || path === '/dojo/spin/') return await handleDojoSpin(req, res);
    if (path === '/dojo/feed' || path === '/dojo/feed/') return await handleDojoFeed(req, res);
    if (path === '/dojo/debug-add-xp' || path === '/dojo/debug-add-xp/') return await handleDojoDebugAddXP(req, res);
    if (path === '/habits/custom' || path === '/habits/custom/') {
      if (req.method === 'GET') return await handleGetCustomHabits(req, res);
      if (req.method === 'POST') return await handleCreateCustomHabit(req, res);
    }
    const customHabitDeleteMatch = path.match(/^\/habits\/custom\/([^/]+)\/?$/);
    if (customHabitDeleteMatch) return await handleDeleteCustomHabit(req, res, customHabitDeleteMatch[1]);
    if (path === '/students' || path === '/students/') return await handleAddStudent(req, res);
    if (path === '/students/by-email' || path === '/students/by-email/') return await handleGetStudentByEmail(req, res);
    
    // Student grading endpoint (must be before generic student ID match)
    const studentGradingMatch = path.match(/^\/students\/([^/]+)\/grading\/?$/);
    if (studentGradingMatch) return await handleStudentGrading(req, res, studentGradingMatch[1]);
    
    // Student update/delete by ID
    const studentIdMatch = path.match(/^\/students\/([^/]+)\/?$/);
    if (studentIdMatch) {
      if (req.method === 'PATCH' || req.method === 'PUT') {
        return await handleStudentUpdate(req, res, studentIdMatch[1]);
      }
      if (req.method === 'DELETE') {
        return await handleStudentDelete(req, res, studentIdMatch[1]);
      }
    }
    if (path === '/students/by-name' || path === '/students/by-name/') return await handleGetStudentByName(req, res);
    if (path === '/students/first' || path === '/students/first/') return await handleGetFirstStudent(req, res);
    if (path === '/invite-coach' || path === '/invite-coach/') return await handleInviteCoach(req, res);
    
    // Coach update/delete by ID
    const coachIdMatch = path.match(/^\/coaches\/([^/]+)\/?$/);
    if (coachIdMatch) {
      if (req.method === 'PATCH' || req.method === 'PUT') {
        return await handleUpdateCoach(req, res, coachIdMatch[1]);
      }
      if (req.method === 'DELETE') {
        return await handleDeleteCoach(req, res, coachIdMatch[1]);
      }
    }
    
    // Club data routes
    if (path === '/club/save-wizard-data' || path === '/club/save-wizard-data/') return await handleSaveWizardData(req, res);
    
    const clubDataMatch = path.match(/^\/club\/([^/]+)\/data\/?$/);
    if (clubDataMatch) return await handleGetClubData(req, res, clubDataMatch[1]);
    
    const linkParentMatch = path.match(/^\/students\/([^/]+)\/link-parent\/?$/);
    if (linkParentMatch) return await handleLinkParent(req, res, linkParentMatch[1]);
    
    const syncRivalsMatch = path.match(/^\/students\/([^/]+)\/sync-rivals\/?$/);
    if (syncRivalsMatch) return await handleSyncRivals(req, res, syncRivalsMatch[1]);

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
