/**
 * Base Handler
 *
 * Shared utilities and base functionality for invoice type handlers.
 *
 * @module services/invoice/handlers/baseHandler
 */

import {
  parsePackagingInfo,
  extractProductDimensions,
  extractContainerCapacity
} from '../../../utils/packagingParser';
import {
  LINE_TYPE,
  CONFIDENCE,
  SOURCE,
  ANOMALY_TYPES,
  ANALYSIS_STATUS,
  MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,
  CONFIDENCE_SCORE,
  CONFIDENCE_THRESHOLD,
  FIELD_SOURCE,
} from './types';

// ============================================
// VALUE SANITIZATION
// ============================================

/**
 * Placeholder values that should be treated as null/missing.
 * These are commonly used in invoices to indicate "not applicable" or "see notes".
 */
const PLACEHOLDER_VALUES = ['**', '--', '-', 'N/A', 'n/a', 'NA', 'na', '...', '—', '––', '***', '----'];

/**
 * Sanitize a value from Claude output, converting placeholders to null.
 * Handles common invoice placeholder values like **, --, N/A, etc.
 *
 * @param {any} value - Value from Claude output
 * @returns {any} Original value or null if it's a placeholder
 */
export function sanitizeValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (PLACEHOLDER_VALUES.includes(trimmed)) {
      return null;
    }
  }
  return value;
}

/**
 * Sanitize and parse a numeric value from Claude output.
 * Converts placeholders like **, --, N/A to null before parsing.
 *
 * @param {any} value - Value from Claude output
 * @returns {number|null} Parsed number or null
 */
export function sanitizeNumericValue(value) {
  const sanitized = sanitizeValue(value);
  if (sanitized == null) return null;
  const num = parseFloat(sanitized);
  return isNaN(num) ? null : num;
}

// ============================================
// EXTRACTED FIELD FACTORIES
// ============================================

/**
 * Create an extracted field object with source tracking.
 *
 * @param {any} value - The extracted value
 * @param {string} source - Source indicator (FIELD_SOURCE value)
 * @param {string} path - Path/field name where value was found
 * @param {number} [confidence=100] - Confidence score 0-100
 * @returns {Object} ExtractedField
 */
export function createExtractedField(value, source, path, confidence = 100) {
  return {
    value,
    source,
    path,
    confidence,
    valid: value !== null && value !== undefined && value !== '',
  };
}

/**
 * Create an empty extracted field (no value found).
 *
 * @returns {Object} Empty ExtractedField
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

// ============================================
// FIELD EXTRACTION BY PRIORITY
// ============================================

/**
 * Extract a field value by trying sources in priority order.
 * This is the shared implementation used by all handlers.
 *
 * @param {Object} line - Line object to extract from
 * @param {Array} priorities - Array of priority objects { source, path, confidence, fromColumn? }
 * @param {Object} [profile] - Vendor profile for mapped columns
 * @returns {Object} ExtractedField { value, source, path, confidence, valid }
 *
 * @example
 * const field = extractFieldByPriority(line, [
 *   { source: FIELD_SOURCE.MAPPED, fromColumn: 'sku', confidence: 100 },
 *   { source: FIELD_SOURCE.VISION, path: 'itemCode', confidence: 90 },
 *   { source: FIELD_SOURCE.VISION, path: 'code', confidence: 80 },
 * ], vendorProfile);
 */
export function extractFieldByPriority(line, priorities, profile = null) {
  for (const priority of priorities) {
    let value = null;

    // Handle mapped columns (from vendor profile)
    if (priority.source === FIELD_SOURCE.MAPPED && priority.fromColumn && profile) {
      value = getColumnValue(line, profile, priority.fromColumn);
    }
    // Skip extracted and default sources - handled separately by type-specific logic
    else if (priority.source === FIELD_SOURCE.EXTRACTED || priority.source === FIELD_SOURCE.DEFAULT) {
      continue;
    }
    // Handle direct Vision paths
    else {
      value = line[priority.path];
    }

    // Check if we got a valid value
    if (value !== null && value !== undefined && value !== '') {
      return createExtractedField(
        value,
        priority.source,
        priority.path,
        priority.confidence || 100
      );
    }
  }

  return createEmptyExtractedField();
}

