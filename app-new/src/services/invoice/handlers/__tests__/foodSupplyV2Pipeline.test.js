/**
 * Food Supply V2 Pipeline Tests
 *
 * Tests the new processing pipeline with tracked fields,
 * confidence scoring, and validation gates.
 */

import { describe, it, expect } from 'vitest';
import {
  extractCoreFields,
  validateTier1,
  extractWeightV2,
  validateMathV2,
  determinePricingType,
  validateTier2,
  calculatePricingV2,
  validateTier3,
  buildValidationSummary,
  processLineV2,
  processLinesV2,
} from '../foodSupplyHandler';
import {
  FIELD_SOURCE,
  PRICING_TYPE,
  CONFIDENCE_SCORE,
  CONFIDENCE_THRESHOLD,
  WARNING_SEVERITY,
  FOOD_SUPPLY_WARNING,
} from '../foodSupplyTypes';

// ============================================
// SAMPLE INVOICE LINES (Real-world examples)
// ============================================

const SAMPLE_LINES = {
  // Perfect weight-based line with pack format
  weightBasedPerfect: {
    description: 'CHICKEN BREAST BONELESS 2/5KG',
    quantity: 4,
    format: '2/5KG',
    unitPrice: 24.99,
    totalPrice: 99.96, // 4 × 24.99 = 99.96
  },

  // Weight-based with weight in description (no format field)
  weightInDescription: {
    description: 'BEEF STRIPLOIN AAA 10LB AVG',
    quantity: 2,
    unitPrice: 89.99,
    totalPrice: 179.98,
  },

  // Unit-based (eggs by dozen)
  unitBased: {
    description: 'EGGS LARGE GRADE A',
    quantity: 5,
    unit: 'dz',
    unitPrice: 4.99,
    totalPrice: 24.95,
  },

  // Weight-based with explicit weight column
  explicitWeight: {
    description: 'SALMON FILLET FRESH',
    quantity: 1,
    weight: 2.5,
    weightUnit: 'kg',
    unitPrice: 28.99,
    totalPrice: 72.48, // 2.5 × 28.99 = 72.475 ≈ 72.48
  },

  // Math mismatch (error in invoice)
  mathMismatch: {
    description: 'PORK TENDERLOIN',
    quantity: 3,
    format: '2/5LB',
    unitPrice: 15.99,
    totalPrice: 50.00, // Should be 47.97, invoice shows 50.00
  },

  // Zero price (unavailable item)
  zeroPrice: {
    description: 'LAMB RACK FRENCHED',
    quantity: 2,
    format: '1/3LB',
    unitPrice: 0,
    totalPrice: 0,
  },

  // Missing quantity
  missingQuantity: {
    description: 'DUCK BREAST',
    unitPrice: 22.99,
    totalPrice: 45.98,
  },

  // Credit line (negative)
  creditLine: {
    description: 'RETURN - DAMAGED GOODS',
    quantity: -1,
    unitPrice: 25.00,
    totalPrice: -25.00,
  },

  // Multiplier format
  multiplierFormat: {
    description: 'GROUND BEEF LEAN',
    quantity: 2,
    format: '4x5lb',
    unitPrice: 45.99,
    totalPrice: 91.98,
  },

  // Simple weight format
  simpleWeight: {
    description: 'BACON SLAB',
    quantity: 3,
    format: '10lb',
    unitPrice: 35.00,
    totalPrice: 105.00,
  },

  // Count pack (no weight)
  countPack: {
    description: 'BURGER PATTIES',
    quantity: 2,
    format: '24CT',
    unitPrice: 29.99,
    totalPrice: 59.98,
  },

  // Weight-based pricing (U/M = kg)
  weightBasedUM: {
    description: 'CARROTS WHOLE',
    quantity: 15.5,
    quantityUnit: 'kg',
    unitPrice: 2.49,
    totalPrice: 38.60,
    isWeightBasedPricing: true,
  },
};

// ============================================
// STEP 1: extractCoreFields Tests
// ============================================

