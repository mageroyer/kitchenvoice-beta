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
│  │    ├── ingredients/{ingredientId}                       │    │
│  │    └── invoices/{invoiceId}                             │    │
│  │                                                          │    │
│  │  users/{userId}/                                         │    │
│  │    ├── settings/{settingId}                             │    │
│  │    ├── tasks/{taskId}                                   │    │
│  │    └── privileges/{privilegeId}                         │    │
│  │                                                          │    │
│  │  quickbooks_tokens/{environment}                         │    │
│  │  waitlist/{entryId}                                      │    │
│  │  feedback/{feedbackId}                                   │    │
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
│  updatedAt      │       │  updatedAt      │       │  departmentId   │──┐
└─────────────────┘       └─────────────────┘       │  portions       │  │
                                                     │  ingredients[]  │  │
                                                     │  method[]       │  │
                                                     │  notes          │  │
                                                     │  plating        │  │
                                                     │  imageUrl       │  │
                                                     │  createdAt      │  │
                                                     │  updatedAt      │  │
                                                     │  syncId         │  │
                                                     └────────┬────────┘  │
                                                              │           │
                          ┌───────────────────────────────────┘           │
                          │                                               │
                          ▼                                               │
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐  │
│PRODUCTION_LOGS  │       │   INGREDIENTS   │       │   SUPPLIERS     │  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤  │
│ *id (PK)        │       │ *id (PK)        │       │ *id (PK)        │  │
│  recipeId (FK)  │───────│  name           │       │  name           │  │
│  recipeName     │       │  nameLower      │       │  nameLower      │  │
│  taskId         │       │  category       │       │  contactEmail   │  │
│  employeeId     │       │  supplierId (FK)│──────>│  contactPhone   │  │
│  employeeName   │       │  supplierName   │       │  address        │  │
│  department     │───────│  unit           │       │  notes          │  │
│  portions       │       │  currentPrice   │       │  isActive       │  │
│  scaleFactor    │       │  pricePerUnit   │       │  createdAt      │  │
│  startedAt      │       │  packageSize    │       │  updatedAt      │  │
│  completedAt    │       │  lastInvoiceDate│       └─────────────────┘  │
│  durationMs     │       │  lastInvoiceId  │                            │
│  durationHours  │       │  notes          │                            │
│  laborRate      │       │  isActive       │                            │
│  laborCost      │       │  createdAt      │                            │
│  foodCost       │       │  updatedAt      │                            │
│  totalCost      │       └────────┬────────┘                            │
│  costPerPortion │                │                                     │
│  notes          │                │                                     │
│  createdAt      │                │                                     │
└─────────────────┘                │                                     │
                                   │                                     │
┌─────────────────┐       ┌────────▼────────┐       ┌─────────────────┐  │
│  PRICE_HISTORY  │       │    INVOICES     │       │KITCHEN_SETTINGS │  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤  │
│ *id (PK)        │       │ *id (PK)        │       │ *id (PK)        │  │
│  ingredientId   │──────>│  supplierId (FK)│       │  key            │  │
│  price          │       │  supplierName   │       │  value          │  │
│  previousPrice  │       │  invoiceNumber  │       │  updatedAt      │  │
│  priceChange    │       │  invoiceDate    │       └─────────────────┘  │
│  priceChange%   │       │  totalAmount    │                            │
│  invoiceId (FK) │──────>│  status         │       ┌─────────────────┐  │
│  supplierId     │       │  parsedItems[]  │       │    SLIDERS      │  │
│  recordedAt     │       │  rawText        │       ├─────────────────┤  │
└─────────────────┘       │  sourceFile     │       │ *id (PK)        │  │
                          │  qbBillId       │       │  name           │  │
                          │  notes          │       │  location       │  │
                          │  createdAt      │       │  autoPlay       │  │
                          │  updatedAt      │       │  interval       │  │
                          └─────────────────┘       │  animation      │  │
                                                    │  showDots       │  │
                                                    │  showArrows     │  │
                                                    │  slides[]       │  │
                                                    │  createdAt      │  │
                                                    │  updatedAt      │  │
                                                    └─────────────────┘  │
                                                                         │
                          Connects back to DEPARTMENTS ───────────────────┘

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
Current Version: `1` (Clean schema - migrations collapsed 2025-12-13)

### Version History

