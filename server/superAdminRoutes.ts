import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { EMAIL_TEMPLATES as DYNAMIC_TEMPLATES } from './services/emailService';

// SendGrid client getter - tries Replit connector first, then env var
async function getSendGridClient() {
  console.log('[SendGrid] Checking configuration...');
  console.log('[SendGrid] REPLIT_CONNECTORS_HOSTNAME:', !!process.env.REPLIT_CONNECTORS_HOSTNAME);
  console.log('[SendGrid] REPL_IDENTITY:', !!process.env.REPL_IDENTITY);
  console.log('[SendGrid] SENDGRID_API_KEY:', !!process.env.SENDGRID_API_KEY);
  
  // First try Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (xReplitToken && hostname) {
    try {
      console.log('[SendGrid] Trying Replit connector...');
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
        const fromEmail = connectionSettings.settings.from_email || 'hello@mytaek.com';
        console.log('[SendGrid] Got API key from Replit connector');
        console.log('[SendGrid] Using from_email:', fromEmail);
        sgMail.setApiKey(connectionSettings.settings.api_key);
        return {
          client: sgMail,
          fromEmail: fromEmail,
          configured: true
        };
      } else {
        console.log('[SendGrid] Connector returned no api_key');
      }
    } catch (err) {
      console.error('[SendGrid] Failed to get via Replit connector:', err);
    }
  }

  // Fallback to environment variable
  if (process.env.SENDGRID_API_KEY) {
    console.log('[SendGrid] Using SENDGRID_API_KEY env var');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return { client: sgMail, fromEmail: 'hello@mytaek.com', configured: true };
  }
  
  console.log('[SendGrid] No configuration found');
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

