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
  - Gemini API available for routine tasks
  - Both services with fallback responses

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
│   └── icons/         # Icon components
├── pages/             # Page components
├── services/          # Service layer
│   ├── geminiService.ts    # AI integrations
│   └── supabaseClient.ts   # Database client
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
