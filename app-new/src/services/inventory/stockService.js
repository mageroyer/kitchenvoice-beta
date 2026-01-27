/**
 * Stock Management Service
 *
 * Business logic layer for stock level operations.
 * Handles stock adjustments, threshold monitoring, and audit trail.
 *
 * @module services/inventory/stockService
 */

import {
  inventoryItemDB,
  stockTransactionDB,
  TRANSACTION_TYPE,
  REFERENCE_TYPE
} from '../database/indexedDB';
import db from '../database/indexedDB';

// ============================================
// Constants
// ============================================

import { getEffectiveStock, getEffectivePar } from '../database/inventoryHelpers.js';

/**
 * Default stock thresholds (percentage of par level)
 */
export const DEFAULT_THRESHOLDS = {
  CRITICAL: 10,   // Below 10% triggers critical alert
  LOW: 25,        // Below 25% triggers low stock alert
  WARNING: 50     // Below 50% triggers warning
};

/**
 * Stock status values
 */
export const STOCK_STATUS = {
  CRITICAL: 'critical',
  LOW: 'low',
  WARNING: 'warning',
  OK: 'ok'
};

// ============================================
// Core Stock Operations
// ============================================

/**
 * Adjust stock level by a delta amount
 *
 * Creates a stock transaction for audit trail and checks thresholds.
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} delta - Change amount (positive to add, negative to subtract)
 * @param {string} reason - Reason for adjustment (required)
 * @param {string} [referenceType] - Type of reference (invoice, task, manual, etc.)
 * @param {number|string} [referenceId] - ID of related entity
 * @param {Object} [options] - Additional options
 * @param {string} [options.notes] - Additional notes
 * @param {string} [options.createdBy] - User ID making the change
 * @param {number} [options.unitCost] - Cost per unit (for value calculations)
 * @returns {Promise<Object>} Result with newStock, alert status, and stock status
 * @throws {Error} If item not found, insufficient stock, or reason missing
 */
export async function adjustStock(itemId, delta, reason, referenceType = REFERENCE_TYPE.MANUAL, referenceId = null, options = {}) {
  // Validate inputs
  if (typeof delta !== 'number' || isNaN(delta)) {
    throw new Error('Delta must be a valid number');
  }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new Error('Reason is required for stock adjustments');
  }

  // Fetch item
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Get effective stock using dual tracking system
  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const currentStock = effectiveStock.value;
  const newStock = currentStock + delta;

  // Validate non-negative result
  if (newStock < 0) {
    throw new Error(
      `Insufficient stock. Current: ${currentStock}, Requested change: ${delta}. ` +
      `Cannot reduce below zero.`
    );
  }

  // Update appropriate stock field based on item type
  const updateData = { updatedAt: new Date().toISOString() };
  if (effectiveStock.type === 'weight') {
    updateData.stockWeight = newStock;
  } else {
    updateData.stockQuantity = newStock;
  }
  await inventoryItemDB.update(itemId, updateData);

  // Create stock transaction
  const transactionType = delta >= 0 ? TRANSACTION_TYPE.ADJUSTMENT : TRANSACTION_TYPE.ADJUSTMENT;
  await stockTransactionDB.create({
    inventoryItemId: itemId,
    transactionType,
    quantityChange: delta,
    stockBefore: currentStock,
    stockAfter: newStock,
    unit: effectiveStock.unit,
    referenceType,
    referenceId,
    reason: reason.trim(),
    notes: options.notes?.trim() || '',
    unitCost: options.unitCost || item.currentPrice || 0,
    createdBy: options.createdBy
  });

  // Check thresholds and determine alert status
  const percentage = getStockPercentageSync(newStock, effectivePar.value);
  const status = getStockStatusSync(percentage, item);
  const alert = status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW;

  return {
    itemId,
    previousStock: currentStock,
    newStock,
    delta,
    percentage,
    status,
    alert,
    alertMessage: alert ? `${item.name} is ${status} on stock (${percentage}%)` : null
  };
}

/**
 * Set stock to an absolute value
 *
 * Used for physical counts and corrections. Creates a count_correction transaction.
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} newValue - New stock value
 * @param {string} reason - Reason for the correction
 * @param {Object} [options] - Additional options
 * @param {string} [options.countSessionId] - Physical count session ID
 * @param {string} [options.notes] - Additional notes
 * @param {string} [options.createdBy] - User ID
 * @returns {Promise<Object>} Result with newStock, delta, alert status
 * @throws {Error} If item not found or newValue invalid
 */