// Delete a club and all associated data
router.delete('/clubs/:id', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // First check if club exists
    const clubResult = await db.execute(sql`SELECT id, name FROM clubs WHERE id = ${id}`);
    if (!(clubResult as any[]).length) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    const clubName = (clubResult as any[])[0].name;
    
    // Delete all related data in order (respecting foreign key constraints)
    // Order matters: delete child records first, then parents
    await db.execute(sql`DELETE FROM video_submissions WHERE student_id IN (SELECT id FROM students WHERE club_id = ${id})`);
    await db.execute(sql`DELETE FROM challenge_progress WHERE student_id IN (SELECT id FROM students WHERE club_id = ${id})`);
    await db.execute(sql`DELETE FROM xp_transactions WHERE student_id IN (SELECT id FROM students WHERE club_id = ${id})`);
    await db.execute(sql`DELETE FROM attendance WHERE student_id IN (SELECT id FROM students WHERE club_id = ${id})`);
    await db.execute(sql`DELETE FROM students WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM coaches WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM club_challenges WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM class_schedule WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM payments WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM subscriptions WHERE club_id = ${id}`);
    await db.execute(sql`DELETE FROM clubs WHERE id = ${id}`);
    
    console.log(`[SuperAdmin] Deleted club: ${clubName} (${id})`);
    
    res.json({ 
      success: true, 
      message: `Club "${clubName}" and all associated data have been permanently deleted.`
    });
  } catch (error: any) {
    console.error('Delete club error:', error);
    res.status(500).json({ error: 'Failed to delete club: ' + error.message });
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
      SELECT ss.*, c.wizard_data, c.name as club_name, c.owner_email, c.owner_name, c.art_type, c.city, c.country
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
    const clubId = session.target_club_id;
    
    // Fetch students and coaches from their tables
    const [studentsResult, coachesResult] = await Promise.all([
      db.execute(sql`SELECT * FROM students WHERE club_id = ${clubId} ORDER BY name`),
      db.execute(sql`SELECT * FROM coaches WHERE club_id = ${clubId} ORDER BY name`)
    ]);
    
    // Convert database students to WizardData format
    const students = (studentsResult as any[]).map((s: any) => ({
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
    const coaches = (coachesResult as any[]).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      locations: c.locations || [],
      classes: c.classes || [],
      isActive: c.is_active !== false
    }));
    
    // Helper function to get default belts
    const getDefaultBelts = (artType: string) => {
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
    };
    
    // Get base wizard data or create default
    let wizardData = session.wizard_data || {};
    
    // Merge students and coaches - prefer database if available, fallback to wizard_data
    const mergedStudents = students.length > 0 ? students : (wizardData.students || []);
    const mergedCoaches = coaches.length > 0 ? coaches : (wizardData.coaches || []);
    
    wizardData = {
      ...wizardData,
      clubName: session.club_name || wizardData.clubName || '',
      ownerName: session.owner_name || wizardData.ownerName || '',
      ownerEmail: session.owner_email || wizardData.ownerEmail || '',
      artType: session.art_type || wizardData.artType || 'Taekwondo',
      city: session.city || wizardData.city || '',
      country: session.country || wizardData.country || '',
      students: mergedStudents,
      coaches: mergedCoaches,
      // Ensure required fields exist with defaults
      belts: wizardData.belts || getDefaultBelts(session.art_type || 'Taekwondo'),
      skills: wizardData.skills || ['Technique', 'Effort', 'Focus', 'Discipline'],
      scoring: wizardData.scoring || { pointsPerStripe: 100, stripesRequired: 4 },
      beltSystem: wizardData.beltSystem || 'wt',
      branches: wizardData.branches || 1,
      branchNames: wizardData.branchNames || ['Main'],
      classNames: wizardData.classNames || ['Beginner', 'Intermediate', 'Advanced'],
      // Preserve schedule, events, and class data from wizard_data
      schedule: wizardData.schedule || [],
      events: wizardData.events || [],
      classes: wizardData.classes || [],
      curriculum: wizardData.curriculum || [],
      locationClasses: wizardData.locationClasses || {},
      branding: wizardData.branding || {
        primaryColor: '#22d3ee',
        logoUrl: '',
        style: 'modern'
      }
    };
    
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
      wizardData: wizardData,
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

// Email Templates - Map super admin template names to SendGrid dynamic template IDs
// Templates with dynamic IDs use SendGrid's dynamic template system
// Templates marked as 'html' fall back to inline HTML
interface SuperAdminEmailTemplate {
  subject: string;
  dynamicTemplateId?: string;
  getHtml?: (club: any) => string;
  getDynamicData?: (club: any) => Record<string, any>;
}

// Super Admin email templates for manual club outreach (updated Jan 2026)
const EMAIL_TEMPLATES: Record<string, SuperAdminEmailTemplate> = {
  // Trial & Onboarding
  welcome_club: {
    subject: 'Welcome to TaekUp! Your 14-Day Free Trial Has Started',
    dynamicTemplateId: DYNAMIC_TEMPLATES.WELCOME,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      ctaUrl: 'https://mytaek.com/setup',
    }),
  },
  day_3_checkin: {
    subject: 'How\'s Your Setup Going? Day 3 Check-in',
    dynamicTemplateId: DYNAMIC_TEMPLATES.DAY_3_CHECKIN,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
    }),
  },
  day_7_mid_trial: {
    subject: 'Your TaekUp Trial: 7 Days Remaining',
    dynamicTemplateId: DYNAMIC_TEMPLATES.DAY_7_MID_TRIAL,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      aiFeedbackUrl: 'https://mytaek.com/ai-feedback',
    }),
  },
  trial_ending: {
    subject: 'Your TaekUp Trial is Ending Soon!',
    dynamicTemplateId: DYNAMIC_TEMPLATES.TRIAL_ENDING_SOON,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      daysLeft: 3,
      ctaUrl: 'https://mytaek.com/pricing',
    }),
  },
  trial_expired: {
    subject: 'Your TaekUp Trial Has Expired - We Miss You!',
    dynamicTemplateId: DYNAMIC_TEMPLATES.TRIAL_EXPIRED,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      ctaUrl: 'https://mytaek.com/pricing',
    }),
  },
  // Retention & Win-back
  win_back: {
    subject: 'We Want You Back! 25% Off for 3 Months',
    dynamicTemplateId: DYNAMIC_TEMPLATES.WIN_BACK,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      discountCode: 'WINBACK25',
      ctaUrl: 'https://mytaek.com/pricing',
      unsubscribeUrl: 'https://mytaek.com/email-preferences',
      privacyUrl: 'https://mytaek.com/privacy',
    }),
  },
  churn_risk: {
    subject: 'Need Help Getting Started? We\'re Here for You!',
    dynamicTemplateId: DYNAMIC_TEMPLATES.CHURN_RISK,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      ctaUrl: 'https://mytaek.com/wizard',
      helpUrl: 'https://mytaek.com/help',
      unsubscribeUrl: 'https://mytaek.com/email-preferences',
      privacyUrl: 'https://mytaek.com/privacy',
    }),
  },
  // Billing & Payments
  payment_failed: {
    subject: 'Action Required: Payment Failed for TaekUp',
    dynamicTemplateId: DYNAMIC_TEMPLATES.PAYMENT_CONFIRMATION,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      ctaUrl: 'https://mytaek.com/billing',
      message: 'Your recent payment could not be processed. Please update your payment method to continue using TaekUp.',
    }),
  },
  payment_receipt: {
    subject: 'Receipt for Your TaekUp Subscription',
    dynamicTemplateId: DYNAMIC_TEMPLATES.PAYMENT_CONFIRMATION,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      amount: club.subscription_price || '$29',
      date: new Date().toLocaleDateString(),
    }),
  },
  subscription_cancelled: {
    subject: 'Your TaekUp Subscription Has Been Cancelled',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Subscription Cancelled</h2>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>We've cancelled your TaekUp subscription for <strong>${club.name}</strong> as requested.</p>
        <p>Your access will remain active until the end of your current billing period.</p>
        <p>If you change your mind, you can reactivate anytime from your dashboard.</p>
        <p>We hope to see you again!</p>
        <p>Best regards,<br>The TaekUp Team</p>
      </div>
    `,
  },
  payout_notification: {
    subject: 'DojoMint™ Payout Sent to Your Account',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Payout Notification</h2>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Great news! A payout has been initiated to your connected bank account via DojoMint™ Protocol.</p>
        <p>Club: <strong>${club.name}</strong></p>
        <p>The funds should arrive within 2-3 business days.</p>
        <p>View details in your <a href="https://mytaek.com/billing">Billing Dashboard</a>.</p>
        <p>Best regards,<br>The TaekUp Team</p>
      </div>
    `,
  },
  monthly_revenue_report: {
    subject: 'Your Monthly Revenue Report - TaekUp',
    dynamicTemplateId: DYNAMIC_TEMPLATES.MONTHLY_REVENUE_REPORT,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    }),
  },
  // Engagement
  weekly_progress: {
    subject: 'Weekly Progress Summary - TaekUp',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Weekly Progress Summary</h2>
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>Here's what happened at <strong>${club.name}</strong> this week:</p>
        <ul>
          <li>Student engagement summary</li>
          <li>Upcoming belt promotions</li>
          <li>Challenge completion rates</li>
        </ul>
        <p>View full analytics in your <a href="https://mytaek.com/dashboard">Dashboard</a>.</p>
        <p>Best regards,<br>The TaekUp Team</p>
      </div>
    `,
  },
  birthday_wish: {
    subject: 'Happy Birthday from TaekUp! 🎂',
    dynamicTemplateId: DYNAMIC_TEMPLATES.BIRTHDAY_WISH,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
    }),
  },
  // Legacy aliases (keep for backwards compatibility)
  'trial-ending': {
    subject: 'Your TaekUp Trial is Ending Soon!',
    dynamicTemplateId: DYNAMIC_TEMPLATES.TRIAL_ENDING_SOON,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      daysLeft: 3,
      ctaUrl: 'https://mytaek.com/pricing',
    }),
  },
  'churn-risk': {
    subject: 'Need Help Getting Started? We\'re Here for You!',
    dynamicTemplateId: DYNAMIC_TEMPLATES.CHURN_RISK,
    getDynamicData: (club) => ({
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      ctaUrl: 'https://mytaek.com/wizard',
      helpUrl: 'https://mytaek.com/help',
      unsubscribeUrl: 'https://mytaek.com/email-preferences',
      privacyUrl: 'https://mytaek.com/privacy',
    }),
  },
  custom: {
    subject: 'Message from TaekUp',
    getHtml: (club) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p>Hi ${club.owner_name || 'there'},</p>
        <p>{{CUSTOM_BODY}}</p>
        <p>Best regards,<br>The TaekUp Team</p>
      </div>
    `,
  },
};

