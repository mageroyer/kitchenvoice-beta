/**
 * Invoice Processing Services
 *
 * New intelligent invoice processing flow.
 *
 * Usage:
 * ```javascript
 * import { processInvoice, completeOnboarding } from '../services/invoice';
 *
 * // Process an invoice
 * const result = await processInvoice(file);
 *
 * if (result.status === 'needs_onboarding') {
 *   // Show profile wizard UI
 *   // User confirms profile
 *   const finalResult = await completeOnboarding(vendorData, profile, result);
 * }
 * ```
 *
 * @module services/invoice
 */

// Main orchestrator
export {
  default as invoiceOrchestrator,
  processInvoice,
  completeOnboarding,
  saveInvoice,
  parsePackageFormat,
  PROCESSING_STATUS,
  UNIT_TAGS
} from './invoiceOrchestrator';

// Vendor detection
export {
  default as vendorDetector,
  detect as detectVendor,
  quickExtractVendorInfo,
  validateDetection
} from './vendorDetector';

// Parsing profiles
export {
  default as parsingProfileManager,
  getProfile,
  saveProfile,
  deleteProfile,
  updateStats as updateProfileStats,
  analyzeStructure,
  validateProfile,
  createProfileFromAnalysis
} from './parsingProfileManager';

// Intelligent matching
export {
  default as intelligentMatcher,
  matchLine,
  matchLines,
  getMatchingSummary
} from './intelligentMatcher';

// Types and constants
export {
  CONFIDENCE_THRESHOLDS,
  RECENCY_FACTORS,
  VENDOR_MATCH_BOOST,
  PROFILE_VERSION,
  LINE_TYPES
} from './types';

// Line Calculator - SINGLE SOURCE OF TRUTH for weight/price calculations
export {
  default as lineCalculator,
  parseFormat,
  extractFormatFromDescription,
  calculateLineValues,
  calculateAllLines,
  calculateWeightPerCase,
  calculateTotalWeight,
  calculatePricePerWeight,
  getCalculationSummary,
  FORMAT_TYPE,
  WEIGHT_TO_GRAMS
} from './lineCalculator';
