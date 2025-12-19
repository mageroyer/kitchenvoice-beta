/**
 * Cascade Validator
 *
 * Validates invoice totals in sequence:
 * 1. Line Sum: Σ(T) = Subtotal
 * 2. TPS Tax: Subtotal × 5% = TPS
 * 3. TVQ Tax: (Subtotal + TPS) × 9.975% = TVQ
 * 4. Grand Total: Subtotal + TPS + TVQ = Grand
 *
 * @module services/invoice/mathEngine/cascadeValidator
 */

import {
  VALIDATION_LEVEL,
  VALIDATION_STATUS,
  QUEBEC_TAX,
  calculateExpectedTaxes,
  calculateTolerance,
} from './types.js';

// ============================================
// Sum Validation
// ============================================

/**
 * Validate that line totals sum to subtotal
 *
 * @param {Array<number>} lineTotals - Array of line total values
 * @param {number} invoiceSubtotal - Subtotal from invoice
 * @returns {Object} Validation result
 */
export function validateSum(lineTotals, invoiceSubtotal) {
  if (!Array.isArray(lineTotals) || lineTotals.length === 0) {
    return {
      level: VALIDATION_LEVEL.SUM,
      status: VALIDATION_STATUS.INVALID,
      reason: 'No line totals provided',
      calculated: null,
      expected: invoiceSubtotal,
      difference: null,
    };
  }

  if (invoiceSubtotal == null) {
    return {
      level: VALIDATION_LEVEL.SUM,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'Invoice subtotal not available',
      calculated: null,
      expected: null,
      difference: null,
    };
  }

  // Sum all line totals
  const calculatedSum = lineTotals.reduce((sum, t) => {
    const value = typeof t === 'number' ? t : parseFloat(t) || 0;
    return sum + value;
  }, 0);

  // Round to 2 decimal places
  const roundedSum = Math.round(calculatedSum * 100) / 100;
  const difference = Math.abs(roundedSum - invoiceSubtotal);
  const tolerance = calculateTolerance(invoiceSubtotal);
  const isValid = difference <= tolerance;

  return {
    level: VALIDATION_LEVEL.SUM,
    status: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    formula: 'Σ(T) = Subtotal',
    lineCount: lineTotals.length,
    calculated: roundedSum,
    expected: invoiceSubtotal,
    difference,
    tolerance,
    isValid,
  };
}

// ============================================
// Tax Validation
// ============================================

/**
 * Validate TPS (Federal GST) tax
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} invoiceTPS - TPS amount from invoice
 * @returns {Object} Validation result
 */
export function validateTPS(subtotal, invoiceTPS) {
  if (subtotal == null) {
    return {
      level: VALIDATION_LEVEL.TAX_TPS,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'Subtotal not available',
    };
  }

  // TPS might be null for tax-exempt invoices
  if (invoiceTPS == null || invoiceTPS === 0) {
    return {
      level: VALIDATION_LEVEL.TAX_TPS,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'TPS not present (may be tax-exempt)',
      calculated: Math.round(subtotal * QUEBEC_TAX.TPS_RATE * 100) / 100,
      expected: invoiceTPS || 0,
      isTaxExempt: true,
    };
  }

  // Calculate expected TPS: Subtotal × 5%
  const expectedTPS = Math.round(subtotal * QUEBEC_TAX.TPS_RATE * 100) / 100;
  const difference = Math.abs(expectedTPS - invoiceTPS);
  const tolerance = Math.max(0.02, invoiceTPS * 0.01);
  const isValid = difference <= tolerance;

  return {
    level: VALIDATION_LEVEL.TAX_TPS,
    status: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    formula: `Subtotal × ${QUEBEC_TAX.TPS_RATE * 100}% = TPS`,
    rate: QUEBEC_TAX.TPS_RATE,
    calculated: expectedTPS,
    expected: invoiceTPS,
    difference,
    tolerance,
    isValid,
  };
}

