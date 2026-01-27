/**
 * Recipe Deduction Service
 *
 * Handles inventory deduction when recipe tasks are completed.
 * Properly converts between recipe units (g, ml) and inventory storage units (lb, L).
 * Supports case-based tracking with automatic case opening.
 *
 * Pricing Types:
 * - pricePerG → weight-based (stockWeight in lb/kg/g)
 * - pricePerML → volume-based (stockWeight in L/ml, reused field)
 * - pricePerUnit → unit-based (stockQuantity in cases/pieces)
 */

import { inventoryItemDB, stockTransactionDB } from '../database/indexedDB.js';
import { getEffectivePar } from '../database/inventoryHelpers.js';

// ============================================
// Unit Conversion Constants
// ============================================

const WEIGHT_TO_GRAMS = {
  g: 1,
  kg: 1000,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
};

const VOLUME_TO_ML = {
  ml: 1,
  l: 1000,
  L: 1000,
  cl: 10,
  dl: 100,
  dL: 100,
};

// ============================================
// Deduction Strategy
// ============================================

/**
 * Determine the deduction strategy for an inventory item
 *
 * Priority order:
 * 1. pricePerML > 0 OR volumePerPc > 0 OR pricingType='volume' → volume-based
 * 2. pricePerG > 0 OR weightPerUnit > 0 OR pricingType='weight' → weight-based
 * 3. pricePerUnit > 0 OR pricingType='unit' → unit-based
 * 4. stockWeightUnit set → detect volume vs weight from unit
 * 5. stockQuantityUnit set → detect from unit
 * 6. Default → unit-based
 *
 * @param {Object} item - Inventory item from database
 * @returns {Object|null} Deduction strategy
 */
export function getDeductionStrategy(item) {
  if (!item) return null;

  // 1. Volume-based (liquids, sauces, in-house production with L/ml)
  if (item.pricePerML > 0 || item.volumePerPc > 0 || item.pricingType === 'volume') {
    return {
      type: 'volume',
      stockField: 'stockWeight', // Reused for volume
      stockUnit: item.stockWeightUnit || 'ml',
      baseUnit: 'ml',
      hasCase: hasValidCaseTracking(item),
      weightPerCase: calculateCaseWeight(item, 'volume'),
    };
  }

  // 2. Weight-based (meat, produce)
  if (item.pricePerG > 0 || item.weightPerUnit > 0 || item.pricingType === 'weight') {
    return {
      type: 'weight',
      stockField: 'stockWeight',
      stockUnit: item.stockWeightUnit || 'lb',
      baseUnit: 'g',
      hasCase: hasValidCaseTracking(item),
      weightPerCase: calculateCaseWeight(item, 'weight'),
    };
  }

  // 3. Unit-based (packaging, containers, portions)
  if (item.pricePerUnit > 0 || item.pricingType === 'unit') {
    return {
      type: 'unit',
      stockField: 'stockQuantity',
      stockUnit: item.stockQuantityUnit || 'ea',
      baseUnit: 'ea',
      hasCase: false,
      weightPerCase: null,
    };
  }

  // 4. Fallback: check stockWeightUnit
  if (item.stockWeightUnit) {
    // Detect if stockWeightUnit is a volume unit
    const volumeUnits = ['l', 'ml', 'cl', 'dl'];
    const isVolume = volumeUnits.includes(item.stockWeightUnit.toLowerCase());

    return {
      type: isVolume ? 'volume' : 'weight',
      stockField: 'stockWeight',
      stockUnit: item.stockWeightUnit,
      baseUnit: isVolume ? 'ml' : 'g',
      hasCase: hasValidCaseTracking(item),
      weightPerCase: calculateCaseWeight(item, isVolume ? 'volume' : 'weight'),
    };
  }

  // 5. Fallback: check stockQuantityUnit for volume/weight (legacy in-house items)
  // This handles items created before the stockWeight/pricePerML fix
  if (item.stockQuantityUnit) {
    const unit = item.stockQuantityUnit.toLowerCase();
    const volumeUnits = ['l', 'ml', 'cl', 'dl', 'liter', 'litre'];
    const weightUnits = ['kg', 'g', 'lb', 'lbs', 'oz'];

    if (volumeUnits.includes(unit)) {
      return {
        type: 'volume',
        stockField: 'stockQuantity', // Use stockQuantity as fallback
        stockUnit: item.stockQuantityUnit,
        baseUnit: 'ml',
        hasCase: false,
        weightPerCase: null,
      };
    }

    if (weightUnits.includes(unit)) {
      return {
        type: 'weight',
        stockField: 'stockQuantity', // Use stockQuantity as fallback
        stockUnit: item.stockQuantityUnit,
        baseUnit: 'g',
        hasCase: false,
        weightPerCase: null,
      };
    }
  }

  // 6. Default to unit-based
  return {
    type: 'unit',
    stockField: 'stockQuantity',
    stockUnit: item.stockQuantityUnit || 'ea',
    baseUnit: 'ea',
    hasCase: false,
    weightPerCase: null,
  };
}