/**
 * Extract numeric field by trying sources in priority order.
 * Automatically parses and validates numeric values.
 *
 * @param {Object} line - Line object
 * @param {Array} priorities - Priority list
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} ExtractedField with numeric value
 *
 * @example
 * const qty = extractNumericFieldByPriority(line, [
 *   { source: FIELD_SOURCE.MAPPED, fromColumn: 'quantity', confidence: 100 },
 *   { source: FIELD_SOURCE.VISION, path: 'quantity', confidence: 90 },
 *   { source: FIELD_SOURCE.VISION, path: 'qty', confidence: 80 },
 * ], vendorProfile);
 */
export function extractNumericFieldByPriority(line, priorities, profile = null) {
  for (const priority of priorities) {
    let rawValue = null;

    if (priority.source === FIELD_SOURCE.MAPPED && priority.fromColumn && profile) {
      rawValue = getNumericColumnValue(line, profile, priority.fromColumn);
    } else if (priority.source !== FIELD_SOURCE.EXTRACTED && priority.source !== FIELD_SOURCE.DEFAULT) {
      rawValue = line[priority.path];
    }

    // Clean and parse numeric value
    if (rawValue !== null && rawValue !== undefined) {
      const cleaned = String(rawValue).replace(/[,$]/g, '');
      const numValue = parseFloat(cleaned);
      if (!isNaN(numValue)) {
        return createExtractedField(
          numValue,
          priority.source,
          priority.path,
          priority.confidence || 100
        );
      }
    }
  }

  return createEmptyExtractedField();
}

// ============================================
// MATH VALIDATION UTILITIES
// ============================================

/**
 * Get confidence score based on math difference.
 *
 * @param {number} difference - Absolute difference in dollars
 * @returns {number} Confidence score 0-100
 */
export function getMathConfidence(difference) {
  if (difference === 0) return CONFIDENCE_SCORE.MATH_EXACT;
  if (difference <= MATH_TOLERANCE_THRESHOLDS.ROUNDING) return CONFIDENCE_SCORE.MATH_ROUNDING;
  if (difference <= MATH_TOLERANCE_THRESHOLDS.ACCEPTABLE) return CONFIDENCE_SCORE.MATH_TOLERANCE;
  if (difference <= MATH_TOLERANCE_THRESHOLDS.MINOR) return CONFIDENCE_SCORE.MATH_MINOR;
  if (difference <= MATH_TOLERANCE_THRESHOLDS.REVIEW) return CONFIDENCE_SCORE.MATH_REVIEW;
  return CONFIDENCE_SCORE.MATH_ERROR;
}

/**
 * Validate simple math: qty × unitPrice = total
 * This is the base formula used by packaging and unit-based handlers.
 *
 * @param {Object} params - Validation parameters
 * @param {number} params.quantity - Quantity ordered
 * @param {number} params.unitPrice - Price per unit
 * @param {number|null} params.totalPrice - Actual total from invoice
 * @param {number} [params.tolerance=0.02] - Tolerance in dollars
 * @returns {Object} MathValidation { valid, expected, actual, difference, confidence, formula }
 *
 * @example
 * const math = validateMathSimple({ quantity: 5, unitPrice: 10.00, totalPrice: 50.00 });
 * // { valid: true, expected: 50, actual: 50, difference: 0, confidence: 100, formula: 'qty × unitPrice' }
 */
export function validateMathSimple({ quantity, unitPrice, totalPrice, tolerance = MATH_TOLERANCE }) {
  const qty = quantity || 0;
  const price = unitPrice || 0;

  // Calculate expected total
  const expectedTotal = Math.round(qty * price * 100) / 100;

  // If no actual total provided, assume valid
  if (totalPrice === null || totalPrice === undefined) {
    return {
      valid: true,
      expected: expectedTotal,
      actual: null,
      difference: 0,
      confidence: CONFIDENCE_SCORE.MATH_TOLERANCE,
      formula: 'qty × unitPrice',
    };
  }

  const difference = Math.abs(expectedTotal - totalPrice);
  const valid = difference <= tolerance;
  const confidence = getMathConfidence(difference);

  return {
    valid,
    expected: expectedTotal,
    actual: totalPrice,
    difference: Math.round(difference * 100) / 100,
    confidence,
    formula: 'qty × unitPrice',
  };
}

// ============================================
// CONFIDENCE CALCULATION
// ============================================

