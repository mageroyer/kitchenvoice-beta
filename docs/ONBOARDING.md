# SmartCookBook Developer Onboarding Guide

Welcome to SmartCookBook! This guide will get you up and running quickly on our commercial kitchen management platform.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** (we recommend using nvm)
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Git** for version control
- **VS Code** (recommended) with React/TypeScript extensions

## Quick Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd smartcookbook

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp app-new/.env.example app-new/.env.local
# Edit app-new/.env.local with your Firebase config

# 4. Install Firebase tools and login
firebase login
firebase use --add  # Select your Firebase project

# 5. Start development servers
npm run dev          # Frontend (http://localhost:5173)
npm run functions    # Firebase Functions (http://localhost:5001)
```

## Architecture Overview

SmartCookBook is built as a modern React application with Firebase as the backend-as-a-service. The frontend uses React 19 with Vite for fast development and builds. We leverage Firebase's suite of services: Firestore for real-time data, Authentication for user management, Cloud Functions for serverless logic, and Storage for file handling.

The app follows a component-based architecture with a clear separation between UI components, business logic services, and data management. We use a custom hook pattern for state management and API calls, making components focused on presentation while services handle data operations.

Our unique features include AI-powered invoice processing using Vision API, voice dictation for hands-free kitchen use, and an automated website generation system. The codebase is extensively tested with Vitest, ensuring reliability across our 110,000+ lines of code.

## Key Directories

```
app-new/
├── src/
│   ├── components/          # 112 reusable UI components
│   ├── services/           # 92 business logic services
│   ├── pages/              # 35 main application pages
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Helper functions and utilities
│   └── types/              # TypeScript type definitions
functions/                  # Firebase Cloud Functions
scripts/autopilot/         # AI agent automation system
dashboard/                 # Electron Command Center app
docs/                      # All project documentation
website/                   # Next.js public website
```

## Development Workflow

### Daily Development
```bash
# Start dev environment
npm run dev

# Run tests (always run after changes!)
npm test
npm run test:watch  # Watch mode during development

# Type checking
npm run type-check

# Linting
npm run lint
```

### Deployment
```bash
# Deploy functions only
npm run deploy:functions

# Deploy hosting only
npm run deploy:hosting

# Full deployment
npm run deploy
```

## Common Development Tasks

### Adding a New Page
1. Create component in `app-new/src/pages/NewPage/`
2. Add route in `app-new/src/App.tsx`
3. Create corresponding test file `NewPage.test.tsx`
4. Update navigation if needed

### Adding a Service
1. Create service in `app-new/src/services/newService.js`
2. Follow existing patterns (async/await, error handling)
3. Add comprehensive tests in `__tests__/` directory
4. Import and use in components via custom hooks

### Adding a Component
1. Create in appropriate `app-new/src/components/` subdirectory
2. Use TypeScript interfaces for props
3. Include JSDoc comments for complex logic
4. Add Storybook stories if UI-focused
5. Write unit tests covering main functionality

### Working with Firebase
```javascript
// Firestore operations
import { db } from '../config/firebase';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

// Authentication
import { useAuthContext } from '../contexts/AuthContext';
const { user, loading } = useAuthContext();

// Cloud Functions
import { httpsCallable } from 'firebase/functions';
const myFunction = httpsCallable(functions, 'myFunction');
```

## Where to Find Things

### Documentation
- **Main docs**: `docs/` directory
- **API docs**: `docs/api/`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Testing guide**: `docs/TESTING.md`

### Key Configuration Files
- **Vite config**: `app-new/vite.config.js`
- **Firebase config**: `app-new/src/config/firebase.js`
- **Test config**: `app-new/vitest.config.js`
- **Environment**: `app-new/.env.local`

### Important Entry Points
- **App root**: `app-new/src/App.tsx`
- **Main layout**: `app-new/src/components/Layout/`
- **Authentication**: `app-new/src/contexts/AuthContext.tsx`
- **Global styles**: `app-new/src/index.css`

## Coding Conventions

### General Principles
- **Components**: PascalCase, functional components with hooks
- **Files**: Match component names, use `.tsx` for React components
- **Services**: camelCase, async/await pattern, comprehensive error handling
- **Tests**: Co-located with components, descriptive test names
- **Imports**: Absolute imports from `src/`, group by external/internal

### TypeScript
- Use interfaces for component props and data structures
- Prefer type inference over explicit typing where clear
- Always type service function parameters and returns
- Use enums for constants with multiple values

### React Patterns
- Custom hooks for reusable logic (prefix with `use`)
- Context for global state, local state for component-specific data
- Error boundaries for graceful error handling
- Lazy loading for route-based code splitting

### Firebase Patterns
- Always handle loading and error states
- Use real-time listeners sparingly (prefer one-time reads)
- Batch writes when updating multiple documents
- Follow security rules - never trust client-side data

## Getting Help

- **Slack**: #dev-smartcookbook channel
- **Code reviews**: All PRs require review
- **Documentation**: Check `docs/` first, then ask the team
- **Bugs**: Create GitHub issues with reproduction steps
- **Questions**: Don't hesitate to ask - we're here to help!

## Next Steps

1. Run through the setup process above
2. Explore the codebase starting with `app-new/src/App.tsx`
3. Run the test suite to understand our testing patterns
4. Pick up a "good first issue" from our backlog
5. Join the next team standup to introduce yourself

Welcome to the team! 🍳