/**
 * Check if item has valid case tracking setup
 *
 * Supports multiple patterns:
 * 1. Direct weightPerUnit (e.g., 5000g per unit)
 * 2. purchaseQty × purchaseUnit (e.g., 25 × lb)
 * 3. unitsPerCase × unitSize × unitSizeUnit (e.g., 6 × 500ml = 3000ml per case)
 * 4. volumePerPc (for volume items like bottles)
 * 5. Derivable from stockWeight/stockQuantity ratio
 */
function hasValidCaseTracking(item) {
  if (!item) return false;

  // Must have cases in stock
  const hasStock = item.stockQuantity >= 0;
  if (!hasStock) return false;

  // Pattern 1: Direct weightPerUnit
  const hasWeightPerUnit = item.weightPerUnit > 0;

  // Pattern 2: purchaseQty with unit (e.g., 25 lb)
  const hasPurchaseInfo = item.purchaseQty > 0 && !!item.purchaseUnit;

  // Pattern 3: unitsPerCase × unitSize (e.g., 6 × 500ml)
  const hasUnitSizeInfo = item.unitsPerCase > 0 && item.unitSize > 0 && !!item.unitSizeUnit;

  // Pattern 4: volumePerPc (for volume items like bottles)
  const hasVolumePerPc = item.volumePerPc > 0;

  // Pattern 5: Derivable from stockWeight/stockQuantity ratio
  const canDeriveThreshold = item.stockWeight > 0 && item.stockQuantity > 0;

  return hasWeightPerUnit || hasPurchaseInfo || hasUnitSizeInfo || hasVolumePerPc || canDeriveThreshold;
}

/**
 * Calculate weight/volume per unit in the item's storage unit
 *
 * This calculates the threshold for one unit (one bottle, one case, one bag).
 * When stockWeight drops by this amount, stockQuantity decreases by 1.
 *
 * @param {Object} item - Inventory item
 * @param {string} type - 'weight' or 'volume'
 * @returns {number|null} Amount per unit in storage unit
 */
function calculateCaseWeight(item, type) {
  if (!item) return null;

  let baseAmount = null;

  // Option 1: Direct volumePerPc (for volume items like bottles, in ml)
  if (type === 'volume' && item.volumePerPc > 0) {
    baseAmount = item.volumePerPc; // Already in ml
  }
  // Option 2: Direct weightPerUnit (in grams)
  else if (item.weightPerUnit > 0) {
    baseAmount = item.weightPerUnit;
  }
  // Option 3: purchaseQty × purchaseUnit (e.g., 25 × lb)
  else if (item.purchaseQty > 0 && item.purchaseUnit) {
    baseAmount = convertToBase(item.purchaseQty, item.purchaseUnit, type);
  }
  // Option 4: unitsPerCase × unitSize (e.g., 6 × 500ml)
  else if (item.unitsPerCase > 0 && item.unitSize > 0 && item.unitSizeUnit) {
    const unitWeight = convertToBase(item.unitSize, item.unitSizeUnit, type);
    baseAmount = item.unitsPerCase * unitWeight;
  }
  // Option 5: Derive from stockWeight / stockQuantity if both exist
  else if (item.stockWeight > 0 && item.stockQuantity > 0) {
    // Assume stockWeight is in the storage unit, not base
    return item.stockWeight / item.stockQuantity;
  }

  if (!baseAmount) return null;

  // Convert from base (g/ml) to storage unit
  const conversionTable = type === 'volume' ? VOLUME_TO_ML : WEIGHT_TO_GRAMS;
  const stockUnit = item.stockWeightUnit || (type === 'volume' ? 'ml' : 'lb');
  const divisor = conversionTable[stockUnit] || conversionTable[stockUnit.toLowerCase()] || 1;

  return baseAmount / divisor;
}

