import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySuperAdminToken, setCorsHeaders } from './_db';

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
  
  return res.json({ 
    valid: true, 
    email: auth.email 
  });
}
