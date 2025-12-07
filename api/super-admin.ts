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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }
  
  const token = authHeader.substring(7);
  
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
    
    const clubs = await db`
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
    
    const countResult = await db`SELECT COUNT(*) as total FROM clubs`;
    
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
    
    // Define email templates
    const templates: Record<string, { subject: string; html: string }> = {
      'trial-ending': {
        subject: `Your TaekUp trial ends soon, ${club.owner_name || club.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee;">Your Trial is Almost Over!</h2>
            <p>Hi ${club.owner_name || 'there'},</p>
            <p>Your TaekUp trial for <strong>${club.name}</strong> is ending soon. Don't lose access to all the features that help you run your martial arts club more efficiently!</p>
            <p>Upgrade today to continue enjoying:</p>
            <ul>
              <li>Student management & tracking</li>
              <li>AI-powered class planning</li>
              <li>Parent engagement tools</li>
              <li>Dojang Rivals gamification</li>
            </ul>
            <p style="margin-top: 20px;">
              <a href="https://mytaek.com" style="background: #22d3ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Upgrade Now
              </a>
            </p>
            <p style="margin-top: 20px; color: #666;">The TaekUp Team</p>
          </div>
        `
      },
      'winback': {
        subject: `We miss you at TaekUp, ${club.owner_name || club.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee;">We'd Love to Have You Back!</h2>
            <p>Hi ${club.owner_name || 'there'},</p>
            <p>We noticed you haven't been using TaekUp lately. We've made a lot of improvements and would love to show you what's new!</p>
            <p>Here's a special offer just for you: <strong>Get 20% off your first 3 months</strong> when you reactivate your account.</p>
            <p style="margin-top: 20px;">
              <a href="https://mytaek.com" style="background: #22d3ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Come Back to TaekUp
              </a>
            </p>
            <p style="margin-top: 20px; color: #666;">The TaekUp Team</p>
          </div>
        `
      },
      'churn-risk': {
        subject: `Need help with TaekUp, ${club.owner_name || club.name}?`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22d3ee;">How Can We Help?</h2>
            <p>Hi ${club.owner_name || 'there'},</p>
            <p>We noticed you haven't logged into TaekUp recently. Is there anything we can help you with?</p>
            <p>Our team is here to assist you in getting the most out of the platform. Whether you need:</p>
            <ul>
              <li>A quick walkthrough of features</li>
              <li>Help setting up your club</li>
              <li>Tips for engaging students and parents</li>
            </ul>
            <p>Just reply to this email and we'll be happy to help!</p>
            <p style="margin-top: 20px;">
              <a href="https://mytaek.com" style="background: #22d3ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Log In to TaekUp
              </a>
            </p>
            <p style="margin-top: 20px; color: #666;">The TaekUp Team</p>
          </div>
        `
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
      return res.status(400).json({ error: 'Invalid template' });
    }
    
    let sendStatus = 'failed';
    let sendError: string | null = 'Not attempted';
    let messageId = null;
    
    // Send via SendGrid (using Replit connector or legacy env var)
    const sendgrid = await getUncachableSendGridClient();
    if (sendgrid) {
      try {
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
    
    return res.status(404).json({ error: 'Route not found', path, url, queryPath });
  } catch (error: any) {
    console.error('[SuperAdmin API] Error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
