/**
 * Base Handler Tests
 *
 * Tests for shared handler utilities: processLine, analyzeLineItem, format corrections
 */

import { describe, it, expect } from 'vitest';
import {
  extractBaseFields,
  validateRequiredFields,
  processLine,
  processLines,
  analyzeLineItem,
  analyzeAllLineItems,
  sanitizeValue,
  sanitizeNumericValue
} from '../baseHandler';
import { ANOMALY_TYPES, ANALYSIS_STATUS } from '../types';

describe('baseHandler', () => {
  // ============================================
  // extractBaseFields
  // ============================================
  describe('extractBaseFields', () => {
    it('should extract all base fields from line item', () => {
      const line = {
        name: 'Test Item',
        description: 'A test description',
        quantity: 5,
        unitPrice: 10.50,
        totalPrice: 52.50,
        unit: 'CS',
        category: 'Food'
      };

      const result = extractBaseFields(line);

      expect(result.name).toBe('Test Item');
      expect(result.description).toBe('A test description');
      expect(result.quantity).toBe(5);
      expect(result.unitPrice).toBe(10.50);
      expect(result.totalPrice).toBe(52.50);
      expect(result.unit).toBe('CS');
      expect(result.category).toBe('Food');
    });

    it('should handle missing optional fields with null', () => {
      const line = {
        name: 'Minimal Item',
        quantity: 1,
        unitPrice: 5.00
      };

      const result = extractBaseFields(line);

      expect(result.name).toBe('Minimal Item');
      expect(result.quantity).toBe(1);
      expect(result.unitPrice).toBe(5.00);
      // Missing fields are explicitly null (not undefined)
      expect(result.totalPrice).toBeNull();
    });

    it('should use description as fallback for name', () => {
      const line = {
        description: 'Only Description',
        quantity: 2,
        unitPrice: 3.00
      };

      const result = extractBaseFields(line);

      expect(result.name).toBe('Only Description');
    });
  });

  // ============================================
  // sanitizeValue - Placeholder value handling
  // ============================================
  describe('sanitizeValue', () => {
    it('should return null for ** placeholder', () => {
      expect(sanitizeValue('**')).toBeNull();
    });

    it('should return null for -- placeholder', () => {
      expect(sanitizeValue('--')).toBeNull();
    });

    it('should return null for N/A placeholder', () => {
      expect(sanitizeValue('N/A')).toBeNull();
      expect(sanitizeValue('n/a')).toBeNull();
      expect(sanitizeValue('NA')).toBeNull();
    });

    it('should return null for ... placeholder', () => {
      expect(sanitizeValue('...')).toBeNull();
    });

    it('should return null for em-dash placeholder', () => {
      expect(sanitizeValue('—')).toBeNull();
    });

    it('should preserve valid string values', () => {
      expect(sanitizeValue('Hello')).toBe('Hello');
      expect(sanitizeValue('123')).toBe('123');
      expect(sanitizeValue('Test Value')).toBe('Test Value');
    });

    it('should preserve numbers', () => {
      expect(sanitizeValue(5)).toBe(5);
      expect(sanitizeValue(0)).toBe(0);
      expect(sanitizeValue(3.99)).toBe(3.99);
    });

    it('should return null for null/undefined input', () => {
      expect(sanitizeValue(null)).toBeNull();
      expect(sanitizeValue(undefined)).toBeNull();
    });

    it('should handle whitespace around placeholders', () => {
      expect(sanitizeValue(' ** ')).toBeNull();
      expect(sanitizeValue('  --  ')).toBeNull();
    });
  });

  // ============================================
  // sanitizeNumericValue - Numeric placeholder handling
  // ============================================
  describe('sanitizeNumericValue', () => {
    it('should return null for ** placeholder', () => {
      expect(sanitizeNumericValue('**')).toBeNull();
    });

    it('should return null for -- placeholder', () => {
      expect(sanitizeNumericValue('--')).toBeNull();
    });

    it('should return null for N/A placeholder', () => {
      expect(sanitizeNumericValue('N/A')).toBeNull();
    });

    it('should parse valid numeric strings', () => {
      expect(sanitizeNumericValue('5')).toBe(5);
      expect(sanitizeNumericValue('3.99')).toBe(3.99);
      expect(sanitizeNumericValue('0')).toBe(0);
      expect(sanitizeNumericValue('123.456')).toBe(123.456);
    });

    it('should return null for non-numeric strings', () => {
      expect(sanitizeNumericValue('abc')).toBeNull();
      expect(sanitizeNumericValue('hello')).toBeNull();
    });

    it('should handle numbers directly', () => {
      expect(sanitizeNumericValue(5)).toBe(5);
      expect(sanitizeNumericValue(0)).toBe(0);
      expect(sanitizeNumericValue(3.99)).toBe(3.99);
    });

    it('should return null for null/undefined', () => {
      expect(sanitizeNumericValue(null)).toBeNull();
      expect(sanitizeNumericValue(undefined)).toBeNull();
    });
  });

  // ============================================
  // processLine with placeholder values
  // ============================================
  describe('processLine with placeholder values', () => {
    it('should convert ** orderedQuantity to null', () => {
      const claudeLine = {
        description: 'BOUCHÉES FEUILLETÉES À GARNIR LP 150G',
        itemCode: 'BC-1160',
        orderedQuantity: '**',  // Placeholder in invoice
        quantity: 6,
        unitPrice: 0,
        totalPrice: 3.99
      };

      const result = processLine(claudeLine, 0);

      expect(result.orderedQuantity).toBeNull();
      expect(result.quantity).toBe(6);
      expect(result.totalPrice).toBe(3.99);
    });

    it('should handle invoice line with all columns shifted by placeholder', () => {
      // Simulates: ** in Commande column causing confusion
      // But after proper column mapping, values should be correct
      const claudeLine = {
        description: 'Test Product',
        itemCode: 'TEST-001',
        orderedQuantity: '**',  // This was in "Commande" column
        quantity: 6,            // This was in "Qté" column
        unitPrice: 3.99,        // This was in "Prix" column
        totalPrice: 23.94       // This was in "Total" column
      };

      const result = processLine(claudeLine, 0);

      // orderedQuantity should be sanitized to null
      expect(result.orderedQuantity).toBeNull();
      // Other values should be preserved correctly
      expect(result.quantity).toBe(6);
      expect(result.unitPrice).toBe(3.99);
      expect(result.totalPrice).toBe(23.94);
      expect(result.description).toBe('Test Product');
    });

    it('should handle -- placeholder in orderedQuantity', () => {
      const claudeLine = {
        description: 'Another Product',
        orderedQuantity: '--',
        quantity: 10,
        unitPrice: 5.00,
        totalPrice: 50.00
      };

      const result = processLine(claudeLine, 0);

      expect(result.orderedQuantity).toBeNull();
      expect(result.quantity).toBe(10);
    });

    it('should handle N/A placeholder in orderedQuantity', () => {
      const claudeLine = {
        description: 'N/A Test Product',
        orderedQuantity: 'N/A',
        quantity: 3,
        unitPrice: 15.00,
        totalPrice: 45.00
      };

      const result = processLine(claudeLine, 0);

      expect(result.orderedQuantity).toBeNull();
      expect(result.quantity).toBe(3);
    });
  });

  // ============================================
  // validateRequiredFields
  // ============================================
  describe('validateRequiredFields', () => {
    it('should return valid: true when all required fields present', () => {
      const item = {
        name: 'Complete Item',
        quantity: 2,
        unitPrice: 10.00
      };

      const result = validateRequiredFields(item, ['name', 'quantity', 'unitPrice']);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for missing required field', () => {
      const item = {
        quantity: 2,
        unitPrice: 10.00
      };

      const result = validateRequiredFields(item, ['name', 'quantity']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should return error for empty string value', () => {
      const item = {
        name: '',
        quantity: 2,
        unitPrice: 10.00
      };

      const result = validateRequiredFields(item, ['name']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should return error for null value', () => {
      const item = {
        name: null,
        quantity: 2,
        unitPrice: 10.00
      };

      const result = validateRequiredFields(item, ['name']);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });
  });

  // ============================================
  // analyzeLineItem
  // ============================================
  describe('analyzeLineItem', () => {
    it('should return OK status for valid math', () => {
      const line = {
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.00
      };

      const result = analyzeLineItem(line);

      expect(result.status).toBe(ANALYSIS_STATUS.OK);
      expect(result.anomalies).toHaveLength(0);
    });

    it('should detect math mismatch', () => {
      const line = {
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 25.00 // Should be 20.00
      };

      const result = analyzeLineItem(line);

      expect(result.status).toBe(ANALYSIS_STATUS.WARNING);
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({ type: ANOMALY_TYPES.MATH_MISMATCH })
      );
    });

    it('should allow math within $0.02 tolerance', () => {
      const line = {
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.01 // $0.01 off - within $0.02 tolerance
      };

      const result = analyzeLineItem(line);

      expect(result.status).toBe(ANALYSIS_STATUS.OK);
      expect(result.mathValid).toBe(true);
    });

    it('should flag math error beyond $0.02 tolerance', () => {
      const line = {
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.05 // $0.05 off - beyond $0.02 tolerance
      };

      const result = analyzeLineItem(line);

      expect(result.status).toBe(ANALYSIS_STATUS.WARNING);
      expect(result.anomalies).toContainEqual(
        expect.objectContaining({ type: ANOMALY_TYPES.MATH_MISMATCH })
      );
    });

    it('should detect zero price', () => {
      const line = {
        quantity: 2,
        unitPrice: 0,
        totalPrice: 0
      };

      const result = analyzeLineItem(line);

      expect(result.anomalies).toContainEqual(
        expect.objectContaining({ type: ANOMALY_TYPES.ZERO_PRICE })
      );
    });

    it('should detect missing quantity', () => {
      const line = {
        unitPrice: 10.00,
        totalPrice: 10.00
      };

      const result = analyzeLineItem(line);

      expect(result.anomalies).toContainEqual(
        expect.objectContaining({ type: ANOMALY_TYPES.MISSING_QUANTITY })
      );
    });

    it('should detect line type: product', () => {
      const line = {
        name: 'Regular Product',
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.00
      };

      const result = analyzeLineItem(line);

      expect(result.lineType).toBe('product');
      expect(result.forInventory).toBe(true);
    });

    it('should detect line type: deposit', () => {
      const line = {
        name: 'Bottle Deposit',
        quantity: 24,
        unitPrice: 0.10,
        totalPrice: 2.40
      };

      const result = analyzeLineItem(line);

      expect(result.lineType).toBe('deposit');
      expect(result.isDeposit).toBe(true);
    });

    it('should detect line type: credit (negative)', () => {
      const line = {
        name: 'Return Credit',
        quantity: 1,
        unitPrice: -5.00,
        totalPrice: -5.00
      };

      const result = analyzeLineItem(line);

      expect(result.lineType).toBe('credit');
    });
  });

  // ============================================
  // analyzeAllLineItems
  // ============================================
  describe('analyzeAllLineItems', () => {
    it('should analyze multiple lines and return summary', () => {
      const lines = [
        { quantity: 2, unitPrice: 10.00, totalPrice: 20.00 },
        { quantity: 1, unitPrice: 5.00, totalPrice: 5.00 },
        { quantity: 3, unitPrice: 15.00, totalPrice: 50.00 } // Math error
      ];

      const result = analyzeAllLineItems(lines);

      expect(result.results).toHaveLength(3);
      expect(result.summary.totalLines).toBe(3);
      expect(result.summary.linesWithIssues).toBe(1);
      expect(result.allAnomalies.length).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const result = analyzeAllLineItems([]);

      expect(result.results).toHaveLength(0);
      expect(result.summary.totalLines).toBe(0);
    });
  });

  // ============================================
  // processLine
  // ============================================
  describe('processLine', () => {
    it('should process line and include analysis', () => {
      const line = {
        name: 'Test Product',
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.00
      };

      const result = processLine(line);

      expect(result.name).toBe('Test Product');
      expect(result.quantity).toBe(2);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.status).toBe(ANALYSIS_STATUS.OK);
    });

    it('should set routing flags', () => {
      const line = {
        name: 'Test Product',
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 20.00
      };

      const result = processLine(line);

      expect(result.forInventory).toBe(true);
      expect(result.forAccounting).toBe(true);
    });
  });

  // ============================================
  // processLines
  // ============================================
  describe('processLines', () => {
    it('should process all lines and return summary', () => {
      const lines = [
        { name: 'Item A', quantity: 2, unitPrice: 10.00, totalPrice: 20.00 },
        { name: 'Item B', quantity: 1, unitPrice: 15.00, totalPrice: 15.00 }
      ];

      const result = processLines(lines);

      expect(result.lines).toHaveLength(2);
      expect(result.summary.totalLines).toBe(2);
      expect(result.summary.calculatedSubtotal).toBe(35.00);
    });

    it('should collect all anomalies', () => {
      const lines = [
        { name: 'Good', quantity: 2, unitPrice: 10.00, totalPrice: 20.00 },
        { name: 'Bad Math', quantity: 2, unitPrice: 10.00, totalPrice: 30.00 }
      ];

      const result = processLines(lines);

      expect(result.allAnomalies.length).toBeGreaterThan(0);
      expect(result.summary.linesWithIssues).toBe(1);
    });

    it('should handle empty array', () => {
      const result = processLines([]);

      expect(result.lines).toHaveLength(0);
      expect(result.summary.totalLines).toBe(0);
      expect(result.summary.calculatedSubtotal).toBe(0);
    });
  });

});
