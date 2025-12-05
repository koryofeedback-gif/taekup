# TaekUp Platform - Martial Arts Management System

## Overview
TaekUp is a comprehensive martial arts club management platform designed to streamline operations for martial arts schools. It offers tools for managing students, coaches, and parents, enhancing engagement through gamification and AI-powered features. The platform aims to boost student retention, improve communication, and provide valuable insights for club growth. Key capabilities include student and challenge management, AI-generated content, subscription handling, and a public-facing pricing page to attract new clubs.

## User Preferences
None specified yet.

## System Architecture

### UI/UX Decisions
The platform features a multi-tiered interface catering to Admins, Coaches, and Parents. A public pricing page allows prospective customers to view subscription tiers before signing up. The TV Lobby display provides a dynamic, full-screen mode for showcasing club activities, leaderboards, and events. The UI supports custom habit creation with emoji icon pickers and category selectors. Squad System features, planned for a future release, will introduce team-based visual themes and leaderboards to foster identity and engagement.

### Technical Implementations
TaekUp is built with React 18 and TypeScript for the frontend, utilizing Vite 5 for fast development and builds. The backend is an Express.js server, also in TypeScript, handling API requests, AI integrations, and Stripe webhooks. Styling is managed with Tailwind CSS. Core features include a multi-step setup wizard for onboarding, a robust Dojang Rivals system with 19 unique challenges and XP rewards, and a "Black Belt Time Machine" for accurate belt promotion predictions. Performance is optimized with database indexes and parallel API loading, verified to support 5,000+ students and 10,000+ daily challenges.

### Feature Specifications
-   **Subscription & Trial System**: 14-day free trial, 5-tier "Ladder of Success" pricing model (Starter, Pro, Standard, Growth, Empire) with monthly and yearly billing options, and a "Lock Strategy" based on student count.
-   **Dual AI System**: Integrates GPT-4o for TaekBot and AI Class Planner, with Google Gemini available for routine tasks, all accessible via secure backend proxies.
-   **Dojang Rivals System**: Consolidates challenges into Power, Technique, and Flexibility categories, featuring Team Battles, Parent-Child Challenges, Belt-Tier Matchmaking, daily streak bonuses, and a Mystery Challenge Box.
-   **Real-Time Challenge Notifications**: Includes a Challenge Inbox, toast notifications, and uses PostgreSQL for persistence.
-   **Coach Challenge Builder**: A template-driven interface for coaches to create custom challenges with various categories, difficulty levels, measurement types, and optional video links.
-   **Instant Demo Mode**: Allows quick platform previews for Admin, Coach, or Parent roles with pre-populated sample data and a floating role switcher.
-   **Rivals XP Visibility for Coaches**: Displays student engagement levels and detailed XP statistics within the Coach Dashboard.
-   **Optimized Black Belt Time Machine**: Incorporates holiday schedules for enhanced accuracy in belt promotion predictions.

### System Design Choices
The project utilizes a two-server architecture during development (Vite dev server and Express API server) but consolidates to a single Express server serving both frontend and API for production on Vercel. Database interactions are handled via Drizzle ORM with PostgreSQL. All sensitive API keys (OpenAI, Gemini, Stripe) are securely managed on the backend, with frontend services calling backend proxy endpoints. Deployment is orchestrated via GitHub Actions to Vercel for production, leveraging Neon for PostgreSQL and direct Stripe API integration.

## External Dependencies

-   **Stripe**: For payment processing, subscription management, and customer portals.
-   **OpenAI**: Powers the TaekBot AI assistant and AI Class Planner (GPT-4o).
-   **Google Gemini**: Used for routine AI tasks.
-   **PostgreSQL (Neon)**: Relational database for persistent data storage, managed with Drizzle ORM.
-   **Vercel**: Production deployment platform for serverless functions and frontend.
-   **GitHub**: Version control and deployment bridge.
-   **Supabase (Optional)**: For real-time subscriptions, if configured.
-   **SendGrid**: Email delivery service for transactional and engagement emails.

## Super Admin Dashboard

### Overview
The Super Admin dashboard is a comprehensive platform-wide control center for monitoring clubs, parents, revenue, and business metrics. It's accessible via a standalone login page that bypasses the main app authentication.

### Access
- **Login URL**: `/super-admin-login.html` (standalone page)
- **Dashboard URL**: `/super-admin/dashboard`
- **Credentials**: Configured via `SUPER_ADMIN_PASSWORD` environment variable
- **Email**: `admin@mytaek.com` (default)

### Features
1. **Dashboard Overview**: Real-time KPI metrics with trend charts for MRR, trials, conversions, and churn rate
2. **Clubs Management**: List all clubs with filtering, search, and quick actions (extend trial, apply discount, send emails)
3. **Parents Management**: Monitor premium parent subscriptions with at-risk flagging
4. **Payment History**: View all Stripe transactions, failed payments, and refunds
5. **Impersonation (View As)**: Access any club as support with full audit logging
6. **Revenue Analytics**: MRR trend over time, churn rate calculation, trial-to-paid conversion metrics
7. **Activity Feed**: Real-time log of signups, conversions, payment failures, and admin actions
8. **Health Scores**: Flag at-risk clubs based on usage patterns (login frequency, student additions)
9. **Email Tools**: Send targeted emails to trial users about to expire or win-back churned clubs (via SendGrid)
10. **CSV Exports**: Download clubs and revenue data for external analysis

### Quick Actions
- **Extend Trial**: Add 7+ days to a club's trial period with audit logging
- **Apply Discount**: Create Stripe coupons (%, duration) and apply to subscriptions
- **Send Email**: Templates for "trial expiring", "we miss you", and custom messages

### Database Tables
- `activity_log`: Event tracking with actor, action, and metadata
- `trial_extensions`: Audit trail for trial modifications
- `discounts`: Coupon and discount tracking with Stripe integration

### Technical Notes
- Uses in-memory session storage with 8-hour expiration
- All impersonation sessions logged to `support_sessions` table
- Stripe and SendGrid integrations are gracefully guarded (work without API keys)
- API endpoints consolidated in `api/super-admin.ts` for Vercel serverless deployment
- Due to Replit webview caching, use external URL for reliable access