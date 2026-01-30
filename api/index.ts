// TaekUp API v2.1.1 - Class feedback email fix (Jan 2026)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Stripe from 'stripe';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sgMail from '@sendgrid/mail';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

// Trust Tier thresholds for video auto-approval
const TRUST_TIER_VERIFIED_THRESHOLD = 10; // 10 consecutive approvals = verified
const TRUST_TIER_TRUSTED_THRESHOLD = 25; // 25 consecutive approvals = trusted
const SPOT_CHECK_RATIO = 10; // 1 in 10 videos are spot-checked for verified students

// =====================================================
// GAMIFICATION MATRICES - Arena XP & Global Rank Scoring
// =====================================================
type ChallengeTierKey = 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC';
type ChallengeTypeKey = 'coach_pick' | 'general';

const CHALLENGE_XP_MATRIX = {
  coach_pick: {
    EASY:   { freeXp: 10, premiumXp: 20 },
    MEDIUM: { freeXp: 20, premiumXp: 40 },
    HARD:   { freeXp: 35, premiumXp: 70 },
    EPIC:   { freeXp: 50, premiumXp: 100 },
  },
  general: {
    EASY:   { freeXp: 5,  premiumXp: 10 },
    MEDIUM: { freeXp: 10, premiumXp: 20 },
    HARD:   { freeXp: 15, premiumXp: 30 },
    EPIC:   { freeXp: 25, premiumXp: 50 },
  },
} as const;

const ARENA_GLOBAL_SCORE_MATRIX = {
  coach_pick: {
    EASY:   { noVideo: 1,  withVideo: 5 },
    MEDIUM: { noVideo: 3,  withVideo: 15 },
    HARD:   { noVideo: 5,  withVideo: 25 },
    EPIC:   { noVideo: 10, withVideo: 35 },
  },
  general: {
    EASY:   { noVideo: 1,  withVideo: 3 },
    MEDIUM: { noVideo: 2,  withVideo: 5 },
    HARD:   { noVideo: 3,  withVideo: 10 },
    EPIC:   { noVideo: 5,  withVideo: 15 },
  },
} as const;

function calculateLocalXp(challengeType: ChallengeTypeKey, tier: ChallengeTierKey, hasVideoProof: boolean): number {
  const matrix = CHALLENGE_XP_MATRIX[challengeType][tier];
  return hasVideoProof ? matrix.premiumXp : matrix.freeXp;
}

function calculateArenaGlobalScore(challengeType: ChallengeTypeKey, difficulty: ChallengeTierKey, hasVideoProof: boolean): number {
  const matrix = ARENA_GLOBAL_SCORE_MATRIX[challengeType];
  const tierScores = matrix[difficulty];
  return hasVideoProof ? tierScores.withVideo : tierScores.noVideo;
}

// Generate deterministic UUID from challenge type string (since challenges are hardcoded, not in DB)
function generateChallengeUUID(challengeType: string): string {
  const hash = crypto.createHash('sha256').update(`taekup-challenge-${challengeType}`).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

const MASTER_TEMPLATE_ID = process.env.SENDGRID_MASTER_TEMPLATE_ID || 'd-4dcfd1bfcaca4eb2a8af8085810c10c2';
const BASE_URL = 'https://www.mytaek.com';

const EMAIL_CONTENT: Record<string, { subject: string; title: string; body: string; btn_text?: string; btn_url?: string; from: string }> = {
  // Club owner welcome
  WELCOME: {
    subject: 'Welcome to TaekUp! Let\'s set up your Dojo 🥋',
    title: 'Your Dojo is Live!',
    body: `Hi {{ownerName}},<br><br>Congratulations on joining TaekUp! Your club <strong>{{clubName}}</strong> is now active.<br><br>Here's what to do next:<br>• Add your first student<br>• Set up your Stripe wallet via DojoMint™ Protocol<br>• Customize your belt system<br><br>Your 14-day free trial has started!`,
    btn_text: 'Go to Dashboard',
    btn_url: `${BASE_URL}/app/admin`,
    from: 'hello@mytaek.com'
  },
  // Parent welcome
  PARENT_WELCOME: {
    subject: '🎉 {{studentName}} is ready to train at {{clubName}}!',
    title: 'Welcome to {{clubName}}! 🥋',
    body: `Hi {{parentName}},<br><br>Great news! <strong>{{studentName}}</strong> has been enrolled at <strong>{{clubName}}</strong> and their martial arts journey is about to begin!<br><br><div style='background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;'><h3 style='margin: 0 0 15px 0;'>🔐 Your Login Credentials:</h3><div style='background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;'><strong>Email:</strong> {{parentEmail}}<br><strong>Password:</strong> 1234</div><p style='margin: 15px 0 0 0; font-size: 13px; color: #fbbf24;'>⚠️ Please change your password after first login for security!</p></div><div style='background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;'><h3 style='margin: 0 0 10px 0;'>🌟 What's waiting for {{studentName}}:</h3><ul style='margin: 0; padding-left: 20px;'><li>Track progress & earn <strong>HonorXP™</strong></li><li>Unlock awesome <strong>Legacy Cards™</strong></li><li>Climb the <strong>Global Shogun Rank™</strong></li><li>Complete fun challenges in the Arena</li></ul></div><div style='background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 20px; border-radius: 12px; margin: 20px 0; border: 2px dashed #f59e0b;'><h3 style='margin: 0 0 12px 0; color: #92400e;'>✨ Unlock Premium for $4.99/month:</h3><div style='color: #78350f; font-size: 14px;'><div style='margin-bottom: 8px;'>🔒 <strong>ChronosBelt™ Predictor</strong> - AI predicts your child's black belt date</div><div style='margin-bottom: 8px;'>🔒 <strong>Legacy Cards™</strong> - Digital collectible cards for achievements</div><div style='margin-bottom: 8px;'>🔒 <strong>2x HonorXP™</strong> - Double points with video proof submissions</div><div style='margin-bottom: 8px;'>🔒 <strong>AI Training Insights</strong> - Personalized feedback from TaekBot</div><div style='margin-bottom: 8px;'>🔒 <strong>Priority Class Booking</strong> - Book classes before others</div><div style='margin-bottom: 8px;'>🔒 <strong>Home Dojo™ Habits</strong> - Daily practice tracking for discipline</div><div>🔒 <strong>Extended Curriculum</strong> - Access exclusive training content</div></div></div>`,
    btn_text: 'Login to Parent Portal',
    btn_url: `${BASE_URL}/login`,
    from: 'hello@mytaek.com'
  },
  // Coach invite
  COACH_INVITE: {
    subject: 'You\'ve been invited to join {{clubName}} as a Coach!',
    title: 'Coach Invitation',
    body: `Hi {{name}},<br><br>You've been invited to join <strong>{{clubName}}</strong> as a coach on TaekUp.<br><br><div style='background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 20px; border-radius: 12px; margin: 20px 0; color: white;'><h3 style='margin: 0 0 15px 0;'>🔐 Your Login Credentials:</h3><div style='background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;'><strong>Email:</strong> {{coachEmail}}<br><strong>Password:</strong> {{tempPassword}}</div><p style='margin: 15px 0 0 0; font-size: 13px; color: #fbbf24;'>⚠️ Please change your password after first login for security!</p></div><br>Click the button below to accept the invitation and set up your account.`,
    btn_text: 'Accept Invitation',
    btn_url: `${BASE_URL}/login`,
    from: 'hello@mytaek.com'
  },
  // Password reset
  RESET_PASSWORD: {
    subject: 'Reset your password',
    title: 'Password Reset Request',
    body: `Hi {{name}},<br><br>We received a request to reset your password. Click the button below to set a new one.<br><br>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    btn_text: 'Reset Password',
    btn_url: '{{resetUrl}}',
    from: 'noreply@mytaek.com'
  },
  // Password changed
  PASSWORD_CHANGED: {
    subject: 'Your password was changed',
    title: 'Password Changed',
    body: `Hi {{name}},<br><br>Your TaekUp password was successfully changed.<br><br>If you didn't make this change, please contact support immediately at support@mytaek.com.`,
    btn_text: 'Go to Dashboard',
    btn_url: `${BASE_URL}/login`,
    from: 'noreply@mytaek.com'
  },
  // Payment receipt
  PAYMENT_RECEIPT: {
    subject: 'Receipt for your TaekUp subscription',
    title: 'Payment Successful',
    body: `Hi {{name}},<br><br>Thanks for your payment of <strong>{{amount}}</strong>.<br><br>Your subscription is active until <strong>{{nextBillingDate}}</strong>.<br><br>Invoice #: {{invoiceNumber}}`,
    btn_text: 'View Invoice',
    btn_url: '{{invoiceUrl}}',
    from: 'billing@mytaek.com'
  },
  // Payment failed
  PAYMENT_FAILED: {
    subject: 'Action Required: Payment failed',
    title: 'Payment Failed',
    body: `Hi {{name}},<br><br>We couldn't process your payment of <strong>{{amount}}</strong> for your TaekUp subscription.<br><br>Please update your payment method to avoid service interruption.`,
    btn_text: 'Update Payment Method',
    btn_url: `${BASE_URL}/app/admin/billing`,
    from: 'billing@mytaek.com'
  },
  // Premium unlocked
  PREMIUM_UNLOCKED: {
    subject: 'Legacy Mode Unlocked for {{childName}}!',
    title: 'Welcome to Legacy Mode!',
    body: `Hi {{name}},<br><br>Congratulations! You've unlocked <strong>Legacy Mode</strong> for {{childName}}.<br><br>You now have access to:<br>• Global Shogun Rank™ worldwide leaderboards<br>• AI Coach insights with ChronosBelt™ Predictor<br>• Full Video Academy<br>• Legacy Cards™ collection<br>• Home Dojo habit tracking<br><br>Let's take {{childName}}'s training to the next level!`,
    btn_text: 'Explore Premium Features',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'hello@mytaek.com'
  },
  // Video approved
  VIDEO_APPROVED: {
    subject: 'Great job! Sensei approved your video',
    title: 'Video Approved!',
    body: `Hi {{childName}},<br><br>Your form was excellent! Sensei <strong>{{coachName}}</strong> approved your video submission.<br><br>You earned <strong>+{{xpAmount}} HonorXP™</strong>!<br><br>Keep training hard and climb the Global Shogun Rank™!`,
    btn_text: 'View My Progress',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'updates@mytaek.com'
  },
  // Video retry
  VIDEO_RETRY: {
    subject: 'Sensei left feedback on your video',
    title: 'Keep Practicing!',
    body: `Hi {{childName}},<br><br>Sensei <strong>{{coachName}}</strong> watched your video and has some advice:<br><br><em>"{{feedback}}"</em><br><br>Don't worry - every champion needs practice! Watch the tutorial again and submit a new video when you're ready.`,
    btn_text: 'Try Again',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'updates@mytaek.com'
  },
  // Video submitted
  VIDEO_SUBMITTED: {
    subject: '{{childName}} submitted a new video!',
    title: 'New Video Submission',
    body: `Hi {{coachName}},<br><br><strong>{{childName}}</strong> from <strong>{{clubName}}</strong> has submitted a new video for review.<br><br>Challenge: <strong>{{challengeName}}</strong><br><br>Please review and approve or provide feedback.`,
    btn_text: 'Review Video',
    btn_url: `${BASE_URL}/app/coach`,
    from: 'updates@mytaek.com'
  },
  // Trial ending
  TRIAL_ENDING: {
    subject: 'Your free trial ends in {{daysLeft}} days',
    title: 'Trial Ending Soon',
    body: `Hi {{name}},<br><br>We hope you're enjoying TaekUp! Your free trial ends on <strong>{{trialEndDate}}</strong>.<br><br>To keep access to all features, your subscription will automatically start. No action needed!<br><br>Current plan: <strong>{{planName}}</strong> - {{planPrice}}/month`,
    btn_text: 'Manage Subscription',
    btn_url: `${BASE_URL}/app/admin/billing`,
    from: 'billing@mytaek.com'
  },
  // Trial expired
  TRIAL_EXPIRED: {
    subject: 'Your Trial Has Ended - Upgrade to Keep Access',
    title: 'Trial Expired',
    body: `Hi {{name}},<br><br>Your 14-day free trial for <strong>{{clubName}}</strong> has ended.<br><br>To continue using TaekUp and keep all your data, please upgrade to a paid plan.<br><br>All your students, classes, and progress are saved and waiting for you!`,
    btn_text: 'Upgrade Now',
    btn_url: `${BASE_URL}/pricing`,
    from: 'billing@mytaek.com'
  },
  // Day 3 check-in
  DAY_3_CHECKIN: {
    subject: 'How\'s it going? Upload your student list yet?',
    title: 'Quick Check-in',
    body: `Hi {{name}},<br><br>You've been using TaekUp for 3 days now. How's it going?<br><br>If you haven't already, try uploading your student roster - it only takes a few minutes and unlocks all the powerful features!<br><br>Need help? Reply to this email or check our help center.`,
    btn_text: 'Add Students Now',
    btn_url: `${BASE_URL}/app/admin?tab=students`,
    from: 'hello@mytaek.com'
  },
  // Day 7 mid-trial
  DAY_7_MID_TRIAL: {
    subject: '7 Days Left - Have You Tried AI Feedback?',
    title: 'Halfway Through Your Trial!',
    body: `Hi {{name}},<br><br>You're halfway through your free trial! Have you explored all TaekUp has to offer?<br><br>Try these powerful features:<br>• AI-powered class feedback for parents<br>• ChronosBelt™ Predictor for belt promotion timelines<br>• Video challenges in the Battle Arena<br><br>Make the most of your remaining trial days!`,
    btn_text: 'Try AI Feedback',
    btn_url: `${BASE_URL}/app/admin`,
    from: 'hello@mytaek.com'
  },
  // Belt promotion
  BELT_PROMOTION: {
    subject: 'Congratulations! {{childName}} just Leveled Up!',
    title: 'Belt Promotion!',
    body: `Amazing news!<br><br><strong>{{childName}}</strong> has been promoted to <strong>{{newBelt}}</strong>!<br><br>Hard work pays off. This achievement has been recorded in their Legacy Cards™ collection.<br><br>Keep up the great work, champion!`,
    btn_text: 'View Achievement',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'updates@mytaek.com'
  },
  // Weekly progress
  WEEKLY_PROGRESS: {
    subject: 'Weekly Progress Report for {{childName}}',
    title: 'This Week\'s Highlights',
    body: `Hi {{parentName}},<br><br>Here's {{childName}}'s progress this week:<br><br>• Classes Attended: <strong>{{classesAttended}}</strong><br>• HonorXP™ Earned: <strong>+{{xpEarned}}</strong><br>• Videos Submitted: <strong>{{videosSubmitted}}</strong><br>• Global Shogun Rank™: <strong>#{{globalRank}}</strong><br><br>Keep up the amazing work!`,
    btn_text: 'View Full Report',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'updates@mytaek.com'
  },
  // New student added
  NEW_STUDENT_ADDED: {
    subject: 'New Student Added: {{studentName}}',
    title: 'New Student Registered!',
    body: `Hi {{name}},<br><br>A new student has been added to <strong>{{clubName}}</strong>:<br><br>• Name: <strong>{{studentName}}</strong><br>• Age: {{studentAge}}<br>• Belt: {{beltLevel}}<br>• Parent: {{parentName}}<br><br>Welcome them to the Dojo!`,
    btn_text: 'View Student',
    btn_url: `${BASE_URL}/app/admin?tab=students`,
    from: 'updates@mytaek.com'
  },
  // Monthly revenue report
  MONTHLY_REVENUE_REPORT: {
    subject: 'Your Monthly Revenue Report - {{month}}',
    title: 'Monthly Revenue Report',
    body: `Hi {{name}},<br><br>Here's your revenue summary for <strong>{{month}}</strong>:<br><br>• Parent Premium Revenue: <strong>{{premiumRevenue}}</strong><br>• Your Share (70%): <strong>{{yourShare}}</strong><br>• Active Premium Students: <strong>{{premiumStudents}}</strong><br><br>Keep growing your Dojo!`,
    btn_text: 'View Full Report',
    btn_url: `${BASE_URL}/app/admin?tab=billing`,
    from: 'billing@mytaek.com'
  },
  // Class feedback
  CLASS_FEEDBACK: {
    subject: 'Class Feedback for {{childName}}',
    title: 'Today\'s Class Update',
    body: `Hi {{parentName}},<br><br>Here's feedback from {{childName}}'s class today:<br><br><em>"{{feedback}}"</em><br><br>Coach: <strong>{{coachName}}</strong><br>Class: {{className}}<br><br>Keep up the great training!`,
    btn_text: 'View Details',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'support@mytaek.com'
  },
  // Attendance alert
  ATTENDANCE_ALERT: {
    subject: 'We miss {{childName}} at class!',
    title: 'Attendance Alert',
    body: `Hi {{parentName}},<br><br>We noticed {{childName}} has missed <strong>{{missedClasses}}</strong> classes recently.<br><br>Regular training is key to progress! Is everything okay?<br><br>If you need to adjust the schedule or have any concerns, please let us know.`,
    btn_text: 'View Schedule',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'support@mytaek.com'
  },
  // Birthday wish
  BIRTHDAY_WISH: {
    subject: 'Happy Birthday, {{childName}}!',
    title: 'Happy Birthday, Champion!',
    body: `Happy Birthday <strong>{{childName}}</strong>!<br><br>Everyone at <strong>{{clubName}}</strong> wishes you an amazing birthday!<br><br>Here's to another year of growth, achievements, and martial arts excellence!<br><br>Keep training and reaching for the stars!`,
    btn_text: 'Celebrate with Us',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'hello@mytaek.com'
  },
  // Payout notification
  PAYOUT_NOTIFICATION: {
    subject: 'Cha-ching! A payout is on its way',
    title: 'Payout Sent!',
    body: `Hi {{name}},<br><br>Great news! A payout of <strong>{{amount}}</strong> has been sent to your bank account.<br><br>This is your share from Parent Premium subscriptions via DojoMint™ Protocol.<br><br>Funds typically arrive within 2-3 business days.`,
    btn_text: 'View Earnings',
    btn_url: `${BASE_URL}/app/admin/billing`,
    from: 'billing@mytaek.com'
  },
  // Subscription cancelled
  SUBSCRIPTION_CANCELLED: {
    subject: 'Legacy Mode paused for {{childName}}',
    title: 'Subscription Cancelled',
    body: `Hi {{name}},<br><br>We're sorry to see you go. Your Premium subscription for {{childName}} has been cancelled.<br><br>Their Global Shogun Rank™ has been frozen and premium features are now locked.<br><br>You can reactivate anytime to continue the journey!`,
    btn_text: 'Reactivate Premium',
    btn_url: `${BASE_URL}/app/parent`,
    from: 'billing@mytaek.com'
  },
  // Win back
  WIN_BACK: {
    subject: 'We miss you at the Dojo!',
    title: 'Come Back to Training!',
    body: `Hi {{name}},<br><br>It's been a while since we've seen you at <strong>{{clubName}}</strong>. We miss having you as part of our community!<br><br>Your journey doesn't have to end. Come back and pick up where you left off!<br><br>All your progress and achievements are still saved.`,
    btn_text: 'Return to Dojo',
    btn_url: `${BASE_URL}/login`,
    from: 'hello@mytaek.com'
  },
  // Churn risk
  CHURN_RISK: {
    subject: 'Is everything okay at the Dojo?',
    title: 'We\'re Here to Help',
    body: `Hi {{name}},<br><br>We noticed you haven't been as active lately on TaekUp. Is there anything we can help with?<br><br>Whether it's a technical issue, pricing concerns, or just feedback - we'd love to hear from you.<br><br>Your success is our priority!`,
    btn_text: 'Contact Support',
    btn_url: `${BASE_URL}/support`,
    from: 'support@mytaek.com'
  }
};

const LOGO_URL = 'https://www.mytaek.com/mytaek-logo.png';

function replacePlaceholders(text: string, data: Record<string, any>): string {
  let result = text;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
  });
  return result;
}

async function sendTemplateEmail(to: string, emailType: keyof typeof EMAIL_CONTENT, dynamicData: Record<string, any>): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[SendGrid] No API key configured, skipping email');
    return false;
  }
  
  const content = EMAIL_CONTENT[emailType];
  if (!content) {
    console.error(`[SendGrid] Unknown email type: ${emailType}`);
    return false;
  }
  
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Replace placeholders in all fields
    const subject = replacePlaceholders(content.subject, dynamicData);
    const title = replacePlaceholders(content.title, dynamicData);
    const body = replacePlaceholders(content.body, dynamicData);
    const btnUrl = replacePlaceholders(content.btn_url || '', dynamicData);
    
    await sgMail.send({
      to,
      from: { email: content.from, name: 'MyTaek' },
      subject,
      templateId: MASTER_TEMPLATE_ID,
      dynamicTemplateData: {
        subject,
        title,
        body_content: body,
        btn_text: content.btn_text,
        btn_url: btnUrl || content.btn_url,
        is_rtl: dynamicData.is_rtl || false,
        image_url: LOGO_URL,
      },
    });
    console.log(`[SendGrid] Email sent to ${to} with master template (${emailType})`);
    return true;
  } catch (error: any) {
    console.error('[SendGrid] Failed to send email:', error?.response?.body?.errors || error.message);
    return false;
  }
}

async function logAutomatedEmail(client: any, triggerType: string, recipient: string, templateId: string, status: string, clubId?: string) {
  try {
    await client.query(
      `INSERT INTO automated_email_logs (trigger_type, recipient, template_id, status, club_id)
       VALUES ($1, $2, $3, $4::email_status, $5::uuid)`,
      [triggerType, recipient, templateId, status, clubId]
    );
  } catch (err) {
    console.error('[EmailLog] Failed to log:', err);
  }
}

function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY || process.env.SANDBOX_STRIPE_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI | null {
  if (!geminiClient && process.env.GOOGLE_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Super Admin token verification
async function verifySuperAdminToken(req: VercelRequest): Promise<{ valid: boolean; email?: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }
  
  const token = authHeader.substring(7);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT email, expires_at FROM super_admin_sessions 
       WHERE token = $1 AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return { valid: false };
    }
    
    return { valid: true, email: result.rows[0].email };
  } catch (err) {
    console.error('[SuperAdmin] Token verify error:', err);
    return { valid: false };
  } finally {
    client.release();
  }
}

function parseBody(req: VercelRequest) {
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
}

// UNIFIED XP HELPER - Single source of truth for all XP changes
async function applyXpDelta(client: any, studentId: string, amount: number, reason: string): Promise<number> {
  if (amount === 0) return 0;
  
  // Update students.total_xp (THE SINGLE SOURCE OF TRUTH)
  const result = await client.query(
    `UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1, updated_at = NOW() 
     WHERE id = $2::uuid RETURNING total_xp`,
    [amount, studentId]
  );
  
  // Log to xp_transactions for audit trail (optional - don't fail if table missing)
  try {
    await client.query(
      `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())`,
      [studentId, Math.abs(amount), amount > 0 ? 'EARN' : 'SPEND', reason]
    );
  } catch (e) {
    console.warn('[XP] xp_transactions insert failed (table may not exist):', (e as any).message);
  }
  
  const newTotal = result.rows[0]?.total_xp || 0;
  console.log(`[XP] ${amount > 0 ? '+' : ''}${amount} XP to ${studentId} (${reason}) → Total: ${newTotal}`);
  return newTotal;
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { email, password } = parseBody(req);
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const client = await pool.connect();
  try {
    const userResult = await client.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.name, u.club_id, u.is_active,
              c.name as club_name, c.status as club_status, c.trial_status, c.trial_end, c.wizard_data
       FROM users u LEFT JOIN clubs c ON u.club_id = c.id
       WHERE LOWER(u.email) = $1 AND u.is_active = true LIMIT 1`,
      [email.toLowerCase().trim()]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.password_hash) return res.status(401).json({ error: 'Please set up your password first.' });
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    // Check if wizard is completed (wizard_data exists in clubs table or onboarding_progress)
    let wizardCompleted = false;
    if (user.wizard_data && Object.keys(user.wizard_data).length > 0) {
      wizardCompleted = true;
    } else {
      // Fallback: check onboarding_progress table
      const onboardingResult = await client.query(
        `SELECT wizard_completed FROM onboarding_progress WHERE club_id = $1::uuid LIMIT 1`,
        [user.club_id]
      );
      if (onboardingResult.rows.length > 0 && onboardingResult.rows[0].wizard_completed) {
        wizardCompleted = true;
      }
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('user_login', 'User Login', $1, $2, $3, NOW())`,
      ['User logged in: ' + user.email, user.club_id, JSON.stringify({ email: user.email, role: user.role })]
    );

    // CRITICAL: For parent users, look up their student by parent_email
    let studentId = null;
    if (user.role === 'parent') {
      // Try exact email match first
      let studentResult = await client.query(
        `SELECT id FROM students WHERE LOWER(parent_email) = $1 AND club_id = $2::uuid LIMIT 1`,
        [user.email.toLowerCase().trim(), user.club_id]
      );
      if (studentResult.rows.length > 0) {
        studentId = studentResult.rows[0].id;
        console.log('[Login] Found student for parent:', user.email, '-> studentId:', studentId);
      } else {
        // Fallback: Get any student from this club (for legacy parents without linked students)
        studentResult = await client.query(
          `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
          [user.club_id]
        );
        if (studentResult.rows.length > 0) {
          studentId = studentResult.rows[0].id;
          console.log('[Login] Fallback: Using first club student for parent:', user.email, '-> studentId:', studentId);
        } else {
          console.log('[Login] No student found for parent email:', user.email);
        }
      }
      
      // Read current total_xp (single source of truth - do NOT recalculate)
      if (studentId) {
        const xpResult = await client.query(
          `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
          [studentId]
        );
        console.log('[Login] Student XP:', studentId, '-> total_xp:', xpResult.rows[0]?.total_xp || 0);
      }
    }

    return res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name || user.club_name, role: user.role,
              clubId: user.club_id, clubName: user.club_name, clubStatus: user.club_status,
              trialStatus: user.trial_status, trialEnd: user.trial_end, wizardCompleted,
              studentId: studentId },
      wizardData: user.wizard_data || null
    });
  } finally { client.release(); }
}

// Simple name-based login - finds existing student or creates new one
async function handleLoginByName(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { name } = parseBody(req);
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const studentName = name.trim();
  const client = await pool.connect();
  
  try {
    // Step A: Look up existing student by name
    const existingResult = await client.query(
      `SELECT id, name, total_xp, club_id FROM students WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [studentName]
    );
    
    if (existingResult.rows.length > 0) {
      // Step B: Found existing student - return their current XP (single source of truth)
      const student = existingResult.rows[0];
      const currentXp = parseInt(student.total_xp || '0', 10);
      console.log(`[LoginByName] Found existing student: ${student.name} (${student.id}), XP: ${currentXp}`);
      
      return res.json({
        success: true,
        isNew: false,
        student: {
          id: student.id,
          name: student.name,
          totalXp: currentXp,
          clubId: student.club_id
        }
      });
    }
    
    // Step C: No existing student - create new one
    // Use the first available club (or create a demo club if needed)
    let clubId: string;
    const clubResult = await client.query(`SELECT id FROM clubs LIMIT 1`);
    if (clubResult.rows.length > 0) {
      clubId = clubResult.rows[0].id;
    } else {
      // Create a demo club if none exists
      const newClubResult = await client.query(
        `INSERT INTO clubs (name, owner_email, status, trial_status, created_at) 
         VALUES ('Demo Dojo', 'demo@taekup.com', 'active', 'active', NOW()) RETURNING id`
      );
      clubId = newClubResult.rows[0].id;
    }
    
    const insertResult = await client.query(
      `INSERT INTO students (club_id, name, belt, total_xp, created_at)
       VALUES ($1::uuid, $2, 'White', 0, NOW()) RETURNING id, name, total_xp, club_id`,
      [clubId, studentName]
    );
    const newStudent = insertResult.rows[0];
    console.log(`[LoginByName] Created new student: ${newStudent.name} (${newStudent.id})`);
    
    return res.json({
      success: true,
      isNew: true,
      student: {
        id: newStudent.id,
        name: newStudent.name,
        totalXp: 0,
        clubId: newStudent.club_id
      }
    });
  } catch (error: any) {
    console.error('[LoginByName] Error:', error.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  } finally {
    client.release();
  }
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubName, email, password, country } = parseBody(req);
  if (!clubName || !email || !password) return res.status(400).json({ error: 'Club name, email, and password are required' });

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM clubs WHERE owner_email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 14);

    const clubResult = await client.query(
      `INSERT INTO clubs (name, owner_email, country, trial_start, trial_end, trial_status, status, created_at)
       VALUES ($1, $2, $3, NOW(), $4, 'active', 'active', NOW()) RETURNING id, name, owner_email, trial_start, trial_end`,
      [clubName, email, country || 'United States', trialEnd]
    );
    const club = clubResult.rows[0];

    await client.query(
      `INSERT INTO users (email, password_hash, role, club_id, is_active, created_at)
       VALUES ($1, $2, 'owner', $3, true, NOW()) ON CONFLICT (email) DO UPDATE SET password_hash = $2, club_id = $3`,
      [email, passwordHash, club.id]
    );

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, metadata, created_at)
       VALUES ('club_signup', 'New Club Signup', $1, $2, NOW())`,
      ['New club signup: ' + clubName, JSON.stringify({ clubId: club.id, email, country })]
    );

    const emailSent = await sendTemplateEmail(email, 'WELCOME', {
      ownerName: clubName,
      clubName: clubName,
    });
    await logAutomatedEmail(client, 'welcome', email, 'WELCOME', emailSent ? 'sent' : 'failed', club.id);

    return res.status(201).json({ success: true, club: { id: club.id, name: club.name, email: club.owner_email, trialStart: club.trial_start, trialEnd: club.trial_end } });
  } finally { client.release(); }
}

async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email } = parseBody(req);
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const client = await pool.connect();
  try {
    const userResult = await client.query('SELECT id, email, name FROM users WHERE email = $1 AND is_active = true LIMIT 1', [email]);
    if (userResult.rows.length === 0) return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    
    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await client.query('UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3', [resetToken, expiresAt, user.id]);

    await sendTemplateEmail(user.email, 'RESET_PASSWORD', {
      name: user.name || 'User',
      resetToken: resetToken,
      resetUrl: `https://www.mytaek.com/reset-password?token=${resetToken}`,
    });

    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } finally { client.release(); }
}