describe('extractCoreFields', () => {
  it('extracts all core fields with source tracking', () => {
    const result = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);

    expect(result.description.value).toBe('CHICKEN BREAST BONELESS 2/5KG');
    expect(result.description.source).toBe(FIELD_SOURCE.VISION);
    expect(result.description.valid).toBe(true);

    expect(result.quantity.value).toBe(4);
    expect(result.quantity.source).toBe(FIELD_SOURCE.VISION);
    expect(result.quantity.valid).toBe(true);

    expect(result.unitPrice.value).toBe(24.99);
    expect(result.unitPrice.valid).toBe(true);

    expect(result.totalPrice.value).toBe(99.96);
    expect(result.totalPrice.valid).toBe(true);
  });

  it('handles missing description', () => {
    const result = extractCoreFields({ quantity: 1, unitPrice: 10 });
    expect(result.description.value).toBe(null);
    expect(result.description.valid).toBe(false);
  });

  it('handles missing quantity', () => {
    const result = extractCoreFields(SAMPLE_LINES.missingQuantity);
    expect(result.quantity.value).toBe(null);
    expect(result.quantity.valid).toBe(false);
  });

  it('extracts SKU when present', () => {
    const lineWithSku = { ...SAMPLE_LINES.weightBasedPerfect, sku: 'CHK-001' };
    const result = extractCoreFields(lineWithSku);
    expect(result.sku.value).toBe('CHK-001');
    expect(result.sku.valid).toBe(true);
  });
});

// ============================================
// STEP 2: validateTier1 Tests
// ============================================

describe('validateTier1', () => {
  it('validates complete line as tier1Valid', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const result = validateTier1(coreFields);

    expect(result.tier1Valid).toBe(true);
    expect(result.canBill).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails tier1 for missing description', () => {
    const coreFields = extractCoreFields({ quantity: 1, unitPrice: 10 });
    const result = validateTier1(coreFields);

    expect(result.tier1Valid).toBe(false);
    expect(result.canBill).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].severity).toBe(WARNING_SEVERITY.ERROR);
  });

  it('warns for missing quantity but still valid if has description and price', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.missingQuantity);
    const result = validateTier1(coreFields);

    expect(result.tier1Valid).toBe(true); // Has description and price
    expect(result.warnings.some(w => w.field === 'quantity')).toBe(true);
  });
});

// ============================================
// STEP 3: extractWeightV2 Tests
// ============================================

describe('extractWeightV2', () => {
  it('extracts weight from PACK_WEIGHT format with 95% confidence', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const result = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);

    expect(result.valid).toBe(true);
    expect(result.perUnit).toBe(10); // 2 × 5kg = 10kg per case
    expect(result.total).toBe(40); // 10kg × 4 cases = 40kg
    expect(result.unit).toBe('kg');
    expect(result.confidence).toBe(CONFIDENCE_SCORE.PACK_WEIGHT_PATTERN); // 95
    expect(result.source).toBe(FIELD_SOURCE.EXTRACTED);
  });

  it('extracts weight from explicit weight column with 100% confidence', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.explicitWeight);
    const result = extractWeightV2(SAMPLE_LINES.explicitWeight, coreFields);

    expect(result.valid).toBe(true);
    expect(result.total).toBe(2.5);
    expect(result.unit).toBe('kg');
    expect(result.confidence).toBe(CONFIDENCE_SCORE.EXPLICIT_COLUMN); // 100
    expect(result.source).toBe(FIELD_SOURCE.VISION);
  });

  it('extracts weight from description with 70% confidence', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightInDescription);
    const result = extractWeightV2(SAMPLE_LINES.weightInDescription, coreFields);

    expect(result.valid).toBe(true);
    expect(result.total).toBe(20); // 10LB × 2 = 20LB
    expect(result.unit).toBe('lb');
    expect(result.confidence).toBe(CONFIDENCE_SCORE.DESCRIPTION_MINING); // 70
  });

  it('extracts weight from MULTIPLIER format with 90% confidence', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.multiplierFormat);
    const result = extractWeightV2(SAMPLE_LINES.multiplierFormat, coreFields);

    expect(result.valid).toBe(true);
    expect(result.perUnit).toBe(20); // 4 × 5lb = 20lb per case
    expect(result.total).toBe(40); // 20lb × 2 = 40lb
    expect(result.confidence).toBe(CONFIDENCE_SCORE.MULTIPLIER_PATTERN); // 90
  });

  it('extracts weight from SIMPLE_WEIGHT format with 85% confidence', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.simpleWeight);
    const result = extractWeightV2(SAMPLE_LINES.simpleWeight, coreFields);

    expect(result.valid).toBe(true);
    expect(result.perUnit).toBe(10); // 10lb per case
    expect(result.total).toBe(30); // 10lb × 3 = 30lb
    expect(result.confidence).toBe(CONFIDENCE_SCORE.SIMPLE_WEIGHT_PATTERN); // 85
  });

  it('returns invalid for COUNT_PACK format (no weight)', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.countPack);
    const result = extractWeightV2(SAMPLE_LINES.countPack, coreFields);

    expect(result.valid).toBe(false);
    expect(result.confidence).toBe(CONFIDENCE_SCORE.NO_WEIGHT_FOUND); // 0
  });

  it('returns invalid for unit-based line with no weight', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.unitBased);
    const result = extractWeightV2(SAMPLE_LINES.unitBased, coreFields);

    expect(result.valid).toBe(false);
    expect(result.total).toBe(null);
  });

  it('converts weight to grams correctly', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const result = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);

    expect(result.totalGrams).toBe(40000); // 40kg × 1000
  });
});

