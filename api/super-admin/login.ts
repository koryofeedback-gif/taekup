import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from 'drizzle-orm';
import { getDb, setCorsHeaders } from './_db';
import crypto from 'crypto';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@mytaek.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

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
  
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = body?.email;
    const password = body?.password;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    console.log('[SA Login] Attempt from:', email);
    
    let isValid = false;
    let userEmail = email;
    
    if (email === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD && SUPER_ADMIN_PASSWORD) {
      isValid = true;
      userEmail = SUPER_ADMIN_EMAIL;
      console.log('[SA Login] Env password match');
    }
    
    if (!isValid) {
      console.log('[SA Login] Failed for:', email);
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
    
    console.log('[SA Login] SUCCESS for:', userEmail);
    
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
