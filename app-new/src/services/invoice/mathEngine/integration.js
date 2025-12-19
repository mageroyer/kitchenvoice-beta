/**
 * Math Engine Integration
 *
 * Integrates the math-first validation system with the existing
 * invoice processing flow in invoiceOrchestrator.js
 *
 * @module services/invoice/mathEngine/integration
 */

import { validateLine, findValidFormula } from './lineValidator.js';
import { validateCascade, getValidationSummary } from './cascadeValidator.js';
import { solveColumns, extractNumericColumns, parseNumericValue } from './columnSolver.js';
import { extractAllFormats } from './formatPatterns.js';
import { VALIDATION_STATUS } from './types.js';

// ============================================
// Line-Level Integration
// ============================================

/**
 * Validate a single parsed line item
 * Call this after Claude parses each line
 *
 * @param {Object} line - Parsed line item from Claude
 * @param {number} [line.quantity] - Quantity value
 * @param {number} [line.billingQuantity] - Billing quantity (preferred)
 * @param {number} [line.weight] - Weight value
 * @param {number} [line.unitPrice] - Price per unit
 * @param {number} [line.totalPrice] - Line total
 * @param {string} [line.description] - Description (for format extraction)
 * @returns {Object} Line with validation result attached
 */
export function validateLineItem(line) {
  const fields = {
    count: line.quantity,
    weight: line.weight,
    volume: line.volume,
    billingQuantity: line.billingQuantity,
    packCount: line.packCount,
    packWeight: line.packWeight || line.unitWeight,
    embeddedWeight: null, // Will be extracted from description
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice,
  };

  // Try to extract embedded weight from description
  if (line.description) {
    const formatResult = extractAllFormats(line.description);
    if (formatResult.bestMatch?.billingValue) {
      fields.embeddedWeight = formatResult.bestMatch.billingValue;
    }
  }

  // Find which formula validates
  const result = findValidFormula(fields);

  return {
    ...line,
    mathValidation: {
      isValid: result.found,
      formulaUsed: result.bestMatch?.formulaName || null,
      billingValue: result.bestMatch?.billingValue || null,
      calculated: result.bestMatch?.calculated || null,
      expected: result.bestMatch?.expected || null,
      difference: result.bestMatch?.difference || null,
      status: result.found ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    },
  };
}

/**
 * Validate all line items in batch
 *
 * @param {Array<Object>} lineItems - Array of parsed line items
 * @returns {Object} Lines with validation + summary
 */
export function validateAllLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return {
      lines: [],
      summary: { valid: 0, invalid: 0, total: 0, validRate: 0 },
    };
  }

  const validatedLines = lineItems.map(validateLineItem);

  const valid = validatedLines.filter((l) => l.mathValidation?.isValid).length;
  const invalid = validatedLines.filter(
    (l) => l.mathValidation && !l.mathValidation.isValid
  ).length;

  return {
    lines: validatedLines,
    summary: {
      valid,
      invalid,
      total: lineItems.length,
      validRate: lineItems.length > 0 ? (valid / lineItems.length) * 100 : 0,
    },
  };
}

// ============================================
// Invoice-Level Integration (Cascade)
// ============================================

/**
 * Validate invoice totals (sum, tax, grand total)
 * Call this after all lines are parsed
 *
 * @param {Object} invoice - Parsed invoice
 * @param {Array<Object>} lineItems - Validated line items
 * @returns {Object} Cascade validation result
 */
export function validateInvoiceTotals(invoice, lineItems) {
  // Extract line totals
  const lineTotals = lineItems
    .map((l) => l.totalPrice)
    .filter((t) => t != null && !isNaN(t));

  // Run cascade validation
  const cascadeResult = validateCascade({
    lineTotals,
    subtotal: invoice.subtotal,
    tps: invoice.tps || invoice.gst,
    tvq: invoice.tvq || invoice.qst,
    grandTotal: invoice.grandTotal || invoice.total,
  });

  return {
    ...cascadeResult,
    message: getValidationSummary(cascadeResult),
  };
}

// ============================================
// Column Suggestion Integration
// ============================================

/**
 * Suggest column mapping from raw invoice lines
 * Use this in VendorProfileWizard when user hasn't mapped columns
 *
 * @param {Array<Object>} sampleLines - Sample line items with rawColumns
 * @param {number} [descriptionIndex] - Index of description column
 * @returns {Object} Suggested column mapping
 */