async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { token, newPassword } = parseBody(req);
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await client.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW()
       WHERE reset_token = $2 AND reset_token_expires_at > NOW() AND is_active = true RETURNING id, email`,
      [passwordHash, token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset token' });
    return res.json({ success: true, message: 'Password has been reset successfully' });
  } finally { client.release(); }
}

async function handleVerifyPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return res.json({ valid: true });
  const { password } = parseBody(req);
  if (password === sitePassword) return res.json({ valid: true });
  return res.status(401).json({ valid: false, error: 'Incorrect password' });
}

async function handleChangePassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, currentPassword, newPassword } = parseBody(req);
  
  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'User ID, current password, and new password are required' });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      'SELECT id, password_hash FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid',
      [newPasswordHash, userId]
    );
    
    console.log('[ChangePassword] Password changed for user:', userId);
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('[ChangePassword] Error:', error.message);
    return res.status(500).json({ error: 'Failed to change password' });
  } finally {
    client.release();
  }
}

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { priceId, clubId, email } = parseBody(req);
  if (!priceId) return res.status(400).json({ error: 'priceId is required' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const host = req.headers.host || 'mytaek.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  // Check if user already has a trial status - skip Stripe trial if so
  let shouldSkipTrial = false;
  if (clubId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT trial_status FROM clubs WHERE id = $1::uuid`,
        [clubId]
      );
      if (result.rows.length > 0 && result.rows[0].trial_status) {
        shouldSkipTrial = true;
        console.log('[Checkout] Skipping Stripe trial for club', clubId, '- already has trial_status:', result.rows[0].trial_status);
      }
    } catch (e) {
      console.error('[Checkout] Error checking trial status:', e);
    } finally {
      client.release();
    }
  }

  const subscriptionData: any = { metadata: { clubId: clubId || '', email: email || '' } };
  if (!shouldSkipTrial) {
    subscriptionData.trial_period_days = 14;
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${baseUrl}/app/admin?subscription=success`,
    cancel_url: `${baseUrl}/app/pricing?subscription=cancelled`,
    metadata: { clubId: clubId || '', email: email || '' },
    subscription_data: subscriptionData,
  });
  return res.json({ url: session.url });
}

async function handleParentPremiumCheckout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { studentId, parentEmail, clubId } = parseBody(req);
  if (!studentId || !parentEmail) return res.status(400).json({ error: 'studentId and parentEmail are required' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const PARENT_PREMIUM_PRICE_ID = 'price_1Sp5BPRhYhunDn2j6Yz8dSxD';
  
  const host = req.headers.host || 'mytaek.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  // Find or create customer
  const emailLower = parentEmail.toLowerCase().trim();
  let customerId: string | undefined;
  const existingCustomers = await stripe.customers.list({ email: emailLower, limit: 1 });
  if (existingCustomers.data.length > 0) {
    customerId = existingCustomers.data[0].id;
  } else {
    const newCustomer = await stripe.customers.create({
      email: emailLower,
      metadata: { studentId, clubId: clubId || '', type: 'parent_premium' }
    });
    customerId = newCustomer.id;
  }

  // Revenue Split: 70% of NET to Club, 30% + fees to Platform
  // Gross: $4.99 (499 cents), Est. Fee: $0.30 (30 cents), Net: 469 cents
  // Club share: 469 * 0.70 = 328 cents ($3.28)
  let stripeConnectAccountId: string | null = null;
  if (clubId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT stripe_connect_account_id FROM clubs WHERE id = $1::uuid`,
        [clubId]
      );
      if (result.rows.length > 0 && result.rows[0].stripe_connect_account_id) {
        stripeConnectAccountId = result.rows[0].stripe_connect_account_id;
      }
    } finally {
      client.release();
    }
  }

  const sessionConfig: any = {
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: PARENT_PREMIUM_PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    success_url: `${baseUrl}/app/parent?premium=success&student_id=${studentId}`,
    cancel_url: `${baseUrl}/app/parent?premium=cancelled`,
    metadata: { studentId, clubId: clubId || '', type: 'parent_premium' },
    subscription_data: {
      metadata: { studentId, clubId: clubId || '', type: 'parent_premium' },
      // Add transfer on each subscription payment
      // Fixed amount = 70% of NET ($4.99 - $0.30 fee = $4.69 * 0.70 = $3.28)
      ...(stripeConnectAccountId && {
        transfer_data: {
          destination: stripeConnectAccountId,
          amount: 328, // Fixed $3.28 (70% of net after fees)
        }
      })
    }
  };

  const session = await stripe.checkout.sessions.create(sessionConfig);

  console.log(`[Parent Premium] Created checkout for student ${studentId}, session: ${session.id}, club transfer: ${stripeConnectAccountId ? 'yes (70%)' : 'no connected account'}`);
  return res.json({ url: session.url });
}

async function handleCustomerPortal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { customerId } = parseBody(req);
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const host = req.headers.host || 'mytaek.com';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${protocol}://${host}`;

  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${baseUrl}/app/admin` });
  return res.json({ url: session.url });
}

async function handleProductsWithPrices(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const products = await stripe.products.list({ active: true, limit: 20 });
  const prices = await stripe.prices.list({ active: true, limit: 100 });

  const pricesByProduct = new Map<string, any[]>();
  for (const price of prices.data) {
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    if (!pricesByProduct.has(productId)) pricesByProduct.set(productId, []);
    pricesByProduct.get(productId)!.push({
      id: price.id, unit_amount: price.unit_amount, currency: price.currency,
      recurring: price.recurring, active: price.active, metadata: price.metadata,
    });
  }

  const result = products.data.map(p => ({
    id: p.id, name: p.name, description: p.description, active: p.active,
    metadata: p.metadata, prices: pricesByProduct.get(p.id) || [],
  }));
  return res.json({ data: result });
}

async function handleStripePublishableKey(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || process.env.SANDBOX_STRIPE_PUBLISHABLE_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe publishable key not configured' });
  return res.json({ publishableKey: key });
}

async function handleVerifySubscription(req: VercelRequest, res: VercelResponse, clubId: string) {
  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      `SELECT id, owner_email, trial_status FROM clubs WHERE id = $1::uuid`,
      [clubId]
    );
    const club = clubResult.rows[0];
    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Search with lowercase email to handle case-insensitivity
    const emailToSearch = club.owner_email.toLowerCase().trim();
    console.log(`[VerifySubscription] Searching for customer with email: ${emailToSearch}`);
    
    const customers = await stripe.customers.list({ email: emailToSearch, limit: 5 });
    console.log(`[VerifySubscription] Found ${customers.data.length} customers`);
    
    if (customers.data.length === 0) {
      console.log(`[VerifySubscription] No customer found for email: ${emailToSearch}`);
      return res.json({ 
        success: true, 
        hasActiveSubscription: false, 
        trialStatus: club.trial_status, 
        searchedEmail: emailToSearch,
        debug: { customerCount: 0, reason: 'no_customer_found' }
      });
    }

    // Check ALL customers for subscriptions (not just the first one)
    let hasActiveSubscription = false;
    let foundCustomerId = null;
    let subscriptionStatuses: string[] = [];
    let planId: string | null = null;
    
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 10
      });
      
      console.log(`[VerifySubscription] Customer ${customer.id} (${customer.email}) has ${subscriptions.data.length} subscriptions`);
      
      for (const sub of subscriptions.data) {
        subscriptionStatuses.push(`${sub.id}:${sub.status}`);
        if (sub.status === 'active' || sub.status === 'trialing') {
          const item = sub.items.data[0];
          if (!item) continue;
          
          // Fetch the price with product expanded (only 1 level deep - avoids Stripe expand limit)
          const priceId = item.price.id;
          const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
          const product = typeof price.product === 'object' ? price.product as any : null;
          const productName = product?.name || '';
          
          // Skip Universal Access subscriptions when determining plan
          const isUA = productName.toLowerCase().includes('universal access') || 
                       price.metadata?.type === 'universal_access';
          
          if (!isUA) {
            hasActiveSubscription = true;
            foundCustomerId = customer.id;
            // Extract plan from metadata or product name
            planId = price.metadata?.planId || price.metadata?.tier || null;
            if (!planId && productName) {
              const pName = productName.toLowerCase();
              if (pName.includes('starter')) planId = 'starter';
              else if (pName.includes('pro')) planId = 'pro';
              else if (pName.includes('standard')) planId = 'standard';
              else if (pName.includes('growth')) planId = 'growth';
              else if (pName.includes('empire')) planId = 'empire';
              else planId = pName;
            }
            break; // Found base plan, stop looking
          }
        }
      }
      if (hasActiveSubscription) break; // Found subscription, stop checking other customers
    }
    
    console.log(`[VerifySubscription] Result: hasActiveSubscription=${hasActiveSubscription}, planId=${planId}, statuses=${subscriptionStatuses.join(', ')}`);
    
    if (hasActiveSubscription && club.trial_status !== 'converted') {
      await client.query(
        `UPDATE clubs SET trial_status = 'converted' WHERE id = $1::uuid`,
        [clubId]
      );
    }

    return res.json({
      success: true,
      hasActiveSubscription,
      trialStatus: hasActiveSubscription ? 'converted' : club.trial_status,
      planId: planId,
      customerId: foundCustomerId || customers.data[0].id,
      searchedEmail: emailToSearch,
      debug: { 
        customerCount: customers.data.length, 
        subscriptionStatuses,
        customerEmails: customers.data.map(c => c.email)
      }
    });
  } catch (error: any) {
    console.error('[VerifySubscription] Error:', error.message);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  } finally {
    client.release();
  }
}

// DojoMint Universal Access - per-student billing ($1.99/student/month)
// HYBRID BILLING: Creates a SEPARATE monthly subscription for UA, works with yearly base plans
const UNIVERSAL_ACCESS_PRICE_ID = process.env.UNIVERSAL_ACCESS_PRICE_ID || '';

async function handleUniversalAccessToggle(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { enabled, studentCount } = parseBody(req);
  
  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  
  const client = await pool.connect();
  try {
    // Get club and find Stripe customer
    const clubResult = await client.query(
      `SELECT owner_email FROM clubs WHERE id = $1::uuid`,
      [clubId]
    );
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });
    
    const customers = await stripe.customers.list({ email: club.owner_email.toLowerCase().trim(), limit: 1 });
    if (customers.data.length === 0) {
      return res.status(400).json({ error: 'No Stripe customer found. Please subscribe first.' });
    }
    const customerId = customers.data[0].id;
    
    // Find Universal Access price - must be pre-configured in Stripe
    let universalAccessPriceId = UNIVERSAL_ACCESS_PRICE_ID;
    
    // If no price ID configured, try to find it by metadata, nickname, or product name
    if (!universalAccessPriceId) {
      const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] });
      const uaPrice = prices.data.find(p => {
        if (p.unit_amount !== 199 || p.recurring?.interval !== 'month') return false;
        // Match by price metadata
        if (p.metadata?.type === 'universal_access') return true;
        // Match by price nickname
        if (p.nickname === 'Universal Access') return true;
        // Match by product name
        const productName = typeof p.product === 'object' ? (p.product as any).name : '';
        if (productName.toLowerCase().includes('universal access')) return true;
        return false;
      });
      if (uaPrice) {
        universalAccessPriceId = uaPrice.id;
        console.log('[UniversalAccess] Found existing price by metadata/product:', universalAccessPriceId);
      }
    }
    
    if (!universalAccessPriceId) {
      console.error('[UniversalAccess] UNIVERSAL_ACCESS_PRICE_ID not configured');
      return res.status(500).json({ 
        error: 'Universal Access price not configured',
        instructions: 'Create a $1.99/month price in Stripe Dashboard with metadata.type=universal_access'
      });
    }
    
    // Find existing UA subscription (separate from base plan) - only active ones
    const allSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
    let uaSubscription = allSubs.data.find(sub => 
      sub.status !== 'canceled' &&
      sub.items.data.some(item => {
        const price = typeof item.price === 'object' ? item.price : null;
        return price && price.id === universalAccessPriceId;
      })
    );
    
    if (enabled) {
      const quantity = Math.max(1, studentCount || 1);
      
      if (uaSubscription) {
        // Update existing UA subscription quantity
        const uaItem = uaSubscription.items.data.find(item => {
          const price = typeof item.price === 'object' ? item.price : null;
          return price && price.id === universalAccessPriceId;
        });
        if (uaItem) {
          await stripe.subscriptionItems.update(uaItem.id, { quantity });
          console.log(`[UniversalAccess] Updated quantity to ${quantity} for club ${clubId}`);
        }
      } else {
        // Create new monthly subscription for Universal Access
        uaSubscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: universalAccessPriceId, quantity }],
          metadata: { type: 'universal_access', clubId }
        });
        console.log(`[UniversalAccess] Created separate UA subscription with quantity ${quantity} for club ${clubId}`);
      }
      
      return res.json({ success: true, enabled: true, quantity, subscriptionId: uaSubscription.id, message: 'Universal Access enabled' });
    } else {
      // Disable - cancel UA subscription
      if (uaSubscription) {
        await stripe.subscriptions.cancel(uaSubscription.id, { prorate: true });
        console.log(`[UniversalAccess] Cancelled UA subscription for club ${clubId}`);
      }
      
      return res.json({ success: true, enabled: false, message: 'Universal Access disabled' });
    }
  } catch (error: any) {
    console.error('[UniversalAccess] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to update Universal Access' });
  } finally {
    client.release();
  }
}

async function handleUniversalAccessSync(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentCount } = parseBody(req);
  
  const stripe = getStripeClient();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  
  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      `SELECT owner_email FROM clubs WHERE id = $1::uuid`,
      [clubId]
    );
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });
    
    const customers = await stripe.customers.list({ email: club.owner_email.toLowerCase().trim(), limit: 1 });
    if (customers.data.length === 0) {
      return res.json({ success: false, message: 'No Stripe customer' });
    }
    
    // Find UA subscription (separate from base plan) by looking for $1.99/month price - only active subs
    const allSubs = await stripe.subscriptions.list({ customer: customers.data[0].id, limit: 10 });
    let uaItem = null;
    
    for (const sub of allSubs.data) {
      if (sub.status === 'canceled') continue;
      for (const item of sub.items.data) {
        const price = typeof item.price === 'object' ? item.price : null;
        if (price && price.unit_amount === 199 && price.recurring?.interval === 'month') {
          uaItem = item;
          break;
        }
      }
      if (uaItem) break;
    }
    
    if (!uaItem) {
      return res.json({ success: false, message: 'Universal Access not enabled' });
    }
    
    const quantity = Math.max(1, studentCount || 1);
    if (uaItem.quantity !== quantity) {
      await stripe.subscriptionItems.update(uaItem.id, { quantity });
      console.log(`[UniversalAccess] Synced quantity to ${quantity} for club ${clubId}`);
    }
    
    return res.json({ success: true, quantity, message: 'Quantity synced' });
  } catch (error: any) {
    console.error('[UniversalAccessSync] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleGetClubData(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  if (!clubId) {
    return res.status(400).json({ error: 'Club ID is required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      `SELECT id, name, owner_email, owner_name, country, city, art_type, 
              wizard_data, trial_start, trial_end, trial_status, status,
              world_rankings_enabled
       FROM clubs WHERE id = $1::uuid`,
      [clubId]
    );
    const club = clubResult.rows[0];

    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const studentsResult = await client.query(
      `SELECT id, name, parent_email, parent_name, parent_phone, belt, birthdate,
              total_points, total_xp, stripes, location, assigned_class, join_date, created_at
       FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const coachesResult = await client.query(
      `SELECT id, name, email, location, assigned_classes
       FROM coaches WHERE club_id = $1::uuid AND is_active = true`,
      [clubId]
    );

    const savedWizardData = club.wizard_data || {};
    const savedBelts = savedWizardData.belts || [];
    
    const getBeltIdFromName = (beltName: string): string => {
      if (!beltName) return savedBelts[0]?.id || 'white';
      const matchedBelt = savedBelts.find((b: any) => 
        b.name?.toLowerCase() === beltName.toLowerCase() ||
        b.id?.toLowerCase() === beltName.toLowerCase()
      );
      return matchedBelt?.id || savedBelts[0]?.id || 'white';
    };
    
    const students = studentsResult.rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      parentEmail: s.parent_email,
      parentName: s.parent_name,
      parentPhone: s.parent_phone,
      beltId: getBeltIdFromName(s.belt),
      birthday: s.birthdate,
      joinDate: s.join_date || s.created_at || new Date().toISOString(),
      totalXP: s.total_xp || 0,
      totalPoints: s.total_points || 0,
      currentStreak: 0,
      stripeCount: s.stripes || 0,
      location: s.location || '',
      assignedClass: s.assigned_class || '',
      performanceHistory: [],
      homeDojo: { character: [], chores: [], school: [], health: [] }
    }));

    const coaches = coachesResult.rows.map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      location: c.location || '',
      assignedClasses: c.assigned_classes || []
    }));

    const wizardData = {
      ...savedWizardData,
      students,
      coaches,
      clubName: savedWizardData.clubName || club.name,
      ownerName: savedWizardData.ownerName || club.owner_name || '',
      country: savedWizardData.country || club.country || 'US',
    };

    // Check if demo data exists (students with demo names or wizard_data with demo flag)
    const hasDemoData = students.length > 0 && students.some((s: any) => 
      ['Daniel LaRusso', 'Johnny Lawrence', 'Miguel Diaz', 'Robby Keene', 'Sam LaRusso', 'Hawk Moskowitz'].includes(s.name)
    );

    return res.json({
      success: true,
      club: {
        id: club.id,
        name: club.name,
        ownerEmail: club.owner_email,
        ownerName: club.owner_name,
        trialStart: club.trial_start,
        trialEnd: club.trial_end,
        trialStatus: club.trial_status,
        status: club.status,
        worldRankingsEnabled: club.world_rankings_enabled || false,
        hasDemoData: hasDemoData
      },
      wizardData
    });
  } catch (error: any) {
    console.error('[Club Data] Fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch club data' });
  } finally {
    client.release();
  }
}

async function handleSaveWizardData(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubId, wizardData } = parseBody(req);

  if (!clubId || !wizardData) {
    return res.status(400).json({ error: 'Club ID and wizard data are required' });
  }

  // Map beltSystemType to display name for art_type column
  const beltSystemToArtType: Record<string, string> = {
    'wt': 'Taekwondo',
    'itf': 'Taekwondo (ITF)',
    'karate': 'Karate',
    'bjj': 'Brazilian Jiu-Jitsu',
    'judo': 'Judo',
    'hapkido': 'Hapkido',
    'tangsoodo': 'Tang Soo Do',
    'aikido': 'Aikido',
    'kravmaga': 'Krav Maga',
    'kungfu': 'Kung Fu',
    'custom': 'Custom'
  };
  
  const artType = beltSystemToArtType[wizardData.beltSystemType] || 'Taekwondo';

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE clubs 
       SET wizard_data = $1::jsonb, art_type = $3, updated_at = NOW()
       WHERE id = $2::uuid`,
      [JSON.stringify(wizardData), clubId, artType]
    );

    // Try to update onboarding_progress (may not exist on all databases)
    try {
      await client.query(
        `INSERT INTO onboarding_progress (club_id, wizard_completed, created_at)
         VALUES ($1::uuid, true, NOW())
         ON CONFLICT (club_id) DO UPDATE SET wizard_completed = true`,
        [clubId]
      );
    } catch (onboardingErr: any) {
      console.log('[Wizard] onboarding_progress table may not exist, continuing:', onboardingErr.message);
    }

    // Create user accounts for coaches
    const coaches = wizardData.coaches || [];
    for (const coach of coaches) {
      if (coach.email) {
        try {
          const coachEmail = coach.email.toLowerCase().trim();
          const tempPassword = coach.password || '1234';
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          
          // Check if user already exists
          const existingUser = await client.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [coachEmail]
          );
          
          let userId;
          if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id;
            await client.query(
              `UPDATE users SET 
                 password_hash = $1,
                 name = $2,
                 club_id = $3::uuid,
                 role = 'coach',
                 updated_at = NOW()
               WHERE id = $4::uuid`,
              [passwordHash, coach.name, clubId, userId]
            );
          } else {
            const userResult = await client.query(
              `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
               VALUES ($1, $2, $3, 'coach', $4::uuid, true, NOW())
               RETURNING id`,
              [coachEmail, passwordHash, coach.name, clubId]
            );
            userId = userResult.rows[0]?.id;
          }
          
          // Check if coach exists, then create or update
          const existingCoach = await client.query(
            `SELECT id FROM coaches WHERE club_id = $1::uuid AND email = $2 LIMIT 1`,
            [clubId, coachEmail]
          );
          
          if (existingCoach.rows.length > 0) {
            await client.query(
              `UPDATE coaches SET user_id = $1::uuid, name = $2, location = $3, assigned_classes = $4, is_active = true, updated_at = NOW()
               WHERE id = $5::uuid`,
              [userId, coach.name, coach.location || null, coach.assignedClasses || [], existingCoach.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO coaches (club_id, user_id, name, email, location, assigned_classes, is_active, created_at)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, true, NOW())`,
              [clubId, userId, coach.name, coachEmail, coach.location || null, coach.assignedClasses || []]
            );
          }
          
          console.log('[Wizard] Created user account for coach:', coachEmail);
        } catch (coachErr: any) {
          console.error('[Wizard] Error creating coach account:', coach.email, coachErr.message);
        }
      }
    }

    // Create user accounts for parents and save students
    const students = wizardData.students || [];
    for (const student of students) {
      try {
        const parentEmail = student.parentEmail?.toLowerCase().trim() || null;
        
        // Check if student exists
        const existingStudent = await client.query(
          `SELECT id FROM students WHERE club_id = $1::uuid AND name = $2 AND (parent_email = $3 OR (parent_email IS NULL AND $3 IS NULL)) LIMIT 1`,
          [clubId, student.name, parentEmail]
        );
        
        let studentId;
        if (existingStudent.rows.length > 0) {
          studentId = existingStudent.rows[0].id;
          await client.query(
            `UPDATE students SET 
               parent_name = COALESCE($1, parent_name),
               parent_phone = COALESCE($2, parent_phone),
               belt = COALESCE($3, belt),
               birthdate = COALESCE($4::timestamptz, birthdate),
               total_points = COALESCE($5, total_points),
               location = COALESCE($6, location),
               assigned_class = COALESCE($7, assigned_class),
               updated_at = NOW()
             WHERE id = $8::uuid`,
            [
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0,
              student.location || null,
              student.assignedClass || null,
              studentId
            ]
          );
        } else {
          const joinDateValue = student.joinDate ? new Date(student.joinDate).toISOString() : new Date().toISOString();
          const insertResult = await client.query(
            `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, total_points, location, assigned_class, join_date, created_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11::timestamptz, NOW())
             RETURNING id`,
            [
              clubId, 
              student.name, 
              parentEmail,
              student.parentName || null,
              student.parentPhone || null,
              student.beltId || 'white',
              student.birthday ? student.birthday + 'T00:00:00Z' : null,
              student.totalPoints || 0,
              student.location || null,
              student.assignedClass || null,
              joinDateValue
            ]
          );
          studentId = insertResult.rows[0]?.id;
        }
        
        // Create parent user account if email and password provided
        if (parentEmail && student.parentPassword) {
          const existingParent = await client.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [parentEmail]
          );
          
          const parentPasswordHash = await bcrypt.hash(student.parentPassword, 10);
          
          if (existingParent.rows.length > 0) {
            await client.query(
              `UPDATE users SET 
                 password_hash = $1,
                 name = COALESCE($2, name),
                 club_id = $3::uuid,
                 role = 'parent',
                 updated_at = NOW()
               WHERE id = $4::uuid`,
              [parentPasswordHash, student.parentName || student.name + "'s Parent", clubId, existingParent.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
               VALUES ($1, $2, $3, 'parent', $4::uuid, true, NOW())`,
              [parentEmail, parentPasswordHash, student.parentName || student.name + "'s Parent", clubId]
            );
          }
          console.log('[Wizard] Created user account for parent:', parentEmail);
        }
      } catch (studentErr: any) {
        console.error('[Wizard] Error saving student:', student.name, studentErr.message);
      }
    }

    console.log('[Wizard] Saved wizard data for club:', clubId, `(${coaches.length} coaches, ${students.length} students)`);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Wizard] Save error:', error);
    return res.status(500).json({ error: 'Failed to save wizard data' });
  } finally {
    client.release();
  }
}

async function handleTaekBot(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { message, clubName, artType, language } = parseBody(req);
  if (!message) return res.status(400).json({ error: 'message is required' });

  const openai = getOpenAIClient();
  if (!openai) {
    return res.json({ response: `Thank you for your question! For specific inquiries about ${clubName || 'your dojo'}, please contact your instructor.` });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `You are TaekBot, an AI assistant for ${clubName || 'your dojo'}, a ${artType || 'martial arts'} academy. Be friendly and helpful. Respond in ${language || 'English'}.` },
      { role: 'user', content: message }
    ],
    max_tokens: 500, temperature: 0.7,
  });
  return res.json({ response: completion.choices[0]?.message?.content || 'Thank you for your question!' });
}

async function handleClassPlan(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { beltLevel, focusArea, classDuration, studentCount, language } = parseBody(req);

  const openai = getOpenAIClient();
  if (!openai) {
    return res.json({ plan: `## ${beltLevel || 'All Levels'} Class Plan\n\n### Warm-up (10 min)\n- Jogging and stretches\n\n### Main Training (${Math.floor((classDuration || 60) * 0.6)} min)\n- Technique drills\n\n### Cool-down (10 min)\n- Stretching` });
  }

  const prompt = `Create a martial arts class plan: Belt Level: ${beltLevel || 'All Levels'}, Focus: ${focusArea || 'General'}, Duration: ${classDuration || 60} min, Students: ${studentCount || 10}. Include warm-up, technique drills, partner work, cool-down. Respond in ${language || 'English'}.`;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: 'You are an experienced martial arts instructor.' }, { role: 'user', content: prompt }],
    max_tokens: 1000, temperature: 0.7,
  });
  return res.json({ plan: completion.choices[0]?.message?.content || 'Class plan generated.' });
}

async function handleWelcomeEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubName, studentName, parentName, artType, language } = parseBody(req);

  const gemini = getGeminiClient();
  if (!gemini) {
    return res.json({ email: `Dear ${parentName || 'Parent'},\n\nWelcome to ${clubName || 'Your Dojo'}! We're thrilled to have ${studentName || 'your child'} join us.\n\nBest regards,\nThe ${clubName || 'Your Dojo'} Team` });
  }

  const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `Write a welcome email for ${studentName || 'Student'} joining ${clubName || 'Your Dojo'}, addressed to ${parentName || 'Parent'}. Art type: ${artType || 'martial arts'}. Write in ${language || 'English'}.`;
  const result = await model.generateContent(prompt);
  return res.json({ email: result.response.text() });
}

