/**
 * French Measurement Parser
 *
 * Converts spoken French measurements to standardized format
 * Examples:
 * - "250 grammes" → "250g"
 * - "2 kilogrammes" → "2kg"
 * - "500 millilitres" → "500ml"
 * - "deux tasses" → "2 tasses"
 */

// Number word to digit mapping (French)
const FRENCH_NUMBERS = {
  'un': '1', 'une': '1',
  'deux': '2',
  'trois': '3',
  'quatre': '4',
  'cinq': '5',
  'six': '6',
  'sept': '7',
  'huit': '8',
  'neuf': '9',
  'dix': '10',
  'onze': '11',
  'douze': '12',
  'treize': '13',
  'quatorze': '14',
  'quinze': '15',
  'seize': '16',
  'vingt': '20',
  'trente': '30',
  'quarante': '40',
  'cinquante': '50',
  'soixante': '60',
  'cent': '100',
  'mille': '1000'
};

// Measurement unit mappings (French spoken → abbreviation)
const METRIC_UNITS = {
  // Weight
  'gramme': 'g',
  'grammes': 'g',
  'gr': 'g',
  'g': 'g',
  'kilogramme': 'kg',
  'kilogrammes': 'kg',
  'kilo': 'kg',
  'kilos': 'kg',
  'kg': 'kg',

  // Volume
  'litre': 'l',
  'litres': 'l',
  'l': 'l',
  'millilitre': 'ml',
  'millilitres': 'ml',
  'ml': 'ml',
  'centilitre': 'cl',
  'centilitres': 'cl',
  'cl': 'cl',

  // Common cooking measures (keep as-is, but singular)
  'tasse': 'tasse',
  'tasses': 'tasse',
  'cuillère': 'c.',
  'cuillères': 'c.',
  'cuillère à soupe': 'c. à soupe',
  'cuillères à soupe': 'c. à soupe',
  'cuillère à café': 'c. à café',
  'cuillères à café': 'c. à café',
  'boîte': 'boîte',
  'boites': 'boîte',
  'boite': 'boîte',
  'canne': 'canne',
  'cannes': 'canne',
  'pincée': 'pincée',
  'pincees': 'pincée',
};

/**
 * Parse French measurement text and convert to standardized format
 * @param {string} text - Raw voice input text
 * @param {string} field - Field name (metric, toolMeasure, name, etc.)
 * @returns {string} - Normalized text
 */
export function parseFrenchMeasurement(text, field = 'name') {
  if (!text || typeof text !== 'string') return text;

  const normalized = text.trim().toLowerCase();

  // Only parse metric and toolMeasure fields
  if (field !== 'metric' && field !== 'toolMeasure') {
    return text; // Return as-is for name and specification
  }

  // Pattern: "250 grammes" or "deux kilogrammes"
  const measurementPattern = /^(\d+(?:[.,]\d+)?|[a-zéèê]+)\s+(grammes?|kilogrammes?|kilos?|kg|g|litres?|l|millilitres?|ml|centilitres?|cl)/i;
  const match = normalized.match(measurementPattern);

  if (match) {
    let [, numberPart, unit] = match;

    // Convert word numbers to digits
    if (FRENCH_NUMBERS[numberPart]) {
      numberPart = FRENCH_NUMBERS[numberPart];
    }

    // Normalize decimal separator (comma to dot)
    numberPart = numberPart.replace(',', '.');

    // Get standardized unit
    const standardUnit = METRIC_UNITS[unit.toLowerCase()] || unit;

    return `${numberPart}${standardUnit}`;
  }

  // Pattern: "2 tasses" or "une boîte" (tool measures)
  const toolPattern = /^(\d+(?:[.,]\d+)?|[a-zéèê]+)\s+(tasses?|cuillères?|boîtes?|boites?|cannes?|pincées?|pincees?)/i;
  const toolMatch = normalized.match(toolPattern);

  if (toolMatch) {
    let [, numberPart, unit] = toolMatch;

    // Convert word numbers to digits
    if (FRENCH_NUMBERS[numberPart]) {
      numberPart = FRENCH_NUMBERS[numberPart];
    }

    // Get standardized unit
    const standardUnit = METRIC_UNITS[unit.toLowerCase()] || unit;

    return `${numberPart} ${standardUnit}`;
  }

  // No pattern matched, return original
  return text;
}

/**
 * Parse voice input for any ingredient field
 * @param {string} text - Raw voice input
 * @param {string} field - Field name
 * @returns {string} - Parsed text
 */
export function parseIngredientField(text, field) {
  if (!text) return text;

  switch (field) {
    case 'metric':
    case 'toolMeasure':
      return parseFrenchMeasurement(text, field);

    case 'name':
    case 'specification':
      // Return as-is, capitalize first letter
      return text.charAt(0).toUpperCase() + text.slice(1);

    default:
      return text;
  }
}

export default {
  parseFrenchMeasurement,
  parseIngredientField,
  FRENCH_NUMBERS,
  METRIC_UNITS,
};
