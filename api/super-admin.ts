import type { VercelRequest, VercelResponse } from '@vercel/node';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import crypto from 'crypto';

let db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    const client = postgres(process.env.DATABASE_URL);
    db = drizzle(client);
  }
  return db;
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

async function verifySuperAdminToken(req: VercelRequest): Promise<{ valid: boolean; email?: string; error?: string }> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'No token provided' };
  }
  
  const token = authHeader.substring(7);
  
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT email, expires_at FROM super_admin_sessions 
      WHERE token = ${token} AND expires_at > NOW()
      LIMIT 1
    `);
    
    const session = (result as any[])[0];
    
    if (!session) {
      return { valid: false, error: 'Invalid or expired token' };
    }
    
    return { valid: true, email: session.email };
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
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    let isValid = false;
    let userEmail = email;
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      isValid = true;
      userEmail = SUPER_ADMIN_EMAIL;
    }
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    
    const db = getDb();
    await db.execute(sql`
      INSERT INTO super_admin_sessions (token, email, expires_at)
      VALUES (${token}, ${userEmail}, ${expiresAt.toISOString()}::timestamp)
      ON CONFLICT (token) DO UPDATE SET expires_at = ${expiresAt.toISOString()}::timestamp
    `);
    
    return res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      email: userEmail
    });
  } catch (error: any) {
    console.error('[SA Login] Error:', error);
    return res.status(500).json({ error: 'Login failed' });
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
      expiringTrialsResult
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM clubs`),
      db.execute(sql`SELECT COUNT(*) as count FROM clubs WHERE trial_status = 'active'`),
      db.execute(sql`SELECT COUNT(*) as count FROM clubs WHERE status = 'active' AND trial_status = 'converted'`),
      db.execute(sql`SELECT COUNT(*) as count FROM clubs WHERE status = 'churned'`),
      db.execute(sql`SELECT COUNT(*) as count FROM students`),
      db.execute(sql`SELECT COUNT(*) as count FROM students WHERE premium_status != 'none'`),
      db.execute(sql`SELECT * FROM clubs ORDER BY created_at DESC LIMIT 5`),
      db.execute(sql`
        SELECT * FROM clubs 
        WHERE trial_status = 'active' 
        AND trial_end IS NOT NULL 
        AND trial_end <= NOW() + INTERVAL '3 days'
        ORDER BY trial_end ASC
        LIMIT 10
      `)
    ]);

    const mrrResult = await db.execute(sql`
      SELECT COALESCE(SUM(monthly_amount), 0) as mrr 
      FROM subscriptions 
      WHERE status = 'active'
    `);

    return res.json({
      stats: {
        totalClubs: Number((totalClubsResult as any[])[0]?.count || 0),
        trialClubs: Number((trialClubsResult as any[])[0]?.count || 0),
        activeClubs: Number((activeClubsResult as any[])[0]?.count || 0),
        churnedClubs: Number((churnedClubsResult as any[])[0]?.count || 0),
        totalStudents: Number((totalStudentsResult as any[])[0]?.count || 0),
        premiumParents: Number((premiumParentsResult as any[])[0]?.count || 0),
        mrr: Number((mrrResult as any[])[0]?.mrr || 0) / 100,
      },
      recentSignups: recentSignupsResult,
      expiringTrials: expiringTrialsResult,
    });
  } catch (error: any) {
    console.error('Overview error:', error);
    return res.status(500).json({ error: 'Failed to fetch overview' });
  }
}

async function handleClubs(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }
  
  try {
    const db = getDb();
    const { status, trial_status, search, limit = '50', offset = '0' } = req.query;
    
    let query = sql`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count,
        (SELECT COUNT(*) FROM coaches WHERE club_id = c.id) as coach_count,
        s.status as subscription_status,
        s.plan_name,
        s.monthly_amount
      FROM clubs c
      LEFT JOIN subscriptions s ON s.club_id = c.id
      WHERE 1=1
    `;
    
    if (status) {
      query = sql`${query} AND c.status = ${status as string}`;
    }
    if (trial_status) {
      query = sql`${query} AND c.trial_status = ${trial_status as string}`;
    }
    if (search) {
      query = sql`${query} AND (c.name ILIKE ${'%' + search + '%'} OR c.owner_email ILIKE ${'%' + search + '%'})`;
    }
    
    query = sql`${query} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    
    const clubs = await db.execute(query);
    const countResult = await db.execute(sql`SELECT COUNT(*) as total FROM clubs`);
    
    return res.json({
      clubs,
      total: Number((countResult as any[])[0]?.total || 0),
      limit: Number(limit),
      offset: Number(offset)
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
    const { premium_only, at_risk, search, limit = '50', offset = '0' } = req.query;
    
    let query = sql`
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
    `;
    
    if (premium_only === 'true') {
      query = sql`${query} AND s.premium_status != 'none'`;
    }
    if (at_risk === 'true') {
      query = sql`${query} AND s.last_class_at IS NOT NULL AND s.last_class_at < NOW() - INTERVAL '14 days'`;
    }
    if (search) {
      query = sql`${query} AND (s.parent_name ILIKE ${'%' + search + '%'} OR s.parent_email ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`;
    }
    
    query = sql`${query} ORDER BY s.last_class_at DESC NULLS LAST LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    
    const parents = await db.execute(query);
    
    return res.json({
      parents,
      limit: Number(limit),
      offset: Number(offset)
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
    
    const superAdminResult = await db.execute(
      sql`SELECT id FROM users WHERE email = ${auth.email} AND role = 'super_admin' LIMIT 1`
    );
    
    let superAdminId = (superAdminResult as any[])[0]?.id;
    
    if (!superAdminId) {
      const insertResult = await db.execute(sql`
        INSERT INTO users (email, name, role, is_active)
        VALUES (${auth.email}, 'Super Admin', 'super_admin', true)
        RETURNING id
      `);
      superAdminId = (insertResult as any[])[0]?.id;
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await db.execute(sql`
      INSERT INTO support_sessions 
        (super_admin_id, target_user_id, target_club_id, reason, token, expires_at, ip, user_agent)
      VALUES 
        (${superAdminId}, ${userId || null}, ${clubId || null}, ${reason || 'Support access'}, ${token}, ${expiresAt}, ${ip}, ${userAgent})
    `);
    
    let targetClub = null;
    if (clubId) {
      const clubResult = await db.execute(sql`SELECT * FROM clubs WHERE id = ${clubId}`);
      targetClub = (clubResult as any[])[0];
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
  
  const url = req.url || '';
  const path = url.split('?')[0].replace('/api/super-admin', '');
  
  console.log('[SuperAdmin API] Path:', path, 'Method:', req.method);
  
  try {
    if (path === '/login' || path === '/login/') {
      return handleLogin(req, res);
    }
    
    if (path === '/verify' || path === '/verify/') {
      return handleVerify(req, res);
    }
    
    if (path === '/overview' || path === '/overview/') {
      return handleOverview(req, res);
    }
    
    if (path === '/clubs' || path === '/clubs/') {
      return handleClubs(req, res);
    }
    
    if (path === '/parents' || path === '/parents/') {
      return handleParents(req, res);
    }
    
    if (path === '/impersonate' || path === '/impersonate/') {
      return handleImpersonate(req, res);
    }
    
    return res.status(404).json({ error: 'Route not found', path });
  } catch (error: any) {
    console.error('[SuperAdmin API] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
