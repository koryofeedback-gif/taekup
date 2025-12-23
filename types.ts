
export interface Message {
  sender: 'user' | 'bot';
  text: string;
}

export interface SignupData {
  clubName: string;
  email: string;
  country: string;
  password?: string;
  trialStartDate?: string;
  clubId?: string;
}

export interface Belt {
  id: string;
  name: string;
  color1: string;
  color2?: string;
}

export interface Skill {
  id: string;
  name: string;
  isActive: boolean;
  isCustom: boolean;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  location: string;
  assignedClasses?: string[]; // New: List of class names this coach teaches
  password?: string; // Added password for auth check
}

export interface PerformanceRecord {
  date: string; // ISO date string
  scores: Record<string, number | null>; // skillId: score
  bonusPoints?: number;
  note?: string; // Coach note for this session
  coachName?: string; // Coach who recorded this
}

export interface FeedbackRecord {
  date: string; // ISO date string
  text: string;
  coachName: string;
  isAIGenerated: boolean;
}

export interface CurriculumItem {
    id: string;
    beltId: string;
    title: string;
    url: string;
    description: string;
    duration?: string;
    authorId?: string;
    authorName?: string;
    category?: string;
    courseId?: string;
    contentType?: 'video' | 'document' | 'quiz';
    status?: 'draft' | 'live' | 'archived';
    pricingType?: 'free' | 'premium' | 'course_only';
    price?: number;
    xpReward?: number;
    orderIndex?: number;
    viewCount?: number;
    completionCount?: number;
    thumbnailUrl?: string;
    publishAt?: string; // ISO date for scheduled publishing
}

export interface CurriculumCourse {
    id: string;
    clubId?: string;
    title: string;
    description?: string;
    coverImageUrl?: string;
    beltId?: string;
    price?: number;
    status?: 'draft' | 'live' | 'archived';
    orderIndex?: number;
    xpReward?: number;
    estimatedMinutes?: number;
    items?: CurriculumItem[];
}

export interface ScheduleItem {
    id: string;
    day: string; // "Monday", "Tuesday", etc.
    time: string; // "17:00"
    className: string;
    instructor: string;
    beltRequirement: string; // "All" or specific belt ID
    location: string;
}

export interface CalendarEvent {
    id: string;
    title: string;
    date: string; // ISO Date
    time: string;
    location: string;
    description: string;
    type: 'competition' | 'test' | 'seminar' | 'social';
}

export interface PrivateSlot {
    id: string;
    coachName: string;
    date: string;
    time: string;
    price: number;
    isBooked: boolean;
    bookedByStudentId?: string;
}

export interface SparringStats {
    matches: number;
    wins: number;
    draws: number;
    headKicks: number;
    bodyKicks: number;
    punches: number;
    takedowns: number;
    defense: number; // percentage
}

export interface Challenge {
    id: string;
    challengerId: string;
    opponentId: string;
    exercise: string;
    challengerScore: number;
    opponentScore?: number;
    status: 'pending' | 'completed';
    winnerId?: string;
    date: string;
}

export type ChallengeCategory = 'Power' | 'Technique' | 'Flexibility' | 'Custom';

export interface CustomChallenge {
    id: string;
    name: string;
    description: string;
    category: ChallengeCategory;
    icon: string;
    xp: number;
    videoUrl?: string;
    difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
    measurementType: 'count' | 'time' | 'distance' | 'score';
    measurementUnit: string;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    isActive: boolean;
    targetAudience: 'all' | 'beginners' | 'intermediate' | 'advanced';
    weeklyChallenge?: boolean;
    expiresAt?: string;
}

export interface LifeSkill {
    id: string;
    name: string;
    completed: boolean;
    date: string;
}

export interface Habit {
    id: string;
    question: string; // "Did Hami make his bed?"
    category: 'Character' | 'Chores' | 'School' | 'Health' | 'Custom' | 'Martial Arts' | 'Family';
    icon: string;
    isActive: boolean;
    isCustom?: boolean; // True if created by parent
}

// Dojang Rivals stats for gamification
export interface RivalsStats {
  xp: number;
  wins: number;
  losses: number;
  streak: number;
  dailyStreak: number;
  lastChallengeDate?: string;
  teamBattlesWon: number;
  familyChallengesCompleted: number;
  mysteryBoxCompleted: number;
}

