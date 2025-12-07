# TaekUp Platform - Complete Feature Summary

## Overview
**TaekUp** is a comprehensive martial arts club management platform designed to streamline operations for martial arts schools. Built with modern web technologies, it offers tools for managing students, coaches, and parents while enhancing engagement through gamification and AI-powered features. The platform serves the dual brands **MyTaek** (ecosystem landing, red theme) and **TaekUp** (management app, cyan theme).

**Live Production URL:** https://mytaek.com

---

## User Roles & Dashboards

### 1. Club Owner (Admin Dashboard)
Full club management with access to:
- **Overview Tab**: Student count, active coaches, upcoming events, revenue stats
- **Students Tab**: Add/edit students, view progress, belt history, XP stats
- **Staff Tab**: Manage coaches, assign classes, set permissions
- **Schedule Tab**: Class schedule management, calendar view
- **Creator Hub**: Curriculum videos, custom content
- **Settings Tab**: Club branding, belt system configuration
- **Billing Tab**: Subscription management, Stripe customer portal

### 2. Coach Dashboard
Class and student management:
- **Grading View**: Score students on skills (Technique, Effort, Focus, Discipline)
- **Attendance Tracking**: Mark student attendance per class
- **Lesson Planner**: AI-powered class plan generation
- **Sparring Tracker**: Track sparring matches and results
- **Challenge Builder**: Create custom Dojang Rivals challenges
- **Schedule View**: Personal teaching schedule

### 3. Parent Portal
Student progress tracking and engagement:
- **Home Tab**: Quick overview, upcoming classes, recent achievements
- **Journey Tab**: Belt progression timeline, promotion history
- **Insights Tab**: AI-generated parenting advice, progress analysis
- **Practice Tab**: Home training curriculum, video tutorials
- **Booking Tab**: Book private lessons (if enabled)
- **Rivals Tab**: Dojang Rivals gamification system
- **Home Dojo Tab**: Daily habits tracking (Character, Chores, School, Health)
- **Digital Card**: Shareable student achievement card

### 4. Super Admin Dashboard
Platform-wide business management:
- **Dashboard Overview**: Real-time KPIs (MRR, trials, conversions, churn rate)
- **Clubs Management**: All clubs with filtering, search, quick actions
- **Parents Management**: Premium parent subscriptions, at-risk flagging
- **Payment History**: Stripe transactions, failed payments, refunds
- **Revenue Analytics**: MRR trends, churn calculation, conversion metrics
- **Activity Feed**: Real-time log of signups, conversions, admin actions
- **Health Scores**: At-risk club detection based on usage patterns
- **Email Tools**: SendGrid integration for targeted emails
- **CSV Exports**: Download clubs and revenue data
- **Impersonation**: Support access to any club with audit logging

---

## Core Features

### Setup Wizard (6-Step Onboarding)
1. **Club Info**: Name, owner details, location, language
2. **Belt System**: Choose WT, ITF, Karate, BJJ, Judo, or Custom belts
3. **Skills Configuration**: Define grading criteria (default: Technique, Effort, Focus, Discipline)
4. **Scoring Rules**: Points per stripe, grading requirements
5. **Add People**: Import coaches and students
6. **Branding**: Logo, colors, theme style, welcome banner

### Belt Systems Supported
- **World Taekwondo (WT)**: Standard colored belt progression
- **ITF Taekwondo**: Traditional ITF ranking
- **Karate**: Japanese color belt system
- **Brazilian Jiu-Jitsu**: Adult and kids belt progressions
- **Judo**: Kyu/Dan ranking system
- **Custom**: Create your own belt system

### Black Belt Time Machine
AI-powered belt promotion predictor:
- Calculates estimated date to reach black belt
- Factors in current belt, training frequency, average promotion time
- Accounts for holiday schedules (minimal, moderate, extensive)
- Visual timeline with milestone markers

---

## Dojang Rivals (Gamification System)

