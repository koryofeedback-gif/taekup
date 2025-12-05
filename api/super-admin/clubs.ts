import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';
import { getDb, verifySuperAdminToken, setCorsHeaders } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
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
