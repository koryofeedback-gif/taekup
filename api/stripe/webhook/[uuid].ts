import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import sgMail from '@sendgrid/mail';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

const MASTER_TEMPLATE_ID = process.env.SENDGRID_MASTER_TEMPLATE_ID || 'd-4dcfd1bfcaca4eb2a8af8085810c10c2';
const LOGO_URL = 'https://www.mytaek.com/mytaek-logo.png';

let _emailContentCache: Record<string, Record<string, any>> | null = null;
function getEmailContentI18n(): Record<string, Record<string, any>> {
  if (_emailContentCache) return _emailContentCache;
  try {
    const filePath = path.join(process.cwd(), 'server', 'utils', 'emailContent.json');
    _emailContentCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    _emailContentCache = {};
  }
  return _emailContentCache!;
}

function normalizeLanguageCode(lang: string | undefined | null): string {
  if (!lang) return 'en';
  const code = lang.toLowerCase().slice(0, 2);
  const langNameMap: Record<string, string> = { english: 'en', french: 'fr', german: 'de', spanish: 'es', farsi: 'fa', persian: 'fa' };
  return langNameMap[lang.toLowerCase()] || (['en', 'fr', 'de', 'es', 'fa'].includes(code) ? code : 'en');
}

function replacePlaceholders(text: string, data: Record<string, any>): string {
  let result = text;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
  });
  return result;
}

