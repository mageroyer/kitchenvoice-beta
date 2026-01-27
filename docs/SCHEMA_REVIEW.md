# Database Schema & Architecture Review

**Date:** 2025-12-27
**Status:** DECISIONS MADE - Ready for implementation
**Purpose:** Comprehensive review before refactoring

---

## DECISIONS SUMMARY

| Question | Decision |
|----------|----------|
| minPrice/maxPrice | **KEEP** - compute on-demand from priceHistory |
| Roll products | **KEEP** - used for aluminum, plastic, paper rolls |
| Packaging split | **NO SPLIT** - keep in one table, use category |
| Dual stock (qty + weight) | **KEEP BOTH** - order by piece, price/use by weight |
| inventoryItems + invoiceLineItems | **KEEP BOTH** - different purposes |

---

## FIELDS TO REMOVE (15 fields)

### Confirmed Removals

| Field | Reason | Replacement |
|-------|--------|-------------|
| `currentStock` | Legacy duplicate | Use `stockQuantity` or `stockWeight` |
| `parLevel` | Legacy duplicate | Use `parQuantity` or `parWeight` |
| `linkedIngredientId` | Migration complete | None needed |
| `vendorProductCode` | Duplicate of sku | Use `sku` |
| `totalSpent` | Derived value | Compute from invoiceLineItems |
| `totalQuantityPurchased` | Derived value | Compute from invoiceLineItems |
| `purchaseCount` | Derived value | Compute from invoiceLineItems |
| `avgPrice` | Derived value | Compute from invoiceLineItems |
| `totalUnitsPerCase` | Derived value | Compute: `packCount × unitsPerPack` |
| `containerUnitsStock` | Derived value | Compute: `stockQuantity × totalUnitsPerCase` |
| `unit` | Overloaded/confusing | Use `stockQuantityUnit` / `stockWeightUnit` |
| `packageSize` | Overlaps | Use `unitsPerCase` |
| `packageUnit` | Overlaps | Use `stockQuantityUnit` |
| `unitsPerPackage` | Overlaps | Use `unitsPerCase` |
| `lastTotalUnitsPerCase` | Redundant | Compute when needed |

**Result: 90+ fields → ~75 fields** (15 removed)

---

## FIELDS TO KEEP (Organized by Purpose)

### Identity (6 fields)
```
id, name, nameNormalized, description, sku, upc
```

### Vendor (2 fields)
```
vendorId, vendorName
```

### Classification (2 fields)
```
category, subcategory
```

### Stock Tracking - Quantity (3 fields)
```
stockQuantity      # Current stock in pieces/cases
stockQuantityUnit  # Unit (pc, case, ea)
parQuantity        # Par level for reordering
```

### Stock Tracking - Weight (3 fields)
```
stockWeight        # Current stock weight
stockWeightUnit    # Unit (lb, kg, g)
parWeight          # Par level weight
```

### Stock Management (4 fields)
```
reorderPoint, reorderQuantity, storageLocation, storageTemp, shelfLifeDays
```

### Pricing - Current (7 fields)
```
currentPrice       # Price per package/case
pricePerUnit       # Price per base unit
pricePerG          # Normalized $/gram (for recipe costing)
pricePerML         # Normalized $/ml (for liquids)
pricingType        # 'weight' | 'unit' | 'volume'
lastPrice          # Previous price (for comparison)
currency           # CAD, USD
```

### Pricing - Computed On-Demand (3 fields - from priceHistory)
```
minPrice           # MIN(priceHistory.price)
maxPrice           # MAX(priceHistory.price)
avgPrice           # AVG(priceHistory.price)
```

### Tax (2 fields)
```
taxRate, isTaxable
```

### Purchase History (2 fields)
```
lastPurchaseDate, lastInvoiceId
```

### Unit Classification (4 fields)
```
unitType           # 'tool' | 'weight' | 'volume' | 'count'
toolUnit           # Tool name if applicable
toolAbbrev         # Tool abbreviation
weightPerUnit      # Weight in grams per unit
```

### Unit Size / Boxing Format (4 fields)
```
unitSize           # Size per unit (500 for 500ml)
unitSizeUnit       # Unit (ml, g, L)
unitsPerCase       # Units per case (6 for 6x500ml)
lastBoxingFormat   # Raw format string for display
```