// ============================================
// STEP 4: validateMathV2 Tests
// ============================================

describe('validateMathV2', () => {
  it('validates weight-based math correctly', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.explicitWeight);
    const weight = extractWeightV2(SAMPLE_LINES.explicitWeight, coreFields);
    const result = validateMathV2(coreFields, weight);

    expect(result.valid).toBe(true);
    expect(result.formula).toBe('weight');
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD.HIGH);
  });

  it('validates unit-based math correctly', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.unitBased);
    const weight = extractWeightV2(SAMPLE_LINES.unitBased, coreFields);
    const result = validateMathV2(coreFields, weight);

    expect(result.valid).toBe(true);
    expect(result.formula).toBe('unit');
    expect(result.expected).toBe(24.95); // 5 × 4.99
  });

  it('detects math mismatch', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.mathMismatch);
    const weight = extractWeightV2(SAMPLE_LINES.mathMismatch, coreFields);
    const result = validateMathV2(coreFields, weight);

    expect(result.valid).toBe(false);
    expect(result.difference).toBeGreaterThan(0.02);
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD.HIGH);
  });

  it('handles zero price line', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.zeroPrice);
    const weight = extractWeightV2(SAMPLE_LINES.zeroPrice, coreFields);
    const result = validateMathV2(coreFields, weight);

    expect(result.valid).toBe(true); // 0 = 0
  });

  it('provides confidence based on difference', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const weight = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);
    const result = validateMathV2(coreFields, weight);

    // Perfect match should have high confidence
    expect(result.confidence).toBeGreaterThanOrEqual(90);
  });
});

// ============================================
// STEP 5: determinePricingType Tests
// ============================================

describe('determinePricingType', () => {
  it('determines weight-based pricing when math matches weight formula', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.explicitWeight);
    const weight = extractWeightV2(SAMPLE_LINES.explicitWeight, coreFields);
    const math = validateMathV2(coreFields, weight);
    const result = determinePricingType(weight, math, SAMPLE_LINES.explicitWeight);

    expect(result).toBe(PRICING_TYPE.WEIGHT);
  });

  it('determines unit-based pricing when no weight found', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.unitBased);
    const weight = extractWeightV2(SAMPLE_LINES.unitBased, coreFields);
    const math = validateMathV2(coreFields, weight);
    const result = determinePricingType(weight, math, SAMPLE_LINES.unitBased);

    expect(result).toBe(PRICING_TYPE.UNIT);
  });

  it('respects explicit isWeightBasedPricing flag', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedUM);
    const weight = extractWeightV2(SAMPLE_LINES.weightBasedUM, coreFields);
    const math = validateMathV2(coreFields, weight);
    const result = determinePricingType(weight, math, SAMPLE_LINES.weightBasedUM);

    expect(result).toBe(PRICING_TYPE.WEIGHT);
  });
});

// ============================================
// STEP 6: validateTier2 Tests
// ============================================

