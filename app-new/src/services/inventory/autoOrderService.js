/**
 * Auto-Order Generation Service
 *
 * Automated purchase order generation based on inventory levels.
 * Analyzes low stock items and generates draft orders grouped by vendor.
 *
 * @module services/inventory/autoOrderService
 */

import {
  inventoryItemDB,
  vendorDB,
  purchaseOrderDB,
  purchaseOrderLineDB,
  PO_STATUS
} from '../database/indexedDB';
import { getLowStockItems, getCriticalStockItems, STOCK_THRESHOLDS } from './inventoryItemService';
import { createOrder } from './purchaseOrderService';

// ============================================
// Constants
// ============================================

/**
 * Default minimum order quantity if not specified on item
 */
export const DEFAULT_MINIMUM_ORDER_QTY = 1;

/**
 * Default order multiple (round up to nearest)
 */
export const DEFAULT_ORDER_MULTIPLE = 1;

/**
 * Stock target modes for calculating suggested quantities
 */
export const STOCK_TARGET_MODE = {
  PAR_LEVEL: 'par_level',           // Target par level
  FULL_STOCK: 'full_stock',         // Target fullStock (last delivery amount)
  AVERAGE_PURCHASE: 'average_purchase', // Target average purchase quantity
  CUSTOM: 'custom'                  // Use custom target
};

// ============================================
// Quantity Calculation
// ============================================

/**
 * Calculate suggested order quantity for an item
 *
 * @param {Object} item - Inventory item
 * @param {Object} [options] - Calculation options
 * @param {string} [options.targetMode='par_level'] - Target stock mode
 * @param {number} [options.customTarget] - Custom target quantity (for CUSTOM mode)
 * @param {number} [options.minimumOrderQty] - Override minimum order quantity
 * @param {number} [options.orderMultiple] - Override order multiple
 * @returns {number} Suggested order quantity
 */
export function calculateSuggestedQuantity(item, options = {}) {
  const {
    targetMode = STOCK_TARGET_MODE.PAR_LEVEL,
    customTarget = null,
    minimumOrderQty = null,
    orderMultiple = null
  } = options;

  const currentStock = item.currentStock || 0;

  // Determine target stock level
  let targetStock;
  switch (targetMode) {
    case STOCK_TARGET_MODE.FULL_STOCK:
      targetStock = item.fullStock || item.parLevel || 0;
      break;
    case STOCK_TARGET_MODE.AVERAGE_PURCHASE:
      // Calculate average from purchase history
      if (item.purchaseCount > 0 && item.totalQuantityPurchased > 0) {
        targetStock = Math.ceil(item.totalQuantityPurchased / item.purchaseCount);
      } else {
        targetStock = item.parLevel || item.reorderQuantity || 0;
      }
      break;
    case STOCK_TARGET_MODE.CUSTOM:
      targetStock = customTarget || item.parLevel || 0;
      break;
    case STOCK_TARGET_MODE.PAR_LEVEL:
    default:
      targetStock = item.parLevel || 0;
      break;
  }

  // Calculate deficit
  let deficit = Math.max(0, targetStock - currentStock);

  // If no deficit but item has reorderQuantity, use that as minimum
  if (deficit === 0 && item.reorderQuantity) {
    deficit = item.reorderQuantity;
  }

  // Apply minimum order quantity
  const minQty = minimumOrderQty ?? item.minimumOrderQty ?? DEFAULT_MINIMUM_ORDER_QTY;
  let suggestedQty = Math.max(deficit, minQty);

  // Apply order multiple (round up to nearest multiple)
  const multiple = orderMultiple ?? item.orderMultiple ?? DEFAULT_ORDER_MULTIPLE;
  if (multiple > 1) {
    suggestedQty = Math.ceil(suggestedQty / multiple) * multiple;
  }

  // Final sanity check
  if (suggestedQty <= 0) {
    suggestedQty = item.reorderQuantity || minQty;
  }

  return suggestedQty;
}

// ============================================
// Item Analysis
// ============================================

/**
 * Get items needing order, grouped by vendor
 *
 * @param {Object} [options] - Options
 * @param {number} [options.threshold] - Stock threshold percentage
 * @param {string} [options.targetMode] - Target mode for quantity calculation
 * @param {boolean} [options.criticalOnly=false] - Only include critical items
 * @returns {Promise<Object>} Items grouped by vendorId: { vendorId: { vendor, items[] } }
 */
