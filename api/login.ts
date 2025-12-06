import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const client = await pool.connect();

  try {
    const userResult = await client.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.name, u.club_id, u.is_active,
              c.name as club_name, c.owner_email, c.status as club_status, c.trial_status, c.trial_end
       FROM users u
       LEFT JOIN clubs c ON u.club_id = c.id
       WHERE LOWER(u.email) = $1 AND u.is_active = true
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Please set up your password first. Check your email for an invitation link.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('[Login] User authenticated:', user.email, 'Role:', user.role);

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('user_login', 'User Login', $1, $2, $3, NOW())`,
      [
        'User logged in: ' + user.email,
        user.club_id,
        JSON.stringify({ email: user.email, role: user.role })
      ]
    );

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.club_name,
        role: user.role,
        clubId: user.club_id,
        clubName: user.club_name,
        clubStatus: user.club_status,
        trialStatus: user.trial_status,
        trialEnd: user.trial_end
      }
    });

  } catch (error: any) {
    console.error('[Login] Error:', error.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  } finally {
    client.release();
  }
}
