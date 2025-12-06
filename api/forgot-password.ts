import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const client = await pool.connect();

  try {
    const userResult = await client.query(
      'SELECT id, email, name FROM users WHERE email = $1 AND is_active = true LIMIT 1',
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await client.query(
      `UPDATE users 
       SET reset_token = $1, reset_token_expires_at = $2
       WHERE id = $3`,
      [resetToken, expiresAt, user.id]
    );

    if (process.env.SENDGRID_API_KEY) {
      const resetUrl = `${process.env.VERCEL_URL || 'https://mytaek.com'}/reset-password?token=${resetToken}`;
      
      await sgMail.send({
        to: user.email,
        from: 'noreply@mytaek.com',
        subject: 'Reset Your TaekUp Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>Hi ${user.name || 'there'},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <p>Best,<br>The TaekUp Team</p>
          </div>
        `
      });

      console.log('[Password Reset] Email sent to:', email);
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
       VALUES ('password_reset_requested', 'Password Reset Requested', $1, $2, NOW())`,
      [
        'Password reset requested for ' + email,
        JSON.stringify({ email })
      ]
    );

    return res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    });

  } catch (error: any) {
    console.error('[Forgot Password] Error:', error.message);
    return res.status(500).json({ error: 'Failed to process password reset request' });
  } finally {
    client.release();
  }
}
