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

// Trust Tier thresholds for video auto-approval
const TRUST_TIER_VERIFIED_THRESHOLD = 10; // 10 consecutive approvals = verified
const TRUST_TIER_TRUSTED_THRESHOLD = 25; // 25 consecutive approvals = trusted
const SPOT_CHECK_RATIO = 10; // 1 in 10 videos are spot-checked for verified students

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Super Admin token verification
async function verifySuperAdminToken(req: VercelRequest): Promise<{ valid: boolean; email?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }
  
  const token = authHeader.substring(7);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT email, expires_at FROM super_admin_sessions 
       WHERE token = $1 AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return { valid: false };
    }
    
    return { valid: true, email: result.rows[0].email };
  } catch (err) {
    console.error('[SuperAdmin] Token verify error:', err);
    return { valid: false };
  } finally {
    client.release();
  }
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
  
  // Log to xp_transactions for audit trail (optional - don't fail if table missing)
  try {
    await client.query(
      `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())`,
      [studentId, Math.abs(amount), amount > 0 ? 'EARN' : 'SPEND', reason]
    );
  } catch (e) {
    console.warn('[XP] xp_transactions insert failed (table may not exist):', (e as any).message);
  }
  
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
              wizard_data, trial_start, trial_end, trial_status, status,
              world_rankings_enabled
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
        status: club.status,
        worldRankingsEnabled: club.world_rankings_enabled || false
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
      try {
        // Try to add PTS_EARN enum value if it doesn't exist (safe ALTER)
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PTS_EARN' 
              AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'xp_transaction_type')) THEN
              ALTER TYPE xp_transaction_type ADD VALUE 'PTS_EARN';
            END IF;
          END
          $$;
        `);
      } catch (enumError: any) {
        console.log('[Grading] PTS_EARN enum check (may already exist):', enumError.message);
      }
      
      try {
        await client.query(
          `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
           VALUES ($1::uuid, $2, 'PTS_EARN', 'Class grading PTS', NOW())`,
          [studentId, ptsEarned]
        );
        console.log('[Grading] Logged PTS transaction:', studentId, '+', ptsEarned, 'PTS');
      } catch (ptsError: any) {
        console.error('[Grading] Failed to log PTS transaction:', ptsError.message);
      }
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
      return res.status(404).json({ error: 'Coach not found' });
    }

    // Check which columns exist
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'coaches' AND column_name IN ('location', 'assigned_classes')
    `);
    const existingColumns = columnCheck.rows.map((r: any) => r.column_name);
    const hasLocation = existingColumns.includes('location');
    const hasAssignedClasses = existingColumns.includes('assigned_classes');

    // Build dynamic query based on available columns
    let setClauses = ['name = COALESCE($1, name)', 'email = COALESCE($2, email)', 'updated_at = NOW()'];
    let returnClauses = ['id', 'name', 'email'];
    let params: any[] = [name || null, email || null];
    let paramIndex = 3;

    if (hasLocation) {
      setClauses.push(`location = $${paramIndex}`);
      returnClauses.push('location');
      params.push(location || null);
      paramIndex++;
    }

    if (hasAssignedClasses) {
      setClauses.push(`assigned_classes = $${paramIndex}`);
      returnClauses.push('assigned_classes');
      params.push(classesArray);
      paramIndex++;
    }

    params.push(coachId);

    const result = await client.query(
      `UPDATE coaches SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}::uuid
       RETURNING ${returnClauses.join(', ')}`,
      params
    );

    const coach = result.rows[0];
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
    console.error('[UpdateCoach] Error:', error.message);
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
  // Extract region from endpoint (e.g., s3.eu-west-4.idrivee2.com -> eu-west-4)
  const endpoint = process.env.IDRIVE_E2_ENDPOINT;
  const regionMatch = endpoint.match(/s3\.([^.]+)\.idrivee2\.com/);
  const region = regionMatch ? regionMatch[1] : 'us-east-1';
  
  return new S3Client({
    endpoint: `https://${endpoint}`,
    region: region,
    credentials: {
      accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY,
      secretAccessKey: process.env.IDRIVE_E2_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

async function handlePresignedUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, challengeId, filename, contentType, isGauntlet } = parseBody(req);
  
  if (!studentId || !challengeId || !filename) {
    return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
  }

  const client = await pool.connect();
  
  try {
    // CHECK LIMITS BEFORE generating upload URL (prevents orphaned uploads)
    if (isGauntlet) {
      // Gauntlet: Check weekly limit using gauntlet_submissions table
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      
      const existingSubmission = await client.query(`
        SELECT id FROM gauntlet_submissions 
        WHERE challenge_id = $1::uuid AND student_id = $2::uuid AND week_number = $3
      `, [challengeId, studentId, weekNumber]);
      
      if (existingSubmission.rows.length > 0) {
        console.log('[Videos] Gauntlet weekly limit reached:', { studentId, challengeId, weekNumber });
        client.release();
        return res.status(429).json({
          error: 'Already completed',
          message: 'You already completed this challenge this week. Come back next week!',
          limitReached: true
        });
      }
    } else {
      // Arena: Check daily limit using challenge_videos table
      const existingVideoResult = await client.query(`
        SELECT id FROM challenge_videos 
        WHERE student_id = $1::uuid AND challenge_id = $2
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
      `, [studentId, challengeId]);
      
      if (existingVideoResult.rows.length > 0) {
        console.log('[Videos] Arena daily limit reached:', { studentId, challengeId });
        client.release();
        return res.status(429).json({
          error: 'Already submitted',
          message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
          limitReached: true
        });
      }
    }
    client.release();
  } catch (limitCheckError: any) {
    client.release();
    console.error('[Videos] Limit check error:', limitCheckError.message);
    return res.status(500).json({ error: 'Failed to verify upload eligibility' });
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
  
  const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, videoHash, score, xpAwarded, videoDuration } = parseBody(req);
  
  if (!studentId || !clubId || !challengeId || !videoUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    // Check if already submitted video for this challenge today
    // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch
    const existingVideoResult = await client.query(
      `SELECT id FROM challenge_videos 
       WHERE student_id = $1::uuid AND challenge_id = $2
       AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
      [studentId, challengeId]
    );
    
    if (existingVideoResult.rows.length > 0) {
      // Video already exists today - BLOCK duplicate submission
      console.log('[Videos] Duplicate submission blocked for student:', studentId, 'challenge:', challengeId);
      client.release();
      return res.status(429).json({
        error: 'Already submitted',
        message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
        alreadyCompleted: true
      });
    }

    // AI Pre-Screening: Check for suspicious patterns
    let aiFlag = 'green'; // Default: looks good
    let aiFlagReason = '';
    
    // Check 1: Duplicate video content detection using hash (fingerprint)
    if (videoHash) {
      const duplicateHashCheck = await client.query(
        `SELECT id FROM challenge_videos 
         WHERE video_hash = $1 AND created_at > NOW() - INTERVAL '30 days'
         LIMIT 1`,
        [videoHash]
      );
      if (duplicateHashCheck.rows.length > 0) {
        aiFlag = 'red';
        aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
        console.log(`[AI-Screen] RED FLAG: Duplicate video hash for student ${studentId}, hash: ${videoHash.substring(0, 8)}...`);
      }
    }
    
    // Check 2: Rate limiting (more than 5 videos in 1 hour = suspicious)
    if (aiFlag !== 'red') {
      const rateCheck = await client.query(
        `SELECT COUNT(*) as count FROM challenge_videos 
         WHERE student_id = $1::uuid AND created_at > NOW() - INTERVAL '1 hour'`,
        [studentId]
      );
      if (parseInt(rateCheck.rows[0]?.count || '0') >= 5) {
        aiFlag = 'yellow';
        aiFlagReason = 'High submission rate';
        console.log(`[AI-Screen] YELLOW FLAG: High rate for student ${studentId}`);
      }
    }
    
    // Check 3: Video duration too short (less than 3 seconds)
    if (aiFlag === 'green' && videoDuration && videoDuration < 3) {
      aiFlag = 'yellow';
      aiFlagReason = 'Video very short';
      console.log(`[AI-Screen] YELLOW FLAG: Short video (${videoDuration}s) for student ${studentId}`);
    }
    
    // Check student's trust tier for auto-approval logic (optional - columns may not exist)
    let trustTier = 'unverified';
    try {
      const studentResult = await client.query(
        `SELECT trust_tier, video_approval_streak FROM students WHERE id = $1::uuid`,
        [studentId]
      );
      trustTier = studentResult.rows[0]?.trust_tier || 'unverified';
    } catch (tierError: any) {
      console.log(`[TrustTier] Trust tier columns not available: ${tierError.message}`);
    }
    
    let status = 'pending';
    let isSpotCheck = false;
    let autoApproved = false;
    // Store the correct XP upfront so coach sees it when reviewing (Coach Pick videos use passed xpAwarded)
    let finalXpAwarded = xpAwarded || 40;
    
    // AI Flags override auto-approval
    if (aiFlag === 'red') {
      // Red flag = always require manual review
      status = 'pending';
      console.log(`[TrustTier] Red flag override - manual review required for ${studentId}`);
    } else if (aiFlag === 'yellow') {
      // Yellow flag = require review even for verified students
      status = 'pending';
      console.log(`[TrustTier] Yellow flag - review required for ${studentId}`);
    } else if (trustTier === 'verified' || trustTier === 'trusted') {
      // Trust Tier Auto-Approve Logic (only for green-flagged videos)
      // Random spot-check (1 in 10)
      const randomNum = Math.floor(Math.random() * SPOT_CHECK_RATIO);
      if (randomNum === 0) {
        // This is a spot-check - keep pending for coach review
        isSpotCheck = true;
        status = 'pending';
        console.log(`[TrustTier] Spot-check triggered for student ${studentId}`);
        
        // Update last spot-check timestamp (optional - column may not exist)
        try {
          await client.query(
            `UPDATE students SET last_spot_check_at = NOW() WHERE id = $1::uuid`,
            [studentId]
          );
        } catch (e) { /* column may not exist */ }
      } else {
        // Auto-approve - student is trusted
        status = 'approved';
        autoApproved = true;
        finalXpAwarded = xpAwarded || 40; // Default XP for video
        console.log(`[TrustTier] Auto-approved video for ${trustTier} student ${studentId}`);
      }
    }
    
    // Insert new video record with hash for duplicate detection
    let video;
    try {
      const result = await client.query(
        `INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, is_spot_check, auto_approved, xp_awarded, ai_flag, ai_flag_reason, video_duration, verified_at, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
         RETURNING id`,
        [studentId, clubId, challengeId, challengeName || '', challengeCategory || '', videoUrl, videoKey || '', videoHash || null, score || 0, status, isSpotCheck, autoApproved, finalXpAwarded, aiFlag, aiFlagReason, videoDuration || null, autoApproved ? new Date() : null]
      );
      video = result.rows[0];
    } catch (insertError: any) {
      console.log(`[Videos] Full insert failed, using basic insert: ${insertError.message}`);
      // Fallback to basic INSERT without newer columns
      const result = await client.query(
        `INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, xp_awarded, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING id`,
        [studentId, clubId, challengeId, challengeName || '', challengeCategory || '', videoUrl, videoKey || '', videoHash || null, score || 0, status, finalXpAwarded]
      );
      video = result.rows[0];
    }
    
    // If auto-approved, award XP immediately and update trust tier
    if (autoApproved && finalXpAwarded > 0) {
      await applyXpDelta(client, studentId, finalXpAwarded, 'video_auto_approved');
      
      // Increment approval streak and upgrade trust tier if thresholds met (optional - columns may not exist)
      try {
        await client.query(
          `UPDATE students 
           SET video_approval_streak = COALESCE(video_approval_streak, 0) + 1,
               trust_tier = CASE 
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $1::integer THEN 'trusted'
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $2::integer THEN 'verified'
                 ELSE COALESCE(trust_tier, 'unverified')
               END,
               updated_at = NOW()
           WHERE id = $3::uuid`,
          [TRUST_TIER_TRUSTED_THRESHOLD, TRUST_TIER_VERIFIED_THRESHOLD, studentId]
        );
      } catch (tierError: any) {
        console.log(`[TrustTier] Skipping trust tier update: ${tierError.message}`);
      }
    }
    
    return res.json({ 
      success: true, 
      videoId: video?.id,
      autoApproved,
      isSpotCheck,
      xpAwarded: finalXpAwarded,
      trustTier,
      aiFlag,
      aiFlagReason
    });
  } catch (error: any) {
    console.error('[Videos] Create error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to save video record', details: error.message });
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
    
    // Use proxy URLs for video streaming (avoids presigned URL issues with iDrive E2)
    const videosWithProxyUrls = result.rows.map((video) => {
      let videoKey = video.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
        videoKey = video.video_url.split('idrivee2.com/')[1];
      }
      if (videoKey) {
        return { 
          ...video, 
          video_url: `/api/videos/stream/${encodeURIComponent(videoKey)}` 
        };
      }
      return video;
    });
    
    return res.json(videosWithProxyUrls);
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
    
    const videosWithData = await Promise.all(result.rows.map(async (video) => {
      // Use proxy URL for video streaming
      let videoKey = video.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
        videoKey = video.video_url.split('idrivee2.com/')[1];
      }
      let videoUrl = videoKey 
        ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
        : video.video_url;
      
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

async function handleVideoStream(req: VercelRequest, res: VercelResponse, videoKey: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const s3Client = getS3Client();
  const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
  
  if (!s3Client || !bucketName) {
    return res.status(500).json({ error: 'Video storage not configured' });
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoKey,
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Set headers for video streaming
    res.setHeader('Content-Type', response.ContentType || 'video/mp4');
    res.setHeader('Content-Length', response.ContentLength || 0);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Stream the video body
    const stream = response.Body as NodeJS.ReadableStream;
    stream.pipe(res as any);
  } catch (error: any) {
    console.error('[Videos] Stream error:', error.message);
    return res.status(500).json({ error: 'Failed to stream video' });
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
  const finalXpAwarded = xpAwarded || 40; // Default to 40 XP if not specified
  try {
    const result = await client.query(
      `UPDATE challenge_videos 
       SET status = $1::video_status, coach_notes = $2, xp_awarded = $3::integer, verified_at = CASE WHEN $1::text = 'approved' THEN NOW() ELSE verified_at END, updated_at = NOW()
       WHERE id = $4::uuid
       RETURNING *`,
      [status, coachNotes || '', finalXpAwarded, videoId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const video = result.rows[0];
    
    // Update Trust Tier based on approval/rejection (optional - columns may not exist in all environments)
    if (status === 'approved') {
      try {
        // Increment approval streak and possibly upgrade trust tier
        const studentResult = await client.query(
          `UPDATE students 
           SET video_approval_streak = COALESCE(video_approval_streak, 0) + 1,
               trust_tier = CASE 
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $1::integer THEN 'trusted'
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $2::integer THEN 'verified'
                 ELSE COALESCE(trust_tier, 'unverified')
               END,
               updated_at = NOW()
           WHERE id = $3::uuid
           RETURNING trust_tier, video_approval_streak`,
          [TRUST_TIER_TRUSTED_THRESHOLD, TRUST_TIER_VERIFIED_THRESHOLD, video.student_id]
        );
        
        const newTier = studentResult.rows[0]?.trust_tier;
        const newStreak = studentResult.rows[0]?.video_approval_streak;
        console.log(`[TrustTier] Student ${video.student_id} approved: streak=${newStreak}, tier=${newTier}`);
      } catch (tierError: any) {
        // Trust tier columns may not exist - just log and continue
        console.log(`[TrustTier] Skipping trust tier update (columns may not exist): ${tierError.message}`);
      }
      
      // Award XP using unified helper
      if (finalXpAwarded > 0) {
        await applyXpDelta(client, video.student_id, finalXpAwarded, 'video_approved');
      }
    } else if (status === 'rejected') {
      try {
        // Reset streak, increment rejection count, downgrade trust tier
        await client.query(
          `UPDATE students 
           SET video_approval_streak = 0,
               video_rejection_count = COALESCE(video_rejection_count, 0) + 1,
               trust_tier = 'unverified',
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [video.student_id]
        );
        console.log(`[TrustTier] Student ${video.student_id} rejected: tier downgraded to unverified`);
      } catch (tierError: any) {
        console.log(`[TrustTier] Skipping trust tier update (columns may not exist): ${tierError.message}`);
      }
      
      // Send parent notification email about rejection
      try {
        const parentResult = await client.query(
          `SELECT p.email, p.name as parent_name, s.name as student_name 
           FROM parents p
           JOIN students s ON s.parent_id = p.id
           WHERE s.id = $1::uuid`,
          [video.student_id]
        );
        
        if (parentResult.rows.length > 0 && parentResult.rows[0].email) {
          const parent = parentResult.rows[0];
          const challengeName = video.challenge_name || 'Challenge';
          const coachFeedback = coachNotes || 'Please review the submission requirements and try again.';
          
          await sendTemplateEmail(
            parent.email,
            'd-video-rejection-notification',
            {
              parent_name: parent.parent_name || 'Parent',
              student_name: parent.student_name || 'Your child',
              challenge_name: challengeName,
              coach_feedback: coachFeedback
            }
          );
          console.log(`[Email] Sent rejection notification to parent ${parent.email} for student ${video.student_id}`);
        }
      } catch (emailError: any) {
        console.error('[Email] Failed to send rejection notification:', emailError.message);
      }
    }
    
    return res.json({ success: true, video: result.rows[0], xpAwarded: finalXpAwarded });
  } catch (error: any) {
    console.error('[Videos] Verify error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to verify video', details: error.message });
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
    xpReward: 15,
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

  // Try Gemini first with multiple model fallbacks
  if (gemini) {
    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
    for (const modelName of geminiModels) {
      try {
        console.log(`[DailyChallenge] Trying Gemini model: ${modelName}`);
        const model = gemini.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(text);
        console.log(`[DailyChallenge] Gemini ${modelName} succeeded`);
        return {
          title: parsed.title || "Daily Challenge",
          description: parsed.description || "Test your martial arts knowledge!",
          type: 'quiz',
          xpReward: 15,
          quizData: {
            question: parsed.question,
            options: parsed.options,
            correctIndex: parsed.correctIndex,
            explanation: parsed.explanation
          }
        };
      } catch (e: any) {
        console.log(`[DailyChallenge] Gemini ${modelName} failed:`, e.message);
      }
    }
  } else {
    console.log('[DailyChallenge] No Gemini client available (GOOGLE_API_KEY missing?)');
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
    
    // Reset arena challenges only (preserve user videos and submissions)
    // Only clear system-default arena challenges, not user content
    await client.query(`DELETE FROM arena_challenges WHERE is_system_default = true`);
    
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
    
    // FALLBACK CHALLENGE HANDLING: Create or get fallback challenge, then save to history
    if (isFallbackChallenge) {
      console.log('🎯 [DailyChallenge] Processing FALLBACK challenge');
      
      // For fallback challenges, trust the frontend's isCorrect or default to true
      const isCorrect = frontendIsCorrect !== undefined ? frontendIsCorrect : true;
      
      // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
      const localXp = isCorrect ? 15 : 5;
      const globalXp = isCorrect ? 3 : 1;
      
      // Ensure a fallback challenge exists in daily_challenges for today
      const fallbackData = getFallbackChallenge();
      let fallbackChallengeId: string;
      
      const existingFallback = await client.query(
        `SELECT id FROM daily_challenges WHERE date = $1 AND title = $2 LIMIT 1`,
        [today, fallbackData.title]
      );
      
      if (existingFallback.rows.length > 0) {
        fallbackChallengeId = existingFallback.rows[0].id;
      } else {
        const insertResult = await client.query(
          `INSERT INTO daily_challenges (date, target_belt, title, description, xp_reward, type, quiz_data)
           VALUES ($1, 'all', $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [today, fallbackData.title, fallbackData.description, fallbackData.xpReward, 
           fallbackData.type, JSON.stringify(fallbackData.quizData)]
        );
        fallbackChallengeId = insertResult.rows[0].id;
      }
      
      // Save submission to challenge_submissions for history tracking
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
        [fallbackChallengeId, studentId, validClubId, String(selectedIndex), isCorrect, localXp]
      );
      
      // Award Local XP using unified helper
      await applyXpDelta(client, studentId, localXp, 'daily_challenge');
      
      // Award Global XP
      await client.query(
        `UPDATE students SET global_rank_points = COALESCE(global_rank_points, 0) + $1 WHERE id = $2::uuid`,
        [globalXp, studentId]
      );
      
      return res.json({
        success: true,
        isCorrect,
        xpAwarded: localXp,
        globalXp,
        explanation: 'Great job completing the challenge!',
        message: isCorrect ? `Correct! +${localXp} XP` : `Not quite! +${localXp} XP for trying!`
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
    
    // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
    const localXp = isCorrect ? 15 : 5;
    const globalXp = isCorrect ? 3 : 1;

    // Save submission record (clubId is optional for home users)
    console.log('💾 [DailyChallenge] Inserting submission:', { challengeId, studentId, validClubId, isCorrect, localXp, globalXp });
    await client.query(
      `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [challengeId, studentId, validClubId, answer || String(selectedIndex), isCorrect, localXp]
    );

    // Update student Local XP using unified helper
    await applyXpDelta(client, studentId, localXp, 'daily_challenge');
    
    // Update student Global XP
    await client.query(
      `UPDATE students SET global_rank_points = COALESCE(global_rank_points, 0) + $1 WHERE id = $2::uuid`,
      [globalXp, studentId]
    );

    console.log(`✅ [DailyChallenge] Submit Success - Local XP: ${localXp}, Global XP: ${globalXp}`);
    
    return res.json({
      success: true,
      isCorrect,
      correctIndex,
      xpAwarded: localXp,
      globalXp,
      explanation: quizData.explanation || 'Great effort!',
      message: isCorrect ? `Correct! +${localXp} XP` : `Not quite! +${localXp} XP for trying.`
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
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
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

// GET /api/challenges/history - Fetch XP history from Coach Picks and Daily Training
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
    // Fetch Coach Pick submissions (from challenge_videos table)
    const coachPicksResult = await client.query(
      `SELECT 
        id,
        challenge_id,
        challenge_name,
        challenge_category,
        status,
        xp_awarded,
        score,
        video_url,
        created_at
      FROM challenge_videos 
      WHERE student_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 30`,
      [studentId]
    );

    // Fetch Daily Training submissions (from gauntlet_submissions table)
    const gauntletResult = await client.query(
      `SELECT 
        gs.id,
        gs.challenge_id,
        gc.name as challenge_name,
        gc.day_theme as challenge_category,
        gs.proof_type,
        gs.local_xp_awarded as xp_awarded,
        gs.global_points_awarded as global_xp_awarded,
        gs.score,
        gs.is_personal_best,
        gs.submitted_at as created_at
      FROM gauntlet_submissions gs
      LEFT JOIN gauntlet_challenges gc ON gs.challenge_id = gc.id
      WHERE gs.student_id = $1::uuid
      ORDER BY gs.submitted_at DESC
      LIMIT 30`,
      [studentId]
    );

    // Fetch Daily Mystery Challenge submissions (from challenge_submissions table)
    const mysteryResult = await client.query(
      `SELECT 
        cs.id,
        cs.challenge_id,
        dc.title as challenge_name,
        cs.is_correct,
        cs.xp_awarded,
        cs.completed_at as created_at
      FROM challenge_submissions cs
      LEFT JOIN daily_challenges dc ON cs.challenge_id = dc.id
      WHERE cs.student_id = $1::uuid
      ORDER BY cs.completed_at DESC
      LIMIT 20`,
      [studentId]
    );

    // Fetch Family Challenge submissions (from family_logs table)
    // Use text comparison to handle both UUID and legacy string IDs
    // Wrapped in try-catch to prevent breaking history if family tables don't exist
    let familyResult = { rows: [] as any[] };
    try {
      familyResult = await client.query(
        `SELECT 
          fl.id,
          fl.challenge_id,
          fc.name as challenge_name,
          fc.icon as challenge_icon,
          fc.category as challenge_category,
          fl.xp_awarded,
          fl.completed_at as created_at
        FROM family_logs fl
        LEFT JOIN family_challenges fc ON fl.challenge_id = fc.id::text
        WHERE fl.student_id = $1::uuid
        ORDER BY fl.completed_at DESC
        LIMIT 20`,
        [studentId]
      );
    } catch (famErr: any) {
      console.log('[ChallengeHistory] Family query skipped:', famErr.message);
    }

    // Map Coach Picks to history format
    const coachPickHistory = coachPicksResult.rows.map(row => {
      const statusMap: Record<string, string> = {
        'pending': 'PENDING',
        'approved': 'VERIFIED',
        'rejected': 'REJECTED'
      };
      
      return {
        id: row.id,
        source: 'coach_pick',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Coach Pick Challenge',
        icon: '⭐',
        category: row.challenge_category || 'Coach Picks',
        status: statusMap[row.status] || 'PENDING',
        proofType: 'VIDEO',
        xpAwarded: row.xp_awarded || 0,
        score: row.score || 0,
        videoUrl: row.video_url,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Daily Training to history format
    const gauntletHistory = gauntletResult.rows.map(row => {
      const categoryIcons: Record<string, string> = {
        'Engine': '🔥',
        'Foundation': '🏋️',
        'Evasion': '💨',
        'Explosion': '💥',
        'Animal': '🐯',
        'Defense': '🛡️',
        'Flow': '🌊'
      };
      
      return {
        id: row.id,
        source: 'daily_training',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Daily Training',
        icon: categoryIcons[row.challenge_category] || '🥋',
        category: row.challenge_category || 'Daily Training',
        status: 'COMPLETED',
        proofType: row.proof_type || 'TRUST',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.global_xp_awarded || 0,
        score: row.score || 0,
        isPersonalBest: row.is_personal_best || false,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Daily Mystery Challenge to history format
    const mysteryHistory = mysteryResult.rows.map(row => {
      return {
        id: row.id,
        source: 'mystery',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Daily Mystery',
        icon: '🎯',
        category: 'Mystery',
        status: row.is_correct ? 'CORRECT' : 'WRONG',
        proofType: 'QUIZ',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.is_correct ? 3 : 1,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Family Challenge to history format
    const familyHistory = familyResult.rows.map(row => {
      return {
        id: row.id,
        source: 'family',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Family Challenge',
        icon: row.challenge_icon || '👨‍👧',
        category: row.challenge_category || 'Family',
        status: 'COMPLETED',
        proofType: 'TRUST',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.xp_awarded >= 15 ? 2 : 1, // Win = 2 Global, Lose = 1 Global
        mode: 'FAMILY',
        completedAt: row.created_at
      };
    });

    // Combine and sort by date (newest first)
    const allHistory = [...coachPickHistory, ...gauntletHistory, ...mysteryHistory, ...familyHistory]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 50);

    return res.json({ history: allHistory });
  } catch (error: any) {
    console.error('[ChallengeHistory] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  } finally {
    client.release();
  }
}

// =====================================================
// COACH VERIFICATION QUEUE
// =====================================================

// GET /api/challenges/pending-verification/:clubId
async function handlePendingVerification(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cs.*, 
              s.name as student_name, s.belt as student_belt
       FROM challenge_submissions cs
       JOIN students s ON cs.student_id = s.id
       WHERE cs.club_id = $1::uuid 
       AND cs.proof_type = 'VIDEO'
       AND cs.status = 'PENDING'
       ORDER BY cs.completed_at ASC`,
      [clubId]
    );

    // Convert video URLs to proxy URLs
    const pendingWithProxyUrls = result.rows.map((row: any) => {
      let videoKey = row.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && row.video_url && row.video_url.includes('idrivee2.com/')) {
        videoKey = row.video_url.split('idrivee2.com/')[1];
      }
      return {
        ...row,
        video_url: videoKey 
          ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
          : row.video_url
      };
    });

    return res.json(pendingWithProxyUrls);
  } catch (error: any) {
    console.error('[Arena] Pending verification error:', error.message);
    return res.status(500).json({ error: 'Failed to get pending verifications' });
  } finally {
    client.release();
  }
}

// POST /api/challenges/verify
async function handleChallengeVerify(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { submissionId, verified, coachId } = parseBody(req);
  
  if (!submissionId || verified === undefined) {
    return res.status(400).json({ error: 'submissionId and verified are required' });
  }

  const client = await pool.connect();
  try {
    // Get submission
    const subResult = await client.query(
      `SELECT * FROM challenge_submissions WHERE id = $1::uuid`,
      [submissionId]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = subResult.rows[0];

    if (submission.status !== 'PENDING') {
      return res.status(400).json({ error: 'Submission is not pending verification' });
    }

    if (verified) {
      // Approve - award the XP that was stored in the submission when created
      const xpToAward = parseInt(submission.xp_awarded) || 30;
      const globalRankPoints = parseInt(submission.global_rank_points) || 3;
      
      await client.query(
        `UPDATE challenge_submissions SET status = 'VERIFIED' WHERE id = $1::uuid`,
        [submissionId]
      );
      
      // Award XP to student
      await client.query(
        `UPDATE students 
         SET total_xp = COALESCE(total_xp, 0) + $1::integer,
             global_xp = COALESCE(global_xp, 0) + $2::integer,
             updated_at = NOW()
         WHERE id = $3::uuid`,
        [xpToAward, globalRankPoints, submission.student_id]
      );

      console.log(`[Arena] Video verified for ${submission.student_id}: +${xpToAward} XP, +${globalRankPoints} Global Rank Points`);

      return res.json({
        success: true,
        status: 'VERIFIED',
        xpAwarded: xpToAward,
        globalRankPoints,
        message: `Video verified! +${xpToAward} XP and +${globalRankPoints} World Rank points awarded.`
      });
    } else {
      // Reject
      await client.query(
        `UPDATE challenge_submissions SET status = 'REJECTED' WHERE id = $1::uuid`,
        [submissionId]
      );

      console.log(`[Arena] Video rejected for ${submission.student_id}`);

      return res.json({
        success: true,
        status: 'REJECTED',
        message: 'Submission rejected.'
      });
    }
  } catch (error: any) {
    console.error('[Arena] Verify error:', error.message);
    return res.status(500).json({ error: 'Failed to verify submission' });
  } finally {
    client.release();
  }
}

// =====================================================
// HOME DOJO - HABIT TRACKING (Simplified)
// XP System: 3 XP per habit for all users
// Free: 3 habits/day = 9 XP cap, Premium: 7 habits/day = 21 XP cap
// =====================================================
const HOME_DOJO_BASE_XP = 3;
const HOME_DOJO_FREE_CAP = 9;    // 3 habits × 3 XP
const HOME_DOJO_PREMIUM_CAP = 21; // 7 habits × 3 XP

async function hasHomeDojoPremium(client: any, studentId: string): Promise<boolean> {
  try {
    // Check premium sources: student.premium_status or club.parent_premium_enabled
    const result = await client.query(
      `SELECT s.premium_status, c.parent_premium_enabled
       FROM students s 
       LEFT JOIN clubs c ON s.club_id = c.id 
       WHERE s.id = $1::uuid`,
      [studentId]
    );
    const student = result.rows[0];
    if (!student) return false;
    
    // Check all premium sources
    const hasPremiumStatus = student.premium_status === 'club_sponsored' || student.premium_status === 'parent_paid';
    const hasClubPremium = student.parent_premium_enabled === true;
    
    const isPremium = hasPremiumStatus || hasClubPremium;
    console.log(`[HomeDojo] Premium check for ${studentId}: status=${student.premium_status}, clubPremium=${hasClubPremium} => ${isPremium}`);
    
    return isPremium;
  } catch (e) {
    console.error('[HomeDojo] Premium check error:', (e as any).message);
    return false;
  }
}

// Upgrade student to premium (persist to database)
async function handleUpgradePremium(req: VercelRequest, res: VercelResponse) {
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
    await client.query(
      `UPDATE students SET premium_status = 'parent_paid', premium_started_at = NOW() WHERE id = $1::uuid`,
      [studentId]
    );
    console.log(`[Premium] Student ${studentId} upgraded to premium`);
    return res.json({ success: true, message: 'Upgraded to premium' });
  } catch (error: any) {
    console.error('[Premium] Upgrade error:', error.message);
    return res.status(500).json({ error: 'Failed to upgrade' });
  } finally {
    client.release();
  }
}

async function handleHabitCheck(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, habitName, isPremiumOverride } = parseBody(req);

  if (!studentId || !habitName) {
    return res.status(400).json({ error: 'studentId and habitName are required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trimmedStudentId = studentId.trim();
  if (!uuidRegex.test(trimmedStudentId)) {
    return res.status(400).json({ error: 'Invalid student ID format' });
  }

  const client = await pool.connect();
  try {
    // Ensure habit_logs table exists (auto-create if missing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        habit_name VARCHAR(255) NOT NULL,
        xp_awarded INTEGER DEFAULT 3,
        log_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const today = new Date().toISOString().split('T')[0];
    
    const studentCheck = await client.query(`SELECT id FROM students WHERE id = $1::uuid`, [trimmedStudentId]);
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check premium BEFORE transaction - use frontend override if provided
    const dbPremium = await hasHomeDojoPremium(client, trimmedStudentId);
    const isPremium = isPremiumOverride === true || dbPremium;
    console.log(`[HomeDojo] Premium: dbPremium=${dbPremium}, override=${isPremiumOverride}, final=${isPremium}`);
    
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM habit_logs WHERE student_id = $1::uuid AND habit_name = $2 AND log_date = $3::date`,
      [trimmedStudentId, habitName, today]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already completed', alreadyCompleted: true });
    }
    const habitXp = HOME_DOJO_BASE_XP; // 3 XP for all users
    const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;
    console.log(`[HomeDojo] Using cap: ${dailyCap} (isPremium=${isPremium})`);

    const dailyXpResult = await client.query(
      `SELECT COALESCE(SUM(xp_awarded), 0) as total_xp_today FROM habit_logs 
       WHERE student_id = $1::uuid AND log_date = $2::date`,
      [trimmedStudentId, today]
    );
    const totalXpToday = parseInt(dailyXpResult.rows[0]?.total_xp_today || '0');
    const atDailyLimit = totalXpToday >= dailyCap;
    const xpToAward = atDailyLimit ? 0 : habitXp;

    await client.query(
      `INSERT INTO habit_logs (student_id, habit_name, xp_awarded, log_date) VALUES ($1::uuid, $2, $3, $4::date)`,
      [trimmedStudentId, habitName, xpToAward, today]
    );

    if (xpToAward > 0) {
      await applyXpDelta(client, trimmedStudentId, xpToAward, 'habit');
    }

    await client.query('COMMIT');

    const currentStreak = await calculateStreak(client, trimmedStudentId);
    const currentXpResult = await client.query(`SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`, [trimmedStudentId]);
    const newTotalXp = currentXpResult.rows[0]?.xp || 0;

    return res.json({
      success: true,
      xpAwarded: xpToAward,
      habitXp: xpToAward,
      newTotalXp,
      dailyXpEarned: totalXpToday + xpToAward,
      dailyXpCap: dailyCap,
      atDailyLimit: (totalXpToday + xpToAward) >= dailyCap,
      isPremium,
      streak: currentStreak,
      message: atDailyLimit ? 'Habit done! Daily limit reached.' : `+${xpToAward} XP`
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[HomeDojo] Error:', error.message, 'Stack:', error.stack);
    return res.status(500).json({ error: 'Failed to log habit', details: error.message });
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

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];

    const studentResult = await client.query(
      `SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: HOME_DOJO_FREE_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
    }
    
    const storedXp = studentResult.rows[0]?.xp || 0;

    // Calculate all-time XP from transactions (same as leaderboard - source of truth)
    const allTimeResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as all_time_xp FROM xp_transactions WHERE student_id = $1::uuid AND type = 'EARN'`,
      [studentId]
    );
    const calculatedXp = parseInt(allTimeResult.rows[0]?.all_time_xp) || 0;
    
    // Calculate monthly XP for consistency check
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as monthly_xp FROM xp_transactions WHERE student_id = $1::uuid AND type = 'EARN' AND created_at >= $2::timestamp`,
      [studentId, monthStart.toISOString()]
    );
    const monthlyXp = parseInt(monthlyResult.rows[0]?.monthly_xp) || 0;
    
    // Use the highest of stored, calculated, or monthly (matches leaderboard logic exactly)
    const totalXp = Math.max(storedXp, calculatedXp, monthlyXp);

    const result = await client.query(
      `SELECT habit_name, xp_awarded FROM habit_logs WHERE student_id = $1::uuid AND log_date = $2::date`,
      [studentId, today]
    );

    const completedHabits = result.rows.map(r => r.habit_name);
    const totalXpToday = result.rows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
    const streak = await calculateStreak(client, studentId);
    
    const isPremium = await hasHomeDojoPremium(client, studentId);
    const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;

    return res.json({ completedHabits, totalXpToday, dailyXpCap: dailyCap, totalXp, lifetimeXp: totalXp, streak, isPremium });
  } catch (error: any) {
    console.error('[HomeDojo] Status fetch error:', error.message);
    return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: HOME_DOJO_FREE_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
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
    // Ensure table exists (auto-create if missing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_custom_habits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        icon VARCHAR(10) DEFAULT '✨',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
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

// Get active family challenges from database (for Parent Portal)
async function handleGetFamilyChallenges(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM family_challenges 
      WHERE is_active = true 
      ORDER BY display_order ASC, created_at ASC
    `);
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[FamilyChallenges] GET error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch family challenges' });
  } finally {
    client.release();
  }
}

// Server-side family challenge definitions (canonical XP values)
// Family Challenges - Flat XP: 15 Local/2 Global (win), 5 Local/1 Global (lose)
// Focus on consistency ("world champion of yourself") not tiered rewards
const FAMILY_CHALLENGE_XP = { winLocal: 15, winGlobal: 2, loseLocal: 5, loseGlobal: 1 };
const FAMILY_DAILY_LIMIT = 3; // Max 3 family challenges per day

const FAMILY_CHALLENGES: Record<string, { name: string }> = {
  // Strength Battles
  'family_earthquake': { name: 'The Earthquake Plank' },
  'family_tunnel': { name: 'The Tunnel Bear' },
  'family_pillow': { name: 'The Pillow Samurai' },
  // Agility & Speed Battles
  'family_toetag': { name: 'Toe Tag' },
  'family_dragon': { name: 'The Dragon\'s Tail' },
  'family_kneeslap': { name: 'Knee-Slap Boxing' },
  'family_ruler': { name: 'The Ruler Ninja' },
  // Balance & Focus
  'family_sockwars': { name: 'Sock Wars' },
  'family_mirror': { name: 'The Mirror of Doom' },
  'family_tiger': { name: 'The Sleeping Tiger' }
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

  // Flat XP: 15/5 Local, 2/1 Global (consistency-focused)
  const localXp = won ? FAMILY_CHALLENGE_XP.winLocal : FAMILY_CHALLENGE_XP.loseLocal;
  const globalXp = won ? FAMILY_CHALLENGE_XP.winGlobal : FAMILY_CHALLENGE_XP.loseGlobal;
  const today = new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // SERVER-SIDE XP CALCULATION - Validate challenge exists in database (supports both UUID and legacy IDs)
    const isUuid = uuidRegex.test(challengeId);
    let challengeValid = false;
    
    if (isUuid) {
      const challengeCheck = await client.query(
        `SELECT id, name FROM family_challenges WHERE id = $1::uuid AND is_active = true`,
        [challengeId]
      );
      challengeValid = challengeCheck.rows.length > 0;
    }
    
    if (!challengeValid) {
      // Fallback to legacy static challenges for backward compatibility
      const legacyChallenge = FAMILY_CHALLENGES[challengeId];
      if (!legacyChallenge) {
        return res.status(400).json({ error: 'Invalid challengeId' });
      }
    }
    // Check daily limit (3 family challenges per day total)
    const dailyCount = await client.query(
      `SELECT COUNT(*) as count FROM family_logs WHERE student_id = $1::uuid AND completed_at = $2::date`,
      [studentId, today]
    );
    
    if (parseInt(dailyCount.rows[0].count) >= FAMILY_DAILY_LIMIT) {
      return res.status(200).json({
        success: false,
        dailyLimitReached: true,
        message: `You've completed ${FAMILY_DAILY_LIMIT} family challenges today! Come back tomorrow.`
      });
    }

    // Check if already completed this specific challenge today
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
      [studentId, challengeId, localXp, today]
    );

    // Update student's Local XP using unified helper
    const newTotalXp = await applyXpDelta(client, studentId, localXp, 'family_challenge');
    
    // Update student's Global XP
    await client.query(
      `UPDATE students SET global_rank_points = COALESCE(global_rank_points, 0) + $1 WHERE id = $2::uuid`,
      [globalXp, studentId]
    );

    console.log(`[FamilyChallenge] "${challengeId}" completed: +${localXp} Local XP, +${globalXp} Global, won: ${won}`);

    return res.json({
      success: true,
      xpAwarded: localXp,
      globalXp,
      newTotalXp,
      won: won || false,
      message: `Family challenge completed! +${localXp} XP (+${globalXp} Global)`
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
    // Get students with their stored total_xp and created_at
    const studentsResult = await client.query(`
      SELECT id, name, belt, stripes, COALESCE(total_xp, 0) as total_xp, created_at
      FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();

    // Calculate ALL-TIME XP from transactions (source of truth)
    const allTimeXpResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as all_time_xp
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'EARN'
      GROUP BY student_id
    `, [clubId]);

    // Monthly XP from xp_transactions
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

    const allTimeXpMap = new Map(allTimeXpResult.rows.map((r: any) => [r.student_id, parseInt(r.all_time_xp) || 0]));
    const monthlyXpMap = new Map(monthlyXpResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_xp) || 0]));
    const monthlyPtsMap = new Map(monthlyPtsResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_pts) || 0]));

    // Auto-sync: Update students.total_xp if it's lower than calculated from transactions
    const studentsToSync: Array<{id: string, calculatedXp: number}> = [];
    for (const s of studentsResult.rows) {
      const calculatedXp = allTimeXpMap.get(s.id) || 0;
      const storedXp = parseInt(s.total_xp) || 0;
      if (calculatedXp > storedXp) {
        studentsToSync.push({ id: s.id, calculatedXp });
      }
    }
    
    // Batch update any out-of-sync students
    if (studentsToSync.length > 0) {
      for (const sync of studentsToSync) {
        await client.query(
          `UPDATE students SET total_xp = $1 WHERE id = $2::uuid`,
          [sync.calculatedXp, sync.id]
        );
      }
      console.log(`[Leaderboard] Auto-synced total_xp for ${studentsToSync.length} students`);
    }

    // Build leaderboard using the highest of stored, calculated, or monthly XP
    // This ensures we never show less than what's been earned
    const leaderboard = studentsResult.rows.map((s: any) => {
      const storedXp = parseInt(s.total_xp) || 0;
      const calculatedAllTime = allTimeXpMap.get(s.id) || 0;
      const monthlyXpFromTx = monthlyXpMap.get(s.id) || 0;
      
      // Use highest value to never undercount XP
      const trueAllTimeXp = Math.max(storedXp, calculatedAllTime, monthlyXpFromTx);
      
      // For monthly: if student was created this month and stored > transactions, use stored
      // This handles students who earned XP before transaction logging was complete
      const studentCreatedAt = s.created_at ? new Date(s.created_at) : null;
      const isCreatedThisMonth = studentCreatedAt && 
        studentCreatedAt.getFullYear() === monthStart.getFullYear() && 
        studentCreatedAt.getMonth() === monthStart.getMonth();
      
      // Monthly = max of transactions this month, or all their stored XP if created this month
      const trueMonthlyXp = isCreatedThisMonth 
        ? Math.max(monthlyXpFromTx, storedXp) 
        : monthlyXpFromTx;
      
      return {
        id: s.id,
        name: s.name,
        belt: s.belt,
        stripes: s.stripes || 0,
        totalXP: trueAllTimeXp,
        monthlyXP: trueMonthlyXp,
        monthlyPTS: monthlyPtsMap.get(s.id) || 0
      };
    })
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

  if (proofType === 'TRUST') {
    const client = await pool.connect();
    try {
      // Check per-challenge daily limit
      // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'TRUST' 
         AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
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
      // Check if already submitted video for this challenge today (prevent duplicates)
      // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
      const existingVideoResult = await client.query(
        `SELECT id FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'VIDEO'
         AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
      );
      
      if (existingVideoResult.rows.length > 0) {
        return res.status(429).json({
          error: 'Already submitted',
          message: 'You already submitted a video for this challenge today. Try again tomorrow!',
          alreadyCompleted: true
        });
      }

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
      
      // Extract video key from URL for proxy streaming
      let videoKey = '';
      if (videoUrl && videoUrl.includes('idrivee2.com/')) {
        videoKey = videoUrl.split('idrivee2.com/')[1] || '';
      }
      
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, video_url, xp_awarded, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SOLO', 'PENDING', 'VIDEO', $6, $7, NOW())`,
        [challengeUUID, studentId, student.club_id, challengeType, score || 0, videoUrl, finalXp]
      );
      
      // Also add to challenge_videos for coach review queue
      const friendlyName = challengeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      await client.query(
        `INSERT INTO challenge_videos 
         (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, score, status, xp_awarded, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Coach Pick', $5, $6, $7, 'pending', $8, NOW(), NOW())`,
        [studentId, student.club_id, challengeUUID, friendlyName, videoUrl, videoKey, score || 0, finalXp]
      );
      
      console.log(`[Arena] Coach Pick video submitted for "${challengeType}" - added to coach review queue`);

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

// =====================================================
// WORLD RANKINGS - Global Leaderboard System
// =====================================================

async function handleWorldRankings(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const category = url.searchParams.get('category') || 'students';
  const sport = url.searchParams.get('sport');
  const country = url.searchParams.get('country');
  const limit = Number(url.searchParams.get('limit') || 100);
  const offset = Number(url.searchParams.get('offset') || 0);

  const client = await pool.connect();
  try {
    if (category === 'students') {
      let query = `
        SELECT 
          s.id,
          s.name,
          s.belt,
          COALESCE(s.global_xp, 0) as global_xp,
          c.name as club_name,
          c.art_type as sport,
          c.country,
          c.city
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
          AND COALESCE(s.global_xp, 0) > 0
      `;
      const params: any[] = [];
      let paramCount = 0;

      if (sport && sport !== 'all') {
        paramCount++;
        query += ` AND c.art_type = $${paramCount}`;
        params.push(sport);
      }
      if (country && country !== 'all') {
        paramCount++;
        query += ` AND c.country = $${paramCount}`;
        params.push(country);
      }

      query += ` ORDER BY COALESCE(s.global_xp, 0) DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      const rankings = result.rows.map((r: any, index: number) => ({
        rank: offset + index + 1,
        id: r.id,
        name: r.name,
        belt: r.belt,
        globalXp: Number(r.global_xp) || 0,
        clubName: r.club_name,
        sport: r.sport,
        country: r.country,
        city: r.city
      }));

      return res.json({ category: 'students', rankings, total: rankings.length });
    } else if (category === 'clubs') {
      let query = `
        SELECT 
          c.id,
          c.name,
          c.art_type as sport,
          c.country,
          c.city,
          COUNT(s.id) as student_count,
          COALESCE(SUM(s.global_xp), 0) as total_global_xp,
          CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.global_xp), 0) / COUNT(s.id) ELSE 0 END as avg_global_xp
        FROM clubs c
        LEFT JOIN students s ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
        GROUP BY c.id, c.name, c.art_type, c.country, c.city
        HAVING COUNT(s.id) > 0
      `;
      const params: any[] = [];

      if (sport && sport !== 'all') {
        params.push(sport);
        query = `SELECT * FROM (${query}) sub WHERE sport = $1`;
      }

      query = `SELECT * FROM (${query}) ranked ORDER BY avg_global_xp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      const rankings = result.rows.map((r: any, index: number) => ({
        rank: offset + index + 1,
        id: r.id,
        name: r.name,
        sport: r.sport,
        country: r.country,
        city: r.city,
        studentCount: Number(r.student_count),
        totalGlobalXp: Number(r.total_global_xp),
        avgGlobalXp: Math.round(Number(r.avg_global_xp)),
        globalScore: r.global_score || 0
      }));

      return res.json({ category: 'clubs', rankings, total: rankings.length });
    } else {
      return res.status(400).json({ error: 'Invalid category. Use "students" or "clubs"' });
    }
  } catch (error: any) {
    console.error('[World Rankings] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch world rankings' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsSports(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT art_type FROM clubs 
      WHERE art_type IS NOT NULL AND art_type != ''
      ORDER BY art_type
    `);
    
    const sports = result.rows.map((r: any) => r.art_type);
    return res.json({ sports });
  } catch (error: any) {
    console.error('[World Rankings] Sports error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch sports' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsCountries(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT country FROM clubs 
      WHERE country IS NOT NULL AND country != ''
      ORDER BY country
    `);
    
    const countries = result.rows.map((r: any) => r.country);
    return res.json({ countries });
  } catch (error: any) {
    console.error('[World Rankings] Countries error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch countries' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsStats(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const clubsResult = await client.query(`
      SELECT COUNT(*) as count FROM clubs WHERE world_rankings_enabled = true AND status = 'active'
    `);
    
    const studentsResult = await client.query(`
      SELECT COUNT(*) as count FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE c.world_rankings_enabled = true AND c.status = 'active'
    `);
    
    const sportsResult = await client.query(`
      SELECT COUNT(DISTINCT art_type) as count FROM clubs 
      WHERE world_rankings_enabled = true AND art_type IS NOT NULL
    `);

    const countriesResult = await client.query(`
      SELECT COUNT(DISTINCT country) as count FROM clubs 
      WHERE world_rankings_enabled = true AND country IS NOT NULL
    `);

    return res.json({
      participatingClubs: Number(clubsResult.rows[0]?.count || 0),
      totalStudents: Number(studentsResult.rows[0]?.count || 0),
      sportsRepresented: Number(sportsResult.rows[0]?.count || 0),
      countriesRepresented: Number(countriesResult.rows[0]?.count || 0)
    });
  } catch (error: any) {
    console.error('[World Rankings] Stats error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  } finally {
    client.release();
  }
}

async function handleClubWorldRankingsToggle(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { enabled } = parseBody(req);

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE clubs 
      SET world_rankings_enabled = $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, [enabled, clubId]);

    console.log(`[World Rankings] Club ${clubId} opt-${enabled ? 'in' : 'out'}`);
    return res.json({ success: true, enabled });
  } catch (error: any) {
    console.error('[World Rankings] Toggle error:', error.message);
    return res.status(500).json({ error: 'Failed to update world rankings setting' });
  } finally {
    client.release();
  }
}

async function handleStudentGlobalXp(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { scorePercentage } = parseBody(req);

  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  // Validate and clamp scorePercentage to 0-100
  const rawScore = Number(scorePercentage);
  if (isNaN(rawScore)) {
    return res.status(400).json({ error: 'scorePercentage must be a valid number' });
  }
  const clampedScore = Math.max(0, Math.min(100, rawScore));

  // Calculate Global XP using the anti-cheat formula
  const attendanceXp = 20; // Fixed XP for showing up
  const performanceXp = Math.round((clampedScore / 100) * 30); // Max 30 based on performance
  const sessionGlobalXp = Math.min(50, attendanceXp + performanceXp); // Enforce 50 XP cap

  const client = await pool.connect();
  try {
    // Check if already graded today (daily cap)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const existingToday = await client.query(`
      SELECT COUNT(*) as count FROM xp_transactions 
      WHERE student_id = $1::uuid 
        AND reason = 'Global grading'
        AND created_at >= $2::timestamptz
    `, [studentId, todayStart.toISOString()]);
    
    const alreadyGraded = Number(existingToday.rows[0]?.count || 0) > 0;

    if (alreadyGraded) {
      return res.json({ 
        success: true, 
        globalXpAwarded: 0, 
        message: 'Daily global XP cap reached',
        alreadyGraded: true 
      });
    }

    // Award global XP
    await client.query(`
      UPDATE students 
      SET global_xp = COALESCE(global_xp, 0) + $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, [sessionGlobalXp, studentId]);

    // Ensure GLOBAL_EARN enum value exists
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'GLOBAL_EARN' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'xp_transaction_type')) THEN
            ALTER TYPE xp_transaction_type ADD VALUE 'GLOBAL_EARN';
          END IF;
        END
        $$;
      `);
    } catch (enumError: any) {
      console.log('[Global XP] GLOBAL_EARN enum check:', enumError.message);
    }

    // Log the global XP transaction (use different type so it doesn't count in local leaderboard)
    await client.query(`
      INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
      VALUES ($1::uuid, $2, 'GLOBAL_EARN', 'Global grading', NOW())
    `, [studentId, sessionGlobalXp]);

    console.log(`[Global XP] Student ${studentId}: +${sessionGlobalXp} (attendance: ${attendanceXp}, performance: ${performanceXp})`);

    return res.json({ 
      success: true, 
      globalXpAwarded: sessionGlobalXp,
      breakdown: { attendance: attendanceXp, performance: performanceXp }
    });
  } catch (error: any) {
    console.error('[Global XP] Error:', error.message);
    return res.status(500).json({ error: 'Failed to award global XP' });
  } finally {
    client.release();
  }
}

// =====================================================
// SEED GLOBAL XP FOR TESTING
// =====================================================

async function handleSeedClubGlobalXp(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    // Give each student in the club 30-50 random global XP
    const result = await client.query(`
      UPDATE students 
      SET global_xp = COALESCE(global_xp, 0) + (20 + floor(random() * 31)::int),
          updated_at = NOW()
      WHERE club_id = $1::uuid
      RETURNING id, name, global_xp
    `, [clubId]);

    console.log(`[Seed Global XP] Added global XP to ${result.rows.length} students in club ${clubId}`);

    return res.json({ 
      success: true, 
      message: `Added 20-50 global XP to ${result.rows.length} students`,
      students: result.rows.map((s: any) => ({ name: s.name, globalXp: s.global_xp }))
    });
  } catch (error: any) {
    console.error('[Seed Global XP] Error:', error.message);
    return res.status(500).json({ error: 'Failed to seed global XP' });
  } finally {
    client.release();
  }
}

// =====================================================
// SUPER ADMIN - DAILY TRAINING MANAGEMENT
// =====================================================

async function handleSuperAdminGauntletChallenges(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM gauntlet_challenges 
      ORDER BY 
        CASE day_of_week 
          WHEN 'MONDAY' THEN 1 
          WHEN 'TUESDAY' THEN 2 
          WHEN 'WEDNESDAY' THEN 3 
          WHEN 'THURSDAY' THEN 4 
          WHEN 'FRIDAY' THEN 5 
          WHEN 'SATURDAY' THEN 6 
          WHEN 'SUNDAY' THEN 7 
        END,
        display_order ASC
    `);
    
    return res.json({ challenges: result.rows });
  } catch (error: any) {
    console.error('[SuperAdmin] Gauntlet challenges error:', error);
    return res.status(500).json({ error: 'Failed to fetch challenges' });
  } finally {
    client.release();
  }
}

async function handleSuperAdminGauntletChallengeUpdate(req: VercelRequest, res: VercelResponse, challengeId: string) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
  
  const { name, description, icon, demo_video_url, is_active } = parseBody(req);
  
  const client = await pool.connect();
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon);
    }
    if (demo_video_url !== undefined) {
      updates.push(`demo_video_url = $${paramCount++}`);
      values.push(demo_video_url || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(challengeId);
    const query = `UPDATE gauntlet_challenges SET ${updates.join(', ')} WHERE id = $${paramCount}::uuid`;
    
    await client.query(query, values);
    
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[SuperAdmin] Update gauntlet challenge error:', error);
    return res.status(500).json({ error: 'Failed to update challenge' });
  } finally {
    client.release();
  }
}

async function handleSuperAdminVerify(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ valid: true, email: auth.email });
}

