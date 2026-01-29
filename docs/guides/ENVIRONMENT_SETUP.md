# SmartCookBook Environment Setup Guide

Complete guide for setting up all environment variables, credentials, and configuration files.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables Reference](#environment-variables-reference)
3. [Firebase Configuration](#firebase-configuration)
4. [Google Cloud Setup](#google-cloud-setup)
5. [Cloud Functions Secrets](#cloud-functions-secrets)
6. [QuickBooks Configuration](#quickbooks-configuration)
7. [Local Development](#local-development)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Copy Environment Template

```bash
cd app-new
cp .env.example .env.local
```

### 2. Fill in Required Variables

Edit `.env.local` with your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Start Development Server

```bash
npm run dev
```

---

## Environment Variables Reference

### Frontend Variables (app-new/.env.local)

All frontend environment variables must be prefixed with `VITE_` to be exposed to the client.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain (e.g., `project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | No | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | No | Firebase Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | No | Firebase app ID |
| `VITE_CLAUDE_API_KEY` | No | Claude API key (deprecated - use Cloud Functions) |
| `VITE_APP_NAME` | No | Application display name |
| `VITE_APP_ENV` | No | Environment identifier (`development`, `production`) |

### Cloud Functions Secrets (Firebase Secrets Manager)

These are stored securely in Firebase and accessed via Cloud Functions:

| Secret | Required | Description |
|--------|----------|-------------|
| `CLAUDE_API_KEY` | Yes | Anthropic Claude API key |
| `QUICKBOOKS_CLIENT_ID` | No | QuickBooks production OAuth client ID |
| `QUICKBOOKS_CLIENT_SECRET` | No | QuickBooks production OAuth client secret |
| `QUICKBOOKS_CLIENT_ID_SANDBOX` | No | QuickBooks sandbox OAuth client ID |
| `QUICKBOOKS_CLIENT_SECRET_SANDBOX` | No | QuickBooks sandbox OAuth client secret |

### Example .env.local File

```env
# ===========================================
# Firebase Configuration
# Get these from: Firebase Console > Project Settings > General > Your apps
# ===========================================
VITE_FIREBASE_API_KEY=AIzaSyB1234567890abcdefghijklmnop
VITE_FIREBASE_AUTH_DOMAIN=smartcookbook-2afe2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=smartcookbook-2afe2
VITE_FIREBASE_STORAGE_BUCKET=smartcookbook-2afe2.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456

# ===========================================
# Application Configuration
# ===========================================
VITE_APP_NAME=SmartCookBook
VITE_APP_ENV=development
```

---

## Firebase Configuration

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add Project**
3. Enter project name: `SmartCookBook`
4. Disable Google Analytics (optional)
5. Click **Create Project**

### Step 2: Register Web App

1. In Firebase Console, click the **Web** icon (`</>`)
2. Enter app nickname: `SmartCookBook Web`
3. Check **Also set up Firebase Hosting**
4. Click **Register app**
5. **Copy the configuration values** - you'll need these for `.env.local`

```javascript
// These values go in your .env.local file
const firebaseConfig = {
  apiKey: "...",           // VITE_FIREBASE_API_KEY
  authDomain: "...",       // VITE_FIREBASE_AUTH_DOMAIN
  projectId: "...",        // VITE_FIREBASE_PROJECT_ID
  storageBucket: "...",    // VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "...", // VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "..."             // VITE_FIREBASE_APP_ID
};
```

### Step 3: Enable Authentication

1. Go to **Build > Authentication**
2. Click **Get Started**
3. Go to **Sign-in method** tab
4. Enable **Email/Password** provider
5. (Optional) Enable **Google** provider

### Step 4: Create Firestore Database

1. Go to **Build > Firestore Database**
2. Click **Create database**
3. Select **Start in production mode**
4. Choose location: `us-central` (or nearest)
5. Click **Enable**

### Step 5: Deploy Security Rules

```bash
# From project root
firebase deploy --only firestore:rules
```

### Step 6: Enable Firebase Hosting

```bash
# Initialize hosting (if not done)
firebase init hosting

# Deploy frontend
cd app-new && npm run build
cd .. && firebase deploy --only hosting
```

---

## Google Cloud Setup

Google Cloud is used for Speech-to-Text voice recognition.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing Firebase project
3. Enable billing (required, but has free tier)

### Step 2: Enable Speech-to-Text API

1. Go to **APIs & Services > Library**
2. Search for **Cloud Speech-to-Text API**
3. Click **Enable**

### Step 3: Create Service Account

1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Name: `smartcookbook-speech`
4. Role: **Cloud Speech Client**
5. Click **Done**

### Step 4: Generate JSON Key

1. Click on the service account
2. Go to **Keys** tab
3. Click **Add Key > Create new key**
4. Select **JSON** format
5. Download and save as `google-cloud-credentials.json`

### Step 5: Store Credentials Securely

**For local development:**
```bash
# Save to project root (gitignored)
mv ~/Downloads/smartcookbook-*.json ./google-cloud-credentials.json
```

**For production:**
Upload to Firebase Cloud Functions environment or use Secret Manager.

### Pricing

| Usage | Cost |
|-------|------|
| First 60 minutes/month | FREE |
| After 60 minutes | $0.006 per 15 seconds |

Typical usage: ~$0-$1/month for small restaurants.

---

## Cloud Functions Secrets

Cloud Functions use Firebase Secrets Manager for secure credential storage.

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

### Step 2: Set Claude API Key

```bash
# Set the Claude API key secret
firebase functions:secrets:set CLAUDE_API_KEY

# When prompted, paste your Anthropic API key
```

### Step 3: Set QuickBooks Credentials (Optional)

```bash
# Sandbox credentials (for testing)
firebase functions:secrets:set QUICKBOOKS_CLIENT_ID_SANDBOX
firebase functions:secrets:set QUICKBOOKS_CLIENT_SECRET_SANDBOX

# Production credentials
firebase functions:secrets:set QUICKBOOKS_CLIENT_ID
firebase functions:secrets:set QUICKBOOKS_CLIENT_SECRET
```

### Step 4: Deploy Cloud Functions

```bash
firebase deploy --only functions
```

### Step 5: Verify Secrets

```bash
# List all secrets
firebase functions:secrets:access CLAUDE_API_KEY

# Check function logs
firebase functions:log
```

---

## QuickBooks Configuration

### Step 1: Create Intuit Developer Account

1. Go to [Intuit Developer](https://developer.intuit.com/)
2. Sign up or sign in
3. Create a new app

### Step 2: Configure OAuth

1. Go to your app's **Keys & credentials**
2. Copy **Client ID** and **Client Secret**
3. Add redirect URI: `https://us-central1-smartcookbook-2afe2.cloudfunctions.net/quickbooksCallback`

### Step 3: Set Environment

**Sandbox (Testing):**
- Uses sandbox company data
- Set credentials with `_SANDBOX` suffix

**Production:**
- Requires Intuit app review/approval
- Uses real QuickBooks data

### Step 4: Store in Firebase Secrets

```bash
# For sandbox testing
firebase functions:secrets:set QUICKBOOKS_CLIENT_ID_SANDBOX
firebase functions:secrets:set QUICKBOOKS_CLIENT_SECRET_SANDBOX

# For production (after approval)
firebase functions:secrets:set QUICKBOOKS_CLIENT_ID
firebase functions:secrets:set QUICKBOOKS_CLIENT_SECRET
```

---

## Local Development

### Prerequisites

- Node.js 18+ installed
- npm or yarn
- Firebase CLI installed
- Git

### Setup Steps

```bash
# 1. Clone repository
git clone <repo-url>
cd SmartCookBook

# 2. Install dependencies
cd app-new && npm install
cd ../functions && npm install
cd ..

# 3. Copy environment file
cp app-new/.env.example app-new/.env.local

# 4. Edit .env.local with your Firebase config
code app-new/.env.local

# 5. Start development server
cd app-new && npm run dev
```

### Running Cloud Functions Locally

```bash
# Start Firebase emulators
firebase emulators:start --only functions

# Or with all emulators
firebase emulators:start
```

### Environment Files

| File | Purpose | Git |
|------|---------|-----|
| `.env.example` | Template with placeholder values | Committed |
| `.env.local` | Local development values | Ignored |
| `.env.production` | Production values (if needed) | Ignored |

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All environment variables set in `.env.local`
- [ ] Firebase secrets configured
- [ ] Firestore security rules deployed
- [ ] Firebase Hosting configured

### Deploy Commands

```bash
# Build frontend
cd app-new && npm run build

# Deploy everything
cd .. && firebase deploy

# Or deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

### Verify Deployment

1. Check hosting: https://smartcookbook-2afe2.web.app
2. Check functions: Firebase Console > Functions
3. Check logs: `firebase functions:log`

---

## Troubleshooting

### "Missing Firebase config" Warning

**Cause:** Environment variables not set or wrong prefix.

**Solution:**
1. Ensure `.env.local` exists in `app-new/` directory
2. All variables must start with `VITE_`
3. Restart dev server after changes

### "Permission denied" in Firestore

**Cause:** Security rules blocking access.

**Solution:**
1. Check if user is authenticated
2. Verify rules match data structure
3. Deploy updated rules: `firebase deploy --only firestore:rules`

### "Claude API error 401"

**Cause:** Invalid or missing API key.

**Solution:**
1. Verify secret is set: `firebase functions:secrets:access CLAUDE_API_KEY`
2. Redeploy functions: `firebase deploy --only functions`
3. Check function logs for errors

### "QuickBooks connection failed"

**Cause:** Invalid OAuth credentials or redirect URI.

**Solution:**
1. Verify Client ID and Secret are correct
2. Check redirect URI matches exactly
3. Ensure using correct environment (sandbox vs production)

### "Speech-to-Text not working"

**Cause:** Google Cloud credentials not configured.

**Solution:**
1. Verify API is enabled in Google Cloud Console
2. Check service account has correct permissions
3. Ensure credentials file is in correct location

### Environment Variable Not Available

**Cause:** Missing `VITE_` prefix or server restart needed.

**Solution:**
```bash
# Ensure variable has VITE_ prefix
VITE_MY_VARIABLE=value  # Correct
MY_VARIABLE=value       # Won't work in frontend

# Restart dev server
npm run dev
```

---

## Security Best Practices

### DO:
- Use Firebase Secrets for API keys
- Keep `.env.local` in `.gitignore`
- Use environment-specific files
- Rotate credentials periodically

### DON'T:
- Commit secrets to Git
- Expose API keys in frontend code
- Share credentials via email/chat
- Use production keys in development

---

## Environment Files Summary

```
SmartCookBook/
├── app-new/
│   ├── .env.example      # Template (committed)
│   ├── .env.local        # Local dev (ignored)
│   └── .env.production   # Production (ignored)
├── functions/
│   └── (uses Firebase Secrets)
├── google-cloud-credentials.json  # Speech API (ignored)
├── firebase.json         # Firebase config (committed)
└── firestore.rules       # Security rules (committed)
```

---

*Last Updated: 2025-12-07*
