/**
 * Food Supply Handler Types
 *
 * JSDoc type definitions for the food supply invoice handler.
 * Defines the ProcessedLine structure with validation gates and confidence tracking.
 *
 * Source of Truth: Raw Vision JSON
 *
 * @module services/invoice/handlers/foodSupplyTypes
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

  /** Derived from other fields (e.g., totalWeight = weightPerUnit × quantity) */
  CALCULATED: 'calculated',

  /** From vendor profile column mapping */
  MAPPED: 'mapped',

  /** Fallback value applied when no data available */
  DEFAULT: 'default',

  /** Manual user correction */
  USER: 'user',
};

// ============================================================================
// FORMAT PATTERN TYPES
// ============================================================================

/**
 * Format pattern type detected from format/description parsing
 * @typedef {'PACK_WEIGHT' | 'MULTIPLIER' | 'SIMPLE_WEIGHT' | 'COUNT_ONLY' | 'UNKNOWN'} FormatType
 */

/**
 * Format type constants with descriptions
 */
export const FORMAT_TYPE = {
  /** "2/5LB" - packCount/unitWeight pattern → 2 packs × 5lb = 10lb */
  PACK_WEIGHT: 'PACK_WEIGHT',

  /** "4x2.5kg" - multiplier pattern → 4 × 2.5kg = 10kg */
  MULTIPLIER: 'MULTIPLIER',

  /** "10KG" - simple weight → 10kg */
  SIMPLE_WEIGHT: 'SIMPLE_WEIGHT',

  /** "CS 24" - count only, no weight → 24 units */
  COUNT_ONLY: 'COUNT_ONLY',

  /** Unrecognized pattern */
  UNKNOWN: 'UNKNOWN',
};

// ============================================================================
// PRICING TYPE
// ============================================================================

/**
 * Pricing calculation type
 * @typedef {'weight' | 'unit' | 'unknown'} PricingType
 */

/**
 * Pricing type constants
 */
export const PRICING_TYPE = {
  /** Price per weight ($/kg, $/lb) - requires weight extraction */
  WEIGHT: 'weight',

  /** Price per volume ($/ml, $/L) - for liquids */
  VOLUME: 'volume',

  /** Price per unit ($/ea, $/case) - weight optional */
  UNIT: 'unit',

  /** Could not determine pricing type */
  UNKNOWN: 'unknown',
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
  /** Explicit weight column from Vision JSON */
  EXPLICIT_COLUMN: 100,

  /** PACK_WEIGHT pattern: "2/5LB", "4/2.5KG" */
  PACK_WEIGHT_PATTERN: 95,

  /** MULTIPLIER pattern: "4x5kg", "2×10lb" */
  MULTIPLIER_PATTERN: 90,

  /** SIMPLE_WEIGHT pattern: "10KG", "5LB" */
  SIMPLE_WEIGHT_PATTERN: 85,

  /** Weight mined from description text */
  DESCRIPTION_MINING: 70,

  /** Ambiguous pattern that could be count or weight */
  AMBIGUOUS_PATTERN: 50,

  /** No weight found - unit-based fallback */
  NO_WEIGHT_FOUND: 0,

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

  /** Error - would block if enforced (but we allow with flag) */
  ERROR: 'error',
};

/**
 * Warning type codes specific to food supply processing
 */