// Send Email with SendGrid - supports both dynamic templates and HTML fallback
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

    // Send email via SendGrid if configured
    const sendgrid = await getSendGridClient();
    let emailSent = false;
    let emailError = null;
    let usedDynamicTemplate = false;
    
    if (sendgrid.configured && sendgrid.client) {
      try {
        // Check if template has a dynamic template ID
        if (emailTemplate.dynamicTemplateId && emailTemplate.getDynamicData) {
          // Use SendGrid dynamic template
          const dynamicData = emailTemplate.getDynamicData(club);
          const msg: any = {
            to: toEmail,
            from: {
              email: sendgrid.fromEmail || 'hello@mytaek.com',
              name: 'TaekUp'
            },
            templateId: emailTemplate.dynamicTemplateId,
            dynamicTemplateData: {
              ...dynamicData,
              unsubscribeUrl: 'https://mytaek.com/email-preferences',
              privacyUrl: 'https://mytaek.com/privacy',
              dashboardUrl: 'https://mytaek.com/dashboard',
              loginUrl: 'https://mytaek.com/login',
              upgradeUrl: 'https://mytaek.com/pricing',
              helpUrl: 'https://mytaek.com/help',
            },
          };

          if (customSubject) {
            msg.subject = customSubject;
          }

          await sendgrid.client.send(msg);
          console.log(`[SendGrid] Dynamic template email sent to ${toEmail}: ${template} (${emailTemplate.dynamicTemplateId})`);
          emailSent = true;
          usedDynamicTemplate = true;
        } else if (emailTemplate.getHtml) {
          // Fallback to HTML template
          let htmlContent = emailTemplate.getHtml(club);
          
          if (template === 'custom' && customBody) {
            htmlContent = htmlContent.replace('{{CUSTOM_BODY}}', customBody);
          }

          const msg = {
            to: toEmail,
            from: {
              email: sendgrid.fromEmail || 'hello@mytaek.com',
              name: 'TaekUp'
            },
            subject: subject,
            html: htmlContent,
          };

          await sendgrid.client.send(msg);
          console.log(`[SendGrid] HTML email sent to ${toEmail}: ${template}`);
          emailSent = true;
        } else {
          emailError = 'Template has no content defined';
        }
      } catch (sgError: any) {
        console.error('[SendGrid] Error:', sgError.response?.body || sgError.message);
        emailError = sgError.response?.body?.errors?.[0]?.message || sgError.message;
      }
    } else {
      console.log(`[Email Preview - SendGrid not configured]`);
      console.log(`To: ${toEmail}`);
      console.log(`Subject: ${subject}`);
      console.log(`Template: ${template}`);
      console.log(`Dynamic Template ID: ${emailTemplate.dynamicTemplateId || 'N/A'}`);
      emailError = 'SendGrid not configured';
    }

    // Log activity
    await db.execute(sql`
      INSERT INTO activity_log (event_type, event_title, event_description, metadata, club_id, actor_email, actor_type)
      VALUES ('email_sent', ${`Email: ${template}`}, ${`Sent to ${toEmail}`}, ${JSON.stringify({ 
        template, 
        subject, 
        recipientEmail: toEmail, 
        sent: emailSent, 
        error: emailError,
        usedDynamicTemplate,
        dynamicTemplateId: emailTemplate.dynamicTemplateId || null
      })}::jsonb, ${clubId}::uuid, 'super_admin', 'super_admin')
    `);

    if (emailSent) {
      res.json({ 
        success: true, 
        message: `Email sent to ${toEmail}`,
        recipient: toEmail,
        template,
        subject,
        club: club.name,
        usedDynamicTemplate
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

// ============= NEW ANALYTICS & AUTOMATION ENDPOINTS =============

// Cohort Analytics - signup month retention, LTV by cohort
router.get('/cohorts', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    // Get monthly cohorts with retention data
    const cohorts = await db.execute(sql`
      WITH monthly_cohorts AS (
        SELECT 
          TO_CHAR(created_at, 'YYYY-MM') as cohort_month,
          COUNT(*) as total_signups,
          COUNT(*) FILTER (WHERE trial_status = 'converted') as converted,
          COUNT(*) FILTER (WHERE trial_status = 'expired') as churned,
          COUNT(*) FILTER (WHERE trial_status = 'active') as still_trial
        FROM clubs
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY cohort_month DESC
      )
      SELECT 
        cohort_month,
        total_signups,
        converted,
        churned,
        still_trial,
        CASE WHEN total_signups > 0 
          THEN ROUND((converted::numeric / total_signups) * 100, 1) 
          ELSE 0 
        END as conversion_rate,
        CASE WHEN (total_signups - still_trial) > 0 
          THEN ROUND((churned::numeric / (total_signups - still_trial)) * 100, 1) 
          ELSE 0 
        END as churn_rate
      FROM monthly_cohorts
    `);

    // Get LTV by cohort (estimated from subscription data)
    const ltvByCohort = await db.execute(sql`
      SELECT 
        TO_CHAR(c.created_at, 'YYYY-MM') as cohort_month,
        COALESCE(SUM(p.amount), 0) / 100 as total_revenue,
        COUNT(DISTINCT c.id) as club_count,
        CASE WHEN COUNT(DISTINCT c.id) > 0 
          THEN ROUND(COALESCE(SUM(p.amount), 0)::numeric / 100 / COUNT(DISTINCT c.id), 2)
          ELSE 0
        END as avg_ltv
      FROM clubs c
      LEFT JOIN payments p ON p.club_id = c.id AND p.status = 'paid'
      WHERE c.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(c.created_at, 'YYYY-MM')
      ORDER BY cohort_month DESC
    `);

    res.json({ cohorts, ltvByCohort });
  } catch (error: any) {
    console.error('Cohort analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch cohort analytics' });
  }
});

