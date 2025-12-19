# SmartCookBook

A professional kitchen management application with recipe management, invoice processing, QuickBooks integration, voice recognition, and multi-user support.

## Live App

**https://smartcookbook-2afe2.web.app**

Works on PC, tablet, phone, or any device with internet.

---

## Features

### Recipe Management
- Create, edit, and view recipes with ingredients, methods, notes, and plating instructions
- Voice-enabled search and bulk ingredient dictation
- PDF/Image import with AI-powered parsing (Claude)
- Category organization and filtering
- Cloud sync across all devices

### Invoice Processing
- Upload supplier invoices (PDF/images)
- AI-powered invoice parsing extracts vendor, items, quantities, and totals
- Automatic supplier matching
- QuickBooks Online integration for bill creation

### QuickBooks Integration
- OAuth 2.0 secure connection
- Automatic vendor creation/matching
- Bill creation from parsed invoices
- Supports sandbox and production environments

### User Management
- Firebase Authentication (email/password)
- Role-based access control (Owner, Admin, Staff)
- Department assignment (Kitchen, Pastry, etc.)
- PIN-based quick login for tablets
- User privilege management

### Task Management
- Assign tasks to users
- Department-based task views
- Task status tracking

### Voice Recognition
- Recipe search by voice
- Bulk ingredient dictation
- Field-level voice input
- Google Cloud Speech-to-Text (works on tablets)

---

## Quick Start

### Cloud Version (Recommended)

Access from anywhere - no local servers needed:

**https://smartcookbook-2afe2.web.app**

### Local Development

```bash
# Start development servers
start-all.bat
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

---

## Project Structure

```
SmartCookBook/
├── app-new/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/        # Auth, User contexts
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   └── styles/          # CSS modules
│   └── public/              # Static assets
├── backend/                 # Express.js server
│   └── server.js            # Speech API proxy
├── functions/               # Firebase Cloud Functions
│   └── index.js             # QuickBooks OAuth & API
├── docs/                    # Documentation
├── firebase.json            # Firebase config
└── firestore.rules          # Security rules
```

---

## Tech Stack

- **Frontend**: React 18, Vite, React Router, CSS Modules
- **Backend**: Express.js, Firebase Cloud Functions
- **Database**: Firebase Firestore, IndexedDB (offline)
- **Authentication**: Firebase Auth
- **Cloud**: Firebase Hosting, Google Cloud Run
- **AI**: Claude API (invoice/recipe parsing)
- **Voice**: Google Cloud Speech-to-Text
- **Accounting**: QuickBooks Online API

---

## Configuration

### Environment Variables

**app-new/.env.local:**
```bash
VITE_PROXY_URL=http://localhost:3000/api/claude
VITE_SPEECH_API_URL=http://localhost:3000
```

### Firebase Cloud Functions

```bash
# QuickBooks credentials (set via Firebase CLI)
firebase functions:config:set quickbooks.client_id="YOUR_ID"
firebase functions:config:set quickbooks.client_secret="YOUR_SECRET"
firebase functions:config:set quickbooks.redirect_uri="https://YOUR_PROJECT.web.app/settings"
firebase functions:config:set quickbooks.environment="sandbox"  # or "production"

# Claude API key
firebase functions:config:set claude.api_key="YOUR_KEY"
```

---

## Documentation

See `docs/` folder:

| Guide | Description |
|-------|-------------|
| [Cloud Deployment](docs/CLOUD_DEPLOYMENT_GUIDE.md) | Firebase/Cloud Run setup |
| [Google Cloud Setup](docs/GOOGLE_CLOUD_SETUP.md) | Speech API credentials |
| [Firestore Security](docs/FIRESTORE_SECURITY.md) | Security rules |
| [Voice Recognition](docs/VOICE_RECOGNITION_GUIDE.md) | Voice features & setup |
| [PDF Import](docs/PDF_IMPORT_GUIDE.md) | Import recipes from PDFs |
| [QuickBooks Integration](docs/INVOICE_QUICKBOOKS_FEASIBILITY.md) | Invoice/QB setup |
| [Components](docs/COMPONENT_BEHAVIOR_GUIDE.md) | React component reference |
| [Utilities](docs/UTILITIES_GUIDE.md) | Utility functions reference |

---

## Deployment

### Frontend (Firebase Hosting)

```bash
cd app-new
npm run build
firebase deploy --only hosting
```

### Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

---

**Version:** 3.0
**Last Updated:** 2025-12-06
