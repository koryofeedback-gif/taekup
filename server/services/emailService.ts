import sgMail from '@sendgrid/mail';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let connectionSettings: any;
let cachedClient: { client: typeof sgMail; fromEmail: string } | null = null;

const SENDGRID_MASTER_TEMPLATE_ID = process.env.SENDGRID_MASTER_TEMPLATE_ID;

type EmailContentType = {
  [key: string]: {
    [lang: string]: {
      subject: string;
      title: string;
      body: string;
      btn_text?: string;
      btn_url?: string;
    };
  };
};

let emailContentCache: EmailContentType | null = null;

function getEmailContent(): EmailContentType {
  if (emailContentCache) return emailContentCache;
  
  try {
    const contentPath = path.join(__dirname, '../utils/emailContent.json');
    const content = fs.readFileSync(contentPath, 'utf-8');
    emailContentCache = JSON.parse(content);
    return emailContentCache!;
  } catch (error) {
    console.error('[EmailService] Failed to load emailContent.json:', error);
    return {};
  }
}

type SupportedLanguage = 'en' | 'fr' | 'de' | 'es' | 'fa';

interface NotificationUser {
  email: string;
  name?: string;
  language?: string;
}

interface NotificationData {
  [key: string]: string | number | undefined;
}

function replacePlaceholders(template: string, data: NotificationData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    return value !== undefined ? String(value) : match;
  });
}

function detectLanguage(user: NotificationUser): SupportedLanguage {
  const lang = user.language?.toLowerCase().slice(0, 2) as SupportedLanguage;
  if (['en', 'fr', 'de', 'es', 'fa'].includes(lang)) {
    return lang;
  }
  return 'en';
}

export async function sendNotification(
  emailType: string,
  user: NotificationUser,
  data: NotificationData = {}
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const emailContent = getEmailContent();
  
  if (!SENDGRID_MASTER_TEMPLATE_ID) {
    console.warn('[EmailService] Master template ID not configured, falling back to legacy email');
    return { success: false, error: 'Master template not configured' };
  }

  const content = emailContent[emailType];
  if (!content) {
    console.error(`[EmailService] Unknown email type: ${emailType}`);
    return { success: false, error: `Unknown email type: ${emailType}` };
  }

  const language = detectLanguage(user);
  const langContent = content[language] || content['en'];

  if (!langContent) {
    console.error(`[EmailService] No content found for ${emailType} in ${language}`);
    return { success: false, error: `No content for language: ${language}` };
  }

  const baseUrl = process.env.APP_URL || 'https://mytaek.com';
  const templateData: NotificationData = {
    ...data,
    name: data.name || user.name || 'there',
    baseUrl,
  };

  const subject = replacePlaceholders(langContent.subject, templateData);
  const title = replacePlaceholders(langContent.title, templateData);
  const bodyContent = replacePlaceholders(langContent.body, templateData);
  const btnText = langContent.btn_text ? replacePlaceholders(langContent.btn_text, templateData) : undefined;
  const btnUrl = langContent.btn_url ? replacePlaceholders(langContent.btn_url, templateData) : undefined;

  const isRtl = language === 'fa';

  try {
    const { client } = await getUncachableSendGridClient();
    const senderType = getSenderForEmailType(emailType);
    const sender = SENDER_EMAILS[senderType];
    
    const msg = {
      to: user.email,
      from: { email: sender.email, name: sender.name },
      subject,
      templateId: SENDGRID_MASTER_TEMPLATE_ID,
      dynamicTemplateData: {
        title,
        body_content: bodyContent,
        btn_text: btnText,
        btn_url: btnUrl,
        is_rtl: isRtl,
        image_url: data.image_url,
        unsubscribe: `${baseUrl}/unsubscribe?email=${encodeURIComponent(user.email)}`,
        name: templateData.name,
      },
    };

    const response = await client.send(msg);
    const messageId = response[0]?.headers?.['x-message-id'];
    console.log(`[EmailService] Sent ${emailType} from ${sender.email} to ${user.email} (${language}) - ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    const errorMessage = error?.response?.body?.errors?.[0]?.message || error.message || 'Unknown error';
    console.error(`[EmailService] Failed to send ${emailType} to ${user.email}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function sendBulkNotification(
  emailType: string,
  users: NotificationUser[],
  dataFn: (user: NotificationUser) => NotificationData = () => ({})
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] };

  for (const user of users) {
    const data = dataFn(user);
    const result = await sendNotification(emailType, user, data);
    
    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push(`${user.email}: ${result.error}`);
    }
  }

  console.log(`[EmailService] Bulk ${emailType}: ${results.sent} sent, ${results.failed} failed`);
  return results;
}

