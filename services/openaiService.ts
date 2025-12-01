import type { Message } from '../types';
import { OpenAI } from 'openai';

let openaiInstance: OpenAI | null = null;

const getOpenAIInstance = () => {
  if (openaiInstance) return openaiInstance;
  
  const apiKey = (import.meta.env as any).VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn("VITE_OPENAI_API_KEY is not available. OpenAI features will be disabled.");
    return null;
  }
  
  try {
    openaiInstance = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    return openaiInstance;
  } catch (e) {
    console.error("Failed to initialize OpenAI:", e);
    return null;
  }
};

export const getTaekBotResponseGPT = async (query: string, history: Message[]): Promise<string> => {
  const fallback = "I'm sorry, I'm having a little trouble connecting right now. Please try again in a moment.";
  
  try {
    const client = getOpenAIInstance();
    if (!client) return fallback;

    const systemPrompt = `You are TaekBot, the AI assistant for MyTaek and TaekUp. 
    
YOUR IDENTITY:
- You represent the "MyTaek Ecosystem": TaekUp (Management), TaekFunDo (Kids Pedagogy), and TikTaek (Performance).
- Your tone is Professional, Encouraging, and knowledgeable about Martial Arts Business.

KEY SELLING POINTS (Use these to answer questions):
1. **The Profit Engine**: TaekUp is the only software that PAYS clubs. We share 70% of parent subscription revenue with the club owner. It turns software from an expense into a profit center.
2. **Pedagogy First**: We aren't just billing software. We have AI Lesson Planners, Curriculum Video tools, and Student Growth Analytics.
3. **The Ecosystem**: We handle everything from the "Dojo Floor" (Teaching) to the "Front Desk" (Business).

PRICING (If asked):
- **Starter:** $24.99/mo (Up to 25 students).
- **Standard:** $59.00/mo (Up to 75 students).
- **Growth:** $129.00/mo (Up to 150 students).
- **Empire:** $199.00/mo (Unlimited).
- *Remind them:* The Revenue Share feature usually covers this cost entirely.

Be concise and helpful. If you don't know something, suggest they start the 14-Day Free Trial to see for themselves.`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      { role: 'user', content: query }
    ];

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0]?.message?.content || fallback;
  } catch (error) {
    console.error("Error getting GPT TaekBot response:", error);
    return fallback;
  }
};

export const sendWelcomeEmailGPT = async (clubName: string): Promise<string> => {
  const fallback = `Welcome to TaekUp, Master ${clubName}! We're excited to have you. Your journey starts here.`;
  
  try {
    const client = getOpenAIInstance();
    if (!client) return fallback;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Generate a welcome email for a new user who just signed up for a Martial Arts club management app called "TaekUp". The club name is "${clubName}". The tone should be welcoming, exciting, and professional. The sender is "The TaekUp Team". Address them as "Master ${clubName}". The email body should be concise and start with "Your journey starts here."`
        }
      ],
      temperature: 0.8,
      max_tokens: 300
    });

    const emailText = response.choices[0]?.message?.content || fallback;
    
    console.log("--- WELCOME EMAIL (GPT-4o) ---");
    console.log(`To: new_user@example.com`);
    console.log(`Subject: Welcome to TaekUp, Master ${clubName}!`);
    console.log("Body:", emailText);
    console.log("-------------------------------");
    
    return emailText;
  } catch (error) {
    console.error("Error generating welcome email with GPT:", error);
    return fallback;
  }
};

export const generateSloganGPT = async (clubName: string): Promise<string> => {
  const fallback = "Discipline. Focus. Spirit.";
  
  try {
    const client = getOpenAIInstance();
    if (!client) return fallback;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Generate a short, inspiring slogan for a Martial Arts club named "${clubName}". The slogan should be 3-5 words long and focus on themes like discipline, focus, spirit, strength, or community. Provide only the slogan text, without quotation marks. Example: "Discipline. Focus. Spirit."`
        }
      ],
      temperature: 0.8,
      max_tokens: 50
    });

    return (response.choices[0]?.message?.content || fallback).trim();
  } catch (error) {
    console.error("Error generating slogan with GPT:", error);
    return fallback;
  }
};

export const sendCoachWelcomeEmailGPT = async (coachName: string, clubName: string): Promise<void> => {
  try {
    const client = getOpenAIInstance();
    if (!client) {
      console.log(`Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`);
      return;
    }

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Generate a brief, professional welcome message for a new coach named "${coachName}" joining a Martial Arts club called "${clubName}" on the TaekUp platform. Keep it concise (2-3 sentences). Sign it as "The TaekUp Team".`
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    });

    const message = response.choices[0]?.message?.content || `Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`;
    console.log(message);
  } catch (error) {
    console.error("Error sending coach welcome email with GPT:", error);
    console.log(`Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`);
  }
};
