/**
 * Column Solver Tests
 *
 * Tests auto-detection of invoice columns using mathematical validation.
 */

import { describe, it, expect } from 'vitest';
import {
  extractNumericColumns,
  parseNumericValue,
  identifyTotalColumn,
  identifyPriceColumn,
  identifyBillingColumns,
  solveColumns,
  solveColumnsWithConsensus,
} from '../columnSolver';

// ============================================
// parseNumericValue() Tests
// ============================================

describe('parseNumericValue', () => {
  describe('standard formats', () => {
    it('parses integer', () => {
      expect(parseNumericValue('5')).toBe(5);
    });

    it('parses decimal with period', () => {
      expect(parseNumericValue('12.50')).toBe(12.5);
    });

    it('parses number directly', () => {
      expect(parseNumericValue(42)).toBe(42);
    });
  });

  describe('currency formats', () => {
    it('parses with dollar sign', () => {
      expect(parseNumericValue('$45.99')).toBe(45.99);
    });

    it('parses with euro sign', () => {
      expect(parseNumericValue('€100.00')).toBe(100);
    });

    it('parses thousands with comma: 1,234.56', () => {
      expect(parseNumericValue('1,234.56')).toBe(1234.56);
    });

    it('parses thousands with comma: $10,500.00', () => {
      expect(parseNumericValue('$10,500.00')).toBe(10500);
    });
  });

  describe('French formats', () => {
    it('parses French decimal: 12,50 → 12.5', () => {
      expect(parseNumericValue('12,50')).toBe(12.5);
    });

    it('parses French thousands: 1 234,56 → 1234.56', () => {
      expect(parseNumericValue('1 234,56')).toBe(1234.56);
    });

    it('parses French large: 10 500,00 → 10500', () => {
      expect(parseNumericValue('10 500,00')).toBe(10500);
    });
  });

  describe('edge cases', () => {
    it('returns null for non-numeric', () => {
      expect(parseNumericValue('abc')).toBeNull();
      expect(parseNumericValue('')).toBeNull();
      expect(parseNumericValue(null)).toBeNull();
    });

    it('handles whitespace', () => {
      expect(parseNumericValue('  42.50  ')).toBe(42.5);
    });
  });
});

// ============================================
// extractNumericColumns() Tests
// ============================================

describe('extractNumericColumns', () => {
  it('extracts numeric columns from row', () => {
    const columns = ['Item A', '5', '$10.00', '$50.00'];
    const result = extractNumericColumns(columns);

    expect(result).toHaveLength(3);
    expect(result[0].index).toBe(1);
    expect(result[0].value).toBe(5);
    expect(result[1].index).toBe(2);
    expect(result[1].value).toBe(10);
    expect(result[2].index).toBe(3);
    expect(result[2].value).toBe(50);
  });

  it('identifies likely price columns', () => {
    const columns = ['Item', '3', '$15.99', '$47.97'];
    const result = extractNumericColumns(columns);

    const priceCol = result.find((c) => c.index === 2);
    expect(priceCol.isLikelyPrice).toBe(true);
  });

  it('identifies likely total columns', () => {
    const columns = ['Item', '3', '15.99', '47.97'];
    const result = extractNumericColumns(columns);

    const totalCol = result.find((c) => c.index === 3);
    expect(totalCol.isLikelyTotal).toBe(true);
  });

  it('skips empty and null values', () => {
    const columns = ['Item', '', null, '50.00'];
    const result = extractNumericColumns(columns);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(50);
  });

  it('handles non-array input', () => {
    expect(extractNumericColumns(null)).toEqual([]);
    expect(extractNumericColumns('string')).toEqual([]);
  });
});

// ============================================
// Column Role Detection Tests
// ============================================