/**
 * Validate TVQ (Quebec QST) tax
 * Note: TVQ is calculated on (Subtotal + TPS), not just Subtotal
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} tps - TPS amount (for compound calculation)
 * @param {number} invoiceTVQ - TVQ amount from invoice
 * @returns {Object} Validation result
 */
export function validateTVQ(subtotal, tps, invoiceTVQ) {
  if (subtotal == null) {
    return {
      level: VALIDATION_LEVEL.TAX_TVQ,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'Subtotal not available',
    };
  }

  // TVQ might be null for tax-exempt invoices
  if (invoiceTVQ == null || invoiceTVQ === 0) {
    const effectiveTPS = tps || 0;
    return {
      level: VALIDATION_LEVEL.TAX_TVQ,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'TVQ not present (may be tax-exempt)',
      calculated: Math.round((subtotal + effectiveTPS) * QUEBEC_TAX.TVQ_RATE * 100) / 100,
      expected: invoiceTVQ || 0,
      isTaxExempt: true,
    };
  }

  // Compound rule: TVQ = (Subtotal + TPS) × 9.975%
  const effectiveTPS = tps || 0;
  const taxBase = subtotal + effectiveTPS;
  const expectedTVQ = Math.round(taxBase * QUEBEC_TAX.TVQ_RATE * 100) / 100;
  const difference = Math.abs(expectedTVQ - invoiceTVQ);
  const tolerance = Math.max(0.02, invoiceTVQ * 0.01);
  const isValid = difference <= tolerance;

  return {
    level: VALIDATION_LEVEL.TAX_TVQ,
    status: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    formula: `(Subtotal + TPS) × ${QUEBEC_TAX.TVQ_RATE * 100}% = TVQ`,
    rate: QUEBEC_TAX.TVQ_RATE,
    taxBase,
    calculated: expectedTVQ,
    expected: invoiceTVQ,
    difference,
    tolerance,
    isValid,
    isCompound: true,
  };
}

/**
 * Validate both taxes together
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} invoiceTPS - TPS from invoice
 * @param {number} invoiceTVQ - TVQ from invoice
 * @returns {Object} Combined tax validation result
 */
export function validateTaxes(subtotal, invoiceTPS, invoiceTVQ) {
  const tpsResult = validateTPS(subtotal, invoiceTPS);
  const tvqResult = validateTVQ(subtotal, invoiceTPS, invoiceTVQ);

  const expected = calculateExpectedTaxes(subtotal);
  const actualTotal = (invoiceTPS || 0) + (invoiceTVQ || 0);

  const isTaxExempt =
    tpsResult.isTaxExempt && tvqResult.isTaxExempt;

  const bothValid =
    (tpsResult.isValid || tpsResult.isTaxExempt) &&
    (tvqResult.isValid || tvqResult.isTaxExempt);

  return {
    tps: tpsResult,
    tvq: tvqResult,
    summary: {
      isTaxExempt,
      bothValid,
      expectedTotal: expected.total,
      actualTotal,
      difference: Math.abs(expected.total - actualTotal),
    },
  };
}

// ============================================
// Grand Total Validation
// ============================================

/**
 * Validate grand total
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} tps - TPS amount
 * @param {number} tvq - TVQ amount
 * @param {number} invoiceTotal - Grand total from invoice
 * @returns {Object} Validation result
 */
export function validateGrandTotal(subtotal, tps, tvq, invoiceTotal) {
  if (subtotal == null || invoiceTotal == null) {
    return {
      level: VALIDATION_LEVEL.TOTAL,
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'Subtotal or total not available',
    };
  }

  // Grand Total = Subtotal + TPS + TVQ
  const effectiveTPS = tps || 0;
  const effectiveTVQ = tvq || 0;
  const calculatedTotal = Math.round((subtotal + effectiveTPS + effectiveTVQ) * 100) / 100;

  const difference = Math.abs(calculatedTotal - invoiceTotal);
  const tolerance = calculateTolerance(invoiceTotal);
  const isValid = difference <= tolerance;

  return {
    level: VALIDATION_LEVEL.TOTAL,
    status: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    formula: 'Subtotal + TPS + TVQ = Grand Total',
    components: {
      subtotal,
      tps: effectiveTPS,
      tvq: effectiveTVQ,
    },
    calculated: calculatedTotal,
    expected: invoiceTotal,
    difference,
    tolerance,
    isValid,
  };
}

