# SmartCookBook - Tasks & Priorities

## Current Status

**Version:** 2.0 (Pre-release)
**Tests:** 1,921 passing (63 test files)
**Source Files:** 289 JS/JSX files (~190k lines)
**Last Updated:** 2026-01-27

---

## Completed (Weeks 1-4)

### Week 1: Critical Fixes
- [x] Remove test routes from production
- [x] Fix scaleService.js fake success returns
- [x] Verify task completion → inventory deduction
- [x] `supplierId` → `vendorId` naming consistency

### Week 2: Architecture Refactoring
- [x] Split indexedDB.js (5,500 → 8 files)
- [x] Clean App.jsx (1,632 → 1,361 lines)
- [x] Create AppRoutes.jsx with lazy loading
- [x] Create custom hooks (useCloudSync, useAppState, useInventoryAlerts)

### Week 3: Test Coverage
- [x] Unit tests: vendorDB, inventoryDB, stockService, tasksService
- [x] Integration tests: task cascade, invoice cascade, in-house production
- [x] E2E tests: new user setup, invoice upload, task workflow

### Week 4: Documentation & Stabilization
- [x] Price calculator refactor (465 → 200 lines)
- [x] JSDoc all public service functions
- [x] API reference documentation
- [x] Invoice line type tagging for QuickBooks
- [x] Performance audit & optimizations
  - ControlPanelPage memoization (24 patterns added)
  - ControlPanelPage tab splitting (614kB → 22kB, 96% reduction)
- [x] Security audit (1 actionable: update firebase-admin)
- [x] Documentation cleanup (58 → 14 files)
- [x] Invoice type handler architecture
  - Handler-based invoice processing (foodSupply, packagingDistributor, generic)
  - Type-specific inventory creation/update logic
  - VendorProfileWizard with card-based type selection
  - Refactored invoiceLineService and InvoiceUploadPage to use handlers

### Week 5: Invoice Architecture Cleanup
- [x] Created comprehensive INVOICE_ARCHITECTURE.md documentation
  - File catalog (28 files, ~9.1k lines after cleanup)
  - Service catalog with Expected vs Actual behavior
  - Mermaid diagrams (component, sequence flows)
  - Handler pattern documentation
- [x] Code cleanup (~2,550 lines removed total)
  - Deleted invoiceMerger.js (-765 lines) - logic moved to handlers
  - Deleted invoiceService.js (-865 lines) - unused module
  - Removed parsePackageFormat from orchestrator (-120 lines)
  - Removed extractLineWeightInfo from orchestrator (-82 lines)
  - Removed duplicate column mapping from orchestrator (-180 lines)
  - Cleaned InvoiceUploadPage (-320 lines)
  - Consolidated save logic to invoiceLineService.processLinesToInventory()
  - Consolidated Quebec tax config to mathEngine/types.js
- [x] Split claudeAPI.js (2035 → 4 focused modules)
  - claudeBase.js (540 lines): Shared infrastructure, rate limiting
  - claudeRecipe.js (1325 lines): Recipe parsing (6 functions)
  - claudeInvoice.js (206 lines): Invoice parsing
  - claudeAPI.js (36 lines): Barrel export for backwards compatibility
- [x] Handler architecture improvements
  - Added applyColumnMapping() to handlers (type-specific column mapping)
  - Added formatLineForStorage() to all 5 handlers
  - Added applyFormatCorrection() for user format edits
  - Handlers now own all parsing logic (orchestrator is pure coordination)

### Week 6: Vision Parser Integration
- [x] Created Vision-based invoice parsing pipeline
  - visionParser.js: PDF → Images → Claude Vision API → Raw JSON
  - jsonNormalizer.js: Raw JSON → Normalized format with field aliases
  - Tested with 6 vendor types (meat, seafood, specialty, dairy, packaging, produce)
