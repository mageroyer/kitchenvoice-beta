/**
 * Invoice Analyzer - Universal Validation
 *
 * Performs universal invoice validation that applies to ALL invoice types:
 * - Validate invoice totals (subtotal + tax = total)
 * - Quebec tax validation (TPS/TVQ compound rule)
 * - Check for duplicate invoices
 *
 * NOTE: Line item analysis (weight extraction, math validation, anomaly detection)
 * has been moved to type-specific handlers in services/invoice/handlers/.
 * Each handler has its own processLines() method that does type-specific analysis.
 *
 * @module services/inventory/invoiceAnalyzer
 */

import { invoiceDB } from '../database/indexedDB';
// Import Quebec tax config from central source
import { QUEBEC_TAX } from '../invoice/mathEngine/types';

// Re-export for backwards compatibility
export { QUEBEC_TAX };

// ============================================
// Constants
// ============================================

/**
 * Tolerance for totals validation (in dollars)
 * Invoice totals may have larger rounding differences
 */
export const TOTALS_TOLERANCE = 1.00;

/**
 * Analysis result status codes
 */
export const ANALYSIS_STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Anomaly type codes (totals/invoice-level only)
 * Line-level anomaly types are in handlers/types.js
 */
export const ANOMALY_TYPES = {
  SUBTOTAL_MISMATCH: 'subtotal_mismatch',
  TAX_MISMATCH: 'tax_mismatch',
  TPS_MISMATCH: 'tps_mismatch',
  TVQ_MISMATCH: 'tvq_mismatch',
  TAX_EXEMPT: 'tax_exempt',
  TOTAL_MISMATCH: 'total_mismatch',
  DUPLICATE_INVOICE: 'duplicate_invoice',
};

// ============================================
// Quebec Tax Validation
// ============================================

/**
 * Calculate expected Quebec taxes using compound rule
 * TVQ is calculated on (subtotal + TPS), not just subtotal
 *
 * @param {number} subtotal - Invoice subtotal before taxes
 * @returns {Object} Expected tax amounts
 */
export function calculateQuebecTaxes(subtotal) {
  if (subtotal <= 0) {
    return { tps: 0, tvq: 0, total: 0, combinedRate: 0 };
  }

  // TPS (GST) = 5% of subtotal
  const tps = Math.round(subtotal * QUEBEC_TAX.TPS_RATE * 100) / 100;

  // TVQ (QST) = 9.975% of (subtotal + TPS) - COMPOUND RULE
  const tvq = Math.round((subtotal + tps) * QUEBEC_TAX.TVQ_RATE * 100) / 100;

  const total = Math.round((tps + tvq) * 100) / 100;

  // Effective combined rate (for reference)
  const combinedRate = (total / subtotal) * 100;

  return { tps, tvq, total, combinedRate };
}

/**
 * Validate Quebec taxes (TPS/GST and TVQ/QST)
 * Uses compound tax rule: TVQ = (subtotal + TPS) × 9.975%
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} invoiceTPS - TPS amount from invoice (taxGST)
 * @param {number} invoiceTVQ - TVQ amount from invoice (taxQST)
 * @returns {Object} Validation result with anomalies
 */