export const FOOD_SUPPLY_WARNING = {
  /** No weight found, fell back to unit-based pricing */
  UNIT_BASED_PRICING: 'UNIT_BASED_PRICING',

  /** Overall confidence below threshold */
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',

  /** Weight was mined from description, not explicit */
  WEIGHT_FROM_DESCRIPTION: 'WEIGHT_FROM_DESCRIPTION',

  /** Math difference > $0.02 but < $1.00 */
  MATH_DISCREPANCY: 'MATH_DISCREPANCY',

  /** Format string could not be parsed */
  FORMAT_UNKNOWN: 'FORMAT_UNKNOWN',

  /** Unit could be weight or count (ambiguous) */
  AMBIGUOUS_UNIT: 'AMBIGUOUS_UNIT',

  /** Weight unit missing but weight value present */
  MISSING_WEIGHT_UNIT: 'MISSING_WEIGHT_UNIT',

  /** pricePerG could not be calculated */
  NO_PRICE_PER_GRAM: 'NO_PRICE_PER_GRAM',

  /** Math formula didn't match either weight or unit calculation */
  MATH_MISMATCH: 'MATH_MISMATCH',

  /** Quantity is zero or missing for non-credit line */
  MISSING_QUANTITY: 'MISSING_QUANTITY',

  /** Unit price is zero for non-credit line */
  ZERO_PRICE: 'ZERO_PRICE',
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
// FORMAT PARSING RESULT
// ============================================================================

/**
 * Parsed format field result
 * @typedef {Object} ParsedFormat
 * @property {FormatType} type - Pattern type detected
 * @property {number|null} packCount - Number of packs (e.g., 2 in "2/5LB")
 * @property {number|null} unitWeight - Weight per pack (e.g., 5 in "2/5LB")
 * @property {string|null} weightUnit - Weight unit (kg, lb, g, oz)
 * @property {string|null} formula - Human-readable formula (e.g., "2 × 5lb = 10lb")
 */

/**
 * Format field with parsing metadata
 * @typedef {Object} FormatField
 * @property {string|null} raw - Original format string from Vision
 * @property {ParsedFormat|null} parsed - Parsed format data
 * @property {FieldSource} source - Where the format came from
 * @property {number} confidence - Parsing confidence (0-100)
 * @property {boolean} valid - Whether format was successfully parsed
 */

// ============================================================================
// WEIGHT EXTRACTION RESULT
// ============================================================================

/**
 * Weight extraction result with full traceability
 * @typedef {Object} WeightExtraction
 * @property {number|null} perUnit - Weight per case/unit (packCount × unitWeight)
 * @property {number|null} total - Total weight (perUnit × quantity)
 * @property {number|null} totalGrams - Total weight normalized to grams
 * @property {string|null} unit - Normalized weight unit (kg, lb, g, oz)
 * @property {FieldSource} source - How weight was obtained
 * @property {number} confidence - Extraction confidence (0-100)
 * @property {boolean} valid - Whether weight extraction succeeded
 */

// ============================================================================
// PRICING CALCULATION RESULT
// ============================================================================

/**
 * Normalized pricing calculation result
 * @typedef {Object} PricingCalculation
 * @property {PricingType} type - 'weight' or 'unit'
 * @property {number|null} pricePerG - Price per gram (if weight-based)
 * @property {number|null} pricePerLb - Price per pound (if weight-based)
 * @property {number|null} pricePerKg - Price per kilogram (if weight-based)
 * @property {number|null} pricePerUnit - Price per unit (if unit-based)
 * @property {FieldSource} source - Always 'calculated'
 * @property {boolean} valid - Whether pricing was successfully calculated
 */

// ============================================================================
// MATH VALIDATION RESULT
// ============================================================================

/**
 * Math validation result for line total
 * @typedef {Object} MathValidation
 * @property {'weight' | 'unit' | 'none'} formula - Which formula matched
 * @property {number|null} expected - Calculated total (weight×price OR qty×price)
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
 * @property {string} type - Warning type code (from FOOD_SUPPLY_WARNING)
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
 * @property {boolean} tier2Valid - Weight extraction valid OR unit-based pricing
 * @property {boolean} tier3Valid - Pricing calculation successful
 * @property {boolean} canProcess - Ready for inventory (tier1 && tier2 && tier3)
 * @property {boolean} canBill - Ready for QuickBooks (tier1Valid)
 * @property {number} overallConfidence - Min confidence across all extractions (0-100)
 * @property {WarningEntry[]} warnings - Non-blocking issues
 * @property {WarningEntry[]} errors - Would block if enforced
 */

// ============================================================================
// RAW DATA CONTAINER
// ============================================================================

/**
 * Raw data container for debugging and reprocessing
 * @typedef {Object} RawDataContainer
 * @property {Object} visionJson - Original Vision JSON for this line
 * @property {number} lineNumber - Line number in invoice (1-indexed)
 * @property {string|null} rawDescription - Original description before normalization
 */

// ============================================================================
// PROCESSED LINE - MAIN TYPE
// ============================================================================

/**
 * ProcessedLine - Complete food supply line with validation
 *
 * This is the main output type from the foodSupply handler.
 * Every field includes source tracking and validation status.
 *
 * @typedef {Object} FoodSupplyProcessedLine
 *
 * @property {TrackedString} description - Product description
 * @property {TrackedNumber} quantity - Order quantity (cases/units)
 * @property {TrackedNumber} unitPrice - Price per case/unit OR price per weight
 * @property {TrackedNumber} totalPrice - Line total from invoice
 *
 * @property {FormatField} format - Packaging format (e.g., "2/5LB")
 * @property {WeightExtraction} weight - Extracted weight data
 * @property {PricingCalculation} pricing - Normalized pricing
 * @property {MathValidation} math - Math validation result
 * @property {ValidationSummary} validation - Overall validation summary
 *
 * @property {string} lineType - 'product' | 'deposit' | 'fee' | 'credit' | 'zero'
 * @property {boolean} forInventory - Should create/update inventory item
 * @property {boolean} forAccounting - Should go to QuickBooks
 *
 * @property {string|null} sku - Product code/SKU if available
 * @property {string|null} category - Product category if detected
 *
 * @property {RawDataContainer} _raw - Raw data for debugging
 */

// ============================================================================
// PROCESSING OPTIONS
// ============================================================================

/**
 * Options for processing a food supply line
 * @typedef {Object} FoodSupplyProcessingOptions
 * @property {Object|null} profile - Vendor parsing profile
 * @property {boolean} [strictValidation=false] - If true, errors block processing
 * @property {number} [mathTolerance=0.02] - Math validation tolerance in dollars
 * @property {boolean} [extractFromDescription=true] - Mine weight from description
 * @property {boolean} [normalizeUnits=true] - Normalize weight units to grams
 */

// ============================================================================
// BATCH PROCESSING RESULT
// ============================================================================

/**
 * Result of processing multiple lines
 * @typedef {Object} FoodSupplyBatchResult
 * @property {FoodSupplyProcessedLine[]} lines - Processed lines
 * @property {Object} summary - Processing summary
 * @property {number} summary.total - Total lines processed
 * @property {number} summary.valid - Lines with canProcess=true
 * @property {number} summary.warnings - Lines with warnings
 * @property {number} summary.errors - Lines with errors
 * @property {number} summary.weightBased - Lines with weight-based pricing
 * @property {number} summary.unitBased - Lines with unit-based pricing
 * @property {number} summary.avgConfidence - Average confidence score
 * @property {number} summary.calculatedSubtotal - Sum of all line totals
 * @property {WarningEntry[]} allWarnings - All warnings across lines
 */

// ============================================================================
// UNIT TYPE CLASSIFICATION
// ============================================================================

/**
 * Unit type for determining pricing formula
 * @typedef {'weight' | 'count' | 'container' | 'volume' | 'unknown'} UnitType
 */

/**
 * Unit type constants
 */
export const UNIT_TYPE = {
  /** Weight units - qty IS weight (kg, lb, g, oz) */
  WEIGHT: 'weight',

  /** Count units - qty is count of items (ea, each, pc, un) */
  COUNT: 'count',

  /** Container units - qty is count of containers (case, box, carton) */
  CONTAINER: 'container',

  /** Volume units - qty IS volume (L, ml, gal) */
  VOLUME: 'volume',

  /** Unknown unit type */
  UNKNOWN: 'unknown',
};

/**
 * Weight unit keywords (qty column IS the weight)
 */
export const WEIGHT_UNIT_KEYWORDS = [
  'kg', 'kilo', 'kilos', 'kilogram', 'kilograms',
  'lb', 'lbs', 'pound', 'pounds', 'livre', 'livres',
  'g', 'gr', 'gram', 'grams', 'gramme', 'grammes',
  'oz', 'ounce', 'ounces', 'once', 'onces',
];

/**
 * Count unit keywords (qty is count of individual items)
 */
export const COUNT_UNIT_KEYWORDS = [
  'ea', 'each', 'pc', 'pcs', 'piece', 'pieces',
  'un', 'unit', 'units', 'unité', 'unités',
  'ct', 'count',
];

/**
 * Container unit keywords (qty is count of containers)
 */
export const CONTAINER_UNIT_KEYWORDS = [
  'cs', 'case', 'cases', 'caisse', 'caisses',
  'bx', 'box', 'boxes', 'boîte', 'boîtes',
  'ctn', 'carton', 'cartons',
  'pk', 'pack', 'packs', 'paquet', 'paquets',
  'bag', 'bags', 'sac', 'sacs',
  'dz', 'dozen', 'douzaine',
];

/**
 * Volume unit keywords (qty IS the volume)
 */
export const VOLUME_UNIT_KEYWORDS = [
  'l', 'lt', 'litre', 'litres', 'liter', 'liters',
  'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters',
  'gal', 'gallon', 'gallons',
  'fl', 'floz', 'fl oz',
];

/**
 * Classify a unit string into its type
 * @param {string} unit - Unit string to classify
 * @returns {UnitType} Unit type
 */
export function classifyUnit(unit) {
  if (!unit) return UNIT_TYPE.UNKNOWN;
  const lower = unit.toLowerCase().trim();

  if (WEIGHT_UNIT_KEYWORDS.includes(lower)) return UNIT_TYPE.WEIGHT;
  if (COUNT_UNIT_KEYWORDS.includes(lower)) return UNIT_TYPE.COUNT;
  if (CONTAINER_UNIT_KEYWORDS.includes(lower)) return UNIT_TYPE.CONTAINER;
  if (VOLUME_UNIT_KEYWORDS.includes(lower)) return UNIT_TYPE.VOLUME;

  return UNIT_TYPE.UNKNOWN;
}

/**
 * Check if unit is weight-based (qty IS weight)
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
export function isWeightUnit(unit) {
  return classifyUnit(unit) === UNIT_TYPE.WEIGHT;
}

/**
 * Check if unit is count-based (qty is count of items)
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
export function isCountUnit(unit) {
  return classifyUnit(unit) === UNIT_TYPE.COUNT;
}

/**
 * Check if unit is container-based (qty is count of containers)
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
export function isContainerUnit(unit) {
  return classifyUnit(unit) === UNIT_TYPE.CONTAINER;
}

/**
 * Check if unit is volume-based (qty IS volume)
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
export function isVolumeUnit(unit) {
  return classifyUnit(unit) === UNIT_TYPE.VOLUME;
}

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
    { source: FIELD_SOURCE.VISION, path: 'description' },
    { source: FIELD_SOURCE.VISION, path: 'name' },
    { source: FIELD_SOURCE.VISION, path: 'product' },
    { source: FIELD_SOURCE.VISION, path: 'item' },
  ],

  /** Quantity - order quantity */
  QUANTITY: [
    { source: FIELD_SOURCE.VISION, path: 'qty_invoiced' },    // Common: "qty_invoiced": 6
    { source: FIELD_SOURCE.VISION, path: 'quantity_invoiced' },
    { source: FIELD_SOURCE.VISION, path: 'qtyInvoiced' },
    { source: FIELD_SOURCE.VISION, path: 'shipped' },         // Acema: "shipped": 12
    { source: FIELD_SOURCE.VISION, path: 'qty_shipped' },
    { source: FIELD_SOURCE.VISION, path: 'quantity_shipped' },
    { source: FIELD_SOURCE.VISION, path: 'quantity' },
    { source: FIELD_SOURCE.VISION, path: 'qty' },
    { source: FIELD_SOURCE.VISION, path: 'qty_delivered' },
    { source: FIELD_SOURCE.VISION, path: 'delivered' },
    { source: FIELD_SOURCE.VISION, path: 'orderedQty' },
    { source: FIELD_SOURCE.VISION, path: 'qtyOrdered' },
    { source: FIELD_SOURCE.VISION, path: 'qty_ordered' },
  ],

  /** Unit price - price per unit/case/weight */
  UNIT_PRICE: [
    { source: FIELD_SOURCE.VISION, path: 'unitPrice' },
    { source: FIELD_SOURCE.VISION, path: 'price' },
    { source: FIELD_SOURCE.VISION, path: 'pricePerUnit' },
    { source: FIELD_SOURCE.VISION, path: 'unit_price' },
  ],

  /** Total price - line total */
  TOTAL_PRICE: [
    { source: FIELD_SOURCE.VISION, path: 'totalPrice' },
    { source: FIELD_SOURCE.VISION, path: 'total' },
    { source: FIELD_SOURCE.VISION, path: 'lineTotal' },
    { source: FIELD_SOURCE.VISION, path: 'amount' },
    { source: FIELD_SOURCE.VISION, path: 'extended' },
  ],

  /** Quantity unit - unit of measure */
  QUANTITY_UNIT: [
    { source: FIELD_SOURCE.MAPPED, path: 'quantityUnit', fromColumn: 'quantityUnit' },
    { source: FIELD_SOURCE.VISION, path: 'quantityUnit' },
    { source: FIELD_SOURCE.VISION, path: 'unit' },
    { source: FIELD_SOURCE.VISION, path: 'uom' },
    { source: FIELD_SOURCE.VISION, path: 'u_m' },
  ],

  /** Format - boxing/packaging format */
  FORMAT: [
    { source: FIELD_SOURCE.MAPPED, path: 'format', fromColumn: 'boxingFormat' },
    { source: FIELD_SOURCE.MAPPED, path: 'boxingFormat', fromColumn: 'packageFormat' },
    { source: FIELD_SOURCE.VISION, path: 'format' },
    { source: FIELD_SOURCE.VISION, path: 'boxingFormat' },
    { source: FIELD_SOURCE.VISION, path: 'packageFormat' },
    { source: FIELD_SOURCE.VISION, path: 'packSize' },
  ],

  /** Weight - explicit weight column */
  WEIGHT: [
    { source: FIELD_SOURCE.VISION, path: 'weight', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'netWeight', confidence: 100 },
    { source: FIELD_SOURCE.VISION, path: 'productWeight', confidence: 100 },
    { source: FIELD_SOURCE.MAPPED, path: 'weight', fromColumn: 'billingQuantity', confidence: 90 },
    { source: FIELD_SOURCE.EXTRACTED, path: '_formatWeight', confidence: 85 },
    { source: FIELD_SOURCE.EXTRACTED, path: '_descriptionWeight', confidence: 70 },
  ],

  /** Weight unit */
  WEIGHT_UNIT: [
    { source: FIELD_SOURCE.VISION, path: 'weightUnit' },
    { source: FIELD_SOURCE.VISION, path: 'weight_unit' },
    { source: FIELD_SOURCE.EXTRACTED, path: '_extractedWeightUnit' },
  ],

  /** SKU / Product code */
  SKU: [
    { source: FIELD_SOURCE.VISION, path: 'sku' },
    { source: FIELD_SOURCE.VISION, path: 'productCode' },
    { source: FIELD_SOURCE.VISION, path: 'itemCode' },
    { source: FIELD_SOURCE.VISION, path: 'item_number' },
    { source: FIELD_SOURCE.VISION, path: 'code' },
  ],

  /** Category */
  CATEGORY: [
    { source: FIELD_SOURCE.VISION, path: 'category' },
    { source: FIELD_SOURCE.VISION, path: 'productCategory' },
  ],

  /** Price per weight (explicit column) */
  PRICE_PER_WEIGHT: [
    { source: FIELD_SOURCE.VISION, path: 'pricePerWeight' },
    { source: FIELD_SOURCE.VISION, path: 'pricePerKg' },
    { source: FIELD_SOURCE.VISION, path: 'pricePerLb' },
    { source: FIELD_SOURCE.VISION, path: 'unitPricePerWeight' },
  ],
};

