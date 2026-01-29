<!-- covers: src/services/**, src/components/**, src/pages/** -->

# SmartCookBook - System Architecture

**Version:** 2.0
**Last Updated:** 2026-01-27
**Status:** Current

## Overview

SmartCookBook is a comprehensive kitchen management system built with a hybrid offline-first architecture. The system enables recipe management, inventory tracking, purchase order generation, invoice processing, and team task management for commercial kitchens.

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
│   │   ├── claudeAPI.js
│   │   └── priceCalculator.js
│   ├── auth/              # Authentication
│   │   ├── firebaseAuth.js
│   │   └── privilegesService.js
│   ├── database/          # Data persistence (modular)
│   │   ├── db.js              # Dexie instance + schema
│   │   ├── recipeDB.js        # Recipe CRUD
│   │   ├── vendorDB.js        # Vendor CRUD
│   │   ├── inventoryItemDB.js # Inventory item CRUD
│   │   ├── invoiceDB.js       # Invoice + line items
│   │   ├── orderDB.js         # Stock transactions + POs
│   │   ├── supportingDB.js    # Departments, categories
│   │   ├── cloudSync.js       # Firestore sync
│   │   ├── websiteSchema.js   # Website data schema (NEW)
│   │   ├── websiteDB.js       # Website Firestore CRUD (NEW)
│   │   └── indexedDB.js       # Barrel export (backwards compat)
│   ├── exports/           # PDF generation
│   ├── inventory/         # Inventory business logic
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
| Inventory | 15 | 6 |
| Orders | 9 | 1 |
| Vendors | 6 | 1 |
| Invoice | 8 | 31 |
| Website | 12 | 2 |
| Layout | 1 | 0 |
| Auth | 2 | 2 |
| Other | 28 | 84 |
| **Total** | **115+** | **130+** |

*Note: Invoice services include vision/, handlers/, and mathEngine/ subdirectories*
*Note: Website includes WebsiteBuilder + 10 step components + websiteDB/websiteSchema*

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
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Database Tables (IndexedDB)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `recipes` | Recipe storage | id, name, category, department |
| `departments` | Kitchen departments | id, name |
| `tasks` | Team tasks | id, recipeId, assignedTo, status |
| `vendors` | Supplier management | id, name, email, isPrimary |
| `inventoryItems` | Stock items | id, vendorId, currentStock, parLevel |
| `purchaseOrders` | Purchase orders | id, vendorId, status, total |
| `purchaseOrderLines` | PO line items | id, orderId, itemId, quantity |
| `invoices` | Uploaded invoices | id, vendorId, status, total |
| `invoiceLines` | Invoice line items | id, invoiceId, itemId |
| `stockTransactions` | Stock audit trail | id, itemId, type, quantity |

### Firestore Collections

```
/users/{userId}/
├── settings/
│   ├── business          # Business info (letterhead)
│   └── preferences       # User preferences
├── recipes/              # User's recipes
├── departments/          # Kitchen departments
└── tasks/                # Team tasks

/stores/{storeId}/        # NEW: Public website data
├── website/
│   └── data              # Website settings, design, content
└── publicRecipes/        # Future: Public menu items

/slugs/{slug}             # NEW: URL slug reservation
└── storeId               # Maps slug → store ID

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
│  │ claudeAPI.js    │   │ indexedDB.js    │   │ pdfExportService│   │
│  │ - extractRecipe │   │ - recipeDB      │   │ - generatePO    │   │
│  │ - parseInvoice  │   │ - vendorDB      │   │ - inventoryRpt  │   │
│  └─────────────────┘   │ - inventoryDB   │   └─────────────────┘   │
│                        │ - orderDB       │                          │
│  ┌─────────────────┐   │ - invoiceDB     │   ┌─────────────────┐   │
│  │ Voice Services  │   │ - taskDB        │   │  Auth Services  │   │
│  ├─────────────────┤   └─────────────────┘   ├─────────────────┤   │
│  │ googleCloud     │                         │ firebaseAuth.js │   │
│  │  Speech.js      │   ┌─────────────────┐   │ privileges      │   │
│  │ bulkIngredient  │   │  Sync Services  │   │  Service.js     │   │
│  │  Voice.js       │   ├─────────────────┤   └─────────────────┘   │
│  └─────────────────┘   │ cloudSync.js    │                          │
│                        │ firebaseCache.js│                          │
│                        └─────────────────┘                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   INVENTORY SERVICES                           │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │ vendorService.js      │ Vendor CRUD, search, stats            │  │
│  │ inventoryItemService  │ Item CRUD, stock levels, alerts       │  │
│  │ purchaseOrderService  │ PO lifecycle, approval, receiving     │  │
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
└─────────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | File | Responsibilities |
|---------|------|------------------|
| **Database Core** | `db.js` | Dexie instance, schema, seed data |
| **Recipe DB** | `recipeDB.js` | Recipe CRUD, search, categories |
| **Vendor DB** | `vendorDB.js` | Vendor CRUD, search, statistics |
| **Inventory DB** | `inventoryItemDB.js` | Item CRUD, stock levels, alerts |
| **Invoice DB** | `invoiceDB.js` | Invoice & line item workflows |
| **Order DB** | `orderDB.js` | Stock transactions, purchase orders |
| **Supporting DB** | `supportingDB.js` | Departments, categories, settings |
| **Cloud Sync** | `cloudSync.js` | Firestore bi-directional sync |
| **Stock Service** | `stockService.js` | Adjustments, deductions, transactions |
| **Vendor Service** | `vendorService.js` | Vendor business logic, search |
| **PO Service** | `purchaseOrderService.js` | Order lifecycle, receiving |
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
| **Claude AI** | `claudeAPI.js` | Recipe extraction (barrel export) |
| **Speech** | `googleCloudSpeech.js` | Voice recognition |
| **Auth** | `firebaseAuth.js` | Firebase authentication |
| **Privileges** | `privilegesService.js` | Role-based access control |
| **Website Schema** | `websiteSchema.js` | Website data structures, business types, templates |
| **Website DB** | `websiteDB.js` | Firestore CRUD for website data, slug reservation |

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
│   │   ├── Tab: Accounting
│   │   └── Tab: Inventory           ← NEW
│   │       ├── Sub-tab: Dashboard
│   │       │   └── <InventoryDashboard>
│   │       │       ├── <InventoryAlertSummary />
│   │       │       ├── <InventoryFilters />
│   │       │       ├── <InventoryListByItem /> or
│   │       │       ├── <InventoryListByVendor />
│   │       │       └── <InventoryItemDetail /> (modal)
│   │       ├── Sub-tab: Vendors
│   │       │   └── <VendorsTab>
│   │       │       ├── <VendorList>
│   │       │       │   └── <VendorCard /> (many)
│   │       │       ├── <VendorDetailModal />
│   │       │       └── <AddEditVendorModal />
│   │       ├── Sub-tab: Orders
│   │       │   └── <OrdersTab>
│   │       │       ├── <OrderList>
│   │       │       │   └── <OrderCard /> (many)
│   │       │       ├── <OrderDetailModal />
│   │       │       ├── <OrderEditor />
│   │       │       ├── <ReceiveOrderModal />
│   │       │       └── <GenerateOrdersModal />
│   │       └── Sub-tab: Invoices
│   │           └── <InvoicesTab>
│   │               ├── <InvoiceList>
│   │               │   └── <InvoiceCard /> (many)
│   │               ├── <InvoiceUploadModal />
│   │               ├── <InvoiceProcessingModal />
│   │               └── <InvoiceLineMatchModal />
│   ├── <DepartmentTasksPage>
│   │   └── <UserTaskList />
│   ├── <SettingsPage />
│   ├── <WebsiteBuilderPage>        ← NEW
│   │   └── <WebsiteBuilder>
│   │       ├── Step Navigation
│   │       └── <Step{1-10}> components
│   └── <WebsitePreviewPage>        ← NEW
│       └── Full website preview
├── <Timer /> (global)
├── <PinModal /> (access control)
└── <GuidedTour />
```

---

## 7. Data Flow Diagrams

### Recipe Creation Flow

```
┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌───────────┐
│  User   │───►│ RecipeEditor│───►│ recipeDB │───►│ Firestore │
│ Input   │    │    Page     │    │ (local)  │    │  (cloud)  │
└─────────┘    └─────────────┘    └──────────┘    └───────────┘
     │                                  │
     ▼                                  ▼
┌─────────┐                      ┌──────────┐
│  Voice  │                      │  Cloud   │
│  Input  │                      │   Sync   │
└─────────┘                      └──────────┘
```

### Inventory Management Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    INVENTORY LIFECYCLE                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │
│  │ Create  │───►│  Stock  │───►│  Low    │───►│ Generate│      │
│  │ Vendor  │    │  Item   │    │ Stock   │    │   PO    │      │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘      │
│                      │              │              │             │
│                      ▼              ▼              ▼             │
│               ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│               │ Upload  │    │  Alert  │    │  Send   │        │
│               │ Invoice │    │  Badge  │    │  Order  │        │
│               └─────────┘    └─────────┘    └─────────┘        │
│                      │                           │              │
│                      ▼                           ▼              │
│               ┌─────────┐                  ┌─────────┐         │
│               │ Process │                  │ Receive │         │
│               │ Invoice │                  │  Order  │         │
│               └─────────┘                  └─────────┘         │
│                      │                           │              │
│                      ▼                           ▼              │
│               ┌─────────┐                  ┌─────────┐         │
│               │  Match  │                  │ Update  │         │
│               │  Items  │                  │  Stock  │         │
│               └─────────┘                  └─────────┘         │
│                      │                           │              │
│                      └───────────┬───────────────┘              │
│                                  ▼                              │
│                           ┌───────────┐                         │
│                           │   Stock   │                         │
│                           │Transaction│                         │
│                           │   Log     │                         │
│                           └───────────┘                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Purchase Order Status Flow

```
┌───────┐    ┌──────────────┐    ┌──────────┐    ┌──────┐
│ DRAFT │───►│PENDING_APPRV │───►│ APPROVED │───►│ SENT │
└───────┘    └──────────────┘    └──────────┘    └──────┘
                                                     │
                                                     ▼
                                              ┌───────────┐
                                              │ CONFIRMED │
                                              └───────────┘
                                                     │
                          ┌──────────────────────────┴───┐
                          ▼                              ▼
                   ┌─────────────────┐           ┌──────────┐
                   │PARTIALLY_RECEIVED│           │ RECEIVED │
                   └─────────────────┘           └──────────┘
                          │                              │
                          └──────────────┬───────────────┘
                                         ▼
                                    ┌────────┐
                                    │ CLOSED │
                                    └────────┘

   From any state (except CLOSED): ───► CANCELLED
```

### Stock Transaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  STOCK TRANSACTION SOURCES                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                                           │
│  │ Task Complete│──► deductStockFromTask() ──┐              │
│  │ (Recipe use) │                            │              │
│  └──────────────┘                            │              │
│                                              ▼              │
│  ┌──────────────┐                     ┌───────────┐        │
│  │ Order        │──► addStock() ─────►│   Stock   │        │
│  │ Received     │                     │Transaction│        │
│  └──────────────┘                     │   Log     │        │
│                                       └───────────┘        │
│  ┌──────────────┐                            ▲              │
│  │ Manual       │──► adjustStock() ──────────┘              │
│  │ Adjustment   │                                           │
│  └──────────────┘                                           │
│                                                              │
│  ┌──────────────┐                                           │
│  │ Waste/       │──► recordWaste() ──────────┘              │
│  │ Spoilage     │                                           │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. External Integrations

### Claude AI Integration

```
┌─────────────┐     ┌────────────────┐     ┌───────────┐
│   Client    │────►│ Cloud Function │────►│ Claude    │
│  (Browser)  │     │  (Proxy)       │     │ API       │
└─────────────┘     └────────────────┘     └───────────┘
      │                    │                     │
      │                    │                     │
      ▼                    ▼                     ▼
 ┌─────────┐         ┌─────────┐          ┌─────────┐
 │ PDF/    │         │ Rate    │          │ Extract │
 │ Image   │         │ Limit   │          │ Recipe/ │
 │ Upload  │         │ Auth    │          │ Invoice │
 └─────────┘         └─────────┘          └─────────┘
```

**Capabilities:**
- Recipe extraction from PDF/image
- Invoice data parsing
- Ingredient recognition
- Smart categorization

### Google Cloud Speech

```
┌─────────────┐     ┌────────────────┐     ┌───────────────┐
│ Microphone  │────►│  Web Speech    │────►│ Google Cloud  │
│  Input      │     │  API + Proxy   │     │ Speech-to-Text│
└─────────────┘     └────────────────┘     └───────────────┘
      │                                           │
      │                                           ▼
      │                                    ┌───────────┐
      │                                    │ Transcript│
      │                                    └───────────┘
      ▼                                           │
┌─────────────┐                                   │
│ Voice       │◄──────────────────────────────────┘
│ Commands    │
│ Processing  │
└─────────────┘
```

**Features:**
- Real-time voice input for ingredients
- Bulk ingredient dictation
- Voice commands for navigation
- Multi-language support

### QuickBooks Integration

```
┌─────────────┐     ┌────────────────┐     ┌───────────────┐
│   App       │────►│ Cloud Function │────►│  QuickBooks   │
│             │     │  (OAuth)       │     │  Online API   │
└─────────────┘     └────────────────┘     └───────────────┘
      │                    │                      │
      │                    │                      ▼
      ▼                    ▼               ┌───────────┐
┌─────────────┐     ┌─────────────┐        │  Sync     │
│ Invoice     │     │   Token     │        │ Invoices  │
│ Upload      │     │   Refresh   │        │ Vendors   │
└─────────────┘     └─────────────┘        └───────────┘
```

**Capabilities:**
- OAuth 2.0 authentication
- Invoice creation/sync
- Vendor synchronization
- Payment status tracking

---

## 9. Security Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION LAYERS                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Firebase Auth                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Email/password authentication                      │  │
│  │  - Session management                                 │  │
│  │  - Token refresh                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  Layer 2: Access Control (PIN)                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Owner PIN for elevated access                      │  │
│  │  - Editor/Viewer role assignment                      │  │
│  │  - Session-based privileges                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  Layer 3: Resource-Level Security                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Firestore security rules                           │  │
│  │  - User-scoped data access                            │  │
│  │  - Department-based filtering                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Role-Based Access Control

| Role | Recipes | Tasks | Inventory | Settings | Users |
|------|---------|-------|-----------|----------|-------|
| **Owner** | Full | Full | Full | Full | Full |
| **Editor** | Edit | Edit | View | None | None |
| **Viewer** | View | View | None | None | None |

### Data Security

- **IndexedDB**: Local browser storage (encrypted at rest by browser)
- **Firestore**: Server-side security rules
- **API Keys**: Stored in Cloud Functions environment
- **User Data**: Scoped by user ID path
- **Sensitive Fields**: Not synced (PIN, tokens)

---

## Appendix: Quick Reference

### Key Files

| Purpose | File Path |
|---------|-----------|
| Main App | `app-new/src/App.jsx` |
| Routes | `app-new/src/AppRoutes.jsx` |
| Database Core | `app-new/src/services/database/db.js` |
| Recipe DB | `app-new/src/services/database/recipeDB.js` |
| Vendor DB | `app-new/src/services/database/vendorDB.js` |
| Inventory DB | `app-new/src/services/database/inventoryItemDB.js` |
| Invoice DB | `app-new/src/services/database/invoiceDB.js` |
| Order/Stock DB | `app-new/src/services/database/orderDB.js` |
| Cloud Sync | `app-new/src/services/database/cloudSync.js` |
| **Vision Parser** | `app-new/src/services/invoice/vision/index.js` |
| **Handler Registry** | `app-new/src/services/invoice/handlers/handlerRegistry.js` |
| Auth Context | `app-new/src/contexts/AuthContext.jsx` |
| Access Context | `app-new/src/contexts/AccessContext.jsx` |
| Route Constants | `app-new/src/constants/routes.js` |
| **Website Builder** | `app-new/src/components/website/WebsiteBuilder.jsx` |
| **Website Schema** | `app-new/src/services/database/websiteSchema.js` |
| **Website DB** | `app-new/src/services/database/websiteDB.js` |
| **Public Website** | `website/app/[slug]/page.tsx` |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_*` | Firebase configuration |
| `VITE_CLAUDE_API_URL` | Claude API proxy URL |
| `VITE_GOOGLE_SPEECH_KEY` | Google Speech API |

### Related Documentation

- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Detailed data models
- [INVOICE_ARCHITECTURE.md](INVOICE_ARCHITECTURE.md) - Invoice processing system (31 files, Vision parser, handlers)
- [API_REFERENCE.md](API_REFERENCE.md) - Backend endpoints
- [INVENTORY_SYSTEM.md](INVENTORY_SYSTEM.md) - Inventory, vendors, orders
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Current project status and metrics

---

*Document maintained by SmartCookBook Development Team*
*Last Updated: 2026-01-27*
