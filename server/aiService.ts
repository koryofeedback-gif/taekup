import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!geminiClient && process.env.GOOGLE_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

export async function generateTaekBotResponse(
  message: string,
  clubContext: { name: string; artType: string; language: string }
): Promise<string> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    return getFallbackResponse(message, clubContext);
  }

  try {
    const systemPrompt = `You are TaekBot, an AI assistant for ${clubContext.name}, a ${clubContext.artType} academy. 
You help parents, students, and instructors with questions about martial arts training, class schedules, belt progression, and student development.
Be friendly, knowledgeable, and supportive. Keep responses concise but helpful.
Respond in ${clubContext.language}.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || getFallbackResponse(message, clubContext);
  } catch (error: any) {
    console.error('OpenAI error:', error.message);
    return getFallbackResponse(message, clubContext);
  }
}

export async function generateClassPlan(params: {
  beltLevel: string;
  focusArea: string;
  classDuration: number;
  studentCount: number;
  language: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    return getClassPlanFallback(params);
  }

  try {
    const prompt = `Create a detailed martial arts class plan:
- Belt Level: ${params.beltLevel}
- Focus Area: ${params.focusArea}
- Duration: ${params.classDuration} minutes
- Students: ${params.studentCount}

Include:
1. Warm-up activities (5-10 min)
2. Technique drills (main focus)
3. Partner work or combinations
4. Cool-down and meditation

Format with clear sections and timing. Respond in ${params.language}.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an experienced martial arts instructor creating detailed lesson plans.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || getClassPlanFallback(params);
  } catch (error: any) {
    console.error('OpenAI error:', error.message);
    return getClassPlanFallback(params);
  }
}

export async function generateWelcomeEmail(params: {
  clubName: string;
  studentName: string;
  parentName: string;
  artType: string;
  language: string;
}): Promise<string> {
  const gemini = getGeminiClient();
  
  if (!gemini) {
    return getWelcomeEmailFallback(params);
  }

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = `Write a warm welcome email for a new student joining a martial arts school:
- School: ${params.clubName}
- Student: ${params.studentName}
- Parent: ${params.parentName}
- Art Type: ${params.artType}

Make it friendly and encouraging. Include practical next steps. Write in ${params.language}.`;

    const result = await model.generateContent(prompt);
    return result.response.text() || getWelcomeEmailFallback(params);
  } catch (error: any) {
    console.error('Gemini error:', error.message);
    return getWelcomeEmailFallback(params);
  }
}

function getFallbackResponse(message: string, context: { name: string }): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('belt') || lowerMessage.includes('rank')) {
    return `At ${context.name}, belt progression is based on consistent training, demonstrated skills, and character development. Speak with your instructor about specific requirements for your next promotion!`;
  }
  if (lowerMessage.includes('class') || lowerMessage.includes('schedule')) {
    return `Check with ${context.name} for the current class schedule. Most schools offer classes throughout the week for different age groups and skill levels.`;
  }
  if (lowerMessage.includes('practice') || lowerMessage.includes('home')) {
    return `Home practice is essential! Focus on basic stances, forms, and stretching. Even 15-20 minutes daily makes a big difference. Use our Home Dojo feature to track your progress!`;
  }
  
  return `Thank you for your question! For specific inquiries about ${context.name}, please contact your instructor directly. Is there anything else I can help you with?`;
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
