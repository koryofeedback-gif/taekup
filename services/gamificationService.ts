/**
 * Gamification Service
 * Handles PTS (stripe progress) and XP (monster/game growth) calculations for TaekUp
 * 
 * IMPORTANT DISTINCTION:
 * - PTS (Points) = Technical progress toward next stripe/belt, RESETS on promotion
 * - XP = Monster/game growth (Dojang Rivals), NEVER resets
 * 
 * Grading/Class scores earn PTS (displayed in Coach Dashboard)
 * Challenges/games earn XP (displayed in Parent Portal Rivals)
 */

// Constants
export const MAX_CLASS_PTS = 100;
export const SCORE_VALUES = {
  GREEN: 2,
  YELLOW: 1,
  RED: 0,
} as const;

// Local XP: No limits - coaches can give as many bonus points as they want for their club
// Global XP (World Rankings): Capped at 2 to prevent inflation
export const GLOBAL_MAX_COACH_BONUS = 2;
export const GLOBAL_MAX_HOMEWORK_BONUS = 2;

// Backward compatibility exports (deprecated - use GLOBAL_ versions for world rankings)
export const MAX_COACH_BONUS = 2;
export const MAX_HOMEWORK_BONUS = 2;

/**
 * Challenge Tier System (Anti-Cheat Logic)
 * 
 * Coaches cannot input raw XP numbers for custom challenges.
 * They must select a "Difficulty Tier" with fixed XP values.
 * This prevents XP inflation and maintains balance across all clubs.
 */
export const CHALLENGE_TIERS = {
  EASY: { tier: 1, label: 'Easy', xp: 15, description: 'Quick tasks, basic drills', icon: '🌱' },
  MEDIUM: { tier: 2, label: 'Medium', xp: 30, description: 'Standard drills, moderate effort', icon: '⚡' },
  HARD: { tier: 3, label: 'Hard', xp: 60, description: 'Intense workouts, high difficulty', icon: '🔥' },
  EPIC: { tier: 4, label: 'Epic', xp: 100, description: 'Weekly special challenge only', icon: '🏆', weeklyOnly: true },
} as const;

export type ChallengeTierKey = keyof typeof CHALLENGE_TIERS;

/**
 * Get XP value for a challenge tier
 * @param tier - The difficulty tier key
 * @returns XP value for that tier
 */
export function getChallengeTierXP(tier: ChallengeTierKey): number {
  return CHALLENGE_TIERS[tier].xp;
}

/**
 * Validate if a tier selection is allowed
 * @param tier - The difficulty tier key
 * @param isWeeklyChallenge - Whether this is a weekly challenge
 * @returns Whether the tier is valid for this challenge type
 */
export function isValidTierSelection(tier: ChallengeTierKey, isWeeklyChallenge: boolean): boolean {
  if (tier === 'EPIC' && !isWeeklyChallenge) {
    return false; // Epic tier only allowed for weekly challenges
  }
  return true;
}

/**
 * Calculate Class PTS (Points) - Raw Sum Method
 * 
 * Simply sums up the raw scores from grading:
 * - Green = 2 PTS
 * - Yellow = 1 PTS
 * - Red = 0 PTS
 * 
 * NOTE: These are POINTS (PTS) for stripe/belt progress, NOT XP.
 * PTS accumulate toward stripes (e.g., 64 PTS per stripe).
 * 
 * @param scores - Array of score values (Green=2, Yellow=1, Red=0) or null for unentered
 * @returns Raw sum of PTS
 * 
 * @example
 * // 4 items, all green: 2+2+2+2 = 8 PTS
 * calculateClassPTS([2, 2, 2, 2]) // returns 8
 * 
 * // 6 items, all green: 2+2+2+2+2+2 = 12 PTS
 * calculateClassPTS([2, 2, 2, 2, 2, 2]) // returns 12
 * 
 * // 4 items: 3 green, 1 yellow: 2+2+2+1 = 7 PTS
 * calculateClassPTS([2, 2, 2, 1]) // returns 7
 */
export function calculateClassPTS(scores: (number | null | undefined)[]): number {
  // Filter out null/undefined scores (unentered items)
  const validScores = scores.filter((s): s is number => s !== null && s !== undefined);
  
  // If no valid scores, return 0
  if (validScores.length === 0) {
    return 0;
  }
  
  // Simply sum up the raw scores (Green=2, Yellow=1, Red=0)
  return validScores.reduce((sum, score) => sum + score, 0);
}

