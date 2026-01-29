<!-- covers: src/services/inventory/**, src/components/inventory/** -->

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
8. [Invoice Type Handlers](#invoice-type-handlers)
9. [Integration Points](#integration-points)
10. [Recipe Price Calculation](#recipe-price-calculation)
11. [Production Execution Mode](#production-execution-mode)
12. [Task Dependencies](#task-dependencies)
13. [Components](#components)

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

### Processing Pipeline (4-Phase)

```
Phase 1: Vision Parsing (vision/visionParser.js)
   ├─ PDF → Images (page by page)
   ├─ Claude Vision API extracts structured JSON
   └─ Vendor info, line items, totals extracted
        ↓
Phase 2: Normalization (vision/jsonNormalizer.js)
   ├─ Field aliases (qty_invoiced → quantity)
   ├─ Unit normalization (un/ea/pc → ea)
   ├─ Vendor matching (tax#, phone, name)
   └─ Invoice type auto-detection
        ↓
Phase 3: Handler Processing (handlers/*.js)
   ├─ Type-specific line analysis
   ├─ Math validation (qty × price = total)
   ├─ Weight extraction (food supply)
   ├─ Boxing format parsing (packaging)
   ├─ Calculate pricePerG/pricePerML
   └─ Tag lines for routing
        ↓
Phase 4: Invoice Validation (invoiceAnalyzer.js)
   ├─ Validate totals (subtotal + tax = total)
   ├─ Quebec tax validation (TPS/TVQ)
   └─ Check for duplicate invoices
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

1. User uploads invoice PDF
2. Vision parser extracts structured JSON via Claude Vision API
3. Normalizer applies field aliases and matches vendor
4. Invoice type auto-detected (food, packaging, utilities, services)
5. Handler processes lines with type-specific logic
6. User reviews with reconciliation breakdown
7. User clicks "Save to Inventory"
8. Products → Inventory items created/updated
9. All accounting lines → Ready for QuickBooks sync

---

## Invoice Type Handlers

### Overview

Invoice processing uses a **type-based handler architecture** to support vendor-specific parsing and inventory logic. Each handler provides:

- **Column type definitions** for profile setup
- **Wizard configuration** for UI-guided vendor setup
- **Prompt hints** for Claude AI parsing
- **Line validation** rules
- **Inventory item creation** logic
- **Inventory item update** logic
- **Display formatting** for UI tables

### Handler Types

| Type | Label | Use Case |
|------|-------|----------|
| `foodSupply` | Food Supplier | Food ingredients with weight-based pricing (meat, dairy, produce) |
| `packagingDistributor` | Packaging Distributor | Containers, bags, lids with nested unit notation (6x50 bags) |
| `utilities` | Utilities | Electricity, gas, water, telecom bills |
| `services` | Services | Repairs, maintenance, professional services |
| `generic` | Generic | Default fallback for unspecified vendors |

### Architecture

```
Invoice Upload (PDF)
        ↓
Vision Parser → Claude Vision API → Raw JSON
        ↓
JSON Normalizer → Field aliases + vendor matching
        ↓
invoiceTypeDetector → Auto-detect type (food, packaging, utilities, services)
        ↓
handlerRegistry.getHandler(type) → Returns appropriate handler
        ↓
handler.processLineV2(line) → 5-phase processing
   ├─ Extract fields
   ├─ Determine pricing type
   ├─ Validate math
   ├─ Calculate pricing
   └─ Build summary
        ↓
handler.formatLineForStorage() → Database format
        ↓
invoiceLineService.processLinesToInventory() → Create/update items
```

### Handler Methods

Each handler implements:

| Method | Description |
|--------|-------------|
| `processLineV2(line)` | Main processing: 5-phase pipeline (extract → pricing type → validate → calculate → summary) |
| `processLines(lines)` | Batch processing wrapper for V2 pipeline |
| `formatLineForStorage(line)` | Convert processed line to database format |
| `formatLineForDisplay(line)` | Format line for UI table display |
| `createInventoryItem(line, vendor, opts)` | Create new inventory item from invoice line |
| `updateInventoryItem(existing, line, vendor, opts)` | Update existing item with invoice data |
| `applyColumnMapping(line, profile)` | Apply type-specific column mappings |
| `getColumnTypes()` | Column type definitions |
| `getDisplayFieldMap(item)` | Map AI labels to display values |

### Type-Specific Logic

**Food Supply Handler:**
- V2 5-phase pipeline: Extract → Pricing Type → Validate → Calculate → Route
- Extracts weight from description (e.g., "2/5LB" = 2 units × 5lb each)
- Calculates `pricePerG` for cost normalization
- Determines pricing type early (WEIGHT vs UNIT)
- Weighted confidence scoring (Math: 50%, Weight: 30%, Extraction: 20%)
- Category: Food/Meat/Seafood/Dairy/Produce

**Packaging Distributor Handler:**
- Parses nested unit notation (e.g., "6x50" = 6 cases of 50)
- Extracts container capacity (e.g., "2.25LB" container size)
- Tracks `containerUnitsStock` for pack-level inventory
- Does NOT calculate pricePerG (container size ≠ weight)
- Category: Packaging

**Generic Handler:**
- Basic field extraction (description, quantity, unit price)
- No weight/packaging-specific logic
- Fallback for unspecified vendor types

### Handler Registry

The registry (`handlerRegistry.js`) provides:

```javascript
import {
  getHandler,
  getHandlerForProfile,
  getHandlerForVendor,
  getAllHandlerTypes,
  getColumnTypesForInvoiceType,
  createInventoryItem,
  updateInventoryItem,
  getPromptHints,
  formatLinesForDisplay,
  getWizardOptions,
  getAllWizardOptions
} from 'services/invoice/handlers';
```

### Adding New Handlers

1. Create handler file in `services/invoice/handlers/`
2. Implement required methods (use `baseHandler.js` utilities)
3. Add type constant to `types.js`
4. Register in `handlerRegistry.js` handlers map
5. Export from `index.js`

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

## Production Execution Mode

### Overview

Production Execution Mode enables tracking actual outputs from butchery and transformation recipes. When a task is created from a production recipe and opened in view mode, the system enters execution mode where users can:

- View recipe method steps as read-only text
- Enter actual weights for each output
- Track variable outputs (bones, trim) that must be weighed
- See real-time yield summary (Rendement)

### Use Case: Butchery Tasks

A typical butchery recipe (e.g., "Découpe Contre-Filet") produces multiple outputs:
- **Fixed outputs**: Filet mignon, contre-filet, steaks (predictable)
- **Variable outputs**: Bones (os de boeuf), trim (boeuf trim) (must be weighed)

```
Input: 26 kg whole contre-filet
        ↓
┌─────────────────────────────────────────┐
│ Filet mignon      Attendu: 3.2L   Réel: 3.2L  │
│ Contre-filet      Attendu: 8.5L   Réel: 8.5L  │
│ Steaks            Attendu: 6.0L   Réel: 6.0L  │
│ ⚡ Os de boeuf    Attendu: 4.0L   Réel: 4.2L  │  ← Variable
│ ⚡ Boeuf trim     Attendu: 3.0L   Réel: 2.8L  │  ← Variable
└─────────────────────────────────────────┘
        ↓
Rendement: 24.7L / 26 kg = 95.0%
Perte: 1.3 kg
```

### Data Fields

**Step-Level Fields (MethodSteps):**

| Field | Type | Description |
|-------|------|-------------|
| `producesItem` | boolean | Step produces an inventory output |
| `outputName` | string | Name of produced item |
| `expectedWeight` | number | Expected output weight (from recipe) |
| `actualWeight` | number | Actual weighed output (execution mode) |
| `weightUnit` | string | Unit (kg, L, lb) |
| `isVariable` | boolean | Variable outputs must be weighed (bones, trim) |
| `yieldPercent` | number | Optional expected yield % for auto-calculation |

**Recipe-Level Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `isProductionRecipe` | boolean | Recipe creates inventory items |
| `portions` | number | Base batch size |

### Execution Mode Flow

```
Task created from production recipe
        ↓
User opens task in view mode (taskId + view=true in URL)
        ↓
RecipeEditorPage enters execution mode:
   ├─ Parses inputWeight from first ingredient's metric field
   ├─ Applies scaling (targetPortions / basePortions)
   └─ Passes executionMode=true to MethodSteps
        ↓
MethodSteps renders in execution mode:
   ├─ Method text: Read-only
   ├─ Output steps: Show weight inputs
   │    └─ Réel defaults to Attendu value
   ├─ Variable outputs: Highlighted (⚡ icon)
   └─ Yield summary displayed at bottom
        ↓
User enters actual weights
        ↓
Yield summary updates in real-time:
   ├─ Total Attendu (sum of expectedWeight)
   ├─ Total Réel (sum of actualWeight)
   ├─ Rendement % = (Réel / Input) × 100
   └─ Perte = Input - Réel
```

### Input Weight Parsing

The input weight for yield calculation comes from the first ingredient:

```javascript
// Priority: metric field (displayed value) > metricQty field
if (firstIngredient.metric) {
  // Parse from displayed string: "26kg" → 26
  const match = metric.match(/^([\d.,]+)\s*(kg|g|lb|L|ml)?$/i);
  inputWeight = parseFloat(match[1]) * scalingFactor;
  inputWeightUnit = match[2] || 'kg';
} else if (firstIngredient.metricQty) {
  // Fallback to numeric field
  inputWeight = parseFloat(metricQty) * scalingFactor;
}
```

### Yield Summary (Rendement)

The yield summary shows at the bottom of method steps in execution mode:

| Field | Calculation | Description |
|-------|-------------|-------------|
| Input | First ingredient metric × scale | Total input weight |
| Attendu | Σ expectedWeight | Expected total output |
| Réel | Σ actualWeight | Actual total output |
| Rendement | (Réel / Input) × 100 | Yield percentage |
| Perte | Input - Réel | Weight loss |

### Three Rendering Modes

The MethodSteps component supports three modes:

| Mode | Condition | Method Text | Weights | Use Case |
|------|-----------|-------------|---------|----------|
| **Edit** | `editable=true` | Editable textarea | Full editing | Recipe editing |
| **View** | `editable=false` | Read-only badges | Read-only | Recipe viewing |
| **Execute** | `executionMode=true` | Read-only text | Actual weight inputs | Task execution |

### CSS Classes

| Class | Description |
|-------|-------------|
| `.executionItem` | Step container in execution mode |
| `.variableOutput` | Highlighted variable output step |
| `.weightRow` | Expected/actual weight row |
| `.actualWeightInput` | Input for actual weight entry |
| `.yieldSummary` | Bottom yield summary container |
| `.yieldStats` | Stats grid in yield summary |

### Future: Auto-Inventory Update

When execution mode is completed:
1. Actual weights saved to task record
2. Produced items added to inventory with actual quantities
3. Input ingredient deducted from inventory
4. Production log created for traceability

---

## Task Dependencies

### Overview

The Task Dependency System automatically detects when a recipe requires in-house produced ingredients and helps create prerequisite tasks for missing items. This ensures production sequences are properly coordinated.

### Use Case: In-House Ingredients

When creating a task for a recipe that uses in-house ingredients (e.g., "Sauce Béarnaise" requires in-house "Clarified Butter"):

```
User assigns "Sauce Béarnaise" task
        ↓
System checks recipe ingredients for in-house items
        ↓
Found: Clarified Butter (sourceRecipeId: "butter-clarify-001")
        ↓
Check inventory: Current stock = 200g, Required = 500g
        ↓
Shortfall detected: 300g needed
        ↓
⚠️ Warning: "Missing 300g Clarified Butter"
   [Create Prerequisites] button offered
        ↓
Creates task: "Make Clarified Butter (300g)"
   linked as prerequisite
```

### Detection Service

**Location:** `services/tasks/taskDependencyService.js`

**Key Functions:**

| Function | Description |
|----------|-------------|
| `checkRecipeDependencies(recipeId, portions)` | Analyzes recipe for in-house ingredient requirements |
| `createPrerequisiteTasks(options)` | Creates tasks for each shortfall's source recipe |
| `createTaskWithPrerequisites(taskData, options)` | One-call wrapper: check → create prereqs → create main → link |
| `checkTaskCanStart(task, getTaskById)` | Validates all prerequisite tasks are complete |

### Dependency Detection Flow

```javascript
const result = await checkRecipeDependencies(recipeId, targetPortions);

// Returns:
{
  hasDependencies: true,       // Recipe uses in-house items
  hasShortfalls: true,         // Some items have insufficient stock
  dependencies: [              // All in-house ingredients found
    {
      ingredientName: "Clarified Butter",
      inventoryItemId: "inv-001",
      sourceRecipeId: "butter-clarify-001",
      sourceRecipeName: "Clarified Butter",
      requiredAmount: 500,
      currentStock: 200,
      unit: "g"
    }
  ],
  shortfalls: [                // Items that need production
    { ...dependency, shortfall: 300 }
  ],
  summary: "1 in-house item required, 1 shortfall"
}
```

### How In-House Items Are Identified

An inventory item is considered "in-house" when:

1. **`isInternal: true`** - Item was created from internal production
2. **`sourceRecipeId`** - Item is linked to a production recipe

```javascript
// Detection logic in checkRecipeDependencies
const isInHouse =
  inventoryItem.isInternal === true ||
  inventoryItem.sourceRecipeId != null;
```

### Task Fields for Dependencies

| Field | Type | Description |
|-------|------|-------------|
| `dependsOn` | string[] | Array of task IDs that must complete first |
| `prerequisiteFor` | string | Task ID this was created to support |
| `autoGenerated` | boolean | Was this task auto-created as a prerequisite? |
| `hasDependencies` | boolean | Does this task have dependencies to check? |

### Creating Prerequisite Tasks

```javascript
const result = await createPrerequisiteTasks({
  mainTaskId: "task-main-001",
  shortfalls: dependencyResult.shortfalls,
  assignedTo: "user-001",
  assignedToName: "Chef Jean",
  department: "Cuisine",
  dueDate: "2026-01-10",
  dueTime: "08:00",
  priority: "high"
});

// Returns:
{
  success: true,
  createdTasks: [
    {
      id: "task-prereq-001",
      title: "Make Clarified Butter",
      recipeId: "butter-clarify-001",
      prerequisiteFor: "task-main-001",
      autoGenerated: true
    }
  ]
}
```

### Checking if Task Can Start

```javascript
const { canStart, blockedBy } = await checkTaskCanStart(task, getTaskById);

if (!canStart) {
  console.log("Blocked by:", blockedBy.map(t => t.title));
  // ["Make Clarified Butter", "Prepare Stock Base"]
}
```

### UI Integration

**AssignTaskModal.jsx** displays dependency warnings:

```
┌─────────────────────────────────────────┐
│ Assign Task: Sauce Béarnaise            │
├─────────────────────────────────────────┤
│ ⚠️ Missing In-House Items               │
│                                         │
│   • Clarified Butter: need 300g         │
│                                         │
│   [Create Prerequisites]                │
├─────────────────────────────────────────┤
│ ✅ Prerequisites Created                │
│                                         │
│   • Make Clarified Butter (300g)        │
│     Assigned to: Chef Jean              │
└─────────────────────────────────────────┘
```

### CSS Classes

| Class | Description |
|-------|-------------|
| `.dependencyWarning` | Warning container for shortfalls |
| `.shortfallList` | List of missing items |
| `.createPrereqButton` | "Create Prerequisites" button |
| `.prerequisitesCreated` | Success container after creation |
| `.taskItem.prerequisiteTask` | Styled prerequisite task row |

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

*Last Updated: 2026-01-10*