export function suggestColumnMapping(sampleLines, descriptionIndex = null) {
  if (!Array.isArray(sampleLines) || sampleLines.length === 0) {
    return { found: false, reason: 'No sample lines provided' };
  }

  // Extract raw column arrays
  const rawLines = sampleLines
    .filter((l) => Array.isArray(l.rawColumns))
    .map((l) => l.rawColumns);

  if (rawLines.length === 0) {
    return { found: false, reason: 'No rawColumns data available' };
  }

  // Solve columns using math
  const result = solveColumns(rawLines, descriptionIndex);

  if (result.found) {
    return {
      found: true,
      mapping: {
        billingQuantity: result.mapping.billingIndex != null
          ? { index: result.mapping.billingIndex, autoDetected: true }
          : null,
        unitPrice: { index: result.mapping.priceIndex, autoDetected: true },
        totalPrice: { index: result.mapping.totalIndex, autoDetected: true },
      },
      confidence: result.validation?.validRate || 0,
      message: `Math validation found columns with ${result.validation?.validRate?.toFixed(0)}% accuracy`,
    };
  }

  return {
    found: false,
    reason: result.reason || 'Could not find valid column mapping',
    suggestion: 'Manual column mapping required',
  };
}

// ============================================
// Full Integration Function
// ============================================

/**
 * Enhance processing result with math validation
 * Call this at the end of processInvoice/completeOnboarding
 *
 * @param {Object} result - Processing result from orchestrator
 * @returns {Object} Enhanced result with math validation
 */
export function enhanceWithMathValidation(result) {
  if (!result || result.status === 'error') {
    return result;
  }

  const enhanced = { ...result };

  // Validate line items
  if (result.lines && result.lines.length > 0) {
    const lineValidation = validateAllLineItems(result.lines);
    enhanced.lines = lineValidation.lines;
    enhanced.mathValidation = {
      lineValidation: lineValidation.summary,
    };
  }

  // Validate invoice totals (cascade)
  if (result.invoice && enhanced.lines) {
    const cascadeResult = validateInvoiceTotals(result.invoice, enhanced.lines);
    enhanced.mathValidation = {
      ...enhanced.mathValidation,
      cascadeValidation: cascadeResult,
      allMathValid:
        enhanced.mathValidation?.lineValidation?.invalid === 0 &&
        cascadeResult.summary?.allValid,
    };
  }

  // Add summary message
  if (enhanced.mathValidation) {
    const lineRate = enhanced.mathValidation.lineValidation?.validRate || 0;
    const cascadeValid = enhanced.mathValidation.cascadeValidation?.summary?.allValid;

    if (lineRate === 100 && cascadeValid) {
      enhanced.mathValidation.status = 'FULLY_VALIDATED';
      enhanced.mathValidation.message = 'All math validates correctly ✓';
    } else if (lineRate >= 80) {
      enhanced.mathValidation.status = 'MOSTLY_VALID';
      enhanced.mathValidation.message = `${lineRate.toFixed(0)}% of lines validate`;
    } else {
      enhanced.mathValidation.status = 'NEEDS_REVIEW';
      enhanced.mathValidation.message = `Only ${lineRate.toFixed(0)}% of lines validate - review needed`;
    }
  }

  return enhanced;
}

// ============================================
// Quick Validation Helpers
// ============================================

/**
 * Quick check if a line's math is valid
 */
export function isLineValid(line) {
  if (!line.unitPrice || !line.totalPrice) return null; // Can't validate
  const result = validateLineItem(line);
  return result.mathValidation?.isValid ?? false;
}

/**
 * Get issues with invalid lines
 */
export function getInvalidLineIssues(lines) {
  return lines
    .filter((l) => l.mathValidation && !l.mathValidation.isValid)
    .map((l, i) => ({
      lineNumber: i + 1,
      description: l.description || l.name,
      expected: l.mathValidation.expected,
      calculated: l.mathValidation.calculated,
      difference: l.mathValidation.difference,
    }));
}

// ============================================
// Export
// ============================================

export default {
  // Line validation
  validateLineItem,
  validateAllLineItems,
  isLineValid,
  getInvalidLineIssues,

  // Invoice validation
  validateInvoiceTotals,

  // Column suggestion
  suggestColumnMapping,

  // Full integration
  enhanceWithMathValidation,
};
