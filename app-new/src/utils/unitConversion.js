/**
 * Unit conversion utility for liquid and solid measurements
 * Used for recipe production and inventory deduction
 */

// Liquid units in ml (base unit)
const LIQUID_CONVERSIONS = {
  ml: 1,
  L: 1000,
  cl: 10,
  dL: 100,
};

// Weight units in g (base unit)
const WEIGHT_CONVERSIONS = {
  g: 1,
  kg: 1000,
  mg: 0.001,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
};

// Count-based units (no conversion between each other)
const COUNT_UNITS = ['portion', 'ea', 'pc', 'unit', 'each', 'piece'];

// ============================================
// TOOL UNITS (French kitchen vocabulary)
// ============================================
// These are container/packaging units from invoices
// They require a weightPerUnit for conversion to metric

const TOOL_UNITS = {
  // Canned goods
  'canne': { category: 'canned', abbrev: 'cn', defaultWeightG: 796 },
  'can': { category: 'canned', abbrev: 'cn', defaultWeightG: 796 },
  'boite': { category: 'canned', abbrev: 'bt', defaultWeightG: null },
  'boîte': { category: 'canned', abbrev: 'bt', defaultWeightG: null },

  // Bunches/bundles
  'botte': { category: 'produce', abbrev: 'bt', defaultWeightG: 150 },
  'bunch': { category: 'produce', abbrev: 'bt', defaultWeightG: 150 },

  // Bags/packets
  'sac': { category: 'dry_goods', abbrev: 'sac', defaultWeightG: null },
  'bag': { category: 'dry_goods', abbrev: 'sac', defaultWeightG: null },
  'pqt': { category: 'dry_goods', abbrev: 'pqt', defaultWeightG: null },
  'paquet': { category: 'dry_goods', abbrev: 'pqt', defaultWeightG: null },
  'packet': { category: 'dry_goods', abbrev: 'pqt', defaultWeightG: null },

  // Cases/crates (often has weight embedded like "caisse 5lb")
  'caisse': { category: 'bulk', abbrev: 'cs', defaultWeightG: null },
  'crate': { category: 'bulk', abbrev: 'cs', defaultWeightG: null },
  'case': { category: 'bulk', abbrev: 'cs', defaultWeightG: null },
  'cs': { category: 'bulk', abbrev: 'cs', defaultWeightG: null },

  // Dozen/count
  'douzaine': { category: 'count', abbrev: 'dz', defaultWeightG: null },
  'dozen': { category: 'count', abbrev: 'dz', defaultWeightG: null },
  'dz': { category: 'count', abbrev: 'dz', defaultWeightG: null },

  // Jars/bottles
  'pot': { category: 'jarred', abbrev: 'pot', defaultWeightG: null },
  'jar': { category: 'jarred', abbrev: 'jar', defaultWeightG: null },
  'bouteille': { category: 'bottled', abbrev: 'btl', defaultWeightG: null },
  'bottle': { category: 'bottled', abbrev: 'btl', defaultWeightG: null },
};

/**
 * Check if a unit string contains a tool unit
 * @param {string} unitStr - Unit string to check (e.g., "canne", "Caisse 5lb", "botte")
 * @returns {{ isTool: boolean, toolUnit: string|null, toolAbbrev: string|null, hasWeight: boolean, weightG: number|null }}
 */