export function validateQuebecTaxes(subtotal, invoiceTPS, invoiceTVQ) {
  const anomalies = [];

  // Handle null/undefined gracefully
  const actualTPS = parseFloat(invoiceTPS) || 0;
  const actualTVQ = parseFloat(invoiceTVQ) || 0;
  const actualTotal = actualTPS + actualTVQ;

  // Calculate expected taxes
  const expected = calculateQuebecTaxes(subtotal);

  // Calculate tolerances (0.5% or $0.02 minimum)
  const tpsTolerance = Math.max(expected.tps * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN);
  const tvqTolerance = Math.max(expected.tvq * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN);

  // Track validation results
  let tpsValid = true;
  let tvqValid = true;
  let isTaxExempt = false;

  // Check for tax-exempt scenario
  if (subtotal > 0 && actualTPS === 0 && actualTVQ === 0) {
    isTaxExempt = true;
    anomalies.push({
      type: ANOMALY_TYPES.TAX_EXEMPT,
      severity: 'info',
      message: 'No taxes detected - verify if vendor is tax-exempt or taxes are included in prices',
      subtotal,
    });
  }

  // Validate TPS (GST) - 5%
  if (!isTaxExempt && subtotal > 0) {
    const tpsDiff = Math.abs(actualTPS - expected.tps);
    if (tpsDiff > tpsTolerance) {
      tpsValid = false;
      const tpsRate = (actualTPS / subtotal) * 100;
      anomalies.push({
        type: ANOMALY_TYPES.TPS_MISMATCH,
        severity: 'warning',
        message: `TPS/GST mismatch: Expected $${expected.tps.toFixed(2)} (5%), invoice shows $${actualTPS.toFixed(2)} (${tpsRate.toFixed(2)}%)`,
        expected: expected.tps,
        actual: actualTPS,
        difference: tpsDiff,
        expectedRate: QUEBEC_TAX.TPS_RATE * 100,
        actualRate: tpsRate,
      });
    }
  }

  // Validate TVQ (QST) - 9.975% compound
  if (!isTaxExempt && subtotal > 0) {
    const tvqDiff = Math.abs(actualTVQ - expected.tvq);
    if (tvqDiff > tvqTolerance) {
      tvqValid = false;
      const tvqBase = subtotal + actualTPS;
      const tvqRate = tvqBase > 0 ? (actualTVQ / tvqBase) * 100 : 0;
      anomalies.push({
        type: ANOMALY_TYPES.TVQ_MISMATCH,
        severity: 'warning',
        message: `TVQ/QST mismatch: Expected $${expected.tvq.toFixed(2)} (9.975% compound), invoice shows $${actualTVQ.toFixed(2)} (${tvqRate.toFixed(2)}%)`,
        expected: expected.tvq,
        actual: actualTVQ,
        difference: tvqDiff,
        expectedRate: QUEBEC_TAX.TVQ_RATE * 100,
        actualRate: tvqRate,
        note: 'TVQ is calculated on (subtotal + TPS), not just subtotal',
      });
    }
  }

  return {
    expected,
    actual: { tps: actualTPS, tvq: actualTVQ, total: actualTotal },
    tpsValid,
    tvqValid,
    isTaxExempt,
    anomalies,
    hasAnomalies: anomalies.length > 0,
    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

// ============================================
// Invoice Totals Validation
// ============================================

/**
 * Validate invoice totals
 * Checks subtotal, tax, and total calculations
 * Supports both legacy single taxAmount and Quebec-specific TPS/TVQ
 *
 * @param {Object} totals - Invoice totals from parsed data
 * @param {number} calculatedSubtotal - Sum of line items (from handler.processLines())
 * @returns {Object} Validation result with anomalies
 */
export function validateTotals(totals, calculatedSubtotal) {
  const anomalies = [];

  const subtotal = parseFloat(totals?.subtotal) || 0;
  const totalAmount = parseFloat(totals?.totalAmount) || 0;

  // Support both formats: separate TPS/TVQ or combined taxAmount
  const taxGST = parseFloat(totals?.taxGST) || parseFloat(totals?.taxTPS) || 0;
  const taxQST = parseFloat(totals?.taxQST) || parseFloat(totals?.taxTVQ) || 0;
  const taxAmount = parseFloat(totals?.taxAmount) || (taxGST + taxQST);

  // Check subtotal matches sum of line items
  const subtotalDiff = Math.abs(calculatedSubtotal - subtotal);
  if (subtotalDiff > TOTALS_TOLERANCE && subtotal > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.SUBTOTAL_MISMATCH,
      severity: 'warning',
      message: `Subtotal mismatch: Line items sum to $${calculatedSubtotal.toFixed(2)}, but invoice shows $${subtotal.toFixed(2)}`,
      calculated: calculatedSubtotal,
      invoiceValue: subtotal,
      difference: subtotalDiff,
    });
  }

  // Quebec tax validation (TPS + TVQ with compound rule)
  let quebecTaxValidation = null;
  if (taxGST > 0 || taxQST > 0) {
    // Separate TPS/TVQ provided - do Quebec-specific validation
    quebecTaxValidation = validateQuebecTaxes(subtotal, taxGST, taxQST);
    anomalies.push(...quebecTaxValidation.anomalies);
  } else if (subtotal > 0 && taxAmount > 0) {
    // Legacy: single taxAmount - check if it matches expected Quebec combined rate
    const expected = calculateQuebecTaxes(subtotal);
    const taxDiff = Math.abs(taxAmount - expected.total);
    const tolerance = Math.max(expected.total * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN * 2);

    if (taxDiff > tolerance) {
      const taxRate = (taxAmount / subtotal) * 100;
      anomalies.push({
        type: ANOMALY_TYPES.TAX_MISMATCH,
        severity: 'warning',
        message: `Tax amount mismatch: Expected $${expected.total.toFixed(2)} (${expected.combinedRate.toFixed(2)}% Quebec rate), invoice shows $${taxAmount.toFixed(2)} (${taxRate.toFixed(1)}%)`,
        expected: expected.total,
        actual: taxAmount,
        difference: taxDiff,
        expectedRate: expected.combinedRate,
        actualRate: taxRate,
      });
    }
  }

  // Check total = subtotal + taxes
  const expectedTotal = subtotal + taxAmount;
  const totalDiff = Math.abs(expectedTotal - totalAmount);
  if (totalDiff > TOTALS_TOLERANCE && totalAmount > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.TOTAL_MISMATCH,
      severity: 'warning',
      message: `Total mismatch: $${subtotal.toFixed(2)} + $${taxAmount.toFixed(2)} tax = $${expectedTotal.toFixed(2)}, but invoice shows $${totalAmount.toFixed(2)}`,
      calculated: expectedTotal,
      invoiceValue: totalAmount,
      difference: totalDiff,
    });
  }

  return {
    subtotal,
    taxAmount,
    taxGST,
    taxQST,
    totalAmount,
    calculatedSubtotal,
    expectedTotal,

    subtotalValid: subtotalDiff <= TOTALS_TOLERANCE,
    totalValid: totalDiff <= TOTALS_TOLERANCE,

    // Quebec tax validation results (if applicable)
    quebecTaxValidation,

    anomalies,
    hasAnomalies: anomalies.length > 0,

    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

// ============================================
// Duplicate Detection
// ============================================

/**
 * Check if invoice already exists in database
 * Uses indexed query for O(1) performance instead of full table scan.
 *
 * @param {string} vendorName - Vendor name
 * @param {string} invoiceNumber - Invoice number
 * @param {string} invoiceDate - Invoice date (YYYY-MM-DD) - reserved for future use
 * @returns {Promise<Object>} Duplicate check result
 */
export async function checkDuplicateInvoice(vendorName, invoiceNumber, _invoiceDate) {
  if (!invoiceNumber) {
    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'No invoice number provided',
    };
  }

  try {
    // Use optimized indexed query (O(1) instead of O(n) full scan)
    const result = await invoiceDB.checkDuplicate(vendorName, invoiceNumber);

    if (result.isDuplicate) {
      return {
        isDuplicate: true,
        existingInvoice: result.existingInvoice,
        message: `Duplicate found: Invoice #${invoiceNumber} from ${vendorName} already exists (ID: ${result.existingInvoice.id})`,
      };
    }

    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'No duplicate found',
    };

  } catch (error) {
    console.error('[Analyzer] Error checking for duplicate:', error);
    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'Could not check for duplicates',
      error: error.message,
    };
  }
}