export async function getItemsNeedingOrder(options = {}) {
  const {
    threshold = STOCK_THRESHOLDS.LOW,
    targetMode = STOCK_TARGET_MODE.PAR_LEVEL,
    criticalOnly = false
  } = options;

  // Get low stock items
  const lowStockItems = criticalOnly
    ? await getCriticalStockItems()
    : await getLowStockItems(threshold);

  // Filter to items with vendors
  const itemsWithVendors = lowStockItems.filter(item => item.vendorId);

  // Group by vendor
  const byVendor = {};

  for (const item of itemsWithVendors) {
    const vendorId = item.vendorId;

    if (!byVendor[vendorId]) {
      // Get vendor info
      const vendor = await vendorDB.getById(vendorId);
      byVendor[vendorId] = {
        vendorId,
        vendor: vendor ? {
          id: vendor.id,
          name: vendor.name,
          vendorCode: vendor.vendorCode,
          email: vendor.orderEmail || vendor.email,
          phone: vendor.phone,
          isPreferred: vendor.isPreferred
        } : {
          id: vendorId,
          name: item.vendorName || 'Unknown Vendor'
        },
        items: [],
        totalItems: 0,
        totalValue: 0,
        criticalCount: 0,
        lowCount: 0
      };
    }

    // Calculate suggested quantity
    const suggestedQuantity = calculateSuggestedQuantity(item, { targetMode });
    const suggestedValue = suggestedQuantity * (item.currentPrice || 0);

    const enrichedItem = {
      id: item.id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      currentStock: item.currentStock || 0,
      parLevel: item.parLevel || 0,
      fullStock: item.fullStock || 0,
      stockPercent: item.stockPercent || 0,
      stockStatus: item.stockStatus || 'unknown',
      currentPrice: item.currentPrice || 0,
      reorderQuantity: item.reorderQuantity || 0,
      suggestedQuantity,
      suggestedValue: Math.round(suggestedValue * 100) / 100,
      lastPurchaseDate: item.lastPurchaseDate
    };

    byVendor[vendorId].items.push(enrichedItem);
    byVendor[vendorId].totalValue += suggestedValue;
    byVendor[vendorId].totalItems++;

    // Count by status
    if (item.stockStatus === 'critical') {
      byVendor[vendorId].criticalCount++;
    } else if (item.stockStatus === 'low') {
      byVendor[vendorId].lowCount++;
    }
  }

  // Round totals and sort items by urgency
  for (const vendorId in byVendor) {
    byVendor[vendorId].totalValue = Math.round(byVendor[vendorId].totalValue * 100) / 100;

    // Sort items by stock percentage (most urgent first)
    byVendor[vendorId].items.sort((a, b) => a.stockPercent - b.stockPercent);
  }

  return byVendor;
}

/**
 * Get low stock items that have no vendor assigned
 *
 * These items need manual attention to assign a vendor.
 *
 * @param {Object} [options] - Options
 * @param {number} [options.threshold] - Stock threshold percentage
 * @returns {Promise<Object[]>} Items without vendors
 */
export async function getItemsWithoutVendor(options = {}) {
  const { threshold = STOCK_THRESHOLDS.LOW } = options;

  // Get low stock items
  const lowStockItems = await getLowStockItems(threshold);

  // Filter to items without vendors
  const itemsWithoutVendors = lowStockItems.filter(item => !item.vendorId);

  // Enrich with suggested quantities
  return itemsWithoutVendors.map(item => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    category: item.category,
    currentStock: item.currentStock || 0,
    parLevel: item.parLevel || 0,
    stockPercent: item.stockPercent || 0,
    stockStatus: item.stockStatus || 'unknown',
    currentPrice: item.currentPrice || 0,
    suggestedQuantity: calculateSuggestedQuantity(item),
    lastPurchaseDate: item.lastPurchaseDate,
    notes: item.notes
  })).sort((a, b) => a.stockPercent - b.stockPercent);
}

// ============================================
// Order Generation
// ============================================

/**
 * Generate draft purchase orders from low stock items
 *
 * Creates one draft order per vendor with lines for each low stock item.
 *
 * @param {Object} [options] - Options
 * @param {number} [options.threshold] - Stock threshold percentage
 * @param {string} [options.targetMode] - Target mode for quantity calculation
 * @param {boolean} [options.criticalOnly=false] - Only include critical items
 * @param {number[]} [options.vendorIds] - Limit to specific vendors
 * @param {string} [options.createdBy] - User ID creating the orders
 * @param {string} [options.createdByName] - User name creating the orders
 * @returns {Promise<{ orders: Object[], itemsWithoutVendor: Object[], summary: Object }>}
 */
