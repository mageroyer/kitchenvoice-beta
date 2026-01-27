/**
 * Invoice Database Module
 *
 * Handles invoices and invoice line items with status tracking.
 * Supports invoice lifecycle (draft → extracted → processed → archived)
 * and payment workflows (unpaid → partial → paid).
 *
 * @module services/database/invoiceDB
 */

import { db, getCloudSync } from './db.js';
import { inventoryItemDB } from './inventoryItemDB.js';

// ============================================
// Invoice Status Constants
// ============================================

/**
 * Invoice Status Enum
 * Defines all valid states an invoice can be in during its lifecycle
 */
export const INVOICE_STATUS = {
  DRAFT: 'draft',           // Just uploaded, no processing yet
  PENDING: 'pending',       // Awaiting OCR/AI extraction
  EXTRACTING: 'extracting', // Currently being processed by AI
  EXTRACTED: 'extracted',   // Data extracted, awaiting review
  REVIEWED: 'reviewed',     // User has reviewed extracted data
  PROCESSED: 'processed',   // Line items matched to inventory
  SENT_TO_QB: 'sent_to_qb', // Synced to QuickBooks
  ERROR: 'error',           // Processing failed
  ARCHIVED: 'archived'      // Completed and archived
};

/**
 * Payment Status Enum
 * Tracks the payment lifecycle of an invoice
 */
export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  DISPUTED: 'disputed',
  VOIDED: 'voided'
};

/**
 * Document Type Enum
 * Defines the source format of the invoice
 */
export const DOCUMENT_TYPE = {
  PDF: 'pdf',
  IMAGE: 'image',
  EMAIL: 'email',
  MANUAL: 'manual'
};

/**
 * Match Status Enum for Invoice Line Items
 * Defines the matching state for line items to inventory
 */
export const MATCH_STATUS = {
  UNMATCHED: 'unmatched',       // Not yet matched
  AUTO_MATCHED: 'auto_matched', // AI matched with confidence
  MANUAL_MATCHED: 'manual_matched', // User selected match
  NEW_ITEM: 'new_item',         // Created new inventory item
  SKIPPED: 'skipped',           // User skipped matching
  REJECTED: 'rejected',         // User rejected suggested match
  CONFIRMED: 'confirmed'        // Match confirmed by user
};

// ============================================
// Invoice Database
// ============================================

/**
 * Invoice Database
 * Handles invoice CRUD, status tracking, and payment workflows
 */
