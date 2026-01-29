# SmartCookBook Deployment Checklist

Step-by-step deployment guide with pre-flight verification, post-deployment smoke tests, and rollback procedures.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Steps](#deployment-steps)
4. [Post-Deployment Smoke Tests](#post-deployment-smoke-tests)
5. [Rollback Procedures](#rollback-procedures)
6. [Emergency Contacts](#emergency-contacts)

---

## Quick Reference

### Deployment Commands

```bash
# Full deployment
cd app-new && npm run build && cd .. && firebase deploy

# Frontend only
firebase deploy --only hosting

# Functions only
firebase deploy --only functions

# Security rules only
firebase deploy --only firestore:rules

# Rollback hosting (last 5 versions available)
firebase hosting:clone smartcookbook-2afe2:live smartcookbook-2afe2:rollback
```

### Key URLs

| Environment | URL |
|-------------|-----|
| Production | https://smartcookbook-2afe2.web.app |
| Firebase Console | https://console.firebase.google.com/project/smartcookbook-2afe2 |
| Functions Logs | https://console.cloud.google.com/logs |
| Firestore | https://console.firebase.google.com/project/smartcookbook-2afe2/firestore |

---

## Pre-Deployment Checklist

### 1. Code Verification

#### 1.1 Build Check
```bash
cd app-new
npm run build
```

- [ ] Build completes without errors
- [ ] Build completes without warnings (or warnings are acceptable)
- [ ] `dist/` folder is created
- [ ] `dist/index.html` exists
- [ ] `dist/assets/` contains JS and CSS files

#### 1.2 Lint Check
```bash
npm run lint
```

- [ ] No ESLint errors
- [ ] No critical warnings

#### 1.3 Test Suite
```bash
npm run test:run
```

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Test coverage meets minimum threshold (if configured)

#### 1.4 Type Check (if TypeScript)
```bash
npm run typecheck
```

- [ ] No type errors

---

### 2. Environment Verification

#### 2.1 Environment Variables

**Frontend (.env.production or .env.local):**
- [ ] `VITE_FIREBASE_API_KEY` is set
- [ ] `VITE_FIREBASE_AUTH_DOMAIN` is set
- [ ] `VITE_FIREBASE_PROJECT_ID` is set
- [ ] `VITE_FIREBASE_STORAGE_BUCKET` is set
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID` is set
- [ ] `VITE_FIREBASE_APP_ID` is set

**Verify values are production (not development):**
```bash
# Check .env.production exists and has values
cat app-new/.env.production | grep -v "^#" | grep -v "^$"
```

#### 2.2 Firebase Secrets

```bash
# List configured secrets
firebase functions:secrets:access CLAUDE_API_KEY

# Verify all required secrets are set
```

- [ ] `CLAUDE_API_KEY` is set and valid
- [ ] `QUICKBOOKS_CLIENT_ID_SANDBOX` is set (if using QB sandbox)
- [ ] `QUICKBOOKS_CLIENT_SECRET_SANDBOX` is set (if using QB sandbox)
- [ ] `QUICKBOOKS_CLIENT_ID` is set (if using QB production)
- [ ] `QUICKBOOKS_CLIENT_SECRET` is set (if using QB production)

---

### 3. Security Verification

#### 3.1 Firestore Rules

```bash
# Review current rules
cat firestore.rules
```

- [ ] Rules are not in test mode (no `allow read, write: if true`)
- [ ] User isolation is enforced (`request.auth.uid == userId`)
- [ ] No public write access to sensitive collections
- [ ] QuickBooks tokens are protected (only Cloud Functions access)

#### 3.2 API Keys

- [ ] No API keys hardcoded in source code
- [ ] `.env.local` and `.env.production` are in `.gitignore`
- [ ] `google-cloud-credentials.json` is in `.gitignore`
- [ ] No secrets in `dist/` folder after build

```bash
# Check for exposed secrets in build
grep -r "sk-ant" app-new/dist/ || echo "No Claude keys found"
grep -r "AIzaSy" app-new/dist/ | head -5  # Firebase keys are OK (public)
```

#### 3.3 CORS Configuration

- [ ] `functions/index.js` has correct ALLOWED_ORIGINS
- [ ] Production URL is in allowed origins
- [ ] Localhost is only allowed in development

---

### 4. Database Verification

#### 4.1 Firestore Indexes

```bash
# Check if indexes are deployed
firebase firestore:indexes
```

- [ ] Required composite indexes are deployed
- [ ] No pending index builds

#### 4.2 Data Backup

- [ ] Recent Firestore backup exists (if applicable)
- [ ] Backup verified (can restore if needed)

```bash
# Export Firestore data (optional pre-deploy backup)
gcloud firestore export gs://smartcookbook-2afe2-backups/pre-deploy-$(date +%Y%m%d)
```

---

### 5. Dependencies Verification

#### 5.1 Package Audit

```bash
cd app-new && npm audit
cd ../functions && npm audit
```

- [ ] No critical vulnerabilities
- [ ] No high vulnerabilities (or acknowledged)

#### 5.2 Outdated Packages

```bash
npm outdated
```

- [ ] No security-critical packages outdated
- [ ] Major version updates reviewed

---

### 6. Performance Verification

#### 6.1 Bundle Size

```bash
# Check bundle size after build
ls -la app-new/dist/assets/*.js
```

- [ ] Main bundle < 500KB (gzipped)
- [ ] No unexpected large chunks
- [ ] Code splitting working (multiple chunks)

#### 6.2 Lighthouse Check (Local)

- [ ] Performance score > 80
- [ ] Accessibility score > 90
- [ ] Best Practices score > 90
- [ ] SEO score > 80

---

### 7. Documentation Verification

- [ ] CHANGELOG.md updated with release notes
- [ ] Version number updated (if applicable)
- [ ] API changes documented
- [ ] Breaking changes noted

---

## Deployment Steps

### Step 1: Final Local Test

```bash
# Build and serve locally
cd app-new
npm run build
npm run preview
```

1. Open http://localhost:4173 in browser
2. Test critical flows (see smoke tests below)
3. Verify no console errors

### Step 2: Git Status Check

```bash
git status
git log -1 --oneline
```

- [ ] Working directory is clean
- [ ] On correct branch (main/master)
- [ ] Latest commit is the one to deploy

### Step 3: Deploy to Firebase

#### Option A: Full Deploy (Hosting + Functions + Rules)

```bash
cd C:\SmartCookBook
firebase deploy
```

#### Option B: Staged Deploy (Safer)

```bash
# Step 1: Deploy Firestore rules first
firebase deploy --only firestore:rules

# Step 2: Deploy Cloud Functions
firebase deploy --only functions

# Step 3: Deploy Frontend (hosting)
cd app-new && npm run build && cd ..
firebase deploy --only hosting
```

### Step 4: Verify Deployment

```bash
# Check deployment status
firebase hosting:channel:list

# View function logs
firebase functions:log --only claudeProxy
```

### Step 5: Tag Release (Optional)

```bash
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0
```

---

## Post-Deployment Smoke Tests

Run these tests immediately after deployment to verify critical functionality.

### Automated Smoke Test Script

```bash
#!/bin/bash
# smoke-test.sh

PROD_URL="https://smartcookbook-2afe2.web.app"
FUNCTIONS_URL="https://us-central1-smartcookbook-2afe2.cloudfunctions.net"

echo "=== SmartCookBook Smoke Tests ==="
echo ""

# Test 1: Frontend loads
echo -n "1. Frontend loads: "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL)
if [ "$HTTP_CODE" = "200" ]; then
  echo "PASS ($HTTP_CODE)"
else
  echo "FAIL ($HTTP_CODE)"
fi

# Test 2: Index.html contains app
echo -n "2. App content present: "
if curl -s $PROD_URL | grep -q "SmartCookBook"; then
  echo "PASS"
else
  echo "FAIL"
fi

# Test 3: Claude Proxy responds
echo -n "3. Claude Proxy available: "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS $FUNCTIONS_URL/claudeProxy)
if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "PASS ($HTTP_CODE)"
else
  echo "FAIL ($HTTP_CODE)"
fi

# Test 4: QuickBooks Status endpoint
echo -n "4. QuickBooks Status available: "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FUNCTIONS_URL/quickbooksStatus?environment=sandbox")
if [ "$HTTP_CODE" = "200" ]; then
  echo "PASS ($HTTP_CODE)"
else
  echo "FAIL ($HTTP_CODE)"
fi

# Test 5: Static assets load
echo -n "5. JS bundle loads: "
JS_URL=$(curl -s $PROD_URL | grep -oP 'src="(/assets/index-[^"]+\.js)"' | head -1 | cut -d'"' -f2)
if [ -n "$JS_URL" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL$JS_URL")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "PASS"
  else
    echo "FAIL ($HTTP_CODE)"
  fi
else
  echo "FAIL (no JS found)"
fi

echo ""
echo "=== Smoke Tests Complete ==="
```

### Manual Smoke Tests

#### Critical Path Tests (Must Pass)

| # | Test | Steps | Expected Result | Pass |
|---|------|-------|-----------------|------|
| 1 | **App Loads** | Navigate to production URL | Landing page displays, no errors | [ ] |
| 2 | **Demo Mode** | Click "Try Demo" | Enters demo mode, recipes page loads | [ ] |
| 3 | **View Recipe** | Click any recipe card | Recipe detail page displays | [ ] |
| 4 | **Create Recipe** | Click New Recipe, fill form, save | Recipe created and appears in list | [ ] |
| 5 | **Edit Recipe** | Open recipe, edit name, save | Changes persist after refresh | [ ] |
| 6 | **Delete Recipe** | Open recipe, delete | Recipe removed from list | [ ] |
| 7 | **Search** | Type in search bar | Recipes filter correctly | [ ] |
| 8 | **Category Filter** | Select category dropdown | Recipes filter by category | [ ] |
| 9 | **Offline Mode** | Disable network, browse app | Existing recipes still accessible | [ ] |
| 10 | **Voice Toggle** | Click microphone button | Voice mode activates (if mic allowed) | [ ] |

#### Secondary Tests (Should Pass)

| # | Test | Steps | Expected Result | Pass |
|---|------|-------|-----------------|------|
| 11 | **PDF Import** | Upload PDF recipe | Claude parses recipe | [ ] |
| 12 | **Image Import** | Upload recipe image | Claude extracts recipe | [ ] |
| 13 | **Ingredient Voice** | Use voice input for ingredients | Text transcribed | [ ] |
| 14 | **Method Steps** | Add/edit/reorder steps | Changes save correctly | [ ] |
| 15 | **Settings Page** | Navigate to settings | Settings page loads | [ ] |
| 16 | **QuickBooks Connect** | Click Connect (sandbox) | OAuth flow starts | [ ] |
| 17 | **Control Panel** | Open control panel | Department/category management works | [ ] |
| 18 | **Task List** | View department tasks | Tasks display correctly | [ ] |

#### Console Error Check

1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate through app
4. Record any errors:

- [ ] No JavaScript errors
- [ ] No network 4xx/5xx errors (except expected)
- [ ] No CORS errors
- [ ] No Firebase permission errors

---

### Performance Verification

#### Load Time Check

| Metric | Target | Actual | Pass |
|--------|--------|--------|------|
| First Contentful Paint | < 2s | ___s | [ ] |
| Largest Contentful Paint | < 3s | ___s | [ ] |
| Time to Interactive | < 4s | ___s | [ ] |
| Total Bundle Size | < 2MB | ___MB | [ ] |

#### Mobile Test

- [ ] Test on mobile device (or Chrome mobile emulation)
- [ ] Touch interactions work
- [ ] Text is readable without zooming
- [ ] No horizontal scroll issues

---

## Rollback Procedures

### Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| **P0** | App completely down, data loss | Immediate rollback |
| **P1** | Critical feature broken, major users affected | Rollback within 1 hour |
| **P2** | Non-critical feature broken | Fix forward or rollback |
| **P3** | Minor issue, cosmetic | Fix in next release |

### Rollback Decision Tree

```
Is the app completely inaccessible?
├── YES → Rollback Hosting immediately (Procedure A)
└── NO
    ├── Is there data corruption/loss?
    │   ├── YES → Rollback + Restore backup (Procedure D)
    │   └── NO
    │       ├── Is a Cloud Function broken?
    │       │   ├── YES → Rollback Functions (Procedure B)
    │       │   └── NO
    │       │       ├── Are security rules broken?
    │       │       │   ├── YES → Rollback Rules (Procedure C)
    │       │       │   └── NO → Evaluate fix-forward
    │       │       └──
    │       └──
    └──
```

---

### Procedure A: Rollback Hosting (Frontend)

**When:** Frontend is broken, app won't load, JavaScript errors

**Time:** ~2 minutes

```bash
# Step 1: List recent deployments
firebase hosting:channel:list

# Step 2: Find the last working version
# Go to Firebase Console > Hosting > Release History
# Note the version ID (e.g., "abc123def")

# Step 3: Rollback to previous version
firebase hosting:rollback

# OR clone a specific version
firebase hosting:clone smartcookbook-2afe2:VERSION_ID smartcookbook-2afe2:live
```

**Verify:**
1. Refresh production URL
2. Run smoke tests
3. Confirm app is functional

---

### Procedure B: Rollback Cloud Functions

**When:** API endpoints returning errors, Claude proxy broken, QuickBooks broken

**Time:** ~5 minutes

```bash
# Step 1: Check function logs for errors
firebase functions:log --only claudeProxy

# Step 2: If you have the previous functions code in git
git log --oneline functions/index.js  # Find last good commit
git checkout COMMIT_HASH -- functions/index.js

# Step 3: Redeploy functions
firebase deploy --only functions

# OR if you need to rollback to a specific version from Console:
# 1. Go to Google Cloud Console > Cloud Functions
# 2. Select the function
# 3. Click "Edit"
# 4. Under "Source code", select previous version
# 5. Deploy
```

**Alternative - Disable Function:**
```bash
# Temporarily disable a broken function
# (Users will see error, but won't crash app)
gcloud functions delete claudeProxy --region=us-central1
```

**Verify:**
```bash
# Test the function
curl -X POST https://us-central1-smartcookbook-2afe2.cloudfunctions.net/claudeProxy \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","messages":[{"role":"user","content":"test"}]}'
```

---

### Procedure C: Rollback Security Rules

**When:** Permission errors, users can't read/write data, security breach

**Time:** ~3 minutes

```bash
# Step 1: Check current rules
firebase firestore:rules:get

# Step 2: If you have previous rules in git
git log --oneline firestore.rules
git checkout COMMIT_HASH -- firestore.rules

# Step 3: Deploy previous rules
firebase deploy --only firestore:rules

# OR use emergency permissive rules (TEMPORARY ONLY)
# WARNING: This opens database to all authenticated users
cat > firestore.rules.emergency << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
EOF

firebase deploy --only firestore:rules
```

**Verify:**
1. Try to read/write data in app
2. Check Firebase Console > Firestore > Rules playground

**Important:** If using emergency rules, fix and redeploy proper rules ASAP!

---

### Procedure D: Restore Data from Backup

**When:** Data corruption, accidental mass deletion

**Time:** ~15-30 minutes

```bash
# Step 1: Identify the backup to restore
gsutil ls gs://smartcookbook-2afe2-backups/

# Step 2: Import the backup
gcloud firestore import gs://smartcookbook-2afe2-backups/BACKUP_NAME

# Note: This OVERWRITES current data
# Consider importing to a different project first to verify
```

**Partial Restore (Specific Collection):**
```bash
# Export specific collection from backup
gcloud firestore import gs://smartcookbook-2afe2-backups/BACKUP_NAME \
  --collection-ids=recipes

# This only restores the 'recipes' collection
```

---

### Procedure E: Emergency Maintenance Mode

**When:** Need to prevent user access while fixing issues

**Time:** ~2 minutes

```bash
# Create maintenance page
cat > app-new/dist/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>SmartCookBook - Maintenance</title>
  <style>
    body { font-family: system-ui; text-align: center; padding: 50px; }
    h1 { color: #e74c3c; }
  </style>
</head>
<body>
  <h1>Scheduled Maintenance</h1>
  <p>SmartCookBook is currently undergoing maintenance.</p>
  <p>We expect to be back online shortly.</p>
  <p>Thank you for your patience.</p>
</body>
</html>
EOF

# Deploy maintenance page
firebase deploy --only hosting
```

**Remove Maintenance Mode:**
```bash
# Rebuild and redeploy normal app
cd app-new && npm run build && cd ..
firebase deploy --only hosting
```

---

## Post-Rollback Actions

### Immediate (Within 1 hour)

- [ ] Notify stakeholders of rollback
- [ ] Document what went wrong
- [ ] Create incident ticket/issue
- [ ] Monitor logs for any continuing issues

### Short-term (Within 24 hours)

- [ ] Root cause analysis
- [ ] Fix the issue in development
- [ ] Test fix thoroughly
- [ ] Plan re-deployment

### Long-term (Within 1 week)

- [ ] Post-mortem meeting
- [ ] Update deployment checklist if needed
- [ ] Add tests for the failure case
- [ ] Improve monitoring/alerting

---

## Emergency Contacts

| Role | Name | Contact | Availability |
|------|------|---------|--------------|
| Primary Developer | [Name] | [Email/Phone] | [Hours] |
| Firebase Admin | [Name] | [Email/Phone] | [Hours] |
| On-Call | [Rotation] | [PagerDuty/etc] | 24/7 |

### External Support

| Service | Support URL | Account |
|---------|-------------|---------|
| Firebase | https://firebase.google.com/support | [Project ID] |
| Anthropic (Claude) | https://support.anthropic.com | [Account] |
| QuickBooks | https://developer.intuit.com/support | [App ID] |

---

## Deployment History

| Date | Version | Deployed By | Notes |
|------|---------|-------------|-------|
| YYYY-MM-DD | v1.0.0 | [Name] | Initial production release |
| | | | |

---

*Last Updated: 2025-12-07*
