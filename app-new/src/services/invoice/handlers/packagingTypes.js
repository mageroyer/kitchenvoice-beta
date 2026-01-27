/**
 * Packaging Distributor Handler Types
 *
 * JSDoc type definitions for the packaging distributor invoice handler.
 * Defines the ProcessedLine structure with validation gates and confidence tracking.
 *
 * Key difference from FoodSupply:
 * - Always UNIT-based pricing (no weight pricing)
 * - Boxing format (1/500, 6/RL) instead of weight format (2/5LB)
 * - Stock tracked in individual UNITS (pieces), not grams
 *
 * @module services/invoice/handlers/packagingTypes
 */

// ============================================================================
// FIELD SOURCE TRACKING
// ============================================================================

/**
 * Source of a field value - enables traceability back to origin
 * @typedef {'vision' | 'extracted' | 'calculated' | 'mapped' | 'default' | 'user'} FieldSource
 */

/**
 * Field source constants
 */
export const FIELD_SOURCE = {
  /** Direct from Claude Vision JSON */
  VISION: 'vision',

  /** Parsed from description or format string */
  EXTRACTED: 'extracted',

  /** Derived from other fields (e.g., totalUnits = packCount × unitsPerPack × qty) */
  CALCULATED: 'calculated',

  /** From vendor profile column mapping */
  MAPPED: 'mapped',

  /** Fallback value applied when no data available */
  DEFAULT: 'default',

  /** Manual user correction */
  USER: 'user',
};

// ============================================================================
// BOXING FORMAT TYPES
// ============================================================================

/**
 * Boxing format pattern type detected from format/description parsing
 * @typedef {'NESTED_UNITS' | 'ROLL' | 'SIMPLE_COUNT' | 'UNKNOWN'} BoxingFormatType
 */

/**
 * Boxing format type constants with descriptions
 */
export const BOXING_FORMAT_TYPE = {
  /** "10/100" or "10x100CT" - nested units: 10 packs × 100 per pack = 1000 total */
  NESTED_UNITS: 'NESTED_UNITS',

  /** "6/RL" or "6RL" - roll product: 6 rolls per case */
  ROLL: 'ROLL',

  /** "1/500" or "100CT" - simple count: items per case */
  SIMPLE_COUNT: 'SIMPLE_COUNT',

  /** "6x500ML" or "6x1.89L" - volume packaging */
  VOLUME: 'VOLUME',

  /** "1/20KG" or "4x2KG" - weight packaging */
  WEIGHT: 'WEIGHT',

  /** Unrecognized pattern */
  UNKNOWN: 'UNKNOWN',
};

// ============================================================================
// PRICING TYPE (Always UNIT for packaging)
// ============================================================================

/**
 * Pricing calculation type
 * @typedef {'unit'} PackagingPricingType
 */

/**
 * Pricing type constant - packaging is always unit-based
 */
export const PRICING_TYPE = {
  /** Price per unit ($/case) - packaging default */
  UNIT: 'unit',
};

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

/**
 * Confidence level thresholds
 */
export const CONFIDENCE_THRESHOLD = {
  /** High confidence - auto-process without review */
  HIGH: 90,

  /** Medium confidence - review recommended */
  MEDIUM: 70,

  /** Low confidence - needs attention */
  LOW: 50,

  /** Very low - likely has issues */
  CRITICAL: 30,
};

/**
 * Confidence scores for different extraction methods
 */
