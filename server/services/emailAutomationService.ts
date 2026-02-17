import { db } from '../db';
import { sql } from 'drizzle-orm';
import emailService, { EMAIL_TEMPLATES } from './emailService';

const MASTER_TEMPLATE = process.env.SENDGRID_MASTER_TEMPLATE_ID || 'master_template';

type AutomatedEmailTrigger = 
  | 'welcome'
  | 'day_3_checkin'
  | 'day_7_mid_trial'
  | 'trial_ending_soon'
  | 'trial_expired'
  | 'win_back'
  | 'churn_risk'
  | 'parent_welcome'
  | 'birthday_wish'
  | 'belt_promotion'
  | 'attendance_alert'
  | 'coach_invite'
  | 'new_student_added';

interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

async function hasAlreadySent(
  triggerType: AutomatedEmailTrigger,
  recipient: string,
  entityId?: string,
  withinDays?: number
): Promise<boolean> {
  try {
    let result: any[];
    
    if (entityId && withinDays) {
      result = await db.execute(sql`
        SELECT id FROM automated_email_logs 
        WHERE trigger_type = ${triggerType}
        AND recipient = ${recipient}
        AND status = 'sent'
        AND (club_id = ${entityId}::uuid OR student_id = ${entityId}::uuid OR user_id = ${entityId}::uuid)
        AND sent_at > NOW() - INTERVAL '1 day' * ${withinDays}
        LIMIT 1
      `) as any[];
    } else if (entityId) {
      result = await db.execute(sql`
        SELECT id FROM automated_email_logs 
        WHERE trigger_type = ${triggerType}
        AND recipient = ${recipient}
        AND status = 'sent'
        AND (club_id = ${entityId}::uuid OR student_id = ${entityId}::uuid OR user_id = ${entityId}::uuid)
        LIMIT 1
      `) as any[];
    } else if (withinDays) {
      result = await db.execute(sql`
        SELECT id FROM automated_email_logs 
        WHERE trigger_type = ${triggerType}
        AND recipient = ${recipient}
        AND status = 'sent'
        AND sent_at > NOW() - INTERVAL '1 day' * ${withinDays}
        LIMIT 1
      `) as any[];
    } else {
      result = await db.execute(sql`
        SELECT id FROM automated_email_logs 
        WHERE trigger_type = ${triggerType}
        AND recipient = ${recipient}
        AND status = 'sent'
        LIMIT 1
      `) as any[];
    }
    
    return result.length > 0;
  } catch (error) {
    console.error('[EmailAutomation] Error checking if email was sent:', error);
    return false;
  }
}

async function logEmail(
  triggerType: AutomatedEmailTrigger,
  recipient: string,
  templateId: string | null,
  status: 'sent' | 'failed' | 'skipped',
  messageId?: string,
  error?: string,
  metadata?: Record<string, any>,
  clubId?: string,
  studentId?: string,
  userId?: string
): Promise<void> {
  try {
    const metadataJson = JSON.stringify(metadata || {});
    
    if (clubId && studentId && userId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, club_id, student_id, user_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${clubId}::uuid, ${studentId}::uuid, ${userId}::uuid)
      `);
    } else if (clubId && studentId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, club_id, student_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${clubId}::uuid, ${studentId}::uuid)
      `);
    } else if (clubId && userId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, club_id, user_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${clubId}::uuid, ${userId}::uuid)
      `);
    } else if (studentId && userId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, student_id, user_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${studentId}::uuid, ${userId}::uuid)
      `);
    } else if (clubId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, club_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${clubId}::uuid)
      `);
    } else if (studentId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, student_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${studentId}::uuid)
      `);
    } else if (userId) {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata, user_id)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb, ${userId}::uuid)
      `);
    } else {
      await db.execute(sql`
        INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, message_id, error, metadata)
        VALUES (${triggerType}, ${recipient}, ${templateId}, ${status}::email_status, ${messageId || null}, ${error || null}, ${metadataJson}::jsonb)
      `);
    }
  } catch (err) {
    console.error('[EmailAutomation] Failed to log email:', err);
  }
}

export async function sendWelcomeEmailAuto(
  clubId: string,
  ownerEmail: string,
  ownerName: string,
  clubName: string
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'welcome';
  
  if (await hasAlreadySent(triggerType, ownerEmail, clubId)) {
    console.log(`[EmailAutomation] Welcome email already sent to ${ownerEmail}`);
    return { success: true, skipped: true, reason: 'Already sent' };
  }
  
  let clubLanguage = 'English';
  try {
    const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${clubId}::uuid LIMIT 1`);
    clubLanguage = ((clubLangResult as any[])[0]?.wizard_data as any)?.language || 'English';
  } catch (e) {}
  
  const result = await emailService.sendWelcomeEmail(ownerEmail, { ownerName, clubName, language: clubLanguage });
  
  await logEmail(
    triggerType, ownerEmail, MASTER_TEMPLATE,
    result.success ? 'sent' : 'failed',
    result.messageId, result.error,
    { ownerName, clubName, emailType: 'welcome_club' }, clubId
  );
  
  console.log(`[EmailAutomation] Welcome email ${result.success ? 'sent' : 'failed'} to ${ownerEmail}`);
  return result;
}