export function getAvailableEmailTypes(): string[] {
  return Object.keys(getEmailContent());
}

export function getSupportedLanguages(): SupportedLanguage[] {
  return ['en', 'fr', 'de', 'es', 'fa'];
}

async function getCredentials() {
  // First, check for direct environment variables (works on Vercel and other platforms)
  if (process.env.SENDGRID_API_KEY) {
    console.log('[SendGrid] Using direct SENDGRID_API_KEY');
    return { 
      apiKey: process.env.SENDGRID_API_KEY, 
      email: process.env.SENDGRID_FROM_EMAIL || 'hello@mytaek.com' 
    };
  }

  // Fallback to Replit connector system
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (xReplitToken && hostname) {
    try {
      connectionSettings = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      ).then(res => res.json()).then(data => data.items?.[0]);

      if (connectionSettings?.settings?.api_key) {
        console.log('[SendGrid] Using Replit connector');
        return { 
          apiKey: connectionSettings.settings.api_key, 
          email: connectionSettings.settings.from_email || 'hello@mytaek.com' 
        };
      }
    } catch (err) {
      console.log('[SendGrid] Replit connector not available');
    }
  }

  throw new Error('SendGrid not configured - set SENDGRID_API_KEY environment variable');
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

// Master SendGrid template ID - all emails use this single dynamic template
const MASTER_TEMPLATE_ID = 'd-4dcfd1bfcaca4eb2a8af8085810c10c2';

export const EMAIL_TEMPLATES = {
  WELCOME: MASTER_TEMPLATE_ID,
  PAYMENT_CONFIRMATION: MASTER_TEMPLATE_ID,
  DAY_3_CHECKIN: MASTER_TEMPLATE_ID,
  DAY_7_MID_TRIAL: MASTER_TEMPLATE_ID,
  TRIAL_ENDING_SOON: MASTER_TEMPLATE_ID,
  TRIAL_EXPIRED: MASTER_TEMPLATE_ID,
  COACH_INVITE: MASTER_TEMPLATE_ID,
  RESET_PASSWORD: MASTER_TEMPLATE_ID,
  NEW_STUDENT_ADDED: MASTER_TEMPLATE_ID,
  MONTHLY_REVENUE_REPORT: MASTER_TEMPLATE_ID,
  PARENT_WELCOME: MASTER_TEMPLATE_ID,
  CLASS_FEEDBACK: MASTER_TEMPLATE_ID,
  BELT_PROMOTION: MASTER_TEMPLATE_ID,
  ATTENDANCE_ALERT: MASTER_TEMPLATE_ID,
  BIRTHDAY_WISH: MASTER_TEMPLATE_ID,
  WIN_BACK: MASTER_TEMPLATE_ID,
  CHURN_RISK: MASTER_TEMPLATE_ID,
};

type SenderType = 'hello' | 'noreply' | 'billing' | 'support' | 'updates';

const SENDER_EMAILS: Record<SenderType, { email: string; name: string }> = {
  hello: {
    email: 'hello@mytaek.com',
    name: 'TaekUp'
  },
  noreply: {
    email: 'noreply@mytaek.com',
    name: 'TaekUp'
  },
  billing: {
    email: 'billing@mytaek.com',
    name: 'TaekUp Billing'
  },
  support: {
    email: 'support@mytaek.com',
    name: 'TaekUp Support'
  },
  updates: {
    email: 'updates@mytaek.com',
    name: 'TaekUp Updates'
  }
};

