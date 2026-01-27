/**
 * Utilities Handler
 *
 * Handler for utility bills (electricity, gas, water).
 * Creates expense records instead of inventory items.
 * This is an EXPENSE-ONLY handler - no inventory is created.
 *
 * @module services/invoice/handlers/utilitiesHandler
 */

import { INVOICE_TYPES } from './types';
import {
  validateRequiredFields
} from './baseHandler';

// ============================================
// CONSTANTS
// ============================================

/**
 * Field mappings for utilities
 */
const FIELD_MAPPINGS = {
  columns: {
    accountNumber: 'accountNumber',
    description: 'description',
    periodStart: 'periodStart',
    periodEnd: 'periodEnd',
    usage: 'usage',
    rate: 'rate',
    amount: 'amount',
    taxes: 'taxes',
    total: 'total'
  },
  requiredColumns: ['description', 'amount'],
  optionalColumns: ['accountNumber', 'periodStart', 'periodEnd', 'usage', 'rate', 'taxes', 'total']
};

// ============================================
// HANDLER IMPLEMENTATION
// ============================================

/**
 * Utilities Invoice Handler
 * For electricity, gas, water bills - creates expense records, not inventory
 */
export const utilitiesHandler = {
  type: INVOICE_TYPES.UTILITIES,
  label: 'Utilities',
  description: 'Utility bills (electricity, gas, water) - expense only, no inventory',

  /** Flag indicating this handler creates expense records, not inventory items */
  isExpenseType: true,

  fieldMappings: FIELD_MAPPINGS,

  /**
   * Validates a utility invoice line.
   *
   * @param {Object} lineItem - Invoice line from Claude
   * @returns {Object} { valid, errors, warnings }
   */
  validateLine(lineItem) {
    const errors = [];
    const warnings = [];

    // Check required fields
    const requiredResult = validateRequiredFields(lineItem, ['description']);
    errors.push(...requiredResult.errors);

    // Must have some amount
    if (lineItem.amount == null && lineItem.total == null) {
      errors.push('Missing amount or total');
    }

    // Validate amount is positive
    const amount = parseFloat(lineItem.amount || lineItem.total);
    if (amount !== undefined && amount < 0) {
      warnings.push('Negative amount - may be a credit');
    }

    // Validate dates if present
    if (lineItem.periodStart && lineItem.periodEnd) {
      const start = new Date(lineItem.periodStart);
      const end = new Date(lineItem.periodEnd);
      if (start > end) {
        warnings.push('Period start is after period end');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Creates an expense record from a utility invoice line.
   * NOTE: This does NOT create an inventory item - it returns expense data.
   *
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @param {Object} options - Additional options
   * @returns {Object} { expenseRecord, warnings }
   */
  createInventoryItem(lineItem, vendor, options = {}) {
    const warnings = [];
    const now = new Date().toISOString();

    // Calculate the final amount
    const amount = parseFloat(lineItem.total) ||
                   parseFloat(lineItem.amount) ||
                   0;

    // Build expense record data (NOT inventory item)
    const expenseRecord = {
      // Expense identification
      vendorId: vendor?.id || null,
      vendorName: vendor?.name || null,
      description: lineItem.description || 'Utility Charge',

      // Amount
      amount: amount,
      taxes: parseFloat(lineItem.taxes) || null,

      // Billing period
      periodStart: lineItem.periodStart || null,
      periodEnd: lineItem.periodEnd || null,

      // Account info
      accountNumber: lineItem.accountNumber || '',

      // Usage details (for tracking)
      usage: lineItem.usage || null,
      usageUnit: lineItem.usageUnit || null,
      rate: lineItem.rate || null,

      // Invoice reference
      invoiceId: options.invoiceId || null,
      invoiceNumber: lineItem.invoiceNumber || '',
      invoiceDate: options.invoiceDate || now.split('T')[0],
      dueDate: lineItem.dueDate || null,

      // Metadata
      createdAt: now,
      updatedAt: now,
      source: 'invoice',

      // Flag indicating this is expense data, not inventory
      _isExpenseRecord: true
    };

    return { item: expenseRecord, warnings, isExpenseRecord: true };
  },

  /**
   * Updates expense tracking info.
   * For utilities, we typically create new records each billing cycle.
   *
   * @param {Object} existingRecord - Existing expense record (if any)
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @param {Object} options - Additional options
   * @returns {Object} { updates, warnings }
   */
  updateInventoryItem(existingRecord, lineItem, vendor, options = {}) {
    const warnings = [];
    const now = new Date().toISOString();

    // For utilities, we usually create new records, but allow updates
    const updates = {
      description: lineItem.description || existingRecord.description,
      amount: parseFloat(lineItem.total) || parseFloat(lineItem.amount) || existingRecord.amount,
      taxes: lineItem.taxes != null ? parseFloat(lineItem.taxes) : existingRecord.taxes,
      periodStart: lineItem.periodStart || existingRecord.periodStart,
      periodEnd: lineItem.periodEnd || existingRecord.periodEnd,
      usage: lineItem.usage || existingRecord.usage,
      usageUnit: lineItem.usageUnit || existingRecord.usageUnit,
      rate: lineItem.rate || existingRecord.rate,
      updatedAt: now,

      // Flag indicating this is expense data
      _isExpenseRecord: true
    };

    return { updates, warnings, isExpenseRecord: true };
  }
};

export default utilitiesHandler;
