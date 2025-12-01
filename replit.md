# TaekUp Platform - Martial Arts Management System

## Overview
TaekUp is a comprehensive martial arts club management platform built with React, TypeScript, and Vite. It provides tools for managing students, coaches, parents, and club operations with AI-powered features.

## Current State
The project has been successfully configured to run on Replit. The development server is running on port 5000 and the frontend is accessible via the webview.

## Recent Changes (December 1, 2025)
- **5-Tier "Ladder of Success" Pricing**:
  - Starter: $24.99/mo (25 students) - Entry Level
  - Pro: $39.99/mo (50 students) - Sweet Spot for Small Clubs
  - Standard: $69/mo (80 students) - Growing Dojos
  - Growth: $129/mo (150 students) - Serious Business
  - Empire: $199/mo (Unlimited) - Scale Without Limits
- **Subscription & Trial System**:
  - 14-day free trial with unlimited access
  - "Lock Strategy" - forces plan selection based on student count after trial
  - Trial banner showing days remaining
  - Account lock page with plan recommendations
  - Stripe integration for payment processing
- **Dual AI System**:
  - TaekBot powered by GPT-4o for higher accuracy
  - AI Class Planner upgraded to GPT-4o with detailed prompts
  - Gemini API available for routine tasks
  - Both services with fallback responses
- **TV Lobby Display**:
  - Fixed navigation from Admin Dashboard
  - Full-screen lobby mode at /app/tv
  - Auto-rotating slides (welcome, leaderboard, birthdays, events)
- **Custom Habits in Home Dojo**:
  - Parents can now create custom habits (Premium feature)
  - Icon picker with 12 emoji options
  - Category selector (Custom, Martial Arts, Health, School, Character, Family)
  - Custom habits shown separately from presets
  - Easy add/remove functionality
- **Enhanced Dojang Rivals System**:
  - 3 Consolidated Challenge Categories: Power, Technique, Flexibility
  - 19 unique challenges with XP rewards (40-150 XP each)
  - Team Battles: Form squads of 2-3 students to compete together
  - Parent-Child Challenges: Family engagement with 5 preset challenges
  - Belt-Tier Matchmaking: Fair opponents based on belt level (beginner/intermediate/advanced)
  - Daily Streak Bonuses: 3-day = 1.5x XP, 7-day = 2x XP multiplier
  - Mystery Challenge Box: Daily random challenge with 1.5x bonus XP
  - Simplified Stats: Rank, Total XP, and Streak display
  - Weekly Challenges with special rewards and progress tracking
  - Leaderboard showing top warriors in the dojo
  - Battle History with win/loss/team/family tracking
  - Badge/Achievement system (Iron Fist, Lightning, Warrior Spirit, etc.)
- **Real-Time Challenge Notifications**:
  - Challenge Inbox with Received/Sent tabs and notification badges
  - Send challenges to classmates from the Arena
  - Accept/Decline incoming challenges with score submission
  - Toast notifications for new challenges
  - Connection status indicator (Live/Demo mode)
  - PostgreSQL challenges table for persistence
  - BroadcastChannel API for cross-tab notifications in demo mode
  - Supabase real-time subscriptions ready (configure VITE_SUPABASE_URL/KEY)
- **Coach Challenge Builder**:
  - Template-driven interface for creating custom challenges
  - Challenge categories: Power, Technique, Flexibility, Custom
  - Difficulty levels: Beginner, Intermediate, Advanced (with XP scaling)
  - Measurement types: Count, Seconds, Score, Reps, Distance
  - Optional video demonstration links (YouTube)
  - Weekly Challenge toggle with expiration date
  - "Coach Picks" category displays active challenges in Parent Portal Arena
  - Full CRUD operations with toggle active/inactive
- **Instant Demo Mode**:
  - "Try Demo" button on Login page for quick platform preview
  - Role selection: Admin, Coach, or Parent perspectives
  - Pre-populated sample data (club, 5 students, 2 coaches, 3 custom challenges)
  - Floating role switcher for instant view changes during demo
  - Isolated demo state - doesn't affect real user data
  - Easy exit to return to normal login flow
- **Rivals XP Visibility for Coaches**:
  - Student Profile shows "Home Practice (Dojang Rivals)" section
  - Engagement levels: Champion (5000+ XP), Warrior (2000+), Rising Star (1000+), Active (500+)
  - XP badges appear next to student names in Coach Dashboard (🏆/⚔️/⭐/🔥)
  - Stats sync automatically from Parent Portal to student record
  - Coaches can see: Total XP, Wins, Day Streak, Win Rate, Team/Family/Mystery stats

## Previous Changes (November 30, 2025)
- Configured Vite to work with Replit proxy (host: 0.0.0.0, port: 5000)
- Enhanced Bulk Student Import (Step 5 of Setup Wizard)

## Project Architecture

### Technology Stack
- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Routing**: React Router v7
- **Styling**: Tailwind CSS (via CDN)
- **AI Integration**: Google Gemini API (@google/generative-ai)
- **Database**: Supabase (optional, works in demo mode without it)

### Key Features
1. **Setup Wizard**: Multi-step onboarding for new clubs
2. **Coach Dashboard**: Manage students, attendance, and scoring
3. **Parent Portal**: Track student progress and performance
4. **Admin Dashboard**: Full system controls and metrics
5. **TV Display Mode**: Lobby display for dojos
6. **TaekBot**: AI assistant powered by Gemini
7. **AI-Generated Content**: Welcome emails, slogans, lesson plans

### Directory Structure
```
/
├── components/         # React components
│   ├── wizard/        # Setup wizard steps
│   ├── icons/         # Icon components
│   ├── ChallengeBuilder.tsx  # Coach challenge creation interface
│   ├── ChallengeToast.tsx    # Real-time challenge notification
│   ├── CoachDashboard.tsx    # Coach management dashboard
│   └── ParentPortal.tsx      # Parent/student portal (with Dojang Rivals)
├── hooks/             # Custom React hooks
│   └── useChallengeRealtime.ts  # Real-time challenge state management
├── pages/             # Page components
├── services/          # Service layer
│   ├── geminiService.ts         # AI integrations (GPT-4o + Gemini)
│   ├── openaiService.ts         # GPT-4o for TaekBot & Class Planner
│   ├── supabaseClient.ts        # Supabase database client
│   └── challengeRealtimeService.ts  # Real-time challenge notifications
├── App.tsx            # Main app component
├── index.tsx          # Entry point
├── types.ts           # TypeScript type definitions
├── constants.ts       # App constants
└── vite.config.ts     # Vite configuration
```

## Environment Variables

### Optional (for full features)
- `API_KEY`: Google Gemini API key for AI features
- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key

**Note**: The app works in demo mode without these variables. All AI features will use fallback responses, and data is stored in-memory.

## Development

### Running Locally
The workflow "Frontend Dev Server" is configured to run automatically:
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```
This compiles TypeScript and builds the static assets to the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

## Deployment
Configured for static deployment on Replit:
- Build command: `npm run build`
- Output directory: `dist`
- Deployment type: Static site

## User Preferences
None specified yet.

## Known Issues
- Tailwind CDN warning in browser console (expected for development)
- HMR WebSocket connection warnings (due to Replit proxy configuration, doesn't affect functionality)

## Next Steps (Optional Enhancements)
1. Add Gemini API key to enable AI features
2. Set up Supabase database for persistent data
3. Configure production Tailwind CSS (remove CDN)
4. Add error boundary components
5. Implement authentication system