describe('validateTier2', () => {
  it('validates weight-based line with valid weight', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const weight = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);
    const result = validateTier2(weight, PRICING_TYPE.WEIGHT, coreFields);

    expect(result.tier2Valid).toBe(true);
  });

  it('validates unit-based line without weight (tier2 always valid)', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.unitBased);
    const weight = extractWeightV2(SAMPLE_LINES.unitBased, coreFields);
    const result = validateTier2(weight, PRICING_TYPE.UNIT, coreFields);

    expect(result.tier2Valid).toBe(true);
    expect(result.warnings.some(w => w.type === FOOD_SUPPLY_WARNING.UNIT_BASED_PRICING)).toBe(true);
  });

  it('warns for description-mined weight', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightInDescription);
    const weight = extractWeightV2(SAMPLE_LINES.weightInDescription, coreFields);
    const result = validateTier2(weight, PRICING_TYPE.WEIGHT, coreFields);

    expect(result.tier2Valid).toBe(true);
    expect(result.warnings.some(w => w.type === FOOD_SUPPLY_WARNING.WEIGHT_FROM_DESCRIPTION)).toBe(true);
  });
});

// ============================================
// STEP 7: calculatePricingV2 Tests
// ============================================

describe('calculatePricingV2', () => {
  it('calculates pricePerG for weight-based line', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const weight = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);
    const result = calculatePricingV2(coreFields, weight, PRICING_TYPE.WEIGHT);

    expect(result.type).toBe(PRICING_TYPE.WEIGHT);
    expect(result.pricePerG).toBeCloseTo(0.002499, 5); // 99.96 / 40000g
    expect(result.pricePerKg).toBeCloseTo(2.499, 2);
    expect(result.pricePerUnit).toBe(null);
    expect(result.valid).toBe(true);
  });

  it('calculates pricePerUnit for unit-based line', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.unitBased);
    const weight = extractWeightV2(SAMPLE_LINES.unitBased, coreFields);
    const result = calculatePricingV2(coreFields, weight, PRICING_TYPE.UNIT);

    expect(result.type).toBe(PRICING_TYPE.UNIT);
    expect(result.pricePerUnit).toBe(4.99); // 24.95 / 5
    expect(result.pricePerG).toBe(null);
    expect(result.valid).toBe(true);
  });

  it('handles zero price', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.zeroPrice);
    const weight = extractWeightV2(SAMPLE_LINES.zeroPrice, coreFields);
    const result = calculatePricingV2(coreFields, weight, PRICING_TYPE.WEIGHT);

    expect(result.valid).toBe(false);
    expect(result.pricePerG).toBe(null);
  });
});

// ============================================
// STEP 8: validateTier3 Tests
// ============================================