export async function generateOrdersFromLowStock(options = {}) {
  const {
    threshold = STOCK_THRESHOLDS.LOW,
    targetMode = STOCK_TARGET_MODE.PAR_LEVEL,
    criticalOnly = false,
    vendorIds = null,
    createdBy = null,
    createdByName = null
  } = options;

  // Get items needing order, grouped by vendor
  const itemsByVendor = await getItemsNeedingOrder({
    threshold,
    targetMode,
    criticalOnly
  });

  // Get items without vendor for the response
  const itemsWithoutVendor = await getItemsWithoutVendor({ threshold });

  const createdOrders = [];
  const summary = {
    vendorsProcessed: 0,
    ordersCreated: 0,
    totalLines: 0,
    totalValue: 0,
    skippedVendors: [],
    errors: []
  };

  // Filter to specific vendors if provided
  let vendorsToProcess = Object.keys(itemsByVendor).map(Number);
  if (vendorIds && vendorIds.length > 0) {
    vendorsToProcess = vendorsToProcess.filter(id => vendorIds.includes(id));
  }

  // Create an order for each vendor
  for (const vendorId of vendorsToProcess) {
    const vendorData = itemsByVendor[vendorId];

    // Skip if no items
    if (!vendorData.items || vendorData.items.length === 0) {
      summary.skippedVendors.push({
        vendorId,
        vendorName: vendorData.vendor?.name || 'Unknown',
        reason: 'No items to order'
      });
      continue;
    }

    try {
      // Create draft order
      const order = await createOrder(vendorId, {
        createdBy,
        createdByName,
        internalNotes: `Auto-generated order for ${vendorData.totalItems} low stock items`
      });

      // Add lines for each item
      for (const item of vendorData.items) {
        try {
          await purchaseOrderLineDB.create({
            purchaseOrderId: order.id,
            inventoryItemId: item.id,
            inventoryItemName: item.name,
            inventoryItemSku: item.sku,
            quantity: item.suggestedQuantity,
            unit: item.unit,
            unitPrice: item.currentPrice,
            stockAtOrder: item.currentStock,
            suggestedQty: item.suggestedQuantity,
            notes: item.stockStatus === 'critical' ? 'CRITICAL - Urgent reorder needed' : ''
          });
        } catch (lineError) {
          summary.errors.push({
            vendorId,
            itemId: item.id,
            itemName: item.name,
            error: lineError.message
          });
        }
      }

      // Get the completed order with lines
      const completedOrder = await purchaseOrderDB.getById(order.id);
      const lines = await purchaseOrderLineDB.getByPurchaseOrder(order.id);

      createdOrders.push({
        ...completedOrder,
        lines,
        itemCount: lines.length
      });

      summary.vendorsProcessed++;
      summary.ordersCreated++;
      summary.totalLines += lines.length;
      summary.totalValue += completedOrder.total || 0;

    } catch (orderError) {
      summary.errors.push({
        vendorId,
        vendorName: vendorData.vendor?.name || 'Unknown',
        error: orderError.message
      });
    }
  }

  // Round summary total
  summary.totalValue = Math.round(summary.totalValue * 100) / 100;

  return {
    orders: createdOrders,
    itemsWithoutVendor,
    summary
  };
}

/**
 * Generate order for a single vendor
 *
 * @param {number} vendorId - Vendor ID
 * @param {Object} [options] - Options
 * @param {number} [options.threshold] - Stock threshold percentage
 * @param {string} [options.targetMode] - Target mode for quantity calculation
 * @param {string} [options.createdBy] - User ID
 * @returns {Promise<Object>} Created order with lines
 */
export async function generateOrderForVendor(vendorId, options = {}) {
  const result = await generateOrdersFromLowStock({
    ...options,
    vendorIds: [vendorId]
  });

  if (result.orders.length === 0) {
    const vendor = await vendorDB.getById(vendorId);
    throw new Error(`No low stock items found for vendor "${vendor?.name || vendorId}"`);
  }

  return result.orders[0];
}

// ============================================
// Analysis & Preview
// ============================================

