/**
 * Invoice Service
 *
 * Business logic layer for invoice management operations.
 * Handles invoice processing, status transitions, and payment tracking.
 *
 * @module services/inventory/invoiceService
 */

import {
  invoiceDB,
  invoiceLineDB,
  vendorDB,
  INVOICE_STATUS,
  PAYMENT_STATUS
} from '../database/indexedDB';

// ============================================
// Constants
// ============================================

/**
 * Valid status transitions map
 * Key: current status, Value: array of allowed next statuses
 */
export const VALID_STATUS_TRANSITIONS = {
  [INVOICE_STATUS.DRAFT]: [
    INVOICE_STATUS.PENDING,
    INVOICE_STATUS.CANCELLED
  ],
  [INVOICE_STATUS.PENDING]: [
    INVOICE_STATUS.EXTRACTING,
    INVOICE_STATUS.CANCELLED
  ],
  [INVOICE_STATUS.EXTRACTING]: [
    INVOICE_STATUS.EXTRACTED,
    INVOICE_STATUS.ERROR,
    INVOICE_STATUS.PENDING // Retry
  ],
  [INVOICE_STATUS.EXTRACTED]: [
    INVOICE_STATUS.REVIEWED,
    INVOICE_STATUS.PENDING // Reprocess
  ],
  [INVOICE_STATUS.REVIEWED]: [
    INVOICE_STATUS.APPROVED,
    INVOICE_STATUS.EXTRACTED // Back to review
  ],
  [INVOICE_STATUS.APPROVED]: [
    INVOICE_STATUS.SYNCED
  ],
  [INVOICE_STATUS.ERROR]: [
    INVOICE_STATUS.PENDING // Retry
  ],
  [INVOICE_STATUS.SYNCED]: [],
  [INVOICE_STATUS.CANCELLED]: []
};

/**
 * Valid payment status transitions
 */
export const VALID_PAYMENT_TRANSITIONS = {
  [PAYMENT_STATUS.UNPAID]: [
    PAYMENT_STATUS.PARTIAL,
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.OVERDUE,
    PAYMENT_STATUS.DISPUTED
  ],
  [PAYMENT_STATUS.PARTIAL]: [
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.OVERDUE,
    PAYMENT_STATUS.DISPUTED
  ],
  [PAYMENT_STATUS.OVERDUE]: [
    PAYMENT_STATUS.PARTIAL,
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.DISPUTED
  ],
  [PAYMENT_STATUS.DISPUTED]: [
    PAYMENT_STATUS.UNPAID,
    PAYMENT_STATUS.PARTIAL,
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.CANCELLED
  ],
  [PAYMENT_STATUS.PAID]: [],
  [PAYMENT_STATUS.CANCELLED]: []
};

// Re-export status constants for convenience
export { INVOICE_STATUS, PAYMENT_STATUS };

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate status transition
 * @param {string} currentStatus - Current status
 * @param {string} newStatus - New status
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStatusTransition(currentStatus, newStatus) {
  if (!currentStatus) {
    // New invoice - any initial status is valid
    return { valid: true };
  }

  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

  if (!allowedTransitions) {
    return { valid: false, error: `Unknown current status: ${currentStatus}` };
  }

  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowedTransitions.join(', ') || 'none'}`
    };
  }

  return { valid: true };
}

/**
 * Validate payment status transition
 * @param {string} currentStatus - Current payment status
 * @param {string} newStatus - New payment status
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePaymentTransition(currentStatus, newStatus) {
  if (!currentStatus) {
    return { valid: true };
  }

  const allowedTransitions = VALID_PAYMENT_TRANSITIONS[currentStatus];

  if (!allowedTransitions) {
    return { valid: false, error: `Unknown current payment status: ${currentStatus}` };
  }

  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition payment from "${currentStatus}" to "${newStatus}". Allowed: ${allowedTransitions.join(', ') || 'none'}`
    };
  }

  return { valid: true };
}