/**
 * Convert a value to base unit (grams or ml)
 */
function convertToBase(value, unit, type) {
  const conversionTable = type === 'volume' ? VOLUME_TO_ML : WEIGHT_TO_GRAMS;
  const multiplier = conversionTable[unit] || conversionTable[unit.toLowerCase()] || 1;
  return value * multiplier;
}

// ============================================
// Metric Parsing
// ============================================

/**
 * Parse recipe metric string to base units
 *
 * Supported units:
 * - Weight: g, kg, gr, gramme(s), lb, lbs, oz
 * - Volume: ml, l, L, cl, dl
 * - Count: ea, pc, unit(s), portion(s), pcs, piece(s)
 *
 * @param {string} metric - Metric string like "300g", "1.5kg", "500ml", "5 portions"
 * @returns {{ value: number, unit: string, original: string }|null}
 */
export function parseRecipeMetric(metric) {
  if (!metric || typeof metric !== 'string') return null;

  // Extended regex to capture more unit variations
  const match = metric.trim().match(/^([\d.,]+)\s*([a-zA-Z]+)?$/i);
  if (!match) return null;

  const rawValue = parseFloat(match[1].replace(',', '.'));
  if (isNaN(rawValue) || rawValue < 0) return null;

  const rawUnit = (match[2] || 'g').toLowerCase();

  // Normalize unit aliases to base units
  let value = rawValue;
  let baseUnit;

  // Weight units → grams
  if (['g', 'gr', 'gramme', 'grammes', 'gram', 'grams'].includes(rawUnit)) {
    baseUnit = 'g';
  } else if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(rawUnit)) {
    value = rawValue * 1000;
    baseUnit = 'g';
  } else if (['lb', 'lbs', 'pound', 'pounds'].includes(rawUnit)) {
    value = rawValue * 453.592; // Convert to grams
    baseUnit = 'g';
  } else if (['oz', 'ounce', 'ounces'].includes(rawUnit)) {
    value = rawValue * 28.3495; // Convert to grams
    baseUnit = 'g';
  }
  // Volume units → ml
  else if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(rawUnit)) {
    baseUnit = 'ml';
  } else if (['l', 'liter', 'liters', 'litre', 'litres'].includes(rawUnit)) {
    value = rawValue * 1000;
    baseUnit = 'ml';
  } else if (['cl', 'centiliter', 'centiliters'].includes(rawUnit)) {
    value = rawValue * 10;
    baseUnit = 'ml';
  } else if (['dl', 'deciliter', 'deciliters'].includes(rawUnit)) {
    value = rawValue * 100;
    baseUnit = 'ml';
  }
  // Count units → ea
  else if (['ea', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'portion', 'portions'].includes(rawUnit)) {
    baseUnit = 'ea';
  }
  // Unknown unit - default to grams (assume weight)
  else {
    console.warn(`[parseRecipeMetric] Unknown unit "${rawUnit}", defaulting to grams`);
    baseUnit = 'g';
  }

  return { value, unit: baseUnit, original: metric };
}

// ============================================
// Unit Conversion
// ============================================

/**
 * Convert recipe amount to inventory's storage unit
 *
 * @param {number} recipeAmount - Amount in base units (g or ml)
 * @param {string} recipeUnit - Base unit ('g', 'ml', or 'ea')
 * @param {Object} inventoryItem - Inventory item
 * @returns {{ amount: number, unit: string }|null}
 */
