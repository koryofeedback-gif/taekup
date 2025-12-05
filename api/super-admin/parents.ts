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