// Onboarding Progress - track wizard completion funnel
router.get('/onboarding', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    // Get funnel data
    const funnel = await db.execute(sql`
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
    `);

    // Get clubs stuck at each step
    const stuckClubs = await db.execute(sql`
      SELECT 
        op.last_active_step,
        COUNT(*) as count,
        c.name as example_club,
        c.owner_email as example_email
      FROM onboarding_progress op
      JOIN clubs c ON c.id = op.club_id
      WHERE op.wizard_completed = false
      GROUP BY op.last_active_step, c.name, c.owner_email
      ORDER BY op.last_active_step
    `);

    // Get recent incomplete onboardings
    const incomplete = await db.execute(sql`
      SELECT 
        c.id,
        c.name,
        c.owner_email,
        c.created_at,
        op.last_active_step,
        op.step1_club_info,
        op.step2_belt_system,
        op.step3_skills,
        op.step4_scoring,
        op.step5_people,
        op.step6_branding
      FROM onboarding_progress op
      JOIN clubs c ON c.id = op.club_id
      WHERE op.wizard_completed = false
      ORDER BY c.created_at DESC
      LIMIT 20
    `);

    res.json({ 
      funnel: (funnel as any[])[0] || {},
      stuckClubs,
      incomplete
    });
  } catch (error: any) {
    console.error('Onboarding analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding analytics' });
  }
});

