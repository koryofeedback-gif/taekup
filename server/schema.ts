import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const trialStatusEnum = pgEnum('trial_status', ['active', 'expired', 'converted']);
export const clubStatusEnum = pgEnum('club_status', ['active', 'churned', 'paused']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'coach', 'parent', 'super_admin']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'canceled', 'incomplete']);
export const paymentStatusEnum = pgEnum('payment_status', ['paid', 'open', 'unpaid', 'void', 'failed']);
export const premiumStatusEnum = pgEnum('premium_status', ['none', 'club_sponsored', 'parent_paid']);
export const emailStatusEnum = pgEnum('email_status', ['pending', 'sent', 'delivered', 'bounced', 'failed', 'skipped']);

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  ownerEmail: varchar('owner_email', { length: 255 }).notNull().unique(),
  ownerName: varchar('owner_name', { length: 255 }),
  country: varchar('country', { length: 100 }),
  city: varchar('city', { length: 100 }),
  artType: varchar('art_type', { length: 100 }).default('Taekwondo'),
  trialStart: timestamp('trial_start', { withTimezone: true }).defaultNow(),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  trialStatus: trialStatusEnum('trial_status').default('active'),
  status: clubStatusEnum('status').default('active'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeConnectAccountId: varchar('stripe_connect_account_id', { length: 255 }),
  wizardData: jsonb('wizard_data'),
  worldRankingsEnabled: boolean('world_rankings_enabled').default(false),
  globalScore: integer('global_score').default(0),
  hasDemoData: boolean('has_demo_data').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  role: userRoleEnum('role').notNull().default('owner'),
  passwordHash: varchar('password_hash', { length: 255 }),
  tempPassword: varchar('temp_password', { length: 255 }),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
  resetToken: varchar('reset_token', { length: 255 }),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  status: subscriptionStatusEnum('status').default('trialing'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAt: timestamp('cancel_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  planName: varchar('plan_name', { length: 100 }),
  monthlyAmount: integer('monthly_amount'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 10 }).default('usd'),
  status: paymentStatusEnum('status').default('open'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const students = pgTable('students', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  parentEmail: varchar('parent_email', { length: 255 }),
  parentName: varchar('parent_name', { length: 255 }),
  parentPhone: varchar('parent_phone', { length: 50 }),
  location: varchar('location', { length: 255 }),
  assignedClass: varchar('assigned_class', { length: 255 }),
  belt: varchar('belt', { length: 50 }).default('White'),
  stripes: integer('stripes').default(0),
  birthdate: timestamp('birthdate', { withTimezone: true }),
  joinDate: timestamp('join_date', { withTimezone: true }).defaultNow(),
  lastClassAt: timestamp('last_class_at', { withTimezone: true }),
  currentStripePoints: integer('current_stripe_points').default(0),
  lifetimeXp: integer('lifetime_xp').default(0),
  globalXp: integer('global_xp').default(0),
  worldRank: integer('world_rank'),
  previousWorldRank: integer('previous_world_rank'),
  premiumStatus: premiumStatusEnum('premium_status').default('none'),
  premiumStartedAt: timestamp('premium_started_at', { withTimezone: true }),
  premiumCanceledAt: timestamp('premium_canceled_at', { withTimezone: true }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  dojoInventory: jsonb('dojo_inventory').default([]),
  dojoMonster: jsonb('dojo_monster').default({ stage: 'egg', evolutionPoints: 0, name: 'My Monster' }),
  // Trust Tier System for video verification
  trustTier: varchar('trust_tier', { length: 20 }).default('unverified'), // 'unverified', 'verified', 'trusted'
  videoApprovalStreak: integer('video_approval_streak').default(0), // Consecutive approved videos
  videoRejectionCount: integer('video_rejection_count').default(0), // Total rejected videos (for demotion)
  lastSpotCheckAt: timestamp('last_spot_check_at', { withTimezone: true }), // Last random spot-check
  isDemo: boolean('is_demo').default(false), // Demo data flag for cleanup
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const coaches = pgTable('coaches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  inviteSentAt: timestamp('invite_sent_at', { withTimezone: true }),
  inviteAcceptedAt: timestamp('invite_accepted_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const classFeedback = pgTable('class_feedback', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  coachId: uuid('coach_id').references(() => coaches.id, { onDelete: 'set null' }),
  className: varchar('class_name', { length: 255 }),
  classDate: timestamp('class_date', { withTimezone: true }),
  highlights: jsonb('highlights'),
  feedbackText: text('feedback_text'),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const promotions = pgTable('promotions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  fromBelt: varchar('from_belt', { length: 50 }),
  toBelt: varchar('to_belt', { length: 50 }).notNull(),
  promotionDate: timestamp('promotion_date', { withTimezone: true }).defaultNow(),
  totalXp: integer('total_xp').default(0),
  classesAttended: integer('classes_attended').default(0),
  monthsTrained: integer('months_trained').default(0),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const attendanceEvents = pgTable('attendance_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  attendedAt: timestamp('attended_at', { withTimezone: true }).defaultNow(),
  className: varchar('class_name', { length: 255 }),
  isDemo: boolean('is_demo').default(false), // Demo data flag for cleanup
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  emailType: varchar('email_type', { length: 100 }).notNull(),
  templateId: varchar('template_id', { length: 255 }),
  subject: varchar('subject', { length: 500 }),
  status: emailStatusEnum('status').default('sent'),
  messageId: varchar('message_id', { length: 255 }),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const supportSessions = pgTable('support_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  superAdminId: uuid('super_admin_id').references(() => users.id).notNull(),
  targetUserId: uuid('target_user_id').references(() => users.id),
  targetClubId: uuid('target_club_id').references(() => clubs.id),
  reason: text('reason'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  ip: varchar('ip', { length: 50 }),
  userAgent: text('user_agent'),
  wasUsed: boolean('was_used').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  eventTitle: varchar('event_title', { length: 255 }).notNull(),
  eventDescription: text('event_description'),
  metadata: jsonb('metadata'),
  actorEmail: varchar('actor_email', { length: 255 }),
  actorType: varchar('actor_type', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const trialExtensions = pgTable('trial_extensions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  daysAdded: integer('days_added').notNull().default(7),
  reason: text('reason'),
  extendedBy: varchar('extended_by', { length: 255 }),
  previousTrialEnd: timestamp('previous_trial_end', { withTimezone: true }),
  newTrialEnd: timestamp('new_trial_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  code: varchar('code', { length: 100 }),
  percentOff: integer('percent_off').notNull(),
  duration: varchar('duration', { length: 50 }).default('once'),
  stripeCouponId: varchar('stripe_coupon_id', { length: 255 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  appliedBy: varchar('applied_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const automatedEmailTriggerEnum = pgEnum('automated_email_trigger', [
  'welcome',
  'day_3_checkin',
  'day_7_mid_trial',
  'trial_ending_soon',
  'trial_expired',
  'win_back',
  'churn_risk',
  'parent_welcome',
  'birthday_wish',
  'belt_promotion',
  'attendance_alert',
  'coach_invite',
  'new_student_added'
]);

export const automatedEmailLogs = pgTable('automated_email_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  triggerType: automatedEmailTriggerEnum('trigger_type').notNull(),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  templateId: varchar('template_id', { length: 255 }),
  status: emailStatusEnum('status').default('sent'),
  messageId: varchar('message_id', { length: 255 }),
  error: text('error'),
  metadata: jsonb('metadata'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Coach = typeof coaches.$inferSelect;
export type NewCoach = typeof coaches.$inferInsert;
export type EmailLogEntry = typeof emailLog.$inferSelect;
export type SupportSession = typeof supportSessions.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type TrialExtension = typeof trialExtensions.$inferSelect;
export type NewTrialExtension = typeof trialExtensions.$inferInsert;
export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;

// Churn Reasons - capture why clubs cancel
export const churnReasonCategoryEnum = pgEnum('churn_reason_category', [
  'too_expensive',
  'missing_features',
  'switched_competitor',
  'closed_business',
  'not_enough_time',
  'technical_issues',
  'poor_support',
  'other'
]);

export const churnReasons = pgTable('churn_reasons', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  category: churnReasonCategoryEnum('category').notNull(),
  additionalFeedback: text('additional_feedback'),
  wouldRecommend: boolean('would_recommend'),
  rating: integer('rating'), // 1-5 satisfaction rating
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Onboarding Progress - track wizard completion
export const onboardingProgress = pgTable('onboarding_progress', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  step1ClubInfo: boolean('step1_club_info').default(false),
  step1CompletedAt: timestamp('step1_completed_at', { withTimezone: true }),
  step2BeltSystem: boolean('step2_belt_system').default(false),
  step2CompletedAt: timestamp('step2_completed_at', { withTimezone: true }),
  step3Skills: boolean('step3_skills').default(false),
  step3CompletedAt: timestamp('step3_completed_at', { withTimezone: true }),
  step4Scoring: boolean('step4_scoring').default(false),
  step4CompletedAt: timestamp('step4_completed_at', { withTimezone: true }),
  step5People: boolean('step5_people').default(false),
  step5CompletedAt: timestamp('step5_completed_at', { withTimezone: true }),
  step6Branding: boolean('step6_branding').default(false),
  step6CompletedAt: timestamp('step6_completed_at', { withTimezone: true }),
  wizardCompleted: boolean('wizard_completed').default(false),
  wizardCompletedAt: timestamp('wizard_completed_at', { withTimezone: true }),
  lastActiveStep: integer('last_active_step').default(1),
  totalTimeSpentSeconds: integer('total_time_spent_seconds').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// MRR Goals - track monthly revenue targets
export const mrrGoals = pgTable('mrr_goals', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  month: varchar('month', { length: 7 }).notNull(), // Format: YYYY-MM
  targetMrr: integer('target_mrr').notNull(), // In cents
  notes: text('notes'),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Automation Rules - configurable triggers for automated actions
export const automationRuleTypeEnum = pgEnum('automation_rule_type', [
  'health_score_email',
  'trial_reminder',
  'payment_dunning',
  'churn_alert',
  'conversion_alert',
  'signup_alert'
]);

export const automationRules = pgTable('automation_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ruleType: automationRuleTypeEnum('rule_type').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  conditions: jsonb('conditions'), // JSON object with trigger conditions
  actions: jsonb('actions'), // JSON object with actions to take
  emailTemplate: varchar('email_template', { length: 100 }),
  slackEnabled: boolean('slack_enabled').default(false),
  emailEnabled: boolean('email_enabled').default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  triggerCount: integer('trigger_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Automation Execution Log - track when automations fire
export const automationExecutions = pgTable('automation_executions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  ruleId: uuid('rule_id').references(() => automationRules.id, { onDelete: 'cascade' }).notNull(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'set null' }),
  triggerData: jsonb('trigger_data'), // What caused the trigger
  actionsTaken: jsonb('actions_taken'), // What actions were performed
  success: boolean('success').default(true),
  error: text('error'),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow(),
});

// Failed Payment Recovery Tracking
export const paymentRecoveryAttempts = pgTable('payment_recovery_attempts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
  attemptNumber: integer('attempt_number').default(1),
  emailSent: boolean('email_sent').default(false),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  recovered: boolean('recovered').default(false),
  recoveredAt: timestamp('recovered_at', { withTimezone: true }),
  recoveredAmount: integer('recovered_amount'), // In cents
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =====================================================
// CREATOR HUB - Curriculum Content & Courses
// =====================================================

export const contentStatusEnum = pgEnum('content_status', ['draft', 'live', 'archived']);
export const contentTypeEnum = pgEnum('content_type', ['video', 'document', 'quiz']);
export const pricingTypeEnum = pgEnum('pricing_type', ['free', 'premium', 'course_only']);

export const curriculumCourses = pgTable('curriculum_courses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  coverImageUrl: varchar('cover_image_url', { length: 500 }),
  beltId: varchar('belt_id', { length: 100 }),
  price: integer('price').default(0),
  status: contentStatusEnum('status').default('draft'),
  orderIndex: integer('order_index').default(0),
  xpReward: integer('xp_reward').default(50),
  estimatedMinutes: integer('estimated_minutes').default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const curriculumContent = pgTable('curriculum_content', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  courseId: uuid('course_id').references(() => curriculumCourses.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  url: varchar('url', { length: 500 }),
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
  contentType: contentTypeEnum('content_type').default('video'),
  beltId: varchar('belt_id', { length: 100 }),
  tags: jsonb('tags'),
  duration: varchar('duration', { length: 20 }),
  status: contentStatusEnum('status').default('draft'),
  pricingType: pricingTypeEnum('pricing_type').default('free'),
  price: integer('price').default(0),
  xpReward: integer('xp_reward').default(10),
  orderIndex: integer('order_index').default(0),
  viewCount: integer('view_count').default(0),
  completionCount: integer('completion_count').default(0),
  authorName: varchar('author_name', { length: 255 }),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  requiresVideo: boolean('requires_video').default(false), // Requires video proof of technique
  videoAccess: varchar('video_access', { length: 20 }).default('premium'), // 'premium' or 'free'
  maxPerWeek: integer('max_per_week'), // Limit completions per week (null = unlimited), enforces 1x/day
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const contentViews = pgTable('content_views', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contentId: uuid('content_id').references(() => curriculumContent.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  parentEmail: varchar('parent_email', { length: 255 }),
  watchedSeconds: integer('watched_seconds').default(0),
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  xpAwarded: integer('xp_awarded').default(0),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow(),
});

export const courseEnrollments = pgTable('course_enrollments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  courseId: uuid('course_id').references(() => curriculumCourses.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  progress: integer('progress').default(0),
  completedItems: jsonb('completed_items'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  xpAwarded: integer('xp_awarded').default(0),
});

export const creatorEarnings = pgTable('creator_earnings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  contentId: uuid('content_id').references(() => curriculumContent.id, { onDelete: 'set null' }),
  courseId: uuid('course_id').references(() => curriculumCourses.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(),
  platformFee: integer('platform_fee').default(0),
  netAmount: integer('net_amount').notNull(),
  buyerEmail: varchar('buyer_email', { length: 255 }),
  stripePaymentId: varchar('stripe_payment_id', { length: 255 }),
  paidOut: boolean('paid_out').default(false),
  paidOutAt: timestamp('paid_out_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type CurriculumCourse = typeof curriculumCourses.$inferSelect;
export type NewCurriculumCourse = typeof curriculumCourses.$inferInsert;
export type CurriculumContentItem = typeof curriculumContent.$inferSelect;
export type NewCurriculumContent = typeof curriculumContent.$inferInsert;
export type ContentView = typeof contentViews.$inferSelect;

// =====================================================
// VIDEO VERIFICATION SYSTEM - Rivals Challenge Videos
// =====================================================

export const videoStatusEnum = pgEnum('video_status', ['pending', 'approved', 'rejected']);

export const challengeVideos = pgTable('challenge_videos', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar('challenge_id', { length: 255 }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  videoUrl: varchar('video_url', { length: 1000 }).notNull(),
  videoKey: varchar('video_key', { length: 500 }),
  thumbnailUrl: varchar('thumbnail_url', { length: 1000 }),
  challengeName: varchar('challenge_name', { length: 255 }),
  challengeCategory: varchar('challenge_category', { length: 100 }),
  score: integer('score'),
  status: videoStatusEnum('status').default('pending'),
  coachNotes: text('coach_notes'),
  verifiedBy: uuid('verified_by').references(() => coaches.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  xpAwarded: integer('xp_awarded').default(0),
  voteCount: integer('vote_count').default(0),
  // Trust Tier & AI Pre-Screening
  isSpotCheck: boolean('is_spot_check').default(false), // Random spot-check for verified students
  autoApproved: boolean('auto_approved').default(false), // Auto-approved due to trust tier
  aiFlag: varchar('ai_flag', { length: 50 }), // 'green', 'yellow', 'red' - AI pre-screening result
  aiFlagReason: varchar('ai_flag_reason', { length: 255 }), // Reason for AI flag
  videoDuration: integer('video_duration'), // Video length in seconds (for AI screening)
  videoHash: varchar('video_hash', { length: 64 }), // MD5 hash of video file content for duplicate detection
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const challengeVideoVotes = pgTable('challenge_video_votes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  videoId: uuid('video_id').references(() => challengeVideos.id, { onDelete: 'cascade' }).notNull(),
  voterStudentId: uuid('voter_student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  voteValue: integer('vote_value').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type ChallengeVideo = typeof challengeVideos.$inferSelect;
export type NewChallengeVideo = typeof challengeVideos.$inferInsert;
export type ChallengeVideoVote = typeof challengeVideoVotes.$inferSelect;
export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type CreatorEarning = typeof creatorEarnings.$inferSelect;

export type ChurnReason = typeof churnReasons.$inferSelect;
export type NewChurnReason = typeof churnReasons.$inferInsert;
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type MrrGoal = typeof mrrGoals.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type PaymentRecoveryAttempt = typeof paymentRecoveryAttempts.$inferSelect;

// =====================================================
// AI DAILY MYSTERY CHALLENGE - "Lazy Generator" Pattern
// =====================================================

export const dailyChallengeTypeEnum = pgEnum('daily_challenge_type', ['quiz', 'photo', 'text']);

export const dailyChallenges = pgTable('daily_challenges', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  date: varchar('date', { length: 10 }).notNull(),
  targetBelt: varchar('target_belt', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  xpReward: integer('xp_reward').default(25),
  type: dailyChallengeTypeEnum('type').default('quiz'),
  quizData: jsonb('quiz_data'),
  createdByAi: timestamp('created_by_ai', { withTimezone: true }).defaultNow(),
});

// Arena challenge enums
export const challengeModeEnum = pgEnum('challenge_mode', ['SOLO', 'PVP']);
export const challengeStatusEnum = pgEnum('challenge_status', ['PENDING', 'PENDING_OPPONENT', 'ACTIVE', 'COMPLETED', 'VERIFIED', 'REJECTED']);
export const proofTypeEnum = pgEnum('proof_type', ['TRUST', 'VIDEO']);
export const challengeCategoryTypeEnum = pgEnum('challenge_category_type', ['coach_pick', 'general']);
export const challengeDifficultyEnum = pgEnum('challenge_difficulty', ['EASY', 'MEDIUM', 'HARD', 'EPIC']);

export const challengeSubmissions = pgTable('challenge_submissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  challengeId: uuid('challenge_id').references(() => dailyChallenges.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }).notNull(),
  answer: text('answer'),
  isCorrect: boolean('is_correct'),
  xpAwarded: integer('xp_awarded').default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow(),
  // Arena fields
  mode: challengeModeEnum('mode').default('SOLO'),
  opponentId: uuid('opponent_id').references(() => students.id, { onDelete: 'set null' }),
  status: challengeStatusEnum('status').default('COMPLETED'),
  proofType: proofTypeEnum('proof_type').default('TRUST'),
  videoUrl: text('video_url'),
  score: integer('score').default(0),
  // Global Rank fields for World Rankings
  challengeCategoryType: challengeCategoryTypeEnum('challenge_category_type'),
  challengeDifficulty: challengeDifficultyEnum('challenge_difficulty'),
  globalRankPoints: integer('global_rank_points').default(0),
});

export type DailyChallenge = typeof dailyChallenges.$inferSelect;
export type NewDailyChallenge = typeof dailyChallenges.$inferInsert;
export type ChallengeSubmission = typeof challengeSubmissions.$inferSelect;
export type NewChallengeSubmission = typeof challengeSubmissions.$inferInsert;

// =====================================================
// ARENA CHALLENGES - GPP Challenge Library
// =====================================================

export const arenaCategoryEnum = pgEnum('arena_category', ['POWER', 'TECHNIQUE', 'FLEXIBILITY']);
export const difficultyTierEnum = pgEnum('difficulty_tier', ['EASY', 'MEDIUM', 'HARD']);

export const arenaChallenges = pgTable('arena_challenges', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 10 }).default('💪'),
  category: arenaCategoryEnum('category').notNull(),
  difficultyTier: difficultyTierEnum('difficulty_tier').default('MEDIUM'),
  xpReward: integer('xp_reward').default(30),
  isSystemDefault: boolean('is_system_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type ArenaChallenge = typeof arenaChallenges.$inferSelect;
export type NewArenaChallenge = typeof arenaChallenges.$inferInsert;

// =====================================================
// HOME DOJO - Custom Habits
// =====================================================

export const userCustomHabits = pgTable('user_custom_habits', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 100 }).notNull(),
  icon: varchar('icon', { length: 10 }).default('✨'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type UserCustomHabit = typeof userCustomHabits.$inferSelect;
export type NewUserCustomHabit = typeof userCustomHabits.$inferInsert;

// Habit logs table (for tracking daily completions)
export const habitLogs = pgTable('habit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  habitName: varchar('habit_name', { length: 100 }).notNull(),
  xpAwarded: integer('xp_awarded').default(10),
  logDate: timestamp('log_date', { withTimezone: true }).defaultNow(),
});

export type HabitLog = typeof habitLogs.$inferSelect;
export type NewHabitLog = typeof habitLogs.$inferInsert;

// =====================================================
// VIRTUAL DOJO - XP Transactions & Game State
// =====================================================

export const xpTransactionTypeEnum = pgEnum('xp_transaction_type', ['SPEND', 'EARN', 'REFUND']);

export const xpTransactions = pgTable('xp_transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(),
  type: xpTransactionTypeEnum('type').notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type XpTransaction = typeof xpTransactions.$inferSelect;
export type NewXpTransaction = typeof xpTransactions.$inferInsert;

// Dojo inventory item types
export const dojoItemTypeEnum = pgEnum('dojo_item_type', ['FOOD', 'DECORATION']);
export const dojoItemRarityEnum = pgEnum('dojo_item_rarity', ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']);

export const dojoInventory = pgTable('dojo_inventory', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  itemName: varchar('item_name', { length: 100 }).notNull(),
  itemType: dojoItemTypeEnum('item_type').notNull(),
  itemRarity: dojoItemRarityEnum('item_rarity').default('COMMON'),
  itemEmoji: varchar('item_emoji', { length: 10 }).default('🎁'),
  quantity: integer('quantity').default(1),
  evolutionPoints: integer('evolution_points').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type DojoInventoryItem = typeof dojoInventory.$inferSelect;
export type NewDojoInventoryItem = typeof dojoInventory.$inferInsert;

// =====================================================
// WORLD RANKINGS - Global Leaderboard System
// =====================================================

export const worldRankingEntityTypeEnum = pgEnum('world_ranking_entity_type', ['student', 'club', 'coach']);

export const worldRankings = pgTable('world_rankings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  entityType: worldRankingEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  sport: varchar('sport', { length: 100 }),
  country: varchar('country', { length: 100 }),
  rank: integer('rank').notNull(),
  previousRank: integer('previous_rank'),
  score: integer('score').notNull().default(0),
  period: varchar('period', { length: 20 }).default('weekly'),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type WorldRanking = typeof worldRankings.$inferSelect;
export type NewWorldRanking = typeof worldRankings.$inferInsert;

// =====================================================
// WARRIOR'S GAUNTLET - 7-Day Fixed Challenge Rotation
// =====================================================

export const gauntletDayEnum = pgEnum('gauntlet_day', ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
export const gauntletScoreTypeEnum = pgEnum('gauntlet_score_type', ['REPS', 'TIME', 'DISTANCE', 'COUNT', 'SETS']);
export const gauntletSortOrderEnum = pgEnum('gauntlet_sort_order', ['ASC', 'DESC']);

export const gauntletChallenges = pgTable('gauntlet_challenges', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  dayOfWeek: gauntletDayEnum('day_of_week').notNull(),
  dayTheme: varchar('day_theme', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  icon: varchar('icon', { length: 10 }).default('💪'),
  scoreType: gauntletScoreTypeEnum('score_type').notNull(),
  sortOrder: gauntletSortOrderEnum('sort_order').notNull(),
  targetValue: integer('target_value'),
  isActive: boolean('is_active').default(true),
  displayOrder: integer('display_order').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const gauntletSubmissions = pgTable('gauntlet_submissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  challengeId: uuid('challenge_id').references(() => gauntletChallenges.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  score: integer('score').notNull(),
  proofType: proofTypeEnum('proof_type').default('TRUST'),
  videoUrl: text('video_url'),
  xpAwarded: integer('xp_awarded').default(0),
  globalRankPoints: integer('global_rank_points').default(0),
  isPersonalBest: boolean('is_personal_best').default(false),
  weekNumber: integer('week_number').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
});

export const gauntletPersonalBests = pgTable('gauntlet_personal_bests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  challengeId: uuid('challenge_id').references(() => gauntletChallenges.id, { onDelete: 'cascade' }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
  bestScore: integer('best_score').notNull(),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).defaultNow(),
  hasVideoProof: boolean('has_video_proof').default(false),
});

export type GauntletChallenge = typeof gauntletChallenges.$inferSelect;
export type NewGauntletChallenge = typeof gauntletChallenges.$inferInsert;
export type GauntletSubmission = typeof gauntletSubmissions.$inferSelect;
export type NewGauntletSubmission = typeof gauntletSubmissions.$inferInsert;
export type GauntletPersonalBest = typeof gauntletPersonalBests.$inferSelect;
export type NewGauntletPersonalBest = typeof gauntletPersonalBests.$inferInsert;

// =====================================================
// FAMILY CHALLENGES - Parent vs Kid Battles
// =====================================================

export const familyChallengesCategoryEnum = pgEnum('family_challenge_category', ['Strength', 'Speed', 'Focus']);

export const familyChallenges = pgTable('family_challenges', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  icon: varchar('icon', { length: 10 }).default('🎯'),
  category: familyChallengesCategoryEnum('category').notNull(),
  demoVideoUrl: text('demo_video_url'),
  isActive: boolean('is_active').default(true),
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type FamilyChallenge = typeof familyChallenges.$inferSelect;
export type NewFamilyChallenge = typeof familyChallenges.$inferInsert;