// ============================================
// Invoice-Level Validation (Universal)
// ============================================

/**
 * Validate invoice totals and check for duplicates.
 * This is the universal validation that applies to ALL invoice types.
 *
 * NOTE: Line item analysis is now done by handlers via processLines().
 * This function only validates invoice-level data (totals, taxes, duplicates).
 *
 * @param {Object} parsedInvoice - Parsed invoice from Claude
 * @param {number} calculatedSubtotal - Sum of line items (from handler.processLines())
 * @returns {Promise<Object>} Validation result
 */
export async function validateInvoice(parsedInvoice, calculatedSubtotal) {
  const startTime = performance.now();

  const result = {
    analyzedAt: new Date().toISOString(),

    // Totals validation
    totals: null,

    // Duplicate check
    duplicateCheck: null,

    // All anomalies
    allAnomalies: [],

    // Summary
    summary: {
      status: ANALYSIS_STATUS.OK,
      totalAnomalies: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
    },
  };

  // Validate totals
  result.totals = validateTotals(parsedInvoice.totals, calculatedSubtotal);
  result.totals.anomalies.forEach(anomaly => {
    result.allAnomalies.push({
      ...anomaly,
      lineNumber: null,
      description: 'Invoice totals',
    });
  });

  // Check for duplicate invoice
  const vendorName = parsedInvoice.vendor?.name;
  const invoiceNumber = parsedInvoice.vendor?.invoiceNumber;
  const invoiceDate = parsedInvoice.vendor?.invoiceDate;

  result.duplicateCheck = await checkDuplicateInvoice(vendorName, invoiceNumber, invoiceDate);

  if (result.duplicateCheck.isDuplicate) {
    result.allAnomalies.push({
      type: ANOMALY_TYPES.DUPLICATE_INVOICE,
      severity: 'error',
      message: result.duplicateCheck.message,
      existingInvoice: result.duplicateCheck.existingInvoice,
      lineNumber: null,
      description: 'Invoice',
    });
  }

  // Calculate summary
  result.summary.totalAnomalies = result.allAnomalies.length;
  result.summary.errors = result.allAnomalies.filter(a => a.severity === 'error').length;
  result.summary.warnings = result.allAnomalies.filter(a => a.severity === 'warning').length;
  result.summary.infos = result.allAnomalies.filter(a => a.severity === 'info').length;

  if (result.summary.errors > 0) {
    result.summary.status = ANALYSIS_STATUS.ERROR;
  } else if (result.summary.warnings > 0) {
    result.summary.status = ANALYSIS_STATUS.WARNING;
  }

  return result;
}