export const invoiceDB = {
  /**
   * Validate invoice status
   * @param {string} status - Status to validate
   * @returns {boolean} True if valid invoice status
   */
  isValidStatus(status) {
    return Object.values(INVOICE_STATUS).includes(status);
  },

  /**
   * Validate payment status
   * @param {string} status - Status to validate
   * @returns {boolean} True if valid payment status
   */
  isValidPaymentStatus(status) {
    return Object.values(PAYMENT_STATUS).includes(status);
  },

  /**
   * Get all invoices ordered by date (newest first)
   * @returns {Promise<Array>} Array of invoices
   */
  async getAll() {
    return await db.invoices.orderBy('invoiceDate').reverse().toArray();
  },

  /**
   * Get invoices with pagination
   * @param {Object} options - Pagination options
   * @param {number} [options.page=1] - Page number (1-based)
   * @param {number} [options.pageSize=50] - Items per page
   * @param {string} [options.sortBy='invoiceDate'] - Field to sort by
   * @param {boolean} [options.sortDesc=true] - Sort descending
   * @returns {Promise<{invoices: Array, total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async getPaginated({ page = 1, pageSize = 50, sortBy = 'invoiceDate', sortDesc = true } = {}) {
    const total = await db.invoices.count();
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    let collection = db.invoices.orderBy(sortBy);
    if (sortDesc) {
      collection = collection.reverse();
    }

    const invoices = await collection
      .offset(offset)
      .limit(pageSize)
      .toArray();

    return {
      invoices,
      total,
      page,
      pageSize,
      totalPages
    };
  },

  /**
   * Get invoice by ID
   * @param {number} id - Invoice ID
   * @returns {Promise<Object|undefined>} Invoice or undefined if not found
   */
  async getById(id) {
    return await db.invoices.get(id);
  },

  /**
   * Get invoices by vendor
   * @param {number} vendorId - Vendor ID
   * @returns {Promise<Array>} Invoices for the vendor, sorted by date
   */
  async getByVendor(vendorId) {
    return await db.invoices
      .where('vendorId')
      .equals(vendorId)
      .reverse()
      .sortBy('invoiceDate');
  },

  /**
   * Get invoices by status
   * @param {string} status - Invoice status from INVOICE_STATUS
   * @returns {Promise<Array>} Invoices with the given status
   * @throws {Error} If status is invalid
   */
  async getByStatus(status) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid invoice status: ${status}`);
    }
    return await db.invoices
      .where('status')
      .equals(status)
      .reverse()
      .sortBy('invoiceDate');
  },

  /**
   * Get invoices by payment status
   * @param {string} paymentStatus - Payment status from PAYMENT_STATUS
   * @returns {Promise<Array>} Invoices with the given payment status
   * @throws {Error} If payment status is invalid
   */
  async getByPaymentStatus(paymentStatus) {
    if (!this.isValidPaymentStatus(paymentStatus)) {
      throw new Error(`Invalid payment status: ${paymentStatus}`);
    }
    return await db.invoices
      .where('paymentStatus')
      .equals(paymentStatus)
      .toArray();
  },

  /**
   * Get pending invoices (not yet processed)
   * Includes: draft, pending, extracting, extracted statuses
   * @returns {Promise<Array>} Pending invoices sorted by creation date
   */
  async getPending() {
    const pendingStatuses = [INVOICE_STATUS.DRAFT, INVOICE_STATUS.PENDING, INVOICE_STATUS.EXTRACTING, INVOICE_STATUS.EXTRACTED];
    return await db.invoices
      .filter(inv => pendingStatuses.includes(inv.status))
      .reverse()
      .sortBy('createdAt');
  },

  /**
   * Get invoices needing review (status = EXTRACTED)
   * @returns {Promise<Array>} Invoices awaiting user review
   */
  async getNeedingReview() {
    return await db.invoices
      .where('status')
      .equals(INVOICE_STATUS.EXTRACTED)
      .reverse()
      .sortBy('createdAt');
  },

  /**
   * Get overdue invoices (unpaid and past due date)
   * @returns {Promise<Array>} Overdue invoices
   */
  async getOverdue() {
    const today = new Date().toISOString().split('T')[0];
    return await db.invoices
      .filter(inv =>
        inv.paymentStatus === PAYMENT_STATUS.UNPAID &&
        inv.dueDate &&
        inv.dueDate < today
      )
      .toArray();
  },

  /**
   * Get invoices by date range
   * @param {string} startDate - Start date (ISO format, e.g., "2025-01-01")
   * @param {string} endDate - End date (ISO format, e.g., "2025-12-31")
   * @returns {Promise<Array>} Invoices within the date range
   */
  async getByDateRange(startDate, endDate) {
    return await db.invoices
      .where('invoiceDate')
      .between(startDate, endDate, true, true)
      .reverse()
      .toArray();
  },

  /**
   * Create a new invoice
   * @param {Object} invoice - Invoice data
   * @param {number} [invoice.vendorId] - Vendor ID
   * @param {string} [invoice.vendorName] - Vendor display name
   * @param {string} [invoice.invoiceNumber] - Invoice number
   * @param {string} [invoice.invoiceDate] - Invoice date (ISO format)
   * @param {string} [invoice.status] - Invoice status
   * @param {number} [invoice.total] - Total amount
   * @returns {Promise<number>} Created invoice ID
   * @throws {Error} If status or payment status is invalid
   */
  async create(invoice) {
    // Validate status if provided
    if (invoice.status && !this.isValidStatus(invoice.status)) {
      throw new Error(`Invalid invoice status: ${invoice.status}`);
    }
    if (invoice.paymentStatus && !this.isValidPaymentStatus(invoice.paymentStatus)) {
      throw new Error(`Invalid payment status: ${invoice.paymentStatus}`);
    }

    const now = new Date().toISOString();

    const data = {
      // Vendor reference
      vendorId: invoice.vendorId || null,
      vendorName: invoice.vendorName?.trim() || '',

      // Invoice identification
      invoiceNumber: invoice.invoiceNumber?.trim() || '',
      invoiceDate: invoice.invoiceDate || now.split('T')[0],
      receivedDate: invoice.receivedDate || now.split('T')[0],
      dueDate: invoice.dueDate || null,

      // Status tracking
      status: invoice.status || INVOICE_STATUS.DRAFT,
      paymentStatus: invoice.paymentStatus || PAYMENT_STATUS.UNPAID,

      // Document info
      documentType: invoice.documentType || DOCUMENT_TYPE.PDF,
      documentUrl: invoice.documentUrl || null,
      thumbnailUrl: invoice.thumbnailUrl || null,
      rawText: invoice.rawText || '',

      // Financial totals
      subtotal: typeof invoice.subtotal === 'number' ? Math.round(invoice.subtotal * 100) / 100 : 0,
      taxGST: typeof invoice.taxGST === 'number' ? Math.round(invoice.taxGST * 100) / 100 : 0,
      taxQST: typeof invoice.taxQST === 'number' ? Math.round(invoice.taxQST * 100) / 100 : 0,
      taxOther: typeof invoice.taxOther === 'number' ? Math.round(invoice.taxOther * 100) / 100 : 0,
      total: typeof invoice.total === 'number' ? Math.round(invoice.total * 100) / 100 : 0,
      currency: invoice.currency || 'CAD',

      // Payment tracking
      amountPaid: typeof invoice.amountPaid === 'number' ? Math.round(invoice.amountPaid * 100) / 100 : 0,
      paymentDate: invoice.paymentDate || null,
      paymentMethod: invoice.paymentMethod || null,
      paymentReference: invoice.paymentReference || null,

      // QuickBooks integration
      qbInvoiceId: invoice.qbInvoiceId || null,
      qbSyncedAt: invoice.qbSyncedAt || null,
      qbSyncStatus: invoice.qbSyncStatus || null,
      qbError: invoice.qbError || null,

      // Processing metadata
      extractedBy: invoice.extractedBy || null,
      extractedAt: invoice.extractedAt || null,
      extractionConfidence: typeof invoice.extractionConfidence === 'number' ? invoice.extractionConfidence : null,
      reviewedBy: invoice.reviewedBy || null,
      reviewedAt: invoice.reviewedAt || null,
      processedBy: invoice.processedBy || null,
      processedAt: invoice.processedAt || null,

      // Notes and metadata
      notes: invoice.notes?.trim() || '',
      tags: Array.isArray(invoice.tags) ? invoice.tags : [],
      lineCount: invoice.lineCount || 0,

      // Timestamps
      createdAt: now,
      updatedAt: now,
      createdBy: invoice.createdBy || null
    };

    const id = await db.invoices.add(data);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushInvoice?.({ ...data, id });

    return id;
  },

  /**
   * Update an invoice
   * @param {number} id - Invoice ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} True if updated
   * @throws {Error} If status or payment status is invalid
   */
  async update(id, updates) {
    // Validate status if being changed
    if (updates.status && !this.isValidStatus(updates.status)) {
      throw new Error(`Invalid invoice status: ${updates.status}`);
    }
    if (updates.paymentStatus && !this.isValidPaymentStatus(updates.paymentStatus)) {
      throw new Error(`Invalid payment status: ${updates.paymentStatus}`);
    }

    // Round money values
    const moneyFields = ['subtotal', 'taxGST', 'taxQST', 'taxOther', 'total', 'amountPaid'];
    for (const field of moneyFields) {
      if (typeof updates[field] === 'number') {
        updates[field] = Math.round(updates[field] * 100) / 100;
      }
    }

    const data = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.invoices.update(id, data);

    // Auto-sync to cloud
    const invoice = await db.invoices.get(id);
    if (invoice) {
      const sync = await getCloudSync();
      sync.pushInvoice?.(invoice);
    }

    return true;
  },

  /**
   * Update invoice status with automatic timestamp tracking
   * @param {number} id - Invoice ID
   * @param {string} status - New status from INVOICE_STATUS
   * @param {Object} [metadata={}] - Additional metadata to update
   * @returns {Promise<boolean>} True if updated
   * @throws {Error} If status is invalid
   */
  async updateStatus(id, status, metadata = {}) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid invoice status: ${status}`);
    }

    const now = new Date().toISOString();
    const updates = { status, ...metadata };

    // Add timestamp for specific status changes
    if (status === INVOICE_STATUS.EXTRACTED) {
      updates.extractedAt = now;
    } else if (status === INVOICE_STATUS.REVIEWED) {
      updates.reviewedAt = now;
    } else if (status === INVOICE_STATUS.PROCESSED) {
      updates.processedAt = now;
    } else if (status === INVOICE_STATUS.SENT_TO_QB) {
      updates.qbSyncedAt = now;
    }

    return await this.update(id, updates);
  },

  /**
   * Record payment for an invoice
   * Updates amountPaid and payment status automatically
   * @param {number} id - Invoice ID
   * @param {number} amount - Payment amount
   * @param {Object} [options] - Payment options
   * @param {string} [options.method] - Payment method
   * @param {string} [options.reference] - Payment reference number
   * @param {string} [options.date] - Payment date (ISO format)
   * @returns {Promise<boolean>} True if updated
   * @throws {Error} If invoice not found
   */
  async recordPayment(id, amount, { method = null, reference = null, date = null } = {}) {
    const invoice = await this.getById(id);
    if (!invoice) {
      throw new Error(`Invoice with ID ${id} not found`);
    }

    const newAmountPaid = (invoice.amountPaid || 0) + amount;
    const paymentStatus = newAmountPaid >= invoice.total
      ? PAYMENT_STATUS.PAID
      : newAmountPaid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID;

    return await this.update(id, {
      amountPaid: newAmountPaid,
      paymentStatus,
      paymentDate: date || new Date().toISOString().split('T')[0],
      paymentMethod: method,
      paymentReference: reference
    });
  },

  /**
   * Delete invoice and its line items
   * @param {number} id - Invoice ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id) {
    // Delete line items first
    await invoiceLineDB.deleteByInvoice(id);

    await db.invoices.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteInvoiceFromCloud?.(id);

    return true;
  },

  /**
   * Get total invoice count
   * @returns {Promise<number>} Total number of invoices
   */
  async count() {
    return await db.invoices.count();
  },

  /**
   * Get count by status
   * @param {string} status - Invoice status
   * @returns {Promise<number>} Number of invoices with the status
   */
  async countByStatus(status) {
    return await db.invoices
      .where('status')
      .equals(status)
      .count();
  },

  /**
   * Get summary statistics for invoices
   * @param {Object} [options] - Filter options
   * @param {string} [options.startDate] - Start date filter
   * @param {string} [options.endDate] - End date filter
   * @returns {Promise<Object>} Summary with totalInvoices, totalAmount, byStatus, byPaymentStatus, byVendor
   */
  async getSummary({ startDate = null, endDate = null } = {}) {
    let invoices = await this.getAll();

    if (startDate) {
      invoices = invoices.filter(i => i.invoiceDate >= startDate);
    }
    if (endDate) {
      invoices = invoices.filter(i => i.invoiceDate <= endDate);
    }

    const summary = {
      totalInvoices: invoices.length,
      totalAmount: 0,
      totalPaid: 0,
      totalUnpaid: 0,
      byStatus: {},
      byPaymentStatus: {},
      byVendor: {}
    };

    for (const status of Object.values(INVOICE_STATUS)) {
      summary.byStatus[status] = { count: 0, amount: 0 };
    }
    for (const status of Object.values(PAYMENT_STATUS)) {
      summary.byPaymentStatus[status] = { count: 0, amount: 0 };
    }

    for (const inv of invoices) {
      summary.totalAmount += inv.total || 0;
      summary.totalPaid += inv.amountPaid || 0;

      if (summary.byStatus[inv.status]) {
        summary.byStatus[inv.status].count++;
        summary.byStatus[inv.status].amount += inv.total || 0;
      }
      if (summary.byPaymentStatus[inv.paymentStatus]) {
        summary.byPaymentStatus[inv.paymentStatus].count++;
        summary.byPaymentStatus[inv.paymentStatus].amount += inv.total || 0;
      }

      if (inv.vendorId) {
        if (!summary.byVendor[inv.vendorId]) {
          summary.byVendor[inv.vendorId] = { vendorName: inv.vendorName, count: 0, amount: 0 };
        }
        summary.byVendor[inv.vendorId].count++;
        summary.byVendor[inv.vendorId].amount += inv.total || 0;
      }
    }

    summary.totalUnpaid = summary.totalAmount - summary.totalPaid;

    return summary;
  },

  async clear() {
    await db.invoiceLineItems.clear();
    await db.invoices.clear();
  },

  /**
   * Find invoices by invoice number (uses index for O(1) lookup)
   * @param {string} invoiceNumber - Invoice number to search
   * @returns {Promise<Array>} Invoices with matching invoice number
   */
  async findByInvoiceNumber(invoiceNumber) {
    if (!invoiceNumber) return [];
    return await db.invoices
      .where('invoiceNumber')
      .equals(invoiceNumber)
      .toArray();
  },

  /**
   * Check for duplicate invoice (optimized with indexed query)
   * Uses invoiceNumber index to narrow down, then filters by vendor.
   * Much faster than full table scan for large databases.
   *
   * @param {string} vendorName - Vendor name
   * @param {string} invoiceNumber - Invoice number
   * @returns {Promise<{isDuplicate: boolean, existingInvoice: Object|null}>}
   */
  async checkDuplicate(vendorName, invoiceNumber) {
    if (!invoiceNumber) {
      return { isDuplicate: false, existingInvoice: null };
    }

    // Use indexed query on invoiceNumber (O(1) instead of O(n))
    const candidates = await db.invoices
      .where('invoiceNumber')
      .equalsIgnoreCase(invoiceNumber)
      .toArray();

    // Filter by vendor name (small set after index lookup)
    const vendorLower = vendorName?.toLowerCase() || '';
    const duplicate = candidates.find(inv =>
      inv.vendorName?.toLowerCase() === vendorLower
    );

    if (duplicate) {
      return {
        isDuplicate: true,
        existingInvoice: {
          id: duplicate.id,
          invoiceNumber: duplicate.invoiceNumber,
          vendorName: duplicate.vendorName,
          invoiceDate: duplicate.invoiceDate,
          total: duplicate.total,
          createdAt: duplicate.createdAt,
        }
      };
    }

    return { isDuplicate: false, existingInvoice: null };
  }
};

