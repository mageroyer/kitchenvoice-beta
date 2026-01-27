/**
 * Food Supply Handler
 *
 * Specialized handler for food/ingredient suppliers like Sysco, GFS, local farms.
 * Handles unit-based and weight-based pricing.
 *
 * Key concepts:
 * - Unit: measurement unit (kg, lb, case, each)
 * - Weight: actual product weight for weight-priced items
 * - Price per gram: normalized pricing for recipe costing
 *
 * @module services/invoice/handlers/foodSupplyHandler
 */

import { INVOICE_TYPES, LINE_TYPE, MATH_TOLERANCE } from './types';
import { LINE_CATEGORY } from '../lineCategorizer';
import {
  extractBaseFields,
  isVolumeUnit,
  detectLineType,
  getRoutingFlags,
  getColumnValue,
  getNumericColumnValue,
} from './baseHandler';
import { calculateLineValues, parseFormat, extractFormatFromDescription, extractUnitWeightFromDescription, toGrams, FORMAT_TYPE } from './foodSupplyUtils';

// Import new V2 types
import {
  FIELD_SOURCE,
  FORMAT_TYPE as FORMAT_TYPE_V2,
  PRICING_TYPE,
  CONFIDENCE_THRESHOLD,
  CONFIDENCE_SCORE,
  WARNING_SEVERITY,
  FOOD_SUPPLY_WARNING,
  WEIGHT_TO_GRAMS,
  VOLUME_TO_ML,
  NORMALIZED_WEIGHT_UNIT,
  NORMALIZED_VOLUME_UNIT,
  DEFAULT_MATH_TOLERANCE,
  MATH_TOLERANCE_THRESHOLDS,
  createTrackedString,
  createTrackedNumber,
  createEmptyValidation,
  createWarning,
  getConfidenceLevel,
  // New extraction types
  UNIT_TYPE,
  FIELD_PRIORITIES,
  classifyUnit,
  isWeightUnit as isWeightUnitType,
  isCountUnit as isCountUnitType,
  isContainerUnit,
  isVolumeUnit as isVolumeUnitType,
  createExtractedField,
  createEmptyExtractedField,
} from './foodSupplyTypes';
import { getUnitFactorForPrice } from '../../../utils/unitConversion';

// ============================================
// WEIGHT UTILITIES
// ============================================

/**
 * Normalize weight unit to standard abbreviation.
 *
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (lb, kg, g, oz)
 */
export function normalizeWeightUnit(unit) {
  if (!unit) return 'lb';
  const normalized = unit.toLowerCase().trim();
  if (normalized.startsWith('kg') || normalized.startsWith('kilo')) return 'kg';
  if (normalized.startsWith('g') || normalized.startsWith('gram')) return 'g';
  if (normalized.startsWith('oz') || normalized.startsWith('ounce')) return 'oz';
  return 'lb'; // Default to lb
}

/**
 * Normalize volume unit to standard abbreviation.
 *
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (L, ml, gal)
 */
export function normalizeVolumeUnit(unit) {
  if (!unit) return 'ml';
  const normalized = unit.toLowerCase().trim();
  if (normalized === 'l' || normalized.startsWith('litr') || normalized.startsWith('litre')) return 'L';
  if (normalized.startsWith('ml') || normalized.startsWith('millil')) return 'ml';
  if (normalized.startsWith('gal')) return 'gal';
  if (normalized.startsWith('cl') || normalized.startsWith('centil')) return 'cl';
  return 'ml'; // Default to ml
}

/**
 * Parse quantity value that may contain a weight unit.
 * Used for meat suppliers where qty column shows actual weight (e.g., "2.43 kg", "5.5 lb").
 *
 * @param {string|number} qtyValue - Quantity value (may include unit suffix)
 * @param {string} [defaultUnit='kg'] - Default unit if not found in value
 * @returns {Object|null} { value: number, unit: string } or null if can't parse
 */
function parseQuantityAsWeight(qtyValue, defaultUnit = 'kg') {
  if (qtyValue === null || qtyValue === undefined) return null;

  // If already a number, return with default unit
  if (typeof qtyValue === 'number' && !isNaN(qtyValue)) {
    return { value: qtyValue, unit: defaultUnit };
  }

  // Convert to string
  const qtyStr = String(qtyValue).trim();
  if (!qtyStr) return null;

  // Pattern: number followed by optional weight unit
  // Examples: "2.43 kg", "5.5lb", "10 LB", "3,5 KG" (comma decimal)
  const match = qtyStr.match(/^(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs|g|oz)?$/i);
  if (match) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (isNaN(value) || value <= 0) return null;

    let unit = defaultUnit;
    if (match[2]) {
      const rawUnit = match[2].toLowerCase();
      if (rawUnit === 'kg' || rawUnit === 'kilo') unit = 'kg';
      else if (rawUnit === 'lb' || rawUnit === 'lbs') unit = 'lb';
      else if (rawUnit === 'g' || rawUnit === 'gr') unit = 'g';
      else if (rawUnit === 'oz') unit = 'oz';
    }

    return { value, unit };
  }

  // Try parsing as plain number
  const plainNum = parseFloat(qtyStr.replace(',', '.'));
  if (!isNaN(plainNum) && plainNum > 0) {
    return { value: plainNum, unit: defaultUnit };
  }

  return null;
}

/**
 * Extract weight info from invoice line item using foodSupplyUtils.
 *
 * This uses calculateLineValues() from foodSupplyUtils.js for
 * food supply format parsing and weight calculations.
 *
 * Supports all format types:
 * - "2/5LB" (pack weight: 2 bags × 5lb = 10lb per case)
 * - "4x5lb" (multiplier: 4 × 5lb = 20lb)
 * - "50lb" (simple weight)
 * - "12CT" (count only)
 * - Extracts from description: "CARROT WHOLE CELLO BAG 2/5LB"
 *
 * @param {Object} item - Invoice line item
 * @returns {Object} Weight extraction result
 */
export function extractWeightFromFormat(item) {
  // Use the centralized line calculator - handles ALL format parsing
  const calculated = calculateLineValues({
    quantity: item.quantity || 1,
    format: item.format || item.unit,
    description: item.description || item.name,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    weight: item.weight || item.totalValue,
    weightUnit: item.weightUnit || item.unit,
  });

  // Extract unit size from parsed format (e.g., "6x500ML" → unitSize=500, unitsPerCase=6)
  const parsedFormat = calculated.format;
  const unitSize = parsedFormat?.unitVolume || parsedFormat?.unitWeight || parsedFormat?.weight || parsedFormat?.volume || null;
  const unitSizeUnit = parsedFormat?.unit || null;
  const unitsPerCase = parsedFormat?.multiplier || parsedFormat?.packCount || null;

  return {
    hasEmbeddedWeight: calculated.isWeightBased,
    weightPerUnit: calculated.weightPerCase || 0,
    weightUnit: calculated.weightUnit || '',
    totalWeight: calculated.totalWeight || 0,
    totalWeightGrams: calculated.totalWeightGrams || 0,  // For totalBaseUnits
    // Additional data from calculator for downstream use
    pricePerG: calculated.pricePerG,
    pricePerLb: calculated.pricePerLb,
    formatType: calculated.formatType,
    formatFormula: calculated.formatFormula,
    display: calculated.display,
    // Unit size tracking (e.g., "6x500ML" → unitSize=500, unitSizeUnit="ml", unitsPerCase=6)
    unitSize,
    unitSizeUnit,
    unitsPerCase,
  };
}

/**
 * Calculate normalized price per gram (for solids) or per ml (for liquids).
 *
 * Uses foodSupplyUtils for format parsing.
 *
 * Example for "CARROT WHOLE CELLO BAG 2/5LB", qty: 4, unitPrice: $12.95:
 * - Parses: 2/5LB = 10lb per case × 4 cases = 40lb total
 * - Converts to grams: 40lb × 453.592 = 18,143.68g
 * - Calculate pricePerG: $51.80 / 18,143.68g = $0.00285/g
 *
 * @param {Object} item - Invoice line item with unit, quantity, unitPrice, description
 * @returns {Object} { pricePerG, pricePerML, totalBaseUnits, baseUnit }
 */
export function calculateNormalizedPrice(item) {
  const unitPrice = item.unitPrice || 0;
  const quantity = item.quantity || 1;
  const totalPrice = item.totalPrice || (unitPrice * quantity);

  if (totalPrice <= 0) {
    return { pricePerG: null, pricePerML: null, totalBaseUnits: null, baseUnit: null };
  }

  // Use foodSupplyUtils to parse format and calculate values
  const calculated = calculateLineValues({
    quantity,
    format: item.format || item.unit,
    description: item.description || item.name,
    unitPrice,
    totalPrice
  });

  // If weight-based format was found
  if (calculated.isWeightBased && calculated.totalWeightGrams && calculated.pricePerG) {
    return {
      pricePerG: Math.round(calculated.pricePerG * 1000000) / 1000000,
      pricePerML: null,
      totalBaseUnits: calculated.totalWeightGrams,
      baseUnit: 'g'
    };
  }

  // Fallback: Try to parse volume units (foodSupplyUtils doesn't handle volumes yet)
  const unitStr = (item.format || item.unit || '').toString();
  const volumeMatch = unitStr.match(/(\d+[.,]?\d*)\s*(gal|gallon|qt|quart|pt|pint|floz|fl oz|ml|l|cl)/i);

  if (volumeMatch) {
    const qty = parseFloat(volumeMatch[1].replace(',', '.'));
    const unit = volumeMatch[2].toLowerCase();
    const unitInfo = getUnitFactorForPrice(unit);

    if (unitInfo && unitInfo.isVolume) {
      const totalBaseUnits = qty * unitInfo.factor * quantity;
      const pricePerBase = totalPrice / totalBaseUnits;
      return {
        pricePerG: null,
        pricePerML: Math.round(pricePerBase * 1000000) / 1000000,
        totalBaseUnits,
        baseUnit: 'ml'
      };
    }
  }

  // Cannot calculate normalized price
  return { pricePerG: null, pricePerML: null, totalBaseUnits: null, baseUnit: null };
}

// ============================================
// CLEAN EXTRACTION PHASE (V2)
// ============================================
// These functions extract ALL fields FIRST before any validation.
// Key principles:
// 1. Try all sources in priority order
// 2. Track source and confidence for each field
// 3. Build context from extracted values
// 4. NO validation logic here - just extraction
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
      // Skip - these are handled separately
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
      rawValue = getNumericColumnValue(line, profile, priority.fromColumn);
    } else if (priority.source !== FIELD_SOURCE.EXTRACTED) {
      rawValue = line[priority.path];
    }

    const numValue = parseFloat(rawValue);
    if (!isNaN(numValue)) {
      return createExtractedField(
        numValue,
        priority.source,
        priority.path,
        priority.confidence || 100
      );
    }
  }

  return createEmptyExtractedField();
}

/**
 * Extract weight from all possible sources.
 * Tries: explicit column → format parsing → description mining
 *
 * @param {Object} line - Line object
 * @param {string} description - Product description
 * @param {number} quantity - Order quantity
 * @param {Object} [profile] - Vendor profile
 * @returns {Object} Weight extraction result with all sources tried
 */