// ============================================================================
// EXTRACTION RESULT TYPES
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
 * Complete extraction result for all fields
 * @typedef {Object} AllFieldsExtraction
 * @property {ExtractedField} description
 * @property {ExtractedField} quantity
 * @property {ExtractedField} unitPrice
 * @property {ExtractedField} totalPrice
 * @property {ExtractedField} quantityUnit
 * @property {ExtractedField} format
 * @property {ExtractedField} weight
 * @property {ExtractedField} weightUnit
 * @property {ExtractedField} sku
 * @property {ExtractedField} category
 * @property {ExtractedField} pricePerWeight
 * @property {ExtractionContext} context - Derived context
 */

/**
 * Context derived from extraction
 * @typedef {Object} ExtractionContext
 * @property {UnitType} unitType - Classified unit type
 * @property {boolean} isWeightUnit - True if qty IS weight
 * @property {boolean} isCountUnit - True if qty is count
 * @property {boolean} isContainerUnit - True if qty is container count
 * @property {string} expectedFormula - 'weight' | 'unit' based on unit
 * @property {boolean} hasExplicitWeight - True if weight came from explicit column
 * @property {boolean} hasFormatWeight - True if weight from format parsing
 * @property {boolean} hasDescriptionWeight - True if weight from description mining
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
// WEIGHT UNIT CONVERSION
// ============================================================================

/**
 * Weight unit conversion factors to grams
 */
