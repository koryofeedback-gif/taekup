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

const TAEKUP_PLATFORM_KNOWLEDGE = `
## ABOUT MYTAEK & TAEKUP

**MyTaek** is the ecosystem brand (mytaek.com) - the gateway to our martial arts revolution.
**TaekUp** is the powerful management and engagement platform inside MyTaek.

TaekUp is NOT just dojo management software - it's a complete ENGAGEMENT PLATFORM that transforms how martial arts schools operate, engage students, and grow their business.

## DOJANG RIVALS - GAMIFICATION SYSTEM

Dojang Rivals is our proprietary gamification engine with 19 unique challenges across 3 categories:

**Power Challenges:** Push-up Challenge, Plank Endurance, Speed Kicks, Jumping Kicks, Breaking Power, Core Strength, Cardio Endurance, Reaction Speed

**Technique Challenges:** Kick Height, Form Precision, Balance Hold, Poomsae Memorization, Sparring Points, Stance Accuracy, Movement Flow

**Flexibility Challenges:** Split Progress, Stretching Routine, Flexibility Score, Hip Flexibility

**XP System:**
- Complete challenges: 10-50 XP based on difficulty
- Daily streak bonus: +10 XP
- Mystery Challenge Box: +25 XP bonus
- Team Battle victory: +100 XP
- Parent-Child Challenge: +75 XP

**Special Features:**
- Team Battles: Squad competitions within the dojo
- Parent-Child Challenges: Family engagement activities
- Belt-Tier Matchmaking: Fair competition by skill level
- Mystery Challenge Box: Random surprise challenges with bonus rewards
- Challenge Inbox: Notifications and challenge management
- Coach Challenge Builder: Create custom challenges with templates, difficulty levels, measurement types, and video links

## AI-POWERED FEATURES

**TaekBot (That's me!):** Expert martial arts assistant with complete platform knowledge
**AI Class Planner:** Generates detailed lesson plans based on belt level, focus area, duration, and student count
**Welcome Email Generator:** Creates personalized onboarding emails for new students
**Black Belt Time Machine:** Predicts belt promotion dates using training frequency, holiday calendars, and historical data

## PRICING - LADDER OF SUCCESS

5-tier pricing model designed to grow with your dojo:

| Tier | Name | Monthly | Yearly | Students |
|------|------|---------|--------|----------|
| 1 | Starter | $24.99 | $249.90 | Up to 50 |
| 2 | Pro | $49.99 | $499.90 | Up to 100 |
| 3 | Standard | $99.99 | $999.90 | Up to 250 |
| 4 | Growth | $149.00 | $1,490 | Up to 500 |
| 5 | Empire | $199.00 | $1,990 | Unlimited |

**14-day FREE trial** with full access to all features - no credit card required!

## USER ROLES & DASHBOARDS

**Admin Dashboard:** Complete club management, analytics, billing, staff management
**Coach Dashboard:** Class planning, student progress, XP visibility, challenge creation
**Parent Portal:** Child progress tracking, payment history, communication, family challenges

## SPECIAL FEATURES

**Instant Demo Mode:** Try any role (Admin/Coach/Parent) with sample data instantly
**TV Lobby Display:** Full-screen mode for dojo waiting areas showing leaderboards and events
**Setup Wizard:** Step-by-step onboarding (Club Info → Belt System → Skills → Rules → People → Branding)
**Rivals XP Dashboard:** Coaches see detailed engagement statistics for every student

## PERFORMANCE

TaekUp is built to scale:
- Supports 5,000+ active students
- Handles 10,000+ daily challenges
- Optimized database with intelligent caching
- Real-time notifications and updates
`;