/**
 * Calculate Class XP (Experience Points) - Normalized Method
 * 
 * Normalizes scoring so a perfect class ALWAYS = 100 XP, regardless of grading items.
 * This ensures fairness: a student graded on 4 items gets the same max XP as one graded on 6.
 * 
 * NOTE: XP is for Dojang Rivals / monster growth (NEVER resets).
 * This is separate from PTS which is raw sum for stripe progress.
 * 
 * @param scores - Array of score values (Green=2, Yellow=1, Red=0) or null for unentered
 * @returns Normalized XP value (0-100)
 * 
 * Formula: (Student's Total Score / Max Possible Score) × 100
 * 
 * @example
 * // 4 items, all green: (8/8) * 100 = 100 XP
 * calculateClassXP([2, 2, 2, 2]) // returns 100
 * 
 * // 6 items, all green: (12/12) * 100 = 100 XP  
 * calculateClassXP([2, 2, 2, 2, 2, 2]) // returns 100
 * 
 * // 4 items: 3 green, 1 yellow: (7/8) * 100 = 87.5 → 88 XP
 * calculateClassXP([2, 2, 2, 1]) // returns 88
 */
export function calculateClassXP(scores: (number | null | undefined)[]): number {
  const MAX_SESSION_XP = 100;
  
  // Filter out null/undefined scores (unentered items)
  const validScores = scores.filter((s): s is number => s !== null && s !== undefined);
  
  // If no valid scores, return 0
  if (validScores.length === 0) {
    return 0;
  }
  
  // Calculate max possible score (each item can be max 2 = Green)
  const maxPossibleScore = validScores.length * SCORE_VALUES.GREEN;
  
  // Avoid division by zero
  if (maxPossibleScore === 0) return 0;
  
  // Calculate actual score sum
  const studentRawScore = validScores.reduce((sum, score) => sum + score, 0);
  
  // Normalize to 100 scale
  return Math.round((studentRawScore / maxPossibleScore) * MAX_SESSION_XP);
}

export const MAX_CLASS_XP = 100;

/**
 * Calculate Grading XP for LOCAL use - No caps on bonus/homework
 * 
 * Coaches can award unlimited bonus/homework points within their own club.
 * This allows generous rewards for student effort without affecting world rankings.
 * 
 * Formula: (earned / possible) × 100
 * 
 * Where:
 * - earned = sum of scores + coachBonus + homework (NO CAPS)
 * - possible = (items × 2) + coachBonus + homework (uses actual values given)
 * 
 * @param scores - Array of score values (Green=2, Yellow=1, Red=0)
 * @param coachBonus - Coach bonus points awarded (NO LIMIT for local)
 * @param homework - Homework points awarded (NO LIMIT for local)
 * @param coachBonusEnabled - Whether coach bonus feature is enabled for this club
 * @param homeworkEnabled - Whether homework feature is enabled for this club
 * @returns Normalized XP value (0-100)
 * 
 * @example
 * // Coach gives 15 bonus, 10 homework - ALL count for local XP
 * // 4 items all green (8) + 15 bonus + 10 homework = 33 earned
 * // possible = 8 + 15 + 10 = 33
 * // XP = 100 (perfect score with generous bonuses)
 */
export function calculateGradingXP(
  scores: (number | null | undefined)[],
  coachBonus: number = 0,
  homework: number = 0,
  coachBonusEnabled: boolean = false,
  homeworkEnabled: boolean = false
): number {
  const validScores = scores.filter((s): s is number => s !== null && s !== undefined);
  
  if (validScores.length === 0) {
    return 0;
  }
  
  // LOCAL XP: Use raw values - no caps!
  const actualBonus = coachBonusEnabled ? coachBonus : 0;
  const actualHomework = homeworkEnabled ? homework : 0;
  
  // Calculate earned points (raw values)
  const earnedScores = validScores.reduce((sum, score) => sum + score, 0);
  const earnedTotal = earnedScores + actualBonus + actualHomework;
  
  // Calculate possible points (use actual bonus/homework given as the max)
  const maxScores = validScores.length * SCORE_VALUES.GREEN;
  const possibleTotal = maxScores + actualBonus + actualHomework;
  
  // Avoid division by zero
  if (possibleTotal === 0) return 0;
  
  // Normalize to 0-100 scale
  return Math.round((earnedTotal / possibleTotal) * 100);
}

