/**
 * Generic Handler
 *
 * Fallback handler for vendors without a specific type.
 * Provides basic functionality without specialized field mappings.
 *
 * @module services/invoice/handlers/genericHandler
 */

import { INVOICE_TYPES, LINE_TYPE, CONFIDENCE, SOURCE } from './types';
import { LINE_CATEGORY } from '../lineCategorizer';
import {
  extractBaseFields,
  calculatePricePerGram,
  validateRequiredFields,
  processLines as baseProcessLines,
  processLine as baseProcessLine
} from './baseHandler';

// ============================================
// CONSTANTS
// ============================================

/**
 * Maps invoice columns to inventory item fields
 */
const FIELD_MAPPINGS = {
  columns: {
    sku: 'sku',
    description: 'name',
    quantity: 'lastOrderQty',
    unit: 'purchaseUnit',
    unitPrice: 'lastPurchasePrice',
    total: 'lastInvoiceTotal'
  },
  requiredColumns: ['description', 'quantity', 'unitPrice'],
  optionalColumns: ['sku', 'unit', 'total']
};

// ============================================
// HANDLER IMPLEMENTATION
// ============================================

/**
 * Generic Invoice Handler (fallback)
 */
export const genericHandler = {
  type: INVOICE_TYPES.GENERIC,
  label: 'Generic',
  description: 'Default handler for unspecified vendor types',

  fieldMappings: FIELD_MAPPINGS,

  /**
   * Validates an invoice line item.
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

    // Validate quantity and price
    if (lineItem.quantity !== undefined && lineItem.quantity <= 0) {
      errors.push('Quantity must be positive');
    }

    if (lineItem.unitPrice !== undefined && lineItem.unitPrice < 0) {
      errors.push('Unit price cannot be negative');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Creates a new inventory item from an invoice line.
   *
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @returns {Object} { item, warnings }
   */
  createInventoryItem(lineItem, vendor) {
    const warnings = [];

    const item = {
      ...extractBaseFields(lineItem, vendor),
      itemType: 'general',
      category: lineItem.category || LINE_CATEGORY.DIVERS
    };

    if (lineItem.unit) {
      item.purchaseUnit = lineItem.unit;
    }

    return { item, warnings };
  },

  /**
   * Updates an existing inventory item with new invoice data.
   *
   * @param {Object} existingItem - Current inventory item
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @returns {Object} { updates, warnings }
   */
  updateInventoryItem(existingItem, lineItem, vendor) {
    const warnings = [];
    const now = new Date().toISOString();

    const updates = {
      lastOrderQty: parseFloat(lineItem.quantity) || 1,
      lastOrderDate: now,
      lastPurchasePrice: parseFloat(lineItem.unitPrice) || existingItem.lastPurchasePrice,
      lastInvoiceTotal: parseFloat(lineItem.total) || existingItem.lastInvoiceTotal,
      updatedAt: now
    };

    if (lineItem.unit) {
      updates.purchaseUnit = lineItem.unit;
    }

    return { updates, warnings };
  },

  // ============================================
  // LINE PROCESSING (with analysis)
  // ============================================

  /**
   * Processes all invoice lines with generic logic.
   * Uses base implementation which includes math validation and anomaly detection.
   *
   * Generic handler has no type-specific column mapping - uses raw Claude output.
   *
   * @param {Array} claudeLines - Line items from Claude parsing
   * @param {Object} [profile] - Vendor parsing profile (unused by generic handler)
   * @returns {Object} Processed result { lines, summary, allAnomalies }
   */
  processLines(claudeLines, profile = null) {
    // Generic handler doesn't need column mapping - uses raw Claude output
    return baseProcessLines(claudeLines, profile);
  },

  /**
   * Processes a single invoice line with generic logic.
   * Uses base implementation with analysis.
   *
   * @param {Object} claudeLine - Line item from Claude parsing
   * @param {number} index - Line index
   * @returns {Object} Processed line item with analysis
   */
  processLine(claudeLine, index = 0) {
    return baseProcessLine(claudeLine, index);
  }
};

export default genericHandler;
