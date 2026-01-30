<!-- covers: src/services/database/** -->

# SmartCookBook Database Schema

Complete documentation of IndexedDB (local) and Firestore (cloud) database structures.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [ERD Diagram](#erd-diagram)
3. [IndexedDB Tables](#indexeddb-tables)
4. [Firestore Collections](#firestore-collections)
5. [Field Specifications](#field-specifications)
6. [Indexes](#indexes)
7. [Relationships](#relationships)
8. [Sync Strategy](#sync-strategy)

---

## Architecture Overview

SmartCookBook uses a **hybrid offline-first architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    IndexedDB (Dexie)                     │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐   │    │
│  │  │ recipes │ │ depts   │ │ categs  │ │inventoryItms│   │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘   │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐   │    │
│  │  │ vendors │ │invoices │ │stockTxns│ │purchaseOrds │   │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘   │    │
│  │  ┌─────────┐ ┌─────────┐                               │    │
│  │  │expenseCat││expenseRec│                              │    │
│  │  └─────────┘ └─────────┘                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                         Cloud Sync                               │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD (Firebase)                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Firestore                             │    │
│  │  cookbooks/{userId}/                                     │    │
│  │    ├── recipes/{recipeId}                               │    │
│  │    ├── categories/{categoryId}                          │    │
│  │    ├── departments/{departmentId}                       │    │
│  │    ├── vendors/{vendorId}                               │    │
│  │    └── inventoryItems/{itemId}                          │    │
│  │                                                          │    │
│  │  users/{userId}/                                         │    │
│  │    ├── settings/{settingId}                             │    │
│  │    └── business/{businessData}                          │    │
│  │                                                          │    │
│  │  stores/{storeId}/                                       │    │
│  │    ├── website/{websiteData}                            │    │
│  │    └── settings/{websiteSettings}                       │    │
│  │                                                          │    │
│  │  waitlist/{entryId}                                      │    │
│  │  feedback/{feedbackId}                                   │    │
│  │  slugs/{slug}                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- Local-first: All data available offline via IndexedDB
- Real-time sync: Changes push to Firestore when online
- User isolation: Each user's data in separate cookbook
- Conflict resolution: Last-write-wins based on `updatedAt` timestamp

---

## ERD Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENTITY RELATIONSHIP DIAGRAM                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   DEPARTMENTS   │       │   CATEGORIES    │       │     RECIPES     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ *id (PK)        │──┐    │ *id (PK)        │──┐    │ *id (PK)        │
│  name           │  │    │  name           │  │    │  name           │
│  nameLower      │  │    │  departmentId   │──┘    │  nameLower      │
│  isDefault      │  └───>│  isDefault      │       │  category       │
│  createdAt      │       │  createdAt      │       │  department     │
└─────────────────┘       └─────────────────┘       │  departmentId   │──┐
                                                     │  portions       │  │
                                                     │  ingredients[]  │  │
                                                     │  method[]       │  │
                                                     │  notes          │  │
                                                     │  plating        │  │
                                                     │  imageUrl       │  │
                                                     │  plu            │  │
                                                     │  createdAt      │  │
                                                     │  updatedAt      │  │
                                                     │  syncId         │  │
                                                     └────────┬────────┘  │
                                                              │           │
                          ┌───────────────────────────────────┘           │
                          │                                               │
                          ▼                                               │
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐  │
│PRODUCTION_LOGS  │       │ INVENTORY_ITEMS │       │     VENDORS     │  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤  │
│ *id (PK)        │       │ *id (PK)        │       │ *id (PK)        │  │
│  recipeId (FK)  │───────│  name           │       │  name           │  │
│  recipeName     │       │  nameNormalized │       │  nameLower      │  │
│  taskId         │       │  sku            │       │  vendorCode     │  │
│  employeeId     │       │  vendorId (FK)  │──────>│  contactName    │  │
│  employeeName   │       │  vendorName     │       │  email          │  │
│  department     │───────│  category       │       │  phone          │  │
│  portions       │       │  currentPrice   │       │  address        │  │
│  scaleFactor    │       │  lastPurchaseDate│      │  city           │  │
│  startedAt      │       │  isActive       │       │  province       │  │
│  completedAt    │       │  createdAt      │       │  isActive       │  │
│  durationMs     │       │  updatedAt      │       │  isPrimary      │  │
│  laborCost      │       └────────┬────────┘       │  isInternal     │  │
│  foodCost       │                │                │  rating         │  │
│  totalCost      │                │                │  createdAt      │  │
│  costPerPortion │                │                │  updatedAt      │  │
│  createdAt      │                │                └─────────────────┘  │
└─────────────────┘                │                                     │
                                   │                                     │
┌─────────────────┐       ┌────────▼────────┐       ┌─────────────────┐  │
│  PRICE_HISTORY  │       │    INVOICES     │       │EXPENSE_CATEGORIES│  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤  │
│ *id (PK)        │       │ *id (PK)        │       │ *id (PK)        │  │
│  inventoryItemId│──────>│  vendorId (FK)  │       │  name           │  │
│  price          │       │  vendorName     │       │  isDefault      │  │
│  previousPrice  │       │  invoiceNumber  │       │  isActive       │  │
│  priceChange    │       │  invoiceDate    │       │  qbAccountId    │  │
│  priceChange%   │       │  totalAmount    │       │  createdAt      │  │
│  invoiceId (FK) │──────>│  status         │       │  updatedAt      │  │
│  vendorId       │       │  paymentStatus  │       └─────────────────┘  │
│  recordedAt     │       │  dueDate        │                            │
└─────────────────┘       │  sourceFile     │       ┌─────────────────┐  │
                          │  qbBillId       │       │EXPENSE_RECORDS  │  │
                          │  notes          │       ├─────────────────┤  │
                          │  createdAt      │       │ *id (PK)        │  │
                          │  updatedAt      │       │  invoiceId (FK) │──┘
                          └────────┬────────┘       │  vendorId (FK)  │
                                   │                │  expenseCatId   │
┌─────────────────┐                │                │  invoiceDate    │
│INVOICE_LINE_ITEMS│               │                │  amount         │
├─────────────────┤                │                │  qbSynced       │
│ *id (PK)        │                │                │  createdAt      │
│  invoiceId (FK) │────────────────┘                │  updatedAt      │
│  inventoryItemId│                                 └─────────────────┘
│  description    │       
│  quantity       │       ┌─────────────────┐
│  unitPrice      │       │STOCK_TRANSACTIONS│
│  lineTotal      │       ├─────────────────┤
│  matchStatus    │       │ *id (PK)        │
│  createdAt      │       │  inventoryItemId│──────────────────────────┐
└─────────────────┘       │  transactionType│                          │
                          │  referenceType  │                          │
                          │  referenceId    │                          │
                          │  quantityChange │                          │
                          │  stockBefore    │                          │
                          │  stockAfter     │                          │
                          │  isVoided       │                          │
                          │  createdAt      │                          │
                          └─────────────────┘                          │
                                                                       │
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐ │
│PURCHASE_ORDERS  │       │PURCHASE_ORDER   │       │KITCHEN_SETTINGS │ │
├─────────────────┤       │    _LINES       │       ├─────────────────┤ │
│ *id (PK)        │       ├─────────────────┤       │ *id (PK)        │ │
│  orderNumber    │       │ *id (PK)        │       │  key            │ │
│  vendorId (FK)  │──────>│  purchaseOrderId│       │  value          │ │
│  status         │       │  inventoryItemId│──────>│  updatedAt      │ │
│  total          │       │  quantity       │       └─────────────────┘ │
│  createdAt      │       │  unitPrice      │                           │
│  updatedAt      │       │  quantityReceived│                          │
└─────────────────┘       │  createdAt      │                           │
                          └─────────────────┘                           │
                                                                        │
                          Connects back to DEPARTMENTS ─────────────────┘

LEGEND:
  *field    = Primary Key (PK)
  field(FK) = Foreign Key
  field[]   = Array/JSON field
  ──────>   = Reference relationship
  - - - ->  = Soft reference (name-based)
```

---

## IndexedDB Tables

Database Name: `KitchenRecipeDB`
Current Version: `2` (with deletion tracking)

### Version History

| Version | Changes |
|---------|---------|
| v1 (2025-12-20) | **Clean schema** - vendors, inventoryItems, invoices, purchase orders, expense tracking |
| v2 (Current) | Added `deletedItems` table for tracking intentional deletions (prevents phantom resurrection) |

> **Note:** This is a clean database schema with no legacy migrations. All tables use the modern vendor/inventory naming conventions.

### recipes

Core recipe data with full-text search support and scale integration.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Recipe name |
| `nameLower` | string | Yes | Lowercase name for search |
| `category` | string | Yes | Category name |
| `department` | string | Yes | Department name |
| `departmentId` | number | Yes | Reference to departments |
| `portions` | number | Yes | Default serving size |
| `ingredients` | array | No | Array of ingredient objects |
| `method` | array | No | Array of method step strings |
| `notes` | string | No | Additional notes |
| `plating` | string | No | Plating instructions |
| `imageUrl` | string | No | Recipe image URL |
| `syncId` | string | No | Firestore document ID |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp for sync |
| **Scale Integration** | | | |
| `plu` | string | Yes | Scale PLU code |
| `sellPrice` | number | No | Sale price |
| `sellPriceUnit` | string | No | 'kg', 'lb', 'portion', '100g' |
| `portionWeight` | number | No | Expected portion weight (g) |
| `tareWeight` | number | No | Container weight (g) |
| `shelfLifeDays` | number | No | Shelf life in days |
| `labelFormat` | string | No | 'standard', 'detailed', 'simple' |
| `scaleDepartment` | string | No | Scale department code |
| `syncToScale` | boolean | No | Auto-sync to scale enabled |
| `availableForSale` | boolean | No | Can be sold on shelf |
| `availableAsIngredient` | boolean | No | Can be used in other recipes |
| `lastScaleSync` | string | No | Last scale sync timestamp |
| `scaleSyncStatus` | string | No | 'synced', 'pending', 'error' |

**Compound Index:** `[department+category]` for filtered queries

### departments

Kitchen department organization.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Department name |
| `isDefault` | boolean | Yes | System default (can't delete) |
| `createdAt` | string | Yes | ISO timestamp |

### categories

Recipe categories within departments.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Category name |
| `departmentId` | number | Yes | Parent department reference |
| `isDefault` | boolean | Yes | System default (can't delete) |
| `createdAt` | string | Yes | ISO timestamp |

### vendors

Comprehensive vendor/supplier management with business details and ordering preferences.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Display name (required) |
| `nameLower` | string | Yes | Lowercase for indexed search |
| `legalName` | string | No | Legal business name |
| `vendorCode` | string | Yes, unique | Internal vendor code |
| `contactName` | string | No | Primary contact person |
| `email` | string | No | Primary email |
| `phone` | string | No | Primary phone |
| `orderEmail` | string | No | Email for orders |
| `orderPhone` | string | No | Phone for orders |
| `fax` | string | No | Fax number |
| `address` | string | No | Street address |
| `city` | string | Yes | City |
| `province` | string | Yes | Province/state |
| `postalCode` | string | No | Postal/ZIP code |
| `country` | string | No | Country (default: Canada) |
| `paymentTerms` | string | No | Payment terms (default: Net 30) |
| `minimumOrder` | number | No | Minimum order amount |
| `deliveryDays` | string | No | Days of week for delivery |
| `leadTimeDays` | number | No | Lead time in days |
| `website` | string | No | Website URL |
| `taxNumber` | string | No | Vendor's tax/GST number |
| `rating` | number | Yes | 0-5 rating |
| `notes` | string | No | Additional notes |
| `isActive` | boolean | Yes | Active status (soft delete) |
| `isPrimary` | boolean | Yes | Primary vendor flag |
| `isInternal` | boolean | Yes | Internal business vendor |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

**Compound Index:** `[isActive+name]` for active vendor search

> **Note:** The `isInternal` flag identifies the business itself as a vendor for in-house production items. Internal vendors are hidden from the vendor list UI but used for inventory items produced by the business.

### inventoryItems

Comprehensive inventory management with fuzzy matching for invoice parsing and dual stock tracking.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Item name (required) |
| `nameNormalized` | string | Yes | Normalized for fuzzy matching |
| `description` | string | No | Item description |
| `sku` | string | Yes | SKU/product code |
| `upc` | string | No | Universal Product Code |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | No | Denormalized vendor name |
| `category` | string | Yes | Product category |
| `subcategory` | string | No | Item subcategory |
| `unitType` | string | No | Classified unit type ('tool', 'weight', 'volume', 'count', 'unknown') |
| `toolUnit` | string | No | Tool unit name (e.g., "canne", "botte", "caisse") |
| `toolAbbrev` | string | No | Abbreviation for tool unit |
| `weightPerUnit` | number | No | Weight in grams per unit |
| `purchaseQty` | number | No | Purchase quantity |
| `purchaseUnit` | string | No | Purchase unit |
| `currentPrice` | number | No | Current price per package |
| `pricePerG` | number | No | Price per gram (for weight-based) |
| `previousPricePerG` | number | No | Previous pricePerG |
| `pricePerML` | number | No | Price per milliliter (for volume-based) |
| `previousPricePerML` | number | No | Previous pricePerML |
| `pricePerUnit` | number | No | Price per unit/each |
| `previousPricePerUnit` | number | No | Previous pricePerUnit |
| `lastPrice` | number | No | Previous price |
| `currency` | string | No | Currency code |
| `taxRate` | number | No | Tax rate percentage (0-100) |
| `isTaxable` | boolean | No | Whether item is taxable |
| `lastPurchaseDate` | string | No | Last purchase date (ISO) |
| `lastInvoiceId` | number | No | Reference to last invoice |
| `aliases` | array | No | Alternative names for matching |
| `tags` | array | No | Tags for filtering/grouping |
| **Stock Tracking** | | | |
| `stockQuantity` | number | No | Current quantity (pieces, cases) |
| `stockQuantityUnit` | string | No | Unit for quantity ('pc', 'case') |
| `parQuantity` | number | No | Par level for quantity |
| `stockWeight` | number | No | Current weight |
| `stockWeightUnit` | string | No | Unit for weight ('lb', 'kg') |
| `parWeight` | number | No | Par level for weight |
| `reorderPoint` | number | No | Reorder point quantity |
| `reorderQuantity` | number | No | Default reorder quantity |
| `criticalThreshold` | number | No | Critical % (default: 10) |
| `lowStockThreshold` | number | No | Low stock % (default: 25) |
| **Packaging** | | | |
| `packagingFormat` | string | No | Raw format from invoice |
| `packagingType` | string | No | Type of packaging notation |
| `packCount` | number | No | Outer pack count |
| `unitsPerPack` | number | No | Units per inner pack |
| `unitsPerCase` | number | No | Individual units per case |
| `unitSize` | number | No | Size per individual unit |
| `unitSizeUnit` | string | No | Unit for unitSize |
| `lastBoxingFormat` | string | No | Boxing format from most recent invoice |
| `storageLocation` | string | No | Storage location in kitchen |
| `storageTemp` | string | No | Storage temperature requirements |
| `shelfLifeDays` | number | No | Shelf life in days |
| `isActive` | boolean | Yes | Active status (soft delete) |
| `isPreferred` | boolean | No | Preferred item flag |
| `notes` | string | No | Additional notes |
| `recipeTools` | array | No | User-defined measurement tools |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

**Compound Indexes:**
- `[vendorId+name]` for vendor item lookup
- `[category+name]` for category filtering
- `[isActive+currentPrice]` for low stock queries

### invoices

Invoice records with full lifecycle and payment tracking.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | Yes | Denormalized vendor name |
| `invoiceNumber` | string | Yes | Vendor invoice number |
| `invoiceDate` | string | Yes | Invoice date |
| `dueDate` | string | Yes | Payment due date |
| `status` | string | Yes | Processing status (draft/pending/extracted/processed/etc.) |
| `paymentStatus` | string | Yes | Payment status (unpaid/partial/paid/overdue) |
| `documentType` | string | No | Source format (pdf/image/email/manual) |
| `subtotal` | number | No | Before tax |
| `taxGST` | number | No | GST amount (5%) |
| `taxQST` | number | No | QST amount (9.975%) |
| `taxOther` | number | No | Other taxes/fees |
| `total` | number | Yes | Total including taxes |
| `paidAmount` | number | No | Amount paid so far |
| `paidAt` | string | No | Payment date |
| `paymentMethod` | string | No | Payment method |
| `paymentReference` | string | No | Check/transaction number |
| `sourceFile` | string | No | Original PDF/image |
| `extractedData` | object | No | AI extraction results |
| `qbBillId` | string | No | QuickBooks bill ID |
| `qbVendorId` | string | No | QuickBooks vendor ID |
| `qbAccountId` | string | No | QuickBooks account ID |
| `notes` | string | No | Additional notes |
| `createdAt` | string | Yes | ISO timestamp |
| `updatedAt` | string | No | ISO timestamp |

**Status Values:**
- `draft` - Just uploaded
- `pending` - Awaiting OCR/AI extraction
- `extracting` - Currently being processed
- `extracted` - Data extracted, awaiting review
- `reviewed` - User reviewed extracted data
- `processed` - Line items matched to inventory
- `sent_to_qb` - Synced to QuickBooks
- `error` - Processing failed
- `archived` - Completed and archived

**Compound Index:** `[vendorId+invoiceDate]` for vendor invoice history

### invoiceLineItems

Individual line items extracted from invoices with inventory matching.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `invoiceId` | number | Yes | Foreign key to invoices |
| `inventoryItemId` | number | Yes | Linked inventory item (if matched) |
| `description` | string | No | Line description from invoice |
| `quantity` | number | No | Quantity |
| `unit` | string | No | Unit of measure |
| `unitPrice` | number | No | Price per unit |
| `lineTotal` | number | No | Line total |
| `totalPrice` | number | No | Alias for lineTotal |
| `matchConfidence` | number | No | AI match confidence (0-1) |
| `matchStatus` | string | No | Match status (unmatched/auto_matched/manual_matched/etc.) |
| `lineNumber` | number | No | Order on invoice |
| `notes` | string | No | Line notes |
| `createdAt` | string | No | ISO timestamp |

**Match Status Values:**
- `unmatched` - Not yet matched
- `auto_matched` - AI matched with confidence
- `manual_matched` - User selected match
- `new_item` - Created new inventory item
- `skipped` - User skipped matching
- `rejected` - User rejected suggested match
- `confirmed` - Match confirmed by user

**Compound Index:** `[invoiceId+lineNumber]`

### stockTransactions

Complete audit trail of all inventory movements.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `inventoryItemId` | number | Yes | Foreign key to inventoryItems |
| `transactionType` | string | Yes | Type of transaction |
| `referenceType` | string | Yes | What the transaction links to |
| `referenceId` | number | Yes | ID of source document |
| `quantityChange` | number | No | +/- quantity change |
| `stockBefore` | number | No | Stock before transaction |
| `stockAfter` | number | No | Stock after transaction |
| `unit` | string | No | Unit of measure |
| `reason` | string | No | Reason for adjustment |
| `recipeId` | number | No | Recipe reference (for task usage) |
| `recipeName` | string | No | Recipe name (denormalized) |
| `taskId` | number | No | Task reference |
| `isVoided` | boolean | Yes | Transaction voided |
| `voidedAt` | string | No | Void timestamp |
| `voidedBy` | string | No | User who voided |
| `voidReason` | string | No | Reason for void |
| `createdBy` | string | No | User who created |
| `createdAt` | string | Yes | ISO timestamp |

**Transaction Types:**
- `purchase` - Stock added from invoice/PO
- `task_usage` - Stock used for recipe/task production
- `adjustment` - Manual stock correction
- `waste` - Spoilage/damage loss
- `transfer` - Transfer between locations
- `count_correction` - Physical count correction
- `return` - Returned to vendor
- `sample` - Used for sampling/testing
- `theft` - Suspected theft/loss
- `initial` - Initial stock entry

**Reference Types:**
- `invoice` - Links to invoices table
- `invoice_line` - Links to invoiceLineItems table
- `task` - Links to tasks/productionLogs
- `recipe` - Links to recipes table
- `manual` - No external reference

**Compound Indexes:**
- `[inventoryItemId+createdAt]` for item history
- `[transactionType+createdAt]` for type filtering

### purchaseOrders

Purchase orders with full lifecycle tracking.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `orderNumber` | string | Yes, unique | Format: PO-YYYY-NNN |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | No | Denormalized vendor name |
| `status` | string | Yes | Order status |
| `createdAt` | string | Yes | ISO timestamp |
| `createdBy` | string | No | User ID who created |
| `createdByName` | string | No | User display name |
| `approvedAt` | string | No | Approval timestamp |
| `approvedBy` | string | No | Approver user ID |
| `sentAt` | string | Yes | Sent timestamp |
| `sentMethod` | string | No | Send method (email/fax/phone/etc.) |
| `confirmedAt` | string | No | Vendor confirmation timestamp |
| `expectedDeliveryDate` | string | Yes | Expected delivery date |
| `receivedAt` | string | No | Receipt timestamp |
| `subtotal` | number | No | Before tax |
| `taxGST` | number | No | GST amount |
| `taxQST` | number | No | QST amount |
| `total` | number | Yes | Total including taxes |
| `currency` | string | No | Currency code (default: CAD) |
| `deliveryAddress` | string | No | Delivery location |
| `deliveryInstructions` | string | No | Special instructions |
| `vendorConfirmationNumber` | string | No | Vendor's reference |
| `notes` | string | No | Internal notes |
| `lineCount` | number | No | Denormalized line count |
| `updatedAt` | string | Yes | ISO timestamp |

**Status Values:**
- `draft` - Being edited
- `pending_approval` - Awaiting approval
- `approved` - Approved, ready to send
- `sent` - Sent to vendor
- `confirmed` - Vendor confirmed
- `partially_received` - Some items received
- `received` - All items received
- `cancelled` - Order cancelled
- `closed` - Order closed/archived

### purchaseOrderLines

Line items for purchase orders with