// Update onboarding progress (called from wizard)
router.post('/onboarding/update', async (req: Request, res: Response) => {
  try {
    const { clubId, step, completed, timeSpent } = req.body;
    
    const stepColumn = `step${step}_${['club_info', 'belt_system', 'skills', 'scoring', 'people', 'branding'][step - 1]}`;
    const stepCompletedColumn = `step${step}_completed_at`;
    
    await db.execute(sql`
      INSERT INTO onboarding_progress (club_id, last_active_step)
      VALUES (${clubId}::uuid, ${step})
      ON CONFLICT (club_id) DO UPDATE SET
        last_active_step = ${step},
        total_time_spent_seconds = onboarding_progress.total_time_spent_seconds + ${timeSpent || 0},
        updated_at = NOW()
    `);

    if (completed) {
      await db.execute(sql`
        UPDATE onboarding_progress 
        SET ${sql.raw(stepColumn)} = true, 
            ${sql.raw(stepCompletedColumn)} = NOW()
        WHERE club_id = ${clubId}::uuid
      `);
    }

    // Check if wizard is complete
    if (step === 6 && completed) {
      await db.execute(sql`
        UPDATE onboarding_progress 
        SET wizard_completed = true, wizard_completed_at = NOW()
        WHERE club_id = ${clubId}::uuid
      `);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update onboarding error:', error);
    res.status(500).json({ error: 'Failed to update onboarding progress' });
  }
});

// Churn Reasons - get churn analytics
router.get('/churn-reasons', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    // Get churn reasons breakdown
    const breakdown = await db.execute(sql`
      SELECT 
        category,
        COUNT(*) as count,
        ROUND(AVG(rating), 1) as avg_rating,
        COUNT(*) FILTER (WHERE would_recommend = true) as would_recommend
      FROM churn_reasons
      GROUP BY category
      ORDER BY count DESC
    `);

    // Get recent churn feedback
    const recent = await db.execute(sql`
      SELECT 
        cr.*,
        c.name as club_name,
        c.owner_email
      FROM churn_reasons cr
      LEFT JOIN clubs c ON c.id = cr.club_id
      ORDER BY cr.created_at DESC
      LIMIT 20
    `);

    // Get churn trend
    const trend = await db.execute(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as churn_count
      FROM churn_reasons
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

    res.json({ breakdown, recent, trend });
  } catch (error: any) {
    console.error('Churn reasons error:', error);
    res.status(500).json({ error: 'Failed to fetch churn reasons' });
  }
});