export function convertToInventoryUnit(recipeAmount, recipeUnit, inventoryItem) {
  const strategy = getDeductionStrategy(inventoryItem);
  if (!strategy) return null;

  // Weight conversion (g → lb, kg, etc.)
  if (strategy.type === 'weight' && recipeUnit === 'g') {
    const targetGrams = WEIGHT_TO_GRAMS[strategy.stockUnit] || WEIGHT_TO_GRAMS[strategy.stockUnit.toLowerCase()] || 1;
    return {
      amount: recipeAmount / targetGrams,
      unit: strategy.stockUnit,
    };
  }

  // Volume conversion (ml → L, etc.)
  if (strategy.type === 'volume' && recipeUnit === 'ml') {
    const targetML = VOLUME_TO_ML[strategy.stockUnit] || VOLUME_TO_ML[strategy.stockUnit.toLowerCase()] || 1;
    return {
      amount: recipeAmount / targetML,
      unit: strategy.stockUnit,
    };
  }

  // Unit-based (no conversion needed)
  if (strategy.type === 'unit' && recipeUnit === 'ea') {
    return {
      amount: recipeAmount,
      unit: strategy.stockUnit,
    };
  }

  // Incompatible units (e.g., g recipe for ml inventory)
  return null;
}

// ============================================
// Case Tracking Deduction
// ============================================

/**
 * Deduct from inventory with threshold-based case management
 *
 * Uses threshold-based tracking:
 * - stockWeight tracks the total weight/volume
 * - stockQuantity tracks how many whole units that total represents
 * - When stockWeight drops enough to cross a unit threshold, stockQuantity decreases
 *
 * Example: 4 bottles × 150ml = 600ml total
 * - Deduct 200ml: stockWeight 600→400, crosses 450ml threshold, so pc goes 4→3
 *
 * @param {Object} item - Current inventory item
 * @param {number} deductAmount - Amount to deduct (in item's stockUnit)
 * @param {Object} options - { taskId, recipeId, recipeName, userId, strategy }
 * @returns {Promise<Object>} Deduction result
 */
