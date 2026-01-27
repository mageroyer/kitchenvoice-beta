/**
 * Packaging Format Parser
 *
 * Parses container-style invoice format notations common in packaging distributors
 * like Carrousel Emballage. Handles:
 *
 * - Nested unit notation: "10/100" (10 packs × 100 units = 1000 total)
 * - Roll notation: "6/RL" (6 rolls per case)
 * - Simple case notation: "1/500" (500 units per case)
 * - Capacity vs weight distinction (2.25LB for container capacity, not product weight)
 * - Linear measurements (12" = 12 feet per roll)
 * - Product dimensions (35X50, 8X8)
 *
 * @module utils/packagingParser
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * @typedef {'nested_units' | 'rolls' | 'simple' | 'unknown'} PackagingType
 */

/**
 * @typedef {Object} PackagingInfo
 * @property {PackagingType} packagingType - Type of packaging notation
 * @property {string|null} rawFormat - Original format string
 * @property {number} packCount - Outer pack count (e.g., 10 in "10/100")
 * @property {number} unitsPerPack - Units per inner pack (e.g., 100 in "10/100")
 * @property {number} totalUnitsPerCase - Calculated total units per case
 * @property {number|null} rollsPerCase - For roll products
 * @property {number|null} lengthPerRoll - Length per roll (from description)
 * @property {string|null} lengthUnit - Unit for length (ft, m, in)
 * @property {number|null} totalLength - Calculated total length (rolls × length × qty)
 */

/**
 * @typedef {Object} ContainerCapacity
 * @property {number} capacity - Capacity value (e.g., 2.25)
 * @property {string} unit - Capacity unit (lb, oz, ml)
 * @property {boolean} isCapacity - Flag indicating this is container capacity, NOT product weight
 * @property {string|null} containerType - Type of container (lid, bowl, container)
 */

/**
 * @typedef {Object} ProductDimensions
 * @property {number|null} width - Product width
 * @property {string|null} widthUnit - Width unit (in, cm)
 * @property {string|null} dimensions - Full dimension string (e.g., "35X50")
 * @property {string|null} specs - Additional specs (e.g., "3COMP", "2PLY")
 */

/**
 * @typedef {Object} ParsedPackaging
 * @property {PackagingInfo} packaging - Packaging structure info
 * @property {ContainerCapacity|null} containerCapacity - Container capacity if detected
 * @property {ProductDimensions} productDimensions - Product dimension info
 * @property {number} calculatedTotalUnits - Final calculated total units
 * @property {number|null} calculatedTotalLength - Final calculated total length (for linear products)
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Keywords that indicate a container product (where LB/OZ means capacity, not weight)
 */
const CONTAINER_KEYWORDS = [
  'CONTENANT', 'CONTAINER',
  'COUVERCLE', 'LID', 'COVER',
  'BOL', 'BOWL',
  'CLAM', 'CLAMSHELL',
  'ASSIETTE', 'PLATE',
  'VERRE', 'CUP', 'GOBELET',
  'BARQUETTE', 'TRAY'
];

/**
 * Keywords for linear/roll products
 * Note: ALUMINIUM/ALUMINUM only for rolls (e.g., "ALUMINIUM ROULEAU"), not containers
 */
const LINEAR_PRODUCT_KEYWORDS = [
  'PAPIER', 'PAPER',
  'FILM', 'WRAP',
  'ROULEAU', 'ROLL',
  'FEUILLE', 'SHEET',
  'CIRÉ', 'WAX'
];

/**
 * Compound patterns for linear products (requires both parts)
 * Used for products like "ALUMINIUM ROULEAU" but not "CONTENANT ALUM."
 */
const LINEAR_COMPOUND_PATTERNS = [
  /ALUMIN\w*\s+(ROULEAU|ROLL|FOIL)/i,
  /FOIL\s+ALUMIN/i
];

/**
 * Product spec patterns (compartments, ply, etc.)
 */
const SPEC_PATTERNS = [
  /(\d+)\s*COMP/i,      // 3COMP = 3 compartments
  /(\d+)\s*PLY/i,       // 2PLY = 2-ply
  /(\d+)\s*SECT/i,      // 4SECT = 4 sections
  /HVY|HEAVY/i,         // Heavy duty
  /LT|LIGHT/i,          // Light
  /BLK|BLACK/i,         // Black color
  /WHT|WHITE/i,         // White color
  /CLR|CLEAR/i          // Clear
];

