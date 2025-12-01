import type { SubscriptionPlan, SubscriptionPlanId, SubscriptionStatus, Student } from '../types';

// PRICING STRATEGY: Undercut Kicksite ($49/$99/$149/$199) at every level.
// ALL plans get full features (App, Portal, AI). We only limit by student count.
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 24.99,
    studentLimit: 25,
    icon: '🥋',
    features: [
      'Up to 25 Students',
      'Full AI Features',
      'Parent Portal App',
      'Revenue Share (70%)'
    ]
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 59.00,
    studentLimit: 75,
    icon: '👊',
    popular: true,
    features: [
      'Up to 75 Students',
      'Everything in Starter',
      'Multi-Location Support',
      'Priority Support'
    ]
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 129.00,
    studentLimit: 150,
    icon: '🚀',
    features: [
      'Up to 150 Students',
      'Everything in Standard',
      'Advanced Analytics',
      'Dedicated Success Mgr'
    ]
  },
  {
    id: 'empire',
    name: 'Empire',
    price: 199.00,
    studentLimit: null,
    icon: '👑',
    features: [
      'UNLIMITED Students',
      'Everything in Growth',
      'White-Label Domain',
      'API Access'
    ]
  }
];

const TRIAL_DURATION_DAYS = 14;
const SUBSCRIPTION_STORAGE_KEY = 'taekup_subscription';

export const getTrialEndDate = (startDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_DURATION_DAYS);
  return end.toISOString();
};

export const getDaysRemaining = (trialEndDate: string): number => {
  const now = new Date();
  const end = new Date(trialEndDate);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

export const isTrialExpired = (trialEndDate: string): boolean => {
  return getDaysRemaining(trialEndDate) <= 0;
};

export const getRequiredPlan = (studentCount: number): SubscriptionPlan => {
  for (const plan of SUBSCRIPTION_PLANS) {
    if (plan.studentLimit === null || studentCount <= plan.studentLimit) {
      return plan;
    }
  }
  return SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1];
};

export const canStudentCountFitPlan = (studentCount: number, planId: SubscriptionPlanId): boolean => {
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  if (!plan) return false;
  if (plan.studentLimit === null) return true;
  return studentCount <= plan.studentLimit;
};

export const initSubscription = (trialStartDate?: string): SubscriptionStatus => {
  const startDate = trialStartDate || new Date().toISOString();
  const endDate = getTrialEndDate(startDate);
  
  return {
    planId: null,
    trialStartDate: startDate,
    trialEndDate: endDate,
    isTrialActive: !isTrialExpired(endDate),
    isLocked: false
  };
};

export const loadSubscription = (): SubscriptionStatus | null => {
  const saved = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
  if (!saved) return null;
  
  try {
    const status: SubscriptionStatus = JSON.parse(saved);
    status.isTrialActive = !isTrialExpired(status.trialEndDate) && !status.planId;
    status.isLocked = isTrialExpired(status.trialEndDate) && !status.planId;
    return status;
  } catch {
    return null;
  }
};

export const saveSubscription = (status: SubscriptionStatus): void => {
  localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(status));
};

export const updateSubscriptionPlan = (
  currentStatus: SubscriptionStatus,
  planId: SubscriptionPlanId,
  stripeCustomerId?: string,
  stripeSubscriptionId?: string
): SubscriptionStatus => {
  const updated: SubscriptionStatus = {
    ...currentStatus,
    planId,
    isTrialActive: false,
    isLocked: false,
    stripeCustomerId,
    stripeSubscriptionId
  };
  saveSubscription(updated);
  return updated;
};

export const checkAccountStatus = (
  students: Student[],
  subscription: SubscriptionStatus | null
): { isLocked: boolean; requiredPlan: SubscriptionPlan | null; daysRemaining: number } => {
  if (!subscription) {
    return { isLocked: false, requiredPlan: null, daysRemaining: 14 };
  }

  const daysRemaining = getDaysRemaining(subscription.trialEndDate);

  if (subscription.planId) {
    const currentPlan = SUBSCRIPTION_PLANS.find(p => p.id === subscription.planId);
    if (currentPlan && !canStudentCountFitPlan(students.length, subscription.planId)) {
      return {
        isLocked: true,
        requiredPlan: getRequiredPlan(students.length),
        daysRemaining: 0
      };
    }
    return { isLocked: false, requiredPlan: null, daysRemaining: 0 };
  }

  if (daysRemaining <= 0) {
    return {
      isLocked: true,
      requiredPlan: getRequiredPlan(students.length),
      daysRemaining: 0
    };
  }

  return { isLocked: false, requiredPlan: null, daysRemaining };
};

export const formatPrice = (price: number): string => {
  return `$${price.toFixed(2)}`;
};

export const getPlanById = (planId: SubscriptionPlanId): SubscriptionPlan | undefined => {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId);
};
