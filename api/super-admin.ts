import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import crypto from 'crypto';

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
    
    return res.status(404).json({ error: 'Route not found', path, url, queryPath });
  } catch (error: any) {
    console.error('[SuperAdmin API] Error:', error);
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
