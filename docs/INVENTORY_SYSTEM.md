# SmartCookBook Inventory System

Complete documentation for the inventory management system including vendors, inventory items, invoices, and stock tracking.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Flow](#data-flow)
4. [Vendors](#vendors)
5. [Inventory Items](#inventory-items)
6. [Dual Stock Tracking](#dual-stock-tracking)
7. [Invoice Processing](#invoice-processing)
8. [Integration Points](#integration-points)
9. [Components](#components)

---

## Overview

The inventory system provides:

- **Vendor Management**: Full vendor database with contact info, payment terms, ordering details
- **Inventory Items**: Stock tracking with dual quantity/weight support
- **Invoice Processing**: AI-powered invoice parsing with automatic vendor/inventory creation
- **Price History**: Track price changes over time for cost analysis
- **Purchase Orders**: Generate and track orders to vendors

### Key Features

| Feature | Description |
|---------|-------------|
| Dual Stock Tracking | Track items by quantity (8 pc) AND weight (175 lb) simultaneously |
| Auto Vendor Extraction | Claude AI extracts vendor info from invoice images |
| Auto Inventory Creation | New items automatically added to inventory from invoices |
| Vendor Auto-Update | Empty vendor fields populated from new invoice data |
| Compact List View | Single-line inventory display: Name | Qty/Weight | Progress Bar |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     INVENTORY DASHBOARD                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Items   │ │ Vendors  │ │  Orders  │ │ Invoices │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
└───────┼────────────┼────────────┼────────────┼──────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌───────────────────────────────────────────────────────────────────┐
│                        IndexedDB (Dexie)                          │
│  ┌──────────────┐ ┌──────────┐ ┌───────────────┐ ┌─────────────┐ │
│  │inventoryItems│ │ vendors  │ │purchaseOrders │ │  invoices   │ │
│  └──────────────┘ └──────────┘ └───────────────┘ └─────────────┘ │
│  ┌──────────────┐ ┌──────────┐ ┌───────────────┐                 │
│  │priceHistory  │ │stockTrans│ │invoiceLineItem│                 │
│  └──────────────┘ └──────────┘ └───────────────┘                 │
└───────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Invoice → Inventory Flow

```
User uploads invoice image
        ↓
Claude AI parses invoice
   ├─ Vendor info extracted (name, phone, address, payment terms...)
   └─ Line items extracted (name, quantity, weight, price...)
        ↓
System checks for existing vendor
   ├─ Found: Update empty fields with new data
   └─ Not found: Create new vendor with all extracted info
        ↓
For each line item:
   ├─ Found in inventory: Add to stock, update price
   └─ Not found: Create new inventory item
        ↓
Invoice saved with vendor and line item links
        ↓
Price history recorded for cost tracking
```

### Recipe Task → Inventory Flow (Future)

```
Recipe task completed
        ↓
Production log created
        ↓
Inventory deducted (ingredient quantities)
        ↓
If recipe has scale settings:
   └─ Produced item added to inventory
      (internal vendor = your business)
```

---

## Vendors

### Vendor Fields

| Field | Description | Auto-Extracted |
|-------|-------------|----------------|
| `name` | Vendor name | Yes |
| `legalName` | Legal company name | Yes |
| `phone` | Primary phone | Yes |
| `fax` | Fax number | Yes |
| `email` | Primary email | Yes |
| `website` | Website URL | Yes |
| `address` | Street address | Yes |
| `city` | City | Yes |
| `province` | Province/State | Yes |
| `postalCode` | Postal code | Yes |
| `country` | Country | Yes |
| `accountNumber` | Customer account # | Yes |
| `paymentTerms` | Payment terms (Net 30) | Yes |
| `taxNumber` | Vendor's tax # | Yes |
| `isInternal` | Internal business vendor | No |

### Internal Vendor (v16)

For in-house production (e.g., pastry making croissant dough):

- Business auto-created as vendor with `isInternal: true`
- Hidden from vendor list UI
- Used for items produced by the business
- Enables linking in-house items as recipe ingredients

---

## Inventory Items

### Item Fields

| Field | Description |
|-------|-------------|
| `name` | Item name |
| `sku` | Product code |
| `vendorId` | Link to vendor |
| `vendorName` | Denormalized vendor name |
| `category` | Product category |
| `unit` | Package unit (e.g., "Caisse 5lb") |
| `currentPrice` | Package price |
| `pricePerG` | Normalized price per gram (from invoice) |
| `pricePerML` | Normalized price per ml (for liquids) |

### Stock Fields

| Field | Description |
|-------|-------------|
| `currentStock` | Legacy single stock value |
| `parLevel` | Legacy par level |
| `stockQuantity` | Quantity count (v15) |
| `stockQuantityUnit` | Quantity unit ('pc', 'case') |
| `parQuantity` | Par level for quantity |
| `stockWeight` | Weight value (v15) |
| `stockWeightUnit` | Weight unit ('lb', 'kg') |
| `parWeight` | Par level for weight |

---

## Dual Stock Tracking

### The Problem

Many items need both quantity AND weight:
- "8 pieces of tuna weighing 175 lbs total"
- "4 cases of beef (108 lbs)"

### The Solution (v15)

Items can have BOTH:
- `stockQuantity` + `stockQuantityUnit` (e.g., 8 pc)
- `stockWeight` + `stockWeightUnit` (e.g., 175 lb)

### Display Format

```
boeuf contre-filet          8 pc | 175 lb    [████████░░]
thon albacore              4 pc | 108.84 lb  [██████████]
```

### Invoice Parsing

Claude extracts from invoices with both columns:
- "Quantité" (Quantity) → `quantity` + `quantityUnit`
- "Poid" (Weight) → `weight` + `weightUnit`

Example invoice line:
```
Thon Albacore AAA | Qté: 8 | Poid: 173.51 lb | $1,214.57
```

Parsed as:
```json
{
  "name": "thon albacore aaa",
  "quantity": 8,
  "quantityUnit": "pc",
  "weight": 173.51,
  "weightUnit": "lb"
}
```

---

## Invoice Processing

### Supported Invoice Formats

- PDF documents
- Image files (JPG, PNG)
- Multi-page invoices

### Extracted Data

**Vendor Info:**
- Name, legal name
- Phone, fax, email, website
- Full address
- Account number, payment terms
- Tax number

**Line Items:**
- Item code, description, name
- Category (Meat, Seafood, Dairy, etc.)
- Quantity AND weight (dual tracking)
- Unit price, total price

**Totals:**
- Subtotal, tax amount, total
- Currency (CAD/USD)

### Processing Pipeline (3-Phase)

```
Phase 1: Local Analysis (invoiceAnalyzer.js)
   ├─ Extract weights from descriptions (regex)
   ├─ Validate math (qty × unit = total)
   ├─ Detect pricing type (standard vs weight-based)
   └─ Check for duplicates
        ↓
Phase 2: AI Parsing (claudeAPI.js)
   ├─ Claude extracts structured data
   ├─ Vendor info, line items, totals
   └─ Categories assigned
        ↓
Phase 3: Merge & Compare (invoiceMerger.js)
   ├─ Merge local + Claude data
   ├─ Local weight = "ground truth"
   ├─ Detect discrepancies
   ├─ Calculate pricePerG/pricePerML
   └─ Tag lines for routing
```

### Line Type Tagging (v2025-12-14)

Each line item is classified for downstream routing:

| Line Type | Description | → Inventory | → QuickBooks |
|-----------|-------------|-------------|--------------|
| `product` | Regular inventory item | Yes | Yes |
| `deposit` | Bottle deposits, consignment | No | No (tracked separately) |
| `fee` | Delivery, shipping, freight | No | Yes |
| `credit` | Returns, refunds, negative amounts | No | Yes |
| `zero` | Zero qty AND zero price | No | No |

**Line Item Tags:**
```javascript
{
  lineType: 'product',      // Classification
  forInventory: true,       // Should create/update inventory item
  forAccounting: true,      // Should go to QuickBooks
  isDeposit: false          // Quick check for deposit handling
}
```

**Detection Patterns:**
- `deposit`: CONSIGN, DÉPÔT, EMBALLAGE, CONTAINER
- `fee`: LIVRAISON, FREIGHT, SHIPPING, FRAIS (word boundary)
- `credit`: Negative totalPrice or quantity
- `zero`: qty === 0 AND totalPrice === 0

### Reconciliation Panel

The invoice upload page shows a breakdown:

```
Invoice Breakdown
─────────────────────────────────
Products (57 items)        $3,123.74
Deposits (2 items)           $12.00
Fees (1 item)                $37.74
─────────────────────────────────
Calculated Subtotal        $3,173.48
QuickBooks will receive    $3,161.48
  (excludes deposits - tracked separately)
```

This helps explain "subtotal mismatch" warnings when deposits account for the difference.

### Processing Flow

1. User uploads invoice image/PDF
2. Phase 1: Local analysis (weight extraction, validation)
3. Phase 2: Claude AI parsing (structured data)
4. Phase 3: Merge & tag line items
5. User reviews with reconciliation breakdown
6. User clicks "Save to Inventory"
7. Products → Inventory items created/updated
8. All accounting lines → Ready for QuickBooks sync

---

## Integration Points

### QuickBooks Integration

- Invoices can be synced to QuickBooks as bills
- Vendor mapping to QB vendors
- Account mapping for expense categories

### Scale Integration (v16)

See [SCALE_INTEGRATION_README.md](SCALE_INTEGRATION_README.md) for details.

When scale integration is enabled:
- Recipe production auto-creates inventory items
- Scale events trigger inventory updates
- POS data reconciles with production

### Recipe Linking

Inventory items can be linked to recipe ingredients:
- Enables automatic cost calculation
- Tracks usage when recipes are made
- In-house items (from production) available as ingredients

---

## Recipe Price Calculation

### Overview

Recipe ingredient costs are calculated using a simple formula:

```
price = grams × pricePerG × scalingFactor
```

Where:
- `grams` = parsed from recipe metric (e.g., "4kg" → 4000)
- `pricePerG` = normalized price per gram from inventory item
- `scalingFactor` = recipe scaling multiplier (default 1)

### Price Data Flow

```
Invoice Import
      ↓
Claude extracts: quantity, weight, price
      ↓
Calculate normalized price:
   pricePerG = totalPrice / totalGrams
   pricePerML = totalPrice / totalML (for liquids)
      ↓
Saved to inventoryItem.pricePerG
      ↓
Recipe links to inventory item
      ↓
Price calculated: metric × pricePerG
```

### Inventory Item Price Fields

| Field | Description |
|-------|-------------|
| `currentPrice` | Package price (e.g., $18.01 per 5lb bag) |
| `pricePerG` | Normalized price per gram (e.g., $0.00794/g) |
| `pricePerML` | Normalized price per ml (for liquids) |

### Price Calculator Service

**Location:** `services/ai/priceCalculator.js`

**Exports:**
```javascript
import { calculateIngredientPrice, calculateRecipeCost, PRICE_ERROR } from './priceCalculator';
```

**Error Codes:**
| Code | Description |
|------|-------------|
| `not_linked` | Ingredient not linked to inventory |
| `ingredient_not_found` | Linked item was deleted |
| `no_price` | Item missing `pricePerG` (!) badge shown |
| `no_metric` | Recipe ingredient has no metric value |

### Validation Badge States

| Badge | Color | Meaning |
|-------|-------|---------|
| ⛓️ | Gray | Not linked to inventory |
| ⚠️ | Orange | Linked item deleted |
| 🔗 | Green | Linked and ready |

---

## Components

### UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `InventoryDashboard` | `components/inventory/` | Main dashboard with tabs |
| `InventoryListItem` | `components/inventory/` | Compact item row display |
| `VendorsTab` | `components/vendors/` | Vendor list and management |
| `VendorCard` | `components/vendors/` | Vendor display card |
| `InvoiceUploadPage` | `pages/` | Invoice upload and parsing |

### Services

| Service | Location | Description |
|---------|----------|-------------|
| `vendorDB` | `services/database/vendorDB.js` | Vendor CRUD operations |
| `inventoryItemDB` | `services/database/inventoryItemDB.js` | Inventory CRUD operations |
| `invoiceDB` | `services/database/invoiceDB.js` | Invoice CRUD operations |
| `parseInvoiceWithClaude` | `services/ai/claudeAPI.js` | AI invoice parsing |
| `priceCalculator` | `services/ai/priceCalculator.js` | Recipe ingredient pricing |
| `vendorService` | `services/inventory/vendorService.js` | Vendor business logic |
| `stockService` | `services/inventory/stockService.js` | Stock management |

### CSS Modules

| Module | Location |
|--------|----------|
| `inventorydashboard.module.css` | `styles/components/` |
| `inventorylistitem.module.css` | `styles/components/` |
| `vendorcard.module.css` | `styles/components/` |
| `vendorstab.module.css` | `styles/components/` |

---

## Database Version History

| Version | Changes |
|---------|---------|
| v13 | Initial inventory system (vendors, inventoryItems, purchaseOrders) |
| v14 | Removed `ingredients` table, consolidated to `inventoryItems`; updated `priceHistory` |
| v15 | Added dual stock tracking (stockQuantity/stockWeight) |
| v16 | Added scale integration fields; added `isInternal` to vendors |

---

*Last Updated: 2025-12-14*