// Submit churn reason (called when subscription is cancelled)
router.post('/churn-reasons', async (req: Request, res: Response) => {
  try {
    const { clubId, subscriptionId, category, additionalFeedback, wouldRecommend, rating } = req.body;

    await db.execute(sql`
      INSERT INTO churn_reasons (club_id, subscription_id, category, additional_feedback, would_recommend, rating)
      VALUES (${clubId}::uuid, ${subscriptionId}::uuid, ${category}, ${additionalFeedback}, ${wouldRecommend}, ${rating})
    `);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Submit churn reason error:', error);
    res.status(500).json({ error: 'Failed to submit churn reason' });
  }
});

// Payment Recovery Dashboard
router.get('/payment-recovery', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    // Get failed payments from failed_payments table
    const failedPayments = await db.execute(sql`
      SELECT 
        fp.*,
        c.name as club_name,
        c.owner_email
      FROM failed_payments fp
      LEFT JOIN clubs c ON c.id = fp.club_id
      ORDER BY fp.failed_at DESC
      LIMIT 50
    `);

    // Get recovery stats
    const stats = await db.execute(sql`
      SELECT 
        COUNT(*) as total_failed,
        COUNT(*) FILTER (WHERE recovered_at IS NOT NULL) as recovered,
        COALESCE(SUM(amount) FILTER (WHERE recovered_at IS NULL), 0) as outstanding_amount,
        COALESCE(SUM(amount) FILTER (WHERE recovered_at IS NOT NULL), 0) as recovered_amount,
        ROUND(COUNT(*) FILTER (WHERE recovered_at IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0), 1) as recovery_rate
      FROM failed_payments
    `);

    res.json({ 
      failedPayments, 
      stats: (stats as any[])[0] || {}
    });
  } catch (error: any) {
    console.error('Payment recovery error:', error);
    res.status(500).json({ error: 'Failed to fetch payment recovery data' });
  }
});

