/**
 * Handler Registry
 *
 * Central registry for invoice type handlers.
 * Provides dispatch logic to select the correct handler based on invoice type.
 *
 * @module services/invoice/handlers/handlerRegistry
 */

import { INVOICE_TYPES } from './types';
import { packagingDistributorHandler } from './packagingDistributorHandler';
import { foodSupplyHandler } from './foodSupplyHandler';
import { genericHandler } from './genericHandler';
import { utilitiesHandler } from './utilitiesHandler';
import { servicesHandler } from './servicesHandler';
import { LINE_CATEGORY } from '../lineCategorizer';

// ============================================
// REGISTRY
// ============================================

/**
 * Map of invoice types to their handlers
 */
const handlers = {
  [INVOICE_TYPES.FOOD_SUPPLY]: foodSupplyHandler,
  [INVOICE_TYPES.PACKAGING_DISTRIBUTOR]: packagingDistributorHandler,
  [INVOICE_TYPES.GENERIC]: genericHandler,
  [INVOICE_TYPES.UTILITIES]: utilitiesHandler,
  [INVOICE_TYPES.SERVICES]: servicesHandler,

  // Future handlers can be added here:
  // [INVOICE_TYPES.PRODUCE]: produceHandler,
  // [INVOICE_TYPES.CHEMICAL_SUPPLY]: chemicalSupplyHandler,
};

/**
 * Default handler when type is not specified
 */
const DEFAULT_HANDLER = genericHandler;

// ============================================
// API
// ============================================

/**
 * Gets the handler for a specific invoice type.
 *
 * @param {string} invoiceType - Invoice type identifier
 * @returns {Object} Handler object
 */
export function getHandler(invoiceType) {
  if (!invoiceType) {
    return DEFAULT_HANDLER;
  }

  const handler = handlers[invoiceType];
  if (!handler) {
    console.warn(`  Unknown invoice type: ${invoiceType}, using generic handler`);
    return DEFAULT_HANDLER;
  }

  return handler;
}

/**
 * Gets handler from a vendor object.
 *
 * @param {Object} vendor - Vendor object
 * @returns {Object} Handler object
 */
export function getHandlerForVendor(vendor) {
  return getHandler(vendor?.invoiceType);
}

/**
 * Gets all registered handlers for UI display.
 *
 * @returns {Array} Array of { type, label, description, isExpenseType }
 */
export function getAllHandlerTypes() {
  return Object.values(handlers).map(handler => ({
    type: handler.type,
    label: handler.label,
    description: handler.description,
    isExpenseType: handler.isExpenseType || false
  }));
}

/**
 * Checks if a handler is an expense-only type (utilities, services).
 * Expense types create expense records instead of inventory items.
 *
 * @param {string} invoiceType - Invoice type identifier
 * @returns {boolean} True if expense-only type
 */
export function isExpenseType(invoiceType) {
  const handler = getHandler(invoiceType);
  return handler.isExpenseType === true;
}

/**
 * Creates a new inventory item using the appropriate handler.
 *
 * @param {Object} options - Creation options
 * @param {Object} options.lineItem - Invoice line from Claude
 * @param {Object} options.vendor - Vendor object
 * @param {Object} options.profile - Vendor parsing profile
 * @param {string} [options.invoiceId] - Invoice ID for tracking
 * @param {string} [options.invoiceDate] - Invoice date
 * @returns {Object} { item, warnings, validation }
 */
export function createInventoryItem({ lineItem, vendor, profile, invoiceId, invoiceDate }) {
  const handler = getHandlerForCategory(lineItem.category);

  // Validate line first
  const validation = handler.validateLine(lineItem);
  if (!validation.valid) {
    console.warn(`  Validation errors: ${validation.errors.join(', ')}`);
  }

  // Create item with options
  const result = handler.createInventoryItem(lineItem, vendor, { invoiceId, invoiceDate });
  result.warnings = [...(result.warnings || []), ...validation.warnings];
  result.validation = validation;

  return result;
}