function extractWeightFromAllSources(line, description, quantity, profile = null) {
  const qty = quantity || 1;
  const result = {
    explicit: null,      // From explicit weight column
    format: null,        // From format parsing
    description: null,   // From description mining
    billingQty: null,    // From billing quantity if unit is weight-based
    final: null,         // The chosen weight
    source: FIELD_SOURCE.DEFAULT,
    confidence: 0,
    method: null,
  };

  // Source 1: Explicit weight column
  const explicitWeight = parseFloat(line.weight);
  if (!isNaN(explicitWeight) && explicitWeight > 0) {
    result.explicit = {
      value: explicitWeight,
      unit: line.weightUnit || 'lb',
      total: explicitWeight,
      totalGrams: convertToGrams(explicitWeight, line.weightUnit || 'lb'),
    };
  }

  // Source 2: Format parsing (e.g., "2/5LB" → 10lb per case, "6x500ML" → 3000ml)
  const formatString = line.format || line.boxingFormat || line.packSize ||
                       line.size || line.pack_size || line.package_size;
  if (formatString) {
    const formatResult = parseFormat(formatString);
    // Handle APPROXIMATE_WEIGHT format (e.g., "1/~15KG") - qty IS the actual weight
    // The ~ means "approximately" - the format is informational only
    if (formatResult && formatResult.type === FORMAT_TYPE.APPROXIMATE_WEIGHT) {
      // For approximate formats, qty column contains actual weight
      // Parse qty to extract numeric value and unit
      const qtyWeight = parseQuantityAsWeight(line.quantity || qty, formatResult.unit);
      if (qtyWeight) {
        result.format = {
          raw: formatString,
          parsed: formatResult,
          weightPerUnit: qtyWeight.value, // qty IS weight per unit (informational)
          unit: qtyWeight.unit || formatResult.unit || 'kg',
          total: qtyWeight.value, // qty IS total weight
          totalGrams: convertToGrams(qtyWeight.value, qtyWeight.unit || formatResult.unit || 'kg'),
          type: FORMAT_TYPE.APPROXIMATE_WEIGHT,
          formula: `${qtyWeight.value}${qtyWeight.unit || formatResult.unit} (actual)`,
          isVolume: false,
          isApproximate: true,
          nominalWeight: formatResult.nominalWeight, // Keep for reference
          // No unit size tracking - variable weight items
          unitSize: null,
          unitSizeUnit: null,
          unitsPerCase: formatResult.packCount,
        };
      }
    }
    // Handle regular WEIGHT formats (lb, kg, g, oz) - multiply by qty
    else if (formatResult && formatResult.weightPerCase) {
      const totalWeight = formatResult.weightPerCase * qty;
      result.format = {
        raw: formatString,
        parsed: formatResult,
        weightPerUnit: formatResult.weightPerCase,
        unit: formatResult.unit || 'lb',
        total: totalWeight,
        totalGrams: convertToGrams(totalWeight, formatResult.unit || 'lb'),
        type: formatResult.type,
        formula: formatResult.formula,
        isVolume: false,
        // Unit size tracking (e.g., "2/5LB" → unitSize=5, unitsPerCase=2)
        unitSize: formatResult.unitWeight || formatResult.weight || null,
        unitSizeUnit: formatResult.unit || 'lb',
        unitsPerCase: formatResult.multiplier || formatResult.packCount || null,
      };
    }
    // Handle VOLUME formats (ml, L, gal, etc.)
    else if (formatResult && formatResult.isVolume && formatResult.volumePerCase) {
      const totalVolume = formatResult.volumePerCase * qty;
      const totalML = formatResult.totalML ? formatResult.totalML * qty : totalVolume;
      result.format = {
        raw: formatString,
        parsed: formatResult,
        weightPerUnit: formatResult.volumePerCase,  // Using weight field for volume (backwards compat)
        volumePerUnit: formatResult.volumePerCase,
        unit: formatResult.unit || 'ml',
        total: totalVolume,
        totalGrams: totalML,  // Store totalML in totalGrams for backwards compat
        totalML: totalML,
        type: formatResult.type,
        formula: formatResult.formula,
        isVolume: true,
        // Unit size tracking (e.g., "6x500ML" → unitSize=500, unitsPerCase=6)
        unitSize: formatResult.unitVolume || formatResult.volume || null,
        unitSizeUnit: formatResult.unit || 'ml',
        unitsPerCase: formatResult.multiplier || formatResult.packCount || null,
      };
    }
  }

  // Source 3: Description mining (e.g., "CHICKEN 2/5LB" → 10lb, "HUILE 500ML" → 500ml)
  if (description) {
    const descFormat = extractFormatFromDescription(description);
    // Handle weight formats from description
    if (descFormat && descFormat.weightPerCase) {
      const totalWeight = descFormat.weightPerCase * qty;
      result.description = {
        raw: description,
        parsed: descFormat,
        weightPerUnit: descFormat.weightPerCase,
        unit: descFormat.unit || 'lb',
        total: totalWeight,
        totalGrams: convertToGrams(totalWeight, descFormat.unit || 'lb'),
        type: descFormat.type,
        formula: descFormat.formula,
        isVolume: false,
      };
    }
    // Handle volume formats from description (e.g., "6x500ML", "750ML")
    else if (descFormat && descFormat.isVolume && descFormat.volumePerCase) {
      const totalVolume = descFormat.volumePerCase * qty;
      const totalML = descFormat.totalML ? descFormat.totalML * qty : totalVolume;
      result.description = {
        raw: description,
        parsed: descFormat,
        weightPerUnit: descFormat.volumePerCase,  // Using weight field for volume (backwards compat)
        volumePerUnit: descFormat.volumePerCase,
        unit: descFormat.unit || 'ml',
        total: totalVolume,
        totalGrams: totalML,  // Store totalML in totalGrams for backwards compat
        totalML: totalML,
        type: descFormat.type,
        formula: descFormat.formula,
        isVolume: true,
        unitSize: descFormat.unitVolume || descFormat.volume || null,
        unitSizeUnit: descFormat.unit || 'ml',
        unitsPerCase: descFormat.multiplier || descFormat.packCount || null,
      };
    }

    // Also try unit weight/volume extraction (e.g., "240G" or "500ML" at end of description)
    const unitWeight = extractUnitWeightFromDescription(description);
    // Handle unit weight (e.g., "CHOCOLAT 240G")
    if (unitWeight && unitWeight.weightPerCase && !unitWeight.isVolume && !result.description) {
      const totalWeight = unitWeight.weightPerCase * qty;
      result.description = {
        raw: description,
        parsed: unitWeight,
        weightPerUnit: unitWeight.weightPerCase,
        unit: unitWeight.unit || 'g',
        total: totalWeight,
        totalGrams: convertToGrams(totalWeight, unitWeight.unit || 'g'),
        type: unitWeight.type,
        formula: unitWeight.formula,
        isVolume: false,
      };
    }
    // Handle unit volume (e.g., "HUILE D'OLIVE 500ML")
    else if (unitWeight && unitWeight.isVolume && unitWeight.volumePerCase && !result.description) {
      const volumePerUnit = unitWeight.volumePerCase;
      const totalVolume = volumePerUnit * qty;
      const totalML = unitWeight.totalML ? unitWeight.totalML * qty : totalVolume;
      result.description = {
        raw: description,
        parsed: unitWeight,
        weightPerUnit: volumePerUnit,  // Using weight field for volume (backwards compat)
        volumePerUnit: volumePerUnit,
        unit: unitWeight.unit || 'ml',
        total: totalVolume,
        totalGrams: totalML,  // Store totalML in totalGrams for backwards compat
        totalML: totalML,
        type: unitWeight.type,
        formula: unitWeight.formula,
        isVolume: true,
        unitSize: volumePerUnit,
        unitSizeUnit: unitWeight.unit || 'ml',
        unitsPerCase: 1, // Single unit per case for unit volume
      };
    }
  }

  // Source 4: Billing quantity (if unit indicates weight)
  const unitValue = line.quantityUnit || line.unit || '';
  if (isWeightUnitType(unitValue)) {
    const billingQty = parseFloat(line.billingQuantity || line.quantity);
    if (!isNaN(billingQty) && billingQty > 0) {
      result.billingQty = {
        value: billingQty,
        unit: unitValue,
        total: billingQty, // qty IS the weight
        totalGrams: convertToGrams(billingQty, unitValue),
      };
    }
  }

  // Choose the best source (priority: explicit > billingQty > format > description)
  if (result.explicit) {
    result.final = result.explicit;
    result.source = FIELD_SOURCE.VISION;
    result.confidence = CONFIDENCE_SCORE.EXPLICIT_COLUMN;
    result.method = 'explicit';
  } else if (result.billingQty) {
    result.final = result.billingQty;
    result.source = FIELD_SOURCE.VISION;
    result.confidence = CONFIDENCE_SCORE.EXPLICIT_COLUMN; // High confidence, explicit in data
    result.method = 'billingQuantity';
  } else if (result.format) {
    result.final = result.format;
    result.source = FIELD_SOURCE.EXTRACTED;
    result.confidence = getFormatConfidence(result.format.type);
    result.method = 'formatParsing';
  } else if (result.description) {
    result.final = result.description;
    result.source = FIELD_SOURCE.EXTRACTED;
    result.confidence = CONFIDENCE_SCORE.DESCRIPTION_MINING;
    result.method = 'descriptionMining';
  }

  return result;
}

/**
 * PHASE 1: Extract ALL fields from a line in a single pass.
 *
 * This is the clean extraction phase that:
 * 1. Tries all sources for each field in priority order
 * 2. Tracks source and confidence for every extraction
 * 3. Builds context from extracted values
 * 4. Does NOT validate - just extracts
 *
 * @param {Object} claudeLine - Raw line from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @returns {Object} AllFieldsExtraction with all fields and context
 */
export function extractAllFields(claudeLine, profile = null) {
  // Apply column mapping first
  const line = applyFoodSupplyColumnMapping(claudeLine, profile);

  // ═══════════════════════════════════════════════════════════
  // CORE FIELDS
  // ═══════════════════════════════════════════════════════════

  const description = extractFieldByPriority(line, FIELD_PRIORITIES.DESCRIPTION, profile);
  const quantity = extractNumericFieldByPriority(line, FIELD_PRIORITIES.QUANTITY, profile);
  const unitPrice = extractNumericFieldByPriority(line, FIELD_PRIORITIES.UNIT_PRICE, profile);
  const totalPrice = extractNumericFieldByPriority(line, FIELD_PRIORITIES.TOTAL_PRICE, profile);

  // ═══════════════════════════════════════════════════════════
  // UNIT FIELDS
  // ═══════════════════════════════════════════════════════════

  const quantityUnit = extractFieldByPriority(line, FIELD_PRIORITIES.QUANTITY_UNIT, profile);
  const format = extractFieldByPriority(line, FIELD_PRIORITIES.FORMAT, profile);

  // ═══════════════════════════════════════════════════════════
  // WEIGHT EXTRACTION (tries all sources)
  // ═══════════════════════════════════════════════════════════

  const weightExtraction = extractWeightFromAllSources(
    line,
    description.value,
    quantity.value,
    profile
  );

  // Build weight field from extraction result
  const weight = weightExtraction.final
    ? {
        ...createExtractedField(
          weightExtraction.final.total,
          weightExtraction.source,
          weightExtraction.method,
          weightExtraction.confidence
        ),
        // Volume-specific fields
        isVolume: weightExtraction.final.isVolume || false,
        totalML: weightExtraction.final.totalML || 0,
        totalGrams: weightExtraction.final.totalGrams || 0,
      }
    : createEmptyExtractedField();

  // Weight unit
  const weightUnit = weightExtraction.final
    ? createExtractedField(
        weightExtraction.final.unit,
        weightExtraction.source,
        weightExtraction.method,
        weightExtraction.confidence
      )
    : extractFieldByPriority(line, FIELD_PRIORITIES.WEIGHT_UNIT, profile);

  // ═══════════════════════════════════════════════════════════
  // OPTIONAL FIELDS
  // ═══════════════════════════════════════════════════════════

  const sku = extractFieldByPriority(line, FIELD_PRIORITIES.SKU, profile);
  const category = extractFieldByPriority(line, FIELD_PRIORITIES.CATEGORY, profile);
  const pricePerWeight = extractNumericFieldByPriority(line, FIELD_PRIORITIES.PRICE_PER_WEIGHT, profile);

  // ═══════════════════════════════════════════════════════════
  // BUILD CONTEXT (derived from extracted values)
  // ═══════════════════════════════════════════════════════════

  const unitType = classifyUnit(quantityUnit.value);
  const isWeightUnit = unitType === UNIT_TYPE.WEIGHT;
  const isCountUnit = unitType === UNIT_TYPE.COUNT;
  const isContainer = unitType === UNIT_TYPE.CONTAINER;

  // Determine expected formula based on unit type
  // If unit is weight-based (KG, LB), expect weight formula
  // Otherwise, expect unit formula
  let expectedFormula = 'unit';
  if (isWeightUnit) {
    expectedFormula = 'weight';
  } else if (weight.valid && !isCountUnit) {
    // We have weight data and unit isn't explicitly count-based
    expectedFormula = 'weight';
  }

  const context = {
    unitType,
    isWeightUnit,
    isCountUnit,
    isContainerUnit: isContainer,
    expectedFormula,
    hasExplicitWeight: weightExtraction.explicit !== null,
    hasFormatWeight: weightExtraction.format !== null,
    hasDescriptionWeight: weightExtraction.description !== null,
    hasBillingQtyWeight: weightExtraction.billingQty !== null,
    weightMethod: weightExtraction.method,
  };

  // ═══════════════════════════════════════════════════════════
  // RETURN COMPLETE EXTRACTION
  // ═══════════════════════════════════════════════════════════

  return {
    // Core fields
    description,
    quantity,
    unitPrice,
    totalPrice,

    // Unit/format fields
    quantityUnit,
    format,

    // Weight fields
    weight,
    weightUnit,
    _weightExtraction: weightExtraction, // Full details for debugging

    // Optional fields
    sku,
    category,
    pricePerWeight,

    // Derived context
    context,

    // Raw data for debugging
    _raw: {
      visionJson: claudeLine,
      mappedLine: line,
    },
  };
}

