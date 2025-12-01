import type { Message } from '../types';
import { aiAPI } from './apiClient';

export const sendWelcomeEmail = async (clubName: string): Promise<string> => {
  const fallback = `Welcome to TaekUp, Master ${clubName}! We're excited to have you. Your journey starts here.`;
  
  try {
    const email = await aiAPI.generateWelcomeEmail({
      clubName,
      studentName: 'New Member',
      parentName: `Master ${clubName}`,
      artType: 'martial arts',
      language: 'English',
    });
    
    console.log("--- SIMULATED WELCOME EMAIL ---");
    console.log(`To: new_user@example.com`);
    console.log(`Subject: Welcome to TaekUp, Master ${clubName}!`);
    console.log("Body:", email);
    console.log("-------------------------------");
    return email || fallback;
  } catch (error) {
    console.error("Error generating welcome email:", error);
    return fallback;
  }
};

export const getTaekBotResponse = async (query: string, history: Message[]): Promise<string> => {
  const fallback = "I'm sorry, I'm having a little trouble connecting right now. Please try again in a moment.";
  
  try {
    const response = await aiAPI.taekbotResponse(query, {});
    return response || fallback;
  } catch (error) {
    console.error("Error getting TaekBot response:", error);
    return fallback;
  }
};

export const generateSlogan = async (clubName: string): Promise<string> => {
  return "Discipline. Focus. Spirit.";
};

export const sendCoachWelcomeEmail = async (coachName: string, clubName: string): Promise<void> => {
  try {
    const email = await aiAPI.generateWelcomeEmail({
      clubName,
      studentName: coachName,
      parentName: coachName,
      artType: 'martial arts',
      language: 'English',
    });
    
    console.log("--- SIMULATED COACH WELCOME EMAIL ---");
    console.log(`To: (coach's email)`);
    console.log(`Subject: Welcome to ${clubName}'s TaekUp System, Coach ${coachName}!`);
    console.log("Body:", email);
    console.log("-------------------------------------");
  } catch (error) {
    console.error("Error generating coach welcome email:", error);
    console.log(`Welcome, Coach ${coachName}! You're now part of ${clubName}'s TaekUp system.`);
  }
};

export const sendParentWelcomeEmail = async (parentEmail: string, studentName: string, clubName: string): Promise<void> => {
  try {
    const email = await aiAPI.generateWelcomeEmail({
      clubName,
      studentName,
      parentName: parentEmail,
      artType: 'martial arts',
      language: 'English',
    });
    
    console.log("--- SIMULATED PARENT WELCOME EMAIL ---");
    console.log(`To: ${parentEmail}`);
    console.log(`Subject: Welcome to ${clubName}'s Parent Portal on TaekUp!`);
    console.log("Body:", email);
    console.log("--------------------------------------");
  } catch (error) {
    console.error("Error generating parent welcome email:", error);
    console.log(`Welcome! Your child, ${studentName}, is now part of ${clubName}'s TaekUp system. Look for a Parent Portal invite soon!`);
  }
};

export const getOnboardingMessage = async (): Promise<string> => {
  return "Welcome to TaekUp! Every class, every effort, every step — brings you up!";
};

export const generateParentFeedback = async (
  studentName: string,
  scores: { skillName: string; score: number | null }[],
  note: string,
  bonusPoints: number = 0,
  homeworkPoints: number = 0,
  isReadyForGrading: boolean = false,
  gradingRequirementName: string = '',
  language: string = 'English'
): Promise<string> => {
  const fallback = `Thank you for your support of ${studentName}'s training! We appreciate having them in class.`;
  
  try {
    const scoreText = scores
      .map(({ skillName, score }) => {
        const scoreMeaning = score === 2 ? 'Excellent' : score === 1 ? 'Good' : score === 0 ? 'Needs Improvement' : 'Not Scored';
        return `${skillName}: ${scoreMeaning}`;
      })
      .join(', ');
    
    const response = await aiAPI.taekbotResponse(
      `Generate a brief parent feedback message for ${studentName}. Performance: ${scoreText}. Coach's note: "${note}". ${bonusPoints > 0 ? `Bonus points: ${bonusPoints}.` : ''} ${homeworkPoints > 0 ? `Homework points: ${homeworkPoints}.` : ''} ${isReadyForGrading ? `Ready for ${gradingRequirementName} belt test!` : ''} Write in ${language}.`,
      { language }
    );
    return response || fallback;
  } catch (error) {
    console.error("Error generating parent feedback:", error);
    return fallback;
  }
};

export const generatePromotionMessage = async (studentName: string, newBeltName: string, clubName: string, language: string = 'English'): Promise<string> => {
  const fallback = `Big congratulations to ${studentName}! They have officially promoted to ${newBeltName}. We are incredibly proud of their hard work and dedication at ${clubName}.`;
  
  try {
    const response = await aiAPI.taekbotResponse(
      `Generate a short, enthusiastic congratulations message. ${studentName} just promoted to ${newBeltName} at ${clubName}. Write in ${language}.`,
      { language }
    );
    return response || fallback;
  } catch (error) {
    console.error("Error generating promotion message:", error);
    return fallback;
  }
};

export const generateParentingAdvice = async (studentName: string, performanceSummary: string, language: string = 'English'): Promise<string> => {
  const fallback = "Try turning practice into a game! See who can stand on one leg the longest to build balance and focus.";
  
  try {
    const response = await aiAPI.taekbotResponse(
      `Give one specific, fun parenting tip to help ${studentName} improve at home. Recent performance: "${performanceSummary}". Keep it under 50 words. Write in ${language}.`,
      { language }
    );
    return response || fallback;
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
    });
    return plan || fallback;
  } catch (error) {
    console.error("Error generating lesson plan:", error);
    return fallback;
  }
};
