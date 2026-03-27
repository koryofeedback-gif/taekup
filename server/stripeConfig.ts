export const STRIPE_PRICE_IDS = {
  plans: {
    starter: {
      monthly: 'price_1TFaJARhYhunDn2jY0MItsea',
      yearly: 'price_1TFaJARhYhunDn2jVbK1dHFH',
      priceMonthly: 2499,
      priceYearly: 24990,
      studentLimit: 25
    },
    pro: {
      monthly: 'price_1TFaMCRhYhunDn2j8dxg6WWx',
      yearly: 'price_1TFaMCRhYhunDn2jZMzupYmI',
      priceMonthly: 3999,
      priceYearly: 39990,
      studentLimit: 50
    },
    standard: {
      monthly: 'price_1TFaP1RhYhunDn2juiDeGeNi',
      yearly: 'price_1TFaP1RhYhunDn2j3HEsdDj2',
      priceMonthly: 6900,
      priceYearly: 69000,
      studentLimit: 80
    },
    growth: {
      monthly: 'price_1TFaR8RhYhunDn2jQvta5yKC',
      yearly: 'price_1TFaR8RhYhunDn2j5X5uYrFI',
      priceMonthly: 12900,
      priceYearly: 129000,
      studentLimit: 150
    },
    empire: {
      monthly: 'price_1TFaTQRhYhunDn2j9HmYbDT0',
      yearly: 'price_1TFaTQRhYhunDn2jYBnPkFoj',
      priceMonthly: 19900,
      priceYearly: 199000,
      studentLimit: null
    }
  },
  parentPremium: {
    monthly: 'price_1TFa9URhYhunDn2jbBcc5aPl',
    priceMonthly: 499
  },
  universalAccess: {
    monthly: 'price_1TCiA0RhYhunDn2jksE9lwwn',
    pricePerUnit: 199
  }
};

export const EUROZONE_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE',
  'GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT',
  'RO','SK','SI','ES','SE','CH'
]);

export function getCurrencyForCountry(country: string | null | undefined): 'eur' | 'usd' {
  if (!country) return 'usd';
  return EUROZONE_COUNTRIES.has(country.toUpperCase()) ? 'eur' : 'usd';
}

export function getPlanByPriceId(priceId: string): { planId: string; interval: 'monthly' | 'yearly' } | null {
  for (const [planId, plan] of Object.entries(STRIPE_PRICE_IDS.plans)) {
    if (plan.monthly === priceId) return { planId, interval: 'monthly' };
    if (plan.yearly === priceId) return { planId, interval: 'yearly' };
  }
  return null;
}

export function isUniversalAccessPrice(priceId: string): boolean {
  return priceId === STRIPE_PRICE_IDS.universalAccess.monthly;
}

export function isParentPremiumPrice(priceId: string): boolean {
  return priceId === STRIPE_PRICE_IDS.parentPremium.monthly;
}
