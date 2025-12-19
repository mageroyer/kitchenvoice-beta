/**
 * Format Pattern Library
 *
 * Extracts billing values (B) from product descriptions and format strings.
 * Handles pack formats, embedded weights, and unit conversions.
 *
 * @module services/invoice/mathEngine/formatPatterns
 */

// ============================================
// Unit Conversion Constants
// ============================================

/**
 * Weight conversions to grams (base unit)
 */
export const WEIGHT_TO_GRAMS = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  gramme: 1,
  grammes: 1,
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  kilogram: 1000,
  kilograms: 1000,
  kilogramme: 1000,
  kilogrammes: 1000,
  lb: 453.592,
  lbs: 453.592,
  livre: 453.592,
  livres: 453.592,
  pound: 453.592,
  pounds: 453.592,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  once: 28.3495,
  onces: 28.3495,
};

/**
 * Volume conversions to milliliters (base unit)
 */
export const VOLUME_TO_ML = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  gal: 3785.41,
  gallon: 3785.41,
  gallons: 3785.41,
  qt: 946.353,
  quart: 946.353,
  quarts: 946.353,
  pt: 473.176,
  pint: 473.176,
  pints: 473.176,
  fl: 29.5735,
  floz: 29.5735,
  'fl oz': 29.5735,
  'fluid oz': 29.5735,
};

// ============================================
// Pack Format Patterns
// ============================================

/**
 * Pattern: N/W UNIT (e.g., "4/5LB" = 4 packs × 5lb)
 * Result: B = N × W in specified unit
 */
const PACK_WEIGHT_PATTERN = /(\d+)\s*[\/x×]\s*(\d+(?:\.\d+)?)\s*(lb|lbs|kg|g|oz)/i;

/**
 * Pattern: N CT/PK/CASE (e.g., "12CT", "24PK", "6/CASE")
 * Result: B = N (count)
 */
const PACK_COUNT_PATTERN = /(\d+)\s*[\/x×]?\s*(ct|pk|pc|pcs|case|cs|dz|dozen|unit|units|ea|each)/i;

/**
 * Pattern: N × W UNIT (e.g., "2 × 5KG", "3x500g")
 * Result: B = N × W in specified unit
 */
const MULTIPLIED_WEIGHT_PATTERN = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(lb|lbs|kg|g|oz|ml|l)/i;

/**
 * Pattern: Embedded weight in description (e.g., "Caisse 4lb", "Sac 25kg")
 * French: caisse, sac, boîte, bac
 * Result: B = extracted weight
 */
const EMBEDDED_WEIGHT_PATTERN = /(?:caisse|sac|boîte|boite|bac|box|case|bag)\s+(?:de\s+)?(\d+(?:\.\d+)?)\s*(lb|lbs|kg|g|oz)/i;

/**
 * Pattern: Simple weight (e.g., "5LB", "2.5KG")
 * Result: B = weight value
 */
const SIMPLE_WEIGHT_PATTERN = /(\d+(?:\.\d+)?)\s*(lb|lbs|kg|g|oz|gram|grams|gramme|grammes|kilo|kilos)/i;

/**
 * Pattern: Simple volume (e.g., "500ML", "2L")
 * Result: B = volume value
 */
const SIMPLE_VOLUME_PATTERN = /(\d+(?:\.\d+)?)\s*(ml|l|liter|liters|litre|litres|gal|gallon|qt|quart|pt|pint|fl\s*oz)/i;

// ============================================
// Format Extraction Functions
// ============================================

