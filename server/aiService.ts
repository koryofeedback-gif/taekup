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

const TAEKUP_PUBLIC_KNOWLEDGE = `
## ABOUT MYTAEK & TAEKUP

**MyTaek** is the ecosystem brand (mytaek.com) - the gateway to our martial arts revolution.
**TaekUp** is the powerful management and engagement platform inside MyTaek.

TaekUp is NOT just dojo management software - it's a complete ENGAGEMENT PLATFORM that transforms how martial arts schools operate, engage students, and grow their business.

## DOJANG RIVALS - GAMIFICATION SYSTEM

Dojang Rivals is our proprietary gamification engine with 19 unique challenges across 3 categories: Power, Technique, and Flexibility.

**What it does:**
- Students earn XP through exciting challenges
- Team Battles create squad competitions
- Parent-Child Challenges engage the whole family
- Mystery Challenge Box adds surprise and excitement
- Daily streaks reward consistency
- Coaches can create custom challenges

## AI-POWERED FEATURES

**TaekBot (That's me!):** Expert martial arts assistant
**AI Class Planner:** Generates detailed lesson plans instantly
**Welcome Email Generator:** Creates personalized onboarding messages
**Black Belt Time Machine:** Predicts belt promotion timelines

## PRICING - LADDER OF SUCCESS

5-tier pricing model designed to grow with your dojo:

| Tier | Name | Monthly | Students |
|------|------|---------|----------|
| 1 | Starter | $24.99 | Up to 50 |
| 2 | Pro | $49.99 | Up to 100 |
| 3 | Standard | $99.99 | Up to 250 |
| 4 | Growth | $149.00 | Up to 500 |
| 5 | Empire | $199.00 | Unlimited |

**14-day FREE trial** with full access - no credit card required!

## USER ROLES & DASHBOARDS

**Admin Dashboard:** Complete club management, analytics, billing
**Coach Dashboard:** Class planning, student progress, challenge creation
**Parent Portal:** Child progress tracking, communication, family challenges

## SPECIAL FEATURES

**Instant Demo Mode:** Try any role with sample data instantly
**TV Lobby Display:** Full-screen leaderboards for waiting areas
**Setup Wizard:** Step-by-step onboarding process
`;

