import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import crypto from 'crypto';
import Stripe from 'stripe';
import sgMail from '@sendgrid/mail';

// Initialize Stripe only if API key is available
const STRIPE_KEY = process.env.SANDBOX_STRIPE_KEY || process.env.STRIPE_SECRET_KEY;
let stripe: Stripe | null = null;
if (STRIPE_KEY) {
  stripe = new Stripe(STRIPE_KEY, {
    apiVersion: '2024-06-20' as any,
  });
}

// SendGrid integration via Replit connector or environment variable
async function getUncachableSendGridClient() {
  // First try Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (xReplitToken && hostname) {
    try {
      const connectionSettings = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      ).then(res => res.json()).then(data => data.items?.[0]);

      if (connectionSettings?.settings?.api_key) {
        sgMail.setApiKey(connectionSettings.settings.api_key);
        return {
          client: sgMail,
          fromEmail: connectionSettings.settings.from_email || 'hello@mytaek.com'
        };
      }
    } catch (err) {
      console.error('Failed to get SendGrid via Replit connector:', err);
    }
  }

  // Fallback to environment variable
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return { client: sgMail, fromEmail: 'hello@mytaek.com' };
  }
  
  return null;
}

let sql: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    // Use SSL with rejectUnauthorized false for Neon/serverless compatibility
    sql = postgres(process.env.DATABASE_URL, { 
      ssl: { rejectUnauthorized: false },
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10
    });
  }
  return sql;
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

// Simple signed token functions (no database needed for verification)
const TOKEN_SECRET = process.env.SUPER_ADMIN_PASSWORD || 'fallback-secret';

function createSignedToken(email: string, expiresAt: Date): string {
  const payload = JSON.stringify({ email, exp: expiresAt.getTime() });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

function verifySignedToken(token: string): { valid: boolean; email?: string; error?: string } {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) {
      return { valid: false, error: 'Invalid token format' };
    }
    
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
    if (signature !== expectedSig) {
      return { valid: false, error: 'Invalid token signature' };
    }
    
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { valid: true, email: payload.email };
  } catch (err) {
    return { valid: false, error: 'Token verification failed' };
  }
}

async function verifySuperAdminToken(req: VercelRequest): Promise<{ valid: boolean; email?: string; error?: string }> {
  // Try multiple ways to get the authorization header (case-insensitive)
  const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['authorization'] || req.headers['Authorization'];
  
  console.log('[SuperAdmin] Auth header check:', {
    hasAuth: !!authHeader,
    headerKeys: Object.keys(req.headers).filter(k => k.toLowerCase().includes('auth')),
    allHeaders: Object.keys(req.headers)
  });
  
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }
  
  const token = String(authHeader).substring(7);
  
  // First try signed token verification (no database needed)
  const signedResult = verifySignedToken(token);
  if (signedResult.valid) {
    return signedResult;
  }
  
  // Fallback to database lookup for old tokens
  try {
    const db = getDb();
    const result = await db`
      SELECT email, expires_at FROM super_admin_sessions 
      WHERE token = ${token} AND expires_at > NOW()
      LIMIT 1
    `;
    
    if (!result || result.length === 0) {
      return { valid: false, error: 'Invalid or expired token' };
    }
    
    return { valid: true, email: result[0].email };
  } catch (err) {
    console.error('[SuperAdmin] Session verify error:', err);
    return { valid: false, error: 'Session check failed' };
  }
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = body?.email;
    const password = body?.password;
    
    console.log('[SA Login] Attempt for:', email);
    console.log('[SA Login] ENV password configured:', !!SUPER_ADMIN_PASSWORD);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    let isValid = false;
    let userEmail = email;
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      isValid = true;
      userEmail = SUPER_ADMIN_EMAIL;
      console.log('[SA Login] Matched env credentials');
    }
    
    if (!isValid) {
      console.log('[SA Login] Invalid credentials for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    // Use signed token - no database needed for verification
    const token = createSignedToken(userEmail, expiresAt);
    
    console.log('[SA Login] Success for:', userEmail);
    
    return res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      email: userEmail
    });
  } catch (error: any) {
    console.error('[SA Login] Error:', error);
    return res.status(500).json({ error: 'Login failed: ' + error.message });
  }
}

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  return res.json({ valid: true, email: auth.email });
}

async function handleOverview(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    
    const [
      totalClubsResult,
      trialClubsResult,
      activeClubsResult,
      churnedClubsResult,
      totalStudentsResult,
      premiumParentsResult,
      recentSignupsResult,
      expiringTrialsResult,
      mrrResult
    ] = await Promise.all([
      db`SELECT COUNT(*) as count FROM clubs`,
      db`SELECT COUNT(*) as count FROM clubs WHERE trial_status = 'active'`,
      db`SELECT COUNT(*) as count FROM clubs WHERE status = 'active' AND trial_status = 'converted'`,
      db`SELECT COUNT(*) as count FROM clubs WHERE status = 'churned'`,
      db`SELECT COUNT(*) as count FROM students`,
      db`SELECT COUNT(*) as count FROM students WHERE premium_status != 'none'`,
      db`SELECT * FROM clubs ORDER BY created_at DESC LIMIT 5`,
      db`
        SELECT * FROM clubs 
        WHERE trial_status = 'active' 
        AND trial_end IS NOT NULL 
        AND trial_end <= NOW() + INTERVAL '3 days'
        ORDER BY trial_end ASC
        LIMIT 10
      `,
      db`
        SELECT COALESCE(SUM(monthly_amount), 0) as mrr 
        FROM subscriptions 
        WHERE status = 'active'
      `
    ]);

    return res.json({
      stats: {
        totalClubs: Number(totalClubsResult[0]?.count || 0),
        trialClubs: Number(trialClubsResult[0]?.count || 0),
        activeClubs: Number(activeClubsResult[0]?.count || 0),
        churnedClubs: Number(churnedClubsResult[0]?.count || 0),
        totalStudents: Number(totalStudentsResult[0]?.count || 0),
        premiumParents: Number(premiumParentsResult[0]?.count || 0),
        mrr: Number(mrrResult[0]?.mrr || 0) / 100,
      },
      recentSignups: recentSignupsResult,
      expiringTrials: expiringTrialsResult,
    });
  } catch (error: any) {
    console.error('Overview error:', error);
    return res.status(500).json({ error: 'Failed to fetch overview: ' + error.message });
  }
}