async function handleAddStudent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubId, name, parentEmail, parentName, parentPhone, parentPassword, belt, birthdate, location, assignedClass } = parseBody(req);

  if (!clubId || !name) {
    return res.status(400).json({ error: 'Club ID and student name are required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query(
      'SELECT id, name, owner_email FROM clubs WHERE id = $1::uuid',
      [clubId]
    );
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const studentResult = await client.query(
      `INSERT INTO students (club_id, name, parent_email, parent_name, parent_phone, belt, birthdate, location, assigned_class, join_date, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, NOW(), NOW())
       RETURNING id, name, parent_email, parent_name, belt, location, assigned_class, join_date`,
      [clubId, name, parentEmail || null, parentName || null, parentPhone || null, belt || 'White', birthdate ? birthdate + 'T00:00:00Z' : null, location || null, assignedClass || null]
    );
    const student = studentResult.rows[0];

    // Create parent user account if email and password provided
    if (parentEmail && parentPassword) {
      try {
        const parentPasswordHash = await bcrypt.hash(parentPassword, 10);
        const existingParent = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [parentEmail.toLowerCase()]);
        if (existingParent.rows.length > 0) {
          await client.query(
            `UPDATE users SET password_hash = $1, name = $2, club_id = $3::uuid, role = 'parent', updated_at = NOW() WHERE id = $4::uuid`,
            [parentPasswordHash, parentName || name + "'s Parent", clubId, existingParent.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at) VALUES ($1, $2, $3, 'parent', $4::uuid, true, NOW())`,
            [parentEmail.toLowerCase(), parentPasswordHash, parentName || name + "'s Parent", clubId]
          );
        }
        console.log('[AddStudent] Created parent user account:', parentEmail);
      } catch (parentErr: any) {
        console.error('[AddStudent] Error creating parent account:', parentErr.message);
      }
    }

    const age = birthdate ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

    const notifySent = await sendTemplateEmail(club.owner_email, 'WELCOME', {
      ownerName: club.name,
      clubName: club.name,
      studentName: name,
      beltLevel: belt || 'White',
      studentAge: age ? `${age} years old` : 'Not specified',
      parentName: parentName || 'Not specified',
    });
    console.log(`[AddStudent] Owner notification email ${notifySent ? 'sent' : 'failed'} to:`, club.owner_email);

    if (parentEmail) {
      const parentSent = await sendTemplateEmail(parentEmail, 'PARENT_WELCOME', {
        parentName: parentName || 'Parent',
        parentEmail: parentEmail,
        studentName: name,
        clubName: club.name,
      });
      await logAutomatedEmail(client, 'parent_welcome', parentEmail, 'PARENT_WELCOME', parentSent ? 'sent' : 'failed', clubId);
      console.log(`[AddStudent] Parent welcome email ${parentSent ? 'sent' : 'failed'} to:`, parentEmail);
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('student_added', 'New Student Added', $1, $2::uuid, $3::jsonb, NOW())`,
      ['New student added: ' + name, clubId, JSON.stringify({ studentId: student.id, studentName: name, parentEmail })]
    );

    return res.status(201).json({
      success: true,
      student: {
        id: student.id,
        name: student.name,
        parentEmail: student.parent_email,
        parentName: student.parent_name,
        belt: student.belt
      }
    });
  } catch (error: any) {
    console.error('[AddStudent] Error:', error.message);
    return res.status(500).json({ error: 'Failed to add student' });
  } finally {
    client.release();
  }
}

async function handleStudentDelete(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const client = await pool.connect();
  try {
    // Check student exists
    const check = await client.query('SELECT id, name FROM students WHERE id = $1::uuid', [studentId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Delete related records first (in order to avoid foreign key constraints)
    await client.query('DELETE FROM habit_logs WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM challenge_submissions WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM class_feedback WHERE student_id = $1::uuid', [studentId]);
    await client.query('DELETE FROM promotions WHERE student_id = $1::uuid', [studentId]);
    try { await client.query('DELETE FROM challenge_videos WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM family_challenge_completions WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM daily_challenge_completions WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM family_logs WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM custom_habits WHERE student_id = $1::uuid', [studentId]); } catch (e) { /* may not exist */ }
    try { await client.query('DELETE FROM challenges WHERE from_student_id = $1 OR to_student_id = $1', [studentId]); } catch (e) { /* may not exist */ }
    
    // Now delete the student
    await client.query('DELETE FROM students WHERE id = $1::uuid', [studentId]);
    
    console.log(`[StudentDelete] Deleted student ${studentId}: ${check.rows[0].name}`);
    return res.status(200).json({ success: true, deleted: studentId });
  } catch (error: any) {
    console.error('[StudentDelete] Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleStudentUpdate(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { name, belt, stripes, location, assignedClass, parentName, parentEmail } = parseBody(req);
  
  const client = await pool.connect();
  try {
    // Auto-migrate: add columns if they don't exist
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_class VARCHAR(255)`);
    
    // Verify student exists
    const studentCheck = await client.query('SELECT id, club_id FROM students WHERE id = $1::uuid', [studentId]);
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (belt !== undefined) {
      updates.push(`belt = $${paramIndex++}`);
      values.push(belt);
    }
    if (stripes !== undefined) {
      updates.push(`stripes = $${paramIndex++}`);
      values.push(stripes);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    if (assignedClass !== undefined) {
      updates.push(`assigned_class = $${paramIndex++}`);
      values.push(assignedClass);
    }
    if (parentName !== undefined) {
      updates.push(`parent_name = $${paramIndex++}`);
      values.push(parentName);
    }
    if (parentEmail !== undefined) {
      updates.push(`parent_email = $${paramIndex++}`);
      values.push(parentEmail);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(studentId);
    
    const result = await client.query(
      `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramIndex}::uuid 
       RETURNING id, name, belt, stripes, location, assigned_class, parent_name, parent_email`,
      values
    );
    
    console.log(`[StudentUpdate] Updated student ${studentId}:`, result.rows[0]);
    return res.status(200).json({ success: true, student: result.rows[0] });
  } catch (error: any) {
    console.error('[StudentUpdate] Error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleStudentGrading(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { totalPoints, lifetimeXp, sessionXp, sessionPts } = parseBody(req);
  
  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  const client = await pool.connect();
  try {
    // Use sessionXp to INCREMENT total_xp (single source of truth)
    const xpEarned = sessionXp || 0;
    
    await client.query(
      `UPDATE students SET 
        total_points = COALESCE($1, total_points),
        total_xp = COALESCE(total_xp, 0) + $2,
        last_class_at = NOW(),
        updated_at = NOW()
      WHERE id = $3::uuid`,
      [totalPoints, xpEarned, studentId]
    );

    // Log XP transaction for monthly leaderboard tracking
    if (xpEarned > 0) {
      await client.query(
        `INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
         VALUES ($1::uuid, $2, 'EARN', 'Class grading', NOW())`,
        [studentId, xpEarned]
      );
      console.log('[Grading] Logged XP transaction:', studentId, '+', xpEarned, 'XP');
    }

    console.log('[Grading] Updated student:', studentId, 'totalPoints:', totalPoints, 'total_xp:', xpEarned);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Grading] Update error:', error.message);
    return res.status(500).json({ error: 'Failed to update student grading data' });
  } finally {
    client.release();
  }
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleSendClassFeedback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    clubId,
    clubName,
    className,
    classDate,
    coachName,
    students,
    skills,
    homeworkEnabled,
    bonusEnabled
  } = parseBody(req);

  if (!clubId || !students || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'clubId and students array are required' });
  }

  let sentCount = 0;
  let failedCount = 0;

  try {
    for (const student of students) {
      const { id, name, parentEmail, scores, homework, bonus, totalPoints, stripeProgress, coachNote } = student;
      
      if (!parentEmail) {
        console.log('[ClassFeedback] Skipping student without parent email:', name);
        continue;
      }

      // Build the scores table HTML dynamically based on club's skills
      let scoresTableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0;">';
      scoresTableHtml += '<tr style="background-color: #f3f4f6;">';
      
      // Add skill headers (escaped for security)
      const skillsArray = skills || [];
      for (const skill of skillsArray) {
        scoresTableHtml += `<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">${escapeHtml(skill.name)}</th>`;
      }
      if (homeworkEnabled) {
        scoresTableHtml += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Homework</th>';
      }
      if (bonusEnabled) {
        scoresTableHtml += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center;">Bonus</th>';
      }
      scoresTableHtml += '<th style="border: 1px solid #ddd; padding: 8px; text-align: center; background-color: #0ea5e9; color: white;">Total</th>';
      scoresTableHtml += '</tr>';
      
      // Add score values row
      scoresTableHtml += '<tr>';
      for (const skill of skillsArray) {
        const score = scores?.[skill.id];
        const scoreLabel = score === 2 ? '🟢' : score === 1 ? '🟡' : score === 0 ? '🔴' : '—';
        scoresTableHtml += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 18px;">${scoreLabel}</td>`;
      }
      if (homeworkEnabled) {
        const safeHomework = parseInt(homework) || 0;
        scoresTableHtml += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">+${safeHomework}</td>`;
      }
      if (bonusEnabled) {
        const safeBonus = parseInt(bonus) || 0;
        scoresTableHtml += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">+${safeBonus}</td>`;
      }
      const safeTotalPoints = parseInt(totalPoints) || 0;
      scoresTableHtml += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold; background-color: #0ea5e9; color: white;">${safeTotalPoints}</td>`;
      scoresTableHtml += '</tr></table>';

      // Send email directly using SendGrid
      try {
        const safeParentName = escapeHtml(name.split(' ')[0]) + "'s Parent";
        const safeStudentName = escapeHtml(name);
        const safeClubName = escapeHtml(clubName || 'Your Dojo');
        const safeClassName = escapeHtml(className || 'Training Session');
        const safeClassDate = escapeHtml(classDate || new Date().toLocaleDateString());
        const safeCoachName = escapeHtml(coachName || 'Coach');
        const safeCoachNote = escapeHtml(coachNote || '');
        const safeStripeProgress = escapeHtml(stripeProgress || '0/64 pts');
        
        const coachNoteSection = safeCoachNote 
          ? `<div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;"><strong>💬 Coach's Note:</strong><br><em>"${safeCoachNote}"</em></div>` 
          : '';

        // "What's waiting" section matching welcome email (cyan gradient)
        const whatsWaitingSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
            <tr>
              <td style="background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); border-radius: 12px; padding: 20px; color: white;">
                <p style="margin: 0 0 12px 0; font-weight: 600; font-size: 16px;">🌟 What's waiting for ${safeStudentName}:</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding: 4px 0; font-size: 14px;">Track progress & earn <strong>HonorXP™</strong></td></tr>
                  <tr><td style="padding: 4px 0; font-size: 14px;">Unlock awesome <strong>Legacy Cards™</strong></td></tr>
                  <tr><td style="padding: 4px 0; font-size: 14px;">Climb the <strong>Global Shogun Rank™</strong></td></tr>
                  <tr><td style="padding: 4px 0; font-size: 14px;">Complete fun challenges in the Arena</td></tr>
                </table>
              </td>
            </tr>
          </table>
        `;

        // Premium feature teasers matching welcome email style
        const premiumTeaserSection = `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
            <tr>
              <td style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px;">
                <p style="margin: 0 0 16px 0; font-weight: 600; color: #92400e; font-size: 15px;">✨ Unlock Premium for $4.99/month:</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 6px 0; color: #78350f; font-size: 14px;">
                      🔒 <strong>ChronosBelt™ Predictor</strong> - <span style="color: #92400e;">AI predicts your child's black belt date</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #78350f; font-size: 14px;">
                      🔒 <strong>Legacy Cards™</strong> - <span style="color: #92400e;">Digital collectible cards for achievements</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #78350f; font-size: 14px;">
                      🔒 <strong>2x HonorXP™</strong> - <span style="color: #92400e;">Double points with video proof submissions</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #78350f; font-size: 14px;">
                      🔒 <strong>AI Training Insights</strong> - <span style="color: #92400e;">Personalized feedback from TaekBot</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #78350f; font-size: 14px;">
                      🔒 <strong>Home Dojo™ Habits</strong> - <span style="color: #92400e;">Daily practice tracking for discipline</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `;

        const emailBody = `
          Hi ${safeParentName},<br><br>
          Great news! <strong>${safeStudentName}</strong> attended class at <strong>${safeClubName}</strong> today!<br><br>
          <strong>Class:</strong> ${safeClassName}<br>
          <strong>Date:</strong> ${safeClassDate}<br>
          <strong>Coach:</strong> ${safeCoachName}<br><br>
          <strong>Performance Scores:</strong><br>
          ${scoresTableHtml}<br>
          <strong>Total Points Earned:</strong> ${safeTotalPoints} pts<br>
          <strong>Stripe Progress:</strong> ${safeStripeProgress}
          ${coachNoteSection}
          ${whatsWaitingSection}
          ${premiumTeaserSection}
        `;

        if (process.env.SENDGRID_API_KEY) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          
          // Use branded HTML matching MyTaek master template style exactly
          const brandedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header with Logo Image -->
          <tr>
            <td style="background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%); padding: 40px 30px; text-align: center;">
              <img src="https://www.mytaek.com/mytaek-logo.png" alt="MyTaek" width="120" style="display: inline-block; max-width: 120px;" />
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding: 32px 32px 16px 32px;">
              <h1 style="margin: 0; color: #111827; font-size: 26px; font-weight: 600;">${safeStudentName}'s Class Feedback 🥋</h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 0 32px 24px 32px; color: #374151; font-size: 15px; line-height: 1.7;">
              ${emailBody}
            </td>
          </tr>
          <!-- Button -->
          <tr>
            <td style="padding: 8px 32px 40px 32px;">
              <a href="https://www.mytaek.com/login" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);">View Full Report</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 28px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 12px 0; color: #4b5563; font-size: 14px;"><strong>TaekUp™</strong> is a product of <strong>MyTaek™</strong> Inc.</p>
              <p style="margin: 0 0 12px 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">HonorXP™ | Legacy Cards™ | Global Shogun Rank™ | DojoMint™ Protocol | ChronosBelt™ Predictor</p>
              <p style="margin: 0 0 16px 0; color: #9ca3af; font-size: 11px;">&copy; ${new Date().getFullYear()} MyTaek™ Inc. All rights reserved.</p>
              <p style="margin: 0;">
                <a href="https://www.mytaek.com/unsubscribe" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Unsubscribe</a>
                <span style="color: #d1d5db;"> | </span>
                <a href="https://www.mytaek.com/privacy" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Privacy Policy</a>
                <span style="color: #d1d5db;"> | </span>
                <a href="https://www.mytaek.com" style="color: #6b7280; font-size: 12px; text-decoration: underline;">Visit MyTaek</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

          await sgMail.send({
            to: parentEmail,
            from: { email: 'updates@mytaek.com', name: 'TaekUp' },
            subject: `⭐ ${safeStudentName}'s Class Report - ${safeClassDate}`,
            html: brandedHtml
          });
          sentCount++;
          console.log('[ClassFeedback] Email sent to:', parentEmail, 'for student:', name);
        } else {
          console.error('[ClassFeedback] SendGrid API key not configured');
          failedCount++;
        }
      } catch (emailError: any) {
        failedCount++;
        console.error('[ClassFeedback] Failed to send email to:', parentEmail, emailError.message);
      }
    }

    return res.json({ 
      success: true, 
      sent: sentCount, 
      failed: failedCount,
      message: `Sent ${sentCount} emails, ${failedCount} failed`
    });
  } catch (error: any) {
    console.error('[ClassFeedback] Error:', error.message);
    return res.status(500).json({ error: 'Failed to send class feedback emails' });
  }
}

async function handleGetStudentByEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const email = req.query.email as string;
  const clubId = req.query.clubId as string;
  
  if (!email || !clubId) {
    return res.status(400).json({ error: 'Email and clubId are required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE LOWER(parent_email) = $1 AND club_id = $2::uuid LIMIT 1`,
      [email.toLowerCase().trim(), clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    
    // Fallback: get first student from club
    const fallbackResult = await client.query(
      `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [clubId]
    );
    
    if (fallbackResult.rows.length > 0) {
      return res.json({ studentId: fallbackResult.rows[0].id });
    }
    
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetStudentByEmail] Error:', error.message);
    return res.json({ studentId: null });
  } finally {
    client.release();
  }
}

async function handleGetStudentByName(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const name = req.query.name as string;
  const clubId = req.query.clubId as string;
  
  if (!name || !clubId) {
    return res.status(400).json({ error: 'Name and clubId are required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE LOWER(name) = $1 AND club_id = $2::uuid LIMIT 1`,
      [name.toLowerCase().trim(), clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetStudentByName] Error:', error.message);
    return res.json({ studentId: null });
  } finally {
    client.release();
  }
}

async function handleGetFirstStudent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const clubId = req.query.clubId as string;
  
  if (!clubId) {
    return res.status(400).json({ error: 'clubId is required' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM students WHERE club_id = $1::uuid ORDER BY created_at ASC LIMIT 1`,
      [clubId]
    );
    
    if (result.rows.length > 0) {
      return res.json({ studentId: result.rows[0].id });
    }
    return res.json({ studentId: null });
  } catch (error: any) {
    console.error('[GetFirstStudent] Error:', error.message);
    return res.json({ studentId: null });
  } finally {
    client.release();
  }
}

async function handleInviteCoach(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { clubId, name, email, location, assignedClasses, password } = parseBody(req);

  if (!clubId || !name || !email) {
    return res.status(400).json({ error: 'Club ID, coach name, and email are required' });
  }

  const client = await pool.connect();
  try {
    const clubResult = await client.query('SELECT id, name, owner_email FROM clubs WHERE id = $1::uuid', [clubId]);
    const club = clubResult.rows[0];
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const tempPassword = password || '1234';
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Insert into users table for authentication
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, name, role, club_id, is_active, created_at)
       VALUES ($1, $2, $3, 'coach', $4::uuid, true, NOW())
       ON CONFLICT (email) DO UPDATE SET name = $3, club_id = $4::uuid, role = 'coach', is_active = true
       RETURNING id`,
      [email, passwordHash, name, clubId]
    );
    const userId = userResult.rows[0]?.id;

    // Also insert into coaches table for data fetching
    // First check if coach already exists
    const existingCoach = await client.query(
      `SELECT id FROM coaches WHERE email = $1 LIMIT 1`,
      [email]
    );
    
    if (existingCoach.rows.length > 0) {
      await client.query(
        `UPDATE coaches SET name = $1, club_id = $2::uuid, location = $5, assigned_classes = $6, is_active = true, invite_sent_at = NOW()
         WHERE email = $3`,
        [name, clubId, email, location || null, assignedClasses || []]
      );
    } else {
      await client.query(
        `INSERT INTO coaches (id, club_id, user_id, name, email, location, assigned_classes, is_active, invite_sent_at, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, true, NOW(), NOW())`,
        [clubId, userId, name, email, location || null, assignedClasses || []]
      );
    }

    const coachSent = await sendTemplateEmail(email, 'COACH_INVITE', {
      name: name,
      clubName: club.name,
      coachEmail: email,
      tempPassword: tempPassword,
      ownerName: club.name,
    });
    await logAutomatedEmail(client, 'coach_invite', email, 'COACH_INVITE', coachSent ? 'sent' : 'failed', clubId);
    console.log(`[InviteCoach] Coach invite email ${coachSent ? 'sent' : 'failed'} to:`, email);

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('coach_invited', 'Coach Invited', $1, $2::uuid, $3::jsonb, NOW())`,
      ['Coach invited: ' + name, clubId, JSON.stringify({ coachEmail: email, coachName: name })]
    );

    return res.status(201).json({
      success: true,
      coach: { email, name, location, assignedClasses }
    });
  } catch (error: any) {
    console.error('[InviteCoach] Error:', error.message);
    return res.status(500).json({ error: 'Failed to invite coach' });
  } finally {
    client.release();
  }
}

async function handleUpdateCoach(req: VercelRequest, res: VercelResponse, coachId: string) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(req);
  const { name, email, location, assignedClasses } = body;

  // Ensure assignedClasses is a valid array of strings
  let classesArray: string[] = [];
  if (Array.isArray(assignedClasses)) {
    classesArray = assignedClasses.filter((c: any) => typeof c === 'string');
  }

  const client = await pool.connect();
  try {
    // First check if coach exists
    const checkResult = await client.query(
      `SELECT id FROM coaches WHERE id = $1::uuid`,
      [coachId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found' });
    }

    // Check which columns exist
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'coaches' AND column_name IN ('location', 'assigned_classes')
    `);
    const existingColumns = columnCheck.rows.map((r: any) => r.column_name);
    const hasLocation = existingColumns.includes('location');
    const hasAssignedClasses = existingColumns.includes('assigned_classes');

    // Build dynamic query based on available columns
    let setClauses = ['name = COALESCE($1, name)', 'email = COALESCE($2, email)', 'updated_at = NOW()'];
    let returnClauses = ['id', 'name', 'email'];
    let params: any[] = [name || null, email || null];
    let paramIndex = 3;

    if (hasLocation) {
      setClauses.push(`location = $${paramIndex}`);
      returnClauses.push('location');
      params.push(location || null);
      paramIndex++;
    }

    if (hasAssignedClasses) {
      setClauses.push(`assigned_classes = $${paramIndex}`);
      returnClauses.push('assigned_classes');
      params.push(classesArray);
      paramIndex++;
    }

    params.push(coachId);

    const result = await client.query(
      `UPDATE coaches SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}::uuid
       RETURNING ${returnClauses.join(', ')}`,
      params
    );

    const coach = result.rows[0];
    return res.json({
      success: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
        location: coach.location || '',
        assignedClasses: coach.assigned_classes || []
      }
    });
  } catch (error: any) {
    console.error('[UpdateCoach] Error:', error.message);
    return res.status(500).json({ error: 'Failed to update coach', details: error.message });
  } finally {
    client.release();
  }
}

async function handleDeleteCoach(req: VercelRequest, res: VercelResponse, coachId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    // Soft delete - set is_active = false
    const result = await client.query(
      `UPDATE coaches SET is_active = false, updated_at = NOW() WHERE id = $1::uuid RETURNING id, email`,
      [coachId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coach not found' });
    }

    // Also deactivate the user account
    const coachEmail = result.rows[0].email;
    if (coachEmail) {
      await client.query(
        `UPDATE users SET is_active = false, updated_at = NOW() WHERE email = $1`,
        [coachEmail]
      );
    }

    console.log('[DeleteCoach] Deleted coach:', coachId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[DeleteCoach] Error:', error.message);
    return res.status(500).json({ error: 'Failed to delete coach' });
  } finally {
    client.release();
  }
}

async function handleLinkParent(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const { parentEmail, parentName, parentPhone } = parseBody(req);

  if (!parentEmail) {
    return res.status(400).json({ error: 'Parent email is required' });
  }

  const client = await pool.connect();
  try {
    const studentResult = await client.query(
      `SELECT s.id, s.name, s.parent_email, c.id as club_id, c.name as club_name 
       FROM students s
       JOIN clubs c ON s.club_id = c.id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const hadParentBefore = !!student.parent_email;

    await client.query(
      `UPDATE students 
       SET parent_email = $1, parent_name = $2, parent_phone = $3, updated_at = NOW()
       WHERE id = $4::uuid`,
      [parentEmail, parentName || null, parentPhone || null, studentId]
    );

    if (!hadParentBefore) {
      const parentSent = await sendTemplateEmail(parentEmail, 'PARENT_WELCOME', {
        parentName: parentName || 'Parent',
        parentEmail: parentEmail,
        studentName: student.name,
        clubName: student.club_name,
      });
      await logAutomatedEmail(client, 'parent_welcome', parentEmail, 'PARENT_WELCOME', parentSent ? 'sent' : 'failed', student.club_id);
      console.log(`[LinkParent] Parent welcome email ${parentSent ? 'sent' : 'failed'} to:`, parentEmail);
    }

    await client.query(
      `INSERT INTO activity_log (event_type, event_title, event_description, club_id, metadata, created_at)
       VALUES ('parent_linked', 'Parent Linked', $1, $2::uuid, $3::jsonb, NOW())`,
      ['Parent linked to student: ' + student.name, student.club_id, JSON.stringify({ studentId, parentEmail })]
    );

    return res.json({ 
      success: true, 
      message: hadParentBefore ? 'Parent information updated' : 'Parent linked and welcome email sent'
    });
  } catch (error: any) {
    console.error('[LinkParent] Error:', error.message);
    return res.status(500).json({ error: 'Failed to link parent to student' });
  } finally {
    client.release();
  }
}

// S3 client for video uploads
function getS3Client(): S3Client | null {
  if (!process.env.IDRIVE_E2_ACCESS_KEY || !process.env.IDRIVE_E2_SECRET_KEY || !process.env.IDRIVE_E2_ENDPOINT) {
    return null;
  }
  // Extract region from endpoint (e.g., s3.eu-west-4.idrivee2.com -> eu-west-4)
  const endpoint = process.env.IDRIVE_E2_ENDPOINT;
  const regionMatch = endpoint.match(/s3\.([^.]+)\.idrivee2\.com/);
  const region = regionMatch ? regionMatch[1] : 'us-east-1';
  
  return new S3Client({
    endpoint: `https://${endpoint}`,
    region: region,
    credentials: {
      accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY,
      secretAccessKey: process.env.IDRIVE_E2_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

async function handlePresignedUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, challengeId, filename, contentType, isGauntlet } = parseBody(req);
  
  if (!studentId || !challengeId || !filename) {
    return res.status(400).json({ error: 'studentId, challengeId, and filename are required' });
  }

  const client = await pool.connect();
  
  try {
    // CHECK LIMITS BEFORE generating upload URL (prevents orphaned uploads)
    if (isGauntlet) {
      // Gauntlet: Check weekly limit using gauntlet_submissions table
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      
      const existingSubmission = await client.query(`
        SELECT id FROM gauntlet_submissions 
        WHERE challenge_id = $1::uuid AND student_id = $2::uuid AND week_number = $3
      `, [challengeId, studentId, weekNumber]);
      
      if (existingSubmission.rows.length > 0) {
        console.log('[Videos] Gauntlet weekly limit reached:', { studentId, challengeId, weekNumber });
        client.release();
        return res.status(429).json({
          error: 'Already completed',
          message: 'You already completed this challenge this week. Come back next week!',
          limitReached: true
        });
      }
    } else {
      // Arena: Check daily limit using challenge_videos table
      const existingVideoResult = await client.query(`
        SELECT id FROM challenge_videos 
        WHERE student_id = $1::uuid AND challenge_id = $2
        AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
      `, [studentId, challengeId]);
      
      if (existingVideoResult.rows.length > 0) {
        console.log('[Videos] Arena daily limit reached:', { studentId, challengeId });
        client.release();
        return res.status(429).json({
          error: 'Already submitted',
          message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
          limitReached: true
        });
      }
    }
    client.release();
  } catch (limitCheckError: any) {
    client.release();
    console.error('[Videos] Limit check error:', limitCheckError.message);
    return res.status(500).json({ error: 'Failed to verify upload eligibility' });
  }

  const s3Client = getS3Client();
  const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
  
  if (!s3Client || !bucketName) {
    console.error('[Videos] Missing S3 configuration');
    return res.status(500).json({ error: 'Video storage not configured. Please contact support.' });
  }

  try {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `challenge-videos/${studentId}/${challengeId}/${timestamp}-${sanitizedFilename}`;
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType || 'video/mp4',
    });
    
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `https://${bucketName}.${process.env.IDRIVE_E2_ENDPOINT}/${key}`;
    
    return res.json({ uploadUrl, key, publicUrl });
  } catch (error: any) {
    console.error('[Videos] Presigned upload error:', error.message);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
}

async function handleSaveVideo(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, clubId, challengeId, challengeName, challengeCategory, videoUrl, videoKey, videoHash, score, xpAwarded, videoDuration } = parseBody(req);
  
  if (!studentId || !clubId || !challengeId || !videoUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    // Check if already submitted video for this challenge today
    // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch
    const existingVideoResult = await client.query(
      `SELECT id FROM challenge_videos 
       WHERE student_id = $1::uuid AND challenge_id = $2
       AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
      [studentId, challengeId]
    );
    
    if (existingVideoResult.rows.length > 0) {
      // Video already exists today - BLOCK duplicate submission
      console.log('[Videos] Duplicate submission blocked for student:', studentId, 'challenge:', challengeId);
      client.release();
      return res.status(429).json({
        error: 'Already submitted',
        message: 'You already uploaded a video for this challenge today. Try again tomorrow!',
        alreadyCompleted: true
      });
    }

    // AI Pre-Screening: Check for suspicious patterns
    let aiFlag = 'green'; // Default: looks good
    let aiFlagReason = '';
    
    // Check 1: Duplicate video content detection using hash (fingerprint)
    if (videoHash) {
      const duplicateHashCheck = await client.query(
        `SELECT id FROM challenge_videos 
         WHERE video_hash = $1 AND created_at > NOW() - INTERVAL '30 days'
         LIMIT 1`,
        [videoHash]
      );
      if (duplicateHashCheck.rows.length > 0) {
        aiFlag = 'red';
        aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
        console.log(`[AI-Screen] RED FLAG: Duplicate video hash for student ${studentId}, hash: ${videoHash.substring(0, 8)}...`);
      }
    }
    
    // Check 2: Rate limiting (more than 5 videos in 1 hour = suspicious)
    if (aiFlag !== 'red') {
      const rateCheck = await client.query(
        `SELECT COUNT(*) as count FROM challenge_videos 
         WHERE student_id = $1::uuid AND created_at > NOW() - INTERVAL '1 hour'`,
        [studentId]
      );
      if (parseInt(rateCheck.rows[0]?.count || '0') >= 5) {
        aiFlag = 'yellow';
        aiFlagReason = 'High submission rate';
        console.log(`[AI-Screen] YELLOW FLAG: High rate for student ${studentId}`);
      }
    }
    
    // Check 3: Video duration too short (less than 3 seconds)
    if (aiFlag === 'green' && videoDuration && videoDuration < 3) {
      aiFlag = 'yellow';
      aiFlagReason = 'Video very short';
      console.log(`[AI-Screen] YELLOW FLAG: Short video (${videoDuration}s) for student ${studentId}`);
    }
    
    // Check student's trust tier for auto-approval logic (optional - columns may not exist)
    let trustTier = 'unverified';
    try {
      const studentResult = await client.query(
        `SELECT trust_tier, video_approval_streak FROM students WHERE id = $1::uuid`,
        [studentId]
      );
      trustTier = studentResult.rows[0]?.trust_tier || 'unverified';
    } catch (tierError: any) {
      console.log(`[TrustTier] Trust tier columns not available: ${tierError.message}`);
    }
    
    let status = 'pending';
    let isSpotCheck = false;
    let autoApproved = false;
    // Store the correct XP upfront so coach sees it when reviewing (Coach Pick videos use passed xpAwarded)
    let finalXpAwarded = xpAwarded || 40;
    
    // AI Flags override auto-approval
    if (aiFlag === 'red') {
      // Red flag = always require manual review
      status = 'pending';
      console.log(`[TrustTier] Red flag override - manual review required for ${studentId}`);
    } else if (aiFlag === 'yellow') {
      // Yellow flag = require review even for verified students
      status = 'pending';
      console.log(`[TrustTier] Yellow flag - review required for ${studentId}`);
    } else if (trustTier === 'verified' || trustTier === 'trusted') {
      // Trust Tier Auto-Approve Logic (only for green-flagged videos)
      // Random spot-check (1 in 10)
      const randomNum = Math.floor(Math.random() * SPOT_CHECK_RATIO);
      if (randomNum === 0) {
        // This is a spot-check - keep pending for coach review
        isSpotCheck = true;
        status = 'pending';
        console.log(`[TrustTier] Spot-check triggered for student ${studentId}`);
        
        // Update last spot-check timestamp (optional - column may not exist)
        try {
          await client.query(
            `UPDATE students SET last_spot_check_at = NOW() WHERE id = $1::uuid`,
            [studentId]
          );
        } catch (e) { /* column may not exist */ }
      } else {
        // Auto-approve - student is trusted
        status = 'approved';
        autoApproved = true;
        finalXpAwarded = xpAwarded || 40; // Default XP for video
        console.log(`[TrustTier] Auto-approved video for ${trustTier} student ${studentId}`);
      }
    }
    
    // Insert new video record with hash for duplicate detection
    let video;
    try {
      const result = await client.query(
        `INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, is_spot_check, auto_approved, xp_awarded, ai_flag, ai_flag_reason, video_duration, verified_at, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
         RETURNING id`,
        [studentId, clubId, challengeId, challengeName || '', challengeCategory || '', videoUrl, videoKey || '', videoHash || null, score || 0, status, isSpotCheck, autoApproved, finalXpAwarded, aiFlag, aiFlagReason, videoDuration || null, autoApproved ? new Date() : null]
      );
      video = result.rows[0];
    } catch (insertError: any) {
      console.log(`[Videos] Full insert failed, using basic insert: ${insertError.message}`);
      // Fallback to basic INSERT without newer columns
      const result = await client.query(
        `INSERT INTO challenge_videos (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, xp_awarded, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING id`,
        [studentId, clubId, challengeId, challengeName || '', challengeCategory || '', videoUrl, videoKey || '', videoHash || null, score || 0, status, finalXpAwarded]
      );
      video = result.rows[0];
    }
    
    // If auto-approved, award XP immediately and update trust tier
    if (autoApproved && finalXpAwarded > 0) {
      await applyXpDelta(client, studentId, finalXpAwarded, 'video_auto_approved');
      
      // Increment approval streak and upgrade trust tier if thresholds met (optional - columns may not exist)
      try {
        await client.query(
          `UPDATE students 
           SET video_approval_streak = COALESCE(video_approval_streak, 0) + 1,
               trust_tier = CASE 
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $1::integer THEN 'trusted'
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $2::integer THEN 'verified'
                 ELSE COALESCE(trust_tier, 'unverified')
               END,
               updated_at = NOW()
           WHERE id = $3::uuid`,
          [TRUST_TIER_TRUSTED_THRESHOLD, TRUST_TIER_VERIFIED_THRESHOLD, studentId]
        );
      } catch (tierError: any) {
        console.log(`[TrustTier] Skipping trust tier update: ${tierError.message}`);
      }
    }
    
    return res.json({ 
      success: true, 
      videoId: video?.id,
      autoApproved,
      isSpotCheck,
      xpAwarded: finalXpAwarded,
      trustTier,
      aiFlag,
      aiFlagReason
    });
  } catch (error: any) {
    console.error('[Videos] Create error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to save video record', details: error.message });
  } finally {
    client.release();
  }
}

async function handleGetStudentVideos(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, challenge_id as "challengeId", challenge_name as "challengeName", 
              video_url as "videoUrl", status, score, vote_count as "voteCount", 
              coach_notes as "coachNotes", created_at as "createdAt"
       FROM challenge_videos 
       WHERE student_id = $1::uuid
       ORDER BY created_at DESC`,
      [studentId]
    );
    
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Videos] Get student videos error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch videos' });
  } finally {
    client.release();
  }
}

async function handleGetPendingVideos(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cv.*, s.name as student_name, s.belt as student_belt
       FROM challenge_videos cv
       JOIN students s ON cv.student_id = s.id
       WHERE cv.club_id = $1::uuid AND cv.status = 'pending'
       ORDER BY cv.created_at DESC`,
      [clubId]
    );
    
    // Use proxy URLs for video streaming (avoids presigned URL issues with iDrive E2)
    const videosWithProxyUrls = result.rows.map((video) => {
      let videoKey = video.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
        videoKey = video.video_url.split('idrivee2.com/')[1];
      }
      if (videoKey) {
        return { 
          ...video, 
          video_url: `/api/videos/stream/${encodeURIComponent(videoKey)}` 
        };
      }
      return video;
    });
    
    return res.json(videosWithProxyUrls);
  } catch (error: any) {
    console.error('[Videos] Fetch pending error:', error.message);
    return res.status(500).json({ error: 'Failed to get pending videos' });
  } finally {
    client.release();
  }
}

async function handleGetApprovedVideos(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cv.id, cv.student_id, s.name as student_name, cv.challenge_id, cv.challenge_name,
              cv.video_key, cv.video_url, cv.score, cv.vote_count, cv.created_at
       FROM challenge_videos cv
       JOIN students s ON cv.student_id = s.id
       WHERE cv.club_id = $1::uuid AND cv.status = 'approved'
       ORDER BY cv.created_at DESC`,
      [clubId]
    );
    
    const videosWithData = await Promise.all(result.rows.map(async (video) => {
      // Use proxy URL for video streaming
      let videoKey = video.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && video.video_url && video.video_url.includes('idrivee2.com/')) {
        videoKey = video.video_url.split('idrivee2.com/')[1];
      }
      let videoUrl = videoKey 
        ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
        : video.video_url;
      
      let hasVoted = false;
      if (studentId) {
        const voteCheck = await client.query(
          `SELECT id FROM challenge_video_votes WHERE video_id = $1::uuid AND voter_student_id = $2::uuid`,
          [video.id, studentId]
        );
        hasVoted = voteCheck.rows.length > 0;
      }
      
      return {
        ...video,
        video_url: videoUrl,
        has_voted: hasVoted
      };
    }));
    
    return res.json(videosWithData);
  } catch (error: any) {
    console.error('[Videos] Fetch approved error:', error.message);
    return res.status(500).json({ error: 'Failed to get approved videos' });
  } finally {
    client.release();
  }
}

