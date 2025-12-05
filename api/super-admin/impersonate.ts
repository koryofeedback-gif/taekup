import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';
import { getDb, verifySuperAdminToken, setCorsHeaders } from './_db';
import crypto from 'crypto';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
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
