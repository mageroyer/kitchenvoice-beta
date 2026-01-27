/**
 * Invoice Processing Types
 *
 * JSDoc type definitions for invoice processing services.
 *
 * @module services/invoice/types
 */

// ============================================
// VENDOR DETECTION TYPES
// ============================================

/**
 * @typedef {'exact' | 'high' | 'medium' | 'low' | 'none'} DetectionConfidence
 */

/**
 * @typedef {'taxNumber' | 'phone' | 'email' | 'exactName' | 'fuzzyName' | 'none'} DetectionMethod
 */

/**
 * @typedef {Object} VendorDetectionResult
 * @property {Object|null} vendor - Matched vendor or null
 * @property {DetectionConfidence} confidence - Confidence level
 * @property {DetectionMethod} method - How vendor was detected
 * @property {boolean} isNew - True if no vendor found (needs creation)
 * @property {Object} extractedInfo - Info extracted from invoice for new vendor
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Line types for classification
 */
export const LINE_TYPES = {
  PRODUCT: 'product',
  DEPOSIT: 'deposit',
  FEE: 'fee',
  CREDIT: 'credit',
  ZERO: 'zero'
};

export default {
  LINE_TYPES
};