export async function deductWithCaseTracking(item, deductAmount, options = {}) {
  const { taskId, recipeId, recipeName, userId, strategy } = options;

  const currentStockWeight = item.stockWeight || 0;
  const currentStockQuantity = item.stockQuantity || 0;
  const unitThreshold = strategy.weightPerCase;

  const warnings = [];

  // Calculate whole units before deduction using FLOOR
  // Floor counts complete units - partial units don't count as a full case
  // Example: 18kg with 10kg/case = 1 complete case (plus 8kg partial)
  const oldWholeUnits = unitThreshold > 0
    ? Math.floor(currentStockWeight / unitThreshold)
    : currentStockQuantity;

  // Deduct from stockWeight
  let newStockWeight = currentStockWeight - deductAmount;

  // Check for insufficient stock
  if (newStockWeight < 0) {
    const shortfall = Math.abs(newStockWeight);
    warnings.push({
      type: 'insufficient_partial',
      itemId: item.id,
      message: `Insufficient stock for ${item.name}: short ${shortfall.toFixed(2)} ${strategy.stockUnit}`,
      data: {
        requested: deductAmount,
        available: currentStockWeight,
        shortfall,
      },
    });
    // Continue with warning - set to 0
    newStockWeight = 0;
  }

  // Calculate whole units after deduction using FLOOR
  // Decreases when weight drops below a threshold boundary
  // Example: 30kg→18kg with 10kg/case: floor(30/10)=3, floor(18/10)=1, consumed=2
  // Example: 25kg→22kg with 10kg/case: floor(25/10)=2, floor(22/10)=2, consumed=0
  const newWholeUnits = unitThreshold > 0
    ? Math.floor(newStockWeight / unitThreshold)
    : (newStockWeight > 0 ? 1 : 0);

  // Determine how many units were consumed (crossed thresholds)
  const unitsConsumed = Math.max(0, oldWholeUnits - newWholeUnits);

  // Update stockQuantity based on threshold crossings
  let newStockQuantity = currentStockQuantity - unitsConsumed;

  // Ensure non-negative
  if (newStockQuantity < 0) {
    newStockQuantity = 0;
  }

  // Generate case consumption warnings
  if (unitsConsumed > 0) {
    warnings.push({
      type: 'case_opened',
      itemId: item.id,
      message: `Consumed ${unitsConsumed} unit(s) of ${item.name} (${newStockQuantity} remaining)`,
      data: {
        unitsConsumed,
        casesRemaining: newStockQuantity,
        unitThreshold,
        stockWeightAfter: newStockWeight,
      },
    });
  }

  // Persist changes (round to 2 decimals to avoid floating-point precision issues)
  const roundedStockWeight = Math.round(Math.max(0, newStockWeight) * 100) / 100;
  const updateData = {
    stockWeight: roundedStockWeight,
    stockQuantity: newStockQuantity,
    lastUsageDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await inventoryItemDB.update(item.id, updateData);

  // Create transaction for audit trail
  try {
    await stockTransactionDB.recordTaskUsage(item.id, deductAmount, {
      taskId,
      recipeId,
      recipeName,
      currentStock: currentStockWeight,
      createdBy: userId,
    });
  } catch (err) {
    console.warn('Failed to record stock transaction:', err);
  }

  // Check thresholds for low stock alerts
  const effectivePar = getEffectivePar(item);
  if (effectivePar.value > 0) {
    const percentage = Math.round((newStockWeight / effectivePar.value) * 100);

    if (percentage <= 10) {
      warnings.push({
        type: 'low_stock',
        itemId: item.id,
        message: `${item.name} is critically low (${percentage}%)`,
        data: { percentage, status: 'critical' },
      });
    } else if (percentage <= 25) {
      warnings.push({
        type: 'low_stock',
        itemId: item.id,
        message: `${item.name} is low on stock (${percentage}%)`,
        data: { percentage, status: 'low' },
      });
    }
  }

  return {
    success: true,
    before: {
      stockWeight: currentStockWeight,
      stockQuantity: currentStockQuantity,
    },
    after: {
      stockWeight: roundedStockWeight,
      stockQuantity: newStockQuantity,
    },
    deducted: deductAmount,
    unit: strategy.stockUnit,
    casesOpened: unitsConsumed, // Keep field name for compatibility
    unitsConsumed,
    warnings,
  };
}

/**
 * Simple deduction without case tracking (for unit-based items)
 */
async function deductSimple(item, deductAmount, options = {}) {
  const { taskId, recipeId, recipeName, userId, strategy } = options;

  const currentStock = strategy.stockField === 'stockWeight'
    ? (item.stockWeight || 0)
    : (item.stockQuantity || 0);

  let newStock = currentStock - deductAmount;
  const warnings = [];

  // Handle insufficient stock
  if (newStock < 0) {
    warnings.push({
      type: 'insufficient_partial',
      itemId: item.id,
      message: `Insufficient stock for ${item.name}: short ${Math.abs(newStock).toFixed(2)} ${strategy.stockUnit}`,
      data: {
        requested: deductAmount,
        available: currentStock,
        shortfall: Math.abs(newStock),
      },
    });
    newStock = 0;
  }

  // Persist changes (round to 2 decimals to avoid floating-point precision issues)
  const roundedStock = Math.round(Math.max(0, newStock) * 100) / 100;
  const updateData = {
    [strategy.stockField]: roundedStock,
    lastUsageDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await inventoryItemDB.update(item.id, updateData);

  // Create transaction
  try {
    await stockTransactionDB.recordTaskUsage(item.id, deductAmount, {
      taskId,
      recipeId,
      recipeName,
      currentStock,
      createdBy: userId,
    });
  } catch (err) {
    console.warn('Failed to record stock transaction:', err);
  }

  // Check thresholds
  const effectivePar = getEffectivePar(item);
  if (effectivePar.value > 0) {
    const percentage = Math.round((newStock / effectivePar.value) * 100);

    if (percentage <= 10) {
      warnings.push({
        type: 'low_stock',
        itemId: item.id,
        message: `${item.name} is critically low (${percentage}%)`,
        data: { percentage, status: 'critical' },
      });
    } else if (percentage <= 25) {
      warnings.push({
        type: 'low_stock',
        itemId: item.id,
        message: `${item.name} is low on stock (${percentage}%)`,
        data: { percentage, status: 'low' },
      });
    }
  }

  return {
    success: true,
    before: { [strategy.stockField]: currentStock },
    after: { [strategy.stockField]: roundedStock },
    deducted: deductAmount,
    unit: strategy.stockUnit,
    casesOpened: 0,
    warnings,
  };
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Deduct recipe ingredients from inventory
 *
 * Main entry point for task completion inventory deduction.
 * Handles all ingredient types (weight, volume, unit) with proper unit conversion.
 *
 * @param {Object} recipe - Recipe object with ingredients array
 * @param {Object} task - Task object with scaleFactor
 * @param {string} userId - User ID for audit trail
 * @returns {Promise<DeductionResult>}
 */
export async function deductRecipeIngredients(recipe, task, userId) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
    warnings: [],
    summary: {
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    },
  };

  if (!recipe?.ingredients || !Array.isArray(recipe.ingredients)) {
    return results;
  }

  // Scale factor must account for BOTH portions and any additional scaling
  // - task.portions: number of portions being made (e.g., 20 portions)
  // - task.scaleFactor: additional multiplier (e.g., 2 for double batch)
  // - recipe.portions: base recipe portions (for reference)
  // Total scale = (task.portions / recipe.portions) × task.scaleFactor
  // Or simplified: if recipe is 1 portion, making 20 portions = scale 20
  const basePortions = recipe?.portions || 1;
  const taskPortions = task?.portions || basePortions;
  const additionalScale = task?.scaleFactor || 1;
  const scaleFactor = (taskPortions / basePortions) * additionalScale;

  for (const ingredient of recipe.ingredients) {
    results.summary.total++;

    // Skip section headers
    if (ingredient.isSection) {
      results.skipped.push({
        name: ingredient.name || ingredient.sectionName,
        reason: 'Section header',
        code: 'SECTION',
      });
      results.summary.skipped++;
      continue;
    }

    // Skip unlinked ingredients
    if (!ingredient.linkedIngredientId) {
      results.skipped.push({
        name: ingredient.name,
        reason: 'Not linked to inventory',
        code: 'NOT_LINKED',
      });
      results.summary.skipped++;
      continue;
    }

    // Parse metric - combine metric + metricUnit if unit is stored separately
    // Some ingredients store "20L" in metric, others store "20" in metric and "L" in metricUnit
    let metricString = ingredient.metric || '';
    if (ingredient.metricUnit && !metricString.match(/[a-zA-Z]/)) {
      // metric has no unit letters, append metricUnit
      metricString = `${metricString}${ingredient.metricUnit}`;
    }
    const parsed = parseRecipeMetric(metricString);
    if (!parsed || parsed.value <= 0) {
      results.failed.push({
        itemId: ingredient.linkedIngredientId,
        itemName: ingredient.linkedName || ingredient.name,
        reason: `Invalid metric: "${metricString || 'empty'}"`,
        code: 'NO_METRIC',
        recipeAmount: 0,
        recipeUnit: '',
      });
      results.summary.failed++;
      continue;
    }

    // Apply scale factor
    const scaledValue = parsed.value * scaleFactor;

    // Fetch inventory item
    let inventoryItem;
    try {
      inventoryItem = await inventoryItemDB.getById(ingredient.linkedIngredientId);
    } catch (err) {
      results.failed.push({
        itemId: ingredient.linkedIngredientId,
        itemName: ingredient.linkedName || ingredient.name,
        reason: `Database error: ${err.message}`,
        code: 'DB_ERROR',
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
      });
      results.summary.failed++;
      continue;
    }

    if (!inventoryItem) {
      results.failed.push({
        itemId: ingredient.linkedIngredientId,
        itemName: ingredient.linkedName || ingredient.name,
        reason: 'Inventory item not found (may have been deleted)',
        code: 'ITEM_NOT_FOUND',
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
      });
      results.summary.failed++;
      continue;
    }

    // Get deduction strategy
    const strategy = getDeductionStrategy(inventoryItem);
    if (!strategy) {
      results.failed.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        reason: 'Could not determine deduction strategy',
        code: 'NO_STRATEGY',
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
      });
      results.summary.failed++;
      continue;
    }

    // Convert to inventory unit
    const converted = convertToInventoryUnit(scaledValue, parsed.unit, inventoryItem);
    if (!converted) {
      results.failed.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        reason: `Cannot convert ${parsed.unit} to ${strategy.stockUnit} (${strategy.type}-based item)`,
        code: 'UNIT_MISMATCH',
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
      });
      results.summary.failed++;
      continue;
    }

    // Perform deduction
    try {
      const deductOptions = {
        taskId: task?.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
        userId,
        strategy,
      };

      let deductResult;
      if (strategy.hasCase && strategy.weightPerCase > 0) {
        deductResult = await deductWithCaseTracking(inventoryItem, converted.amount, deductOptions);
      } else {
        deductResult = await deductSimple(inventoryItem, converted.amount, deductOptions);
      }

      // Collect warnings
      if (deductResult.warnings?.length > 0) {
        results.warnings.push(...deductResult.warnings);
      }

      // Record success
      results.success.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        before: deductResult.before[strategy.stockField] ?? deductResult.before.stockWeight ?? deductResult.before.stockQuantity,
        after: deductResult.after[strategy.stockField] ?? deductResult.after.stockWeight ?? deductResult.after.stockQuantity,
        deducted: converted.amount,
        unit: converted.unit,
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
        caseOpened: deductResult.casesOpened > 0,
        casesRemaining: deductResult.after.stockQuantity ?? null,
      });
      results.summary.succeeded++;

    } catch (err) {
      console.error(`[RecipeDeduction] Error deducting ${inventoryItem.name}:`, err);
      results.failed.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        reason: err.message,
        code: 'DEDUCTION_ERROR',
        recipeAmount: scaledValue,
        recipeUnit: parsed.unit,
      });
      results.summary.failed++;
    }
  }

  return results;
}