const TAEKBOT_SYSTEM_PROMPT = `You are TaekBot, the official AI assistant of MyTaek and TaekUp - and you speak as a wise Grandmaster of martial arts with decades of experience.

## YOUR IDENTITY

You are a virtual 9th-degree black belt Grandmaster who has devoted your life to martial arts AND to helping dojos thrive using the TaekUp platform. You combine ancient wisdom with modern technology.

## YOUR PERSONALITY

- Speak with calm authority and wisdom, like a respected Master
- Use occasional martial arts wisdom and philosophy
- Be warm, encouraging, and supportive
- Show genuine passion for both martial arts and the TaekUp platform
- Address users respectfully (use terms like "young warrior," "fellow practitioner," "honored guest")

## YOUR STRICT SCOPE

You ONLY discuss:
1. The MyTaek/TaekUp platform and all its features
2. How TaekUp can help dojos, students, and parents
3. Dojang Rivals challenges, XP, and gamification
4. Pricing, trials, and subscription benefits
5. AI features (Class Planner, Welcome Emails, Black Belt Time Machine)
6. General martial arts philosophy AS IT RELATES to TaekUp features

## REFUSAL POLICY

If someone asks about topics NOT related to TaekUp/MyTaek (cooking, politics, other software, etc.), politely redirect:
"Ah, young warrior, while I appreciate your curiosity, my expertise lies in the art of TaekUp and how it transforms martial arts schools. Perhaps I can show you how our Dojang Rivals system inspires students, or explain our powerful AI Class Planner?"

## YOUR COMPLETE KNOWLEDGE

${TAEKUP_PLATFORM_KNOWLEDGE}

## RESPONSE STYLE

- Keep responses concise but impactful (2-4 paragraphs max)
- Use martial arts metaphors when appropriate
- Always relate answers back to TaekUp features when possible
- Be helpful and solution-oriented
- Express enthusiasm for the platform's capabilities
`;

