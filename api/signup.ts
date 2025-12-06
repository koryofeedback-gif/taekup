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

  const { clubName, email, password, country } = req.body;

  if (!clubName || !email || !password) {
    return res.status(400).json({ error: 'Club name, email, and password are required' });
  }

  const client = await pool.connect();
  
  try {
    const existingClub = await client.query(
      'SELECT id FROM clubs WHERE owner_email = $1',
      [email]
    );

    if (existingClub.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    const clubResult = await client.query(
      `INSERT INTO clubs (name, owner_email, country, trial_start, trial_end, trial_status, status, created_at)
       VALUES ($1, $2, $3, NOW(), $4, 'active', 'active', NOW())
       RETURNING id, name, owner_email, trial_start, trial_end`,
      [clubName, email, country || 'United States', trialEnd]
    );

    const club = clubResult.rows[0];

    await client.query(
      `INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
       VALUES ($1, $2, 'owner', $3, true, NOW())
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, club_id = $3`,
      [email, passwordHash, club.id]
    );

    await client.query(
      `INSERT INTO activity_log (event_type, description, metadata, created_at)
       VALUES ('club_signup', $1, $2, NOW())`,
      [
        `New club signup: ${clubName}`,
        JSON.stringify({ clubId: club.id, email, country })
      ]
    );

    console.log('[Signup] New club created:', club.id, clubName);

    return res.status(201).json({
      success: true,
      club: {
        id: club.id,
        name: club.name,
        email: club.owner_email,
        trialStart: club.trial_start,
        trialEnd: club.trial_end
      }
    });

  } catch (error: any) {
    console.error('[Signup] Error:', error.message);
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  } finally {
    client.release();
  }
}
