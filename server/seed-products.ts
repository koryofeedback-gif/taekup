import { getUncachableStripeClient } from './stripeClient';

const SUBSCRIPTION_TIERS = [
  {
    name: 'Starter',
    description: 'Perfect for new dojos getting started. Up to 25 students.',
    price: 2499,
    metadata: {
      tier: 'starter',
      studentLimit: '25',
      features: 'Basic dashboard, Student management, Attendance tracking',
    },
  },
  {
    name: 'Pro',
    description: 'Sweet spot for small clubs. Up to 50 students with advanced features.',
    price: 3999,
    metadata: {
      tier: 'pro',
      studentLimit: '50',
      features: 'Everything in Starter + AI Class Planner, Parent Portal, Home Dojo',
    },
  },
  {
    name: 'Standard',
    description: 'For growing dojos ready to expand. Up to 80 students.',
    price: 6900,
    metadata: {
      tier: 'standard',
      studentLimit: '80',
      features: 'Everything in Pro + Dojang Rivals, TV Lobby Display, Custom Habits',
    },
  },
  {
    name: 'Growth',
    description: 'Serious martial arts businesses. Up to 150 students.',
    price: 12900,
    metadata: {
      tier: 'growth',
      studentLimit: '150',
      features: 'Everything in Standard + Multi-coach, Advanced Analytics, Priority Support',
    },
  },
  {
    name: 'Empire',
    description: 'Scale without limits. Unlimited students and locations.',
    price: 19900,
    metadata: {
      tier: 'empire',
      studentLimit: 'unlimited',
      features: 'Everything in Growth + Unlimited Students, Multi-location, White-label Options',
    },
  },
];

async function seedProducts() {
  console.log('Starting product seeding...');
  
  const stripe = await getUncachableStripeClient();

  for (const tier of SUBSCRIPTION_TIERS) {
    try {
      const existingProducts = await stripe.products.search({
        query: `name:'${tier.name}'`,
      });

      if (existingProducts.data.length > 0) {
        console.log(`Product "${tier.name}" already exists, skipping...`);
        continue;
      }

      console.log(`Creating product: ${tier.name}...`);
      
      const product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: tier.metadata,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.price,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { tier: tier.metadata.tier },
      });

      console.log(`  Created: ${product.id} with price ${price.id} ($${tier.price / 100}/mo)`);
    } catch (error: any) {
      console.error(`  Error creating ${tier.name}:`, error.message);
    }
  }

  console.log('Product seeding complete!');
}

seedProducts().catch(console.error);