export const CONFIDENCE_SCORE = {
  // Boxing format extraction confidence
  /** Boxing format from mapped column */
  FORMAT_MAPPED: 100,

  /** Boxing format from 'format' field in Vision JSON */
  FORMAT_VISION_DIRECT: 95,

  /** Boxing format extracted from 'unit' field (misplaced) */
  FORMAT_FROM_UNIT: 85,

  /** Boxing format extracted from description text */
  FORMAT_FROM_DESCRIPTION: 70,

  /** No format found */
  FORMAT_NOT_FOUND: 0,

  // Container capacity confidence
  /** Explicit container capacity column */
  CAPACITY_EXPLICIT: 100,

  /** Capacity extracted from description */
  CAPACITY_FROM_DESCRIPTION: 80,

  // Math validation confidence
  /** Exact math match (difference = 0) */
  MATH_EXACT: 100,

  /** Within $0.01 (rounding) */
  MATH_ROUNDING: 95,

  /** Within tolerance ($0.02) */
  MATH_TOLERANCE: 90,

  /** Minor discrepancy ($0.10) */
  MATH_MINOR: 70,

  /** Needs review ($1.00) */
  MATH_REVIEW: 50,

  /** Likely error (> $1.00) */
  MATH_ERROR: 0,
};

// ============================================================================
// WARNING TYPES
// ============================================================================

/**
 * Warning severity levels
 * @typedef {'info' | 'warning' | 'error'} WarningSeverity
 */

/**
 * Warning severity constants
 */
export const WARNING_SEVERITY = {
  /** Informational - no action required */
  INFO: 'info',

  /** Warning - review recommended */
  WARNING: 'warning',

  /** Error - would block if enforced */
  ERROR: 'error',
};

/**
 * Warning type codes specific to packaging processing
 */
export const PACKAGING_WARNING = {
  /** Boxing format not found - units per case unknown */
  MISSING_FORMAT: 'MISSING_FORMAT',

  /** Boxing format could not be parsed */
  FORMAT_PARSE_FAILED: 'FORMAT_PARSE_FAILED',

  /** Boxing format was in wrong field (unit instead of format) */
  FORMAT_FIELD_MISPLACED: 'FORMAT_FIELD_MISPLACED',

  /** Overall confidence below threshold */
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',

  /** Math difference > $0.02 but < $1.00 */
  MATH_DISCREPANCY: 'MATH_DISCREPANCY',

  /** Container capacity not found */
  MISSING_CAPACITY: 'MISSING_CAPACITY',

  /** Quantity is zero or missing */
  MISSING_QUANTITY: 'MISSING_QUANTITY',

  /** Unit price is zero */
  ZERO_PRICE: 'ZERO_PRICE',

  /** Negative total (credit line) */
  CREDIT_LINE: 'CREDIT_LINE',

  /** Roll product detected */
  ROLL_PRODUCT: 'ROLL_PRODUCT',

  /** Units per case calculation failed */
  UNITS_CALCULATION_FAILED: 'UNITS_CALCULATION_FAILED',
};

// ============================================================================
// BOXING FORMAT PATTERNS
// ============================================================================

/**
 * Boxing format pattern: qty/count or qty/RL
 * Examples: "1/500", "10/100", "6/RL", "4/RL"
 */
export const BOXING_FORMAT_PATTERN = /^(\d+)\/(\d+|RL)$/i;

/**
 * Extended boxing format patterns for extraction from description
 */
export const BOXING_FORMAT_PATTERNS = {
  /** Standard notation: 1/500, 10/100 */
  STANDARD: /(\d+)\/(\d+)/,

  /** Roll notation: 6/RL, 4/RL */
  ROLL: /(\d+)\/RL/i,

  /** Case count: CS 500, CASE 1000 */
  CASE_COUNT: /(?:CS|CASE)\s*(\d+)/i,

  /** Pack notation: 10PK, 10 PACK */
  PACK: /(\d+)\s*(?:PK|PACK)/i,

  /** Per case: 500/CS, 1000/CASE */
  PER_CASE: /(\d+)\s*\/?\s*(?:CS|CASE)/i,
};

// ============================================================================
// CONTAINER CAPACITY PATTERNS
// ============================================================================

/**
 * Container capacity pattern: size in weight or volume (NOT product weight!)
 * Examples: "2.25LB", "16OZ", "500ML", "1L"
 */