### Container/Packaging (12 fields)
```
packagingFormat    # Raw format string
packagingType      # 'nested_units' | 'rolls' | 'simple'
packCount          # Outer pack count
unitsPerPack       # Units per inner pack
containerCapacity  # Container size value
containerCapacityUnit
containerType      # 'lid' | 'bowl' | 'container'
productWidth, productWidthUnit
productDimensions, productSpecs
```

### Roll Products (3 fields)
```
rollsPerCase       # Rolls per case
lengthPerRoll      # Length per roll
lengthUnit         # ft, m, in
```

### Recipe Tools (1 field)
```
recipeTools[]      # Array of custom measurement tools
```

### Matching & Tags (2 fields)
```
aliases[], tags[]
```

### Metadata (5 fields)
```
isActive, isPreferred, notes, createdAt, updatedAt, createdBy
```

---

## COMPUTED VALUES (Helper Functions)

These fields are REMOVED from storage, computed when needed:

```javascript
// In inventoryItemDB.js or a helper service

function getTotalUnitsPerCase(item) {
  if (item.packCount && item.unitsPerPack) {
    return item.packCount * item.unitsPerPack;
  }
  return item.unitsPerCase || 1;
}

function getContainerUnitsInStock(item) {
  return item.stockQuantity * getTotalUnitsPerCase(item);
}

async function getPurchaseStats(inventoryItemId) {
  const lines = await invoiceLineDB.getByInventoryItem(inventoryItemId);
  return {
    purchaseCount: lines.length,
    totalSpent: lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0),
    totalQuantity: lines.reduce((sum, l) => sum + (l.quantity || 0), 0),
    avgPrice: lines.length > 0
      ? lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) / lines.length
      : 0
  };
}

async function getPriceRange(inventoryItemId) {
  const history = await priceHistoryDB.getByItem(inventoryItemId);
  if (history.length === 0) return { min: null, max: null, avg: null };
  const prices = history.map(h => h.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length
  };
}
```

---

## MIGRATION PLAN

### Phase 1: Add Computed Helpers (No Breaking Changes)
1. Create `inventoryHelpers.js` with computed functions
2. Update UI components to use helpers instead of stored fields
3. Test that everything still works

### Phase 2: Stop Writing Removed Fields
1. Update `inventoryItemDB.create()` - don't write removed fields
2. Update `inventoryItemDB.update()` - don't write removed fields
3. Update invoice handlers - don't populate removed fields

### Phase 3: Clean Up Reads
1. Update any code reading removed fields to use helpers
2. Search codebase for field names and update

### Phase 4: Database Migration (Optional)
1. Create migration to remove fields from existing records
2. Or leave them (they'll just be ignored)

---

## CODEBASE SEARCH NEEDED

Before implementing, search for usage of removed fields:

```bash
# Fields to search for:
grep -r "currentStock" src/
grep -r "parLevel" src/
grep -r "linkedIngredientId" src/
grep -r "vendorProductCode" src/
grep -r "totalSpent" src/
grep -r "totalQuantityPurchased" src/
grep -r "purchaseCount" src/
grep -r "avgPrice" src/
grep -r "totalUnitsPerCase" src/
grep -r "containerUnitsStock" src/
grep -r "\.unit[^a-zA-Z]" src/  # The overloaded 'unit' field
grep -r "packageSize" src/
grep -r "packageUnit" src/
grep -r "unitsPerPackage" src/
```

---

## AFTER SCHEMA CLEANUP: Handler Refactor

Once schema is clean, split `foodSupplyHandler.js` (2700 lines) into:

```
handlers/
  foodSupply/
    index.js              # Public API (~50 lines)
    extraction.js         # Field extraction (~400 lines)
    validation.js         # Validation gates (~300 lines)
    pricing.js            # Pricing calculation (~250 lines)
    processing.js         # processLineV2 (~300 lines)
    inventoryBuilder.js   # createInventoryItem (~300 lines)

  shared/                 # Reusable across handlers
    weightExtractor.js
    mathValidator.js
    pricingCalculator.js
```

---

## SUCCESS CRITERIA

- [ ] inventoryItems reduced from 90+ to ~75 fields
- [ ] No duplicate/overlapping fields
- [ ] No derived fields stored (compute on-demand)
- [ ] Clear field naming (one purpose per field)
- [ ] All tests passing after migration
- [ ] foodSupplyHandler split into focused modules

---

*Last Updated: 2025-12-27 - All decisions finalized*
