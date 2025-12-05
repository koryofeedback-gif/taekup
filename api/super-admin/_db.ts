import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { VercelRequest } from '@vercel/node';
import { sql } from 'drizzle-orm';

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }
    const client = postgres(process.env.DATABASE_URL);
    db = drizzle(client);
  }
  return db;
}

export async function verifySuperAdminToken(req: VercelRequest): Promise<{ valid: boolean; email?: string; error?: string }> {
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

export function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}