/**
 * Extract pack weight format (N/W UNIT)
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractPackWeight(text) {
  if (!text) return null;

  const match = text.match(PACK_WEIGHT_PATTERN);
  if (!match) return null;

  const packCount = parseInt(match[1], 10);
  const packWeight = parseFloat(match[2]);
  const unit = match[3].toLowerCase();

  // Convert to base unit (grams)
  const gramsPerPack = packWeight * (WEIGHT_TO_GRAMS[unit] || 453.592);
  const totalGrams = packCount * gramsPerPack;

  return {
    type: 'PACK_WEIGHT',
    packCount,
    packWeight,
    unit,
    totalWeight: packCount * packWeight,
    totalGrams,
    // B value in the original unit (for pricing)
    billingValue: packCount * packWeight,
    billingUnit: unit,
    formula: `${packCount} × ${packWeight}${unit} = ${packCount * packWeight}${unit}`,
  };
}

/**
 * Extract pack count format (N CT/PK)
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractPackCount(text) {
  if (!text) return null;

  const match = text.match(PACK_COUNT_PATTERN);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const unitType = match[2].toLowerCase();

  // Handle dozen
  const actualCount = unitType === 'dz' || unitType === 'dozen' ? count * 12 : count;

  return {
    type: 'PACK_COUNT',
    count: actualCount,
    unitType,
    billingValue: actualCount,
    billingUnit: 'each',
    formula: `${count} ${unitType} = ${actualCount} units`,
  };
}

/**
 * Extract multiplied weight format (N × W UNIT)
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractMultipliedWeight(text) {
  if (!text) return null;

  const match = text.match(MULTIPLIED_WEIGHT_PATTERN);
  if (!match) return null;

  const multiplier = parseInt(match[1], 10);
  const value = parseFloat(match[2]);
  const unit = match[3].toLowerCase();

  const totalValue = multiplier * value;

  // Determine if weight or volume
  const isWeight = WEIGHT_TO_GRAMS[unit] != null;
  const isVolume = VOLUME_TO_ML[unit] != null;

  return {
    type: isWeight ? 'MULTIPLIED_WEIGHT' : 'MULTIPLIED_VOLUME',
    multiplier,
    value,
    unit,
    totalValue,
    billingValue: totalValue,
    billingUnit: unit,
    formula: `${multiplier} × ${value}${unit} = ${totalValue}${unit}`,
  };
}

/**
 * Extract embedded weight from description
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractEmbeddedWeight(text) {
  if (!text) return null;

  const match = text.match(EMBEDDED_WEIGHT_PATTERN);
  if (!match) return null;

  const weight = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  return {
    type: 'EMBEDDED_WEIGHT',
    weight,
    unit,
    billingValue: weight,
    billingUnit: unit,
    formula: `Embedded: ${weight}${unit}`,
  };
}

/**
 * Extract simple weight value
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractSimpleWeight(text) {
  if (!text) return null;

  const match = text.match(SIMPLE_WEIGHT_PATTERN);
  if (!match) return null;

  const weight = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Normalize unit
  const normalizedUnit = normalizeWeightUnit(unit);

  return {
    type: 'SIMPLE_WEIGHT',
    weight,
    unit,
    normalizedUnit,
    billingValue: weight,
    billingUnit: normalizedUnit,
    formula: `${weight}${unit}`,
  };
}

/**
 * Extract simple volume value
 *
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted values or null
 */
export function extractSimpleVolume(text) {
  if (!text) return null;

  const match = text.match(SIMPLE_VOLUME_PATTERN);
  if (!match) return null;

  const volume = parseFloat(match[1]);
  const unit = match[2].toLowerCase().replace(/\s+/g, '');

  return {
    type: 'SIMPLE_VOLUME',
    volume,
    unit,
    billingValue: volume,
    billingUnit: unit,
    formula: `${volume}${unit}`,
  };
}

// ============================================
// Master Extraction Function
// ============================================

/**
 * Extract all format information from text
 * Tries patterns in order of specificity
 *
 * @param {string} text - Description or format text
 * @returns {Object} Extraction result with all found formats
 */
