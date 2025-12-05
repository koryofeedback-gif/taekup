import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const trialStatusEnum = pgEnum('trial_status', ['active', 'expired', 'converted']);
export const clubStatusEnum = pgEnum('club_status', ['active', 'churned', 'paused']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'coach', 'parent', 'super_admin']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'canceled', 'incomplete']);
export const paymentStatusEnum = pgEnum('payment_status', ['paid', 'open', 'unpaid', 'void', 'failed']);
export const premiumStatusEnum = pgEnum('premium_status', ['none', 'club_sponsored', 'parent_paid']);
export const emailStatusEnum = pgEnum('email_status', ['sent', 'delivered', 'bounced', 'failed']);

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
  wizardData: jsonb('wizard_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clubId: uuid('club_id').references(() => clubs.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  role: userRoleEnum('role').notNull().default('owner'),
  passwordHash: varchar('password_hash', { length: 255 }),
  tempPassword: varchar('temp_password', { length: 255 }),
  mfaSecret: varchar('mfa_secret', { length: 255 }),
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
  belt: varchar('belt', { length: 50 }).default('White'),
  stripes: integer('stripes').default(0),
  birthdate: timestamp('birthdate', { withTimezone: true }),
  joinDate: timestamp('join_date', { withTimezone: true }).defaultNow(),
  lastClassAt: timestamp('last_class_at', { withTimezone: true }),
  totalPoints: integer('total_points').default(0),
  premiumStatus: premiumStatusEnum('premium_status').default('none'),
  premiumStartedAt: timestamp('premium_started_at', { withTimezone: true }),
  premiumCanceledAt: timestamp('premium_canceled_at', { withTimezone: true }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
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