// =====================================================
// WARRIOR'S GAUNTLET HANDLERS
// =====================================================

async function handleGauntletToday(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const today = days[new Date().getDay()];
  
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
  
  const client = await pool.connect();
  try {
    const challengesResult = await client.query(`
      SELECT * FROM gauntlet_challenges 
      WHERE day_of_week = $1 AND is_active = true
      ORDER BY display_order ASC
    `, [today]);
    
    const challenges = challengesResult.rows;
    
    let personalBests: any[] = [];
    let thisWeekSubmissions: any[] = [];
    
    if (studentId && challenges.length > 0) {
      const challengeIds = challenges.map(c => c.id);
      
      const pbResult = await client.query(`
        SELECT challenge_id, best_score, has_video_proof 
        FROM gauntlet_personal_bests 
        WHERE student_id = $1::uuid 
        AND challenge_id = ANY($2::uuid[])
      `, [studentId, challengeIds]);
      personalBests = pbResult.rows;
      
      const submissionsResult = await client.query(`
        SELECT challenge_id, score, proof_type, is_personal_best 
        FROM gauntlet_submissions 
        WHERE student_id = $1::uuid 
        AND week_number = $2
        AND challenge_id = ANY($3::uuid[])
      `, [studentId, weekNumber, challengeIds]);
      thisWeekSubmissions = submissionsResult.rows;
    }
    
    const pbMap = new Map(personalBests.map(pb => [pb.challenge_id, pb]));
    const submittedMap = new Map(thisWeekSubmissions.map(s => [s.challenge_id, s]));
    
    const enrichedChallenges = challenges.map(c => ({
      ...c,
      personalBest: pbMap.get(c.id)?.best_score || null,
      pbHasVideo: pbMap.get(c.id)?.has_video_proof || false,
      submittedThisWeek: submittedMap.has(c.id),
      thisWeekScore: submittedMap.get(c.id)?.score || null,
      thisWeekProofType: submittedMap.get(c.id)?.proof_type || null,
    }));
    
    return res.json({
      dayOfWeek: today,
      dayTheme: challenges[0]?.day_theme || 'Training',
      weekNumber,
      challenges: enrichedChallenges,
    });
  } catch (error: any) {
    console.error('[Gauntlet] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch gauntlet challenges' });
  } finally {
    client.release();
  }
}