### Challenge Categories
| Category | Description | Example Challenges |
|----------|-------------|-------------------|
| **Power** | Strength & explosivity | Push-ups, Plank, Jumping kicks |
| **Technique** | Precision & form | Kick height, Form accuracy, Poomsae |
| **Flexibility** | Stretching & amplitude | Splits, Hip flexibility, Stretching routines |

### 19 Original Challenges
1. Push-up Challenge
2. Kick Height Challenge
3. Plank Endurance
4. Form Precision
5. Split Progress
6. Speed Kicks
7. Balance Hold
8. Jumping Kicks
9. Stretching Routine
10. Breaking Power
11. Poomsae Memorization
12. Core Strength
13. Flexibility Score
14. Sparring Points
15. Cardio Endurance
16. Stance Accuracy
17. Hip Flexibility
18. Reaction Speed
19. Movement Flow

### XP System
| Action | XP Reward |
|--------|-----------|
| Challenge completed | 10-50 XP |
| Daily streak | +10 XP bonus |
| Mystery Box challenge | +25 XP bonus |
| Team Battle victory | +100 XP |
| Parent-Child challenge | +75 XP |

### Special Features
- **Team Battles**: Squad-based competitions within the club
- **Parent-Child Challenges**: Family engagement through joint challenges
- **Belt-Tier Matchmaking**: Fair competition between similar skill levels
- **Daily Streak Bonuses**: Rewards for consistent daily activity
- **Mystery Challenge Box**: Random challenge discovery with bonus XP
- **Challenge Inbox**: Real-time notifications for new challenges
- **Leaderboards**: Club-wide and belt-tier rankings

---

## AI-Powered Features

### 1. TaekBot (AI Assistant)
- Conversational AI specialized in martial arts
- Context-aware (knows club name, art type, rules)
- Multi-language support
- Powered by GPT-4o

### 2. AI Class Planner
Generates structured lesson plans based on:
- Belt level of participants
- Focus area (technique, cardio, forms, sparring)
- Class duration (30, 45, 60, 90 minutes)
- Number of students
- Output includes: warmup, drills, techniques, conditioning, cooldown

### 3. AI Feedback Generator
- Generates personalized parent feedback after classes
- Creates promotion congratulation messages
- Writes attendance concern follow-ups

### 4. Welcome Email Generator
- Automated welcome emails for new students/families
- Personalized with club name, student name, parent name
- Multi-language support

### Dual AI Architecture
| Task | Model | Reason |
|------|-------|--------|
| TaekBot conversations | GPT-4o | Superior quality |
| Class planning | GPT-4o | Creative structure |
| Routine tasks | Google Gemini | Cost optimization |

---

## Subscription & Pricing

### "Ladder of Success" Pricing Model

| Tier | Name | Monthly | Annual | Student Limit |
|------|------|---------|--------|---------------|
| 1 | Starter | $24.99 | $249.90 | 50 students |
| 2 | Pro | $49.99 | $499.90 | 100 students |
| 3 | Standard | $99.99 | $999.90 | 250 students |
| 4 | Growth | $149.00 | $1,490.00 | 500 students |
| 5 | Empire | $199.00 | $1,990.00 | Unlimited |

### Trial System
- 14-day free trial
- Full feature access
- No credit card required to start
- Auto-conversion to appropriate tier

### Lock Strategy
- Automatic tier suggestions based on student count
- Proactive upgrade notifications
- Prevents feature usage beyond tier limits

---

## Parent Premium Subscription (Club Revenue Engine)

### Revenue Sharing Model
- Parents can upgrade to Premium for enhanced features
- Cost: $4.99/month per family
- Revenue split between TaekUp and club owner

### Premium Parent Features
- Priority private lesson booking
- Extended video curriculum access
- Advanced progress analytics
- AI parenting insights
- Custom habit tracking
- Shareable digital achievement cards

---

## Email System (SendGrid Integration)