async function handleVideoStream(req: VercelRequest, res: VercelResponse, videoKey: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const s3Client = getS3Client();
  const bucketName = process.env.IDRIVE_E2_BUCKET_NAME;
  
  if (!s3Client || !bucketName) {
    return res.status(500).json({ error: 'Video storage not configured' });
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoKey,
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Set headers for video streaming
    res.setHeader('Content-Type', response.ContentType || 'video/mp4');
    res.setHeader('Content-Length', response.ContentLength || 0);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Stream the video body
    const stream = response.Body as NodeJS.ReadableStream;
    stream.pipe(res as any);
  } catch (error: any) {
    console.error('[Videos] Stream error:', error.message);
    return res.status(500).json({ error: 'Failed to stream video' });
  }
}

async function handleVoteVideo(req: VercelRequest, res: VercelResponse, videoId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { voterStudentId } = parseBody(req);
  
  if (!voterStudentId) {
    return res.status(400).json({ error: 'voterStudentId is required' });
  }
  
  const client = await pool.connect();
  try {
    // Check if already voted
    const existing = await client.query(
      `SELECT id FROM challenge_video_votes 
       WHERE video_id = $1::uuid AND voter_student_id = $2::uuid`,
      [videoId, voterStudentId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already voted on this video' });
    }
    
    // Add vote
    await client.query(
      `INSERT INTO challenge_video_votes (video_id, voter_student_id, vote_value, created_at)
       VALUES ($1::uuid, $2::uuid, 1, NOW())`,
      [videoId, voterStudentId]
    );
    
    // Update vote count
    await client.query(
      `UPDATE challenge_videos 
       SET vote_count = vote_count + 1, updated_at = NOW()
       WHERE id = $1::uuid`,
      [videoId]
    );
    
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Videos] Vote error:', error.message);
    return res.status(500).json({ error: 'Failed to vote' });
  } finally {
    client.release();
  }
}

async function handleVerifyVideo(req: VercelRequest, res: VercelResponse, videoId: string) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  
  const { status, coachNotes, xpAwarded } = parseBody(req);
  
  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Valid status (approved/rejected) is required' });
  }
  
  const client = await pool.connect();
  const finalXpAwarded = xpAwarded || 40; // Default to 40 XP if not specified
  try {
    const result = await client.query(
      `UPDATE challenge_videos 
       SET status = $1::video_status, coach_notes = $2, xp_awarded = $3::integer, verified_at = CASE WHEN $1::text = 'approved' THEN NOW() ELSE verified_at END, updated_at = NOW()
       WHERE id = $4::uuid
       RETURNING *`,
      [status, coachNotes || '', finalXpAwarded, videoId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const video = result.rows[0];
    
    // Update Trust Tier based on approval/rejection (optional - columns may not exist in all environments)
    if (status === 'approved') {
      try {
        // Increment approval streak and possibly upgrade trust tier
        const studentResult = await client.query(
          `UPDATE students 
           SET video_approval_streak = COALESCE(video_approval_streak, 0) + 1,
               trust_tier = CASE 
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $1::integer THEN 'trusted'
                 WHEN COALESCE(video_approval_streak, 0) + 1 >= $2::integer THEN 'verified'
                 ELSE COALESCE(trust_tier, 'unverified')
               END,
               updated_at = NOW()
           WHERE id = $3::uuid
           RETURNING trust_tier, video_approval_streak`,
          [TRUST_TIER_TRUSTED_THRESHOLD, TRUST_TIER_VERIFIED_THRESHOLD, video.student_id]
        );
        
        const newTier = studentResult.rows[0]?.trust_tier;
        const newStreak = studentResult.rows[0]?.video_approval_streak;
        console.log(`[TrustTier] Student ${video.student_id} approved: streak=${newStreak}, tier=${newTier}`);
      } catch (tierError: any) {
        // Trust tier columns may not exist - just log and continue
        console.log(`[TrustTier] Skipping trust tier update (columns may not exist): ${tierError.message}`);
      }
      
      // Award XP using unified helper
      if (finalXpAwarded > 0) {
        await applyXpDelta(client, video.student_id, finalXpAwarded, 'video_approved');
        
        // For Gauntlet (Daily Training) videos, also award Global XP
        if (video.challenge_category === 'Daily Training') {
          // Get global points from gauntlet_submissions
          const gauntletSub = await client.query(
            `SELECT global_points_awarded FROM gauntlet_submissions 
             WHERE challenge_id = $1::uuid AND student_id = $2::uuid
             ORDER BY submitted_at DESC LIMIT 1`,
            [video.challenge_id, video.student_id]
          );
          const globalPoints = gauntletSub.rows[0]?.global_points_awarded || 15;
          
          // Award Global XP
          await client.query(
            `UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid`,
            [globalPoints, video.student_id]
          );
          console.log('[Videos] Awarded', globalPoints, 'Global XP to student', video.student_id, '(Gauntlet video)');
        }
        
        // For Coach Pick (Arena) videos, calculate and award Global XP
        if (video.challenge_category && video.challenge_category !== 'Daily Training') {
          try {
            let difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC' = 'MEDIUM';
            let foundInDb = false;
            
            // Try to get difficulty tier from arena_challenges table (if valid UUID)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (video.challenge_id && uuidRegex.test(video.challenge_id)) {
              const challengeResult = await client.query(
                `SELECT difficulty_tier, category FROM arena_challenges WHERE id = $1::uuid`,
                [video.challenge_id]
              );
              if (challengeResult.rows.length > 0) {
                difficulty = (challengeResult.rows[0].difficulty_tier || 'MEDIUM').toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD' | 'EPIC';
                foundInDb = true;
              }
            }
            
            // If not found in DB, infer difficulty from XP awarded (Local XP values for Coach Pick with video)
            if (!foundInDb) {
              const xp = finalXpAwarded;
              if (xp >= 100) difficulty = 'EPIC';
              else if (xp >= 70) difficulty = 'HARD';
              else if (xp >= 40) difficulty = 'MEDIUM';
              else difficulty = 'EASY';
              console.log('[Videos] Inferred difficulty', difficulty, 'from XP', xp);
            }
            
            // Calculate Global XP using ARENA_GLOBAL_SCORE_MATRIX (Coach Pick with video)
            const globalPoints = calculateArenaGlobalScore('coach_pick', difficulty, true);
            
            // Award Global XP to student
            await client.query(
              `UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid`,
              [globalPoints, video.student_id]
            );
            
            // Store global_rank_points on the video record for auditing
            await client.query(
              `UPDATE challenge_videos SET global_rank_points = $1 WHERE id = $2::uuid`,
              [globalPoints, video.id]
            );
            
            console.log('[Videos] Awarded', globalPoints, 'Global XP to student', video.student_id, '(Coach Pick video, difficulty:', difficulty, ')');
          } catch (globalErr: any) {
            console.error('[Videos] Failed to award Global XP for Coach Pick:', globalErr.message);
          }
        }
      }
    } else if (status === 'rejected') {
      try {
        // Reset streak, increment rejection count, downgrade trust tier
        await client.query(
          `UPDATE students 
           SET video_approval_streak = 0,
               video_rejection_count = COALESCE(video_rejection_count, 0) + 1,
               trust_tier = 'unverified',
               updated_at = NOW()
           WHERE id = $1::uuid`,
          [video.student_id]
        );
        console.log(`[TrustTier] Student ${video.student_id} rejected: tier downgraded to unverified`);
      } catch (tierError: any) {
        console.log(`[TrustTier] Skipping trust tier update (columns may not exist): ${tierError.message}`);
      }
      
      // Send parent notification email about rejection
      try {
        const parentResult = await client.query(
          `SELECT p.email, p.name as parent_name, s.name as student_name 
           FROM parents p
           JOIN students s ON s.parent_id = p.id
           WHERE s.id = $1::uuid`,
          [video.student_id]
        );
        
        if (parentResult.rows.length > 0 && parentResult.rows[0].email) {
          const parent = parentResult.rows[0];
          const challengeName = video.challenge_name || 'Challenge';
          const coachFeedback = coachNotes || 'Please review the submission requirements and try again.';
          
          await sendTemplateEmail(
            parent.email,
            'd-video-rejection-notification',
            {
              parent_name: parent.parent_name || 'Parent',
              student_name: parent.student_name || 'Your child',
              challenge_name: challengeName,
              coach_feedback: coachFeedback
            }
          );
          console.log(`[Email] Sent rejection notification to parent ${parent.email} for student ${video.student_id}`);
        }
      } catch (emailError: any) {
        console.error('[Email] Failed to send rejection notification:', emailError.message);
      }
    }
    
    return res.json({ success: true, video: result.rows[0], xpAwarded: finalXpAwarded });
  } catch (error: any) {
    console.error('[Videos] Verify error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to verify video', details: error.message });
  } finally {
    client.release();
  }
}

// =====================================================
// DAILY MYSTERY CHALLENGE - with robust fallback
// =====================================================

function getFallbackChallenge() {
  // Array of fallback questions - rotates daily to prevent same question every day
  const fallbackQuestions = [
    {
      title: "Belt Wisdom",
      question: "What does the color of the White Belt represent?",
      options: ["Danger", "Innocence/Beginner", "Mastery", "Fire"],
      correctIndex: 1,
      explanation: "The White Belt represents innocence and a beginner's pure mind - ready to absorb new knowledge like a blank canvas!"
    },
    {
      title: "Taekwondo Origins",
      question: "What country did Taekwondo originate from?",
      options: ["Japan", "China", "Korea", "Vietnam"],
      correctIndex: 2,
      explanation: "Taekwondo was developed in Korea in the 1940s and 1950s, combining traditional Korean martial arts with influences from other disciplines."
    },
    {
      title: "Martial Arts Respect",
      question: "What is the traditional bow called in Korean martial arts?",
      options: ["Hajime", "Kyungye", "Rei", "Salute"],
      correctIndex: 1,
      explanation: "Kyungye (경례) means 'bow' in Korean and is used to show respect to instructors, training partners, and the dojang."
    },
    {
      title: "Training Space",
      question: "What is the training hall called in Taekwondo?",
      options: ["Dojo", "Dojang", "Gym", "Studio"],
      correctIndex: 1,
      explanation: "Dojang (도장) is the Korean word for a martial arts training hall, literally meaning 'the place of the way'."
    },
    {
      title: "Black Belt Meaning",
      question: "What does the Black Belt traditionally symbolize?",
      options: ["End of training", "Mastery and maturity", "Danger level", "Teaching ability"],
      correctIndex: 1,
      explanation: "The Black Belt symbolizes maturity and proficiency in the basics - it's actually the beginning of deeper learning, not the end!"
    },
    {
      title: "Spirit of Taekwondo",
      question: "What does 'Taekwondo' literally mean?",
      options: ["Art of fighting", "The way of the foot and fist", "Korean karate", "Self-defense art"],
      correctIndex: 1,
      explanation: "Taekwondo (태권도) literally means 'the way of the foot and fist' - Tae (foot), Kwon (fist), Do (way/art)."
    },
    {
      title: "Forms Practice",
      question: "What are the choreographed patterns of movements called in Taekwondo?",
      options: ["Kata", "Poomsae", "Kihon", "Sparring"],
      correctIndex: 1,
      explanation: "Poomsae (품새) are the forms or patterns in Taekwondo - a sequence of techniques practiced solo to develop precision and focus."
    }
  ];
  
  // Select question based on day of year (rotates through all questions)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const selectedQuestion = fallbackQuestions[dayOfYear % fallbackQuestions.length];
  
  return {
    title: selectedQuestion.title,
    description: "Test your martial arts knowledge!",
    type: 'quiz' as const,
    xpReward: 15,
    quizData: {
      question: selectedQuestion.question,
      options: selectedQuestion.options,
      correctIndex: selectedQuestion.correctIndex,
      explanation: selectedQuestion.explanation
    }
  };
}

async function generateDailyChallengeAI(targetBelt: string, artType: string): Promise<any> {
  const gemini = getGeminiClient();
  const openai = getOpenAIClient();
  
  const prompt = `Generate a fun daily quiz challenge for a ${targetBelt} belt student practicing ${artType}.

IMPORTANT: The martial art is ${artType} (NOT Taekwondo unless that's the art specified). Make sure the title and question are specific to ${artType}.

Return a JSON object with:
- title: Short catchy title mentioning ${artType} (max 30 chars)
- description: Brief description of the challenge (max 100 chars)
- question: A quiz question specifically about ${artType} history, terminology, techniques, or philosophy
- options: Array of 4 answer choices
- correctIndex: Index of correct answer (0-3)
- explanation: Brief explanation of the correct answer (max 100 chars)

The question should be age-appropriate, educational, and fun! Vary the topics - don't always ask about the meaning of the art's name.

Return ONLY valid JSON, no markdown.`;

  // Try Gemini first with multiple model fallbacks
  if (gemini) {
    const geminiModels = ['gemini-2.0-flash'];
    for (const modelName of geminiModels) {
      try {
        console.log(`[DailyChallenge] Trying Gemini model: ${modelName}`);
        const model = gemini.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(text);
        console.log(`[DailyChallenge] Gemini ${modelName} succeeded`);
        return {
          title: parsed.title || "Daily Challenge",
          description: parsed.description || "Test your martial arts knowledge!",
          type: 'quiz',
          xpReward: 15,
          quizData: {
            question: parsed.question,
            options: parsed.options,
            correctIndex: parsed.correctIndex,
            explanation: parsed.explanation
          }
        };
      } catch (e: any) {
        console.log(`[DailyChallenge] Gemini ${modelName} failed:`, e.message);
      }
    }
  } else {
    console.log('[DailyChallenge] No Gemini client available (GOOGLE_API_KEY missing?)');
  }

  // Fallback to OpenAI
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.8,
      });
      const text = response.choices[0]?.message?.content?.replace(/```json\n?|\n?```/g, '').trim() || '';
      const parsed = JSON.parse(text);
      return {
        title: parsed.title || "Daily Challenge",
        description: parsed.description || "Test your martial arts knowledge!",
        type: 'quiz',
        xpReward: 25,
        quizData: {
          question: parsed.question,
          options: parsed.options,
          correctIndex: parsed.correctIndex,
          explanation: parsed.explanation
        }
      };
    } catch (e: any) {
      console.log('[DailyChallenge] OpenAI failed:', e.message);
    }
  }

  throw new Error('All AI providers failed');
}

async function handleDailyChallenge(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentId, clubId, belt } = req.query;
  
  if (!studentId || !belt) {
    return res.status(400).json({ error: 'studentId and belt are required' });
  }

  const today = new Date().toISOString().split('T')[0];
  const targetBelt = (belt as string).toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUuid = uuidRegex.test(studentId as string);

  const client = await pool.connect();
  try {
    // Check if student already completed today's challenge
    if (isValidUuid) {
      // Check 1: Regular challenge_submissions table (for DB-stored challenges)
      const existingSubmission = await client.query(
        `SELECT cs.id, cs.is_correct, cs.xp_awarded, dc.title
         FROM challenge_submissions cs
         JOIN daily_challenges dc ON cs.challenge_id = dc.id
         WHERE cs.student_id = $1::uuid 
         AND dc.date = $2 
         AND dc.target_belt = $3`,
        [studentId, today, targetBelt]
      );

      if (existingSubmission.rows.length > 0) {
        const sub = existingSubmission.rows[0];
        return res.json({ 
          completed: true, 
          message: `You already completed today's challenge: "${sub.title}"!`,
          xpAwarded: sub.xp_awarded,
          wasCorrect: sub.is_correct
        });
      }
      
      // Check 2: xp_transactions table (for fallback/dynamic challenges)
      const fallbackSubmission = await client.query(
        `SELECT id, amount FROM xp_transactions 
         WHERE student_id = $1::uuid 
         AND reason LIKE '%daily_challenge%' 
         AND DATE(created_at) = $2::date
         LIMIT 1`,
        [studentId, today]
      );
      
      if (fallbackSubmission.rows.length > 0) {
        const xpAmount = fallbackSubmission.rows[0].amount || 0;
        return res.json({ 
          completed: true, 
          message: `You already completed today's mystery challenge!`,
          xpAwarded: xpAmount,
          wasCorrect: true
        });
      }
    }

    // Get club's art_type FIRST (needed for cache lookup)
    let artType = 'Taekwondo';
    const clubIdStr = clubId as string;
    const isValidClubUuid = uuidRegex.test(clubIdStr);
    
    if (clubId && isValidClubUuid) {
      try {
        const clubData = await client.query(`SELECT art_type FROM clubs WHERE id = $1::uuid`, [clubIdStr]);
        if (clubData.rows.length > 0) {
          artType = clubData.rows[0].art_type || 'Taekwondo';
        }
      } catch (e) { /* ignore */ }
    }

    // Check if challenge exists for today + belt + art_type (PROPER CACHING)
    const existingChallenge = await client.query(
      `SELECT * FROM daily_challenges WHERE date = $1 AND target_belt = $2 AND art_type = $3 LIMIT 1`,
      [today, targetBelt, artType]
    );

    let challenge: any;

    if (existingChallenge.rows.length > 0) {
      challenge = existingChallenge.rows[0];
      console.log(`[DailyChallenge] Using cached challenge for ${artType} ${targetBelt} belt`);
    } else {
      // Generate new challenge with AI, with fallback
      let generated;
      try {
        generated = await generateDailyChallengeAI(targetBelt, artType);
        console.log(`[DailyChallenge] AI generated challenge for ${artType} ${targetBelt} belt`);
      } catch (aiError: any) {
        console.error(`[DailyChallenge] AI generation failed: ${aiError.message}`);
        console.log(`[DailyChallenge] Using fallback challenge`);
        generated = getFallbackChallenge();
      }
      
      // Cache in database with art_type
      try {
        const insertResult = await client.query(
          `INSERT INTO daily_challenges (date, target_belt, art_type, title, description, xp_reward, type, quiz_data, created_by_ai)
           VALUES ($1, $2, $3, $4, $5, $6, $7::daily_challenge_type, $8::jsonb, NOW())
           RETURNING *`,
          [today, targetBelt, artType, generated.title, generated.description, generated.xpReward, 
           generated.type, JSON.stringify(generated.quizData)]
        );
        challenge = insertResult.rows[0];
      } catch (dbError: any) {
        console.error(`[DailyChallenge] DB cache failed: ${dbError.message}`);
        return res.json({
          completed: false,
          challenge: {
            id: 'temp-' + Date.now(),
            title: generated.title,
            description: generated.description,
            type: generated.type,
            xpReward: generated.xpReward,
            quizData: generated.quizData,
          }
        });
      }
    }

    return res.json({
      completed: false,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        type: challenge.type,
        xpReward: challenge.xp_reward,
        quizData: challenge.quiz_data,
      }
    });
  } catch (error: any) {
    console.error('[DailyChallenge] Critical error:', error.message);
    const fallback = getFallbackChallenge();
    return res.json({
      completed: false,
      challenge: {
        id: 'fallback-' + Date.now(),
        title: fallback.title,
        description: fallback.description,
        type: fallback.type,
        xpReward: fallback.xpReward,
        quizData: fallback.quizData,
      }
    });
  } finally {
    client.release();
  }
}

