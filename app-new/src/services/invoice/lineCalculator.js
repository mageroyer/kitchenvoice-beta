/**
 * Line Calculator Service
 *
 * SINGLE SOURCE OF TRUTH for all invoice line weight/price calculations.
 *
 * Instead of scattered regex patterns throughout the codebase,
 * all format parsing and calculations happen here.
 *
 * @module services/invoice/lineCalculator
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Weight unit conversions to grams (base unit)
 */
export const WEIGHT_TO_GRAMS = {
  g: 1,
  gr: 1,
  kg: 1000,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
};

/**
 * Format types we can parse
 */
export const FORMAT_TYPE = {
  PACK_WEIGHT: 'PACK_WEIGHT',     // "2/5LB" - N bags × W weight each
  MULTIPLIER: 'MULTIPLIER',       // "4x5lb" - N × W weight
  SIMPLE_WEIGHT: 'SIMPLE_WEIGHT', // "50lb" - just weight
  COUNT_PACK: 'COUNT_PACK',       // "12CT", "24PK" - count only
  UNKNOWN: 'UNKNOWN',
};

// ============================================
// FORMAT PARSING
// ============================================

/**
 * Parse a format string into structured data
 *
 * Handles:
 * - "2/5LB"  → { type: PACK_WEIGHT, packCount: 2, unitWeight: 5, unit: 'lb' }
 * - "4x5lb"  → { type: MULTIPLIER, multiplier: 4, unitWeight: 5, unit: 'lb' }
 * - "50lb"   → { type: SIMPLE_WEIGHT, weight: 50, unit: 'lb' }
 * - "12CT"   → { type: COUNT_PACK, count: 12, unit: 'ct' }
 *
 * @param {string} text - Format string or description containing format
 * @returns {Object} Parsed format data
 */
export function parseFormat(text) {
  if (!text || typeof text !== 'string') {
    return { type: FORMAT_TYPE.UNKNOWN, raw: text };
  }

  const raw = text.trim();

  // Pattern 1: Pack weight "2/5LB", "4/5LB", "1/50LB"
  // Meaning: packCount bags × unitWeight each
  const packMatch = raw.match(/(\d+)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)/i);
  if (packMatch) {
    const packCount = parseInt(packMatch[1], 10);
    const unitWeight = parseFloat(packMatch[2].replace(',', '.'));
    const unit = normalizeUnit(packMatch[3]);
    return {
      type: FORMAT_TYPE.PACK_WEIGHT,
      packCount,
      unitWeight,
      unit,
      weightPerCase: packCount * unitWeight,
      raw,
      formula: `${packCount} × ${unitWeight}${unit} = ${packCount * unitWeight}${unit}`,
    };
  }

  // Pattern 2: Multiplier "4x5lb", "2×10kg", "3X25LB"
  // Meaning: multiplier × unitWeight
  const multMatch = raw.match(/(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)/i);
  if (multMatch) {
    const multiplier = parseInt(multMatch[1], 10);
    const unitWeight = parseFloat(multMatch[2].replace(',', '.'));
    const unit = normalizeUnit(multMatch[3]);
    return {
      type: FORMAT_TYPE.MULTIPLIER,
      multiplier,
      unitWeight,
      unit,
      weightPerCase: multiplier * unitWeight,
      raw,
      formula: `${multiplier} × ${unitWeight}${unit} = ${multiplier * unitWeight}${unit}`,
    };
  }

  // Pattern 3: Simple weight "50lb", "25kg", "500g"
  // Meaning: direct weight value
  const simpleMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)/i);
  if (simpleMatch) {
    const weight = parseFloat(simpleMatch[1].replace(',', '.'));
    const unit = normalizeUnit(simpleMatch[2]);
    return {
      type: FORMAT_TYPE.SIMPLE_WEIGHT,
      weight,
      unit,
      weightPerCase: weight,
      raw,
      formula: `${weight}${unit}`,
    };
  }

  // Pattern 4: Count pack "12CT", "24PK", "6/CASE", "1DZ"
  // Meaning: count only, no weight
  const countMatch = raw.match(/(\d+)\s*\/?\s*(ct|pk|pcs?|case|cs|dz|dozen|ea|each|unit)/i);
  if (countMatch) {
    let count = parseInt(countMatch[1], 10);
    const unitType = countMatch[2].toLowerCase();

    // Dozen = 12
    if (unitType === 'dz' || unitType === 'dozen') {
      count = count * 12;
    }

    return {
      type: FORMAT_TYPE.COUNT_PACK,
      count,
      unitType,
      weightPerCase: null, // No weight for count packs
      raw,
      formula: `${count} units`,
    };
  }

  return { type: FORMAT_TYPE.UNKNOWN, raw };
}