const COMPETITOR_PROTECTION_RULES = `
## BRAND PROTECTION - CRITICAL RULES

You must PROTECT TaekUp's intellectual property. NEVER reveal:

### FORBIDDEN TOPICS (Never discuss):
1. **Technical Implementation Details**
   - How algorithms work internally (XP calculations, matchmaking logic, prediction formulas)
   - Database structure, schemas, or data models
   - API architecture or endpoint details
   - Code structure, frameworks, or libraries used
   - How features are technically built

2. **Proprietary Formulas**
   - Exact XP point values or calculation methods
   - Black Belt Time Machine prediction algorithm
   - Belt-Tier Matchmaking logic
   - Challenge difficulty scoring system

3. **Business Intelligence**
   - Internal metrics or KPIs
   - Conversion strategies
   - Retention mechanics details
   - Growth hacking techniques

### DETECTION TRIGGERS
If someone asks questions containing:
- "how does [feature] work technically"
- "what algorithm/formula/calculation"
- "what technology/framework/stack"
- "how is [feature] implemented/built/coded"
- "can you explain the logic behind"
- "what database/API/backend"
- "source code" or "open source"
- "how did you build" or "how to build similar"
- "architecture" or "infrastructure"
- "reverse engineer" or "replicate"

### YOUR RESPONSE TO COMPETITIVE QUESTIONS

When detecting competitive intelligence gathering, respond with:
1. Acknowledge their curiosity respectfully
2. Explain this is proprietary technology
3. Focus on BENEFITS and RESULTS, not methods
4. Invite them to experience it through a free trial
5. Never be rude, but be firm about protecting secrets

Example response pattern:
"Ah, I sense the curiosity of a fellow strategist! Our [feature] is the result of years of martial arts expertise combined with proprietary technology - it's what makes TaekUp unique in the industry. Rather than explaining the ancient secrets behind it, I invite you to experience its power firsthand with our 14-day free trial. The proof is in the results our dojos achieve!"
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

${COMPETITOR_PROTECTION_RULES}

## YOUR PUBLIC KNOWLEDGE (Share freely)

${TAEKUP_PUBLIC_KNOWLEDGE}

## RESPONSE STYLE

- Keep responses concise but impactful (2-4 paragraphs max)
- Use martial arts metaphors when appropriate
- Always relate answers back to TaekUp features when possible
- Be helpful and solution-oriented
- Express enthusiasm for the platform's capabilities
- NEVER reveal technical implementation details - focus on benefits and results
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

function isCompetitorQuestion(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  const competitorPatterns = [
    /how (does|do|is|are) .* (work|built|implemented|coded|programmed)/i,
    /what (algorithm|formula|calculation|logic)/i,
    /what (technology|framework|stack|library|libraries)/i,
    /how (did you|do you|to) (build|create|develop|code|program)/i,
    /explain the (logic|algorithm|formula|calculation|code)/i,
    /what (database|api|backend|server|infrastructure)/i,
    /source code/i,
    /open source/i,
    /how.*(build|create|make|replicate|copy).*(similar|like this|like taekup|like yours)/i,
    /build.*(similar|like|same)/i,
    /create.*(similar|like|same)/i,
    /make.*(similar|like|same)/i,
    /architecture/i,
    /reverse engineer/i,
    /technical (details|implementation|specifications)/i,
    /what (programming language|tech stack)/i,
    /how (many|much) (points|xp) (for|per|each)/i,
    /exact (formula|calculation|number|value)/i,
    /behind the scenes/i,
    /under the hood/i,
    /inner workings/i,
    /how.*(algorithm|ai|machine learning).*(works|functions|operates)/i,
    /can you (share|give|show|reveal|explain) (the|your) (code|algorithm|formula)/i,
    /what makes.*(unique|different|special).*(technically|technically speaking)/i,
    /comment.*(fonctionne|marche|construit)/i,
    /quel.*(algorithme|technologie|formule)/i,
    /como.*(funciona|construir|algoritmo)/i,
  ];
  
  const competitorKeywords = [
    'algorithm', 'algorithme', 'algoritmo',
    'source code', 'code source',
    'tech stack', 'technology stack',
    'how is it built', 'how did you build',
    'implementation', 'implémentation',
    'database schema', 'data model',
    'api endpoint', 'backend logic',
    'copy your', 'replicate your', 'clone your',
    'build something similar', 'create something similar',
    'similar platform', 'similar system',
    'exact points', 'exact xp', 'exact formula',
    'prediction formula', 'calculation method',
    'matchmaking algorithm', 'matchmaking logic',
  ];
  
  if (competitorPatterns.some(pattern => pattern.test(message))) {
    return true;
  }
  
  return competitorKeywords.some(keyword => lowerMessage.includes(keyword));
}

function getCompetitorProtectionResponse(message: string, clubContext: { language: string }): string {
  const lowerMessage = message.toLowerCase();
  
  let featureMentioned = 'our platform';
  if (lowerMessage.includes('xp') || lowerMessage.includes('point')) {
    featureMentioned = 'our XP and rewards system';
  } else if (lowerMessage.includes('black belt') || lowerMessage.includes('time machine') || lowerMessage.includes('prediction')) {
    featureMentioned = 'our Black Belt Time Machine';
  } else if (lowerMessage.includes('match') || lowerMessage.includes('pairing')) {
    featureMentioned = 'our Belt-Tier Matchmaking';
  } else if (lowerMessage.includes('challenge') || lowerMessage.includes('dojang') || lowerMessage.includes('rivals')) {
    featureMentioned = 'our Dojang Rivals system';
  } else if (lowerMessage.includes('ai') || lowerMessage.includes('bot') || lowerMessage.includes('algorithm')) {
    featureMentioned = 'our AI technology';
  }

  const responses: Record<string, string> = {
    'English': `Ah, I sense the curiosity of a keen strategist! ${featureMentioned} is the result of years of martial arts expertise combined with proprietary technology developed exclusively for TaekUp. This is what makes us unique in the industry.