// ============================================
// V2 PIPELINE FUNCTIONS
// ============================================
// These functions implement the new processing pipeline with:
// - Tracked fields (source, confidence, valid)
// - Validation gates (tier1, tier2, tier3)
// - Confidence scoring
// - Structured output (FoodSupplyProcessedLine)
// ============================================

/**
 * STEP 1: Extract core fields from Vision JSON with source tracking.
 * Creates TrackedString/TrackedNumber for each core field.
 *
 * @param {Object} line - Raw line from Vision JSON (after column mapping)
 * @param {Object} [options] - Extraction options
 * @returns {Object} Core fields with tracking
 */
export function extractCoreFields(line, options = {}) {
  // Description
  const descValue = (line.description || line.name || '').trim();
  const description = {
    value: descValue || null,
    source: line._descriptionSource || FIELD_SOURCE.VISION,
    valid: descValue.length > 0,
  };

  // Quantity
  const qtyRaw = parseFloat(line.quantity);
  const qtyValue = !isNaN(qtyRaw) ? qtyRaw : null;
  const quantity = {
    value: qtyValue,
    source: line._quantitySource || FIELD_SOURCE.VISION,
    valid: qtyValue !== null && qtyValue !== 0, // 0 is invalid unless credit
  };

  // Unit Price
  const priceRaw = parseFloat(line.unitPrice);
  const priceValue = !isNaN(priceRaw) ? priceRaw : null;
  const unitPrice = {
    value: priceValue,
    source: line._unitPriceSource || FIELD_SOURCE.VISION,
    valid: priceValue !== null,
  };

  // Total Price
  const totalRaw = parseFloat(line.totalPrice) || parseFloat(line.total);
  const totalValue = !isNaN(totalRaw) ? totalRaw : null;
  const totalPrice = {
    value: totalValue,
    source: line._totalPriceSource || FIELD_SOURCE.VISION,
    valid: totalValue !== null,
  };

  // SKU (optional)
  const skuValue = (line.sku || line.itemCode || line.productCode || '').trim() || null;
  const sku = {
    value: skuValue,
    source: FIELD_SOURCE.VISION,
    valid: skuValue !== null,
  };

  // Category (optional)
  const catValue = (line.category || '').trim() || null;
  const category = {
    value: catValue,
    source: FIELD_SOURCE.VISION,
    valid: catValue !== null,
  };

  return {
    description,
    quantity,
    unitPrice,
    totalPrice,
    sku,
    category,
  };
}

/**
 * STEP 2: Validate Tier 1 (core fields for QB billing).
 * Checks that essential fields are present and valid.
 *
 * @param {Object} coreFields - From extractCoreFields()
 * @param {Object} [options] - Validation options
 * @returns {Object} { tier1Valid, canBill, warnings }
 */
export function validateTier1(coreFields, options = {}) {
  const warnings = [];
  const { description, quantity, unitPrice, totalPrice } = coreFields;

  // Check each required field
  if (!description.valid) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.MISSING_QUANTITY, // Reuse for missing description
      WARNING_SEVERITY.ERROR,
      'Missing product description',
      { field: 'description' }
    ));
  }

  // Quantity can be 0 for credits, but must be present
  if (quantity.value === null) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.MISSING_QUANTITY,
      WARNING_SEVERITY.WARNING,
      'Missing quantity value',
      { field: 'quantity' }
    ));
  }

  // Unit price must be present (can be 0 for unavailable items)
  if (unitPrice.value === null) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.ZERO_PRICE,
      WARNING_SEVERITY.WARNING,
      'Missing unit price',
      { field: 'unitPrice' }
    ));
  }

  // Total price should be present
  if (totalPrice.value === null) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.MATH_MISMATCH,
      WARNING_SEVERITY.WARNING,
      'Missing total price',
      { field: 'totalPrice' }
    ));
  }

  // Tier 1 is valid if we have description and at least price info
  const tier1Valid = description.valid &&
                     (unitPrice.value !== null || totalPrice.value !== null);

  // Can bill if we have minimum required fields
  const canBill = tier1Valid;

  return { tier1Valid, canBill, warnings };
}

/**
 * STEP 3: Extract weight with confidence scoring.
 * Returns WeightExtraction with source and confidence tracking.
 *
 * @param {Object} line - Line with mapped columns
 * @param {Object} coreFields - From extractCoreFields()
 * @param {Object} [options] - Extraction options
 * @returns {Object} WeightExtraction
 */
export function extractWeightV2(line, coreFields, options = {}) {
  const quantity = coreFields.quantity.value || 1;
  let source = FIELD_SOURCE.DEFAULT;
  let confidence = CONFIDENCE_SCORE.NO_WEIGHT_FOUND;
  let formatResult = null;
  let formatSource = FIELD_SOURCE.DEFAULT;

  // Priority 1: Explicit weight column from Vision
  if (line.weight != null && !isNaN(parseFloat(line.weight)) && parseFloat(line.weight) > 0) {
    const weightValue = parseFloat(line.weight);
    const weightUnit = normalizeWeightUnitV2(line.weightUnit || 'lb');
    const totalGrams = convertToGrams(weightValue, weightUnit);

    return {
      perUnit: weightValue / quantity,
      total: weightValue,
      totalGrams,
      unit: weightUnit,
      source: FIELD_SOURCE.VISION,
      confidence: CONFIDENCE_SCORE.EXPLICIT_COLUMN,
      valid: true,
      _format: null,
    };
  }

  // Priority 2: Parse format field (check multiple possible field names from Vision AI)
  // Also check _raw for fields the normalizer might not have mapped
  const raw = line._raw || {};

  const formatString = line.format || line.boxingFormat || line.unit ||
                       line.size || line.pack_size || line.package_size ||
                       line.packaging || line.container_size || line.unit_size ||
                       // Check raw Vision output for additional field names
                       raw.format || raw.size || raw.pack_size || raw.package_size ||
                       raw.packaging || raw.container_size || raw.unit_size ||
                       raw.pack || raw.Format || raw.Size || raw.Package;

  if (formatString) {
    formatResult = parseFormat(formatString);
    formatSource = line._formatSource || FIELD_SOURCE.VISION;

    if (formatResult && formatResult.type !== FORMAT_TYPE.UNKNOWN) {
      source = FIELD_SOURCE.EXTRACTED;
      confidence = getFormatConfidence(formatResult.type);
    }
  }

  // ALWAYS mine description for weight info (valuable data, don't skip)
  // This runs regardless of format parsing results
  const descFormat = extractFormatFromDescription(coreFields.description.value);
  const descUnitWeight = extractUnitWeightFromDescription(coreFields.description.value);

  // Store description-mined weight/volume for reference/validation
  // Check both weightPerCase (solids) and volumePerCase (liquids)
  const descriptionWeight = descFormat?.weightPerCase != null ? descFormat :
                           descFormat?.volumePerCase != null ? descFormat :
                           descUnitWeight?.weightPerCase != null ? descUnitWeight :
                           descUnitWeight?.volumePerCase != null ? descUnitWeight : null;

  // Priority 3: Use description-mined weight/volume if format parsing found nothing usable
  const formatHasNoWeight = !formatResult || formatResult.type === FORMAT_TYPE.UNKNOWN ||
                           (formatResult.weightPerCase == null && formatResult.volumePerCase == null);
  if (formatHasNoWeight && descriptionWeight) {
    formatResult = descriptionWeight;
    formatSource = FIELD_SOURCE.EXTRACTED;
    source = FIELD_SOURCE.EXTRACTED;
    confidence = CONFIDENCE_SCORE.DESCRIPTION_MINING; // 70%
  }

  // Check if format is volume-based (liquids: vinegar, oil, etc.)
  if (formatResult && formatResult.isVolume && formatResult.volumePerCase != null) {
    const volumePerUnit = formatResult.volumePerCase;
    const totalVolume = volumePerUnit * quantity;
    const volumeUnit = formatResult.unit || 'ml';
    const totalML = formatResult.totalML ? formatResult.totalML * quantity : totalVolume;

    // Round to avoid floating point precision issues
    const roundedTotal = Math.round(totalVolume * 10000) / 10000;
    const roundedPerUnit = Math.round((totalVolume / quantity) * 10000) / 10000;
    const roundedML = Math.round(totalML * 100) / 100;

    return {
      perUnit: roundedPerUnit,
      total: roundedTotal,
      totalGrams: roundedML,  // Use totalGrams field for totalML (backwards compat)
      totalML: roundedML,     // Also set explicit totalML
      unit: volumeUnit,
      source,
      confidence: CONFIDENCE_SCORE.PACK_WEIGHT_PATTERN, // 95% for clear volume patterns
      valid: true,
      isVolume: true,  // Flag for volume-based pricing
      _format: {
        raw: formatResult.raw,
        parsed: formatResult,
        source: formatSource,
        confidence: CONFIDENCE_SCORE.PACK_WEIGHT_PATTERN,
        valid: true,
      },
      _descriptionWeight: descriptionWeight ? {
        raw: descriptionWeight.raw,
        type: descriptionWeight.type,
        weightPerUnit: descriptionWeight.volumePerCase || descriptionWeight.weightPerCase,
        unit: descriptionWeight.unit,
        formula: descriptionWeight.formula,
      } : null,
    };
  }

  // Calculate weight if format found
  if (formatResult && formatResult.weightPerCase != null) {
    let weightPerUnit = formatResult.weightPerCase;
    let totalWeight;
    const weightUnit = formatResult.unit || 'lb';

    // Special case: Bare unit format (e.g., "KG") - quantity IS the weight
    if (formatResult.qtyIsWeight) {
      // Format is just "KG" or "LB" - the quantity column contains the weight
      totalWeight = quantity; // qty is already the weight
      weightPerUnit = quantity; // Each "unit" is the full weight
      confidence = CONFIDENCE_SCORE.SIMPLE_WEIGHT_PATTERN; // 85%
    }
    // Special case: Unit weight (e.g., "240G" in description) - weight per unit × qty
    else if (formatResult.isUnitWeight) {
      // weightPerCase is actually weight per unit
      totalWeight = weightPerUnit * quantity; // 240g × 12 = 2880g
    }
    // Standard case: weight per case × qty
    else {
      totalWeight = weightPerUnit * quantity;
    }

    const totalGrams = convertToGrams(totalWeight, weightUnit);

    // Round to avoid floating point precision issues (0.8999999 → 0.9)
    const roundedTotal = Math.round(totalWeight * 10000) / 10000;
    const roundedPerUnit = formatResult.isUnitWeight ? weightPerUnit : Math.round((totalWeight / quantity) * 10000) / 10000;
    const roundedGrams = Math.round(totalGrams * 100) / 100;

    return {
      perUnit: roundedPerUnit,
      total: roundedTotal,
      totalGrams: roundedGrams,
      unit: weightUnit,
      source,
      confidence,
      valid: true,
      isVolume: false,  // Explicitly not volume
      _format: {
        raw: formatResult.raw,
        parsed: formatResult,
        source: formatSource,
        confidence,
        valid: true,
      },
      // Always include description-mined weight for reference/validation
      _descriptionWeight: descriptionWeight ? {
        raw: descriptionWeight.raw,
        type: descriptionWeight.type,
        weightPerUnit: descriptionWeight.weightPerCase,
        unit: descriptionWeight.unit,
        formula: descriptionWeight.formula,
      } : null,
    };
  }

  // Last resort: Direct volume pattern check on description
  // This catches "500ML", "1L", etc. when other methods fail
  const descriptionValue = coreFields.description?.value || '';
  const directVolumeMatch = descriptionValue.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|l|cl|dl|litre|liter)\b/i);
  if (directVolumeMatch) {
    const volumeValue = parseFloat(directVolumeMatch[1].replace(',', '.'));
    const volumeUnit = directVolumeMatch[2].toLowerCase();
    // Convert to ml
    let totalML = volumeValue;
    if (volumeUnit === 'l' || volumeUnit === 'litre' || volumeUnit === 'liter') totalML = volumeValue * 1000;
    else if (volumeUnit === 'cl') totalML = volumeValue * 10;
    else if (volumeUnit === 'dl') totalML = volumeValue * 100;

    return {
      perUnit: volumeValue,
      total: volumeValue * quantity,
      totalGrams: totalML * quantity, // For backwards compat
      totalML: totalML * quantity,
      unit: volumeUnit === 'l' || volumeUnit === 'litre' || volumeUnit === 'liter' ? 'L' : 'ml',
      source: FIELD_SOURCE.EXTRACTED,
      confidence: CONFIDENCE_SCORE.DESCRIPTION_MINING,
      valid: true,
      isVolume: true,
      _format: {
        raw: `${volumeValue}${volumeUnit}`,
        source: FIELD_SOURCE.EXTRACTED,
        confidence: CONFIDENCE_SCORE.DESCRIPTION_MINING,
        valid: true,
      },
    };
  }

  // No weight found
  return {
    perUnit: null,
    total: null,
    totalGrams: null,
    unit: null,
    source: FIELD_SOURCE.DEFAULT,
    confidence: CONFIDENCE_SCORE.NO_WEIGHT_FOUND,
    valid: false,
    _format: formatResult ? {
      raw: formatResult.raw,
      parsed: formatResult,
      source: formatSource,
      confidence: CONFIDENCE_SCORE.NO_WEIGHT_FOUND,
      valid: false,
    } : null,
    // Include description-mined weight even if we couldn't use it
    _descriptionWeight: descriptionWeight ? {
      raw: descriptionWeight.raw,
      type: descriptionWeight.type,
      weightPerUnit: descriptionWeight.weightPerCase,
      unit: descriptionWeight.unit,
      formula: descriptionWeight.formula,
    } : null,
  };
}