- [x] Field alias system for variable Vision output
  - Handles different field names across vendors (code/sku/product_code, quantity/delivered/qty_invoiced)
  - Normalizes units (un/ea/pc → ea, kg/kilo → kg, etc.)
  - Parses dates from multiple formats (YYYY-MM-DD, DD/MM/YYYY, etc.)
- [x] Integrated Vision parser into InvoiceUploadPage
  - Vision mode: simpler 2-step flow (Vision AI → Save)
  - Vision info badge: pages, parse time, vendor match
  - Vision warnings display
  - Saves Quebec taxes (TPS/TVQ) separately
- [x] DEV test page for Vision parser (/invoice/vision-test)
  - Upload PDF → Parse → View normalized JSON
  - Tabs: Invoice Header, Line Items, Raw Vision JSON, DB Format
- [x] **Deleted legacy parser completely** (2025-12-24)
  - Removed claudeInvoice.js (-227 lines)
  - Removed invoiceOrchestrator.js (-1067 lines)
  - Removed VendorProfileWizard.jsx (-1563 lines)
  - Removed Vision/Legacy toggle from InvoiceUploadPage
  - Vision parser is now the only parser
  - Total: ~2,850 lines of legacy code removed
- [x] **Invoice type auto-detection** (2025-12-24)
  - Created invoiceTypeDetector.js (~400 lines)
    - Pattern-based detection using regex
    - Signal scoring algorithm for confidence calculation
    - Supports: foodSupply, packaging, utilities, services, generic
  - Detection patterns:
    - Food Supply: weight formats (2/5LB), pricePerWeight ($/kg), food keywords
    - Packaging: container sizes (500ML), case counts (1000/case), dimensions
    - Utilities: usage units (kWh, m³), billing periods, meter readings
    - Services: hourly rates, time-based billing
  - Integrated into vision pipeline (processInvoice → detectedType)
  - UI: Type selector with confidence display in InvoiceUploadPage
  - Raw JSON panel for debugging (collapsible)

### Week 7: FoodSupply Handler Optimization
- [x] **foodSupplyHandler.js code cleanup** (2025-12-26)
  - Fixed self-reference bug in processLineV2 (foodSupplyHandler.applyColumnMapping → applyFoodSupplyColumnMapping)
  - Moved dynamic require to top-level import (getBaseStorageFields)
  - Created module-level applyFoodSupplyColumnMapping() for V2 pipeline consistency
  - Consolidated 13 array iterations into single-pass summary calculation (performance fix)
  - All 94 tests passing (23 handler + 52 V2 + 19 flow tracker)
  - V1 pipeline code retained (still in active use by tests and services)

- [x] **Clean extraction phase architecture** (2025-12-26)
  - Created `extractAllFields()` - single-pass field extraction
  - Added `FIELD_PRIORITIES` - ordered source lists for each field
  - Added `UNIT_TYPE` classification (weight/count/container/volume)
  - Added unit classifier functions (isWeightUnit, isCountUnit, etc.)
  - Added `extractWeightFromAllSources()` - tries all 4 weight sources
  - Added missing field support: pricePerWeight, pricePerKg, pricePerLb
  - Added `createExtractedField()` factory with source/confidence tracking
  - Context derivation: expectedFormula based on unit type
  - Clean separation: extraction phase has NO validation logic

- [x] **Refactored processLineV2 flow** (2025-12-26)
  - NEW 5-PHASE FLOW:
    1. PHASE 1: Extract ALL fields (uses extractAllFields)
    2. PHASE 2: Determine pricing type EARLY (before math!)
    3. PHASE 3: Validate all (tier1, math, tier2, tier3)
    4. PHASE 4: Calculate pricing
    5. PHASE 5: Build summary and route
  - Created `determinePricingTypeEarly()` - decides WEIGHT vs UNIT before math
  - Created `calculateWeightedConfidence()` - replaces harsh MIN scoring
    - Math: 50%, Weight: 30%, Extraction: 20%
    - Unit-based pricing gets full weight points (weight optional)
  - Added `_context` to output for debugging (unitType, expectedFormula, etc.)
  - All 94 tests passing (52 V2 + 23 handler + 19 flow tracker)

