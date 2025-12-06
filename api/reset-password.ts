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

  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await pool.connect();

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const updateResult = await client.query(
      `UPDATE users 
       SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
       WHERE reset_token = $2 
       AND reset_token_expires_at > NOW()
       AND is_active = true
       RETURNING id, email, name`,
      [passwordHash, token]
    );

    const user = updateResult.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
       VALUES ('password_reset_completed', 'Password Reset Completed', $1, $2, NOW())`,
      [
        'Password reset completed for ' + user.email,
        JSON.stringify({ email: user.email })
      ]
    );

    console.log('[Password Reset] Password updated for:', user.email);

    return res.json({ success: true, message: 'Password has been reset successfully' });

  } catch (error: any) {
    console.error('[Reset Password] Error:', error.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  } finally {
    client.release();
  }
}
