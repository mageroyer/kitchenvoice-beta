/**
 * Order Database Module
 *
 * Handles stock transactions, purchase orders, and purchase order lines.
 * Provides complete audit trail of all inventory movements.
 *
 * @module services/database/orderDB
 */

import { db, getCloudSync } from './db.js';

// ============================================
// Stock Transaction Constants
// ============================================

/**
 * Transaction Type Enum
 * Defines all valid inventory movement types
 */
export const TRANSACTION_TYPE = {
  PURCHASE: 'purchase',           // Stock received from vendor (invoice)
  TASK_USAGE: 'task_usage',       // Stock used for recipe/task production
  ADJUSTMENT: 'adjustment',       // Manual adjustment (+/-)
  WASTE: 'waste',                 // Spoilage, damage, expiration
  TRANSFER: 'transfer',           // Transfer between locations
  COUNT_CORRECTION: 'count_correction', // Physical count correction
  RETURN: 'return',               // Returned to vendor
  SAMPLE: 'sample',               // Used for sampling/testing
  THEFT: 'theft',                 // Suspected theft/loss
  INITIAL: 'initial'              // Initial stock entry
};

/**
 * Reference Type Enum
 * Defines what the transaction is linked to
 */
export const REFERENCE_TYPE = {
  INVOICE: 'invoice',             // Links to invoices table
  INVOICE_LINE: 'invoice_line',   // Links to invoiceLineItems table
  TASK: 'task',                   // Links to tasks/productionLogs
  RECIPE: 'recipe',               // Links to recipes table
  COUNT: 'count',                 // Links to inventory count session
  TRANSFER: 'transfer',           // Links to transfer record
  MANUAL: 'manual'                // No external reference
};

// ============================================
// Purchase Order Constants
// ============================================

/**
 * Purchase Order Status Enum
 */
export const PO_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
};

/**
 * Purchase Order Send Method Enum
 */
export const PO_SEND_METHOD = {
  EMAIL: 'email',
  FAX: 'fax',
  PHONE: 'phone',
  PORTAL: 'portal',
  IN_PERSON: 'in_person',
  OTHER: 'other'
};

// ============================================
// Stock Transaction Database
// ============================================

/**
 * Stock Transaction Database
 * Complete audit trail of all inventory movements
 */
