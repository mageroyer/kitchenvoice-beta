/**
 * Invoice Handler Types
 *
 * Type definitions for invoice type handlers.
 * Each handler is specialized for a specific vendor category.
 *
 * @module services/invoice/handlers/types
 */

// ============================================
// LINE TYPE CLASSIFICATION
// ============================================

/**
 * Line type classification for accounting/inventory routing.
 * Determines how each line item is processed downstream.
 */
export const LINE_TYPE = {
  /** Regular inventory item - goes to inventory + accounting */
  PRODUCT: 'product',

  /** Bottle deposit, consignment, container fee - tracked separately */
  DEPOSIT: 'deposit',

  /** Delivery, shipping, freight charges - accounting only */
  FEE: 'fee',

  /** Returns, refunds, credits - negative values */
  CREDIT: 'credit',

  /** Zero quantity or zero price items - informational only */
  ZERO: 'zero',
};

/**
 * Confidence levels for processed data
 */
export const CONFIDENCE = {
  HIGH: 'high',       // Validated extraction
  MEDIUM: 'medium',   // AI-only data
  LOW: 'low',         // Needs review
  MANUAL: 'manual',   // Needs manual entry
};

/**
 * Data source indicators
 */
export const SOURCE = {
  LOCAL: 'local',     // From local extraction
  CLAUDE: 'claude',   // From Claude AI parsing
  MERGED: 'merged',   // Combination of both
  USER: 'user',       // User-provided override
};

// ============================================
// ANALYSIS TYPES
// ============================================

/**
 * Analysis result status codes
 */
export const ANALYSIS_STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Anomaly type codes for line analysis
 */
export const ANOMALY_TYPES = {
  // Math validation
  MATH_MISMATCH: 'math_mismatch',

  // Line item issues
  ZERO_PRICE: 'zero_price',
  MISSING_QUANTITY: 'missing_quantity',
  NEGATIVE_VALUE: 'negative_value',

  // Weight-related (food supply specific)
  MISSING_WEIGHT: 'missing_weight',
  WEIGHT_DISCREPANCY: 'weight_discrepancy',

  // Invoice totals (universal - stays in invoiceAnalyzer)
  SUBTOTAL_MISMATCH: 'subtotal_mismatch',
  TAX_MISMATCH: 'tax_mismatch',
  TPS_MISMATCH: 'tps_mismatch',
  TVQ_MISMATCH: 'tvq_mismatch',
  TAX_EXEMPT: 'tax_exempt',
  TOTAL_MISMATCH: 'total_mismatch',
  DUPLICATE_INVOICE: 'duplicate_invoice',
};

/**
 * Tolerance for math validation (in dollars)
 */
export const MATH_TOLERANCE = 0.02;

/**
 * Math tolerance thresholds for confidence scoring
 */
export const MATH_TOLERANCE_THRESHOLDS = {
  EXACT: 0,          // Perfect match
  ROUNDING: 0.01,    // Rounding difference
  ACCEPTABLE: 0.02,  // Within tolerance
  MINOR: 0.10,       // Small discrepancy
  REVIEW: 1.00,      // Needs review
};

/**
 * Confidence scores for various validation states
 */
export const CONFIDENCE_SCORE = {
  // Math validation
  MATH_EXACT: 100,
  MATH_ROUNDING: 95,
  MATH_TOLERANCE: 90,
  MATH_MINOR: 70,
  MATH_REVIEW: 50,
  MATH_ERROR: 0,
};

/**
 * Confidence level thresholds
 */
export const CONFIDENCE_THRESHOLD = {
  HIGH: 80,
  MEDIUM: 60,
  LOW: 40,
};

/**
 * Field source indicators for extraction tracking
 */
export const FIELD_SOURCE = {
  MAPPED: 'mapped',       // From vendor profile column mapping
  VISION: 'vision',       // From Vision API direct field
  EXTRACTED: 'extracted', // From description/format parsing
  DEFAULT: 'default',     // Default value used
  CALCULATED: 'calculated', // Derived from other fields
};

// ============================================
// INVOICE TYPES
// ============================================

/**
 * Invoice type identifiers.
 * Stored in vendor profile to determine which handler to use.
 */
export const INVOICE_TYPES = {
  /** Food/ingredient suppliers (Sysco, GFS, local farms) */
  FOOD_SUPPLY: 'foodSupply',

  /** Packaging/container distributors (Carrousel Emballage) */
  PACKAGING_DISTRIBUTOR: 'packagingDistributor',

  /** Fresh produce vendors with weight-based pricing */
  PRODUCE: 'produce',

  /** Chemical/cleaning supply vendors */
  CHEMICAL_SUPPLY: 'chemicalSupply',

  /** Utility bills (electricity, gas, water) */
  UTILITIES: 'utilities',

  /** Service providers (repairs, maintenance, cleaning) */
  SERVICES: 'services',

  /** Generic fallback for untyped vendors */
  GENERIC: 'generic'
};

/**
 * @typedef {'foodSupply' | 'packagingDistributor' | 'produce' | 'chemicalSupply' | 'utilities' | 'services' | 'generic'} InvoiceType
 */

// ============================================
// HANDLER INTERFACE
// ============================================

/**
 * @typedef {Object} FieldMappings
 * @property {Object.<string, string>} columns - Maps column types to item field names
 * @property {string[]} requiredColumns - Columns that must be present
 * @property {string[]} optionalColumns - Columns that are optional
 */

/**
 * @typedef {Object} WizardOption
 * @property {string} key - Unique key for the option
 * @property {string} label - Display label
 * @property {string} description - Detailed description
 * @property {'checkbox' | 'select' | 'input'} type - Input type
 * @property {*} defaultValue - Default value for the option
 * @property {Array} [options] - Options for select type
 */

/**
 * @typedef {Object} WizardConfig
 * @property {string} icon - Emoji icon for the type
 * @property {string} title - Display title
 * @property {string} description - Short description
 * @property {string[]} examples - Example vendors of this type
 * @property {WizardOption[]} options - Type-specific configuration options
 * @property {boolean} [comingSoon] - Whether this type is not yet implemented
 */

/**
 * @typedef {Object} InvoiceTypeHandler
 * @property {InvoiceType} type - Handler type identifier
 * @property {string} label - Human-readable label for UI
 * @property {string} description - Description of what this handler is for
 * @property {FieldMappings} fieldMappings - Column to field mappings
 * @property {Function} createInventoryItem - Creates inventory item from invoice line
 * @property {Function} updateInventoryItem - Updates existing item from invoice line
 * @property {Function} validateLine - Validates an invoice line
 */

/**
 * @typedef {Object} LineValidationResult
 * @property {boolean} valid - Whether line is valid
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 */

/**
 * @typedef {Object} CreateItemResult
 * @property {Object} item - The created inventory item
 * @property {Object} updates - Fields that were set/updated
 * @property {string[]} warnings - Any warnings during creation
 */

export default {
  INVOICE_TYPES,
  LINE_TYPE,
  CONFIDENCE,
  SOURCE,
  ANALYSIS_STATUS,
  ANOMALY_TYPES,
  MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,
  CONFIDENCE_SCORE,
  CONFIDENCE_THRESHOLD,
  FIELD_SOURCE,
};