// Database setup endpoint - creates missing tables
async function handleDbSetup(req: VercelRequest, res: VercelResponse) {
  const { password } = parseBody(req);
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  
  if (!adminPassword || password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const client = await pool.connect();
  try {
    // Create challenge_submissions table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS challenge_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        challenge_id UUID NOT NULL,
        student_id UUID NOT NULL,
        club_id UUID NOT NULL,
        answer TEXT,
        is_correct BOOLEAN DEFAULT false,
        xp_awarded INTEGER DEFAULT 0,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        mode TEXT,
        opponent_id UUID,
        status TEXT,
        proof_type TEXT,
        video_url TEXT,
        score INTEGER
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_student ON challenge_submissions(student_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_challenge ON challenge_submissions(challenge_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cs_answer ON challenge_submissions(answer)`);
    
    // Add location and assigned_class columns to students table
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS location VARCHAR(255)`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_class VARCHAR(255)`);
    
    // Create daily_challenges table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'quiz',
        xp_reward INTEGER DEFAULT 50,
        quiz_data JSONB,
        belt_level TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true
      )
    `);
    
    // Create arena_challenges table if missing
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE challenge_category AS ENUM ('POWER', 'TECHNIQUE', 'FLEXIBILITY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE difficulty_tier AS ENUM ('EASY', 'MEDIUM', 'HARD');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS arena_challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        club_id UUID,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50) DEFAULT '💪',
        category challenge_category NOT NULL,
        difficulty_tier difficulty_tier DEFAULT 'MEDIUM',
        xp_reward INTEGER DEFAULT 30,
        is_system_default BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Reset arena challenges only (preserve user videos and submissions)
    // Only clear system-default arena challenges, not user content
    await client.query(`DELETE FROM arena_challenges WHERE is_system_default = true`);
    
    // Insert fresh GPP challenges into ARENA_CHALLENGES table (what /api/challenges/arena reads)
    const seedChallenges = [
      // POWER (icon: 💪)
      { name: 'Push-up Master', desc: '10 perfect pushups', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      { name: 'Squat Challenge', desc: '20 squats', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      { name: 'Burpee Blast', desc: '10 burpees', icon: '💪', cat: 'POWER', diff: 'HARD', xp: 60 },
      { name: 'Abs of Steel', desc: '20 Sit-ups', icon: '💪', cat: 'POWER', diff: 'MEDIUM', xp: 30 },
      // TECHNIQUE (icon: 🎯)
      { name: '100 Kicks Marathon', desc: '100 kicks total', icon: '🎯', cat: 'TECHNIQUE', diff: 'HARD', xp: 60 },
      { name: 'Speed Punches', desc: '50 shadow punches', icon: '🎯', cat: 'TECHNIQUE', diff: 'EASY', xp: 15 },
      { name: 'Iron Horse Stance', desc: 'Hold stance 60s', icon: '🎯', cat: 'TECHNIQUE', diff: 'HARD', xp: 60 },
      { name: 'Jump Rope Ninja', desc: 'Jump rope 2 mins', icon: '🎯', cat: 'TECHNIQUE', diff: 'MEDIUM', xp: 30 },
      // FLEXIBILITY (icon: 🧘)
      { name: 'Plank Hold', desc: 'Hold 45s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'MEDIUM', xp: 30 },
      { name: 'Touch Your Toes', desc: 'Hold 30s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'EASY', xp: 15 },
      { name: 'The Wall Sit', desc: 'Hold 45s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'MEDIUM', xp: 30 },
      { name: 'One-Leg Balance', desc: 'Balance 60s', icon: '🧘', cat: 'FLEXIBILITY', diff: 'EASY', xp: 15 },
    ];
    
    for (const c of seedChallenges) {
      await client.query(`
        INSERT INTO arena_challenges (name, description, icon, category, difficulty_tier, xp_reward, is_system_default, club_id)
        VALUES ($1::text, $2::text, $3::text, $4::challenge_category, $5::difficulty_tier, $6::integer, true, NULL)
      `, [c.name, c.desc, c.icon, c.cat, c.diff, c.xp]);
    }
    
    return res.json({ 
      success: true, 
      message: 'HARD RESET complete! Old challenges deleted. 12 new GPP challenges inserted with standardized XP (Easy=15, Medium=30, Hard=60).' 
    });
  } catch (error: any) {
    console.error('[DbSetup] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleDailyChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const body = parseBody(req);
  console.log('📥 [DailyChallenge] Received Payload:', JSON.stringify(body, null, 2));
  console.log('🔍 Processing Submission:', { type: typeof body.challengeId, id: body.challengeId });
  
  // Extract fields - be very lenient with what we accept
  const { challengeId, studentId, selectedIndex, answer, isCorrect: frontendIsCorrect, xpReward: frontendXpReward } = body;
  const clubIdRaw = body.clubId;
  
  // Only require studentId and challengeId
  if (!challengeId || !studentId) {
    console.error('❌ [DailyChallenge] Missing required fields:', { challengeId, studentId });
    return res.status(400).json({ error: 'challengeId and studentId are required' });
  }

  // UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // studentId MUST be a valid UUID
  if (!uuidRegex.test(String(studentId))) {
    console.error('❌ [DailyChallenge] Invalid studentId format:', studentId);
    return res.status(400).json({ error: 'Invalid studentId format' });
  }
  
  // challengeId: Accept UUID OR string starting with "fallback-" or "static-"
  const challengeIdStr = String(challengeId);
  const isFallbackChallenge = challengeIdStr.startsWith('fallback-') || challengeIdStr.startsWith('static-') || !uuidRegex.test(challengeIdStr);
  const isValidUUID = uuidRegex.test(challengeIdStr);
  
  console.log('📋 [DailyChallenge] Challenge type:', { isFallbackChallenge, isValidUUID, challengeIdStr });
  
  // clubId: FULLY OPTIONAL - accept null, undefined, invalid strings, anything
  const validClubId = (clubIdRaw && typeof clubIdRaw === 'string' && uuidRegex.test(clubIdRaw)) ? clubIdRaw : null;
  
  console.log('📋 [DailyChallenge] Validated (lenient):', { studentId, challengeId: challengeIdStr, validClubId, selectedIndex, isFallbackChallenge });

  const client = await pool.connect();
  try {
    // BUG FIX: Check if user already completed a daily challenge TODAY (prevents infinite XP exploit)
    // Use xp_transactions table (correct table name) with reason containing 'daily_challenge'
    const today = new Date().toISOString().split('T')[0];
    const alreadyPlayedToday = await client.query(
      `SELECT id, amount FROM xp_transactions 
       WHERE student_id = $1::uuid 
       AND reason LIKE '%daily_challenge%' 
       AND DATE(created_at) = $2::date
       LIMIT 1`,
      [studentId, today]
    );
    
    if (alreadyPlayedToday.rows.length > 0) {
      console.log('⛔ [DailyChallenge] Already played today - blocking duplicate:', { studentId, today });
      return res.status(400).json({
        error: 'Already completed',
        message: 'You already completed today\'s challenge! Come back tomorrow.',
        previousXp: alreadyPlayedToday.rows[0].amount || 0
      });
    }
    
    // FALLBACK CHALLENGE HANDLING: Create or get fallback challenge, then save to history
    if (isFallbackChallenge) {
      console.log('🎯 [DailyChallenge] Processing FALLBACK challenge');
      
      // For fallback challenges, trust the frontend's isCorrect or default to true
      const isCorrect = frontendIsCorrect !== undefined ? frontendIsCorrect : true;
      
      // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
      const localXp = isCorrect ? 15 : 5;
      const globalXp = isCorrect ? 3 : 1;
      
      // Ensure a fallback challenge exists in daily_challenges for today
      const fallbackData = getFallbackChallenge();
      let fallbackChallengeId: string;
      
      const existingFallback = await client.query(
        `SELECT id FROM daily_challenges WHERE date = $1 AND title = $2 LIMIT 1`,
        [today, fallbackData.title]
      );
      
      if (existingFallback.rows.length > 0) {
        fallbackChallengeId = existingFallback.rows[0].id;
      } else {
        const insertResult = await client.query(
          `INSERT INTO daily_challenges (date, target_belt, title, description, xp_reward, type, quiz_data)
           VALUES ($1, 'all', $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [today, fallbackData.title, fallbackData.description, fallbackData.xpReward, 
           fallbackData.type, JSON.stringify(fallbackData.quizData)]
        );
        fallbackChallengeId = insertResult.rows[0].id;
      }
      
      // Save submission to challenge_submissions for history tracking
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
        [fallbackChallengeId, studentId, validClubId, String(selectedIndex), isCorrect, localXp]
      );
      
      // Award Local XP using unified helper
      await applyXpDelta(client, studentId, localXp, 'daily_challenge');
      console.log(`✅ [DailyChallenge] Fallback Local XP awarded: ${localXp}`);
      
      // Award Global XP (use global_xp column - the one World Rankings queries)
      const globalResult = await client.query(
        `UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid RETURNING global_xp`,
        [globalXp, studentId]
      );
      console.log(`✅ [DailyChallenge] Fallback Global XP awarded: +${globalXp}, new total: ${globalResult.rows[0]?.global_xp}`);
      
      return res.json({
        success: true,
        isCorrect,
        xpAwarded: localXp,
        globalXp,
        explanation: 'Great job completing the challenge!',
        message: isCorrect ? `Correct! +${localXp} XP` : `Not quite! +${localXp} XP for trying!`
      });
    }

    // REGULAR CHALLENGE HANDLING: Full DB lookup and validation
    // Check for duplicate submission BEFORE processing
    const existingSubmission = await client.query(
      `SELECT id, xp_awarded, is_correct FROM challenge_submissions 
       WHERE challenge_id = $1::uuid AND student_id = $2::uuid LIMIT 1`,
      [challengeId, studentId]
    );

    if (existingSubmission.rows.length > 0) {
      const prev = existingSubmission.rows[0];
      return res.status(400).json({ 
        error: 'Already completed', 
        message: 'You have already submitted this challenge!',
        previousXp: prev.xp_awarded,
        wasCorrect: prev.is_correct
      });
    }

    // Get challenge from database
    const challengeResult = await client.query(
      `SELECT * FROM daily_challenges WHERE id = $1::uuid`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = challengeResult.rows[0];
    const quizData = challenge.quiz_data || {};
    const correctIndex = quizData.correctIndex ?? 0;
    const isCorrect = selectedIndex === correctIndex;
    
    // Daily Mystery XP values: Correct=15 Local/3 Global, Wrong=5 Local/1 Global
    const localXp = isCorrect ? 15 : 5;
    const globalXp = isCorrect ? 3 : 1;

    // Save submission record (clubId is optional for home users)
    console.log('💾 [DailyChallenge] Inserting submission:', { challengeId, studentId, validClubId, isCorrect, localXp, globalXp });
    await client.query(
      `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, is_correct, xp_awarded)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [challengeId, studentId, validClubId, answer || String(selectedIndex), isCorrect, localXp]
    );

    // Update student Local XP using unified helper
    await applyXpDelta(client, studentId, localXp, 'daily_challenge');
    console.log(`✅ [DailyChallenge] Regular Local XP awarded: ${localXp}`);
    
    // Update student Global XP (use global_xp column - the one World Rankings queries)
    const globalResult = await client.query(
      `UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid RETURNING global_xp`,
      [globalXp, studentId]
    );
    console.log(`✅ [DailyChallenge] Regular Global XP awarded: +${globalXp}, new total: ${globalResult.rows[0]?.global_xp}`);
    
    return res.json({
      success: true,
      isCorrect,
      correctIndex,
      xpAwarded: localXp,
      globalXp,
      explanation: quizData.explanation || 'Great effort!',
      message: isCorrect ? `Correct! +${localXp} XP` : `Not quite! +${localXp} XP for trying.`
    });
  } catch (error: any) {
    console.error('🔥 FATAL SUBMIT ERROR:', error);
    console.error('🔥 Error stack:', error.stack);
    return res.status(500).json({ error: 'Failed to submit challenge', details: error.message });
  } finally {
    client.release();
  }
}

// Quick status check for daily challenge completion (used by frontend fallback)
async function handleDailyChallengeStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId format' });
  }
  
  const today = new Date().toISOString().split('T')[0];
  const client = await pool.connect();
  
  try {
    // Check xp_transactions for today's daily_challenge entry
    const result = await client.query(
      `SELECT id, amount FROM xp_transactions 
       WHERE student_id = $1::uuid 
       AND reason LIKE '%daily_challenge%' 
       AND DATE(created_at) = $2::date
       LIMIT 1`,
      [studentId, today]
    );
    
    if (result.rows.length > 0) {
      return res.json({
        completed: true,
        alreadyPlayed: true,
        xpAwarded: result.rows[0].amount || 50,
        message: 'You already completed today\'s challenge!'
      });
    }
    
    // Also check challenge_submissions table
    const submissionResult = await client.query(
      `SELECT cs.xp_awarded FROM challenge_submissions cs
       JOIN daily_challenges dc ON cs.challenge_id = dc.id
       WHERE cs.student_id = $1::uuid AND dc.date = $2
       LIMIT 1`,
      [studentId, today]
    );
    
    if (submissionResult.rows.length > 0) {
      return res.json({
        completed: true,
        alreadyPlayed: true,
        xpAwarded: submissionResult.rows[0].xp_awarded || 50,
        message: 'You already completed today\'s challenge!'
      });
    }
    
    return res.json({ completed: false, alreadyPlayed: false });
  } catch (error: any) {
    console.error('[DailyChallengeStatus] Error:', error.message);
    return res.json({ completed: false, alreadyPlayed: false });
  } finally {
    client.release();
  }
}

async function handleVideoFeedback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { studentName, challengeName, challengeCategory, score, beltLevel, coachNotes } = parseBody(req);
  
  if (!studentName || !challengeName) {
    return res.status(400).json({ error: 'Student name and challenge name are required' });
  }

  const scoreText = score ? `achieved a score of ${score}` : 'completed';
  const coachObservation = coachNotes ? `\n\nCoach's observation: "${coachNotes}". Incorporate this feedback naturally.` : '';
  const prompt = `Generate a brief, encouraging coach feedback (2 sentences max) for ${studentName}, a ${beltLevel || 'student'} belt, who ${scoreText} in the "${challengeName}" challenge (${challengeCategory || 'General'} category).${coachObservation}

IMPORTANT: You MUST mention their specific score of ${score || 'their result'} in your feedback. Be specific about their achievement. Keep it under 40 words.`;

  // Try Gemini first (cost-effective)
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const feedback = result.response.text();
      if (feedback) return res.json({ feedback });
    } catch (error: any) {
      console.log('[VideoFeedback] Gemini failed, trying OpenAI...');
    }
  }

  // Fallback to OpenAI
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.8,
      });
      const feedback = response.choices[0]?.message?.content?.trim();
      if (feedback) return res.json({ feedback });
    } catch (error: any) {
      console.error('[VideoFeedback] OpenAI error:', error.message);
    }
  }

  // Final fallback
  const fallbacks = [
    `Outstanding work on the ${challengeName}, ${studentName}! Your dedication really shows. Keep pushing forward!`,
    `${studentName}, great effort on the ${challengeName} challenge! Your commitment to martial arts is inspiring!`,
    `Impressive submission, ${studentName}! The ${challengeName} is tough and you're showing real progress!`,
  ];
  return res.json({ feedback: fallbacks[Math.floor(Math.random() * fallbacks.length)] });
}

// Arena Challenge Submit (Trust/Video)
const TRUST_PER_CHALLENGE_LIMIT = 1; // STRICT: 1 time per challenge per day
const VIDEO_XP_MULTIPLIER = 2;

// Challenge metadata mapping (since challenges are hardcoded in frontend)
const CHALLENGE_METADATA: Record<string, { name: string; icon: string; category: string }> = {
  'pushup_master': { name: 'Push-up Master', icon: '💪', category: 'Power' },
  'squat_challenge': { name: 'Squat Challenge', icon: '💪', category: 'Power' },
  'burpee_blast': { name: 'Burpee Blast', icon: '💪', category: 'Power' },
  'abs_of_steel': { name: 'Abs of Steel', icon: '💪', category: 'Power' },
  '100_kicks': { name: '100 Kicks Marathon', icon: '🎯', category: 'Technique' },
  'speed_punches': { name: 'Speed Punches', icon: '🎯', category: 'Technique' },
  'horse_stance': { name: 'Iron Horse Stance', icon: '🎯', category: 'Technique' },
  'jump_rope': { name: 'Jump Rope Ninja', icon: '🎯', category: 'Technique' },
  'plank_hold': { name: 'Plank Hold', icon: '🧘', category: 'Flexibility' },
  'touch_toes': { name: 'Touch Your Toes', icon: '🧘', category: 'Flexibility' },
  'wall_sit': { name: 'The Wall Sit', icon: '🧘', category: 'Flexibility' },
  'one_leg_balance': { name: 'One-Leg Balance', icon: '🧘', category: 'Flexibility' },
  'family_form_practice': { name: 'Family Form Practice', icon: '👨‍👧', category: 'Family' },
  'family_stretch': { name: 'Family Stretch', icon: '👨‍👧', category: 'Family' },
  'family_kicks': { name: 'Family Kicks', icon: '👨‍👧', category: 'Family' },
};

// GET /api/challenges/received/:studentId - Fetch challenges received by student
async function handleReceivedChallenges(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!studentId || !uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // Query challenge_inbox table for incomplete challenges
    const result = await client.query(
      `SELECT * FROM challenge_inbox WHERE student_id = $1::uuid AND is_completed = false ORDER BY created_at DESC`,
      [studentId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Challenges] Fetch received error:', error.message, error.stack);
    // Return empty array instead of 500 if table doesn't exist
    return res.json([]);
  } finally {
    client.release();
  }
}

// GET /api/challenges/sent/:studentId - Fetch challenges sent by student
async function handleSentChallenges(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!studentId || !uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM challenges WHERE from_student_id = $1::uuid ORDER BY created_at DESC`,
      [studentId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[Challenges] Fetch sent error:', error.message);
    // Gracefully return empty array if table doesn't exist or any DB error
    return res.json([]);
  } finally {
    client.release();
  }
}

// GET /api/challenges/history - Fetch XP history from Coach Picks and Daily Training
async function handleChallengeHistory(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // Fetch Coach Pick submissions (from challenge_videos table)
    // Exclude 'Daily Training' category as those are Gauntlet submissions (already in gauntlet_submissions)
    const coachPicksResult = await client.query(
      `SELECT 
        id,
        challenge_id,
        challenge_name,
        challenge_category,
        status,
        xp_awarded,
        score,
        video_url,
        created_at
      FROM challenge_videos 
      WHERE student_id = $1::uuid
        AND (challenge_category IS NULL OR challenge_category != 'Daily Training')
      ORDER BY created_at DESC
      LIMIT 30`,
      [studentId]
    );

    // Fetch Daily Training submissions (from gauntlet_submissions table)
    // Join with challenge_videos to get actual verification status for video submissions
    const gauntletResult = await client.query(
      `SELECT 
        gs.id,
        gs.challenge_id,
        gc.name as challenge_name,
        gc.day_theme as challenge_category,
        gs.proof_type,
        gs.local_xp_awarded as xp_awarded,
        gs.global_points_awarded as global_xp_awarded,
        gs.score,
        gs.is_personal_best,
        gs.submitted_at as created_at,
        cv.status as video_status
      FROM gauntlet_submissions gs
      LEFT JOIN gauntlet_challenges gc ON gs.challenge_id = gc.id
      LEFT JOIN challenge_videos cv ON cv.challenge_id = gs.challenge_id::text 
        AND cv.student_id = gs.student_id 
        AND cv.challenge_category = 'Daily Training'
      WHERE gs.student_id = $1::uuid
      ORDER BY gs.submitted_at DESC
      LIMIT 30`,
      [studentId]
    );

    // Fetch Daily Mystery Challenge submissions (from challenge_submissions table)
    // ONLY include submissions that have a matching daily_challenges record
    const mysteryResult = await client.query(
      `SELECT 
        cs.id,
        cs.challenge_id,
        dc.title as challenge_name,
        cs.is_correct,
        cs.xp_awarded,
        cs.completed_at as created_at
      FROM challenge_submissions cs
      INNER JOIN daily_challenges dc ON cs.challenge_id = dc.id
      WHERE cs.student_id = $1::uuid
      ORDER BY cs.completed_at DESC
      LIMIT 20`,
      [studentId]
    );
    
    // Fetch Arena Coach Pick TRUST submissions (from challenge_submissions table)
    // These are TRUST submissions that are NOT daily mystery challenges
    const arenaTrustResult = await client.query(
      `SELECT 
        cs.id,
        cs.challenge_id,
        cs.answer as challenge_name,
        cs.xp_awarded,
        cs.global_rank_points,
        cs.proof_type,
        cs.completed_at as created_at
      FROM challenge_submissions cs
      LEFT JOIN daily_challenges dc ON cs.challenge_id = dc.id
      WHERE cs.student_id = $1::uuid
        AND dc.id IS NULL
        AND cs.proof_type = 'TRUST'
      ORDER BY cs.completed_at DESC
      LIMIT 30`,
      [studentId]
    );

    // Fetch Family Challenge submissions (from family_logs table)
    // Use text comparison to handle both UUID and legacy string IDs
    // Wrapped in try-catch to prevent breaking history if family tables don't exist
    let familyResult = { rows: [] as any[] };
    try {
      familyResult = await client.query(
        `SELECT 
          fl.id,
          fl.challenge_id,
          fc.name as challenge_name,
          fc.icon as challenge_icon,
          fc.category as challenge_category,
          fl.xp_awarded,
          fl.completed_at as created_at
        FROM family_logs fl
        LEFT JOIN family_challenges fc ON fl.challenge_id = fc.id::text
        WHERE fl.student_id = $1::uuid
        ORDER BY fl.completed_at DESC
        LIMIT 20`,
        [studentId]
      );
    } catch (famErr: any) {
      console.log('[ChallengeHistory] Family query skipped:', famErr.message);
    }

    // Map Coach Picks to history format
    const coachPickHistory = coachPicksResult.rows.map(row => {
      const statusMap: Record<string, string> = {
        'pending': 'PENDING',
        'approved': 'VERIFIED',
        'rejected': 'REJECTED'
      };
      
      return {
        id: row.id,
        source: 'coach_pick',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Coach Pick Challenge',
        icon: '⭐',
        category: row.challenge_category || 'Coach Picks',
        status: statusMap[row.status] || 'PENDING',
        proofType: 'VIDEO',
        xpAwarded: row.xp_awarded || 0,
        score: row.score || 0,
        videoUrl: row.video_url,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Daily Training to history format
    const gauntletHistory = gauntletResult.rows.map(row => {
      const categoryIcons: Record<string, string> = {
        'Engine': '🔥',
        'Foundation': '🏋️',
        'Evasion': '💨',
        'Explosion': '💥',
        'Animal': '🐯',
        'Defense': '🛡️',
        'Flow': '🌊'
      };
      
      // Determine status: TRUST submissions are always COMPLETED, VIDEO depends on verification
      let status = 'COMPLETED';
      if (row.proof_type === 'VIDEO') {
        if (row.video_status === 'approved') {
          status = 'VERIFIED';
        } else if (row.video_status === 'rejected') {
          status = 'REJECTED';
        } else {
          status = 'PENDING';
        }
      }
      
      // XP shown: For pending videos, show 0 (not yet awarded)
      const xpAwarded = (row.proof_type === 'VIDEO' && status === 'PENDING') ? 0 : (row.xp_awarded || 0);
      const globalXp = (row.proof_type === 'VIDEO' && status === 'PENDING') ? 0 : (row.global_xp_awarded || 0);
      
      return {
        id: row.id,
        source: 'daily_training',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Daily Training',
        icon: categoryIcons[row.challenge_category] || '🥋',
        category: row.challenge_category || 'Daily Training',
        status,
        proofType: row.proof_type || 'TRUST',
        xpAwarded,
        pendingXp: (row.proof_type === 'VIDEO' && status === 'PENDING') ? (row.xp_awarded || 0) : 0,
        globalXp,
        pendingGlobalXp: (row.proof_type === 'VIDEO' && status === 'PENDING') ? (row.global_xp_awarded || 0) : 0,
        score: row.score || 0,
        isPersonalBest: row.is_personal_best || false,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Daily Mystery Challenge to history format
    const mysteryHistory = mysteryResult.rows.map(row => {
      return {
        id: row.id,
        source: 'mystery',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Daily Mystery',
        icon: '🎯',
        category: 'Mystery',
        status: row.is_correct ? 'CORRECT' : 'WRONG',
        proofType: 'QUIZ',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.is_correct ? 3 : 1,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Map Family Challenge to history format
    const familyHistory = familyResult.rows.map(row => {
      return {
        id: row.id,
        source: 'family',
        challengeId: row.challenge_id,
        challengeName: row.challenge_name || 'Family Challenge',
        icon: row.challenge_icon || '👨‍👧',
        category: row.challenge_category || 'Family',
        status: 'COMPLETED',
        proofType: 'TRUST',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.xp_awarded >= 15 ? 2 : 1, // Win = 2 Global, Lose = 1 Global
        mode: 'FAMILY',
        completedAt: row.created_at
      };
    });
    
    // Map Arena TRUST submissions to history format (Coach Pick challenges done without video)
    const arenaTrustHistory = arenaTrustResult.rows.map(row => {
      // Use simple "Coach Pick" as the display name
      return {
        id: row.id,
        source: 'coach_pick',
        challengeId: row.challenge_id,
        challengeName: 'Coach Pick',
        icon: '⭐',
        category: 'Coach Picks',
        status: 'COMPLETED',
        proofType: 'TRUST',
        xpAwarded: row.xp_awarded || 0,
        globalXp: row.global_rank_points || 0,
        mode: 'SOLO',
        completedAt: row.created_at
      };
    });

    // Combine and sort by date (newest first)
    const allHistory = [...coachPickHistory, ...gauntletHistory, ...mysteryHistory, ...familyHistory, ...arenaTrustHistory]
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 50);

    return res.json({ history: allHistory });
  } catch (error: any) {
    console.error('[ChallengeHistory] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
  } finally {
    client.release();
  }
}

// =====================================================
// COACH VERIFICATION QUEUE
// =====================================================

// GET /api/challenges/pending-verification/:clubId
async function handlePendingVerification(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cs.*, 
              s.name as student_name, s.belt as student_belt
       FROM challenge_submissions cs
       JOIN students s ON cs.student_id = s.id
       WHERE cs.club_id = $1::uuid 
       AND cs.proof_type = 'VIDEO'
       AND cs.status = 'PENDING'
       ORDER BY cs.completed_at ASC`,
      [clubId]
    );

    // Convert video URLs to proxy URLs
    const pendingWithProxyUrls = result.rows.map((row: any) => {
      let videoKey = row.video_key;
      // Extract key from URL if video_key is empty but video_url exists
      if (!videoKey && row.video_url && row.video_url.includes('idrivee2.com/')) {
        videoKey = row.video_url.split('idrivee2.com/')[1];
      }
      return {
        ...row,
        video_url: videoKey 
          ? `/api/videos/stream/${encodeURIComponent(videoKey)}`
          : row.video_url
      };
    });

    return res.json(pendingWithProxyUrls);
  } catch (error: any) {
    console.error('[Arena] Pending verification error:', error.message);
    return res.status(500).json({ error: 'Failed to get pending verifications' });
  } finally {
    client.release();
  }
}

// POST /api/challenges/verify
async function handleChallengeVerify(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { submissionId, verified, coachId } = parseBody(req);
  
  if (!submissionId || verified === undefined) {
    return res.status(400).json({ error: 'submissionId and verified are required' });
  }

  const client = await pool.connect();
  try {
    // Get submission
    const subResult = await client.query(
      `SELECT * FROM challenge_submissions WHERE id = $1::uuid`,
      [submissionId]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = subResult.rows[0];

    if (submission.status !== 'PENDING') {
      return res.status(400).json({ error: 'Submission is not pending verification' });
    }

    if (verified) {
      // Approve - award the XP that was stored in the submission when created
      const xpToAward = parseInt(submission.xp_awarded) || 30;
      const globalRankPoints = parseInt(submission.global_rank_points) || 3;
      
      await client.query(
        `UPDATE challenge_submissions SET status = 'VERIFIED' WHERE id = $1::uuid`,
        [submissionId]
      );
      
      // Award XP to student
      await client.query(
        `UPDATE students 
         SET total_xp = COALESCE(total_xp, 0) + $1::integer,
             global_xp = COALESCE(global_xp, 0) + $2::integer,
             updated_at = NOW()
         WHERE id = $3::uuid`,
        [xpToAward, globalRankPoints, submission.student_id]
      );

      console.log(`[Arena] Video verified for ${submission.student_id}: +${xpToAward} XP, +${globalRankPoints} Global Rank Points`);

      return res.json({
        success: true,
        status: 'VERIFIED',
        xpAwarded: xpToAward,
        globalRankPoints,
        message: `Video verified! +${xpToAward} XP and +${globalRankPoints} World Rank points awarded.`
      });
    } else {
      // Reject
      await client.query(
        `UPDATE challenge_submissions SET status = 'REJECTED' WHERE id = $1::uuid`,
        [submissionId]
      );

      console.log(`[Arena] Video rejected for ${submission.student_id}`);

      return res.json({
        success: true,
        status: 'REJECTED',
        message: 'Submission rejected.'
      });
    }
  } catch (error: any) {
    console.error('[Arena] Verify error:', error.message);
    return res.status(500).json({ error: 'Failed to verify submission' });
  } finally {
    client.release();
  }
}

// =====================================================
// HOME DOJO - HABIT TRACKING (Simplified)
// XP System: 3 XP per habit for all users
// Free: 3 habits/day = 9 XP cap, Premium: 7 habits/day = 21 XP cap
// =====================================================
const HOME_DOJO_BASE_XP = 3;
const HOME_DOJO_FREE_CAP = 9;    // 3 habits × 3 XP
const HOME_DOJO_PREMIUM_CAP = 21; // 7 habits × 3 XP

async function hasHomeDojoPremium(client: any, studentId: string): Promise<boolean> {
  try {
    // Check premium sources: student.premium_status or club.parent_premium_enabled
    const result = await client.query(
      `SELECT s.premium_status, c.parent_premium_enabled
       FROM students s 
       LEFT JOIN clubs c ON s.club_id = c.id 
       WHERE s.id = $1::uuid`,
      [studentId]
    );
    const student = result.rows[0];
    if (!student) return false;
    
    // Check all premium sources
    const hasPremiumStatus = student.premium_status === 'club_sponsored' || student.premium_status === 'parent_paid';
    const hasClubPremium = student.parent_premium_enabled === true;
    
    const isPremium = hasPremiumStatus || hasClubPremium;
    console.log(`[HomeDojo] Premium check for ${studentId}: status=${student.premium_status}, clubPremium=${hasClubPremium} => ${isPremium}`);
    
    return isPremium;
  } catch (e) {
    console.error('[HomeDojo] Premium check error:', (e as any).message);
    return false;
  }
}

// Upgrade student to premium (persist to database)
async function handleUpgradePremium(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = parseBody(req);

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE students SET premium_status = 'parent_paid', premium_started_at = NOW() WHERE id = $1::uuid`,
      [studentId]
    );
    console.log(`[Premium] Student ${studentId} upgraded to premium`);
    return res.json({ success: true, message: 'Upgraded to premium' });
  } catch (error: any) {
    console.error('[Premium] Upgrade error:', error.message);
    return res.status(500).json({ error: 'Failed to upgrade' });
  } finally {
    client.release();
  }
}

async function handleHabitCheck(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, habitName, isPremiumOverride } = parseBody(req);

  if (!studentId || !habitName) {
    return res.status(400).json({ error: 'studentId and habitName are required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trimmedStudentId = studentId.trim();
  if (!uuidRegex.test(trimmedStudentId)) {
    return res.status(400).json({ error: 'Invalid student ID format' });
  }

  const client = await pool.connect();
  try {
    // Ensure habit_logs table exists (auto-create if missing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS habit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        habit_name VARCHAR(255) NOT NULL,
        xp_awarded INTEGER DEFAULT 3,
        log_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const today = new Date().toISOString().split('T')[0];
    
    const studentCheck = await client.query(`SELECT id FROM students WHERE id = $1::uuid`, [trimmedStudentId]);
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check premium BEFORE transaction - use frontend override if provided
    const dbPremium = await hasHomeDojoPremium(client, trimmedStudentId);
    const isPremium = isPremiumOverride === true || dbPremium;
    console.log(`[HomeDojo] Premium: dbPremium=${dbPremium}, override=${isPremiumOverride}, final=${isPremium}`);
    
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM habit_logs WHERE student_id = $1::uuid AND habit_name = $2 AND log_date = $3::date`,
      [trimmedStudentId, habitName, today]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already completed', alreadyCompleted: true });
    }
    const habitXp = HOME_DOJO_BASE_XP; // 3 XP for all users
    const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;
    console.log(`[HomeDojo] Using cap: ${dailyCap} (isPremium=${isPremium})`);

    const dailyXpResult = await client.query(
      `SELECT COALESCE(SUM(xp_awarded), 0) as total_xp_today FROM habit_logs 
       WHERE student_id = $1::uuid AND log_date = $2::date`,
      [trimmedStudentId, today]
    );
    const totalXpToday = parseInt(dailyXpResult.rows[0]?.total_xp_today || '0');
    const atDailyLimit = totalXpToday >= dailyCap;
    const xpToAward = atDailyLimit ? 0 : habitXp;

    await client.query(
      `INSERT INTO habit_logs (student_id, habit_name, xp_awarded, log_date) VALUES ($1::uuid, $2, $3, $4::date)`,
      [trimmedStudentId, habitName, xpToAward, today]
    );

    if (xpToAward > 0) {
      await applyXpDelta(client, trimmedStudentId, xpToAward, 'habit');
    }

    await client.query('COMMIT');

    const currentStreak = await calculateStreak(client, trimmedStudentId);
    const currentXpResult = await client.query(`SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`, [trimmedStudentId]);
    const newTotalXp = currentXpResult.rows[0]?.xp || 0;

    return res.json({
      success: true,
      xpAwarded: xpToAward,
      habitXp: xpToAward,
      newTotalXp,
      dailyXpEarned: totalXpToday + xpToAward,
      dailyXpCap: dailyCap,
      atDailyLimit: (totalXpToday + xpToAward) >= dailyCap,
      isPremium,
      streak: currentStreak,
      message: atDailyLimit ? 'Habit done! Daily limit reached.' : `+${xpToAward} XP`
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[HomeDojo] Error:', error.message, 'Stack:', error.stack);
    return res.status(500).json({ error: 'Failed to log habit', details: error.message });
  } finally {
    client.release();
  }
}

// Self-healing XP Sync - recalculates total_xp from all log tables
async function handleXpSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = parseBody(req);

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // SIMPLE: Just return current total_xp (single source of truth)
    const result = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const totalXp = result.rows[0]?.total_xp || 0;
    return res.json({ success: true, totalXp, synced: true });
  } catch (error: any) {
    console.error('[XP Sync] Error:', error.message);
    return res.status(500).json({ error: 'Failed to sync XP' });
  } finally {
    client.release();
  }
}

// Calculate streak from habit_logs - consecutive days with at least 1 habit completed
async function calculateStreak(client: any, studentId: string): Promise<number> {
  try {
    // Get all distinct dates where student completed at least 1 habit, sorted DESC
    const result = await client.query(
      `SELECT DISTINCT log_date FROM habit_logs WHERE student_id = $1::uuid ORDER BY log_date DESC`,
      [studentId]
    );

    if (result.rows.length === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dates = result.rows.map((r: any) => {
      const d = new Date(r.log_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });

    // Check if streak is active (today or yesterday has activity)
    const todayTime = today.getTime();
    const yesterdayTime = yesterday.getTime();
    
    if (!dates.includes(todayTime) && !dates.includes(yesterdayTime)) {
      return 0; // Streak broken - no activity today or yesterday
    }

    // Count consecutive days backwards from the most recent activity
    let streak = 0;
    let checkDate = dates.includes(todayTime) ? today : yesterday;
    
    for (let i = 0; i < dates.length && i < 365; i++) {
      const expectedTime = checkDate.getTime();
      if (dates.includes(expectedTime)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break; // Gap found, streak ends
      }
    }

    return streak;
  } catch (error) {
    console.error('[Streak] Calculation error:', error);
    return 0;
  }
}

async function handleHabitStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];

    const studentResult = await client.query(
      `SELECT COALESCE(total_xp, 0) as xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    
    if (studentResult.rows.length === 0) {
      return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: HOME_DOJO_FREE_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
    }
    
    const storedXp = studentResult.rows[0]?.xp || 0;

    // Calculate all-time XP from transactions (same as leaderboard - source of truth)
    const allTimeResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as all_time_xp FROM xp_transactions WHERE student_id = $1::uuid AND type = 'EARN'`,
      [studentId]
    );
    const calculatedXp = parseInt(allTimeResult.rows[0]?.all_time_xp) || 0;
    
    // Calculate monthly XP for consistency check
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as monthly_xp FROM xp_transactions WHERE student_id = $1::uuid AND type = 'EARN' AND created_at >= $2::timestamp`,
      [studentId, monthStart.toISOString()]
    );
    const monthlyXp = parseInt(monthlyResult.rows[0]?.monthly_xp) || 0;
    
    // Use the highest of stored, calculated, or monthly (matches leaderboard logic exactly)
    const totalXp = Math.max(storedXp, calculatedXp, monthlyXp);

    const result = await client.query(
      `SELECT habit_name, xp_awarded FROM habit_logs WHERE student_id = $1::uuid AND log_date = $2::date`,
      [studentId, today]
    );

    const completedHabits = result.rows.map(r => r.habit_name);
    const totalXpToday = result.rows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);
    const streak = await calculateStreak(client, studentId);
    
    const isPremium = await hasHomeDojoPremium(client, studentId);
    const dailyCap = isPremium ? HOME_DOJO_PREMIUM_CAP : HOME_DOJO_FREE_CAP;

    return res.json({ completedHabits, totalXpToday, dailyXpCap: dailyCap, totalXp, lifetimeXp: totalXp, streak, isPremium });
  } catch (error: any) {
    console.error('[HomeDojo] Status fetch error:', error.message);
    return res.json({ completedHabits: [], totalXpToday: 0, dailyXpCap: HOME_DOJO_FREE_CAP, totalXp: 0, lifetimeXp: 0, streak: 0 });
  } finally {
    client.release();
  }
}

async function handleGetCustomHabits(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, title, icon, is_active FROM user_custom_habits WHERE student_id = $1::uuid AND is_active = true ORDER BY created_at ASC`,
      [studentId]
    );

    return res.json({ customHabits: result.rows });
  } catch (error: any) {
    console.error('[HomeDojo] Get custom habits error:', error.message);
    // Gracefully return empty array if table doesn't exist or any DB error
    return res.json({ customHabits: [] });
  } finally {
    client.release();
  }
}

async function handleCreateCustomHabit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, title, icon } = parseBody(req);

  if (!studentId || !title) {
    return res.status(400).json({ error: 'studentId and title are required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // Ensure table exists (auto-create if missing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_custom_habits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        icon VARCHAR(10) DEFAULT '✨',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const result = await client.query(
      `INSERT INTO user_custom_habits (student_id, title, icon) VALUES ($1::uuid, $2, $3) RETURNING id, title, icon, is_active`,
      [studentId, title.slice(0, 100), icon || '✨']
    );

    console.log(`[HomeDojo] Created custom habit: "${title}" for student ${studentId}`);
    return res.json({ success: true, habit: result.rows[0] });
  } catch (error: any) {
    console.error('[HomeDojo] Create custom habit error:', error.message);
    return res.status(500).json({ error: 'Failed to create habit' });
  } finally {
    client.release();
  }
}

async function handleDeleteCustomHabit(req: VercelRequest, res: VercelResponse, habitId: string) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(habitId)) {
    return res.status(400).json({ error: 'Invalid habitId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE user_custom_habits SET is_active = false WHERE id = $1::uuid`,
      [habitId]
    );

    console.log(`[HomeDojo] Deleted custom habit: ${habitId}`);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[HomeDojo] Delete custom habit error:', error.message);
    return res.status(500).json({ error: 'Failed to delete habit' });
  } finally {
    client.release();
  }
}

// =====================================================
// FAMILY CHALLENGES - Trust System (Parent Verified)
// =====================================================

// Get active family challenges from database (for Parent Portal)
async function handleGetFamilyChallenges(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM family_challenges 
      WHERE is_active = true 
      ORDER BY display_order ASC, created_at ASC
    `);
    return res.json(result.rows);
  } catch (error: any) {
    console.error('[FamilyChallenges] GET error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch family challenges' });
  } finally {
    client.release();
  }
}

// Server-side family challenge definitions (canonical XP values)
// Family Challenges - Flat XP: 15 Local/2 Global (win), 5 Local/1 Global (lose)
// Focus on consistency ("world champion of yourself") not tiered rewards
const FAMILY_CHALLENGE_XP = { winLocal: 15, winGlobal: 2, loseLocal: 5, loseGlobal: 1 };
const FAMILY_DAILY_LIMIT = 3; // Max 3 family challenges per day

const FAMILY_CHALLENGES: Record<string, { name: string }> = {
  // Strength Battles
  'family_earthquake': { name: 'The Earthquake Plank' },
  'family_tunnel': { name: 'The Tunnel Bear' },
  'family_pillow': { name: 'The Pillow Samurai' },
  // Agility & Speed Battles
  'family_toetag': { name: 'Toe Tag' },
  'family_dragon': { name: 'The Dragon\'s Tail' },
  'family_kneeslap': { name: 'Knee-Slap Boxing' },
  'family_ruler': { name: 'The Ruler Ninja' },
  // Balance & Focus
  'family_sockwars': { name: 'Sock Wars' },
  'family_mirror': { name: 'The Mirror of Doom' },
  'family_tiger': { name: 'The Sleeping Tiger' }
};

async function handleFamilyChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, challengeId, won } = parseBody(req);

  if (!studentId || !challengeId) {
    return res.status(400).json({ error: 'studentId and challengeId are required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  // Flat XP: 15/5 Local, 2/1 Global (consistency-focused)
  const localXp = won ? FAMILY_CHALLENGE_XP.winLocal : FAMILY_CHALLENGE_XP.loseLocal;
  const globalXp = won ? FAMILY_CHALLENGE_XP.winGlobal : FAMILY_CHALLENGE_XP.loseGlobal;
  const today = new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // SERVER-SIDE XP CALCULATION - Validate challenge exists in database (supports both UUID and legacy IDs)
    const isUuid = uuidRegex.test(challengeId);
    let challengeValid = false;
    
    if (isUuid) {
      const challengeCheck = await client.query(
        `SELECT id, name FROM family_challenges WHERE id = $1::uuid AND is_active = true`,
        [challengeId]
      );
      challengeValid = challengeCheck.rows.length > 0;
    }
    
    if (!challengeValid) {
      // Fallback to legacy static challenges for backward compatibility
      const legacyChallenge = FAMILY_CHALLENGES[challengeId];
      if (!legacyChallenge) {
        return res.status(400).json({ error: 'Invalid challengeId' });
      }
    }
    // Check daily limit (3 family challenges per day total)
    const dailyCount = await client.query(
      `SELECT COUNT(*) as count FROM family_logs WHERE student_id = $1::uuid AND completed_at = $2::date`,
      [studentId, today]
    );
    
    if (parseInt(dailyCount.rows[0].count) >= FAMILY_DAILY_LIMIT) {
      return res.status(200).json({
        success: false,
        dailyLimitReached: true,
        message: `You've completed ${FAMILY_DAILY_LIMIT} family challenges today! Come back tomorrow.`
      });
    }

    // Check if already completed this specific challenge today
    const existing = await client.query(
      `SELECT id FROM family_logs WHERE student_id = $1::uuid AND challenge_id = $2 AND completed_at = $3::date`,
      [studentId, challengeId, today]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        message: 'You already completed this family challenge today!'
      });
    }

    // Insert into family_logs
    await client.query(
      `INSERT INTO family_logs (student_id, challenge_id, xp_awarded, completed_at) VALUES ($1::uuid, $2, $3, $4::date)`,
      [studentId, challengeId, localXp, today]
    );

    // Update student's Local XP using unified helper
    const newTotalXp = await applyXpDelta(client, studentId, localXp, 'family_challenge');
    
    // Update student's Global XP
    await client.query(
      `UPDATE students SET global_rank_points = COALESCE(global_rank_points, 0) + $1 WHERE id = $2::uuid`,
      [globalXp, studentId]
    );

    console.log(`[FamilyChallenge] "${challengeId}" completed: +${localXp} Local XP, +${globalXp} Global, won: ${won}`);

    return res.json({
      success: true,
      xpAwarded: localXp,
      globalXp,
      newTotalXp,
      won: won || false,
      message: `Family challenge completed! +${localXp} XP (+${globalXp} Global)`
    });
  } catch (error: any) {
    console.error('[FamilyChallenge] Submit error:', error.message);
    return res.status(500).json({ error: 'Failed to submit family challenge' });
  } finally {
    client.release();
  }
}

