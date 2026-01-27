/**
 * Food Supply Utilities
 *
 * Weight format parsing and calculations specific to food supply invoices.
 *
 * This module handles formats commonly found on food distributor invoices:
 * - "2/5LB" (pack weight: 2 bags × 5lb = 10lb per case)
 * - "4x5lb" (multiplier: 4 × 5lb = 20lb)
 * - "50lb" (simple weight)
 * - "12CT" (count only)
 *
 * NOTE: This is food supply specific. Packaging distributors use different
 * formats (e.g., "1/500", "6/RL") handled by packagingParser.js.
 *
 * @module services/invoice/handlers/foodSupplyUtils
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
 * Volume unit conversions to milliliters (base unit)
 */
export const VOLUME_TO_ML = {
  ml: 1,
  cl: 10,
  l: 1000,
  lt: 1000,
  ltr: 1000,
  litre: 1000,
  liter: 1000,
  gal: 3785.41,
  gallon: 3785.41,
  qt: 946.353,
  quart: 946.353,
  pt: 473.176,
  pint: 473.176,
  floz: 29.5735,
  'fl oz': 29.5735,
};

/**
 * Check if unit is volume-based
 */
export function isVolumeUnit(unit) {
  if (!unit) return false;
  const lower = unit.toLowerCase().trim();
  return lower in VOLUME_TO_ML;
}

/**
 * Check if unit is weight-based
 */
export function isWeightUnit(unit) {
  if (!unit) return false;
  const lower = unit.toLowerCase().trim();
  return lower in WEIGHT_TO_GRAMS;
}

/**
 * Format types for food supply invoices
 */
export const FORMAT_TYPE = {
  // Weight-based formats
  PACK_WEIGHT: 'PACK_WEIGHT',       // "2/5LB" - N bags × W weight each
  MULTIPLIER: 'MULTIPLIER',         // "4x5lb" - N × W weight
  SIMPLE_WEIGHT: 'SIMPLE_WEIGHT',   // "50lb" - just weight
  WEIGHT_RANGE: 'WEIGHT_RANGE',     // "10-12LB" - weight range (use midpoint)
  BARE_UNIT: 'BARE_UNIT',           // "KG" - format is just a unit, qty IS weight
  UNIT_WEIGHT: 'UNIT_WEIGHT',       // "240G" in description - unit weight × qty
  PIECE_WEIGHT: 'PIECE_WEIGHT',     // "1.25LB PC" - weight per piece
  APPROXIMATE_WEIGHT: 'APPROXIMATE_WEIGHT', // "1/~15KG" - qty IS actual weight (~ means approx)
  // Volume-based formats
  PACK_VOLUME: 'PACK_VOLUME',       // "6/500ML" - N bottles × V volume each
  VOLUME_MULTIPLIER: 'VOLUME_MULTIPLIER', // "6×500ML" - N × V volume
  SIMPLE_VOLUME: 'SIMPLE_VOLUME',   // "500ML", "1L" - just volume
  UNIT_VOLUME: 'UNIT_VOLUME',       // "500ML" in description - unit volume × qty
  // Count-based formats
  COUNT_PACK: 'COUNT_PACK',         // "12CT", "24PK" - count only
  UNKNOWN: 'UNKNOWN',
};

// ============================================
// FORMAT PARSING
// ============================================