export async function setStock(itemId, newValue, reason, options = {}) {
  // Validate inputs
  if (typeof newValue !== 'number' || isNaN(newValue)) {
    throw new Error('New stock value must be a valid number');
  }

  if (newValue < 0) {
    throw new Error('Stock value cannot be negative');
  }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new Error('Reason is required for stock corrections');
  }

  // Fetch item
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Get effective stock using dual tracking system
  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const currentStock = effectiveStock.value;
  const delta = newValue - currentStock;

  // Skip if no change
  if (delta === 0) {
    const percentage = getStockPercentageSync(newValue, effectivePar.value);
    return {
      itemId,
      previousStock: currentStock,
      newStock: newValue,
      delta: 0,
      percentage,
      status: getStockStatusSync(percentage, item),
      alert: false,
      noChange: true
    };
  }

  // Update appropriate stock field based on item type
  const updateData = { updatedAt: new Date().toISOString() };
  if (effectiveStock.type === 'weight') {
    updateData.stockWeight = newValue;
  } else {
    updateData.stockQuantity = newValue;
  }
  await inventoryItemDB.update(itemId, updateData);

  // Create count correction transaction
  await stockTransactionDB.recordCountCorrection(itemId, newValue, currentStock, {
    countSessionId: options.countSessionId,
    notes: options.notes || reason,
    createdBy: options.createdBy
  });

  // Check thresholds
  const percentage = getStockPercentageSync(newValue, effectivePar.value);
  const status = getStockStatusSync(percentage, item);
  const alert = status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW;

  return {
    itemId,
    previousStock: currentStock,
    newStock: newValue,
    delta,
    percentage,
    status,
    alert,
    alertMessage: alert ? `${item.name} is ${status} on stock (${percentage}%)` : null
  };
}

/**
 * Add stock from an invoice purchase
 *
 * Updates dual stock tracking (stockQuantity + stockWeight), purchase history, and creates transaction.
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} quantity - Quantity to add (could be weight or count depending on item type)
 * @param {number} invoiceId - Invoice ID
 * @param {Object} [options] - Additional options
 * @param {number} [options.invoiceLineId] - Invoice line item ID
 * @param {number} [options.unitCost] - Cost per unit
 * @param {string} [options.purchaseDate] - Purchase date (ISO string)
 * @param {string} [options.createdBy] - User ID
 * @param {number} [options.unitQuantity] - Unit count (e.g., 2 sacs) - separate from weight
 * @param {number} [options.totalWeight] - Total weight (e.g., 100lb for 2×50lb sacs)
 * @returns {Promise<Object>} Result with newStock, newFullStock
 * @throws {Error} If item not found or quantity invalid
 */
export async function addStockFromInvoice(itemId, quantity, invoiceId, options = {}) {
  // Validate inputs
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  if (!invoiceId) {
    throw new Error('Invoice ID is required');
  }

  // Fetch item
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Determine if item is weight-based or count-based
  const isWeightBased = item.stockWeightUnit && /^(lb|lbs|kg|g|oz)$/i.test(item.stockWeightUnit);

  const now = options.purchaseDate || new Date().toISOString();
  const unitCost = options.unitCost || item.currentPrice || 0;
  const totalCost = quantity * unitCost;

  // For new items, handler already set stock - just record transaction
  // skipStockUpdate=true means only record the transaction, don't add to stock
  if (options.skipStockUpdate) {

    // Build update object - purchase history only (stats computed from invoiceLineItems)
    const updateData = {
      lastPurchaseDate: now,
      lastInvoiceId: invoiceId,
      currentPrice: unitCost,
      updatedAt: now
    };

    // Store pricingType if provided (first time sets it, subsequent updates preserve it)
    if (options.pricingType && !item.pricingType) {
      updateData.pricingType = options.pricingType;
    }

    await inventoryItemDB.update(itemId, updateData);

    // Create purchase transaction for audit trail
    const effectiveStock = getEffectiveStock(item);
    await stockTransactionDB.recordPurchase(itemId, quantity, {
      invoiceId,
      invoiceLineId: options.invoiceLineId,
      unitCost,
      currentStock: effectiveStock.value,
      createdBy: options.createdBy
    });

    return {
      itemId,
      quantity,
      invoiceId,
      newStock: effectiveStock.value,
      newStockQuantity: item.stockQuantity || 0,
      newStockWeight: item.stockWeight || 0,
      isWeightBased,
      skippedStockUpdate: true
    };
  }

  // Calculate new stock values (for existing items being restocked)
  const currentStockQuantity = item.stockQuantity || 0;
  const currentStockWeight = item.stockWeight || 0;

  // For dual tracking:
  // - stockQuantity: unit count (e.g., 2 sacs)
  // - stockWeight: total weight (e.g., 100lb)
  const unitQuantity = options.unitQuantity || (isWeightBased ? 0 : quantity);
  const totalWeight = options.totalWeight || (isWeightBased ? quantity : 0);

  const newStockQuantity = currentStockQuantity + unitQuantity;
  const newStockWeight = currentStockWeight + totalWeight;

  // Update item with dual stock tracking
  await inventoryItemDB.update(itemId, {
    // Dual stock tracking
    stockQuantity: newStockQuantity,
    stockWeight: newStockWeight,
    // Purchase info
    lastPurchaseDate: now,
    lastInvoiceId: invoiceId,
    currentPrice: unitCost,
    updatedAt: now
  });

  // Create purchase transaction
  const previousStock = isWeightBased ? currentStockWeight : currentStockQuantity;
  await stockTransactionDB.recordPurchase(itemId, quantity, {
    invoiceId,
    invoiceLineId: options.invoiceLineId,
    unitCost,
    currentStock: previousStock,
    createdBy: options.createdBy
  });

  return {
    itemId,
    previousStock,
    newStock: isWeightBased ? newStockWeight : newStockQuantity,
    newStockQuantity,
    newStockWeight,
    quantity,
    unitCost,
    totalCost: Math.round(totalCost * 100) / 100,
    invoiceId
  };
}

