/**
 * Cascade Validator Tests
 *
 * Tests the full validation cascade: Sum → TPS → TVQ → Total
 * with Quebec tax compound rules.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSum,
  validateTPS,
  validateTVQ,
  validateTaxes,
  validateGrandTotal,
  validateCascade,
  isInvoiceMathValid,
  getValidationSummary,
} from '../cascadeValidator';
import { VALIDATION_STATUS, QUEBEC_TAX } from '../types';

// ============================================
// Sum Validation Tests
// ============================================

describe('validateSum', () => {
  it('validates correct line sum', () => {
    const lineTotals = [50.00, 75.00, 125.00];
    const result = validateSum(lineTotals, 250.00);

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.isValid).toBe(true);
    expect(result.calculated).toBe(250.00);
    expect(result.expected).toBe(250.00);
    expect(result.difference).toBe(0);
  });

  it('validates within tolerance', () => {
    const lineTotals = [33.33, 33.33, 33.33]; // = 99.99
    const result = validateSum(lineTotals, 100.00); // $0.01 difference

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.difference).toBeLessThanOrEqual(result.tolerance);
  });

  it('rejects incorrect sum', () => {
    const lineTotals = [50.00, 75.00];
    const result = validateSum(lineTotals, 200.00); // Should be 125

    expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    expect(result.calculated).toBe(125.00);
    expect(result.expected).toBe(200.00);
    expect(result.difference).toBe(75.00);
  });

  it('handles empty line totals', () => {
    const result = validateSum([], 100.00);
    expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    expect(result.reason).toContain('No line totals');
  });

  it('skips when subtotal not available', () => {
    const result = validateSum([50.00, 50.00], null);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
  });

  it('handles string numbers', () => {
    const lineTotals = ['50.00', '25.00', '25.00'];
    const result = validateSum(lineTotals, 100.00);
    expect(result.status).toBe(VALIDATION_STATUS.VALID);
  });

  it('returns line count in result', () => {
    const lineTotals = [10, 20, 30, 40, 50];
    const result = validateSum(lineTotals, 150.00);
    expect(result.lineCount).toBe(5);
  });
});

// ============================================
// TPS (GST) Validation Tests
// ============================================

describe('validateTPS', () => {
  it('validates correct TPS: $100 × 5% = $5.00', () => {
    const result = validateTPS(100.00, 5.00);

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.isValid).toBe(true);
    expect(result.calculated).toBe(5.00);
    expect(result.rate).toBe(QUEBEC_TAX.TPS_RATE);
  });

  it('validates TPS on larger amount: $450 × 5% = $22.50', () => {
    const result = validateTPS(450.00, 22.50);
    expect(result.status).toBe(VALIDATION_STATUS.VALID);
  });

  it('validates within tolerance', () => {
    const result = validateTPS(100.00, 5.01); // $0.01 off
    expect(result.status).toBe(VALIDATION_STATUS.VALID);
  });

  it('rejects incorrect TPS', () => {
    const result = validateTPS(100.00, 10.00); // Should be $5

    expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    expect(result.calculated).toBe(5.00);
    expect(result.expected).toBe(10.00);
  });

  it('skips for tax-exempt (TPS = 0)', () => {
    const result = validateTPS(100.00, 0);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
    expect(result.isTaxExempt).toBe(true);
  });

  it('skips for null TPS', () => {
    const result = validateTPS(100.00, null);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
  });

  it('skips when subtotal not available', () => {
    const result = validateTPS(null, 5.00);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
  });
});

// ============================================
// TVQ (QST) Validation Tests - COMPOUND RULE
// ============================================

describe('validateTVQ', () => {
  it('validates TVQ with compound rule: (100 + 5) × 9.975% = $10.47', () => {
    // TVQ is calculated on (Subtotal + TPS), not just Subtotal
    const subtotal = 100.00;
    const tps = 5.00;
    // Expected TVQ = (100 + 5) × 0.09975 = 10.47375 ≈ $10.47
    const result = validateTVQ(subtotal, tps, 10.47);

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.isCompound).toBe(true);
    expect(result.taxBase).toBe(105.00); // Subtotal + TPS
  });

  it('validates TVQ on $450 subtotal', () => {
    const subtotal = 450.00;
    const tps = 22.50; // 450 × 5%
    // TVQ = (450 + 22.50) × 9.975% = 47.13...
    const expectedTVQ = Math.round((subtotal + tps) * 0.09975 * 100) / 100;

    const result = validateTVQ(subtotal, tps, expectedTVQ);
    expect(result.status).toBe(VALIDATION_STATUS.VALID);
  });

  it('rejects TVQ calculated on subtotal only (wrong formula)', () => {
    const subtotal = 100.00;
    const tps = 5.00;
    // WRONG: TVQ = 100 × 9.975% = $9.975 ≈ $9.98
    // CORRECT: TVQ = (100 + 5) × 9.975% = $10.47
    const wrongTVQ = Math.round(subtotal * 0.09975 * 100) / 100; // $9.98

    const result = validateTVQ(subtotal, tps, wrongTVQ);
    // This should fail because the correct TVQ is $10.47
    expect(result.difference).toBeGreaterThan(0.4);
  });

  it('skips for tax-exempt (TVQ = 0)', () => {
    const result = validateTVQ(100.00, 5.00, 0);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
    expect(result.isTaxExempt).toBe(true);
  });

  it('handles missing TPS (treats as 0)', () => {
    const subtotal = 100.00;
    const result = validateTVQ(subtotal, null, 9.98);
    // If TPS is null, taxBase = subtotal only
    expect(result.taxBase).toBe(100.00);
  });
});

// ============================================
// Combined Tax Validation Tests
// ============================================

describe('validateTaxes', () => {
  it('validates both TPS and TVQ together', () => {
    const subtotal = 450.00;
    const tps = 22.50; // 450 × 5%
    const tvq = 47.14; // (450 + 22.50) × 9.975%

    const result = validateTaxes(subtotal, tps, tvq);

    expect(result.tps.isValid).toBe(true);
    expect(result.tvq.isValid).toBe(true);
    expect(result.summary.bothValid).toBe(true);
  });

  it('reports tax-exempt invoices', () => {
    const result = validateTaxes(450.00, 0, 0);

    expect(result.summary.isTaxExempt).toBe(true);
    expect(result.summary.bothValid).toBe(true); // Tax-exempt is valid
  });

  it('calculates expected total taxes', () => {
    const result = validateTaxes(100.00, 5.00, 10.47);

    expect(result.summary.expectedTotal).toBeCloseTo(15.47, 1);
  });

  it('detects when only TPS is wrong', () => {
    const result = validateTaxes(100.00, 10.00, 10.47); // TPS wrong (should be 5.00)

    expect(result.tps.isValid).toBe(false);
    expect(result.tps.calculated).toBe(5.00); // Expected TPS
    expect(result.tps.expected).toBe(10.00); // What invoice said

    // TVQ validation uses the provided TPS (10.00), so:
    // Tax base = 100 + 10 = 110
    // Expected TVQ = 110 × 9.975% = 10.97 (approximately)
    // But invoice says 10.47, so TVQ will also fail
    expect(result.tvq.calculated).toBeCloseTo(10.97, 1);
  });
});

// ============================================
// Grand Total Validation Tests
// ============================================

describe('validateGrandTotal', () => {
  it('validates: $450 + $22.50 + $47.14 = $519.64', () => {
    const result = validateGrandTotal(450.00, 22.50, 47.14, 519.64);

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.calculated).toBe(519.64);
    expect(result.components.subtotal).toBe(450.00);
    expect(result.components.tps).toBe(22.50);
    expect(result.components.tvq).toBe(47.14);
  });

  it('validates with missing taxes (tax-exempt)', () => {
    const result = validateGrandTotal(100.00, null, null, 100.00);

    expect(result.status).toBe(VALIDATION_STATUS.VALID);
    expect(result.calculated).toBe(100.00);
  });

  it('rejects incorrect total', () => {
    const result = validateGrandTotal(100.00, 5.00, 10.47, 200.00);

    expect(result.status).toBe(VALIDATION_STATUS.INVALID);
    expect(result.calculated).toBe(115.47);
    expect(result.expected).toBe(200.00);
  });

  it('skips when required values missing', () => {
    const result = validateGrandTotal(null, 5.00, 10.47, 100.00);
    expect(result.status).toBe(VALIDATION_STATUS.SKIPPED);
  });
});

// ============================================
// Full Cascade Validation Tests
// ============================================

describe('validateCascade', () => {
  it('validates complete invoice with all checks passing', () => {
    const invoice = {
      lineTotals: [150.00, 200.00, 100.00], // Sum = 450
      subtotal: 450.00,
      tps: 22.50,
      tvq: 47.14,
      grandTotal: 519.64,
    };

    const result = validateCascade(invoice);

    expect(result.summary.allValid).toBe(true);
    expect(result.results.sum.isValid).toBe(true);
    expect(result.results.tps.isValid).toBe(true);
    expect(result.results.tvq.isValid).toBe(true);
    expect(result.results.total.isValid).toBe(true);
  });

  it('detects sum mismatch', () => {
    const invoice = {
      lineTotals: [100.00, 100.00], // Sum = 200
      subtotal: 450.00, // Wrong!
      tps: 22.50,
      tvq: 47.14,
      grandTotal: 519.64,
    };

    const result = validateCascade(invoice);

    expect(result.summary.allValid).toBe(false);
    expect(result.results.sum.isValid).toBe(false);
  });

  it('handles tax-exempt invoice', () => {
    const invoice = {
      lineTotals: [50.00, 50.00],
      subtotal: 100.00,
      tps: 0,
      tvq: 0,
      grandTotal: 100.00,
    };

    const result = validateCascade(invoice);

    expect(result.summary.allValid).toBe(true);
    expect(result.summary.taxSummary.isTaxExempt).toBe(true);
  });

  it('returns cascade array for step-by-step display', () => {
    const invoice = {
      lineTotals: [100.00],
      subtotal: 100.00,
      tps: 5.00,
      tvq: 10.47,
      grandTotal: 115.47,
    };

    const result = validateCascade(invoice);

    expect(result.cascade).toHaveLength(4);
    // Level names match VALIDATION_LEVEL enum from types.js
    expect(result.cascade[0].level).toBe('SUM');
    expect(result.cascade[1].level).toBe('TAX_TPS');
    expect(result.cascade[2].level).toBe('TAX_TVQ');
    expect(result.cascade[3].level).toBe('TOTAL');
  });

  it('counts valid/invalid/skipped correctly', () => {
    const invoice = {
      lineTotals: [100.00],
      subtotal: 100.00,
      tps: null, // Will be skipped
      tvq: null, // Will be skipped
      grandTotal: 100.00,
    };

    const result = validateCascade(invoice);

    expect(result.summary.skippedCount).toBe(2); // TPS and TVQ
    // validCount includes both VALID and SKIPPED statuses (non-invalid)
    expect(result.summary.validCount).toBe(4); // Sum, TPS(skipped), TVQ(skipped), Total
    expect(result.summary.invalidCount).toBe(0);
  });
});

// ============================================
// Quick Validation Helpers
// ============================================

describe('isInvoiceMathValid', () => {
  it('returns true for valid invoice', () => {
    const invoice = {
      lineTotals: [100.00],
      subtotal: 100.00,
      tps: 5.00,
      tvq: 10.47,
      grandTotal: 115.47,
    };

    expect(isInvoiceMathValid(invoice)).toBe(true);
  });

  it('returns false for invalid invoice', () => {
    const invoice = {
      lineTotals: [100.00],
      subtotal: 999.00, // Wrong
      tps: 5.00,
      tvq: 10.47,
      grandTotal: 115.47,
    };

    expect(isInvoiceMathValid(invoice)).toBe(false);
  });
});

describe('getValidationSummary', () => {
  it('returns success message for valid invoice', () => {
    const result = validateCascade({
      lineTotals: [100.00],
      subtotal: 100.00,
      tps: 5.00,
      tvq: 10.47,
      grandTotal: 115.47,
    });

    const summary = getValidationSummary(result);
    expect(summary).toContain('validates correctly');
  });

  it('returns issue details for invalid invoice', () => {
    const result = validateCascade({
      lineTotals: [100.00],
      subtotal: 999.00,
      tps: 5.00,
      tvq: 10.47,
      grandTotal: 115.47,
    });

    const summary = getValidationSummary(result);
    expect(summary).toContain('Line sum off');
  });
});

// ============================================
// Real-World Invoice Scenarios
// ============================================

describe('Real-world invoice scenarios', () => {
  it('validates Sysco-style invoice', () => {
    // Typical food distributor invoice
    const invoice = {
      lineTotals: [
        45.99, 89.50, 125.00, 34.25, 67.80,
        23.45, 156.00, 42.75, 88.99, 76.27
      ],
      subtotal: 750.00,
      tps: 37.50,
      tvq: 78.56,
      grandTotal: 866.06,
    };

    const result = validateCascade(invoice);
    expect(result.summary.allValid).toBe(true);
  });

  it('validates cheese supplier invoice (weight-based)', () => {
    // Fromager invoice: multiple cheese wheels sold by weight
    const invoice = {
      lineTotals: [105.83, 89.25, 67.50], // Weight × price/kg
      subtotal: 262.58,
      tps: 13.13,
      tvq: 27.50,
      grandTotal: 303.21,
    };

    const result = validateCascade(invoice);
    expect(result.summary.allValid).toBe(true);
  });

  it('detects common "forgot to add deposit" error', () => {
    // User added products but forgot deposit lines affect subtotal
    const invoice = {
      lineTotals: [50.00, 75.00], // Products only
      subtotal: 135.00, // Includes $10 deposit
      tps: 6.75,
      tvq: 14.15,
      grandTotal: 155.90,
    };

    const result = validateCascade(invoice);
    expect(result.results.sum.isValid).toBe(false);
    expect(result.results.sum.difference).toBe(10.00); // The missing deposit
  });
});
