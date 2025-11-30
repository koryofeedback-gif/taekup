
import type { GoogleGenerativeAI } from "@google/generative-ai";
import type { Message } from '../types';

// Use a promise to hold the AI instance to avoid race conditions on initialization
let aiInstancePromise: Promise<GoogleGenerativeAI | null> | null = null;

const getAiInstance = (): Promise<GoogleGenerativeAI | null> => {
  if (!aiInstancePromise) {
    aiInstancePromise = (async () => {
      // Get API key from environment (Vite exposes it via import.meta.env with VITE_ prefix)
      const apiKey = (import.meta.env as any).VITE_GOOGLE_API_KEY;
      
      if (!apiKey) {
        console.warn("VITE_GOOGLE_API_KEY is not available. Gemini API features will be disabled. AI will use fallback responses.");
        return null;
      }
      try {
        // Dynamically import the module to prevent app-breaking, load-time errors
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        return new GoogleGenerativeAI(apiKey);
      } catch (e) {
        console.error("Failed to initialize GoogleGenerativeAI:", e);
        return null;
      }
    })();
  }
  return aiInstancePromise;
};


export const sendWelcomeEmail = async (clubName: string): Promise<string> => {
  const fallback = `Welcome to TaekUp, Master ${clubName}! We're excited to have you. Your journey starts here.`;
  const ai = await getAiInstance();
  if (!ai) return fallback;

  const prompt = `Generate a welcome email for a new user who just signed up for a Martial Arts club management app called "TaekUp". The club name is "${clubName}". The tone should be welcoming, exciting, and professional. The sender is "The TaekUp Team". Address them as "Master ${clubName}". The email body should be concise and start with "Your journey starts here."`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const emailText = result.response.text();
    
    // In a real app, this would use an email service (e.g., SendGrid, Mailgun)
    // For this simulation, we'll just log the generated text to the console.
    console.log("--- SIMULATED WELCOME EMAIL ---");
    console.log(`To: new_user@example.com`);
    console.log(`Subject: Welcome to TaekUp, Master ${clubName}!`);
    console.log("Body:", emailText);
    console.log("-------------------------------");
    return emailText;
  } catch (error) {
    console.error("Error generating welcome email:", error);
    return fallback;
  }
};

export const getTaekBotResponse = async (query: string, history: Message[]): Promise<string> => {
    const fallback = "I'm sorry, I'm having a little trouble connecting right now. Please try again in a moment.";
    const ai = await getAiInstance();
    if (!ai) return fallback;

    const systemInstruction = `You are TaekBot, the AI assistant for MyTaek and TaekUp. 
    
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
    
    Be concise. If you don't know something, suggest they start the 14-Day Free Trial to see for themselves.`;
    
    // Map the simple Message[] history to the format required by the Gemini API
    // Include system instruction as the first message
    const contents = [
        { role: 'user' as const, parts: [{ text: systemInstruction }] },
        { role: 'model' as const, parts: [{ text: 'Understood. I will act as TaekBot, the AI assistant for MyTaek and TaekUp.' }] },
        ...history.map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'model' as const,
            parts: [{ text: msg.text }]
        })),
        { role: 'user' as const, parts: [{ text: query }] }
    ];

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent({ contents });
        return result.response.text();
    } catch (error) {
        console.error("Error getting TaekBot response:", error);
        return fallback;
    }
};

export const generateSlogan = async (clubName: string): Promise<string> => {
  const fallback = "Discipline. Focus. Spirit.";
  const ai = await getAiInstance();
  if (!ai) return fallback;

  const prompt = `Generate a short, inspiring slogan for a Martial Arts club named "${clubName}". The slogan should be 3-5 words long and focus on themes like discipline, focus, spirit, strength, or community. Provide only the slogan text, without quotation marks. Example: "Discipline. Focus. Spirit."`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error generating slogan:", error);
    return fallback;
  }
};