async function handleFamilyChallengeStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const today = new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    // Get all completed family challenges for today
    const result = await client.query(
      `SELECT challenge_id, xp_awarded FROM family_logs WHERE student_id = $1::uuid AND completed_at = $2::date`,
      [studentId, today]
    );

    const completedChallenges = result.rows.map(r => r.challenge_id);
    const totalXpToday = result.rows.reduce((sum, r) => sum + (r.xp_awarded || 0), 0);

    return res.json({
      completedChallenges,
      totalXpToday
    });
  } catch (error: any) {
    console.error('[FamilyChallenge] Status error:', error.message);
    return res.json({ completedChallenges: [], totalXpToday: 0 });
  } finally {
    client.release();
  }
}

async function handleLeaderboard(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const clubId = req.query.clubId as string;
  
  if (!clubId) {
    return res.status(400).json({ error: 'clubId is required' });
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(clubId)) {
    return res.status(400).json({ error: 'Invalid clubId format' });
  }

  const client = await pool.connect();
  try {
    // Get students with their stored total_xp and created_at
    const studentsResult = await client.query(`
      SELECT id, name, belt, stripes, COALESCE(total_xp, 0) as total_xp, created_at
      FROM students WHERE club_id = $1::uuid`,
      [clubId]
    );

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();

    // Calculate ALL-TIME XP from transactions (source of truth)
    const allTimeXpResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as all_time_xp
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'EARN'
      GROUP BY student_id
    `, [clubId]);

    // Monthly XP from xp_transactions
    const monthlyXpResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as monthly_xp
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'EARN' AND created_at >= $2::timestamp
      GROUP BY student_id
    `, [clubId, monthStartStr]);

    // Monthly PTS from xp_transactions (PTS_EARN type)
    const monthlyPtsResult = await client.query(`
      SELECT student_id, COALESCE(SUM(amount), 0) as monthly_pts
      FROM xp_transactions 
      WHERE student_id IN (SELECT id FROM students WHERE club_id = $1::uuid)
        AND type = 'PTS_EARN' AND created_at >= $2::timestamp
      GROUP BY student_id
    `, [clubId, monthStartStr]);

    const allTimeXpMap = new Map(allTimeXpResult.rows.map((r: any) => [r.student_id, parseInt(r.all_time_xp) || 0]));
    const monthlyXpMap = new Map(monthlyXpResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_xp) || 0]));
    const monthlyPtsMap = new Map(monthlyPtsResult.rows.map((r: any) => [r.student_id, parseInt(r.monthly_pts) || 0]));

    // Auto-sync: Update students.total_xp if it's lower than calculated from transactions
    const studentsToSync: Array<{id: string, calculatedXp: number}> = [];
    for (const s of studentsResult.rows) {
      const calculatedXp = allTimeXpMap.get(s.id) || 0;
      const storedXp = parseInt(s.total_xp) || 0;
      if (calculatedXp > storedXp) {
        studentsToSync.push({ id: s.id, calculatedXp });
      }
    }
    
    // Batch update any out-of-sync students
    if (studentsToSync.length > 0) {
      for (const sync of studentsToSync) {
        await client.query(
          `UPDATE students SET total_xp = $1 WHERE id = $2::uuid`,
          [sync.calculatedXp, sync.id]
        );
      }
      console.log(`[Leaderboard] Auto-synced total_xp for ${studentsToSync.length} students`);
    }

    // Build leaderboard using the highest of stored, calculated, or monthly XP
    // This ensures we never show less than what's been earned
    const leaderboard = studentsResult.rows.map((s: any) => {
      const storedXp = parseInt(s.total_xp) || 0;
      const calculatedAllTime = allTimeXpMap.get(s.id) || 0;
      const monthlyXpFromTx = monthlyXpMap.get(s.id) || 0;
      
      // Use highest value to never undercount XP
      const trueAllTimeXp = Math.max(storedXp, calculatedAllTime, monthlyXpFromTx);
      
      // For monthly: if student was created this month and stored > transactions, use stored
      // This handles students who earned XP before transaction logging was complete
      const studentCreatedAt = s.created_at ? new Date(s.created_at) : null;
      const isCreatedThisMonth = studentCreatedAt && 
        studentCreatedAt.getFullYear() === monthStart.getFullYear() && 
        studentCreatedAt.getMonth() === monthStart.getMonth();
      
      // Monthly = max of transactions this month, or all their stored XP if created this month
      const trueMonthlyXp = isCreatedThisMonth 
        ? Math.max(monthlyXpFromTx, storedXp) 
        : monthlyXpFromTx;
      
      return {
        id: s.id,
        name: s.name,
        belt: s.belt,
        stripes: s.stripes || 0,
        totalXP: trueAllTimeXp,
        monthlyXP: trueMonthlyXp,
        monthlyPTS: monthlyPtsMap.get(s.id) || 0
      };
    })
    .sort((a: any, b: any) => b.totalXP - a.totalXP)
    .map((s: any, index: number) => ({ ...s, rank: index + 1 }));

    console.log('[Leaderboard] Fetched:', leaderboard.length, 'students');

    return res.json({ leaderboard });
  } catch (error: any) {
    console.error('[Leaderboard] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch leaderboard' });
  } finally {
    client.release();
  }
}

async function handleSyncRivals(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  const client = await pool.connect();
  try {
    // SIMPLE: Just return current total_xp (single source of truth)
    const result = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const totalXp = result.rows[0]?.total_xp || 0;
    return res.json({ success: true, totalXp, message: 'Rivals stats synced successfully' });
  } catch (error: any) {
    console.error('[SyncRivals] Error:', error.message);
    return res.status(500).json({ error: 'Failed to sync rivals stats' });
  } finally {
    client.release();
  }
}

async function handleChallengeSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, clubId, challengeType, score, proofType, videoUrl, challengeXp, challengeCategoryType, challengeDifficulty } = parseBody(req);

  if (!studentId || !challengeType) {
    return res.status(400).json({ error: 'studentId and challengeType are required' });
  }

  if (!proofType || !['TRUST', 'VIDEO'].includes(proofType)) {
    return res.status(400).json({ error: 'proofType must be TRUST or VIDEO' });
  }

  // STRICT MODE: Validate UUID - NO DEMO MODE
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid studentId - must be a valid UUID' });
  }

  // Calculate XP and Global Rank using secure server-side matrix
  const catType: ChallengeTypeKey = challengeCategoryType === 'coach_pick' ? 'coach_pick' : 'general';
  const difficulty: ChallengeTierKey = (['EASY', 'MEDIUM', 'HARD', 'EPIC'].includes(challengeDifficulty) ? challengeDifficulty : 'EASY') as ChallengeTierKey;
  const hasVideoProof = proofType === 'VIDEO';
  
  const finalXp = calculateLocalXp(catType, difficulty, hasVideoProof);
  const globalRankPoints = calculateArenaGlobalScore(catType, difficulty, hasVideoProof);

  if (proofType === 'TRUST') {
    const client = await pool.connect();
    try {
      // Check per-challenge daily limit (TRUST submissions)
      // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'TRUST' 
         AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
      );

      const count = parseInt(countResult.rows[0]?.count || '0');
      if (count >= TRUST_PER_CHALLENGE_LIMIT) {
        return res.status(429).json({
          error: 'Daily mission complete',
          message: 'Daily Mission Complete! You can earn XP for this challenge again tomorrow.',
          limitReached: true,
          alreadyCompleted: true
        });
      }
      
      // ALSO check if there's already a pending/approved VIDEO for this challenge (block double-dipping)
      const existingVideoResult = await client.query(
        `SELECT id, status FROM challenge_videos 
         WHERE student_id = $1::uuid AND challenge_id = $2
         AND status IN ('pending', 'approved')
         AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
      );
      
      if (existingVideoResult.rows.length > 0) {
        const videoStatus = existingVideoResult.rows[0].status;
        return res.status(429).json({
          error: 'Already submitted with video',
          message: videoStatus === 'approved' 
            ? 'You already completed this challenge with video proof today!' 
            : 'You have a video pending review for this challenge. Wait for coach approval!',
          alreadyCompleted: true
        });
      }

      // Get student's club
      const studentResult = await client.query(
        `SELECT id, club_id FROM students WHERE id = $1::uuid`,
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const validClubId = studentResult.rows[0].club_id;

      // Create submission with deterministic challenge_id and global rank metadata
      const challengeUUID = generateChallengeUUID(challengeType);
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, xp_awarded, global_rank_points, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SOLO', 'COMPLETED', 'TRUST', $6, $7, NOW())`,
        [challengeUUID, studentId, validClubId, challengeType, score || 0, finalXp, globalRankPoints]
      );

      // Award Local XP using unified helper
      await applyXpDelta(client, studentId, finalXp, 'arena_challenge');
      
      // Award Global Rank Points (for World Rankings)
      await client.query(
        `UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
        [globalRankPoints, studentId]
      );

      console.log(`[Arena] Trust submission for "${challengeType}" (${catType}/${difficulty}): +${finalXp} XP, +${globalRankPoints} Global Rank Points (${count + 1}/${TRUST_PER_CHALLENGE_LIMIT} today)`);

      return res.json({
        success: true,
        status: 'COMPLETED',
        xpAwarded: finalXp,
        earned_xp: finalXp,
        globalRankPoints,
        remainingForChallenge: TRUST_PER_CHALLENGE_LIMIT - count - 1,
        message: `Challenge completed! +${finalXp} XP earned. +${globalRankPoints} World Rank points!`
      });
    } finally {
      client.release();
    }
  }

  if (proofType === 'VIDEO') {
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required for video proof' });
    }

    const client = await pool.connect();
    try {
      // Check if already submitted video for this challenge today (prevent duplicates)
      // Use Postgres DATE_TRUNC in UTC to avoid timezone mismatch with JS Date
      const existingVideoResult = await client.query(
        `SELECT id FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'VIDEO'
         AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
      );
      
      if (existingVideoResult.rows.length > 0) {
        return res.status(429).json({
          error: 'Already submitted',
          message: 'You already submitted a video for this challenge today. Try again tomorrow!',
          alreadyCompleted: true
        });
      }
      
      // ALSO check if already submitted via TRUST for this challenge today (block double-dipping)
      const existingTrustResult = await client.query(
        `SELECT id FROM challenge_submissions 
         WHERE student_id = $1::uuid AND answer = $2 AND proof_type = 'TRUST'
         AND completed_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        [studentId, challengeType]
      );
      
      if (existingTrustResult.rows.length > 0) {
        return res.status(429).json({
          error: 'Already completed without video',
          message: 'You already completed this challenge today without video. Try a different challenge!',
          alreadyCompleted: true
        });
      }

      const studentResult = await client.query(
        `SELECT s.id, s.club_id, s.premium_status, c.parent_premium_enabled
         FROM students s LEFT JOIN clubs c ON s.club_id = c.id
         WHERE s.id = $1::uuid`,
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const student = studentResult.rows[0];
      const hasPremium = student.premium_status !== 'none' || student.parent_premium_enabled;

      if (!hasPremium) {
        return res.status(403).json({
          error: 'Premium required',
          message: 'Video proof requires premium. Upgrade to earn more XP!'
        });
      }

      const challengeUUID = generateChallengeUUID(challengeType);
      
      // Extract video key from URL for proxy streaming
      let videoKey = '';
      if (videoUrl && videoUrl.includes('idrivee2.com/')) {
        videoKey = videoUrl.split('idrivee2.com/')[1] || '';
      }
      
      await client.query(
        `INSERT INTO challenge_submissions (challenge_id, student_id, club_id, answer, score, mode, status, proof_type, video_url, xp_awarded, global_rank_points, completed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SOLO', 'PENDING', 'VIDEO', $6, $7, $8, NOW())`,
        [challengeUUID, studentId, student.club_id, challengeType, score || 0, videoUrl, finalXp, globalRankPoints]
      );
      
      // Also add to challenge_videos for coach review queue
      const friendlyName = challengeType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
      await client.query(
        `INSERT INTO challenge_videos 
         (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, score, status, xp_awarded, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Coach Pick', $5, $6, $7, 'pending', $8, NOW(), NOW())`,
        [studentId, student.club_id, challengeUUID, friendlyName, videoUrl, videoKey, score || 0, finalXp]
      );
      
      console.log(`[Arena] Coach Pick video submitted for "${challengeType}" (${catType}/${difficulty}) - pending: ${finalXp} XP, ${globalRankPoints} Global Rank`);

      return res.json({
        success: true,
        status: 'PENDING',
        xpAwarded: 0,
        pendingXp: finalXp,
        pendingGlobalRankPoints: globalRankPoints,
        earned_xp: 0,
        message: `Video submitted! You'll earn ${finalXp} XP and ${globalRankPoints} World Rank points when verified.`
      });
    } finally {
      client.release();
    }
  }

  return res.status(400).json({ error: 'Invalid proofType' });
}

// ============ VIRTUAL DOJO ENDPOINTS ============

const DOJO_SPIN_COST = 200;

const DOJO_WHEEL_ITEMS = [
  { name: 'Rice Ball', type: 'FOOD', rarity: 'COMMON', emoji: '🍙', evolutionPoints: 10, weight: 30 },
  { name: 'Sushi', type: 'FOOD', rarity: 'COMMON', emoji: '🍣', evolutionPoints: 15, weight: 25 },
  { name: 'Ramen', type: 'FOOD', rarity: 'RARE', emoji: '🍜', evolutionPoints: 25, weight: 15 },
  { name: 'Golden Apple', type: 'FOOD', rarity: 'EPIC', emoji: '🍎', evolutionPoints: 50, weight: 8 },
  { name: 'Dragon Fruit', type: 'FOOD', rarity: 'LEGENDARY', emoji: '🐉', evolutionPoints: 100, weight: 2 },
  { name: 'Bonsai Tree', type: 'DECORATION', rarity: 'COMMON', emoji: '🌳', evolutionPoints: 0, weight: 20 },
  { name: 'Lucky Cat', type: 'DECORATION', rarity: 'RARE', emoji: '🐱', evolutionPoints: 0, weight: 10 },
  { name: 'Golden Trophy', type: 'DECORATION', rarity: 'EPIC', emoji: '🏆', evolutionPoints: 0, weight: 5 },
  { name: 'Crystal Orb', type: 'DECORATION', rarity: 'LEGENDARY', emoji: '🔮', evolutionPoints: 0, weight: 2 },
];

const DOJO_EVOLUTION_STAGES = [
  { stage: 'egg', minPoints: 0 },
  { stage: 'baby', minPoints: 50 },
  { stage: 'teen', minPoints: 150 },
  { stage: 'adult', minPoints: 400 },
  { stage: 'master', minPoints: 1000 },
];

async function calculateDojoXp(client: any, studentId: string): Promise<number> {
  // Use students.total_xp as the single source of truth
  const result = await client.query(
    `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
    [studentId]
  );
  return parseInt(result.rows[0]?.total_xp || '0', 10);
}

function selectDojoWheelItem() {
  const totalWeight = DOJO_WHEEL_ITEMS.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of DOJO_WHEEL_ITEMS) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return DOJO_WHEEL_ITEMS[0];
}

async function handleDojoState(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const studentId = req.query.studentId as string;
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    const xpBalance = await calculateDojoXp(client, studentId);

    let inventory: any[] = [];
    try {
      const invResult = await client.query(
        `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
         FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
        [studentId]
      );
      inventory = invResult.rows.map((item: any) => ({
        id: item.id,
        itemName: item.item_name,
        itemType: item.item_type,
        itemRarity: item.item_rarity,
        itemEmoji: item.item_emoji,
        quantity: item.quantity,
        evolutionPoints: item.evolution_points,
      }));
    } catch (err) {
      inventory = [];
    }

    let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
    const monsterResult = await client.query(
      `SELECT dojo_monster FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    if (monsterResult.rows[0]?.dojo_monster) {
      monster = monsterResult.rows[0].dojo_monster;
    }

    return res.json({ xpBalance, inventory, monster });
  } finally {
    client.release();
  }
}

async function handleDojoSpin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = parseBody(req);
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    // Check current XP from students.total_xp (single source of truth)
    const xpResult = await client.query(
      `SELECT COALESCE(total_xp, 0) as total_xp FROM students WHERE id = $1::uuid`,
      [studentId]
    );
    const currentXp = parseInt(xpResult.rows[0]?.total_xp || '0', 10);
    
    if (currentXp < DOJO_SPIN_COST) {
      return res.status(400).json({ error: `Not enough XP! You have ${currentXp} XP but need ${DOJO_SPIN_COST} XP.` });
    }

    // Use unified helper to update BOTH students.total_xp AND log transaction
    await applyXpDelta(client, studentId, -DOJO_SPIN_COST, 'Lucky Wheel spin');

    const wonItem = selectDojoWheelItem();

    const existing = await client.query(
      `SELECT id, quantity FROM dojo_inventory 
       WHERE student_id = $1::uuid AND item_name = $2`,
      [studentId, wonItem.name]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE dojo_inventory SET quantity = quantity + 1 WHERE id = $1::uuid`,
        [existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO dojo_inventory (student_id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points)
         VALUES ($1::uuid, $2, $3, $4, $5, 1, $6)`,
        [studentId, wonItem.name, wonItem.type, wonItem.rarity, wonItem.emoji, wonItem.evolutionPoints]
      );
    }

    const newXpBalance = await calculateDojoXp(client, studentId);
    const invResult = await client.query(
      `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
       FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
      [studentId]
    );
    const inventory = invResult.rows.map((i: any) => ({
      id: i.id, itemName: i.item_name, itemType: i.item_type, itemRarity: i.item_rarity,
      itemEmoji: i.item_emoji, quantity: i.quantity, evolutionPoints: i.evolution_points,
    }));

    console.log(`[Dojo] Spin: ${studentId} won ${wonItem.emoji} ${wonItem.name} (${wonItem.rarity})`);

    return res.json({ item: wonItem, newXpBalance, inventory });
  } finally {
    client.release();
  }
}

async function handleDojoFeed(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, itemId } = parseBody(req);
  if (!studentId || !itemId) return res.status(400).json({ error: 'studentId and itemId are required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId) || !uuidRegex.test(itemId)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }

  const client = await pool.connect();
  try {
    const itemResult = await client.query(
      `SELECT id, item_type, evolution_points, quantity FROM dojo_inventory 
       WHERE id = $1::uuid AND student_id = $2::uuid`,
      [itemId, studentId]
    );

    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    const item = itemResult.rows[0];
    if (item.item_type !== 'FOOD') return res.status(400).json({ error: 'Only food items can be fed to the monster' });
    if (item.quantity < 1) return res.status(400).json({ error: 'No items left' });

    await client.query(`UPDATE dojo_inventory SET quantity = quantity - 1 WHERE id = $1::uuid`, [itemId]);

    const monsterResult = await client.query(
      `SELECT dojo_monster FROM students WHERE id = $1::uuid`,
      [studentId]
    );

    let monster = { stage: 'egg', evolutionPoints: 0, name: 'My Monster' };
    if (monsterResult.rows[0]?.dojo_monster) {
      monster = monsterResult.rows[0].dojo_monster;
    }

    monster.evolutionPoints += item.evolution_points;

    const sortedStages = [...DOJO_EVOLUTION_STAGES].reverse();
    const newStage = sortedStages.find(s => monster.evolutionPoints >= s.minPoints) || DOJO_EVOLUTION_STAGES[0];
    monster.stage = newStage.stage;

    await client.query(
      `UPDATE students SET dojo_monster = $1::jsonb WHERE id = $2::uuid`,
      [JSON.stringify(monster), studentId]
    );

    const invResult = await client.query(
      `SELECT id, item_name, item_type, item_rarity, item_emoji, quantity, evolution_points
       FROM dojo_inventory WHERE student_id = $1::uuid AND quantity > 0`,
      [studentId]
    );
    const inventory = invResult.rows.map((i: any) => ({
      id: i.id, itemName: i.item_name, itemType: i.item_type, itemRarity: i.item_rarity,
      itemEmoji: i.item_emoji, quantity: i.quantity, evolutionPoints: i.evolution_points,
    }));

    console.log(`[Dojo] Feed: ${studentId} fed monster +${item.evolution_points} EP, now at ${monster.evolutionPoints} EP (${monster.stage})`);

    return res.json({ monster, inventory });
  } finally {
    client.release();
  }
}

async function handleDojoDebugAddXP(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, amount = 1000 } = parseBody(req);
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(studentId)) return res.status(400).json({ error: 'Invalid studentId' });

  const client = await pool.connect();
  try {
    // Use unified helper to update BOTH students.total_xp AND log transaction
    const newTotal = await applyXpDelta(client, studentId, amount, 'DEBUG: Test XP added');

    console.log(`[Dojo DEBUG] Added ${amount} XP to student ${studentId}, new total_xp: ${newTotal}`);

    return res.json({ success: true, xpBalance: newTotal });
  } finally {
    client.release();
  }
}

// =====================================================
// WORLD RANKINGS - Global Leaderboard System
// =====================================================

async function handleWorldRankings(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const category = url.searchParams.get('category') || 'students';
  const sport = url.searchParams.get('sport');
  const country = url.searchParams.get('country');
  const limit = Number(url.searchParams.get('limit') || 100);
  const offset = Number(url.searchParams.get('offset') || 0);

  const client = await pool.connect();
  try {
    if (category === 'students') {
      // Ensure previous_rank and rank_snapshot_date columns exist
      try {
        await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_rank INTEGER DEFAULT NULL');
        await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS rank_snapshot_date DATE DEFAULT NULL');
      } catch (e) {
        // Columns likely already exist, ignore error
      }

      // IMPORTANT: Exclude demo students from real rankings
      let query = `
        SELECT 
          s.id,
          s.name,
          s.belt,
          COALESCE(s.global_xp, 0) as global_xp,
          s.previous_rank,
          s.rank_snapshot_date,
          c.name as club_name,
          c.art_type as sport,
          c.country,
          c.city
        FROM students s
        JOIN clubs c ON s.club_id = c.id
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
          AND COALESCE(s.global_xp, 0) > 0
          AND COALESCE(s.is_demo, false) = false
      `;
      const params: any[] = [];
      let paramCount = 0;

      if (sport && sport !== 'all') {
        paramCount++;
        query += ` AND c.art_type = $${paramCount}`;
        params.push(sport);
      }
      if (country && country !== 'all') {
        paramCount++;
        query += ` AND c.country = $${paramCount}`;
        params.push(country);
      }

      query += ` ORDER BY COALESCE(s.global_xp, 0) DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      const rankings = result.rows.map((r: any, index: number) => {
        const currentRank = offset + index + 1;
        const prevRank = r.previous_rank ? Number(r.previous_rank) : null;
        const rankChange = prevRank !== null ? prevRank - currentRank : null;
        return {
          rank: currentRank,
          id: r.id,
          name: r.name,
          belt: r.belt,
          globalXp: Number(r.global_xp) || 0,
          clubName: r.club_name,
          sport: r.sport,
          country: r.country,
          city: r.city,
          rankChange
        };
      });

      // Update previous_rank ONLY once per day (daily snapshot)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      for (const s of rankings) {
        // Only update if snapshot date is not today (first call of the day)
        await client.query(
          `UPDATE students 
           SET previous_rank = $1, rank_snapshot_date = $2::date
           WHERE id = $3 
           AND (rank_snapshot_date IS NULL OR rank_snapshot_date < $2::date)`,
          [s.rank, today, s.id]
        );
      }

      // REMOVED: Demo world rankings injection - now demo/real data are completely separate
      // Demo students are filtered out by the is_demo = false clause in the query

      return res.json({ category: 'students', rankings, total: rankings.length });
    } else if (category === 'clubs') {
      // Exclude demo students from club rankings calculation
      let query = `
        SELECT 
          c.id,
          c.name,
          c.art_type as sport,
          c.country,
          c.city,
          COUNT(s.id) as student_count,
          COALESCE(SUM(s.global_xp), 0) as total_global_xp,
          CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.global_xp), 0) / COUNT(s.id) ELSE 0 END as avg_global_xp
        FROM clubs c
        LEFT JOIN students s ON s.club_id = c.id AND COALESCE(s.is_demo, false) = false
        WHERE c.world_rankings_enabled = true
          AND c.status = 'active'
        GROUP BY c.id, c.name, c.art_type, c.country, c.city
        HAVING COUNT(s.id) > 0
      `;
      const params: any[] = [];

      if (sport && sport !== 'all') {
        params.push(sport);
        query = `SELECT * FROM (${query}) sub WHERE sport = $1`;
      }

      query = `SELECT * FROM (${query}) ranked ORDER BY avg_global_xp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      const rankings = result.rows.map((r: any, index: number) => ({
        rank: offset + index + 1,
        id: r.id,
        name: r.name,
        sport: r.sport,
        country: r.country,
        city: r.city,
        studentCount: Number(r.student_count),
        totalGlobalXp: Number(r.total_global_xp),
        avgGlobalXp: Math.round(Number(r.avg_global_xp)),
        globalScore: r.global_score || 0,
        rankChange: null // Will be calculated when we have historical data
      }));

      return res.json({ category: 'clubs', rankings, total: rankings.length });
    } else {
      return res.status(400).json({ error: 'Invalid category. Use "students" or "clubs"' });
    }
  } catch (error: any) {
    console.error('[World Rankings] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch world rankings' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsSports(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT art_type FROM clubs 
      WHERE art_type IS NOT NULL AND art_type != ''
      ORDER BY art_type
    `);
    
    const sports = result.rows.map((r: any) => r.art_type);
    return res.json({ sports });
  } catch (error: any) {
    console.error('[World Rankings] Sports error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch sports' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsCountries(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT country FROM clubs 
      WHERE country IS NOT NULL AND country != ''
      ORDER BY country
    `);
    
    const countries = result.rows.map((r: any) => r.country);
    return res.json({ countries });
  } catch (error: any) {
    console.error('[World Rankings] Countries error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch countries' });
  } finally {
    client.release();
  }
}

async function handleWorldRankingsStats(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    const clubsResult = await client.query(`
      SELECT COUNT(*) as count FROM clubs WHERE world_rankings_enabled = true AND status = 'active'
    `);
    
    // Exclude demo students from stats count
    const studentsResult = await client.query(`
      SELECT COUNT(*) as count FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE c.world_rankings_enabled = true AND c.status = 'active'
        AND COALESCE(s.is_demo, false) = false
    `);
    
    const sportsResult = await client.query(`
      SELECT COUNT(DISTINCT art_type) as count FROM clubs 
      WHERE world_rankings_enabled = true AND art_type IS NOT NULL
    `);

    const countriesResult = await client.query(`
      SELECT COUNT(DISTINCT country) as count FROM clubs 
      WHERE world_rankings_enabled = true AND country IS NOT NULL
    `);

    return res.json({
      participatingClubs: Number(clubsResult.rows[0]?.count || 0),
      totalStudents: Number(studentsResult.rows[0]?.count || 0),
      sportsRepresented: Number(sportsResult.rows[0]?.count || 0),
      countriesRepresented: Number(countriesResult.rows[0]?.count || 0)
    });
  } catch (error: any) {
    console.error('[World Rankings] Stats error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  } finally {
    client.release();
  }
}

async function handleClubWorldRankingsToggle(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { enabled } = parseBody(req);

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE clubs 
      SET world_rankings_enabled = $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, [enabled, clubId]);

    console.log(`[World Rankings] Club ${clubId} opt-${enabled ? 'in' : 'out'}`);
    return res.json({ success: true, enabled });
  } catch (error: any) {
    console.error('[World Rankings] Toggle error:', error.message);
    return res.status(500).json({ error: 'Failed to update world rankings setting' });
  } finally {
    client.release();
  }
}