- [x] **Fixed qty_invoiced extraction** (2025-12-26)
  - Added `qty_invoiced` alias to jsonNormalizer.js `getBillingQuantity()`
  - Added `qty_invoiced` to FIELD_PRIORITIES.QUANTITY in foodSupplyTypes.js
  - Also added: `qtyInvoiced`, `qty_delivered`, `qte`, `qté` (French variants)
  - Tested with real Les Dépendances invoice (62 items) - all items now correctly extract:
    - Quantity from raw JSON `qty_invoiced` field
    - Total weight (qty × weightPerUnit from description)
    - Price per gram with math validation passing

- [x] **V1 Pipeline Cleanup** (2025-12-26)
  - Deleted V1 test file: `foodSupplyHandler.test.js`
  - Deleted V1 code from foodSupplyHandler.js:
    - `validateLine()` method (never called)
    - `VALID_UNITS` constant (duplicate)
    - `analyzeLineItem()` function (~175 lines)
    - `processLine()` method (~87 lines)
    - `processLines()` method (~73 lines)
  - Added thin `processLines()` wrapper that delegates to V2 with V1-compatible output
  - Cleaned unused imports: ANOMALY_TYPES, ANALYSIS_STATUS, SOURCE, CONFIDENCE, sanitizeNumericValue, etc.
  - Cleaned unused exports from handlers/index.js
  - **Result: 2,806 → 2,419 lines (387 lines removed, 14% reduction)**
  - All tests passing (153 handler + 132 integration)

### Week 8: Pre-Release Preparation (2025-12-30)
- [x] **Codebase audit and documentation update**
  - Full codebase structure analysis (289 files, ~190k lines)
  - Created PROJECT_STATUS.md for stakeholder presentation
  - Updated test count: 1,921 tests passing (63 test files)
- [x] **Bug fixes**
  - Fixed duplicate key warnings in InvoiceUploadPage.jsx
  - Fixed getEffectivePar() fallback logic in inventoryHelpers.js
  - Deployed fixes to production
- [x] **Production deployment**
  - Built and deployed to https://smartcookbook-2afe2.web.app

### Week 9: Task Dependency System (2026-01-10)
- [x] **Production Execution Mode**
  - Added execution mode autosave to RecipeEditorPage.jsx
  - Execution data saves to task record (not recipe) via `task.executionData.methodSteps`
  - Debounced autosave with status indicator
  - Task completion uses execution data for inventory deduction
- [x] **Task Dependency Detection (Phase 1)**
  - Created `taskDependencyService.js` (~200 lines)
  - `checkRecipeDependencies()` - analyzes recipe for in-house ingredient requirements
  - Detects shortfalls by comparing required amounts vs current inventory
  - Returns: hasDependencies, hasShortfalls, dependencies[], shortfalls[], summary
  - Integrated into AssignTaskModal with visual warnings
- [x] **Auto-Create Prerequisite Tasks (Phase 2)**
  - `createPrerequisiteTasks()` - creates tasks for each shortfall's source recipe
  - `createTaskWithPrerequisites()` - one-call wrapper for complete flow
  - `checkTaskCanStart()` - validates all prerequisites are complete
  - New task fields: `dependsOn`, `prerequisiteFor`, `autoGenerated`, `hasDependencies`
  - UI: "Create Prerequisites" button with created tasks display
  - CSS styles for dependency warnings and prerequisite tasks
- [x] **Bug fix: MethodSteps unit selector**
  - Fixed CSS width issue where Input wrapper overrode `.numberInput` width
  - Added `!important` to width constraints in methodsteps.module.css

