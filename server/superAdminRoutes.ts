import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = Router();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

interface SuperAdminSession {
  token: string;
  email: string;
  expiresAt: Date;
}

const activeSessions: Map<string, SuperAdminSession> = new Map();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Export function to add sessions from other modules
export function addSuperAdminSession(token: string, email: string): void {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  activeSessions.set(token, { token, email, expiresAt });
  console.log('[SuperAdmin] Session added for:', email, 'token:', token.substring(0, 8) + '...');
}

async function verifySuperAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }
  
  const token = authHeader.substring(7);
  const session = activeSessions.get(token);
  
  if (!session || session.expiresAt < new Date()) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
  
  (req as any).superAdmin = { email: session.email };
  next();
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const dbResult = await db.execute(
      sql`SELECT * FROM users WHERE email = ${email} AND role = 'super_admin' AND is_active = true LIMIT 1`
    );
    
    let isValid = false;
    let userEmail = email;
    
    if (dbResult && (dbResult as any[]).length > 0) {
      const user = (dbResult as any[])[0];
      if (user.password_hash) {
        isValid = await bcrypt.compare(password, user.password_hash);
        userEmail = user.email;
      }
    } else if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      isValid = true;
      userEmail = SUPER_ADMIN_EMAIL;
    }
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    
    activeSessions.set(token, {
      token,
      email: userEmail,
      expiresAt
    });
    
    res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      email: userEmail
    });
  } catch (error: any) {
    console.error('Super Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', verifySuperAdmin, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.substring(7);
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

router.get('/verify', verifySuperAdmin, (req: Request, res: Response) => {
  res.json({ 
    valid: true, 
    email: (req as any).superAdmin.email 
  });
});

router.get('/overview', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
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

    res.json({
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
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

router.get('/clubs', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status, trial_status, search, limit = 50, offset = 0 } = req.query;
    
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
      query = sql`${query} AND c.status = ${status}`;
    }
    if (trial_status) {
      query = sql`${query} AND c.trial_status = ${trial_status}`;
    }
    if (search) {
      query = sql`${query} AND (c.name ILIKE ${'%' + search + '%'} OR c.owner_email ILIKE ${'%' + search + '%'})`;
    }
    
    query = sql`${query} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    
    const clubs = await db.execute(query);
    const countResult = await db.execute(sql`SELECT COUNT(*) as total FROM clubs`);
    
    res.json({
      clubs,
      total: Number((countResult as any[])[0]?.total || 0),
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('Clubs list error:', error);
    res.status(500).json({ error: 'Failed to fetch clubs' });
  }
});

router.get('/clubs/:id', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [clubResult, studentsResult, coachesResult, subscriptionResult, paymentsResult] = await Promise.all([
      db.execute(sql`SELECT * FROM clubs WHERE id = ${id}`),
      db.execute(sql`SELECT * FROM students WHERE club_id = ${id} ORDER BY name`),
      db.execute(sql`SELECT * FROM coaches WHERE club_id = ${id} ORDER BY name`),
      db.execute(sql`SELECT * FROM subscriptions WHERE club_id = ${id} ORDER BY created_at DESC LIMIT 1`),
      db.execute(sql`SELECT * FROM payments WHERE club_id = ${id} ORDER BY created_at DESC LIMIT 10`)
    ]);
    
    if (!(clubResult as any[]).length) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    res.json({
      club: (clubResult as any[])[0],
      students: studentsResult,
      coaches: coachesResult,
      subscription: (subscriptionResult as any[])[0] || null,
      payments: paymentsResult
    });
  } catch (error: any) {
    console.error('Club detail error:', error);
    res.status(500).json({ error: 'Failed to fetch club details' });
  }
});

router.get('/parents', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { premium_only, at_risk, search, limit = 50, offset = 0 } = req.query;
    
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
    
    res.json({
      parents,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('Parents list error:', error);
    res.status(500).json({ error: 'Failed to fetch parents' });
  }
});

router.get('/payments', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = sql`
      SELECT 
        p.*,
        c.name as club_name,
        c.owner_email
      FROM payments p
      JOIN clubs c ON p.club_id = c.id
      WHERE 1=1
    `;
    
    if (status) {
      query = sql`${query} AND p.status = ${status}`;
    }
    
    query = sql`${query} ORDER BY p.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    
    const payments = await db.execute(query);
    
    res.json({
      payments,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('Payments list error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.post('/impersonate', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId, userId, reason } = req.body;
    const superAdminEmail = (req as any).superAdmin.email;
    
    if (!clubId && !userId) {
      return res.status(400).json({ error: 'clubId or userId required' });
    }
    
    const superAdminResult = await db.execute(
      sql`SELECT id FROM users WHERE email = ${superAdminEmail} AND role = 'super_admin' LIMIT 1`
    );
    
    let superAdminId = (superAdminResult as any[])[0]?.id;
    
    if (!superAdminId) {
      const insertResult = await db.execute(sql`
        INSERT INTO users (email, name, role, is_active)
        VALUES (${superAdminEmail}, 'Super Admin', 'super_admin', true)
        RETURNING id
      `);
      superAdminId = (insertResult as any[])[0]?.id;
    }
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
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
    
    res.json({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      targetClub
    });
  } catch (error: any) {
    console.error('Impersonate error:', error);
    res.status(500).json({ error: 'Failed to create impersonation session' });
  }
});

router.post('/impersonate/end', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    await db.execute(sql`
      UPDATE support_sessions 
      SET ended_at = NOW() 
      WHERE token = ${token}
    `);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('End impersonation error:', error);
    res.status(500).json({ error: 'Failed to end impersonation session' });
  }
});

router.get('/impersonate/verify/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const sessionResult = await db.execute(sql`
      SELECT ss.*, c.wizard_data, c.name as club_name, c.owner_email, c.owner_name
      FROM support_sessions ss
      LEFT JOIN clubs c ON ss.target_club_id = c.id
      WHERE ss.token = ${token}
        AND ss.expires_at > NOW()
        AND ss.ended_at IS NULL
      LIMIT 1
    `);
    
    if (!(sessionResult as any[]).length) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    const session = (sessionResult as any[])[0];
    
    await db.execute(sql`
      UPDATE support_sessions 
      SET was_used = true 
      WHERE id = ${session.id}
    `);
    
    res.json({
      valid: true,
      clubId: session.target_club_id,
      clubName: session.club_name,
      ownerEmail: session.owner_email,
      ownerName: session.owner_name,
      wizardData: session.wizard_data,
      expiresAt: session.expires_at
    });
  } catch (error: any) {
    console.error('Verify impersonation error:', error);
    res.status(500).json({ error: 'Failed to verify session' });
  }
});

router.get('/emails', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { type, status, limit = 50, offset = 0 } = req.query;
    
    let query = sql`
      SELECT 
        e.*,
        c.name as club_name
      FROM email_log e
      LEFT JOIN clubs c ON e.club_id = c.id
      WHERE 1=1
    `;
    
    if (type) {
      query = sql`${query} AND e.email_type = ${type}`;
    }
    if (status) {
      query = sql`${query} AND e.status = ${status}`;
    }
    
    query = sql`${query} ORDER BY e.sent_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    
    const emails = await db.execute(query);
    
    res.json({
      emails,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    console.error('Emails list error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

export { router as superAdminRouter, verifySuperAdmin };
