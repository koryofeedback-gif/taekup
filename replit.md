# TaekUp Platform

## Overview
TaekUp is a comprehensive martial arts club management platform designed to streamline operations for martial arts schools. It provides tools for managing students, coaches, and parents, enhancing engagement through gamification and AI-powered features. The platform supports two brands: MyTaek (ecosystem landing page, red theme) and TaekUp (management application, cyan theme). Its purpose is to offer an all-in-one solution for martial arts club owners, coaches, and parents, improving administrative efficiency and student engagement.

## User Preferences
- **Rebranded UI Terms (Dec 2024)**: For IP protection, the following UI text has been rebranded:
  - "Revenue Engine" → "DojoMint™ Protocol"
  - "Black Belt Time Machine" → "ChronosBelt™ Predictor"
  - "XP" → "HonorXP™" (display text only, not variable names)
  - "Leaderboard" → "Global Shogun Rank™" (display text only)
  - "Fighter Cards" → "Legacy Cards™"

## System Architecture

### UI/UX Decisions
The platform features distinct themes for its dual brands: MyTaek uses a red theme for its ecosystem landing pages, while the TaekUp management application employs a cyan theme. User interfaces are tailored for specific roles: Club Owner, Coach, Parent, and Super Admin, each with a dedicated dashboard. A 6-step setup wizard guides new clubs through initial configuration. Dojang TV provides a full-screen display mode for club lobbies, showing schedules, leaderboards, and announcements.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Vite 5, Tailwind CSS, React Router DOM, Lucide React.
- **Backend**: Express.js with TypeScript, PostgreSQL (Neon for production), Drizzle ORM, RESTful API architecture.
- **AI Integration**: Dual AI architecture utilizing GPT-4o for complex tasks like TaekBot conversations and class planning, and Google Gemini for cost-optimized routine tasks.
- **Gamification**: "Dojang Rivals" system includes challenge categories (Power, Technique, Flexibility), 19 original challenges, an XP system with various reward actions, and special features like Team Battles and Leaderboards.
- **Dual XP System**:
    - **Local XP**: Category-based value hierarchy prioritizing technical training over general fitness
    - **Global XP**: Capped at 2 bonus + 2 homework points for World Rankings fairness
    - **Daily Limit**: Global XP submissions limited to 1x per day per student to prevent gaming
- **Local XP Value Hierarchy** (Physical Class Cap = 100 XP):
    - **Coach Picks** (Technical): EASY 10/20, MEDIUM 20/40, HARD 35/70, EPIC 50/100 XP (Free/Premium)
    - **General/Fitness**: EASY 5/10, MEDIUM 10/20, HARD 15/30, EPIC 25/50 XP (Free/Premium)
    - Premium users earn 2x XP with video proof; UI shows base (free) values only
- **Arena Global Score Matrix**: Two-tier anti-cheat system for World Rankings:
    - **Coach Picks** (Technical challenges): Higher point values - EASY 1/5, MEDIUM 3/15, HARD 5/25, EPIC 10/35 (noVideo/withVideo)
    - **General/Fitness**: Lower point values - EASY 1/3, MEDIUM 2/5, HARD 3/10, EPIC 5/15 (noVideo/withVideo)
    - **Video Proof Multiplier**: 3x-7x more Global Rank points for video submissions vs trust-based
    - **Featured Coach Picks**: Premium gold/amber styling in Arena UI with demo video links
- **Warrior's Gauntlet**: Fixed 7-day rotation fitness challenge system:
    - **14 Challenges**: 2 per day (Monday=Engine, Tuesday=Foundation, Wednesday=Evasion, Thursday=Explosion, Friday=Animal, Saturday=Defense, Sunday=Flow)
    - **Scoring Matrix**: Trust = 20 XP / 5 Global, Video = 40 XP / 15 Global
    - **Personal Best Tracking**: PB comparison based on sort_order (ASC for time, DESC for reps)
    - **Weekly Reset**: Challenges can be replayed each week, week_number tracking
    - **Premium Lock**: Video submissions require premium subscription
- **Belt Systems**: Supports 11 martial arts (WT, ITF, Karate, BJJ, Judo, Hapkido, Tang Soo Do, Aikido, Krav Maga, Kung Fu) plus custom belt configurations. Includes an AI-powered "Black Belt Time Machine" for promotion predictions.
- **AI Features**:
    - **TaekBot**: Conversational AI assistant for martial arts, context-aware, multi-language.
    - **AI Class Planner**: Generates lesson plans based on belt level, focus, duration, and student count.
    - **AI Feedback Generator**: Creates personalized feedback for parents, promotion messages, and attendance follow-ups.
    - **Welcome Email Generator**: Automated, personalized welcome emails for new users.
- **Subscription & Pricing**: "Ladder of Success" pricing model with 5 tiers based on student limits, a 14-day free trial, and a lock strategy for tier management.
- **Parent Premium Subscription**: An optional $4.99/month family subscription offering enhanced features (priority booking, extended curriculum, advanced analytics, AI insights, habit tracking, digital cards) with revenue sharing.
- **Stripe Connect Revenue Share** (Feb 2026): Clubs earn 70% from parent premium subscriptions:
    - **Revenue Split**: Platform 30% + fees, Club 70% ($3.28 per $4.99 subscription)
    - **Onboarding**: Club owners connect Stripe in Billing tab → "Connect Stripe Account" button
    - **API Endpoints**:
        - `POST /api/stripe/connect/onboard` - Creates Express account and onboarding link (auth: club owner only)
        - `GET /api/stripe/connect/status` - Check account connection status
    - **Auto-Transfer**: When parent subscribes to premium, 70% automatically transfers to club's connected account