export const CONTAINER_CAPACITY_PATTERNS = {
  /** Weight capacity: 2.25LB, 16OZ */
  WEIGHT: /(\d+(?:\.\d+)?)\s*(LB|OZ|KG|G)\b/i,

  /** Volume capacity: 500ML, 1L, 16OZ */
  VOLUME: /(\d+(?:\.\d+)?)\s*(ML|L|OZ|GAL)\b/i,

  /** Dimension: 9x9, 8"x8" */
  DIMENSION: /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i,
};

// ============================================================================
// FIELD EXTRACTION PRIORITIES
// ============================================================================

/**
 * Field priority definition
 * @typedef {Object} FieldPriority
 * @property {FieldSource} source - Source type
 * @property {string} path - Object path to value
 * @property {string} [fromColumn] - Profile column name if mapped
 * @property {number} [confidence] - Confidence score for this source
 */

/**
 * Field extraction priorities - ordered by preference
 * Each field lists sources to try in order
 */
export const FIELD_PRIORITIES = {
  /** Description field - product name */
  DESCRIPTION: [
    { source: FIELD_SOURCE.MAPPED, path: 'description', fromColumn: 'description', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'description', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'name', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'product', confidence: 85 },
    { source: FIELD_SOURCE.VISION, path: 'item', confidence: 80 },
  ],

  /** Quantity - order quantity (cases) */
  QUANTITY: [
    { source: FIELD_SOURCE.MAPPED, path: 'quantity', fromColumn: 'quantity', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'quantity', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'qty', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'qty_invoiced', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'ordered', confidence: 85 },
    { source: FIELD_SOURCE.VISION, path: 'shipped', confidence: 85 },
  ],

  /** Unit price - price per case */
  UNIT_PRICE: [
    { source: FIELD_SOURCE.MAPPED, path: 'unitPrice', fromColumn: 'unitPrice', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'unitPrice', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'price', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'unit_price', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'pricePerUnit', confidence: 85 },
  ],

  /** Total price - line total */
  TOTAL_PRICE: [
    { source: FIELD_SOURCE.MAPPED, path: 'totalPrice', fromColumn: 'total', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'totalPrice', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'total', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'lineTotal', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'amount', confidence: 85 },
    { source: FIELD_SOURCE.VISION, path: 'extended', confidence: 80 },
  ],

  /** Boxing format - qty per case notation */
  BOXING_FORMAT: [
    { source: FIELD_SOURCE.MAPPED, path: 'boxingFormat', fromColumn: 'boxingFormat', confidence: CONFIDENCE_SCORE.FORMAT_MAPPED },
    { source: FIELD_SOURCE.MAPPED, path: 'format', fromColumn: 'packageFormat', confidence: CONFIDENCE_SCORE.FORMAT_MAPPED },
    { source: FIELD_SOURCE.VISION, path: 'format', confidence: CONFIDENCE_SCORE.FORMAT_VISION_DIRECT },
    { source: FIELD_SOURCE.VISION, path: 'boxingFormat', confidence: CONFIDENCE_SCORE.FORMAT_VISION_DIRECT },
    { source: FIELD_SOURCE.VISION, path: 'packagingFormat', confidence: CONFIDENCE_SCORE.FORMAT_VISION_DIRECT },
    { source: FIELD_SOURCE.VISION, path: 'packaging', confidence: 90 },
    // Check unit field (Claude sometimes puts format here incorrectly)
    { source: FIELD_SOURCE.EXTRACTED, path: '_fromUnitField', confidence: CONFIDENCE_SCORE.FORMAT_FROM_UNIT },
    // Mine from description as last resort
    { source: FIELD_SOURCE.EXTRACTED, path: '_fromDescription', confidence: CONFIDENCE_SCORE.FORMAT_FROM_DESCRIPTION },
  ],

  /** Container format - size/capacity */
  CONTAINER_FORMAT: [
    { source: FIELD_SOURCE.MAPPED, path: 'containerFormat', fromColumn: 'containerFormat', confidence: CONFIDENCE_SCORE.CAPACITY_EXPLICIT },
    { source: FIELD_SOURCE.VISION, path: 'containerCapacity', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'containerFormat', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'capacity', confidence: 90 },
    { source: FIELD_SOURCE.EXTRACTED, path: '_fromDescription', confidence: CONFIDENCE_SCORE.CAPACITY_FROM_DESCRIPTION },
  ],

  /** Unit of measure */
  UNIT: [
    { source: FIELD_SOURCE.VISION, path: 'unit', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'uom', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'quantityUnit', confidence: 90 },
    { source: FIELD_SOURCE.DEFAULT, path: null, confidence: 50 },  // Default to 'case'
  ],

  /** SKU / Product code */
  SKU: [
    { source: FIELD_SOURCE.MAPPED, path: 'sku', fromColumn: 'sku', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'sku', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'productCode', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'itemCode', confidence: 90 },
    { source: FIELD_SOURCE.VISION, path: 'code', confidence: 85 },
    { source: FIELD_SOURCE.VISION, path: 'item_number', confidence: 85 },
  ],

  /** Category */
  CATEGORY: [
    { source: FIELD_SOURCE.VISION, path: 'category', confidence: 95 },
    { source: FIELD_SOURCE.VISION, path: 'productCategory', confidence: 90 },
    { source: FIELD_SOURCE.DEFAULT, path: null, confidence: 50 },  // Default to 'Packaging & Containers'
  ],
};