/**
 * Get confidence level string from numeric score.
 *
 * @param {number} score - Confidence score 0-100
 * @returns {string} 'high', 'medium', or 'low'
 */
export function getConfidenceLevel(score) {
  if (score >= CONFIDENCE_THRESHOLD.HIGH) return 'high';
  if (score >= CONFIDENCE_THRESHOLD.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Calculate weighted confidence score.
 * Accepts custom weights for different validation components.
 *
 * @param {Object} components - Score components { [name]: { score, weight } }
 * @returns {number} Weighted confidence (0-100)
 *
 * @example
 * // For packaging: Math 50%, Format 30%, Core 20%
 * const confidence = calculateWeightedConfidence({
 *   math: { score: 100, weight: 0.50 },
 *   format: { score: 80, weight: 0.30 },
 *   core: { score: 100, weight: 0.20 },
 * });
 * // Returns: 100*0.5 + 80*0.3 + 100*0.2 = 94
 *
 * @example
 * // For food supply: Math 50%, Weight 30%, Core 20%
 * const confidence = calculateWeightedConfidence({
 *   math: { score: 95, weight: 0.50 },
 *   weight: { score: 90, weight: 0.30 },
 *   core: { score: 100, weight: 0.20 },
 * });
 * // Returns: 95*0.5 + 90*0.3 + 100*0.2 = 94.5 → 95
 */
export function calculateWeightedConfidence(components) {
  let totalScore = 0;
  let totalWeight = 0;

  for (const [_name, component] of Object.entries(components)) {
    const score = component.score || 0;
    const weight = component.weight || 0;
    totalScore += score * weight;
    totalWeight += weight;
  }

  // Normalize if weights don't sum to 1
  if (totalWeight > 0 && totalWeight !== 1) {
    totalScore = totalScore / totalWeight;
  }

  return Math.round(totalScore);
}

// ============================================
// SHARED UTILITIES
// ============================================

/**
 * Extracts common fields from an invoice line item.
 * Used by all handlers for base field extraction.
 *
 * @param {Object} lineItem - Invoice line item from Claude
 * @param {Object} vendor - Vendor object
 * @returns {Object} Base item fields
 */
export function extractBaseFields(lineItem, vendor) {
  const now = new Date().toISOString();

  return {
    // Core identification - prefer name, fallback to description
    name: (lineItem.name || lineItem.description || '').trim(),
    description: lineItem.description || lineItem.name || null,
    quantity: parseFloat(lineItem.quantity) || 1,
    unitPrice: parseFloat(lineItem.unitPrice) || null,
    totalPrice: parseFloat(lineItem.totalPrice) || parseFloat(lineItem.total) || null,
    unit: lineItem.unit || lineItem.quantityUnit || null,
    category: lineItem.category || null,
    sku: lineItem.sku || lineItem.itemCode || lineItem.code || null,
    vendorId: vendor?.id || null,
    vendorName: vendor?.name || null,

    // Quantity from invoice
    lastOrderQty: parseFloat(lineItem.quantity) || 1,
    lastOrderDate: now,

    // Pricing
    lastPurchasePrice: parseFloat(lineItem.unitPrice) || null,
    lastInvoiceTotal: parseFloat(lineItem.total) || null,

    // Metadata
    createdAt: now,
    updatedAt: now,
    source: 'invoice'
  };
}

/**
 * Extracts container capacity info from item description.
 * Used for items like containers, lids, cups.
 *
 * @param {string} description - Item description
 * @returns {Object|null} Container capacity info or null
 */
export function extractContainerInfo(description) {
  const capacityInfo = extractContainerCapacity(description);
  if (!capacityInfo) return null;

  return {
    containerCapacity: capacityInfo.capacity,
    containerCapacityUnit: capacityInfo.unit,
    containerType: capacityInfo.containerType
  };
}

/**
 * Extracts product dimensions from item description.
 * Used for items with size specs (8X8, 9" ROUND).
 *
 * @param {string} description - Item description
 * @returns {Object|null} Dimension info or null
 */
export function extractDimensionInfo(description) {
  const dimensionInfo = extractProductDimensions(description);
  if (!dimensionInfo.dimensions && !dimensionInfo.specs) return null;

  return {
    productDimensions: dimensionInfo.dimensions || null,
    productSpecs: dimensionInfo.specs || null
  };
}

/**
 * Calculates price per gram from various input formats.
 *
 * @param {Object} options - Calculation options
 * @param {number} options.price - Price amount
 * @param {number} [options.weight] - Weight amount
 * @param {string} [options.weightUnit] - Weight unit (kg, lb, g, oz)
 * @param {number} [options.quantity] - Quantity
 * @returns {number|null} Price per gram or null
 */
export function calculatePricePerGram({ price, weight, weightUnit, quantity }) {
  if (!price || price <= 0) return null;

  // If we have weight, calculate based on that
  if (weight && weight > 0) {
    let weightInGrams = weight;

    // Convert to grams
    switch (weightUnit?.toLowerCase()) {
      case 'kg':
        weightInGrams = weight * 1000;
        break;
      case 'lb':
      case 'lbs':
        weightInGrams = weight * 453.592;
        break;
      case 'oz':
        weightInGrams = weight * 28.3495;
        break;
      case 'g':
      default:
        weightInGrams = weight;
    }

    return price / weightInGrams;
  }

  // No weight-based calculation possible
  return null;
}

/**
 * Merges handler-specific fields with existing item data.
 * Preserves existing values unless explicitly updated.
 *
 * @param {Object} existingItem - Existing inventory item
 * @param {Object} updates - New field values
 * @param {Object} options - Merge options
 * @param {boolean} [options.preserveExisting=true] - Preserve existing non-null values
 * @returns {Object} Merged updates
 */
export function mergeItemUpdates(existingItem, updates, options = {}) {
  const { preserveExisting = true } = options;
  const merged = { ...updates };

  if (preserveExisting) {
    // Only update fields that are null/undefined in existing item
    for (const [key, value] of Object.entries(merged)) {
      if (existingItem[key] !== null && existingItem[key] !== undefined) {
        // Keep existing value for certain backfill-only fields
        const backfillOnlyFields = [
          'containerCapacity',
          'containerCapacityUnit',
          'containerType',
          'productDimensions',
          'productSpecs'
        ];

        if (backfillOnlyFields.includes(key)) {
          delete merged[key];
        }
      }
    }
  }

  // Always update these fields with latest invoice data
  merged.updatedAt = new Date().toISOString();

  return merged;
}

/**
 * Validates that required fields are present in a line item.
 *
 * @param {Object} lineItem - Invoice line item
 * @param {string[]} requiredFields - List of required field names
 * @returns {Object} Validation result { valid, errors }
 */
export function validateRequiredFields(lineItem, requiredFields) {
  const errors = [];

  for (const field of requiredFields) {
    const value = lineItem[field];
    if (value === null || value === undefined || value === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// UNIT TYPE DETECTION & NORMALIZATION
// ============================================

/**
 * Check if unit is a volume unit.
 * IMPORTANT: 'l' check must exclude 'lb'/'lbs' (weight units).
 *
 * @param {string} unit - The unit to check
 * @returns {boolean} True if volume unit
 */
export function isVolumeUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  // 'l' alone means litre, but 'lb'/'lbs' are weight
  const isLitre = normalized === 'l' || normalized === 'litre' || normalized === 'liter';
  return normalized.startsWith('ml') ||
         isLitre ||
         normalized.startsWith('cl') ||
         normalized.startsWith('fl') ||
         normalized.startsWith('gal') ||
         normalized.startsWith('qt') ||
         normalized.startsWith('pt');
}

/**
 * Check if unit is a weight unit.
 *
 * @param {string} unit - The unit to check
 * @returns {boolean} True if weight unit
 */
export function isWeightUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  return normalized.startsWith('kg') ||
         normalized.startsWith('kilo') ||
         normalized.startsWith('lb') ||
         normalized.startsWith('g') ||
         normalized.startsWith('gram') ||
         normalized.startsWith('oz') ||
         normalized.startsWith('ounce');
}

/**
 * Normalize volume unit to standard abbreviation.
 *
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (ml, L, cl, gal, qt, pt, fl oz)
 */
export function normalizeVolumeUnit(unit) {
  if (!unit) return 'ml';
  const normalized = unit.toLowerCase().trim();
  if (normalized === 'l' || normalized === 'litre' || normalized === 'liter') return 'L';
  if (normalized.startsWith('ml') || normalized === 'millilitre') return 'ml';
  if (normalized.startsWith('cl') || normalized === 'centilitre') return 'cl';
  if (normalized.startsWith('gal')) return 'gal';
  if (normalized.startsWith('qt') || normalized === 'quart') return 'qt';
  if (normalized.startsWith('pt') || normalized === 'pint') return 'pt';
  if (normalized.startsWith('fl')) return 'fl oz';
  return 'ml'; // Default to ml
}

/**
 * Normalize quantity/count unit to standard abbreviation.
 *
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (pc, case, box, bag, pack, doz, can)
 */
export function normalizeQuantityUnit(unit) {
  if (!unit) return 'pc';
  const normalized = unit.toLowerCase().trim();
  if (normalized.startsWith('case') || normalized === 'cs') return 'case';
  if (normalized.startsWith('box')) return 'box';
  if (normalized.startsWith('bag')) return 'bag';
  if (normalized.startsWith('pack') || normalized === 'pqt') return 'pack';
  if (normalized === 'each' || normalized === 'ea' || normalized === 'unit' || normalized === 'unt') return 'pc';
  if (normalized.startsWith('doz')) return 'doz';
  if (normalized.startsWith('can') || normalized === 'bt') return 'can';
  return unit; // Keep original if not recognized
}

/**
 * Detect unit type and return category.
 *
 * @param {string} unit - The unit to categorize
 * @returns {'weight'|'volume'|'count'|'unknown'} Unit category
 */
export function getUnitCategory(unit) {
  if (!unit) return 'unknown';
  if (isWeightUnit(unit)) return 'weight';
  if (isVolumeUnit(unit)) return 'volume';
  // Check for count-like units
  const normalized = unit.toLowerCase().trim();
  const countUnits = ['pc', 'pcs', 'piece', 'each', 'ea', 'unit', 'case', 'cs', 'box', 'bag', 'pack', 'doz', 'dozen', 'can', 'bt'];
  if (countUnits.some(cu => normalized.startsWith(cu))) return 'count';
  return 'unknown';
}

// ============================================
// LINE TYPE DETECTION
// ============================================

/**
 * Detects line type for accounting/inventory routing.
 * Base implementation - handlers can override for type-specific logic.
 *
 * @param {Object} line - Line item with description, quantity, totalPrice
 * @returns {string} LINE_TYPE value
 */
export function detectLineType(line) {
  const desc = (line.description || line.rawDescription || line.name || '').toLowerCase();
  const qty = line.quantity ?? 1;
  const total = line.totalPrice ?? 0;

  // CREDIT: Negative values or explicit credit terms
  if (total < 0 || qty < 0 || line.isCredit) {
    return LINE_TYPE.CREDIT;
  }

  // DEPOSIT: Bottle deposits, consignment, container fees
  if (/consign|dépôt|depot|deposit|bottle fee|contenan|container|emballage|récup/i.test(desc)) {
    return LINE_TYPE.DEPOSIT;
  }

  // FEE: Delivery, shipping, freight, service charges
  if (/delivery|livraison|freight|shipping|\bfrais\b|transport|service charge|surcharge|fuel/i.test(desc)) {
    return LINE_TYPE.FEE;
  }

  // ZERO: Explicitly zero quantity AND zero price
  if (line.quantity === 0 && line.totalPrice === 0) {
    return LINE_TYPE.ZERO;
  }

  // Default: Regular product
  return LINE_TYPE.PRODUCT;
}

/**
 * Sets routing flags based on line type.
 *
 * @param {Object} line - Line item with lineType
 * @returns {Object} Routing flags { forInventory, forAccounting, isDeposit }
 */
export function getRoutingFlags(line) {
  const lineType = line.lineType || LINE_TYPE.PRODUCT;

  return {
    // Only products go to inventory
    forInventory: lineType === LINE_TYPE.PRODUCT,

    // Products + fees + credits go to accounting
    forAccounting: lineType === LINE_TYPE.PRODUCT ||
                   lineType === LINE_TYPE.FEE ||
                   lineType === LINE_TYPE.CREDIT,

    // Quick flag for deposit handling
    isDeposit: lineType === LINE_TYPE.DEPOSIT
  };
}

// ============================================
// LINE ANALYSIS
// ============================================

/**
 * Analyzes a single line item for math validation and anomalies.
 * Base implementation - uses standard qty × price = total formula.
 * Handlers can override for type-specific analysis (weight-based, etc).
 *
 * @param {Object} line - Line item from Claude parsing
 * @param {number} lineNumber - Line number (1-indexed)
 * @returns {Object} Analysis result with anomalies
 */
export function analyzeLineItem(line, lineNumber) {
  const anomalies = [];

  // Get raw values
  const description = line.description || line.name || '';
  const quantity = parseFloat(line.quantity) || 0;
  const unitPrice = parseFloat(line.unitPrice) || 0;
  const totalPrice = parseFloat(line.totalPrice) || parseFloat(line.total) || 0;

  // ═══════════════════════════════════════════════════════════
  // MATH VALIDATION: qty × price = total (standard formula)
  // ═══════════════════════════════════════════════════════════
  const expectedTotal = Math.round(quantity * unitPrice * 100) / 100;
  const mathDiff = Math.abs(expectedTotal - totalPrice);
  const mathValid = mathDiff <= MATH_TOLERANCE;

  if (!mathValid && quantity > 0 && unitPrice > 0 && totalPrice > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.MATH_MISMATCH,
      severity: 'warning',
      message: `Math error: ${quantity} × $${unitPrice.toFixed(2)} = $${expectedTotal.toFixed(2)}, but invoice shows $${totalPrice.toFixed(2)}`,
      expected: expectedTotal,
      actual: totalPrice,
      difference: mathDiff,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ZERO PRICE (item may be unavailable)
  // ═══════════════════════════════════════════════════════════
  if (unitPrice === 0 && quantity > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.ZERO_PRICE,
      severity: 'info',
      message: `Zero price: "${description.slice(0, 40)}" - item may be unavailable`,
      quantity,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // MISSING QUANTITY
  // ═══════════════════════════════════════════════════════════
  if (quantity === 0 && unitPrice > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.MISSING_QUANTITY,
      severity: 'warning',
      message: `Missing quantity for "${description.slice(0, 40)}"`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // NEGATIVE VALUES (credits/returns)
  // ═══════════════════════════════════════════════════════════
  if (quantity < 0 || unitPrice < 0 || totalPrice < 0) {
    anomalies.push({
      type: ANOMALY_TYPES.NEGATIVE_VALUE,
      severity: 'info',
      message: `Negative value in "${description.slice(0, 40)}" - likely a credit/return`,
      quantity,
      unitPrice,
      totalPrice,
    });
  }

  // Detect line type using the input line
  const lineType = detectLineType(line);
  const routing = getRoutingFlags({ lineType });

  return {
    lineNumber,
    rawDescription: description,

    // Validated values
    quantity,
    unitPrice,
    totalPrice,
    expectedTotal,
    mathDiff,
    mathValid,

    // Line type and routing
    lineType,
    forInventory: routing.forInventory,
    forAccounting: routing.forAccounting,
    isDeposit: routing.isDeposit,

    // Pricing type (base is always unit-based)
    pricingType: 'unit',
    isWeightBasedPricing: false,

    // Flags
    isZeroPrice: unitPrice === 0,
    isCredit: totalPrice < 0,

    // Anomalies
    anomalies,
    hasAnomalies: anomalies.length > 0,

    // Status
    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

/**
 * Analyzes all line items and builds summary.
 * Base implementation - handlers can override.
 *
 * @param {Array} lineItems - Array of line items from Claude
 * @returns {Object} Analysis results { results, summary, allAnomalies }
 */
export function analyzeAllLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return {
      results: [],
      summary: {
        totalLines: 0,
        linesWithIssues: 0,
        totalAnomalies: 0,
        calculatedSubtotal: 0,
      },
      allAnomalies: [],
    };
  }

  const analyzedLines = lineItems.map((line, index) =>
    analyzeLineItem(line, index + 1)
  );

  // Collect all anomalies
  const allAnomalies = [];
  analyzedLines.forEach(line => {
    line.anomalies.forEach(anomaly => {
      allAnomalies.push({
        ...anomaly,
        lineNumber: line.lineNumber,
        description: line.rawDescription,
      });
    });
  });

  // Calculate summary
  const linesWithIssues = analyzedLines.filter(l => l.hasAnomalies).length;
  const totalAnomalies = allAnomalies.length;
  const calculatedSubtotal = analyzedLines.reduce((sum, l) => sum + l.totalPrice, 0);

  return {
    results: analyzedLines,
    summary: {
      totalLines: analyzedLines.length,
      linesWithIssues,
      totalAnomalies,
      calculatedSubtotal: Math.round(calculatedSubtotal * 100) / 100,
      errors: allAnomalies.filter(a => a.severity === 'error').length,
      warnings: allAnomalies.filter(a => a.severity === 'warning').length,
      infos: allAnomalies.filter(a => a.severity === 'info').length,
    },
    allAnomalies,
  };
}

// ============================================
// LINE PROCESSING
// ============================================

/**
 * Processes a single line item with base logic.
 * Includes analysis (math validation, anomaly detection).
 * Handlers should override this for type-specific processing.
 *
 * @param {Object} claudeLine - Line item from Claude parsing
 * @param {number} index - Line index
 * @returns {Object} Processed line item with analysis
 */
export function processLine(claudeLine, index = 0) {
  // Run analysis on the line
  const analysis = analyzeLineItem(claudeLine, index + 1);

  // Start with Claude's data as base
  const processed = {
    lineNumber: index + 1,

    // Core fields - prefer Claude's structured data
    name: claudeLine.description || claudeLine.name || '',
    description: claudeLine.description || claudeLine.name || '',
    rawDescription: claudeLine.description || claudeLine.name || '',
    category: claudeLine.category || 'Other',
    itemCode: claudeLine.itemCode || '',

    // Quantities from analysis (validated)
    quantity: analysis.quantity,
    orderedQuantity: sanitizeNumericValue(claudeLine.orderedQuantity),

    // Pricing from analysis (validated)
    unitPrice: analysis.unitPrice,
    totalPrice: analysis.totalPrice,
    expectedTotal: analysis.expectedTotal,

    // Unit info from Claude
    unit: claudeLine.quantityUnit || 'ea',
    quantityUnit: claudeLine.quantityUnit || 'ea',

    // Analysis results
    mathValid: analysis.mathValid,
    mathDiff: analysis.mathDiff,
    isZeroPrice: analysis.isZeroPrice,
    isCredit: analysis.isCredit,
    pricingType: analysis.pricingType,
    isWeightBasedPricing: analysis.isWeightBasedPricing,

    // Analysis object (for test compatibility)
    analysis: {
      status: analysis.status,
      anomalies: analysis.anomalies,
      hasAnomalies: analysis.hasAnomalies,
    },

    // Anomalies from analysis (also at root for convenience)
    anomalies: analysis.anomalies,
    hasAnomalies: analysis.hasAnomalies,
    analysisStatus: analysis.status,

    // Raw columns for display
    rawColumns: claudeLine.rawColumns || null,

    // Learned corrections from vendor profile
    learnedCorrection: claudeLine.learnedCorrection || false,
    learnedFormat: claudeLine.learnedFormat || null,

    // Source tracking
    source: SOURCE.CLAUDE,
    confidence: analysis.mathValid ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
  };

  // Detect line type
  processed.lineType = detectLineType(processed);

  // Set routing flags
  const routing = getRoutingFlags(processed);
  processed.forInventory = routing.forInventory;
  processed.forAccounting = routing.forAccounting;
  processed.isDeposit = routing.isDeposit;

  return processed;
}

// ============================================
// COLUMN MAPPING UTILITIES
// ============================================

/**
 * Gets a column value from a line's rawColumns array.
 * Utility for handlers to extract values from profile-mapped columns.
 *
 * @param {Object} line - Line item with rawColumns array
 * @param {Object} profile - Vendor parsing profile
 * @param {string} columnName - Column name (e.g., 'packageFormat', 'quantityUnit')
 * @returns {string|null} Column value or null if not found
 */
export function getColumnValue(line, profile, columnName) {
  if (!line?.rawColumns || !profile?.columns?.[columnName]) {
    return null;
  }
  const colIndex = profile.columns[columnName].index;
  if (colIndex == null || colIndex < 0 || colIndex >= line.rawColumns.length) {
    return null;
  }
  return line.rawColumns[colIndex] || null;
}

/**
 * Gets a numeric column value from a line's rawColumns array.
 *
 * @param {Object} line - Line item with rawColumns array
 * @param {Object} profile - Vendor parsing profile
 * @param {string} columnName - Column name
 * @returns {number|null} Parsed number or null
 */
export function getNumericColumnValue(line, profile, columnName) {
  const value = getColumnValue(line, profile, columnName);
  if (value == null) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// ============================================
// LINE PROCESSING
// ============================================

/**
 * Processes all line items with base logic.
 * Includes analysis for each line (math validation, anomalies).
 * This is the default implementation - handlers override for type-specific logic.
 *
 * @param {Array} claudeLines - Line items from Claude parsing
 * @param {Object} [profile] - Vendor parsing profile (for column mapping)
 * @returns {Object} Processed result { lines, summary, allAnomalies }
 */
export function processLines(claudeLines, profile = null) {
  const lines = [];
  const allAnomalies = [];

  claudeLines.forEach((claudeLine, index) => {
    const processed = processLine(claudeLine, index);
    lines.push(processed);

    // Collect anomalies
    if (processed.anomalies) {
      processed.anomalies.forEach(anomaly => {
        allAnomalies.push({
          ...anomaly,
          lineNumber: processed.lineNumber,
          description: processed.rawDescription,
        });
      });
    }
  });

  // Build summary by line type
  const productLines = lines.filter(l => l.lineType === LINE_TYPE.PRODUCT);
  const depositLines = lines.filter(l => l.lineType === LINE_TYPE.DEPOSIT);
  const feeLines = lines.filter(l => l.lineType === LINE_TYPE.FEE);
  const creditLines = lines.filter(l => l.lineType === LINE_TYPE.CREDIT);
  const zeroLines = lines.filter(l => l.lineType === LINE_TYPE.ZERO);

  const productSubtotal = Math.round(productLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100;
  const depositTotal = Math.round(depositLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100;
  const feeTotal = Math.round(feeLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100;
  const creditTotal = Math.round(creditLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100;

  // Analysis summary
  const linesWithAnomalies = lines.filter(l => l.hasAnomalies).length;

  return {
    lines,
    allAnomalies,
    summary: {
      totalLines: lines.length,
      byType: {
        product: { count: productLines.length, total: productSubtotal },
        deposit: { count: depositLines.length, total: depositTotal },
        fee: { count: feeLines.length, total: feeTotal },
        credit: { count: creditLines.length, total: creditTotal },
        zero: { count: zeroLines.length, total: 0 },
      },
      inventoryLineCount: lines.filter(l => l.forInventory).length,
      accountingLineCount: lines.filter(l => l.forAccounting).length,
      productSubtotal,
      depositTotal,
      feeTotal,
      creditTotal,
      effectiveSubtotal: Math.round((productSubtotal + feeTotal + creditTotal) * 100) / 100,
      calculatedSubtotal: Math.round(lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100,

      // Analysis stats
      linesWithAnomalies,
      linesWithIssues: linesWithAnomalies,  // Alias for test compatibility
      totalAnomalies: allAnomalies.length,
      errors: allAnomalies.filter(a => a.severity === 'error').length,
      warnings: allAnomalies.filter(a => a.severity === 'warning').length,
      infos: allAnomalies.filter(a => a.severity === 'info').length,
    }
  };
}

export default {
  extractBaseFields,
  extractContainerInfo,
  extractDimensionInfo,
  calculatePricePerGram,
  mergeItemUpdates,
  validateRequiredFields,
  // Value sanitization
  sanitizeValue,
  sanitizeNumericValue,
  // Extracted field factories
  createExtractedField,
  createEmptyExtractedField,
  // Field extraction utilities
  extractFieldByPriority,
  extractNumericFieldByPriority,
  // Math validation utilities
  getMathConfidence,
  validateMathSimple,
  // Confidence utilities
  getConfidenceLevel,
  calculateWeightedConfidence,
  // Unit utilities
  isVolumeUnit,
  isWeightUnit,
  normalizeVolumeUnit,
  normalizeQuantityUnit,
  getUnitCategory,
  // Column mapping utilities
  getColumnValue,
  getNumericColumnValue,
  // Line type detection
  detectLineType,
  getRoutingFlags,
  // Line analysis
  analyzeLineItem,
  analyzeAllLineItems,
  // Line processing
  processLine,
  processLines,
  // Re-export constants for convenience
  LINE_TYPE,
  CONFIDENCE,
  SOURCE,
  ANOMALY_TYPES,
  ANALYSIS_STATUS,
  MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,
  CONFIDENCE_SCORE,
  CONFIDENCE_THRESHOLD,
  FIELD_SOURCE,
};