/**
 * Preview what orders would be generated without creating them
 *
 * @param {Object} [options] - Same options as generateOrdersFromLowStock
 * @returns {Promise<Object>} Preview of orders that would be created
 */
export async function previewAutoOrders(options = {}) {
  const {
    threshold = STOCK_THRESHOLDS.LOW,
    targetMode = STOCK_TARGET_MODE.PAR_LEVEL,
    criticalOnly = false,
    vendorIds = null
  } = options;

  // Get items needing order
  const itemsByVendor = await getItemsNeedingOrder({
    threshold,
    targetMode,
    criticalOnly
  });

  // Get items without vendor
  const itemsWithoutVendor = await getItemsWithoutVendor({ threshold });

  // Filter vendors if specified
  let vendors = Object.values(itemsByVendor);
  if (vendorIds && vendorIds.length > 0) {
    vendors = vendors.filter(v => vendorIds.includes(v.vendorId));
  }

  // Build preview
  const preview = {
    ordersToCreate: vendors.length,
    totalItems: vendors.reduce((sum, v) => sum + v.totalItems, 0),
    totalValue: Math.round(vendors.reduce((sum, v) => sum + v.totalValue, 0) * 100) / 100,
    criticalItems: vendors.reduce((sum, v) => sum + v.criticalCount, 0),
    lowStockItems: vendors.reduce((sum, v) => sum + v.lowCount, 0),
    itemsWithoutVendor: itemsWithoutVendor.length,
    byVendor: vendors.map(v => ({
      vendorId: v.vendorId,
      vendorName: v.vendor?.name || 'Unknown',
      itemCount: v.totalItems,
      estimatedTotal: v.totalValue,
      criticalCount: v.criticalCount,
      lowCount: v.lowCount,
      items: v.items.map(i => ({
        id: i.id,
        name: i.name,
        currentStock: i.currentStock,
        suggestedQuantity: i.suggestedQuantity,
        suggestedValue: i.suggestedValue,
        stockStatus: i.stockStatus
      }))
    }))
  };

  return preview;
}

/**
 * Get inventory reorder summary
 *
 * High-level overview of inventory status for dashboard.
 *
 * @returns {Promise<Object>} Inventory summary
 */
export async function getReorderSummary() {
  // Get all active items
  const allItems = await inventoryItemDB.getActive();

  // Count by status
  let critical = 0;
  let low = 0;
  let ok = 0;
  let withVendor = 0;
  let withoutVendor = 0;

  for (const item of allItems) {
    const currentStock = item.currentStock || 0;
    const parLevel = item.parLevel || 0;
    const percent = parLevel > 0 ? (currentStock / parLevel) * 100 : 100;
    const criticalThreshold = item.criticalThreshold || STOCK_THRESHOLDS.CRITICAL;
    const lowThreshold = item.lowStockThreshold || STOCK_THRESHOLDS.LOW;

    if (percent <= criticalThreshold) {
      critical++;
    } else if (percent <= lowThreshold) {
      low++;
    } else {
      ok++;
    }

    if (item.vendorId) {
      withVendor++;
    } else {
      withoutVendor++;
    }
  }

  // Get existing draft orders
  const draftOrders = await purchaseOrderDB.getByStatus(PO_STATUS.DRAFT);
  const pendingOrders = await purchaseOrderDB.getAwaitingDelivery();

  return {
    totalItems: allItems.length,
    stockStatus: {
      critical,
      low,
      ok
    },
    vendorAssignment: {
      withVendor,
      withoutVendor
    },
    pendingOrders: {
      drafts: draftOrders.length,
      awaitingDelivery: pendingOrders.length,
      totalPendingValue: Math.round(
        [...draftOrders, ...pendingOrders].reduce((sum, o) => sum + (o.total || 0), 0) * 100
      ) / 100
    },
    needsAttention: {
      criticalItems: critical,
      itemsWithoutVendor: withoutVendor > 0 && low + critical > 0
        ? allItems.filter(i => !i.vendorId).length
        : 0
    }
  };
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  DEFAULT_MINIMUM_ORDER_QTY,
  DEFAULT_ORDER_MULTIPLE,
  STOCK_TARGET_MODE,

  // Quantity Calculation
  calculateSuggestedQuantity,

  // Item Analysis
  getItemsNeedingOrder,
  getItemsWithoutVendor,

  // Order Generation
  generateOrdersFromLowStock,
  generateOrderForVendor,

  // Analysis & Preview
  previewAutoOrders,
  getReorderSummary
};