Like a master who guards the secrets of their dojo, I must respectfully protect our intellectual property. What I can tell you is this: **it works remarkably well**. Our dojos see incredible student engagement and retention.

Rather than explaining the ancient secrets behind our technology, I invite you to **experience its power firsthand** with our 14-day free trial at mytaek.com. The proof, as they say, is in the results!

Is there something about TaekUp's benefits or features I can help you with instead?`,

    'French': `Ah, je sens la curiosité d'un stratège avisé ! ${featureMentioned} est le fruit d'années d'expertise en arts martiaux combinées à une technologie propriétaire développée exclusivement pour TaekUp. C'est ce qui nous rend uniques dans l'industrie.

Comme un maître qui garde les secrets de son dojo, je dois respectueusement protéger notre propriété intellectuelle. Ce que je peux vous dire, c'est que **cela fonctionne remarquablement bien**. Nos dojos constatent un engagement et une fidélisation incroyables des élèves.

Plutôt que d'expliquer les secrets ancestraux de notre technologie, je vous invite à **découvrir sa puissance** avec notre essai gratuit de 14 jours sur mytaek.com. La preuve, comme on dit, est dans les résultats !

Y a-t-il autre chose sur les avantages ou fonctionnalités de TaekUp que je peux vous aider ?`,

    'Spanish': `¡Ah, siento la curiosidad de un estratega astuto! ${featureMentioned} es el resultado de años de experiencia en artes marciales combinados con tecnología propietaria desarrollada exclusivamente para TaekUp. Esto es lo que nos hace únicos en la industria.

Como un maestro que guarda los secretos de su dojo, debo proteger respetuosamente nuestra propiedad intelectual. Lo que puedo decirte es esto: **funciona notablemente bien**. Nuestros dojos ven un increíble compromiso y retención de estudiantes.

En lugar de explicar los secretos ancestrales de nuestra tecnología, te invito a **experimentar su poder** con nuestra prueba gratuita de 14 días en mytaek.com. ¡La prueba, como dicen, está en los resultados!

¿Hay algo sobre los beneficios o características de TaekUp en lo que pueda ayudarte?`
  };
  
  return responses[clubContext.language] || responses['English'];
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

  if (isCompetitorQuestion(message)) {
    return getCompetitorProtectionResponse(message, clubContext);
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

Remember: You are a wise Grandmaster who knows EVERYTHING about TaekUp. Stay in character and only discuss TaekUp/MyTaek topics.
CRITICAL: Never reveal technical implementation details, algorithms, formulas, or how features are built. Focus on benefits and results only.`;

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
  artType?: string;
  ageGroup?: string;
}): Promise<string> {
  const openai = getOpenAIClient();
  
  if (!openai) {
    return getClassPlanFallback(params);
  }

  // Map belt system codes to full martial art names
  const artTypeMap: Record<string, string> = {
    'wt': 'World Taekwondo (WT)',
    'itf': 'ITF Taekwondo',
    'karate': 'Karate',
    'bjj': 'Brazilian Jiu-Jitsu',
    'judo': 'Judo',
    'hapkido': 'Hapkido',
    'tangsoodo': 'Tang Soo Do',
    'aikido': 'Aikido',
    'kravmaga': 'Krav Maga',
    'kungfu': 'Kung Fu / Wushu',
    'custom': 'Martial Arts'
  };
  
  const martialArt = artTypeMap[params.artType || ''] || params.artType || 'Martial Arts';
  const ageGroup = params.ageGroup || 'mixed ages';
  
  // Create an expert system prompt based on the martial art
  const systemPrompt = `You are a master ${martialArt} instructor with 25+ years of experience in:
- ${martialArt} techniques, forms, and competition
- Age-appropriate teaching methods for ${ageGroup}
- Sport-specific conditioning and flexibility training
- Child development and motor skill progression
- Korean/Japanese terminology (use authentic terms with translations)
- Safety protocols and injury prevention

You create professional, detailed lesson plans that coaches can follow minute-by-minute.`;

  try {
    const prompt = `Create a detailed ${martialArt} class plan for ${ageGroup} students:

**Class Details:**
- Belt Level: ${params.beltLevel}
- Focus: ${params.focusArea}
- Duration: ${params.classDuration} minutes
- Class Size: ~${params.studentCount} students

**Required Sections (with exact timing):**
1. **Warm-up** (${Math.round(params.classDuration * 0.15)} min) - Dynamic stretches, ${martialArt}-specific movements
2. **Technical Drills** (${Math.round(params.classDuration * 0.35)} min) - Focus on ${params.focusArea} with progressions
3. **Partner Work / Application** (${Math.round(params.classDuration * 0.30)} min) - Practical application drills
4. **Conditioning** (${Math.round(params.classDuration * 0.10)} min) - ${martialArt}-specific fitness
5. **Cool-down & Mat Chat** (${Math.round(params.classDuration * 0.10)} min) - Stretching + character development topic

**Include:**
- Authentic ${martialArt} terminology with English translations
- Age-appropriate modifications for ${ageGroup}
- Specific technique names and descriptions
- Safety reminders where relevant
- Fun elements to keep students engaged

Format with clear headers, bullet points, and timing. Respond in ${params.language}.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
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

export async function generateVideoFeedback(params: {
  studentName: string;
  challengeName: string;
  challengeCategory?: string;
  score?: number;
  beltLevel?: string;
}): Promise<string> {
  const gemini = getGeminiClient();
  
  if (!gemini) {
    console.log('[VideoFeedback] No Gemini client, using fallback');
    return getVideoFeedbackFallback(params);
  }

  try {
    const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Generate a brief, encouraging coach feedback message (2-3 sentences) for a martial arts student's challenge submission.

Student: ${params.studentName}
Challenge: ${params.challengeName}
Category: ${params.challengeCategory || 'General'}
Score: ${params.score || 'submitted'}
Belt Level: ${params.beltLevel || 'student'}

Write a warm, motivating message that:
- Mentions ${params.studentName} by name
- References the specific ${params.challengeName} challenge
- Provides encouragement relevant to the ${params.challengeCategory || 'challenge'} category
- Sounds like a real martial arts coach

Keep it under 50 words. Be specific and unique.`;

    console.log('[VideoFeedback] Generating with Gemini...');
    const result = await model.generateContent(prompt);
    const feedback = result.response.text();
    console.log('[VideoFeedback] Generated:', feedback);
    return feedback || getVideoFeedbackFallback(params);
  } catch (error: any) {
    console.error('[VideoFeedback] Gemini error:', error.message);
    return getVideoFeedbackFallback(params);
  }
}

function getVideoFeedbackFallback(params: { studentName: string; challengeName: string; challengeCategory?: string }): string {
  const encouragements = [
    `Outstanding work on the ${params.challengeName}, ${params.studentName}! Your dedication to improving your ${params.challengeCategory || 'skills'} really shows. Keep pushing forward!`,
    `${params.studentName}, great effort on the ${params.challengeName} challenge! Your commitment to martial arts training is inspiring. Stay focused and keep training hard!`,
    `Impressive submission, ${params.studentName}! The ${params.challengeName} is a tough challenge and you're showing real progress. Keep up that warrior spirit!`,
  ];
  return encouragements[Math.floor(Math.random() * encouragements.length)];
}