/**
 * Validate invoice data
 * @param {Object} data - Invoice data
 * @param {Object} options - Options
 * @param {boolean} options.isUpdate - True if updating
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateInvoiceData(data, { isUpdate = false } = {}) {
  const errors = [];

  // Vendor required on create
  if (!isUpdate) {
    if (!data.vendorId) {
      errors.push('Vendor is required');
    }
  }

  // Invoice number validation
  if (data.invoiceNumber && data.invoiceNumber.length > 100) {
    errors.push('Invoice number must be 100 characters or less');
  }

  // Amount validations
  if (data.subtotal !== undefined && (typeof data.subtotal !== 'number' || data.subtotal < 0)) {
    errors.push('Subtotal must be a non-negative number');
  }

  if (data.total !== undefined && (typeof data.total !== 'number' || data.total < 0)) {
    errors.push('Total must be a non-negative number');
  }

  // Date validations
  if (data.invoiceDate && !/^\d{4}-\d{2}-\d{2}/.test(data.invoiceDate)) {
    errors.push('Invoice date must be in ISO format');
  }

  if (data.dueDate && !/^\d{4}-\d{2}-\d{2}/.test(data.dueDate)) {
    errors.push('Due date must be in ISO format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new invoice
 *
 * @param {Object} data - Invoice data
 * @param {number} data.vendorId - Vendor ID (required)
 * @param {string} [data.invoiceNumber] - Invoice number
 * @param {string} [data.invoiceDate] - Invoice date (ISO)
 * @param {string} [data.dueDate] - Due date (ISO)
 * @param {number} [data.subtotal] - Subtotal amount
 * @param {number} [data.taxGST] - GST tax amount
 * @param {number} [data.taxQST] - QST tax amount
 * @param {number} [data.total] - Total amount
 * @param {string} [data.documentUrl] - Document URL
 * @param {string} [data.notes] - Notes
 * @param {string} [data.createdBy] - User ID
 * @returns {Promise<Object>} Created invoice
 * @throws {Error} If validation fails or vendor not found
 */
export async function createInvoice(data) {
  // Validate input - vendor is always required
  const validation = validateInvoiceData(data, { isUpdate: false });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Vendor must exist
  const vendor = await vendorDB.getById(data.vendorId);
  if (!vendor) {
    throw new Error(`Vendor ${data.vendorId} not found`);
  }

  // Prepare invoice data
  const invoiceData = {
    ...data,
    vendorId: data.vendorId,
    vendorName: vendor.name,
    status: INVOICE_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    createdAt: new Date().toISOString()
  };

  try {
    const id = await invoiceDB.create(invoiceData);
    const invoice = await invoiceDB.getById(id);
    return invoice;
  } catch (error) {
    throw new Error(`Failed to create invoice: ${error.message}`);
  }
}

/**
 * Update an existing invoice
 *
 * Validates status transitions before updating.
 *
 * @param {number} id - Invoice ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated invoice
 * @throws {Error} If invoice not found or invalid status transition
 */
export async function updateInvoice(id, data) {
  // Fetch existing invoice
  const existing = await invoiceDB.getById(id);
  if (!existing) {
    throw new Error('Invoice not found');
  }

  // Validate status transition if status is changing
  if (data.status && data.status !== existing.status) {
    const transition = validateStatusTransition(existing.status, data.status);
    if (!transition.valid) {
      throw new Error(transition.error);
    }
  }

  // Validate payment status transition
  if (data.paymentStatus && data.paymentStatus !== existing.paymentStatus) {
    const transition = validatePaymentTransition(existing.paymentStatus, data.paymentStatus);
    if (!transition.valid) {
      throw new Error(transition.error);
    }
  }

  // Validate data
  const validation = validateInvoiceData(data, { isUpdate: true });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Update
  try {
    await invoiceDB.update(id, {
      ...data,
      updatedAt: new Date().toISOString()
    });

    return await invoiceDB.getById(id);
  } catch (error) {
    throw new Error(`Failed to update invoice: ${error.message}`);
  }
}

/**
 * Get an invoice by ID with line items
 *
 * @param {number} id - Invoice ID
 * @returns {Promise<Object|null>} Invoice with lineItems array, or null if not found
 */
export async function getInvoice(id) {
  try {
    const invoice = await invoiceDB.getById(id);
    if (!invoice) {
      return null;
    }

    // Fetch associated line items
    const lineItems = await invoiceLineDB.getByInvoice(id);

    return {
      ...invoice,
      lineItems: lineItems || [],
      lineItemCount: lineItems?.length || 0
    };
  } catch (error) {
    throw new Error(`Failed to fetch invoice: ${error.message}`);
  }
}

