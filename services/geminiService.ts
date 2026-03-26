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
  const fallback = "Ask your child to teach you one technique they learned in class this week. The 'protégé effect' (Nestojko et al., 2014) shows that teaching others is one of the most powerful ways children consolidate motor skills and build lasting confidence.";
  
  try {
    const prompt = `You are a child sport psychologist and martial arts development expert writing a premium personalized insight for a parent. You draw from peer-reviewed research in child development, sport psychology, and motor learning science.

You have REAL training data for ${studentName}. Your advice must be anchored in this data — never generic.

--- STUDENT DATA ---
${performanceSummary}
--- END DATA ---

Your response must follow this exact structure (write in flowing prose, NOT bullet points):

**Paragraph 1 — Current Session Reality (2 sentences):**
FIRST check for a "CURRENT SESSION ALERT" in the data. This overrides everything else.
- IF "ALL skills scored 0/2 (all red)" alert is present: Open with empathy and honest acknowledgment — something like "This was a challenging session for [name], with all skills recorded at their lowest score." Explain what causes full-regression days in child development (e.g., emotional load, sleep, external stressors affecting executive function) using a named psychological concept. Do NOT celebrate, do NOT say "impressive progress," do NOT open positively.
- IF current session is mostly struggling (avg < 0.75): Lead with acknowledgment of the difficulty, then explain why.
- IF current session is strong OR no alert: check if improved skills exist in the progress delta and celebrate those with exact numbers. If first session only: name the specific weak skill from scores and explain WHY.

**Paragraph 2 — Research-Backed Intervention (2 sentences):**
- IF progress was celebrated in paragraph 1: pivot to the CURRENT weak area (what still needs work this week) and give the research-backed intervention for it.
- IF no progress data: give the intervention for the weak skill identified in paragraph 1.
Match method to skill: Deliberate Practice micro-blocks (Ericsson) for Technique, Attention Restoration + timed focus windows for Focus/Concentration, Implementation Intentions for Discipline/Consistency, Self-Determination Theory autonomy support for Effort/Motivation, Growth Mindset reframing (Dweck) for Confidence, motor chunking for Coordination. WOOP only as last resort. Explain concrete home steps.

**Paragraph 3 — Progress Marker (1-2 sentences):**
Tell the parent exactly what measurable sign to look for at the NEXT class that will show the intervention is working. Make the parent feel like an active partner, not a bystander.

**Paragraph 4 — Celebration (1 sentence):**
If a stripe was earned, a challenge was approved, or attendance is strong — acknowledge it with genuine warmth and connect it to ${studentName}'s character, not just performance.

Rules:
- If "CURRENT SESSION ALERT: ALL skills scored 0/2" is in the data → NEVER open with positive words like "impressive," "great," "commendable," or "progress." Start with empathy.
- ALWAYS name the specific weak skill from the data — never invent one
- ALWAYS reference at least one named psychological concept or researcher
- NEVER say "practice at home" without a specific, named drill or protocol
- NEVER invent or assume attendance problems — use ONLY the attendance numbers provided
- If grading sessions exist in the data, the student attended those classes — never say they didn't attend
- Tone: warm expert — like a trusted child psychologist, not a chatbot
- Total length: 5-7 sentences across 4 paragraphs
- Write in ${language}`;

    const response = await aiAPI.taekbotResponse(prompt, { language });
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