// ============================================
// FORMAT PARSING
// ============================================

/**
 * Parse container-style format notation
 *
 * @param {string} format - Format string (e.g., "10/100", "6/RL", "1/500")
 * @param {string} [description=''] - Product description for context
 * @returns {PackagingInfo} Parsed packaging structure
 *
 * @example
 * parseContainerFormat('10/100', 'GANTS NITRILE M')
 * // Returns: { packagingType: 'nested_units', packCount: 10, unitsPerPack: 100, totalUnitsPerCase: 1000 }
 *
 * @example
 * parseContainerFormat('6/RL', 'PAPIER CIRÉ 12"')
 * // Returns: { packagingType: 'rolls', rollsPerCase: 6, lengthPerRoll: 12, lengthUnit: 'ft' }
 */
export function parseContainerFormat(format, description = '') {
  const result = {
    packagingType: 'unknown',
    rawFormat: format || null,
    packCount: 1,
    unitsPerPack: 1,
    totalUnitsPerCase: 1,
    rollsPerCase: null,
    lengthPerRoll: null,
    lengthUnit: null,
    totalLength: null
  };

  if (!format || typeof format !== 'string') {
    return result;
  }

  const normalizedFormat = format.trim().toUpperCase();

  // Pattern 1: Nested units notation (10/100, 12/24, etc.)
  // Format: X/Y where X = outer packs, Y = units per pack
  const nestedMatch = normalizedFormat.match(/^(\d+)\/(\d+)$/);
  if (nestedMatch) {
    const outer = parseInt(nestedMatch[1], 10);
    const inner = parseInt(nestedMatch[2], 10);

    // Distinguish between nested (10/100) and simple (1/500)
    if (outer > 1) {
      result.packagingType = 'nested_units';
      result.packCount = outer;
      result.unitsPerPack = inner;
      result.totalUnitsPerCase = outer * inner;
    } else {
      // 1/500 is simple case notation
      result.packagingType = 'simple';
      result.packCount = 1;
      result.unitsPerPack = inner;
      result.totalUnitsPerCase = inner;
    }
    return result;
  }

  // Pattern 2: Roll notation (6/RL, 4/RL, etc.)
  const rollMatch = normalizedFormat.match(/^(\d+)\/RL$/i);
  if (rollMatch) {
    result.packagingType = 'rolls';
    result.rollsPerCase = parseInt(rollMatch[1], 10);
    result.totalUnitsPerCase = result.rollsPerCase; // Units = rolls for roll products

    // Try to extract length from description
    const lengthInfo = extractLengthFromDescription(description);
    if (lengthInfo) {
      result.lengthPerRoll = lengthInfo.length;
      result.lengthUnit = lengthInfo.unit;
    }

    return result;
  }

  // Pattern 3: Just a number (could be units per case)
  const simpleNumber = normalizedFormat.match(/^(\d+)$/);
  if (simpleNumber) {
    result.packagingType = 'simple';
    result.totalUnitsPerCase = parseInt(simpleNumber[1], 10);
    result.unitsPerPack = result.totalUnitsPerCase;
    return result;
  }

  return result;
}

/**
 * Extract length measurement from product description
 *
 * @param {string} description - Product description
 * @returns {{length: number, unit: string}|null} Length info or null
 *
 * @example
 * extractLengthFromDescription('PAPIER CIRÉ 12"')
 * // Returns: { length: 12, unit: 'ft' }
 */