async function handleClubs(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const trial_status = req.query.trial_status as string | undefined;
    
    // Build query with filters
    let clubs;
    let countResult;
    
    if (search && status && trial_status) {
      const searchPattern = `%${search}%`;
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.status = ${status} 
          AND c.trial_status = ${trial_status}
          AND (c.name ILIKE ${searchPattern} OR c.owner_email ILIKE ${searchPattern})
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE status = ${status} AND trial_status = ${trial_status} AND (name ILIKE ${searchPattern} OR owner_email ILIKE ${searchPattern})`;
    } else if (search && status) {
      const searchPattern = `%${search}%`;
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.status = ${status} 
          AND (c.name ILIKE ${searchPattern} OR c.owner_email ILIKE ${searchPattern})
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE status = ${status} AND (name ILIKE ${searchPattern} OR owner_email ILIKE ${searchPattern})`;
    } else if (search && trial_status) {
      const searchPattern = `%${search}%`;
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.trial_status = ${trial_status}
          AND (c.name ILIKE ${searchPattern} OR c.owner_email ILIKE ${searchPattern})
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE trial_status = ${trial_status} AND (name ILIKE ${searchPattern} OR owner_email ILIKE ${searchPattern})`;
    } else if (status && trial_status) {
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.status = ${status} AND c.trial_status = ${trial_status}
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE status = ${status} AND trial_status = ${trial_status}`;
    } else if (search) {
      const searchPattern = `%${search}%`;
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.name ILIKE ${searchPattern} OR c.owner_email ILIKE ${searchPattern}
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE name ILIKE ${searchPattern} OR owner_email ILIKE ${searchPattern}`;
    } else if (status) {
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.status = ${status}
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE status = ${status}`;
    } else if (trial_status) {
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        WHERE c.trial_status = ${trial_status}
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs WHERE trial_status = ${trial_status}`;
    } else {
      clubs = await db`
        SELECT 
          c.*,
          (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
          (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
          s.status as subscription_status,
          s.plan_name,
          s.monthly_amount
        FROM clubs c
        LEFT JOIN subscriptions s ON s.club_id = c.id
        ORDER BY c.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await db`SELECT COUNT(*) as total FROM clubs`;
    }
    
    return res.json({
      clubs,
      total: Number(countResult[0]?.total || 0),
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Clubs list error:', error);
    return res.status(500).json({ error: 'Failed to fetch clubs' });
  }
}

async function handleParents(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    
    const parents = await db`
      SELECT 
        s.id,
        s.name as student_name,
        s.parent_email,
        s.parent_name,
        s.parent_phone,
        s.premium_status,
        s.last_class_at,
        s.total_points,
        s.belt,
        c.name as club_name,
        c.id as club_id,
        EXTRACT(DAY FROM NOW() - s.last_class_at) as days_since_last_class
      FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE s.parent_email IS NOT NULL
      ORDER BY s.last_class_at DESC NULLS LAST 
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    return res.json({
      parents,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Parents list error:', error);
    return res.status(500).json({ error: 'Failed to fetch parents' });
  }
}

// Revenue Analytics - MRR trends, churn rate, conversion rate
async function handleRevenueAnalytics(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const period = (req.query.period as string) || '30'; // days
    const days = parseInt(period) || 30;
    
    // MRR trend over time (daily for last N days)
    const mrrTrend = await db`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '${days} days',
          CURRENT_DATE,
          '1 day'::interval
        )::date AS date
      ),
      daily_mrr AS (
        SELECT 
          ds.date,
          COALESCE(SUM(
            CASE WHEN s.status = 'active' AND s.created_at <= ds.date + INTERVAL '1 day' 
            AND (s.canceled_at IS NULL OR s.canceled_at > ds.date)
            THEN s.monthly_amount ELSE 0 END
          ), 0) as mrr
        FROM date_series ds
        LEFT JOIN subscriptions s ON TRUE
        GROUP BY ds.date
        ORDER BY ds.date
      )
      SELECT date, mrr::integer FROM daily_mrr
    `;
    
    // Current MRR
    const currentMrrResult = await db`
      SELECT COALESCE(SUM(monthly_amount), 0) as mrr 
      FROM subscriptions WHERE status = 'active'
    `;
    
    // Churn rate (last 30 days)
    const churnResult = await db`
      WITH start_count AS (
        SELECT COUNT(*) as cnt FROM clubs 
        WHERE status = 'active' 
        AND created_at < CURRENT_DATE - INTERVAL '30 days'
      ),
      churned_count AS (
        SELECT COUNT(*) as cnt FROM clubs 
        WHERE status = 'churned' 
        AND updated_at >= CURRENT_DATE - INTERVAL '30 days'
      )
      SELECT 
        CASE WHEN (SELECT cnt FROM start_count) > 0 
        THEN ROUND(((SELECT cnt FROM churned_count)::numeric / (SELECT cnt FROM start_count)::numeric) * 100, 2)
        ELSE 0 END as churn_rate
    `;
    
    // Trial to paid conversion rate
    const conversionResult = await db`
      WITH total_trials AS (
        SELECT COUNT(*) as cnt FROM clubs 
        WHERE trial_start IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '90 days'
      ),
      converted AS (
        SELECT COUNT(*) as cnt FROM clubs 
        WHERE trial_status = 'converted'
        AND created_at >= CURRENT_DATE - INTERVAL '90 days'
      )
      SELECT 
        CASE WHEN (SELECT cnt FROM total_trials) > 0 
        THEN ROUND(((SELECT cnt FROM converted)::numeric / (SELECT cnt FROM total_trials)::numeric) * 100, 2)
        ELSE 0 END as conversion_rate,
        (SELECT cnt FROM total_trials) as total_trials,
        (SELECT cnt FROM converted) as converted_trials
    `;
    
    // New MRR this month
    const newMrrResult = await db`
      SELECT COALESCE(SUM(monthly_amount), 0) as new_mrr 
      FROM subscriptions 
      WHERE status = 'active' 
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `;
    
    // Churned MRR this month
    const churnedMrrResult = await db`
      SELECT COALESCE(SUM(monthly_amount), 0) as churned_mrr 
      FROM subscriptions 
      WHERE status = 'canceled' 
      AND canceled_at >= DATE_TRUNC('month', CURRENT_DATE)
    `;
    
    return res.json({
      mrrTrend: mrrTrend.map(r => ({ date: r.date, mrr: Number(r.mrr) / 100 })),
      currentMrr: Number(currentMrrResult[0]?.mrr || 0) / 100,
      churnRate: Number(churnResult[0]?.churn_rate || 0),
      conversionRate: Number(conversionResult[0]?.conversion_rate || 0),
      totalTrials: Number(conversionResult[0]?.total_trials || 0),
      convertedTrials: Number(conversionResult[0]?.converted_trials || 0),
      newMrr: Number(newMrrResult[0]?.new_mrr || 0) / 100,
      churnedMrr: Number(churnedMrrResult[0]?.churned_mrr || 0) / 100,
    });
  } catch (error: any) {
    console.error('Revenue analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch revenue analytics: ' + error.message });
  }
}

// Payment History from Stripe
async function handlePaymentHistory(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const limit = Number(req.query.limit) || 50;
    
    // Get payments from database first
    const payments = await db`
      SELECT 
        p.*,
        c.name as club_name,
        c.owner_email
      FROM payments p
      LEFT JOIN clubs c ON p.club_id = c.id
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    
    // Also try to get recent charges from Stripe for most up-to-date info
    let stripeCharges: any[] = [];
    try {
      if (stripe) {
        const charges = await stripe.charges.list({ limit: 20 });
        stripeCharges = charges.data.map(charge => ({
          id: charge.id,
          amount: charge.amount / 100,
          currency: charge.currency,
          status: charge.status,
          paid: charge.paid,
          refunded: charge.refunded,
          description: charge.description,
          customerEmail: charge.billing_details?.email,
          createdAt: new Date(charge.created * 1000).toISOString(),
          failureMessage: charge.failure_message,
        }));
      }
    } catch (stripeErr) {
      console.log('Stripe charges fetch skipped:', stripeErr);
    }
    
    return res.json({
      payments: payments.map(p => ({
        ...p,
        amount: Number(p.amount) / 100,
      })),
      stripeCharges,
    });
  } catch (error: any) {
    console.error('Payment history error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment history: ' + error.message });
  }
}