export const stockTransactionDB = {
  /**
   * Validate transaction type
   * @param {string} type - Transaction type to validate
   * @returns {boolean} True if valid
   */
  isValidTransactionType(type) {
    return Object.values(TRANSACTION_TYPE).includes(type);
  },

  /**
   * Validate reference type
   * @param {string} type - Reference type to validate
   * @returns {boolean} True if valid
   */
  isValidReferenceType(type) {
    return Object.values(REFERENCE_TYPE).includes(type);
  },

  /**
   * Get transactions for an inventory item
   * @param {number} inventoryItemId - Inventory item ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Max results
   * @param {boolean} [options.includeVoided=false] - Include voided transactions
   * @returns {Promise<Array>} Transactions sorted by date (newest first)
   */
  async getByInventoryItem(inventoryItemId, { limit = 100, includeVoided = false } = {}) {
    let results = await db.stockTransactions
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .sortBy('createdAt');

    if (!includeVoided) {
      results = results.filter(t => !t.isVoided);
    }

    return results.slice(0, limit);
  },

  /**
   * Get transactions by type
   * @param {string} transactionType - Transaction type from TRANSACTION_TYPE
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Max results
   * @returns {Promise<Array>} Transactions sorted by date (newest first)
   * @throws {Error} If transaction type is invalid
   */
  async getByType(transactionType, { limit = 100 } = {}) {
    if (!this.isValidTransactionType(transactionType)) {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }
    return await db.stockTransactions
      .where('transactionType')
      .equals(transactionType)
      .reverse()
      .limit(limit)
      .sortBy('createdAt');
  },

  /**
   * Get transaction by ID
   * @param {number} id - Transaction ID
   * @returns {Promise<Object|undefined>} Transaction or undefined
   */
  async getById(id) {
    return await db.stockTransactions.get(id);
  },

  /**
   * Get transactions by reference (e.g., all transactions for an invoice)
   * @param {string} referenceType - Reference type from REFERENCE_TYPE
   * @param {string|number} referenceId - Reference ID
   * @returns {Promise<Array>} Matching transactions
   */
  async getByReference(referenceType, referenceId) {
    return await db.stockTransactions
      .where('referenceType')
      .equals(referenceType)
      .filter(t => t.referenceId === referenceId)
      .toArray();
  },

  /**
   * Get transactions within a date range
   * @param {string} startDate - Start date (ISO format)
   * @param {string} endDate - End date (ISO format)
   * @param {Object} [options] - Filter options
   * @param {number} [options.inventoryItemId] - Filter by item
   * @param {string} [options.transactionType] - Filter by type
   * @returns {Promise<Array>} Transactions sorted by date (newest first)
   */
  async getByDateRange(startDate, endDate, { inventoryItemId = null, transactionType = null } = {}) {
    let results = await db.stockTransactions
      .where('createdAt')
      .between(startDate, endDate, true, true)
      .toArray();

    if (inventoryItemId !== null) {
      results = results.filter(t => t.inventoryItemId === inventoryItemId);
    }
    if (transactionType !== null) {
      results = results.filter(t => t.transactionType === transactionType);
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  /**
   * Get item history with running balance
   * @param {number} inventoryItemId - Inventory item ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=50] - Max results
   * @returns {Promise<Array>} Transactions with runningBalance field
   */
  async getItemHistory(inventoryItemId, { limit = 50 } = {}) {
    const transactions = await this.getByInventoryItem(inventoryItemId, { limit, includeVoided: false });

    const reversed = [...transactions].reverse();
    let runningBalance = 0;

    const withBalance = reversed.map(t => {
      runningBalance = t.stockAfter;
      return { ...t, runningBalance };
    });

    return withBalance.reverse();
  },

  /**
   * Create a new stock transaction
   * @param {Object} transaction - Transaction data
   * @param {number} transaction.inventoryItemId - Inventory item ID (required)
   * @param {string} transaction.transactionType - Type from TRANSACTION_TYPE (required)
   * @param {number} [transaction.quantityChange] - Quantity change (+/-)
   * @param {number} [transaction.stockBefore] - Stock before transaction
   * @param {number} [transaction.stockAfter] - Stock after transaction
   * @param {string} [transaction.referenceType] - Reference type
   * @param {string|number} [transaction.referenceId] - Reference ID
   * @returns {Promise<number>} Created transaction ID
   * @throws {Error} If required fields missing or invalid
   */
  async create(transaction) {
    if (!transaction.inventoryItemId) {
      throw new Error('Inventory item ID is required');
    }
    if (!transaction.transactionType) {
      throw new Error('Transaction type is required');
    }
    if (!this.isValidTransactionType(transaction.transactionType)) {
      throw new Error(`Invalid transaction type: ${transaction.transactionType}`);
    }
    if (transaction.referenceType && !this.isValidReferenceType(transaction.referenceType)) {
      throw new Error(`Invalid reference type: ${transaction.referenceType}`);
    }

    const inventoryItem = await db.inventoryItems.get(transaction.inventoryItemId);
    if (!inventoryItem) {
      throw new Error(`Inventory item with ID ${transaction.inventoryItemId} not found`);
    }

    const now = new Date().toISOString();
    const data = {
      inventoryItemId: transaction.inventoryItemId,
      inventoryItemName: inventoryItem.name,
      transactionType: transaction.transactionType,
      quantityChange: typeof transaction.quantityChange === 'number' ? transaction.quantityChange : 0,
      unit: transaction.unit?.trim() || inventoryItem.unit || 'ea',
      stockBefore: typeof transaction.stockBefore === 'number' ? transaction.stockBefore : 0,
      stockAfter: typeof transaction.stockAfter === 'number' ? transaction.stockAfter : 0,
      fullStockBefore: typeof transaction.fullStockBefore === 'number' ? transaction.fullStockBefore : null,
      fullStockAfter: typeof transaction.fullStockAfter === 'number' ? transaction.fullStockAfter : null,
      partialBefore: typeof transaction.partialBefore === 'number' ? transaction.partialBefore : null,
      partialAfter: typeof transaction.partialAfter === 'number' ? transaction.partialAfter : null,
      referenceType: transaction.referenceType || REFERENCE_TYPE.MANUAL,
      referenceId: transaction.referenceId || null,
      referenceName: transaction.referenceName?.trim() || '',
      reason: transaction.reason?.trim() || '',
      notes: transaction.notes?.trim() || '',
      unitCost: typeof transaction.unitCost === 'number' ? transaction.unitCost : inventoryItem.currentPrice || 0,
      totalCost: typeof transaction.totalCost === 'number' ? transaction.totalCost : 0,
      location: transaction.location?.trim() || '',
      locationFrom: transaction.locationFrom?.trim() || '',
      locationTo: transaction.locationTo?.trim() || '',
      batchNumber: transaction.batchNumber?.trim() || '',
      expirationDate: transaction.expirationDate || null,
      createdAt: now,
      createdBy: transaction.createdBy || null,
      createdByName: transaction.createdByName?.trim() || '',
      isVoided: false,
      voidedAt: null,
      voidedBy: null,
      voidReason: ''
    };

    if (data.totalCost === 0 && data.quantityChange !== 0 && data.unitCost > 0) {
      data.totalCost = Math.round(Math.abs(data.quantityChange) * data.unitCost * 100) / 100;
    }

    if (data.stockAfter === 0 && data.stockBefore !== undefined) {
      data.stockAfter = data.stockBefore + data.quantityChange;
    }

    const id = await db.stockTransactions.add(data);

    const sync = await getCloudSync();
    sync.pushStockTransaction?.({ ...data, id });

    return id;
  },

  /**
   * Record a purchase transaction (stock received from vendor)
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantity - Quantity purchased (positive)
   * @param {Object} [options] - Purchase options
   * @param {number} [options.invoiceId] - Invoice ID reference
   * @param {number} [options.invoiceLineId] - Invoice line ID reference
   * @param {number} [options.unitCost=0] - Cost per unit
   * @param {number} [options.currentStock=0] - Current stock before purchase
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   */
  async recordPurchase(inventoryItemId, quantity, { invoiceId = null, invoiceLineId = null, unitCost = 0, currentStock = 0, createdBy = null } = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.PURCHASE,
      quantityChange: Math.abs(quantity),
      stockBefore: currentStock,
      stockAfter: currentStock + Math.abs(quantity),
      referenceType: invoiceLineId ? REFERENCE_TYPE.INVOICE_LINE : REFERENCE_TYPE.INVOICE,
      referenceId: invoiceLineId || invoiceId,
      referenceName: invoiceId ? `Invoice #${invoiceId}` : '',
      unitCost,
      createdBy
    });
  },

  /**
   * Record task usage (stock used for production)
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantity - Quantity used (positive, will be negated)
   * @param {Object} [options] - Usage options
   * @param {string} [options.taskId] - Task ID reference
   * @param {string} [options.recipeId] - Recipe ID reference
   * @param {string} [options.recipeName] - Recipe name for display
   * @param {number} [options.currentStock=0] - Current stock before usage
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   */
  async recordTaskUsage(inventoryItemId, quantity, { taskId = null, recipeId = null, recipeName = '', currentStock = 0, createdBy = null } = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.TASK_USAGE,
      quantityChange: -Math.abs(quantity),
      stockBefore: currentStock,
      stockAfter: currentStock - Math.abs(quantity),
      referenceType: taskId ? REFERENCE_TYPE.TASK : REFERENCE_TYPE.RECIPE,
      referenceId: taskId || recipeId,
      referenceName: recipeName || (recipeId ? `Recipe #${recipeId}` : ''),
      createdBy
    });
  },

  /**
   * Record a manual stock adjustment
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantityChange - Quantity change (+/-)
   * @param {string} reason - Reason for adjustment (required)
   * @param {Object} [options] - Adjustment options
   * @param {number} [options.currentStock=0] - Current stock before adjustment
   * @param {string} [options.notes] - Additional notes
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   * @throws {Error} If reason not provided
   */
  async recordAdjustment(inventoryItemId, quantityChange, reason, { currentStock = 0, notes = '', createdBy = null } = {}) {
    if (!reason?.trim()) {
      throw new Error('Reason is required for adjustments');
    }

    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.ADJUSTMENT,
      quantityChange,
      stockBefore: currentStock,
      stockAfter: currentStock + quantityChange,
      referenceType: REFERENCE_TYPE.MANUAL,
      reason,
      notes,
      createdBy
    });
  },

  /**
   * Record waste (spoilage, damage, expiration)
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantity - Quantity wasted (positive, will be negated)
   * @param {string} reason - Reason for waste (required)
   * @param {Object} [options] - Waste options
   * @param {number} [options.currentStock=0] - Current stock before waste
   * @param {string} [options.notes] - Additional notes
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   * @throws {Error} If reason not provided
   */
  async recordWaste(inventoryItemId, quantity, reason, { currentStock = 0, notes = '', createdBy = null } = {}) {
    if (!reason?.trim()) {
      throw new Error('Reason is required for waste records');
    }

    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.WASTE,
      quantityChange: -Math.abs(quantity),
      stockBefore: currentStock,
      stockAfter: currentStock - Math.abs(quantity),
      referenceType: REFERENCE_TYPE.MANUAL,
      reason,
      notes,
      createdBy
    });
  },

  /**
   * Record a location transfer (stock doesn't change, just location)
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantity - Quantity transferred
   * @param {string} fromLocation - Source location
   * @param {string} toLocation - Destination location
   * @param {Object} [options] - Transfer options
   * @param {number} [options.currentStock=0] - Current stock
   * @param {string} [options.notes] - Additional notes
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   */
  async recordTransfer(inventoryItemId, quantity, fromLocation, toLocation, { currentStock = 0, notes = '', createdBy = null } = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.TRANSFER,
      quantityChange: 0,
      stockBefore: currentStock,
      stockAfter: currentStock,
      referenceType: REFERENCE_TYPE.TRANSFER,
      locationFrom: fromLocation,
      locationTo: toLocation,
      notes,
      createdBy
    });
  },

  /**
   * Record a physical count correction
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} actualCount - Actual physical count
   * @param {number} expectedCount - Expected count (system stock)
   * @param {Object} [options] - Correction options
   * @param {string} [options.countSessionId] - Count session ID reference
   * @param {string} [options.notes] - Additional notes
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   */
  async recordCountCorrection(inventoryItemId, actualCount, expectedCount, { countSessionId = null, notes = '', createdBy = null } = {}) {
    const variance = actualCount - expectedCount;

    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.COUNT_CORRECTION,
      quantityChange: variance,
      stockBefore: expectedCount,
      stockAfter: actualCount,
      referenceType: REFERENCE_TYPE.COUNT,
      referenceId: countSessionId,
      reason: `Physical count correction: expected ${expectedCount}, actual ${actualCount}`,
      notes,
      createdBy
    });
  },

  /**
   * Record initial stock entry (when first adding an item)
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} quantity - Initial quantity
   * @param {Object} [options] - Initial stock options
   * @param {number} [options.unitCost=0] - Cost per unit
   * @param {string} [options.notes] - Additional notes
   * @param {string} [options.createdBy] - User ID
   * @returns {Promise<number>} Transaction ID
   */
  async recordInitialStock(inventoryItemId, quantity, { unitCost = 0, notes = '', createdBy = null } = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.INITIAL,
      quantityChange: quantity,
      stockBefore: 0,
      stockAfter: quantity,
      referenceType: REFERENCE_TYPE.MANUAL,
      unitCost,
      reason: 'Initial stock entry',
      notes,
      createdBy
    });
  },

  /**
   * Void a transaction (soft delete with audit trail)
   * @param {number} id - Transaction ID
   * @param {string} reason - Reason for voiding (required)
   * @param {string} [voidedBy=null] - User ID who voided
   * @returns {Promise<boolean>} True if voided
   * @throws {Error} If reason not provided, transaction not found, or already voided
   */
  async void(id, reason, voidedBy = null) {
    if (!reason?.trim()) {
      throw new Error('Reason is required to void a transaction');
    }

    const transaction = await this.getById(id);
    if (!transaction) {
      throw new Error(`Transaction with ID ${id} not found`);
    }

    if (transaction.isVoided) {
      throw new Error('Transaction is already voided');
    }

    await db.stockTransactions.update(id, {
      isVoided: true,
      voidedAt: new Date().toISOString(),
      voidedBy,
      voidReason: reason
    });

    const updated = await db.stockTransactions.get(id);
    if (updated) {
      const sync = await getCloudSync();
      sync.pushStockTransaction?.(updated);
    }

    return true;
  },

  /**
   * Get summary statistics for an inventory item
   * @param {number} inventoryItemId - Inventory item ID
   * @param {Object} [options] - Filter options
   * @param {string} [options.startDate] - Start date filter
   * @param {string} [options.endDate] - End date filter
   * @returns {Promise<Object>} Summary with totalIn, totalOut, netChange, byType, etc.
   */
  async getItemSummary(inventoryItemId, { startDate = null, endDate = null } = {}) {
    let transactions = await this.getByInventoryItem(inventoryItemId, { limit: 10000, includeVoided: false });

    if (startDate) transactions = transactions.filter(t => t.createdAt >= startDate);
    if (endDate) transactions = transactions.filter(t => t.createdAt <= endDate);

    const summary = {
      totalTransactions: transactions.length,
      totalIn: 0,
      totalOut: 0,
      netChange: 0,
      totalCost: 0,
      byType: {}
    };

    for (const type of Object.values(TRANSACTION_TYPE)) {
      summary.byType[type] = { count: 0, quantity: 0, cost: 0 };
    }

    for (const t of transactions) {
      const qty = t.quantityChange || 0;
      const cost = t.totalCost || 0;

      if (qty > 0) summary.totalIn += qty;
      else summary.totalOut += Math.abs(qty);
      summary.netChange += qty;
      summary.totalCost += cost;

      if (summary.byType[t.transactionType]) {
        summary.byType[t.transactionType].count++;
        summary.byType[t.transactionType].quantity += qty;
        summary.byType[t.transactionType].cost += cost;
      }
    }

    summary.currentStock = transactions.length > 0 ? transactions[0].stockAfter : 0;
    return summary;
  },

  /**
   * Get daily transaction summary
   * @param {string} date - Date (YYYY-MM-DD format)
   * @param {Object} [options] - Filter options
   * @param {number} [options.inventoryItemId] - Filter by item
   * @returns {Promise<Object>} Summary with transactionCount, itemsAffected, byType
   */
  async getDailySummary(date, { inventoryItemId = null } = {}) {
    const startDate = `${date}T00:00:00.000Z`;
    const endDate = `${date}T23:59:59.999Z`;

    const transactions = await this.getByDateRange(startDate, endDate, { inventoryItemId });

    const summary = {
      date,
      transactionCount: transactions.length,
      itemsAffected: new Set(transactions.map(t => t.inventoryItemId)).size,
      totalIn: 0,
      totalOut: 0,
      totalCost: 0,
      byType: {}
    };

    for (const type of Object.values(TRANSACTION_TYPE)) {
      summary.byType[type] = 0;
    }

    for (const t of transactions) {
      const qty = t.quantityChange || 0;
      if (qty > 0) summary.totalIn += qty;
      else summary.totalOut += Math.abs(qty);
      summary.totalCost += t.totalCost || 0;
      summary.byType[t.transactionType]++;
    }

    return summary;
  },

  /**
   * Get total transaction count
   * @returns {Promise<number>} Total number of transactions
   */
  async count() {
    return await db.stockTransactions.count();
  },

  /**
   * Clear all transactions (use with caution)
   * @returns {Promise<void>}
   */
  async clear() {
    await db.stockTransactions.clear();
  }
};