/**
 * Get all invoices with optional filters
 *
 * @param {Object} [filters] - Filter options
 * @param {string} [filters.status] - Filter by status
 * @param {string} [filters.paymentStatus] - Filter by payment status
 * @param {number} [filters.vendorId] - Filter by vendor
 * @param {string} [filters.startDate] - Start date (ISO)
 * @param {string} [filters.endDate] - End date (ISO)
 * @param {string} [filters.search] - Search invoice number
 * @returns {Promise<Object[]>} Array of invoices sorted by date descending
 */
export async function getAllInvoices(filters = {}) {
  try {
    let invoices;

    // Start with appropriate base query
    if (filters.vendorId && filters.startDate && filters.endDate) {
      invoices = await invoiceDB.getByVendorAndDateRange(
        filters.vendorId,
        filters.startDate,
        filters.endDate
      );
    } else if (filters.vendorId) {
      invoices = await invoiceDB.getByVendor(filters.vendorId);
    } else if (filters.status) {
      invoices = await invoiceDB.getByStatus(filters.status);
    } else if (filters.paymentStatus) {
      invoices = await invoiceDB.getByPaymentStatus(filters.paymentStatus);
    } else if (filters.startDate && filters.endDate) {
      invoices = await invoiceDB.getByDateRange(filters.startDate, filters.endDate);
    } else if (filters.search) {
      invoices = await invoiceDB.searchByNumber(filters.search, { limit: 100 });
    } else {
      invoices = await invoiceDB.getAll();
    }

    // Apply additional filters
    if (filters.status && filters.vendorId) {
      invoices = invoices.filter(inv => inv.status === filters.status);
    }

    if (filters.paymentStatus && (filters.vendorId || filters.status)) {
      invoices = invoices.filter(inv => inv.paymentStatus === filters.paymentStatus);
    }

    // Sort by date descending (newest first)
    invoices.sort((a, b) => {
      const dateA = a.invoiceDate || a.createdAt || '';
      const dateB = b.invoiceDate || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });

    return invoices;
  } catch (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }
}

/**
 * Get pending invoices (awaiting processing)
 *
 * @returns {Promise<Object[]>} Pending invoices
 */
export async function getPendingInvoices() {
  try {
    return await invoiceDB.getPending();
  } catch (error) {
    throw new Error(`Failed to fetch pending invoices: ${error.message}`);
  }
}

/**
 * Start processing an invoice (trigger AI extraction)
 *
 * @param {number} id - Invoice ID
 * @returns {Promise<Object>} Updated invoice with processing status
 * @throws {Error} If invoice not found or cannot be processed
 */
export async function processInvoice(id) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Validate can be processed
  if (![INVOICE_STATUS.PENDING, INVOICE_STATUS.ERROR].includes(invoice.status)) {
    throw new Error(`Cannot process invoice in "${invoice.status}" status`);
  }

  // Update status to extracting
  await invoiceDB.update(id, {
    status: INVOICE_STATUS.EXTRACTING,
    updatedAt: new Date().toISOString()
  });

  return {
    invoiceId: id,
    status: INVOICE_STATUS.EXTRACTING,
    message: 'Invoice processing started. AI extraction will run separately.'
  };
}

/**
 * Mark invoice as processed with line items
 *
 * @param {number} id - Invoice ID
 * @param {Array<Object>} lineItems - Extracted line items
 * @param {Object} [options] - Options
 * @param {string} [options.processedBy] - User ID
 * @param {Object} [options.extractedData] - Additional extracted data
 * @returns {Promise<Object>} Updated invoice with line items
 * @throws {Error} If invoice not found
 */
export async function markInvoiceProcessed(id, lineItems, options = {}) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const now = new Date().toISOString();

  try {
    // Create line items
    const lineItemIds = [];
    if (Array.isArray(lineItems) && lineItems.length > 0) {
      for (let i = 0; i < lineItems.length; i++) {
        const lineItemId = await invoiceLineDB.create({
          ...lineItems[i],
          invoiceId: id,
          lineNumber: i + 1
        });
        lineItemIds.push(lineItemId);
      }
    }

    // Update invoice
    const updateData = {
      status: INVOICE_STATUS.EXTRACTED,
      processedAt: now,
      processedBy: options.processedBy || null,
      updatedAt: now
    };

    // Add extracted totals if provided
    if (options.extractedData) {
      if (options.extractedData.subtotal !== undefined) {
        updateData.subtotal = options.extractedData.subtotal;
      }
      if (options.extractedData.total !== undefined) {
        updateData.total = options.extractedData.total;
      }
      if (options.extractedData.taxGST !== undefined) {
        updateData.taxGST = options.extractedData.taxGST;
      }
      if (options.extractedData.taxQST !== undefined) {
        updateData.taxQST = options.extractedData.taxQST;
      }
      if (options.extractedData.invoiceNumber) {
        updateData.invoiceNumber = options.extractedData.invoiceNumber;
      }
      if (options.extractedData.invoiceDate) {
        updateData.invoiceDate = options.extractedData.invoiceDate;
      }
    }

    await invoiceDB.update(id, updateData);

    // Return updated invoice with line items
    return await getInvoice(id);
  } catch (error) {
    // Revert status on failure
    await invoiceDB.update(id, {
      status: INVOICE_STATUS.ERROR,
      processingNotes: `Processing failed: ${error.message}`
    });
    throw new Error(`Failed to mark invoice processed: ${error.message}`);
  }
}