export interface Student {
  id: string;
  clubId?: string; // Club UUID for challenge submissions
  name: string;
  photo?: string | null; // New field for student profile photo
  birthday: string;
  age?: number; // New field for direct age entry
  beltId: string;
  stripes: number;
  parentName?: string; // New field
  parentEmail: string;
  parentPhone?: string; // New field
  parentPassword?: string; // Password for parent login account
  location?: string; // New field
  assignedClass?: string; // New field for Class/Group assignment
  totalPoints: number;
  // New fields for Student Profile
  joinDate: string; // ISO date string
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  medicalInfo?: string;
  attendanceCount: number;
  lastPromotionDate: string; // ISO date string
  isReadyForGrading: boolean; // New field for customizable grading requirement
  performanceHistory: PerformanceRecord[];
  feedbackHistory: FeedbackRecord[];
  sparringStats?: SparringStats; // New: UFC Fighter Card data
  badges: string[]; // New: For gamification rewards
  lifeSkillsHistory: LifeSkill[]; // Log of completed habits
  customHabits: Habit[]; // Personalized list of questions
  rivalsStats?: RivalsStats; // Dojang Rivals engagement data
  completedContentIds?: string[]; // IDs of completed curriculum content for XP tracking
  lifetimeXp?: number; // Normalized XP for Dojang Rivals (never resets)
  totalXP?: number; // Database total_xp - single source of truth for all XP
}

// Holiday Schedule Types for Black Belt Time Machine accuracy
export type HolidayScheduleType = 'minimal' | 'school_holidays' | 'extended' | 'custom';

export interface HolidaySchedule {
  type: HolidayScheduleType;
  weeksClosedPerYear: number; // Total weeks closed annually
  description: string;
}

// Preset holiday schedules
export const HOLIDAY_PRESETS: Record<HolidayScheduleType, HolidaySchedule> = {
  minimal: {
    type: 'minimal',
    weeksClosedPerYear: 2,
    description: 'Only major holidays (Christmas, New Year)'
  },
  school_holidays: {
    type: 'school_holidays',
    weeksClosedPerYear: 8,
    description: 'Follows school calendar (summer, winter, spring breaks)'
  },
  extended: {
    type: 'extended',
    weeksClosedPerYear: 12,
    description: 'Extended breaks + all public holidays'
  },
  custom: {
    type: 'custom',
    weeksClosedPerYear: 4,
    description: 'Custom schedule'
  }
};

// Subscription Plan Types - 5-Tier "Ladder of Success"
export type SubscriptionPlanId = 'starter' | 'pro' | 'standard' | 'growth' | 'empire';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  price: number; // Monthly price in dollars
  studentLimit: number | null; // null = unlimited
  features: string[];
  icon: string; // emoji
  popular?: boolean;
}

export interface SubscriptionStatus {
  planId: SubscriptionPlanId | null;
  trialStartDate: string; // ISO date string
  trialEndDate: string; // ISO date string
  isTrialActive: boolean;
  isLocked: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface WizardData {
  clubName: string;
  ownerName: string;
  ownerEmail?: string; // Owner's email for Stripe Connect etc.
  country: string;
  language: string; // New field for App/AI Language
  city: string;
  branches: number;
  branchNames: string[]; // New field to store custom names of locations
  branchAddresses: string[]; // New field for anti-cheat physical addresses
  logo?: File | string | null;
  slogan: string;
  // Step 2 fields
  beltSystemType: 'wt' | 'itf' | 'karate' | 'bjj' | 'judo' | 'hapkido' | 'tangsoodo' | 'aikido' | 'kravmaga' | 'kungfu' | 'custom';
  belts: Belt[];
  stripesPerBelt: number;
  // Step 3 fields
  skills: Skill[];
  homeworkBonus: boolean;
  coachBonus: boolean;
  // Step 4 fields
  pointsPerStripe: number;
  useCustomPointsPerBelt: boolean; // New field for toggle
  pointsPerBelt: Record<string, number>; // New field for map: beltId -> points
  useColorCodedStripes: boolean;
  stripeColors: string[];
  gradingRequirementEnabled: boolean; // Replaced poomsaeRequired
  gradingRequirementName: string; // e.g., "Poomsae", "Kata", "Technique"
  // Step 5 fields
  coaches: Coach[];
  students: Student[];
  // Step 6 fields
  primaryColor: string;
  themeStyle: 'modern' | 'classic' | 'minimal';
  clubPhoto?: File | string | null;
  welcomeBanner: string;
  // Content
  curriculum: CurriculumItem[];
  courses?: CurriculumCourse[];
  customVideoTags?: string[];
  classes: string[]; // Flat list of all unique class names (legacy/fallback)
  locationClasses: Record<string, string[]>; // MAP: Location Name -> List of Class Names
  // Scheduling
  schedule: ScheduleItem[];
  events: CalendarEvent[];
  privateSlots: PrivateSlot[];
  // Billing Features
  clubSponsoredPremium: boolean; // New: Club pays for parents
  challenges: Challenge[]; // New: Store active challenges
  customChallenges: CustomChallenge[]; // Coach-created custom challenges
  // Holiday Schedule for Time Machine accuracy
  holidaySchedule: HolidayScheduleType;
  customHolidayWeeks?: number; // Only used when holidaySchedule is 'custom'
  // World Rankings participation
  worldRankingsEnabled?: boolean;
  // Selected subscription plan index for Profit Engine Simulator
  selectedPlanIndex?: number;
}
