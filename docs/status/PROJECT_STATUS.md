# SmartCookBook - Project Status Report

**Report Date:** January 27, 2026
**Version:** 2.0 (Pre-release)
**Live URL:** https://smartcookbook-2afe2.web.app
**Public Website:** https://kitchencommand-website.vercel.app

---

## Executive Summary

SmartCookBook is a comprehensive kitchen management system designed for commercial kitchens. The application provides recipe management, AI-powered invoice processing, inventory tracking, purchase order generation, team task management, and auto-generated public websites with an offline-first architecture.

### Key Metrics

| Metric | Value |
|--------|-------|
| **Total Source Files** | 310+ JS/JSX/TS files |
| **Lines of Code** | ~200,000+ |
| **Test Files** | 63 |
| **Tests Passing** | 1,921 |
| **Test Success Rate** | 100% |
| **Components** | 115+ React components |
| **Services** | 130+ service files |
| **Pages** | 32 pages |

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + Vite 7 | SPA Framework |
| Styling | CSS Modules | Scoped styling |
| State | React Context + Hooks | State management |
| Local DB | IndexedDB (Dexie) | Offline-first storage |
| Cloud DB | Firebase Firestore | Real-time sync |
| Auth | Firebase Auth | User authentication |
| Hosting | Firebase Hosting | Static hosting |
| Backend | Firebase Cloud Functions | Serverless APIs |
| AI | Claude Vision API | Invoice parsing, recipe extraction |
| Voice | Google Cloud Speech-to-Text | Voice input |
| Accounting | QuickBooks API | Invoice sync |
| Storage | Firebase Storage | Image uploads for websites |
| Public Website | Next.js 14 + Vercel | Auto-generated store websites |

---

## Core Features

### 1. Recipe Management
- Create, edit, and organize recipes by department/category
- AI-powered recipe extraction from PDF/images
- Voice input for ingredients
- Recipe scaling with automatic cost recalculation
- Method steps with timer integration
- Recipe cost calculation linked to inventory prices

### 2. Invoice Processing System (Vision-Based)
**Modern AI-powered invoice parsing pipeline:**

| Step | Component | Function |
|------|-----------|----------|
| 1 | PDF → Images | Convert PDF pages to PNG |
| 2 | Claude Vision API | Extract structured JSON |
| 3 | JSON Normalizer | Field aliases + vendor matching |
| 4 | Type Detection | Auto-detect invoice type (food, packaging, utilities, services) |
| 5 | Handler Processing | Type-specific calculations (weight, pricing, math validation) |
| 6 | Save to Inventory | Create/update inventory items |

**Supported Invoice Types:**
- **Food Supply** - Weight-based pricing, price per gram calculations
- **Packaging Distributor** - Container/case counting, boxing format parsing
- **Utilities** - Usage units (kWh, m³), billing periods
- **Services** - Hourly rates, labor tracking
- **Generic** - Fallback for unclassified vendors

### 3. Inventory Management
- **Dual Stock Tracking**: Track by quantity AND weight simultaneously
- Automatic stock updates from invoices
- Par level alerts (critical, low, warning)
- Price history tracking
- Vendor-linked inventory items

### 4. Purchase Order System
- Auto-generate orders from low stock
- Full order lifecycle (Draft → Approved → Sent → Received)
- PDF export for vendor orders
- Receiving workflow with stock updates

### 5. Task Management
- Department-based task assignment
- Recipe task → inventory deduction cascade
- User task lists with completion tracking

### 6. Accounting Integration
- QuickBooks Online integration
- Invoice sync with line type tagging
- Vendor synchronization

### 7. Auto-Generated Public Websites (NEW)
**Complete website builder for food businesses:**

| Feature | Description |
|---------|-------------|
| **10-Step Wizard** | Business type, identity, design, about, contact, services, social, gallery, SEO, publish |
| **3 Templates** | Marche (classic), Urbain (modern), Chaleur (vibrant) |
| **Business Types** | Butcher, bakery, deli, grocery, caterer, restaurant, food truck, etc. |
| **Certifications** | Halal, kosher, organic, local, gluten-free badges |
| **Image Upload** | Firebase Storage for logos, hero images, gallery |
| **Public URL** | `kitchencommand-website.vercel.app/{slug}` |
| **SEO** | Meta title, description, keywords |

