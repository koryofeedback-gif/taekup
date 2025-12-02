import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  
  // Check which env vars exist (don't expose values)
  const envCheck = {
    SANDBOX_STRIPE_KEY: !!process.env.SANDBOX_STRIPE_KEY,
    SANDBOX_STRIPE_PUBLISHABLE_KEY: !!process.env.SANDBOX_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: !!process.env.STRIPE_PUBLISHABLE_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
  };
  
  return res.status(200).json(envCheck);
}
