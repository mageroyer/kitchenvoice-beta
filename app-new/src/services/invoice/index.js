/**
 * Invoice Processing Services
 *
 * Vision-based invoice parsing. For the main pipeline, use:
 * ```javascript
 * import { processInvoice } from '../services/invoice/vision';
 * const result = await processInvoice(pdfFile);
 * ```
 *
 * This index re-exports supporting modules (handlers, types, utilities).
 *
 * @module services/invoice
 */

// Vendor detection
export {
  default as vendorDetector,
  detect as detectVendor,
  quickExtractVendorInfo,
  validateDetection
} from './vendorDetector';

// Types and constants
export { LINE_TYPES } from './types';

// Food Supply Utilities - weight format parsing for food invoices
export {
  default as foodSupplyUtils,
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
} from './handlers/foodSupplyUtils';

// Line Categorizer - AI-powered item categorization
export {
  default as lineCategorizer,
  categorizeLineItems,
  categorizeSingleItem,
  categorizeLineItemsLocal,
  getCategoryDisplay,
  LINE_CATEGORY,
  LINE_TYPE,
  PRICING_TYPE
} from './lineCategorizer';
