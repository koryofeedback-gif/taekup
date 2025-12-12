# TaekUp Platform

## Overview
TaekUp is a comprehensive martial arts club management platform designed to streamline operations for martial arts schools. It provides tools for managing students, coaches, and parents, enhancing engagement through gamification and AI-powered features. The platform supports two brands: MyTaek (ecosystem landing page, red theme) and TaekUp (management application, cyan theme). Its purpose is to offer an all-in-one solution for martial arts club owners, coaches, and parents, improving administrative efficiency and student engagement.

## User Preferences
None specified yet.

## System Architecture

### UI/UX Decisions
The platform features distinct themes for its dual brands: MyTaek uses a red theme for its ecosystem landing pages, while the TaekUp management application employs a cyan theme. User interfaces are tailored for specific roles: Club Owner, Coach, Parent, and Super Admin, each with a dedicated dashboard. A 6-step setup wizard guides new clubs through initial configuration. Dojang TV provides a full-screen display mode for club lobbies, showing schedules, leaderboards, and announcements.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Vite 5, Tailwind CSS, React Router DOM, Lucide React.
- **Backend**: Express.js with TypeScript, PostgreSQL (Neon for production), Drizzle ORM, RESTful API architecture.
- **AI Integration**: Dual AI architecture utilizing GPT-4o for complex tasks like TaekBot conversations and class planning, and Google Gemini for cost-optimized routine tasks.
- **Gamification**: "Dojang Rivals" system includes challenge categories (Power, Technique, Flexibility), 19 original challenges, an XP system with various reward actions, and special features like Team Battles and Leaderboards.
- **Belt Systems**: Supports 11 martial arts (WT, ITF, Karate, BJJ, Judo, Hapkido, Tang Soo Do, Aikido, Krav Maga, Kung Fu) plus custom belt configurations. Includes an AI-powered "Black Belt Time Machine" for promotion predictions.
- **AI Features**:
    - **TaekBot**: Conversational AI assistant for martial arts, context-aware, multi-language.
    - **AI Class Planner**: Generates lesson plans based on belt level, focus, duration, and student count.
    - **AI Feedback Generator**: Creates personalized feedback for parents, promotion messages, and attendance follow-ups.
    - **Welcome Email Generator**: Automated, personalized welcome emails for new users.
- **Subscription & Pricing**: "Ladder of Success" pricing model with 5 tiers based on student limits, a 14-day free trial, and a lock strategy for tier management.
- **Parent Premium Subscription**: An optional $4.99/month family subscription offering enhanced features (priority booking, extended curriculum, advanced analytics, AI insights, habit tracking, digital cards) with revenue sharing.

### Feature Specifications
- **Club Owner (Admin Dashboard)**: Manages students, staff, schedule, content (Creator Hub), club settings, and billing.
- **Creator Hub**: Enhanced content management system with:
    - **Content Library**: Upload videos and documents, set belt levels, XP rewards, draft/live status, free/premium access
    - **Courses**: Bundle content into structured courses with ordering, publish/unpublish workflow
    - **Analytics**: Track views, completions, revenue metrics, content performance by belt level
    - **Monetization**: Free vs premium content, XP rewards for completion (10-100 XP per item)
- **Coach Dashboard**: Handles grading, attendance, AI lesson planning, sparring tracking, challenge building, and personal schedule.
- **Parent Portal**: Tracks student journey, provides AI insights, practice curriculum with XP completion tracking, booking, gamification (Rivals), daily habits (Home Dojo), and digital student cards.
- **Super Admin Dashboard**: Platform-wide management, including KPIs, club/parent management, payment history, revenue analytics, activity feed, health scores, email tools, CSV exports, and impersonation. New advanced analytics dashboard with cohort analysis, onboarding funnel, churn analysis, payment recovery, MRR goals, and automations.
- **Email System**: Integration with SendGrid for automated (welcome, trial reminders) and transactional emails (coach invites, password resets, promotions, attendance alerts, birthday wishes, revenue reports).

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