/**
 * Parse a format string into structured data
 *
 * Handles food supply formats:
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

  // Pattern 0: APPROXIMATE weight "1/~15KG", "1/~7KG", "1/~1KG"
  // Common for meat suppliers - format shows nominal/approximate weight per piece
  // The ~ indicates "approximately" - actual weight comes from quantity column
  // This is INFORMATIONAL ONLY - do not use for weight calculation
  const approxMatch = raw.match(/(\d+)\s*\/\s*~\s*(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)/i);
  if (approxMatch) {
    const packCount = parseInt(approxMatch[1], 10);
    const nominalWeight = parseFloat(approxMatch[2].replace(',', '.'));
    const unit = normalizeUnit(approxMatch[3]);
    return {
      type: FORMAT_TYPE.APPROXIMATE_WEIGHT,
      packCount,
      nominalWeight,        // Approximate weight per piece (informational)
      unit,
      weightPerCase: null,  // DO NOT calculate - actual weight comes from qty
      isApproximate: true,  // Flag: qty column contains actual weight
      raw,
      formula: `~${nominalWeight}${unit}/piece (approx)`,
    };
  }

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

  // Pattern 3: Weight range "10-12LB", "8-10KG" (use midpoint)
  // Common for fish/meat where each piece varies in weight
  const rangeMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*[-–to]+\s*(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)/i);
  if (rangeMatch) {
    const minWeight = parseFloat(rangeMatch[1].replace(',', '.'));
    const maxWeight = parseFloat(rangeMatch[2].replace(',', '.'));
    const avgWeight = (minWeight + maxWeight) / 2;
    const unit = normalizeUnit(rangeMatch[3]);
    return {
      type: FORMAT_TYPE.WEIGHT_RANGE,
      minWeight,
      maxWeight,
      avgWeight,
      unit,
      weightPerCase: avgWeight, // Use midpoint for calculations
      raw,
      formula: `${minWeight}-${maxWeight}${unit} (avg: ${avgWeight}${unit})`,
    };
  }

  // Pattern 4: Piece weight "1.25LB PC", "1.25LB/PC", "2KG/PC"
  // Weight per piece - multiply by quantity
  const pieceMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(lb|lbs|kg|g|oz)\s*[\/]?\s*(?:pc|pcs|piece|ea|each)/i);
  if (pieceMatch) {
    const weight = parseFloat(pieceMatch[1].replace(',', '.'));
    const unit = normalizeUnit(pieceMatch[2]);
    return {
      type: FORMAT_TYPE.PIECE_WEIGHT,
      weight,
      unit,
      weightPerCase: weight, // Weight per piece
      raw,
      formula: `${weight}${unit}/piece`,
    };
  }

  // Pattern 5: Bare unit "KG", "LB" - quantity IS weight
  // Common for items sold by weight (filets, etc.)
  const bareUnitMatch = raw.match(/^(lb|lbs|kg|g|oz)$/i);
  if (bareUnitMatch) {
    const unit = normalizeUnit(bareUnitMatch[1]);
    return {
      type: FORMAT_TYPE.BARE_UNIT,
      unit,
      weightPerCase: 1, // Multiplier = 1, actual weight comes from qty
      qtyIsWeight: true, // Flag to indicate qty column IS weight
      raw,
      formula: `qty × 1${unit}`,
    };
  }

  // Pattern 6: Simple weight "50lb", "25kg", "500g"
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

  // ===========================================
  // VOLUME PATTERNS (for liquids: vinegar, oil, sauces, etc.)
  // ===========================================

  // Pattern V1: Volume multiplier "6×500ML", "12x327ML", "6X500ML", "4x1L"
  // Meaning: multiplier × unit volume (most common format for bottles/cans)
  const volumeMultMatch = raw.match(/(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz)/i);
  if (volumeMultMatch) {
    const multiplier = parseInt(volumeMultMatch[1], 10);
    const unitVolume = parseFloat(volumeMultMatch[2].replace(',', '.'));
    const unit = normalizeVolumeUnit(volumeMultMatch[3]);
    const totalVolume = multiplier * unitVolume;
    const totalML = toML(totalVolume, unit);
    return {
      type: FORMAT_TYPE.VOLUME_MULTIPLIER,
      multiplier,
      unitVolume,
      unit,
      volumePerCase: totalVolume,
      totalML,
      isVolume: true,
      raw,
      formula: `${multiplier} × ${unitVolume}${unit} = ${totalVolume}${unit}`,
    };
  }

  // Pattern V2: Pack volume "6/500ML", "12/327ML"
  // Meaning: packCount bottles × unit volume each
  const packVolumeMatch = raw.match(/(\d+)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz)/i);
  if (packVolumeMatch) {
    const packCount = parseInt(packVolumeMatch[1], 10);
    const unitVolume = parseFloat(packVolumeMatch[2].replace(',', '.'));
    const unit = normalizeVolumeUnit(packVolumeMatch[3]);
    const totalVolume = packCount * unitVolume;
    const totalML = toML(totalVolume, unit);
    return {
      type: FORMAT_TYPE.PACK_VOLUME,
      packCount,
      unitVolume,
      unit,
      volumePerCase: totalVolume,
      totalML,
      isVolume: true,
      raw,
      formula: `${packCount} × ${unitVolume}${unit} = ${totalVolume}${unit}`,
    };
  }

  // Pattern V3: Simple volume "500ML", "1L", "1.5L", "750ml"
  // Meaning: direct volume value (per unit)
  const simpleVolumeMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz)/i);
  if (simpleVolumeMatch) {
    const volume = parseFloat(simpleVolumeMatch[1].replace(',', '.'));
    const unit = normalizeVolumeUnit(simpleVolumeMatch[2]);
    const totalML = toML(volume, unit);
    return {
      type: FORMAT_TYPE.SIMPLE_VOLUME,
      volume,
      unit,
      volumePerCase: volume,
      totalML,
      isVolume: true,
      raw,
      formula: `${volume}${unit}`,
    };
  }

  // ===========================================
  // COUNT PATTERNS
  // ===========================================

  // Pattern 7: Count pack "12CT", "24PK", "6/CASE", "1DZ"
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
 * Handles:
 * - Pack weight: "CARROT WHOLE CELLO BAG 2/5LB"
 * - Weight range: "SAUMON ATLANTIQUE FRAIS 10-12LB"
 * - Unit weight at end: "CHOCOLAT CÔTE D'OR 240G"
 * - Piece weight: "HOMARD VIVANT 1.25LB PC"
 * - Volume multiplier: "VINAIGRE 6x500ML"
 * - Simple volume: "HUILE D'OLIVE 1L"
 *
 * @param {string} description - Full description
 * @returns {Object|null} Parsed format or null if not found
 */