// ============================================
// Invoice Line Item Database
// ============================================

/**
 * Invoice Line Item Database
 * Handles individual line items with inventory linking and matching workflow
 */
export const invoiceLineDB = {
  /**
   * Validate match status
   * @param {string} status - Status to validate
   * @returns {boolean} True if valid match status
   */
  isValidMatchStatus(status) {
    return Object.values(MATCH_STATUS).includes(status);
  },

  /**
   * Get all line items for an invoice
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<Array>} Line items sorted by line number
   */
  async getByInvoice(invoiceId) {
    return await db.invoiceLineItems
      .where('invoiceId')
      .equals(invoiceId)
      .sortBy('lineNumber');
  },

  /**
   * Get all line items for an inventory item (purchase history)
   * @param {number} inventoryItemId - Inventory item ID
   * @returns {Promise<Array>} Line items sorted by date (newest first)
   */
  async getByInventoryItem(inventoryItemId) {
    return await db.invoiceLineItems
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .sortBy('createdAt');
  },

  /**
   * Get line item by ID
   * @param {number} id - Line item ID
   * @returns {Promise<Object|undefined>} Line item or undefined
   */
  async getById(id) {
    return await db.invoiceLineItems.get(id);
  },

  /**
   * Get line item by invoice and line number (compound index)
   * @param {number} invoiceId - Invoice ID
   * @param {number} lineNumber - Line number within invoice
   * @returns {Promise<Object|undefined>} Line item or undefined
   */
  async getByInvoiceAndLine(invoiceId, lineNumber) {
    return await db.invoiceLineItems
      .where('[invoiceId+lineNumber]')
      .equals([invoiceId, lineNumber])
      .first();
  },

  /**
   * Get line items by match status
   * @param {string} matchStatus - Match status from MATCH_STATUS
   * @returns {Promise<Array>} Line items with the given match status
   * @throws {Error} If match status is invalid
   */
  async getByMatchStatus(matchStatus) {
    if (!this.isValidMatchStatus(matchStatus)) {
      throw new Error(`Invalid match status: ${matchStatus}`);
    }
    return await db.invoiceLineItems
      .where('matchStatus')
      .equals(matchStatus)
      .toArray();
  },

  /**
   * Get unmatched line items across all invoices
   * @returns {Promise<Array>} Line items that need inventory linking
   */
  async getUnmatched() {
    return await db.invoiceLineItems
      .where('matchStatus')
      .equals(MATCH_STATUS.UNMATCHED)
      .toArray();
  },

  /**
   * Get line items flagged with discrepancies
   * @returns {Promise<Array>} Line items needing review
   */
  async getDiscrepancies() {
    return await db.invoiceLineItems
      .filter(item => item.isDiscrepancy === true)
      .toArray();
  },

  /**
   * Create a new line item
   * @param {Object} lineItem - Line item data
   * @param {number} lineItem.invoiceId - Parent invoice ID (required)
   * @param {number} [lineItem.inventoryItemId] - Linked inventory item ID
   * @param {string} [lineItem.rawDescription] - Raw OCR description
   * @param {number} [lineItem.quantity] - Parsed quantity
   * @param {number} [lineItem.unitPrice] - Parsed unit price
   * @param {number} [lineItem.totalPrice] - Calculated total
   * @param {string} [lineItem.matchStatus] - Match status
   * @returns {Promise<number>} Created line item ID
   * @throws {Error} If invoice ID not provided or match status invalid
   */
  async create(lineItem) {
    if (!lineItem.invoiceId) {
      throw new Error('Invoice ID is required');
    }

    if (lineItem.matchStatus && !this.isValidMatchStatus(lineItem.matchStatus)) {
      throw new Error(`Invalid match status: ${lineItem.matchStatus}`);
    }

    const now = new Date().toISOString();

    let lineNumber = lineItem.lineNumber;
    if (!lineNumber) {
      const existingLines = await this.getByInvoice(lineItem.invoiceId);
      lineNumber = existingLines.length + 1;
    }

    const data = {
      invoiceId: lineItem.invoiceId,
      inventoryItemId: lineItem.inventoryItemId || null,
      lineNumber,

      // Raw OCR data
      rawDescription: lineItem.rawDescription?.trim() || '',
      rawQuantity: lineItem.rawQuantity?.trim() || '',
      rawUnitPrice: lineItem.rawUnitPrice?.trim() || '',
      rawTotal: lineItem.rawTotal?.trim() || '',
      rawUnit: lineItem.rawUnit?.trim() || '',
      rawSku: lineItem.rawSku?.trim() || '',

      // Parsed data
      description: lineItem.description?.trim() || lineItem.rawDescription?.trim() || '',
      quantity: typeof lineItem.quantity === 'number' ? lineItem.quantity : 0,
      unit: lineItem.unit?.trim() || '',
      unitPrice: typeof lineItem.unitPrice === 'number' ? lineItem.unitPrice : 0,
      totalPrice: typeof lineItem.totalPrice === 'number' ? lineItem.totalPrice : 0,
      sku: lineItem.sku?.trim() || '',

      // Normalized price for cost calculations (price per gram or per ml)
      pricePerG: typeof lineItem.pricePerG === 'number' ? lineItem.pricePerG : null,
      pricePerML: typeof lineItem.pricePerML === 'number' ? lineItem.pricePerML : null,
      totalBaseUnits: typeof lineItem.totalBaseUnits === 'number' ? lineItem.totalBaseUnits : null,
      baseUnit: lineItem.baseUnit || null,

      // Matching workflow
      matchStatus: lineItem.matchStatus || MATCH_STATUS.UNMATCHED,
      matchConfidence: typeof lineItem.matchConfidence === 'number' ? lineItem.matchConfidence : 0,
      matchedBy: lineItem.matchedBy || null,
      matchedAt: lineItem.matchedAt || null,
      matchNotes: lineItem.matchNotes?.trim() || '',
      matchCandidates: Array.isArray(lineItem.matchCandidates) ? lineItem.matchCandidates : [],

      // Inventory update tracking
      addedToInventory: lineItem.addedToInventory === true,
      addedToInventoryAt: lineItem.addedToInventoryAt || null,
      addedToInventoryBy: lineItem.addedToInventoryBy || null,
      previousPrice: typeof lineItem.previousPrice === 'number' ? lineItem.previousPrice : null,
      newPrice: typeof lineItem.newPrice === 'number' ? lineItem.newPrice : null,
      previousStock: typeof lineItem.previousStock === 'number' ? lineItem.previousStock : null,
      newStock: typeof lineItem.newStock === 'number' ? lineItem.newStock : null,

      // Metadata
      notes: lineItem.notes?.trim() || '',
      category: lineItem.category?.trim() || '',
      isDiscrepancy: lineItem.isDiscrepancy === true,
      discrepancyNotes: lineItem.discrepancyNotes?.trim() || '',

      // Routing flags (for QuickBooks/Inventory flow)
      lineType: lineItem.lineType || 'product',
      forInventory: lineItem.forInventory ?? true,
      forAccounting: lineItem.forAccounting ?? true,
      isDeposit: lineItem.isDeposit ?? false,

      createdAt: now,
      updatedAt: now
    };

    // Calculate totalPrice if not provided
    if (data.totalPrice === 0 && data.quantity > 0 && data.unitPrice > 0) {
      data.totalPrice = Math.round(data.quantity * data.unitPrice * 100) / 100;
    }

    const id = await db.invoiceLineItems.add(data);

    const sync = await getCloudSync();
    sync.pushInvoiceLineItem?.({ ...data, id });

    return id;
  },

  /**
   * Bulk create line items for an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {Array<Object>} lineItems - Array of line item data
   * @returns {Promise<Array<number>>} Array of created line item IDs
   */
  async bulkCreate(invoiceId, lineItems) {
    const ids = [];
    for (let i = 0; i < lineItems.length; i++) {
      const id = await this.create({
        ...lineItems[i],
        invoiceId,
        lineNumber: i + 1
      });
      ids.push(id);
    }
    return ids;
  },

  /**
   * Update a line item
   * @param {number} id - Line item ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} True if updated
   * @throws {Error} If match status is invalid
   */
  async update(id, updates) {
    if (updates.matchStatus && !this.isValidMatchStatus(updates.matchStatus)) {
      throw new Error(`Invalid match status: ${updates.matchStatus}`);
    }

    const data = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await db.invoiceLineItems.update(id, data);

    const lineItem = await db.invoiceLineItems.get(id);
    if (lineItem) {
      const sync = await getCloudSync();
      sync.pushInvoiceLineItem?.(lineItem);
    }

    return true;
  },

  /**
   * Set match for a line item (link to inventory item)
   * @param {number} id - Line item ID
   * @param {number} inventoryItemId - Inventory item ID to link
   * @param {Object} [options] - Match options
   * @param {number} [options.confidence=100] - Match confidence 0-100
   * @param {string} [options.matchedBy='user'] - 'user' or 'ai'
   * @param {string} [options.notes=''] - Match notes
   * @returns {Promise<boolean>} True if updated
   */
  async setMatch(id, inventoryItemId, { confidence = 100, matchedBy = 'user', notes = '' } = {}) {
    const matchStatus = matchedBy === 'ai' ? MATCH_STATUS.AUTO_MATCHED : MATCH_STATUS.MANUAL_MATCHED;

    return await this.update(id, {
      inventoryItemId,
      matchStatus,
      matchConfidence: confidence,
      matchedBy,
      matchedAt: new Date().toISOString(),
      matchNotes: notes
    });
  },

  /**
   * Confirm a match and optionally update inventory price/stock
   * @param {number} id - Line item ID
   * @param {Object} [options] - Confirmation options
   * @param {boolean} [options.updateInventory=true] - Update inventory price
   * @param {string} [options.confirmedBy=null] - User who confirmed
   * @returns {Promise<boolean>} True if updated
   * @throws {Error} If line item not found or no inventory item linked
   */
  async confirmMatch(id, { updateInventory = true, confirmedBy = null } = {}) {
    const lineItem = await this.getById(id);
    if (!lineItem) {
      throw new Error(`Line item with ID ${id} not found`);
    }

    if (!lineItem.inventoryItemId) {
      throw new Error('Cannot confirm match: no inventory item linked');
    }

    const updates = {
      matchStatus: MATCH_STATUS.CONFIRMED,
      matchedBy: confirmedBy || lineItem.matchedBy,
      matchedAt: new Date().toISOString()
    };

    if (updateInventory) {
      const invItem = await db.inventoryItems.get(lineItem.inventoryItemId);
      if (invItem) {
        updates.previousPrice = invItem.currentPrice;
        updates.newPrice = lineItem.unitPrice;
        updates.addedToInventory = true;
        updates.addedToInventoryAt = new Date().toISOString();
        updates.addedToInventoryBy = confirmedBy;

        // Check for price discrepancy
        if (invItem.currentPrice > 0) {
          const priceDiff = Math.abs(lineItem.unitPrice - invItem.currentPrice);
          const percentDiff = (priceDiff / invItem.currentPrice) * 100;
          if (percentDiff > 10) {
            updates.isDiscrepancy = true;
            updates.discrepancyNotes = `Price changed ${percentDiff.toFixed(1)}% from $${invItem.currentPrice.toFixed(2)} to $${lineItem.unitPrice.toFixed(2)}`;
          }
        }

        await inventoryItemDB.updatePriceFromInvoice(
          lineItem.inventoryItemId,
          lineItem.unitPrice,
          {
            quantity: lineItem.quantity,
            invoiceId: lineItem.invoiceId
          }
        );
      }
    }

    return await this.update(id, updates);
  },

  /**
   * Create new inventory item from unmatched line
   * @param {number} id - Line item ID
   * @param {Object} [itemData={}] - Additional inventory item data
   * @param {string} [createdBy=null] - User who created
   * @returns {Promise<{lineItemId: number, inventoryItemId: number}>} Created IDs
   * @throws {Error} If line item not found
   */
  async createInventoryItemFromLine(id, itemData = {}, createdBy = null) {
    const lineItem = await this.getById(id);
    if (!lineItem) {
      throw new Error(`Line item with ID ${id} not found`);
    }

    const invoice = await db.invoices.get(lineItem.invoiceId);

    const inventoryItemId = await inventoryItemDB.create({
      name: lineItem.description || lineItem.rawDescription,
      sku: lineItem.sku || lineItem.rawSku,
      unit: lineItem.unit || lineItem.rawUnit,
      currentPrice: lineItem.unitPrice,
      vendorId: invoice?.vendorId || null,
      vendorName: invoice?.vendorName || '',
      category: lineItem.category || itemData.category || 'Other',
      lastPurchaseDate: invoice?.invoiceDate || new Date().toISOString(),
      lastInvoiceId: lineItem.invoiceId,
      purchaseCount: 1,
      totalQuantityPurchased: lineItem.quantity,
      totalSpent: lineItem.totalPrice,
      createdBy,
      ...itemData
    });

    await this.update(id, {
      inventoryItemId,
      matchStatus: MATCH_STATUS.NEW_ITEM,
      matchedBy: createdBy || 'user',
      matchedAt: new Date().toISOString(),
      addedToInventory: true,
      addedToInventoryAt: new Date().toISOString(),
      addedToInventoryBy: createdBy,
      newPrice: lineItem.unitPrice
    });

    return { lineItemId: id, inventoryItemId };
  },

  /**
   * Skip matching for a line item (won't be added to inventory)
   * @param {number} id - Line item ID
   * @param {string} [reason=''] - Reason for skipping
   * @returns {Promise<boolean>} True if updated
   */
  async skipMatch(id, reason = '') {
    return await this.update(id, {
      matchStatus: MATCH_STATUS.SKIPPED,
      matchNotes: reason,
      matchedAt: new Date().toISOString()
    });
  },

  /**
   * Reject a match (clear inventory link, mark as rejected)
   * @param {number} id - Line item ID
   * @param {string} [reason=''] - Reason for rejection
   * @returns {Promise<boolean>} True if updated
   */
  async rejectMatch(id, reason = '') {
    return await this.update(id, {
      matchStatus: MATCH_STATUS.REJECTED,
      inventoryItemId: null,
      matchNotes: reason,
      matchedAt: new Date().toISOString()
    });
  },

  /**
   * Flag line item as discrepancy for review
   * @param {number} id - Line item ID
   * @param {string} [notes=''] - Discrepancy notes
   * @returns {Promise<boolean>} True if updated
   */
  async flagDiscrepancy(id, notes = '') {
    return await this.update(id, {
      isDiscrepancy: true,
      discrepancyNotes: notes
    });
  },

  /**
   * Delete a line item
   * @param {number} id - Line item ID
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(id) {
    await db.invoiceLineItems.delete(id);

    const sync = await getCloudSync();
    sync.deleteInvoiceLineItemFromCloud?.(id);

    return true;
  },

  /**
   * Delete all line items for an invoice
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<number>} Number of items deleted
   */
  async deleteByInvoice(invoiceId) {
    const items = await this.getByInvoice(invoiceId);
    for (const item of items) {
      await this.delete(item.id);
    }
    return items.length;
  },

  /**
   * Get summary statistics for an invoice's line items
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<Object>} Summary with totalLines, totalAmount, matchedCount, etc.
   */
  async getInvoiceSummary(invoiceId) {
    const items = await this.getByInvoice(invoiceId);

    const summary = {
      totalLines: items.length,
      totalAmount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      newItemCount: 0,
      skippedCount: 0,
      discrepancyCount: 0,
      byStatus: {}
    };

    for (const status of Object.values(MATCH_STATUS)) {
      summary.byStatus[status] = 0;
    }

    for (const item of items) {
      summary.totalAmount += item.totalPrice || 0;
      summary.byStatus[item.matchStatus] = (summary.byStatus[item.matchStatus] || 0) + 1;

      if ([MATCH_STATUS.CONFIRMED, MATCH_STATUS.AUTO_MATCHED, MATCH_STATUS.MANUAL_MATCHED].includes(item.matchStatus)) {
        summary.matchedCount++;
      } else if (item.matchStatus === MATCH_STATUS.UNMATCHED) {
        summary.unmatchedCount++;
      } else if (item.matchStatus === MATCH_STATUS.NEW_ITEM) {
        summary.newItemCount++;
      } else if (item.matchStatus === MATCH_STATUS.SKIPPED) {
        summary.skippedCount++;
      }

      if (item.isDiscrepancy) {
        summary.discrepancyCount++;
      }
    }

    summary.totalAmount = Math.round(summary.totalAmount * 100) / 100;
    summary.matchPercentage = summary.totalLines > 0
      ? Math.round((summary.matchedCount / summary.totalLines) * 100)
      : 0;

    return summary;
  },

  async count() {
    return await db.invoiceLineItems.count();
  },

  async clear() {
    await db.invoiceLineItems.clear();
  }
};