export function extractLengthFromDescription(description) {
  if (!description) return null;

  // Check if this is a linear product first
  const isLinearProduct = LINEAR_PRODUCT_KEYWORDS.some(kw =>
    description.toUpperCase().includes(kw)
  );

  // Pattern: number followed by " or ' (e.g., 12", 18')
  // For roll products, " typically means feet, not inches
  const quotedMatch = description.match(/(\d+)["']/);
  if (quotedMatch) {
    const value = parseInt(quotedMatch[1], 10);

    // For paper/film rolls, the number usually represents feet per roll
    if (isLinearProduct) {
      return { length: value, unit: 'ft' };
    }

    // For other products, it might be width in inches
    return { length: value, unit: 'in' };
  }

  // Pattern: explicit unit (12ft, 50m)
  const explicitMatch = description.match(/(\d+)\s*(ft|feet|m|meter|metres)/i);
  if (explicitMatch) {
    const unit = explicitMatch[2].toLowerCase().startsWith('f') ? 'ft' : 'm';
    return { length: parseInt(explicitMatch[1], 10), unit };
  }

  return null;
}

// ============================================
// CONTAINER CAPACITY EXTRACTION
// ============================================

/**
 * Extract container capacity from description
 *
 * IMPORTANT: This distinguishes between container CAPACITY (what it holds)
 * and product WEIGHT. For containers/lids, "2.25LB" means it fits a 2.25lb
 * container, NOT that the product weighs 2.25lb.
 *
 * @param {string} description - Product description
 * @returns {ContainerCapacity|null} Capacity info or null
 *
 * @example
 * extractContainerCapacity('COUVERCLE ALUM. 2.25LB')
 * // Returns: { capacity: 2.25, unit: 'lb', isCapacity: true, containerType: 'lid' }
 *
 * @example
 * extractContainerCapacity('BOL SOUPE 16OZ + COUV')
 * // Returns: { capacity: 16, unit: 'oz', isCapacity: true, containerType: 'bowl' }
 */
export function extractContainerCapacity(description) {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const upperDesc = description.toUpperCase();

  // Check if this is a container-type product
  const isContainerProduct = CONTAINER_KEYWORDS.some(kw =>
    upperDesc.includes(kw)
  );

  if (!isContainerProduct) {
    return null;
  }

  // Determine container type
  let containerType = null;
  if (/COUVERCLE|LID|COVER/i.test(upperDesc)) {
    containerType = 'lid';
  } else if (/BOL|BOWL/i.test(upperDesc)) {
    containerType = 'bowl';
  } else if (/CONTENANT|CONTAINER|CLAM/i.test(upperDesc)) {
    containerType = 'container';
  } else if (/VERRE|CUP|GOBELET/i.test(upperDesc)) {
    containerType = 'cup';
  } else if (/ASSIETTE|PLATE/i.test(upperDesc)) {
    containerType = 'plate';
  }

  // Extract capacity value
  // Pattern 1: number + unit (2.25LB, 16OZ, 500ML, 1L)
  const capacityMatch = upperDesc.match(/(\d+\.\d+)\s*(LB|LBS|OZ|ML|L|CL)\b/);

  if (capacityMatch) {
    let unit = capacityMatch[2].toLowerCase();
    if (unit === 'lbs') unit = 'lb';

    return {
      capacity: parseFloat(capacityMatch[1]),
      unit,
      isCapacity: true,
      containerType
    };
  }

  // Pattern 2: Handle lost decimal point from PDF/OCR (e.g., "2 25LB" → 2.25LB)
  // Matches: single digit + space + 2 digits + unit
  const lostDecimalMatch = upperDesc.match(/\b(\d)\s+(\d{2})(LB|LBS|OZ)\b/);
  if (lostDecimalMatch) {
    let unit = lostDecimalMatch[3].toLowerCase();
    if (unit === 'lbs') unit = 'lb';
    // Reconstruct decimal: "2 25LB" → 2.25
    const capacity = parseFloat(`${lostDecimalMatch[1]}.${lostDecimalMatch[2]}`);

    return {
      capacity,
      unit,
      isCapacity: true,
      containerType
    };
  }

  // Pattern 3: Integer capacity (16OZ, 500ML, 1L)
  const integerMatch = upperDesc.match(/(\d+)\s*(LB|LBS|OZ|ML|L|CL)\b/);
  if (integerMatch) {
    let unit = integerMatch[2].toLowerCase();
    if (unit === 'lbs') unit = 'lb';

    return {
      capacity: parseFloat(integerMatch[1]),
      unit,
      isCapacity: true,
      containerType
    };
  }

  return null;
}

// ============================================
// PRODUCT DIMENSIONS EXTRACTION
// ============================================

/**
 * Extract product dimensions and specifications from description
 *
 * @param {string} description - Product description
 * @returns {ProductDimensions} Dimension info
 *
 * @example
 * extractProductDimensions('SAC POUBELLE 35X50 BLK')
 * // Returns: { dimensions: '35X50', specs: 'BLK' }
 *
 * @example
 * extractProductDimensions('CONTENANT CLAM 8X8 3COMP')
 * // Returns: { dimensions: '8X8', specs: '3COMP' }
 *
 * @example
 * extractProductDimensions('FILM ÉTIRABLE 18"')
 * // Returns: { width: 18, widthUnit: 'in' }
 */
export function extractProductDimensions(description) {
  const result = {
    width: null,
    widthUnit: null,
    dimensions: null,
    specs: null
  };

  if (!description || typeof description !== 'string') {
    return result;
  }

  const upperDesc = description.toUpperCase();

  // Pattern 1: Dimension notation (35X50, 8X8, 12X18)
  const dimMatch = upperDesc.match(/(\d+)\s*X\s*(\d+)/);
  if (dimMatch) {
    result.dimensions = `${dimMatch[1]}X${dimMatch[2]}`;
  }

  // Pattern 2: Width specification for rolls/film (18", 12")
  // Only for non-linear-length products
  if (!LINEAR_PRODUCT_KEYWORDS.some(kw => upperDesc.includes(kw))) {
    const widthMatch = upperDesc.match(/(\d+)["']/);
    if (widthMatch) {
      result.width = parseInt(widthMatch[1], 10);
      result.widthUnit = 'in';
    }
  } else {
    // For film/wrap, the " notation is typically width
    const widthMatch = upperDesc.match(/(\d+)["']/);
    if (widthMatch) {
      result.width = parseInt(widthMatch[1], 10);
      result.widthUnit = 'in';
    }
  }

  // Extract specs (3COMP, 2PLY, HVY, BLK, etc.)
  const specs = [];
  for (const pattern of SPEC_PATTERNS) {
    const match = upperDesc.match(pattern);
    if (match) {
      specs.push(match[0]);
    }
  }
  if (specs.length > 0) {
    result.specs = specs.join(' ');
  }

  return result;
}

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse all packaging information from a line item
 *
 * @param {Object} lineItem - Invoice line item
 * @param {string} lineItem.description - Product description
 * @param {string} [lineItem.format] - Format column value
 * @param {number} [lineItem.quantity=1] - Quantity ordered
 * @returns {ParsedPackaging} Complete parsed packaging info
 *
 * @example
 * parsePackagingInfo({
 *   description: 'GANTS NITRILE M',
 *   format: '10/100',
 *   quantity: 1
 * })
 * // Returns full packaging breakdown with 1000 total units
 */
export function parsePackagingInfo(lineItem) {
  const { description = '', format = null, quantity = 1 } = lineItem;

  // Parse format notation
  const packaging = parseContainerFormat(format, description);

  // Extract container capacity (if applicable)
  const containerCapacity = extractContainerCapacity(description);

  // Extract product dimensions
  const productDimensions = extractProductDimensions(description);

  // Calculate totals
  let calculatedTotalUnits = packaging.totalUnitsPerCase * quantity;
  let calculatedTotalLength = null;

  if (packaging.packagingType === 'rolls' && packaging.lengthPerRoll) {
    calculatedTotalLength = packaging.rollsPerCase * packaging.lengthPerRoll * quantity;
    packaging.totalLength = calculatedTotalLength;
  }

  return {
    packaging,
    containerCapacity,
    productDimensions,
    calculatedTotalUnits,
    calculatedTotalLength
  };
}

// ============================================
// CLAUDE PROMPT HINTS
// ============================================

/**
 * Generate Claude prompt hints for container-style invoices
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.hasNestedUnits=true] - Include nested unit hints
 * @param {boolean} [options.hasRolls=true] - Include roll product hints
 * @param {boolean} [options.hasContainers=true] - Include container capacity hints
 * @returns {string} Formatted hints for Claude prompt
 */
export function generateContainerFormatHints(options = {}) {
  const {
    hasNestedUnits = true,
    hasRolls = true,
    hasContainers = true
  } = options;

  const hints = [];

  hints.push('CONTAINER/PACKAGING FORMAT PARSING (CRITICAL):');

  if (hasNestedUnits) {
    hints.push(`
1. NESTED UNIT FORMAT (Format column):
   - "X/Y" notation means X inner packs × Y units per pack = total units per case
   - Example: "10/100" = 10 boxes × 100 gloves = 1,000 gloves per case
   - Example: "1/500" = 500 units per case (simple notation)
   - Qty column is CASES ordered, multiply by total units for actual quantity
   - Set: packCount=${'{X}'}, unitsPerPack=${'{Y}'}, totalUnitsPerCase=${'{X*Y}'}`);
  }

  if (hasRolls) {
    hints.push(`
2. ROLL FORMAT (Linear products):
   - "X/RL" notation means X rolls per case
   - Example: "6/RL" = 6 rolls per case
   - Length per roll may be in description (e.g., "PAPIER CIRÉ 12"" = 12 feet per roll)
   - Calculate: totalLength = Qty × rollsPerCase × lengthPerRoll
   - Set: rollsPerCase=${'{X}'}, lengthPerRoll=${'{from description}'}, lengthUnit="ft"`);
  }

  if (hasContainers) {
    hints.push(`
3. CONTAINER CAPACITY vs WEIGHT (CRITICAL DISTINCTION):
   - For containers/lids/bowls, weight notation is CAPACITY not product weight!
   - "COUVERCLE ALUM. 2.25LB" = lid for 2.25lb container, NOT 2.25lb lid weight
   - "BOL SOUPE 16OZ" = 16oz bowl capacity, NOT 16oz bowl weight
   - "CONTENANT 1LB ROND" = 1lb round container capacity
   - Set: containerCapacity=${'{value}'}, containerCapacityUnit=${'{unit}'}, isCapacity=true
   - Do NOT set weight fields for these - they are virtually weightless

4. PRODUCT DIMENSIONS (descriptive, not quantity):
   - "35X50" = 35" × 50" product size (garbage bags)
   - "8X8 3COMP" = 8" × 8" container with 3 compartments
   - "18"" for FILM = 18 inch width
   - Store in productDimensions, not as quantities`);
  }

  return hints.join('\n');
}

// ============================================
// VALIDATION & HELPERS
// ============================================

/**
 * Check if a format string is a valid container format notation
 *
 * @param {string} format - Format string to validate
 * @returns {boolean} True if valid container format
 */
export function isValidContainerFormat(format) {
  if (!format || typeof format !== 'string') return false;

  const normalized = format.trim().toUpperCase();

  // Valid patterns
  const patterns = [
    /^\d+\/\d+$/,      // Nested units (10/100, 1/500)
    /^\d+\/RL$/i,      // Roll format (6/RL)
    /^\d+$/            // Simple number
  ];

  return patterns.some(p => p.test(normalized));
}

/**
 * Determine if a product description indicates a container product
 *
 * @param {string} description - Product description
 * @returns {boolean} True if likely a container product
 */
export function isContainerProduct(description) {
  if (!description) return false;
  const upper = description.toUpperCase();
  return CONTAINER_KEYWORDS.some(kw => upper.includes(kw));
}

/**
 * Determine if a product description indicates a linear/roll product
 *
 * @param {string} description - Product description
 * @returns {boolean} True if likely a linear product
 */
export function isLinearProduct(description) {
  if (!description) return false;
  const upper = description.toUpperCase();

  // First check simple keywords
  if (LINEAR_PRODUCT_KEYWORDS.some(kw => upper.includes(kw))) {
    return true;
  }

  // Then check compound patterns (e.g., "ALUMINIUM ROULEAU" but not "CONTENANT ALUM.")
  return LINEAR_COMPOUND_PATTERNS.some(pattern => pattern.test(description));
}

// ============================================
// EXPORTS
// ============================================

export default {
  // Main parsers
  parseContainerFormat,
  parsePackagingInfo,

  // Extraction helpers
  extractContainerCapacity,
  extractProductDimensions,
  extractLengthFromDescription,

  // Prompt generation
  generateContainerFormatHints,

  // Validation
  isValidContainerFormat,
  isContainerProduct,
  isLinearProduct,

  // Constants (for testing)
  CONTAINER_KEYWORDS,
  LINEAR_PRODUCT_KEYWORDS
};