export function extractFormatFromDescription(description) {
  if (!description) return null;

  // Ordered patterns - more specific first to avoid false matches
  const patterns = [
    // Weight range: "10-12LB", "8-10KG" (before simple weight to avoid partial match)
    /(\d+(?:[.,]\d+)?\s*[-–to]+\s*\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,
    // Pack weight: "2/5LB", "4/5LB"
    /(\d+\s*\/\s*\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,
    // Multiplier weight: "4x5lb", "2×10kg"
    /(\d+\s*[xX×]\s*\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,
    // Volume multiplier: "6x500ML", "12×327ML", "4x1L" (BEFORE simple volume)
    /(\d+\s*[xX×]\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz))/i,
    // Pack volume: "6/500ML", "12/327ML"
    /(\d+\s*\/\s*\d+(?:[.,]\d+)?\s*(?:ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz))/i,
    // Piece weight: "1.25LB PC", "2KG/PC"
    /(\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz)\s*[\/]?\s*(?:pc|pcs|piece|ea|each))/i,
    // Simple weight: "50lb", "25kg"
    /(\d+(?:[.,]\d+)?\s*(?:lb|lbs|kg|g|oz))/i,
    // Simple volume: "500ML", "1L", "750ml" (after weight to prioritize weight units)
    /(\d+(?:[.,]\d+)?\s*(?:ml|cl|l|lt|ltr|litre|liter|gal|gallon|qt|quart|pt|pint|floz))/i,
    // Count pack: "12CT", "24PK"
    /(\d+\s*(?:ct|pk|pcs?|case|dz|dozen))/i,
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
 * Extract unit weight or volume from end of description
 * For packaged goods like "CHOCOLAT CÔTE D'OR 240G" or "LIMONADE 750ML"
 *
 * @param {string} description - Full description
 * @returns {Object|null} Unit weight/volume info or null
 */
export function extractUnitWeightFromDescription(description) {
  if (!description) return null;

  // Pattern: weight/volume at END of description (common for packaged goods)
  // Weight: "CHOCOLAT CÔTE D'OR 240G" → 240g
  // Volume: "LIMONADE RIEME 750ML" → 750ml
  const endMatch = description.match(/(\d+(?:[.,]\d+)?)\s*([gG]|[kK][gG]|[mM][lL]|[lL])\s*$/);
  if (endMatch) {
    const value = parseFloat(endMatch[1].replace(',', '.'));
    const rawUnit = endMatch[2].toLowerCase();

    // Check if this is a volume unit (ml, l)
    if (rawUnit === 'ml' || rawUnit === 'l') {
      const unit = normalizeVolumeUnit(rawUnit);
      const totalML = toML(value, unit);
      return {
        type: FORMAT_TYPE.SIMPLE_VOLUME,
        volume: value,
        unit,
        volumePerCase: value, // Volume per unit
        totalML,
        raw: `${value}${unit}`,
        formula: `${value}${unit}/unit`,
        isVolume: true,
        isUnitWeight: true, // Flag: this is per-unit, not per-case
      };
    }

    // Weight unit (g, kg)
    const unit = rawUnit === 'g' ? 'g' : 'kg';
    return {
      type: FORMAT_TYPE.UNIT_WEIGHT,
      weight: value,
      unit,
      weightPerCase: value, // Weight per unit (not per case)
      raw: `${value}${unit}`,
      formula: `${value}${unit}/unit`,
      isUnitWeight: true, // Flag: this is per-unit, not per-case
    };
  }

  // Also check for weight with space before unit anywhere in description
  // but prefer end-of-string matches (weight only, not volume)
  const anyMatch = description.match(/\b(\d+(?:[.,]\d+)?)\s*([gG]|[kK][gG])\b/);
  if (anyMatch) {
    // Only use if it looks like a standalone weight (not part of format like 2/5LB)
    const beforeMatch = description.slice(0, anyMatch.index);
    if (!beforeMatch.match(/[\/xX×]\s*$/)) {
      const weight = parseFloat(anyMatch[1].replace(',', '.'));
      const unit = anyMatch[2].toLowerCase();

      return {
        type: FORMAT_TYPE.UNIT_WEIGHT,
        weight,
        unit,
        weightPerCase: weight,
        raw: `${weight}${unit}`,
        formula: `${weight}${unit}/unit`,
        isUnitWeight: true,
      };
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

/**
 * Normalize volume unit to standard form
 */
function normalizeVolumeUnit(unit) {
  const lower = unit.toLowerCase();
  // Normalize liters
  if (['l', 'lt', 'ltr', 'litre', 'liter'].includes(lower)) return 'L';
  // Normalize milliliters
  if (lower === 'ml') return 'ml';
  // Normalize centiliters
  if (lower === 'cl') return 'cl';
  // Normalize gallons
  if (['gal', 'gallon'].includes(lower)) return 'gal';
  // Normalize quarts
  if (['qt', 'quart'].includes(lower)) return 'qt';
  // Normalize pints
  if (['pt', 'pint'].includes(lower)) return 'pt';
  // Normalize fluid ounces
  if (['floz', 'fl oz'].includes(lower)) return 'floz';
  return lower;
}

/**
 * Convert volume to milliliters
 * @param {number} volume - Volume value
 * @param {string} unit - Volume unit
 * @returns {number} Volume in milliliters
 */
function toML(volume, unit) {
  if (!volume || volume <= 0) return 0;
  const normalizedUnit = normalizeVolumeUnit(unit).toLowerCase();
  const factor = VOLUME_TO_ML[normalizedUnit] || 1;
  return volume * factor;
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
 * Calculate all values for a food supply invoice line
 *
 * THIS IS THE MAIN ENTRY POINT for food supply format parsing.
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
 * Calculate values for all lines in a food supply invoice
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
  VOLUME_TO_ML,

  // Parsing
  parseFormat,
  extractFormatFromDescription,

  // Unit type checks
  isVolumeUnit,
  isWeightUnit,

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