// Activity Feed
async function handleActivityFeed(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const limit = Number(req.query.limit) || 50;
    const eventType = req.query.type as string;
    const clubId = req.query.clubId as string;
    
    let activities;
    if (eventType && clubId) {
      activities = await db`
        SELECT a.*, c.name as club_name 
        FROM activity_log a
        LEFT JOIN clubs c ON a.club_id = c.id
        WHERE a.event_type = ${eventType} AND a.club_id = ${clubId}::uuid
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
    } else if (eventType) {
      activities = await db`
        SELECT a.*, c.name as club_name 
        FROM activity_log a
        LEFT JOIN clubs c ON a.club_id = c.id
        WHERE a.event_type = ${eventType}
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
    } else if (clubId) {
      activities = await db`
        SELECT a.*, c.name as club_name 
        FROM activity_log a
        LEFT JOIN clubs c ON a.club_id = c.id
        WHERE a.club_id = ${clubId}::uuid
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      activities = await db`
        SELECT a.*, c.name as club_name 
        FROM activity_log a
        LEFT JOIN clubs c ON a.club_id = c.id
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
    }
    
    return res.json({ activities });
  } catch (error: any) {
    console.error('Activity feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch activity feed: ' + error.message });
  }
}

// Log Activity helper
async function logActivity(
  db: ReturnType<typeof postgres>,
  eventType: string,
  eventTitle: string,
  eventDescription: string | null,
  clubId: string | null,
  actorEmail: string,
  actorType: string,
  metadata: any = null
) {
  try {
    await db`
      INSERT INTO activity_log (event_type, event_title, event_description, club_id, actor_email, actor_type, metadata)
      VALUES (${eventType}, ${eventTitle}, ${eventDescription}, ${clubId}::uuid, ${actorEmail}, ${actorType}, ${JSON.stringify(metadata)})
    `;
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// Health Scores - At-risk clubs
async function handleHealthScores(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    
    // Calculate health scores based on various factors
    const clubs = await db`
      SELECT 
        c.id,
        c.name,
        c.owner_email,
        c.status,
        c.trial_status,
        c.trial_end,
        c.created_at,
        (SELECT MAX(last_login_at) FROM users WHERE club_id = c.id) as last_login,
        (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
        (SELECT COUNT(*) FROM students WHERE club_id = c.id AND created_at >= CURRENT_DATE - INTERVAL '7 days') as students_added_7d,
        (SELECT COUNT(*) FROM coaches WHERE club_id = c.id AND is_active = true) as active_coaches,
        (SELECT COUNT(*) FROM attendance_events WHERE club_id = c.id AND attended_at >= CURRENT_DATE - INTERVAL '7 days') as classes_7d,
        EXTRACT(DAY FROM NOW() - (SELECT MAX(last_login_at) FROM users WHERE club_id = c.id)) as days_since_login
      FROM clubs c
      WHERE c.status = 'active' OR c.trial_status = 'active'
      ORDER BY c.created_at DESC
    `;
    
    // Calculate health score for each club
    const scoredClubs = clubs.map(club => {
      let score = 100;
      const issues: string[] = [];
      
      // No login in 7+ days: -30 points
      const daysSinceLogin = Number(club.days_since_login) || 999;
      if (daysSinceLogin >= 7) {
        score -= 30;
        issues.push(`No login in ${Math.floor(daysSinceLogin)} days`);
      }
      
      // No students: -25 points
      if (Number(club.student_count) === 0) {
        score -= 25;
        issues.push('No students added');
      }
      
      // No classes in 7 days: -20 points
      if (Number(club.classes_7d) === 0 && Number(club.student_count) > 0) {
        score -= 20;
        issues.push('No classes in 7 days');
      }
      
      // No new students in 7 days: -10 points
      if (Number(club.students_added_7d) === 0 && Number(club.student_count) > 0) {
        score -= 10;
        issues.push('No new students this week');
      }
      
      // Trial expiring soon: warning
      if (club.trial_status === 'active' && club.trial_end) {
        const daysUntilExpiry = Math.ceil((new Date(club.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry <= 3 && daysUntilExpiry >= 0) {
          score -= 15;
          issues.push(`Trial expires in ${daysUntilExpiry} days`);
        }
      }
      
      // Determine risk level
      let riskLevel = 'healthy';
      if (score < 50) riskLevel = 'critical';
      else if (score < 70) riskLevel = 'at-risk';
      else if (score < 85) riskLevel = 'warning';
      
      return {
        ...club,
        healthScore: Math.max(0, score),
        riskLevel,
        issues,
        daysSinceLogin: daysSinceLogin === 999 ? null : daysSinceLogin,
      };
    });
    
    // Sort by health score (lowest first)
    scoredClubs.sort((a, b) => a.healthScore - b.healthScore);
    
    const atRiskCount = scoredClubs.filter(c => c.riskLevel === 'at-risk' || c.riskLevel === 'critical').length;
    
    return res.json({
      clubs: scoredClubs,
      summary: {
        total: scoredClubs.length,
        healthy: scoredClubs.filter(c => c.riskLevel === 'healthy').length,
        warning: scoredClubs.filter(c => c.riskLevel === 'warning').length,
        atRisk: scoredClubs.filter(c => c.riskLevel === 'at-risk').length,
        critical: scoredClubs.filter(c => c.riskLevel === 'critical').length,
      }
    });
  } catch (error: any) {
    console.error('Health scores error:', error);
    return res.status(500).json({ error: 'Failed to fetch health scores: ' + error.message });
  }
}

// Extend Trial
async function handleExtendTrial(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { clubId, days = 7, reason } = body;
    
    if (!clubId) {
      return res.status(400).json({ error: 'clubId is required' });
    }
    
    // Get current club
    const clubResult = await db`SELECT * FROM clubs WHERE id = ${clubId}::uuid`;
    if (clubResult.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    const club = clubResult[0];
    const previousTrialEnd = club.trial_end;
    const newTrialEnd = new Date(
      previousTrialEnd ? new Date(previousTrialEnd).getTime() + days * 24 * 60 * 60 * 1000 
      : Date.now() + days * 24 * 60 * 60 * 1000
    );
    
    // Update club trial_end
    await db`
      UPDATE clubs 
      SET trial_end = ${newTrialEnd}, trial_status = 'active', updated_at = NOW()
      WHERE id = ${clubId}::uuid
    `;
    
    // Log the extension
    const extendedBy = auth.email || 'super_admin';
    await db`
      INSERT INTO trial_extensions (club_id, days_added, reason, extended_by, previous_trial_end, new_trial_end)
      VALUES (${clubId}::uuid, ${days}, ${reason || 'Support extension'}, ${extendedBy}, ${previousTrialEnd}, ${newTrialEnd})
    `;
    
    // Log activity
    await logActivity(
      db,
      'trial_extended',
      `Trial extended by ${days} days`,
      reason || 'Support extension',
      clubId,
      auth.email || 'super_admin',
      'super_admin',
      { days, previousTrialEnd, newTrialEnd }
    );
    
    return res.json({
      success: true,
      club: { ...club, trial_end: newTrialEnd },
      extension: { days, previousTrialEnd, newTrialEnd }
    });
  } catch (error: any) {
    console.error('Extend trial error:', error);
    return res.status(500).json({ error: 'Failed to extend trial: ' + error.message });
  }
}

// Apply Discount
async function handleApplyDiscount(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { clubId, percentOff, duration = 'once', reason } = body;
    
    if (!clubId || !percentOff) {
      return res.status(400).json({ error: 'clubId and percentOff are required' });
    }
    
    // Get club info
    const clubResult = await db`SELECT * FROM clubs WHERE id = ${clubId}::uuid`;
    if (clubResult.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    const club = clubResult[0];
    let stripeCouponId = null;
    
    // Create Stripe coupon if customer exists and Stripe is configured
    if (club.stripe_customer_id && stripe) {
      try {
        const coupon = await stripe.coupons.create({
          percent_off: percentOff,
          duration: duration as 'once' | 'repeating' | 'forever',
          duration_in_months: duration === 'repeating' ? 3 : undefined,
          metadata: { clubId, appliedBy: auth.email || 'super_admin' }
        });
        stripeCouponId = coupon.id;
        
        // Apply to customer's subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: club.stripe_customer_id,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          await stripe.subscriptions.update(subscriptions.data[0].id, {
            discounts: [{ coupon: coupon.id }]
          });
        }
      } catch (stripeErr: any) {
        console.log('Stripe coupon creation skipped:', stripeErr.message);
      }
    }
    
    // Record discount
    const code = `SA_${Date.now().toString(36).toUpperCase()}`;
    const appliedBy = auth.email || 'super_admin';
    await db`
      INSERT INTO discounts (club_id, code, percent_off, duration, stripe_coupon_id, applied_by)
      VALUES (${clubId}::uuid, ${code}, ${percentOff}, ${duration}, ${stripeCouponId}, ${appliedBy})
    `;
    
    // Log activity
    await logActivity(
      db,
      'discount_applied',
      `${percentOff}% discount applied`,
      reason || `${duration} discount`,
      clubId,
      auth.email || 'super_admin',
      'super_admin',
      { percentOff, duration, code, stripeCouponId }
    );
    
    return res.json({
      success: true,
      discount: { code, percentOff, duration, stripeCouponId },
      club: club.name
    });
  } catch (error: any) {
    console.error('Apply discount error:', error);
    return res.status(500).json({ error: 'Failed to apply discount: ' + error.message });
  }
}

