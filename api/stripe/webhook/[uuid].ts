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
  PAYMENT_CONFIRMATION: 'd-50996268ba834a5b92150d29935fd2a8',
};

async function sendPaymentConfirmationEmail(
  to: string, 
  data: { 
    ownerName: string; 
    clubName: string; 
    planName: string;
    amount: string;
    billingPeriod: string;
  }
) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Webhook] SendGrid API key not configured, skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }
  
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const msg = {
      to,
      from: {
        email: 'noreply@mytaek.com',
        name: 'TaekUp'
      },
      templateId: EMAIL_TEMPLATES.PAYMENT_CONFIRMATION,
      dynamicTemplateData: {
        ...data,
        ctaUrl: 'https://mytaek.com/wizard',
        manageSubscriptionUrl: 'https://mytaek.com/app/admin?tab=billing',
        unsubscribeUrl: 'https://mytaek.com/email-preferences',
        privacyUrl: 'https://mytaek.com/privacy',
        dashboardUrl: 'https://mytaek.com/dashboard',
        loginUrl: 'https://mytaek.com/login',
        helpUrl: 'https://mytaek.com/help',
      },
      subject: `Payment Confirmed - Let's Set Up Your Club!`
    };

    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('[Webhook] SendGrid error:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
}

async function handleCheckoutCompleted(session: any, stripe: Stripe) {
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
      console.log('[Webhook] Found club for payment confirmation:', club.name);
      
      const alreadySent = await client.query(
        'SELECT id FROM email_log WHERE club_id = $1 AND email_type = $2 LIMIT 1',
        [club.id, 'payment_confirmation']
      );
      
      if (alreadySent.rows.length === 0) {
        let planName = 'TaekUp Plan';
        let amount = '';
        let billingPeriod = 'monthly';
        
        if (session.line_items?.data?.[0]) {
          const item = session.line_items.data[0];
          planName = item.description || planName;
          amount = `$${(item.amount_total / 100).toFixed(2)}`;
        } else if (session.amount_total) {
          amount = `$${(session.amount_total / 100).toFixed(2)}`;
        }
        
        if (session.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            if (subscription.items?.data?.[0]?.price) {
              const price = subscription.items.data[0].price;
              billingPeriod = price.recurring?.interval === 'year' ? 'yearly' : 'monthly';
              if (price.product) {
                const product = await stripe.products.retrieve(price.product as string);
                planName = product.name || planName;
              }
            }
          } catch (err) {
            console.log('[Webhook] Could not fetch subscription details');
          }
        }

        const result = await sendPaymentConfirmationEmail(customerEmail, {
          ownerName: club.owner_name || 'Club Owner',
          clubName: club.name,
          planName,
          amount,
          billingPeriod
        });
        
        if (result.success) {
          console.log('[Webhook] Payment confirmation email sent to:', customerEmail);
          
          await client.query(
            `INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [club.id, customerEmail, 'payment_confirmation', 'Payment Confirmed', 'sent']
          );
        } else {
          await client.query(
            `INSERT INTO email_log (club_id, recipient, email_type, subject, status, error)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [club.id, customerEmail, 'payment_confirmation', 'Payment Confirmed', 'failed', result.error || 'Unknown error']
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

async function handlePaymentSucceeded(invoice: any, stripe: Stripe) {
  const client = await pool.connect();
  try {
    console.log('[Webhook] Payment succeeded:', invoice.id);
    
    const customer = await stripe.customers.retrieve(invoice.customer);
    
    if (!customer || (customer as any).deleted) {
      console.log('[Webhook] Customer not found or deleted');
      return;
    }

    const customerEmail = (customer as any).email;
    const amount = invoice.amount_paid || 0;
    const currency = invoice.currency || 'usd';
    
    let clubId = null;
    let club = null;
    
    if (customerEmail) {
      const clubResult = await client.query(
        'SELECT id, name, owner_email, owner_name FROM clubs WHERE owner_email = $1 LIMIT 1',
        [customerEmail]
      );
      club = clubResult.rows[0];
      clubId = club?.id || null;
    }

    await client.query(
      `INSERT INTO payments (
        club_id, stripe_invoice_id, stripe_payment_intent_id, 
        amount, currency, status, paid_at, period_start, period_end, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        clubId,
        invoice.id,
        invoice.payment_intent || null,
        amount,
        currency,
        'succeeded',
        invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date(),
        invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        invoice.period_end ? new Date(invoice.period_end * 1000) : null
      ]
    );

    console.log('[Webhook] Payment saved to database:', invoice.id, 'Amount:', amount);

    if (club && customerEmail) {
      const planName = invoice.lines?.data?.[0]?.description || 'TaekUp Plan';
      const billingPeriod = invoice.lines?.data?.[0]?.period ? 
        (invoice.lines.data[0].period.end - invoice.lines.data[0].period.start > 60 * 60 * 24 * 35 ? 'Annual' : 'Monthly') 
        : 'Monthly';
      
      const result = await sendPaymentConfirmationEmail(customerEmail, {
        ownerName: club.owner_name || 'Club Owner',
        clubName: club.name,
        planName: planName,
        amount: '$' + (amount / 100).toFixed(2),
        billingPeriod: billingPeriod
      });

      if (result.success) {
        console.log('[Webhook] Payment confirmation email sent to:', customerEmail);
      }
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        'payment_succeeded',
        'Payment Received',
        `Payment of $${(amount / 100).toFixed(2)} received from ${customerEmail || 'unknown'}`,
        clubId,
        JSON.stringify({ invoiceId: invoice.id, amount, currency, email: customerEmail })
      ]
    );
    
  } catch (error: any) {
    console.error('[Webhook] Error handling payment succeeded:', error.message);
  } finally {
    client.release();
  }
}

async function handlePaymentFailed(invoice: any, stripe: Stripe) {
  const client = await pool.connect();
  try {
    console.log('[Webhook] Payment failed:', invoice.id);
    
    const customer = await stripe.customers.retrieve(invoice.customer);
    
    if (!customer || (customer as any).deleted) {
      return;
    }

    const customerEmail = (customer as any).email;
    const amount = invoice.amount_due || 0;
    const currency = invoice.currency || 'usd';
    
    let clubId = null;
    
    if (customerEmail) {
      const clubResult = await client.query(
        'SELECT id FROM clubs WHERE owner_email = $1 LIMIT 1',
        [customerEmail]
      );
      clubId = clubResult.rows[0]?.id || null;
    }

    await client.query(
      `INSERT INTO payments (
        club_id, stripe_invoice_id, stripe_payment_intent_id, 
        amount, currency, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        clubId,
        invoice.id,
        invoice.payment_intent || null,
        amount,
        currency,
        'failed'
      ]
    );

    console.log('[Webhook] Failed payment saved to database:', invoice.id);

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        'payment_failed',
        'Payment Failed',
        `Payment of $${(amount / 100).toFixed(2)} failed for ${customerEmail || 'unknown'}`,
        clubId,
        JSON.stringify({ invoiceId: invoice.id, amount, currency, email: customerEmail })
      ]
    );
    
  } catch (error: any) {
    console.error('[Webhook] Error handling payment failed:', error.message);
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

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.SANDBOX_STRIPE_KEY;
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
        await handleCheckoutCompleted(event.data.object, stripe);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, stripe);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object, stripe);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object, stripe);
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