export async function sendParentWelcomeEmailAuto(
  clubId: string,
  studentId: string,
  parentEmail: string,
  parentName: string,
  studentName: string,
  clubName: string
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'parent_welcome';
  
  if (await hasAlreadySent(triggerType, parentEmail, studentId)) {
    console.log(`[EmailAutomation] Parent welcome email already sent to ${parentEmail}`);
    return { success: true, skipped: true, reason: 'Already sent' };
  }
  
  let clubLanguage = 'English';
  try {
    const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${clubId}::uuid LIMIT 1`);
    clubLanguage = ((clubLangResult as any[])[0]?.wizard_data as any)?.language || 'English';
  } catch (e) {}
  
  const result = await emailService.sendParentWelcomeEmail(parentEmail, {
    parentName,
    studentName,
    clubName,
    studentId,
    language: clubLanguage,
  });
  
  await logEmail(
    triggerType, parentEmail, MASTER_TEMPLATE,
    result.success ? 'sent' : 'failed',
    result.messageId, result.error,
    { parentName, studentName, clubName, emailType: 'welcome_parent' }, clubId, studentId
  );
  
  console.log(`[EmailAutomation] Parent welcome email ${result.success ? 'sent' : 'failed'} to ${parentEmail}`);
  return result;
}

export async function sendBeltPromotionEmailAuto(
  clubId: string,
  studentId: string,
  parentEmail: string,
  studentName: string,
  beltColor: string,
  clubName: string,
  promotionId: string,
  totalXp: string,
  classesAttended: number,
  monthsTrained: number
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'belt_promotion';
  
  if (await hasAlreadySent(triggerType, parentEmail, promotionId)) {
    console.log(`[EmailAutomation] Belt promotion email already sent for promotion ${promotionId}`);
    return { success: true, skipped: true, reason: 'Already sent' };
  }
  
  let clubLanguage = 'English';
  try {
    const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${clubId}::uuid LIMIT 1`);
    clubLanguage = ((clubLangResult as any[])[0]?.wizard_data as any)?.language || 'English';
  } catch (e) {}
  
  const result = await emailService.sendBeltPromotionEmail(parentEmail, {
    studentName,
    beltColor,
    clubName,
    promotionDate: new Date().toLocaleDateString(),
    totalXp,
    classesAttended,
    monthsTrained,
    promotionId,
    language: clubLanguage,
  });
  
  await logEmail(
    triggerType, parentEmail, MASTER_TEMPLATE,
    result.success ? 'sent' : 'failed',
    result.messageId, result.error,
    { studentName, beltColor, promotionId, emailType: 'belt_promotion' }, clubId, studentId
  );
  
  console.log(`[EmailAutomation] Belt promotion email ${result.success ? 'sent' : 'failed'} to ${parentEmail}`);
  return result;
}