// Send Email (using SendGrid)
async function handleSendEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { clubId, template, customSubject, customMessage } = body;
    
    if (!clubId || !template) {
      return res.status(400).json({ error: 'clubId and template are required' });
    }
    
    // Get club info
    const clubResult = await db`SELECT * FROM clubs WHERE id = ${clubId}::uuid`;
    if (clubResult.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    const club = clubResult[0];
    const toEmail = club.owner_email;
    
    // SendGrid Dynamic Template IDs
    const DYNAMIC_TEMPLATE_IDS = {
      TRIAL_ENDING_SOON: 'd-ee5cb8ea6f114804a356adda535f05ec',
      WIN_BACK: 'd-189dede22ae74ea697199ccbd9629bdb',
      CHURN_RISK: 'd-f9a587c97a9d4ed18c87212a140f9c53',
    };
    
    // Define email templates with dynamic template support
    interface EmailTemplateConfig {
      subject: string;
      dynamicTemplateId?: string;
      getDynamicData?: () => Record<string, any>;
      html?: string;
    }
    
    const templates: Record<string, EmailTemplateConfig> = {
      'trial-ending': {
        subject: `Your TaekUp trial ends soon!`,
        dynamicTemplateId: DYNAMIC_TEMPLATE_IDS.TRIAL_ENDING_SOON,
        getDynamicData: () => ({
          ownerName: club.owner_name || 'there',
          clubName: club.name,
          daysLeft: 3,
          ctaUrl: 'https://mytaek.com/pricing',
        }),
      },
      'win_back': {
        subject: 'We Want You Back! 25% Off for 3 Months',
        dynamicTemplateId: DYNAMIC_TEMPLATE_IDS.WIN_BACK,
        getDynamicData: () => ({
          ownerName: club.owner_name || 'there',
          clubName: club.name,
          discountCode: 'WINBACK25',
          ctaUrl: 'https://mytaek.com/pricing',
          unsubscribeUrl: 'https://mytaek.com/email-preferences',
          privacyUrl: 'https://mytaek.com/privacy',
        }),
      },
      'churn-risk': {
        subject: 'Need Help Getting Started? We\'re Here for You!',
        dynamicTemplateId: DYNAMIC_TEMPLATE_IDS.CHURN_RISK,
        getDynamicData: () => ({
          ownerName: club.owner_name || 'there',
          clubName: club.name,
          ctaUrl: 'https://mytaek.com/wizard',
          helpUrl: 'https://mytaek.com/help',
          unsubscribeUrl: 'https://mytaek.com/email-preferences',
          privacyUrl: 'https://mytaek.com/privacy',
        }),
      },
      'custom': {
        subject: customSubject || 'Message from TaekUp',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee;">Message from TaekUp</h2>
            <p>Hi ${club.owner_name || 'there'},</p>
            <div>${customMessage || ''}</div>
            <p style="margin-top: 20px; color: #666;">The TaekUp Team</p>
          </div>
        `
      }
    };
    
    const emailTemplate = templates[template];
    if (!emailTemplate) {
      return res.status(400).json({ error: `Invalid template: ${template}. Available: ${Object.keys(templates).join(', ')}` });
    }
    
    let sendStatus = 'failed';
    let sendError: string | null = 'Not attempted';
    let messageId = null;
    
    // Send via SendGrid (using Replit connector or legacy env var)
    const sendgrid = await getUncachableSendGridClient();
    if (sendgrid) {
      try {
        // Check if template has a dynamic template ID
        if (emailTemplate.dynamicTemplateId && emailTemplate.getDynamicData) {
          const dynamicData = emailTemplate.getDynamicData();
          const msg: any = {
            to: toEmail,
            from: {
              email: sendgrid.fromEmail,
              name: 'TaekUp'
            },
            templateId: emailTemplate.dynamicTemplateId,
            dynamicTemplateData: {
              ...dynamicData,
              unsubscribeUrl: 'https://mytaek.com/email-preferences',
              privacyUrl: 'https://mytaek.com/privacy',
            },
          };
          
          const result = await sendgrid.client.send(msg);
          sendStatus = 'sent';
          sendError = null;
          messageId = result[0]?.headers?.['x-message-id'] || null;
          console.log(`[SendGrid] Dynamic template email sent: ${template} (${emailTemplate.dynamicTemplateId})`);
        } else if (emailTemplate.html) {
          // Fallback to HTML
          const result = await sendgrid.client.send({
            to: toEmail,
            from: {
              email: sendgrid.fromEmail,
              name: 'TaekUp'
            },
            subject: emailTemplate.subject,
            html: emailTemplate.html,
          });
          sendStatus = 'sent';
          sendError = null;
          messageId = result[0]?.headers?.['x-message-id'] || null;
        } else {
          sendError = 'Template has no content';
        }
      } catch (sgErr: any) {
        sendStatus = 'failed';
        sendError = sgErr.message;
        console.error('SendGrid error:', sgErr);
      }
    } else {
      sendStatus = 'failed';
      sendError = 'SendGrid not configured';
    }
    
    // Log to email_log
    await db`
      INSERT INTO email_log (club_id, recipient, email_type, subject, status, message_id, error)
      VALUES (${clubId}::uuid, ${toEmail}, ${template}, ${emailTemplate.subject}, ${sendStatus}, ${messageId}, ${sendError})
    `;
    
    // Log activity
    await logActivity(
      db,
      'email_sent',
      `${template} email sent`,
      `Email sent to ${toEmail}`,
      clubId,
      auth.email || 'super_admin',
      'super_admin',
      { template, toEmail, sendStatus }
    );
    
    return res.json({
      success: sendStatus === 'sent',
      status: sendStatus,
      error: sendError,
      recipient: toEmail,
      template
    });
  } catch (error: any) {
    console.error('Send email error:', error);
    return res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
}

// Export Clubs CSV
async function handleExportClubs(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    
    const clubs = await db`
      SELECT 
        c.id,
        c.name,
        c.owner_email,
        c.owner_name,
        c.country,
        c.city,
        c.art_type,
        c.status,
        c.trial_status,
        c.trial_start,
        c.trial_end,
        c.created_at,
        (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
        (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
        s.plan_name,
        s.monthly_amount,
        s.status as subscription_status
      FROM clubs c
      LEFT JOIN subscriptions s ON s.club_id = c.id
      ORDER BY c.created_at DESC
    `;
    
    // Generate CSV
    const headers = ['ID', 'Name', 'Owner Email', 'Owner Name', 'Country', 'City', 'Art Type', 'Status', 'Trial Status', 'Trial Start', 'Trial End', 'Created At', 'Students', 'Coaches', 'Plan', 'Monthly Amount', 'Subscription Status'];
    const rows = clubs.map(c => [
      c.id,
      c.name,
      c.owner_email,
      c.owner_name || '',
      c.country || '',
      c.city || '',
      c.art_type || '',
      c.status,
      c.trial_status,
      c.trial_start ? new Date(c.trial_start).toISOString() : '',
      c.trial_end ? new Date(c.trial_end).toISOString() : '',
      c.created_at ? new Date(c.created_at).toISOString() : '',
      c.student_count,
      c.coach_count,
      c.plan_name || '',
      c.monthly_amount ? (Number(c.monthly_amount) / 100).toFixed(2) : '',
      c.subscription_status || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clubs_export_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    console.error('Export clubs error:', error);
    return res.status(500).json({ error: 'Failed to export clubs: ' + error.message });
  }
}

// Export Revenue CSV
async function handleExportRevenue(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    
    const payments = await db`
      SELECT 
        p.id,
        p.stripe_invoice_id,
        p.stripe_payment_intent_id,
        p.amount,
        p.currency,
        p.status,
        p.paid_at,
        p.period_start,
        p.period_end,
        p.created_at,
        c.name as club_name,
        c.owner_email
      FROM payments p
      LEFT JOIN clubs c ON p.club_id = c.id
      ORDER BY p.created_at DESC
    `;
    
    // Generate CSV
    const headers = ['ID', 'Invoice ID', 'Payment Intent ID', 'Amount', 'Currency', 'Status', 'Paid At', 'Period Start', 'Period End', 'Created At', 'Club Name', 'Owner Email'];
    const rows = payments.map(p => [
      p.id,
      p.stripe_invoice_id || '',
      p.stripe_payment_intent_id || '',
      (Number(p.amount) / 100).toFixed(2),
      p.currency || 'usd',
      p.status,
      p.paid_at ? new Date(p.paid_at).toISOString() : '',
      p.period_start ? new Date(p.period_start).toISOString() : '',
      p.period_end ? new Date(p.period_end).toISOString() : '',
      p.created_at ? new Date(p.created_at).toISOString() : '',
      p.club_name || '',
      p.owner_email || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue_export_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    console.error('Export revenue error:', error);
    return res.status(500).json({ error: 'Failed to export revenue: ' + error.message });
  }
}

async function handleImpersonate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { clubId, userId, reason } = body;
    
    if (!clubId && !userId) {
      return res.status(400).json({ error: 'clubId or userId required' });
    }
    
    const adminEmail = auth.email || '';
    const superAdminResult = await db`
      SELECT id FROM users WHERE email = ${adminEmail} AND role = 'super_admin' LIMIT 1
    `;
    
    let superAdminId = superAdminResult[0]?.id;
    
    if (!superAdminId) {
      const insertResult = await db`
        INSERT INTO users (email, name, role, is_active)
        VALUES (${adminEmail}, 'Super Admin', 'super_admin', true)
        RETURNING id
      `;
      superAdminId = insertResult[0]?.id;
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await db`
      INSERT INTO support_sessions 
        (super_admin_id, target_user_id, target_club_id, reason, token, expires_at, ip, user_agent)
      VALUES 
        (${superAdminId}, ${userId || null}, ${clubId || null}, ${reason || 'Support access'}, ${token}, ${expiresAt}, ${ip}, ${userAgent})
    `;
    
    let targetClub = null;
    if (clubId) {
      const clubResult = await db`SELECT * FROM clubs WHERE id = ${clubId}`;
      targetClub = clubResult[0];
    }
    
    return res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      targetClub
    });
  } catch (error: any) {
    console.error('Impersonate error:', error);
    return res.status(500).json({ error: 'Failed to create impersonation session' });
  }
}

async function handleImpersonateVerify(req: VercelRequest, res: VercelResponse, token: string) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const db = getDb();
    
    const sessionResult = await db`
      SELECT ss.*, c.wizard_data, c.name as club_name, c.owner_email, c.owner_name, c.art_type, c.city, c.country
      FROM support_sessions ss
      LEFT JOIN clubs c ON ss.target_club_id = c.id
      WHERE ss.token = ${token}
        AND ss.expires_at > NOW()
        AND ss.ended_at IS NULL
      LIMIT 1
    `;
    
    if (sessionResult.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    const session = sessionResult[0];
    const clubId = session.target_club_id;
    
    // Fetch students and coaches from their tables
    const [studentsResult, coachesResult] = await Promise.all([
      db`SELECT * FROM students WHERE club_id = ${clubId} ORDER BY name`,
      db`SELECT * FROM coaches WHERE club_id = ${clubId} ORDER BY name`
    ]);
    
    // Convert database students to WizardData format
    const students = studentsResult.map((s: any) => ({
      id: s.id,
      name: s.name,
      beltId: s.belt || 'white',
      stripes: s.stripes || 0,
      totalPoints: s.total_points || 0,
      parentEmail: s.parent_email || '',
      parentName: s.parent_name || '',
      parentPhone: s.parent_phone || '',
      location: s.location || '',
      classes: s.classes || [],
      joinDate: s.join_date || s.created_at,
      xp: s.xp || 0,
      streakDays: s.streak_days || 0,
      lastActivityAt: s.last_activity_at,
      performanceHistory: s.performance_history || [],
      feedbackHistory: s.feedback_history || []
    }));
    
    // Convert database coaches to WizardData format
    const coaches = coachesResult.map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      locations: c.locations || [],
      classes: c.classes || [],
      isActive: c.is_active !== false
    }));
    
    // Get base wizard data or create default
    let wizardData = session.wizard_data || {};
    
    // Merge students and coaches from database
    wizardData = {
      ...wizardData,
      clubName: session.club_name || wizardData.clubName || '',
      ownerName: session.owner_name || wizardData.ownerName || '',
      ownerEmail: session.owner_email || wizardData.ownerEmail || '',
      artType: session.art_type || wizardData.artType || 'Taekwondo',
      city: session.city || wizardData.city || '',
      country: session.country || wizardData.country || '',
      students: students,
      coaches: coaches,
      // Ensure required fields exist with defaults
      belts: wizardData.belts || getDefaultBelts(session.art_type || 'Taekwondo'),
      skills: wizardData.skills || ['Technique', 'Effort', 'Focus', 'Discipline'],
      scoring: wizardData.scoring || { pointsPerStripe: 100, stripesRequired: 4 },
      beltSystem: wizardData.beltSystem || 'wt',
      branches: wizardData.branches || 1,
      branchNames: wizardData.branchNames || ['Main'],
      classNames: wizardData.classNames || ['Beginner', 'Intermediate', 'Advanced'],
      branding: wizardData.branding || {
        primaryColor: '#22d3ee',
        logoUrl: '',
        style: 'modern'
      },
      // Ensure schedule, events, classes, curriculum arrays exist
      schedule: wizardData.schedule || [],
      events: wizardData.events || [],
      classes: wizardData.classes || [],
      curriculum: wizardData.curriculum || [],
      locationClasses: wizardData.locationClasses || {}
    };
    
    await db`
      UPDATE support_sessions 
      SET was_used = true 
      WHERE id = ${session.id}
    `;
    
    return res.json({
      valid: true,
      clubId: session.target_club_id,
      clubName: session.club_name,
      ownerEmail: session.owner_email,
      ownerName: session.owner_name,
      wizardData: wizardData,
      expiresAt: session.expires_at
    });
  } catch (error: any) {
    console.error('Verify impersonation error:', error);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}

// =====================
// ANALYTICS ENDPOINTS
// =====================

async function handleCohortAnalytics(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    // Get cohort data by signup month
    const cohorts = await db`
      SELECT 
        TO_CHAR(c.created_at, 'YYYY-MM') as cohort_month,
        COUNT(*) as total_signups,
        COUNT(*) FILTER (WHERE c.trial_status = 'converted') as converted,
        COUNT(*) FILTER (WHERE c.status = 'churned') as churned,
        COUNT(*) FILTER (WHERE c.trial_status = 'active' OR c.trial_status IS NULL) as still_trial,
        ROUND(COUNT(*) FILTER (WHERE c.trial_status = 'converted') * 100.0 / NULLIF(COUNT(*), 0), 1) as conversion_rate,
        ROUND(COUNT(*) FILTER (WHERE c.status = 'churned') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE c.trial_status != 'active'), 0), 1) as churn_rate
      FROM clubs c
      GROUP BY TO_CHAR(c.created_at, 'YYYY-MM')
      ORDER BY cohort_month DESC
      LIMIT 12
    `;

    // Get LTV by cohort
    const ltvByCohort = await db`
      SELECT 
        TO_CHAR(c.created_at, 'YYYY-MM') as cohort_month,
        COALESCE(SUM(s.monthly_amount), 0) as total_revenue,
        COUNT(DISTINCT c.id) as club_count,
        ROUND(COALESCE(SUM(s.monthly_amount), 0) / NULLIF(COUNT(DISTINCT c.id), 0) / 100.0, 2) as avg_ltv
      FROM clubs c
      LEFT JOIN subscriptions s ON c.id = s.club_id
      GROUP BY TO_CHAR(c.created_at, 'YYYY-MM')
      ORDER BY cohort_month DESC
      LIMIT 12
    `;

    return res.json({ cohorts, ltvByCohort });
  } catch (error: any) {
    console.error('Cohort analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch cohort analytics' });
  }
}

async function handleOnboardingFunnel(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    // Get onboarding funnel data
    const funnel = await db`
      SELECT 
        COUNT(*) as total_started,
        COUNT(*) FILTER (WHERE step1_club_info = true) as step1_completed,
        COUNT(*) FILTER (WHERE step2_belt_system = true) as step2_completed,
        COUNT(*) FILTER (WHERE step3_skills = true) as step3_completed,
        COUNT(*) FILTER (WHERE step4_scoring = true) as step4_completed,
        COUNT(*) FILTER (WHERE step5_people = true) as step5_completed,
        COUNT(*) FILTER (WHERE step6_branding = true) as step6_completed,
        COUNT(*) FILTER (WHERE wizard_completed = true) as wizard_completed,
        AVG(total_time_spent_seconds) as avg_time_seconds
      FROM onboarding_progress
    `;

    // Get clubs stuck at each step
    const stuckClubs = await db`
      SELECT 
        op.last_active_step,
        COUNT(*) as count,
        MIN(c.name) as example_club,
        MIN(c.owner_email) as example_email
      FROM onboarding_progress op
      JOIN clubs c ON c.id = op.club_id
      WHERE op.wizard_completed = false
      GROUP BY op.last_active_step
      ORDER BY count DESC
    `;

    // Get incomplete onboarding list with details
    const incomplete = await db`
      SELECT 
        c.id, c.name, c.owner_email, c.created_at,
        op.last_active_step,
        op.step1_club_info, op.step2_belt_system, op.step3_skills,
        op.step4_scoring, op.step5_people, op.step6_branding
      FROM clubs c
      JOIN onboarding_progress op ON c.id = op.club_id
      WHERE op.wizard_completed = false
      ORDER BY c.created_at DESC
      LIMIT 50
    `;

    return res.json({ 
      funnel: funnel[0] || {}, 
      stuckClubs, 
      incomplete 
    });
  } catch (error: any) {
    console.error('Onboarding funnel error:', error);
    return res.status(500).json({ error: 'Failed to fetch onboarding data' });
  }
}

async function handleChurnReasons(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    if (req.method === 'POST') {
      const { clubId, reason, feedback, wouldReturn } = req.body;
      await db`
        INSERT INTO churn_reasons (club_id, category, additional_feedback, would_recommend)
        VALUES (${clubId}::uuid, ${reason}, ${feedback}, ${wouldReturn})
      `;
      return res.json({ success: true });
    }

    // GET - fetch churn reasons breakdown
    const breakdown = await db`
      SELECT 
        category as reason,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM churn_reasons), 0), 1) as percentage
      FROM churn_reasons
      GROUP BY category
      ORDER BY count DESC
    `;

    const recentFeedback = await db`
      SELECT 
        cr.id,
        cr.club_id,
        cr.category as reason,
        cr.additional_feedback as feedback,
        cr.would_recommend as would_return,
        cr.rating,
        cr.created_at,
        c.name as club_name,
        c.owner_email
      FROM churn_reasons cr
      LEFT JOIN clubs c ON c.id = cr.club_id
      ORDER BY cr.created_at DESC
      LIMIT 20
    `;

    const stats = await db`
      SELECT 
        COUNT(*) as total_churns,
        COUNT(*) FILTER (WHERE would_recommend = true) as would_return_count,
        ROUND(COUNT(*) FILTER (WHERE would_recommend = true) * 100.0 / NULLIF(COUNT(*), 0), 1) as would_return_pct
      FROM churn_reasons
    `;

    return res.json({ 
      breakdown, 
      recentFeedback, 
      stats: stats[0] || {} 
    });
  } catch (error: any) {
    console.error('Churn reasons error:', error);
    return res.status(500).json({ error: 'Failed to fetch churn reasons' });
  }
}

async function handlePaymentRecovery(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    const failedPayments = await db`
      SELECT 
        fp.*,
        c.name as club_name,
        c.owner_email
      FROM failed_payments fp
      LEFT JOIN clubs c ON c.id = fp.club_id
      ORDER BY fp.failed_at DESC
      LIMIT 50
    `;

    const recoveryStats = await db`
      SELECT 
        COUNT(*) as total_failed,
        COUNT(*) FILTER (WHERE recovered_at IS NOT NULL) as recovered,
        COALESCE(SUM(amount) FILTER (WHERE recovered_at IS NULL), 0) as outstanding_amount,
        COALESCE(SUM(amount) FILTER (WHERE recovered_at IS NOT NULL), 0) as recovered_amount,
        ROUND(COUNT(*) FILTER (WHERE recovered_at IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0), 1) as recovery_rate
      FROM failed_payments
    `;

    return res.json({ 
      failedPayments, 
      stats: recoveryStats[0] || {} 
    });
  } catch (error: any) {
    console.error('Payment recovery error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment recovery data' });
  }
}

async function handleMrrGoals(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    if (req.method === 'POST') {
      const { month, targetMrr, notes } = req.body;
      await db`
        INSERT INTO mrr_goals (month, target_mrr, notes)
        VALUES (${month}, ${targetMrr * 100}, ${notes || ''})
        ON CONFLICT (month) DO UPDATE SET 
          target_mrr = ${targetMrr * 100},
          notes = ${notes || ''},
          updated_at = NOW()
      `;
      return res.json({ success: true });
    }

    // GET
    const goals = await db`
      SELECT * FROM mrr_goals
      ORDER BY month DESC
      LIMIT 12
    `;

    // Calculate current MRR
    const mrrResult = await db`
      SELECT COALESCE(SUM(monthly_amount), 0) as current_mrr
      FROM subscriptions
      WHERE status = 'active'
    `;

    return res.json({ 
      goals, 
      currentMrr: Number(mrrResult[0]?.current_mrr || 0) / 100 
    });
  } catch (error: any) {
    console.error('MRR goals error:', error);
    return res.status(500).json({ error: 'Failed to fetch MRR goals' });
  }
}

async function handleAutomations(req: VercelRequest, res: VercelResponse) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  try {
    const db = getDb();

    const rules = await db`
      SELECT * FROM automation_rules
      ORDER BY created_at DESC
    `;

    const executions = await db`
      SELECT 
        ae.*,
        ar.name as rule_name,
        c.name as club_name
      FROM automation_executions ae
      JOIN automation_rules ar ON ar.id = ae.rule_id
      LEFT JOIN clubs c ON c.id = ae.club_id
      ORDER BY ae.executed_at DESC
      LIMIT 50
    `;

    return res.json({ rules, executions });
  } catch (error: any) {
    console.error('Automations error:', error);
    return res.status(500).json({ error: 'Failed to fetch automations' });
  }
}

async function handleAutomationToggle(req: VercelRequest, res: VercelResponse, automationId: string) {
  const authResult = await verifySuperAdminToken(req);
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error });
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getDb();
    const { isActive, slackEnabled, emailEnabled } = req.body;

    if (typeof isActive === 'boolean') {
      await db`
        UPDATE automation_rules
        SET is_active = ${isActive}, updated_at = NOW()
        WHERE id = ${automationId}::uuid
      `;
    }
    
    if (typeof slackEnabled === 'boolean') {
      await db`
        UPDATE automation_rules
        SET slack_enabled = ${slackEnabled}, updated_at = NOW()
        WHERE id = ${automationId}::uuid
      `;
    }
    
    if (typeof emailEnabled === 'boolean') {
      await db`
        UPDATE automation_rules
        SET email_enabled = ${emailEnabled}, updated_at = NOW()
        WHERE id = ${automationId}::uuid
      `;
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Update automation error:', error);
    return res.status(500).json({ error: 'Failed to update automation' });
  }
}

// Helper function to get default belts based on art type
function getDefaultBelts(artType: string) {
  const beltSystems: Record<string, any[]> = {
    'Taekwondo': [
      { id: 'white', name: 'White', color: '#FFFFFF' },
      { id: 'yellow', name: 'Yellow', color: '#FFD700' },
      { id: 'green', name: 'Green', color: '#228B22' },
      { id: 'blue', name: 'Blue', color: '#0000FF' },
      { id: 'red', name: 'Red', color: '#FF0000' },
      { id: 'black', name: 'Black', color: '#000000' }
    ],
    'Karate': [
      { id: 'white', name: 'White', color: '#FFFFFF' },
      { id: 'yellow', name: 'Yellow', color: '#FFD700' },
      { id: 'orange', name: 'Orange', color: '#FFA500' },
      { id: 'green', name: 'Green', color: '#228B22' },
      { id: 'blue', name: 'Blue', color: '#0000FF' },
      { id: 'brown', name: 'Brown', color: '#8B4513' },
      { id: 'black', name: 'Black', color: '#000000' }
    ],
    'BJJ': [
      { id: 'white', name: 'White', color: '#FFFFFF' },
      { id: 'blue', name: 'Blue', color: '#0000FF' },
      { id: 'purple', name: 'Purple', color: '#800080' },
      { id: 'brown', name: 'Brown', color: '#8B4513' },
      { id: 'black', name: 'Black', color: '#000000' }
    ]
  };
  return beltSystems[artType] || beltSystems['Taekwondo'];
}

// Daily Training (Gauntlet) Management Handlers
async function handleGauntletChallenges(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const challenges = await db`
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
    `;
    
    return res.json({ challenges });
  } catch (error: any) {
    console.error('[SuperAdmin] Gauntlet challenges error:', error);
    return res.status(500).json({ error: 'Failed to fetch challenges' });
  }
}

async function handleFamilyChallenges(req: VercelRequest, res: VercelResponse) {
  console.log('[FamilyChallenges] Request received:', req.method);
  
  const auth = await verifySuperAdminToken(req);
  console.log('[FamilyChallenges] Auth result:', auth.valid, auth.error);
  
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    console.log('[FamilyChallenges] DB connection obtained');
    
    if (req.method === 'GET') {
      console.log('[FamilyChallenges] Executing GET query...');
      const challenges = await db`
        SELECT * FROM family_challenges 
        ORDER BY display_order ASC, created_at ASC
      `;
      console.log('[FamilyChallenges] Query returned', challenges?.length || 0, 'challenges');
      return res.json(challenges);
    }
    
    if (req.method === 'POST') {
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      
      if (!name || !description || !category) {
        return res.status(400).json({ error: 'Name, description, and category are required' });
      }
      
      const result = await db`
        INSERT INTO family_challenges (name, description, icon, category, demo_video_url, is_active, display_order)
        VALUES (${name}, ${description}, ${icon || '🎯'}, ${category}, ${demoVideoUrl || null}, ${isActive !== false}, ${displayOrder || 0})
        RETURNING *
      `;
      return res.json(result[0]);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[FamilyChallenges] Error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to handle family challenges', details: error.message });
  }
}

async function handleFamilyChallengeUpdate(req: VercelRequest, res: VercelResponse, challengeId: string) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { name, description, icon, category, demoVideoUrl, isActive, displayOrder } = req.body;
      
      const result = await db`
        UPDATE family_challenges
        SET 
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          icon = COALESCE(${icon}, icon),
          category = COALESCE(${category}, category),
          demo_video_url = ${demoVideoUrl ?? null},
          is_active = COALESCE(${isActive}, is_active),
          display_order = COALESCE(${displayOrder}, display_order),
          updated_at = NOW()
        WHERE id = ${challengeId}::uuid
        RETURNING *
      `;
      
      if (result.length === 0) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      return res.json(result[0]);
    }
    
    if (req.method === 'DELETE') {
      await db`DELETE FROM family_challenges WHERE id = ${challengeId}::uuid`;
      return res.json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[SuperAdmin] Family challenge update error:', error);
    return res.status(500).json({ error: 'Failed to update family challenge' });
  }
}

async function handleGauntletChallengeUpdate(req: VercelRequest, res: VercelResponse, challengeId: string) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const db = getDb();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, description, icon, demo_video_url, is_active } = body;
    
    console.log('[SuperAdmin] Updating gauntlet challenge:', challengeId, body);
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name !== undefined) {
      updates.push(`name = $${updates.length + 1}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${updates.length + 1}`);
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${updates.length + 1}`);
      values.push(icon);
    }
    if (demo_video_url !== undefined) {
      updates.push(`demo_video_url = $${updates.length + 1}`);
      values.push(demo_video_url || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${updates.length + 1}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // Use template literal with postgres.js for each field
    if (name !== undefined) {
      await db`UPDATE gauntlet_challenges SET name = ${name} WHERE id = ${challengeId}::uuid`;
    }
    if (description !== undefined) {
      await db`UPDATE gauntlet_challenges SET description = ${description} WHERE id = ${challengeId}::uuid`;
    }
    if (icon !== undefined) {
      await db`UPDATE gauntlet_challenges SET icon = ${icon} WHERE id = ${challengeId}::uuid`;
    }
    if (demo_video_url !== undefined) {
      await db`UPDATE gauntlet_challenges SET demo_video_url = ${demo_video_url || null} WHERE id = ${challengeId}::uuid`;
    }
    if (is_active !== undefined) {
      await db`UPDATE gauntlet_challenges SET is_active = ${is_active} WHERE id = ${challengeId}::uuid`;
    }
    
    // Fetch updated challenge
    const updated = await db`SELECT * FROM gauntlet_challenges WHERE id = ${challengeId}::uuid`;
    
    return res.json({ success: true, challenge: updated[0] });
  } catch (error: any) {
    console.error('[SuperAdmin] Update gauntlet challenge error:', error);
    return res.status(500).json({ error: 'Failed to update challenge: ' + error.message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Get the path from multiple sources (Vercel rewrites can put it in different places)
  const url = req.url || '';
  const queryPath = req.query.path as string | string[] | undefined;
  
  // Build path from query.path (set by Vercel rewrite) or from URL
  let path = '';
  if (queryPath) {
    path = '/' + (Array.isArray(queryPath) ? queryPath.join('/') : queryPath);
  } else {
    path = url.split('?')[0].replace('/api/super-admin', '');
  }
  
  console.log('[SuperAdmin API] URL:', url, 'QueryPath:', queryPath, 'Path:', path, 'Method:', req.method);
  
  try {
    // Health check endpoint
    if (path === '' || path === '/' || path === '/health' || path === '/health/') {
      return res.json({ 
        ok: true, 
        timestamp: new Date().toISOString(),
        path: path,
        url: url,
        queryPath: queryPath,
        env: {
          hasDbUrl: !!process.env.DATABASE_URL,
          hasPassword: !!process.env.SUPER_ADMIN_PASSWORD,
          email: process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com'
        }
      });
    }
    
    if (path === '/login' || path === '/login/' || path === 'login') {
      return handleLogin(req, res);
    }
    
    if (path === '/verify' || path === '/verify/' || path === 'verify') {
      return handleVerify(req, res);
    }
    
    if (path === '/overview' || path === '/overview/' || path === 'overview') {
      return handleOverview(req, res);
    }
    
    if (path === '/clubs' || path === '/clubs/' || path === 'clubs') {
      return handleClubs(req, res);
    }
    
    if (path === '/parents' || path === '/parents/' || path === 'parents') {
      return handleParents(req, res);
    }
    
    if (path === '/impersonate' || path === '/impersonate/' || path === 'impersonate') {
      return handleImpersonate(req, res);
    }
    
    // Handle /impersonate/verify/:token
    if (path.startsWith('/impersonate/verify/') || path.startsWith('impersonate/verify/')) {
      const token = path.replace('/impersonate/verify/', '').replace('impersonate/verify/', '');
      return handleImpersonateVerify(req, res, token);
    }
    
    // New endpoints for enhanced Super Admin dashboard
    if (path === '/revenue' || path === '/revenue/' || path === 'revenue') {
      return handleRevenueAnalytics(req, res);
    }
    
    if (path === '/payments' || path === '/payments/' || path === 'payments') {
      return handlePaymentHistory(req, res);
    }
    
    if (path === '/activity' || path === '/activity/' || path === 'activity') {
      return handleActivityFeed(req, res);
    }
    
    if (path === '/health' || path === '/health-scores' || path === 'health') {
      return handleHealthScores(req, res);
    }
    
    if (path === '/extend-trial' || path === '/extend-trial/' || path === 'extend-trial') {
      return handleExtendTrial(req, res);
    }
    
    if (path === '/apply-discount' || path === '/apply-discount/' || path === 'apply-discount') {
      return handleApplyDiscount(req, res);
    }
    
    if (path === '/send-email' || path === '/send-email/' || path === 'send-email') {
      return handleSendEmail(req, res);
    }
    
    if (path === '/export/clubs' || path === '/export/clubs/' || path === 'export/clubs') {
      return handleExportClubs(req, res);
    }
    
    if (path === '/export/revenue' || path === '/export/revenue/' || path === 'export/revenue') {
      return handleExportRevenue(req, res);
    }
    
    // Analytics endpoints
    if (path === '/cohorts' || path === '/cohorts/' || path === 'cohorts') {
      return handleCohortAnalytics(req, res);
    }
    
    if (path === '/onboarding' || path === '/onboarding/' || path === 'onboarding') {
      return handleOnboardingFunnel(req, res);
    }
    
    if (path === '/churn-reasons' || path === '/churn-reasons/' || path === 'churn-reasons') {
      return handleChurnReasons(req, res);
    }
    
    if (path === '/payment-recovery' || path === '/payment-recovery/' || path === 'payment-recovery') {
      return handlePaymentRecovery(req, res);
    }
    
    if (path === '/mrr-goals' || path === '/mrr-goals/' || path === 'mrr-goals') {
      return handleMrrGoals(req, res);
    }
    
    if (path === '/automations' || path === '/automations/' || path === 'automations') {
      return handleAutomations(req, res);
    }
    
    // Handle /automations/:id for PATCH
    if (path.startsWith('/automations/') || path.startsWith('automations/')) {
      const automationId = path.replace('/automations/', '').replace('automations/', '').replace('/', '');
      return handleAutomationToggle(req, res, automationId);
    }
    
    // Daily Training (Gauntlet) Management
    if (path === '/gauntlet-challenges' || path === '/gauntlet-challenges/' || path === 'gauntlet-challenges') {
      return handleGauntletChallenges(req, res);
    }
    
    // Handle /gauntlet-challenges/:id for PATCH
    if (path.startsWith('/gauntlet-challenges/') || path.startsWith('gauntlet-challenges/')) {
      const challengeId = path.replace('/gauntlet-challenges/', '').replace('gauntlet-challenges/', '').replace('/', '');
      return handleGauntletChallengeUpdate(req, res, challengeId);
    }
    
    // Handle /family-challenges for GET/POST
    if (path === '/family-challenges' || path === '/family-challenges/' || path === 'family-challenges') {
      return handleFamilyChallenges(req, res);
    }
    
    // Handle /family-challenges/:id for PUT/DELETE
    if (path.startsWith('/family-challenges/') || path.startsWith('family-challenges/')) {
      const challengeId = path.replace('/family-challenges/', '').replace('family-challenges/', '').replace('/', '');
      return handleFamilyChallengeUpdate(req, res, challengeId);
    }
    
    return res.status(404).json({ error: 'Route not found', path, url, queryPath });
  } catch (error: any) {
    console.error('[SuperAdmin API] Error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