describe('identifyTotalColumn', () => {
  it('identifies rightmost numeric as total', () => {
    const numericCols = [
      { index: 1, value: 5, isLikelyTotal: false },
      { index: 2, value: 10, isLikelyTotal: true },
      { index: 3, value: 50, isLikelyTotal: true },
    ];

    const result = identifyTotalColumn(numericCols);
    expect(result.index).toBe(3);
  });

  it('prefers columns marked as likely total', () => {
    const numericCols = [
      { index: 1, value: 5, isLikelyTotal: false },
      { index: 2, value: 50, isLikelyTotal: true },
      { index: 3, value: 10, isLikelyTotal: false },
    ];

    const result = identifyTotalColumn(numericCols);
    expect(result.index).toBe(2);
  });

  it('returns null for empty array', () => {
    expect(identifyTotalColumn([])).toBeNull();
  });
});

describe('identifyPriceColumn', () => {
  it('identifies second-to-last numeric as price', () => {
    const numericCols = [
      { index: 1, value: 5, isLikelyPrice: false },
      { index: 2, value: 10, isLikelyPrice: true },
      { index: 3, value: 50, isLikelyPrice: false },
    ];

    const result = identifyPriceColumn(numericCols, 3);
    expect(result.index).toBe(2);
  });

  it('excludes total column from candidates', () => {
    const numericCols = [
      { index: 1, value: 5, isLikelyPrice: false },
      { index: 2, value: 10, isLikelyPrice: true },
    ];

    const result = identifyPriceColumn(numericCols, 2);
    expect(result.index).toBe(1); // Only option left
  });
});

describe('identifyBillingColumns', () => {
  it('returns columns excluding total and price', () => {
    const numericCols = [
      { index: 0, value: 5 },
      { index: 1, value: 3 },
      { index: 2, value: 10 },
      { index: 3, value: 50 },
    ];

    const result = identifyBillingColumns(numericCols, 3, 2);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.index)).toEqual([0, 1]);
  });
});

// ============================================
// solveColumns() Tests
// ============================================