describe('validateTier3', () => {
  it('validates successful pricing calculation', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.weightBasedPerfect);
    const weight = extractWeightV2(SAMPLE_LINES.weightBasedPerfect, coreFields);
    const pricing = calculatePricingV2(coreFields, weight, PRICING_TYPE.WEIGHT);
    const result = validateTier3(pricing);

    expect(result.tier3Valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('fails tier3 for zero price', () => {
    const coreFields = extractCoreFields(SAMPLE_LINES.zeroPrice);
    const weight = extractWeightV2(SAMPLE_LINES.zeroPrice, coreFields);
    const pricing = calculatePricingV2(coreFields, weight, PRICING_TYPE.WEIGHT);
    const result = validateTier3(pricing);

    expect(result.tier3Valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ============================================
// FULL PIPELINE: processLineV2 Tests
// ============================================

describe('processLineV2', () => {
  it('processes weight-based line with full structure', () => {
    const result = processLineV2(SAMPLE_LINES.weightBasedPerfect);

    // Core fields
    expect(result.description.value).toBe('CHICKEN BREAST BONELESS 2/5KG');
    expect(result.quantity.value).toBe(4);
    expect(result.unitPrice.value).toBe(24.99);
    expect(result.totalPrice.value).toBe(99.96);

    // Weight
    expect(result.weight.valid).toBe(true);
    expect(result.weight.total).toBe(40);
    expect(result.weight.confidence).toBe(95);

    // Pricing
    expect(result.pricing.type).toBe(PRICING_TYPE.WEIGHT);
    expect(result.pricing.pricePerG).toBeCloseTo(0.002499, 5);

    // Math
    expect(result.math.valid).toBe(true);

    // Validation summary
    expect(result.validation.tier1Valid).toBe(true);
    expect(result.validation.tier2Valid).toBe(true);
    expect(result.validation.tier3Valid).toBe(true);
    expect(result.validation.canProcess).toBe(true);
    expect(result.validation.canBill).toBe(true);
    expect(result.validation.overallConfidence).toBeGreaterThanOrEqual(90);

    // Flat accessors for compatibility
    expect(result._flat.weight).toBe(40);
    expect(result._flat.pricePerG).toBeCloseTo(0.002499, 5);
    expect(result._flat.canProcess).toBe(true);
  });

  it('processes unit-based line correctly', () => {
    const result = processLineV2(SAMPLE_LINES.unitBased);

    expect(result.weight.valid).toBe(false);
    expect(result.pricing.type).toBe(PRICING_TYPE.UNIT);
    expect(result.pricing.pricePerUnit).toBe(4.99);
    expect(result.validation.canProcess).toBe(true);
    expect(result.validation.warnings.some(w => w.type === FOOD_SUPPLY_WARNING.UNIT_BASED_PRICING)).toBe(true);
  });

  it('processes line with math mismatch', () => {
    const result = processLineV2(SAMPLE_LINES.mathMismatch);

    expect(result.math.valid).toBe(false);
    expect(result.validation.warnings.some(w => w.type === FOOD_SUPPLY_WARNING.MATH_MISMATCH)).toBe(true);
    expect(result.validation.overallConfidence).toBeLessThan(90);
  });

  it('processes credit line', () => {
    const result = processLineV2(SAMPLE_LINES.creditLine);

    expect(result.totalPrice.value).toBe(-25.00);
    expect(result.lineType).toBe('credit');
  });

  it('includes raw data for debugging', () => {
    const result = processLineV2(SAMPLE_LINES.weightBasedPerfect);

    expect(result._raw.visionJson).toEqual(SAMPLE_LINES.weightBasedPerfect);
    expect(result._raw.lineNumber).toBe(1);
  });
});

// ============================================
// BATCH PROCESSING: processLinesV2 Tests
// ============================================

describe('processLinesV2', () => {
  const allLines = [
    SAMPLE_LINES.weightBasedPerfect,
    SAMPLE_LINES.unitBased,
    SAMPLE_LINES.explicitWeight,
    SAMPLE_LINES.mathMismatch,
    SAMPLE_LINES.creditLine,
  ];

  it('processes multiple lines with summary', () => {
    const result = processLinesV2(allLines);

    expect(result.lines).toHaveLength(5);
    expect(result.summary.total).toBe(5);
  });

  it('calculates weight-based vs unit-based counts', () => {
    const result = processLinesV2(allLines);

    expect(result.summary.weightBased).toBeGreaterThan(0);
    expect(result.summary.unitBased).toBeGreaterThan(0);
  });

  it('calculates average confidence', () => {
    const result = processLinesV2(allLines);

    expect(result.summary.avgConfidence).toBeGreaterThan(0);
    expect(result.summary.avgConfidence).toBeLessThanOrEqual(100);
  });

  it('collects all warnings', () => {
    const result = processLinesV2(allLines);

    expect(result.allWarnings.length).toBeGreaterThan(0);
    expect(result.allWarnings[0]).toHaveProperty('lineNumber');
    expect(result.allWarnings[0]).toHaveProperty('type');
  });

  it('calculates subtotal', () => {
    const result = processLinesV2(allLines);
    const expectedTotal = allLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0);

    expect(result.summary.calculatedSubtotal).toBeCloseTo(expectedTotal, 2);
  });

  it('groups by line type', () => {
    const result = processLinesV2(allLines);

    expect(result.summary.byType.product.count).toBeGreaterThan(0);
    expect(result.summary.byType.credit.count).toBe(1); // One credit line
  });

  it('provides compatibility fields', () => {
    const result = processLinesV2(allLines);

    // Check compatibility with old structure
    expect(result.summary).toHaveProperty('totalLines');
    expect(result.summary).toHaveProperty('linesWithWeight');
    expect(result.summary).toHaveProperty('linesWithPricePerG');
    expect(result.summary).toHaveProperty('productSubtotal');
    expect(result.summary).toHaveProperty('effectiveSubtotal');
  });
});

// ============================================
// CONFIDENCE LEVEL THRESHOLDS
// ============================================

describe('Confidence Levels', () => {
  it('high confidence (≥90%) for explicit weight', () => {
    const result = processLineV2(SAMPLE_LINES.explicitWeight);
    expect(result.validation.confidenceLevel).toBe('high');
  });

  it('high confidence (≥90%) for pack weight format', () => {
    const result = processLineV2(SAMPLE_LINES.weightBasedPerfect);
    expect(result.validation.confidenceLevel).toBe('high');
  });

  it('weighted confidence for description-mined weight', () => {
    const result = processLineV2(SAMPLE_LINES.weightInDescription);
    // With weighted scoring (math=50%, weight=30%, extraction=20%):
    // Math: 100 * 0.50 = 50, Weight (desc mining 70%): 70 * 0.30 = 21, Extraction: 100 * 0.20 = 20
    // Total: 91 = high confidence (weighted scoring is more generous than MIN)
    expect(result.validation.overallConfidence).toBeGreaterThanOrEqual(90);
  });

  it('lower confidence for math mismatch', () => {
    const result = processLineV2(SAMPLE_LINES.mathMismatch);
    expect(result.validation.overallConfidence).toBeLessThan(90);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge Cases', () => {
  it('handles empty description', () => {
    const result = processLineV2({ quantity: 1, unitPrice: 10, totalPrice: 10 });
    expect(result.validation.tier1Valid).toBe(false);
  });

  it('handles null values', () => {
    const result = processLineV2({
      description: 'TEST',
      quantity: null,
      unitPrice: null,
      totalPrice: null,
    });
    expect(result.validation.canBill).toBe(false);
  });

  it('handles string numbers', () => {
    const result = processLineV2({
      description: 'TEST',
      quantity: '5',
      unitPrice: '10.99',
      totalPrice: '54.95',
    });
    expect(result.quantity.value).toBe(5);
    expect(result.unitPrice.value).toBe(10.99);
    expect(result.validation.canProcess).toBe(true);
  });

  it('handles very small weights', () => {
    const result = processLineV2({
      description: 'SAFFRON',
      quantity: 1,
      weight: 0.001, // 1 gram
      weightUnit: 'kg',
      unitPrice: 500.00,
      totalPrice: 500.00,
    });
    expect(result.weight.totalGrams).toBe(1); // 0.001kg = 1g
    expect(result.pricing.pricePerG).toBe(500.00);
  });

  it('handles very large quantities', () => {
    const result = processLineV2({
      description: 'BULK FLOUR',
      quantity: 1000,
      format: '50lb',
      unitPrice: 25.00,
      totalPrice: 25000.00,
    });
    expect(result.weight.total).toBe(50000); // 50lb × 1000
    expect(result.validation.canProcess).toBe(true);
  });

  it('handles approximate weight format (meat supplier)', () => {
    // Format "1/~15KG" means "approximately 15kg per piece"
    // The ~ indicates the format is informational only
    // The qty column (2.43) contains the actual weight
    const result = processLineV2({
      description: 'BOEUF FILET MIGNON CENTRE 2.43KG',
      quantity: 2.43, // This IS the actual weight in kg
      format: '1/~15KG',
      unitPrice: 65.00,
      totalPrice: 157.95,
    });

    // Should NOT multiply qty × format weight
    // qty IS the weight (2.43kg)
    expect(result.weight.total).toBe(2.43);
    expect(result.weight.unit).toBe('kg');
    expect(result.weight.totalGrams).toBeCloseTo(2430, 0); // 2.43kg = 2430g
    expect(result.pricing.type).toBe(PRICING_TYPE.WEIGHT);
    expect(result.validation.canProcess).toBe(true);
  });

  it('handles approximate weight with unit suffix in qty', () => {
    // Some meat invoices show "2.43 kg" in qty column
    const result = processLineV2({
      description: 'BOEUF ENTRECOTE',
      quantity: '5.5', // Plain number
      format: '1/~7KG', // Approximate format
      unitPrice: 45.00,
      totalPrice: 247.50,
    });

    // qty IS the weight (5.5kg, unit from format)
    expect(result.weight.total).toBe(5.5);
    expect(result.weight.unit).toBe('kg');
    expect(result.weight.totalGrams).toBeCloseTo(5500, 0);
    expect(result.validation.canProcess).toBe(true);
  });
});
