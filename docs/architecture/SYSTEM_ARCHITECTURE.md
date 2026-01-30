<!-- covers: src/services/**, src/components/**, src/pages/** -->

# SmartCookBook - System Architecture

**Version:** 2.0
**Last Updated:** 2026-01-28
**Status:** Current

## Overview

SmartCookBook is a comprehensive kitchen management system built with a hybrid offline-first architecture. The system enables recipe management, inventory tracking, purchase order generation, invoice processing, team task management, and public website generation for commercial kitchens.

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Services](#3-backend-services)
4. [Data Architecture](#4-data-architecture)
5. [Service Layer](#5-service-layer)
6. [Component Hierarchy](#6-component-hierarchy)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [External Integrations](#8-external-integrations)
9. [Security Architecture](#9-security-architecture)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    React SPA (Vite)                                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │   │
│  │  │  Recipes │  │ Inventory│  │  Tasks   │  │  Control Panel   │    │   │
│  │  │   Page   │  │Dashboard │  │   Page   │  │ (Owner Features) │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │              SERVICE LAYER      │                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │  Recipe  │  │Inventory │  │  Voice   │  │   PDF    │             │  │
│  │  │ Service  │  │ Services │  │ Service  │  │ Services │             │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │  │
│  └─────────────────────────────────┼─────────────────────────────────────┘  │
│                                    │                                         │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │              DATA LAYER         │                                      │  │
│  │  ┌──────────────────────────────┴───────────────────────────────┐    │  │
│  │  │                    IndexedDB (Dexie)                          │    │  │
│  │  │   Local-first storage with automatic cloud sync               │    │  │
│  │  └──────────────────────────────┬───────────────────────────────┘    │  │
│  └─────────────────────────────────┼─────────────────────────────────────┘  │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │         CLOUD LAYER             │
                    │  ┌──────────────────────────┐   │
                    │  │    Firebase Services     │   │
                    │  │  ┌────────┐ ┌─────────┐  │   │
                    │  │  │Firestore│ │  Auth   │  │   │
                    │  │  └────────┘ └─────────┘  │   │
                    │  │  ┌────────┐ ┌─────────┐  │   │
                    │  │  │Hosting │ │Functions│  │   │
                    │  │  └────────┘ └─────────┘  │   │
                    │  └──────────────────────────┘   │
                    │                                  │
                    │  ┌──────────────────────────┐   │
                    │  │   External Services      │   │
                    │  │  ┌────────┐ ┌─────────┐  │   │
                    │  │  │Claude  │ │ Google  │  │   │
                    │  │  │  AI    │ │ Speech  │  │   │
                    │  │  └────────┘ └─────────┘  │   │
                    │  │  ┌────────────────────┐  │   │
                    │  │  │    QuickBooks      │  │   │
                    │  │  └────────────────────┘  │   │
                    │  └──────────────────────────┘   │
                    └─────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + Vite 7 | SPA Framework |
| Styling | CSS Modules | Scoped styling |
| State | React Context + Hooks | State management |
| Local DB | IndexedDB (Dexie) | Offline-first storage |
| Cloud DB | Firebase Firestore | Real-time sync |
| Auth | Firebase Auth | User authentication |
| Storage | Firebase Storage | Image uploads (logos, gallery) |
| Hosting | Firebase Hosting | Static hosting |
| Backend | Firebase Cloud Functions | Serverless APIs |
| AI | Claude Vision API (Anthropic) | Invoice parsing, recipe extraction |
| Voice | Google Cloud Speech-to-Text | Voice input |
| Accounting | QuickBooks API | Invoice sync |
| Public Website | Next.js 14 + Vercel | Auto-generated store websites |

---

## 2. Frontend Architecture

### Directory Structure

```
app-new/src/
├── components/
│   ├── auth/              # Authentication components
│   │   └── ProtectedRoute.jsx
│   ├── common/            # Reusable UI components
│   │   ├── Alert.jsx
│   │   ├── Badge.jsx
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Dropdown.jsx
│   │   ├── Input.jsx
│   │   ├── Modal.jsx
│   │   ├── SearchBar.jsx
│   │   ├── Spinner.jsx
│   │   └── Timer.jsx
│   ├── inventory/         # Inventory management (21 components)
│   │   ├── InventoryDashboard.jsx
│   │   ├── InventoryAlertSummary.jsx
│   │   ├── InventoryListByItem.jsx
│   │   ├── InventoryListByVendor.jsx
│   │   ├── AddInventoryItemModal.jsx
│   │   ├── StockAdjustmentModal.jsx
│   │   ├── StockStatusBadge.jsx
│   │   ├── StockProgressBar.jsx
│   │   └── ...
│   ├── invoices/          # Invoice processing (8 components)
│   │   ├── InvoicesTab.jsx
│   │   ├── InvoiceCard.jsx
│   │   ├── InvoiceList.jsx
│   │   ├── InvoiceUploadModal.jsx
│   │   ├── InvoiceProcessingModal.jsx
│   │   └── InvoiceLineMatchModal.jsx
│   ├── layout/            # Layout components
│   │   └── MenuBar.jsx
│   ├── orders/            # Purchase orders (8 components)
│   │   ├── OrdersTab.jsx
│   │   ├── OrderList.jsx
│   │   ├── OrderCard.jsx
│   │   ├── OrderDetailModal.jsx
│   │   ├── OrderEditor.jsx
│   │   ├── ReceiveOrderModal.jsx
│   │   └── GenerateOrdersModal.jsx
│   ├── recipes/           # Recipe management (8 components)
│   │   ├── RecipeList.jsx
│   │   ├── RecipeCard.jsx
│   │   ├── IngredientList/
│   │   ├── MethodSteps.jsx
│   │   ├── PlatingInstructions.jsx
│   │   └── Notes.jsx
│   ├── users/             # User management
│   │   └── UserTaskList.jsx
│   ├── vendors/           # Vendor management (6 components)
│   │   ├── VendorsTab.jsx
│   │   ├── VendorList.jsx
│   │   ├── VendorCard.jsx
│   │   ├── VendorDetailModal.jsx
│   │   └── AddEditVendorModal.jsx
│   └── website/           # Website builder (12 components) NEW
│       ├── WebsiteBuilder.jsx      # Main 10-step wizard
│       └── steps/                  # Step components
│           ├── StepBusinessType.jsx
│           ├── StepIdentity.jsx
│           ├── StepDesign.jsx
│           ├── StepAbout.jsx
│           ├── StepContact.jsx
│           ├── StepServices.jsx
│           ├── StepSocial.jsx
│           ├── StepGallery.jsx
│           ├── StepSEO.jsx
│           └── StepReview.jsx
├── contexts/              # React Context providers
│   ├── AuthContext.jsx    # Firebase auth state
│   └── AccessContext.jsx  # Role-based access control
├── hooks/                 # Custom React hooks
│   ├── useCloudSync.js    # Cloud sync lifecycle
│   ├── useAppState.js     # UI toggle state (mic, keypad, timer)
│   └── useInventoryAlerts.js  # Stock alert monitoring
├── pages/                 # Page components
│   ├── LandingPage.jsx
│   ├── LoginPage.jsx
│   ├── RecipeListPage.jsx
│   ├── RecipeEditorPage.jsx
│   ├── ControlPanelPage.jsx
│   ├── DepartmentTasksPage.jsx
│   ├── SettingsPage.jsx
│   └── ...
├── services/              # Business logic layer
│   ├── ai/                # AI integration
│   │   ├── claudeAPI.js       # Barrel export
│   │   ├── claudeBase.js      # Shared infrastructure
│   │   ├── claudeRecipe.js    # Recipe parsing
│   │   ├── claudeTranslate.js # Translation service
│   │   └── priceCalculator.js # Ingredient cost calculations
│   ├── accounting/        # QuickBooks integration
│   │   └── quickbooksService.js
│   ├── auth/              # Authentication
│   │   ├── firebaseAuth.js
│   │   └── privilegesService.js
│   ├── credits/           # Credit system for API usage
│   │   └── creditService.js
│   ├── database/          # Data persistence (modular)
│   │   ├── db.js              # Dexie instance + schema
│   │   ├── recipeDB.js        # Recipe CRUD
│   │   ├── vendorDB.js        # Vendor CRUD
│   │   ├── inventoryItemDB.js # Inventory item CRUD
│   │   ├── inventoryHelpers.js # Computed values for inventory
│   │   ├── invoiceDB.js       # Invoice + line items
│   │   ├── orderDB.js         # Stock transactions + POs
│   │   ├── supportingDB.js    # Departments, categories
│   │   ├── migrations.js      # Schema validation
│   │   ├── cleanupService.js  # Data integrity checks
│   │   ├── cloudSync.js       # Firestore sync
│   │   ├── firebase.js        # Firebase config
│   │   ├── firebaseCache.js   # In-memory caching
│   │   ├── businessService.js # Business info
│   │   ├── websiteSchema.js   # Website data schema
│   │   ├── websiteDB.js       # Website Firestore CRUD
│   │   ├── websiteSettingsDB.js # Website settings
│   │   └── indexedDB.js       # Barrel export (backwards compat)
│   ├── exports/           # PDF generation
│   │   └── pdfExportService.js
│   ├── heartbeat/         # Dashboard analytics
│   │   └── dashboardData.js   # Four "organs" data aggregation
│   ├── inventory/         # Inventory business logic
│   │   ├── autoOrderService.js    # Auto-generated purchase orders
│   │   ├── stockService.js
│   │   ├── vendorService.js
│   │   ├── purchaseOrderService.js
│   │   ├── invoiceLineService.js  # Line item operations + inventory creation
│   │   ├── invoiceAnalyzer.js     # Universal validation (totals, duplicates, taxes)
│   │   └── recipeDeductionService.js  # Recipe ingredient deduction
│   ├── invoice/           # Invoice processing (see INVOICE_ARCHITECTURE.md)
│   │   ├── vision/                # Vision-based parsing (NEW)
│   │   │   ├── visionParser.js    # PDF → Images → Claude Vision API
│   │   │   ├── jsonNormalizer.js  # Raw JSON → Normalized format
│   │   │   ├── invoiceTypeDetector.js  # Auto-detect invoice type
│   │   │   └── index.js           # processInvoice() entry point
│   │   ├── vendorDetector.js      # Vendor detection
│   │   ├── lineCategorizer.js     # AI-powered item categorization
│   │   ├── handlers/              # Type-specific handlers
│   │   │   ├── handlerRegistry.js
│   │   │   ├── foodSupplyHandler.js
│   │   │   ├── packagingDistributorHandler.js
│   │   │   ├── utilitiesHandler.js
│   │   │   ├── servicesHandler.js
│   │   │   └── genericHandler.js
│   │   └── mathEngine/            # Math validation
│   ├── speech/            # Voice recognition
│   └── voice/             # Voice commands
├── styles/                # CSS Modules
│   ├── components/        # Component styles
│   ├── pages/             # Page styles
│   └── global.css         # Global styles
└── utils/                 # Utility functions
```

### Component Count by Feature

| Feature Area | Components | Services |
|--------------|------------|----------|
| Common/Shared | 25 | 2 |
| Recipes | 9 | 1 |
| Inventory | 15 | 7 |
| Orders | 9 | 1 |
| Vendors | 6 | 1 |
| Invoice | 8 | 31 |
| Website | 12 | 4 |
| Layout | 1 | 0 |
| Auth | 2 | 2 |
| Credits | 0 | 1 |
| Accounting | 0 | 1 |
| Heartbeat | 0 | 1 |
| Other | 28 | 84 |
| **Total** | **115+** | **136+** |

*Note: Invoice services include vision/, handlers/, and mathEngine/ subdirectories*
*Note: Website includes WebsiteBuilder + 10 step components + websiteDB/websiteSchema/websiteSettingsDB*
*Note: New services: creditService, quickbooksService, dashboardData, autoOrderService, inventoryHelpers, cleanupService, migrations, businessService, firebaseCache*

---

## 3. Backend Services

### Firebase Cloud Functions

```
functions/
├── index.js               # Main entry point
├── claude-proxy           # Claude AI API proxy
├── quickbooks/            # QuickBooks OAuth & sync
│   ├── oauth-callback
│   ├── refresh-token
│   ├── create-invoice
│   └── sync-vendors
└── speech/                # Google Speech proxy
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/claude/extract` | POST | Extract recipe from PDF/image |
| `/api/claude/parse-invoice` | POST | Parse invoice data |
| `/api/quickbooks/auth` | GET | OAuth initiation |
| `/api/quickbooks/callback` | GET | OAuth callback |
| `/api/quickbooks/invoice` | POST | Create QB invoice |
| `/api/quickbooks/status` | GET | Check connection status |
| `/api/quickbooks/tokenHealth` | GET | Check token expiration |
| `/api/quickbooks/disconnect` | POST | Disconnect from QuickBooks |
| `/api/quickbooks/vendors` | GET | Get QB vendors |
| `/api/speech/recognize` | POST | Speech-to-text |

---

## 4. Data Architecture

### Hybrid Offline-First Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA SYNCHRONIZATION                          │
│                                                                  │
│  ┌──────────────┐    Sync Service    ┌──────────────────────┐  │
│  │   IndexedDB  │ ◄──────────────────► │  Firebase Firestore  │  │
│  │   (Local)    │    Real-time        │      (Cloud)          │  │
│  └──────────────┘    Bi-directional   └──────────────────────┘  │
│         │                                       │                │
│         │ Write-first                           │ Read backup    │
│         ▼                                       ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Application                            │   │
│  │  - Writes go to IndexedDB first (instant)                │   │
│  │  - Background sync to Firestore                          │   │
│  │  - Conflict resolution: last-write-wins + timestamps     │   │
│  │  - Offline support: full functionality without network   │   │
│  │  - Deletion tracking to prevent phantom resurrection     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Database Tables (IndexedDB)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `recipes` | Recipe storage | id, name, nameLower, category, department |
| `departments` | Kitchen departments | id, name, isDefault |
| `categories` | Recipe categories | id, name, departmentId |
| `tasks` | Team tasks | id, recipeId, assignedTo, status |
| `vendors` | Supplier management | id, name, nameLower, isActive, isPrimary |
| `inventoryItems` | Stock items | id, name, nameNormalized, vendorId, currentStock |
| `purchaseOrders` | Purchase orders | id, vendorId, status, total |
| `purchaseOrderLines` | PO line items | id, orderId, itemId, quantity |
| `invoices` | Uploaded invoices | id, vendorId, status, total |
| `invoiceLineItems` | Invoice line items | id, invoiceId, inventoryItemId |
| `stockTransactions` | Stock audit trail | id, inventoryItemId, transactionType, quantity |
| `priceHistory` | Price tracking | id, inventoryItemId, price, recordedAt |
| `expenseCategories` | Non-inventory expense types | id, name, isActive, qbAccountId |
| `expenseRecords` | Non-inventory invoices | id, vendorId, expenseCategoryId, amount |
| `deletedItems` | Deletion tracking | id, entityType, entityId, deletedAt |

### Firestore Collections

```
/users/{userId}/
├── settings/
│   ├── business          # Business info (letterhead)
│   └── preferences       # User preferences
├── recipes/              # User's recipes
├── departments/          # Kitchen departments
├── tasks/                # Team tasks
└── privileges/           # PIN-based access control

/stores/{storeId}/        # Public website data
├── website/
│   └── data              # Website settings, design, content
├── settings/
│   └── website           # Website configuration
└── publicRecipes/        # Future: Public menu items

/slugs/{slug}             # URL slug reservation
└── storeId               # Maps slug → store ID

/userCredits/{userId}     # API credit tracking
├── credits               # Current credit balance
├── creditsUsed           # Credits used this month
└── monthStart            # Month start timestamp

/shared/
└── vendors/              # Shared vendor database
```

---

## 5. Service Layer

### Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │   AI Services   │   │  Data Services  │   │ Export Services │   │
│  ├─────────────────┤   ├─────────────────┤   ├─────────────────┤   │
│  │ claudeBase.js   │   │ indexedDB.js    │   │ pdfExportService│   │
│  │ claudeRecipe.js │   │ - recipeDB      │   │ - generatePO    │   │
│  │ claudeTranslate │   │ - vendorDB      │   │ - inventoryRpt  │   │
│  │ priceCalculator │   │ - inventoryDB   │   └─────────────────┘   │
│  └─────────────────┘   │ - orderDB       │                          │
│                        │ - invoiceDB     │   ┌─────────────────┐   │
│  ┌─────────────────┐   │ - taskDB        │   │  Auth Services  │   │
│  │ Voice Services  │   └─────────────────┘   ├─────────────────┤   │
│  ├─────────────────┤                         │ firebaseAuth.js │   │
│  │ googleCloud     │   ┌─────────────────┐   │ privileges      │   │
│  │  Speech.js      │   │  Sync Services  │   │  Service.js     │   │
│  │ bulkIngredient  │   ├─────────────────┤   └─────────────────┘   │
│  │  Voice.js       │   │ cloudSync.js    │                          │
│  └─────────────────┘   │ firebaseCache.js│                          │
│                        └─────────────────┘                          │
│                                                                      │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │Credit & Account │   │ Website Services│   │  Data Quality   │   │
│  ├─────────────────┤   ├─────────────────┤   ├─────────────────┤   │
│  │ creditService   │   │ websiteDB       │   │ cleanupService  │   │
│  │ quickbooks      │   │ websiteSchema   │   │ migrations      │   │
│  │  Service        │   │ websiteSettings │   │ inventoryHelpers│   │
│  │ businessService │   │                 │   └─────────────────┘   │
│  └─────────────────┘   └─────────────────┘                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   INVENTORY SERVICES                           │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ vendorService.js      │ Vendor CRUD, search, stats            │  │
│  │ inventoryItemService  │ Item CRUD, stock levels, alerts       │  │
│  │ purchaseOrderService  │ PO lifecycle, approval, receiving     │  │
│  │ autoOrderService.js   │ Auto-generated purchase orders        │  │
│  │ invoiceLineService.js │ Line operations, inventory creation   │  │
│  │ stockService.js       │ Stock adjustments, transactions       │  │
│  │ recipeDeductionSvc    │ Recipe ingredient deduction           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   INVOICE VISION SERVICES                      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ visionParser.js       │ PDF → Images → Claude Vision API      │  │
│  │ jsonNormalizer.js     │ Raw JSON → Normalized format          │  │
│  │ invoiceTypeDetector   │ Auto-detect invoice type              │  │
│  │ handlerRegistry.js    │ Type-specific handler dispatch        │  │
│  │ foodSupplyHandler     │ Weight-based pricing calculations     │  │
│  │ packagingHandler      │ Container/case counting               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   ANALYTICS & MONITORING                       │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ dashboardData.js      │ Four "organs" health monitoring       │  │
│  │ heartbeatService      │ System health aggregation             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | File | Responsibilities |
|---------|------|------------------|
| **Database Core** | `db.js` | Dexie instance, schema v2, seed data |
| **Recipe DB** | `recipeDB.js` | Recipe CRUD, search, categories |
| **Vendor DB** | `vendorDB.js` | Vendor CRUD, search, statistics |
| **Inventory DB** | `inventoryItemDB.js` | Item CRUD, stock levels, alerts |
| **Inventory Helpers** | `inventoryHelpers.js` | Computed values, purchase stats |
| **Invoice DB** | `invoiceDB.js` | Invoice & line item workflows |
| **Order DB** | `orderDB.js` | Stock transactions, purchase orders |
| **Supporting DB** | `supportingDB.js` | Departments, categories, settings |
| **Cloud Sync** | `cloudSync.js` | Firestore bi-directional sync, deletion tracking |
| **Firebase Cache** | `firebaseCache.js` | In-memory query caching |
| **Cleanup Service** | `cleanupService.js` | Data integrity, orphan cleanup |
| **Migrations** | `migrations.js` | Schema validation, diagnostics |
| **Business Service** | `businessService.js` | Business info, setup completion |
| **Stock Service** | `stockService.js` | Adjustments, deductions, transactions |
| **Vendor Service** | `vendorService.js` | Vendor business logic, search |
| **PO Service** | `purchaseOrderService.js` | Order lifecycle, receiving |
| **Auto Order Service** | `autoOrderService.js` | Auto-generated purchase orders |
| **Invoice Line Service** | `invoiceLineService.js` | Line operations, inventory creation |
| **Recipe Deduction** | `recipeDeductionService.js` | Recipe ingredient deduction |
| **Vision Parser** | `vision/visionParser.js` | PDF → Images → Claude Vision API |
| **JSON Normalizer** | `vision/jsonNormalizer.js` | Raw JSON → Normalized format |
| **Type Detector** | `vision/invoiceTypeDetector.js` | Auto-detect invoice type |
| **Handler Registry** | `handlers/handlerRegistry.js` | Invoice type handler dispatch |
| **Food Supply Handler** | `handlers/foodSupplyHandler.js` | Weight-based pricing calculations |
| **Packaging Handler** | `handlers/packagingDistributorHandler.js` | Container/case counting |
| **PDF Export** | `pdfExportService.js` | Generate PO and inventory PDFs |
| **Price Calculator** | `priceCalculator.js` | Ingredient cost calculations |
| **Claude Base** | `claudeBase.js` | Shared infrastructure, rate limiting |
| **Claude Recipe** | `claudeRecipe.js` | Recipe parsing functions |
| **Claude Translate** | `claudeTranslate.js` | Translation service with caching |
| **Speech** | `googleCloudSpeech.js` | Voice recognition |
| **Auth** | `firebaseAuth.js` | Firebase authentication |
| **Privileges** | `privilegesService.js` | Role-based access control |
| **Credit Service** | `creditService.js` | API credit tracking, owner bypass |
| **QuickBooks Service** | `quickbooksService.js` | QB OAuth, connection management |
| **Website Schema** | `websiteSchema.js` | Website data structures, business types |
| **Website DB** | `websiteDB.js` | Firestore CRUD for website data |
| **Website Settings** | `websiteSettingsDB.js` | Website configuration |
| **Dashboard Data** | `dashboardData.js` | Four "organs" health monitoring |

---

## 6. Component Hierarchy

### Main Application Structure

```
<App>
├── <BetaBanner />
├── <MenuBar>
│   ├── Department Selector
│   ├── Navigation Buttons
│   ├── Inventory Alert Badge    ← NEW
│   └── User Menu
├── <Routes>
│   ├── <LandingPage />
│   ├── <LoginPage />
│   ├── <RecipeListPage>
│   │   └── <RecipeList>
│   │       └── <RecipeCard /> (many)
│   ├── <RecipeEditorPage>
│   │   ├── <IngredientList>
│   │   │   └── <IngredientRow /> (many)
│   │   ├── <MethodSteps />
│   │   ├── <PlatingInstructions />
│   │   └── <Notes />
│   ├── <ControlPanelPage>           ← Owner Only
│   │   ├── Tab: Users
│   │   ├── Tab: Departments
│   │   ├