### Week 10: API Credits System (2026-01-11)
- [x] **Monthly credits system for API cost control**
  - Created `creditService.js` (~300 lines)
    - 50 credits/month per user (auto-resets monthly)
    - Firestore-backed credit tracking
    - Credit costs: Invoice Vision (5), Recipe Image (5), Recipe Text (2), Translation (1), Bulk Dictation (3)
  - Updated `claudeBase.js` with credit integration
    - `withCredits()` wrapper for API calls
    - `checkAPICredits()` and `deductAPICredits()` functions
    - `INSUFFICIENT_CREDITS` error type
  - Updated all API services to use credit system
    - claudeRecipe.js (6 functions wrapped)
    - claudeTranslate.js (translation calls only deduct on cache miss)
    - visionParser.js (invoice parsing)
- [x] **Owner bypass for unlimited credits**
  - `OWNER_BYPASS_EMAILS` list in creditService.js
  - `isOwnerUser()` check in checkCredits, deductCredits, getCreditSummary
  - Owner accounts see "Unlimited Credits" badge in Settings
  - No deductions occur for owner accounts
- [x] **Credits display in Settings page**
  - `CreditsDisplay.jsx` component with progress bar
  - Shows credits remaining, used, days until reset
  - Credit cost reference table
  - Low credits warning (hidden for owners)
  - Owner badge with purple gradient
- [x] **Legal compliance updates**
  - Updated Privacy Policy with real contact email (mageroyer@hotmail.com)
  - Updated Terms of Service with real contact email
  - Added physical address (4640 rue Adam, Montreal, QC H1V 1V3)
  - Named Privacy Officer (Mage Royer)
- [x] **Docs modal and downloadable PDFs**
  - Created `DocsModal.jsx` component
  - Menu bar "Docs" item opens modal with document list
  - Downloadable PDFs: User Guide, Security Overview, Terms of Service, Patch Report
  - `generateSecurityOverviewPDF()` - user-friendly security documentation
  - `generateTermsOfServicePDF()` - legal terms in PDF format
- [x] **Training data collection for AI improvement**
  - Created `trainingDataService.js` - stores invoice PDFs in IndexedDB
  - Static consent checkbox on Invoice Upload page (always visible)
  - Saves: PDF, vision response, parsed lines, corrections
  - User preference saved to settings (persists across sessions)
  - Training data exportable for external pipeline

### Week 11: Auto-Generated Public Websites (2026-01-27)
- [x] **10-Step Website Builder Wizard**
  - Created comprehensive `websiteSchema.js` with:
    - BUSINESS_TYPES (butcher, bakery, deli, grocery, caterer, restaurant, food truck, etc.)
    - CERTIFICATIONS (halal, kosher, organic, local, etc.)
    - TEMPLATES (marche, urbain, chaleur)
    - DEFAULT_WEBSITE_DATA structure
    - WIZARD_STEPS definitions
  - Created `websiteDB.js` for Firestore CRUD operations
    - Stores data at `/stores/{storeId}/website/data`
    - Slug reservation at `/slugs/{slug}`
  - Created `WebsiteBuilder.jsx` - main 10-step wizard component
  - Created 10 step components:
    1. StepBusinessType - Business type selection grid
    2. StepIdentity - Logo, name, tagline, year established
    3. StepDesign - Template selection, color customization
    4. StepAbout - Story, mission, certifications, team, awards
    5. StepContact - Address, phone, email, business hours
    6. StepServices - Catering, delivery, custom orders, wholesale
    7. StepSocial - Social media links, newsletter
    8. StepGallery - Hero images, store photos, product photos
    9. StepSEO - URL/slug, meta title, description, keywords
    10. StepReview - Summary, completion status, publish
  - Created `websitebuilder.module.css` (~800 lines)
- [x] **Firebase Storage Setup**
  - Created `storage.rules` for dish-photos and store-assets
  - Configured CORS for localhost and production domains
  - Deployed storage rules
- [x] **In-App Preview**
  - Created `WebsitePreviewPage.jsx` - full website preview
  - Created `websitepreview.module.css` - preview styling
  - Added `/website-preview` route