export async function sendBirthdayWishEmailAuto(
  clubId: string,
  studentId: string,
  parentEmail: string,
  studentName: string,
  clubName: string
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'birthday_wish';
  const currentYear = new Date().getFullYear();
  
  if (await hasAlreadySent(triggerType, parentEmail, studentId, 365)) {
    console.log(`[EmailAutomation] Birthday email already sent this year to ${parentEmail}`);
    return { success: true, skipped: true, reason: 'Already sent this year' };
  }
  
  let clubLanguage = 'English';
  try {
    const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${clubId}::uuid LIMIT 1`);
    clubLanguage = ((clubLangResult as any[])[0]?.wizard_data as any)?.language || 'English';
  } catch (e) {}
  
  const result = await emailService.sendBirthdayWishEmail(parentEmail, {
    studentName,
    clubName,
    language: clubLanguage,
  });
  
  await logEmail(
    triggerType, parentEmail, MASTER_TEMPLATE,
    result.success ? 'sent' : 'failed',
    result.messageId, result.error,
    { studentName, clubName, year: currentYear, emailType: 'birthday_wish' }, clubId, studentId
  );
  
  console.log(`[EmailAutomation] Birthday email ${result.success ? 'sent' : 'failed'} to ${parentEmail}`);
  return result;
}

export async function sendAttendanceAlertEmailAuto(
  clubId: string,
  studentId: string,
  parentEmail: string,
  parentName: string,
  studentName: string,
  clubName: string,
  daysSinceLastClass: number
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'attendance_alert';
  
  if (await hasAlreadySent(triggerType, parentEmail, studentId, 14)) {
    console.log(`[EmailAutomation] Attendance alert already sent within 14 days to ${parentEmail}`);
    return { success: true, skipped: true, reason: 'Already sent recently' };
  }
  
  let clubLanguage = 'English';
  try {
    const clubLangResult = await db.execute(sql`SELECT wizard_data FROM clubs WHERE id = ${clubId}::uuid LIMIT 1`);
    clubLanguage = ((clubLangResult as any[])[0]?.wizard_data as any)?.language || 'English';
  } catch (e) {}
  
  const result = await emailService.sendAttendanceAlertEmail(parentEmail, {
    parentName,
    studentName,
    clubName,
    daysSinceLastClass,
    language: clubLanguage,
  });
  
  await logEmail(
    triggerType, parentEmail, MASTER_TEMPLATE,
    result.success ? 'sent' : 'failed',
    result.messageId, result.error,
    { parentName, studentName, daysSinceLastClass, emailType: 'attendance_alert' }, clubId, studentId
  );
  
  console.log(`[EmailAutomation] Attendance alert ${result.success ? 'sent' : 'failed'} to ${parentEmail}`);
  return result;
}

export async function runScheduledEmailTasks(): Promise<void> {
  console.log('[EmailAutomation] Running scheduled email tasks...');
  
  try {
    await sendDay3CheckinEmails();
    await sendDay7MidTrialEmails();
    await sendTrialEndingSoonEmails();
    await sendTrialExpiredEmails();
    await sendBirthdayEmails();
    await sendAttendanceAlertEmails();
    await sendChurnRiskEmails();
    await sendWinBackEmails();
    
    console.log('[EmailAutomation] Scheduled tasks completed');
  } catch (error) {
    console.error('[EmailAutomation] Error running scheduled tasks:', error);
  }
}

async function sendDay3CheckinEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'day_3_checkin';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name, wizard_data
    FROM clubs
    WHERE trial_status = 'active'
    AND created_at >= NOW() - INTERVAL '4 days'
    AND created_at <= NOW() - INTERVAL '3 days'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'day_3_checkin' AND status = 'sent' AND club_id IS NOT NULL
    )
  `);
  
  for (const club of clubs as any[]) {
    const clubLanguage = (club?.wizard_data as any)?.language || 'English';
    const result = await emailService.sendDay3CheckinEmail(club.owner_email, {
      ownerName: club.owner_name || 'there',
      language: clubLanguage,
    });
    
    await logEmail(
      triggerType, club.owner_email, MASTER_TEMPLATE,
      result.success ? 'sent' : 'failed',
      result.messageId, result.error,
      { clubName: club.name, emailType: 'day_3_checkin' }, club.id
    );
    
    console.log(`[EmailAutomation] Day 3 check-in ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendDay7MidTrialEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'day_7_mid_trial';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name, wizard_data
    FROM clubs
    WHERE trial_status = 'active'
    AND created_at >= NOW() - INTERVAL '8 days'
    AND created_at <= NOW() - INTERVAL '7 days'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'day_7_mid_trial' AND status = 'sent' AND club_id IS NOT NULL
    )
  `);
  
  for (const club of clubs as any[]) {
    const clubLanguage = (club?.wizard_data as any)?.language || 'English';
    const result = await emailService.sendDay7MidTrialEmail(club.owner_email, {
      ownerName: club.owner_name || 'there',
      language: clubLanguage,
    });
    
    await logEmail(
      triggerType, club.owner_email, MASTER_TEMPLATE,
      result.success ? 'sent' : 'failed',
      result.messageId, result.error,
      { clubName: club.name, emailType: 'day_7_mid_trial' }, club.id
    );
    
    console.log(`[EmailAutomation] Day 7 mid-trial ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendTrialEndingSoonEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'trial_ending_soon';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name, trial_end, wizard_data
    FROM clubs
    WHERE trial_status = 'active'
    AND trial_end IS NOT NULL
    AND trial_end > NOW()
    AND trial_end <= NOW() + INTERVAL '3 days'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'trial_ending_soon' AND status = 'sent' AND club_id IS NOT NULL
    )
  `);
  
  for (const club of clubs as any[]) {
    const daysLeft = Math.ceil((new Date(club.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const clubLanguage = (club?.wizard_data as any)?.language || 'English';
    
    const result = await emailService.sendTrialEndingSoonEmail(club.owner_email, {
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      daysLeft,
      language: clubLanguage,
    });
    
    await logEmail(
      triggerType, club.owner_email, MASTER_TEMPLATE,
      result.success ? 'sent' : 'failed',
      result.messageId, result.error,
      { clubName: club.name, daysLeft, emailType: 'trial_ending' }, club.id
    );
    
    console.log(`[EmailAutomation] Trial ending soon ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendTrialExpiredEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'trial_expired';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name, wizard_data
    FROM clubs
    WHERE trial_status = 'active'
    AND trial_end IS NOT NULL
    AND trial_end < NOW()
    AND trial_end > NOW() - INTERVAL '1 day'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'trial_expired' AND status = 'sent' AND club_id IS NOT NULL
    )
  `);
  
  for (const club of clubs as any[]) {
    const clubLanguage = (club?.wizard_data as any)?.language || 'English';
    const result = await emailService.sendTrialExpiredEmail(club.owner_email, {
      ownerName: club.owner_name || 'there',
      clubName: club.name,
      language: clubLanguage,
    });
    
    await logEmail(
      triggerType, club.owner_email, MASTER_TEMPLATE,
      result.success ? 'sent' : 'failed',
      result.messageId, result.error,
      { clubName: club.name, emailType: 'trial_expired' }, club.id
    );
    
    console.log(`[EmailAutomation] Trial expired ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendBirthdayEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'birthday_wish';
  
  const students = await db.execute(sql`
    SELECT s.id, s.name, s.parent_email, s.parent_name, s.club_id, c.name as club_name
    FROM students s
    JOIN clubs c ON s.club_id = c.id
    WHERE s.parent_email IS NOT NULL
    AND s.birthdate IS NOT NULL
    AND EXTRACT(MONTH FROM s.birthdate) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(DAY FROM s.birthdate) = EXTRACT(DAY FROM CURRENT_DATE)
    AND s.id NOT IN (
      SELECT student_id FROM automated_email_logs 
      WHERE trigger_type = 'birthday_wish' 
      AND status = 'sent' 
      AND student_id IS NOT NULL
      AND sent_at > NOW() - INTERVAL '365 days'
    )
  `);
  
  for (const student of students as any[]) {
    await sendBirthdayWishEmailAuto(
      student.club_id,
      student.id,
      student.parent_email,
      student.name,
      student.club_name
    );
  }
}

async function sendAttendanceAlertEmails(): Promise<void> {
  const activeClubs = await db.execute(sql`
    SELECT DISTINCT c.id as club_id
    FROM clubs c
    JOIN students s ON s.club_id = c.id
    WHERE s.last_class_at > NOW() - INTERVAL '10 days'
  `);
  const activeClubIds = (activeClubs as any[]).map(c => c.club_id);
  
  if (activeClubIds.length === 0) {
    console.log('[EmailAutomation] No clubs with recent grading activity - skipping attendance alerts (likely holiday)');
    return;
  }

  const students = await db.execute(sql`
    SELECT s.id, s.name, s.parent_email, s.parent_name, s.club_id, s.last_class_at, c.name as club_name,
           EXTRACT(DAY FROM NOW() - s.last_class_at) as days_since
    FROM students s
    JOIN clubs c ON s.club_id = c.id
    WHERE s.parent_email IS NOT NULL
    AND s.last_class_at IS NOT NULL
    AND s.last_class_at < NOW() - INTERVAL '7 days'
    AND s.club_id IN (
      SELECT DISTINCT ss.club_id FROM students ss 
      WHERE ss.last_class_at > NOW() - INTERVAL '10 days'
      AND ss.club_id = s.club_id
    )
    AND s.id NOT IN (
      SELECT student_id FROM automated_email_logs 
      WHERE trigger_type = 'attendance_alert' 
      AND status = 'sent' 
      AND student_id IS NOT NULL
      AND sent_at > NOW() - INTERVAL '14 days'
    )
  `);
  
  for (const student of students as any[]) {
    await sendAttendanceAlertEmailAuto(
      student.club_id,
      student.id,
      student.parent_email,
      student.parent_name || 'there',
      student.name,
      student.club_name,
      Math.floor(student.days_since)
    );
  }
}

async function sendChurnRiskEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'churn_risk';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name, updated_at,
           EXTRACT(DAY FROM NOW() - updated_at) as days_inactive
    FROM clubs
    WHERE (status = 'active' OR trial_status = 'active')
    AND updated_at < NOW() - INTERVAL '14 days'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'churn_risk' 
      AND status = 'sent' 
      AND club_id IS NOT NULL
      AND sent_at > NOW() - INTERVAL '30 days'
    )
  `);
  
  for (const club of clubs as any[]) {
    const result = await sendChurnRiskEmailDirect(
      club.id,
      club.owner_email,
      club.owner_name || 'there',
      club.name
    );
    
    console.log(`[EmailAutomation] Churn risk ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendWinBackEmails(): Promise<void> {
  const triggerType: AutomatedEmailTrigger = 'win_back';
  
  const clubs = await db.execute(sql`
    SELECT id, owner_email, owner_name, name
    FROM clubs
    WHERE status = 'churned'
    AND updated_at < NOW() - INTERVAL '30 days'
    AND updated_at > NOW() - INTERVAL '90 days'
    AND id NOT IN (
      SELECT club_id FROM automated_email_logs 
      WHERE trigger_type = 'win_back' 
      AND status = 'sent' 
      AND club_id IS NOT NULL
      AND sent_at > NOW() - INTERVAL '60 days'
    )
  `);
  
  for (const club of clubs as any[]) {
    const result = await sendWinBackEmailDirect(
      club.id,
      club.owner_email,
      club.owner_name || 'there',
      club.name
    );
    
    console.log(`[EmailAutomation] Win back ${result.success ? 'sent' : 'failed'} to ${club.owner_email}`);
  }
}

async function sendChurnRiskEmailDirect(
  clubId: string,
  ownerEmail: string,
  ownerName: string,
  clubName: string
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'churn_risk';
  
  try {
    const { client, fromEmail } = await getEmailClient();
    
    if (!client) {
      return { success: false, error: 'SendGrid not configured' };
    }
    
    const msg = {
      to: ownerEmail,
      from: { email: fromEmail || 'hello@mytaek.com', name: 'TaekUp' },
      subject: 'Need Help Getting Started? We\'re Here for You!',
      html: generateChurnRiskHtml(ownerName, clubName),
    };
    
    const response = await client.send(msg);
    const messageId = response[0]?.headers?.['x-message-id'];
    
    await logEmail(triggerType, ownerEmail, null, 'sent', messageId, undefined, { ownerName, clubName }, clubId);
    
    return { success: true, messageId };
  } catch (error: any) {
    await logEmail(triggerType, ownerEmail, null, 'failed', undefined, error.message, { ownerName, clubName }, clubId);
    return { success: false, error: error.message };
  }
}

async function sendWinBackEmailDirect(
  clubId: string,
  ownerEmail: string,
  ownerName: string,
  clubName: string
): Promise<EmailSendResult> {
  const triggerType: AutomatedEmailTrigger = 'win_back';
  
  try {
    const { client, fromEmail } = await getEmailClient();
    
    if (!client) {
      return { success: false, error: 'SendGrid not configured' };
    }
    
    const msg = {
      to: ownerEmail,
      from: { email: fromEmail || 'hello@mytaek.com', name: 'TaekUp' },
      subject: 'We Want You Back! Special Offer Inside',
      html: generateWinBackHtml(ownerName, clubName),
    };
    
    const response = await client.send(msg);
    const messageId = response[0]?.headers?.['x-message-id'];
    
    await logEmail(triggerType, ownerEmail, null, 'sent', messageId, undefined, { ownerName, clubName }, clubId);
    
    return { success: true, messageId };
  } catch (error: any) {
    await logEmail(triggerType, ownerEmail, null, 'failed', undefined, error.message, { ownerName, clubName }, clubId);
    return { success: false, error: error.message };
  }
}

async function getEmailClient() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (xReplitToken && hostname) {
    try {
      const sgMail = await import('@sendgrid/mail').then(m => m.default);
      const connectionSettings = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      ).then(res => res.json()).then(data => data.items?.[0]);

      if (connectionSettings?.settings?.api_key) {
        sgMail.setApiKey(connectionSettings.settings.api_key);
        return { client: sgMail, fromEmail: connectionSettings.settings.from_email || 'hello@mytaek.com' };
      }
    } catch (err) {
      console.error('[EmailAutomation] Failed to get SendGrid client:', err);
    }
  }

  if (process.env.SENDGRID_API_KEY) {
    const sgMail = await import('@sendgrid/mail').then(m => m.default);
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    return { client: sgMail, fromEmail: 'hello@mytaek.com' };
  }
  
  return { client: null, fromEmail: null };
}

function generateWinBackHtml(ownerName: string, clubName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e2536; padding: 0; border-radius: 12px;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%); padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <span style="font-size: 24px; font-weight: bold; color: white;">TAEK</span><span style="font-size: 24px; font-weight: bold; color: #22d3ee;">UP</span>
      </div>
      <div style="padding: 30px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 20px;">💜</div>
        <h1 style="color: white; font-size: 28px; margin: 0 0 20px 0;">We Miss You, ${ownerName}!</h1>
        <p style="color: #94a3b8; font-size: 16px; line-height: 1.6;">
          It's been a while since we've seen <strong style="color: white;">${clubName}</strong> on TaekUp. 
          We wanted to reach out and let you know we're still here to help your dojang grow!
        </p>
        <div style="background-color: #0f1419; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left;">
          <p style="color: #9B59B6; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; margin: 0 0 15px 0;">WHAT'S NEW SINCE YOU LEFT</p>
          <ul style="color: #94a3b8; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>Enhanced Dojang Rivals with Team Battles</li>
            <li>Improved AI Class Planner</li>
            <li>New Parent Engagement Tools</li>
            <li>Better Analytics Dashboard</li>
          </ul>
        </div>
        <div style="background-color: #9B59B6; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: white; font-size: 18px; margin: 0;">
            🎁 <strong>Exclusive Win-Back Offer:</strong><br>Get <strong>50% off</strong> for 3 months!
          </p>
        </div>
        <a href="https://mytaek.com/pricing" style="display: inline-block; background-color: #22d3ee; color: #0f1419; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0;">
          COME BACK TO TAEKUP →
        </a>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 20px;">
          Ready to grow your dojang again?<br>Just reply to this email — we're here to help!
        </p>
      </div>
      <hr style="border: none; border-top: 1px solid #2d3748; margin: 0 40px;">
      <div style="padding: 30px; text-align: center;">
        <p style="margin: 0 0 5px 0;">
          <span style="font-size: 18px; font-weight: bold; color: white;">TAEK</span><span style="font-size: 18px; font-weight: bold; color: #22d3ee;">UP</span>
        </p>
        <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 15px 0;">EVERY STEP TAKES YOU UP</p>
        <p style="margin: 10px 0;">
          <a href="mailto:support@mytaek.com" style="color: #22d3ee; text-decoration: none; font-size: 14px;">support@mytaek.com</a>
        </p>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0;">
          <a href="https://mytaek.com/email-preferences" style="color: #64748b; text-decoration: none;">Unsubscribe</a> · 
          <a href="https://mytaek.com/privacy" style="color: #64748b; text-decoration: none;">Privacy</a>
        </p>
        <p style="color: #475569; font-size: 11px; margin: 15px 0 0 0;">© 2025 TaekUp · Part of the MyTaek Ecosystem</p>
      </div>
    </div>
  `;
}

function generateChurnRiskHtml(ownerName: string, clubName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1e2536; padding: 0; border-radius: 12px;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%); padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <span style="font-size: 24px; font-weight: bold; color: white;">TAEK</span><span style="font-size: 24px; font-weight: bold; color: #22d3ee;">UP</span>
      </div>
      <div style="padding: 30px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 20px;">🤝</div>
        <h1 style="color: white; font-size: 28px; margin: 0 0 20px 0;">Need Help Getting Started?</h1>
        <p style="color: white; font-size: 16px;">Hi ${ownerName},</p>
        <p style="color: #94a3b8; font-size: 16px; line-height: 1.6;">
          We noticed you haven't been using <strong style="color: white;">${clubName}</strong> on TaekUp lately, 
          and we wanted to check in. Is there anything we can help you with?
        </p>
        <div style="background-color: #0f1419; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left;">
          <p style="color: #3498DB; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; margin: 0 0 15px 0;">HOW CAN WE HELP?</p>
          <ul style="color: #94a3b8; margin: 0; padding-left: 20px; line-height: 1.8;">
            <li>Need help setting up your student roster?</li>
            <li>Questions about Dojang Rivals or gamification?</li>
            <li>Want a personalized demo of our features?</li>
            <li>Having technical issues we can solve?</li>
          </ul>
        </div>
        <div style="background-color: #1e3a5f; border-radius: 8px; border-left: 4px solid #3498DB; padding: 20px; margin: 20px 0;">
          <p style="color: white; font-size: 16px; margin: 0; text-align: center;">
            📞 <strong>Free Support Session</strong><br>
            <span style="color: #94a3b8; font-size: 14px;">Reply to this email and we'll schedule a 15-minute call to help you get the most out of TaekUp!</span>
          </p>
        </div>
        <a href="https://mytaek.com/help" style="display: inline-block; background-color: #3498DB; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0;">
          GET HELP NOW →
        </a>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 20px;">
          We're committed to your success!<br>Just reply to this email — we're here to help!
        </p>
      </div>
      <hr style="border: none; border-top: 1px solid #2d3748; margin: 0 40px;">
      <div style="padding: 30px; text-align: center;">
        <p style="margin: 0 0 5px 0;">
          <span style="font-size: 18px; font-weight: bold; color: white;">TAEK</span><span style="font-size: 18px; font-weight: bold; color: #22d3ee;">UP</span>
        </p>
        <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 15px 0;">EVERY STEP TAKES YOU UP</p>
        <p style="margin: 10px 0;">
          <a href="mailto:support@mytaek.com" style="color: #22d3ee; text-decoration: none; font-size: 14px;">support@mytaek.com</a>
        </p>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0;">
          <a href="https://mytaek.com/email-preferences" style="color: #64748b; text-decoration: none;">Unsubscribe</a> · 
          <a href="https://mytaek.com/privacy" style="color: #64748b; text-decoration: none;">Privacy</a>
        </p>
        <p style="color: #475569; font-size: 11px; margin: 15px 0 0 0;">© 2025 TaekUp · Part of the MyTaek Ecosystem</p>
      </div>
    </div>
  `;
}

export default {
  sendWelcomeEmailAuto,
  sendParentWelcomeEmailAuto,
  sendBeltPromotionEmailAuto,
  sendBirthdayWishEmailAuto,
  sendAttendanceAlertEmailAuto,
  runScheduledEmailTasks,
};