export const WEIGHT_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
};

/**
 * Volume unit conversion factors to milliliters
 */
export const VOLUME_TO_ML = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  lt: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  gal: 3785.41,
  gallon: 3785.41,
  gallons: 3785.41,
  fl_oz: 29.5735,
  floz: 29.5735,
};

/**
 * Normalized weight unit names
 */
export const NORMALIZED_WEIGHT_UNIT = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
};

/**
 * Normalized volume unit names
 */
export const NORMALIZED_VOLUME_UNIT = {
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  lt: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  gal: 'gal',
  gallon: 'gal',
  gallons: 'gal',
  fl_oz: 'fl_oz',
  floz: 'fl_oz',
};

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
// HELPER TYPE GUARDS (runtime validation)
// ============================================================================

/**
 * Check if a line is ready for QuickBooks billing
 * @param {FoodSupplyProcessedLine} line - Processed line
 * @returns {boolean} True if canBill
 */
export function canBillLine(line) {
  return line?.validation?.canBill === true;
}

/**
 * Check if a line is ready for inventory processing
 * @param {FoodSupplyProcessedLine} line - Processed line
 * @returns {boolean} True if canProcess
 */
export function canProcessLine(line) {
  return line?.validation?.canProcess === true;
}

/**
 * Check if a line has any warnings
 * @param {FoodSupplyProcessedLine} line - Processed line
 * @returns {boolean} True if has warnings
 */