async function handleStudentGlobalXp(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { scorePercentage } = parseBody(req);

  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required' });
  }

  // Validate Local XP (0-110 with MyTaek 110 Protocol)
  const rawScore = Number(scorePercentage);
  if (isNaN(rawScore)) {
    return res.status(400).json({ error: 'scorePercentage must be a valid number' });
  }
  const localXp = Math.max(0, Math.min(110, rawScore)); // Allow up to 110 (Legendary)

  // Calculate Global XP using the MyTaek 110 Protocol formula
  // Formula: min(round(20 + (localXp × 0.272)), 50)
  // This rewards Legendary students (110) with full 50 Global XP
  const attendanceXp = 20; // Fixed XP for showing up
  const performanceXp = localXp * 0.272; // 110 × 0.272 = 29.92, 100 × 0.272 = 27.2
  const sessionGlobalXp = Math.min(50, Math.round(attendanceXp + performanceXp)); // Round then cap at 50

  const client = await pool.connect();
  try {
    // Check if already graded today (daily cap)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const existingToday = await client.query(`
      SELECT COUNT(*) as count FROM xp_transactions 
      WHERE student_id = $1::uuid 
        AND reason = 'Global grading'
        AND created_at >= $2::timestamptz
    `, [studentId, todayStart.toISOString()]);
    
    const alreadyGraded = Number(existingToday.rows[0]?.count || 0) > 0;

    if (alreadyGraded) {
      return res.json({ 
        success: true, 
        globalXpAwarded: 0, 
        message: 'Daily global XP cap reached',
        alreadyGraded: true 
      });
    }

    // Award global XP
    await client.query(`
      UPDATE students 
      SET global_xp = COALESCE(global_xp, 0) + $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, [sessionGlobalXp, studentId]);

    // Ensure GLOBAL_EARN enum value exists
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'GLOBAL_EARN' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'xp_transaction_type')) THEN
            ALTER TYPE xp_transaction_type ADD VALUE 'GLOBAL_EARN';
          END IF;
        END
        $$;
      `);
    } catch (enumError: any) {
      console.log('[Global XP] GLOBAL_EARN enum check:', enumError.message);
    }

    // Log the global XP transaction (use different type so it doesn't count in local leaderboard)
    await client.query(`
      INSERT INTO xp_transactions (student_id, amount, type, reason, created_at)
      VALUES ($1::uuid, $2, 'GLOBAL_EARN', 'Global grading', NOW())
    `, [studentId, sessionGlobalXp]);

    console.log(`[Global XP] Student ${studentId}: +${sessionGlobalXp} (attendance: ${attendanceXp}, performance: ${performanceXp})`);

    return res.json({ 
      success: true, 
      globalXpAwarded: sessionGlobalXp,
      breakdown: { attendance: attendanceXp, performance: performanceXp }
    });
  } catch (error: any) {
    console.error('[Global XP] Error:', error.message);
    return res.status(500).json({ error: 'Failed to award global XP' });
  } finally {
    client.release();
  }
}

// =====================================================
// SEED GLOBAL XP FOR TESTING
// =====================================================

async function handleSeedClubGlobalXp(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    // Give each student in the club 30-50 random global XP
    const result = await client.query(`
      UPDATE students 
      SET global_xp = COALESCE(global_xp, 0) + (20 + floor(random() * 31)::int),
          updated_at = NOW()
      WHERE club_id = $1::uuid
      RETURNING id, name, global_xp
    `, [clubId]);

    console.log(`[Seed Global XP] Added global XP to ${result.rows.length} students in club ${clubId}`);

    return res.json({ 
      success: true, 
      message: `Added 20-50 global XP to ${result.rows.length} students`,
      students: result.rows.map((s: any) => ({ name: s.name, globalXp: s.global_xp }))
    });
  } catch (error: any) {
    console.error('[Seed Global XP] Error:', error.message);
    return res.status(500).json({ error: 'Failed to seed global XP' });
  } finally {
    client.release();
  }
}

// =====================================================
// STUDENT WORLD RANK - Get specific student's global rank
// =====================================================

async function handleStudentWorldRank(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await pool.connect();
  try {
    // Get student's global XP
    const studentResult = await client.query(`
      SELECT s.id, s.name, COALESCE(s.global_xp, 0) as global_xp, c.world_rankings_enabled
      FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE s.id = $1::uuid
    `, [studentId]);

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentData = studentResult.rows[0];
    const myGlobalXP = Number(studentData.global_xp || 0);
    const clubEnabled = studentData.world_rankings_enabled;

    // If student has no global XP or club not enabled, they're not ranked
    if (myGlobalXP === 0 || !clubEnabled) {
      return res.json({
        rank: null,
        totalStudents: 0,
        globalXP: myGlobalXP,
        message: myGlobalXP === 0 
          ? 'No global XP earned yet' 
          : 'Club has not opted into World Rankings'
      });
    }

    // Count how many students have MORE global XP (rank = count + 1)
    // IMPORTANT: Exclude demo students from rank calculation
    const rankResult = await client.query(`
      SELECT COUNT(*) as higher_count
      FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE c.world_rankings_enabled = true
        AND c.status = 'active'
        AND COALESCE(s.global_xp, 0) > $1
        AND COALESCE(s.is_demo, false) = false
    `, [myGlobalXP]);

    // Get total count of ranked students (excluding demo)
    const totalResult = await client.query(`
      SELECT COUNT(*) as total
      FROM students s
      JOIN clubs c ON s.club_id = c.id
      WHERE c.world_rankings_enabled = true
        AND c.status = 'active'
        AND COALESCE(s.global_xp, 0) > 0
        AND COALESCE(s.is_demo, false) = false
    `);

    const higherCount = Number(rankResult.rows[0]?.higher_count || 0);
    const totalStudents = Number(totalResult.rows[0]?.total || 0);
    const myRank = higherCount + 1; // Rank is number of students with more XP + 1

    return res.json({
      rank: myRank,
      totalStudents,
      globalXP: myGlobalXP,
      percentile: totalStudents > 0 ? Math.round((1 - (myRank / totalStudents)) * 100) : 0
    });
  } catch (error: any) {
    console.error('[Student World Rank] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch world rank' });
  } finally {
    client.release();
  }
}

// GET /api/students/:id/stats - Comprehensive stats for Insights tab
async function handleStudentStats(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!studentId || !uuidRegex.test(studentId)) {
    return res.status(400).json({ error: 'Invalid student ID format' });
  }

  const client = await pool.connect();
  try {
    // 1. Attendance history for heatmap (last 90 days)
    const attendanceResult = await client.query(`
      SELECT DATE(attended_at) as date, COUNT(*) as count
      FROM attendance_events 
      WHERE student_id = $1::uuid
        AND attended_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE(attended_at)
      ORDER BY date ASC
    `, [studentId]);

    // 2. XP history by day (last 30 days) from challenge submissions
    const xpHistoryResult = await client.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(COALESCE(xp_awarded, 0)) as xp
      FROM challenge_videos 
      WHERE student_id = $1::uuid
        AND status = 'approved'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [studentId]);

    // 3. Gauntlet XP history (Daily Training) - uses submitted_at and local_xp_awarded
    const gauntletXpResult = await client.query(`
      SELECT 
        DATE(submitted_at) as date,
        SUM(COALESCE(local_xp_awarded, 0)) as xp
      FROM gauntlet_submissions
      WHERE student_id = $1::uuid
        AND submitted_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(submitted_at)
      ORDER BY date ASC
    `, [studentId]);

    // 4. Challenge category breakdown for Character Development
    const categoryResult = await client.query(`
      SELECT 
        COALESCE(challenge_category, 'General') as category,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        SUM(COALESCE(xp_awarded, 0)) as xp_earned
      FROM challenge_videos
      WHERE student_id = $1::uuid
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY COALESCE(challenge_category, 'General')
    `, [studentId]);

    // 5. Video approval stats for Discipline metric
    const videoStatsResult = await client.query(`
      SELECT 
        COUNT(*) as total_videos,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_videos,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_videos
      FROM challenge_videos
      WHERE student_id = $1::uuid
        AND created_at >= NOW() - INTERVAL '90 days'
    `, [studentId]);

    // 6. Training consistency (submissions per week)
    const consistencyResult = await client.query(`
      SELECT 
        DATE_TRUNC('week', created_at) as week,
        COUNT(*) as submissions
      FROM challenge_videos
      WHERE student_id = $1::uuid
        AND created_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY DATE_TRUNC('week', created_at)
      ORDER BY week ASC
    `, [studentId]);

    // Merge XP histories (Coach Picks + Gauntlet)
    const xpByDate = new Map<string, number>();
    for (const row of xpHistoryResult.rows) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      xpByDate.set(dateStr, (xpByDate.get(dateStr) || 0) + parseInt(row.xp || '0'));
    }
    for (const row of gauntletXpResult.rows) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      xpByDate.set(dateStr, (xpByDate.get(dateStr) || 0) + parseInt(row.xp || '0'));
    }

    // Build XP trend array (last 14 days)
    const xpTrend = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      xpTrend.push({
        date: dateStr,
        xp: xpByDate.get(dateStr) || 0,
        dayName: dayNames[date.getDay()]
      });
    }

    // Parse attendance into date array
    const attendanceDates = attendanceResult.rows.map(row => 
      new Date(row.date).toISOString().split('T')[0]
    );

    // Calculate character development metrics from real data
    const videoStats = videoStatsResult.rows[0] || { total_videos: 0, approved_videos: 0, rejected_videos: 0 };
    const categories = categoryResult.rows;
    const weeklyActivity = consistencyResult.rows;

    // Derive meaningful metrics
    const totalSubmissions = parseInt(videoStats.total_videos || '0');
    const approvedSubmissions = parseInt(videoStats.approved_videos || '0');
    const approvalRate = totalSubmissions > 0 ? Math.round((approvedSubmissions / totalSubmissions) * 100) : 0;

    // Find tech vs fitness balance
    const techCategories = ['Technique', 'Power', 'Flexibility'];
    let techXp = 0, fitnessXp = 0;
    for (const cat of categories) {
      const xp = parseInt(cat.xp_earned || '0');
      if (techCategories.includes(cat.category)) {
        techXp += xp;
      } else {
        fitnessXp += xp;
      }
    }
    const totalCatXp = techXp + fitnessXp;
    const techFocus = totalCatXp > 0 ? Math.round((techXp / totalCatXp) * 100) : 50;

    // Weekly consistency score
    const weeksActive = weeklyActivity.filter(w => parseInt(w.submissions) > 0).length;
    const totalWeeks = Math.max(1, weeklyActivity.length || 1);
    const consistencyScore = Math.round((weeksActive / totalWeeks) * 100);

    // Character development derived metrics
    const characterDevelopment = {
      technique: {
        name: 'Technique Focus',
        score: techFocus,
        trend: techFocus >= 50 ? 'up' : 'steady',
        description: techFocus >= 60 ? 'Strong technical training' : techFocus >= 40 ? 'Balanced approach' : 'More fitness-focused'
      },
      discipline: {
        name: 'Discipline',
        score: approvalRate,
        trend: approvalRate >= 80 ? 'up' : approvalRate >= 50 ? 'steady' : 'down',
        description: approvalRate >= 80 ? 'Excellent quality submissions' : approvalRate >= 50 ? 'Good effort' : 'Room for improvement'
      },
      consistency: {
        name: 'Consistency',
        score: consistencyScore,
        trend: consistencyScore >= 75 ? 'up' : consistencyScore >= 50 ? 'steady' : 'down',
        description: consistencyScore >= 75 ? 'Training regularly' : consistencyScore >= 50 ? 'Fairly consistent' : 'Could train more often'
      }
    };

    return res.json({
      attendanceDates,
      xpTrend,
      characterDevelopment,
      categoryBreakdown: categories.map(c => ({
        category: c.category,
        submissions: parseInt(c.total || '0'),
        approved: parseInt(c.approved || '0'),
        xpEarned: parseInt(c.xp_earned || '0')
      })),
      totalSubmissions,
      approvalRate
    });
  } catch (error: any) {
    console.error('[Student Stats] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch student stats' });
  } finally {
    client.release();
  }
}

// =====================================================
// DEMO MODE - Sample Data Management
// =====================================================

function getUpcomingBirthday(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setFullYear(date.getFullYear() - 12);
  return date.toISOString().split('T')[0];
}

const DEMO_STUDENTS = [
  { name: 'Daniel LaRusso', belt: 'Green', parentName: 'Lucille LaRusso', premiumStatus: 'parent_paid', birthday: getUpcomingBirthday(3), isAtRisk: false, location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Johnny Lawrence', belt: 'Black', parentName: 'Laura Lawrence', premiumStatus: 'parent_paid', birthday: getUpcomingBirthday(14), isAtRisk: false, location: 'Main Location', assignedClass: 'Adult Class' },
  { name: 'Robby Keene', belt: 'Brown', parentName: 'Shannon Keene', premiumStatus: 'none', birthday: null, isAtRisk: true, location: 'Main Location', assignedClass: 'Sparring Team' },
  { name: 'Miguel Diaz', belt: 'Red', parentName: 'Carmen Diaz', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'Main Location', assignedClass: 'Adult Class' },
  { name: 'Samantha LaRusso', belt: 'Blue', parentName: 'Amanda LaRusso', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Hawk Moskowitz', belt: 'Red', parentName: 'Paula Moskowitz', premiumStatus: 'none', birthday: null, isAtRisk: true, location: 'Main Location', assignedClass: 'Sparring Team' },
  { name: 'Demetri Alexopoulos', belt: 'Green', parentName: 'Maria Alexopoulos', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'Downtown Studio', assignedClass: 'General Class' },
  { name: 'Tory Nichols', belt: 'Blue', parentName: 'Karen Nichols', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Chris Evans', belt: 'Yellow', parentName: 'Sarah Evans', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Aisha Robinson', belt: 'Orange', parentName: 'Diane Robinson', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Kenny Payne', belt: 'White', parentName: 'Shawn Payne', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'Main Location', assignedClass: 'Beginner Class' },
  { name: 'Devon Lee', belt: 'Yellow', parentName: 'Grace Lee', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'Downtown Studio', assignedClass: 'Kids Class' },
  { name: 'Moon Park', belt: 'Orange', parentName: 'Jin Park', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'West Side Dojo', assignedClass: 'General Class' },
  { name: 'Kyler Stevens', belt: 'White', parentName: 'Brad Stevens', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'Main Location', assignedClass: 'Beginner Class' },
  { name: 'Bert Miller', belt: 'Yellow', parentName: 'Tom Miller', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'Downtown Studio', assignedClass: 'General Class' },
  { name: 'Nate Johnson', belt: 'Green', parentName: 'Rick Johnson', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'West Side Dojo', assignedClass: 'Teen Class' },
  { name: 'Yasmine Chen', belt: 'Blue', parentName: 'Lin Chen', premiumStatus: 'none', birthday: null, isAtRisk: false, location: 'Main Location', assignedClass: 'Adult Class' },
  { name: 'Louie Kim', belt: 'Orange', parentName: 'David Kim', premiumStatus: 'parent_paid', birthday: null, isAtRisk: false, location: 'West Side Dojo', assignedClass: 'General Class' },
];

const DEMO_LOCATIONS = ['Main Location', 'Downtown Studio', 'West Side Dojo'];

const DEMO_LOCATION_CLASSES: Record<string, string[]> = {
  'Main Location': ['Adult Class', 'Beginner Class', 'Sparring Team'],
  'Downtown Studio': ['Kids Class', 'General Class'],
  'West Side Dojo': ['Teen Class', 'General Class'],
};

const CLASS_NAMES = ['General Class', 'Kids Class', 'Adult Class', 'Sparring Team', 'Teen Class', 'Beginner Class'];

const DEMO_SKILLS = [
  { id: 'discipline', name: 'Discipline', isActive: true },
  { id: 'technique', name: 'Technique', isActive: true },
  { id: 'focus', name: 'Focus', isActive: true },
  { id: 'power', name: 'Power', isActive: true },
];

const DEMO_COACHES = [
  { id: 'coach-1', name: 'Sensei John Kreese', email: 'kreese@demo.taekup.com', location: 'Main Location', assignedClasses: ['Sparring Team', 'Adult Class'] },
  { id: 'coach-2', name: 'Master Daniel LaRusso', email: 'daniel@demo.taekup.com', location: 'Main Location', assignedClasses: ['Kids Class', 'General Class'] },
];

const DEMO_BELTS = [
  { id: 'white', name: 'White', color1: '#FFFFFF' },
  { id: 'yellow', name: 'Yellow', color1: '#FFD700' },
  { id: 'orange', name: 'Orange', color1: '#FF8C00' },
  { id: 'green', name: 'Green', color1: '#228B22' },
  { id: 'blue', name: 'Blue', color1: '#0066CC' },
  { id: 'red', name: 'Red', color1: '#CC0000' },
  { id: 'brown', name: 'Brown', color1: '#8B4513' },
  { id: 'black', name: 'Black', color1: '#000000' },
];

const DEMO_SCHEDULE = [
  // Main Location
  { id: 's1', day: 'Monday', time: '17:00', duration: 60, className: 'Beginner Class', location: 'Main Location', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's2', day: 'Monday', time: '18:30', duration: 90, className: 'Adult Class', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's3', day: 'Wednesday', time: '17:00', duration: 60, className: 'Beginner Class', location: 'Main Location', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's4', day: 'Wednesday', time: '18:30', duration: 90, className: 'Sparring Team', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'green' },
  { id: 's5', day: 'Friday', time: '18:00', duration: 90, className: 'Adult Class', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's6', day: 'Saturday', time: '09:00', duration: 120, className: 'Sparring Team', location: 'Main Location', instructor: 'Sensei John Kreese', beltRequirement: 'blue' },
  // Downtown Studio
  { id: 's7', day: 'Monday', time: '15:30', duration: 45, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's8', day: 'Tuesday', time: '16:00', duration: 60, className: 'General Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's9', day: 'Wednesday', time: '15:30', duration: 45, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's10', day: 'Thursday', time: '16:00', duration: 60, className: 'General Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  { id: 's11', day: 'Saturday', time: '10:00', duration: 60, className: 'Kids Class', location: 'Downtown Studio', instructor: 'Master Daniel LaRusso', beltRequirement: 'All' },
  // West Side Dojo
  { id: 's12', day: 'Tuesday', time: '17:00', duration: 60, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's13', day: 'Tuesday', time: '18:30', duration: 60, className: 'General Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's14', day: 'Thursday', time: '17:00', duration: 60, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's15', day: 'Thursday', time: '18:30', duration: 60, className: 'General Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'All' },
  { id: 's16', day: 'Saturday', time: '11:00', duration: 90, className: 'Teen Class', location: 'West Side Dojo', instructor: 'Sensei John Kreese', beltRequirement: 'yellow' },
];

function getDemoPrivateSlots() {
  const slots = [];
  const coaches = ['Master Daniel LaRusso', 'Sensei John Kreese'];
  const locations = ['Main Location', 'Downtown Studio', 'West Side Dojo'];
  const times = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
  const prices = [40, 50, 60];
  
  for (let i = 0; i < 8; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i + 1);
    const isBooked = i < 3;
    const bookedStudent = isBooked ? DEMO_STUDENTS[i % DEMO_STUDENTS.length] : null;
    
    slots.push({
      id: `ps${i + 1}`,
      date: futureDate.toISOString().split('T')[0],
      time: times[i % times.length],
      duration: 60,
      coachName: coaches[i % coaches.length],
      location: locations[i % locations.length],
      price: prices[i % prices.length],
      isBooked,
      bookedBy: bookedStudent?.name || null,
      bookedByParent: bookedStudent?.parentName || null,
    });
  }
  return slots;
}

const DEMO_WORLD_RANKINGS = [
  // Top performers from diverse countries and martial arts
  { rank: 1, name: 'Park Tae-joon', belt: 'Black', globalXp: 5200, clubName: 'Korea Tigers Academy', sport: 'Taekwondo WT', country: 'South Korea', city: 'Seoul' },
  { rank: 2, name: 'Yuki Tanaka', belt: 'Black', globalXp: 4980, clubName: 'Tokyo Martial Arts', sport: 'Karate', country: 'Japan', city: 'Tokyo' },
  { rank: 3, name: 'Lucas Silva', belt: 'Black', globalXp: 4850, clubName: 'Gracie Barra Rio', sport: 'BJJ', country: 'Brazil', city: 'Rio de Janeiro' },
  { rank: 4, name: 'Ali Hosseini', belt: 'Black', globalXp: 4720, clubName: 'Tehran Champions', sport: 'Taekwondo WT', country: 'Iran', city: 'Tehran' },
  { rank: 5, name: 'Johnny Lawrence', belt: 'Black', globalXp: 4650, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo ITF', country: 'USA', city: 'Los Angeles' },
  { rank: 6, name: 'Maria Garcia', belt: 'Red', globalXp: 4420, clubName: 'Madrid Warriors', sport: 'Taekwondo WT', country: 'Spain', city: 'Madrid' },
  { rank: 7, name: 'Chen Wei', belt: 'Black', globalXp: 4280, clubName: 'Beijing Kung Fu', sport: 'Kung Fu', country: 'China', city: 'Beijing' },
  { rank: 8, name: 'Miguel Diaz', belt: 'Red', globalXp: 4150, clubName: 'Cobra Kai Dojo', sport: 'Taekwondo ITF', country: 'USA', city: 'Los Angeles' },
  { rank: 9, name: 'Ahmed Hassan', belt: 'Brown', globalXp: 3980, clubName: 'Cairo Fighters', sport: 'Judo', country: 'Egypt', city: 'Cairo' },
  { rank: 10, name: 'Sophie Martin', belt: 'Brown', globalXp: 3850, clubName: 'Paris Dojo', sport: 'Karate', country: 'France', city: 'Paris' },
  { rank: 11, name: 'Robby Keene', belt: 'Brown', globalXp: 3720, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 12, name: 'Kim Min-su', belt: 'Blue', globalXp: 3580, clubName: 'Busan Elite', sport: 'Hapkido', country: 'South Korea', city: 'Busan' },
  { rank: 13, name: 'Fatima Al-Rashid', belt: 'Blue', globalXp: 3450, clubName: 'Dubai Martial Arts', sport: 'Taekwondo WT', country: 'UAE', city: 'Dubai' },
  { rank: 14, name: 'Samantha LaRusso', belt: 'Blue', globalXp: 3320, clubName: 'Miyagi-Do Karate', sport: 'Karate', country: 'USA', city: 'Los Angeles' },
  { rank: 15, name: 'Dimitri Petrov', belt: 'Blue', globalXp: 3180, clubName: 'Moscow Academy', sport: 'Judo', country: 'Russia', city: 'Moscow' },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomInt(9, 20), randomInt(0, 59), 0, 0);
  return date;
}

async function handleDemoLoad(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubId } = parseBody(req);
  if (!clubId) {
    return res.status(400).json({ success: false, message: 'Club ID is required' });
  }

  const client = await pool.connect();
  try {
    // Ensure required columns exist (for production migration)
    await client.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS has_demo_data BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS lifetime_xp INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS global_xp INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS premium_status TEXT DEFAULT 'none'`);
    await client.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS premium_started_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE attendance_events ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`);
    
    const clubResult = await client.query('SELECT id, has_demo_data FROM clubs WHERE id = $1::uuid', [clubId]);
    if (clubResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Club not found' });
    }
    
    if (clubResult.rows[0].has_demo_data) {
      // Demo already loaded - return existing wizard data from database
      const clubDataResult = await client.query(`
        SELECT wizard_data FROM clubs WHERE id = $1::uuid
      `, [clubId]);
      
      // ALWAYS regenerate wizard_data fresh to ensure new skills/rankings/at-risk logic is applied
      const allStudentsResult = await client.query(`
        SELECT id, name, belt, parent_name, parent_email, lifetime_xp, global_xp, premium_status, is_demo, birthdate, join_date
        FROM students WHERE club_id = $1::uuid
      `, [clubId]);
      
      const clubInfoResult = await client.query(`
        SELECT name, owner_name, art_type FROM clubs WHERE id = $1::uuid
      `, [clubId]);
      
      const coachesResult = await client.query(`
        SELECT id, name, email, phone, is_active FROM coaches WHERE club_id = $1::uuid
      `, [clubId]);
      
      const clubInfo = clubInfoResult.rows[0] || {};
      const wizardData = {
        clubName: clubInfo.name || 'Cobra Kai Dojo',
        martialArt: clubInfo.art_type || 'Taekwondo (WT)',
        ownerName: clubInfo.owner_name || 'Sensei',
        email: '',
        branches: DEMO_LOCATIONS.length,
        branchNames: DEMO_LOCATIONS,
        locationClasses: DEMO_LOCATION_CLASSES,
        students: allStudentsResult.rows.map((s: any) => {
          const demoInfo = DEMO_STUDENTS.find(d => d.name === s.name);
          const isAtRisk = demoInfo?.isAtRisk || false;
          const historyLength = isAtRisk ? 0 : randomInt(8, 15);
          const performanceHistory = isAtRisk ? [] : Array.from({ length: historyLength }, (_, i) => ({
            date: new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000).toISOString(),
            score: randomInt(70, 100),
          }));
          return {
            id: s.id,
            name: s.name,
            belt: s.belt,
            parentName: s.parent_name,
            parentEmail: s.parent_email,
            birthday: s.birthdate ? new Date(s.birthdate).toISOString().split('T')[0] : demoInfo?.birthday || null,
            lifetimeXp: s.lifetime_xp || 0,
            globalXp: s.global_xp || 0,
            premiumStatus: s.premium_status || 'none',
            isDemo: s.is_demo || false,
            totalPoints: isAtRisk ? 0 : randomInt(50, 500),
            attendanceCount: performanceHistory.length,
            joinDate: s.join_date?.toISOString?.() || s.join_date || new Date().toISOString(),
            performanceHistory,
            location: demoInfo?.location || '',
            assignedClass: demoInfo?.assignedClass || '',
          };
        }),
        coaches: coachesResult.rows.length > 0 ? coachesResult.rows.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          isActive: c.is_active,
        })) : DEMO_COACHES,
        belts: DEMO_BELTS,
        skills: DEMO_SKILLS,
        schedule: DEMO_SCHEDULE,
        worldRankings: DEMO_WORLD_RANKINGS,
        events: [
          { id: 'e1', title: 'Belt Test', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), type: 'promotion' },
          { id: 'e2', title: 'Tournament', date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), type: 'competition' },
        ],
        curriculum: [],
        classes: CLASS_NAMES,
        customChallenges: [],
        privateSlots: getDemoPrivateSlots(),
        pointsPerStripe: 100,
        stripesPerBelt: 4,
        homeworkBonus: true,
        coachBonus: true,
        worldRankingsEnabled: true,
        isDemo: true,
      };
      
      // Save wizard_data to database for future
      await client.query(`
        UPDATE clubs 
        SET wizard_data = $2::jsonb, updated_at = NOW()
        WHERE id = $1::uuid
      `, [clubId, JSON.stringify(wizardData)]);
      
      return res.json({ success: true, message: 'Demo data already exists', studentCount: allStudentsResult.rows.length, wizardData });
    }

    const studentIds: string[] = [];
    const atRiskNames: string[] = [];
    for (const demoStudent of DEMO_STUDENTS) {
      if (demoStudent.isAtRisk) atRiskNames.push(demoStudent.name);
      const lifetimeXp = randomInt(200, 2500);
      const globalXp = randomInt(50, 500);
      const premiumStarted = demoStudent.premiumStatus === 'parent_paid' ? randomDate(randomInt(7, 60)).toISOString() : null;
      const joinDate = demoStudent.isAtRisk ? randomDate(60).toISOString() : randomDate(randomInt(30, 180)).toISOString();
      const birthdate = demoStudent.birthday ? new Date(demoStudent.birthday).toISOString() : null;
      
      const insertResult = await client.query(`
        INSERT INTO students (club_id, name, belt, parent_name, parent_email, lifetime_xp, global_xp, premium_status, premium_started_at, join_date, birthdate, is_demo, created_at)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::date, true, NOW())
        RETURNING id
      `, [clubId, demoStudent.name, demoStudent.belt, demoStudent.parentName, 
          `${demoStudent.name.toLowerCase().replace(' ', '.')}@demo.taekup.com`,
          lifetimeXp, globalXp, demoStudent.premiumStatus, premiumStarted, joinDate, birthdate]);
      
      studentIds.push(insertResult.rows[0].id);
    }

    // Insert attendance only for non-at-risk students
    for (let i = 0; i < studentIds.length; i++) {
      const studentId = studentIds[i];
      const studentName = DEMO_STUDENTS[i].name;
      if (atRiskNames.includes(studentName)) continue;
      
      const attendanceCount = randomInt(8, 15);
      for (let j = 0; j < attendanceCount; j++) {
        const attendedAt = randomDate(randomInt(0, 30)).toISOString();
        const className = CLASS_NAMES[randomInt(0, CLASS_NAMES.length - 1)];
        
        await client.query(`
          INSERT INTO attendance_events (club_id, student_id, attended_at, class_name, is_demo)
          VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, true)
        `, [clubId, studentId, attendedAt, className]);
      }
    }

    await client.query('UPDATE clubs SET has_demo_data = true WHERE id = $1::uuid', [clubId]);

    // Fetch all students (including newly added demo ones) for wizard data
    const allStudentsResult = await client.query(`
      SELECT id, name, belt, parent_name, parent_email, lifetime_xp, global_xp, premium_status, is_demo, birthdate, join_date
      FROM students WHERE club_id = $1::uuid
    `, [clubId]);
    
    // Fetch club info for wizard data
    const clubInfoResult = await client.query(`
      SELECT name, owner_name, art_type FROM clubs WHERE id = $1::uuid
    `, [clubId]);
    
    // Fetch coaches
    const coachesResult = await client.query(`
      SELECT id, name, email, phone, is_active FROM coaches WHERE club_id = $1::uuid
    `, [clubId]);
    
    const clubInfo = clubInfoResult.rows[0] || {};
    const wizardData = {
      clubName: clubInfo.name || 'Cobra Kai Dojo',
      martialArt: clubInfo.art_type || 'Taekwondo (WT)',
      ownerName: clubInfo.owner_name || 'Sensei',
      email: '',
      branches: DEMO_LOCATIONS.length,
      branchNames: DEMO_LOCATIONS,
      locationClasses: DEMO_LOCATION_CLASSES,
      students: allStudentsResult.rows.map((s: any) => {
        const demoInfo = DEMO_STUDENTS.find(d => d.name === s.name);
        const isAtRisk = demoInfo?.isAtRisk || false;
        const historyLength = isAtRisk ? 0 : randomInt(8, 15);
        const performanceHistory = isAtRisk ? [] : Array.from({ length: historyLength }, (_, i) => ({
          date: new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000).toISOString(),
          score: randomInt(70, 100),
        }));
        return {
          id: s.id,
          name: s.name,
          belt: s.belt,
          parentName: s.parent_name,
          parentEmail: s.parent_email,
          birthday: s.birthdate ? new Date(s.birthdate).toISOString().split('T')[0] : demoInfo?.birthday || null,
          lifetimeXp: s.lifetime_xp || 0,
          globalXp: s.global_xp || 0,
          premiumStatus: s.premium_status || 'none',
          isDemo: s.is_demo || false,
          totalPoints: isAtRisk ? 0 : randomInt(50, 500),
          attendanceCount: performanceHistory.length,
          joinDate: s.join_date?.toISOString?.() || s.join_date || new Date().toISOString(),
          performanceHistory,
          location: demoInfo?.location || '',
          assignedClass: demoInfo?.assignedClass || '',
        };
      }),
      coaches: coachesResult.rows.length > 0 ? coachesResult.rows.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        isActive: c.is_active,
      })) : DEMO_COACHES,
      belts: DEMO_BELTS,
      skills: DEMO_SKILLS,
      schedule: DEMO_SCHEDULE,
      worldRankings: DEMO_WORLD_RANKINGS,
      events: [
        { id: 'e1', title: 'Belt Test', date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), type: 'promotion' },
        { id: 'e2', title: 'Tournament', date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), type: 'competition' },
      ],
      curriculum: [],
      classes: CLASS_NAMES,
      customChallenges: [],
      privateSlots: getDemoPrivateSlots(),
      pointsPerStripe: 100,
      stripesPerBelt: 4,
      homeworkBonus: true,
      coachBonus: true,
      worldRankingsEnabled: true,
      isDemo: true,
    };

    // CRITICAL: Save wizard_data to database so it persists after logout/login
    await client.query(`
      UPDATE clubs 
      SET wizard_data = $2::jsonb, updated_at = NOW()
      WHERE id = $1::uuid
    `, [clubId, JSON.stringify(wizardData)]);

    console.log('[Demo Load] Success:', studentIds.length, 'demo students, total students:', allStudentsResult.rows.length);
    return res.json({ success: true, message: 'Demo data loaded successfully', studentCount: studentIds.length, wizardData });
  } catch (error: any) {
    console.error('[Demo Load] Error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to load demo data: ${error.message}` });
  } finally {
    client.release();
  }
}

async function handleDemoClear(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  
  const { clubId } = parseBody(req);
  if (!clubId) {
    return res.status(400).json({ success: false, message: 'Club ID is required' });
  }

  const client = await pool.connect();
  try {
    // Ensure has_demo_data column exists (for production migration)
    await client.query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS has_demo_data BOOLEAN DEFAULT false`);
    
    const clubResult = await client.query('SELECT id, has_demo_data FROM clubs WHERE id = $1::uuid', [clubId]);
    if (clubResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Club not found' });
    }
    
    if (!clubResult.rows[0].has_demo_data) {
      return res.json({ success: false, message: 'No demo data to clear' });
    }

    await client.query('DELETE FROM attendance_events WHERE club_id = $1::uuid AND is_demo = true', [clubId]);
    const deleteResult = await client.query('DELETE FROM students WHERE club_id = $1::uuid AND is_demo = true', [clubId]);
    
    // CRITICAL: Also clear wizard_data so fresh demo data can be loaded
    await client.query('UPDATE clubs SET has_demo_data = false, wizard_data = NULL WHERE id = $1::uuid', [clubId]);

    return res.json({ success: true, message: 'Demo data cleared successfully', deletedCount: deleteResult.rowCount });
  } catch (error: any) {
    console.error('[Demo Clear] Error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to clear demo data: ${error.message}` });
  } finally {
    client.release();
  }
}

// =====================================================
// SUPER ADMIN - DAILY TRAINING MANAGEMENT
// =====================================================

