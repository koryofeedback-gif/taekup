import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
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
  WELCOME: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  DAY_3_CHECKIN: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  DAY_7_MID_TRIAL: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  TRIAL_ENDING_SOON: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  TRIAL_EXPIRED: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  COACH_INVITE: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  RESET_PASSWORD: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  NEW_STUDENT_ADDED: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  MONTHLY_REVENUE_REPORT: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  PARENT_WELCOME: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  CLASS_FEEDBACK: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  BELT_PROMOTION: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  ATTENDANCE_ALERT: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
  BIRTHDAY_WISH: 'd-REPLACE_WITH_YOUR_TEMPLATE_ID',
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
  subject?: string
): Promise<EmailResult> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    const msg: any = {
      to,
      from: {
        email: fromEmail,
        name: 'TaekUp'
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
  return sendEmail(to, EMAIL_TEMPLATES.WELCOME, {
    ...data,
    ctaUrl: `${BASE_URL}/setup`,
  }, `Welcome to TaekUp - Your 14-Day Trial Has Started!`);
}

export async function sendDay3CheckinEmail(
  to: string,
  data: { ownerName: string }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.DAY_3_CHECKIN, data, 
    `How's it going? Upload your student list yet?`);
}

export async function sendDay7MidTrialEmail(
  to: string,
  data: { ownerName: string }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.DAY_7_MID_TRIAL, {
    ...data,
    aiFeedbackUrl: `${BASE_URL}/ai-feedback`,
  }, `7 Days Left - Have You Tried AI Feedback?`);
}

export async function sendTrialEndingSoonEmail(
  to: string,
  data: { ownerName: string; clubName: string; daysLeft: number }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.TRIAL_ENDING_SOON, data, 
    `⏰ Only ${data.daysLeft} Days Left on Your Trial`);
}

export async function sendTrialExpiredEmail(
  to: string,
  data: { ownerName: string; clubName: string }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.TRIAL_EXPIRED, data, 
    `Your Trial Has Ended - Upgrade to Keep Access`);
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
  return sendEmail(to, EMAIL_TEMPLATES.COACH_INVITE, data, 
    `${data.ownerName} invited you to join ${data.clubName} as a Coach`);
}

export async function sendResetPasswordEmail(
  to: string,
  data: { userName: string; resetToken: string }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.RESET_PASSWORD, {
    ...data,
    resetUrl: `${BASE_URL}/reset-password?token=${data.resetToken}`,
  }, `Reset Your TaekUp Password`);
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
  return sendEmail(to, EMAIL_TEMPLATES.NEW_STUDENT_ADDED, {
    ...data,
    studentProfileUrl: `${BASE_URL}/student/${data.studentId}`,
  }, `New Student Added: ${data.studentName}`);
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
  return sendEmail(to, EMAIL_TEMPLATES.MONTHLY_REVENUE_REPORT, data, 
    `💰 Your ${data.monthName} Earnings Report - $${data.totalEarnings}`);
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
  return sendEmail(to, EMAIL_TEMPLATES.PARENT_WELCOME, {
    ...data,
    parentPortalUrl: `${BASE_URL}/parent/${data.studentId}`,
  }, `Track ${data.studentName}'s Progress on TaekUp`);
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
  return sendEmail(to, EMAIL_TEMPLATES.CLASS_FEEDBACK, {
    ...data,
    studentProfileUrl: `${BASE_URL}/student/${data.studentId}`,
    shareUrl: `${BASE_URL}/share/feedback/${data.feedbackId}`,
  }, `⭐ ${data.studentName} Did Great Today!`);
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
  return sendEmail(to, EMAIL_TEMPLATES.BELT_PROMOTION, {
    ...data,
    certificateUrl: `${BASE_URL}/certificate/${data.promotionId}`,
    shareUrl: `${BASE_URL}/share/promotion/${data.promotionId}`,
  }, `🎊 Congratulations! ${data.studentName} Earned a New Belt!`);
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
  return sendEmail(to, EMAIL_TEMPLATES.ATTENDANCE_ALERT, {
    ...data,
    scheduleUrl: `${BASE_URL}/schedule`,
  }, `We Miss ${data.studentName}! Is Everything Okay?`);
}

export async function sendBirthdayWishEmail(
  to: string,
  data: { 
    studentName: string; 
    clubName: string;
  }
): Promise<EmailResult> {
  return sendEmail(to, EMAIL_TEMPLATES.BIRTHDAY_WISH, data, 
    `🎂 Happy Birthday, ${data.studentName}!`);
}

export default {
  sendWelcomeEmail,
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
  EMAIL_TEMPLATES,
};
