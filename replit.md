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
- **Gamification**: "Dojang Rivals" system includes challenge categories, 19 original challenges, an XP system with various reward actions, and special features like Team Battles and Leaderboards. It features a dual XP system (Local and Global) with daily limits and a Local XP value hierarchy. The Arena Global Score Matrix incorporates a two-tier anti-cheat system with video proof multipliers. "Warrior's Gauntlet" is a fixed 7-day rotation fitness challenge system with personal best tracking and weekly resets.
- **Video Upload Optimization**: Implements file size and duration limits, provides timelapse guidance, and utilizes auto-deletion of approved videos from S3 after 30 days.
- **Belt Systems**: Supports 11 martial arts plus custom belt configurations, including an AI-powered "ChronosBelt™ Predictor" for promotion predictions.
- **AI Features**: Includes TaekBot (conversational AI), AI Class Planner, AI Feedback Generator, and Welcome Email Generator.
- **Subscription & Pricing**: "Ladder of Success" pricing model with 5 tiers, a 14-day free trial, and a parent premium subscription ($4.99/month) with revenue sharing.
- **Stripe Connect Revenue Share**: Clubs earn 70% from parent premium subscriptions, with Stripe Connect handling onboarding, PSD2 compliance, and automatic transfers.
- **MyTaek ID Federation System**: A global unique student identifier (MTK-YYYY-XXXXXX) for seamless cross-club transfers, verified belt history, and global rankings participation.
- **Creator Hub**: Content management system for clubs to upload videos and documents, create courses, monetize content, and track analytics. Includes training limits for injury prevention.
- **Coach Dashboard Features**: Handles grading, attendance, AI lesson planning, sparring tracking, challenge building, and personal schedule. Incorporates a Trust Tier System for student video submissions (Unverified, Verified, Trusted) and AI pre-screening with red/yellow flags for suspicious videos. A Speed Review Mode with keyboard shortcuts is available for batch video review.
- **Parent Portal**: Tracks student journey, provides AI insights, practice curriculum, booking, gamification, daily habits, and digital student cards.
- **Super Admin Dashboard**: Platform-wide management, including KPIs, club/parent management, payment history, revenue analytics, activity feed, health scores, email tools, CSV exports, impersonation, and advanced analytics. Includes VIP Access Request Management for onboarding new clubs.
- **Email System**: Integration with SendGrid for automated and transactional emails. Supports 5 languages (en, fr, de, es, fa) and includes branded terms. All emails sent in the club's preferred language (stored in `clubs.wizard_data.language`). Production (`api/index.ts`) loads translations from `server/utils/emailContent.json` via `EMAIL_TYPE_TO_I18N_KEY` mapping. Dev (`server/services/emailService.ts`) uses `detectLanguage(user)` with the same JSON. VIP welcome emails use inline i18n in both `api/super-admin.ts` and `server/superAdminRoutes.ts`. Stripe webhook payment emails also localized.
- **Multilingual UI System**: Supports English (en), French (fr), and German (de) with `useTranslation` hook and dedicated translation files.

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