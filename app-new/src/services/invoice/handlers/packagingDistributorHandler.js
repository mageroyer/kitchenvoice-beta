/**
 * Packaging Distributor Handler
 *
 * Specialized handler for packaging/container distributors like Carrousel Emballage.
 * Handles boxing format notation (1/500, 6/RL, 10/100) and container capacity.
 *
 * Key concepts:
 * - Boxing Format: qty per case notation (1/500 = 1 case of 500, 6/RL = 6 rolls)
 * - Container Capacity: physical size (2.25LB = container holds 2.25lb, NOT weight)
 * - Base Units Stock: track stock in individual units for graceful format changes
 *
 * @module services/invoice/handlers/packagingDistributorHandler
 */

import { INVOICE_TYPES } from './types';
import { LINE_CATEGORY } from '../lineCategorizer';
import {
  extractBaseFields,
  extractContainerInfo,
  extractDimensionInfo,
  getColumnValue,
} from './baseHandler';
import { parsePackagingInfo } from '../../../utils/packagingParser';

// V2 Pipeline imports
import {
  FIELD_SOURCE,
  FIELD_PRIORITIES,
  BOXING_FORMAT_TYPE,
  BOXING_FORMAT_PATTERN as BOXING_FORMAT_REGEX,
  BOXING_FORMAT_PATTERNS,
  CONTAINER_CAPACITY_PATTERNS,
  CONFIDENCE_SCORE,
  CONFIDENCE_THRESHOLD,
  PACKAGING_WARNING,
  WARNING_SEVERITY,
  DEFAULT_MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,
  createExtractedField,
  createEmptyExtractedField,
  createEmptyBoxingFormat,
  createEmptyContainerCapacity,
  createEmptyUnitsCalculation,
  createEmptyValidation,
  createWarning,
  getConfidenceLevel,
} from './packagingTypes';

// ============================================
// CONSTANTS
// ============================================

/**
 * Boxing format patterns - matches various packaging notations:
 * - With slash: 1/500, 6/RL, 10/100
 * - Without slash: 6RL, 100CT, 50CT
 * - With 'x': 10x100CT, 6x500ML, 20x454G
 * - Weight formats: 1/20KG, 4x2KG
 */
export const BOXING_FORMAT_PATTERN = /^(\d+)[\/x]?(\d+)?(RL|CT|ML|L|KG|G|LB|OZ)?$/i;

/**
 * More specific patterns for different format types
 */
export const FORMAT_PATTERNS = {
  // Slash notation: 1/500, 6/RL, 10/100
  SLASH: /^(\d+)\/(\d+|RL)$/i,
  // Roll notation: 6RL, 1RL (no slash)
  ROLL: /^(\d+)RL$/i,
  // Count notation: 100CT, 50CT
  COUNT: /^(\d+)CT$/i,
  // Nested with x: 10x100CT, 6x500ML, 20x454G
  NESTED: /^(\d+)x(\d+)(CT|ML|L|KG|G|LB|OZ)?$/i,
  // Weight per case: 1/20KG, 4x2KG
  WEIGHT: /^(\d+)[\/x](\d+(?:\.\d+)?)(KG|G|LB|OZ)$/i,
  // Volume per case: 6x1.89L, 6x500ML
  VOLUME: /^(\d+)x(\d+(?:\.\d+)?)(ML|L)$/i,
};

// ============================================
// PACKAGING UTILITIES
// ============================================

/**
 * Check if a value matches any known packaging format pattern.
 * @param {string} value - Value to check
 * @returns {boolean} True if matches any format pattern
 */
function matchesAnyFormatPattern(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim().toUpperCase();
  return (
    FORMAT_PATTERNS.SLASH.test(v) ||
    FORMAT_PATTERNS.ROLL.test(v) ||
    FORMAT_PATTERNS.COUNT.test(v) ||
    FORMAT_PATTERNS.NESTED.test(v) ||
    FORMAT_PATTERNS.WEIGHT.test(v) ||
    FORMAT_PATTERNS.VOLUME.test(v)
  );
}

/**
 * Extract boxing format from line item, checking multiple fields.
 * Claude sometimes puts format in wrong field (unit instead of format).
 * This function validates and extracts from the correct source.
 *
 * @param {Object} item - Invoice line item
 * @returns {string|null} Boxing format value or null
 */
export function extractBoxingFormat(item) {
  // Check boxingFormat field first (from wizard column mapping)
  if (item.boxingFormat && matchesAnyFormatPattern(item.boxingFormat)) {
    return item.boxingFormat;
  }
  // Check format field (common AI output)
  if (item.format && matchesAnyFormatPattern(item.format)) {
    return item.format;
  }
  // Check packagingFormat (alias)
  if (item.packagingFormat && matchesAnyFormatPattern(item.packagingFormat)) {
    return item.packagingFormat;
  }
  // Check unit field (Claude sometimes puts format here incorrectly)
  if (item.unit && matchesAnyFormatPattern(item.unit)) {
    console.warn(`  [FORMAT FIX] Boxing format "${item.unit}" found in unit field, extracting...`);
    return item.unit;
  }
  return null;
}

/**
 * Check if a value looks like a boxing format (qty per case notation).
 * Examples: "1/500", "10/100", "6/RL", "6RL", "100CT", "10x100CT"
 *
 * @param {string} value - Value to check
 * @returns {boolean} True if value matches boxing format pattern
 */
export function isBoxingFormat(value) {
  return matchesAnyFormatPattern(value);
}

/**
 * Build a display unit string from item fields.
 *
 * Priority: format > unit > packSize+packUnit > default 'pc'
 *
 * @param {Object} item - Invoice line item
 * @returns {string} Display unit string (e.g., "2/5LB", "50lb", "pc")
 */
export function buildPackageUnit(item) {
  // Use format field if present (e.g., "1/500", "6/RL")
  if (item.format) return item.format;

  // Use unit field if present and not a boxing format
  if (item.unit && !matchesAnyFormatPattern(item.unit)) {
    return item.unit;
  }

  // Build from packSize and packUnit (e.g., packSize=2, packUnit="5LB" → "2/5LB")
  if (item.packSize && item.packUnit) {
    return `${item.packSize}/${item.packUnit}`;
  }

  // Use quantityUnit if present
  if (item.quantityUnit) return item.quantityUnit;

  // Default to 'case' for packaging items
  return 'case';
}

// ============================================
// V2 EXTRACTION FUNCTIONS
// ============================================

/**
 * Extract a field value by trying sources in priority order.
 *
 * @param {Object} line - Line object to extract from
 * @param {Array} priorities - Array of priority objects { source, path, confidence }
 * @param {Object} [profile] - Vendor profile for mapped columns
 * @returns {Object} ExtractedField { value, source, path, confidence, valid }
 */
