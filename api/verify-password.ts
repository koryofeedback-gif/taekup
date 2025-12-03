import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sitePassword = process.env.SITE_PASSWORD;
  
  if (!sitePassword) {
    return res.status(200).json({ valid: true });
  }

  const { password } = req.body || {};

  if (password === sitePassword) {
    return res.status(200).json({ valid: true });
  }

  return res.status(401).json({ valid: false, error: 'Incorrect password' });
}