export function detectToolUnit(unitStr) {
  if (!unitStr || typeof unitStr !== 'string') {
    return { isTool: false, toolUnit: null, toolAbbrev: null, hasWeight: false, weightG: null };
  }

  const normalized = unitStr.toLowerCase().trim();

  // Check if unit string starts with or contains a known tool unit
  for (const [tool, info] of Object.entries(TOOL_UNITS)) {
    if (normalized === tool || normalized.startsWith(tool + ' ') || normalized.startsWith(tool + '/')) {
      // Check if there's an embedded weight (e.g., "caisse 5lb", "canne 796g")
      const weightMatch = normalized.match(/(\d+[.,]?\d*)\s*(lb|lbs|kg|g|oz|ml|l)/i);

      if (weightMatch) {
        const qty = parseFloat(weightMatch[1].replace(',', '.'));
        const unit = weightMatch[2].toLowerCase();
        let weightG = null;

        if (WEIGHT_CONVERSIONS[unit]) {
          weightG = qty * WEIGHT_CONVERSIONS[unit];
        } else if (LIQUID_CONVERSIONS[unit.toUpperCase()] || LIQUID_CONVERSIONS[unit]) {
          // Treat ml/L as grams for simplicity (1ml water ≈ 1g)
          const convKey = unit === 'l' ? 'L' : unit;
          weightG = qty * (LIQUID_CONVERSIONS[convKey] || LIQUID_CONVERSIONS[unit.toUpperCase()] || 1);
        }

        return { isTool: true, toolUnit: tool, toolAbbrev: info.abbrev, hasWeight: true, weightG };
      }

      // No embedded weight - use default if available
      return {
        isTool: true,
        toolUnit: tool,
        toolAbbrev: info.abbrev,
        hasWeight: !!info.defaultWeightG,
        weightG: info.defaultWeightG
      };
    }
  }

  return { isTool: false, toolUnit: null, toolAbbrev: null, hasWeight: false, weightG: null };
}

/**
 * Classify a unit string into its type for inventory/recipe linking
 * Priority: tool > weight > volume > count > unknown
 *
 * IMPORTANT: Tool units ALWAYS stay as 'tool' type, even if they have embedded weight.
 * The weight is stored for price calculation only, not for changing the measurement type.
 *
 * @param {string} unitStr - Unit string from invoice (e.g., "canne", "kg", "Caisse 5lb")
 * @returns {{
 *   unitType: 'tool' | 'weight' | 'volume' | 'count' | 'unknown',
 *   toolUnit: string | null,
 *   toolAbbrev: string | null,
 *   baseUnit: string | null,
 *   weightG: number | null,
 *   enforceMetric: boolean
 * }}
 */
export function classifyUnit(unitStr) {
  if (!unitStr || typeof unitStr !== 'string') {
    return { unitType: 'unknown', toolUnit: null, toolAbbrev: null, baseUnit: null, weightG: null, enforceMetric: false };
  }

  const normalized = unitStr.toLowerCase().trim();

  // First check for tool units - ALWAYS stays as 'tool' type
  const toolCheck = detectToolUnit(unitStr);
  if (toolCheck.isTool) {
    // Tool units enforce tool measurement (use abbreviation like 'cs' for caisse)
    // Weight (if present) is stored for price calculation only
    return {
      unitType: 'tool',
      toolUnit: toolCheck.toolUnit,
      toolAbbrev: toolCheck.toolAbbrev,
      baseUnit: null,
      weightG: toolCheck.weightG, // For price calculation
      enforceMetric: false        // Tool units use tool measurement, not metric
    };
  }

  // Check for pure metric weight units
  const weightMatch = normalized.match(/^(\d*[.,]?\d*)\s*(g|kg|lb|lbs|oz)$/i);
  if (weightMatch || ['g', 'kg', 'lb', 'lbs', 'oz'].includes(normalized)) {
    const unit = weightMatch ? weightMatch[2].toLowerCase() : normalized;
    return {
      unitType: 'weight',
      toolUnit: null,
      toolAbbrev: null,
      baseUnit: unit === 'lbs' ? 'lb' : unit,
      weightG: null,
      enforceMetric: true
    };
  }

  // Check for pure volume units
  const volumeMatch = normalized.match(/^(\d*[.,]?\d*)\s*(ml|cl|l|dl)$/i);
  if (volumeMatch || ['ml', 'cl', 'l', 'dl'].includes(normalized)) {
    const unit = volumeMatch ? volumeMatch[2].toLowerCase() : normalized;
    return {
      unitType: 'volume',
      toolUnit: null,
      toolAbbrev: null,
      baseUnit: unit === 'l' ? 'L' : unit,
      weightG: null,
      enforceMetric: true
    };
  }

  // Check for count units
  if (COUNT_UNITS.includes(normalized)) {
    return {
      unitType: 'count',
      toolUnit: null,
      toolAbbrev: null,
      baseUnit: normalized,
      weightG: null,
      enforceMetric: false
    };
  }

  return { unitType: 'unknown', toolUnit: null, toolAbbrev: null, baseUnit: null, weightG: null, enforceMetric: false };
}

