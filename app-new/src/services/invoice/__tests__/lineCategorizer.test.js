/**
 * Line Categorizer Tests
 *
 * Tests the local fallback categorization (no API calls)
 */

import { describe, it, expect } from 'vitest';
import {
  LINE_CATEGORY,
  categorizeLineItemsLocal,
  getCategoryDisplay,
} from '../lineCategorizer';

describe('lineCategorizer', () => {
  describe('LINE_CATEGORY', () => {
    it('should have exactly 5 categories', () => {
      expect(Object.keys(LINE_CATEGORY)).toHaveLength(5);
      expect(LINE_CATEGORY.FOOD).toBe('FOOD');
      expect(LINE_CATEGORY.PACKAGING).toBe('PACKAGING');
      expect(LINE_CATEGORY.SUPPLY).toBe('SUPPLY');
      expect(LINE_CATEGORY.FEE).toBe('FEE');
      expect(LINE_CATEGORY.DIVERS).toBe('DIVERS');
    });
  });

  describe('categorizeLineItemsLocal', () => {
    it('should categorize packaging items correctly', () => {
      const items = [
        { description: 'PLASTIC CONTAINER 500ML' },  // matches 'plastic', 'container'
        { description: 'DISPOSABLE GLOVES' },        // matches 'disposable'
        { description: 'PAPER BAG 100CT' },          // matches 'bag'
        { description: 'FOOD WRAP FILM' },           // matches 'wrap', 'film'
        { description: 'CLAMSHELL CONTAINER' },      // matches 'clamshell', 'container'
      ];

      const result = categorizeLineItemsLocal(items);

      result.forEach((item, i) => {
        expect(item.category).toBe(LINE_CATEGORY.PACKAGING);
      });
    });

    it('should NOT match abbreviations in local fallback (API handles those)', () => {
      // Local fallback uses simple keyword matching
      // Abbreviations like "CONT" for "container" need the AI API
      const items = [
        { description: 'CONT ALUM 2.25LB' },  // "CONT" abbreviation - not matched
      ];

      const result = categorizeLineItemsLocal(items);

      // Falls back to FOOD since no keyword match
      expect(result[0].category).toBe(LINE_CATEGORY.FOOD);
    });

    it('should categorize food items as FOOD (default)', () => {
      const items = [
        { description: 'BEEF TENDERLOIN 2.5KG' },
        { description: 'SALMON FILLET' },
        { description: 'OLIVE OIL 1L' },
        { description: 'RICE VINEGAR 500ML' },
        { description: 'CHICKEN BREAST' },
      ];

      const result = categorizeLineItemsLocal(items);

      result.forEach((item, i) => {
        expect(item.category).toBe(LINE_CATEGORY.FOOD);
      });
    });

    it('should handle items with name instead of description', () => {
      const items = [
        { name: 'SALMON FILLET' },
        { name: 'PLASTIC BAG' },
      ];

      const result = categorizeLineItemsLocal(items);

      expect(result[0].category).toBe(LINE_CATEGORY.FOOD);
      expect(result[1].category).toBe(LINE_CATEGORY.PACKAGING);
    });

    it('should handle empty array', () => {
      const result = categorizeLineItemsLocal([]);
      expect(result).toHaveLength(0);
    });

    it('should preserve original item properties', () => {
      const items = [
        { description: 'BEEF', quantity: 5, price: 100 },
      ];

      const result = categorizeLineItemsLocal(items);

      expect(result[0].description).toBe('BEEF');
      expect(result[0].quantity).toBe(5);
      expect(result[0].price).toBe(100);
      expect(result[0].category).toBe(LINE_CATEGORY.FOOD);
    });
  });

  describe('getCategoryDisplay', () => {
    it('should return display info for FOOD', () => {
      const display = getCategoryDisplay(LINE_CATEGORY.FOOD);

      expect(display.icon).toBeDefined();
      expect(display.label).toBe('Food');
      expect(display.color).toBeDefined();
      expect(display.bgColor).toBeDefined();
    });

    it('should return display info for PACKAGING', () => {
      const display = getCategoryDisplay(LINE_CATEGORY.PACKAGING);

      expect(display.icon).toBeDefined();
      expect(display.label).toBe('Pack');
      expect(display.color).toBeDefined();
    });

    it('should return display info for SUPPLY', () => {
      const display = getCategoryDisplay(LINE_CATEGORY.SUPPLY);

      expect(display.icon).toBeDefined();
      expect(display.label).toBe('Supply');
      expect(display.color).toBeDefined();
    });

    it('should return display info for FEE', () => {
      const display = getCategoryDisplay(LINE_CATEGORY.FEE);

      expect(display.icon).toBeDefined();
      expect(display.label).toBe('Fee');
      expect(display.color).toBeDefined();
    });

    it('should return display info for DIVERS', () => {
      const display = getCategoryDisplay(LINE_CATEGORY.DIVERS);

      expect(display.icon).toBeDefined();
      expect(display.label).toBe('Divers');
      expect(display.color).toBeDefined();
    });

    it('should return DIVERS display for unknown category', () => {
      const display = getCategoryDisplay('UNKNOWN_CATEGORY');

      expect(display.label).toBe('Divers');
    });
  });
});
