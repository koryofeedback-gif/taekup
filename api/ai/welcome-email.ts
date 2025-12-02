import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!geminiClient && process.env.GOOGLE_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

function getWelcomeEmailFallback(params: { clubName: string; studentName: string; parentName: string }): string {
  return `Dear ${params.parentName},

Welcome to ${params.clubName}! We're thrilled to have ${params.studentName} join our martial arts family.

Here's what to expect:
1. Arrive 10 minutes before class
2. Wear comfortable workout clothes
3. Bring water and a positive attitude!

We look forward to seeing ${params.studentName} in class soon!

Best regards,
The ${params.clubName} Team`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { clubName, studentName, parentName, artType, language } = body;
    
    const gemini = getGeminiClient();
    
    if (!gemini) {
      const email = getWelcomeEmailFallback({
        clubName: clubName || 'Your Dojo',
        studentName: studentName || 'Student',
        parentName: parentName || 'Parent'
      });
      return res.json({ email });
    }

    const model = gemini.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = `Write a warm welcome email for a new student joining a martial arts school:
- School: ${clubName || 'Your Dojo'}
- Student: ${studentName || 'Student'}
- Parent: ${parentName || 'Parent'}
- Art Type: ${artType || 'martial arts'}

Make it friendly and encouraging. Include practical next steps. Write in ${language || 'English'}.`;

    const result = await model.generateContent(prompt);
    const email = result.response.text() || getWelcomeEmailFallback({
      clubName: clubName || 'Your Dojo',
      studentName: studentName || 'Student',
      parentName: parentName || 'Parent'
    });
    
    return res.json({ email });
  } catch (error: any) {
    console.error('Welcome email error:', error.message);
    return res.status(500).json({ error: 'Failed to generate welcome email' });
  }
}
