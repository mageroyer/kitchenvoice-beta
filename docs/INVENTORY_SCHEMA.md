# Inventory Item Schema Reference

Complete field reference for inventory items, organized by category with update behavior documentation.

**Last Updated:** 2025-12-28

---

## Table of Contents
1. [Core Identity Fields](#1-core-identity-fields)
2. [Vendor & Source Fields](#2-vendor--source-fields)
3. [Pricing Fields](#3-pricing-fields)
4. [Stock Quantity Fields](#4-stock-quantity-fields)
5. [Weight/Volume Fields](#5-weightvolume-fields)
6. [Packaging Fields (Food Supply)](#6-packaging-fields-food-supply)
7. [Container Fields (Packaging Distributor)](#7-container-fields-packaging-distributor)
8. [Recipe Tools](#8-recipe-tools)
9. [Metadata Fields](#9-metadata-fields)
10. [MISSING Fields (Proposed)](#10-missing-fields-proposed)
11. [Update Behavior Matrix](#11-update-behavior-matrix)
12. [Type-Specific Field Usage](#12-type-specific-field-usage)

---

## 1. Core Identity Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | number | auto | Auto-generated primary key | `42` |
| `name` | string | **YES** | Display name | `"TOMATE CERISE ROUGE"` |
| `nameNormalized` | string | auto | Lowercase, no accents (for search) | `"tomate cerise rouge"` |
| `description` | string | no | Additional description | `"12/DRY PT"` |
| `sku` | string | no | Vendor product code | `"CL-80134"` |
| `upc` | string | no | Universal barcode | `"012345678901"` |
| `category` | string | no | Item category | `"Produce"`, `"Meat"`, `"Packaging"` |
| `subcategory` | string | no | Subcategory | `"Tomatoes"` |
| `isActive` | boolean | no | Soft delete flag | `true` |
| `isPreferred` | boolean | no | Preferred item flag | `false` |
| `notes` | string | no | User notes | `"Order early on Mondays"` |
| `aliases` | string[] | no | Alternative names for matching | `["cherry tomato", "tomate"]` |
| `tags` | string[] | no | Custom tags | `["organic", "local"]` |

**Update Behavior:** Core fields are typically NOT overwritten on new invoices (except `updatedAt`).

---

## 2. Vendor & Source Fields

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `vendorId` | number | **YES** | FK to vendors table | `5` |
| `vendorName` | string | no | Denormalized vendor name | `"Courchesne Larose"` |
| `lastInvoiceId` | number | no | FK to last invoice | `123` |
| `lastPurchaseDate` | string | no | ISO date of last purchase | `"2025-12-28"` |

**Update Behavior:**
- `vendorId/vendorName`: Never change (item is per-vendor)
- `lastInvoiceId/lastPurchaseDate`: **OVERWRITTEN** on each invoice

---

## 3. Pricing Fields

| Field | Type | Unit | Description | Example |
|-------|------|------|-------------|---------|
| `currentPrice` | number | $ | Price per package/case | `32.75` |
| `lastPrice` | number | $ | Previous price | `31.50` |
| `minPrice` | number | $ | Lowest price seen | `28.00` |
| `maxPrice` | number | $ | Highest price seen | `35.00` |
| `pricePerUnit` | number | $ | Price per base unit | `2.73` |
| `pricePerG` | number | $/g | Price per gram | `0.009634` |
| `pricePerLb` | number | $/lb | Price per pound | `4.37` |
| `pricePerKg` | number | $/kg | Price per kilogram | `9.63` |
| `pricePerML` | number | $/ml | Price per milliliter | `0.00665` |
| `pricePerL` | number | $/L | Price per liter | `6.65` |
| `currency` | string | - | Currency code | `"CAD"` |
| `taxRate` | number | % | Tax rate | `14.975` |
| `isTaxable` | boolean | - | Taxable flag | `true` |
| `pricingType` | string | - | Pricing model | `"weight"`, `"unit"`, `"volume"` |

**Update Behavior:**
- `currentPrice`: **OVERWRITTEN** with latest invoice price
- `lastPrice`: Set to previous `currentPrice`
- `minPrice/maxPrice`: Updated if new price is outside range
- `pricePerG/pricePerLb/pricePerKg`: **RECALCULATED** on each invoice
- `pricePerML/pricePerL`: **RECALCULATED** for volume items
- `pricingType`: **OVERWRITTEN** (should it persist user choice?)

---

## 4. Stock Quantity Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `stockQuantity` | number | Current stock count (cases/units) | `8` |
| `stockQuantityUnit` | string | Unit for stockQuantity | `"pc"`, `"case"` |
| `parQuantity` | number | Par level (reorder point) | `4` |
| `reorderPoint` | number | Quantity to trigger reorder | `2` |
| `reorderQuantity` | number | Default reorder amount | `6` |
| `lastOrderQty` | number | Last order quantity | `2` |
| `lastOrderDate` | string | Last order date | `"2025-12-28"` |

**Update Behavior:**
- `stockQuantity`: **ACCUMULATES** (existing + new quantity)
- `parQuantity`: User-set, should NOT change
- `lastOrderQty/lastOrderDate`: **OVERWRITTEN**

---

## 5. Weight/Volume Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `stockWeight` | number | Current stock weight | `15.0` |
| `stockWeightUnit` | string | Unit for stockWeight | `"lb"`, `"kg"`, `"ml"` |
| `parWeight` | number | Par weight level | `10.0` |
| `weightPerUnit` | number | Weight per case/pack | `7.5` |
| `weightUnit` | string | Unit for weightPerUnit | `"lb"` |
| `receivedWeight` | number | Last received weight | `15.0` |
| `totalWeight` | number | Calculated total weight | `15.0` |
| `weightInGrams` | number | Total weight in grams | `6803.88` |
| `unitType` | string | Classification | `"weight"`, `"volume"`, `"count"`, `"tool"` |

**Update Behavior:**
- `stockWeight`: **ACCUMULATES** (existing + received)
- `weightPerUnit`: **RECALCULATED** (receivedWeight / quantity)
- `receivedWeight`: **OVERWRITTEN** (last invoice only)

**PROBLEM:** If user manually sets `weightPerUnit = 7.5lb`, next invoice recalculates from parsed format, losing the correction.

---

## 6. Packaging Fields (Food Supply)

For weight-based formats like "2/5LB", "6x500ML"

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `lastBoxingFormat` | string | Raw format from invoice | `"2/5LB"` |
| `unitSize` | number | Size per individual unit | `500` (for 500ml) |
| `unitSizeUnit` | string | Unit for unitSize | `"ml"`, `"g"`, `"lb"` |
| `unitsPerCase` | number | Units per case | `6` (for 6x500ML) |
| `purchaseQty` | number | Purchase quantity | `5` (for 5lb) |
| `purchaseUnit` | string | Purchase unit | `"lb"` |

**Update Behavior:**
- `lastBoxingFormat`: **OVERWRITTEN** (no history)
- `unitSize/unitSizeUnit/unitsPerCase`: **OVERWRITTEN**

---

## 7. Container Fields (Packaging Distributor)

For packaging items like "10/100", "6/RL"

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `packagingFormat` | string | Raw format string | `"10/100"` |
| `packagingType` | string | Format type | `"nested_units"`, `"rolls"`, `"simple"` |
| `packCount` | number | Outer pack count | `10` |
| `unitsPerPack` | number | Units per inner pack | `100` |
| `totalUnitsPerCase` | number | Total units (packCount × unitsPerPack) | `1000` |
| `rollsPerCase` | number | Rolls per case | `6` |
| `lengthPerRoll` | number | Length per roll | `1000` |
| `lengthUnit` | string | Length unit | `"ft"` |
| `pricePerUnit` | number | Price per individual unit | `0.0325` |
| `baseUnit` | string | Base unit type | `"pc"` |
| `totalBaseUnits` | number | Total base units in stock | `2000` |
| `containerCapacity` | number | Container size | `2.25` |
| `containerCapacityUnit` | string | Container unit | `"lb"`, `"oz"` |
| `containerType` | string | Type of container | `"bowl"`, `"lid"`, `"cup"` |
| `productWidth` | number | Width for film products | `18` |
| `productWidthUnit` | string | Width unit | `"in"` |
| `productDimensions` | string | Dimension string | `"35X50"` |
| `productSpecs` | string | Additional specs | `"3COMP"`, `"2PLY"` |

**Update Behavior:**
- All packaging fields: **OVERWRITTEN** on each invoice

---

## 8. Recipe Tools

User-defined measurement tools for this item.

```typescript
interface RecipeTool {
  id: string;           // nanoid
  name: string;         // "cup", "sac", "botte"
  abbrev: string;       // "c", "sac", "bt"
  weightG: number;      // Weight in grams
  volumeML?: number;    // Volume in ml (optional)
  convertType: 'weight' | 'volume' | 'count';
  source: 'invoice' | 'user' | 'ai';
  createdAt: string;    // ISO timestamp
}
```

| Field | Type | Description |
|-------|------|-------------|
| `recipeTools` | RecipeTool[] | Array of custom tools |
| `toolUnit` | string | Default tool name | `"canne"` |
| `toolAbbrev` | string | Tool abbreviation | `"cn"` |

**Update Behavior:**
- `recipeTools`: Should be **PRESERVED** (user-defined)
- But currently no protection against overwrite

---

## 9. Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | string | Creation timestamp |
| `updatedAt` | string | Last update timestamp |
| `createdBy` | string | User who created |
| `storageLocation` | string | Kitchen location |
| `storageTemp` | string | Temperature requirements |
| `shelfLifeDays` | number | Shelf life in days |

---

## 10. MISSING Fields (Proposed)

Fields that SHOULD exist but currently DON'T:

### User Overrides (Persists through updates)
```typescript
interface UserOverrides {
  weightPerUnit?: {
    value: number;      // 7.5
    unit: string;       // "lb"
    editedAt: string;   // ISO timestamp
    editedBy: string;   // User ID
    reason?: string;    // "Corrected from invoice"
  };
  pricePerG?: {
    value: number;
    editedAt: string;
    editedBy: string;
  };
  pricingType?: {
    value: 'weight' | 'unit' | 'volume';
    editedAt: string;
    editedBy: string;
  };
  format?: {
    value: string;      // "2/7.5LB"
    editedAt: string;
    editedBy: string;
  };
}
```

### Learned Formats (From corrections)
```typescript
interface LearnedFormats {
  [sku: string]: {
    weightPerPack: number;
    unit: string;
    source: 'user_edit' | 'confirmed';
    learnedAt: string;
    invoiceId?: number;
  };
}
```

### Edit Tracking
```typescript
interface EditHistory {
  field: string;
  oldValue: any;
  newValue: any;
  editedAt: string;
  editedBy: string;
  source: 'user' | 'invoice' | 'ai';
}
```

---

## 11. Update Behavior Matrix

| Field | CREATE | UPDATE (Invoice) | UPDATE (User Edit) |
|-------|--------|------------------|-------------------|
| **Core** |
| `name` | Set | Never | User can change |
| `sku` | Set | Never | User can change |
| `category` | Set | Never | User can change |
| **Pricing** |
| `currentPrice` | Set | **OVERWRITE** | Should persist? |
| `pricePerG` | Calculate | **RECALCULATE** | Should persist! |
| `pricingType` | Set | **OVERWRITE** | Should persist! |
| **Stock** |
| `stockQuantity` | Set | **ACCUMULATE** | User can adjust |
| `stockWeight` | Set | **ACCUMULATE** | User can adjust |
| **Weight** |
| `weightPerUnit` | Calculate | **RECALCULATE** | Should persist! |
| `lastBoxingFormat` | Set | **OVERWRITE** | Should persist! |
| **Packaging** |
| `packCount` | Set | **OVERWRITE** | Rarely edited |
| `totalUnitsPerCase` | Calculate | **RECALCULATE** | Should persist? |

### Legend:
- **OVERWRITE**: New value replaces old (user edits lost!)
- **RECALCULATE**: Derived from invoice data (user edits lost!)
- **ACCUMULATE**: New value added to existing
- **Should persist!**: User edits should NOT be lost

---

## 12. Type-Specific Field Usage

### Food Supply Items
Primary fields: `weightPerUnit`, `pricePerG`, `stockWeight`, `lastBoxingFormat`

```
Example: "TOMATE CERISE ROUGE" (2 cases of 12/DRY PT)
├── stockQuantity: 2 (cases)
├── stockWeight: 15 (lb)
├── weightPerUnit: 7.5 (lb per case)
├── pricePerG: 0.009634
├── pricePerLb: 4.37
├── lastBoxingFormat: "12/DRY PT"
└── pricingType: "weight"
```

### Packaging Items
Primary fields: `packCount`, `unitsPerPack`, `totalUnitsPerCase`, `pricePerUnit`

```
Example: "NAPKINS 10/100" (2 cases)
├── stockQuantity: 2000 (total napkins)
├── packagingFormat: "10/100"
├── packCount: 10
├── unitsPerPack: 100
├── totalUnitsPerCase: 1000
├── pricePerUnit: 0.0325 (per napkin)
└── pricingType: "unit"
```

### Volume Items
Primary fields: `unitSize`, `unitSizeUnit`, `pricePerML`, `stockWeight` (as ml)

```
Example: "LIMONADE 6x750ML" (2 cases)
├── stockQuantity: 2 (cases)
├── stockWeight: 9000 (ml total)
├── stockWeightUnit: "ml"
├── unitSize: 750
├── unitSizeUnit: "ml"
├── unitsPerCase: 6
├── pricePerML: 0.00665
└── pricingType: "volume"
```

---

## Next Steps

1. **Add `userOverrides` field** to persist user corrections
2. **Add `learnedFormats` field** to remember item-specific formats
3. **Modify update logic** to check for overrides before recalculating
4. **Create Edit Service** to handle corrections with proper persistence
5. **Add edit history** for audit trail

See: `EDIT_SERVICE_DESIGN.md` (to be created)
