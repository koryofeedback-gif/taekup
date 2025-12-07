import { getUncachableStripeClient } from '../server/stripeClient';

const SUBSCRIPTION_TIERS = [
  {
    name: 'Starter',
    description: 'Perfect for new dojos getting started. Up to 25 students.',
    monthlyPrice: 2499,
    metadata: {
      tier: 'starter',
      planId: 'starter',
      studentLimit: '25',
      features: 'Basic dashboard, Student management, Attendance tracking',
    },
  },
  {
    name: 'Pro',
    description: 'Sweet spot for small clubs. Up to 50 students with advanced features.',
    monthlyPrice: 3999,
    metadata: {
      tier: 'pro',
      planId: 'pro',
      studentLimit: '50',
      features: 'Everything in Starter + AI Class Planner, Parent Portal, Home Dojo',
    },
  },
  {
    name: 'Standard',
    description: 'For growing dojos ready to expand. Up to 80 students.',
    monthlyPrice: 6900,
    metadata: {
      tier: 'standard',
      planId: 'standard',
      studentLimit: '80',
      features: 'Everything in Pro + Dojang Rivals, TV Lobby Display, Custom Habits',
    },
  },
  {
    name: 'Growth',
    description: 'Serious martial arts businesses. Up to 150 students.',
    monthlyPrice: 12900,
    metadata: {
      tier: 'growth',
      planId: 'growth',
      studentLimit: '150',
      features: 'Everything in Standard + Multi-coach, Advanced Analytics, Priority Support',
    },
  },
  {
    name: 'Empire',
    description: 'Scale without limits. Unlimited students and locations.',
    monthlyPrice: 19900,
    metadata: {
      tier: 'empire',
      planId: 'empire',
      studentLimit: 'unlimited',
      features: 'Everything in Growth + Unlimited Students, Multi-location, White-label Options',
    },
  },
];

async function seedProducts() {
  console.log('🥋 TaekUp - Seeding Stripe Products...\n');
  
  const stripe = await getUncachableStripeClient();
  console.log('Connected to Stripe via Replit connector\n');

  for (const tier of SUBSCRIPTION_TIERS) {
    try {
      const existingProducts = await stripe.products.search({
        query: `name:'${tier.name}'`,
      });

      let product: any;

      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`Found existing product: ${tier.name} (${product.id})`);
        
        await stripe.products.update(product.id, {
          description: tier.description,
          metadata: tier.metadata,
        });
        console.log(`  Updated metadata for ${tier.name}`);
      } else {
        product = await stripe.products.create({
          name: tier.name,
          description: tier.description,
          metadata: tier.metadata,
        });
        console.log(`Created product: ${tier.name} (${product.id})`);
      }

      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      const hasMonthly = existingPrices.data.some((p: any) => p.recurring?.interval === 'month');
      const hasYearly = existingPrices.data.some((p: any) => p.recurring?.interval === 'year');

      if (!hasMonthly) {
        const monthlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.monthlyPrice,
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { tier: tier.metadata.tier, billing_period: 'monthly' },
        });
        console.log(`  Created monthly price: $${tier.monthlyPrice / 100}/mo (${monthlyPrice.id})`);
      } else {
        console.log(`  Monthly price already exists`);
      }

      if (!hasYearly) {
        const yearlyAmount = tier.monthlyPrice * 10;
        const yearlyPrice = await stripe.prices.create({
          product: product.id,
          unit_amount: yearlyAmount,
          currency: 'usd',
          recurring: { interval: 'year' },
          metadata: { tier: tier.metadata.tier, billing_period: 'yearly' },
        });
        console.log(`  Created yearly price: $${yearlyAmount / 100}/year (${yearlyPrice.id}) - 2 months free!`);
      } else {
        console.log(`  Yearly price already exists`);
      }

      console.log('');
    } catch (error: any) {
      console.error(`Error with ${tier.name}:`, error.message);
    }
  }

  console.log('✅ Product seeding complete!');
  console.log('\nYour Stripe sandbox now has all 5 TaekUp tiers with monthly and yearly pricing.');
}

seedProducts().catch(console.error);