// ============================================
// Purchase Order Database
// ============================================

/**
 * Purchase Order Database
 * Manages purchase orders and their lifecycle
 */
export const purchaseOrderDB = {
  /**
   * Validate purchase order status
   * @param {string} status - Status to validate
   * @returns {boolean} True if valid
   */
  isValidStatus(status) {
    return Object.values(PO_STATUS).includes(status);
  },

  /**
   * Validate send method
   * @param {string} method - Method to validate
   * @returns {boolean} True if valid
   */
  isValidSendMethod(method) {
    return Object.values(PO_SEND_METHOD).includes(method);
  },

  /**
   * Generate a unique order number (PO-YYYY-NNN format)
   * @returns {Promise<string>} Generated order number
   */
  async generateOrderNumber() {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;

    const existingOrders = await db.purchaseOrders
      .where('orderNumber')
      .startsWith(prefix)
      .toArray();

    let maxNum = 0;
    for (const order of existingOrders) {
      const numPart = order.orderNumber.replace(prefix, '');
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${prefix}${nextNum}`;
  },

  /**
   * Get all purchase orders
   * @param {Object} [options] - Query options
   * @param {boolean} [options.includeAll=true] - Include cancelled orders
   * @returns {Promise<Array>} Purchase orders sorted by date (newest first)
   */
  async getAll({ includeAll = true } = {}) {
    let results = await db.purchaseOrders.orderBy('createdAt').reverse().toArray();
    if (!includeAll) {
      results = results.filter(po => po.status !== PO_STATUS.CANCELLED);
    }
    return results;
  },

  /**
   * Get purchase orders with pagination
   * @param {Object} [options] - Pagination options
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.pageSize=50] - Items per page
   * @param {string} [options.sortBy='createdAt'] - Sort field
   * @param {boolean} [options.sortDesc=true] - Sort descending
   * @param {string} [options.status] - Filter by status
   * @param {number} [options.vendorId] - Filter by vendor
   * @returns {Promise<{orders: Array, total: number, page: number, totalPages: number}>}
   */
  async getPaginated({ page = 1, pageSize = 50, sortBy = 'createdAt', sortDesc = true, status = null, vendorId = null } = {}) {
    let collection = db.purchaseOrders.toCollection();

    if (status) {
      collection = db.purchaseOrders.where('status').equals(status);
    } else if (vendorId) {
      collection = db.purchaseOrders.where('vendorId').equals(vendorId);
    }

    let results = await collection.toArray();

    if (status && vendorId) {
      results = results.filter(po => po.vendorId === vendorId);
    }

    results.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDesc ? -comparison : comparison;
    });

    const total = results.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    return {
      orders: results.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      totalPages
    };
  },

  async getById(id) {
    return await db.purchaseOrders.get(id);
  },

  async getByOrderNumber(orderNumber) {
    return await db.purchaseOrders
      .where('orderNumber')
      .equals(orderNumber)
      .first();
  },

  async getByVendor(vendorId) {
    return await db.purchaseOrders
      .where('vendorId')
      .equals(vendorId)
      .reverse()
      .sortBy('createdAt');
  },

  async getByStatus(status) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid PO status: ${status}`);
    }
    return await db.purchaseOrders
      .where('status')
      .equals(status)
      .reverse()
      .sortBy('createdAt');
  },

  async getPending() {
    const pendingStatuses = [PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED];
    return await db.purchaseOrders
      .filter(po => pendingStatuses.includes(po.status))
      .reverse()
      .sortBy('createdAt');
  },

  async getAwaitingDelivery() {
    const awaitingStatuses = [PO_STATUS.SENT, PO_STATUS.CONFIRMED, PO_STATUS.PARTIALLY_RECEIVED];
    return await db.purchaseOrders
      .filter(po => awaitingStatuses.includes(po.status))
      .sortBy('expectedDeliveryDate');
  },

  async getByDateRange(startDate, endDate) {
    return await db.purchaseOrders
      .where('createdAt')
      .between(startDate, endDate, true, true)
      .reverse()
      .toArray();
  },

  async create(order) {
    if (!order.vendorId) {
      throw new Error('Vendor ID is required');
    }

    const vendor = await db.vendors.get(order.vendorId);
    if (!vendor) {
      throw new Error(`Vendor with ID ${order.vendorId} not found`);
    }

    const now = new Date().toISOString();
    const orderNumber = order.orderNumber || await this.generateOrderNumber();

    const data = {
      orderNumber,
      vendorId: order.vendorId,
      vendorName: order.vendorName || vendor.name,
      status: order.status || PO_STATUS.DRAFT,
      createdAt: now,
      createdBy: order.createdBy || null,
      createdByName: order.createdByName?.trim() || '',
      approvedAt: order.approvedAt || null,
      approvedBy: order.approvedBy || null,
      approvedByName: order.approvedByName?.trim() || '',
      sentAt: order.sentAt || null,
      sentMethod: order.sentMethod || null,
      sentBy: order.sentBy || null,
      confirmedAt: order.confirmedAt || null,
      vendorConfirmationNumber: order.vendorConfirmationNumber?.trim() || '',
      expectedDeliveryDate: order.expectedDeliveryDate || null,
      receivedAt: order.receivedAt || null,
      subtotal: typeof order.subtotal === 'number' ? Math.round(order.subtotal * 100) / 100 : 0,
      taxGST: typeof order.taxGST === 'number' ? Math.round(order.taxGST * 100) / 100 : 0,
      taxQST: typeof order.taxQST === 'number' ? Math.round(order.taxQST * 100) / 100 : 0,
      taxOther: typeof order.taxOther === 'number' ? Math.round(order.taxOther * 100) / 100 : 0,
      total: typeof order.total === 'number' ? Math.round(order.total * 100) / 100 : 0,
      currency: order.currency || null,
      deliveryAddress: order.deliveryAddress?.trim() || '',
      deliveryInstructions: order.deliveryInstructions?.trim() || '',
      vendorNotes: order.vendorNotes?.trim() || '',
      internalNotes: order.internalNotes?.trim() || '',
      pdfUrl: order.pdfUrl || null,
      lineCount: order.lineCount || 0,
      updatedAt: now
    };

    const id = await db.purchaseOrders.add(data);

    const sync = await getCloudSync();
    sync.pushPurchaseOrder?.({ ...data, id });

    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }

    if (updates.status && !this.isValidStatus(updates.status)) {
      throw new Error(`Invalid PO status: ${updates.status}`);
    }

    const moneyFields = ['subtotal', 'taxGST', 'taxQST', 'taxOther', 'total'];
    for (const field of moneyFields) {
      if (typeof updates[field] === 'number') {
        updates[field] = Math.round(updates[field] * 100) / 100;
      }
    }

    const data = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.purchaseOrders.update(id, data);

    const updated = await db.purchaseOrders.get(id);
    if (updated) {
      const sync = await getCloudSync();
      sync.pushPurchaseOrder?.(updated);
    }

    return updated;
  },

  async submitForApproval(id) {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    if (order.status !== PO_STATUS.DRAFT) throw new Error('Only draft orders can be submitted for approval');
    return await this.update(id, { status: PO_STATUS.PENDING_APPROVAL });
  },

  async approve(id, approvedBy, approvedByName = '') {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    if (order.status !== PO_STATUS.PENDING_APPROVAL) throw new Error('Only pending orders can be approved');
    return await this.update(id, {
      status: PO_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedBy,
      approvedByName
    });
  },

  async markSent(id, sentMethod, sentBy = null) {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    if (![PO_STATUS.APPROVED, PO_STATUS.DRAFT].includes(order.status)) {
      throw new Error('Only approved or draft orders can be sent');
    }
    return await this.update(id, {
      status: PO_STATUS.SENT,
      sentAt: new Date().toISOString(),
      sentMethod,
      sentBy
    });
  },

  async recordConfirmation(id, confirmationNumber, expectedDeliveryDate = null) {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    return await this.update(id, {
      status: PO_STATUS.CONFIRMED,
      confirmedAt: new Date().toISOString(),
      vendorConfirmationNumber: confirmationNumber,
      expectedDeliveryDate: expectedDeliveryDate || order.expectedDeliveryDate
    });
  },

  async markPartiallyReceived(id) {
    return await this.update(id, { status: PO_STATUS.PARTIALLY_RECEIVED });
  },

  async markReceived(id) {
    return await this.update(id, {
      status: PO_STATUS.RECEIVED,
      receivedAt: new Date().toISOString()
    });
  },

  async cancel(id, reason = '') {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    if ([PO_STATUS.RECEIVED, PO_STATUS.CLOSED].includes(order.status)) {
      throw new Error('Cannot cancel received or closed orders');
    }
    return await this.update(id, {
      status: PO_STATUS.CANCELLED,
      internalNotes: order.internalNotes
        ? `${order.internalNotes}\n[Cancelled: ${reason}]`
        : `[Cancelled: ${reason}]`
    });
  },

  async close(id) {
    const order = await this.getById(id);
    if (!order) throw new Error(`Purchase order with ID ${id} not found`);
    if (order.status !== PO_STATUS.RECEIVED) throw new Error('Only received orders can be closed');
    return await this.update(id, { status: PO_STATUS.CLOSED });
  },

  async recalculateTotals(id) {
    const lines = await purchaseOrderLineDB.getByPurchaseOrder(id);

    const subtotal = lines.reduce((sum, line) => sum + (line.totalPrice || 0), 0);

    // Quebec compound tax rule: TVQ is calculated on (subtotal + TPS)
    // TPS (GST) = 5% of subtotal
    // TVQ (QST) = 9.975% of (subtotal + TPS)
    const taxGST = Math.round(subtotal * 0.05 * 100) / 100;
    const taxQST = Math.round((subtotal + taxGST) * 0.09975 * 100) / 100;
    const total = Math.round((subtotal + taxGST + taxQST) * 100) / 100;

    return await this.update(id, {
      subtotal: Math.round(subtotal * 100) / 100,
      taxGST,
      taxQST,
      total,
      lineCount: lines.length
    });
  },

  async getSummary({ startDate = null, endDate = null } = {}) {
    let orders = await this.getAll();

    if (startDate) orders = orders.filter(o => o.createdAt >= startDate);
    if (endDate) orders = orders.filter(o => o.createdAt <= endDate);

    const summary = {
      totalOrders: orders.length,
      totalValue: 0,
      byStatus: {},
      byVendor: {}
    };

    for (const status of Object.values(PO_STATUS)) {
      summary.byStatus[status] = { count: 0, value: 0 };
    }

    for (const order of orders) {
      summary.totalValue += order.total || 0;

      if (summary.byStatus[order.status]) {
        summary.byStatus[order.status].count++;
        summary.byStatus[order.status].value += order.total || 0;
      }

      if (!summary.byVendor[order.vendorId]) {
        summary.byVendor[order.vendorId] = { vendorName: order.vendorName, count: 0, value: 0 };
      }
      summary.byVendor[order.vendorId].count++;
      summary.byVendor[order.vendorId].value += order.total || 0;
    }

    summary.totalValue = Math.round(summary.totalValue * 100) / 100;
    return summary;
  },

  async delete(id) {
    await purchaseOrderLineDB.deleteByPurchaseOrder(id);
    await db.purchaseOrders.delete(id);
    return true;
  },

  async count() {
    return await db.purchaseOrders.count();
  },

  async clear() {
    await db.purchaseOrderLines.clear();
    await db.purchaseOrders.clear();
  }
};