/**
 * Calculate Global XP for WORLD RANKINGS - Capped bonus/homework
 * 
 * For fairness in world rankings, bonus and homework are CAPPED at 2 each.
 * This prevents coaches from inflating world rankings by giving excessive bonuses.
 * 
 * Formula: (earned / possible) × 100
 * 
 * Where:
 * - earned = sum of scores + min(coachBonus, 2) + min(homework, 2)
 * - possible = (items × 2) + 2 (if bonus enabled) + 2 (if homework enabled)
 * 
 * @param scores - Array of score values (Green=2, Yellow=1, Red=0)
 * @param coachBonus - Coach bonus points (CAPPED AT 2 for global)
 * @param homework - Homework points (CAPPED AT 2 for global)
 * @param coachBonusEnabled - Whether coach bonus feature is enabled for this club
 * @param homeworkEnabled - Whether homework feature is enabled for this club
 * @returns Normalized XP value (0-100) for world rankings
 * 
 * @example
 * // Coach gives 15 bonus, 10 homework - only 2+2 count for GLOBAL
 * // 4 items all green (8) + 2 (capped bonus) + 2 (capped homework) = 12 earned
 * // possible = 8 + 2 + 2 = 12
 * // Global XP = 100
 */
export function calculateGlobalGradingXP(
  scores: (number | null | undefined)[],
  coachBonus: number = 0,
  homework: number = 0,
  coachBonusEnabled: boolean = false,
  homeworkEnabled: boolean = false
): number {
  const validScores = scores.filter((s): s is number => s !== null && s !== undefined);
  
  if (validScores.length === 0) {
    return 0;
  }
  
  // GLOBAL XP: Cap bonus/homework at 2 each for fairness
  const cappedBonus = Math.min(coachBonus, GLOBAL_MAX_COACH_BONUS);
  const cappedHomework = Math.min(homework, GLOBAL_MAX_HOMEWORK_BONUS);
  
  // Calculate earned points (with caps)
  const earnedScores = validScores.reduce((sum, score) => sum + score, 0);
  const earnedTotal = earnedScores + (coachBonusEnabled ? cappedBonus : 0) + (homeworkEnabled ? cappedHomework : 0);
  
  // Calculate possible points (max 2 for bonus/homework)
  const maxScores = validScores.length * SCORE_VALUES.GREEN;
  const maxBonus = coachBonusEnabled ? GLOBAL_MAX_COACH_BONUS : 0;
  const maxHomework = homeworkEnabled ? GLOBAL_MAX_HOMEWORK_BONUS : 0;
  const possibleTotal = maxScores + maxBonus + maxHomework;
  
  // Avoid division by zero
  if (possibleTotal === 0) return 0;
  
  // Normalize to 0-100 scale
  return Math.round((earnedTotal / possibleTotal) * 100);
}

/**
 * Calculate PTS with bonus points
 * Bonus points are added on top of the raw class PTS
 * 
 * @param scores - Array of score values
 * @param bonusPoints - Extra points from coach (e.g., helping others, great effort)
 * @param homeworkPoints - Points for completing homework
 * @returns Total PTS including bonuses
 */
export function calculateTotalSessionPTS(
  scores: (number | null | undefined)[],
  bonusPoints: number = 0,
  homeworkPoints: number = 0
): number {
  const classPTS = calculateClassPTS(scores);
  return classPTS + bonusPoints + homeworkPoints;
}

// Backward compatibility alias
export const calculateTotalSessionXP = calculateTotalSessionPTS;

/**
 * Get performance rating based on PTS percentage
 * @param pts - Normalized PTS value (0-100)
 * @returns Performance rating
 */
export function getPerformanceRating(pts: number): 'excellent' | 'good' | 'average' | 'needs_improvement' {
  if (pts >= 90) return 'excellent';
  if (pts >= 75) return 'good';
  if (pts >= 50) return 'average';
  return 'needs_improvement';
}

/**
 * Calculate streak bonus XP
 * Rewards consistent attendance with bonus XP
 * 
 * @param currentStreak - Number of consecutive classes attended
 * @returns Bonus XP for streak
 */
export function calculateStreakBonus(currentStreak: number): number {
  if (currentStreak >= 10) return 15;  // 10+ classes = 15 XP bonus
  if (currentStreak >= 5) return 10;   // 5-9 classes = 10 XP bonus
  if (currentStreak >= 3) return 5;    // 3-4 classes = 5 XP bonus
  return 0;
}
