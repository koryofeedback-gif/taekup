import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getFallbackResponse(message: string, clubName: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('belt') || lowerMessage.includes('rank')) {
    return `At ${clubName}, belt progression is based on consistent training, demonstrated skills, and character development. Speak with your instructor about specific requirements for your next promotion!`;
  }
  if (lowerMessage.includes('class') || lowerMessage.includes('schedule')) {
    return `Check with ${clubName} for the current class schedule. Most schools offer classes throughout the week for different age groups and skill levels.`;
  }
  if (lowerMessage.includes('practice') || lowerMessage.includes('home')) {
    return `Home practice is essential! Focus on basic stances, forms, and stretching. Even 15-20 minutes daily makes a big difference. Use our Home Dojo feature to track your progress!`;
  }
  
  return `Thank you for your question! For specific inquiries about ${clubName}, please contact your instructor directly. Is there anything else I can help you with?`;
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
    const { message, clubName, artType, language } = body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const openai = getOpenAIClient();
    
    if (!openai) {
      const response = getFallbackResponse(message, clubName || 'your dojo');
      return res.json({ response });
    }

    const systemPrompt = `You are TaekBot, an AI assistant for ${clubName || 'your dojo'}, a ${artType || 'martial arts'} academy. 
You help parents, students, and instructors with questions about martial arts training, class schedules, belt progression, and student development.
Be friendly, knowledgeable, and supportive. Keep responses concise but helpful.
Respond in ${language || 'English'}.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || getFallbackResponse(message, clubName || 'your dojo');
    return res.json({ response });
  } catch (error: any) {
    console.error('TaekBot error:', error.message);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}