**Technical Stack:**
- Next.js 14 with ISR (5-min revalidation)
- Firestore direct queries from client
- Slug-based routing (`/slugs/{slug}` → `storeId`)
- Vercel deployment with CDN

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   React SPA (Vite)                            │  │
│  │  94 Components | 29 Pages | 4 Custom Hooks | 2 Contexts       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌──────────────────────────┼───────────────────────────────────┐  │
│  │                    SERVICE LAYER (120+ files)                 │  │
│  │  ┌────────────────┐ ┌────────────────┐ ┌─────────────────┐   │  │
│  │  │ Invoice Vision │ │   Inventory    │ │    Database     │   │  │
│  │  │  (~31 files)   │ │  (10 files)    │ │   (15 files)    │   │  │
│  │  └────────────────┘ └────────────────┘ └─────────────────┘   │  │
│  │  ┌────────────────┐ ┌────────────────┐ ┌─────────────────┐   │  │
│  │  │   AI/Claude    │ │     Tasks      │ │     Exports     │   │  │
│  │  │   (5 files)    │ │   (1 file)     │ │    (PDF gen)    │   │  │
│  │  └────────────────┘ └────────────────┘ └─────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌──────────────────────────┼───────────────────────────────────┐  │
│  │                     DATA LAYER                                │  │
│  │  ┌─────────────────────┐ ┌────────────────────────────────┐  │  │
│  │  │   IndexedDB (Dexie) │ │   Firebase Firestore           │  │  │
│  │  │   Offline-first     │ │   Cloud sync                   │  │  │
│  │  └─────────────────────┘ └────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │       CLOUD LAYER             │
              │  ┌─────────────────────────┐  │
              │  │  Firebase Cloud Functions│  │
              │  │  (~1000 lines)           │  │
              │  └─────────────────────────┘  │
              │  ┌─────────────────────────┐  │
              │  │   External Services     │  │
              │  │  Claude API | QuickBooks│  │
              │  └─────────────────────────┘  │
              └───────────────────────────────┘
```

---

## Code Quality Metrics

### Test Coverage

| Category | Files | Tests | Status |
|----------|-------|-------|--------|
| Unit Tests | 52 | ~1,200 | Passing |
| Integration Tests | 8 | ~500 | Passing |
| E2E Tests | 3 | ~200 | Passing |
| **Total** | **63** | **1,921** | **100% Pass** |

### Architectural Patterns

1. **Handler Pattern** - Type-specific invoice processing with shared base
2. **Barrel Exports** - Clean imports via index.js files
3. **Service Layer** - Thick business logic separated from UI
4. **Math Engine** - Cascade validation for financial accuracy
5. **Dual-Layer Persistence** - IndexedDB + Firestore with sync
6. **Custom Hooks** - Reusable logic abstraction (4 hooks)
7. **Context API** - Auth & access control state management

---

## Recent Accomplishments (Weeks 1-10)

### Week 1-2: Foundation
- Removed test routes from production
- Fixed scaleService.js fake success returns
- Verified task → inventory deduction cascade
- Standardized `supplierId` → `vendorId` naming
- Split indexedDB.js (5,500 → 8 focused files)
- Created AppRoutes.jsx with lazy loading

### Week 3-4: Test Coverage & Docs
- Added comprehensive unit tests
- Added integration tests (task cascade, invoice cascade)
- Added E2E tests (new user setup, invoice upload)
- JSDoc all public service functions
- Created API reference documentation

### Week 5: Invoice Architecture Cleanup
- Created INVOICE_ARCHITECTURE.md (~1300 lines)
- Removed ~2,550 lines of dead code
- Deleted unused invoiceMerger.js, invoiceService.js
- Consolidated save logic to invoiceLineService

### Week 6: Vision Parser Integration
- Built Vision-based invoice parsing pipeline
- Created field alias system for variable vendor outputs
- Integrated into InvoiceUploadPage
- **Deleted legacy parser (~2,850 lines removed)**

### Week 7: Handler Optimization
- Refactored foodSupplyHandler.js V2 pipeline
- 5-phase processing: Extract → Pricing Type → Validate → Calculate → Route
- Fixed quantity extraction (qty_invoiced field support)
- Cleaned V1 legacy code (~387 lines removed)

### Week 8: Pre-Release & Bug Fixes
- Full codebase audit (289 files, ~190k lines)
- Fixed duplicate key warnings, getEffectivePar() fallback
- Production deployment

### Week 9: Task Dependencies
- Task dependency detection for in-house ingredients
- Auto-create prerequisite tasks for shortfalls
- Production execution mode with autosave

### Week 10: Credits & Training Data
- **API Credits System**: 50 credits/month per user
  - Credit costs per operation type
  - Owner bypass for unlimited credits
  - CreditsDisplay component in Settings
- **Training Data Collection**: Invoice PDF capture for AI improvement
  - User consent checkbox on Invoice Upload page
  - Stores PDF, vision response, corrections in IndexedDB
- **Docs Modal**: Downloadable documentation PDFs
  - User Guide, Security Overview, Terms of Service
- **Legal Compliance**: Real contact info, Privacy Officer designation

### Week 11: Auto-Generated Public Websites (Latest)
- **10-Step Website Builder Wizard**
  - Complete wizard with step navigation and validation
  - Business type selection (12 types)
  - Identity setup (logo, name, tagline, year)
  - Template selection with color customization
  - About section (story, mission, certifications, team)
  - Contact info with business hours
  - Services configuration (catering, delivery, wholesale)
  - Social media integration
  - Gallery with hero images and store photos
  - SEO configuration with URL slug
  - Review and publish flow
- **Firebase Storage Setup**
  - Security rules for dish-photos and store-assets
  - CORS configuration for localhost and production
- **Next.js Public Website**
  - Deployed to Vercel at `kitchencommand-website.vercel.app`
  - Firebase SDK integration for direct Firestore queries
  - Slug-based routing for dynamic store pages
  - Marche template with dynamic colors
- **In-App Preview**
  - Full website preview within the app
  - All sections rendered with live data

---

## File Structure Summary

```
app-new/src/
├── components/        115+ files  # React UI components
│   ├── common/         25 files   # Shared UI (Button, Modal, Card...)
│   ├── inventory/      15 files   # Inventory management
│   ├── recipes/         9 files   # Recipe editing
│   ├── vendors/         6 files   # Vendor management
│   ├── orders/          9 files   # Purchase orders
│   ├── invoice/         8 files   # Invoice display
│   ├── website/        12 files   # Website builder (NEW)
│   │   ├── WebsiteBuilder.jsx
│   │   └── steps/      10 files   # 10-step wizard
│   └── ...
├── services/          130+ files  # Business logic
│   ├── invoice/        31 files   # Invoice processing system
│   │   ├── vision/      4 files   # Vision parser
│   │   ├── handlers/    9 files   # Type-specific handlers
│   │   └── mathEngine/  7 files   # Math validation
│   ├── database/       17 files   # Data persistence
│   │   ├── websiteSchema.js       # Website data schema (NEW)
│   │   └── websiteDB.js           # Website Firestore CRUD (NEW)
│   ├── inventory/      10 files   # Inventory operations
│   ├── ai/              5 files   # Claude integration
│   ├── credits/         1 file    # API credit management
│   ├── training/        1 file    # Training data collection
│   └── ...
├── pages/              32 files   # Route pages
│   ├── WebsiteBuilderPage.jsx     # Website builder (NEW)
│   └── WebsitePreviewPage.jsx     # In-app preview (NEW)
├── hooks/               4 files   # Custom React hooks
├── contexts/            2 files   # Auth & Access contexts
├── utils/              19 files   # Utility functions
├── constants/           5 files   # App constants
└── __tests__/          11 files   # Integration & E2E tests