async function sendPaymentConfirmationEmail(
  to: string, 
  data: { 
    ownerName: string; 
    clubName: string; 
    planName: string;
    amount: string;
    billingPeriod: string;
  },
  language?: string
) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[Webhook] SendGrid API key not configured, skipping email');
    return { success: false, error: 'SendGrid not configured' };
  }
  
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const lang = normalizeLanguageCode(language);
    
    let subject = `Payment Confirmed - Let's Set Up Your Club!`;
    let title = 'Payment Successful';
    let body = `Hi ${data.ownerName},<br><br>Thanks for your payment of <strong>${data.amount}</strong> for <strong>${data.planName}</strong> (${data.billingPeriod}).<br><br>Your club <strong>${data.clubName}</strong> is ready to go!`;
    let btnText = 'Go to Dashboard';

    const i18nData = getEmailContentI18n();
    const translated = i18nData['payment_receipt']?.[lang];
    if (translated) {
      const placeholders = { name: data.ownerName, amount: data.amount, planName: data.planName, billingPeriod: data.billingPeriod, clubName: data.clubName, nextBillingDate: '', invoiceNumber: '' };
      subject = replacePlaceholders(translated.subject, placeholders);
      title = replacePlaceholders(translated.title, placeholders);
      body = replacePlaceholders(translated.body, placeholders);
      btnText = translated.btn_text || btnText;
    }
    
    await sgMail.send({
      to,
      from: { email: 'billing@mytaek.com', name: 'MyTaek' },
      subject,
      templateId: MASTER_TEMPLATE_ID,
      dynamicTemplateData: {
        subject,
        title,
        body_content: body,
        btn_text: btnText,
        btn_url: 'https://mytaek.com/app/admin?tab=billing',
        is_rtl: lang === 'fa',
        image_url: LOGO_URL,
      },
    });
    console.log(`[Webhook] Payment email sent to ${to} in ${lang}`);
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
      'SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE owner_email = $1 LIMIT 1',
      [customerEmail]
    );
    
    const club = clubResult.rows[0];
    
    if (session.metadata?.type === 'parent_premium') {
      const studentId = session.metadata.studentId;
      const clubId = session.metadata.clubId;
      console.log('[Webhook] Parent premium checkout completed for student:', studentId);

      if (studentId) {
        await client.query(
          `UPDATE students SET premium_status = 'parent_paid', premium_started_at = NOW() WHERE id = $1::uuid`,
          [studentId]
        );
        console.log('[Webhook] Student premium_status updated to parent_paid:', studentId);

        let studentName = 'Student';
        let clubName = 'Club';
        let clubLang = 'en';
        try {
          const studentResult = await client.query(
            `SELECT s.name, s.club_id, c.name as club_name, c.wizard_data
             FROM students s JOIN clubs c ON s.club_id = c.id
             WHERE s.id = $1::uuid LIMIT 1`,
            [studentId]
          );
          if (studentResult.rows[0]) {
            studentName = studentResult.rows[0].name;
            clubName = studentResult.rows[0].club_name;
            clubLang = normalizeLanguageCode(studentResult.rows[0].wizard_data?.language);
          }
        } catch (lookupErr: any) {
          console.error('[Webhook] Student lookup error:', lookupErr.message);
        }

        const amount = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : '$4.99';

        if (process.env.SENDGRID_API_KEY && customerEmail) {
          const parentName = session.customer_details?.name || customerEmail.split('@')[0];

          try {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);

            await sgMail.send({
              to: customerEmail,
              from: { email: 'billing@mytaek.com', name: 'MyTaek' },
              subject: `TaekUp Premium is now active for ${studentName}!`,
              templateId: MASTER_TEMPLATE_ID,
              dynamicTemplateData: {
                subject: `TaekUp Premium is now active for ${studentName}!`,
                title: 'Premium Activated',
                body_content: `Hi ${parentName},<br><br>Thank you for your payment of <strong>${amount}/month</strong>. TaekUp Premium is now active for <strong>${studentName}</strong> at <strong>${clubName}</strong>!<br><br>Premium features unlocked:<br>• Global Shogun Rank™<br>• AI Belt Predictions (ChronosBelt™)<br>• Custom Home Habits (7 daily)<br>• Video Proof 2x HonorXP™ Multiplier<br>• Digital Trophy Case<br><br>Enjoy the full experience!`,
                btn_text: 'Open Parent Portal',
                btn_url: `https://mytaek.com/app/parent/${studentId}`,
                is_rtl: clubLang === 'fa',
                image_url: LOGO_URL,
              },
            });
            console.log('[Webhook] Parent premium confirmation email sent to:', customerEmail);
          } catch (emailErr: any) {
            console.error('[Webhook] Parent premium email error:', emailErr.message);
          }

          try {
            await sgMail.send({
              to: 'billing@mytaek.com',
              from: { email: 'noreply@mytaek.com', name: 'TaekUp Platform' },
              subject: `🌟 Parent Premium: ${amount} from ${customerEmail}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; border-radius: 12px;">
                  <h2 style="color: #f59e0b; margin-bottom: 20px;">🌟 New Parent Premium Subscription</h2>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; color: #9ca3af; width: 140px;">Parent</td><td style="padding: 8px 0; color: #fff; font-weight: bold;">${parentName}</td></tr>
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Parent Email</td><td style="padding: 8px 0;"><a href="mailto:${customerEmail}" style="color: #22d3ee;">${customerEmail}</a></td></tr>
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Student</td><td style="padding: 8px 0; color: #fff; font-weight: bold;">${studentName}</td></tr>
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Club</td><td style="padding: 8px 0; color: #fff;">${clubName}</td></tr>
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Amount</td><td style="padding: 8px 0; color: #4ade80; font-weight: bold; font-size: 18px;">${amount}/mo</td></tr>
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Session</td><td style="padding: 8px 0; color: #fff;">${session.id}</td></tr>
                  </table>
                  <hr style="border: 1px solid #333; margin: 20px 0;" />
                  <p style="color: #6b7280; font-size: 12px;">Received at ${new Date().toISOString()}</p>
                </div>
              `,
            });
            console.log('[Webhook] Admin notification sent for parent premium');
          } catch (adminErr: any) {
            console.error('[Webhook] Admin parent premium notification error:', adminErr.message);
          }
        }

        await client.query(
          `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            'parent_premium_activated',
            'Parent Premium Activated',
            `Parent premium activated for ${studentName} (${customerEmail})`,
            clubId || null,
            JSON.stringify({ sessionId: session.id, studentId, email: customerEmail, amount })
          ]
        );
      }
    } else if (club) {
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

        const clubLang = normalizeLanguageCode(club.wizard_data?.language);
        const result = await sendPaymentConfirmationEmail(customerEmail, {
          ownerName: club.owner_name || 'Club Owner',
          clubName: club.name,
          planName,
          amount,
          billingPeriod
        }, clubLang);
        
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
    let isParentPremium = false;
    
    const subscriptionMeta = invoice.subscription_details?.metadata || invoice.lines?.data?.[0]?.metadata || {};
    if (subscriptionMeta.type === 'parent_premium') {
      isParentPremium = true;
      const studentId = subscriptionMeta.studentId;
      if (studentId) {
        try {
          const studentResult = await client.query(
            'SELECT club_id FROM students WHERE id = $1::uuid LIMIT 1',
            [studentId]
          );
          clubId = studentResult.rows[0]?.club_id || null;
        } catch (e: any) {
          console.log('[Webhook] Parent premium student lookup error:', e.message);
        }
      }
      console.log('[Webhook] Parent premium payment detected, studentId:', studentId, 'clubId:', clubId);
    }
    
    if (!isParentPremium && customerEmail) {
      const clubResult = await client.query(
        'SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE owner_email = $1 LIMIT 1',
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
        'paid',
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
      const amountFormatted = '$' + (amount / 100).toFixed(2);
      
      const invoiceLang = normalizeLanguageCode(club.wizard_data?.language);
      const result = await sendPaymentConfirmationEmail(customerEmail, {
        ownerName: club.owner_name || 'Club Owner',
        clubName: club.name,
        planName: planName,
        amount: amountFormatted,
        billingPeriod: billingPeriod
      }, invoiceLang);

      if (result.success) {
        console.log('[Webhook] Payment confirmation email sent to:', customerEmail);
      }

      // Notify platform admin
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
        await sgMail.send({
          to: 'billing@mytaek.com',
          from: { email: 'noreply@mytaek.com', name: 'TaekUp Platform' },
          subject: `💳 New Payment: ${amountFormatted} from ${club.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; border-radius: 12px;">
              <h2 style="color: #22d3ee; margin-bottom: 20px;">💳 New Payment Received</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #9ca3af; width: 140px;">Club</td><td style="padding: 8px 0; color: #fff; font-weight: bold;">${club.name}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Email</td><td style="padding: 8px 0;"><a href="mailto:${customerEmail}" style="color: #22d3ee;">${customerEmail}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Plan</td><td style="padding: 8px 0; color: #fff;">${planName}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Amount</td><td style="padding: 8px 0; color: #4ade80; font-weight: bold; font-size: 18px;">${amountFormatted}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Billing</td><td style="padding: 8px 0; color: #fff;">${billingPeriod}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Invoice</td><td style="padding: 8px 0; color: #fff;">${invoice.id}</td></tr>
              </table>
              <hr style="border: 1px solid #333; margin: 20px 0;" />
              <p style="color: #6b7280; font-size: 12px;">Received at ${new Date().toISOString()}</p>
            </div>
          `,
        });
        console.log('[Webhook] Admin payment notification sent to billing@mytaek.com');
      } catch (adminEmailErr: any) {
        console.error('[Webhook] Failed to send admin notification:', adminEmailErr.message);
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

  const liveSecret = process.env.STRIPE_SECRET_KEY;
  const sandboxSecret = process.env.SANDBOX_STRIPE_KEY;
  const liveWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sandboxWebhookSecret = process.env.SANDBOX_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!liveSecret && !sandboxSecret) {
    console.error('[Webhook] No Stripe key configured');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  let event: Stripe.Event;
  let isTestEvent = false;

  // Try live webhook secret first, then sandbox — so both live and test events work
  const stripeForVerify = new Stripe(liveSecret || sandboxSecret!);
  let verified = false;

  if (liveWebhookSecret) {
    try {
      event = stripeForVerify.webhooks.constructEvent(rawBody, signature as string, liveWebhookSecret);
      verified = true;
      isTestEvent = false;
    } catch { /* try sandbox next */ }
  }

  if (!verified && sandboxWebhookSecret) {
    try {
      event = stripeForVerify.webhooks.constructEvent(rawBody, signature as string, sandboxWebhookSecret);
      verified = true;
      isTestEvent = true;
    } catch { /* both failed */ }
  }

  if (!verified) {
    console.error('[Webhook] Signature verification failed with all available secrets');
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Use the matching Stripe client for API calls
  const stripeSecretKey = isTestEvent ? (sandboxSecret || liveSecret!) : (liveSecret || sandboxSecret!);
  const stripe = new Stripe(stripeSecretKey);
  console.log(`[Webhook] Verified as ${isTestEvent ? 'TEST' : 'LIVE'} event`);

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
