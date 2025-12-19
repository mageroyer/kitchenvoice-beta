/**
 * Line Validator
 *
 * Validates individual invoice lines using the formula: B × P = T
 * Tries different formula types to find which one validates.
 *
 * @module services/invoice/mathEngine/lineValidator
 */

import {
  FORMULA_TYPE,
  FORMULAS,
  VALIDATION_STATUS,
  matchesWithinTolerance,
  calculateTolerance,
} from './types.js';

// ============================================
// Line Validation
// ============================================

/**
 * Validate a single line using B × P = T formula
 *
 * @param {number} billingValue - The B value (quantity for pricing)
 * @param {number} unitPrice - The P value (price per unit)
 * @param {number} totalPrice - The T value (line total from invoice)
 * @returns {Object} Validation result
 */
export function validateLine(billingValue, unitPrice, totalPrice) {
  // Handle edge cases
  if (totalPrice === 0 && unitPrice === 0) {
    return {
      status: VALIDATION_STATUS.SKIPPED,
      reason: 'Zero price line (sample/promo)',
      calculated: 0,
      expected: 0,
      difference: 0,
    };
  }

  if (billingValue == null || unitPrice == null || totalPrice == null) {
    return {
      status: VALIDATION_STATUS.INVALID,
      reason: 'Missing required values',
      calculated: null,
      expected: totalPrice,
      difference: null,
    };
  }

  // Core formula: B × P = T
  const calculated = Math.round(billingValue * unitPrice * 100) / 100;
  const difference = Math.abs(calculated - totalPrice);
  const tolerance = calculateTolerance(totalPrice);
  const isValid = difference <= tolerance;

  return {
    status: isValid ? VALIDATION_STATUS.VALID : VALIDATION_STATUS.INVALID,
    formula: 'B × P = T',
    billingValue,
    unitPrice,
    calculated,
    expected: totalPrice,
    difference,
    tolerance,
    isValid,
  };
}

/**
 * Try all formula types to find which one validates
 *
 * @param {Object} fields - All available numeric fields from the line
 * @param {number} fields.count - Simple quantity/count
 * @param {number} fields.weight - Weight value
 * @param {number} fields.volume - Volume value
 * @param {number} fields.billingQuantity - Billing quantity column
 * @param {number} fields.packCount - Units per pack (N)
 * @param {number} fields.packWeight - Weight per pack unit (Wp)
 * @param {number} fields.embeddedWeight - Weight from format string
 * @param {number} fields.unitPrice - Price per unit
 * @param {number} fields.totalPrice - Line total
 * @returns {Object} Best matching formula result
 */
export function findValidFormula(fields) {
  const { unitPrice, totalPrice } = fields;
  const results = [];

  // Try each formula type
  const formulaOrder = [
    // Most specific first
    FORMULA_TYPE.BILLING_QTY,
    FORMULA_TYPE.PACK_WEIGHT,
    FORMULA_TYPE.PACK_COUNT,
    FORMULA_TYPE.EMBEDDED_WEIGHT,
    FORMULA_TYPE.SIMPLE_WEIGHT,
    FORMULA_TYPE.SIMPLE_VOLUME,
    FORMULA_TYPE.SIMPLE_COUNT,
    FORMULA_TYPE.PACK_PRICE,
  ];

  for (const formulaType of formulaOrder) {
    const formula = FORMULAS[formulaType];
    if (!formula) continue;

    try {
      const billingValue = formula.getB(fields);

      // Skip if B is null, undefined, or NaN
      if (billingValue == null || isNaN(billingValue) || billingValue === 0) {
        continue;
      }

      const result = validateLine(billingValue, unitPrice, totalPrice);

      results.push({
        formulaType,
        formulaName: formula.name,
        equation: formula.equation,
        billingValue,
        ...result,
      });

      // If we found a valid formula, we can stop (most specific first)
      if (result.isValid) {
        return {
          found: true,
          bestMatch: results[results.length - 1],
          allResults: results,
        };
      }
    } catch (e) {
      // Formula couldn't be applied (missing fields)
      continue;
    }
  }

  // No valid formula found
  return {
    found: false,
    bestMatch: results.length > 0 ? findClosestMatch(results) : null,
    allResults: results,
  };
}

/**
 * Find the closest matching result (smallest difference)
 *
 * @param {Array} results - Array of validation results
 * @returns {Object} The result with smallest difference
 */
function findClosestMatch(results) {
  if (results.length === 0) return null;

  return results.reduce((best, current) => {
    if (current.difference == null) return best;
    if (best.difference == null) return current;
    return current.difference < best.difference ? current : best;
  }, results[0]);
}

// ============================================
// Batch Validation
// ============================================

/**
 * Validate all lines in an invoice
 *
 * @param {Array} lines - Array of line objects with numeric fields
 * @returns {Object} Batch validation result
 */
export function validateAllLines(lines) {
  const results = [];
  let validCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = findValidFormula({
      count: line.quantity || line.count,
      weight: line.weight,
      volume: line.volume,
      billingQuantity: line.billingQuantity,
      packCount: line.packCount,
      packWeight: line.packWeight,
      embeddedWeight: line.embeddedWeight,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    });

    const lineResult = {
      lineNumber: i + 1,
      description: line.description,
      ...result,
    };

    results.push(lineResult);

    if (result.bestMatch?.status === VALIDATION_STATUS.VALID) {
      validCount++;
    } else if (result.bestMatch?.status === VALIDATION_STATUS.SKIPPED) {
      skippedCount++;
    } else {
      invalidCount++;
    }
  }

  return {
    results,
    summary: {
      total: lines.length,
      valid: validCount,
      invalid: invalidCount,
      skipped: skippedCount,
      validRate: lines.length > 0 ? (validCount / lines.length) * 100 : 0,
    },
    allValid: invalidCount === 0,
  };
}

// ============================================
// Reverse Calculation (Derive missing value)
// ============================================

/**
 * Derive missing value using the formula B × P = T
 *
 * @param {Object} known - Known values (2 of 3 required)
 * @param {number} [known.B] - Billing value
 * @param {number} [known.P] - Unit price
 * @param {number} [known.T] - Total price
 * @returns {Object} Derived value
 */
export function deriveValue(known) {
  const { B, P, T } = known;

  // Count known values
  const hasB = B != null && B !== 0;
  const hasP = P != null && P !== 0;
  const hasT = T != null;

  if (hasB && hasP && !hasT) {
    // Derive T: B × P = T
    return {
      derived: 'T',
      value: Math.round(B * P * 100) / 100,
      formula: `${B} × ${P} = ${Math.round(B * P * 100) / 100}`,
    };
  }

  if (hasB && hasT && !hasP) {
    // Derive P: P = T / B
    return {
      derived: 'P',
      value: Math.round((T / B) * 100) / 100,
      formula: `${T} / ${B} = ${Math.round((T / B) * 100) / 100}`,
    };
  }

  if (hasP && hasT && !hasB) {
    // Derive B: B = T / P
    return {
      derived: 'B',
      value: Math.round((T / P) * 100) / 100,
      formula: `${T} / ${P} = ${Math.round((T / P) * 100) / 100}`,
    };
  }

  return {
    derived: null,
    error: 'Need exactly 2 known values to derive the third',
  };
}

// ============================================
// Export
// ============================================

export default {
  validateLine,
  findValidFormula,
  validateAllLines,
  deriveValue,
};
