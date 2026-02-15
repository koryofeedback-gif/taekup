import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import emailService from './services/emailService';
import { db } from './db';
import { sql } from 'drizzle-orm';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);

    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleCustomEvents(event);
    } catch (parseError) {
      console.error('Failed to parse webhook for custom handling:', parseError);
    }
  }

  static async handleCustomEvents(event: any): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
        await WebhookHandlers.handleSubscriptionCreated(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await WebhookHandlers.handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await WebhookHandlers.handlePaymentFailed(event.data.object);
        break;
      default:
        break;
    }
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    try {
      console.log('[Webhook] Checkout completed:', session.id);
      
      const customerEmail = session.customer_email || session.customer_details?.email;
      const metadata = session.metadata || {};
      const clubId = metadata.clubId;
      
      if (!customerEmail) {
        console.log('[Webhook] No customer email found in checkout session');
        return;
      }

      const clubResult = await db.execute(
        sql`SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
      );
      
      const club = (clubResult as any[])[0];
      
      if (club) {
        console.log('[Webhook] Found club for welcome email:', club.name);
        const clubLanguage = (club?.wizard_data as any)?.language || 'English';
        
        const alreadySent = await db.execute(
          sql`SELECT id FROM email_log WHERE club_id = ${club.id} AND email_type = 'welcome' LIMIT 1`
        );
        
        if ((alreadySent as any[]).length === 0) {
          const result = await emailService.sendWelcomeEmail(customerEmail, {
            ownerName: club.owner_name || 'Club Owner',
            clubName: club.name,
            language: clubLanguage
          });
          
          if (result.success) {
            console.log('[Webhook] Welcome email sent to:', customerEmail);
            
            await db.execute(sql`
              INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
              VALUES (${club.id}, ${customerEmail}, 'welcome', 'Welcome to TaekUp', 'sent', NOW())
            `);
          } else {
            console.error('[Webhook] Failed to send welcome email:', result.error);
            
            await db.execute(sql`
              INSERT INTO email_log (club_id, recipient, email_type, subject, status, error)
              VALUES (${club.id}, ${customerEmail}, 'welcome', 'Welcome to TaekUp', 'failed', ${result.error || 'Unknown error'})
            `);
          }
        } else {
          console.log('[Webhook] Welcome email already sent to this club');
        }
      } else {
        console.log('[Webhook] No club found for email:', customerEmail, '- welcome email will be sent when club is created');
      }
      
      await db.execute(sql`
        INSERT INTO activity_log (event_type, description, metadata, created_at)
        VALUES ('checkout_completed', ${'Checkout completed for ' + customerEmail}, ${JSON.stringify({ sessionId: session.id, email: customerEmail })}, NOW())
      `);
      
    } catch (error: any) {
      console.error('[Webhook] Error handling checkout completed:', error.message);
    }
  }

  static async handleSubscriptionCreated(subscription: any): Promise<void> {
    try {
      console.log('[Webhook] Subscription created:', subscription.id);
      
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(subscription.customer);
      
      if (!customer || customer.deleted) {
        console.log('[Webhook] Customer not found or deleted');
        return;
      }

      const customerEmail = (customer as any).email;
      
      if (!customerEmail) {
        console.log('[Webhook] No email found for customer');
        return;
      }

      const clubResult = await db.execute(
        sql`SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
      );
      
      const club = (clubResult as any[])[0];
      
      if (club) {
        const clubLanguage = (club?.wizard_data as any)?.language || 'English';
        // Update club's trial status to converted and store subscription ID
        await db.execute(sql`
          UPDATE clubs 
          SET trial_status = 'converted', 
              stripe_subscription_id = ${subscription.id},
              stripe_customer_id = ${subscription.customer},
              updated_at = NOW()
          WHERE id = ${club.id}::uuid
        `);
        console.log('[Webhook] Updated club trial_status to converted:', club.id);
        
        const alreadySent = await db.execute(
          sql`SELECT id FROM email_log WHERE club_id = ${club.id} AND email_type = 'welcome' LIMIT 1`
        );
        
        if ((alreadySent as any[]).length === 0) {
          const result = await emailService.sendWelcomeEmail(customerEmail, {
            ownerName: club.owner_name || 'Club Owner',
            clubName: club.name,
            language: clubLanguage
          });
          
          if (result.success) {
            console.log('[Webhook] Welcome email sent via subscription event to:', customerEmail);
            
            await db.execute(sql`
              INSERT INTO email_log (club_id, recipient, email_type, subject, status, sent_at)
              VALUES (${club.id}, ${customerEmail}, 'welcome', 'Welcome to TaekUp', 'sent', NOW())
            `);
          }
        }
      }
      
      await db.execute(sql`
        INSERT INTO activity_log (event_type, description, metadata, created_at)
        VALUES ('subscription_created', ${'New subscription for ' + customerEmail}, ${JSON.stringify({ subscriptionId: subscription.id, email: customerEmail })}, NOW())
      `);
      
    } catch (error: any) {
      console.error('[Webhook] Error handling subscription created:', error.message);
    }
  }

  static async handlePaymentSucceeded(invoice: any): Promise<void> {
    try {
      console.log('[Webhook] Payment succeeded:', invoice.id);
      
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(invoice.customer);
      
      if (!customer || customer.deleted) {
        console.log('[Webhook] Customer not found or deleted');
        return;
      }

      const customerEmail = (customer as any).email;
      const amount = invoice.amount_paid || 0;
      const currency = invoice.currency || 'usd';
      
      let clubId = null;
      let club = null;
      
      if (customerEmail) {
        const clubResult = await db.execute(
          sql`SELECT id, name, owner_email, owner_name, wizard_data FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
        );
        club = (clubResult as any[])[0];
        clubId = club?.id || null;
      }

      await db.execute(sql`
        INSERT INTO payments (
          club_id, 
          stripe_invoice_id, 
          stripe_payment_intent_id, 
          amount, 
          currency, 
          status, 
          paid_at,
          period_start,
          period_end,
          created_at
        )
        VALUES (
          ${clubId}::uuid, 
          ${invoice.id}, 
          ${invoice.payment_intent || null}, 
          ${amount}, 
          ${currency}, 
          'paid', 
          ${invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString()}::timestamp,
          ${invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null}::timestamp,
          ${invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null}::timestamp,
          NOW()
        )
      `);

      console.log('[Webhook] Payment saved to database:', invoice.id, 'Amount:', amount);

      if (club && customerEmail) {
        const planName = invoice.lines?.data?.[0]?.description || 'TaekUp Plan';
        const billingPeriod = invoice.lines?.data?.[0]?.period ? 
          (invoice.lines.data[0].period.end - invoice.lines.data[0].period.start > 60 * 60 * 24 * 35 ? 'Annual' : 'Monthly') 
          : 'Monthly';
        const paymentClubLanguage = (club?.wizard_data as any)?.language || 'English';
        
        const result = await emailService.sendPaymentConfirmationEmail(customerEmail, {
          ownerName: club.owner_name || 'Club Owner',
          clubName: club.name,
          planName: planName,
          amount: '$' + (amount / 100).toFixed(2),
          billingPeriod: billingPeriod,
          language: paymentClubLanguage
        });

        if (result.success) {
          console.log('[Webhook] Payment confirmation email sent to:', customerEmail);
        }
      }

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES (
          'payment_succeeded', 
          'Payment Received', 
          ${'Payment of $' + (amount / 100).toFixed(2) + ' received from ' + (customerEmail || 'unknown')}, 
          ${clubId}::uuid,
          ${JSON.stringify({ invoiceId: invoice.id, amount, currency, email: customerEmail })}, 
          NOW()
        )
      `);
      
    } catch (error: any) {
      console.error('[Webhook] Error handling payment succeeded:', error.message);
    }
  }

  static async handlePaymentFailed(invoice: any): Promise<void> {
    try {
      console.log('[Webhook] Payment failed:', invoice.id);
      
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(invoice.customer);
      
      if (!customer || customer.deleted) {
        console.log('[Webhook] Customer not found or deleted');
        return;
      }

      const customerEmail = (customer as any).email;
      const amount = invoice.amount_due || 0;
      const currency = invoice.currency || 'usd';
      
      let clubId = null;
      
      if (customerEmail) {
        const clubResult = await db.execute(
          sql`SELECT id FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
        );
        const club = (clubResult as any[])[0];
        clubId = club?.id || null;
      }

      await db.execute(sql`
        INSERT INTO payments (
          club_id, 
          stripe_invoice_id, 
          stripe_payment_intent_id, 
          amount, 
          currency, 
          status, 
          created_at
        )
        VALUES (
          ${clubId}::uuid, 
          ${invoice.id}, 
          ${invoice.payment_intent || null}, 
          ${amount}, 
          ${currency}, 
          'failed', 
          NOW()
        )
      `);

      console.log('[Webhook] Failed payment saved to database:', invoice.id);

      await db.execute(sql`
        INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
        VALUES (
          'payment_failed', 
          'Payment Failed', 
          ${'Payment of $' + (amount / 100).toFixed(2) + ' failed for ' + (customerEmail || 'unknown')}, 
          ${clubId}::uuid,
          ${JSON.stringify({ invoiceId: invoice.id, amount, currency, email: customerEmail })}, 
          NOW()
        )
      `);
      
    } catch (error: any) {
      console.error('[Webhook] Error handling payment failed:', error.message);
    }
  }
}