/**
 * Deduct stock for task/recipe usage
 *
 * Validates sufficient stock, creates usage transaction, checks thresholds.
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} quantity - Quantity used
 * @param {number|string} taskId - Task/production log ID
 * @param {Object} [options] - Additional options
 * @param {number} [options.recipeId] - Recipe ID
 * @param {string} [options.recipeName] - Recipe name
 * @param {string} [options.createdBy] - User ID
 * @param {boolean} [options.allowNegative=false] - Allow stock to go negative
 * @returns {Promise<Object>} Result with newStock, alert status
 * @throws {Error} If item not found or insufficient stock
 */
export async function deductStockFromTask(itemId, quantity, taskId, options = {}) {
  // Validate inputs
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  // Fetch item
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Get effective stock using dual tracking system
  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const currentStock = effectiveStock.value;
  const newStock = currentStock - quantity;

  // Validate sufficient stock (unless allowNegative)
  if (newStock < 0 && !options.allowNegative) {
    throw new Error(
      `Insufficient stock for ${item.name}. ` +
      `Available: ${currentStock} ${effectiveStock.unit}, ` +
      `Requested: ${quantity} ${effectiveStock.unit}.`
    );
  }

  // Build update object based on stock type
  const updateData = {
    lastUsageDate: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Update appropriate stock field
  if (effectiveStock.type === 'weight') {
    updateData.stockWeight = Math.max(0, newStock);
  } else {
    updateData.stockQuantity = Math.max(0, newStock);
  }

  // Update item
  await inventoryItemDB.update(itemId, updateData);

  // Create task usage transaction
  await stockTransactionDB.recordTaskUsage(itemId, quantity, {
    taskId,
    recipeId: options.recipeId,
    recipeName: options.recipeName,
    currentStock,
    createdBy: options.createdBy
  });

  // Check thresholds
  const actualNewStock = Math.max(0, newStock);
  const percentage = getStockPercentageSync(actualNewStock, effectivePar.value);
  const status = getStockStatusSync(percentage, item);
  const alert = status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW;

  return {
    itemId,
    itemName: item.name,
    previousStock: currentStock,
    newStock: actualNewStock,
    quantityUsed: quantity,
    percentage,
    status,
    alert,
    alertMessage: alert ? `${item.name} is ${status} on stock (${percentage}%)` : null,
    taskId,
    insufficientStock: newStock < 0
  };
}

// ============================================
// Stock Calculation Functions
// ============================================

/**
 * Get stock percentage for an item
 *
 * @param {number} itemId - Inventory item ID
 * @returns {Promise<number>} Percentage (0-100+)
 * @throws {Error} If item not found
 */
export async function getStockPercentage(itemId) {
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);

  return getStockPercentageSync(effectiveStock.value, effectivePar.value);
}

