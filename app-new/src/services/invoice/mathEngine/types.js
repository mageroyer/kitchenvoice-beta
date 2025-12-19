/**
 * Math Engine Types & Constants
 *
 * Core mathematical types for invoice validation.
 * The fundamental equation: B × P = T
 *
 * @module services/invoice/mathEngine/types
 */

// ============================================
// Core Math Fields
// ============================================

/**
 * The 3 atomic math fields required for validation
 */
export const MATH_FIELDS = {
  B: 'billingValue',   // The quantity used for pricing
  P: 'unitPrice',      // Price per billing unit
  T: 'totalPrice',     // Line total (output)
};

/**
 * Component fields that can derive B (billing value)
 */
export const BILLING_COMPONENTS = {
  C: 'count',          // Simple count
  W: 'weight',         // Weight value
  V: 'volume',         // Volume value
  N: 'packCount',      // Units per pack
  Wp: 'packWeight',    // Weight per pack unit
};

// ============================================
// Formula Types
// ============================================

/**
 * All supported formula types
 * Each describes how B (billing value) is calculated
 */
export const FORMULA_TYPE = {
  // Simple: B = direct value
  SIMPLE_COUNT: 'SIMPLE_COUNT',       // B = C (count)
  SIMPLE_WEIGHT: 'SIMPLE_WEIGHT',     // B = W (weight)
  SIMPLE_VOLUME: 'SIMPLE_VOLUME',     // B = V (volume)

  // Pack formats: B = C × multiplier
  PACK_WEIGHT: 'PACK_WEIGHT',         // B = C × N × Wp (e.g., 4/5LB)
  PACK_COUNT: 'PACK_COUNT',           // B = C × N (e.g., 12CT)
  PACK_PRICE: 'PACK_PRICE',           // B = C (price per pack)

  // Embedded: B extracted from description/format
  EMBEDDED_WEIGHT: 'EMBEDDED_WEIGHT', // B from "Caisse 4lb"

  // Special cases
  BILLING_QTY: 'BILLING_QTY',         // B = billingQuantity column

  // Unknown
  UNKNOWN: 'UNKNOWN',
};

/**
 * Formula definitions with their math
 */
export const FORMULAS = {
  [FORMULA_TYPE.SIMPLE_COUNT]: {
    name: 'Simple Count',
    equation: 'C × P = T',
    description: 'Count times unit price equals total',
    getB: (fields) => fields.count,
  },

  [FORMULA_TYPE.SIMPLE_WEIGHT]: {
    name: 'Simple Weight',
    equation: 'W × P = T',
    description: 'Weight times price per unit weight equals total',
    getB: (fields) => fields.weight,
  },

  [FORMULA_TYPE.SIMPLE_VOLUME]: {
    name: 'Simple Volume',
    equation: 'V × P = T',
    description: 'Volume times price per unit volume equals total',
    getB: (fields) => fields.volume,
  },

  [FORMULA_TYPE.PACK_WEIGHT]: {
    name: 'Pack Weight',
    equation: 'C × N × Wp × P = T',
    description: 'Count times pack units times unit weight times price equals total',
    getB: (fields) => fields.count * fields.packCount * fields.packWeight,
  },

  [FORMULA_TYPE.PACK_COUNT]: {
    name: 'Pack Count',
    equation: 'C × N × P = T',
    description: 'Count times units per pack times unit price equals total',
    getB: (fields) => fields.count * fields.packCount,
  },

  [FORMULA_TYPE.PACK_PRICE]: {
    name: 'Pack Price',
    equation: 'C × Ppack = T',
    description: 'Count times price per pack equals total',
    getB: (fields) => fields.count,
  },

  [FORMULA_TYPE.EMBEDDED_WEIGHT]: {
    name: 'Embedded Weight',
    equation: 'Wembedded × P = T',
    description: 'Weight extracted from format times price equals total',
    getB: (fields) => fields.embeddedWeight,
  },

  [FORMULA_TYPE.BILLING_QTY]: {
    name: 'Billing Quantity',
    equation: 'Bqty × P = T',
    description: 'Billing quantity column times price equals total',
    getB: (fields) => fields.billingQuantity,
  },
};

// ============================================
// Validation Constants
// ============================================

/**
 * Tolerance for math validation
 * Formula: ε = max(MIN_TOLERANCE, T × PERCENT_TOLERANCE)
 */
export const TOLERANCE = {
  MIN: 0.02,           // Minimum $0.02 tolerance
  PERCENT: 0.01,       // 1% of total as tolerance
};

/**
 * Calculate tolerance for a given total
 * @param {number} total - The line total
 * @returns {number} The tolerance value
 */
export function calculateTolerance(total) {
  return Math.max(TOLERANCE.MIN, Math.abs(total) * TOLERANCE.PERCENT);
}

/**
 * Check if two values match within tolerance
 * @param {number} calculated - The calculated value
 * @param {number} expected - The expected value (from invoice)
 * @returns {boolean} True if values match within tolerance
 */
export function matchesWithinTolerance(calculated, expected) {
  const tolerance = calculateTolerance(expected);
  return Math.abs(calculated - expected) <= tolerance;
}

// ============================================
// Validation Levels
// ============================================

/**
 * Validation levels in the cascade
 */
export const VALIDATION_LEVEL = {
  LINE: 'LINE',           // B × P = T
  SUM: 'SUM',             // Σ(T) = Subtotal
  TAX_TPS: 'TAX_TPS',     // Subtotal × 0.05 = TPS
  TAX_TVQ: 'TAX_TVQ',     // (Subtotal + TPS) × 0.09975 = TVQ
  TOTAL: 'TOTAL',         // Subtotal + TPS + TVQ = Grand
};

/**
 * Validation result status
 */
export const VALIDATION_STATUS = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  SKIPPED: 'SKIPPED',     // e.g., zero-price line
  UNKNOWN: 'UNKNOWN',
};

// ============================================
// Quebec Tax Constants
// ============================================

export const QUEBEC_TAX = {
  TPS_RATE: 0.05,         // Federal GST: 5%
  TVQ_RATE: 0.09975,      // Quebec QST: 9.975%
};

/**
 * Calculate expected Quebec taxes
 * @param {number} subtotal - Invoice subtotal
 * @returns {Object} Expected tax amounts
 */
export function calculateExpectedTaxes(subtotal) {
  const tps = Math.round(subtotal * QUEBEC_TAX.TPS_RATE * 100) / 100;
  const tvq = Math.round((subtotal + tps) * QUEBEC_TAX.TVQ_RATE * 100) / 100;
  return { tps, tvq, total: tps + tvq };
}

// ============================================
// Export
// ============================================

export default {
  MATH_FIELDS,
  BILLING_COMPONENTS,
  FORMULA_TYPE,
  FORMULAS,
  TOLERANCE,
  calculateTolerance,
  matchesWithinTolerance,
  VALIDATION_LEVEL,
  VALIDATION_STATUS,
  QUEBEC_TAX,
  calculateExpectedTaxes,
};