// ============================================================================
// TRACKED FIELD TYPES
// ============================================================================

/**
 * A tracked string field with source and validation
 * @typedef {Object} TrackedString
 * @property {string|null} value - The field value
 * @property {FieldSource} source - Where the value came from
 * @property {boolean} valid - Whether the value passed validation
 */

/**
 * A tracked number field with source and validation
 * @typedef {Object} TrackedNumber
 * @property {number|null} value - The field value
 * @property {FieldSource} source - Where the value came from
 * @property {boolean} valid - Whether the value passed validation
 */

/**
 * A tracked number field with confidence scoring
 * @typedef {Object} TrackedNumberWithConfidence
 * @property {number|null} value - The field value
 * @property {FieldSource} source - Where the value came from
 * @property {number} confidence - Confidence score (0-100)
 * @property {boolean} valid - Whether the value passed validation
 */

// ============================================================================
// EXTRACTED FIELD TYPE
// ============================================================================

/**
 * Result of extracting a single field
 * @typedef {Object} ExtractedField
 * @property {*} value - The extracted value
 * @property {FieldSource} source - Where the value came from
 * @property {string} path - Object path used
 * @property {number} confidence - Confidence in this extraction (0-100)
 * @property {boolean} valid - Whether the value is valid
 */

/**
 * Create an extracted field result
 * @param {*} value - The value
 * @param {FieldSource} source - Source type
 * @param {string} path - Object path
 * @param {number} [confidence=100] - Confidence score
 * @returns {ExtractedField}
 */
export function createExtractedField(value, source, path, confidence = 100) {
  const isValid = value !== null && value !== undefined && value !== '';
  return {
    value: isValid ? value : null,
    source: isValid ? source : FIELD_SOURCE.DEFAULT,
    path: isValid ? path : null,
    confidence: isValid ? confidence : 0,
    valid: isValid,
  };
}

/**
 * Create an empty extracted field
 * @returns {ExtractedField}
 */
export function createEmptyExtractedField() {
  return {
    value: null,
    source: FIELD_SOURCE.DEFAULT,
    path: null,
    confidence: 0,
    valid: false,
  };
}

// ============================================================================
// BOXING FORMAT RESULT
// ============================================================================

/**
 * Parsed boxing format result
 * @typedef {Object} ParsedBoxingFormat
 * @property {BoxingFormatType} type - Pattern type detected
 * @property {number|null} packCount - Number of packs (e.g., 10 in "10/100")
 * @property {number|null} unitsPerPack - Units per pack (e.g., 100 in "10/100")
 * @property {number|null} totalUnitsPerCase - Total units (packCount × unitsPerPack)
 * @property {boolean} isRoll - True if roll product (6/RL)
 * @property {string|null} formula - Human-readable formula (e.g., "10 × 100 = 1000 units")
 */

