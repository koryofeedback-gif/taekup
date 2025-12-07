import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';

// SendGrid client getter - tries Replit connector first, then env var
async function getSendGridClient() {
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
          fromEmail: connectionSettings.settings.from_email || 'hello@mytaek.com',
          configured: true
        };
      }
    } catch (err) {
      console.error('Failed to get SendGrid via Replit connector:', err);
    }
  }

  // Fallback to environment variable
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return { client: sgMail, fromEmail: 'hello@mytaek.com', configured: true };
  }
  
  return { client: null, fromEmail: null, configured: false };
}

const router = Router();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Database-backed session storage for Vercel serverless compatibility
export async function addSuperAdminSession(token: string, email: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  try {
    await db.execute(sql`
      INSERT INTO super_admin_sessions (token, email, expires_at)
      VALUES (${token}, ${email}, ${expiresAt}::timestamp)
      ON CONFLICT (token) DO UPDATE SET expires_at = ${expiresAt}::timestamp
    `);
    console.log('[SuperAdmin] Session added for:', email, 'token:', token.substring(0, 8) + '...');
  } catch (err) {
    console.error('[SuperAdmin] Failed to save session:', err);
  }
}

async function verifySuperAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const result = await db.execute(sql`
      SELECT email, expires_at FROM super_admin_sessions 
      WHERE token = ${token} AND expires_at > NOW()
      LIMIT 1
    `);
    
    const session = (result as any[])[0];
    
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
    }
    
    (req as any).superAdmin = { email: session.email };
    next();
  } catch (err) {
    console.error('[SuperAdmin] Session verify error:', err);
    return res.status(401).json({ error: 'Unauthorized - Session check failed' });
  }
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
    
    // Store session in database for serverless compatibility
    await addSuperAdminSession(token, userEmail);
    
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

router.post('/logout', verifySuperAdmin, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.substring(7);
    try {
      await db.execute(sql`DELETE FROM super_admin_sessions WHERE token = ${token}`);
    } catch (err) {
      console.error('[SuperAdmin] Failed to delete session:', err);
    }
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

// Revenue Analytics
router.get('/revenue', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    // Count active clubs and estimate MRR (assuming $49/mo average)
    const activeResult = await db.execute(sql`
      SELECT COUNT(*) as active_count FROM clubs WHERE status = 'active'
    `);
    const activeCount = Number((activeResult as any[])[0]?.active_count || 0);
    const mrr = activeCount * 49; // Average subscription price

    const last30Days = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE trial_status = 'active') as trial_count
      FROM clubs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const conversionResult = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active' AND trial_end IS NOT NULL) as converted,
        COUNT(*) FILTER (WHERE trial_end IS NOT NULL) as total_trials
      FROM clubs
    `);

    const churnResult = await db.execute(sql`
      SELECT COUNT(*) as churned
      FROM clubs
      WHERE status = 'churned'
      AND updated_at >= NOW() - INTERVAL '30 days'
    `);

    const totalActiveResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM clubs WHERE status = 'active'
    `);

    const converted = Number((conversionResult as any[])[0]?.converted || 0);
    const totalTrials = Number((conversionResult as any[])[0]?.total_trials || 1);
    const churned = Number((churnResult as any[])[0]?.churned || 0);
    const totalActive = Number((totalActiveResult as any[])[0]?.total || 1);

    res.json({
      mrr,
      mrrTrend: last30Days,
      conversionRate: totalTrials > 0 ? Math.round((converted / totalTrials) * 100) : 0,
      churnRate: totalActive > 0 ? Math.round((churned / totalActive) * 100) : 0,
      totalConverted: converted,
      totalChurned: churned
    });
  } catch (error: any) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// Activity Feed