export function hasWarnings(line) {
  return (line?.validation?.warnings?.length ?? 0) > 0;
}

/**
 * Check if a line has high confidence (>= 90)
 * @param {FoodSupplyProcessedLine} line - Processed line
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
 * @param {string} type - Warning type from FOOD_SUPPLY_WARNING
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

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Source tracking
  FIELD_SOURCE,

  // Format types
  FORMAT_TYPE,

  // Pricing types
  PRICING_TYPE,

  // Unit type classification
  UNIT_TYPE,
  WEIGHT_UNIT_KEYWORDS,
  COUNT_UNIT_KEYWORDS,
  CONTAINER_UNIT_KEYWORDS,
  VOLUME_UNIT_KEYWORDS,
  classifyUnit,
  isWeightUnit,
  isCountUnit,
  isContainerUnit,
  isVolumeUnit,

  // Field priorities
  FIELD_PRIORITIES,

  // Confidence
  CONFIDENCE_THRESHOLD,
  CONFIDENCE_SCORE,

  // Warnings
  WARNING_SEVERITY,
  FOOD_SUPPLY_WARNING,

  // Conversions
  WEIGHT_TO_GRAMS,
  VOLUME_TO_ML,
  NORMALIZED_WEIGHT_UNIT,
  NORMALIZED_VOLUME_UNIT,

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
};
