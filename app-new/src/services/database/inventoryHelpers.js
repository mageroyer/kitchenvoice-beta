/**
 * Inventory Helpers - Computed values for inventory items
 *
 * These functions replace stored derived fields with on-demand computation.
 * This keeps the database lean and ensures values are always current.
 */

import { invoiceLineDB } from './invoiceDB.js';
import { priceHistoryDB } from './supportingDB.js';

/**
 * Calculate total units per case from packaging info
 * Replaces the removed totalUnitsPerCase field
 *
 * @param {Object} item - Inventory item
 * @returns {number} Total units per case
 */
export function getTotalUnitsPerCase(item) {
  if (!item) return 1;

  // For nested packaging (e.g., 10/100 = 10 packs of 100)
  if (item.packCount && item.unitsPerPack) {
    return item.packCount * item.unitsPerPack;
  }

  // For simple case format (e.g., 6x500ML = 6 units)
  if (item.unitsPerCase) {
    return item.unitsPerCase;
  }

  return 1;
}

/**
 * Calculate container units currently in stock
 * Replaces the removed containerUnitsStock field
 *
 * @param {Object} item - Inventory item
 * @returns {number} Total individual units in stock
 */
export function getContainerUnitsInStock(item) {
  if (!item) return 0;
  return (item.stockQuantity || 0) * getTotalUnitsPerCase(item);
}

/**
 * Get purchase statistics for an inventory item
 * Replaces the removed purchaseCount, totalQuantityPurchased, totalSpent, avgPrice fields
 *
 * @param {number} inventoryItemId - Inventory item ID
 * @returns {Promise<{purchaseCount: number, totalSpent: number, totalQuantity: number, avgPrice: number}>}
 */
export async function getPurchaseStats(inventoryItemId) {
  if (!inventoryItemId) {
    return { purchaseCount: 0, totalSpent: 0, totalQuantity: 0, avgPrice: 0 };
  }

  try {
    const lines = await invoiceLineDB.getByInventoryItem(inventoryItemId);

    if (!lines || lines.length === 0) {
      return { purchaseCount: 0, totalSpent: 0, totalQuantity: 0, avgPrice: 0 };
    }

    const purchaseCount = lines.length;
    const totalSpent = lines.reduce((sum, l) => sum + (l.totalPrice || l.lineTotal || 0), 0);
    const totalQuantity = lines.reduce((sum, l) => sum + (l.quantity || 0), 0);
    const avgPrice = purchaseCount > 0 ? totalSpent / purchaseCount : 0;

    return {
      purchaseCount,
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalQuantity,
      avgPrice: Math.round(avgPrice * 100) / 100
    };
  } catch (error) {
    console.warn('Failed to get purchase stats:', error);
    return { purchaseCount: 0, totalSpent: 0, totalQuantity: 0, avgPrice: 0 };
  }
}

/**
 * Get price range for an inventory item from price history
 * Computes min/max/avg prices on-demand
 *
 * @param {number} inventoryItemId - Inventory item ID
 * @returns {Promise<{min: number|null, max: number|null, avg: number|null}>}
 */
export async function getPriceRange(inventoryItemId) {
  if (!inventoryItemId) {
    return { min: null, max: null, avg: null };
  }

  try {
    const history = await priceHistoryDB.getByItem(inventoryItemId);

    if (!history || history.length === 0) {
      return { min: null, max: null, avg: null };
    }

    const prices = history.map(h => h.price).filter(p => typeof p === 'number' && p > 0);

    if (prices.length === 0) {
      return { min: null, max: null, avg: null };
    }

    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
    };
  } catch (error) {
    console.warn('Failed to get price range:', error);
    return { min: null, max: null, avg: null };
  }
}

/**
 * Get effective stock level based on item type
 * For weight-based items, returns stockWeight
 * For count-based items, returns stockQuantity (with fallback to currentStock for legacy items)
 *
 * @param {Object} item - Inventory item
 * @returns {{value: number, unit: string, type: 'weight'|'quantity'}}
 */
export function getEffectiveStock(item) {
  if (!item) {
    return { value: 0, unit: 'pc', type: 'quantity' };
  }

  // Weight-based items (meat, produce, etc.)
  if (item.pricingType === 'weight' || item.stockWeightUnit) {
    return {
      value: item.stockWeight || 0,
      unit: item.stockWeightUnit || 'lb',
      type: 'weight'
    };
  }

  // Count-based items (cases, pieces)
  // Use stockQuantity (new schema) with fallback to currentStock (legacy)
  return {
    value: item.stockQuantity ?? item.currentStock ?? 0,
    unit: item.stockQuantityUnit || item.unit || 'pc',
    type: 'quantity'
  };
}

/**
 * Get effective par level based on item type
 * Falls back to fullStock/parLevel when par is not set (for percentage calculations)
 *
 * @param {Object} item - Inventory item
 * @returns {{value: number, unit: string, type: 'weight'|'quantity'}}
 */
export function getEffectivePar(item) {
  if (!item) {
    return { value: 0, unit: 'pc', type: 'quantity' };
  }

  // Weight-based items
  if (item.pricingType === 'weight' || item.stockWeightUnit) {
    // Use parWeight, fall back to fullStock for percentage calculations
    // Treat 0 as "not set" and fall back to legacy fields
    const value = item.parWeight || item.fullStock || 0;
    return {
      value,
      unit: item.stockWeightUnit || 'lb',
      type: 'weight'
    };
  }

  // Count-based items - use parQuantity (new schema), fall back to parLevel/fullStock (legacy)
  // Treat 0 as "not set" and fall back to legacy fields
  const value = item.parQuantity || item.parLevel || item.fullStock || 0;
  return {
    value,
    unit: item.stockQuantityUnit || item.unit || 'pc',
    type: 'quantity'
  };
}

/**
 * Check if item needs reorder based on effective stock vs par
 *
 * @param {Object} item - Inventory item
 * @returns {boolean}
 */
export function needsReorder(item) {
  if (!item || !item.reorderPoint) return false;

  const stock = getEffectiveStock(item);
  return stock.value <= item.reorderPoint;
}

/**
 * Format stock display string
 *
 * @param {Object} item - Inventory item
 * @returns {string} Formatted stock display (e.g., "8 cases" or "175 lb")
 */
export function formatStockDisplay(item) {
  const stock = getEffectiveStock(item);
  return `${stock.value} ${stock.unit}`;
}