export function extractAllFormats(text) {
  if (!text) {
    return { found: false, formats: [] };
  }

  const formats = [];

  // Try each pattern (most specific first)
  const packWeight = extractPackWeight(text);
  if (packWeight) formats.push(packWeight);

  const packCount = extractPackCount(text);
  if (packCount) formats.push(packCount);

  const multiplied = extractMultipliedWeight(text);
  if (multiplied) formats.push(multiplied);

  const embedded = extractEmbeddedWeight(text);
  if (embedded) formats.push(embedded);

  const simpleWeight = extractSimpleWeight(text);
  if (simpleWeight) formats.push(simpleWeight);

  const simpleVolume = extractSimpleVolume(text);
  if (simpleVolume) formats.push(simpleVolume);

  return {
    found: formats.length > 0,
    formats,
    // Best match is the most specific (first found)
    bestMatch: formats[0] || null,
  };
}

/**
 * Get billing value from format string
 * Convenience function for quick extraction
 *
 * @param {string} text - Text to parse
 * @param {string} [preferredUnit] - Preferred unit for result
 * @returns {number|null} Billing value or null
 */
export function getBillingValueFromFormat(text, preferredUnit = null) {
  const result = extractAllFormats(text);

  if (!result.found || !result.bestMatch) {
    return null;
  }

  return result.bestMatch.billingValue;
}

// ============================================
// Unit Helpers
// ============================================

/**
 * Normalize weight unit to standard form
 *
 * @param {string} unit - Unit string
 * @returns {string} Normalized unit (kg, lb, g, oz)
 */
export function normalizeWeightUnit(unit) {
  const lower = unit.toLowerCase();

  if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'].includes(lower)) {
    return 'kg';
  }
  if (['lb', 'lbs', 'livre', 'livres', 'pound', 'pounds'].includes(lower)) {
    return 'lb';
  }
  if (['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'].includes(lower)) {
    return 'g';
  }
  if (['oz', 'ounce', 'ounces', 'once', 'onces'].includes(lower)) {
    return 'oz';
  }

  return lower;
}

/**
 * Normalize volume unit to standard form
 *
 * @param {string} unit - Unit string
 * @returns {string} Normalized unit (l, ml, gal, etc.)
 */
export function normalizeVolumeUnit(unit) {
  const lower = unit.toLowerCase().replace(/\s+/g, '');

  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(lower)) {
    return 'l';
  }
  if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(lower)) {
    return 'ml';
  }
  if (['gal', 'gallon', 'gallons'].includes(lower)) {
    return 'gal';
  }

  return lower;
}

/**
 * Convert weight to target unit
 *
 * @param {number} value - Weight value
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number} Converted value
 */
export function convertWeight(value, fromUnit, toUnit) {
  const fromGrams = WEIGHT_TO_GRAMS[normalizeWeightUnit(fromUnit)] || 1;
  const toGrams = WEIGHT_TO_GRAMS[normalizeWeightUnit(toUnit)] || 1;

  const grams = value * fromGrams;
  return Math.round((grams / toGrams) * 1000) / 1000;
}

/**
 * Convert volume to target unit
 *
 * @param {number} value - Volume value
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number} Converted value
 */
export function convertVolume(value, fromUnit, toUnit) {
  const fromML = VOLUME_TO_ML[normalizeVolumeUnit(fromUnit)] || 1;
  const toML = VOLUME_TO_ML[normalizeVolumeUnit(toUnit)] || 1;

  const ml = value * fromML;
  return Math.round((ml / toML) * 1000) / 1000;
}

// ============================================
// Export
// ============================================

export default {
  // Constants
  WEIGHT_TO_GRAMS,
  VOLUME_TO_ML,

  // Extraction functions
  extractPackWeight,
  extractPackCount,
  extractMultipliedWeight,
  extractEmbeddedWeight,
  extractSimpleWeight,
  extractSimpleVolume,
  extractAllFormats,
  getBillingValueFromFormat,

  // Unit helpers
  normalizeWeightUnit,
  normalizeVolumeUnit,
  convertWeight,
  convertVolume,
};
