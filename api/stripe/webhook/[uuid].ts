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
    invoiceUrl?: string;
    invoiceNumber?: string;
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

    const subjectMap: Record<string, string> = {
      en: `Payment Confirmed – ${data.planName} Plan`,
      fr: `Paiement confirmé – Forfait ${data.planName}`,
      de: `Zahlung bestätigt – Tarif ${data.planName}`,
      es: `Pago confirmado – Plan ${data.planName}`,
      fa: `پرداخت تأیید شد – طرح ${data.planName}`,
    };
    const subject = subjectMap[lang] || subjectMap.en;

    const greetingMap: Record<string, string> = {
      en: `Hi ${data.ownerName},`,
      fr: `Bonjour ${data.ownerName},`,
      de: `Hallo ${data.ownerName},`,
      es: `Hola ${data.ownerName},`,
      fa: `سلام ${data.ownerName}،`,
    };
    const greeting = greetingMap[lang] || greetingMap.en;

    const bodyMap: Record<string, string> = {
      en: `Thank you for your payment of <strong style="color:#4ade80">${data.amount}</strong>. Your <strong>${data.planName}</strong> subscription (${data.billingPeriod}) is now active for <strong>${data.clubName}</strong>.`,
      fr: `Merci pour votre paiement de <strong style="color:#4ade80">${data.amount}</strong>. Votre abonnement <strong>${data.planName}</strong> (${data.billingPeriod}) est maintenant actif pour <strong>${data.clubName}</strong>.`,
      de: `Vielen Dank für Ihre Zahlung von <strong style="color:#4ade80">${data.amount}</strong>. Ihr <strong>${data.planName}</strong>-Abonnement (${data.billingPeriod}) ist jetzt für <strong>${data.clubName}</strong> aktiv.`,
      es: `Gracias por tu pago de <strong style="color:#4ade80">${data.amount}</strong>. Tu suscripción <strong>${data.planName}</strong> (${data.billingPeriod}) ya está activa para <strong>${data.clubName}</strong>.`,
      fa: `با تشکر از پرداخت <strong style="color:#4ade80">${data.amount}</strong> شما. اشتراک <strong>${data.planName}</strong> (${data.billingPeriod}) برای <strong>${data.clubName}</strong> فعال شد.`,
    };
    const bodyText = bodyMap[lang] || bodyMap.en;

    const btnMap: Record<string, string> = {
      en: 'Go to Dashboard', fr: 'Aller au tableau de bord', de: 'Zum Dashboard', es: 'Ir al Panel', fa: 'رفتن به داشبورد',
    };
    const btnText = btnMap[lang] || btnMap.en;

    const isRtl = lang === 'fa';
    const dir = isRtl ? 'rtl' : 'ltr';

    const invoiceLabelMap: Record<string, string> = {
      en: 'View Invoice', fr: 'Voir la facture', de: 'Rechnung ansehen', es: 'Ver factura', fa: 'مشاهده فاکتور',
    };
    const invoiceLabel = invoiceLabelMap[lang] || invoiceLabelMap.en;

    const invoiceRow = data.invoiceNumber
      ? `<tr><td style="padding:10px 14px;color:#94a3b8;width:130px">Invoice #</td><td style="padding:10px 14px;color:#fff">${data.invoiceNumber}</td></tr>`
      : '';

    const invoiceBtn = data.invoiceUrl
      ? `<a href="${data.invoiceUrl}" style="background:#1e293b;color:#22d3ee;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;border:1px solid #22d3ee;margin-${isRtl ? 'right' : 'left'}:12px">${invoiceLabel}</a>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;direction:${dir}">
        <div style="text-align:center;margin-bottom:24px">
          <img src="${LOGO_URL}" alt="MyTaek" style="height:48px" />
        </div>
        <h2 style="color:#22d3ee;margin-bottom:8px;font-size:22px">✅ ${lang === 'fr' ? 'Paiement confirmé' : lang === 'de' ? 'Zahlung bestätigt' : lang === 'es' ? 'Pago confirmado' : lang === 'fa' ? 'پرداخت تأیید شد' : 'Payment Confirmed'}</h2>
        <p style="margin-bottom:16px">${greeting}</p>
        <p style="margin-bottom:20px;line-height:1.6">${bodyText}</p>
        <div style="text-align:center;margin:28px 0;display:flex;justify-content:center;flex-wrap:wrap;gap:12px">
          <a href="https://mytaek.com/app/admin?tab=billing" style="background:#0891b2;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">${btnText}</a>${invoiceBtn}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;background:#1e293b;border-radius:8px;overflow:hidden">
          <tr><td style="padding:10px 14px;color:#94a3b8;width:130px">Club</td><td style="padding:10px 14px;color:#fff;font-weight:bold">${data.clubName}</td></tr>
          <tr style="background:#0f172a"><td style="padding:10px 14px;color:#94a3b8">Plan</td><td style="padding:10px 14px;color:#fff">${data.planName}</td></tr>
          <tr><td style="padding:10px 14px;color:#94a3b8">Billing</td><td style="padding:10px 14px;color:#fff">${data.billingPeriod}</td></tr>
          <tr style="background:#0f172a"><td style="padding:10px 14px;color:#94a3b8">Amount</td><td style="padding:10px 14px;color:#4ade80;font-weight:bold">${data.amount}</td></tr>
          ${invoiceRow}
        </table>
        ${data.invoiceUrl ? `<p style="text-align:center;margin-top:16px;font-size:13px;color:#64748b">You can also <a href="${data.invoiceUrl}" style="color:#22d3ee;text-decoration:underline">${invoiceLabel.toLowerCase()}</a> or download the PDF from that page.</p>` : ''}
        <hr style="border:1px solid #1e293b;margin:24px 0" />
        <p style="color:#475569;font-size:12px;text-align:center">TaekUp — The Martial Arts Management Platform</p>
      </div>
    `;

    await sgMail.send({
      to,
      from: { email: 'hello@mytaek.com', name: 'MyTaek' },
      subject,
      html,
    });
    console.log(`[Webhook] Payment confirmation email sent to ${to} (lang: ${lang})`);
    return { success: true };
  } catch (error: any) {
    console.error('[Webhook] sendPaymentConfirmationEmail error:', error?.response?.body || error.message);
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

        // Fetch invoice URL from the session's invoice
        let parentInvoiceUrl: string | undefined;
        let parentInvoiceNumber: string | undefined;
        if (session.invoice) {
          try {
            const inv = await stripe.invoices.retrieve(session.invoice as string);
            parentInvoiceUrl = (inv as any).hosted_invoice_url || undefined;
            parentInvoiceNumber = (inv as any).number || undefined;
          } catch (invErr: any) {
            console.log('[Webhook] Could not fetch parent premium invoice:', invErr.message);
          }
        }

        if (process.env.SENDGRID_API_KEY && customerEmail) {
          const parentName = session.customer_details?.name || customerEmail.split('@')[0];
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);

          // Email to parent — raw HTML (reliable, no template dependency)
          try {
            const invoiceBtn = parentInvoiceUrl
              ? `<a href="${parentInvoiceUrl}" style="background:#1e293b;color:#22d3ee;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;border:1px solid #22d3ee">View Invoice</a>`
              : '';
            const invoiceRow = parentInvoiceNumber
              ? `<tr><td style="padding:8px 14px;color:#94a3b8;width:130px">Invoice #</td><td style="padding:8px 14px;color:#fff">${parentInvoiceNumber}</td></tr>`
              : '';
            const invoiceNote = parentInvoiceUrl
              ? `<p style="text-align:center;margin-top:12px;font-size:13px;color:#64748b">You can also <a href="${parentInvoiceUrl}" style="color:#22d3ee;text-decoration:underline">view your invoice</a> or download the PDF from that page.</p>`
              : '';

            await sgMail.send({
              to: customerEmail,
              from: { email: 'hello@mytaek.com', name: 'MyTaek' },
              subject: `TaekUp Premium is now active for ${studentName}!`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
                  <div style="text-align:center;margin-bottom:24px">
                    <img src="${LOGO_URL}" alt="MyTaek" style="height:48px" />
                  </div>
                  <h2 style="color:#f59e0b;margin-bottom:8px;font-size:22px">⭐ Premium Activated!</h2>
                  <p style="margin-bottom:16px">Hi ${parentName},</p>
                  <p style="margin-bottom:20px;line-height:1.6">Thank you for your payment of <strong style="color:#4ade80">${amount}/month</strong>. TaekUp Premium is now active for <strong>${studentName}</strong> at <strong>${clubName}</strong>!</p>
                  <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:20px">
                    <p style="margin:0 0 8px;font-weight:bold;color:#f59e0b">Premium features unlocked:</p>
                    <ul style="margin:0;padding-left:20px;line-height:2;color:#e2e8f0">
                      <li>Global Shogun Rank™</li>
                      <li>AI Belt Predictions (ChronosBelt™)</li>
                      <li>Custom Home Habits (7 daily)</li>
                      <li>Video Proof 2x HonorXP™ Multiplier</li>
                      <li>Digital Trophy Case</li>
                    </ul>
                  </div>
                  <div style="text-align:center;margin:24px 0;display:flex;justify-content:center;flex-wrap:wrap;gap:12px">
                    <a href="https://mytaek.com/app/parent/${studentId}" style="background:#d97706;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Open Parent Portal</a>${invoiceBtn}
                  </div>
                  <table style="width:100%;border-collapse:collapse;margin-top:20px;background:#1e293b;border-radius:8px;overflow:hidden">
                    <tr><td style="padding:8px 14px;color:#94a3b8;width:130px">Student</td><td style="padding:8px 14px;color:#fff;font-weight:bold">${studentName}</td></tr>
                    <tr style="background:#0f172a"><td style="padding:8px 14px;color:#94a3b8">Club</td><td style="padding:8px 14px;color:#fff">${clubName}</td></tr>
                    <tr><td style="padding:8px 14px;color:#94a3b8">Amount</td><td style="padding:8px 14px;color:#4ade80;font-weight:bold">${amount}/mo</td></tr>
                    ${invoiceRow}
                  </table>
                  ${invoiceNote}
                  <hr style="border:1px solid #1e293b;margin:24px 0" />
                  <p style="color:#475569;font-size:12px;text-align:center">TaekUp — The Martial Arts Management Platform</p>
                </div>
              `,
            });
            console.log('[Webhook] Parent premium confirmation email sent to:', customerEmail);
          } catch (emailErr: any) {
            console.error('[Webhook] Parent premium email error:', emailErr.message);
          }

          // Notify admin
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
                    <tr><td style="padding: 8px 0; color: #9ca3af;">Invoice #</td><td style="padding: 8px 0; color: #fff;">${parentInvoiceNumber || 'N/A'}</td></tr>
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
      console.log('[Webhook] Club checkout completed for:', club.name, '— payment confirmation email will be sent by invoice.payment_succeeded handler');
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
    let parentStudentId: string | null = null;
    let parentStudentName = 'Student';
    let parentClubName = 'Club';
    
    const subscriptionMeta = invoice.subscription_details?.metadata || invoice.lines?.data?.[0]?.metadata || {};
    if (subscriptionMeta.type === 'parent_premium') {
      isParentPremium = true;
      parentStudentId = subscriptionMeta.studentId || null;
      if (parentStudentId) {
        try {
          const studentResult = await client.query(
            `SELECT s.club_id, s.name as student_name, c.name as club_name
             FROM students s JOIN clubs c ON s.club_id = c.id
             WHERE s.id = $1::uuid LIMIT 1`,
            [parentStudentId]
          );
          clubId = studentResult.rows[0]?.club_id || null;
          parentStudentName = studentResult.rows[0]?.student_name || 'Student';
          parentClubName = studentResult.rows[0]?.club_name || 'Club';
        } catch (e: any) {
          console.log('[Webhook] Parent premium student lookup error:', e.message);
        }
      }
      console.log('[Webhook] Parent premium payment detected, studentId:', parentStudentId, 'clubId:', clubId);
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
        ownerName: club.owner_name || (club.wizard_data as any)?.ownerName || club.name,
        clubName: club.name,
        planName: planName,
        amount: amountFormatted,
        billingPeriod: billingPeriod,
        invoiceUrl: invoice.hosted_invoice_url || undefined,
        invoiceNumber: invoice.number || undefined,
      }, invoiceLang);

      if (result.success) {
        console.log('[Webhook] Payment confirmation email sent to:', customerEmail);
      } else {
        console.error('[Webhook] Payment confirmation email FAILED for owner:', customerEmail, result.error);
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
    } else if (isParentPremium && customerEmail && process.env.SENDGRID_API_KEY) {
      // Parent premium renewal — send confirmation to parent with invoice link
      const amountFormatted = '$' + (amount / 100).toFixed(2);
      const invoiceUrl = invoice.hosted_invoice_url || undefined;
      const invoiceNumber = invoice.number || undefined;
      const parentName = (customer as any).name || customerEmail.split('@')[0];

      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
        const invoiceBtn = invoiceUrl
          ? `<a href="${invoiceUrl}" style="background:#1e293b;color:#22d3ee;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;border:1px solid #22d3ee">View Invoice</a>`
          : '';
        const invoiceRow = invoiceNumber
          ? `<tr><td style="padding:8px 14px;color:#94a3b8;width:130px">Invoice #</td><td style="padding:8px 14px;color:#fff">${invoiceNumber}</td></tr>`
          : '';
        const invoiceNote = invoiceUrl
          ? `<p style="text-align:center;margin-top:12px;font-size:13px;color:#64748b">You can also <a href="${invoiceUrl}" style="color:#22d3ee;text-decoration:underline">view your invoice</a> or download the PDF from that page.</p>`
          : '';

        await sgMail.send({
          to: customerEmail,
          from: { email: 'hello@mytaek.com', name: 'MyTaek' },
          subject: `TaekUp Premium renewed for ${parentStudentName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
              <div style="text-align:center;margin-bottom:24px">
                <img src="${LOGO_URL}" alt="MyTaek" style="height:48px" />
              </div>
              <h2 style="color:#f59e0b;margin-bottom:8px;font-size:22px">⭐ Premium Renewed</h2>
              <p style="margin-bottom:16px">Hi ${parentName},</p>
              <p style="margin-bottom:20px;line-height:1.6">Your TaekUp Premium subscription for <strong>${parentStudentName}</strong> at <strong>${parentClubName}</strong> has been renewed. Your card was charged <strong style="color:#4ade80">${amountFormatted}</strong>.</p>
              <div style="text-align:center;margin:24px 0;display:flex;justify-content:center;flex-wrap:wrap;gap:12px">
                <a href="https://mytaek.com/app/parent/${parentStudentId}" style="background:#d97706;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Open Parent Portal</a>${invoiceBtn}
              </div>
              <table style="width:100%;border-collapse:collapse;margin-top:20px;background:#1e293b;border-radius:8px;overflow:hidden">
                <tr><td style="padding:8px 14px;color:#94a3b8;width:130px">Student</td><td style="padding:8px 14px;color:#fff;font-weight:bold">${parentStudentName}</td></tr>
                <tr style="background:#0f172a"><td style="padding:8px 14px;color:#94a3b8">Club</td><td style="padding:8px 14px;color:#fff">${parentClubName}</td></tr>
                <tr><td style="padding:8px 14px;color:#94a3b8">Amount</td><td style="padding:8px 14px;color:#4ade80;font-weight:bold">${amountFormatted}/mo</td></tr>
                ${invoiceRow}
              </table>
              ${invoiceNote}
              <hr style="border:1px solid #1e293b;margin:24px 0" />
              <p style="color:#475569;font-size:12px;text-align:center">TaekUp — The Martial Arts Management Platform</p>
            </div>
          `,
        });
        console.log('[Webhook] Parent premium renewal email sent to:', customerEmail);
      } catch (parentRenewalErr: any) {
        console.error('[Webhook] Parent premium renewal email FAILED:', customerEmail, parentRenewalErr.message);
      }

      // Notify admin of renewal
      try {
        await sgMail.send({
          to: 'billing@mytaek.com',
          from: { email: 'noreply@mytaek.com', name: 'TaekUp Platform' },
          subject: `🔄 Parent Premium Renewal: ${amountFormatted} from ${customerEmail}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; border-radius: 12px;">
              <h2 style="color: #f59e0b; margin-bottom: 20px;">🔄 Parent Premium Renewed</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #9ca3af; width: 140px;">Parent</td><td style="padding: 8px 0; color: #fff; font-weight: bold;">${parentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Email</td><td style="padding: 8px 0;"><a href="mailto:${customerEmail}" style="color: #22d3ee;">${customerEmail}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Student</td><td style="padding: 8px 0; color: #fff;">${parentStudentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Club</td><td style="padding: 8px 0; color: #fff;">${parentClubName}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Amount</td><td style="padding: 8px 0; color: #4ade80; font-weight: bold; font-size: 18px;">${amountFormatted}/mo</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Invoice #</td><td style="padding: 8px 0; color: #fff;">${invoiceNumber || 'N/A'}</td></tr>
                <tr><td style="padding: 8px 0; color: #9ca3af;">Invoice ID</td><td style="padding: 8px 0; color: #fff;">${invoice.id}</td></tr>
              </table>
              <hr style="border: 1px solid #333; margin: 20px 0;" />
              <p style="color: #6b7280; font-size: 12px;">Received at ${new Date().toISOString()}</p>
            </div>
          `,
        });
        console.log('[Webhook] Admin renewal notification sent for parent premium');
      } catch (adminRenewalErr: any) {
        console.error('[Webhook] Admin parent premium renewal notification error:', adminRenewalErr.message);
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