async function handleSuperAdminGauntletChallenges(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM gauntlet_challenges 
      ORDER BY 
        CASE day_of_week 
          WHEN 'MONDAY' THEN 1 
          WHEN 'TUESDAY' THEN 2 
          WHEN 'WEDNESDAY' THEN 3 
          WHEN 'THURSDAY' THEN 4 
          WHEN 'FRIDAY' THEN 5 
          WHEN 'SATURDAY' THEN 6 
          WHEN 'SUNDAY' THEN 7 
        END,
        display_order ASC
    `);
    
    return res.json({ challenges: result.rows });
  } catch (error: any) {
    console.error('[SuperAdmin] Gauntlet challenges error:', error);
    return res.status(500).json({ error: 'Failed to fetch challenges' });
  } finally {
    client.release();
  }
}

async function handleSuperAdminGauntletChallengeUpdate(req: VercelRequest, res: VercelResponse, challengeId: string) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
  
  const { name, description, icon, demo_video_url, is_active } = parseBody(req);
  
  const client = await pool.connect();
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramCount++}`);
      values.push(icon);
    }
    if (demo_video_url !== undefined) {
      updates.push(`demo_video_url = $${paramCount++}`);
      values.push(demo_video_url || null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(challengeId);
    const query = `UPDATE gauntlet_challenges SET ${updates.join(', ')} WHERE id = $${paramCount}::uuid`;
    
    await client.query(query, values);
    
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[SuperAdmin] Update gauntlet challenge error:', error);
    return res.status(500).json({ error: 'Failed to update challenge' });
  } finally {
    client.release();
  }
}

async function handleSuperAdminVerify(req: VercelRequest, res: VercelResponse) {
  const auth = await verifySuperAdminToken(req);
  if (!auth.valid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ valid: true, email: auth.email });
}

// =====================================================
// WARRIOR'S GAUNTLET HANDLERS
// =====================================================

async function handleGauntletToday(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const studentId = req.query.studentId as string;
  
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const today = days[new Date().getDay()];
  
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
  
  const client = await pool.connect();
  try {
    const challengesResult = await client.query(`
      SELECT * FROM gauntlet_challenges 
      WHERE day_of_week = $1 AND is_active = true
      ORDER BY display_order ASC
    `, [today]);
    
    const challenges = challengesResult.rows;
    
    let personalBests: any[] = [];
    let thisWeekSubmissions: any[] = [];
    
    if (studentId && challenges.length > 0) {
      const challengeIds = challenges.map(c => c.id);
      
      const pbResult = await client.query(`
        SELECT challenge_id, best_score, has_video_proof 
        FROM gauntlet_personal_bests 
        WHERE student_id = $1::uuid 
        AND challenge_id = ANY($2::uuid[])
      `, [studentId, challengeIds]);
      personalBests = pbResult.rows;
      
      const submissionsResult = await client.query(`
        SELECT challenge_id, score, proof_type, is_personal_best 
        FROM gauntlet_submissions 
        WHERE student_id = $1::uuid 
        AND week_number = $2
        AND challenge_id = ANY($3::uuid[])
      `, [studentId, weekNumber, challengeIds]);
      thisWeekSubmissions = submissionsResult.rows;
    }
    
    const pbMap = new Map(personalBests.map(pb => [pb.challenge_id, pb]));
    const submittedMap = new Map(thisWeekSubmissions.map(s => [s.challenge_id, s]));
    
    const enrichedChallenges = challenges.map(c => ({
      ...c,
      personalBest: pbMap.get(c.id)?.best_score || null,
      pbHasVideo: pbMap.get(c.id)?.has_video_proof || false,
      submittedThisWeek: submittedMap.has(c.id),
      thisWeekScore: submittedMap.get(c.id)?.score || null,
      thisWeekProofType: submittedMap.get(c.id)?.proof_type || null,
    }));
    
    return res.json({
      dayOfWeek: today,
      dayTheme: challenges[0]?.day_theme || 'Training',
      weekNumber,
      challenges: enrichedChallenges,
    });
  } catch (error: any) {
    console.error('[Gauntlet] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch gauntlet challenges' });
  } finally {
    client.release();
  }
}

async function handleGauntletSubmit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const body = parseBody(req);
  const { challengeId, studentId, score, proofType, videoUrl, videoHash } = body;
  
  if (!challengeId || !studentId || score === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
  
  const client = await pool.connect();
  try {
    const existingSubmission = await client.query(`
      SELECT id FROM gauntlet_submissions 
      WHERE challenge_id = $1::uuid AND student_id = $2::uuid AND week_number = $3
    `, [challengeId, studentId, weekNumber]);
    
    if (existingSubmission.rows.length > 0) {
      return res.json({ limitReached: true, message: 'Already completed this week' });
    }
    
    const challengeResult = await client.query(`
      SELECT * FROM gauntlet_challenges WHERE id = $1::uuid
    `, [challengeId]);
    
    const challenge = challengeResult.rows[0];
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    const isVideoProof = proofType === 'VIDEO';
    const localXp = isVideoProof ? 40 : 20;
    const globalPoints = isVideoProof ? 15 : 5;
    
    const pbResult = await client.query(`
      SELECT id, best_score FROM gauntlet_personal_bests 
      WHERE challenge_id = $1::uuid AND student_id = $2::uuid
    `, [challengeId, studentId]);
    
    const existingPB = pbResult.rows[0];
    let isNewPB = false;
    let isFirstSubmission = false;
    
    if (!existingPB) {
      // First submission - store as baseline, don't show "broke record"
      isFirstSubmission = true;
      await client.query(`
        INSERT INTO gauntlet_personal_bests (challenge_id, student_id, best_score, has_video_proof)
        VALUES ($1::uuid, $2::uuid, $3, $4)
      `, [challengeId, studentId, score, isVideoProof]);
    } else {
      const isBetter = challenge.sort_order === 'DESC' 
        ? score > existingPB.best_score 
        : score < existingPB.best_score;
      
      if (isBetter) {
        isNewPB = true; // Only true when actually beating a previous record
        await client.query(`
          UPDATE gauntlet_personal_bests 
          SET best_score = $1, achieved_at = NOW(), has_video_proof = $2
          WHERE id = $3::uuid
        `, [score, isVideoProof, existingPB.id]);
      }
    }
    
    await client.query(`
      INSERT INTO gauntlet_submissions 
      (challenge_id, student_id, week_number, score, proof_type, local_xp_awarded, global_points_awarded, is_personal_best)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
    `, [challengeId, studentId, weekNumber, score, proofType || 'TRUST', localXp, globalPoints, isNewPB]);
    
    // Only award XP immediately for TRUST submissions - VIDEO requires coach verification
    if (!isVideoProof) {
      await client.query(`
        UPDATE students SET total_xp = COALESCE(total_xp, 0) + $1 WHERE id = $2::uuid
      `, [localXp, studentId]);
      
      await client.query(`
        UPDATE students SET global_xp = COALESCE(global_xp, 0) + $1 WHERE id = $2::uuid
      `, [globalPoints, studentId]);
    } else {
      // VIDEO submissions: Also insert into challenge_videos for coach review queue
      const studentClubResult = await client.query(`
        SELECT club_id FROM students WHERE id = $1::uuid
      `, [studentId]);
      const studentClubId = studentClubResult.rows[0]?.club_id;
      
      if (studentClubId && videoUrl) {
        // Check for duplicate video content using hash (fingerprint)
        let aiFlag = 'green';
        let aiFlagReason = '';
        
        if (videoHash) {
          const duplicateHashCheck = await client.query(`
            SELECT id FROM challenge_videos 
            WHERE video_hash = $1 AND created_at > NOW() - INTERVAL '30 days'
            LIMIT 1
          `, [videoHash]);
          
          if (duplicateHashCheck.rows.length > 0) {
            aiFlag = 'red';
            aiFlagReason = 'Duplicate video content detected (same file uploaded before)';
            console.log(`[Gauntlet Submit] RED FLAG: Duplicate video hash for ${studentId}`);
          }
        }
        
        await client.query(`
          INSERT INTO challenge_videos 
          (student_id, club_id, challenge_id, challenge_name, challenge_category, video_url, video_key, video_hash, score, status, xp_awarded, ai_flag, ai_flag_reason, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3, $4, 'Daily Training', $5, '', $6, $7, 'pending', $8, $9, $10, NOW(), NOW())
        `, [studentId, studentClubId, challengeId, challenge.name, videoUrl, videoHash || null, score, localXp, aiFlag, aiFlagReason || null]);
        console.log(`[Gauntlet Submit] Video added to coach review queue for ${challenge.name}, AI Flag: ${aiFlag}`);
      }
    }
    
    const newTotalResult = await client.query(`
      SELECT total_xp FROM students WHERE id = $1::uuid
    `, [studentId]);
    
    console.log(`[Gauntlet Submit] ${challenge.name} by ${studentId} - Score: ${score}, XP: ${isVideoProof ? 0 : localXp}, Pending: ${isVideoProof}`);
    
    // Determine the appropriate message
    let message = 'Challenge completed!';
    if (isVideoProof) {
      message = `Video submitted! You'll earn ${localXp} XP when verified by your coach.`;
    } else if (isNewPB) {
      message = 'New Personal Best! You broke your previous record!';
    } else if (isFirstSubmission) {
      message = 'First attempt recorded! This is your baseline to beat.';
    }
    
    return res.json({
      success: true,
      xpAwarded: isVideoProof ? 0 : localXp,
      pendingXp: isVideoProof ? localXp : 0,
      globalPointsAwarded: isVideoProof ? 0 : globalPoints,
      pendingGlobalPoints: isVideoProof ? globalPoints : 0,
      isNewPersonalBest: isNewPB,
      isFirstSubmission,
      pendingVerification: isVideoProof,
      message,
      newTotalXp: newTotalResult.rows[0]?.total_xp || 0,
    });
  } catch (error: any) {
    console.error('[Gauntlet Submit] Error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to submit gauntlet challenge', details: error.message });
  } finally {
    client.release();
  }
}

// Sync curriculum content to database (called when publishing from Creator Hub)
async function handleContentSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const { clubId, content } = req.body;
    console.log('[Content Sync] Received:', { clubId, contentTitle: content?.title, content });
    
    if (!clubId || !content) {
      return res.status(400).json({ error: 'Club ID and content are required' });
    }

    // Validate clubId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(clubId)) {
      return res.status(400).json({ error: 'Invalid club ID format', clubId });
    }

    const { id, title, url, beltId, contentType, status, pricingType, xpReward, description } = content;
    
    if (!title) {
      return res.status(400).json({ error: 'Content title is required' });
    }
    
    // Check if content ID is a valid UUID
    const isValidUuid = uuidRegex.test(id);
    
    // Check if content already exists
    let existingId = null;
    if (isValidUuid) {
      const existing = await client.query(
        `SELECT id FROM curriculum_content WHERE id = $1::uuid LIMIT 1`,
        [id]
      );
      if (existing.rows.length > 0) {
        existingId = existing.rows[0].id;
      }
    } else {
      // Try to find by title+url match for the same club
      const existing = await client.query(
        `SELECT id FROM curriculum_content WHERE club_id = $1::uuid AND title = $2 AND url = $3 LIMIT 1`,
        [clubId, title, url]
      );
      if (existing.rows.length > 0) {
        existingId = existing.rows[0].id;
      }
    }

    if (existingId) {
      // Update existing content
      await client.query(`
        UPDATE curriculum_content 
        SET title = $1, url = $2, belt_id = $3, 
            content_type = $4, status = $5,
            pricing_type = $6, xp_reward = $7,
            description = $8, updated_at = NOW()
        WHERE id = $9::uuid
      `, [title, url, beltId || 'all', contentType || 'video', status || 'draft',
          pricingType || 'free', xpReward || 10, description || null, existingId]);
      
      console.log('[Content Sync] Updated:', existingId);
      return res.json({ success: true, action: 'updated', contentId: existingId });
    }

    // Insert new content (let DB generate UUID)
    const result = await client.query(`
      INSERT INTO curriculum_content (club_id, title, url, belt_id, content_type, status, pricing_type, xp_reward, description, created_at, updated_at)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [clubId, title, url, beltId || 'all', contentType || 'video', status || 'draft',
        pricingType || 'free', xpReward || 10, description || null]);
    
    const newId = result.rows[0]?.id;
    console.log('[Content Sync] Created:', newId);
    return res.json({ success: true, action: 'created', contentId: newId });
  } catch (error: any) {
    console.error('[Content Sync] Error:', error.message, error.stack);
    return res.status(500).json({ error: 'Failed to sync content', details: error.message });
  } finally {
    client.release();
  }
}

// Get XP transaction history for a student
async function handleXpHistory(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!studentId || !uuidRegex.test(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Fetch XP transactions (last 50) - exclude internal tracking types
    const result = await client.query(`
      SELECT id, amount, type, reason, created_at
      FROM xp_transactions
      WHERE student_id = $1::uuid
        AND type NOT IN ('PTS_EARN', 'GLOBAL_EARN')
      ORDER BY created_at DESC
      LIMIT 50
    `, [studentId]);

    const history = result.rows.map(row => ({
      id: row.id,
      amount: parseInt(row.amount, 10),
      type: row.type,
      reason: row.reason,
      createdAt: row.created_at
    }));

    return res.json({ success: true, history });
  } catch (error: any) {
    console.error('[XP History] Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch XP history' });
  } finally {
    client.release();
  }
}

// Award XP to student (for local curriculum content completion)
async function handleAwardXp(req: VercelRequest, res: VercelResponse, studentId: string) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const { xp, contentId, source } = req.body;
    
    if (!xp || typeof xp !== 'number' || xp <= 0) {
      return res.status(400).json({ error: 'Valid XP amount is required' });
    }

    // Verify student exists
    const studentCheck = await client.query(
      `SELECT id, name, total_xp FROM students WHERE id = $1::uuid LIMIT 1`,
      [studentId]
    );
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const student = studentCheck.rows[0];
    const reason = source || `Content completion: ${contentId || 'curriculum'}`;
    
    // Use the unified XP helper (local XP only - no global XP for content)
    const newTotal = await applyXpDelta(client, studentId, xp, reason);
    
    console.log(`[Award XP] ${student.name}: +${xp} local XP (${reason}) → Total: ${newTotal}`);
    
    return res.json({
      success: true,
      newTotal,
      awarded: xp,
      studentId
    });
  } catch (error: any) {
    console.error('[Award XP] Error:', error.message);
    return res.status(500).json({ error: 'Failed to award XP', details: error.message });
  } finally {
    client.release();
  }
}

// Record content view/completion
async function handleContentView(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const { contentId, studentId, completed, xpAwarded } = req.body;
    
    if (!contentId) {
      return res.status(400).json({ error: 'Content ID is required' });
    }

    // Check if content exists
    const contentCheck = await client.query(
      `SELECT id FROM curriculum_content WHERE id = $1::uuid LIMIT 1`,
      [contentId]
    );
    if (contentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Check if student exists
    let validStudentId = null;
    if (studentId) {
      const studentCheck = await client.query(
        `SELECT id FROM students WHERE id = $1::uuid LIMIT 1`,
        [studentId]
      );
      if (studentCheck.rows.length > 0) {
        validStudentId = studentId;
      }
    }

    // Check for existing view
    const existingView = await client.query(
      `SELECT id, completed FROM content_views 
       WHERE content_id = $1::uuid 
       AND ${validStudentId ? 'student_id = $2::uuid' : 'student_id IS NULL'}
       LIMIT 1`,
      validStudentId ? [contentId, validStudentId] : [contentId]
    );

    if (existingView.rows.length > 0) {
      // Update existing view if completing
      if (completed && !existingView.rows[0].completed) {
        await client.query(
          `UPDATE content_views 
           SET completed = true, completed_at = NOW(), xp_awarded = $1
           WHERE id = $2::uuid`,
          [xpAwarded || 0, existingView.rows[0].id]
        );
        
        await client.query(
          `UPDATE curriculum_content 
           SET completion_count = COALESCE(completion_count, 0) + 1
           WHERE id = $1::uuid`,
          [contentId]
        );
      }
      return res.json({ success: true, action: 'updated' });
    }

    // Create new view record
    await client.query(
      `INSERT INTO content_views (content_id, student_id, completed, completed_at, xp_awarded, viewed_at)
       VALUES ($1::uuid, ${validStudentId ? '$2::uuid' : 'NULL'}, $${validStudentId ? 3 : 2}, ${completed ? 'NOW()' : 'NULL'}, $${validStudentId ? 4 : 3}, NOW())`,
      validStudentId 
        ? [contentId, validStudentId, completed || false, xpAwarded || 0]
        : [contentId, completed || false, xpAwarded || 0]
    );

    // Increment view count
    await client.query(
      `UPDATE curriculum_content 
       SET view_count = COALESCE(view_count, 0) + 1
       ${completed ? ', completion_count = COALESCE(completion_count, 0) + 1' : ''}
       WHERE id = $1::uuid`,
      [contentId]
    );

    return res.json({ success: true, action: 'created' });
  } catch (error: any) {
    console.error('[Content View] Error:', error.message);
    return res.status(500).json({ error: 'Failed to record content view' });
  } finally {
    client.release();
  }
}

// Get content completions for analytics (who completed what)
async function handleContentCompletions(req: VercelRequest, res: VercelResponse, clubId: string) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const client = await pool.connect();
  try {
    const completions = await client.query(`
      SELECT 
        cv.id as view_id,
        cv.content_id,
        cv.student_id,
        cv.completed,
        cv.completed_at,
        cv.xp_awarded,
        cv.viewed_at,
        cc.title as content_title,
        cc.content_type,
        cc.belt_id,
        s.name as student_name,
        s.belt as student_belt
      FROM content_views cv
      JOIN curriculum_content cc ON cv.content_id = cc.id
      LEFT JOIN students s ON cv.student_id = s.id
      WHERE cc.club_id = $1::uuid AND cv.completed = true
      ORDER BY cv.completed_at DESC
      LIMIT 100
    `, [clubId]);

    return res.json({
      success: true,
      completions: completions.rows.map(c => ({
        viewId: c.view_id,
        contentId: c.content_id,
        contentTitle: c.content_title,
        contentType: c.content_type,
        beltId: c.belt_id,
        studentId: c.student_id,
        studentName: c.student_name || 'Unknown Student',
        studentBelt: c.student_belt,
        completedAt: c.completed_at,
        xpAwarded: c.xp_awarded
      }))
    });
  } catch (error: any) {
    console.error('[Content Completions] Error:', error.message);
    return res.status(500).json({ error: 'Failed to get content completions' });
  } finally {
    client.release();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const path = url.split('?')[0].replace(/^\/api/, '');

  try {
    if (path === '/login' || path === '/login/') return await handleLogin(req, res);
    if (path === '/login-by-name' || path === '/login-by-name/') return await handleLoginByName(req, res);
    if (path === '/signup' || path === '/signup/') return await handleSignup(req, res);
    if (path === '/forgot-password' || path === '/forgot-password/') return await handleForgotPassword(req, res);
    if (path === '/reset-password' || path === '/reset-password/') return await handleResetPassword(req, res);
    if (path === '/verify-password' || path === '/verify-password/') return await handleVerifyPassword(req, res);
    if (path === '/change-password' || path === '/change-password/') return await handleChangePassword(req, res);
    if (path === '/checkout' || path === '/checkout/') return await handleCheckout(req, res);
    if (path === '/parent-premium/checkout' || path === '/parent-premium/checkout/') return await handleParentPremiumCheckout(req, res);
    if (path === '/customer-portal' || path === '/customer-portal/') return await handleCustomerPortal(req, res);
    if (path === '/products-with-prices' || path === '/products-with-prices/') return await handleProductsWithPrices(req, res);
    if (path === '/stripe/publishable-key' || path === '/stripe/publishable-key/') return await handleStripePublishableKey(req, res);
    if (path === '/ai/taekbot' || path === '/ai/taekbot/') return await handleTaekBot(req, res);
    if (path === '/ai/class-plan' || path === '/ai/class-plan/') return await handleClassPlan(req, res);
    if (path === '/ai/welcome-email' || path === '/ai/welcome-email/') return await handleWelcomeEmail(req, res);
    if (path === '/ai/video-feedback' || path === '/ai/video-feedback/') return await handleVideoFeedback(req, res);
    
    // Database setup (admin only)
    if (path === '/admin/db-setup' || path === '/admin/db-setup/') return await handleDbSetup(req, res);
    
    // Super Admin routes
    if (path === '/super-admin/verify' || path === '/super-admin/verify/') return await handleSuperAdminVerify(req, res);
    if (path === '/super-admin/gauntlet-challenges' || path === '/super-admin/gauntlet-challenges/') return await handleSuperAdminGauntletChallenges(req, res);
    
    const superAdminGauntletMatch = path.match(/^\/super-admin\/gauntlet-challenges\/([^/]+)\/?$/);
    if (superAdminGauntletMatch) return await handleSuperAdminGauntletChallengeUpdate(req, res, superAdminGauntletMatch[1]);
    
    // Daily Mystery Challenge
    if (path === '/daily-challenge' || path === '/daily-challenge/') return await handleDailyChallenge(req, res);
    if (path === '/daily-challenge/submit' || path === '/daily-challenge/submit/') return await handleDailyChallengeSubmit(req, res);
    if (path === '/daily-challenge/status' || path === '/daily-challenge/status/') return await handleDailyChallengeStatus(req, res);
    
    // Warrior's Gauntlet
    if (path === '/gauntlet/today' || path === '/gauntlet/today/') return await handleGauntletToday(req, res);
    if (path === '/gauntlet/submit' || path === '/gauntlet/submit/') return await handleGauntletSubmit(req, res);
    
    // Arena Challenge Submit & History
    if (path === '/challenges/submit' || path === '/challenges/submit/') return await handleChallengeSubmit(req, res);
    if (path === '/challenges/history' || path === '/challenges/history/') return await handleChallengeHistory(req, res);
    
    // Family Challenges
    if (path === '/family-challenges' || path === '/family-challenges/') return await handleGetFamilyChallenges(req, res);
    if (path === '/family-challenges/submit' || path === '/family-challenges/submit/') return await handleFamilyChallengeSubmit(req, res);
    if (path === '/family-challenges/status' || path === '/family-challenges/status/') return await handleFamilyChallengeStatus(req, res);
    
    // Challenges received/sent by student
    const receivedChallengesMatch = path.match(/^\/challenges\/received\/([^/]+)\/?$/);
    if (receivedChallengesMatch) return await handleReceivedChallenges(req, res, receivedChallengesMatch[1]);
    
    const sentChallengesMatch = path.match(/^\/challenges\/sent\/([^/]+)\/?$/);
    if (sentChallengesMatch) return await handleSentChallenges(req, res, sentChallengesMatch[1]);
    
    // Coach Verification Queue
    const pendingVerificationMatch = path.match(/^\/challenges\/pending-verification\/([^/]+)\/?$/);
    if (pendingVerificationMatch) return await handlePendingVerification(req, res, pendingVerificationMatch[1]);
    
    if (path === '/challenges/verify' || path === '/challenges/verify/') return await handleChallengeVerify(req, res);
    
    // Leaderboard
    if (path === '/leaderboard' || path === '/leaderboard/') return await handleLeaderboard(req, res);
    
    // Home Dojo - Habit Tracking
    if (path === '/habits/check' || path === '/habits/check/') return await handleHabitCheck(req, res);
    if (path === '/students/upgrade-premium' || path === '/students/upgrade-premium/') return await handleUpgradePremium(req, res);
    if (path === '/habits/status' || path === '/habits/status/') return await handleHabitStatus(req, res);
    if (path === '/xp/sync' || path === '/xp/sync/') return await handleXpSync(req, res);
    
    // Virtual Dojo Game
    if (path === '/dojo/state' || path === '/dojo/state/') return await handleDojoState(req, res);
    if (path === '/dojo/spin' || path === '/dojo/spin/') return await handleDojoSpin(req, res);
    if (path === '/dojo/feed' || path === '/dojo/feed/') return await handleDojoFeed(req, res);
    if (path === '/dojo/debug-add-xp' || path === '/dojo/debug-add-xp/') return await handleDojoDebugAddXP(req, res);
    if (path === '/habits/custom' || path === '/habits/custom/') {
      if (req.method === 'GET') return await handleGetCustomHabits(req, res);
      if (req.method === 'POST') return await handleCreateCustomHabit(req, res);
    }
    const customHabitDeleteMatch = path.match(/^\/habits\/custom\/([^/]+)\/?$/);
    if (customHabitDeleteMatch) return await handleDeleteCustomHabit(req, res, customHabitDeleteMatch[1]);
    if (path === '/students' || path === '/students/') return await handleAddStudent(req, res);
    if (path === '/students/by-email' || path === '/students/by-email/') return await handleGetStudentByEmail(req, res);
    
    // Student grading endpoint (must be before generic student ID match)
    const studentGradingMatch = path.match(/^\/students\/([^/]+)\/grading\/?$/);
    if (studentGradingMatch) return await handleStudentGrading(req, res, studentGradingMatch[1]);
    
    // Student update/delete by ID
    const studentIdMatch = path.match(/^\/students\/([^/]+)\/?$/);
    if (studentIdMatch) {
      if (req.method === 'PATCH' || req.method === 'PUT') {
        return await handleStudentUpdate(req, res, studentIdMatch[1]);
      }
      if (req.method === 'DELETE') {
        return await handleStudentDelete(req, res, studentIdMatch[1]);
      }
    }
    if (path === '/students/by-name' || path === '/students/by-name/') return await handleGetStudentByName(req, res);
    if (path === '/students/first' || path === '/students/first/') return await handleGetFirstStudent(req, res);
    if (path === '/invite-coach' || path === '/invite-coach/') return await handleInviteCoach(req, res);
    if (path === '/send-class-feedback' || path === '/send-class-feedback/') return await handleSendClassFeedback(req, res);
    
    // Coach update/delete by ID
    const coachIdMatch = path.match(/^\/coaches\/([^/]+)\/?$/);
    if (coachIdMatch) {
      if (req.method === 'PATCH' || req.method === 'PUT') {
        return await handleUpdateCoach(req, res, coachIdMatch[1]);
      }
      if (req.method === 'DELETE') {
        return await handleDeleteCoach(req, res, coachIdMatch[1]);
      }
    }
    
    // Club data routes
    if (path === '/club/save-wizard-data' || path === '/club/save-wizard-data/') return await handleSaveWizardData(req, res);
    
    const clubDataMatch = path.match(/^\/club\/([^/]+)\/data\/?$/);
    if (clubDataMatch) return await handleGetClubData(req, res, clubDataMatch[1]);
    
    const verifySubscriptionMatch = path.match(/^\/club\/([^/]+)\/verify-subscription\/?$/);
    if (verifySubscriptionMatch && req.method === 'POST') return await handleVerifySubscription(req, res, verifySubscriptionMatch[1]);
    
    // Universal Access subscription management
    const universalAccessToggleMatch = path.match(/^\/club\/([^/]+)\/universal-access\/?$/);
    if (universalAccessToggleMatch && req.method === 'POST') return await handleUniversalAccessToggle(req, res, universalAccessToggleMatch[1]);
    
    const universalAccessSyncMatch = path.match(/^\/club\/([^/]+)\/universal-access\/sync\/?$/);
    if (universalAccessSyncMatch && req.method === 'POST') return await handleUniversalAccessSync(req, res, universalAccessSyncMatch[1]);
    
    const linkParentMatch = path.match(/^\/students\/([^/]+)\/link-parent\/?$/);
    if (linkParentMatch) return await handleLinkParent(req, res, linkParentMatch[1]);
    
    const syncRivalsMatch = path.match(/^\/students\/([^/]+)\/sync-rivals\/?$/);
    if (syncRivalsMatch) return await handleSyncRivals(req, res, syncRivalsMatch[1]);

    // Video endpoints
    if (path === '/videos/presigned-upload' || path === '/videos/presigned-upload/') return await handlePresignedUpload(req, res);
    if (path === '/videos' || path === '/videos/') return await handleSaveVideo(req, res);
    
    const studentVideosMatch = path.match(/^\/videos\/student\/([^/]+)\/?$/);
    if (studentVideosMatch) return await handleGetStudentVideos(req, res, studentVideosMatch[1]);
    
    const pendingVideosMatch = path.match(/^\/videos\/pending\/([^/]+)\/?$/);
    if (pendingVideosMatch) return await handleGetPendingVideos(req, res, pendingVideosMatch[1]);
    
    const approvedVideosMatch = path.match(/^\/videos\/approved\/([^/]+)\/?$/);
    if (approvedVideosMatch) return await handleGetApprovedVideos(req, res, approvedVideosMatch[1]);
    
    const verifyVideoMatch = path.match(/^\/videos\/([^/]+)\/verify\/?$/);
    if (verifyVideoMatch) return await handleVerifyVideo(req, res, verifyVideoMatch[1]);
    
    const voteVideoMatch = path.match(/^\/videos\/([^/]+)\/vote\/?$/);
    if (voteVideoMatch) return await handleVoteVideo(req, res, voteVideoMatch[1]);
    
    const videoStreamMatch = path.match(/^\/videos\/stream\/(.+)$/);
    if (videoStreamMatch) return await handleVideoStream(req, res, decodeURIComponent(videoStreamMatch[1]));

    // World Rankings endpoints
    if (path === '/world-rankings' || path === '/world-rankings/') return await handleWorldRankings(req, res);
    if (path === '/world-rankings/sports' || path === '/world-rankings/sports/') return await handleWorldRankingsSports(req, res);
    if (path === '/world-rankings/countries' || path === '/world-rankings/countries/') return await handleWorldRankingsCountries(req, res);
    if (path === '/world-rankings/stats' || path === '/world-rankings/stats/') return await handleWorldRankingsStats(req, res);
    
    const clubWorldRankingsMatch = path.match(/^\/clubs\/([^/]+)\/world-rankings\/?$/);
    if (clubWorldRankingsMatch) return await handleClubWorldRankingsToggle(req, res, clubWorldRankingsMatch[1]);
    
    const seedGlobalXpMatch = path.match(/^\/clubs\/([^/]+)\/seed-global-xp\/?$/);
    if (seedGlobalXpMatch) return await handleSeedClubGlobalXp(req, res, seedGlobalXpMatch[1]);
    
    const studentGlobalXpMatch = path.match(/^\/students\/([^/]+)\/global-xp\/?$/);
    if (studentGlobalXpMatch) return await handleStudentGlobalXp(req, res, studentGlobalXpMatch[1]);
    
    const studentWorldRankMatch = path.match(/^\/students\/([^/]+)\/world-rank\/?$/);
    if (studentWorldRankMatch) return await handleStudentWorldRank(req, res, studentWorldRankMatch[1]);
    
    const studentStatsMatch = path.match(/^\/students\/([^/]+)\/stats\/?$/);
    if (studentStatsMatch) return await handleStudentStats(req, res, studentStatsMatch[1]);

    // XP History (for student progress tracking)
    const xpHistoryMatch = path.match(/^\/students\/([^/]+)\/xp-history\/?$/);
    if (xpHistoryMatch) return await handleXpHistory(req, res, xpHistoryMatch[1]);

    // Direct XP Award (for local curriculum content that doesn't have UUID)
    const awardXpMatch = path.match(/^\/students\/([^/]+)\/award-xp\/?$/);
    if (awardXpMatch) return await handleAwardXp(req, res, awardXpMatch[1]);

    // Content Management (Creator Hub)
    if (path === '/content/sync' || path === '/content/sync/') return await handleContentSync(req, res);
    if (path === '/content/view' || path === '/content/view/') return await handleContentView(req, res);
    
    const contentCompletionsMatch = path.match(/^\/content\/completions\/([^/]+)\/?$/);
    if (contentCompletionsMatch) return await handleContentCompletions(req, res, contentCompletionsMatch[1]);

    // Demo Mode
    if (path === '/demo/load' || path === '/demo/load/') return await handleDemoLoad(req, res);
    if (path === '/demo/clear' || path === '/demo/clear/') return await handleDemoClear(req, res);

    return res.status(404).json({ error: 'Not found', path });
  } catch (error: any) {
    console.error('[API Error]', path, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