// ============================================
// Packaging Deduction
// ============================================

/**
 * Deduct packaging items from inventory
 *
 * Processes the platingInstructions array for package objects and deducts
 * their quantities from inventory. Packaging items are always unit-based.
 *
 * Package qty represents "per portion", so total deduction is:
 * qty × basePortion × scaleFactor
 *
 * @param {Object} recipe - Recipe object with platingInstructions array
 * @param {Object} task - Task object with scaleFactor
 * @param {string} userId - User ID for audit trail
 * @returns {Promise<DeductionResult>}
 */
export async function deductRecipePackaging(recipe, task, userId) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
    warnings: [],
    summary: {
      total: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    },
  };

  // Extract packages from platingInstructions
  const platingInstructions = recipe?.platingInstructions;
  if (!Array.isArray(platingInstructions)) {
    return results;
  }

  const packages = platingInstructions.filter(item => item?.isPackage);
  if (packages.length === 0) {
    return results;
  }

  // Calculate total portions being made
  // - task.portions: number of portions being made (e.g., 20)
  // - task.scaleFactor: additional multiplier (e.g., 2 for double batch)
  const taskPortions = task?.portions || recipe?.portions || 1;
  const additionalScale = task?.scaleFactor || 1;
  const totalPortions = taskPortions * additionalScale;

  for (const pkg of packages) {
    results.summary.total++;

    // Skip unlinked packages
    if (!pkg.linkedPackageId) {
      results.skipped.push({
        name: pkg.name || pkg.linkedName || 'Unknown package',
        reason: 'Not linked to inventory',
        code: 'NOT_LINKED',
      });
      results.summary.skipped++;
      continue;
    }

    // Qty = 1 package per portion × total portions
    const scaledQty = totalPortions;

    // Fetch inventory item
    let inventoryItem;
    try {
      inventoryItem = await inventoryItemDB.getById(pkg.linkedPackageId);
    } catch (err) {
      results.failed.push({
        itemId: pkg.linkedPackageId,
        itemName: pkg.linkedName || pkg.name,
        reason: `Database error: ${err.message}`,
        code: 'DB_ERROR',
        recipeAmount: scaledQty,
        recipeUnit: pkg.unit || 'pc',
      });
      results.summary.failed++;
      continue;
    }

    if (!inventoryItem) {
      results.failed.push({
        itemId: pkg.linkedPackageId,
        itemName: pkg.linkedName || pkg.name,
        reason: 'Inventory item not found (may have been deleted)',
        code: 'ITEM_NOT_FOUND',
        recipeAmount: scaledQty,
        recipeUnit: pkg.unit || 'pc',
      });
      results.summary.failed++;
      continue;
    }

    // Packaging is always unit-based - deduct from stockQuantity
    const currentStock = inventoryItem.stockQuantity || 0;
    let newStock = currentStock - scaledQty;
    const warnings = [];

    // Handle insufficient stock
    if (newStock < 0) {
      warnings.push({
        type: 'insufficient_partial',
        itemId: inventoryItem.id,
        message: `Insufficient packaging stock for ${inventoryItem.name}: short ${Math.abs(newStock).toFixed(2)} ${pkg.unit || 'pc'}`,
        data: {
          requested: scaledQty,
          available: currentStock,
          shortfall: Math.abs(newStock),
        },
      });
      newStock = 0;
    }

    // Persist changes
    const roundedStock = Math.round(Math.max(0, newStock) * 100) / 100;

    try {
      await inventoryItemDB.update(inventoryItem.id, {
        stockQuantity: roundedStock,
        lastUsageDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create transaction for audit trail
      try {
        await stockTransactionDB.recordTaskUsage(inventoryItem.id, scaledQty, {
          taskId: task?.id,
          recipeId: recipe.id,
          recipeName: recipe.name,
          currentStock,
          createdBy: userId,
          transactionType: 'packaging_usage',
        });
      } catch (err) {
        console.warn('Failed to record packaging stock transaction:', err);
      }

      // Check low stock threshold
      const effectivePar = getEffectivePar(inventoryItem);
      if (effectivePar.value > 0) {
        const percentage = Math.round((roundedStock / effectivePar.value) * 100);

        if (percentage <= 10) {
          warnings.push({
            type: 'low_stock',
            itemId: inventoryItem.id,
            message: `${inventoryItem.name} packaging is critically low (${percentage}%)`,
            data: { percentage, status: 'critical' },
          });
        } else if (percentage <= 25) {
          warnings.push({
            type: 'low_stock',
            itemId: inventoryItem.id,
            message: `${inventoryItem.name} packaging is low (${percentage}%)`,
            data: { percentage, status: 'low' },
          });
        }
      }

      // Collect warnings
      if (warnings.length > 0) {
        results.warnings.push(...warnings);
      }

      // Record success
      results.success.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        before: currentStock,
        after: roundedStock,
        deducted: scaledQty,
        unit: pkg.unit || 'pc',
        recipeAmount: scaledQty,
        recipeUnit: pkg.unit || 'pc',
        isPackaging: true,
      });
      results.summary.succeeded++;

    } catch (err) {
      console.error(`[RecipeDeduction] Error deducting packaging ${inventoryItem.name}:`, err);
      results.failed.push({
        itemId: inventoryItem.id,
        itemName: inventoryItem.name,
        reason: err.message,
        code: 'DEDUCTION_ERROR',
        recipeAmount: scaledQty,
        recipeUnit: pkg.unit || 'pc',
      });
      results.summary.failed++;
    }
  }

  return results;
}

// ============================================
// Exports
// ============================================

export default {
  deductRecipeIngredients,
  deductRecipePackaging,
  getDeductionStrategy,
  parseRecipeMetric,
  convertToInventoryUnit,
  deductWithCaseTracking,
};