// ============================================
// Full Cascade Validation
// ============================================

/**
 * Run full cascade validation on an invoice
 *
 * @param {Object} invoice - Invoice data
 * @param {Array<number>} invoice.lineTotals - Line total values
 * @param {number} invoice.subtotal - Invoice subtotal
 * @param {number} invoice.tps - TPS tax amount
 * @param {number} invoice.tvq - TVQ tax amount
 * @param {number} invoice.grandTotal - Grand total
 * @returns {Object} Complete validation result
 */
export function validateCascade(invoice) {
  const {
    lineTotals = [],
    subtotal,
    tps,
    tvq,
    grandTotal,
  } = invoice;

  // Step 1: Validate line sum
  const sumResult = validateSum(lineTotals, subtotal);

  // Step 2: Validate taxes
  const taxResult = validateTaxes(subtotal, tps, tvq);

  // Step 3: Validate grand total
  const totalResult = validateGrandTotal(subtotal, tps, tvq, grandTotal);

  // Calculate overall status
  const validations = [
    sumResult,
    taxResult.tps,
    taxResult.tvq,
    totalResult,
  ];

  const validCount = validations.filter(
    (v) => v.status === VALIDATION_STATUS.VALID || v.status === VALIDATION_STATUS.SKIPPED
  ).length;

  const invalidCount = validations.filter(
    (v) => v.status === VALIDATION_STATUS.INVALID
  ).length;

  const allValid = invalidCount === 0;

  return {
    results: {
      sum: sumResult,
      tps: taxResult.tps,
      tvq: taxResult.tvq,
      total: totalResult,
    },
    summary: {
      allValid,
      validCount,
      invalidCount,
      skippedCount: validations.filter((v) => v.status === VALIDATION_STATUS.SKIPPED).length,
      taxSummary: taxResult.summary,
    },
    cascade: [
      { level: 'LINE_SUM', ...sumResult },
      { level: 'TAX_TPS', ...taxResult.tps },
      { level: 'TAX_TVQ', ...taxResult.tvq },
      { level: 'GRAND_TOTAL', ...totalResult },
    ],
  };
}

/**
 * Quick validation - returns true/false for math correctness
 *
 * @param {Object} invoice - Invoice data
 * @returns {boolean} True if all math validates
 */
export function isInvoiceMathValid(invoice) {
  const result = validateCascade(invoice);
  return result.summary.allValid;
}

/**
 * Get validation summary message
 *
 * @param {Object} cascadeResult - Result from validateCascade
 * @returns {string} Human-readable summary
 */
export function getValidationSummary(cascadeResult) {
  const { summary, results } = cascadeResult;

  if (summary.allValid) {
    return 'All math validates correctly ✓';
  }

  const issues = [];

  if (results.sum.status === VALIDATION_STATUS.INVALID) {
    issues.push(`Line sum off by $${results.sum.difference.toFixed(2)}`);
  }

  if (results.tps.status === VALIDATION_STATUS.INVALID) {
    issues.push(`TPS off by $${results.tps.difference.toFixed(2)}`);
  }

  if (results.tvq.status === VALIDATION_STATUS.INVALID) {
    issues.push(`TVQ off by $${results.tvq.difference.toFixed(2)}`);
  }

  if (results.total.status === VALIDATION_STATUS.INVALID) {
    issues.push(`Grand total off by $${results.total.difference.toFixed(2)}`);
  }

  return `Math issues: ${issues.join(', ')}`;
}

// ============================================
// Export
// ============================================

export default {
  validateSum,
  validateTPS,
  validateTVQ,
  validateTaxes,
  validateGrandTotal,
  validateCascade,
  isInvoiceMathValid,
  getValidationSummary,
};
