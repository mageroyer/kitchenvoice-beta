/**
 * Line Validator Tests
 *
 * Tests the B × P = T formula validation for invoice lines.
 */

import { describe, it, expect } from 'vitest';
import {
  validateLine,
  findValidFormula,
  validateAllLines,
  deriveValue,
} from '../lineValidator';
import { VALIDATION_STATUS, FORMULA_TYPE } from '../types';

// ============================================
// validateLine() Tests
// ============================================

describe('validateLine', () => {
  describe('valid calculations', () => {
    it('validates exact match: 5 × $10.00 = $50.00', () => {
      const result = validateLine(5, 10.0, 50.0);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
      expect(result.isValid).toBe(true);
      expect(result.calculated).toBe(50.0);
      expect(result.difference).toBe(0);
    });

    it('validates with decimals: 2.5 × $4.00 = $10.00', () => {
      const result = validateLine(2.5, 4.0, 10.0);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
      expect(result.calculated).toBe(10.0);
    });

    it('validates weight pricing: 12.45kg × $8.50/kg = $105.83', () => {
      const result = validateLine(12.45, 8.5, 105.83);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
      // 12.45 * 8.5 = 105.825, rounds to 105.82 with banker's rounding
      expect(result.calculated).toBeCloseTo(105.83, 1);
    });

    it('validates within tolerance: calculated $99.98, expected $100.00', () => {
      // 9.998 × 10 = 99.98, but invoice says 100.00 (within $0.02 tolerance)
      const result = validateLine(9.998, 10.0, 100.0);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
      expect(result.difference).toBeLessThanOrEqual(result.tolerance);
    });

    it('validates large amounts: 100 × $250.00 = $25,000.00', () => {
      const result = validateLine(100, 250.0, 25000.0);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
    });
  });

  describe('invalid calculations', () => {
    it('rejects wrong total: 5 × $10.00 ≠ $60.00', () => {
      const result = validateLine(5, 10.0, 60.0);
      expect(result.status).toBe(VALIDATION_STATUS.INVALID);
      expect(result.isValid).toBe(false);
      expect(result.calculated).toBe(50.0);
      expect(result.expected).toBe(60.0);
      expect(result.difference).toBe(10.0);
    });

    it('rejects significant difference: $100 vs $150', () => {
      const result = validateLine(10, 10.0, 150.0);
      expect(result.status).toBe(VALIDATION_STATUS.INVALID);
      expect(result.difference).toBe(50.0);
    });
  });

  describe('edge cases', () => {
    it('skips zero price lines (sample/promo)', () => {
      const result = validateLine(5, 0, 0);
      expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
      expect(result.reason).toContain('Zero price');
    });

    it('handles missing billing value', () => {
      const result = validateLine(null, 10.0, 50.0);
      expect(result.status).toBe(VALIDATION_STATUS.INVALID);
      expect(result.reason).toContain('Missing required values');
    });

    it('handles missing unit price', () => {
      const result = validateLine(5, null, 50.0);
      expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    });

    it('handles missing total', () => {
      const result = validateLine(5, 10.0, null);
      expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    });

    it('handles fractional cents correctly', () => {
      // 3 × $3.33 = $9.99
      const result = validateLine(3, 3.33, 9.99);
      expect(result.status).toBe(VALIDATION_STATUS.VALID);
    });
  });
});

// ============================================
// findValidFormula() Tests
// ============================================