/**
 * Get the enforced unit for a recipe ingredient based on linked inventory item
 * @param {Object} inventoryItem - The linked inventory item
 * @returns {{
 *   measurementType: 'tool' | 'metric',
 *   enforcedUnit: string | null,
 *   toolAbbrev: string | null,
 *   weightG: number | null,
 *   message: string
 * }}
 */
export function getEnforcedMeasurement(inventoryItem) {
  if (!inventoryItem) {
    return { measurementType: 'metric', enforcedUnit: null, toolAbbrev: null, weightG: null, message: 'No inventory item linked' };
  }

  const classification = classifyUnit(inventoryItem.unit);

  if (classification.unitType === 'tool') {
    // Tool unit - force tool measurement using abbreviation
    const abbrev = classification.toolAbbrev || classification.toolUnit;
    return {
      measurementType: 'tool',
      enforcedUnit: abbrev,
      toolAbbrev: abbrev,
      weightG: classification.weightG, // For price calculation
      message: `Use "${abbrev}" measurement (from invoice)`
    };
  }

  if (classification.enforceMetric || classification.unitType === 'weight') {
    // Weight-based - force metric (g/kg)
    const baseUnit = classification.baseUnit || 'g';
    return {
      measurementType: 'metric',
      enforcedUnit: baseUnit,
      toolAbbrev: null,
      weightG: null,
      message: `Use metric measurement (${baseUnit})`
    };
  }

  if (classification.unitType === 'volume') {
    // Volume-based - force metric (ml/L)
    const baseUnit = classification.baseUnit || 'ml';
    return {
      measurementType: 'metric',
      enforcedUnit: baseUnit,
      toolAbbrev: null,
      weightG: null,
      message: `Use metric measurement (${baseUnit})`
    };
  }

  // Unknown or count - no enforcement
  return {
    measurementType: 'metric',
    enforcedUnit: null,
    toolAbbrev: null,
    weightG: null,
    message: 'Unit type unknown - use metric'
  };
}

/**
 * Get unit type: 'liquid', 'weight', 'count', or 'unknown'
 * @param {string} unit - Unit to check
 * @returns {'liquid' | 'weight' | 'count' | 'unknown'}
 */
export function getUnitType(unit) {
  if (!unit) return 'unknown';
  const normalized = unit.toLowerCase().trim();

  if (COUNT_UNITS.includes(normalized)) return 'count';
  if (normalized in LIQUID_CONVERSIONS) return 'liquid';
  if (normalized in WEIGHT_CONVERSIONS) return 'weight';

  // Check case-insensitive for common variations
  const upperUnit = unit.toUpperCase();
  if (upperUnit === 'L' || upperUnit === 'ML' || upperUnit === 'CL' || upperUnit === 'DL') return 'liquid';
  if (upperUnit === 'G' || upperUnit === 'KG' || upperUnit === 'MG' || upperUnit === 'LB' || upperUnit === 'OZ') return 'weight';

  return 'unknown';
}

/**
 * Normalize unit string for lookup
 * @param {string} unit - Unit to normalize
 * @returns {string}
 */
function normalizeUnit(unit) {
  if (!unit) return '';
  const u = unit.trim();

  // Handle case-sensitive units (L vs l)
  if (u === 'L' || u.toLowerCase() === 'l' || u.toLowerCase() === 'litre' || u.toLowerCase() === 'liter') return 'L';
  if (u.toLowerCase() === 'ml' || u.toLowerCase() === 'milliliter' || u.toLowerCase() === 'millilitre') return 'ml';
  if (u.toLowerCase() === 'cl' || u.toLowerCase() === 'centiliter' || u.toLowerCase() === 'centilitre') return 'cl';
  if (u.toLowerCase() === 'dl' || u.toLowerCase() === 'deciliter' || u.toLowerCase() === 'decilitre') return 'dL';

  if (u.toLowerCase() === 'g' || u.toLowerCase() === 'gram' || u.toLowerCase() === 'grams') return 'g';
  if (u.toLowerCase() === 'kg' || u.toLowerCase() === 'kilogram' || u.toLowerCase() === 'kilograms') return 'kg';
  if (u.toLowerCase() === 'mg' || u.toLowerCase() === 'milligram' || u.toLowerCase() === 'milligrams') return 'mg';
  if (u.toLowerCase() === 'lb' || u.toLowerCase() === 'lbs' || u.toLowerCase() === 'pound' || u.toLowerCase() === 'pounds') return 'lb';
  if (u.toLowerCase() === 'oz' || u.toLowerCase() === 'ounce' || u.toLowerCase() === 'ounces') return 'oz';

  return u.toLowerCase();
}