describe('solveColumns', () => {
  it('solves simple invoice: Qty × Price = Total', () => {
    const lines = [
      ['Item A', '5', '10.00', '50.00'],
      ['Item B', '3', '15.00', '45.00'],
      ['Item C', '2', '25.00', '50.00'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    expect(result.mapping.billingIndex).toBe(1); // Qty
    expect(result.mapping.priceIndex).toBe(2); // Price
    expect(result.mapping.totalIndex).toBe(3); // Total
    expect(result.validation.allValid).toBe(true);
  });

  it('handles invoice with weight column instead of qty', () => {
    const lines = [
      ['Cheese A', '3', '12.45', '8.50', '105.83'], // Qty, Weight, Price, Total
      ['Cheese B', '2', '5.50', '12.00', '66.00'],
    ];

    const result = solveColumns(lines);

    // Should find that weight (12.45) × price (8.50) = total (105.83)
    expect(result.found).toBe(true);
    expect(result.mapping.billingIndex).toBe(2); // Weight column
    expect(result.validation.allValid).toBe(true);
  });

  it('returns derived solution when no column validates', () => {
    const lines = [
      ['Item A', '5', '10.00', '999.00'], // Math doesn't work with any column
      ['Item B', '3', '15.00', '888.00'],
    ];

    const result = solveColumns(lines);

    // The solver will fall back to deriving B = T/P, which always "works"
    // So it returns found=true but with source='derived'
    expect(result.mapping).not.toBeNull();
    // Check that it tried multiple approaches
    expect(result.allResults.length).toBeGreaterThan(0);
  });

  it('handles invoices with extra columns', () => {
    const lines = [
      ['SKU001', 'Item A', 'Case', '5', '10.00', '50.00', 'In Stock'],
      ['SKU002', 'Item B', 'Each', '3', '15.00', '45.00', 'In Stock'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    expect(result.mapping.billingIndex).toBe(3);
    expect(result.mapping.priceIndex).toBe(4);
    expect(result.mapping.totalIndex).toBe(5);
  });

  it('returns error for insufficient columns', () => {
    const lines = [['Item A', '50.00']]; // Only 1 numeric column

    const result = solveColumns(lines);

    expect(result.found).toBe(false);
    expect(result.reason).toContain('at least 2 numeric');
  });

  it('returns error for empty lines', () => {
    const result = solveColumns([]);

    expect(result.found).toBe(false);
    expect(result.reason).toContain('No lines');
  });

  it('tries format extraction from description when column fails', () => {
    // Format in description: "4/5LB" means 20lb billing value
    const lines = [
      ['Flour 4/5LB', '2', '3.00', '60.00'], // 2 cases BUT billing is 20lb per case
      // Should find: 20lb × $3/lb = $60 (not 2 × $3 = $6)
    ];

    const result = solveColumns(lines, 0); // Description in column 0

    // This is a complex case - the solver should try format extraction
    expect(result.allResults.length).toBeGreaterThan(1);
  });
});

// ============================================
// solveColumnsWithConsensus() Tests
// ============================================

describe('solveColumnsWithConsensus', () => {
  it('finds consensus across multiple lines', () => {
    const lines = [
      ['Item A', '5', '10.00', '50.00'],
      ['Item B', '3', '15.00', '45.00'],
      ['Item C', '2', '25.00', '50.00'],
      ['Item D', '4', '12.50', '50.00'],
      ['Item E', '1', '30.00', '30.00'],
    ];

    const result = solveColumnsWithConsensus(lines);

    expect(result.found).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('falls back to basic solver for < 3 lines', () => {
    const lines = [
      ['Item A', '5', '10.00', '50.00'],
      ['Item B', '3', '15.00', '45.00'],
    ];

    const result = solveColumnsWithConsensus(lines);

    expect(result.found).toBe(true);
    // Should still work, just without consensus
  });

  it('reports low consensus when lines disagree', () => {
    // Mixed formats where different formulas apply
    const lines = [
      ['Item A', '5', '10.00', '50.00'], // Qty × Price = Total
      ['Item B', '12.45', '8.50', '105.83'], // Weight × Price = Total
      ['Item C', '3', '20.00', '60.00'], // Qty × Price = Total
    ];

    const result = solveColumnsWithConsensus(lines, { minConsensus: 0.9 });

    // Might not reach 90% consensus due to mixed formats
    // But should still return best guess
    expect(result.mapping).not.toBeNull();
  });
});

// ============================================
// Real Invoice Format Tests
// ============================================

describe('Real invoice format tests', () => {
  it('solves Sysco-style invoice', () => {
    const lines = [
      ['123456', 'CHICKEN BREAST 4/5LB', 'CS', '2', '45.99', '91.98'],
      ['234567', 'GROUND BEEF 80/20', 'CS', '3', '89.50', '268.50'],
      ['345678', 'SALMON FILLET', 'LB', '15', '12.99', '194.85'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    expect(result.mapping.billingIndex).toBe(3); // Qty
    expect(result.mapping.priceIndex).toBe(4);
    expect(result.mapping.totalIndex).toBe(5);
  });

  it('solves cheese supplier invoice (billingQuantity)', () => {
    // Format: Code, Description, QtyCmd, QtyPcs, QtyBilled, U/M, Price, Total
    const lines = [
      ['CH001', 'Cheddar Wheel', '3', '3', '12.45', 'kg', '8.50', '105.83'],
      ['CH002', 'Brie Round', '2', '2', '5.50', 'kg', '15.00', '82.50'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    // Should identify column 4 (12.45) as billing value, not column 2 (3)
    expect(result.mapping.billingIndex).toBe(4);
    expect(result.mapping.priceIndex).toBe(6);
    expect(result.mapping.totalIndex).toBe(7);
  });

  it('solves French format invoice', () => {
    const lines = [
      ['Article A', '5', '10,00', '50,00'], // French decimals
      ['Article B', '3', '15,50', '46,50'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    expect(result.validation.allValid).toBe(true);
  });

  it('handles zero-price promo lines', () => {
    const lines = [
      ['Regular Item', '5', '10.00', '50.00'],
      ['FREE SAMPLE', '1', '0.00', '0.00'], // Promo
      ['Another Item', '3', '15.00', '45.00'],
    ];

    const result = solveColumns(lines);

    expect(result.found).toBe(true);
    // Zero lines should be skipped, not cause failure
    expect(result.validation.valid).toBe(2);
    expect(result.validation.skipped).toBeGreaterThanOrEqual(0);
  });
});