/**
 * Synchronous stock percentage calculation
 * @param {number} currentStock - Current stock level
 * @param {number} baseStock - Base stock level (parLevel or fullStock)
 * @returns {number} Percentage (0-100+)
 */
function getStockPercentageSync(currentStock, baseStock) {
  if (!baseStock || baseStock <= 0) {
    // No base stock defined - return 100 if we have any stock, 0 otherwise
    return currentStock > 0 ? 100 : 0;
  }

  const percentage = (currentStock / baseStock) * 100;
  return Math.round(percentage);
}

/**
 * Get stock status for an item
 *
 * @param {number} itemId - Inventory item ID
 * @returns {Promise<string>} Status: 'critical', 'low', 'warning', or 'ok'
 * @throws {Error} If item not found
 */
export async function getStockStatus(itemId) {
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const percentage = getStockPercentageSync(effectiveStock.value, effectivePar.value);

  return getStockStatusSync(percentage, item);
}

/**
 * Synchronous stock status determination
 * @param {number} percentage - Stock percentage
 * @param {Object} item - Item with threshold settings
 * @returns {string} Status
 */
function getStockStatusSync(percentage, item = {}) {
  const criticalThreshold = item.criticalThreshold || DEFAULT_THRESHOLDS.CRITICAL;
  const lowThreshold = item.lowStockThreshold || DEFAULT_THRESHOLDS.LOW;
  const warningThreshold = item.warningThreshold || DEFAULT_THRESHOLDS.WARNING;

  if (percentage <= criticalThreshold) {
    return STOCK_STATUS.CRITICAL;
  }
  if (percentage <= lowThreshold) {
    return STOCK_STATUS.LOW;
  }
  if (percentage <= warningThreshold) {
    return STOCK_STATUS.WARNING;
  }
  return STOCK_STATUS.OK;
}

/**
 * Get detailed stock info for an item
 *
 * @param {number} itemId - Inventory item ID
 * @returns {Promise<Object>} Detailed stock information
 */
export async function getStockInfo(itemId) {
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const currentStock = effectiveStock.value;
  const parLevel = effectivePar.value;
  const percentage = getStockPercentageSync(currentStock, parLevel);
  const status = getStockStatusSync(percentage, item);

  const needsReorder = parLevel > 0 &&
    currentStock <= (item.reorderPoint || parLevel * 0.25);

  const suggestedReorderQty = needsReorder
    ? (item.reorderQuantity || Math.max(0, parLevel - currentStock))
    : 0;

  return {
    itemId,
    itemName: item.name,
    currentStock,
    stockQuantity: item.stockQuantity || 0,
    stockWeight: item.stockWeight || 0,
    parLevel,
    parQuantity: item.parQuantity || 0,
    parWeight: item.parWeight || 0,
    reorderPoint: item.reorderPoint || 0,
    percentage,
    status,
    unit: effectiveStock.unit,
    stockType: effectiveStock.type,
    needsReorder,
    suggestedReorderQty,
    inventoryValue: Math.round(currentStock * (item.currentPrice || 0) * 100) / 100,
    thresholds: {
      critical: item.criticalThreshold || DEFAULT_THRESHOLDS.CRITICAL,
      low: item.lowStockThreshold || DEFAULT_THRESHOLDS.LOW,
      warning: item.warningThreshold || DEFAULT_THRESHOLDS.WARNING
    }
  };
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Bulk adjust stock for multiple items
 *
 * Processes adjustments atomically - if any fails, all are rolled back.
 *
 * @param {Array<Object>} adjustments - Array of adjustment objects
 * @param {number} adjustments[].itemId - Item ID
 * @param {number} adjustments[].delta - Change amount
 * @param {string} adjustments[].reason - Reason
 * @param {string} [adjustments[].referenceType] - Reference type
 * @param {number|string} [adjustments[].referenceId] - Reference ID
 * @param {Object} [options] - Bulk options
 * @param {string} [options.createdBy] - User ID
 * @param {boolean} [options.continueOnError=false] - Continue even if some fail
 * @returns {Promise<Object>} Results with successful and failed adjustments
 */
export async function bulkAdjustStock(adjustments, options = {}) {
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    throw new Error('Adjustments array is required');
  }

  const results = {
    success: [],
    failed: [],
    totalProcessed: 0,
    alerts: []
  };

  // Pre-validate all adjustments
  const validatedAdjustments = [];
  for (const adj of adjustments) {
    if (!adj.itemId) {
      results.failed.push({ adjustment: adj, error: 'Item ID is required' });
      continue;
    }
    if (typeof adj.delta !== 'number') {
      results.failed.push({ adjustment: adj, error: 'Delta must be a number' });
      continue;
    }
    if (!adj.reason) {
      results.failed.push({ adjustment: adj, error: 'Reason is required' });
      continue;
    }

    // Check item exists and calculate result
    const item = await inventoryItemDB.getById(adj.itemId);
    if (!item) {
      results.failed.push({ adjustment: adj, error: 'Item not found' });
      continue;
    }

    const effectiveStock = getEffectiveStock(item);
    const newStock = effectiveStock.value + adj.delta;
    if (newStock < 0) {
      results.failed.push({
        adjustment: adj,
        error: `Insufficient stock. Current: ${effectiveStock.value}, Delta: ${adj.delta}`
      });
      continue;
    }

    validatedAdjustments.push({ ...adj, item, newStock });
  }

  // If not continuing on error and we have failures, abort
  if (!options.continueOnError && results.failed.length > 0) {
    return {
      ...results,
      aborted: true,
      message: 'Validation failed for some adjustments. No changes made.'
    };
  }

  // Process validated adjustments within a transaction
  try {
    await db.transaction('rw', [db.inventoryItems, db.stockTransactions], async () => {
      for (const adj of validatedAdjustments) {
        try {
          const result = await adjustStock(
            adj.itemId,
            adj.delta,
            adj.reason,
            adj.referenceType || REFERENCE_TYPE.MANUAL,
            adj.referenceId,
            { createdBy: options.createdBy, notes: adj.notes }
          );

          results.success.push({
            itemId: adj.itemId,
            itemName: adj.item.name,
            ...result
          });

          if (result.alert) {
            results.alerts.push(result.alertMessage);
          }

          results.totalProcessed++;
        } catch (error) {
          if (!options.continueOnError) {
            throw error; // Will rollback transaction
          }
          results.failed.push({ adjustment: adj, error: error.message });
        }
      }
    });
  } catch (error) {
    return {
      ...results,
      aborted: true,
      rollback: true,
      message: `Transaction failed: ${error.message}. All changes rolled back.`
    };
  }

  return results;
}