// Map email types to appropriate sender
const EMAIL_TYPE_SENDER: Record<string, SenderType> = {
  // Welcome & Engagement - hello@
  welcome_parent: 'hello',
  welcome_club: 'hello',
  birthday_wish: 'hello',
  win_back: 'hello',
  coach_invite: 'hello',
  
  // Billing & Payments - billing@
  payment_receipt: 'billing',
  payment_failed: 'billing',
  premium_unlocked: 'billing',
  subscription_cancelled: 'billing',
  payout_notification: 'billing',
  trial_ending: 'billing',
  trial_expired: 'billing',
  day_3_checkin: 'billing',
  day_7_mid_trial: 'billing',
  
  // Support & Alerts - support@
  attendance_alert: 'support',
  churn_risk: 'support',
  class_feedback: 'support',
  
  // Progress Updates - updates@
  weekly_progress: 'updates',
  belt_promotion: 'updates',
  new_student_added: 'updates',
  monthly_revenue_report: 'updates',
  video_approved: 'updates',
  video_retry: 'updates',
  video_submitted: 'updates',
  
  // Transactional (no reply expected) - noreply@
  password_reset: 'noreply',
  password_changed: 'noreply',
};

function getSenderForEmailType(emailType: string): SenderType {
  return EMAIL_TYPE_SENDER[emailType] || 'hello';
}

const BASE_URL = process.env.APP_URL || 'https://app.mytaek.com';

const commonLinks = {
  unsubscribeUrl: `${BASE_URL}/email-preferences`,
  privacyUrl: `${BASE_URL}/privacy`,
  dashboardUrl: `${BASE_URL}/dashboard`,
  loginUrl: `${BASE_URL}/login`,
  upgradeUrl: `${BASE_URL}/pricing`,
  helpUrl: `${BASE_URL}/help`,
};

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendEmail(
  to: string,
  templateId: string,
  dynamicData: Record<string, any>,
  subject?: string,
  senderType: SenderType = 'hello'
): Promise<EmailResult> {
  try {
    const { client } = await getUncachableSendGridClient();
    const sender = SENDER_EMAILS[senderType];
    
    const msg: any = {
      to,
      from: {
        email: sender.email,
        name: sender.name
      },
      templateId,
      dynamicTemplateData: {
        ...commonLinks,
        ...dynamicData,
      },
    };

    if (subject) {
      msg.subject = subject;
    }

    const response = await client.send(msg);
    
    return {
      success: true,
      messageId: response[0]?.headers?.['x-message-id'],
    };
  } catch (error: any) {
    console.error('SendGrid Error:', error?.response?.body || error.message);
    return {
      success: false,
      error: error?.response?.body?.errors?.[0]?.message || error.message,
    };
  }
}

export async function sendWelcomeEmail(
  to: string,
  data: { ownerName: string; clubName: string }
): Promise<EmailResult> {
  return sendNotification('welcome_club', { email: to, name: data.ownerName }, {
    name: data.ownerName,
    clubName: data.clubName,
  });
}

export async function sendPaymentConfirmationEmail(
  to: string,
  data: { 
    ownerName: string; 
    clubName: string; 
    planName: string;
    amount: string;
    billingPeriod: string;
    invoiceNumber?: string;
    invoiceUrl?: string;
  }
): Promise<EmailResult> {
  return sendNotification('payment_receipt', { email: to, name: data.ownerName }, {
    name: data.ownerName,
    amount: data.amount,
    nextBillingDate: data.billingPeriod,
    invoiceNumber: data.invoiceNumber || 'N/A',
    invoiceUrl: data.invoiceUrl || `${BASE_URL}/app/admin?tab=billing`,
  });
}

export async function sendDay3CheckinEmail(
  to: string,
  data: { ownerName: string }
): Promise<EmailResult> {
  return sendNotification('day_3_checkin', { email: to, name: data.ownerName }, {
    name: data.ownerName,
  });
}

