/**
 * Unit Tests for stockCalculations.js
 *
 * Tests all stock calculation utility functions including:
 * - Percentage calculations
 * - Status determination
 * - Stock display formatting
 * - Urgency sorting
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePercentage,
  getStatusFromPercentage,
  formatStockDisplay,
  formatNumber,
  formatPercentage,
  formatPercentagePrecise,
  sortByUrgency,
  groupByStatus,
  getStockSummary,
  calculateReorderQuantity,
  calculateReorderWithBuffer,
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  getAccessibleStatusDescription,
  getAriaAttributes,
  STOCK_STATUS,
  DEFAULT_THRESHOLDS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS
} from '../stockCalculations.js';

// ============================================
// CALCULATE PERCENTAGE
// ============================================

describe('calculatePercentage', () => {
  it('should calculate 50 of 100 as 50%', () => {
    expect(calculatePercentage(50, 100)).toBe(50);
  });

  it('should calculate 0 of 100 as 0%', () => {
    expect(calculatePercentage(0, 100)).toBe(0);
  });

  it('should calculate 100 of 100 as 100%', () => {
    expect(calculatePercentage(100, 100)).toBe(100);
  });

  it('should calculate 150 of 100 as 150% (overstocked)', () => {
    expect(calculatePercentage(150, 100)).toBe(150);
  });

  it('should handle 0 of 0 gracefully', () => {
    // When full is 0 and current is 0, return 0
    const result = calculatePercentage(0, 0);
    expect(result).toBe(0);
  });

  it('should return 100 when full is 0 but current has stock', () => {
    // If no target defined but we have stock, consider it 100%
    expect(calculatePercentage(5, 0)).toBe(100);
  });

  it('should treat negative current as 0%', () => {
    expect(calculatePercentage(-5, 100)).toBe(0);
    expect(calculatePercentage(-10, 50)).toBe(0);
  });

  it('should calculate decimal values correctly', () => {
    expect(calculatePercentage(1.5, 3)).toBe(50);
    expect(calculatePercentage(2.5, 10)).toBe(25);
    expect(calculatePercentage(0.25, 1)).toBe(25);
  });

  it('should round to avoid floating point issues', () => {
    // 1/3 = 33.333... should be rounded
    const result = calculatePercentage(1, 3);
    expect(result).toBeCloseTo(33.33, 1);
  });

  it('should handle NaN and invalid inputs', () => {
    expect(calculatePercentage(NaN, 100)).toBe(0);
    expect(calculatePercentage(50, NaN)).toBe(100); // has stock, no valid full
    expect(calculatePercentage('invalid', 100)).toBe(0);
    expect(calculatePercentage(50, 'invalid')).toBe(100);
  });

  it('should handle null and undefined', () => {
    expect(calculatePercentage(null, 100)).toBe(0);
    expect(calculatePercentage(undefined, 100)).toBe(0);
    expect(calculatePercentage(50, null)).toBe(100);
    expect(calculatePercentage(50, undefined)).toBe(100);
  });
});

// ============================================
// GET STATUS FROM PERCENTAGE
// ============================================

describe('getStatusFromPercentage', () => {
  it('should return "critical" for 5% with default threshold 20', () => {
    expect(getStatusFromPercentage(5)).toBe(STOCK_STATUS.CRITICAL);
  });

  it('should return "low" for 15% with default threshold 20', () => {
    expect(getStatusFromPercentage(15)).toBe(STOCK_STATUS.LOW);
  });

  it('should return "ok" for 25% with default threshold 20', () => {
    expect(getStatusFromPercentage(25)).toBe(STOCK_STATUS.OK);
  });

  it('should return "low" when exactly at threshold (20)', () => {
    expect(getStatusFromPercentage(20)).toBe(STOCK_STATUS.LOW);
  });

  it('should return "critical" when exactly at critical threshold (10)', () => {
    expect(getStatusFromPercentage(10)).toBe(STOCK_STATUS.CRITICAL);
  });

  it('should respect custom thresholds', () => {
    // Custom: threshold 30, critical 15
    expect(getStatusFromPercentage(10, 30, 15)).toBe(STOCK_STATUS.CRITICAL);
    expect(getStatusFromPercentage(20, 30, 15)).toBe(STOCK_STATUS.LOW);
    expect(getStatusFromPercentage(35, 30, 15)).toBe(STOCK_STATUS.OK);
  });

  it('should handle threshold equal to critical', () => {
    // When both are same, anything at or below is critical
    expect(getStatusFromPercentage(15, 15, 15)).toBe(STOCK_STATUS.CRITICAL);
    expect(getStatusFromPercentage(16, 15, 15)).toBe(STOCK_STATUS.OK);
  });

  it('should handle swapped thresholds (critical > threshold)', () => {
    // Should auto-correct: effectiveCritical becomes smaller
    expect(getStatusFromPercentage(5, 10, 20)).toBe(STOCK_STATUS.CRITICAL);
    expect(getStatusFromPercentage(15, 10, 20)).toBe(STOCK_STATUS.LOW);
  });

  it('should return "ok" for high percentages', () => {
    expect(getStatusFromPercentage(50)).toBe(STOCK_STATUS.OK);
    expect(getStatusFromPercentage(100)).toBe(STOCK_STATUS.OK);
    expect(getStatusFromPercentage(150)).toBe(STOCK_STATUS.OK);
  });

  it('should return "ok" for invalid inputs', () => {
    expect(getStatusFromPercentage(NaN)).toBe(STOCK_STATUS.OK);
    expect(getStatusFromPercentage('invalid')).toBe(STOCK_STATUS.OK);
    expect(getStatusFromPercentage(null)).toBe(STOCK_STATUS.OK);
    expect(getStatusFromPercentage(undefined)).toBe(STOCK_STATUS.OK);
  });

  it('should handle negative percentages', () => {
    expect(getStatusFromPercentage(-5)).toBe(STOCK_STATUS.CRITICAL);
  });

  it('should handle zero percentage', () => {
    expect(getStatusFromPercentage(0)).toBe(STOCK_STATUS.CRITICAL);
  });
});

// ============================================
// FORMAT STOCK DISPLAY
// ============================================

describe('formatStockDisplay', () => {
  it('should format integer values with unit', () => {
    expect(formatStockDisplay(5, 10, 'kg')).toBe('5kg / 10kg');
  });

  it('should format decimal values correctly', () => {
    expect(formatStockDisplay(1.25, 5, 'kg')).toBe('1.25kg / 5kg');
  });

  it('should format without full value when not provided', () => {
    expect(formatStockDisplay(5, null, 'kg')).toBe('5kg');
    expect(formatStockDisplay(5, undefined, 'kg')).toBe('5kg');
    expect(formatStockDisplay(5, 0, 'kg')).toBe('5kg');
  });

  it('should format zero current correctly', () => {
    expect(formatStockDisplay(0, 10, 'kg')).toBe('0kg / 10kg');
  });

  it('should handle various units', () => {
    expect(formatStockDisplay(100, 500, 'ml')).toBe('100ml / 500ml');
    expect(formatStockDisplay(2, 12, 'ea')).toBe('2ea / 12ea');
    expect(formatStockDisplay(0.5, 2, 'L')).toBe('0.5L / 2L');
    expect(formatStockDisplay(10, 25, 'lb')).toBe('10lb / 25lb');
  });

  it('should format without unit', () => {
    expect(formatStockDisplay(5, 10)).toBe('5 / 10');
    expect(formatStockDisplay(5, 10, '')).toBe('5 / 10');
  });

  it('should handle empty unit gracefully', () => {
    expect(formatStockDisplay(5, null, '')).toBe('5');
    expect(formatStockDisplay(5, null)).toBe('5');
  });

  it('should trim unit whitespace', () => {
    expect(formatStockDisplay(5, 10, '  kg  ')).toBe('5kg / 10kg');
  });

  it('should handle decimal precision', () => {
    expect(formatStockDisplay(0.333, 1, 'L')).toBe('0.33L / 1L');
    expect(formatStockDisplay(1.999, 5, 'kg')).toBe('2kg / 5kg');
  });
});

// ============================================
// FORMAT NUMBER (helper function)
// ============================================

describe('formatNumber', () => {
  it('should format integers without decimals', () => {
    expect(formatNumber(5)).toBe('5');
    expect(formatNumber(100)).toBe('100');
  });

  it('should format decimals with appropriate precision', () => {
    expect(formatNumber(1.25)).toBe('1.25');
    expect(formatNumber(1.5)).toBe('1.5');
  });

  it('should remove trailing zeros', () => {
    expect(formatNumber(1.50)).toBe('1.5');
    expect(formatNumber(1.00)).toBe('1');
  });

  it('should respect max decimal places', () => {
    expect(formatNumber(1.2345, 2)).toBe('1.23');
    expect(formatNumber(1.2345, 3)).toBe('1.235');
  });

  it('should handle invalid input', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });
});

// ============================================
// FORMAT PERCENTAGE (stock module version)
// ============================================

describe('formatPercentage (stock module)', () => {
  it('should format percentage with % symbol', () => {
    expect(formatPercentage(50)).toBe('50%');
    expect(formatPercentage(100)).toBe('100%');
  });

  it('should round to nearest integer', () => {
    expect(formatPercentage(33.33)).toBe('33%');
    expect(formatPercentage(66.67)).toBe('67%');
  });

  it('should handle overstocked percentage', () => {
    expect(formatPercentage(150)).toBe('150%');
  });

  it('should handle invalid input', () => {
    expect(formatPercentage(NaN)).toBe('0%');
    expect(formatPercentage(null)).toBe('0%');
    expect(formatPercentage('invalid')).toBe('0%');
  });
});

describe('formatPercentagePrecise', () => {
  it('should format with decimal precision', () => {
    expect(formatPercentagePrecise(33.33)).toBe('33.3%');
    expect(formatPercentagePrecise(66.666)).toBe('66.7%');
  });

  it('should remove trailing zeros', () => {
    expect(formatPercentagePrecise(50.00)).toBe('50%');
  });

  it('should respect custom decimal places', () => {
    expect(formatPercentagePrecise(33.333, 2)).toBe('33.33%');
  });
});

// ============================================
// SORT BY URGENCY
// ============================================

describe('sortByUrgency', () => {
  it('should sort mixed statuses with critical first', () => {
    const items = [
      { name: 'A', currentStock: 50, parLevel: 100 },  // 50% - ok
      { name: 'B', currentStock: 5, parLevel: 100 },   // 5% - critical
      { name: 'C', currentStock: 15, parLevel: 100 }   // 15% - low
    ];

    const sorted = sortByUrgency(items);

    expect(sorted[0].name).toBe('B'); // critical
    expect(sorted[1].name).toBe('C'); // low
    expect(sorted[2].name).toBe('A'); // ok
  });

  it('should sort same status by percentage ascending', () => {
    const items = [
      { name: 'A', currentStock: 30, parLevel: 100 },  // 30% - ok
      { name: 'B', currentStock: 50, parLevel: 100 },  // 50% - ok
      { name: 'C', currentStock: 25, parLevel: 100 }   // 25% - ok
    ];

    const sorted = sortByUrgency(items);

    expect(sorted[0].name).toBe('C'); // 25%
    expect(sorted[1].name).toBe('A'); // 30%
    expect(sorted[2].name).toBe('B'); // 50%
  });

  it('should return empty array for empty input', () => {
    expect(sortByUrgency([])).toEqual([]);
  });

  it('should handle all same status sorted by percentage', () => {
    const items = [
      { name: 'A', currentStock: 3, parLevel: 100 },  // 3% - critical
      { name: 'B', currentStock: 8, parLevel: 100 },  // 8% - critical
      { name: 'C', currentStock: 1, parLevel: 100 }   // 1% - critical
    ];

    const sorted = sortByUrgency(items);

    expect(sorted[0].name).toBe('C'); // 1%
    expect(sorted[1].name).toBe('A'); // 3%
    expect(sorted[2].name).toBe('B'); // 8%
  });

  it('should not modify original array', () => {
    const items = [
      { name: 'A', currentStock: 50, parLevel: 100 },
      { name: 'B', currentStock: 5, parLevel: 100 }
    ];

    const original = [...items];
    sortByUrgency(items);

    expect(items[0].name).toBe(original[0].name);
    expect(items[1].name).toBe(original[1].name);
  });

  it('should handle non-array input', () => {
    expect(sortByUrgency(null)).toEqual([]);
    expect(sortByUrgency(undefined)).toEqual([]);
    expect(sortByUrgency('string')).toEqual([]);
  });

  it('should respect custom field names', () => {
    const items = [
      { name: 'A', stock: 50, max: 100 },
      { name: 'B', stock: 5, max: 100 }
    ];

    const sorted = sortByUrgency(items, {
      currentStockField: 'stock',
      fullStockField: 'max'
    });

    expect(sorted[0].name).toBe('B'); // 5% critical
    expect(sorted[1].name).toBe('A'); // 50% ok
  });

  it('should respect custom thresholds', () => {
    const items = [
      { name: 'A', currentStock: 25, parLevel: 100 },  // 25%
      { name: 'B', currentStock: 35, parLevel: 100 }   // 35%
    ];

    // With custom threshold 30%, 25% is low
    const sorted = sortByUrgency(items, { threshold: 30 });

    expect(sorted[0].name).toBe('A'); // low (25% < 30%)
    expect(sorted[1].name).toBe('B'); // ok (35% > 30%)
  });

  it('should preserve stable sort for equal items', () => {
    const items = [
      { name: 'First', currentStock: 50, parLevel: 100 },
      { name: 'Second', currentStock: 50, parLevel: 100 }
    ];

    const sorted = sortByUrgency(items);

    // Same percentage should preserve original order
    expect(sorted[0].name).toBe('First');
    expect(sorted[1].name).toBe('Second');
  });

  it('should handle items with missing stock fields', () => {
    const items = [
      { name: 'A' },  // No stock fields
      { name: 'B', currentStock: 5, parLevel: 100 }
    ];

    const sorted = sortByUrgency(items);

    // Item with no stock should have 0% (critical)
    expect(sorted[0].name).toBe('A'); // 0% critical
    expect(sorted[1].name).toBe('B'); // 5% critical
  });
});

// ============================================
// GROUP BY STATUS
// ============================================

describe('groupByStatus', () => {
  it('should group items by status', () => {
    const items = [
      { name: 'A', currentStock: 50, parLevel: 100 },  // ok
      { name: 'B', currentStock: 5, parLevel: 100 },   // critical
      { name: 'C', currentStock: 15, parLevel: 100 }   // low
    ];

    const grouped = groupByStatus(items);

    expect(grouped.critical.length).toBe(1);
    expect(grouped.critical[0].name).toBe('B');

    expect(grouped.low.length).toBe(1);
    expect(grouped.low[0].name).toBe('C');

    expect(grouped.ok.length).toBe(1);
    expect(grouped.ok[0].name).toBe('A');
  });

  it('should return empty groups for empty input', () => {
    const grouped = groupByStatus([]);

    expect(grouped.critical).toEqual([]);
    expect(grouped.low).toEqual([]);
    expect(grouped.ok).toEqual([]);
  });

  it('should sort within groups by percentage ascending', () => {
    const items = [
      { name: 'A', currentStock: 8, parLevel: 100 },  // 8% critical
      { name: 'B', currentStock: 3, parLevel: 100 }   // 3% critical
    ];

    const grouped = groupByStatus(items);

    expect(grouped.critical[0].name).toBe('B'); // 3%
    expect(grouped.critical[1].name).toBe('A'); // 8%
  });
});

// ============================================
// GET STOCK SUMMARY
// ============================================

describe('getStockSummary', () => {
  it('should calculate summary statistics', () => {
    const items = [
      { name: 'A', currentStock: 50, parLevel: 100 },  // 50% ok
      { name: 'B', currentStock: 5, parLevel: 100 },   // 5% critical
      { name: 'C', currentStock: 15, parLevel: 100 }   // 15% low
    ];

    const summary = getStockSummary(items);

    expect(summary.total).toBe(3);
    expect(summary.criticalCount).toBe(1);
    expect(summary.lowCount).toBe(1);
    expect(summary.okCount).toBe(1);
    expect(summary.lowestItem.name).toBe('B');
    expect(summary.highestItem.name).toBe('A');
  });

  it('should handle empty array', () => {
    const summary = getStockSummary([]);

    expect(summary.total).toBe(0);
    expect(summary.criticalCount).toBe(0);
    expect(summary.lowCount).toBe(0);
    expect(summary.okCount).toBe(0);
    expect(summary.lowestItem).toBe(null);
    expect(summary.highestItem).toBe(null);
  });
});

// ============================================
// CALCULATE REORDER QUANTITY
// ============================================

describe('calculateReorderQuantity', () => {
  it('should calculate basic reorder quantity', () => {
    expect(calculateReorderQuantity(2, 10, 1)).toBe(8);
  });

  it('should round up to minimum order multiple', () => {
    expect(calculateReorderQuantity(2, 10, 5)).toBe(10);
    expect(calculateReorderQuantity(8, 10, 3)).toBe(3);
  });

  it('should return 0 when already at or above full stock', () => {
    expect(calculateReorderQuantity(10, 10, 1)).toBe(0);
    expect(calculateReorderQuantity(12, 10, 1)).toBe(0);
  });

  it('should handle negative current stock', () => {
    expect(calculateReorderQuantity(-5, 10, 1)).toBe(10);
  });
});

// ============================================
// STATUS COLOR, ICON, LABEL HELPERS
// ============================================

describe('getStatusColor', () => {
  it('should return correct colors for each status', () => {
    expect(getStatusColor('critical')).toBe(STATUS_COLORS.critical);
    expect(getStatusColor('low')).toBe(STATUS_COLORS.low);
    expect(getStatusColor('ok')).toBe(STATUS_COLORS.ok);
  });

  it('should return ok color for unknown status', () => {
    expect(getStatusColor('unknown')).toBe(STATUS_COLORS.ok);
  });
});

describe('getStatusIcon', () => {
  it('should return correct icons for each status', () => {
    expect(getStatusIcon('critical')).toBe(STATUS_ICONS.critical);
    expect(getStatusIcon('low')).toBe(STATUS_ICONS.low);
    expect(getStatusIcon('ok')).toBe(STATUS_ICONS.ok);
  });

  it('should return ok icon for unknown status', () => {
    expect(getStatusIcon('unknown')).toBe(STATUS_ICONS.ok);
  });
});

describe('getStatusLabel', () => {
  it('should return correct labels for each status', () => {
    expect(getStatusLabel('critical')).toBe('Critical');
    expect(getStatusLabel('low')).toBe('Low');
    expect(getStatusLabel('ok')).toBe('OK');
  });

  it('should return "Unknown" for unknown status', () => {
    expect(getStatusLabel('unknown')).toBe('Unknown');
  });
});

// ============================================
// ACCESSIBILITY HELPERS
// ============================================

describe('getAccessibleStatusDescription', () => {
  it('should return description for critical status', () => {
    const desc = getAccessibleStatusDescription('critical', 5);
    expect(desc).toContain('Critical');
    expect(desc).toContain('5%');
    expect(desc).toContain('reorder');
  });

  it('should return description for low status', () => {
    const desc = getAccessibleStatusDescription('low', 15);
    expect(desc).toContain('Low');
    expect(desc).toContain('15%');
  });

  it('should return description for ok status', () => {
    const desc = getAccessibleStatusDescription('ok', 75);
    expect(desc).toContain('OK');
    expect(desc).toContain('75%');
  });

  it('should handle status without percentage', () => {
    const desc = getAccessibleStatusDescription('critical');
    expect(desc).toContain('Critical');
    expect(desc).not.toMatch(/\d+%/);
  });
});

describe('getAriaAttributes', () => {
  it('should return aria attributes for critical status', () => {
    const attrs = getAriaAttributes('critical', 5);
    expect(attrs['aria-label']).toBeTruthy();
    expect(attrs['role']).toBe('status');
    expect(attrs['aria-live']).toBe('assertive');
  });

  it('should return aria attributes for ok status', () => {
    const attrs = getAriaAttributes('ok', 75);
    expect(attrs['aria-live']).toBe('polite');
  });
});

// ============================================
// CONSTANTS
// ============================================

describe('Constants', () => {
  it('should export STOCK_STATUS with correct values', () => {
    expect(STOCK_STATUS.CRITICAL).toBe('critical');
    expect(STOCK_STATUS.LOW).toBe('low');
    expect(STOCK_STATUS.OK).toBe('ok');
  });

  it('should export DEFAULT_THRESHOLDS with correct values', () => {
    expect(DEFAULT_THRESHOLDS.CRITICAL).toBe(10);
    expect(DEFAULT_THRESHOLDS.LOW).toBe(20);
  });

  it('should export STATUS_COLORS', () => {
    expect(STATUS_COLORS.critical).toBe('#dc2626');
    expect(STATUS_COLORS.low).toBe('#d97706');
    expect(STATUS_COLORS.ok).toBe('#16a34a');
  });

  it('should export STATUS_ICONS', () => {
    expect(STATUS_ICONS.critical).toBeTruthy();
    expect(STATUS_ICONS.low).toBeTruthy();
    expect(STATUS_ICONS.ok).toBeTruthy();
  });

  it('should export STATUS_LABELS', () => {
    expect(STATUS_LABELS.critical).toBe('Critical');
    expect(STATUS_LABELS.low).toBe('Low');
    expect(STATUS_LABELS.ok).toBe('OK');
  });
});
