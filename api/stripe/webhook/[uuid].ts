import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { Pool } from 'pg';
import sgMail from '@sendgrid/mail';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

const EMAIL_TEMPLATES = {
  WELCOME: 'd-c75234cb326144f68395a66668081ee8',
};

async function sendWelcomeEmail(to: string, data: { ownerName: string; clubName: string }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Webhook] SendGrid API key not configured, skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }
  
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to,
      from: {
        email: 'hello@mytaek.com',
        name: 'TaekUp'
      },
      templateId: EMAIL_TEMPLATES.WELCOME,
      dynamicTemplateData: {
        ...data,
        ctaUrl: 'https://mytaek.com/setup',
        unsubscribeUrl: 'https://mytaek.com/email-preferences',
        privacyUrl: 'https://mytaek.com/privacy',
        dashboardUrl: 'https://mytaek.com/dashboard',
        loginUrl: 'https://mytaek.com/login',
        upgradeUrl: 'https://mytaek.com/pricing',
        helpUrl: 'https://mytaek.com/help',
      },
      subject: 'Welcome to TaekUp - Your 14-Day Trial Has Started!'
    };

    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('[Webhook] SendGrid error:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
}

async function handleCheckoutCompleted(session: any) {
  const client = await pool.connect();
  try {
    console.log('[Webhook] Checkout completed:', session.id);
    
    const customerEmail = session.customer_email || session.customer_details?.email;
    
    if (!customerEmail) {
      console.log('[Webhook] No customer email found');
      return;
    }

    const clubResult = await client.query(
      'SELECT id, name, owner_email, owner_name FROM clubs WHERE owner_email = $1 LIMIT 1',
      [customerEmail]
    );
    
    const club = clubResult.rows[0];
    
    if (club) {
      console.log('[Webhook] Found club for welcome email:', club.name);
      
      const alreadySent = await client.query(
        'SELECT id FROM email_log WHERE club_id = $1 AND email_type = $2 LIMIT 1',
        [club.id, 'welcome']
      );
      
      if (alreadySent.rows.length === 0) {
        const result = await sendWelcomeEmail(customerEmail, {
          ownerName: club.owner_name || 'Club Owner',
          clubName: club.name
        });
        
        if (result.success) {
          console.log('[Webhook] Welcome email sent to:', customerEmail);
          
          await client.query(
            `INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [club.id, customerEmail, 'welcome', 'Welcome to TaekUp', 'sent']
          );
        } else {
          await client.query(
            `INSERT INTO email_log (club_id, recipient, email_type, subject, status, error)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [club.id, customerEmail, 'welcome', 'Welcome to TaekUp', 'failed', result.error || 'Unknown error']
          );
        }
      }
    }
    
    await client.query(
      `INSERT INTO activity_log (event_type, description, metadata, created_at)
       VALUES ($1, $2, $3, NOW())`,
      ['checkout_completed', `Checkout completed for ${customerEmail}`, JSON.stringify({ sessionId: session.id, email: customerEmail })]
    );
    
  } catch (error: any) {
    console.error('[Webhook] Error handling checkout:', error.message);
  } finally {
    client.release();
  }
}

async function handleSubscriptionCreated(subscription: any, stripe: Stripe) {
  const client = await pool.connect();
  try {
    console.log('[Webhook] Subscription created:', subscription.id);
    
    const customer = await stripe.customers.retrieve(subscription.customer);
    
    if (!customer || (customer as any).deleted) {
      return;
    }

    const customerEmail = (customer as any).email;
    
    if (!customerEmail) {
      return;
    }

    const clubResult = await client.query(
      'SELECT id, name, owner_email, owner_name FROM clubs WHERE owner_email = $1 LIMIT 1',
      [customerEmail]
    );
    
    const club = clubResult.rows[0];
    
    if (club) {
      const alreadySent = await client.query(
        'SELECT id FROM email_log WHERE club_id = $1 AND email_type = $2 LIMIT 1',
        [club.id, 'welcome']
      );
      
      if (alreadySent.rows.length === 0) {
        const result = await sendWelcomeEmail(customerEmail, {
          ownerName: club.owner_name || 'Club Owner',
          clubName: club.name
        });
        
        if (result.success) {
          console.log('[Webhook] Welcome email sent via subscription event');
          
          await client.query(
            `INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [club.id, customerEmail, 'welcome', 'Welcome to TaekUp', 'sent']
          );
        }
      }
    }
    
    await client.query(
      `INSERT INTO activity_log (event_type, description, metadata, created_at)
       VALUES ($1, $2, $3, NOW())`,
      ['subscription_created', `New subscription for ${customerEmail}`, JSON.stringify({ subscriptionId: subscription.id, email: customerEmail })]
    );
    
  } catch (error: any) {
    console.error('[Webhook] Error handling subscription:', error.message);
  } finally {
    client.release();
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!stripeSecretKey) {
    console.error('[Webhook] STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const stripe = new Stripe(stripeSecretKey);
  
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  let event: Stripe.Event;
  
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature as string,
        webhookSecret
      );
    } else {
      event = JSON.parse(rawBody.toString()) as Stripe.Event;
      console.warn('[Webhook] No webhook secret configured, skipping signature verification');
    }
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  console.log('[Webhook] Received event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, stripe);
        break;
      default:
        console.log('[Webhook] Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('[Webhook] Error processing event:', error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