/**
 * Extract format from description text
 * Searches for format patterns within longer text
 *
 * @param {string} description - Full description like "CARROT WHOLE CELLO BAG 2/5LB"
 * @returns {Object|null} Parsed format or null if not found
 */
export function extractFormatFromDescription(description) {
  if (!description) return null;

  // Try to find format patterns in the description
  const patterns = [
    /(\d+\s*\/\s*\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,  // 2/5LB
    /(\d+\s*[xX×]\s*\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i, // 4x5lb
    /(\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,              // 50lb
    /(\d+\s*(?:ct|pk|pcs?|case|dz|dozen))/i,                // 12CT
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return parseFormat(match[1]);
    }
  }

  return null;
}

/**
 * Normalize weight unit to standard form
 */
function normalizeUnit(unit) {
  const lower = unit.toLowerCase();
  if (lower === 'lbs') return 'lb';
  return lower;
}

// ============================================
// WEIGHT CALCULATIONS
// ============================================

/**
 * Calculate weight per case from format
 *
 * @param {Object} format - Parsed format from parseFormat()
 * @returns {number|null} Weight per case, or null if not applicable
 */
export function calculateWeightPerCase(format) {
  if (!format) return null;

  switch (format.type) {
    case FORMAT_TYPE.PACK_WEIGHT:
      // 2/5LB = 2 × 5 = 10lb per case
      return format.packCount * format.unitWeight;

    case FORMAT_TYPE.MULTIPLIER:
      // 4x5lb = 4 × 5 = 20lb per case
      return format.multiplier * format.unitWeight;

    case FORMAT_TYPE.SIMPLE_WEIGHT:
      // 50lb = 50lb per case
      return format.weight;

    case FORMAT_TYPE.COUNT_PACK:
      // 12CT = no weight
      return null;

    default:
      return null;
  }
}

/**
 * Calculate total weight for a line
 *
 * @param {Object} format - Parsed format
 * @param {number} quantity - Number of cases ordered
 * @returns {number|null} Total weight, or null if not applicable
 */
export function calculateTotalWeight(format, quantity) {
  const weightPerCase = calculateWeightPerCase(format);
  if (weightPerCase === null || !quantity) return null;
  return weightPerCase * quantity;
}

/**
 * Convert weight to grams
 *
 * @param {number} weight - Weight value
 * @param {string} unit - Weight unit (lb, kg, g, oz)
 * @returns {number} Weight in grams
 */
export function toGrams(weight, unit) {
  const factor = WEIGHT_TO_GRAMS[normalizeUnit(unit)] || 1;
  return weight * factor;
}

// ============================================
// PRICE CALCULATIONS
// ============================================

/**
 * Calculate price per weight unit
 *
 * @param {number} totalPrice - Line total price
 * @param {number} totalWeight - Total weight
 * @param {string} unit - Weight unit
 * @returns {Object} Price per various units
 */
export function calculatePricePerWeight(totalPrice, totalWeight, unit) {
  if (!totalPrice || !totalWeight || totalWeight <= 0) {
    return { pricePerUnit: null, pricePerG: null, pricePerLb: null, pricePerKg: null };
  }

  const pricePerUnit = totalPrice / totalWeight;
  const totalGrams = toGrams(totalWeight, unit);
  const pricePerG = totalPrice / totalGrams;

  return {
    pricePerUnit,          // Price per original unit (e.g., $/lb)
    pricePerG,             // Price per gram
    pricePerLb: pricePerG * 453.592,
    pricePerKg: pricePerG * 1000,
  };
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

/**
 * Calculate all values for an invoice line
 *
 * THIS IS THE MAIN ENTRY POINT - call this instead of scattered calculations
 *
 * @param {Object} line - Invoice line data
 * @param {number} line.quantity - Number of cases/units ordered
 * @param {string} [line.format] - Pack format string (e.g., "2/5LB")
 * @param {string} [line.description] - Product description (may contain format)
 * @param {number} [line.unitPrice] - Price per case
 * @param {number} [line.totalPrice] - Line total
 * @param {number} [line.weight] - Explicit weight (if separate column)
 * @param {string} [line.weightUnit] - Weight unit (if separate column)
 * @returns {Object} All calculated values
 */
export function calculateLineValues(line) {
  const {
    quantity = 1,
    format: formatString,
    description,
    unitPrice = 0,
    totalPrice = 0,
    weight: explicitWeight,
    weightUnit: explicitUnit,
  } = line;

  // Step 1: Parse format from various sources (priority order)
  let format = null;

  // Try explicit format field first
  if (formatString) {
    format = parseFormat(formatString);
  }

  // Try description if no format found
  if (!format || format.type === FORMAT_TYPE.UNKNOWN) {
    format = extractFormatFromDescription(description);
  }

  // Use explicit weight if provided and no format found
  if ((!format || format.type === FORMAT_TYPE.UNKNOWN) && explicitWeight && explicitUnit) {
    format = {
      type: FORMAT_TYPE.SIMPLE_WEIGHT,
      weight: explicitWeight,
      unit: normalizeUnit(explicitUnit),
      weightPerCase: explicitWeight,
      raw: `${explicitWeight}${explicitUnit}`,
      formula: `${explicitWeight}${explicitUnit}`,
    };
  }

  // Step 2: Calculate weights
  const weightPerCase = format ? calculateWeightPerCase(format) : null;
  const totalWeight = weightPerCase !== null ? weightPerCase * quantity : null;
  const unit = format?.unit || explicitUnit || null;

  // Convert to grams for normalized pricing
  const totalWeightGrams = totalWeight !== null && unit
    ? toGrams(totalWeight, unit)
    : null;

  // Step 3: Calculate prices
  const prices = totalWeight !== null && unit
    ? calculatePricePerWeight(totalPrice, totalWeight, unit)
    : { pricePerUnit: null, pricePerG: null, pricePerLb: null, pricePerKg: null };

  // Step 4: Build result
  return {
    // Input echo
    quantity,
    unitPrice,
    totalPrice,

    // Format info
    format: format || { type: FORMAT_TYPE.UNKNOWN },
    formatType: format?.type || FORMAT_TYPE.UNKNOWN,
    formatFormula: format?.formula || null,

    // Weight calculations
    weightPerCase,
    totalWeight,
    weightUnit: unit,
    totalWeightGrams,

    // Price calculations
    pricePerUnit: prices.pricePerUnit,   // e.g., $1.295/lb
    pricePerG: prices.pricePerG,
    pricePerLb: prices.pricePerLb,
    pricePerKg: prices.pricePerKg,

    // For display
    display: buildDisplayString(quantity, weightPerCase, totalWeight, unit, format),

    // Validation
    isWeightBased: weightPerCase !== null,
    isCountBased: format?.type === FORMAT_TYPE.COUNT_PACK,
    hasValidFormat: format !== null && format.type !== FORMAT_TYPE.UNKNOWN,
  };
}

/**
 * Build a human-readable display string
 */
function buildDisplayString(quantity, weightPerCase, totalWeight, unit, format) {
  if (!weightPerCase || !unit) {
    if (format?.type === FORMAT_TYPE.COUNT_PACK) {
      return `${quantity} × ${format.count} = ${quantity * format.count} units`;
    }
    return `${quantity} units`;
  }

  return `${quantity} × ${weightPerCase}${unit} = ${totalWeight}${unit}`;
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Calculate values for all lines in an invoice
 *
 * @param {Array} lines - Array of invoice lines
 * @returns {Array} Lines with calculated values attached
 */
export function calculateAllLines(lines) {
  if (!Array.isArray(lines)) return [];

  return lines.map((line, index) => {
    const calculated = calculateLineValues(line);
    return {
      ...line,
      ...calculated,
      lineNumber: line.lineNumber || index + 1,
    };
  });
}

/**
 * Get summary statistics for calculated lines
 *
 * @param {Array} calculatedLines - Lines from calculateAllLines()
 * @returns {Object} Summary stats
 */
export function getCalculationSummary(calculatedLines) {
  const total = calculatedLines.length;
  const withWeight = calculatedLines.filter(l => l.isWeightBased).length;
  const withCount = calculatedLines.filter(l => l.isCountBased).length;
  const withValidFormat = calculatedLines.filter(l => l.hasValidFormat).length;
  const unknown = calculatedLines.filter(l => !l.hasValidFormat).length;

  const totalWeightLb = calculatedLines
    .filter(l => l.totalWeight && l.weightUnit === 'lb')
    .reduce((sum, l) => sum + l.totalWeight, 0);

  const totalWeightKg = calculatedLines
    .filter(l => l.totalWeight && l.weightUnit === 'kg')
    .reduce((sum, l) => sum + l.totalWeight, 0);

  return {
    total,
    withWeight,
    withCount,
    withValidFormat,
    unknown,
    parseRate: total > 0 ? Math.round((withValidFormat / total) * 100) : 0,
    totalWeightLb,
    totalWeightKg,
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  // Constants
  FORMAT_TYPE,
  WEIGHT_TO_GRAMS,

  // Parsing
  parseFormat,
  extractFormatFromDescription,

  // Calculations
  calculateWeightPerCase,
  calculateTotalWeight,
  calculatePricePerWeight,
  calculateLineValues,
  toGrams,

  // Batch
  calculateAllLines,
  getCalculationSummary,
};