export const sendCoachWelcomeEmail = async (coachName: string, clubName: string): Promise<void> => {
  const ai = await getAiInstance();
  if (!ai) {
    console.log(`Welcome, Coach ${coachName}! You’re now part of ${clubName}’s TaekUp system.`);
    return;
  }

  const prompt = `Generate a brief, friendly welcome email for a Martial Arts coach. The coach's name is "${coachName}". They have just been added to the "${clubName}" club's new management software, called TaekUp. The email should welcome them and mention they'll receive login details separately. Keep it concise.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const emailText = result.response.text();
    
    // In a real app, this would use an email service
    console.log("--- SIMULATED COACH WELCOME EMAIL ---");
    console.log(`To: (coach's email)`);
    console.log(`Subject: Welcome to ${clubName}'s TaekUp System, Coach ${coachName}!`);
    console.log("Body:", emailText);
    console.log("-------------------------------------");
  } catch (error) {
    console.error("Error generating coach welcome email:", error);
    // Log a fallback message in case of error
     console.log(`Welcome, Coach ${coachName}! You’re now part of ${clubName}’s TaekUp system.`);
  }
};

export const sendParentWelcomeEmail = async (parentEmail: string, studentName: string, clubName: string): Promise<void> => {
  const ai = await getAiInstance();
  if (!ai) {
    console.log(`Welcome! Your child, ${studentName}, is now part of ${clubName}'s TaekUp system. Look for a Parent Portal invite soon!`);
    return;
  }

  const prompt = `Generate a brief, friendly welcome email for a parent. The parent's email is "${parentEmail}". Their child, "${studentName}", has just been enrolled in the "${clubName}" Martial Arts club using the new TaekUp management system. Explain that they will soon receive an invitation to the Parent Portal where they can track their child's progress. The tone should be welcoming and informative.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const emailText = result.response.text();
    
    console.log("--- SIMULATED PARENT WELCOME EMAIL ---");
    console.log(`To: ${parentEmail}`);
    console.log(`Subject: Welcome to ${clubName}'s Parent Portal on TaekUp!`);
    console.log("Body:", emailText);
    console.log("--------------------------------------");
  } catch (error) {
    console.error("Error generating parent welcome email:", error);
    console.log(`Welcome! Your child, ${studentName}, is now part of ${clubName}'s TaekUp system. Look for a Parent Portal invite soon!`);
  }
};

export const getOnboardingMessage = async (): Promise<string> => {
    const fallback = "Welcome to TaekUp! Your journey to greatness starts now.";
    const ai = await getAiInstance();
    if (!ai) return fallback;

    const prompt = `Generate a short, inspiring AI onboarding message for a user who has just finished setting up their Martial Arts club management system called TaekUp. The message should be welcoming and motivational, focusing on the theme of progress and the journey. An example is "Welcome to TaekUp! Every class, every effort, every step — brings you up!". Return only the single, generated message text without any extra formatting or quotation marks.`;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error("Error generating onboarding message:", error);
        return fallback;
    }
};

export const generateParentFeedback = async (
  studentName: string,
  scores: { skillName: string; score: number | null }[],
  note: string,
  bonusPoints: number = 0,
  homeworkPoints: number = 0,
  isReadyForGrading: boolean = false,
  gradingRequirementName: string = '',
  language: string = 'English' // New parameter
): Promise<string> => {
  const fallback = `Thank you for your support of ${studentName}'s training! We appreciate having them in class.`;
  const ai = await getAiInstance();
  if (!ai) return fallback;

  const scoreText = scores
    .map(({ skillName, score }) => {
      const scoreMeaning = score === 2 ? 'Excellent' : score === 1 ? 'Good' : score === 0 ? 'Needs Improvement' : 'Not Scored';
      return `${skillName}: ${scoreMeaning}`;
    })
    .join(', ');

  let prompt = `You are a Martial Arts coach writing a brief, encouraging feedback message to a student's parent.
  Student's Name: ${studentName}
  Today's performance: ${scoreText}
  Coach's private note: "${note}"`;

  if (homeworkPoints && homeworkPoints > 0) {
    prompt += `\nThis student also received ${homeworkPoints} bonus points for completing their homework. Please mention this good habit!`;
  }

  if (bonusPoints && bonusPoints > 0) {
    prompt += `\nThis student also received ${bonusPoints} coach bonus points for exceptional performance. Make sure to mention this achievement positively.`;
  }
  
  if (isReadyForGrading) {
      prompt += `\nIMPORTANT: The student has mastered the "${gradingRequirementName || 'Grading Requirement'}" and is now READY for their belt promotion test! This is a huge achievement, please celebrate it in the message.`;
  }

  prompt += `

  Based on all this information, generate a parent-friendly, positive message. If the note is something like "Good energy but talking," the message should be something like "${studentName} brought good energy to class today! We will continue to work on maintaining focus during practice." The message should be 1-2 sentences. Do not repeat the scores, but summarize the performance.
  
  IMPORTANT: Write the response in the following language: ${language}.

  Generated Message:`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error generating parent feedback:", error);
    return fallback;
  }
};