/**
 * Updates an existing inventory item using the appropriate handler.
 *
 * @param {Object} options - Update options
 * @param {Object} options.existingItem - Current inventory item
 * @param {Object} options.lineItem - Invoice line from Claude
 * @param {Object} options.vendor - Vendor object
 * @param {Object} options.profile - Vendor parsing profile
 * @param {string} [options.invoiceId] - Invoice ID for tracking
 * @param {string} [options.invoiceDate] - Invoice date
 * @returns {Object} { updates, warnings, previousValues, validation }
 */
export function updateInventoryItem({ existingItem, lineItem, vendor, profile, invoiceId, invoiceDate }) {
  const handler = getHandlerForCategory(lineItem.category);

  // Validate line first
  const validation = handler.validateLine(lineItem);

  // Update item with options
  const result = handler.updateInventoryItem(existingItem, lineItem, vendor, { invoiceId, invoiceDate });
  result.warnings = [...(result.warnings || []), ...validation.warnings];
  result.validation = validation;

  return result;
}

/**
 * Gets the handler for a line based on its AI category.
 *
 * @param {string} category - LINE_CATEGORY (FOOD, PACKAGING, SUPPLY, FEE, DIVERS)
 * @returns {Object} Handler instance
 */
export function getHandlerForCategory(category) {
  const categoryToHandler = {
    [LINE_CATEGORY.FOOD]: INVOICE_TYPES.FOOD_SUPPLY,
    [LINE_CATEGORY.PACKAGING]: INVOICE_TYPES.PACKAGING_DISTRIBUTOR,
    [LINE_CATEGORY.SUPPLY]: INVOICE_TYPES.PACKAGING_DISTRIBUTOR,
    [LINE_CATEGORY.FEE]: INVOICE_TYPES.GENERIC,
    [LINE_CATEGORY.DIVERS]: INVOICE_TYPES.GENERIC,
  };
  const handlerType = categoryToHandler[category] || INVOICE_TYPES.GENERIC;
  return getHandler(handlerType);
}

// ============================================
// V2 PIPELINE
// ============================================

/**
 * Process invoice lines through handler's V2 pipeline.
 * V2 provides tracked fields, validation gates, and confidence scoring.
 *
 * Currently implemented:
 * - foodSupply: Full V2 with weight extraction, pricePerG, 3-tier validation
 * - packagingDistributor: Full V2 with boxing format, container capacity, 3-tier validation
 *
 * Not yet implemented (returns v2Available: false):
 * - generic, utilities, services
 *
 * @param {Object} options - Processing options
 * @param {Array} options.lines - Normalized line items from Vision parser
 * @param {Object} options.profile - Vendor parsing profile (optional)
 * @param {string} options.invoiceType - Invoice type (required if no profile)
 * @param {Object} options.options - Additional processing options
 * @returns {Object} { lines: ProcessedLine[], summary, v2Available, handlerType }
 */
export function processLinesV2({ lines, profile, invoiceType, options = {} }) {
  const type = profile?.invoiceType || invoiceType;
  const handler = getHandler(type);

  // Check if handler has V2 implementation
  if (typeof handler.processLinesV2 === 'function') {
    const result = handler.processLinesV2(lines, profile, options);
    return {
      ...result,
      v2Available: true,
      handlerType: handler.type,
      handlerLabel: handler.label
    };
  }

  // V2 not implemented for this handler - return lines with flag
  return {
    lines: lines.map((line, index) => ({
      ...line,
      _lineNumber: index + 1,
      _v2Processed: false
    })),
    summary: {
      totalLines: lines.length,
      v2Processed: 0,
      canBillCount: 0,
      canProcessCount: 0,
      warningCount: 0,
      message: `V2 pipeline not yet implemented for ${handler.label}`
    },
    v2Available: false,
    handlerType: handler.type,
    handlerLabel: handler.label
  };
}