website/                            # Public website (Next.js)
├── app/
│   ├── [slug]/page.tsx            # Dynamic store page
│   └── layout.tsx
├── components/
│   └── templates/
│       └── MarcheTemplate.tsx
└── lib/
    ├── api.ts                     # Firestore API client
    └── firebase.ts                # Firebase SDK init
```

---

## Largest Code Files

### Services (by line count)
| File | Lines | Purpose |
|------|-------|---------|
| foodSupplyHandler.js | 2,523 | Food invoice processing |
| cloudSync.js | 1,635 | Firestore sync |
| claudeRecipe.js | 1,325 | Recipe parsing AI |
| invoiceLineService.js | 1,257 | Line item operations |
| orderDB.js | 1,242 | Purchase orders DB |

### Components (by line count)
| File | Lines | Purpose |
|------|-------|---------|
| InventoryDashboard.jsx | 849 | Main inventory view |
| AddEditVendorModal.jsx | 815 | Vendor CRUD |
| MethodSteps.jsx | 791 | Recipe method steps |
| IngredientList.jsx | 722 | Recipe ingredients |
| OrderEditor.jsx | 655 | Edit purchase orders |

---

## Known Issues & Technical Debt

### Minor Issues
1. Duplicate key warnings in InvoiceUploadPage (now fixed)
2. Firebase-functions package outdated in functions/

### Future Improvements
- [ ] Multi-region tax support (currently Quebec-specific)
- [ ] Scale hardware integration
- [ ] Label/tag printing system
- [ ] Auto-ordering triggers

---

## Deployment

### Current Deployment
- **Hosting:** Firebase Hosting
- **URL:** https://smartcookbook-2afe2.web.app
- **Last Deploy:** January 11, 2026

### Deploy Commands
```bash
# Full deployment
cd app-new && npm run build && cd .. && firebase deploy

# Frontend only
firebase deploy --only hosting

# Functions only
firebase deploy --only functions
```

---

## Next Steps (v2.0 Release)

1. [ ] Tag v2.0 release
2. [ ] Update firebase-admin dependencies
3. [ ] Test fresh database creation
4. [ ] Production smoke tests

---

## Summary

SmartCookBook is a mature, well-architected React application with:

- **200,000+ lines** of production code
- **100% test pass rate** (1,921 tests)
- **Modern AI-powered** invoice processing
- **Offline-first** architecture with cloud sync
- **Auto-generated public websites** for food businesses
- **Clean separation** of concerns (UI / Services / Data)
- **Comprehensive documentation**

The system is ready for v2.0 release pending final smoke tests and dependency updates.

---

*Report generated: January 27, 2026*