router.get('/activity', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    
    const activities = await db.execute(sql`
      SELECT 
        a.*,
        c.name as club_name
      FROM activity_log a
      LEFT JOIN clubs c ON a.club_id = c.id
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `);

    res.json({ activities });
  } catch (error: any) {
    console.error('Activity feed error:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// Health Scores
router.get('/health-scores', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const atRiskClubs = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        c.owner_email,
        c.status,
        c.updated_at as last_activity,
        EXTRACT(DAY FROM NOW() - c.updated_at) as days_inactive,
        (SELECT COUNT(*) FROM students s WHERE s.club_id = c.id) as student_count,
        CASE 
          WHEN EXTRACT(DAY FROM NOW() - c.updated_at) > 14 THEN 'critical'
          WHEN EXTRACT(DAY FROM NOW() - c.updated_at) > 7 THEN 'warning'
          ELSE 'healthy'
        END as health_status
      FROM clubs c
      WHERE c.status = 'active' OR c.trial_status = 'active'
      ORDER BY days_inactive DESC
      LIMIT 20
    `);

    res.json({ 
      clubs: atRiskClubs,
      summary: {
        critical: (atRiskClubs as any[]).filter((c: any) => c.health_status === 'critical').length,
        warning: (atRiskClubs as any[]).filter((c: any) => c.health_status === 'warning').length,
        healthy: (atRiskClubs as any[]).filter((c: any) => c.health_status === 'healthy').length
      }
    });
  } catch (error: any) {
    console.error('Health scores error:', error);
    res.status(500).json({ error: 'Failed to fetch health scores' });
  }
});

// Extend Trial
router.post('/extend-trial', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId, days = 7, reason } = req.body;
    
    if (!clubId) {
      return res.status(400).json({ error: 'clubId is required' });
    }

    const clubResult = await db.execute(sql`SELECT * FROM clubs WHERE id = ${clubId}::uuid`);
    if (!(clubResult as any[]).length) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const club = (clubResult as any[])[0];
    const currentEnd = club.trial_end ? new Date(club.trial_end) : new Date();
    const newEnd = new Date(currentEnd.getTime() + (days * 24 * 60 * 60 * 1000));

    await db.execute(sql`
      UPDATE clubs 
      SET trial_end = ${newEnd.toISOString()}::timestamptz
      WHERE id = ${clubId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO trial_extensions (club_id, previous_end, new_end, days_added, reason, extended_by)
      VALUES (${clubId}::uuid, ${currentEnd.toISOString()}::timestamptz, ${newEnd.toISOString()}::timestamptz, ${days}, ${reason || 'Support extension'}, 'super_admin')
    `);

    await db.execute(sql`
      INSERT INTO activity_log (event_type, description, details, club_id, actor_email, actor_type)
      VALUES ('trial_extended', ${`Trial extended by ${days} days`}, ${JSON.stringify({ days, reason })}, ${clubId}::uuid, 'super_admin', 'super_admin')
    `);

    res.json({ 
      success: true, 
      newTrialEnd: newEnd.toISOString(),
      club: club.name
    });
  } catch (error: any) {
    console.error('Extend trial error:', error);
    res.status(500).json({ error: 'Failed to extend trial' });
  }
});

// Apply Discount
router.post('/apply-discount', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId, percentOff, duration = 'once', reason } = req.body;
    
    if (!clubId || !percentOff) {
      return res.status(400).json({ error: 'clubId and percentOff are required' });
    }

    const clubResult = await db.execute(sql`SELECT * FROM clubs WHERE id = ${clubId}::uuid`);
    if (!(clubResult as any[]).length) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const club = (clubResult as any[])[0];
    const code = `SA_${Date.now().toString(36).toUpperCase()}`;

    await db.execute(sql`
      INSERT INTO discounts (club_id, code, percent_off, duration, applied_by)
      VALUES (${clubId}::uuid, ${code}, ${percentOff}, ${duration}, 'super_admin')
    `);

    await db.execute(sql`
      INSERT INTO activity_log (event_type, description, details, club_id, actor_email, actor_type)
      VALUES ('discount_applied', ${`${percentOff}% discount applied`}, ${JSON.stringify({ percentOff, duration, code, reason })}, ${clubId}::uuid, 'super_admin', 'super_admin')
    `);

    res.json({ 
      success: true, 
      discount: { code, percentOff, duration },
      club: club.name
    });
  } catch (error: any) {
    console.error('Apply discount error:', error);
    res.status(500).json({ error: 'Failed to apply discount' });
  }
});

// Email Templates
const EMAIL_TEMPLATES: Record<string, { subject: string; getHtml: (club: any, daysLeft?: number) => string }> = {
  welcome: {
    subject: 'Welcome to TaekUp! Your 14-Day Free Trial Has Started',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00D4FF;">Welcome to TaekUp!</h1>
        </div>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Congratulations on starting your free trial with <strong>${club.name}</strong>!</p>
        <p>You now have <strong>14 days</strong> to explore everything TaekUp has to offer:</p>
        <ul>
          <li>Student & Belt Management</li>
          <li>Dojang Rivals Gamification</li>
          <li>AI-Powered Class Planning</li>
          <li>Parent Engagement Tools</li>
          <li>Revenue Analytics</li>
        </ul>
        <p style="text-align: center; margin: 30px 0;">
          <a href="https://mytaek.com/login" style="background: #00D4FF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Get Started Now</a>
        </p>
        <p>Need help? Reply to this email or check our <a href="https://mytaek.com/features">Features Guide</a>.</p>
        <p>Train hard!<br>The TaekUp Team</p>
      </div>
    `
  },
  trial_7_days: {
    subject: 'Your TaekUp Trial: 7 Days Remaining',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #00D4FF;">7 Days Left in Your Trial</h1>
        </div>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Your free trial for <strong>${club.name}</strong> is halfway through!</p>
        <p>Have you tried these features yet?</p>
        <ul>
          <li>Adding students and tracking their progress</li>
          <li>Creating challenges with Dojang Rivals</li>
          <li>Using the AI Class Planner</li>
        </ul>
        <p style="text-align: center; margin: 30px 0;">
          <a href="https://mytaek.com/pricing" style="background: #00D4FF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">View Pricing Plans</a>
        </p>
        <p>Questions? We're here to help!</p>
        <p>The TaekUp Team</p>
      </div>
    `
  },
  trial_3_days: {
    subject: 'URGENT: Only 3 Days Left in Your TaekUp Trial!',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #FF6B6B;">Only 3 Days Left!</h1>
        </div>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Your free trial for <strong>${club.name}</strong> expires in just <strong>3 days</strong>!</p>
        <p>Don't lose access to:</p>
        <ul>
          <li>Your student data and progress tracking</li>
          <li>Dojang Rivals leaderboards and challenges</li>
          <li>AI-powered tools and analytics</li>
        </ul>
        <p style="background: #FFF3CD; padding: 15px; border-radius: 8px; border-left: 4px solid #FFC107;">
          <strong>Special Offer:</strong> Subscribe now and get 20% off your first 3 months!
        </p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="https://mytaek.com/pricing" style="background: #FF6B6B; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Subscribe Now - Save 20%</a>
        </p>
        <p>The TaekUp Team</p>
      </div>
    `
  },
  trial_expired: {
    subject: 'Your TaekUp Trial Has Expired - We Miss You!',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6C757D;">Your Trial Has Ended</h1>
        </div>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Your free trial for <strong>${club.name}</strong> has expired.</p>
        <p>But don't worry - your data is safe! Subscribe within the next 7 days to pick up right where you left off.</p>
        <p style="background: #D4EDDA; padding: 15px; border-radius: 8px; border-left: 4px solid #28A745;">
          <strong>Come Back Offer:</strong> Use code <strong>COMEBACK25</strong> for 25% off your first month!
        </p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="https://mytaek.com/pricing" style="background: #28A745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reactivate My Account</a>
        </p>
        <p>We'd love to have you back!</p>
        <p>The TaekUp Team</p>
      </div>
    `
  },
  win_back: {
    subject: 'We Want You Back! Special Offer Inside',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #9B59B6;">We Miss You at TaekUp!</h1>
        </div>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>It's been a while since we've seen <strong>${club.name}</strong> on TaekUp.</p>
        <p>We've added some exciting new features since you left:</p>
        <ul>
          <li>Enhanced Dojang Rivals with Team Battles</li>
          <li>Improved AI Class Planner</li>
          <li>New Parent Engagement Tools</li>
          <li>Better Analytics Dashboard</li>
        </ul>
        <p style="background: #F8D7DA; padding: 15px; border-radius: 8px; border-left: 4px solid #DC3545;">
          <strong>Exclusive Win-Back Offer:</strong> Get <strong>50% off</strong> for 3 months with code <strong>WINBACK50</strong>
        </p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="https://mytaek.com/pricing" style="background: #9B59B6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Claim My 50% Discount</a>
        </p>
        <p>Ready to grow your dojang again?</p>
        <p>The TaekUp Team</p>
      </div>
    `
  },
  custom: {
    subject: 'Message from TaekUp',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>{{CUSTOM_BODY}}</p>
        <p>Best regards,<br>The TaekUp Team</p>
      </div>
    `
  }
};

// Send Email with SendGrid
router.post('/send-email', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { clubId, template, subject: customSubject, body: customBody, recipientEmail } = req.body;
    
    if (!clubId || !template) {
      return res.status(400).json({ error: 'clubId and template are required' });
    }

    const emailTemplate = EMAIL_TEMPLATES[template];
    if (!emailTemplate) {
      return res.status(400).json({ error: `Unknown template: ${template}. Available: ${Object.keys(EMAIL_TEMPLATES).join(', ')}` });
    }

    const clubResult = await db.execute(sql`SELECT * FROM clubs WHERE id = ${clubId}::uuid`);
    if (!(clubResult as any[]).length) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const club = (clubResult as any[])[0];
    const toEmail = recipientEmail || club.owner_email;
    const subject = customSubject || emailTemplate.subject;
    let htmlContent = emailTemplate.getHtml(club);
    
    if (template === 'custom' && customBody) {
      htmlContent = htmlContent.replace('{{CUSTOM_BODY}}', customBody);
    }

    // Send email via SendGrid if configured
    const sendgrid = await getSendGridClient();
    let emailSent = false;
    let emailError = null;
    
    if (sendgrid.configured && sendgrid.client) {
      const msg = {
        to: toEmail,
        from: sendgrid.fromEmail || 'hello@mytaek.com',
        subject: subject,
        html: htmlContent,
      };

      try {
        await sendgrid.client.send(msg);
        console.log(`[SendGrid] Email sent to ${toEmail}: ${template}`);
        emailSent = true;
      } catch (sgError: any) {
        console.error('[SendGrid] Error:', sgError.response?.body || sgError.message);
        emailError = sgError.response?.body?.errors?.[0]?.message || sgError.message;
      }
    } else {
      console.log(`[Email Preview - SendGrid not configured]`);
      console.log(`To: ${toEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Template: ${template}`);
      emailError = 'SendGrid not configured';
    }

    // Log activity
    await db.execute(sql`
      INSERT INTO activity_log (event_type, event_title, event_description, metadata, club_id, actor_email, actor_type)
      VALUES ('email_sent', ${`Email: ${template}`}, ${`Sent to ${toEmail}`}, ${JSON.stringify({ template, subject, recipientEmail: toEmail, sent: emailSent, error: emailError })}::jsonb, ${clubId}::uuid, 'super_admin', 'super_admin')
    `);

    if (emailSent) {
      res.json({ 
        success: true, 
        message: `Email sent to ${toEmail}`,
        template,
        subject,
        club: club.name
      });
    } else {
      res.status(500).json({ 
        error: emailError || 'Failed to send email',
        template,
        recipient: toEmail
      });
    }
  } catch (error: any) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
});

// Export Clubs CSV
router.get('/export/clubs', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const clubs = await db.execute(sql`
      SELECT 
        c.id, c.name, c.owner_email, c.owner_name,
        c.status, c.trial_status, c.trial_end,
        c.city, c.country, c.art_type,
        c.created_at,
        (SELECT COUNT(*) FROM students s WHERE s.club_id = c.id) as student_count
      FROM clubs c
      ORDER BY c.created_at DESC
    `);

    const headers = ['ID', 'Name', 'Owner Email', 'Owner Name', 'Status', 'Trial Status', 'Trial End', 'City', 'Country', 'Art Type', 'Created', 'Students'];
    const rows = (clubs as any[]).map(c => [
      c.id, c.name, c.owner_email, c.owner_name || '',
      c.status || '', c.trial_status || '',
      c.trial_end ? new Date(c.trial_end).toISOString().split('T')[0] : '',
      c.city || '', c.country || '', c.art_type || '',
      new Date(c.created_at).toISOString().split('T')[0],
      c.student_count
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=clubs_export.csv');
    res.send(csv);
  } catch (error: any) {
    console.error('Export clubs error:', error);
    res.status(500).json({ error: 'Failed to export clubs' });
  }
});

// Export Revenue CSV
router.get('/export/revenue', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const revenue = await db.execute(sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE status = 'active') as active_clubs,
        COUNT(*) FILTER (WHERE trial_status = 'active') as trial_clubs,
        COUNT(*) FILTER (WHERE status = 'active') * 49 as daily_mrr
      FROM clubs
      WHERE created_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const headers = ['Date', 'Active Clubs', 'Trial Clubs', 'Daily MRR'];
    const rows = (revenue as any[]).map(r => [
      r.date, r.active_clubs, r.trial_clubs, r.daily_mrr || 0
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=revenue_export.csv');
    res.send(csv);
  } catch (error: any) {
    console.error('Export revenue error:', error);
    res.status(500).json({ error: 'Failed to export revenue' });
  }
});

export { router as superAdminRouter, verifySuperAdmin };
