/**
 * Gamification Service
 * Handles XP calculations, challenge scoring, and reward logic for TaekUp
 */

// Constants
export const MAX_CLASS_XP = 100;
export const SCORE_VALUES = {
  GREEN: 2,
  YELLOW: 1,
  RED: 0,
} as const;

/**
 * Fair Grading Algorithm for Class XP
 * 
 * Normalizes scoring to handle variable grading criteria (e.g., some coaches use 4 items, others use 6).
 * This ensures fairness: a student graded on 4 items gets the same max XP as one graded on 6.
 * 
 * @param scores - Array of score values (Green=2, Yellow=1, Red=0) or null for unentered
 * @returns Normalized XP value (0-100)
 * 
 * @example
 * // 4 items, all green: (8/8) * 100 = 100 XP
 * calculateClassXP([2, 2, 2, 2]) // returns 100
 * 
 * // 6 items, all green: (12/12) * 100 = 100 XP  
 * calculateClassXP([2, 2, 2, 2, 2, 2]) // returns 100
 * 
 * // 4 items: 3 green, 1 yellow: (7/8) * 100 = 87.5 XP
 * calculateClassXP([2, 2, 2, 1]) // returns 87.5
 */
export function calculateClassXP(scores: (number | null | undefined)[]): number {
  // Filter out null/undefined scores (unentered items)
  const validScores = scores.filter((s): s is number => s !== null && s !== undefined);
  
  // If no valid scores, return 0
  if (validScores.length === 0) {
    return 0;
  }
  
  // Calculate max possible score (each item can be max 2 = Green)
  const maxPossibleScore = validScores.length * SCORE_VALUES.GREEN;
  
  // Calculate actual score sum
  const actualScore = validScores.reduce((sum, score) => sum + score, 0);
  
  // Apply normalization formula: (actual / max) * MAX_CLASS_XP
  const normalizedXP = (actualScore / maxPossibleScore) * MAX_CLASS_XP;
  
  // Round to 1 decimal place for cleaner display
  return Math.round(normalizedXP * 10) / 10;
}

/**
 * Calculate XP with bonus points
 * Bonus points are added on top of the normalized class XP
 * 
 * @param scores - Array of score values
 * @param bonusPoints - Extra points from coach (e.g., helping others, great effort)
 * @param homeworkPoints - Points for completing homework
 * @returns Total XP including bonuses
 */
export function calculateTotalSessionXP(
  scores: (number | null | undefined)[],
  bonusPoints: number = 0,
  homeworkPoints: number = 0
): number {
  const classXP = calculateClassXP(scores);
  return classXP + bonusPoints + homeworkPoints;
}

/**
 * Get performance rating based on XP percentage
 * @param xp - Normalized XP value (0-100)
 * @returns Performance rating
 */
export function getPerformanceRating(xp: number): 'excellent' | 'good' | 'average' | 'needs_improvement' {
  if (xp >= 90) return 'excellent';
  if (xp >= 75) return 'good';
  if (xp >= 50) return 'average';
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
