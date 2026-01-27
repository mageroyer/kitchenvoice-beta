/**
 * Services Handler
 *
 * Handler for service provider invoices (repairs, maintenance, cleaning, etc.).
 * Creates expense records instead of inventory items.
 * This is an EXPENSE-ONLY handler - no inventory is created.
 *
 * @module services/invoice/handlers/servicesHandler
 */

import { INVOICE_TYPES } from './types';
import {
  validateRequiredFields
} from './baseHandler';

// ============================================
// CONSTANTS
// ============================================

/**
 * Field mappings for services
 */
const FIELD_MAPPINGS = {
  columns: {
    serviceCode: 'reference',
    description: 'description',
    serviceDate: 'serviceDate',
    hours: 'hours',
    rate: 'rate',
    laborCost: 'laborCost',
    partsCost: 'partsCost',
    amount: 'amount',
    total: 'total'
  },
  requiredColumns: ['description', 'amount'],
  optionalColumns: ['serviceCode', 'serviceDate', 'hours', 'rate', 'laborCost', 'partsCost', 'total']
};

// ============================================
// HANDLER IMPLEMENTATION
// ============================================

/**
 * Services Invoice Handler
 * For repairs, maintenance, cleaning - creates expense records, not inventory
 */
export const servicesHandler = {
  type: INVOICE_TYPES.SERVICES,
  label: 'Services',
  description: 'Service providers (repairs, maintenance, cleaning) - expense only, no inventory',

  /** Flag indicating this handler creates expense records, not inventory items */
  isExpenseType: true,

  fieldMappings: FIELD_MAPPINGS,

  /**
   * Validates a service invoice line.
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

    // Validate labor calc if present
    if (lineItem.hours && lineItem.rate) {
      const expectedLabor = parseFloat(lineItem.hours) * parseFloat(lineItem.rate);
      const actualLabor = parseFloat(lineItem.laborCost) || expectedLabor;
      if (Math.abs(expectedLabor - actualLabor) > 1) {
        warnings.push('Labor cost does not match hours × rate');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Creates an expense record from a service invoice line.
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
                   (parseFloat(lineItem.laborCost || 0) + parseFloat(lineItem.partsCost || 0)) ||
                   0;

    // Build expense record data (NOT inventory item)
    const expenseRecord = {
      // Expense identification
      vendorId: vendor?.id || null,
      vendorName: vendor?.name || null,
      description: lineItem.description || 'Service Charge',

      // Amount
      amount: amount,
      taxes: parseFloat(lineItem.taxes) || null,

      // Service details
      serviceDate: lineItem.serviceDate || options.invoiceDate || null,
      reference: lineItem.serviceCode || lineItem.reference || '',

      // Labor breakdown
      hours: lineItem.hours || null,
      rate: lineItem.rate || null,
      laborCost: lineItem.laborCost || null,
      partsCost: lineItem.partsCost || null,

      // Invoice reference
      invoiceId: options.invoiceId || null,
      invoiceNumber: lineItem.invoiceNumber || '',
      invoiceDate: options.invoiceDate || now.split('T')[0],
      dueDate: lineItem.dueDate || null,

      // Metadata
      notes: lineItem.notes || '',
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

    const updates = {
      description: lineItem.description || existingRecord.description,
      amount: parseFloat(lineItem.total) || parseFloat(lineItem.amount) || existingRecord.amount,
      taxes: lineItem.taxes != null ? parseFloat(lineItem.taxes) : existingRecord.taxes,
      serviceDate: lineItem.serviceDate || existingRecord.serviceDate,
      reference: lineItem.serviceCode || lineItem.reference || existingRecord.reference,
      hours: lineItem.hours || existingRecord.hours,
      rate: lineItem.rate || existingRecord.rate,
      laborCost: lineItem.laborCost || existingRecord.laborCost,
      partsCost: lineItem.partsCost || existingRecord.partsCost,
      notes: lineItem.notes || existingRecord.notes,
      updatedAt: now,

      // Flag indicating this is expense data
      _isExpenseRecord: true
    };

    return { updates, warnings, isExpenseRecord: true };
  }
};

export default servicesHandler;