// ============================================
// Purchase Order Line Database
// ============================================

export const purchaseOrderLineDB = {
  async getByPurchaseOrder(purchaseOrderId) {
    return await db.purchaseOrderLines
      .where('purchaseOrderId')
      .equals(purchaseOrderId)
      .sortBy('lineNumber');
  },

  async getById(id) {
    return await db.purchaseOrderLines.get(id);
  },

  async getByInventoryItem(inventoryItemId, { limit = 50 } = {}) {
    return await db.purchaseOrderLines
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .limit(limit)
      .sortBy('createdAt');
  },

  async getPendingByInventoryItem(inventoryItemId) {
    const lines = await this.getByInventoryItem(inventoryItemId, { limit: 100 });
    return lines.filter(line => (line.quantityReceived || 0) < line.quantity);
  },

  async getNextLineNumber(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);
    if (lines.length === 0) return 1;
    const maxLine = Math.max(...lines.map(l => l.lineNumber || 0));
    return maxLine + 1;
  },

  async create(line) {
    if (!line.purchaseOrderId) {
      throw new Error('Purchase order ID is required');
    }

    const po = await db.purchaseOrders.get(line.purchaseOrderId);
    if (!po) {
      throw new Error(`Purchase order with ID ${line.purchaseOrderId} not found`);
    }

    let inventoryItem = null;
    if (line.inventoryItemId) {
      inventoryItem = await db.inventoryItems.get(line.inventoryItemId);
      if (!inventoryItem) {
        throw new Error(`Inventory item with ID ${line.inventoryItemId} not found`);
      }
    }

    const now = new Date().toISOString();
    const lineNumber = line.lineNumber || await this.getNextLineNumber(line.purchaseOrderId);
    const quantity = typeof line.quantity === 'number' ? line.quantity : 1;
    const unitPrice = typeof line.unitPrice === 'number' ? Math.round(line.unitPrice * 100) / 100 : 0;
    const totalPrice = Math.round(quantity * unitPrice * 100) / 100;

    const data = {
      purchaseOrderId: line.purchaseOrderId,
      inventoryItemId: line.inventoryItemId || null,
      inventoryItemName: line.inventoryItemName || inventoryItem?.name || '',
      inventoryItemSku: line.inventoryItemSku || inventoryItem?.sku || '',
      lineNumber,
      quantity,
      unit: line.unit?.trim() || inventoryItem?.unit || 'ea',
      unitPrice,
      totalPrice,
      quantityReceived: typeof line.quantityReceived === 'number' ? line.quantityReceived : 0,
      receivedAt: line.receivedAt || null,
      receivedNotes: line.receivedNotes?.trim() || '',
      stockAtOrder: typeof line.stockAtOrder === 'number' ? line.stockAtOrder : null,
      suggestedQty: typeof line.suggestedQty === 'number' ? line.suggestedQty : null,
      notes: line.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    const id = await db.purchaseOrderLines.add(data);

    await purchaseOrderDB.recalculateTotals(line.purchaseOrderId);

    const sync = await getCloudSync();
    sync.pushPurchaseOrderLine?.({ ...data, id });

    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Purchase order line with ID ${id} not found`);
    }

    if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
      const quantity = typeof updates.quantity === 'number' ? updates.quantity : existing.quantity;
      const unitPrice = typeof updates.unitPrice === 'number'
        ? Math.round(updates.unitPrice * 100) / 100
        : existing.unitPrice;
      updates.totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    }

    const data = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.purchaseOrderLines.update(id, data);
    await purchaseOrderDB.recalculateTotals(existing.purchaseOrderId);

    const updated = await db.purchaseOrderLines.get(id);
    if (updated) {
      const sync = await getCloudSync();
      sync.pushPurchaseOrderLine?.(updated);
    }

    return updated;
  },

  async recordReceive(id, quantityReceived, notes = '') {
    const line = await this.getById(id);
    if (!line) {
      throw new Error(`Purchase order line with ID ${id} not found`);
    }

    const newTotal = (line.quantityReceived || 0) + quantityReceived;
    const receivedNotes = notes
      ? (line.receivedNotes ? `${line.receivedNotes}\n${notes}` : notes)
      : line.receivedNotes;

    return await this.update(id, {
      quantityReceived: newTotal,
      receivedAt: new Date().toISOString(),
      receivedNotes
    });
  },

  async isFullyReceived(id) {
    const line = await this.getById(id);
    if (!line) return false;
    return (line.quantityReceived || 0) >= line.quantity;
  },

  async getReceivingStatus(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);

    let total = 0, received = 0, partial = 0, pending = 0;

    for (const line of lines) {
      total++;
      const qtyReceived = line.quantityReceived || 0;
      if (qtyReceived >= line.quantity) received++;
      else if (qtyReceived > 0) partial++;
      else pending++;
    }

    return {
      total,
      received,
      partial,
      pending,
      isComplete: received === total && total > 0
    };
  },

  async bulkCreate(purchaseOrderId, lines) {
    const created = [];
    let lineNumber = await this.getNextLineNumber(purchaseOrderId);

    for (const line of lines) {
      const createdLine = await this.create({
        ...line,
        purchaseOrderId,
        lineNumber: lineNumber++
      });
      created.push(createdLine);
    }

    return created;
  },

  async delete(id) {
    const line = await this.getById(id);
    if (!line) return false;

    await db.purchaseOrderLines.delete(id);
    await purchaseOrderDB.recalculateTotals(line.purchaseOrderId);

    return true;
  },

  async deleteByPurchaseOrder(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);
    for (const line of lines) {
      await db.purchaseOrderLines.delete(line.id);
    }
    return lines.length;
  },

  async count() {
    return await db.purchaseOrderLines.count();
  },

  async clear() {
    await db.purchaseOrderLines.clear();
  }
};