- [x] **Next.js Public Website Deployment**
  - Updated `website/` project with Firebase SDK integration
  - Created `lib/firebase.ts` for Firestore connection
  - Updated `lib/api.ts` to fetch directly from Firestore
  - Deployed to Vercel: https://kitchencommand-website.vercel.app
  - Set up alias domain

**Files Created:**
- `app-new/src/services/database/websiteSchema.js`
- `app-new/src/services/database/websiteDB.js`
- `app-new/src/components/website/WebsiteBuilder.jsx`
- `app-new/src/components/website/steps/*.jsx` (10 files)
- `app-new/src/styles/components/websitebuilder.module.css`
- `app-new/src/pages/WebsitePreviewPage.jsx`
- `app-new/src/styles/pages/websitepreview.module.css`
- `storage.rules`
- `cors.json`
- `website/lib/firebase.ts`
- `website/.env.local`

**Pending (Resume Later):**
- [ ] Test full publish flow (slug reservation → public website display)
- [ ] Register custom domain (kitchencommand.io)
- [ ] Configure wildcard subdomain on Vercel
- [ ] Add menu/recipes to public website template

---

## Remaining Tasks

### Before v2.0 Release
- [ ] Tag v2.0 release
- [ ] Update firebase-admin dependencies in functions/
- [ ] Test fresh database creation

### ⚠️ IMPORTANT: Legal Compliance (Before Commercial Launch)
- [ ] **Lawyer review of legal documents** (~$500-2000 CAD)
  - Privacy Policy (Law 25 + PIPEDA compliance)
  - Terms of Service (liability, Quebec jurisdiction)
  - Recommended before accepting paying customers
- [ ] **Create incident response plan** for data breaches (Law 25 requirement)
- [ ] **Document data retention policies** internally

**Completed Legal Tasks:**
- [x] Privacy Policy page created (/privacy)
- [x] Terms of Service page created (/terms)
- [x] Consent checkbox added to registration form
- [x] Claude API proxy authentication (prevents unauthorized API usage)
- [x] DATA_PROTECTION_REQUIREMENTS.md research document
- [x] Real contact email added (mageroyer@hotmail.com)
- [x] Physical business address added (4640 rue Adam, Montreal, QC H1V 1V3)
- [x] Privacy Officer designated (Mage Royer)
- [x] Terms of Service downloadable as PDF

### Invoice Type Handlers
- [x] utilitiesHandler.js - Utility bills (electricity, gas, water, telecom)
- [x] servicesHandler.js - Professional services (repairs, maintenance, cleaning)
- [x] All handlers exported from handlers/index.js
- [ ] Test detector with real invoices from each category

---

## Future Features

### Phase 6: Scale Integration
- [ ] Scale hardware API integration
- [ ] Real-time weight capture
- [ ] Label printing service

### Phase 7: Tag Everything
- [ ] Label template system
- [ ] Batch/lot tracking
- [ ] QR code generation

### Phase 8: Auto-Ordering
- [ ] Reorder triggers
- [ ] Vendor communication
- [ ] PO management

---

*Last updated: 2026-01-27*

---

## Website Feature - Resume Checklist

When resuming the public website feature:

1. **Test Publish Flow**
   - Go to Website Builder → Step 9 (SEO) → Enter slug
   - Go to Step 10 → Click "Publish Website"
   - Verify slug is created in Firestore `/slugs` collection
   - Verify website data is saved with `status: 'published'`

2. **Test Public Website**
   - Visit https://kitchencommand-website.vercel.app/{slug}
   - Should display store info from Firestore

3. **Domain Setup (Optional)**
   - Register kitchencommand.io (~$30-50/year)
   - Add domain to Vercel project
   - Configure DNS (A record + wildcard CNAME)

4. **Remaining Features**
   - Add recipes/menu to public website
   - "Today's Menu" feature
   - Additional templates (Urbain, Chaleur)