/**
 * Boxing format field with parsing metadata
 * @typedef {Object} BoxingFormatField
 * @property {string|null} raw - Original format string from Vision
 * @property {ParsedBoxingFormat|null} parsed - Parsed format data
 * @property {FieldSource} source - Where the format came from
 * @property {number} confidence - Parsing confidence (0-100)
 * @property {boolean} valid - Whether format was successfully parsed
 */

// ============================================================================
// CONTAINER CAPACITY RESULT
// ============================================================================

/**
 * Container capacity extraction result
 * @typedef {Object} ContainerCapacity
 * @property {number|null} value - Capacity value (e.g., 2.25)
 * @property {string|null} unit - Capacity unit (LB, OZ, ML, L)
 * @property {string|null} raw - Original string (e.g., "2.25LB")
 * @property {FieldSource} source - Where it came from
 * @property {number} confidence - Extraction confidence
 * @property {boolean} valid - Whether extraction succeeded
 */

// ============================================================================
// UNITS CALCULATION RESULT
// ============================================================================

/**
 * Units calculation result
 * @typedef {Object} UnitsCalculation
 * @property {number|null} packCount - Packs per case
 * @property {number|null} unitsPerPack - Units per pack
 * @property {number|null} totalUnitsPerCase - Total units in one case
 * @property {number|null} totalUnitsOrdered - Total units ordered (cases × totalUnitsPerCase)
 * @property {number|null} pricePerUnit - Price per individual unit
 * @property {FieldSource} source - Always 'calculated'
 * @property {boolean} valid - Whether calculation succeeded
 */

// ============================================================================
// MATH VALIDATION RESULT
// ============================================================================

/**
 * Math validation result for line total
 * @typedef {Object} MathValidation
 * @property {number|null} expected - Calculated total (qty × unitPrice)
 * @property {number|null} actual - Total from Vision JSON
 * @property {number} difference - |expected - actual|
 * @property {boolean} valid - Whether difference <= tolerance
 * @property {number} tolerance - Tolerance used (default $0.02)
 * @property {number} confidence - Math confidence score (0-100)
 */

// ============================================================================
// WARNING ENTRY
// ============================================================================

/**
 * A single warning entry
 * @typedef {Object} WarningEntry
 * @property {string} type - Warning type code (from PACKAGING_WARNING)
 * @property {WarningSeverity} severity - info | warning | error
 * @property {string} message - Human-readable message
 * @property {string} [field] - Field that triggered the warning
 * @property {*} [expected] - Expected value (for comparison warnings)
 * @property {*} [actual] - Actual value (for comparison warnings)
 */

// ============================================================================
// VALIDATION SUMMARY
// ============================================================================

/**
 * Validation summary with tier status and processing flags
 * @typedef {Object} ValidationSummary
 * @property {boolean} tier1Valid - Core fields valid (description, qty, price, total)
 * @property {boolean} tier2Valid - Boxing format valid (optional but tracked)
 * @property {boolean} tier3Valid - Units calculation successful
 * @property {boolean} canProcess - Ready for inventory (tier1 && tier3)
 * @property {boolean} canBill - Ready for QuickBooks (tier1Valid)
 * @property {number} overallConfidence - Weighted confidence (0-100)
 * @property {WarningEntry[]} warnings - Non-blocking issues
 * @property {WarningEntry[]} errors - Would block if enforced
 */

// ============================================================================
// EXTRACTION CONTEXT
// ============================================================================