describe('findValidFormula', () => {
  describe('simple count formula', () => {
    it('finds SIMPLE_COUNT when count × price = total', () => {
      const result = findValidFormula({
        count: 5,
        unitPrice: 10.0,
        totalPrice: 50.0,
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.SIMPLE_COUNT);
      expect(result.bestMatch.billingValue).toBe(5);
    });
  });

  describe('simple weight formula', () => {
    it('finds SIMPLE_WEIGHT when weight × price = total', () => {
      const result = findValidFormula({
        count: 3, // This won't validate
        weight: 12.5, // This will
        unitPrice: 8.0,
        totalPrice: 100.0, // 12.5 × 8 = 100
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.SIMPLE_WEIGHT);
      expect(result.bestMatch.billingValue).toBe(12.5);
    });
  });

  describe('billing quantity formula', () => {
    it('prefers BILLING_QTY when available and valid', () => {
      const result = findValidFormula({
        count: 3, // ordered 3 wheels
        billingQuantity: 12.45, // billed for 12.45 kg
        unitPrice: 8.5,
        totalPrice: 105.83, // 12.45 × 8.5 = 105.825 ≈ 105.83
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.BILLING_QTY);
      expect(result.bestMatch.billingValue).toBe(12.45);
    });
  });

  describe('pack weight formula', () => {
    it('finds PACK_WEIGHT: 2 cases × 4 bags × 5lb = 40lb total', () => {
      const result = findValidFormula({
        count: 2,
        packCount: 4,
        packWeight: 5,
        unitPrice: 2.5, // per lb
        totalPrice: 100.0, // 2 × 4 × 5 × 2.5 = 100
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.PACK_WEIGHT);
      expect(result.bestMatch.billingValue).toBe(40); // 2 × 4 × 5
    });
  });

  describe('pack count formula', () => {
    it('finds PACK_COUNT: 3 cases × 12 units = 36 units', () => {
      const result = findValidFormula({
        count: 3,
        packCount: 12,
        unitPrice: 1.5,
        totalPrice: 54.0, // 3 × 12 × 1.5 = 54
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.PACK_COUNT);
      expect(result.bestMatch.billingValue).toBe(36);
    });
  });

  describe('embedded weight formula', () => {
    it('finds EMBEDDED_WEIGHT from description parsing', () => {
      const result = findValidFormula({
        count: 1,
        embeddedWeight: 20, // Extracted from "Caisse 20lb"
        unitPrice: 3.0,
        totalPrice: 60.0,
      });

      expect(result.found).toBe(true);
      expect(result.bestMatch.formulaType).toBe(FORMULA_TYPE.EMBEDDED_WEIGHT);
    });
  });

  describe('no valid formula', () => {
    it('returns found=false when no formula validates', () => {
      const result = findValidFormula({
        count: 5,
        weight: 10,
        unitPrice: 3.0,
        totalPrice: 999.0, // Nothing validates
      });

      expect(result.found).toBe(false);
      expect(result.bestMatch).not.toBeNull(); // Returns closest match
    });

    it('returns closest match when nothing validates', () => {
      const result = findValidFormula({
        count: 5,
        unitPrice: 10.0,
        totalPrice: 55.0, // Off by $5
      });

      expect(result.found).toBe(false);
      expect(result.bestMatch.difference).toBe(5.0);
    });
  });
});

// ============================================
// validateAllLines() Tests
// ============================================

describe('validateAllLines', () => {
  it('validates multiple lines correctly', () => {
    const lines = [
      { quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { quantity: 3, unitPrice: 15.0, totalPrice: 45.0 },
      { quantity: 2, unitPrice: 25.0, totalPrice: 50.0 },
    ];

    const result = validateAllLines(lines);

    expect(result.summary.total).toBe(3);
    expect(result.summary.valid).toBe(3);
    expect(result.summary.invalid).toBe(0);
    expect(result.summary.validRate).toBe(100);
    expect(result.allValid).toBe(true);
  });

  it('reports invalid lines correctly', () => {
    const lines = [
      { quantity: 5, unitPrice: 10.0, totalPrice: 50.0 }, // Valid
      { quantity: 3, unitPrice: 15.0, totalPrice: 99.0 }, // Invalid (should be 45)
      { quantity: 2, unitPrice: 25.0, totalPrice: 50.0 }, // Valid
    ];

    const result = validateAllLines(lines);

    expect(result.summary.valid).toBe(2);
    expect(result.summary.invalid).toBe(1);
    expect(result.allValid).toBe(false);
    expect(result.summary.validRate).toBeCloseTo(66.67, 1);
  });

  it('handles weight-based lines', () => {
    const lines = [
      { weight: 12.45, unitPrice: 8.5, totalPrice: 105.83 },
      { weight: 5.5, unitPrice: 12.0, totalPrice: 66.0 },
    ];

    const result = validateAllLines(lines);

    expect(result.summary.valid).toBe(2);
    expect(result.allValid).toBe(true);
  });

  it('skips zero-price lines in rate calculation', () => {
    const lines = [
      { quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { quantity: 1, unitPrice: 0, totalPrice: 0 }, // Sample/promo
      { quantity: 2, unitPrice: 25.0, totalPrice: 50.0 },
    ];

    const result = validateAllLines(lines);

    expect(result.summary.skipped).toBe(1);
    expect(result.summary.valid).toBe(2);
  });

  it('returns line numbers for debugging', () => {
    const lines = [
      { description: 'Item A', quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { description: 'Item B', quantity: 3, unitPrice: 15.0, totalPrice: 45.0 },
    ];

    const result = validateAllLines(lines);

    expect(result.results[0].lineNumber).toBe(1);
    expect(result.results[0].description).toBe('Item A');
    expect(result.results[1].lineNumber).toBe(2);
  });
});

// ============================================
// deriveValue() Tests
// ============================================

describe('deriveValue', () => {
  it('derives T from B and P: 5 × 10 = ?', () => {
    const result = deriveValue({ B: 5, P: 10 });
    expect(result.derived).toBe('T');
    expect(result.value).toBe(50);
  });

  it('derives P from B and T: 5 × ? = 50', () => {
    const result = deriveValue({ B: 5, T: 50 });
    expect(result.derived).toBe('P');
    expect(result.value).toBe(10);
  });

  it('derives B from P and T: ? × 10 = 50', () => {
    const result = deriveValue({ P: 10, T: 50 });
    expect(result.derived).toBe('B');
    expect(result.value).toBe(5);
  });

  it('handles decimal results', () => {
    const result = deriveValue({ B: 3, T: 10 });
    expect(result.derived).toBe('P');
    expect(result.value).toBeCloseTo(3.33, 2);
  });

  it('returns error when not enough values', () => {
    const result = deriveValue({ B: 5 });
    expect(result.derived).toBeNull();
    expect(result.error).toContain('Need exactly 2 known values');
  });

  it('returns error when all values provided', () => {
    const result = deriveValue({ B: 5, P: 10, T: 50 });
    // All values known - nothing to derive
    expect(result.derived).toBeNull();
  });
});
