/**
 * Unit Tests for format.js
 *
 * Tests all formatting utility functions including:
 * - Time formatting
 * - Currency formatting
 * - Date formatting
 * - Text formatting (capitalize, truncate, title case)
 * - Number formatting
 * - File size formatting
 * - Metric formatting and scaling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatTime,
  formatCurrency,
  formatDate,
  formatRelativeDate,
  capitalizeFirst,
  toTitleCase,
  truncateText,
  formatNumber,
  formatFileSize,
  formatPercentage,
  formatDifficulty,
  formatServings,
  formatEmptyState,
  formatMetric,
} from '../format.js';

describe('formatTime', () => {
  it('should format minutes less than 60', () => {
    expect(formatTime(45)).toBe('45m');
    expect(formatTime(1)).toBe('1m');
    expect(formatTime(59)).toBe('59m');
  });

  it('should format exact hours', () => {
    expect(formatTime(60)).toBe('1h');
    expect(formatTime(120)).toBe('2h');
    expect(formatTime(180)).toBe('3h');
  });

  it('should format hours and minutes', () => {
    expect(formatTime(90)).toBe('1h 30m');
    expect(formatTime(75)).toBe('1h 15m');
    expect(formatTime(145)).toBe('2h 25m');
  });

  it('should handle invalid input', () => {
    expect(formatTime(0)).toBe('0m');
    expect(formatTime(-5)).toBe('0m');
    expect(formatTime(NaN)).toBe('0m');
    expect(formatTime(null)).toBe('0m');
    expect(formatTime(undefined)).toBe('0m');
    expect(formatTime('abc')).toBe('0m');
  });

  it('should parse string numbers', () => {
    expect(formatTime('90')).toBe('1h 30m');
    expect(formatTime('45')).toBe('45m');
  });
});

describe('formatCurrency', () => {
  it('should format with default dollar sign', () => {
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(0.99)).toBe('$0.99');
  });

  it('should format with custom currency symbol', () => {
    expect(formatCurrency(12.5, '€')).toBe('€12.50');
    expect(formatCurrency(100, '£')).toBe('£100.00');
    expect(formatCurrency(50, 'CAD$')).toBe('CAD$50.00');
  });

  it('should handle invalid input', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
    expect(formatCurrency('abc')).toBe('$0.00');
  });

  it('should parse string numbers', () => {
    expect(formatCurrency('12.50')).toBe('$12.50');
    expect(formatCurrency('99.99')).toBe('$99.99');
  });

  it('should round to two decimal places', () => {
    // Note: JavaScript toFixed uses "round half to even" (banker's rounding)
    // 12.555 may round to 12.55 due to floating-point precision
    expect(formatCurrency(12.556)).toBe('$12.56');
    expect(formatCurrency(12.554)).toBe('$12.55');
  });
});

describe('formatDate', () => {
  it('should format date with short format (default)', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = formatDate(date);
    // Check it contains year and some form of month/day
    expect(result).toMatch(/2024/);
    expect(result).not.toBe('Invalid date');
  });

  it('should format date with long format', () => {
    const date = new Date('2024-06-15T12:00:00Z');
    const result = formatDate(date, 'long');
    // Long format should contain the full year
    expect(result).toMatch(/2024/);
    expect(result).not.toBe('Invalid date');
  });

  it('should accept ISO string', () => {
    const result = formatDate('2024-06-15T12:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('Invalid date');
  });

  it('should accept timestamp', () => {
    const timestamp = new Date('2024-06-15T12:00:00Z').getTime();
    const result = formatDate(timestamp);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Invalid date');
  });

  it('should handle invalid date', () => {
    expect(formatDate('invalid')).toBe('Invalid date');
    // Note: null passed to new Date() returns epoch (valid date), not NaN
    // Only truly invalid strings return 'Invalid date'
    expect(formatDate('not-a-date-at-all')).toBe('Invalid date');
  });
});

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for recent dates', () => {
    const date = new Date('2024-06-15T11:59:30Z'); // 30 seconds ago
    expect(formatRelativeDate(date)).toBe('just now');
  });

  it('should return minutes ago', () => {
    const date = new Date('2024-06-15T11:55:00Z'); // 5 minutes ago
    expect(formatRelativeDate(date)).toBe('5 minutes ago');

    const date2 = new Date('2024-06-15T11:59:00Z'); // 1 minute ago
    expect(formatRelativeDate(date2)).toBe('1 minute ago');
  });

  it('should return hours ago', () => {
    const date = new Date('2024-06-15T10:00:00Z'); // 2 hours ago
    expect(formatRelativeDate(date)).toBe('2 hours ago');

    const date2 = new Date('2024-06-15T11:00:00Z'); // 1 hour ago
    expect(formatRelativeDate(date2)).toBe('1 hour ago');
  });

  it('should return "yesterday"', () => {
    const date = new Date('2024-06-14T12:00:00Z'); // 1 day ago
    expect(formatRelativeDate(date)).toBe('yesterday');
  });

  it('should return days ago', () => {
    const date = new Date('2024-06-12T12:00:00Z'); // 3 days ago
    expect(formatRelativeDate(date)).toBe('3 days ago');
  });

  it('should return formatted date for older dates', () => {
    const date = new Date('2024-06-01T12:00:00Z'); // 14 days ago
    const result = formatRelativeDate(date);
    expect(result).not.toBe('14 days ago');
    // Should fall back to formatDate which will contain the year
    expect(result).toMatch(/2024/);
  });
});

describe('capitalizeFirst', () => {
  it('should capitalize first letter', () => {
    expect(capitalizeFirst('hello')).toBe('Hello');
    expect(capitalizeFirst('world')).toBe('World');
  });

  it('should handle already capitalized', () => {
    expect(capitalizeFirst('Hello')).toBe('Hello');
  });

  it('should handle single character', () => {
    expect(capitalizeFirst('a')).toBe('A');
  });

  it('should handle empty/invalid input', () => {
    expect(capitalizeFirst('')).toBe('');
    expect(capitalizeFirst(null)).toBe('');
    expect(capitalizeFirst(undefined)).toBe('');
    expect(capitalizeFirst(123)).toBe('');
  });
});

describe('toTitleCase', () => {
  it('should capitalize each word', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
  });

  it('should handle mixed case input', () => {
    expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
    expect(toTitleCase('hElLo WoRlD')).toBe('Hello World');
  });

  it('should handle single word', () => {
    expect(toTitleCase('hello')).toBe('Hello');
  });

  it('should handle empty/invalid input', () => {
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase(null)).toBe('');
    expect(toTitleCase(undefined)).toBe('');
  });
});

describe('truncateText', () => {
  it('should truncate long text', () => {
    expect(truncateText('Hello World', 8)).toBe('Hello...');
    expect(truncateText('This is a very long text', 15)).toBe('This is a ve...');
  });

  it('should not truncate short text', () => {
    expect(truncateText('Hello', 10)).toBe('Hello');
    expect(truncateText('Hi', 5)).toBe('Hi');
  });

  it('should use custom suffix', () => {
    expect(truncateText('Hello World', 8, '---')).toBe('Hello---');
    expect(truncateText('Hello World', 9, ' [more]')).toBe('He [more]');
  });

  it('should handle empty/invalid input', () => {
    expect(truncateText('', 10)).toBe('');
    expect(truncateText(null, 10)).toBe('');
    expect(truncateText(undefined, 10)).toBe('');
  });
});

describe('formatNumber', () => {
  it('should format with thousands separator', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should handle decimals', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(123)).toBe('123');
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle invalid input', () => {
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500.00 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.00 KB');
    expect(formatFileSize(2048)).toBe('2.00 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(1572864)).toBe('1.50 MB');
  });

  it('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('should handle invalid input', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(NaN)).toBe('0 B');
    expect(formatFileSize(null)).toBe('0 B');
  });
});

describe('formatPercentage', () => {
  it('should calculate percentage', () => {
    expect(formatPercentage(75, 100)).toBe('75.0%');
    expect(formatPercentage(1, 4)).toBe('25.0%');
    expect(formatPercentage(2, 3)).toBe('66.7%');
  });

  it('should handle custom decimal places', () => {
    expect(formatPercentage(1, 3, 0)).toBe('33%');
    expect(formatPercentage(1, 3, 2)).toBe('33.33%');
  });

  it('should handle zero total', () => {
    expect(formatPercentage(50, 0)).toBe('0%');
    expect(formatPercentage(0, 0)).toBe('0%');
  });
});

describe('formatDifficulty', () => {
  it('should format difficulty levels', () => {
    expect(formatDifficulty('easy')).toContain('Easy');
    expect(formatDifficulty('medium')).toContain('Medium');
    expect(formatDifficulty('hard')).toContain('Hard');
  });

  it('should handle case insensitivity', () => {
    expect(formatDifficulty('EASY')).toContain('Easy');
    expect(formatDifficulty('Medium')).toContain('Medium');
  });

  it('should default to medium', () => {
    expect(formatDifficulty('unknown')).toContain('Medium');
    expect(formatDifficulty(null)).toContain('Medium');
    expect(formatDifficulty(undefined)).toContain('Medium');
  });
});

describe('formatServings', () => {
  it('should format singular serving', () => {
    expect(formatServings(1)).toBe('1 serving');
  });

  it('should format plural servings', () => {
    expect(formatServings(2)).toBe('2 servings');
    expect(formatServings(10)).toBe('10 servings');
  });

  it('should handle invalid input', () => {
    expect(formatServings(0)).toBe('0 servings');
    expect(formatServings(-1)).toBe('0 servings');
    expect(formatServings(NaN)).toBe('0 servings');
    expect(formatServings(null)).toBe('0 servings');
  });
});

describe('formatEmptyState', () => {
  it('should return appropriate messages', () => {
    expect(formatEmptyState('recipes')).toBe('No recipes found');
    expect(formatEmptyState('ingredients')).toBe('No ingredients yet');
    expect(formatEmptyState('steps')).toBe('No steps yet');
    expect(formatEmptyState('notes')).toBe('No notes yet');
    expect(formatEmptyState('plating')).toBe('No plating instructions yet');
  });

  it('should handle case insensitivity', () => {
    expect(formatEmptyState('RECIPES')).toBe('No recipes found');
  });

  it('should return default for unknown types', () => {
    expect(formatEmptyState('unknown')).toBe('No items found');
    expect(formatEmptyState(null)).toBe('No items found');
  });
});

describe('formatMetric', () => {
  describe('gram to kilogram conversion', () => {
    it('should convert 1000g to 1kg', () => {
      expect(formatMetric('1000g')).toBe('1kg');
    });

    it('should convert 2500g to 2.5kg', () => {
      expect(formatMetric('2500g')).toBe('2.5kg');
    });

    it('should not convert values less than 1000g', () => {
      expect(formatMetric('500g')).toBe('500g');
      expect(formatMetric('999g')).toBe('999g');
    });

    it('should handle decimal grams', () => {
      expect(formatMetric('1500.5g')).toBe('1.5005kg');
    });
  });

  describe('milliliter to liter conversion', () => {
    it('should convert 1000ml to 1l', () => {
      expect(formatMetric('1000ml')).toBe('1l');
    });

    it('should convert 2500ml to 2.5l', () => {
      expect(formatMetric('2500ml')).toBe('2.5l');
    });

    it('should not convert values less than 1000ml', () => {
      expect(formatMetric('500ml')).toBe('500ml');
      expect(formatMetric('750ml')).toBe('750ml');
    });
  });

  describe('edge cases', () => {
    it('should return null/undefined as-is', () => {
      expect(formatMetric(null)).toBe(null);
      expect(formatMetric(undefined)).toBe(undefined);
    });

    it('should return non-matching patterns as-is', () => {
      expect(formatMetric('2 cups')).toBe('2 cups');
      expect(formatMetric('some text')).toBe('some text');
      expect(formatMetric('')).toBe('');
    });

    it('should handle already abbreviated units', () => {
      expect(formatMetric('2kg')).toBe('2kg');
      expect(formatMetric('5l')).toBe('5l');
    });
  });
});