/**
 * Context derived from extraction
 * @typedef {Object} ExtractionContext
 * @property {boolean} hasBoxingFormat - True if boxing format found
 * @property {BoxingFormatType} formatType - Type of format detected
 * @property {string} extractionMethod - 'mapped' | 'vision' | 'extracted' | 'none'
 * @property {boolean} hasContainerCapacity - True if container capacity found
 * @property {boolean} isRollProduct - True if roll product (6/RL)
 * @property {number|null} expectedUnitsPerCase - Expected from format parsing
 * @property {number|null} calculatedUnitsPerCase - Actually calculated
 */

// ============================================================================
// ALL FIELDS EXTRACTION
// ============================================================================

/**
 * Complete extraction result for all fields
 * @typedef {Object} PackagingAllFieldsExtraction
 * @property {ExtractedField} description
 * @property {ExtractedField} quantity
 * @property {ExtractedField} unitPrice
 * @property {ExtractedField} totalPrice
 * @property {BoxingFormatField} boxingFormat
 * @property {ContainerCapacity} containerCapacity
 * @property {ExtractedField} unit
 * @property {ExtractedField} sku
 * @property {ExtractedField} category
 * @property {ExtractionContext} context - Derived context
 */

// ============================================================================
// PROCESSED LINE - MAIN TYPE
// ============================================================================

/**
 * ProcessedLine - Complete packaging line with validation
 *
 * This is the main output type from the packaging handler.
 * Every field includes source tracking and validation status.
 *
 * @typedef {Object} PackagingProcessedLine
 *
 * @property {number} lineNumber - Line number (1-indexed)
 * @property {TrackedString} description - Product description
 * @property {TrackedNumber} quantity - Order quantity (cases)
 * @property {TrackedNumber} unitPrice - Price per case
 * @property {TrackedNumber} totalPrice - Line total from invoice
 *
 * @property {BoxingFormatField} boxingFormat - Boxing format (e.g., "10/100")
 * @property {ContainerCapacity} containerCapacity - Container capacity (e.g., "2.25LB")
 * @property {UnitsCalculation} units - Calculated units
 * @property {MathValidation} math - Math validation result
 * @property {ValidationSummary} validation - Overall validation summary
 *
 * @property {string} lineType - 'product' | 'deposit' | 'fee' | 'credit' | 'zero'
 * @property {boolean} forInventory - Should create/update inventory item
 * @property {boolean} forAccounting - Should go to QuickBooks
 *
 * @property {string|null} sku - Product code/SKU if available
 * @property {string|null} category - Product category
 *
 * @property {ExtractionContext} _context - Extraction context for debugging
 * @property {Object} _raw - Raw data for debugging
 */

// ============================================================================
// MATH TOLERANCE
// ============================================================================

/**
 * Default math validation tolerance in dollars
 */
export const DEFAULT_MATH_TOLERANCE = 0.02;

/**
 * Math tolerance thresholds for confidence scoring
 */