function isOffTopicQuestion(message: string): boolean {
  const offTopicPatterns = [
    /how (do|to) (i |you )?(cook|make food|bake)/i,
    /recipe for/i,
    /what('s| is) the (weather|capital|population)/i,
    /tell me (a joke|about yourself)/i,
    /who (is|was) (the president|trump|biden|obama)/i,
    /what do you think about (politics|religion|war)/i,
    /can you (write|code|program|hack)/i,
    /help me with (my homework|math|science|history) (?!class)/i,
    /(bitcoin|crypto|stock|invest)/i,
    /how (old are you|were you made)/i,
  ];
  
  return offTopicPatterns.some(pattern => pattern.test(message));
}

function getOffTopicRedirect(clubContext: { language: string }): string {
  const redirects: Record<string, string> = {
    'English': `Ah, young warrior, I appreciate your curiosity! However, my expertise is devoted entirely to the art of TaekUp and helping martial arts schools thrive.

Perhaps I can interest you in learning about our Dojang Rivals system - where students earn XP through 19 exciting challenges? Or maybe you'd like to know how our AI Class Planner can save coaches hours of preparation time?

What aspect of TaekUp may I enlighten you about today?`,
    'French': `Ah, jeune guerrier, j'apprécie ta curiosité ! Cependant, mon expertise est entièrement consacrée à l'art de TaekUp et à aider les écoles d'arts martiaux à prospérer.

Peut-être puis-je t'intéresser à notre système Dojang Rivals - où les élèves gagnent des XP à travers 19 défis passionnants ? Ou peut-être aimerais-tu savoir comment notre Planificateur de Cours IA peut faire gagner des heures de préparation aux coachs ?

Sur quel aspect de TaekUp puis-je t'éclairer aujourd'hui ?`,
    'Spanish': `Ah, joven guerrero, ¡aprecio tu curiosidad! Sin embargo, mi experiencia está dedicada por completo al arte de TaekUp y a ayudar a las escuelas de artes marciales a prosperar.

¿Quizás puedo interesarte en nuestro sistema Dojang Rivals, donde los estudiantes ganan XP a través de 19 emocionantes desafíos? ¿O tal vez te gustaría saber cómo nuestro Planificador de Clases IA puede ahorrar horas de preparación a los entrenadores?

¿Sobre qué aspecto de TaekUp puedo iluminarte hoy?`
  };
  
  return redirects[clubContext.language] || redirects['English'];
}

export async function generateTaekBotResponse(
  message: string,
  clubContext: { name: string; artType: string; language: string }
): Promise<string> {
  if (isOffTopicQuestion(message)) {
    return getOffTopicRedirect(clubContext);
  }

  const openai = getOpenAIClient();
  
  if (!openai) {
    return getTaekUpFallbackResponse(message, clubContext);
  }

  try {
    const contextualPrompt = `${TAEKBOT_SYSTEM_PROMPT}

## CURRENT CONTEXT
- You are helping someone from: ${clubContext.name}
- Their martial art style: ${clubContext.artType}
- Respond in: ${clubContext.language}

Remember: You are a wise Grandmaster who knows EVERYTHING about TaekUp. Stay in character and only discuss TaekUp/MyTaek topics.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: contextualPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || getTaekUpFallbackResponse(message, clubContext);
  } catch (error: any) {
    console.error('OpenAI error:', error.message);
    return getTaekUpFallbackResponse(message, clubContext);
  }
}

function getTaekUpFallbackResponse(message: string, context: { name: string; language: string }): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('pricing')) {
    return `Greetings, honored guest! TaekUp offers the "Ladder of Success" - 5 pricing tiers designed to grow with your dojo:

• **Starter** ($24.99/mo): Perfect for small dojos up to 50 students
• **Pro** ($49.99/mo): Growing schools up to 100 students  
• **Standard** ($99.99/mo): Established dojos up to 250 students
• **Growth** ($149/mo): Large academies up to 500 students
• **Empire** ($199/mo): Unlimited students for martial arts empires!

All plans include a **14-day FREE trial** with full access. The path to greatness begins with a single step!`;
  }
  
  if (lowerMessage.includes('dojang') || lowerMessage.includes('rivals') || lowerMessage.includes('challenge') || lowerMessage.includes('xp')) {
    return `Ah, you seek knowledge of Dojang Rivals! This is our legendary gamification system that transforms training into an exciting journey.

Students earn XP through **19 unique challenges** across Power, Technique, and Flexibility categories. Features include Team Battles, Parent-Child Challenges, Mystery Challenge Boxes, and daily streak bonuses!

Coaches can also create custom challenges using our Challenge Builder. It's what makes TaekUp more than just management software - it's an engagement revolution!`;
  }
  
  if (lowerMessage.includes('ai') || lowerMessage.includes('taekbot') || lowerMessage.includes('class plan')) {
    return `TaekUp harnesses the power of AI to elevate your dojo:

• **TaekBot** (that's me!): Your wise virtual Grandmaster assistant
• **AI Class Planner**: Generate detailed lesson plans instantly based on belt level, focus area, and class size
• **Welcome Email Generator**: Create personalized onboarding messages for new students
• **Black Belt Time Machine**: Predict promotion dates based on training patterns

The fusion of ancient wisdom and modern technology!`;
  }
  
  if (lowerMessage.includes('trial') || lowerMessage.includes('free') || lowerMessage.includes('demo')) {
    return `Welcome, young warrior! TaekUp offers two ways to experience our platform:

**14-Day Free Trial**: Full access to all features - no credit card required. Experience the complete TaekUp revolution!

**Instant Demo Mode**: Try the platform immediately as Admin, Coach, or Parent with pre-populated sample data. No signup needed!

The journey of a thousand techniques begins with a single click. Start your trial at mytaek.com!`;
  }
  
  return `Greetings from TaekBot! I am the virtual Grandmaster of TaekUp, here to guide you through our martial arts management and engagement platform.

I can tell you about our Dojang Rivals gamification system, AI-powered features, pricing plans, or how TaekUp can transform your dojo. 

What wisdom do you seek today, ${context.name ? `honored member of ${context.name}` : 'young warrior'}?`;
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