// MRR Goals
router.get('/mrr-goals', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const goals = await db.execute(sql`
      SELECT * FROM mrr_goals
      ORDER BY month DESC
      LIMIT 12
    `);

    // Get actual MRR for each month
    const actualMrr = await db.execute(sql`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(monthly_amount) / 100 as mrr
      FROM subscriptions
      WHERE status = 'active'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);

    // Current MRR
    const currentMrr = await db.execute(sql`
      SELECT COALESCE(SUM(monthly_amount), 0) / 100 as mrr
      FROM subscriptions
      WHERE status = 'active'
    `);

    res.json({ 
      goals, 
      actualMrr,
      currentMrr: (currentMrr as any[])[0]?.mrr || 0
    });
  } catch (error: any) {
    console.error('MRR goals error:', error);
    res.status(500).json({ error: 'Failed to fetch MRR goals' });
  }
});

// Create/Update MRR Goal
router.post('/mrr-goals', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { month, targetMrr, notes } = req.body;

    await db.execute(sql`
      INSERT INTO mrr_goals (month, target_mrr, notes, created_by)
      VALUES (${month}, ${targetMrr * 100}, ${notes}, 'super_admin')
      ON CONFLICT (month) DO UPDATE SET
        target_mrr = ${targetMrr * 100},
        notes = ${notes},
        updated_at = NOW()
    `);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Create MRR goal error:', error);
    res.status(500).json({ error: 'Failed to create MRR goal' });
  }
});

// Automation Rules
router.get('/automations', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const rules = await db.execute(sql`
      SELECT * FROM automation_rules
      ORDER BY created_at DESC
    `);

    // Recent executions
    const executions = await db.execute(sql`
      SELECT 
        ae.*,
        ar.name as rule_name,
        c.name as club_name
      FROM automation_executions ae
      JOIN automation_rules ar ON ar.id = ae.rule_id
      LEFT JOIN clubs c ON c.id = ae.club_id
      ORDER BY ae.executed_at DESC
      LIMIT 50
    `);

    res.json({ rules, executions });
  } catch (error: any) {
    console.error('Automations error:', error);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

// Toggle automation rule
router.patch('/automations/:id', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, slackEnabled, emailEnabled } = req.body;
    
    console.log('[SuperAdmin] Updating automation:', id, { isActive, slackEnabled, emailEnabled });

    // Update each field individually if provided
    if (typeof isActive === 'boolean') {
      await db.execute(sql`
        UPDATE automation_rules
        SET is_active = ${isActive}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);
    }
    
    if (typeof slackEnabled === 'boolean') {
      await db.execute(sql`
        UPDATE automation_rules
        SET slack_enabled = ${slackEnabled}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);
    }
    
    if (typeof emailEnabled === 'boolean') {
      await db.execute(sql`
        UPDATE automation_rules
        SET email_enabled = ${emailEnabled}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update automation error:', error);
    res.status(500).json({ error: 'Failed to update automation' });
  }
});

// =====================================================
// DAILY TRAINING (GAUNTLET) MANAGEMENT
// =====================================================

// Get all gauntlet challenges
router.get('/gauntlet-challenges', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    console.log('[SuperAdmin] Fetching gauntlet challenges...');
    const challenges = await db.execute(sql`
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
    
    console.log('[SuperAdmin] Found', (challenges as any[]).length, 'challenges');
    res.json({ challenges });
  } catch (error: any) {
    console.error('[SuperAdmin] Gauntlet challenges error:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// Update a gauntlet challenge
router.patch('/gauntlet-challenges/:id', verifySuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon, demo_video_url, is_active } = req.body;
    
    console.log('[SuperAdmin] Updating gauntlet challenge:', id, { name, description, icon, demo_video_url, is_active });
    
    // Build SQL update fragments using sql template
    const setClauses: ReturnType<typeof sql>[] = [];
    
    if (name !== undefined) {
      setClauses.push(sql`name = ${name}`);
    }
    if (description !== undefined) {
      setClauses.push(sql`description = ${description}`);
    }
    if (icon !== undefined) {
      setClauses.push(sql`icon = ${icon}`);
    }
    if (demo_video_url !== undefined) {
      setClauses.push(sql`demo_video_url = ${demo_video_url || null}`);
    }
    if (is_active !== undefined) {
      setClauses.push(sql`is_active = ${is_active}`);
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // Join SET clauses with commas using sql.join
    const setClause = sql.join(setClauses, sql`, `);
    
    await db.execute(sql`UPDATE gauntlet_challenges SET ${setClause} WHERE id = ${id}::uuid`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[SuperAdmin] Update gauntlet challenge error:', error);
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

export { router as superAdminRouter, verifySuperAdmin };