/**
 * Mark invoice as reviewed/approved
 *
 * @param {number} id - Invoice ID
 * @param {Object} [options] - Options
 * @param {string} [options.reviewedBy] - User ID
 * @param {string} [options.notes] - Review notes
 * @returns {Promise<Object>} Updated invoice
 */
export async function markInvoiceReviewed(id, options = {}) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.status !== INVOICE_STATUS.EXTRACTED) {
    throw new Error(`Cannot review invoice in "${invoice.status}" status`);
  }

  await invoiceDB.update(id, {
    status: INVOICE_STATUS.REVIEWED,
    reviewedAt: new Date().toISOString(),
    reviewedBy: options.reviewedBy || null,
    processingNotes: options.notes || invoice.processingNotes
  });

  return await invoiceDB.getById(id);
}

/**
 * Approve an invoice
 *
 * @param {number} id - Invoice ID
 * @param {Object} [options] - Options
 * @param {string} [options.approvedBy] - User ID
 * @returns {Promise<Object>} Updated invoice
 */
export async function approveInvoice(id, options = {}) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.status !== INVOICE_STATUS.REVIEWED) {
    throw new Error(`Cannot approve invoice in "${invoice.status}" status`);
  }

  await invoiceDB.update(id, {
    status: INVOICE_STATUS.APPROVED,
    approvedAt: new Date().toISOString(),
    approvedBy: options.approvedBy || null
  });

  return await invoiceDB.getById(id);
}

/**
 * Mark invoice as paid
 *
 * @param {number} id - Invoice ID
 * @param {Object} paymentData - Payment details
 * @param {string} [paymentData.paymentDate] - Payment date (ISO)
 * @param {string} [paymentData.paymentMethod] - Payment method
 * @param {string} [paymentData.paymentReference] - Reference/check number
 * @param {number} [paymentData.paymentAmount] - Amount paid
 * @param {string} [paymentData.notes] - Payment notes
 * @returns {Promise<Object>} Updated invoice
 */
export async function markInvoicePaid(id, paymentData = {}) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const now = new Date().toISOString();
  const paymentAmount = paymentData.paymentAmount || invoice.total || 0;
  const totalAmount = invoice.total || 0;

  // Determine payment status
  let newPaymentStatus;
  if (paymentAmount >= totalAmount) {
    newPaymentStatus = PAYMENT_STATUS.PAID;
  } else if (paymentAmount > 0) {
    newPaymentStatus = PAYMENT_STATUS.PARTIAL;
  } else {
    throw new Error('Payment amount must be greater than 0');
  }

  // Validate transition
  const transition = validatePaymentTransition(invoice.paymentStatus, newPaymentStatus);
  if (!transition.valid) {
    throw new Error(transition.error);
  }

  await invoiceDB.update(id, {
    paymentStatus: newPaymentStatus,
    paymentDate: paymentData.paymentDate || now.split('T')[0],
    paymentMethod: paymentData.paymentMethod || '',
    paymentReference: paymentData.paymentReference || '',
    paymentAmount,
    notes: paymentData.notes || invoice.notes,
    updatedAt: now
  });

  return await invoiceDB.getById(id);
}

/**
 * Get invoices by vendor
 *
 * @param {number} vendorId - Vendor ID
 * @returns {Promise<Object[]>} Invoices for the vendor
 */
export async function getInvoicesByVendor(vendorId) {
  try {
    return await invoiceDB.getByVendor(vendorId);
  } catch (error) {
    throw new Error(`Failed to fetch invoices by vendor: ${error.message}`);
  }
}