/**
 * Process lines through V2 pipeline, routing EACH LINE to the appropriate handler
 * based on its AI category (FOOD → foodSupply, PACKAGING → packaging, etc.)
 *
 * This allows mixed invoices (e.g., food + packaging items) to be processed correctly.
 *
 * Each processed line includes a `_routing` object for validation/debugging:
 * - inputCategory: The AI-assigned category (FOOD, PACKAGING, etc.)
 * - expectedHandler: Handler type based on category mapping
 * - actualHandler: Handler that actually processed the line
 * - routingValid: Boolean indicating if routing was correct
 * - routingReason: Human-readable explanation
 * - timestamp: When routing occurred
 *
 * @param {Object} options - Processing options
 * @param {Array} options.lines - Categorized line items (must have .category field)
 * @param {Object} options.profile - Vendor parsing profile (optional)
 * @param {Object} options.options - Additional processing options
 * @returns {Object} { lines: ProcessedLine[], summary, routingValidation, v2Available, handlerType: 'mixed' }
 */
export function processLinesV2ByCategory({ lines, profile, options = {} }) {
  const routingTimestamp = new Date().toISOString();

  // Map category to handler type (this is the SOURCE OF TRUTH for routing)
  const categoryToHandler = {
    [LINE_CATEGORY.FOOD]: INVOICE_TYPES.FOOD_SUPPLY,
    [LINE_CATEGORY.PACKAGING]: INVOICE_TYPES.PACKAGING_DISTRIBUTOR,
    [LINE_CATEGORY.SUPPLY]: INVOICE_TYPES.PACKAGING_DISTRIBUTOR,
    [LINE_CATEGORY.FEE]: INVOICE_TYPES.GENERIC,
    [LINE_CATEGORY.DIVERS]: INVOICE_TYPES.GENERIC,
  };

  // Human-readable handler labels for routing reasons
  const handlerLabels = {
    [INVOICE_TYPES.FOOD_SUPPLY]: 'Food Supply',
    [INVOICE_TYPES.PACKAGING_DISTRIBUTOR]: 'Packaging Distributor',
    [INVOICE_TYPES.GENERIC]: 'Generic',
    [INVOICE_TYPES.UTILITIES]: 'Utilities',
    [INVOICE_TYPES.SERVICES]: 'Services',
  };

  // Group lines by category with original indices
  const linesByCategory = {};
  lines.forEach((line, originalIndex) => {
    const category = line.category || LINE_CATEGORY.DIVERS;
    if (!linesByCategory[category]) {
      linesByCategory[category] = [];
    }
    linesByCategory[category].push({ line, originalIndex });
  });

  // Process each category group with its appropriate handler
  const processedByIndex = new Array(lines.length);
  const allWarnings = [];
  let totalValid = 0;
  let totalBillable = 0;
  let totalWarnings = 0;
  const handlerTypesUsed = new Set();

  // Routing validation tracking
  const routingStats = {
    totalRouted: 0,
    correctlyRouted: 0,
    misrouted: 0,
    byCategory: {},
  };

  for (const [category, lineGroup] of Object.entries(linesByCategory)) {
    const handlerType = categoryToHandler[category] || INVOICE_TYPES.GENERIC;
    const handler = getHandler(handlerType);
    handlerTypesUsed.add(handler.label);

    // Extract just the lines for this handler
    const categoryLines = lineGroup.map(item => item.line);

    // Process with the appropriate handler
    let result;
    if (typeof handler.processLinesV2 === 'function') {
      try {
        result = handler.processLinesV2(categoryLines, profile, options);
      } catch (err) {
        console.error(`[Registry] ERROR processing ${category} with ${handler.label}:`, err);
        // Fallback on error
        result = {
          lines: categoryLines.map((line, i) => ({
            ...line,
            _lineNumber: lineGroup[i].originalIndex + 1,
            _v2Processed: false,
            validation: { canBill: false, canProcess: false, warnings: [{ message: `Handler error: ${err.message}` }] },
          })),
          summary: { valid: 0, billable: 0, warnings: categoryLines.length },
          allWarnings: [],
        };
      }
    } else {
      // Fallback for handlers without V2 - wrap lines minimally
      result = {
        lines: categoryLines.map((line, i) => ({
          ...line,
          _lineNumber: lineGroup[i].originalIndex + 1,
          _v2Processed: false,
          validation: { canBill: true, canProcess: true, warnings: [] },
        })),
        summary: { valid: categoryLines.length, billable: categoryLines.length, warnings: 0 },
        allWarnings: [],
      };
    }

    // Map processed lines back to original indices with full routing tracking
    result.lines.forEach((processedLine, i) => {
      const originalIndex = lineGroup[i].originalIndex;
      const expectedHandlerType = categoryToHandler[category] || INVOICE_TYPES.GENERIC;
      const actualHandlerType = handler.type;
      const routingValid = expectedHandlerType === actualHandlerType;

      // Build routing trace for validation/debugging
      const routing = {
        inputCategory: category,
        expectedHandler: expectedHandlerType,
        actualHandler: actualHandlerType,
        routingValid: routingValid,
        routingReason: routingValid
          ? `Category ${category} → ${handlerLabels[actualHandlerType] || actualHandlerType} handler`
          : `MISMATCH: Category ${category} expected ${handlerLabels[expectedHandlerType]} but got ${handlerLabels[actualHandlerType]}`,
        timestamp: routingTimestamp,
      };

      // Preserve category on processed line and set correct line number
      processedByIndex[originalIndex] = {
        ...processedLine,
        category: category,
        _lineNumber: originalIndex + 1,
        _handlerUsed: handler.type,
        _routing: routing,
      };

      // Track routing validation stats
      routingStats.totalRouted++;
      if (routingValid) {
        routingStats.correctlyRouted++;
      } else {
        routingStats.misrouted++;
        allWarnings.push({
          type: 'ROUTING_MISMATCH',
          lineNumber: originalIndex + 1,
          message: routing.routingReason,
          expected: expectedHandlerType,
          actual: actualHandlerType,
        });
      }

      // Track per-category stats
      if (!routingStats.byCategory[category]) {
        routingStats.byCategory[category] = {
          count: 0,
          handler: handlerLabels[actualHandlerType] || actualHandlerType,
          handlerType: actualHandlerType,
          correct: 0,
          misrouted: 0,
        };
      }
      routingStats.byCategory[category].count++;
      if (routingValid) {
        routingStats.byCategory[category].correct++;
      } else {
        routingStats.byCategory[category].misrouted++;
      }
    });

    // Aggregate stats
    totalValid += result.summary?.valid ?? result.summary?.canProcessCount ?? 0;
    totalBillable += result.summary?.billable ?? result.summary?.canBillCount ?? 0;
    totalWarnings += result.summary?.warnings ?? result.summary?.warningCount ?? 0;

    // Collect warnings with line numbers
    if (result.allWarnings) {
      result.allWarnings.forEach(w => {
        // Map warning line number to original index
        const origIndex = lineGroup[w.lineNumber - 1]?.originalIndex;
        allWarnings.push({ ...w, lineNumber: origIndex !== undefined ? origIndex + 1 : w.lineNumber });
      });
    }
  }

  // Filter out any undefined entries (shouldn't happen, but safety check)
  const finalLines = processedByIndex.filter(Boolean);

  const handlersUsedList = Array.from(handlerTypesUsed);

  // Finalize routing validation - add allCorrect flag to each category
  Object.values(routingStats.byCategory).forEach(cat => {
    cat.allCorrect = cat.misrouted === 0;
  });

  return {
    lines: finalLines,
    summary: {
      total: finalLines.length,
      totalLines: finalLines.length,
      valid: totalValid,
      billable: totalBillable,
      canBillCount: totalBillable,
      canProcessCount: totalValid,
      warnings: totalWarnings,
      warningCount: totalWarnings,
      handlersUsed: handlersUsedList,
    },
    // NEW: Full routing validation report
    routingValidation: {
      totalLines: routingStats.totalRouted,
      correctlyRouted: routingStats.correctlyRouted,
      misrouted: routingStats.misrouted,
      allCorrect: routingStats.misrouted === 0,
      byCategory: routingStats.byCategory,
      timestamp: routingTimestamp,
    },
    allWarnings,
    v2Available: true,
    handlerType: 'mixed',
    handlerLabel: handlersUsedList.length > 1
      ? `Mixed (${handlersUsedList.join(' + ')})`
      : handlersUsedList[0] || 'Unknown',
  };
}

export default {
  getHandler,
  getHandlerForVendor,
  getHandlerForCategory,
  getAllHandlerTypes,
  createInventoryItem,
  updateInventoryItem,
  isExpenseType,
  processLinesV2,
  processLinesV2ByCategory
};