### Automated Emails
| Template | Trigger |
|----------|---------|
| Welcome | On club signup |
| Day 3 Check-in | 3 days after signup |
| Day 7 Mid-Trial | 7 days into trial |
| Trial Ending | 3 days before trial ends |
| Trial Expired | When trial ends |

### Transactional Emails
- Coach Invite
- Password Reset
- New Student Added
- Belt Promotion
- Attendance Alert
- Birthday Wishes
- Class Feedback
- Monthly Revenue Report
- Parent Welcome

---

## TV Lobby Display (Dojang TV)

Full-screen display mode for lobby/waiting areas:
- Current class schedule
- Upcoming events
- Leaderboards (XP rankings)
- Recent belt promotions
- Club announcements
- Rotating motivational content

---

## Demo Mode

Instant preview system for sales/marketing:
- Pre-populated sample data
- Role switcher (Admin, Coach, Parent)
- No signup required
- Showcases all major features

---

## Technical Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Icons**: Lucide React

### Backend
- **Server**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon for production)
- **ORM**: Drizzle ORM
- **API Architecture**: RESTful endpoints

### Infrastructure
- **Development**: Replit with dual-server setup
- **Production**: Vercel (serverless functions + static hosting)
- **Database**: Neon PostgreSQL
- **Payments**: Stripe (subscriptions, webhooks, customer portal)
- **Email**: SendGrid (transactional + marketing)
- **AI**: OpenAI GPT-4o + Google Gemini

### Security
- Backend-only API key storage
- Secure password hashing (bcrypt)
- Session-based authentication
- Super Admin isolation with audit logging
- Stripe webhook signature verification

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `clubs` | Club information, trial status, owner details |
| `users` | Authentication, roles (owner, coach, parent, super_admin) |
| `students` | Student profiles, belt history, XP stats |
| `subscriptions` | Stripe subscription data |
| `activity_log` | Event tracking, audit trail |
| `email_log` | Email delivery tracking |
| `trial_extensions` | Trial modification history |
| `support_sessions` | Impersonation audit log |
| `challenges` | Dojang Rivals challenge records |

---

## URLs & Access

### Public Pages
- `/` - Landing page (MyTaek home)
- `/pricing` - Subscription tiers
- `/demo` - Instant demo mode

### Authenticated Pages
- `/wizard` - Setup wizard (new signups)
- `/app/admin` - Admin dashboard
- `/app/coach` - Coach dashboard
- `/app/parent/:studentId` - Parent portal
- `/dojang-tv` - TV lobby display

### Super Admin
- `/super-admin-login.html` - Standalone login
- `/super-admin/dashboard` - Main dashboard
- `/super-admin/clubs` - Club management
- `/super-admin/parents` - Parent subscriptions
- `/super-admin/payments` - Payment history

---

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY` or `SANDBOX_STRIPE_KEY` - Stripe API key
- `STRIPE_PUBLISHABLE_KEY` or `SANDBOX_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `SUPER_ADMIN_PASSWORD` - Super Admin login
- `APP_URL` - Production URL (e.g., `https://mytaek.com`)
- `SENDGRID_API_KEY` - For email delivery (required for welcome emails)

### Optional
- `SENDGRID_FROM_EMAIL` - Sender email (defaults to hello@mytaek.com)
- `OPENAI_API_KEY` - For GPT-4o features
- `GOOGLE_API_KEY` - For Gemini features
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` - For realtime features

---

## Recent Updates (December 2025)

- Added signup API endpoint (saves clubs to database)
- Integrated automatic welcome email on signup
- Fixed Super Admin endpoints for production
- Added webhook handlers for Stripe events
- Updated email logging with correct schema
- Added activity logging for all signups

---

## Deployment

1. Push code to GitHub
2. Vercel auto-deploys from main branch
3. Production database: Neon PostgreSQL
4. Domain: mytaek.com

---

## User Preferences
None specified yet.

---

*Last updated: December 7, 2025*
