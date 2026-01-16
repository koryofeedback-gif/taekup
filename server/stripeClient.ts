import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  
  // In production, prefer production Stripe keys
  if (isProduction && process.env.STRIPE_SECRET_KEY) {
    console.log('[Stripe] Using production keys');
    return {
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY,
    };
  }

  // In development/testing, use sandbox keys if available
  if (process.env.SANDBOX_STRIPE_KEY) {
    console.log('[Stripe] Using sandbox keys');
    return {
      publishableKey: process.env.SANDBOX_STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.SANDBOX_STRIPE_KEY,
    };
  }

  // Fallback to production keys if no sandbox
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('[Stripe] Using production keys (fallback)');
    return {
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY,
    };
  }

  // Fallback to Replit connector system
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('Stripe credentials not found. Set STRIPE_SECRET_KEY or configure Replit connector.');
  }

  const connectorName = 'stripe';
  const isProductionDeployment = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProductionDeployment ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey);
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