export const generatePromotionMessage = async (studentName: string, newBeltName: string, clubName: string, language: string = 'English'): Promise<string> => {
  const fallback = `Big congratulations to ${studentName}! They have officially promoted to ${newBeltName}. We are incredibly proud of their hard work and dedication at ${clubName}.`;
  const ai = await getAiInstance();
  if (!ai) return fallback;

  const prompt = `You are a Senior Martial Arts Master.
  A student named "${studentName}" has just passed their test and promoted to "${newBeltName}" at "${clubName}".
  
  Task: Write a short, high-energy, congratulatory message to the parents.
  Tone: Enthusiastic, Proud, Professional.
  Constraints: Max 2 sentences. Must use the word "Congratulations" (translated to target language).
  
  IMPORTANT: Write the response in the following language: ${language}.

  Generated Message:`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Error generating promotion message:", error);
    return fallback;
  }
};

export const generateParentingAdvice = async (studentName: string, performanceSummary: string, language: string = 'English'): Promise<string> => {
    const fallback = "Try turning practice into a game! See who can stand on one leg the longest to build balance and focus.";
    const ai = await getAiInstance();
    if (!ai) return fallback;
  
    const prompt = `You are a Child Development Expert and Martial Arts Coach.
    A parent is asking for advice to help their child, "${studentName}", improve at home.
    
    Recent Performance Context: "${performanceSummary}"
    (e.g., if performance is 'Focus: Needs Improvement', suggest a focus game).
    
    Task: Provide ONE specific, fun, and actionable tip or mini-game the parent can do with the child at home.
    Tone: Warm, encouraging, non-judgmental.
    Constraint: Keep it under 50 words. Focus on parent-child bonding.
    
    IMPORTANT: Write the response in the following language: ${language}.

    Advice:`;

    try {
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error("Error generating parenting advice:", error);
      return fallback;
    }
  };

export const generateLessonPlan = async (
    ageGroup: string,
    beltLevel: string,
    focusTopic: string,
    duration: string = "45",
    language: string = 'English'
): Promise<string> => {
    const fallback = "Warm-up: Jumping Jacks (5m)\nDrill: Kicking (15m)\nGame: Dodgeball (10m)\nCooldown: Stretch (5m)";
    const ai = await getAiInstance();
    if (!ai) return fallback;

    const prompt = `You are a World-Class Martial Arts Pedagogue and Instructor.
    Task: Create a structured, high-energy lesson plan for a class.
    
    Context:
    - Age Group: ${ageGroup}
    - Belt Level: ${beltLevel}
    - Class Duration: ${duration} minutes
    - Primary Focus: ${focusTopic}
    
    Format the output exactly as follows (use Markdown bolding):
    
    **1. Warm-up (5-8 min):**
    [Specific, fun activity suitable for this age]
    
    **2. Technical Drill (15 min):**
    [Step-by-step breakdown of the focus topic]
    
    **3. Application / Game (15 min):**
    [Gamified version of the drill OR sparring drill]
    
    **4. Mat Chat (3-5 min):**
    [A short philosophical lesson related to martial arts values like Respect or Perseverance]
    
    Tone: Professional, energetic, and pedagogically sound.
    IMPORTANT: Write the response in the following language: ${language}.
    `;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error("Error generating lesson plan:", error);
        return fallback;
    }
}
