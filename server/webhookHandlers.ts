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
        sql`SELECT id, name, owner_email, owner_name FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
      );
      
      const club = (clubResult as any[])[0];
      
      if (club) {
        console.log('[Webhook] Found club for welcome email:', club.name);
        
        const alreadySent = await db.execute(
          sql`SELECT id FROM email_log WHERE club_id = ${club.id} AND email_type = 'welcome' LIMIT 1`
        );
        
        if ((alreadySent as any[]).length === 0) {
          const result = await emailService.sendWelcomeEmail(customerEmail, {
            ownerName: club.owner_name || 'Club Owner',
            clubName: club.name
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
        sql`SELECT id, name, owner_email, owner_name FROM clubs WHERE owner_email = ${customerEmail} LIMIT 1`
      );
      
      const club = (clubResult as any[])[0];
      
      if (club) {
        const alreadySent = await db.execute(
          sql`SELECT id FROM email_log WHERE club_id = ${club.id} AND email_type = 'welcome' LIMIT 1`
        );
        
        if ((alreadySent as any[]).length === 0) {
          const result = await emailService.sendWelcomeEmail(customerEmail, {
            ownerName: club.owner_name || 'Club Owner',
            clubName: club.name
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
}
