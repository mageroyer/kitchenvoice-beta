/**
 * Purchase Order Service
 *
 * Business logic layer for purchase order management operations.
 * Handles order creation, status workflow, line items, and receiving.
 *
 * @module services/inventory/purchaseOrderService
 */

import {
  purchaseOrderDB,
  purchaseOrderLineDB,
  vendorDB,
  inventoryItemDB,
  db,
  PO_STATUS,
  PO_SEND_METHOD
} from '../database/indexedDB';
import { addStockFromInvoice } from './stockService';

// ============================================
// Constants
// ============================================

/**
 * Re-export PO status values for convenience
 */
export { PO_STATUS, PO_SEND_METHOD };

/**
 * Statuses that allow order editing
 */
export const EDITABLE_STATUSES = [PO_STATUS.DRAFT];

/**
 * Statuses that allow order cancellation
 */
export const CANCELLABLE_STATUSES = [
  PO_STATUS.DRAFT,
  PO_STATUS.PENDING_APPROVAL,
  PO_STATUS.APPROVED,
  PO_STATUS.SENT,
  PO_STATUS.CONFIRMED
];

/**
 * Statuses that allow receiving
 */
export const RECEIVABLE_STATUSES = [
  PO_STATUS.SENT,
  PO_STATUS.CONFIRMED,
  PO_STATUS.PARTIALLY_RECEIVED
];

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS = {
  [PO_STATUS.DRAFT]: [PO_STATUS.PENDING_APPROVAL, PO_STATUS.SENT, PO_STATUS.CANCELLED],
  [PO_STATUS.PENDING_APPROVAL]: [PO_STATUS.APPROVED, PO_STATUS.DRAFT, PO_STATUS.CANCELLED],
  [PO_STATUS.APPROVED]: [PO_STATUS.SENT, PO_STATUS.CANCELLED],
  [PO_STATUS.SENT]: [PO_STATUS.CONFIRMED, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.RECEIVED, PO_STATUS.CANCELLED],
  [PO_STATUS.CONFIRMED]: [PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.RECEIVED, PO_STATUS.CANCELLED],
  [PO_STATUS.PARTIALLY_RECEIVED]: [PO_STATUS.RECEIVED, PO_STATUS.CANCELLED],
  [PO_STATUS.RECEIVED]: [PO_STATUS.CLOSED],
  [PO_STATUS.CANCELLED]: [],
  [PO_STATUS.CLOSED]: []
};

// ============================================
// Validation Helpers
// ============================================

/**
 * Check if a status transition is valid
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {boolean} True if transition is valid
 */
export function isValidTransition(fromStatus, toStatus) {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[fromStatus];
  return allowedTransitions && allowedTransitions.includes(toStatus);
}

/**
 * Check if order can be edited
 * @param {string} status - Order status
 * @returns {boolean} True if editable
 */