/**
 * Check if two units are compatible (same type)
 * @param {string} unit1 - First unit
 * @param {string} unit2 - Second unit
 * @returns {boolean}
 */
export function areUnitsCompatible(unit1, unit2) {
  if (!unit1 || !unit2) return false;

  const norm1 = normalizeUnit(unit1);
  const norm2 = normalizeUnit(unit2);

  if (norm1 === norm2) return true;

  const type1 = getUnitType(unit1);
  const type2 = getUnitType(unit2);

  // Count units are only compatible with themselves
  if (type1 === 'count' || type2 === 'count') {
    return type1 === 'count' && type2 === 'count' && norm1 === norm2;
  }

  return type1 === type2 && type1 !== 'unknown';
}

/**
 * Convert quantity from one unit to another
 * @param {number} quantity - Amount to convert
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @returns {number | null} Converted value or null if conversion not possible
 */
export function convertUnits(quantity, fromUnit, toUnit) {
  if (typeof quantity !== 'number' || isNaN(quantity)) return null;

  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  // Same unit - no conversion needed
  if (from === to) return quantity;

  // Check compatibility
  if (!areUnitsCompatible(fromUnit, toUnit)) return null;

  // Liquid conversion
  if (from in LIQUID_CONVERSIONS && to in LIQUID_CONVERSIONS) {
    const baseValue = quantity * LIQUID_CONVERSIONS[from];
    return baseValue / LIQUID_CONVERSIONS[to];
  }

  // Weight conversion
  if (from in WEIGHT_CONVERSIONS && to in WEIGHT_CONVERSIONS) {
    const baseValue = quantity * WEIGHT_CONVERSIONS[from];
    return baseValue / WEIGHT_CONVERSIONS[to];
  }

  return null;
}

/**
 * Format quantity with appropriate precision
 * @param {number} quantity - Quantity to format
 * @param {string} unit - Unit for context
 * @returns {string}
 */
export function formatQuantity(quantity, unit) {
  if (typeof quantity !== 'number' || isNaN(quantity)) return '0';

  // For larger units (L, kg), show more decimals
  const normalized = normalizeUnit(unit);
  if (normalized === 'L' || normalized === 'kg') {
    return quantity.toFixed(2).replace(/\.?0+$/, '');
  }

  // For smaller units (ml, g), round to whole numbers if close
  if (Math.abs(quantity - Math.round(quantity)) < 0.001) {
    return Math.round(quantity).toString();
  }

  return quantity.toFixed(1).replace(/\.?0+$/, '');
}

/**
 * Get display label for unit
 * @param {string} unit - Unit code
 * @returns {string}
 */
export function getUnitLabel(unit) {
  const labels = {
    portion: 'Portion',
    ml: 'ml',
    L: 'Litre',
    g: 'g',
    kg: 'kg',
    ea: 'Each',
    pc: 'Piece',
  };
  return labels[normalizeUnit(unit)] || unit;
}

/**
 * Recipe portion unit options for dropdown
 */