/**
 * @deprecated Use validateInvoice() instead.
 * This function is kept for backwards compatibility but now delegates to validateInvoice().
 * Line item analysis is now done by handlers via processLines().
 */
export async function analyzeInvoice(parsedInvoice) {
  console.warn('[Analyzer] analyzeInvoice() is deprecated. Line analysis is now done by handlers.');

  // Calculate subtotal from line items (basic sum)
  const lineItems = parsedInvoice.lineItems || [];
  const calculatedSubtotal = lineItems.reduce((sum, line) =>
    sum + (parseFloat(line.totalPrice) || parseFloat(line.total) || 0), 0);

  // Use the new validateInvoice function
  const validation = await validateInvoice(parsedInvoice, calculatedSubtotal);

  // Return in legacy format for backwards compatibility
  return {
    analyzedAt: validation.analyzedAt,
    analysisVersion: '2.0.0',

    // Empty lineItems - analysis now done by handlers
    lineItems: {
      lines: [],
      summary: {
        totalLines: lineItems.length,
        linesWithWeight: 0,
        linesWithAnomalies: 0,
        totalAnomalies: 0,
        calculatedSubtotal: Math.round(calculatedSubtotal * 100) / 100,
      },
    },

    totals: validation.totals,
    duplicateCheck: validation.duplicateCheck,
    summary: validation.summary,
    allAnomalies: validation.allAnomalies,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get anomalies filtered by type
 *
 * @param {Object} validationResult - Result from validateInvoice
 * @param {string} type - Anomaly type to filter by
 * @returns {Array} Filtered anomalies
 */
export function getAnomaliesByType(validationResult, type) {
  return validationResult.allAnomalies.filter(a => a.type === type);
}

/**
 * Get anomalies filtered by severity
 *
 * @param {Object} validationResult - Result from validateInvoice
 * @param {string} severity - Severity level ('error', 'warning', 'info')
 * @returns {Array} Filtered anomalies
 */
export function getAnomaliesBySeverity(validationResult, severity) {
  return validationResult.allAnomalies.filter(a => a.severity === severity);
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  TOTALS_TOLERANCE,
  QUEBEC_TAX,
  ANALYSIS_STATUS,
  ANOMALY_TYPES,

  // Quebec tax validation
  calculateQuebecTaxes,
  validateQuebecTaxes,

  // Totals validation
  validateTotals,

  // Duplicate detection
  checkDuplicateInvoice,

  // Invoice validation (new)
  validateInvoice,

  // Legacy (deprecated)
  analyzeInvoice,

  // Utilities
  getAnomaliesByType,
  getAnomaliesBySeverity,
};
