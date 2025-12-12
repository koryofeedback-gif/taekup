import type { Message } from '../types';
import { aiAPI } from './apiClient';

export const getTaekBotResponseGPT = async (
  query: string, 
  history: Message[], 
  context?: { clubName?: string; artType?: string; language?: string }
): Promise<string> => {
  const fallback = "I'm sorry, I'm having a little trouble connecting right now. Please try again in a moment.";
  
  try {
    console.log('[TaekBot] Sending request:', { query, context });
    const response = await aiAPI.taekbotResponse(query, {
      clubName: context?.clubName || 'TaekUp',
      artType: context?.artType || 'martial arts',
      language: context?.language || 'English',
    });
    console.log('[TaekBot] Got response:', response);
    return response || fallback;
  } catch (error) {
    console.error("[TaekBot] Error getting response:", error);
    return fallback;
  }
};

export const sendWelcomeEmailGPT = async (clubName: string): Promise<string> => {
  const fallback = `Welcome to TaekUp, Master ${clubName}! We're excited to have you. Your journey starts here.`;
  
  try {
    const email = await aiAPI.generateWelcomeEmail({
      clubName,
      studentName: 'New Member',
      parentName: `Master ${clubName}`,
      artType: 'martial arts',
      language: 'English',
    });
    
    console.log("--- WELCOME EMAIL ---");
    console.log(`To: new_user@example.com`);
    console.log(`Subject: Welcome to TaekUp, Master ${clubName}!`);
    console.log("Body:", email);
    console.log("---------------------");
    
    return email || fallback;
  } catch (error) {
    console.error("Error generating welcome email:", error);
    return fallback;
  }
};

export const generateSloganGPT = async (clubName: string): Promise<string> => {
  return "Discipline. Focus. Spirit.";
};

export const sendCoachWelcomeEmailGPT = async (coachName: string, clubName: string): Promise<void> => {
  try {
    const email = await aiAPI.generateWelcomeEmail({
      clubName,
      studentName: coachName,
      parentName: coachName,
      artType: 'martial arts',
      language: 'English',
    });
    console.log(email || `Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`);
  } catch (error) {
    console.error("Error sending coach welcome email:", error);
    console.log(`Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`);
  }
};

export const generateLessonPlanGPT = async (
  ageGroup: string,
  beltLevel: string,
  focusTopic: string,
  duration: string = "45",
  language: string = 'English',
  artType?: string
): Promise<string> => {
  const fallback = `**1. Warm-up (5 min):**
Jumping jacks, high knees, arm circles

**2. Technical Drill (15 min):**
${focusTopic} - Basic form practice

**3. Application / Partner Work (15 min):**
Partner drills focusing on ${focusTopic}

**4. Mat Chat (5 min):**
Discussion about respect and discipline`;

  try {
    const plan = await aiAPI.generateClassPlan({
      beltLevel,
      focusArea: focusTopic,
      classDuration: parseInt(duration) || 45,
      studentCount: 10,
      language,
      artType,
      ageGroup,
    });
    return plan || fallback;
  } catch (error) {
    console.error("Error generating lesson plan:", error);
    return fallback;
  }
};