/**
 * Get confidence score for format type
 * @param {string} formatType - FORMAT_TYPE constant
 * @returns {number} Confidence score 0-100
 */
function getFormatConfidence(formatType) {
  switch (formatType) {
    case FORMAT_TYPE.PACK_WEIGHT:       return CONFIDENCE_SCORE.PACK_WEIGHT_PATTERN;   // 95
    case FORMAT_TYPE.MULTIPLIER:        return CONFIDENCE_SCORE.MULTIPLIER_PATTERN;    // 90
    case FORMAT_TYPE.SIMPLE_WEIGHT:     return CONFIDENCE_SCORE.SIMPLE_WEIGHT_PATTERN; // 85
    case FORMAT_TYPE.PIECE_WEIGHT:      return CONFIDENCE_SCORE.SIMPLE_WEIGHT_PATTERN; // 85
    case FORMAT_TYPE.WEIGHT_RANGE:      return CONFIDENCE_SCORE.AMBIGUOUS_PATTERN;     // 50 (uses avg)
    case FORMAT_TYPE.BARE_UNIT:         return CONFIDENCE_SCORE.SIMPLE_WEIGHT_PATTERN; // 85
    case FORMAT_TYPE.UNIT_WEIGHT:       return CONFIDENCE_SCORE.DESCRIPTION_MINING;    // 70
    case FORMAT_TYPE.APPROXIMATE_WEIGHT: return CONFIDENCE_SCORE.EXPLICIT_COLUMN;      // 100 (qty IS weight)
    case FORMAT_TYPE.COUNT_PACK:        return CONFIDENCE_SCORE.NO_WEIGHT_FOUND;       // 0
    case FORMAT_TYPE.UNKNOWN:           return CONFIDENCE_SCORE.NO_WEIGHT_FOUND;       // 0
    default:                            return CONFIDENCE_SCORE.AMBIGUOUS_PATTERN;     // 50
  }
}

/**
 * Normalize weight unit to standard form (V2)
 * @param {string} unit - Raw unit string
 * @returns {string} Normalized unit
 */
function normalizeWeightUnitV2(unit) {
  if (!unit) return 'lb';
  const lower = unit.toLowerCase().trim();
  return NORMALIZED_WEIGHT_UNIT[lower] || 'lb';
}

/**
 * Convert weight to grams
 * @param {number} weight - Weight value
 * @param {string} unit - Weight unit
 * @returns {number} Weight in grams
 */
function convertToGrams(weight, unit) {
  if (!weight || weight <= 0) return 0;
  const factor = WEIGHT_TO_GRAMS[unit] || WEIGHT_TO_GRAMS[normalizeWeightUnitV2(unit)] || 453.592;
  return weight * factor;
}

/**
 * Convert volume to milliliters
 * @param {number} volume - Volume value
 * @param {string} unit - Volume unit
 * @returns {number} Volume in milliliters
 */
function convertToML(volume, unit) {
  if (!volume || volume <= 0) return 0;
  const factor = VOLUME_TO_ML[unit] || VOLUME_TO_ML[normalizeVolumeUnit(unit)] || 1;
  return volume * factor;
}

/**
 * Convert to base units (grams for weight, ml for volume, count for units)
 * This is the main conversion function that handles all unit types.
 *
 * @param {number} value - The value to convert
 * @param {string} unit - The unit (kg, lb, ml, l, ea, etc.)
 * @returns {{ value: number, baseUnit: string, unitType: string }}
 */
function convertToBaseUnits(value, unit) {
  if (!value || value <= 0) {
    return { value: 0, baseUnit: 'ea', unitType: UNIT_TYPE.COUNT };
  }

  const unitType = classifyUnit(unit);

  switch (unitType) {
    case UNIT_TYPE.WEIGHT:
      return {
        value: convertToGrams(value, unit),
        baseUnit: 'g',
        unitType: UNIT_TYPE.WEIGHT,
      };

    case UNIT_TYPE.VOLUME:
      return {
        value: convertToML(value, unit),
        baseUnit: 'ml',
        unitType: UNIT_TYPE.VOLUME,
      };

    case UNIT_TYPE.COUNT:
    case UNIT_TYPE.CONTAINER:
    default:
      // For count/container units, value stays the same
      return {
        value: value,
        baseUnit: 'ea',
        unitType: unitType || UNIT_TYPE.COUNT,
      };
  }
}

/**
 * STEP 4: Validate math (qty × price = total) with confidence scoring.
 * Tests both weight-based and unit-based formulas.
 *
 * @param {Object} coreFields - From extractCoreFields()
 * @param {Object} weight - From extractWeightV2()
 * @param {Object} [options] - Validation options
 * @returns {Object} MathValidation
 */
export function validateMathV2(coreFields, weight, options = {}) {
  const tolerance = options.tolerance || DEFAULT_MATH_TOLERANCE;
  const quantity = coreFields.quantity.value || 0;
  const unitPrice = coreFields.unitPrice.value || 0;
  const totalPrice = coreFields.totalPrice.value || 0;

  // Get invoice unit field to determine pricing type
  const invoiceUnit = (options.invoiceUnit || '').toString().toLowerCase();
  const isWeightUnit = ['kg', 'g', 'lb', 'lbs', 'oz'].includes(invoiceUnit);
  const isCountUnit = ['un', 'ea', 'each', 'pc', 'pcs', 'piece', 'pieces', 'unit'].includes(invoiceUnit);

  // Check for explicit weight-based pricing flag from normalizer
  const isWeightBasedPricing = options.isWeightBasedPricing === true;

  // Can't validate without total
  if (totalPrice === 0 && unitPrice === 0) {
    return {
      formula: 'none',
      expected: null,
      actual: totalPrice,
      difference: 0,
      valid: true, // No math to validate
      tolerance,
      confidence: CONFIDENCE_SCORE.MATH_EXACT,
    };
  }

  // Test weight-based formula: weight × unitPrice = total
  // Use weight.total when:
  // 1. isWeightBasedPricing flag is set (normalizer detected weight in quantity field)
  // 2. OR weight was extracted and invoice unit is weight-based
  // 3. OR weight was extracted and it's not a count unit
  let weightBasedTotal = null;
  let weightBasedDiff = Infinity;
  if (isWeightBasedPricing && weight.valid && weight.total > 0) {
    // Priority 1: Explicit weight-based pricing from normalizer
    // Use extracted weight, NOT quantity (quantity may be 1 as a placeholder)
    weightBasedTotal = Math.round(weight.total * unitPrice * 100) / 100;
    weightBasedDiff = Math.abs(weightBasedTotal - totalPrice);
  } else if (isWeightUnit && weight.valid && weight.total > 0) {
    // Priority 2: Invoice unit is weight-based AND we have extracted weight
    weightBasedTotal = Math.round(weight.total * unitPrice * 100) / 100;
    weightBasedDiff = Math.abs(weightBasedTotal - totalPrice);
  } else if (isWeightUnit && quantity > 0 && !weight.valid) {
    // Priority 3: Invoice unit is weight-based but no extracted weight - use quantity as weight
    weightBasedTotal = Math.round(quantity * unitPrice * 100) / 100;
    weightBasedDiff = Math.abs(weightBasedTotal - totalPrice);
  } else if (weight.valid && weight.total > 0 && !isCountUnit) {
    // Priority 4: Extracted weight available and not a count unit
    weightBasedTotal = Math.round(weight.total * unitPrice * 100) / 100;
    weightBasedDiff = Math.abs(weightBasedTotal - totalPrice);
  }

  // Test unit-based formula: quantity × unitPrice = total
  let unitBasedTotal = null;
  let unitBasedDiff = Infinity;
  if (quantity > 0) {
    unitBasedTotal = Math.round(quantity * unitPrice * 100) / 100;
    unitBasedDiff = Math.abs(unitBasedTotal - totalPrice);
  }

  // Determine which formula matches
  const weightMatches = weightBasedDiff <= tolerance;
  const unitMatches = unitBasedDiff <= tolerance;

  let formula, expected, difference;

  // Priority 0: If normalizer explicitly flagged this as weight-based pricing, use weight formula
  if (isWeightBasedPricing && weightMatches) {
    formula = 'weight';
    expected = weightBasedTotal;
    difference = weightBasedDiff;
  }
  // Priority 1: If invoice explicitly uses count units (UN, EA), prefer unit-based
  else if (isCountUnit && unitMatches) {
    formula = 'unit';
    expected = unitBasedTotal;
    difference = unitBasedDiff;
  }
  // Priority 2: If invoice explicitly uses weight units (KG, LB), prefer weight-based
  else if (isWeightUnit && weightMatches) {
    formula = 'weight';
    expected = weightBasedTotal;
    difference = weightBasedDiff;
  }
  // Priority 3: Otherwise pick the formula that matches
  else if (unitMatches) {
    formula = 'unit';
    expected = unitBasedTotal;
    difference = unitBasedDiff;
  } else if (weightMatches && weight.valid) {
    formula = 'weight';
    expected = weightBasedTotal;
    difference = weightBasedDiff;
  } else {
    // Neither matches - use the closer one
    // If isWeightBasedPricing, prefer weight even if it doesn't match exactly
    if (isWeightBasedPricing && weightBasedTotal !== null) {
      formula = 'weight';
      expected = weightBasedTotal;
      difference = weightBasedDiff;
    } else if (weightBasedDiff < unitBasedDiff && weight.valid && !isCountUnit) {
      formula = 'weight';
      expected = weightBasedTotal;
      difference = weightBasedDiff;
    } else {
      formula = 'unit';
      expected = unitBasedTotal;
      difference = unitBasedDiff;
    }
  }

  const valid = difference <= tolerance;
  const confidence = getMathConfidence(difference);

  return {
    formula,
    expected,
    actual: totalPrice,
    difference,
    valid,
    tolerance,
    confidence,
    invoiceUnit,
    _weightBased: { total: weightBasedTotal, diff: weightBasedDiff, matches: weightMatches },
    _unitBased: { total: unitBasedTotal, diff: unitBasedDiff, matches: unitMatches },
  };
}