| Version | Changes |
|---------|---------|
| v1 (2025-12-13) | **Clean schema** - All v1-v16 migrations collapsed into single clean v1. Removed deprecated `suppliers` and `ingredients` tables. Uses `vendors` and `inventoryItems` exclusively. |

> **Note:** The original v1-v16 migration history was collapsed into a single clean v1 schema as part of the Week 2 architecture refactoring. No legacy users exist, so this is a clean break with no backwards compatibility shims.

### recipes

Core recipe data with full-text search support.

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
| **Scale Integration (v16, optional)** | | | |
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

**Default Values:** Cuisine, Bistro, Poissonerie, Boucherie

### categories

Recipe categories within departments.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Category name |
| `departmentId` | number | Yes | Parent department reference |
| `isDefault` | boolean | Yes | System default (can't delete) |
| `createdAt` | string | Yes | ISO timestamp |

### ingredients (REMOVED)

> **Note:** The `ingredients` table was removed. All ingredient/inventory data is now in the `inventoryItems` table. See [inventoryItems](#inventoryitems) for the current schema.

### suppliers (REMOVED)

> **Note:** The `suppliers` table was removed. Use the `vendors` table instead. See [vendors](#vendors) for the current schema.

### invoices

Parsed invoice records.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `supplierId` | number | Yes | Supplier reference |
| `supplierName` | string | Yes | Supplier display name |
| `invoiceNumber` | string | Yes | Invoice number |
| `invoiceDate` | string | Yes | Invoice date |
| `totalAmount` | number | Yes | Total invoice amount |
| `status` | string | Yes | pending/processed/error/sent_to_qb |
| `parsedItems` | array | No | Array of line items |
| `rawText` | string | No | Original OCR text |
| `sourceFile` | string | No | Original file name |
| `qbBillId` | string | No | QuickBooks bill ID |
| `qbVendorId` | string | No | QuickBooks vendor ID |
| `qbAccountId` | string | No | QuickBooks account ID |
| `notes` | string | No | Additional notes |
| `createdAt` | string | Yes | ISO timestamp |
| `updatedAt` | string | No | ISO timestamp |

**Compound Index:** `[supplierId+invoiceDate]` for supplier history

### productionLogs

Auto-generated when tasks complete.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `recipeId` | number | Yes | Recipe reference |
| `recipeName` | string | No | Recipe display name |
| `taskId` | string | Yes | Task reference |
| `employeeId` | string | Yes | Employee reference |
| `employeeName` | string | Yes | Employee display name |
| `department` | string | No | Department name |
| `portions` | number | Yes | Portions produced |
| `scaleFactor` | number | No | Recipe scale factor |
| `startedAt` | string | Yes | Task start time |
| `completedAt` | string | Yes | Task completion time |
| `durationMs` | number | Yes | Duration in milliseconds |
| `durationHours` | number | Yes | Duration in hours |
| `laborRate` | number | Yes | Hourly rate used |
| `laborCost` | number | Yes | Calculated labor cost |
| `foodCost` | number | Yes | Calculated food cost |
| `totalCost` | number | Yes | Total cost |
| `costPerPortion` | number | Yes | Cost per portion |
| `notes` | string | No | Additional notes |
| `createdAt` | string | Yes | ISO timestamp |

**Compound Index:** `[recipeId+createdAt]` for recipe history

### priceHistory

Tracks inventory item price changes over time.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `inventoryItemId` | number | Yes | Inventory item reference (v14+) |
| `price` | number | Yes | New price |
| `previousPrice` | number | No | Previous price |
| `priceChange` | number | No | Absolute change |
| `priceChangePercent` | number | No | Percentage change |
| `invoiceId` | number | Yes | Source invoice reference |
| `vendorId` | number | Yes | Vendor reference (v14+) |
| `recordedAt` | string | Yes | ISO timestamp |

> **Note (v14):** Changed from `ingredientId` to `inventoryItemId` and `supplierId` to `vendorId`.

### kitchenSettings

Key-value store for global settings.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `key` | string | Yes, unique | Setting key |
| `value` | any | Yes | Setting value (JSON) |
| `updatedAt` | string | Yes | ISO timestamp |

**Common Keys:**
- `restrictionLevel` - 1 (Quick), 2 (Standard), 3 (Accounting)
- `defaultLaborRate` - Hourly labor rate (default: 18)
- `businessName` - Business display name
- `defaultDepartment` - Default department for new recipes

### sliders

Configurable feature showcase slides.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Slider name |
| `location` | string | Yes | Page location (landing, etc.) |
| `autoPlay` | boolean | Yes | Auto-advance slides |
| `interval` | number | Yes | Slide interval (ms) |
| `animation` | string | Yes | Animation type |
| `showDots` | boolean | No | Show navigation dots |
| `showArrows` | boolean | No | Show navigation arrows |
| `slides` | array | No | Array of slide objects |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

---

## Inventory Management Tables (v13+)

The following tables were added in IndexedDB version 13 to support the inventory management system.

### vendors

Supplier/vendor database with full contact and ordering information.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Vendor name (required) |
| `nameLower` | string | Yes | Lowercase for search |
| `legalName` | string | No | Legal business name |
| `vendorCode` | string | Yes, unique | Unique vendor code |
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
| `isInternal` | boolean | Yes | Internal business vendor (v16) |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

**Compound Index:** `[isActive+name]` for active vendor search

> **Note (v16):** The `isInternal` flag identifies the business itself as a vendor for in-house production items. Internal vendors are hidden from the vendor list UI but used for inventory items produced by the business.

### inventoryItems

Stock items linked to vendors with par levels and reorder tracking.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `name` | string | Yes | Item name (required) |
| `nameNormalized` | string | Yes | Normalized for fuzzy matching |
| `sku` | string | Yes | SKU/product code |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | No | Denormalized vendor name |
| `description` | string | No | Item description |
| `category` | string | Yes | Product category |
| `unit` | string | Yes | Stock unit (kg, L, ea, etc.) |
| `currentStock` | number | Yes | Current quantity on hand (legacy) |
| `parLevel` | number | No | Target stock level (legacy) |
| **Dual Stock Tracking (v15)** | | | |
| `stockQuantity` | number | No | Current count (pieces, cases) |
| `stockQuantityUnit` | string | No | Unit for quantity ('pc', 'case') |
| `parQuantity` | number | No | Par level for quantity |
| `stockWeight` | number | No | Current weight |
| `stockWeightUnit` | string | No | Unit for weight ('lb', 'kg') |
| `parWeight` | number | No | Par level for weight |
| **Reorder Settings** | | | |
| `reorderPoint` | number | No | Trigger level for reordering |
| `reorderQuantity` | number | No | Default reorder quantity |
| `criticalThreshold` | number | No | Critical % (default: 10) |
| `lowStockThreshold` | number | No | Low stock % (default: 25) |
| `currentPrice` | number | No | Current unit price |
| `packageSize` | number | No | Package size |
| `packageUnit` | string | No | Package unit |
| `unitsPerPackage` | number | No | Units per package |
| `shelfLifeDays` | number | No | Shelf life in days |
| `aliases` | array | No | Alternative names for matching |
| `isActive` | boolean | Yes | Active status (soft delete) |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

**Compound Indexes:**
- `[vendorId+name]` for vendor item lookup
- `[category+name]` for category filtering
- `[isActive+currentStock]` for low stock queries

### purchaseOrders

Purchase orders with full lifecycle tracking.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `orderNumber` | string | Yes, unique | Format: PO-YYYY-NNN |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | No | Denormalized vendor name |
| `status` | string | Yes | Order status (see below) |
| `createdAt` | string | Yes | ISO timestamp |
| `createdBy` | string | No | User ID who created |
| `createdByName` | string | No | User display name |
| `approvedAt` | string | No | Approval timestamp |
| `approvedBy` | string | No | Approver user ID |
| `approvedByName` | string | No | Approver display name |
| `sentAt` | string | Yes | Sent timestamp |
| `sentMethod` | string | No | email/fax/phone/portal/in_person |
| `sentBy` | string | No | User who sent |
| `confirmedAt` | string | No | Vendor confirmation timestamp |
| `expectedDeliveryDate` | string | Yes | Expected delivery date |
| `receivedAt` | string | No | Receipt timestamp |
| `subtotal` | number | No | Before tax |
| `taxGST` | number | No | GST amount (5%) |
| `taxQST` | number | No | QST amount (9.975%) |
| `taxOther` | number | No | Other taxes/fees |
| `total` | number | Yes | Total including taxes |
| `currency` | string | No | Currency code (default: CAD) |
| `deliveryAddress` | string | No | Delivery location |
| `deliveryInstructions` | string | No | Special instructions |
| `vendorConfirmationNumber` | string | No | Vendor's reference |
| `vendorNotes` | string | No | Notes from vendor |
| `internalNotes` | string | No | Internal notes |
| `pdfUrl` | string | No | URL/path to PDF |
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

**Compound Indexes:**
- `[status+createdAt]` for status filtering
- `[vendorId+status]` for vendor order lookup

### purchaseOrderLines

Line items for purchase orders.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `purchaseOrderId` | number | Yes | Foreign key to purchaseOrders |
| `inventoryItemId` | number | Yes | Foreign key to inventoryItems |
| `inventoryItemName` | string | No | Denormalized item name |
| `inventoryItemSku` | string | No | Denormalized SKU |
| `quantity` | number | No | Ordered quantity |
| `unit` | string | No | Unit (kg, L, ea, etc.) |
| `unitPrice` | number | No | Price per unit |
| `lineTotal` | number | No | quantity × unitPrice |
| `quantityReceived` | number | No | Amount received |
| `quantityRemaining` | number | No | Still pending |
| `stockAtOrder` | number | No | Stock level when ordered |
| `notes` | string | No | Line-specific notes |
| `createdAt` | string | No | ISO timestamp |

**Compound Index:** `[purchaseOrderId+inventoryItemId]`

### invoices (Updated for Inventory)

Invoices updated with inventory processing fields.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `vendorId` | number | Yes | Foreign key to vendors |
| `vendorName` | string | No | Denormalized vendor name |
| `invoiceNumber` | string | Yes | Vendor invoice number |
| `invoiceDate` | string | Yes | Invoice date |
| `dueDate` | string | Yes | Payment due date |
| `status` | string | Yes | Processing status |
| `paymentStatus` | string | Yes | UNPAID/PARTIAL/PAID/OVERDUE |
| `subtotal` | number | No | Before tax |
| `taxGST` | number | No | GST amount |
| `taxQST` | number | No | QST amount |
| `total` | number | Yes | Total amount |
| `paidAmount` | number | No | Amount paid so far |
| `paidAt` | string | No | Payment date |
| `paymentMethod` | string | No | Payment method |
| `paymentReference` | string | No | Check/transaction number |
| `sourceFile` | string | No | Original PDF/image |
| `extractedData` | object | No | AI extraction results |
| `qbBillId` | string | No | QuickBooks bill ID |
| `notes` | string | No | Additional notes |
| `createdAt` | string | No | ISO timestamp |
| `updatedAt` | string | Yes | ISO timestamp |

**Invoice Status Values:**
- `draft` - Initial upload
- `pending` - Ready for processing
- `extracting` - AI extraction in progress
- `extracted` - Extraction complete
- `reviewed` - User reviewed lines
- `approved` - Ready for inventory
- `synced` - Synced to QuickBooks
- `cancelled` - Invoice cancelled
- `error` - Processing error

### invoiceLines

Line items extracted from invoices.

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
| `matchConfidence` | number | No | AI match confidence (0-1) |
| `matchStatus` | string | No | pending/matched/new_item/skipped |
| `notes` | string | No | Line notes |
| `createdAt` | string | No | ISO timestamp |

### stockTransactions

Audit trail for all stock movements.

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `id` | number | PK, auto | Unique identifier |
| `inventoryItemId` | number | Yes | Foreign key to inventoryItems |
| `transactionType` | string | Yes | purchase/adjustment/waste/transfer |
| `referenceType` | string | Yes | invoice/purchase_order/task/manual |
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
- `adjustment` - Manual stock correction
- `waste` - Spoilage/damage loss
- `transfer` - Transfer between locations

**Reference Types:**
- `invoice` - From invoice processing
- `purchase_order` - From PO receipt
- `task` - From recipe task completion
- `manual` - Manual adjustment

**Compound Indexes:**
- `[inventoryItemId+createdAt]` for item history
- `[transactionType+createdAt]` for type filtering
- `[referenceType+referenceId]` for document lookup

---

## Firestore Collections

### cookbooks/{userId}

User-isolated cookbook data. Path format: `cookbooks/user_{uid}`

#### recipes

```javascript
{
  name: "Beef Wellington",
  nameLower: "beef wellington",
  category: "Main Courses",
  department: "Cuisine",
  departmentId: 1,
  portions: 4,
  ingredients: [
    {
      name: "beef tenderloin",
      metric: "800g",
      ingredientId: 45,  // Optional link to master ingredient
      cost: 52.00        // Optional calculated cost
    }
  ],
  method: [
    "Season the beef...",
    "Wrap in pastry..."
  ],
  notes: "Chef's special",
  plating: "Slice and arrange...",
  imageUrl: "https://...",
  localId: 123,          // IndexedDB ID
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### departments

```javascript
{
  name: "Cuisine",
  isDefault: true,
  localId: 1,
  createdAt: Timestamp
}
```

#### categories

```javascript
{
  name: "Appetizers",
  departmentId: 1,
  isDefault: false,
  localId: 5,
  createdAt: Timestamp
}
```

#### ingredients

```javascript
{
  name: "beef tenderloin",
  nameLower: "beef tenderloin",
  category: "Meat",
  supplierId: 2,
  supplierName: "Sysco Foods",
  unit: "kg",
  currentPrice: 65.00,
  pricePerUnit: 65.00,
  packageSize: 1,
  lastInvoiceDate: "2025-12-01T...",
  isActive: true,
  localId: 45,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### invoices

```javascript
{
  supplierId: 2,
  supplierName: "Sysco Foods",
  invoiceNumber: "INV-2025-001",
  invoiceDate: "2025-12-01",
  totalAmount: 1250.00,
  status: "processed",
  parsedItems: [
    {
      name: "Beef Tenderloin",
      quantity: 5,
      unit: "kg",
      unitPrice: 65.00,
      totalPrice: 325.00,
      matchedIngredientId: 45
    }
  ],
  qbBillId: "123",
  localId: 10,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### users/{userId}

User-specific data not tied to cookbook.

#### settings

```javascript
{
  // Business info
  businessName: "Le Petit Bistro",
  businessAddress: "123 Main St",
  businessPhone: "(555) 123-4567",

  // Preferences
  defaultDepartment: "Cuisine",
  restrictionLevel: 2,
  defaultLaborRate: 22.50,

  // UI settings
  theme: "light",
  language: "fr-CA",

  updatedAt: Timestamp
}
```

#### tasks

```javascript
{
  recipeId: 123,
  recipeName: "Beef Wellington",
  department: "Cuisine",
  portions: 8,
  scaleFactor: 2.0,
  assignedTo: "user_abc",
  assignedToName: "Chef John",
  dueDate: "2025-12-07",
  status: "pending",  // pending, in_progress, completed
  priority: "high",
  startedAt: null,
  completedAt: null,
  notes: "VIP dinner",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### privileges

```javascript
{
  role: "editor",  // owner, editor, viewer
  department: "Cuisine",
  canEdit: true,
  canDelete: false,
  canManageUsers: false,
  grantedBy: "user_owner",
  createdAt: Timestamp
}
```

### quickbooks_tokens/{environment}

OAuth tokens for QuickBooks (sandbox/production).

```javascript
{
  accessToken: "eyJ...",
  refreshToken: "AB1...",
  tokenType: "bearer",
  expiresIn: 3600,
  expiresAt: Timestamp,
  realmId: "1234567890",
  companyName: "Le Petit Bistro Inc",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### waitlist/{entryId}

Beta waitlist signups.

```javascript
{
  email: "user@example.com",
  timestamp: Timestamp,
  source: "landing_page"
}
```

### feedback/{feedbackId}

User feedback submissions.

```javascript
{
  type: "bug",  // bug, feature, general
  message: "The voice input...",
  page: "/recipes",
  userAgent: "Mozilla/5.0...",
  userId: "user_abc",
  timestamp: Timestamp
}
```

---

## Field Specifications

### Data Types

| Type | IndexedDB | Firestore | Notes |
|------|-----------|-----------|-------|
| ID | number (auto) | string (auto) | IndexedDB uses auto-increment |
| String | string | string | Max 1MB in Firestore |
| Number | number | number | 64-bit float |
| Boolean | boolean | boolean | |
| Date | string (ISO) | Timestamp | ISO 8601 in IndexedDB |
| Array | array | array | Max 20,000 items in Firestore |
| Object | object | map | Nested data |

### Ingredient Object (in recipe)

```typescript
interface RecipeIngredient {
  name: string;           // Required: ingredient name
  metric: string;         // Required: quantity with unit (e.g., "500g")
  ingredientId?: number;  // Optional: link to master ingredient
  cost?: number;          // Optional: calculated cost
  notes?: string;         // Optional: preparation notes
}
```

### Parsed Invoice Item

```typescript
interface ParsedInvoiceItem {
  name: string;              // Item description
  quantity: number;          // Quantity
  unit: string;              // Unit of measure
  unitPrice: number;         // Price per unit
  totalPrice: number;        // Line total
  matchedIngredientId?: number;  // Linked ingredient ID
  confidence?: number;       // AI confidence score (0-1)
}
```

### Slide Object (in slider)

```typescript
interface Slide {
  id: string;           // Unique slide ID
  title: string;        // Slide title
  description: string;  // Slide description
  imageUrl?: string;    // Background image
  buttonText?: string;  // CTA button text
  buttonLink?: string;  // CTA button URL
  order: number;        // Display order
}
```

---

## Indexes

### IndexedDB Indexes (Dexie)

```javascript
// Version 7 schema
{
  recipes: '++id, name, nameLower, category, department, departmentId, [department+category], portions, updatedAt',
  departments: '++id, name, isDefault, createdAt',
  categories: '++id, name, departmentId, isDefault, createdAt',
  sliders: '++id, name, location, autoPlay, interval, animation, updatedAt',
  ingredients: '++id, name, nameLower, category, supplierId, unit, currentPrice, lastInvoiceDate, updatedAt',
  kitchenSettings: '++id, key, value, updatedAt',
  productionLogs: '++id, recipeId, taskId, employeeId, employeeName, [recipeId+createdAt], portions, startedAt, completedAt, duration, laborCost, foodCost, totalCost, createdAt',
  suppliers: '++id, name, nameLower, isActive, contactEmail, contactPhone, address, notes, createdAt',
  invoices: '++id, supplierId, supplierName, invoiceNumber, invoiceDate, [supplierId+invoiceDate], totalAmount, status, createdAt',
  priceHistory: '++id, ingredientId, price, invoiceId, supplierId, recordedAt'
}
```

### Compound Indexes

| Table | Index | Use Case |
|-------|-------|----------|
| recipes | `[department+category]` | Filter by dept and category |
| productionLogs | `[recipeId+createdAt]` | Recipe production history |
| invoices | `[supplierId+invoiceDate]` | Supplier invoice history |

### Firestore Indexes

Firestore automatically indexes all fields. Composite indexes created via `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "department", "order": "ASCENDING" },
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## Relationships

### One-to-Many

| Parent | Child | Foreign Key |
|--------|-------|-------------|
| departments | categories | `departmentId` |
| departments | recipes | `departmentId` |
| suppliers | ingredients | `supplierId` |
| suppliers | invoices | `supplierId` |
| ingredients | priceHistory | `ingredientId` |
| invoices | priceHistory | `invoiceId` |
| recipes | productionLogs | `recipeId` |

### Soft References (by name)

| From | To | Field |
|------|-----|-------|
| recipes | categories | `category` (name) |
| recipes | departments | `department` (name) |
| invoices | suppliers | `supplierName` |
| ingredients | suppliers | `supplierName` |

---

## Sync Strategy

### Push to Cloud

When data changes locally:

1. Update IndexedDB
2. Call `cloudSync.pushXxx(data)`
3. Cloud function writes to Firestore
4. `updatedAt` timestamp updated

### Pull from Cloud

On app load or reconnect:

1. Fetch Firestore documents where `updatedAt > lastSync`
2. Compare with local `updatedAt`
3. Newer version wins (last-write-wins)
4. Update IndexedDB

### Conflict Resolution

```javascript
// From cloudSync.js
if (cloudDate > localDate) {
  // Cloud is newer - update local
  await localDb.recipes.update(localId, cloudData);
} else if (localDate > cloudDate) {
  // Local is newer - push to cloud
  await pushRecipe(localRecipe);
}
// Equal timestamps - prefer cloud for consistency
```

### Real-time Sync

Using Firestore `onSnapshot`:

```javascript
onSnapshot(recipesCollection, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added' || change.type === 'modified') {
      syncRecipeToLocal(change.doc.data());
    }
    if (change.type === 'removed') {
      removeLocalRecipe(change.doc.id);
    }
  });
});
```

---

*Last Updated: 2025-12-13*
