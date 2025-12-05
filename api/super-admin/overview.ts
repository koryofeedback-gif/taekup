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