/**
 * Get confidence score for math validation
 * @param {number} difference - Absolute difference
 * @returns {number} Confidence score 0-100
 */
function getMathConfidence(difference) {
  if (difference === 0) return CONFIDENCE_SCORE.MATH_EXACT;                    // 100
  if (difference <= MATH_TOLERANCE_THRESHOLDS.ROUNDING) return CONFIDENCE_SCORE.MATH_ROUNDING;  // 95
  if (difference <= MATH_TOLERANCE_THRESHOLDS.ACCEPTABLE) return CONFIDENCE_SCORE.MATH_TOLERANCE; // 90
  if (difference <= MATH_TOLERANCE_THRESHOLDS.MINOR) return CONFIDENCE_SCORE.MATH_MINOR;       // 70
  if (difference <= MATH_TOLERANCE_THRESHOLDS.REVIEW) return CONFIDENCE_SCORE.MATH_REVIEW;     // 50
  return CONFIDENCE_SCORE.MATH_ERROR;                                          // 0
}

/**
 * STEP 5: Determine pricing type based on weight extraction and math validation.
 *
 * KEY INSIGHT: For food supply invoices, we want to calculate pricePerG whenever
 * we have valid weight extraction, even if the invoice is priced per case.
 *
 * The pricing type determines:
 * - WEIGHT: Calculate pricePerG from totalPrice / totalWeightGrams
 * - VOLUME: Calculate pricePerML from totalPrice / totalML
 * - UNIT: Calculate pricePerUnit from totalPrice / quantity (no pricePerG)
 *
 * @param {Object} weight - From extractWeightV2()
 * @param {Object} math - From validateMathV2()
 * @param {Object} line - Original line (for U/M hints)
 * @returns {string} PRICING_TYPE value
 */
export function determinePricingType(weight, math, line = {}) {
  // Priority 0: Volume-based pricing from weight extraction
  if (weight.valid && weight.isVolume) {
    return PRICING_TYPE.VOLUME;
  }

  // Priority 0b: Check for volume pattern in description (e.g., "500ML", "1L", "750ml")
  const description = (line.description || line.name || '').toString();
  const volumePattern = /\b(\d+(?:[.,]\d+)?)\s*(ml|l|cl|dl|litre|liter|gal|gallon|fl\.?\s*oz)\b/i;
  if (volumePattern.test(description)) {
    return PRICING_TYPE.VOLUME;
  }

  // Priority 1: Explicit weight-based pricing flag from column mapping
  // This means the invoice literally uses weight × price = total
  if (line.isWeightBasedPricing === true) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 2: If we have valid weight extraction with good confidence,
  // we want to calculate pricePerG for recipe costing, regardless of
  // how the invoice calculates the total.
  // (e.g., price per case but we still want $/gram for recipes)
  if (weight.valid && weight.confidence >= CONFIDENCE_THRESHOLD.MEDIUM) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 3: If weight-based math formula matched exactly
  if (math.formula === 'weight' && math.valid && weight.valid) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 4: If we have any valid weight, even low confidence, prefer weight
  if (weight.valid && weight.total > 0) {
    return PRICING_TYPE.WEIGHT;
  }

  // Default: unit-based (no weight available)
  return PRICING_TYPE.UNIT;
}

/**
 * STEP 6: Validate Tier 2 (weight extraction for weight-based pricing).
 *
 * @param {Object} weight - From extractWeightV2()
 * @param {string} pricingType - From determinePricingType()
 * @param {Object} coreFields - From extractCoreFields()
 * @returns {Object} { tier2Valid, warnings }
 */
export function validateTier2(weight, pricingType, coreFields) {
  const warnings = [];

  // For unit-based pricing, weight is optional - tier2 always valid
  if (pricingType === PRICING_TYPE.UNIT) {
    // Add info warning that we're using unit-based
    if (!weight.valid) {
      warnings.push(createWarning(
        FOOD_SUPPLY_WARNING.UNIT_BASED_PRICING,
        WARNING_SEVERITY.INFO,
        'No weight found, using unit-based pricing',
        { field: 'weight' }
      ));
    }
    return { tier2Valid: true, warnings };
  }

  // For volume-based pricing, we need valid volume extraction
  if (pricingType === PRICING_TYPE.VOLUME) {
    if (!weight.valid || !weight.isVolume) {
      warnings.push(createWarning(
        FOOD_SUPPLY_WARNING.FORMAT_UNKNOWN,
        WARNING_SEVERITY.WARNING,
        'Volume-based pricing detected but volume extraction failed',
        { field: 'volume', confidence: weight.confidence }
      ));
      return { tier2Valid: false, warnings };
    }
    // Volume extraction succeeded
    return { tier2Valid: true, warnings };
  }

  // For weight-based pricing, we need valid weight
  if (!weight.valid) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.FORMAT_UNKNOWN,
      WARNING_SEVERITY.WARNING,
      'Weight-based pricing detected but weight extraction failed',
      { field: 'weight', confidence: weight.confidence }
    ));
    return { tier2Valid: false, warnings };
  }

  // Check weight confidence
  if (weight.confidence < CONFIDENCE_THRESHOLD.MEDIUM) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.LOW_CONFIDENCE,
      WARNING_SEVERITY.WARNING,
      `Low confidence weight extraction: ${weight.confidence}%`,
      { field: 'weight', confidence: weight.confidence }
    ));
  }

  // Check if weight was from description mining
  if (weight.source === FIELD_SOURCE.EXTRACTED && weight._format?.source === FIELD_SOURCE.EXTRACTED) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.WEIGHT_FROM_DESCRIPTION,
      WARNING_SEVERITY.INFO,
      'Weight extracted from description text',
      { field: 'weight', source: weight.source }
    ));
  }

  return { tier2Valid: weight.valid, warnings };
}

/**
 * STEP 7: Calculate pricing (pricePerG, pricePerML, or pricePerUnit).
 *
 * @param {Object} coreFields - From extractCoreFields()
 * @param {Object} weight - From extractWeightV2()
 * @param {string} pricingType - From determinePricingType()
 * @returns {Object} PricingCalculation
 */
export function calculatePricingV2(coreFields, weight, pricingType) {
  const totalPrice = coreFields.totalPrice.value || 0;
  const quantity = coreFields.quantity.value || 1;

  if (totalPrice <= 0) {
    return {
      type: pricingType,
      pricePerG: null,
      pricePerLb: null,
      pricePerKg: null,
      pricePerML: null,
      pricePerL: null,
      pricePerUnit: null,
      isVolume: false,
      source: FIELD_SOURCE.CALCULATED,
      valid: false,
    };
  }

  // Check if unit is volume-based (ml, L, etc.)
  const unitIsVolume = weight.unit && isVolumeUnit(weight.unit);

  // Volume-based pricing (liquids: vinegar, oil, sauces)
  if (pricingType === PRICING_TYPE.VOLUME && weight.valid && weight.totalML > 0) {
    const totalML = weight.totalML;
    const pricePerML = totalPrice / totalML;
    return {
      type: PRICING_TYPE.VOLUME,
      pricePerG: null,
      pricePerLb: null,
      pricePerKg: null,
      pricePerML: Math.round(pricePerML * 1000000) / 1000000, // 6 decimal places
      pricePerL: Math.round(pricePerML * 1000 * 1000000) / 1000000,
      pricePerUnit: null,
      isVolume: true,
      totalML,
      source: FIELD_SOURCE.CALCULATED,
      valid: true,
    };
  }

  // Weight/Volume-based pricing
  if (pricingType === PRICING_TYPE.WEIGHT && weight.valid && weight.totalGrams > 0) {
    // For volume units, calculate pricePerML/pricePerL instead of pricePerG/pricePerKg
    if (unitIsVolume || weight.isVolume) {
      const totalML = weight.totalML || weight.totalGrams; // totalGrams may hold ml for volume units
      const pricePerML = totalPrice / totalML;
      return {
        type: PRICING_TYPE.VOLUME,
        pricePerG: null,
        pricePerLb: null,
        pricePerKg: null,
        pricePerML: Math.round(pricePerML * 1000000) / 1000000, // 6 decimal places
        pricePerL: Math.round(pricePerML * 1000 * 1000000) / 1000000,
        pricePerUnit: null,
        isVolume: true,
        totalML,
        source: FIELD_SOURCE.CALCULATED,
        valid: true,
      };
    }

    // Weight-based pricing (g, kg, lb, oz)
    const pricePerG = totalPrice / weight.totalGrams;
    return {
      type: PRICING_TYPE.WEIGHT,
      pricePerG: Math.round(pricePerG * 1000000) / 1000000, // 6 decimal places
      pricePerLb: Math.round(pricePerG * 453.592 * 1000000) / 1000000,
      pricePerKg: Math.round(pricePerG * 1000 * 1000000) / 1000000,
      pricePerML: null,
      pricePerL: null,
      pricePerUnit: null,
      isVolume: false,
      source: FIELD_SOURCE.CALCULATED,
      valid: true,
    };
  }

  // Unit-based pricing
  if (quantity > 0) {
    const pricePerUnit = totalPrice / quantity;
    return {
      type: PRICING_TYPE.UNIT,
      pricePerG: null,
      pricePerLb: null,
      pricePerKg: null,
      pricePerML: null,
      pricePerL: null,
      pricePerUnit: Math.round(pricePerUnit * 100) / 100, // 2 decimal places
      isVolume: false,
      source: FIELD_SOURCE.CALCULATED,
      valid: true,
    };
  }

  return {
    type: PRICING_TYPE.UNKNOWN,
    pricePerG: null,
    pricePerLb: null,
    pricePerKg: null,
    pricePerML: null,
    pricePerL: null,
    pricePerUnit: null,
    isVolume: false,
    source: FIELD_SOURCE.CALCULATED,
    valid: false,
  };
}

