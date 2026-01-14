export const STRIPE_PRICE_IDS = {
  plans: {
    starter: {
      monthly: 'price_1SZoz4RhYhunDn2jDjwkY5Fx',
      yearly: 'price_1Sp56uRhYhunDn2j9WtffKIG',
      priceMonthly: 2499,
      priceYearly: 24990,
      studentLimit: 25
    },
    pro: {
      monthly: 'price_1SZoz4RhYhunDn2jdXdbzXD4',
      yearly: 'price_1Sp57iRhYhunDn2jIkLf4Gcn',
      priceMonthly: 3999,
      priceYearly: 39990,
      studentLimit: 50
    },
    standard: {
      monthly: 'price_1SZoz3RhYhunDn2j2oq4TkDl',
      yearly: 'price_1Sp58RRhYhunDn2jShy6IXdw',
      priceMonthly: 6900,
      priceYearly: 69000,
      studentLimit: 80
    },
    growth: {
      monthly: 'price_1SZoz3RhYhunDn2jXlatF7uE',
      yearly: 'price_1Sp59JRhYhunDn2jjEGgqK2k',
      priceMonthly: 12900,
      priceYearly: 129000,
      studentLimit: 150
    },
    empire: {
      monthly: 'price_1SZoz3RhYhunDn2jKFlLP7eH',
      yearly: 'price_1Sp59xRhYhunDn2jIzARKLiS',
      priceMonthly: 19900,
      priceYearly: 199000,
      studentLimit: null
    }
  },
  parentPremium: {
    monthly: 'price_1Sp5BPRhYhunDn2j6Yz8dSxD',
    priceMonthly: 499
  },
  universalAccess: {
    metered: 'price_1Sp5trRhYhunDn2jrTOtUvyR',
    pricePerUnit: 199
  }
};

export function getPlanByPriceId(priceId: string): { planId: string; interval: 'monthly' | 'yearly' } | null {
  for (const [planId, plan] of Object.entries(STRIPE_PRICE_IDS.plans)) {
    if (plan.monthly === priceId) return { planId, interval: 'monthly' };
    if (plan.yearly === priceId) return { planId, interval: 'yearly' };
  }
  return null;
}

export function isUniversalAccessPrice(priceId: string): boolean {
  return priceId === STRIPE_PRICE_IDS.universalAccess.metered;
}

export function isParentPremiumPrice(priceId: string): boolean {
  return priceId === STRIPE_PRICE_IDS.parentPremium.monthly;
}