async function handleGauntletSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const body = parseBody(req);
  const { challengeId, studentId, score, proofType, videoUrl, videoHash } = body;
  
  if (!challengeId || !studentId || score === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
  
  const client = await pool.connect();
  try {
    const existingSubmission = await client.query(`
      SELECT id FROM gauntlet_submissions 
      WHERE challenge_id = $1::uuid AND student_id = $2::uuid AND week_number = $3
    `, [challengeId, studentId, weekNumber]);
    
    if (existingSubmission.rows.length > 0) {
      return res.json({ limitReached: true, message: 'Already completed this week' });
    }
    
    const challengeResult = await client.query(`
      SELECT * FROM gauntlet_challenges WHERE id = $1::uuid
    `, [challengeId]);
    
    const challenge = challengeResult.rows[0];
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    const isVideoProof = proofType === 'VIDEO';
    const localXp = isVideoProof ? 40 : 20;
    const globalPoints = isVideoProof ? 15 : 5;
    
    const pbResult = await client.query(`
      SELECT id, best_score FROM gauntlet_personal_bests 
      WHERE challenge_id = $1::uuid AND student_id = $2::uuid
    `, [challengeId, studentId]);
    
    const existingPB = pbResult.rows[0];
    let isNewPB = false;
    let isFirstSubmission = false;
    
    if (!existingPB) {
      // First submission - store as baseline, don't show "broke record"
      isFirstSubmission = true;
      await client.query(`
        INSERT INTO gauntlet_personal_bests (challenge_id, student_id, best_score, has_video_proof)
        VALUES ($1::uuid, $2::uuid, $3, $4)
      `, [challengeId, studentId, score, isVideoProof]);
    } else {
      const isBetter = challenge.sort_order === 'DESC' 
        ? score > existingPB.best_score 
        : score < existingPB.best_score;
      
      if (isBetter) {
        isNewPB = true; // Only true when actually beating a previous record
        await client.query(`
          UPDATE gauntlet_personal_bests 
          SET best_score = $1, achieved_at = NOW(), has_video_proof = $2
          WHERE id = $3::uuid
        `, [score, isVideoProof, existingPB.id]);
      }
    }
    
    await client.query(`
      INSERT INTO gauntlet_submissions 
      (challenge_id, student_id, week_number, score, proof_type, local_xp_awarded, global_points_awarded, is_personal_best)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
    `, [challengeId, studentId, weekNumber, score, proofType || 'TRUST', localXp, globalPoints, isNewPB]);
    
    // Only award XP immediately for TRUST submissions - VIDEO requires coach verification
    if (!isVideoProof) {
      await client.query(`
        UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1 WHERE id = $2::uuid
      `, [localXp, studentId]);
      
      await client.query(`
        UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid
      `, [globalPoints, studentId]);
    } else {
      // VIDEO submissions: Also insert into challenge_videos for coach review queue
      const studentClubResult = await client.query(`
        SELECT club_id FROM students WHERE id = $1::uuid
      `, [studentId]);
      const studentClubId = studentClubResult.rows[0]?.club_id;
      
      if (studentClubId && videoUrl) {
        // Check for duplicate video content using hash (fingerprint)
        let aiFlag = 'green';
        let aiFlagReason = '';
        
        if (videoHash) {
          const duplicateHashCheck = await client.query(`
            SELECT id FROM challenge_videos 
            WHERE video_hash = $1 AND created_at > NOW() - INTERVAL '30 days'
            LIMIT 1
          `, [videoHash]);
          
          if (duplicateHashCheck.rows.length > 0) {
            aiFlag = 'red';
            aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
            console.log(`[Gauntlet Submit] RED FLAG: Duplicate video hash for ${studentId}`);
          }
        }
        
        await client.query(`
          INSERT INTO challenge_videos 
          (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, xp_awarded, ai_flag, ai_flag_reason, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3, $4, 'Daily Training', $5, '', $6, $7, 'pending', $8, $9, $10, NOW(), NOW())
        `, [studentId, studentClubId, challengeId, challenge.name, videoUrl, videoHash || null, score, localXp, aiFlag, aiFlagReason || null]);
        console.log(`[Gauntlet Submit] Video added to coach review queue for ${challenge.name}, AI Flag: ${aiFlag}`);
      }
    }
    
    const newTotalResult = await client.query(`
      SELECT total_xp FROM students WHERE id = $1::uuid
    `, [studentId]);
    
    console.log(`[Gauntlet Submit] ${challenge.name} by ${studentId} - Score: ${score}, XP: ${isVideoProof ? 0 : localXp}, Pending: ${isVideoProof}`);
    
    // Determine the appropriate message
    let message = 'Challenge completed!';
    if (isVideoProof) {
      message = `Video submitted! You'll earn ${localXp} XP when verified by your coach.`;
    } else if (isNewPB) {
      message = 'New Personal Best! You broke your previous record!';
    } else if (isFirstSubmission) {
      message = 'First attempt recorded! This is your baseline to beat.';
    }
    
    return res.json({
      success: true,
      xpAwarded: isVideoProof ? 0 : localXp,
      pendingXp: isVideoProof ? localXp : 0,
      globalPointsAwarded: isVideoProof ? 0 : globalPoints,
      pendingGlobalPoints: isVideoProof ? globalPoints : 0,
      isNewPersonalBest: isNewPB,
      isFirstSubmission,
      pendingVerification: isVideoProof,
      message,
      newTotalXp: newTotalResult.rows[0]?.total_xp || 0,
    });
  } catch (error: any) {
    console.error('[Gauntlet Submit] Error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to submit gauntlet challenge', details: error.message });
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
    
    // Super Admin routes
    if (path === '/super-admin/verify' || path === '/super-admin/verify/') return await handleSuperAdminVerify(req, res);
    if (path === '/super-admin/gauntlet-challenges' || path === '/super-admin/gauntlet-challenges/') return await handleSuperAdminGauntletChallenges(req, res);
    
    const superAdminGauntletMatch = path.match(/^\/super-admin\/gauntlet-challenges\/([^/]+)\/?$/);
    if (superAdminGauntletMatch) return await handleSuperAdminGauntletChallengeUpdate(req, res, superAdminGauntletMatch[1]);
    
    // Daily Mystery Challenge
    if (path === '/daily-challenge' || path === '/daily-challenge/') return await handleDailyChallenge(req, res);
    if (path === '/daily-challenge/submit' || path === '/daily-challenge/submit/') return await handleDailyChallengeSubmit(req, res);
    if (path === '/daily-challenge/status' || path === '/daily-challenge/status/') return await handleDailyChallengeStatus(req, res);
    
    // Warrior's Gauntlet
    if (path === '/gauntlet/today' || path === '/gauntlet/today/') return await handleGauntletToday(req, res);
    if (path === '/gauntlet/submit' || path === '/gauntlet/submit/') return await handleGauntletSubmit(req, res);
    
    // Arena Challenge Submit & History
    if (path === '/challenges/submit' || path === '/challenges/submit/') return await handleChallengeSubmit(req, res);
    if (path === '/challenges/history' || path === '/challenges/history/') return await handleChallengeHistory(req, res);
    
    // Family Challenges
    if (path === '/family-challenges' || path === '/family-challenges/') return await handleGetFamilyChallenges(req, res);
    if (path === '/family-challenges/submit' || path === '/family-challenges/submit/') return await handleFamilyChallengeSubmit(req, res);
    if (path === '/family-challenges/status' || path === '/family-challenges/status/') return await handleFamilyChallengeStatus(req, res);
    
    // Challenges received/sent by student
    const receivedChallengesMatch = path.match(/^\/challenges\/received\/([^/]+)\/?$/);
    if (receivedChallengesMatch) return await handleReceivedChallenges(req, res, receivedChallengesMatch[1]);
    
    const sentChallengesMatch = path.match(/^\/challenges\/sent\/([^/]+)\/?$/);
    if (sentChallengesMatch) return await handleSentChallenges(req, res, sentChallengesMatch[1]);
    
    // Coach Verification Queue
    const pendingVerificationMatch = path.match(/^\/challenges\/pending-verification\/([^/]+)\/?$/);
    if (pendingVerificationMatch) return await handlePendingVerification(req, res, pendingVerificationMatch[1]);
    
    if (path === '/challenges/verify' || path === '/challenges/verify/') return await handleChallengeVerify(req, res);
    
    // Leaderboard
    if (path === '/leaderboard' || path === '/leaderboard/') return await handleLeaderboard(req, res);
    
    // Home Dojo - Habit Tracking
    if (path === '/habits/check' || path === '/habits/check/') return await handleHabitCheck(req, res);
    if (path === '/students/upgrade-premium' || path === '/students/upgrade-premium/') return await handleUpgradePremium(req, res);
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
    
    const videoStreamMatch = path.match(/^\/videos\/stream\/(.+)$/);
    if (videoStreamMatch) return await handleVideoStream(req, res, decodeURIComponent(videoStreamMatch[1]));

    // World Rankings endpoints
    if (path === '/world-rankings' || path === '/world-rankings/') return await handleWorldRankings(req, res);
    if (path === '/world-rankings/sports' || path === '/world-rankings/sports/') return await handleWorldRankingsSports(req, res);
    if (path === '/world-rankings/countries' || path === '/world-rankings/countries/') return await handleWorldRankingsCountries(req, res);
    if (path === '/world-rankings/stats' || path === '/world-rankings/stats/') return await handleWorldRankingsStats(req, res);
    
    const clubWorldRankingsMatch = path.match(/^\/clubs\/([^/]+)\/world-rankings\/?$/);
    if (clubWorldRankingsMatch) return await handleClubWorldRankingsToggle(req, res, clubWorldRankingsMatch[1]);
    
    const seedGlobalXpMatch = path.match(/^\/clubs\/([^/]+)\/seed-global-xp\/?$/);
    if (seedGlobalXpMatch) return await handleSeedClubGlobalXp(req, res, seedGlobalXpMatch[1]);
    
    const studentGlobalXpMatch = path.match(/^\/students\/([^/]+)\/global-xp\/?$/);
    if (studentGlobalXpMatch) return await handleStudentGlobalXp(req, res, studentGlobalXpMatch[1]);

    return res.status(404).json({ error: 'Not found', path });
  } catch (error: any) {
    console.error('[API Error]', path, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