function extractFieldByPriority(line, priorities, profile = null) {
  for (const priority of priorities) {
    let value = null;

    // Handle mapped columns
    if (priority.source === FIELD_SOURCE.MAPPED && priority.fromColumn && profile) {
      value = getColumnValue(line, profile, priority.fromColumn);
    }
    // Handle extracted fields (special processing needed)
    else if (priority.source === FIELD_SOURCE.EXTRACTED) {
      // Skip - these are handled separately in extractBoxingFormatV2
      continue;
    }
    // Handle default values
    else if (priority.source === FIELD_SOURCE.DEFAULT) {
      continue; // Skip defaults in first pass
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
 *
 * @param {Object} line - Line object
 * @param {Array} priorities - Priority list
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} ExtractedField with numeric value
 */
function extractNumericFieldByPriority(line, priorities, profile = null) {
  for (const priority of priorities) {
    let rawValue = null;

    if (priority.source === FIELD_SOURCE.MAPPED && priority.fromColumn && profile) {
      rawValue = getColumnValue(line, profile, priority.fromColumn);
    } else if (priority.source !== FIELD_SOURCE.EXTRACTED && priority.source !== FIELD_SOURCE.DEFAULT) {
      rawValue = line[priority.path];
    }

    // Clean and parse numeric value
    if (rawValue !== null && rawValue !== undefined) {
      const numValue = parseFloat(String(rawValue).replace(/[,$]/g, ''));
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

/**
 * Extract boxing format from all sources with tracking.
 * Tries: mapped column → Vision fields → unit field (misplaced) → description mining
 *
 * @param {Object} line - Line object
 * @param {string} description - Product description
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} BoxingFormatField with parsed data
 */
function extractBoxingFormatV2(line, description, profile = null) {
  const result = createEmptyBoxingFormat();

  // Source 1: Mapped column (highest confidence)
  if (profile?.columns?.boxingFormat || profile?.columns?.packageFormat) {
    const colName = profile.columns.boxingFormat ? 'boxingFormat' : 'packageFormat';
    const value = getColumnValue(line, profile, colName);
    if (value && matchesAnyFormatPattern(value)) {
      result.raw = value;
      result.source = FIELD_SOURCE.MAPPED;
      result.confidence = CONFIDENCE_SCORE.FORMAT_MAPPED;
      result.valid = true;
    }
  }

  // Source 2: Vision 'format' field
  if (!result.valid && line.format && matchesAnyFormatPattern(line.format)) {
    result.raw = line.format;
    result.source = FIELD_SOURCE.VISION;
    result.confidence = CONFIDENCE_SCORE.FORMAT_VISION_DIRECT;
    result.valid = true;
  }

  // Source 3: Vision 'boxingFormat' or 'packagingFormat' fields
  if (!result.valid) {
    const formatValue = line.boxingFormat || line.packagingFormat || line.packaging;
    if (formatValue && matchesAnyFormatPattern(formatValue)) {
      result.raw = formatValue;
      result.source = FIELD_SOURCE.VISION;
      result.confidence = CONFIDENCE_SCORE.FORMAT_VISION_DIRECT;
      result.valid = true;
    }
  }

  // Source 4: Misplaced in 'unit' field
  if (!result.valid && line.unit && matchesAnyFormatPattern(line.unit)) {
    result.raw = line.unit;
    result.source = FIELD_SOURCE.EXTRACTED;
    result.confidence = CONFIDENCE_SCORE.FORMAT_FROM_UNIT;
    result.valid = true;
    result._warning = createWarning(
      PACKAGING_WARNING.FORMAT_FIELD_MISPLACED,
      WARNING_SEVERITY.INFO,
      `Boxing format "${line.unit}" found in unit field`
    );
  }

  // Source 5: Mine from description
  if (!result.valid && description) {
    const match = description.match(BOXING_FORMAT_PATTERNS.STANDARD);
    if (match) {
      result.raw = match[0];
      result.source = FIELD_SOURCE.EXTRACTED;
      result.confidence = CONFIDENCE_SCORE.FORMAT_FROM_DESCRIPTION;
      result.valid = true;
    }
  }

  // Parse the format if we found one
  if (result.valid && result.raw) {
    result.parsed = parseBoxingFormatString(result.raw);
  }

  return result;
}

/**
 * Parse a boxing format string into components.
 * Handles various formats: "10/100", "6/RL", "6RL", "100CT", "10x100CT", "6x500ML"
 *
 * @param {string} formatString - The format string to parse
 * @returns {Object} ParsedBoxingFormat
 */
function parseBoxingFormatString(formatString) {
  if (!formatString) return null;

  const str = formatString.trim().toUpperCase();

  // Pattern 1: Slash notation - 1/500, 6/RL, 10/100
  const slashMatch = str.match(FORMAT_PATTERNS.SLASH);
  if (slashMatch) {
    const packCount = parseInt(slashMatch[1], 10);
    const secondPart = slashMatch[2];

    if (secondPart === 'RL') {
      return {
        type: BOXING_FORMAT_TYPE.ROLL,
        packCount: packCount,
        unitsPerPack: 1,
        totalUnitsPerCase: packCount,
        isRoll: true,
        formula: `${packCount} rolls per case`,
      };
    }

    const unitsPerPack = parseInt(secondPart, 10);
    const totalUnits = packCount > 1 ? packCount * unitsPerPack : unitsPerPack;
    return {
      type: packCount > 1 ? BOXING_FORMAT_TYPE.NESTED_UNITS : BOXING_FORMAT_TYPE.SIMPLE_COUNT,
      packCount,
      unitsPerPack,
      totalUnitsPerCase: totalUnits,
      isRoll: false,
      formula: packCount > 1 ? `${packCount} × ${unitsPerPack} = ${totalUnits} units` : `${unitsPerPack} units per case`,
    };
  }

  // Pattern 2: Roll notation without slash - 6RL, 1RL
  const rollMatch = str.match(FORMAT_PATTERNS.ROLL);
  if (rollMatch) {
    const rollCount = parseInt(rollMatch[1], 10);
    return {
      type: BOXING_FORMAT_TYPE.ROLL,
      packCount: rollCount,
      unitsPerPack: 1,
      totalUnitsPerCase: rollCount,
      isRoll: true,
      formula: `${rollCount} rolls per case`,
    };
  }

  // Pattern 3: Count notation - 100CT, 50CT
  const countMatch = str.match(FORMAT_PATTERNS.COUNT);
  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    return {
      type: BOXING_FORMAT_TYPE.SIMPLE_COUNT,
      packCount: 1,
      unitsPerPack: count,
      totalUnitsPerCase: count,
      isRoll: false,
      formula: `${count} units per case`,
    };
  }

  // Pattern 4: Nested with x - 10x100CT, 10x100
  const nestedMatch = str.match(FORMAT_PATTERNS.NESTED);
  if (nestedMatch) {
    const packCount = parseInt(nestedMatch[1], 10);
    const unitsPerPack = parseInt(nestedMatch[2], 10);
    const totalUnits = packCount * unitsPerPack;
    return {
      type: BOXING_FORMAT_TYPE.NESTED_UNITS,
      packCount,
      unitsPerPack,
      totalUnitsPerCase: totalUnits,
      isRoll: false,
      formula: `${packCount} × ${unitsPerPack} = ${totalUnits} units per case`,
      unit: nestedMatch[3] || null, // CT, ML, etc.
    };
  }

  // Pattern 5: Volume notation - 6x500ML, 6x1.89L
  const volumeMatch = str.match(FORMAT_PATTERNS.VOLUME);
  if (volumeMatch) {
    const packCount = parseInt(volumeMatch[1], 10);
    const volume = parseFloat(volumeMatch[2]);
    const unit = volumeMatch[3];
    // Convert to ml for consistency
    const volumeML = unit === 'L' ? volume * 1000 : volume;
    const totalVolumeML = packCount * volumeML;
    return {
      type: BOXING_FORMAT_TYPE.VOLUME,
      packCount,
      volumePerUnit: volume,
      volumeUnit: unit,
      totalVolumeML,
      totalUnitsPerCase: packCount,
      isRoll: false,
      isVolume: true,
      formula: `${packCount} × ${volume}${unit} = ${totalVolumeML}ml total`,
    };
  }

  // Pattern 6: Weight notation - 1/20KG, 4x2KG, 20x454G
  const weightMatch = str.match(FORMAT_PATTERNS.WEIGHT);
  if (weightMatch) {
    const packCount = parseInt(weightMatch[1], 10);
    const weight = parseFloat(weightMatch[2]);
    const unit = weightMatch[3];
    // Convert to grams for consistency
    const weightG = unit === 'KG' ? weight * 1000 : unit === 'LB' ? weight * 453.592 : unit === 'OZ' ? weight * 28.3495 : weight;
    const totalWeightG = packCount * weightG;
    return {
      type: BOXING_FORMAT_TYPE.WEIGHT,
      packCount,
      weightPerUnit: weight,
      weightUnit: unit,
      totalWeightG,
      totalUnitsPerCase: packCount,
      isRoll: false,
      isWeight: true,
      formula: `${packCount} × ${weight}${unit} = ${Math.round(totalWeightG)}g total`,
    };
  }

  // No pattern matched
  return null;
}

/**
 * Extract container capacity from description or explicit field.
 *
 * @param {Object} line - Line object
 * @param {string} description - Product description
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} ContainerCapacity
 */
function extractContainerCapacityV2(line, description, profile = null) {
  const result = createEmptyContainerCapacity();

  // Source 1: Mapped column
  if (profile?.columns?.containerFormat) {
    const value = getColumnValue(line, profile, 'containerFormat');
    if (value) {
      const parsed = parseCapacityString(value);
      if (parsed) {
        result.value = parsed.value;
        result.unit = parsed.unit;
        result.raw = value;
        result.source = FIELD_SOURCE.MAPPED;
        result.confidence = CONFIDENCE_SCORE.CAPACITY_EXPLICIT;
        result.valid = true;
        return result;
      }
    }
  }

  // Source 2: Vision containerCapacity field
  const containerFields = [line.containerCapacity, line.containerFormat, line.capacity];
  for (const field of containerFields) {
    if (field) {
      const parsed = parseCapacityString(String(field));
      if (parsed) {
        result.value = parsed.value;
        result.unit = parsed.unit;
        result.raw = String(field);
        result.source = FIELD_SOURCE.VISION;
        result.confidence = CONFIDENCE_SCORE.CAPACITY_EXPLICIT;
        result.valid = true;
        return result;
      }
    }
  }

  // Source 3: Extract from description (e.g., "CONT ALUM 2.25LB")
  if (description) {
    const upperDesc = description.toUpperCase();

    // Check for lost decimal pattern FIRST (OCR: "2 25LB" → 2.25LB)
    // Must check before regular weight pattern since "25LB" would match weight pattern
    const lostDecimalMatch = upperDesc.match(/\b(\d)\s+(\d{2})(LB|LBS|OZ)\b/);
    if (lostDecimalMatch) {
      // Reconstruct decimal: "2 25LB" → 2.25
      const reconstructedValue = parseFloat(`${lostDecimalMatch[1]}.${lostDecimalMatch[2]}`);
      let unit = lostDecimalMatch[3].toUpperCase();
      if (unit === 'LBS') unit = 'LB';

      result.value = reconstructedValue;
      result.unit = unit;
      result.raw = lostDecimalMatch[0];
      result.source = FIELD_SOURCE.EXTRACTED;
      result.confidence = CONFIDENCE_SCORE.CAPACITY_FROM_DESCRIPTION - 10; // Slightly lower for reconstructed
      result.valid = true;
      return result;
    }

    // Try weight capacity with decimal (2.25LB, 16OZ)
    const weightMatch = upperDesc.match(CONTAINER_CAPACITY_PATTERNS.WEIGHT);
    if (weightMatch) {
      result.value = parseFloat(weightMatch[1]);
      result.unit = weightMatch[2].toUpperCase();
      result.raw = weightMatch[0];
      result.source = FIELD_SOURCE.EXTRACTED;
      result.confidence = CONFIDENCE_SCORE.CAPACITY_FROM_DESCRIPTION;
      result.valid = true;
      return result;
    }

    // Try volume capacity (500ML, 1L)
    const volumeMatch = upperDesc.match(CONTAINER_CAPACITY_PATTERNS.VOLUME);
    if (volumeMatch) {
      result.value = parseFloat(volumeMatch[1]);
      result.unit = volumeMatch[2].toUpperCase();
      result.raw = volumeMatch[0];
      result.source = FIELD_SOURCE.EXTRACTED;
      result.confidence = CONFIDENCE_SCORE.CAPACITY_FROM_DESCRIPTION;
      result.valid = true;
      return result;
    }
  }

  return result;
}

/**
 * Parse a capacity string like "2.25LB" or "500ML"
 *
 * @param {string} str - Capacity string
 * @returns {Object|null} { value, unit }
 */
function parseCapacityString(str) {
  if (!str) return null;

  // Try weight
  const weightMatch = str.match(/(\d+(?:\.\d+)?)\s*(LB|OZ|KG|G)\b/i);
  if (weightMatch) {
    return {
      value: parseFloat(weightMatch[1]),
      unit: weightMatch[2].toUpperCase(),
    };
  }

  // Try volume
  const volumeMatch = str.match(/(\d+(?:\.\d+)?)\s*(ML|L|OZ|GAL)\b/i);
  if (volumeMatch) {
    return {
      value: parseFloat(volumeMatch[1]),
      unit: volumeMatch[2].toUpperCase(),
    };
  }

  return null;
}

/**
 * Apply column mapping for packaging handler.
 *
 * @param {Object} line - Raw line from Vision
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} Line with mapped columns applied
 */
function applyPackagingColumnMapping(line, profile = null) {
  if (!profile?.columns) return { ...line };

  const mapped = { ...line };

  // Map each configured column
  for (const [colName, colConfig] of Object.entries(profile.columns)) {
    if (colConfig && colConfig.index !== undefined) {
      const value = getColumnValue(line, profile, colName);
      if (value !== null && value !== undefined) {
        mapped[colName] = value;
      }
    }
  }

  return mapped;
}

/**
 * Extract all fields from a packaging invoice line.
 * Main entry point for V2 extraction phase.
 *
 * @param {Object} claudeLine - Raw line from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @returns {Object} PackagingAllFieldsExtraction with all fields and context
 */
export function extractAllFields_Packaging(claudeLine, profile = null) {
  // Apply column mapping first
  const line = applyPackagingColumnMapping(claudeLine, profile);

  // ═══════════════════════════════════════════════════════════
  // CORE FIELDS
  // ═══════════════════════════════════════════════════════════

  const description = extractFieldByPriority(line, FIELD_PRIORITIES.DESCRIPTION, profile);
  const quantity = extractNumericFieldByPriority(line, FIELD_PRIORITIES.QUANTITY, profile);
  const unitPrice = extractNumericFieldByPriority(line, FIELD_PRIORITIES.UNIT_PRICE, profile);
  const totalPrice = extractNumericFieldByPriority(line, FIELD_PRIORITIES.TOTAL_PRICE, profile);

  // ═══════════════════════════════════════════════════════════
  // PACKAGING-SPECIFIC FIELDS
  // ═══════════════════════════════════════════════════════════

  const boxingFormat = extractBoxingFormatV2(line, description.value, profile);
  const containerCapacity = extractContainerCapacityV2(line, description.value, profile);

  // ═══════════════════════════════════════════════════════════
  // OPTIONAL FIELDS
  // ═══════════════════════════════════════════════════════════

  const unit = extractFieldByPriority(line, FIELD_PRIORITIES.UNIT, profile);
  const sku = extractFieldByPriority(line, FIELD_PRIORITIES.SKU, profile);
  const category = extractFieldByPriority(line, FIELD_PRIORITIES.CATEGORY, profile);

  // ═══════════════════════════════════════════════════════════
  // BUILD EXTRACTION CONTEXT
  // ═══════════════════════════════════════════════════════════

  const context = {
    hasBoxingFormat: boxingFormat.valid,
    formatType: boxingFormat.parsed?.type || BOXING_FORMAT_TYPE.UNKNOWN,
    extractionMethod: boxingFormat.valid ? boxingFormat.source : 'none',
    hasContainerCapacity: containerCapacity.valid,
    isRollProduct: boxingFormat.parsed?.isRoll || false,
    expectedUnitsPerCase: boxingFormat.parsed?.totalUnitsPerCase || null,
    calculatedUnitsPerCase: null,  // Will be set in calculation phase
  };

  return {
    // Core fields
    description,
    quantity,
    unitPrice,
    totalPrice,

    // Packaging-specific
    boxingFormat,
    containerCapacity,

    // Optional fields
    unit: unit.valid ? unit : createExtractedField('case', FIELD_SOURCE.DEFAULT, null, 50),
    sku,
    category: category.valid ? category : createExtractedField(LINE_CATEGORY.PACKAGING, FIELD_SOURCE.DEFAULT, null, 50),

    // Context
    context,

    // Raw data for debugging
    _raw: {
      visionJson: claudeLine,
      mappedLine: line,
    },
  };
}

// ============================================
// V2 VALIDATION TIERS
// ============================================

/**
 * Tier 1 Validation: Can Bill?
 * Checks if core fields are present for QuickBooks billing.
 *
 * @param {Object} extraction - Result from extractAllFields_Packaging
 * @returns {Object} { tier1Valid, canBill, warnings }
 */
function validateTier1_Packaging(extraction) {
  const warnings = [];
  let tier1Valid = true;

  // Check description (required)
  if (!extraction.description.valid) {
    tier1Valid = false;
    warnings.push(createWarning(
      PACKAGING_WARNING.MISSING_FORMAT,
      WARNING_SEVERITY.ERROR,
      'Missing product description'
    ));
  }

  // Check quantity (required, can be 0 for credits)
  if (!extraction.quantity.valid) {
    tier1Valid = false;
    warnings.push(createWarning(
      PACKAGING_WARNING.MISSING_QUANTITY,
      WARNING_SEVERITY.ERROR,
      'Missing quantity'
    ));
  }

  // Check unit price (required)
  if (!extraction.unitPrice.valid) {
    tier1Valid = false;
    warnings.push(createWarning(
      PACKAGING_WARNING.ZERO_PRICE,
      WARNING_SEVERITY.ERROR,
      'Missing unit price'
    ));
  } else if (extraction.unitPrice.value === 0) {
    // Zero price is a warning, not an error (could be a free item or credit)
    warnings.push(createWarning(
      PACKAGING_WARNING.ZERO_PRICE,
      WARNING_SEVERITY.WARNING,
      'Unit price is zero'
    ));
  }

  return {
    tier1Valid,
    canBill: tier1Valid,
    warnings,
  };
}

/**
 * Tier 2 Validation: Format Valid?
 * Checks if boxing format was extracted and parsed correctly.
 * For packaging, format is optional but improves tracking.
 *
 * @param {Object} extraction - Result from extractAllFields_Packaging
 * @returns {Object} { tier2Valid, warnings }
 */
function validateTier2_Packaging(extraction) {
  const warnings = [];

  // Format is optional for packaging - tier2 is always valid
  // But we track warnings for missing/invalid format
  if (!extraction.boxingFormat.valid) {
    warnings.push(createWarning(
      PACKAGING_WARNING.MISSING_FORMAT,
      WARNING_SEVERITY.INFO,
      'Boxing format not found - units per case unknown'
    ));
  } else if (!extraction.boxingFormat.parsed) {
    warnings.push(createWarning(
      PACKAGING_WARNING.FORMAT_PARSE_FAILED,
      WARNING_SEVERITY.WARNING,
      `Could not parse boxing format: ${extraction.boxingFormat.raw}`
    ));
  }

  // Include format field misplacement warning if present
  if (extraction.boxingFormat._warning) {
    warnings.push(extraction.boxingFormat._warning);
  }

  // Roll product info
  if (extraction.context.isRollProduct) {
    warnings.push(createWarning(
      PACKAGING_WARNING.ROLL_PRODUCT,
      WARNING_SEVERITY.INFO,
      'Roll product detected - stock tracked as rolls'
    ));
  }

  return {
    tier2Valid: true, // Always valid for packaging (format is optional)
    formatValid: extraction.boxingFormat.valid && extraction.boxingFormat.parsed !== null,
    warnings,
  };
}

/**
 * Tier 3 Validation: Units Calculated?
 * Checks if units calculation succeeded.
 *
 * @param {Object} unitsCalc - Result from calculateUnitsV2_Packaging
 * @returns {Object} { tier3Valid, warnings }
 */
function validateTier3_Packaging(unitsCalc) {
  const warnings = [];

  if (!unitsCalc.valid) {
    warnings.push(createWarning(
      PACKAGING_WARNING.UNITS_CALCULATION_FAILED,
      WARNING_SEVERITY.WARNING,
      'Could not calculate total units per case'
    ));
  }

  return {
    tier3Valid: unitsCalc.valid,
    warnings,
  };
}

/**
 * Math Validation: qty × unitPrice = total?
 *
 * @param {Object} extraction - Extraction result
 * @param {number} [tolerance=0.02] - Tolerance in dollars
 * @returns {Object} { valid, expected, actual, difference, confidence }
 */
function validateMath_Packaging(extraction, tolerance = DEFAULT_MATH_TOLERANCE) {
  const qty = extraction.quantity.value || 0;
  const unitPrice = extraction.unitPrice.value || 0;
  const actualTotal = extraction.totalPrice.value;

  // Calculate expected total
  const expectedTotal = Math.round(qty * unitPrice * 100) / 100;

  // If no actual total provided, we can't validate
  if (actualTotal === null || actualTotal === undefined) {
    return {
      valid: true, // Assume valid if no total to check
      expected: expectedTotal,
      actual: null,
      difference: 0,
      confidence: CONFIDENCE_SCORE.MATH_TOLERANCE,
      formula: 'qty × unitPrice',
    };
  }

  const difference = Math.abs(expectedTotal - actualTotal);

  // Determine confidence based on difference
  let confidence = CONFIDENCE_SCORE.MATH_ERROR;
  let valid = false;

  if (difference <= MATH_TOLERANCE_THRESHOLDS.EXACT) {
    confidence = CONFIDENCE_SCORE.MATH_EXACT;
    valid = true;
  } else if (difference <= MATH_TOLERANCE_THRESHOLDS.ROUNDING) {
    confidence = CONFIDENCE_SCORE.MATH_ROUNDING;
    valid = true;
  } else if (difference <= MATH_TOLERANCE_THRESHOLDS.ACCEPTABLE) {
    confidence = CONFIDENCE_SCORE.MATH_TOLERANCE;
    valid = true;
  } else if (difference <= MATH_TOLERANCE_THRESHOLDS.MINOR) {
    confidence = CONFIDENCE_SCORE.MATH_MINOR;
    valid = true; // Still valid but lower confidence
  } else if (difference <= MATH_TOLERANCE_THRESHOLDS.REVIEW) {
    confidence = CONFIDENCE_SCORE.MATH_REVIEW;
    valid = false;
  }

  return {
    valid,
    expected: expectedTotal,
    actual: actualTotal,
    difference: Math.round(difference * 100) / 100,
    confidence,
    formula: 'qty × unitPrice',
  };
}

// ============================================
// V2 CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate units for packaging line.
 * For packaging, we calculate total units per case and price per unit.
 *
 * @param {Object} extraction - Extraction result
 * @returns {Object} UnitsCalculation
 */
function calculateUnitsV2_Packaging(extraction) {
  const result = createEmptyUnitsCalculation();

  const qty = extraction.quantity.value || 0;
  const unitPrice = extraction.unitPrice.value || 0;
  const format = extraction.boxingFormat;

  // If we have a parsed format, use it
  if (format.valid && format.parsed) {
    result.packCount = format.parsed.packCount;
    result.unitsPerPack = format.parsed.unitsPerPack;
    result.totalUnitsPerCase = format.parsed.totalUnitsPerCase;
    result.totalUnitsOrdered = result.totalUnitsPerCase * qty;

    // Calculate price per individual unit
    if (result.totalUnitsPerCase > 0 && unitPrice > 0) {
      result.pricePerUnit = Math.round((unitPrice / result.totalUnitsPerCase) * 10000) / 10000;
    }

    result.source = FIELD_SOURCE.CALCULATED;
    result.valid = true;
  } else {
    // No format - assume 1 unit per case
    result.packCount = 1;
    result.unitsPerPack = 1;
    result.totalUnitsPerCase = 1;
    result.totalUnitsOrdered = qty;
    result.pricePerUnit = unitPrice;
    result.source = FIELD_SOURCE.DEFAULT;
    result.valid = true; // Still valid, just less precise
  }

  return result;
}

/**
 * Calculate weighted confidence score for packaging.
 * Weights: Math 50%, Format 30%, Core Fields 20%
 *
 * @param {Object} params - { math, format, coreFieldsValid }
 * @returns {number} Weighted confidence (0-100)
 */
function calculateWeightedConfidence_Packaging({ math, format, coreFieldsValid }) {
  let score = 0;

  // Math validation: 50% weight
  score += (math.confidence || 0) * 0.50;

  // Format extraction: 30% weight
  // If format found, use its confidence; otherwise use 50% (unit-based fallback is okay)
  const formatConfidence = format.valid ? format.confidence : 50;
  score += formatConfidence * 0.30;

  // Core fields: 20% weight
  score += (coreFieldsValid ? 100 : 50) * 0.20;

  return Math.round(score);
}

/**
 * Build validation summary from all tier results.
 *
 * @param {Object} params - All validation results
 * @returns {Object} ValidationSummary
 */
function buildValidationSummary_Packaging({
  tier1,
  tier2,
  tier3,
  math,
  extraction,
}) {
  const allWarnings = [
    ...tier1.warnings,
    ...tier2.warnings,
    ...tier3.warnings,
  ];

  // Add math warning if needed
  if (!math.valid && math.difference > 0) {
    allWarnings.push(createWarning(
      PACKAGING_WARNING.MATH_DISCREPANCY,
      WARNING_SEVERITY.WARNING,
      `Math discrepancy: expected $${math.expected}, got $${math.actual} (diff: $${math.difference})`
    ));
  }

  // Calculate weighted confidence
  const overallConfidence = calculateWeightedConfidence_Packaging({
    math,
    format: extraction.boxingFormat,
    coreFieldsValid: tier1.tier1Valid,
  });

  // Add low confidence warning if needed
  if (overallConfidence < CONFIDENCE_THRESHOLD.MEDIUM) {
    allWarnings.push(createWarning(
      PACKAGING_WARNING.LOW_CONFIDENCE,
      WARNING_SEVERITY.WARNING,
      `Low confidence score: ${overallConfidence}%`
    ));
  }

  // Separate warnings from errors
  const warnings = allWarnings.filter(w => w.severity !== WARNING_SEVERITY.ERROR);
  const errors = allWarnings.filter(w => w.severity === WARNING_SEVERITY.ERROR);

  return {
    tier1Valid: tier1.tier1Valid,
    tier2Valid: tier2.tier2Valid,
    tier3Valid: tier3.tier3Valid,
    canProcess: tier1.tier1Valid && tier3.tier3Valid,
    canBill: tier1.canBill,
    overallConfidence,
    confidenceLevel: getConfidenceLevel(overallConfidence),
    warnings,
    errors,
  };
}

// ============================================
// V2 PIPELINE
// ============================================

/**
 * Process a single packaging invoice line through the V2 pipeline.
 *
 * Pipeline Phases:
 * 1. EXTRACT: Extract all fields with source tracking
 * 2. (Skip for packaging - always UNIT pricing)
 * 3. VALIDATE: Run tier 1/2/3 validation gates
 * 4. CALCULATE: Calculate units and price per unit
 * 5. BUILD: Build summary and determine routing
 *
 * @param {Object} claudeLine - Raw line from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @param {Object} [options] - Processing options
 * @returns {Object} PackagingProcessedLine
 */
export function processLineV2_Packaging(claudeLine, profile = null, options = {}) {
  const lineNumber = claudeLine.lineNumber || options.lineNumber || 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: EXTRACT ALL FIELDS
  // ═══════════════════════════════════════════════════════════════════════════
  const extraction = extractAllFields_Packaging(claudeLine, profile);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: (Skipped for packaging - always UNIT pricing)
  // ═══════════════════════════════════════════════════════════════════════════
  const pricingType = 'unit';

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: VALIDATE ALL
  // ═══════════════════════════════════════════════════════════════════════════
  const tier1 = validateTier1_Packaging(extraction);
  const math = validateMath_Packaging(extraction);
  const tier2 = validateTier2_Packaging(extraction);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: CALCULATE UNITS
  // ═══════════════════════════════════════════════════════════════════════════
  const units = calculateUnitsV2_Packaging(extraction);
  const tier3 = validateTier3_Packaging(units);

  // Update context with calculated values
  extraction.context.calculatedUnitsPerCase = units.totalUnitsPerCase;

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: BUILD SUMMARY AND ROUTE
  // ═══════════════════════════════════════════════════════════════════════════
  const validation = buildValidationSummary_Packaging({
    tier1,
    tier2,
    tier3,
    math,
    extraction,
  });

  // Detect line type
  const lineType = detectPackagingLineType(extraction);

  // Determine routing flags
  const forInventory = validation.canProcess && lineType === 'product';
  const forAccounting = validation.canBill;
  const isDeposit = lineType === 'deposit';
  const isCredit = lineType === 'credit';

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD PROCESSED LINE
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    lineNumber,

    // Core fields (tracked)
    description: {
      value: extraction.description.value,
      source: extraction.description.source,
      valid: extraction.description.valid,
    },
    quantity: {
      value: extraction.quantity.value,
      source: extraction.quantity.source,
      valid: extraction.quantity.valid,
    },
    unitPrice: {
      value: extraction.unitPrice.value,
      source: extraction.unitPrice.source,
      valid: extraction.unitPrice.valid,
    },
    totalPrice: {
      value: extraction.totalPrice.value,
      source: extraction.totalPrice.source,
      valid: extraction.totalPrice.valid,
    },

    // Packaging-specific fields
    boxingFormat: extraction.boxingFormat,
    format: extraction.boxingFormat,  // Alias for compatibility with convertVisionResultToInvoice
    containerCapacity: extraction.containerCapacity,
    units,
    math,
    validation,

    // Line classification
    lineType,
    pricingType,
    forInventory,
    forAccounting,
    isDeposit,
    isCredit,

    // Optional fields
    sku: extraction.sku.value,
    category: extraction.category.value,
    unit: extraction.unit.value,

    // Context for debugging
    _context: extraction.context,
    _raw: extraction._raw,

    // Flat fields for easy access (backwards compatibility)
    _flat: {
      lineNumber,
      name: extraction.description.value,
      description: extraction.description.value,
      rawDescription: claudeLine.description || claudeLine.name,
      category: extraction.category.value, // AI categorization (FOOD, PACKAGING, SUPPLY, FEE, DIVERS)
      quantity: extraction.quantity.value,
      unitPrice: extraction.unitPrice.value,
      totalPrice: extraction.totalPrice.value,
      boxingFormat: extraction.boxingFormat.raw,
      format: extraction.boxingFormat.raw,  // Alias for compatibility
      totalUnitsPerCase: units.totalUnitsPerCase,
      totalUnitsOrdered: units.totalUnitsOrdered,
      pricePerUnit: units.pricePerUnit,
      containerCapacity: extraction.containerCapacity.raw,
      containerCapacityUnit: extraction.containerCapacity.unit,
      mathValid: math.valid,
      mathDiff: math.difference,
      canProcess: validation.canProcess,
      canBill: validation.canBill,
      confidence: validation.overallConfidence,
      confidenceLevel: validation.confidenceLevel,
    },
  };
}

/**
 * Detect line type for packaging.
 *
 * @param {Object} extraction - Extraction result
 * @returns {string} 'product' | 'deposit' | 'fee' | 'credit' | 'zero'
 */
function detectPackagingLineType(extraction) {
  const description = (extraction.description.value || '').toLowerCase();
  const total = extraction.totalPrice.value || 0;
  const unitPrice = extraction.unitPrice.value || 0;

  // Check for credit (negative total)
  if (total < 0) {
    return 'credit';
  }

  // Check for zero price
  if (unitPrice === 0 && total === 0) {
    return 'zero';
  }

  // Check for deposit keywords
  const depositKeywords = ['deposit', 'dépôt', 'consigne', 'bottle dep', 'can dep'];
  if (depositKeywords.some(kw => description.includes(kw))) {
    return 'deposit';
  }

  // Check for fee keywords
  const feeKeywords = ['delivery', 'shipping', 'freight', 'fuel', 'service', 'livraison', 'transport'];
  if (feeKeywords.some(kw => description.includes(kw))) {
    return 'fee';
  }

  return 'product';
}

/**
 * Process multiple packaging invoice lines through the V2 pipeline.
 *
 * @param {Object[]} claudeLines - Array of lines from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @param {Object} [options] - Processing options
 * @returns {Object} { lines, summary }
 */
export function processLinesV2_Packaging(claudeLines, profile = null, options = {}) {
  const lines = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let totalConfidence = 0;
  let calculatedSubtotal = 0;
  const allWarnings = [];

  for (let i = 0; i < claudeLines.length; i++) {
    const claudeLine = claudeLines[i];
    const processed = processLineV2_Packaging(claudeLine, profile, {
      ...options,
      lineNumber: i + 1,
    });

    lines.push(processed);

    // Aggregate stats
    if (processed.validation.canProcess) validCount++;
    if (processed.validation.warnings.length > 0) warningCount++;
    if (processed.validation.errors.length > 0) errorCount++;
    totalConfidence += processed.validation.overallConfidence;
    calculatedSubtotal += processed.totalPrice.value || 0;

    // Collect warnings
    processed.validation.warnings.forEach(w => {
      allWarnings.push({ ...w, lineNumber: processed.lineNumber });
    });
  }

  return {
    lines,
    summary: {
      total: lines.length,
      valid: validCount,
      warnings: warningCount,
      errors: errorCount,
      avgConfidence: lines.length > 0 ? Math.round(totalConfidence / lines.length) : 0,
      calculatedSubtotal: Math.round(calculatedSubtotal * 100) / 100,
    },
    allWarnings,
  };
}

/**
 * Maps invoice columns to inventory item fields
 */
const FIELD_MAPPINGS = {
  columns: {
    sku: 'sku',
    description: 'name',
    boxingFormat: 'packagingFormat',  // NOT unit!
    containerFormat: 'containerCapacity',
    quantity: 'lastOrderQty',
    unitPrice: 'lastPurchasePrice',
    total: 'lastInvoiceTotal'
  },
  requiredColumns: ['description', 'quantity', 'unitPrice'],
  optionalColumns: ['sku', 'boxingFormat', 'containerFormat', 'total']
};

// ============================================
// HANDLER IMPLEMENTATION
// ============================================

/**
 * Packaging Distributor Invoice Handler
 */
export const packagingDistributorHandler = {
  type: INVOICE_TYPES.PACKAGING_DISTRIBUTOR,
  label: 'Packaging Distributor',
  description: 'For packaging/container suppliers (Carrousel Emballage, etc.) with boxing format notation',

  fieldMappings: FIELD_MAPPINGS,

  /**
   * Validates an invoice line item.
   * V2 validation is integrated into processLines, so this returns valid.
   *
   * @param {Object} lineItem - Invoice line from Claude
   * @returns {Object} { valid, errors, warnings }
   */
  validateLine(lineItem) {
    return { valid: true, errors: [], warnings: [] };
  },

  /**
   * Creates a new inventory item from an invoice line.
   * This is the complete item creation with all required fields.
   *
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @param {Object} options - Additional options
   * @param {string} [options.invoiceId] - Invoice ID for tracking
   * @param {string} [options.invoiceDate] - Invoice date
   * @returns {Object} { item, warnings }
   */
  createInventoryItem(lineItem, vendor, options = {}) {
    const warnings = [];
    const itemName = (lineItem.description || lineItem.name || '').trim();
    const quantity = parseFloat(lineItem.quantity) || 1;
    const unitPrice = parseFloat(lineItem.unitPrice) || 0;
    const now = new Date().toISOString();

    // Extract boxing format from correct field
    const rawFormat = extractBoxingFormat(lineItem);

    // Start with base fields
    const item = {
      ...extractBaseFields(lineItem, vendor),

      // Packaging distributor specific
      itemType: 'packaging',
      category: lineItem.category || LINE_CATEGORY.PACKAGING,

      // Unit display (use format or build from fields)
      unit: rawFormat || buildPackageUnit(lineItem),

      // Pricing
      currentPrice: unitPrice,
      pricePerG: null,   // Packaging items don't use weight pricing
      pricePerML: null,

      // Stock tracking (stockQuantity = base units for packaging)
      stockQuantity: quantity,  // Will be updated to base units if format is parsed
      stockQuantityUnit: 'pc',  // Individual pieces, not cases
      parQuantity: quantity,

      // No weight for packaging items (count-based, not weight-based)
      stockWeight: 0,
      stockWeightUnit: null,  // null = not weight-based
      parWeight: 0,

      // Invoice tracking
      lastPurchaseDate: options.invoiceDate || now,
      lastInvoiceId: options.invoiceId || null,
      isActive: true
    };

    // Handle boxing format - parse and calculate units
    if (rawFormat) {
      const packagingInfo = parsePackagingInfo({
        description: itemName,
        format: rawFormat,
        quantity
      });

      // Set all packaging fields
      item.packagingFormat = rawFormat;
      item.lastBoxingFormat = rawFormat;
      item.packagingType = packagingInfo.packaging.packagingType;
      item.packCount = packagingInfo.packaging.packCount;
      item.unitsPerPack = packagingInfo.packaging.unitsPerPack;

      // Stock in BASE UNITS (individual items, not cases)
      // e.g., 3 cases × 500 units/case = 1500 individual units
      // stockQuantity = total individual pieces for inventory tracking
      item.stockQuantity = packagingInfo.calculatedTotalUnits;
      item.parQuantity = packagingInfo.calculatedTotalUnits;

      // Handle roll products
      if (packagingInfo.packaging.rollsPerCase) {
        item.rollsPerCase = packagingInfo.packaging.rollsPerCase;
        item.lengthPerRoll = packagingInfo.packaging.lengthPerRoll;
        item.lengthUnit = packagingInfo.packaging.lengthUnit;
      }

      // Store totalUnitsPerCase for display and calculations
      const totalUnitsPerCase = packagingInfo.packaging.totalUnitsPerCase;
      item.totalUnitsPerCase = totalUnitsPerCase;
      item.unitsPerCase = totalUnitsPerCase; // Alias

      // Calculate price per unit (per individual piece)
      if (totalUnitsPerCase > 0 && unitPrice > 0) {
        item.pricePerUnit = unitPrice / totalUnitsPerCase;
      }

    } else {
      // No boxing format - still set baseUnit and default totalBaseUnits
      item.baseUnit = 'pc';
      item.totalBaseUnits = quantity;  // Default to quantity without format breakdown
      warnings.push('No boxing format found - unit tracking may be incomplete');
    }

    // Extract container capacity from description (e.g., "2.25LB" container)
    const containerInfo = extractContainerInfo(itemName);
    if (containerInfo) {
      Object.assign(item, containerInfo);
    }

    // Extract dimensions from description (e.g., "8X8", "9\" ROUND")
    const dimensionInfo = extractDimensionInfo(itemName);
    if (dimensionInfo) {
      Object.assign(item, dimensionInfo);
    }

    return { item, warnings };
  },

  /**
   * Updates an existing inventory item with new invoice data.
   * Handles stock addition, format updates, and backfill of missing fields.
   *
   * @param {Object} existingItem - Current inventory item
   * @param {Object} lineItem - Invoice line from Claude
   * @param {Object} vendor - Vendor object
   * @param {Object} options - Additional options
   * @param {string} [options.invoiceId] - Invoice ID for tracking
   * @param {string} [options.invoiceDate] - Invoice date
   * @returns {Object} { updates, warnings, previousValues }
   */
  updateInventoryItem(existingItem, lineItem, vendor, options = {}) {
    const warnings = [];
    const itemName = (lineItem.description || lineItem.name || '').trim();
    const quantity = parseFloat(lineItem.quantity) || 1;
    const unitPrice = parseFloat(lineItem.unitPrice) || 0;
    const now = new Date().toISOString();

    // Capture previous values for tracking
    const previousValues = {
      price: existingItem.currentPrice || 0,
      stockQuantity: existingItem.stockQuantity || 0
    };

    // Extract boxing format from correct field (handles Claude mis-mapping)
    const rawFormat = extractBoxingFormat(lineItem);

    // Base updates
    const updates = {
      lastOrderQty: quantity,
      lastOrderDate: now,
      lastPurchasePrice: unitPrice || existingItem.lastPurchasePrice,
      lastInvoiceTotal: parseFloat(lineItem.total) || existingItem.lastInvoiceTotal,
      currentPrice: unitPrice || existingItem.currentPrice,
      lastPurchaseDate: options.invoiceDate || now,
      lastInvoiceId: options.invoiceId || existingItem.lastInvoiceId,
      updatedAt: now
    };

    // Update stock quantities
    updates.stockQuantity = (existingItem.stockQuantity || 0) + quantity;

    // Handle boxing format update
    if (rawFormat) {
      const packagingInfo = parsePackagingInfo({
        description: itemName,
        format: rawFormat,
        quantity
      });

      // Check if format changed
      const oldFormat = existingItem.lastBoxingFormat || existingItem.packagingFormat;
      if (oldFormat && oldFormat !== rawFormat) {
        warnings.push(`Boxing format changed from ${oldFormat} to ${rawFormat}`);
      }

      // Update format tracking (always use latest)
      updates.packagingFormat = rawFormat;
      updates.lastBoxingFormat = rawFormat;
      updates.packagingType = packagingInfo.packaging.packagingType;
      updates.packCount = packagingInfo.packaging.packCount;
      updates.unitsPerPack = packagingInfo.packaging.unitsPerPack;

      // Add to base units stock (stockQuantity = individual pieces)
      const existingBaseUnits = existingItem.stockQuantity || 0;
      updates.stockQuantity = existingBaseUnits + packagingInfo.calculatedTotalUnits;

      // Handle roll products
      if (packagingInfo.packaging.rollsPerCase) {
        updates.rollsPerCase = packagingInfo.packaging.rollsPerCase;
        updates.lengthPerRoll = packagingInfo.packaging.lengthPerRoll;
        updates.lengthUnit = packagingInfo.packaging.lengthUnit;
      }

      // Store totalUnitsPerCase for display and calculations
      const totalUnitsPerCase = packagingInfo.packaging.totalUnitsPerCase;
      updates.totalUnitsPerCase = totalUnitsPerCase;
      updates.unitsPerCase = totalUnitsPerCase; // Alias

      // Calculate price per unit (per individual piece)
      const unitPrice = parseFloat(lineItem.unitPrice) || 0;
      if (totalUnitsPerCase > 0 && unitPrice > 0) {
        updates.pricePerUnit = unitPrice / totalUnitsPerCase;
      }

    } else {
      // No format - just add quantity to stockQuantity
      updates.stockQuantity = (existingItem.stockQuantity || 0) + quantity;
    }

    // Backfill missing container/dimension fields
    const containerInfo = extractContainerInfo(itemName);
    if (containerInfo && !existingItem.containerCapacity) {
      Object.assign(updates, containerInfo);
    }

    const dimensionInfo = extractDimensionInfo(itemName);
    if (dimensionInfo) {
      if (dimensionInfo.productDimensions && !existingItem.productDimensions) {
        updates.productDimensions = dimensionInfo.productDimensions;
      }
      if (dimensionInfo.productSpecs && !existingItem.productSpecs) {
        updates.productSpecs = dimensionInfo.productSpecs;
      }
    }

    return { updates, warnings, previousValues };
  },

  // ============================================
  // LINE PROCESSING (with analysis)
  // ============================================

  /**
   * Processes all invoice lines with packaging distributor specific logic.
   * Delegates to V2 pipeline and converts output to V1-compatible format.
   *
   * @param {Array} claudeLines - Line items from Claude parsing
   * @param {Object} [profile] - Vendor parsing profile with column mappings
   * @returns {Object} Processed result { lines, summary, allWarnings }
   */
  processLines(claudeLines, profile = null) {
    const v2Result = processLinesV2_Packaging(claudeLines, profile);

    // Convert V2 output to V1-compatible plain values
    const v1CompatibleLines = v2Result.lines.map(line => ({
      // Spread the flat values for V1 compatibility
      ...line._flat,
      // Keep line type and routing
      lineType: line.lineType,
      forInventory: line.forInventory,
      forAccounting: line.forAccounting,
      isDeposit: line.isDeposit,
      isCredit: line.isCredit,
      // Keep validation warnings as anomalies
      anomalies: line.validation.warnings,
      hasAnomalies: line.validation.warnings.length > 0,
      // Packaging-specific fields from V2
      boxingFormat: line.boxingFormat?.raw || null,
      format: line.boxingFormat?.raw || null,
      packCount: line.units?.packCount || null,
      unitsPerPack: line.units?.unitsPerPack || null,
      totalUnitsPerCase: line.units?.totalUnitsPerCase || null,
      calculatedTotalUnits: line.units?.totalUnitsOrdered || null,
      pricePerUnit: line.units?.pricePerUnit || null,
      containerCapacity: line.containerCapacity?.value || null,
      containerCapacityUnit: line.containerCapacity?.unit || null,
      // Packaging NEVER uses weight-based pricing
      pricePerG: null,
      pricePerML: null,
      isWeightBasedPricing: false,
      pricingType: 'unit',
      // Base unit tracking
      baseUnit: 'pc',
      totalBaseUnits: line.units?.totalUnitsOrdered || line._flat?.quantity || 0,
      // Raw data
      rawColumns: line._raw?.visionJson?.rawColumns || null,
    }));

    return {
      lines: v1CompatibleLines,
      summary: v2Result.summary,
      allAnomalies: v2Result.allWarnings,
      allWarnings: v2Result.allWarnings,
    };
  },

  /**
   * Processes a single invoice line with packaging distributor specific logic.
   * Delegates to V2 pipeline and returns V1-compatible flat output.
   *
   * @param {Object} claudeLine - Line item from Claude parsing
   * @param {number} index - Line index
   * @returns {Object} Processed line item with analysis
   */
  processLine(claudeLine, index = 0) {
    const v2Result = processLineV2_Packaging(claudeLine, null, { lineNumber: index + 1 });

    // Return V1-compatible flat output
    return {
      ...v2Result._flat,
      lineType: v2Result.lineType,
      forInventory: v2Result.forInventory,
      forAccounting: v2Result.forAccounting,
      isDeposit: v2Result.isDeposit,
      isCredit: v2Result.isCredit,
      // Packaging-specific fields from V2
      boxingFormat: v2Result.boxingFormat?.raw || null,
      format: v2Result.boxingFormat?.raw || null,
      packCount: v2Result.units?.packCount || null,
      unitsPerPack: v2Result.units?.unitsPerPack || null,
      totalUnitsPerCase: v2Result.units?.totalUnitsPerCase || null,
      calculatedTotalUnits: v2Result.units?.totalUnitsOrdered || null,
      rollsPerCase: v2Result.boxingFormat?.parsed?.isRoll ? v2Result.units?.packCount : null,
      containerCapacity: v2Result.containerCapacity?.value || null,
      containerCapacityUnit: v2Result.containerCapacity?.unit || null,
      // Packaging NEVER uses weight-based pricing
      pricePerG: null,
      pricePerML: null,
      isWeightBasedPricing: false,
      pricingType: 'unit',
      // Validation
      anomalies: v2Result.validation.warnings,
      hasAnomalies: v2Result.validation.warnings.length > 0,
      // Base unit tracking
      baseUnit: 'pc',
      totalBaseUnits: v2Result.units?.totalUnitsOrdered || v2Result._flat?.quantity || 0,
    };
  },

  /**
   * Applies packaging distributor specific column mapping to a line item.
   * Delegates to module-level function for consistency with V2 pipeline.
   *
   * @param {Object} line - Raw line item from Claude parsing
   * @param {Object} profile - Vendor parsing profile
   * @returns {Object} Line with mapped column values
   */
  applyColumnMapping(line, profile) {
    return applyPackagingColumnMapping(line, profile);
  },

  /**
   * V2 Pipeline: Process invoice lines with full validation and tracking.
   * Delegates to module-level processLinesV2_Packaging function.
   *
   * @param {Array} claudeLines - Line items from Vision parser
   * @param {Object} [profile] - Vendor parsing profile
   * @param {Object} [options] - Processing options
   * @returns {Object} { lines: ProcessedLine[], summary: ValidationSummary }
   */
  processLinesV2(claudeLines, profile = null, options = {}) {
    return processLinesV2_Packaging(claudeLines, profile, options);
  }
};

export default packagingDistributorHandler;
