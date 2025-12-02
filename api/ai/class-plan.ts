import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getClassPlanFallback(params: { beltLevel: string; focusArea: string; classDuration: number }): string {
  return `## ${params.beltLevel} Class Plan - ${params.focusArea} Focus

### Warm-up (10 min)
- Jogging and dynamic stretches
- Basic kicks and punches in place

### Main Training (${Math.floor(params.classDuration * 0.6)} min)
- ${params.focusArea} technique drills
- Partner exercises
- Form practice

### Cool-down (10 min)
- Static stretching
- Breathing exercises
- Meditation

*This is a template plan. Enable AI features for personalized class plans.*`;
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
    const { beltLevel, focusArea, classDuration, studentCount, language } = body;
    
    const openai = getOpenAIClient();
    
    if (!openai) {
      const plan = getClassPlanFallback({
        beltLevel: beltLevel || 'All Levels',
        focusArea: focusArea || 'General Training',
        classDuration: classDuration || 60
      });
      return res.json({ plan });
    }

    const prompt = `Create a detailed martial arts class plan:
- Belt Level: ${beltLevel || 'All Levels'}
- Focus Area: ${focusArea || 'General Training'}
- Duration: ${classDuration || 60} minutes
- Students: ${studentCount || 10}

Include:
1. Warm-up activities (5-10 min)
2. Technique drills (main focus)
3. Partner work or combinations
4. Cool-down and meditation

Format with clear sections and timing. Respond in ${language || 'English'}.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an experienced martial arts instructor creating detailed lesson plans.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const plan = completion.choices[0]?.message?.content || getClassPlanFallback({
      beltLevel: beltLevel || 'All Levels',
      focusArea: focusArea || 'General Training',
      classDuration: classDuration || 60
    });
    
    return res.json({ plan });
  } catch (error: any) {
    console.error('Class plan error:', error.message);
    return res.status(500).json({ error: 'Failed to generate class plan' });
  }
}