/**
 * STEP 8: Validate Tier 3 (pricing calculation).
 *
 * @param {Object} pricing - From calculatePricingV2()
 * @returns {Object} { tier3Valid, warnings }
 */
export function validateTier3(pricing) {
  const warnings = [];

  if (!pricing.valid) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.NO_PRICE_PER_GRAM,
      WARNING_SEVERITY.WARNING,
      'Could not calculate normalized pricing',
      { field: 'pricing', type: pricing.type }
    ));
    return { tier3Valid: false, warnings };
  }

  // Check that we have at least one pricing value (weight, volume, or unit)
  const hasPricing = pricing.pricePerG != null || pricing.pricePerML != null || pricing.pricePerUnit != null;
  if (!hasPricing) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.NO_PRICE_PER_GRAM,
      WARNING_SEVERITY.WARNING,
      'No pricing value calculated',
      { field: 'pricing' }
    ));
  }

  return { tier3Valid: hasPricing, warnings };
}

/**
 * STEP 9: Build validation summary with overall confidence.
 *
 * @param {Object} params - All validation results
 * @returns {Object} ValidationSummary
 */
export function buildValidationSummary({
  tier1Result,
  tier2Result,
  tier3Result,
  math,
  weight,
  pricing,
  coreFields,
}) {
  // Collect all warnings
  const warnings = [
    ...tier1Result.warnings,
    ...tier2Result.warnings,
    ...tier3Result.warnings,
  ];

  // Add math warnings
  if (!math.valid) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.MATH_MISMATCH,
      WARNING_SEVERITY.WARNING,
      `Math mismatch: expected $${math.expected?.toFixed(2)}, got $${math.actual?.toFixed(2)} (diff: $${math.difference?.toFixed(2)})`,
      { field: 'math', expected: math.expected, actual: math.actual, difference: math.difference }
    ));
  } else if (math.difference > MATH_TOLERANCE_THRESHOLDS.ROUNDING) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.MATH_DISCREPANCY,
      WARNING_SEVERITY.INFO,
      `Minor math discrepancy: $${math.difference?.toFixed(2)}`,
      { field: 'math', difference: math.difference }
    ));
  }

  // Add zero price warning
  if (coreFields.unitPrice.value === 0 && coreFields.quantity.value > 0) {
    warnings.push(createWarning(
      FOOD_SUPPLY_WARNING.ZERO_PRICE,
      WARNING_SEVERITY.INFO,
      'Zero price - item may be unavailable',
      { field: 'unitPrice' }
    ));
  }

  // Split warnings by severity
  const errors = warnings.filter(w => w.severity === WARNING_SEVERITY.ERROR);
  const warningsList = warnings.filter(w => w.severity === WARNING_SEVERITY.WARNING);

  // Calculate overall confidence
  const confidences = [math.confidence];
  if (weight.valid) confidences.push(weight.confidence);
  const overallConfidence = Math.min(...confidences);

  // Determine processing flags
  const tier1Valid = tier1Result.tier1Valid;
  const tier2Valid = tier2Result.tier2Valid;
  const tier3Valid = tier3Result.tier3Valid;

  // canProcess requires all tiers valid
  // BUT we allow processing with warnings (user's decision #1)
  const canProcess = tier1Valid && tier2Valid && tier3Valid;

  // canBill only requires tier1
  const canBill = tier1Result.canBill;

  return {
    tier1Valid,
    tier2Valid,
    tier3Valid,
    canProcess,
    canBill,
    overallConfidence,
    confidenceLevel: getConfidenceLevel(overallConfidence),
    warnings,
    errors,
    warningCount: warningsList.length,
    errorCount: errors.length,
  };
}

/**
 * Apply food supply specific column mapping to a line item.
 * Module-level function for use by V2 pipeline.
 *
 * Handles:
 * - packageFormat column → line.format (e.g., "2/5LB", "Sac 50lb")
 * - quantityUnit (U/M) column → determines if billingQty is weight or count
 * - billingQuantity column → line.billingQuantity or line.weight
 * - default weightUnit from profile
 *
 * @param {Object} line - Raw line item from Claude parsing
 * @param {Object} profile - Vendor parsing profile
 * @returns {Object} Line with mapped column values
 */
export function applyFoodSupplyColumnMapping(line, profile) {
  if (!profile) return line;

  const mapped = { ...line };

  // Map boxing format column → line.format (e.g., 1/25LB, 2/5KG)
  const formatValue = getColumnValue(line, profile, 'boxingFormat') ||
                      getColumnValue(line, profile, 'packageFormat') ||
                      getColumnValue(line, profile, 'packageUnits');
  if (formatValue) {
    mapped.format = formatValue;
    mapped.boxingFormat = formatValue;
  }

  // Map U/M column → line.quantityUnit
  const unitValue = getColumnValue(line, profile, 'quantityUnit');
  if (unitValue) {
    mapped.quantityUnit = unitValue;
    mapped.unit = unitValue; // Also set unit field for extractWeightV2

    // Check if U/M indicates weight-based billing
    const unitLower = unitValue.toLowerCase().trim();
    const billingQty = getNumericColumnValue(line, profile, 'billingQuantity') ||
                       line.billingQuantity ||
                       line.quantity;

    if (billingQty != null) {
      // Weight units: U/M tells us billingQty IS the weight
      if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(unitLower)) {
        mapped.weight = billingQty;
        mapped.weightUnit = 'kg';
        mapped.isWeightBasedPricing = true;
      } else if (['lb', 'lbs', 'pound', 'pounds', 'livre', 'livres'].includes(unitLower)) {
        mapped.weight = billingQty;
        mapped.weightUnit = 'lb';
        mapped.isWeightBasedPricing = true;
      } else if (['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'].includes(unitLower)) {
        mapped.weight = billingQty;
        mapped.weightUnit = 'g';
        mapped.isWeightBasedPricing = true;
      } else if (['oz', 'ounce', 'ounces', 'once', 'onces'].includes(unitLower)) {
        mapped.weight = billingQty;
        mapped.weightUnit = 'oz';
        mapped.isWeightBasedPricing = true;
      } else if (['l', 'lt', 'litre', 'litres', 'liter', 'liters'].includes(unitLower)) {
        mapped.volume = billingQty;
        mapped.volumeUnit = 'L';
        mapped.isWeightBasedPricing = true;
      } else if (['ml', 'millilitre', 'millilitres'].includes(unitLower)) {
        mapped.volume = billingQty;
        mapped.volumeUnit = 'ml';
        mapped.isWeightBasedPricing = true;
      }
    }
  }

  // Map billing quantity column (if not already handled by U/M logic)
  if (!mapped.billingQuantity) {
    const billingQty = getNumericColumnValue(line, profile, 'billingQuantity');
    if (billingQty != null) {
      mapped.billingQuantity = billingQty;
    }
  }

  // Apply default weight unit from profile (if line has weight but no unit)
  if (profile.weightUnit && mapped.weight != null && !mapped.weightUnit) {
    mapped.weightUnit = profile.weightUnit;
  }

  return mapped;
}

/**
 * Calculate weighted confidence score.
 * Uses weighted average instead of MIN for fairer scoring.
 *
 * Weights:
 * - Math validation: 50% (most important)
 * - Weight extraction: 30% (important for pricing)
 * - Core extraction: 20% (usually reliable)
 *
 * @param {Object} params - Confidence inputs
 * @returns {number} Weighted confidence (0-100)
 */
function calculateWeightedConfidence({ math, weight, pricingType, coreFieldsValid }) {
  const weights = {
    math: 0.50,
    weight: 0.30,
    extraction: 0.20,
  };

  let score = 0;

  // Math confidence (50%)
  score += (math?.confidence || 0) * weights.math;

  // Weight confidence (30%)
  // If unit-based pricing, weight is optional - give full points
  if (pricingType === PRICING_TYPE.UNIT) {
    score += 100 * weights.weight;
  } else {
    score += (weight?.confidence || 0) * weights.weight;
  }

  // Core extraction confidence (20%)
  // Full points if core fields are valid
  score += (coreFieldsValid ? 100 : 50) * weights.extraction;

  return Math.round(score);
}

/**
 * Determine pricing type EARLY based on context.
 * This runs BEFORE math validation to inform the expected formula.
 *
 * @param {Object} context - Extraction context
 * @param {Object} weight - Weight extraction result
 * @param {Object} line - Mapped line data
 * @returns {string} PRICING_TYPE.WEIGHT, PRICING_TYPE.VOLUME, or PRICING_TYPE.UNIT
 */
function determinePricingTypeEarly(context, weight, line) {
  // Priority 0: Volume-based pricing (liquids like vinegar, oil, sauces)
  // Check if weight extraction returned volume data
  if (weight.valid && weight.isVolume) {
    return PRICING_TYPE.VOLUME;
  }

  // Priority 0b: Check for volume pattern in description (e.g., "500ML", "1L", "750ml")
  // This catches items where weight extraction didn't run but description has volume
  const description = (line.description || line.name || '').toString();
  const volumePattern = /\b(\d+(?:[.,]\d+)?)\s*(ml|l|cl|dl|litre|liter|gal|gallon|fl\.?\s*oz)\b/i;
  if (volumePattern.test(description)) {
    return PRICING_TYPE.VOLUME;
  }

  // Priority 1: Explicit flag from column mapping
  if (line.isWeightBasedPricing === true) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 2: Unit type says qty IS weight (KG, LB, etc.)
  if (context.isWeightUnit) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 3: Valid weight with medium+ confidence
  if (weight.valid && weight.confidence >= CONFIDENCE_THRESHOLD.MEDIUM) {
    return PRICING_TYPE.WEIGHT;
  }

  // Priority 4: Unit type is explicitly count-based (EA, PC, UN)
  if (context.isCountUnit) {
    return PRICING_TYPE.UNIT;
  }

  // Priority 5: Container unit with valid weight → weight pricing
  if (context.isContainerUnit && weight.valid) {
    return PRICING_TYPE.WEIGHT;
  }

  // Default: Unit pricing
  return PRICING_TYPE.UNIT;
}

/**
 * STEP 10: Process a single line using the V2 pipeline.
 * Main entry point for new processing flow.
 *
 * NEW FLOW ORDER:
 * PHASE 1: Extract ALL fields (single pass)
 * PHASE 2: Determine pricing type (EARLY, before math)
 * PHASE 3: Validate all (tier1, math, tier2, tier3)
 * PHASE 4: Calculate pricing
 * PHASE 5: Build summary and route
 *
 * @param {Object} claudeLine - Raw line from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @param {Object} [options] - Processing options
 * @returns {Object} FoodSupplyProcessedLine
 */