/**
 * Bulk set stock from physical count
 *
 * @param {Array<Object>} counts - Array of count objects
 * @param {number} counts[].itemId - Item ID
 * @param {number} counts[].count - Physical count
 * @param {Object} [options] - Options
 * @param {string} [options.countSessionId] - Count session ID
 * @param {string} [options.createdBy] - User ID
 * @returns {Promise<Object>} Results
 */
export async function bulkSetStock(counts, options = {}) {
  if (!Array.isArray(counts) || counts.length === 0) {
    throw new Error('Counts array is required');
  }

  const results = {
    success: [],
    failed: [],
    totalProcessed: 0,
    totalVariance: 0,
    alerts: []
  };

  try {
    await db.transaction('rw', [db.inventoryItems, db.stockTransactions], async () => {
      for (const count of counts) {
        try {
          if (!count.itemId || count.count === undefined) {
            throw new Error('Item ID and count are required');
          }

          const result = await setStock(
            count.itemId,
            count.count,
            count.reason || 'Physical count',
            {
              countSessionId: options.countSessionId,
              createdBy: options.createdBy,
              notes: count.notes
            }
          );

          results.success.push(result);
          results.totalVariance += Math.abs(result.delta);

          if (result.alert) {
            results.alerts.push(result.alertMessage);
          }

          results.totalProcessed++;
        } catch (error) {
          results.failed.push({ count, error: error.message });
        }
      }
    });
  } catch (error) {
    return {
      ...results,
      aborted: true,
      message: `Transaction failed: ${error.message}`
    };
  }

  return results;
}

// ============================================
// Waste and Transfer Operations
// ============================================

/**
 * Record stock waste (spoilage, damage, expiration)
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} quantity - Quantity wasted
 * @param {string} reason - Reason for waste
 * @param {Object} [options] - Options
 * @param {string} [options.notes] - Additional notes
 * @param {string} [options.createdBy] - User ID
 * @returns {Promise<Object>} Result
 */