export const PORTION_UNIT_OPTIONS = [
  { value: 'portion', label: 'Portion' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'Litre (L)' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
];

// ============================================
// UI Dropdown Options (for FixPriceModal, etc.)
// ============================================

/**
 * Weight units with labels for UI dropdowns
 */
export const WEIGHT_UNIT_OPTIONS = [
  { value: 'g', label: 'g (grammes)', factor: 1 },
  { value: 'kg', label: 'kg (kilogrammes)', factor: 1000 },
  { value: 'lb', label: 'lb (livres)', factor: 453.592 },
  { value: 'oz', label: 'oz (onces)', factor: 28.3495 },
];

/**
 * Volume units with labels for UI dropdowns
 */
export const VOLUME_UNIT_OPTIONS = [
  { value: 'ml', label: 'ml (millilitres)', factor: 1 },
  { value: 'l', label: 'L (litres)', factor: 1000 },
  { value: 'cl', label: 'cl (centilitres)', factor: 10 },
];

/**
 * All unit options for dropdowns (with empty placeholder)
 */
export const ALL_UNIT_OPTIONS = [
  { value: '', label: 'Sélectionner...' },
  ...WEIGHT_UNIT_OPTIONS,
  ...VOLUME_UNIT_OPTIONS,
];

/**
 * Get unit factor for price calculations
 * @param {string} unit - Unit to get factor for
 * @returns {{ factor: number, isVolume: boolean }|null}
 */
export function getUnitFactorForPrice(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase().trim();

  // Weight (to grams)
  if (u === 'g' || u === 'gram' || u === 'grams') return { factor: 1, isVolume: false };
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return { factor: 1000, isVolume: false };
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return { factor: 453.592, isVolume: false };
  if (u === 'oz' || u === 'ounce' || u === 'ounces') return { factor: 28.3495, isVolume: false };

  // Volume (to ml)
  if (u === 'ml') return { factor: 1, isVolume: true };
  if (u === 'l') return { factor: 1000, isVolume: true };
  if (u === 'cl') return { factor: 10, isVolume: true };
  if (u === 'gal' || u === 'gallon') return { factor: 3785.41, isVolume: true };
  if (u === 'qt' || u === 'quart') return { factor: 946.353, isVolume: true };
  if (u === 'pt' || u === 'pint') return { factor: 473.176, isVolume: true };
  if (u === 'floz' || u === 'fl oz') return { factor: 29.5735, isVolume: true };

  return null;
}

/**
 * Calculate price per gram or per ml from price and weight
 * @param {number} price - Unit price
 * @param {number} weight - Weight/volume value
 * @param {string} unit - Unit (g, kg, ml, l, etc.)
 * @returns {{ pricePerG: number|null, pricePerML: number|null }}
 */
export function calculatePricePerUnit(price, weight, unit) {
  if (!price || price <= 0 || !weight || weight <= 0 || !unit) {
    return { pricePerG: null, pricePerML: null };
  }

  const unitInfo = getUnitFactorForPrice(unit);
  if (!unitInfo) {
    return { pricePerG: null, pricePerML: null };
  }

  const baseUnits = weight * unitInfo.factor;
  if (baseUnits <= 0) {
    return { pricePerG: null, pricePerML: null };
  }

  const pricePerBase = price / baseUnits;
  const rounded = Math.round(pricePerBase * 1000000) / 1000000; // 6 decimal precision

  if (unitInfo.isVolume) {
    return { pricePerG: null, pricePerML: rounded };
  } else {
    return { pricePerG: rounded, pricePerML: null };
  }
}

/**
 * Check if unit is a weight unit (for InvoiceUploadPage)
 * @param {string} unit - Unit to check
 * @returns {boolean}
 */
export function isWeightUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  const weightUnits = ['lb', 'lbs', 'kg', 'g', 'oz', 'gram', 'grams', 'kilogram', 'kilograms', 'pound', 'pounds', 'ounce', 'ounces'];
  return weightUnits.some(w => normalized === w || normalized.startsWith(w));
}

/**
 * Check if unit is a volume unit (for InvoiceUploadPage)
 * @param {string} unit - Unit to check
 * @returns {boolean}
 */
export function isVolumeUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  // IMPORTANT: Must not match 'lb'/'lbs' (weight units that start with 'l')
  // Use exact match for 'l' (litre), startsWith for other volume units
  if (normalized === 'l' || normalized === 'litre' || normalized === 'liter') return true;
  const volumeUnits = ['ml', 'cl', 'gal', 'gallon', 'qt', 'quart', 'pt', 'pint', 'floz', 'fl oz'];
  return volumeUnits.some(v => normalized === v || normalized.startsWith(v));
}