export function processLineV2(claudeLine, profile = null, options = {}) {
  const lineNumber = options.lineNumber || claudeLine.lineNumber || 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: EXTRACT ALL FIELDS (clean extraction, no validation)
  // ═══════════════════════════════════════════════════════════════════════════
  const extraction = extractAllFields(claudeLine, profile);

  // Convert to TrackedField format for compatibility with existing validators
  const coreFields = {
    description: createTrackedString(extraction.description.value, extraction.description.source),
    quantity: createTrackedNumber(extraction.quantity.value, extraction.quantity.source),
    unitPrice: createTrackedNumber(extraction.unitPrice.value, extraction.unitPrice.source),
    totalPrice: createTrackedNumber(extraction.totalPrice.value, extraction.totalPrice.source),
    sku: createTrackedString(extraction.sku.value, extraction.sku.source),
    category: createTrackedString(extraction.category.value, extraction.category.source),
  };

  // Build weight object from extraction
  const weightExtraction = extraction._weightExtraction;
  const weight = {
    perUnit: weightExtraction.final?.weightPerUnit || weightExtraction.final?.volumePerUnit || null,
    total: weightExtraction.final?.total || null,
    totalGrams: weightExtraction.final?.totalGrams || null,
    totalML: weightExtraction.final?.totalML || null,
    unit: weightExtraction.final?.unit || null,
    source: weightExtraction.source,
    confidence: weightExtraction.confidence,
    valid: weightExtraction.final !== null,
    isVolume: weightExtraction.final?.isVolume || false,
    _format: weightExtraction.format ? {
      raw: weightExtraction.format.raw,
      parsed: weightExtraction.format.parsed,
      source: FIELD_SOURCE.EXTRACTED,
      confidence: weightExtraction.confidence,
      valid: true,
    } : null,
    _descriptionWeight: weightExtraction.description,
    _allSources: {
      explicit: weightExtraction.explicit,
      format: weightExtraction.format,
      description: weightExtraction.description,
      billingQty: weightExtraction.billingQty,
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: DETERMINE PRICING TYPE (early, before math validation!)
  // ═══════════════════════════════════════════════════════════════════════════
  const pricingType = determinePricingTypeEarly(
    extraction.context,
    weight,
    extraction._raw.mappedLine
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: VALIDATE ALL (now that we know the expected formula)
  // ═══════════════════════════════════════════════════════════════════════════

  // Step 3a: Validate Tier 1 (QB ready - core fields present)
  const tier1Result = validateTier1(coreFields, options);

  // Step 3b: Validate math (using expected formula from pricing type)
  // Volume uses same formula logic as weight (qty × volume = total, price ÷ total = pricePerML)
  const expectedFormula = (pricingType === PRICING_TYPE.WEIGHT || pricingType === PRICING_TYPE.VOLUME) ? 'weight' : 'unit';
  const mappedLine = extraction._raw.mappedLine || {};
  const math = validateMathV2(coreFields, weight, {
    ...options,
    invoiceUnit: extraction.quantityUnit.value || '',
    expectedFormula,
    // Pass the isWeightBasedPricing flag from normalizer
    isWeightBasedPricing: mappedLine.isWeightBasedPricing === true,
  });

  // Step 3c: Validate Tier 2 (weight valid if needed for pricing type)
  const tier2Result = validateTier2(weight, pricingType, coreFields);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: CALCULATE PRICING
  // ═══════════════════════════════════════════════════════════════════════════
  const pricing = calculatePricingV2(coreFields, weight, pricingType);

  // Step 4a: Validate Tier 3 (pricing calculation succeeded)
  const tier3Result = validateTier3(pricing);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: BUILD SUMMARY AND ROUTE
  // ═══════════════════════════════════════════════════════════════════════════

  // Calculate weighted confidence (replaces MIN)
  const coreFieldsValid = coreFields.description.valid &&
    (coreFields.quantity.valid || coreFields.totalPrice.value === 0) &&
    coreFields.totalPrice.valid;

  const overallConfidence = calculateWeightedConfidence({
    math,
    weight,
    pricingType,
    coreFieldsValid,
  });

  // Build validation summary with weighted confidence
  const validation = buildValidationSummary({
    tier1Result,
    tier2Result,
    tier3Result,
    math,
    weight,
    pricing,
    coreFields,
  });

  // Override with weighted confidence
  validation.overallConfidence = overallConfidence;
  validation.confidenceLevel = getConfidenceLevel(overallConfidence);

  // Build format field
  const format = weight._format || {
    raw: extraction.format.value || null,
    parsed: null,
    source: extraction.format.source,
    confidence: extraction.format.confidence,
    valid: extraction.format.valid,
  };

  // Detect line type (product, deposit, fee, credit)
  const lineTypeDetect = detectLineType({
    description: coreFields.description.value,
    totalPrice: coreFields.totalPrice.value,
    quantity: coreFields.quantity.value,
    unitPrice: coreFields.unitPrice.value,
  });

  // Get routing flags
  const routing = getRoutingFlags({ lineType: lineTypeDetect });

  // Build the final ProcessedLine
  return {
    // Core tracked fields
    description: coreFields.description,
    quantity: coreFields.quantity,
    unitPrice: coreFields.unitPrice,
    totalPrice: coreFields.totalPrice,

    // Format field
    format,

    // Weight extraction
    weight: {
      perUnit: weight.perUnit,
      total: weight.total,
      totalGrams: weight.totalGrams,
      unit: weight.unit,
      source: weight.source,
      confidence: weight.confidence,
      valid: weight.valid,
    },

    // Pricing calculation
    pricing,

    // Math validation
    math,

    // Validation summary
    validation,

    // Line classification
    lineType: lineTypeDetect,
    forInventory: routing.forInventory,
    forAccounting: routing.forAccounting,
    isDeposit: routing.isDeposit,

    // Optional fields
    sku: coreFields.sku,
    category: coreFields.category,

    // Extraction context (NEW - for debugging and downstream use)
    _context: extraction.context,

    // Convenience accessors (flat values for compatibility)
    _flat: {
      lineNumber,
      name: coreFields.description.value,
      description: coreFields.description.value,
      rawDescription: coreFields.description.value,
      quantity: coreFields.quantity.value,
      unitPrice: coreFields.unitPrice.value,
      totalPrice: coreFields.totalPrice.value,
      category: coreFields.category.value, // AI categorization (FOOD, PACKAGING, SUPPLY, FEE, DIVERS)
      weight: weight.total,
      weightUnit: weight.unit,
      weightPerUnit: weight.perUnit,
      totalWeightGrams: weight.totalGrams,
      hasWeight: weight.valid,
      pricePerG: pricing.pricePerG,
      pricePerLb: pricing.pricePerLb,
      pricePerKg: pricing.pricePerKg,
      pricePerML: pricing.pricePerML,
      pricePerL: pricing.pricePerL,
      pricePerUnit: pricing.pricePerUnit,
      pricingType: pricing.type,
      isVolume: pricing.isVolume || false,
      isVolumeBasedPricing: pricing.type === PRICING_TYPE.VOLUME,
      isWeightBasedPricing: pricing.type === PRICING_TYPE.WEIGHT || pricing.type === PRICING_TYPE.VOLUME,
      mathValid: math.valid,
      mathDiff: math.difference,
      formatType: format.parsed?.type || FORMAT_TYPE.UNKNOWN,
      formatFormula: format.parsed?.formula || null,
      // Unit size tracking (e.g., "6x500ML" → unitSize=500, unitSizeUnit="ml", unitsPerCase=6)
      unitSize: weight._format?.unitSize || null,
      unitSizeUnit: weight._format?.unitSizeUnit || null,
      unitsPerCase: weight._format?.unitsPerCase || null,
      lastBoxingFormat: format.raw || null,
      canProcess: validation.canProcess,
      canBill: validation.canBill,
      confidence: validation.overallConfidence,
      confidenceLevel: validation.confidenceLevel,
    },

    // Raw data for debugging
    _raw: {
      visionJson: claudeLine,
      mappedLine: extraction._raw.mappedLine,
      lineNumber,
    },
  };
}

/**
 * Process all lines using V2 pipeline.
 * Batch processing with summary statistics.
 *
 * @param {Array} claudeLines - Lines from Vision JSON
 * @param {Object} [profile] - Vendor parsing profile
 * @param {Object} [options] - Processing options
 * @returns {Object} FoodSupplyBatchResult
 */
export function processLinesV2(claudeLines, profile = null, options = {}) {
  const lines = claudeLines.map((claudeLine, index) => {
    return processLineV2(claudeLine, profile, { ...options, lineNumber: index + 1 });
  });

  // Single-pass summary calculation (consolidated from 13 iterations)
  const allWarnings = [];
  const byType = {
    product: { count: 0, total: 0 },
    deposit: { count: 0, total: 0 },
    fee: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
    zero: { count: 0, total: 0 },
  };

  let valid = 0;
  let billable = 0;
  let withWarnings = 0;
  let withErrors = 0;
  let weightBased = 0;
  let volumeBased = 0;
  let unitBased = 0;
  let linesWithPricePerG = 0;
  let linesWithPricePerML = 0;
  let inventoryLineCount = 0;
  let accountingLineCount = 0;
  let confidenceSum = 0;
  let subtotalSum = 0;

  lines.forEach((line, index) => {
    // Collect warnings
    line.validation.warnings.forEach(warning => {
      allWarnings.push({
        ...warning,
        lineNumber: index + 1,
        description: line.description.value,
      });
    });

    // Aggregate by line type
    const type = line.lineType || 'product';
    if (byType[type]) {
      byType[type].count++;
      byType[type].total += line.totalPrice.value || 0;
    }

    // Count summary stats
    if (line.validation.canProcess) valid++;
    if (line.validation.canBill) billable++;
    if (line.validation.warningCount > 0) withWarnings++;
    if (line.validation.errorCount > 0) withErrors++;
    if (line.pricing.type === PRICING_TYPE.WEIGHT) weightBased++;
    if (line.pricing.type === PRICING_TYPE.VOLUME) volumeBased++;
    if (line.pricing.type === PRICING_TYPE.UNIT) unitBased++;
    if (line.pricing.pricePerG != null) linesWithPricePerG++;
    if (line.pricing.pricePerML != null) linesWithPricePerML++;
    if (line.forInventory) inventoryLineCount++;
    if (line.forAccounting) accountingLineCount++;

    // Sum for averages/totals
    confidenceSum += line.validation.overallConfidence;
    subtotalSum += line.totalPrice.value || 0;
  });

  // Round totals
  Object.keys(byType).forEach(key => {
    byType[key].total = Math.round(byType[key].total * 100) / 100;
  });

  const total = lines.length;
  const avgConfidence = total > 0 ? Math.round(confidenceSum / total) : 0;
  const calculatedSubtotal = Math.round(subtotalSum * 100) / 100;

  return {
    lines,
    summary: {
      total,
      valid,
      billable,
      warnings: withWarnings,
      errors: withErrors,
      weightBased,
      volumeBased,
      unitBased,
      linesWithPricePerG,
      linesWithPricePerML,
      avgConfidence,
      calculatedSubtotal,
      byType,

      // For compatibility with existing code
      totalLines: total,
      linesWithWeight: weightBased,
      linesWithPricePerG,
      inventoryLineCount,
      accountingLineCount,
      productSubtotal: byType.product.total,
      depositTotal: byType.deposit.total,
      feeTotal: byType.fee.total,
      creditTotal: byType.credit.total,
      effectiveSubtotal: Math.round((byType.product.total + byType.fee.total + byType.credit.total) * 100) / 100,
      linesWithAnomalies: withWarnings + withErrors,
      totalAnomalies: allWarnings.length,
    },
    allWarnings,
  };
}

// ============================================
// END V2 PIPELINE FUNCTIONS
// ============================================

/**
 * Maps invoice columns to inventory item fields
 */
const FIELD_MAPPINGS = {
  columns: {
    sku: 'sku',
    description: 'name',
    boxingFormat: 'packagingFormat',  // Food suppliers can also have boxing formats (1/25LB)
    quantity: 'lastOrderQty',
    unit: 'purchaseUnit',
    weight: 'receivedWeight',
    unitPrice: 'lastPurchasePrice',
    total: 'lastInvoiceTotal'
  },
  requiredColumns: ['description', 'quantity', 'unitPrice'],
  optionalColumns: ['sku', 'boxingFormat', 'unit', 'weight', 'total']
};

// ============================================
// HANDLER IMPLEMENTATION
// ============================================

/**
 * Food Supply Invoice Handler
 */
export const foodSupplyHandler = {
  type: INVOICE_TYPES.FOOD_SUPPLY,
  label: 'Food Supplier',
  description: 'For food/ingredient suppliers (Sysco, GFS, etc.) with unit or weight-based pricing',

  fieldMappings: FIELD_MAPPINGS,

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

    // Check for explicit weight
    const hasExplicitWeight = (lineItem.weight != null && lineItem.weight > 0) ||
                              (lineItem.weightInGrams != null && lineItem.weightInGrams > 0);

    // Check for weight embedded in format (e.g., "2/5LB", "Sac 50lb")
    const embeddedWeight = extractWeightFromFormat(lineItem);
    const hasEmbeddedWeight = embeddedWeight.hasEmbeddedWeight;
    const hasWeight = hasExplicitWeight || hasEmbeddedWeight;

    // Calculate normalized price (pricePerG or pricePerML)
    const normalizedPrice = lineItem.pricePerG != null || lineItem.pricePerML != null
      ? { pricePerG: lineItem.pricePerG, pricePerML: lineItem.pricePerML }
      : calculateNormalizedPrice(lineItem);

    // Start with base fields
    const item = {
      ...extractBaseFields(lineItem, vendor),

      // Food supply specific
      itemType: 'ingredient',
      category: lineItem.category || LINE_CATEGORY.FOOD,

      // Unit (normalized)
      unit: lineItem.unit || 'pc',
      purchaseUnit: lineItem.unit ? normalizeWeightUnit(lineItem.unit) : 'pc',

      // Pricing - calculate all applicable price types
      currentPrice: unitPrice,
      pricePerG: normalizedPrice.pricePerG || null,
      pricePerKg: normalizedPrice.pricePerKg || null,
      pricePerLb: normalizedPrice.pricePerLb || null,
      pricePerML: normalizedPrice.pricePerML || null,
      pricePerL: normalizedPrice.pricePerL || null,
      // For unit-based items, always set pricePerUnit
      pricePerUnit: unitPrice > 0 ? unitPrice : null,
      // Track pricing type: 'weight' ($/lb), 'volume' ($/ml), or 'unit' ($/ea)
      // Used for recipe costing and inventory deduction logic
      pricingType: lineItem.pricingType || (normalizedPrice.pricePerG ? 'weight' : (normalizedPrice.pricePerML ? 'volume' : 'unit')),

      // Stock tracking - quantity
      stockQuantity: quantity,
      stockQuantityUnit: lineItem.quantityUnit ? lineItem.quantityUnit : 'pc',
      parQuantity: quantity,

      // Invoice tracking
      lastPurchaseDate: options.invoiceDate || now,
      lastInvoiceId: options.invoiceId || null,
      isActive: true
    };

    // Handle weight/volume stock
    if (hasWeight) {
      let weightValue, unitType;

      if (hasExplicitWeight) {
        // Use explicit weight from Claude parsing
        weightValue = lineItem.weight || lineItem.weightInGrams || 0;
        unitType = lineItem.weightUnit || 'g';
      } else {
        // Use embedded weight from format (e.g., "Sac 50lb" × 2 = 100lb)
        weightValue = embeddedWeight.totalWeight;
        unitType = embeddedWeight.weightUnit;
      }

      const isVolume = isVolumeUnit(unitType);
      item.stockWeight = weightValue;
      item.stockWeightUnit = isVolume
        ? normalizeVolumeUnit(unitType)
        : normalizeWeightUnit(unitType);
      item.parWeight = weightValue;

      // Store received weight info
      item.receivedWeight = weightValue;
      item.weightUnit = unitType;

      // Calculate weight per unit (e.g., 173.51 lb / 8 cases = 21.69 lb per case)
      if (quantity > 0) {
        item.weightPerUnit = Math.round((weightValue / quantity) * 100) / 100;
      }

    } else {
      // No weight - use quantity for stock (count-based item like 24CT)
      item.stockWeight = 0;
      item.stockWeightUnit = null;  // null = not weight-based, use stockQuantity
      item.parWeight = 0;
      item.stockQuantity = quantity;
      item.parQuantity = quantity;
    }

    // Unit size tracking (e.g., "6x500ML" → unitSize=500, unitSizeUnit="ml", unitsPerCase=6)
    // These come from V2 pipeline via _flat or from embedded weight parsing
    item.unitSize = lineItem.unitSize || embeddedWeight.unitSize || null;
    item.unitSizeUnit = lineItem.unitSizeUnit || embeddedWeight.unitSizeUnit || null;
    item.unitsPerCase = lineItem.unitsPerCase || embeddedWeight.unitsPerCase || null;
    item.lastBoxingFormat = lineItem.lastBoxingFormat || lineItem.format || lineItem.boxingFormat || null;

    // If we have unitSize info but no pricePerML/pricePerG, calculate from unit size
    // e.g., 500ml olive oil at $14.99 → pricePerML = 14.99/500 = 0.02998
    if (item.unitSize > 0 && item.unitSizeUnit && unitPrice > 0) {
      const sizeUnit = item.unitSizeUnit.toLowerCase();
      const volumeUnits = ['ml', 'l', 'cl', 'dl', 'litre', 'liter'];
      const weightUnits = ['g', 'kg', 'lb', 'lbs', 'oz'];

      if (volumeUnits.includes(sizeUnit) && !item.pricePerML) {
        // Convert to ml for consistent pricing
        let sizeInML = item.unitSize;
        if (sizeUnit === 'l' || sizeUnit === 'litre' || sizeUnit === 'liter') sizeInML = item.unitSize * 1000;
        else if (sizeUnit === 'cl') sizeInML = item.unitSize * 10;
        else if (sizeUnit === 'dl') sizeInML = item.unitSize * 100;

        item.pricePerML = Math.round((unitPrice / sizeInML) * 1000000) / 1000000;
        item.pricingType = 'volume';
      } else if (weightUnits.includes(sizeUnit) && !item.pricePerG) {
        // Convert to grams for consistent pricing
        let sizeInG = item.unitSize;
        if (sizeUnit === 'kg') sizeInG = item.unitSize * 1000;
        else if (sizeUnit === 'lb' || sizeUnit === 'lbs') sizeInG = item.unitSize * 453.592;
        else if (sizeUnit === 'oz') sizeInG = item.unitSize * 28.3495;

        item.pricePerG = Math.round((unitPrice / sizeInG) * 1000000) / 1000000;
        item.pricingType = 'weight';
      }
    }

    return { item, warnings };
  },

  /**
   * Updates an existing inventory item with new invoice data.
   * Handles stock addition, price updates, and weight tracking.
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
      pricePerG: existingItem.pricePerG || null,
      stockQuantity: existingItem.stockQuantity || 0,
      stockWeight: existingItem.stockWeight || 0
    };

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

    // Update unit if provided
    if (lineItem.unit) {
      updates.purchaseUnit = normalizeWeightUnit(lineItem.unit);
    }

    // Check for explicit weight
    const hasExplicitWeight = (lineItem.weight != null && lineItem.weight > 0) ||
                              (lineItem.weightInGrams != null && lineItem.weightInGrams > 0);

    // Check for weight embedded in format (e.g., "2/5LB", "Sac 50lb")
    const embeddedWeight = extractWeightFromFormat(lineItem);
    const hasEmbeddedWeight = embeddedWeight.hasEmbeddedWeight;
    const hasWeight = hasExplicitWeight || hasEmbeddedWeight;

    // Update stock quantities
    updates.stockQuantity = (existingItem.stockQuantity || 0) + quantity;

    // Handle weight-based stock updates
    if (hasWeight) {
      let weightValue, unitType;

      if (hasExplicitWeight) {
        // Use explicit weight from Claude parsing
        weightValue = lineItem.weight || lineItem.weightInGrams || 0;
        unitType = lineItem.weightUnit || 'g';
      } else {
        // Use embedded weight from format (e.g., "Sac 50lb" × 2 = 100lb)
        weightValue = embeddedWeight.totalWeight;
        unitType = embeddedWeight.weightUnit;
      }

      // Update received weight info
      updates.receivedWeight = weightValue;
      updates.weightUnit = unitType;

      // Calculate weight per unit for this invoice (e.g., 173.51 lb / 8 cases = 21.69 lb per case)
      if (quantity > 0) {
        updates.weightPerUnit = Math.round((weightValue / quantity) * 100) / 100;
      }

      // Add to stock weight
      const existingWeight = existingItem.stockWeight || 0;
      updates.stockWeight = existingWeight + weightValue;
      // Use correct normalizer for volume vs weight units
      const isVolumeType = isVolumeUnit(unitType);
      updates.stockWeightUnit = isVolumeType
        ? normalizeVolumeUnit(unitType)
        : normalizeWeightUnit(unitType);

    } else {
      // No weight - just add quantity to stockQuantity
      updates.stockQuantity = (existingItem.stockQuantity || 0) + quantity;
    }

    // Recalculate normalized price (pricePerG or pricePerML)
    const normalizedPrice = calculateNormalizedPrice(lineItem);

    if (normalizedPrice.pricePerG) {
      const oldPricePerG = existingItem.pricePerG;
      updates.pricePerG = normalizedPrice.pricePerG;
      updates.pricePerKg = normalizedPrice.pricePerKg;
      updates.pricePerLb = normalizedPrice.pricePerLb;

      // Log significant price changes
      if (oldPricePerG) {
        const pctChange = ((normalizedPrice.pricePerG - oldPricePerG) / oldPricePerG) * 100;
        if (Math.abs(pctChange) > 10) {
          warnings.push(`Price changed ${pctChange.toFixed(1)}%`);
        }
      }
    } else if (normalizedPrice.pricePerML) {
      updates.pricePerML = normalizedPrice.pricePerML;
      updates.pricePerL = normalizedPrice.pricePerL;
    } else if (lineItem.pricePerG) {
      // Use explicit pricePerG if provided
      updates.pricePerG = parseFloat(lineItem.pricePerG);
    }

    return { updates, warnings, previousValues };
  },

  // ============================================
  // LINE PROCESSING
  // ============================================

  /**
   * Processes all invoice lines with food supply specific logic.
   * Delegates to V2 pipeline and converts output to V1-compatible format.
   *
   * @param {Array} claudeLines - Line items from Claude parsing
   * @param {Object} [profile] - Vendor parsing profile with column mappings
   * @returns {Object} Processed result { lines, summary, allWarnings }
   */
  processLines(claudeLines, profile = null) {
    const v2Result = processLinesV2(claudeLines, profile);

    // Convert V2 TrackedString/TrackedNumber output to V1-compatible plain values
    const v1CompatibleLines = v2Result.lines.map(line => ({
      // Spread the flat values for V1 compatibility
      ...line._flat,
      // Keep line type and routing
      lineType: line.lineType,
      forInventory: line.forInventory,
      forAccounting: line.forAccounting,
      isDeposit: line.isDeposit,
      // Keep validation warnings as anomalies
      anomalies: line.validation.warnings,
      hasAnomalies: line.validation.warnings.length > 0,
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
   * Applies food supply specific column mapping to a line item.
   * Delegates to module-level function for consistency with V2 pipeline.
   *
   * @param {Object} line - Raw line item from Claude parsing
   * @param {Object} profile - Vendor parsing profile
   * @returns {Object} Line with mapped column values
   */
  applyColumnMapping(line, profile) {
    return applyFoodSupplyColumnMapping(line, profile);
  },

  /**
   * V2 Pipeline: Process lines with tracked fields, validation gates, and confidence scoring.
   * @param {Array} claudeLines - Line items from Vision parser
   * @param {Object} [profile] - Vendor parsing profile
   * @param {Object} [options] - Processing options
   * @returns {Object} { lines: ProcessedLine[], summary: ValidationSummary }
   */
  processLinesV2(claudeLines, profile = null, options = {}) {
    return processLinesV2(claudeLines, profile, options);
  }
};

export default foodSupplyHandler;
