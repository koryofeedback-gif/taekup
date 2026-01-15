import sgMail from '@sendgrid/mail';
import * as fs from 'fs';
import * as path from 'path';

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
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    const msg = {
      to: user.email,
      from: { email: fromEmail, name: 'TaekUp' },
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
      },
    };

    const response = await client.send(msg);
    const messageId = response[0]?.headers?.['x-message-id'];
    console.log(`[EmailService] Sent ${emailType} to ${user.email} (${language}) - ID: ${messageId}`);
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

export const EMAIL_TEMPLATES = {
  WELCOME: 'd-c75234cb326144f68395a66668081ee8',
  PAYMENT_CONFIRMATION: 'd-50996268ba834a5b92150d29935fd2a8',
  DAY_3_CHECKIN: 'd-3f86fd2d84494f20b9c97496852716db',
  DAY_7_MID_TRIAL: 'd-9c9f8338b86d4d7e84b7b9d4eceaf7f6',
  TRIAL_ENDING_SOON: 'd-ee5cb8ea6f114804a356adda535f05ec',
  TRIAL_EXPIRED: 'd-aa4774385c4f41df8be062b9d2b517a5',
  COACH_INVITE: 'd-60ecd12425c14aa3a7f5ef5fb2c374d5',
  RESET_PASSWORD: 'd-ec4e0df3381549f6a3cfc6d202a62d8b',
  NEW_STUDENT_ADDED: 'd-b30e899054184a6f980d3cbbb202892a',
  MONTHLY_REVENUE_REPORT: 'd-4c2705b6b7994397bdb376faf30288d2',
  PARENT_WELCOME: 'd-7747be090c32477e8589d8985608d055',
  CLASS_FEEDBACK: 'd-414b87d374584e4fbf72c2afce7b27f5',
  BELT_PROMOTION: 'd-87a8531cb61d41e3acf8b35b3083db97',
  ATTENDANCE_ALERT: 'd-660102bfe6a1496b90d68fdd04b72f11',
  BIRTHDAY_WISH: 'd-0b160e2e188c4e8a91837369bed3e352',
  WIN_BACK: 'd-189dede22ae74ea697199ccbd9629bdb',
  CHURN_RISK: 'd-f9a587c97a9d4ed18c87212a140f9c53',
};

type SenderType = 'engagement' | 'transactional';

const SENDER_EMAILS = {
  engagement: {
    email: 'hello@mytaek.com',
    name: 'TaekUp'
  },
  transactional: {
    email: 'noreply@mytaek.com',
    name: 'TaekUp'
  }
};

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
  senderType: SenderType = 'engagement'
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
    feedbackText: string;
    coachName: string;
    highlights: string;
    studentId: string;
    feedbackId: string;
  }
): Promise<EmailResult> {
  return sendNotification('class_feedback', { email: to, name: data.parentName }, {
    parentName: data.parentName,
    studentName: data.studentName,
    clubName: data.clubName,
    className: data.className,
    classDate: data.classDate,
    feedbackText: data.feedbackText,
    coachName: data.coachName,
    highlights: data.highlights,
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