- **MyTaek ID Federation System** (Feb 2026): Global unique student identifier for cross-club transfers:
    - **Format**: MTK-YYYY-XXXXXX (e.g., MTK-2026-A7X9K2)
    - **Purpose**: Students own their martial arts journey data globally
    - **Benefits**: Seamless club transfers, verified belt history, global rankings participation
    - **Display**: Shown in Parent Portal header (clickable to copy) and Admin Dashboard edit modal
    - **Auto-generation**: Created automatically for all new students
    - **Transfer Workflow**:
        1. Receiving club searches student by MyTaek ID (Add Student → Transfer tab)
        2. Views verified profile with belt, XP, and promotion history
        3. Submits transfer request to source club
        4. Source club reviews in "Transfers" modal and approves/rejects
        5. On approval: student.club_id updated, student appears in new club roster
    - **API Endpoints**:
        - `GET /api/students/lookup/:mytaekId` - Lookup student by global ID
        - `POST /api/transfers` - Create transfer request (prevents duplicates)
        - `GET /api/clubs/:clubId/transfers` - List incoming/outgoing requests
        - `PATCH /api/transfers/:id` - Approve/reject (source club only)

### Feature Specifications
- **Club Owner (Admin Dashboard)**: Manages students, staff, schedule, content (Creator Hub), club settings, and billing.
- **Creator Hub**: Enhanced content management system with:
    - **Content Library**: Upload videos and documents, set belt levels, XP rewards, draft/live status, free/premium access
    - **Courses**: Bundle content into structured courses with ordering, publish/unpublish workflow
    - **Analytics**: Track views, completions, revenue metrics, content performance by belt level
    - **Monetization**: Free vs premium content, XP rewards for completion (10-100 XP per item)
    - **Training Limits**: maxPerWeek (1-7x) for injury prevention, auto-enforces 1x/day max, localStorage tracking with auto-reset at midnight/new week
- **Coach Dashboard**: Handles grading, attendance, AI lesson planning, sparring tracking, challenge building, and personal schedule.
    - **Trust Tier System**: Students earn verification status after 10+ consecutive approved videos, enabling auto-XP with 1-in-10 spot-check sampling
        - **Unverified**: Default tier, all videos require coach review
        - **Verified**: 10+ approvals, videos auto-approved (green AI flag only), 1-in-10 spot-checked
        - **Trusted**: 25+ approvals, higher trust level for consistent performers
        - Rejection resets streak to 0 and tier to Unverified
    - **AI Pre-Screening**: Automatic flagging of suspicious video submissions
        - **Red Flag**: Duplicate video detected (same file within 7 days)
        - **Yellow Flag**: High submission rate (5+ in 1 hour) or very short video (<3 seconds)
        - AI flags override auto-approval, forcing manual coach review
    - **Speed Review Mode**: Batch video review with keyboard shortcuts (Space=Approve, X=Reject, arrows=navigate)
- **Parent Portal**: Tracks student journey, provides AI insights, practice curriculum with XP completion tracking, booking, gamification (Rivals), daily habits (Home Dojo), and digital student cards.
- **Super Admin Dashboard**: Platform-wide management, including KPIs, club/parent management, payment history, revenue analytics, activity feed, health scores, email tools, CSV exports, and impersonation. New advanced analytics dashboard with cohort analysis, onboarding funnel, churn analysis, payment recovery, MRR goals, and automations.
- **Email System**: Integration with SendGrid for automated (welcome, trial reminders) and transactional emails (coach invites, password resets, promotions, attendance alerts, birthday wishes, revenue reports).
- **Multilingual Email System** (Jan 2026): Centralized email content in `server/utils/emailContent.json` with:
    - **5 Supported Languages**: English (en), French (fr), German (de), Spanish (es), Persian (fa)
    - **24 Email Types**: welcome_parent, welcome_club, payment_receipt, premium_unlocked, video_approved, video_retry, trial_ending, password_reset, payment_failed, belt_promotion, weekly_progress, coach_invite, payout_notification, subscription_cancelled, day_3_checkin, day_7_mid_trial, trial_expired, new_student_added, monthly_revenue_report, class_feedback, attendance_alert, birthday_wish, win_back, churn_risk, video_submitted, password_changed
    - **Master Template**: Uses SendGrid Dynamic Template with `SENDGRID_MASTER_TEMPLATE_ID` secret
    - **RTL Support**: Automatic right-to-left layout for Persian (fa) emails
    - **Branded Terms**: All TM symbols included (HonorXP™, Legacy Cards™, Global Shogun Rank™, DojoMint™, ChronosBelt™)
    - **API Functions**: `sendNotification(emailType, user, data)` and `sendBulkNotification(emailType, users, dataFn)` in emailService.ts
    - **Language Detection**: Auto-detects from user.language field, falls back to English
    - **Multi-Sender System**: Emails sent from appropriate sender based on type:
        - `hello@mytaek.com`: Welcome, birthday, win-back, coach invites
        - `billing@mytaek.com`: Payments, subscriptions, trial emails
        - `support@mytaek.com`: Attendance alerts, feedback, churn risk
        - `updates@mytaek.com`: Progress, promotions, video notifications
        - `noreply@mytaek.com`: Password reset, password changed

### System Design Choices
- **Development Environment**: Replit with a dual-server setup.
- **Production Deployment**: Vercel for serverless functions and static hosting.
- **Database**: PostgreSQL hosted on Neon.
- **Payment Processing**: Stripe for subscriptions, webhooks, and customer portals.
- **Email Service**: SendGrid.
- **Security**: Backend-only API key storage, bcrypt for password hashing, session-based authentication, Super Admin isolation with audit logging, Stripe webhook signature verification.

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Payment Gateway**: Stripe
- **Email Service**: SendGrid
- **AI Models**: OpenAI (GPT-4o), Google (Gemini)
- **Hosting**: Vercel