export function canEditOrder(status) {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * Check if order can be cancelled
 * @param {string} status - Order status
 * @returns {boolean} True if cancellable
 */
export function canCancelOrder(status) {
  return CANCELLABLE_STATUSES.includes(status);
}

/**
 * Check if order can receive items
 * @param {string} status - Order status
 * @returns {boolean} True if can receive
 */
export function canReceiveOrder(status) {
  return RECEIVABLE_STATUSES.includes(status);
}

// ============================================
// Order Number Generation
// ============================================

/**
 * Generate a unique purchase order number
 *
 * Format: PO-YYYY-NNNN (e.g., PO-2025-0001)
 *
 * @returns {Promise<string>} New order number
 */
export async function generateOrderNumber() {
  return await purchaseOrderDB.generateOrderNumber();
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new purchase order
 *
 * @param {number} vendorId - Vendor ID (required)
 * @param {Object} [options] - Additional order options
 * @param {string} [options.createdBy] - User ID
 * @param {string} [options.createdByName] - User name
 * @param {string} [options.deliveryAddress] - Delivery address
 * @param {string} [options.deliveryInstructions] - Delivery instructions
 * @param {string} [options.expectedDeliveryDate] - Expected delivery date (ISO)
 * @param {string} [options.vendorNotes] - Notes for vendor
 * @param {string} [options.internalNotes] - Internal notes
 * @returns {Promise<Object>} Created order
 * @throws {Error} If vendor not found
 */
export async function createOrder(vendorId, options = {}) {
  // Validate vendor exists
  const vendor = await vendorDB.getById(vendorId);
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Generate order number
  const orderNumber = await generateOrderNumber();

  // Create the order
  const order = await purchaseOrderDB.create({
    vendorId,
    vendorName: vendor.name,
    orderNumber,
    status: PO_STATUS.DRAFT,
    createdBy: options.createdBy,
    createdByName: options.createdByName,
    deliveryAddress: options.deliveryAddress,
    deliveryInstructions: options.deliveryInstructions,
    expectedDeliveryDate: options.expectedDeliveryDate,
    vendorNotes: options.vendorNotes,
    internalNotes: options.internalNotes
  });

  return order;
}

/**
 * Update a purchase order
 *
 * @param {number} id - Order ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated order
 * @throws {Error} If order not found or not editable
 */
export async function updateOrder(id, data) {
  // Fetch existing order
  const existingOrder = await purchaseOrderDB.getById(id);
  if (!existingOrder) {
    throw new Error('Purchase order not found');
  }

  // Check if order is editable
  if (!canEditOrder(existingOrder.status)) {
    throw new Error(`Cannot edit order with status "${existingOrder.status}". Only draft orders can be edited.`);
  }

  // Prevent changing certain fields
  const protectedFields = ['id', 'orderNumber', 'createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (data[field] !== undefined) {
      delete data[field];
    }
  }

  // Update the order
  const updatedOrder = await purchaseOrderDB.update(id, data);

  // Recalculate totals if needed
  await calculateOrderTotals(id);

  return await purchaseOrderDB.getById(id);
}

/**
 * Delete a purchase order
 *
 * @param {number} id - Order ID
 * @returns {Promise<{ deleted: boolean }>}
 * @throws {Error} If order not found or not draft
 */
export async function deleteOrder(id) {
  // Fetch existing order
  const existingOrder = await purchaseOrderDB.getById(id);
  if (!existingOrder) {
    throw new Error('Purchase order not found');
  }

  // Only draft orders can be deleted
  if (existingOrder.status !== PO_STATUS.DRAFT) {
    throw new Error('Only draft orders can be deleted. Use cancel for other statuses.');
  }

  // Delete order (this also deletes lines via purchaseOrderDB.delete)
  await purchaseOrderDB.delete(id);

  return { deleted: true };
}

// ============================================
// Query Operations
// ============================================

/**
 * Get a purchase order by ID with line items
 *
 * @param {number} id - Order ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeItemDetails=true] - Include inventory item details
 * @returns {Promise<Object|null>} Order with lines or null
 */
export async function getOrder(id, { includeItemDetails = true } = {}) {
  // Fetch order
  const order = await purchaseOrderDB.getById(id);
  if (!order) {
    return null;
  }

  // Fetch lines
  const lines = await purchaseOrderLineDB.getByPurchaseOrder(id);

  // Enrich lines with item details if requested
  let enrichedLines = lines;
  if (includeItemDetails) {
    enrichedLines = await Promise.all(lines.map(async (line) => {
      if (line.inventoryItemId) {
        const item = await inventoryItemDB.getById(line.inventoryItemId);
        if (item) {
          return {
            ...line,
            inventoryItem: {
              id: item.id,
              name: item.name,
              sku: item.sku,
              stockQuantity: item.stockQuantity,
              stockWeight: item.stockWeight,
              parQuantity: item.parQuantity,
              parWeight: item.parWeight,
              currentPrice: item.currentPrice
            }
          };
        }
      }
      return line;
    }));
  }

  return {
    ...order,
    lines: enrichedLines
  };
}

/**
 * Get all purchase orders with optional filters
 *
 * @param {Object} [filters] - Filter options
 * @param {string} [filters.status] - Filter by status
 * @param {number} [filters.vendorId] - Filter by vendor
 * @param {string} [filters.startDate] - Filter by start date (ISO)
 * @param {string} [filters.endDate] - Filter by end date (ISO)
 * @param {boolean} [filters.includeAll=true] - Include cancelled orders
 * @returns {Promise<Object[]>} Orders sorted by createdAt descending
 */
export async function getAllOrders(filters = {}) {
  let orders;

  // Apply status filter if provided
  if (filters.status) {
    orders = await purchaseOrderDB.getByStatus(filters.status);
  } else if (filters.vendorId) {
    orders = await purchaseOrderDB.getByVendor(filters.vendorId);
  } else if (filters.startDate && filters.endDate) {
    orders = await purchaseOrderDB.getByDateRange(filters.startDate, filters.endDate);
  } else {
    orders = await purchaseOrderDB.getAll({ includeAll: filters.includeAll !== false });
  }

  // Apply additional filters
  if (filters.status && filters.vendorId) {
    orders = orders.filter(o => o.vendorId === filters.vendorId);
  }

  if (filters.startDate && !filters.endDate) {
    orders = orders.filter(o => o.createdAt >= filters.startDate);
  }

  if (filters.endDate && !filters.startDate) {
    orders = orders.filter(o => o.createdAt <= filters.endDate);
  }

  // Already sorted by createdAt descending from DB
  return orders;
}

/**
 * Get all draft orders
 *
 * @returns {Promise<Object[]>} Draft orders
 */
export async function getDraftOrders() {
  return await purchaseOrderDB.getByStatus(PO_STATUS.DRAFT);
}

/**
 * Get orders awaiting delivery
 *
 * @returns {Promise<Object[]>} Orders awaiting delivery
 */
export async function getAwaitingDelivery() {
  return await purchaseOrderDB.getAwaitingDelivery();
}

// ============================================
// Line Item Operations
// ============================================

/**
 * Add a line item to an order
 *
 * @param {number} orderId - Order ID
 * @param {number} itemId - Inventory item ID
 * @param {number} quantity - Quantity to order
 * @param {Object} [options] - Additional options
 * @param {number} [options.unitPrice] - Override unit price
 * @param {string} [options.notes] - Line notes
 * @returns {Promise<Object>} Updated order with new line
 * @throws {Error} If order not draft or item not found
 */
export async function addLineToOrder(orderId, itemId, quantity, options = {}) {
  // Fetch order
  const order = await purchaseOrderDB.getById(orderId);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate order is draft
  if (!canEditOrder(order.status)) {
    throw new Error('Can only add lines to draft orders');
  }

  // Fetch inventory item for pricing
  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Create line item
  // Get effective stock based on item type
  const effectiveStock = item.stockWeight > 0 ? item.stockWeight : (item.stockQuantity || 0);
  const effectiveUnit = item.stockWeightUnit || item.stockQuantityUnit || 'ea';

  const line = await purchaseOrderLineDB.create({
    purchaseOrderId: orderId,
    inventoryItemId: itemId,
    inventoryItemName: item.name,
    inventoryItemSku: item.sku,
    quantity,
    unit: effectiveUnit,
    unitPrice: options.unitPrice ?? item.currentPrice ?? 0,
    stockAtOrder: effectiveStock,
    notes: options.notes
  });

  // Totals are auto-recalculated by DB layer

  // Return updated order
  return await getOrder(orderId);
}

/**
 * Update a line item
 *
 * @param {number} lineId - Line ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated line
 * @throws {Error} If order not draft
 */
export async function updateOrderLine(lineId, data) {
  // Fetch line
  const line = await purchaseOrderLineDB.getById(lineId);
  if (!line) {
    throw new Error('Order line not found');
  }

  // Fetch order to check status
  const order = await purchaseOrderDB.getById(line.purchaseOrderId);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate order is draft
  if (!canEditOrder(order.status)) {
    throw new Error('Can only update lines on draft orders');
  }

  // Update line (totals auto-recalculated by DB layer)
  return await purchaseOrderLineDB.update(lineId, data);
}

/**
 * Remove a line item from an order
 *
 * @param {number} lineId - Line ID
 * @returns {Promise<{ deleted: boolean }>}
 * @throws {Error} If order not draft
 */
export async function removeOrderLine(lineId) {
  // Fetch line
  const line = await purchaseOrderLineDB.getById(lineId);
  if (!line) {
    throw new Error('Order line not found');
  }

  // Fetch order to check status
  const order = await purchaseOrderDB.getById(line.purchaseOrderId);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate order is draft
  if (!canEditOrder(order.status)) {
    throw new Error('Can only remove lines from draft orders');
  }

  // Delete line (totals auto-recalculated by DB layer)
  await purchaseOrderLineDB.delete(lineId);

  return { deleted: true };
}

// ============================================
// Totals Calculation
// ============================================

/**
 * Calculate and update order totals
 *
 * @param {number} orderId - Order ID
 * @returns {Promise<{ subtotal: number, taxGST: number, taxQST: number, total: number }>}
 */
export async function calculateOrderTotals(orderId) {
  const order = await purchaseOrderDB.recalculateTotals(orderId);

  return {
    subtotal: order.subtotal,
    taxGST: order.taxGST,
    taxQST: order.taxQST,
    total: order.total
  };
}

// ============================================
// Status Workflow
// ============================================

/**
 * Send order to vendor
 *
 * @param {number} id - Order ID
 * @param {string} method - Send method (email, fax, phone, portal, in_person, other)
 * @param {Object} [options] - Options
 * @param {string} [options.sentBy] - User ID who sent
 * @param {boolean} [options.generatePdf=false] - Generate PDF (placeholder)
 * @returns {Promise<Object>} Updated order
 * @throws {Error} If order not in sendable state
 */
export async function sendOrder(id, method, options = {}) {
  // Fetch order
  const order = await purchaseOrderDB.getById(id);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate status
  if (order.status !== PO_STATUS.DRAFT && order.status !== PO_STATUS.APPROVED) {
    throw new Error('Only draft or approved orders can be sent');
  }

  // Validate send method
  if (!purchaseOrderDB.isValidSendMethod(method)) {
    throw new Error(`Invalid send method: ${method}`);
  }

  // Validate order has lines
  const lines = await purchaseOrderLineDB.getByPurchaseOrder(id);
  if (lines.length === 0) {
    throw new Error('Cannot send order with no line items');
  }

  // Mark as sent
  const updatedOrder = await purchaseOrderDB.markSent(id, method, options.sentBy);

  // Generate PDF placeholder - in real implementation would generate PDF
  if (options.generatePdf) {
    // TODO: Implement PDF generation
    // const pdfUrl = await generateOrderPdf(id);
    // await purchaseOrderDB.update(id, { pdfUrl });
  }

  return updatedOrder;
}

/**
 * Receive items for an order
 *
 * @param {number} id - Order ID
 * @param {Array<{ lineId: number, quantityReceived: number, notes?: string }>} receivedLines - Lines being received
 * @param {Object} [options] - Options
 * @param {string} [options.receivedBy] - User ID who received
 * @param {boolean} [options.updateInventory=true] - Update inventory stock
 * @returns {Promise<{ order: Object, inventoryUpdates: Object[] }>}
 * @throws {Error} If order not in receivable state
 */
export async function receiveOrder(id, receivedLines, options = {}) {
  // Fetch order
  const order = await purchaseOrderDB.getById(id);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate status
  if (!canReceiveOrder(order.status)) {
    throw new Error(`Cannot receive items for order with status "${order.status}"`);
  }

  const inventoryUpdates = [];
  const updateInventory = options.updateInventory !== false;

  // Use transaction for atomicity
  await db.transaction('rw', [db.purchaseOrderLines, db.purchaseOrders, db.inventoryItems, db.stockTransactions], async () => {
    // Process each received line
    for (const receivedLine of receivedLines) {
      const { lineId, quantityReceived, notes } = receivedLine;

      if (quantityReceived <= 0) {
        continue;
      }

      // Get the line
      const line = await purchaseOrderLineDB.getById(lineId);
      if (!line || line.purchaseOrderId !== id) {
        throw new Error(`Line ${lineId} not found or does not belong to this order`);
      }

      // Record the receipt
      await purchaseOrderLineDB.recordReceive(lineId, quantityReceived, notes);

      // Update inventory if requested and line has an inventory item
      if (updateInventory && line.inventoryItemId) {
        try {
          const stockResult = await addStockFromInvoice(
            line.inventoryItemId,
            quantityReceived,
            null, // No invoice ID for PO receiving
            {
              purchaseOrderId: id,
              purchaseOrderLineId: lineId,
              unitCost: line.unitPrice,
              createdBy: options.receivedBy
            }
          );

          inventoryUpdates.push({
            lineId,
            inventoryItemId: line.inventoryItemId,
            itemName: line.inventoryItemName,
            quantityReceived,
            previousStock: stockResult.previousStock,
            newStock: stockResult.newStock
          });
        } catch (error) {
          throw new Error(`Failed to update inventory for ${line.inventoryItemName}: ${error.message}`);
        }
      }
    }
  });

  // Check receiving status and update order status
  const receivingStatus = await purchaseOrderLineDB.getReceivingStatus(id);

  if (receivingStatus.isComplete) {
    await purchaseOrderDB.markReceived(id);
  } else if (receivingStatus.received > 0 || receivingStatus.partial > 0) {
    await purchaseOrderDB.markPartiallyReceived(id);
  }

  // Get updated order
  const updatedOrder = await getOrder(id);

  return {
    order: updatedOrder,
    inventoryUpdates,
    receivingStatus
  };
}

/**
 * Cancel an order
 *
 * @param {number} id - Order ID
 * @param {string} [reason] - Cancellation reason
 * @returns {Promise<Object>} Cancelled order
 * @throws {Error} If order cannot be cancelled
 */
export async function cancelOrder(id, reason = '') {
  // Fetch order
  const order = await purchaseOrderDB.getById(id);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate can cancel
  if (!canCancelOrder(order.status)) {
    throw new Error(`Cannot cancel order with status "${order.status}"`);
  }

  // Cancel the order
  return await purchaseOrderDB.cancel(id, reason);
}

/**
 * Submit order for approval
 *
 * @param {number} id - Order ID
 * @returns {Promise<Object>} Updated order
 */
export async function submitForApproval(id) {
  const order = await purchaseOrderDB.getById(id);
  if (!order) {
    throw new Error('Purchase order not found');
  }

  // Validate has lines
  const lines = await purchaseOrderLineDB.getByPurchaseOrder(id);
  if (lines.length === 0) {
    throw new Error('Cannot submit order with no line items');
  }

  return await purchaseOrderDB.submitForApproval(id);
}

/**
 * Approve an order
 *
 * @param {number} id - Order ID
 * @param {string} approvedBy - User ID
 * @param {string} [approvedByName] - User name
 * @returns {Promise<Object>} Approved order
 */
export async function approveOrder(id, approvedBy, approvedByName = '') {
  return await purchaseOrderDB.approve(id, approvedBy, approvedByName);
}

/**
 * Record vendor confirmation
 *
 * @param {number} id - Order ID
 * @param {string} confirmationNumber - Vendor's confirmation number
 * @param {string} [expectedDeliveryDate] - Expected delivery date (ISO)
 * @returns {Promise<Object>} Confirmed order
 */
export async function confirmOrder(id, confirmationNumber, expectedDeliveryDate = null) {
  return await purchaseOrderDB.recordConfirmation(id, confirmationNumber, expectedDeliveryDate);
}

/**
 * Close a received order
 *
 * @param {number} id - Order ID
 * @returns {Promise<Object>} Closed order
 */
export async function closeOrder(id) {
  return await purchaseOrderDB.close(id);
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Create order from low stock items
 *
 * @param {number} vendorId - Vendor ID
 * @param {Object} [options] - Options
 * @param {string} [options.createdBy] - User ID
 * @param {boolean} [options.includeParLevel=true] - Use par level for quantities
 * @returns {Promise<Object>} Created order with suggested lines
 */
export async function createOrderFromLowStock(vendorId, options = {}) {
  // Get low stock items for this vendor
  const items = await inventoryItemDB.getByVendor(vendorId);
  const lowStockItems = items.filter(item => {
    if (!item.isActive) return false;
    // Use effective stock (weight-based or quantity-based)
    const effectiveStock = item.stockWeight > 0 ? item.stockWeight : (item.stockQuantity || 0);
    const effectivePar = item.parWeight > 0 ? item.parWeight : (item.parQuantity || 0);
    const reorderPoint = item.reorderPoint || (effectivePar * 0.25);
    return effectiveStock <= reorderPoint;
  });

  if (lowStockItems.length === 0) {
    throw new Error('No low stock items found for this vendor');
  }

  // Create the order
  const order = await createOrder(vendorId, {
    createdBy: options.createdBy,
    internalNotes: 'Auto-generated from low stock items'
  });

  // Add lines for each low stock item
  for (const item of lowStockItems) {
    const effectiveStock = item.stockWeight > 0 ? item.stockWeight : (item.stockQuantity || 0);
    const effectivePar = item.parWeight > 0 ? item.parWeight : (item.parQuantity || 0);
    const effectiveUnit = item.stockWeightUnit || item.stockQuantityUnit || 'ea';
    const suggestedQty = options.includeParLevel !== false
      ? Math.max(effectivePar - effectiveStock, item.reorderQuantity || 1)
      : (item.reorderQuantity || 1);

    await purchaseOrderLineDB.create({
      purchaseOrderId: order.id,
      inventoryItemId: item.id,
      inventoryItemName: item.name,
      inventoryItemSku: item.sku,
      quantity: suggestedQty,
      unit: effectiveUnit,
      unitPrice: item.currentPrice || 0,
      stockAtOrder: effectiveStock,
      suggestedQty
    });
  }

  // Return order with lines
  return await getOrder(order.id);
}

/**
 * Get order summary statistics
 *
 * @param {Object} [options] - Options
 * @param {string} [options.startDate] - Start date (ISO)
 * @param {string} [options.endDate] - End date (ISO)
 * @returns {Promise<Object>} Summary statistics
 */
export async function getOrderStats(options = {}) {
  return await purchaseOrderDB.getSummary(options);
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  PO_STATUS,
  PO_SEND_METHOD,
  EDITABLE_STATUSES,
  CANCELLABLE_STATUSES,
  RECEIVABLE_STATUSES,
  VALID_STATUS_TRANSITIONS,

  // Validation
  isValidTransition,
  canEditOrder,
  canCancelOrder,
  canReceiveOrder,

  // Order Number
  generateOrderNumber,

  // CRUD
  createOrder,
  updateOrder,
  deleteOrder,
  getOrder,
  getAllOrders,
  getDraftOrders,
  getAwaitingDelivery,

  // Line Items
  addLineToOrder,
  updateOrderLine,
  removeOrderLine,

  // Totals
  calculateOrderTotals,

  // Status Workflow
  sendOrder,
  receiveOrder,
  cancelOrder,
  submitForApproval,
  approveOrder,
  confirmOrder,
  closeOrder,

  // Bulk Operations
  createOrderFromLowStock,
  getOrderStats
};
