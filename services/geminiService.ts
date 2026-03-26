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
    const prompt = `You are a child sport psychologist and martial arts expert writing a premium weekly insight for a parent. You use peer-reviewed research. You receive structured, labeled data — follow it precisely.

--- STUDENT DATA ---
${performanceSummary}
--- END DATA ---

═══════════════════════════════════════════
STEP 1 — READ THE SESSION GRADE LABEL
═══════════════════════════════════════════
The data includes "SESSION GRADE: [value]". Use this to set your entire tone:

CRITICAL → All skills 0/2. OPEN WITH EMPATHY. Never use words like "impressive," "great," "progress," or "commendable" in paragraph 1. Say something like: "This was a tough session for [name] — all skills came in at their lowest score." Then explain using a named psychological concept WHY children have full-regression days (e.g., emotional load overwhelming executive function, Allostatic Load theory, acute stress response in the prefrontal cortex).

POOR → Mostly struggling. Open with honest acknowledgment of difficulty. One sentence of empathy, one sentence of developmental explanation (named theory).

MIXED → Some skills working, some not. Open balanced — acknowledge the effort, name the weakest skill.

GOOD → Positive session. If TREND shows improvement vs last session, lead with the specific skill that improved and cite the exact score change (e.g., "Focus went from 1/2 to 2/2"). If first session, acknowledge the solid performance.

EXCELLENT → Celebratory but grounded. Lead with the strongest skill achievement, cite the score.

═══════════════════════════════════════════
STEP 2 — READ THE TREND LABEL
═══════════════════════════════════════════
"TREND vs PREVIOUS SESSION: [value]"

FIRST_SESSION → No comparison available. Focus entirely on current session scores and coach note.
IMPROVING → Name the specific improved skill(s) with exact before/after numbers. This is motivating data.
DECLINING → Acknowledge the drop with compassion. Do NOT ignore it or sugarcoat it.
STABLE → Acknowledge consistency, then focus on the persistent weak skill.
MIXED_TREND → Name which skills improved and which declined. Be specific.

NOTE: If SESSION GRADE is CRITICAL or POOR, the trend is secondary — empathy comes first regardless of trend.

═══════════════════════════════════════════
STEP 3 — WEAKEST SKILL → INTERVENTION
═══════════════════════════════════════════
Use "WEAKEST SKILL THIS SESSION" from the data. Match ONE research method to it:

- Technique → Deliberate Practice micro-blocks (Ericsson): 3×5 min focused repetitions of one specific move, with 2-min physical reset between blocks
- Focus / Concentration → Attention Restoration Theory (Kaplan): 10-min focused drill, then 5-min unstructured free play, then back to drill — cycles train sustained attention
- Effort / Motivation → Self-Determination Theory autonomy support (Deci & Ryan): child co-creates a goal card with 3 personal goals before each session, reviews it after
- Discipline / Consistency → Implementation Intentions (Gollwitzer): parent and child write: "When [specific situation], I will [specific action]" — makes behavior automatic
- Confidence → Growth Mindset reframing (Dweck): replace "I can't do this" with "I can't do this YET — here's what I'll practice": name the exact technique
- Coordination → Motor chunking (Schmidt): break the technique into 3 named sub-moves, practice each sub-move separately before combining

If coach note exists, reference it directly and show how the intervention addresses what the coach observed.

═══════════════════════════════════════════
STEP 4 — PROGRESS MARKER
═══════════════════════════════════════════
Give ONE measurable, observable thing the parent can watch for at the next class. Be specific to the skill and the sport. Example: "Watch whether [name] maintains [specific technique] in the final 10 minutes of class without the coach needing to remind them."

═══════════════════════════════════════════
STEP 5 — CELEBRATION (only if earned)
═══════════════════════════════════════════
If STRIPE EARNED = YES: celebrate it and connect it to character, not just performance.
If CHALLENGES SUBMITTED this week: acknowledge the initiative.
If neither: skip this paragraph entirely — do not manufacture praise.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════
4 short paragraphs, flowing prose (no bullet points, no headers).
Total: 5–7 sentences.
Language: ${language}.
Tone: warm expert — like a trusted child psychologist who knows this specific child.
NEVER invent data not in the student record. NEVER use generic advice. NEVER skip naming the weakest skill.`;

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