export const MATH_TOLERANCE_THRESHOLDS = {
  /** Exact match */
  EXACT: 0,
  /** Rounding error */
  ROUNDING: 0.01,
  /** Acceptable tolerance */
  ACCEPTABLE: 0.02,
  /** Minor discrepancy */
  MINOR: 0.10,
  /** Needs review */
  REVIEW: 1.00,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a line is ready for QuickBooks billing
 * @param {PackagingProcessedLine} line - Processed line
 * @returns {boolean} True if canBill
 */
export function canBillLine(line) {
  return line?.validation?.canBill === true;
}

/**
 * Check if a line is ready for inventory processing
 * @param {PackagingProcessedLine} line - Processed line
 * @returns {boolean} True if canProcess
 */
export function canProcessLine(line) {
  return line?.validation?.canProcess === true;
}

/**
 * Check if a line has any warnings
 * @param {PackagingProcessedLine} line - Processed line
 * @returns {boolean} True if has warnings
 */
export function hasWarnings(line) {
  return (line?.validation?.warnings?.length ?? 0) > 0;
}

/**
 * Check if a line has high confidence (>= 90)
 * @param {PackagingProcessedLine} line - Processed line
 * @returns {boolean} True if high confidence
 */
export function isHighConfidence(line) {
  return (line?.validation?.overallConfidence ?? 0) >= CONFIDENCE_THRESHOLD.HIGH;
}

/**
 * Get confidence level label
 * @param {number} confidence - Confidence score (0-100)
 * @returns {'high' | 'medium' | 'low' | 'critical'} Confidence level
 */
export function getConfidenceLevel(confidence) {
  if (confidence >= CONFIDENCE_THRESHOLD.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLD.MEDIUM) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLD.LOW) return 'low';
  return 'critical';
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an empty tracked string field
 * @param {string|null} [value=null] - Initial value
 * @param {FieldSource} [source='default'] - Field source
 * @returns {TrackedString}
 */
export function createTrackedString(value = null, source = FIELD_SOURCE.DEFAULT) {
  return {
    value,
    source,
    valid: value !== null && value !== '',
  };
}

/**
 * Create an empty tracked number field
 * @param {number|null} [value=null] - Initial value
 * @param {FieldSource} [source='default'] - Field source
 * @returns {TrackedNumber}
 */
export function createTrackedNumber(value = null, source = FIELD_SOURCE.DEFAULT) {
  return {
    value,
    source,
    valid: value !== null && !isNaN(value),
  };
}

/**
 * Create an empty validation summary
 * @returns {ValidationSummary}
 */
export function createEmptyValidation() {
  return {
    tier1Valid: false,
    tier2Valid: false,
    tier3Valid: false,
    canProcess: false,
    canBill: false,
    overallConfidence: 0,
    warnings: [],
    errors: [],
  };
}

/**
 * Create a warning entry
 * @param {string} type - Warning type from PACKAGING_WARNING
 * @param {WarningSeverity} severity - Warning severity
 * @param {string} message - Human-readable message
 * @param {Object} [details] - Additional details
 * @returns {WarningEntry}
 */
export function createWarning(type, severity, message, details = {}) {
  return {
    type,
    severity,
    message,
    ...details,
  };
}

/**
 * Create an empty boxing format field
 * @returns {BoxingFormatField}
 */
export function createEmptyBoxingFormat() {
  return {
    raw: null,
    parsed: null,
    source: FIELD_SOURCE.DEFAULT,
    confidence: 0,
    valid: false,
  };
}

/**
 * Create an empty container capacity
 * @returns {ContainerCapacity}
 */
export function createEmptyContainerCapacity() {
  return {
    value: null,
    unit: null,
    raw: null,
    source: FIELD_SOURCE.DEFAULT,
    confidence: 0,
    valid: false,
  };
}

/**
 * Create an empty units calculation
 * @returns {UnitsCalculation}
 */
export function createEmptyUnitsCalculation() {
  return {
    packCount: null,
    unitsPerPack: null,
    totalUnitsPerCase: null,
    totalUnitsOrdered: null,
    pricePerUnit: null,
    source: FIELD_SOURCE.DEFAULT,
    valid: false,
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Source tracking
  FIELD_SOURCE,

  // Boxing format types
  BOXING_FORMAT_TYPE,

  // Pricing types
  PRICING_TYPE,

  // Patterns
  BOXING_FORMAT_PATTERN,
  BOXING_FORMAT_PATTERNS,
  CONTAINER_CAPACITY_PATTERNS,

  // Field priorities
  FIELD_PRIORITIES,

  // Confidence
  CONFIDENCE_THRESHOLD,
  CONFIDENCE_SCORE,

  // Warnings
  WARNING_SEVERITY,
  PACKAGING_WARNING,

  // Tolerances
  DEFAULT_MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,

  // Helper functions
  canBillLine,
  canProcessLine,
  hasWarnings,
  isHighConfidence,
  getConfidenceLevel,

  // Factory functions
  createTrackedString,
  createTrackedNumber,
  createEmptyValidation,
  createWarning,
  createExtractedField,
  createEmptyExtractedField,
  createEmptyBoxingFormat,
  createEmptyContainerCapacity,
  createEmptyUnitsCalculation,
};