export async function sendDay7MidTrialEmail(
  to: string,
  data: { ownerName: string }
): Promise<EmailResult> {
  return sendNotification('day_7_mid_trial', { email: to, name: data.ownerName }, {
    name: data.ownerName,
  });
}

export async function sendTrialEndingSoonEmail(
  to: string,
  data: { ownerName: string; clubName: string; daysLeft: number; planName?: string; planPrice?: string; trialEndDate?: string }
): Promise<EmailResult> {
  const endDate = data.trialEndDate || new Date(Date.now() + data.daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString();
  return sendNotification('trial_ending', { email: to, name: data.ownerName }, {
    name: data.ownerName,
    daysLeft: data.daysLeft,
    trialEndDate: endDate,
    planName: data.planName || 'Your Plan',
    planPrice: data.planPrice || '',
  });
}

export async function sendTrialExpiredEmail(
  to: string,
  data: { ownerName: string; clubName: string }
): Promise<EmailResult> {
  return sendNotification('trial_expired', { email: to, name: data.ownerName }, {
    name: data.ownerName,
    clubName: data.clubName,
  });
}

export async function sendCoachInviteEmail(
  to: string,
  data: { 
    coachName: string; 
    coachEmail: string;
    ownerName: string; 
    clubName: string; 
    tempPassword: string 
  }
): Promise<EmailResult> {
  return sendNotification('coach_invite', { email: to, name: data.coachName }, {
    name: data.coachName,
    clubName: data.clubName,
    tempPassword: data.tempPassword,
  });
}

export async function sendResetPasswordEmail(
  to: string,
  data: { userName: string; resetToken: string }
): Promise<EmailResult> {
  return sendNotification('password_reset', { email: to, name: data.userName }, {
    name: data.userName,
    resetUrl: `${BASE_URL}/reset-password?token=${data.resetToken}`,
  });
}

export async function sendNewStudentAddedEmail(
  to: string,
  data: { 
    studentName: string; 
    clubName: string; 
    beltLevel: string;
    studentAge: string;
    parentName: string;
    studentId: string;
  }
): Promise<EmailResult> {
  return sendNotification('new_student_added', { email: to }, {
    name: 'there',
    studentName: data.studentName,
    clubName: data.clubName,
    beltLevel: data.beltLevel,
    studentAge: data.studentAge,
    parentName: data.parentName,
  });
}

export async function sendMonthlyRevenueReportEmail(
  to: string,
  data: { 
    monthName: string; 
    totalEarnings: string;
    premiumParents: number;
    newThisMonth: number;
  }
): Promise<EmailResult> {
  return sendNotification('monthly_revenue_report', { email: to, name: 'there' }, {
    name: 'there',
    monthName: data.monthName,
    totalEarnings: data.totalEarnings,
    premiumParents: data.premiumParents,
    newThisMonth: data.newThisMonth,
  });
}

export async function sendParentWelcomeEmail(
  to: string,
  data: { 
    parentName: string; 
    studentName: string; 
    clubName: string;
    studentId: string;
  }
): Promise<EmailResult> {
  return sendNotification('welcome_parent', { email: to, name: data.parentName }, {
    name: data.parentName,
    parentEmail: to,
    clubName: data.clubName,
    studentName: data.studentName,
  });
}

export async function sendClassFeedbackEmail(
  to: string,
  data: { 
    parentName: string; 
    studentName: string; 
    clubName: string;
    className: string;
    classDate: string;
    coachName: string;
    coachNote?: string;
    scoresTable: string;
    totalPoints: number;
    stripeProgress: string;
    studentId?: string;
    feedbackId?: string;
  }
): Promise<EmailResult> {
  const coachNoteSection = data.coachNote 
    ? `<br><br><strong>Coach's Note:</strong><br><em>"${data.coachNote}"</em>` 
    : '';
  
  return sendNotification('class_feedback', { email: to, name: data.parentName }, {
    parentName: data.parentName,
    studentName: data.studentName,
    clubName: data.clubName,
    className: data.className,
    classDate: data.classDate,
    coachName: data.coachName,
    coachNoteSection: coachNoteSection,
    scoresTable: data.scoresTable,
    totalPoints: data.totalPoints,
    stripeProgress: data.stripeProgress,
  });
}

export async function sendBeltPromotionEmail(
  to: string,
  data: { 
    studentName: string; 
    beltColor: string;
    clubName: string;
    promotionDate: string;
    totalXp: string;
    classesAttended: number;
    monthsTrained: number;
    promotionId: string;
  }
): Promise<EmailResult> {
  return sendNotification('belt_promotion', { email: to }, {
    childName: data.studentName,
    newBelt: data.beltColor,
    clubName: data.clubName,
    promotionDate: data.promotionDate,
  });
}

export async function sendAttendanceAlertEmail(
  to: string,
  data: { 
    parentName: string; 
    studentName: string; 
    clubName: string;
    daysSinceLastClass: number;
  }
): Promise<EmailResult> {
  return sendNotification('attendance_alert', { email: to, name: data.parentName }, {
    parentName: data.parentName,
    studentName: data.studentName,
    clubName: data.clubName,
    daysSinceLastClass: data.daysSinceLastClass,
  });
}

export async function sendBirthdayWishEmail(
  to: string,
  data: { 
    studentName: string; 
    clubName: string;
  }
): Promise<EmailResult> {
  return sendNotification('birthday_wish', { email: to }, {
    studentName: data.studentName,
    clubName: data.clubName,
  });
}

export async function sendWinBackEmail(
  to: string,
  data: { 
    ownerName: string; 
    clubName: string;
    discountCode?: string;
  }
): Promise<EmailResult> {
  return sendNotification('win_back', { email: to, name: data.ownerName }, {
    name: data.ownerName,
    clubName: data.clubName,
    discountCode: data.discountCode || 'WINBACK25',
  });
}

export async function sendChurnRiskEmail(
  to: string,
  data: { 
    ownerName: string; 
    clubName: string;
  }
): Promise<EmailResult> {
  return sendNotification('churn_risk', { email: to, name: data.ownerName }, {
    name: data.ownerName,
  });
}

export async function sendVideoSubmittedNotification(
  to: string,
  data: { 
    coachName: string;
    studentName: string;
    challengeName: string;
    clubName: string;
  }
): Promise<EmailResult> {
  return sendNotification('video_submitted', { email: to, name: data.coachName }, {
    coachName: data.coachName,
    studentName: data.studentName,
    challengeName: data.challengeName,
    clubName: data.clubName,
  });
}

export async function sendVideoVerifiedNotification(
  to: string,
  data: { 
    parentName: string;
    studentName: string;
    challengeName: string;
    status: 'approved' | 'rejected';
    coachNotes?: string;
    xpAwarded?: number;
  }
): Promise<EmailResult> {
  const emailType = data.status === 'approved' ? 'video_approved' : 'video_retry';
  return sendNotification(emailType, { email: to, name: data.parentName }, {
    childName: data.studentName,
    coachName: 'Sensei',
    xpAmount: data.xpAwarded || 0,
    feedback: data.coachNotes || '',
  });
}

export default {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendDay3CheckinEmail,
  sendDay7MidTrialEmail,
  sendTrialEndingSoonEmail,
  sendTrialExpiredEmail,
  sendCoachInviteEmail,
  sendResetPasswordEmail,
  sendNewStudentAddedEmail,
  sendMonthlyRevenueReportEmail,
  sendParentWelcomeEmail,
  sendClassFeedbackEmail,
  sendBeltPromotionEmail,
  sendAttendanceAlertEmail,
  sendBirthdayWishEmail,
  sendWinBackEmail,
  sendChurnRiskEmail,
  sendVideoSubmittedNotification,
  sendVideoVerifiedNotification,
  sendNotification,
  sendBulkNotification,
  getAvailableEmailTypes,
  getSupportedLanguages,
  EMAIL_TEMPLATES,
};