export async function recordWaste(itemId, quantity, reason, options = {}) {
  if (typeof quantity !== 'number' || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Reason is required for waste records');
  }

  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const currentStock = effectiveStock.value;
  const newStock = Math.max(0, currentStock - quantity);
  const actualWasted = currentStock - newStock;

  // Update appropriate stock field
  const updateData = { updatedAt: new Date().toISOString() };
  if (effectiveStock.type === 'weight') {
    updateData.stockWeight = newStock;
  } else {
    updateData.stockQuantity = newStock;
  }
  await inventoryItemDB.update(itemId, updateData);

  // Create waste transaction
  await stockTransactionDB.recordWaste(itemId, actualWasted, reason, {
    currentStock,
    notes: options.notes,
    createdBy: options.createdBy
  });

  // Check thresholds
  const percentage = getStockPercentageSync(newStock, effectivePar.value);
  const status = getStockStatusSync(percentage, item);

  return {
    itemId,
    itemName: item.name,
    quantityWasted: actualWasted,
    previousStock: currentStock,
    newStock,
    percentage,
    status,
    alert: status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW
  };
}

/**
 * Record stock transfer between locations
 *
 * @param {number} itemId - Inventory item ID
 * @param {number} quantity - Quantity transferred
 * @param {string} fromLocation - Source location
 * @param {string} toLocation - Destination location
 * @param {Object} [options] - Options
 * @param {string} [options.notes] - Additional notes
 * @param {string} [options.createdBy] - User ID
 * @returns {Promise<Object>} Result
 */
export async function recordTransfer(itemId, quantity, fromLocation, toLocation, options = {}) {
  if (typeof quantity !== 'number' || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  if (!fromLocation || !toLocation) {
    throw new Error('Both source and destination locations are required');
  }

  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const effectiveStock = getEffectiveStock(item);

  // Create transfer transaction (stock level unchanged at item level)
  await stockTransactionDB.recordTransfer(itemId, quantity, fromLocation, toLocation, {
    currentStock: effectiveStock.value,
    notes: options.notes,
    createdBy: options.createdBy
  });

  return {
    itemId,
    itemName: item.name,
    quantity,
    fromLocation,
    toLocation,
    currentStock: effectiveStock.value
  };
}

// ============================================
// Alert Functions
// ============================================

/**
 * Get all items that are currently in alert status
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.criticalOnly=false] - Only critical items
 * @returns {Promise<Object[]>} Items with alert status
 */
export async function getStockAlerts({ criticalOnly = false } = {}) {
  const items = await inventoryItemDB.getActive();
  const alerts = [];

  for (const item of items) {
    const effectiveStock = getEffectiveStock(item);
    const effectivePar = getEffectivePar(item);
    const percentage = getStockPercentageSync(effectiveStock.value, effectivePar.value);
    const status = getStockStatusSync(percentage, item);

    if (status === STOCK_STATUS.CRITICAL ||
      (!criticalOnly && status === STOCK_STATUS.LOW)) {
      alerts.push({
        itemId: item.id,
        itemName: item.name,
        vendorId: item.vendorId,
        vendorName: item.vendorName,
        currentStock: effectiveStock.value,
        parLevel: effectivePar.value,
        percentage,
        status,
        unit: effectiveStock.unit,
        category: item.category
      });
    }
  }

  // Sort by percentage ascending (most critical first)
  alerts.sort((a, b) => a.percentage - b.percentage);

  return alerts;
}

/**
 * Check if an item needs a restock alert
 *
 * @param {number} itemId - Item ID
 * @returns {Promise<Object|null>} Alert info or null if no alert needed
 */
export async function checkStockAlert(itemId) {
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    return null;
  }

  const effectiveStock = getEffectiveStock(item);
  const effectivePar = getEffectivePar(item);
  const percentage = getStockPercentageSync(effectiveStock.value, effectivePar.value);
  const status = getStockStatusSync(percentage, item);

  if (status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW) {
    return {
      itemId: item.id,
      itemName: item.name,
      percentage,
      status,
      message: `${item.name} is ${status} on stock (${percentage}%)`
    };
  }

  return null;
}

// ============================================
// Export all functions
// ============================================

export default {
  // Constants
  DEFAULT_THRESHOLDS,
  STOCK_STATUS,

  // Core operations
  adjustStock,
  setStock,
  addStockFromInvoice,
  deductStockFromTask,

  // Calculations
  getStockPercentage,
  getStockStatus,
  getStockInfo,

  // Bulk operations
  bulkAdjustStock,
  bulkSetStock,

  // Waste and transfer
  recordWaste,
  recordTransfer,

  // Alerts
  getStockAlerts,
  checkStockAlert
};