/**
 * Get overdue invoices
 *
 * @returns {Promise<Object[]>} Overdue invoices
 */
export async function getOverdueInvoices() {
  try {
    return await invoiceDB.getOverdue();
  } catch (error) {
    throw new Error(`Failed to fetch overdue invoices: ${error.message}`);
  }
}

/**
 * Get invoice statistics
 *
 * @returns {Promise<Object>} Stats object
 */
export async function getInvoiceStats() {
  try {
    const allInvoices = await invoiceDB.getAll();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const stats = {
      total: allInvoices.length,
      byStatus: {},
      byPaymentStatus: {},
      pendingCount: 0,
      pendingValue: 0,
      overdueCount: 0,
      overdueValue: 0,
      thisMonthCount: 0,
      thisMonthValue: 0
    };

    // Initialize status counts
    Object.values(INVOICE_STATUS).forEach(status => {
      stats.byStatus[status] = 0;
    });
    Object.values(PAYMENT_STATUS).forEach(status => {
      stats.byPaymentStatus[status] = 0;
    });

    const today = now.toISOString().split('T')[0];

    for (const invoice of allInvoices) {
      // Count by status
      if (invoice.status) {
        stats.byStatus[invoice.status] = (stats.byStatus[invoice.status] || 0) + 1;
      }

      // Count by payment status
      if (invoice.paymentStatus) {
        stats.byPaymentStatus[invoice.paymentStatus] = (stats.byPaymentStatus[invoice.paymentStatus] || 0) + 1;
      }

      // Pending invoices
      if ([INVOICE_STATUS.PENDING, INVOICE_STATUS.EXTRACTING, INVOICE_STATUS.EXTRACTED].includes(invoice.status)) {
        stats.pendingCount++;
        stats.pendingValue += invoice.total || 0;
      }

      // Overdue invoices
      if (invoice.paymentStatus === PAYMENT_STATUS.UNPAID &&
        invoice.dueDate &&
        invoice.dueDate < today) {
        stats.overdueCount++;
        stats.overdueValue += invoice.total || 0;
      }

      // This month
      const invoiceDate = invoice.invoiceDate || invoice.createdAt;
      if (invoiceDate && invoiceDate >= startOfMonth) {
        stats.thisMonthCount++;
        stats.thisMonthValue += invoice.total || 0;
      }
    }

    // Round monetary values
    stats.pendingValue = Math.round(stats.pendingValue * 100) / 100;
    stats.overdueValue = Math.round(stats.overdueValue * 100) / 100;
    stats.thisMonthValue = Math.round(stats.thisMonthValue * 100) / 100;

    return stats;
  } catch (error) {
    throw new Error(`Failed to get invoice stats: ${error.message}`);
  }
}

// ============================================
// Line Item Functions
// ============================================

/**
 * Get line items for an invoice
 *
 * @param {number} invoiceId - Invoice ID
 * @returns {Promise<Object[]>} Line items
 */
export async function getInvoiceLineItems(invoiceId) {
  try {
    return await invoiceLineDB.getByInvoice(invoiceId);
  } catch (error) {
    throw new Error(`Failed to fetch line items: ${error.message}`);
  }
}

/**
 * Add line item to invoice
 *
 * @param {number} invoiceId - Invoice ID
 * @param {Object} lineItemData - Line item data
 * @returns {Promise<Object>} Created line item
 */
