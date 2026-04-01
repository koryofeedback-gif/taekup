CREATE TYPE "public"."arena_category" AS ENUM('POWER', 'TECHNIQUE', 'FLEXIBILITY');--> statement-breakpoint
CREATE TYPE "public"."automated_email_trigger" AS ENUM('welcome', 'day_3_checkin', 'day_7_mid_trial', 'trial_ending_soon', 'trial_expired', 'win_back', 'churn_risk', 'parent_welcome', 'birthday_wish', 'belt_promotion', 'attendance_alert', 'coach_invite', 'new_student_added');--> statement-breakpoint
CREATE TYPE "public"."automation_rule_type" AS ENUM('health_score_email', 'trial_reminder', 'payment_dunning', 'churn_alert', 'conversion_alert', 'signup_alert');--> statement-breakpoint
CREATE TYPE "public"."challenge_category_type" AS ENUM('coach_pick', 'general');--> statement-breakpoint
CREATE TYPE "public"."challenge_difficulty" AS ENUM('EASY', 'MEDIUM', 'HARD', 'EPIC');--> statement-breakpoint
CREATE TYPE "public"."challenge_mode" AS ENUM('SOLO', 'PVP');--> statement-breakpoint
CREATE TYPE "public"."challenge_status" AS ENUM('PENDING', 'PENDING_OPPONENT', 'ACTIVE', 'COMPLETED', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."churn_reason_category" AS ENUM('too_expensive', 'missing_features', 'switched_competitor', 'closed_business', 'not_enough_time', 'technical_issues', 'poor_support', 'other');--> statement-breakpoint
CREATE TYPE "public"."club_status" AS ENUM('active', 'churned', 'paused');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('video', 'document', 'quiz');--> statement-breakpoint
CREATE TYPE "public"."daily_challenge_type" AS ENUM('quiz', 'photo', 'text');--> statement-breakpoint
CREATE TYPE "public"."difficulty_tier" AS ENUM('EASY', 'MEDIUM', 'HARD');--> statement-breakpoint
CREATE TYPE "public"."dojo_item_rarity" AS ENUM('COMMON', 'RARE', 'EPIC', 'LEGENDARY');--> statement-breakpoint
CREATE TYPE "public"."dojo_item_type" AS ENUM('FOOD', 'DECORATION');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."family_challenge_category" AS ENUM('Strength', 'Speed', 'Focus');--> statement-breakpoint
CREATE TYPE "public"."gauntlet_day" AS ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');--> statement-breakpoint
CREATE TYPE "public"."gauntlet_score_type" AS ENUM('REPS', 'TIME', 'DISTANCE', 'COUNT', 'SETS');--> statement-breakpoint
CREATE TYPE "public"."gauntlet_sort_order" AS ENUM('ASC', 'DESC');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('paid', 'open', 'unpaid', 'void', 'failed');--> statement-breakpoint
CREATE TYPE "public"."premium_status" AS ENUM('none', 'club_sponsored', 'parent_paid');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('free', 'premium', 'course_only');--> statement-breakpoint
CREATE TYPE "public"."proof_type" AS ENUM('TRUST', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trial_status" AS ENUM('active', 'expired', 'converted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'coach', 'parent', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."world_ranking_entity_type" AS ENUM('student', 'club', 'coach');--> statement-breakpoint
CREATE TYPE "public"."xp_transaction_type" AS ENUM('SPEND', 'EARN', 'REFUND');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"event_title" varchar(255) NOT NULL,
	"event_description" text,
	"metadata" jsonb,
	"actor_email" varchar(255),
	"actor_type" varchar(50),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "arena_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(10) DEFAULT '💪',
	"category" "arena_category" NOT NULL,
	"difficulty_tier" "difficulty_tier" DEFAULT 'MEDIUM',
	"xp_reward" integer DEFAULT 30,
	"is_system_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attended_at" timestamp with time zone DEFAULT now(),
	"class_name" varchar(255),
	"is_demo" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automated_email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"student_id" uuid,
	"user_id" uuid,
	"trigger_type" "automated_email_trigger" NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"template_id" varchar(255),
	"status" "email_status" DEFAULT 'sent',
	"message_id" varchar(255),
	"error" text,
	"metadata" jsonb,
	"sent_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"club_id" uuid,
	"trigger_data" jsonb,
	"actions_taken" jsonb,
	"success" boolean DEFAULT true,
	"error" text,
	"executed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_type" "automation_rule_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"conditions" jsonb,
	"actions" jsonb,
	"email_template" varchar(100),
	"slack_enabled" boolean DEFAULT false,
	"email_enabled" boolean DEFAULT true,
	"last_triggered_at" timestamp with time zone,
	"trigger_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid,
	"student_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"answer" text,
	"is_correct" boolean,
	"xp_awarded" integer DEFAULT 0,
	"completed_at" timestamp with time zone DEFAULT now(),
	"mode" "challenge_mode" DEFAULT 'SOLO',
	"opponent_id" uuid,
	"status" "challenge_status" DEFAULT 'COMPLETED',
	"proof_type" "proof_type" DEFAULT 'TRUST',
	"video_url" text,
	"score" integer DEFAULT 0,
	"challenge_category_type" "challenge_category_type",
	"challenge_difficulty" "challenge_difficulty",
	"global_rank_points" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "challenge_video_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"voter_student_id" uuid NOT NULL,
	"vote_value" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "challenge_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" varchar(255) NOT NULL,
	"student_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"video_url" varchar(1000) NOT NULL,
	"video_key" varchar(500),
	"thumbnail_url" varchar(1000),
	"challenge_name" varchar(255),
	"challenge_category" varchar(100),
	"score" integer,
	"status" "video_status" DEFAULT 'pending',
	"coach_notes" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"xp_awarded" integer DEFAULT 0,
	"vote_count" integer DEFAULT 0,
	"is_spot_check" boolean DEFAULT false,
	"auto_approved" boolean DEFAULT false,
	"ai_flag" varchar(50),
	"ai_flag_reason" varchar(255),
	"video_duration" integer,
	"video_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "churn_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"subscription_id" uuid,
	"category" "churn_reason_category" NOT NULL,
	"additional_feedback" text,
	"would_recommend" boolean,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"coach_id" uuid,
	"class_name" varchar(255),
	"class_date" timestamp with time zone,
	"highlights" jsonb,
	"feedback_text" text,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"owner_email" varchar(255) NOT NULL,
	"owner_name" varchar(255),
	"country" varchar(100),
	"city" varchar(100),
	"art_type" varchar(100) DEFAULT 'Taekwondo',
	"trial_start" timestamp with time zone DEFAULT now(),
	"trial_end" timestamp with time zone,
	"trial_status" "trial_status" DEFAULT 'active',
	"status" "club_status" DEFAULT 'active',
	"stripe_customer_id" varchar(255),
	"stripe_connect_account_id" varchar(255),
	"wizard_data" jsonb,
	"world_rankings_enabled" boolean DEFAULT false,
	"global_score" integer DEFAULT 0,
	"has_demo_data" boolean DEFAULT false,
	"is_platform_owner" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "clubs_owner_email_unique" UNIQUE("owner_email")
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"invite_sent_at" timestamp with time zone,
	"invite_accepted_at" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"student_id" uuid,
	"parent_email" varchar(255),
	"watched_seconds" integer DEFAULT 0,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"xp_awarded" integer DEFAULT 0,
	"viewed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"progress" integer DEFAULT 0,
	"completed_items" jsonb,
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"xp_awarded" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "creator_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"content_id" uuid,
	"course_id" uuid,
	"amount" integer NOT NULL,
	"platform_fee" integer DEFAULT 0,
	"net_amount" integer NOT NULL,
	"buyer_email" varchar(255),
	"stripe_payment_id" varchar(255),
	"paid_out" boolean DEFAULT false,
	"paid_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "curriculum_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"course_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"url" varchar(500),
	"thumbnail_url" varchar(500),
	"content_type" "content_type" DEFAULT 'video',
	"belt_id" varchar(100),
	"tags" jsonb,
	"duration" varchar(20),
	"status" "content_status" DEFAULT 'draft',
	"pricing_type" "pricing_type" DEFAULT 'free',
	"price" integer DEFAULT 0,
	"xp_reward" integer DEFAULT 10,
	"order_index" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"completion_count" integer DEFAULT 0,
	"author_name" varchar(255),
	"publish_at" timestamp with time zone,
	"requires_video" boolean DEFAULT false,
	"video_access" varchar(20) DEFAULT 'premium',
	"max_per_week" integer,
	"location_filter" varchar(255) DEFAULT 'all',
	"class_filter" varchar(255) DEFAULT 'all',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "curriculum_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"cover_image_url" varchar(500),
	"belt_id" varchar(100),
	"price" integer DEFAULT 0,
	"status" "content_status" DEFAULT 'draft',
	"order_index" integer DEFAULT 0,
	"xp_reward" integer DEFAULT 50,
	"estimated_minutes" integer DEFAULT 30,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" varchar(10) NOT NULL,
	"target_belt" varchar(100) NOT NULL,
	"art_type" varchar(100) DEFAULT 'Taekwondo',
	"language" varchar(10) DEFAULT 'en',
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"xp_reward" integer DEFAULT 25,
	"type" "daily_challenge_type" DEFAULT 'quiz',
	"quiz_data" jsonb,
	"created_by_ai" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"code" varchar(100),
	"percent_off" integer NOT NULL,
	"duration" varchar(50) DEFAULT 'once',
	"stripe_coupon_id" varchar(255),
	"expires_at" timestamp with time zone,
	"applied_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dojo_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"item_name" varchar(100) NOT NULL,
	"item_type" "dojo_item_type" NOT NULL,
	"item_rarity" "dojo_item_rarity" DEFAULT 'COMMON',
	"item_emoji" varchar(10) DEFAULT '🎁',
	"quantity" integer DEFAULT 1,
	"evolution_points" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"user_id" uuid,
	"student_id" uuid,
	"recipient" varchar(255) NOT NULL,
	"email_type" varchar(100) NOT NULL,
	"template_id" varchar(255),
	"subject" varchar(500),
	"status" "email_status" DEFAULT 'sent',
	"message_id" varchar(255),
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"description_fr" text,
	"description_de" text,
	"icon" varchar(10) DEFAULT '🎯',
	"category" "family_challenge_category" NOT NULL,
	"demo_video_url" text,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gauntlet_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_of_week" "gauntlet_day" NOT NULL,
	"day_theme" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"description_fr" text,
	"description_de" text,
	"icon" varchar(10) DEFAULT '💪',
	"score_type" "gauntlet_score_type" NOT NULL,
	"sort_order" "gauntlet_sort_order" NOT NULL,
	"target_value" integer,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gauntlet_personal_bests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"best_score" integer NOT NULL,
	"achieved_at" timestamp with time zone DEFAULT now(),
	"has_video_proof" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "gauntlet_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"proof_type" "proof_type" DEFAULT 'TRUST',
	"video_url" text,
	"xp_awarded" integer DEFAULT 0,
	"global_rank_points" integer DEFAULT 0,
	"is_personal_best" boolean DEFAULT false,
	"week_number" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_name" varchar(255),
	"class_date" varchar(50),
	"coach_name" varchar(255),
	"scores" jsonb,
	"skills" jsonb,
	"homework_points" integer DEFAULT 0,
	"bonus_points" integer DEFAULT 0,
	"total_points" integer DEFAULT 0,
	"green_count" integer DEFAULT 0,
	"yellow_count" integer DEFAULT 0,
	"red_count" integer DEFAULT 0,
	"total_skills" integer DEFAULT 0,
	"coach_note" text,
	"stripe_progress" varchar(100),
	"session_xp" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"habit_name" varchar(100) NOT NULL,
	"xp_awarded" integer DEFAULT 10,
	"log_date" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mrr_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" varchar(7) NOT NULL,
	"target_mrr" integer NOT NULL,
	"notes" text,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"step1_club_info" boolean DEFAULT false,
	"step1_completed_at" timestamp with time zone,
	"step2_belt_system" boolean DEFAULT false,
	"step2_completed_at" timestamp with time zone,
	"step3_skills" boolean DEFAULT false,
	"step3_completed_at" timestamp with time zone,
	"step4_scoring" boolean DEFAULT false,
	"step4_completed_at" timestamp with time zone,
	"step5_people" boolean DEFAULT false,
	"step5_completed_at" timestamp with time zone,
	"step6_branding" boolean DEFAULT false,
	"step6_completed_at" timestamp with time zone,
	"wizard_completed" boolean DEFAULT false,
	"wizard_completed_at" timestamp with time zone,
	"last_active_step" integer DEFAULT 1,
	"total_time_spent_seconds" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "onboarding_progress_club_id_unique" UNIQUE("club_id")
);
--> statement-breakpoint
CREATE TABLE "payment_recovery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"payment_id" uuid,
	"stripe_invoice_id" varchar(255),
	"attempt_number" integer DEFAULT 1,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp with time zone,
	"recovered" boolean DEFAULT false,
	"recovered_at" timestamp with time zone,
	"recovered_amount" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"stripe_invoice_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd',
	"status" "payment_status" DEFAULT 'open',
	"paid_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_belt" varchar(50),
	"to_belt" varchar(50) NOT NULL,
	"promotion_date" timestamp with time zone DEFAULT now(),
	"total_xp" integer DEFAULT 0,
	"classes_attended" integer DEFAULT 0,
	"months_trained" integer DEFAULT 0,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"coach_id" uuid,
	"class_name" varchar(255) NOT NULL,
	"coach_name" varchar(255),
	"category" varchar(100) DEFAULT 'General',
	"color" varchar(50) DEFAULT 'sky',
	"day_of_week" varchar(20) NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10),
	"max_capacity" integer DEFAULT 20,
	"location" varchar(255),
	"belt_requirement" varchar(100) DEFAULT 'All',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"event_type" varchar(50) DEFAULT 'social',
	"date" varchar(20) NOT NULL,
	"time" varchar(10),
	"location" varchar(255),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_private_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"coach_id" uuid,
	"coach_name" varchar(255) NOT NULL,
	"date" varchar(20) NOT NULL,
	"time" varchar(10) NOT NULL,
	"price" integer DEFAULT 50,
	"is_booked" boolean DEFAULT false,
	"booked_by_student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"from_club_id" uuid,
	"to_club_id" uuid NOT NULL,
	"status" "transfer_status" DEFAULT 'pending',
	"requested_at" timestamp with time zone DEFAULT now(),
	"responded_at" timestamp with time zone,
	"transferred_at" timestamp with time zone,
	"notes" text,
	"belt_at_transfer" varchar(50),
	"xp_at_transfer" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mytaek_id" varchar(20),
	"club_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_email" varchar(255),
	"parent_name" varchar(255),
	"parent_phone" varchar(50),
	"location" varchar(255),
	"assigned_class" varchar(255),
	"belt" varchar(50) DEFAULT 'White',
	"stripes" integer DEFAULT 0,
	"birthdate" timestamp with time zone,
	"join_date" timestamp with time zone DEFAULT now(),
	"last_class_at" timestamp with time zone,
	"current_stripe_points" integer DEFAULT 0,
	"lifetime_xp" integer DEFAULT 0,
	"global_xp" integer DEFAULT 0,
	"world_rank" integer,
	"previous_world_rank" integer,
	"premium_status" "premium_status" DEFAULT 'none',
	"premium_gifted" boolean DEFAULT false,
	"premium_started_at" timestamp with time zone,
	"premium_canceled_at" timestamp with time zone,
	"stripe_customer_id" varchar(255),
	"dojo_inventory" jsonb DEFAULT '[]'::jsonb,
	"dojo_monster" jsonb DEFAULT '{"stage":"egg","evolutionPoints":0,"name":"My Monster"}'::jsonb,
	"trust_tier" varchar(20) DEFAULT 'unverified',
	"video_approval_streak" integer DEFAULT 0,
	"video_rejection_count" integer DEFAULT 0,
	"last_spot_check_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false,
	"profile_image_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "students_mytaek_id_unique" UNIQUE("mytaek_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"status" "subscription_status" DEFAULT 'trialing',
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"plan_name" varchar(100),
	"monthly_amount" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"super_admin_id" uuid NOT NULL,
	"target_user_id" uuid,
	"target_club_id" uuid,
	"reason" text,
	"token" varchar(255) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ip" varchar(50),
	"user_agent" text,
	"was_used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "support_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trial_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"days_added" integer DEFAULT 7 NOT NULL,
	"reason" text,
	"extended_by" varchar(255),
	"previous_trial_end" timestamp with time zone,
	"new_trial_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_custom_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"title" varchar(100) NOT NULL,
	"icon" varchar(10) DEFAULT '✨',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"password_hash" varchar(255),
	"temp_password" varchar(255),
	"mfa_secret" varchar(255),
	"reset_token" varchar(255),
	"reset_token_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "world_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "world_ranking_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"sport" varchar(100),
	"country" varchar(100),
	"rank" integer NOT NULL,
	"previous_rank" integer,
	"score" integer DEFAULT 0 NOT NULL,
	"period" varchar(20) DEFAULT 'weekly',
	"snapshot_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"type" "xp_transaction_type" NOT NULL,
	"reason" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_challenges" ADD CONSTRAINT "arena_challenges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_email_logs" ADD CONSTRAINT "automated_email_logs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_email_logs" ADD CONSTRAINT "automated_email_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automated_email_logs" ADD CONSTRAINT "automated_email_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_submissions" ADD CONSTRAINT "challenge_submissions_opponent_id_students_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_video_votes" ADD CONSTRAINT "challenge_video_votes_video_id_challenge_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."challenge_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_video_votes" ADD CONSTRAINT "challenge_video_votes_voter_student_id_students_id_fk" FOREIGN KEY ("voter_student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_videos" ADD CONSTRAINT "challenge_videos_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_videos" ADD CONSTRAINT "challenge_videos_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_videos" ADD CONSTRAINT "challenge_videos_verified_by_coaches_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "churn_reasons" ADD CONSTRAINT "churn_reasons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_feedback" ADD CONSTRAINT "class_feedback_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_feedback" ADD CONSTRAINT "class_feedback_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_feedback" ADD CONSTRAINT "class_feedback_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_content_id_curriculum_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."curriculum_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_curriculum_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."curriculum_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_content_id_curriculum_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."curriculum_content"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_course_id_curriculum_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."curriculum_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_content" ADD CONSTRAINT "curriculum_content_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_content" ADD CONSTRAINT "curriculum_content_course_id_curriculum_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."curriculum_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dojo_inventory" ADD CONSTRAINT "dojo_inventory_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlet_personal_bests" ADD CONSTRAINT "gauntlet_personal_bests_challenge_id_gauntlet_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."gauntlet_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlet_personal_bests" ADD CONSTRAINT "gauntlet_personal_bests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlet_submissions" ADD CONSTRAINT "gauntlet_submissions_challenge_id_gauntlet_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."gauntlet_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gauntlet_submissions" ADD CONSTRAINT "gauntlet_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_sessions" ADD CONSTRAINT "grading_sessions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_sessions" ADD CONSTRAINT "grading_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_recovery_attempts" ADD CONSTRAINT "payment_recovery_attempts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_recovery_attempts" ADD CONSTRAINT "payment_recovery_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_classes" ADD CONSTRAINT "schedule_classes_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_classes" ADD CONSTRAINT "schedule_classes_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_private_slots" ADD CONSTRAINT "schedule_private_slots_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_private_slots" ADD CONSTRAINT "schedule_private_slots_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_private_slots" ADD CONSTRAINT "schedule_private_slots_booked_by_student_id_students_id_fk" FOREIGN KEY ("booked_by_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_from_club_id_clubs_id_fk" FOREIGN KEY ("from_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_transfers" ADD CONSTRAINT "student_transfers_to_club_id_clubs_id_fk" FOREIGN KEY ("to_club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_super_admin_id_users_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_target_club_id_clubs_id_fk" FOREIGN KEY ("target_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_extensions" ADD CONSTRAINT "trial_extensions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_custom_habits" ADD CONSTRAINT "user_custom_habits_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;