export async function addInvoiceLineItem(invoiceId, lineItemData) {
  const invoice = await invoiceDB.getById(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  try {
    const id = await invoiceLineDB.create({
      ...lineItemData,
      invoiceId
    });

    return await invoiceLineDB.getById(id);
  } catch (error) {
    throw new Error(`Failed to add line item: ${error.message}`);
  }
}

/**
 * Update line item
 *
 * @param {number} lineItemId - Line item ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated line item
 */
export async function updateInvoiceLineItem(lineItemId, data) {
  const existing = await invoiceLineDB.getById(lineItemId);
  if (!existing) {
    throw new Error('Line item not found');
  }

  try {
    await invoiceLineDB.update(lineItemId, data);
    return await invoiceLineDB.getById(lineItemId);
  } catch (error) {
    throw new Error(`Failed to update line item: ${error.message}`);
  }
}

/**
 * Delete line item
 *
 * @param {number} lineItemId - Line item ID
 * @returns {Promise<boolean>}
 */
export async function deleteInvoiceLineItem(lineItemId) {
  const existing = await invoiceLineDB.getById(lineItemId);
  if (!existing) {
    throw new Error('Line item not found');
  }

  try {
    await invoiceLineDB.delete(lineItemId);
    return true;
  } catch (error) {
    throw new Error(`Failed to delete line item: ${error.message}`);
  }
}

/**
 * Get unmatched line items (across all invoices)
 *
 * @returns {Promise<Object[]>} Unmatched line items
 */
export async function getUnmatchedLineItems() {
  try {
    return await invoiceLineDB.getUnmatched();
  } catch (error) {
    throw new Error(`Failed to fetch unmatched line items: ${error.message}`);
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Cancel an invoice
 *
 * @param {number} id - Invoice ID
 * @param {string} [reason] - Cancellation reason
 * @returns {Promise<Object>} Cancelled invoice
 */
export async function cancelInvoice(id, reason = '') {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Can only cancel certain statuses
  if ([INVOICE_STATUS.SYNCED, INVOICE_STATUS.CANCELLED].includes(invoice.status)) {
    throw new Error(`Cannot cancel invoice in "${invoice.status}" status`);
  }

  await invoiceDB.update(id, {
    status: INVOICE_STATUS.CANCELLED,
    paymentStatus: PAYMENT_STATUS.CANCELLED,
    processingNotes: reason ? `Cancelled: ${reason}` : 'Cancelled',
    updatedAt: new Date().toISOString()
  });

  return await invoiceDB.getById(id);
}

/**
 * Duplicate an invoice (for corrections)
 *
 * @param {number} id - Invoice ID to duplicate
 * @returns {Promise<Object>} New invoice
 */
export async function duplicateInvoice(id) {
  const original = await getInvoice(id);
  if (!original) {
    throw new Error('Invoice not found');
  }

  // Create new invoice without ID and with reset status
  const { id: _id, lineItems, status, paymentStatus, processedAt, ...invoiceData } = original;

  const newInvoiceId = await invoiceDB.create({
    ...invoiceData,
    status: INVOICE_STATUS.DRAFT,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    notes: `Duplicated from invoice #${id}`,
    createdAt: new Date().toISOString()
  });

  // Duplicate line items
  if (lineItems && lineItems.length > 0) {
    for (const line of lineItems) {
      const { id: _lineId, invoiceId: _invId, ...lineData } = line;
      await invoiceLineDB.create({
        ...lineData,
        invoiceId: newInvoiceId,
        matchStatus: 'unmatched' // Reset match status
      });
    }
  }

  return await getInvoice(newInvoiceId);
}

/**
 * Recalculate invoice totals from line items
 *
 * @param {number} id - Invoice ID
 * @returns {Promise<Object>} Updated invoice
 */
export async function recalculateInvoiceTotals(id) {
  const invoice = await invoiceDB.getById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const lineItems = await invoiceLineDB.getByInvoice(id);

  let subtotal = 0;
  for (const line of lineItems) {
    subtotal += line.totalPrice || 0;
  }

  const taxGST = invoice.taxGST || 0;
  const taxQST = invoice.taxQST || 0;
  const taxOther = invoice.taxOther || 0;
  const total = subtotal + taxGST + taxQST + taxOther;

  await invoiceDB.update(id, {
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(total * 100) / 100,
    updatedAt: new Date().toISOString()
  });

  return await invoiceDB.getById(id);
}

// ============================================
// Export all functions
// ============================================

export default {
  // Constants
  INVOICE_STATUS,
  PAYMENT_STATUS,
  VALID_STATUS_TRANSITIONS,
  VALID_PAYMENT_TRANSITIONS,

  // Validation
  validateStatusTransition,
  validatePaymentTransition,
  validateInvoiceData,

  // CRUD
  createInvoice,
  updateInvoice,
  getInvoice,
  getAllInvoices,
  getPendingInvoices,
  getInvoicesByVendor,
  getOverdueInvoices,

  // Processing workflow
  processInvoice,
  markInvoiceProcessed,
  markInvoiceReviewed,
  approveInvoice,

  // Payment
  markInvoicePaid,

  // Statistics
  getInvoiceStats,

  // Line items
  getInvoiceLineItems,
  addInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
  getUnmatchedLineItems,

  // Utilities
  cancelInvoice,
  duplicateInvoice,
  recalculateInvoiceTotals
};
