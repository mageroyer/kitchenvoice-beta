/**
 * Packaging Distributor Handler Tests
 *
 * Tests for packaging specific logic: boxing format parsing, unit calculations
 */

import { describe, it, expect } from 'vitest';
import packagingDistributorHandler from '../packagingDistributorHandler';
import { analyzeLineItem as baseAnalyzeLineItem } from '../baseHandler';
import { INVOICE_TYPES, ANOMALY_TYPES, ANALYSIS_STATUS } from '../types';

describe('packagingDistributorHandler', () => {
  // ============================================
  // Handler Identity
  // ============================================
  describe('handler identity', () => {
    it('should have correct type', () => {
      expect(packagingDistributorHandler.type).toBe(INVOICE_TYPES.PACKAGING_DISTRIBUTOR);
    });

    it('should have a label', () => {
      expect(packagingDistributorHandler.label).toBeDefined();
      expect(typeof packagingDistributorHandler.label).toBe('string');
    });

    it('should not be an expense type', () => {
      expect(packagingDistributorHandler.isExpenseType).toBeFalsy();
    });
  });

  // ============================================
  // processLine - Boxing Format Parsing
  // ============================================
  describe('processLine - boxing format', () => {
    it('should parse boxing format "1/500" as 500 units per case', () => {
      const line = {
        name: 'Paper Cups',
        quantity: 2,
        unitPrice: 45.00,
        totalPrice: 90.00,
        format: '1/500'
      };

      const result = packagingDistributorHandler.processLine(line);

      expect(result.totalUnitsPerCase).toBe(500);
      expect(result.packCount).toBe(1);
    });

    it('should parse boxing format "6/RL" as 6 rolls per case', () => {
      const line = {
        name: 'Plastic Wrap',
        quantity: 1,
        unitPrice: 30.00,
        totalPrice: 30.00,
        format: '6/RL'
      };

      const result = packagingDistributorHandler.processLine(line);

      expect(result.rollsPerCase).toBe(6);
    });

    it('should parse boxing format "10/100" as 1000 units', () => {
      const line = {
        name: 'Napkins',
        quantity: 1,
        unitPrice: 25.00,
        totalPrice: 25.00,
        format: '10/100'
      };

      const result = packagingDistributorHandler.processLine(line);

      expect(result.totalUnitsPerCase).toBe(1000); // 10 × 100
      expect(result.packCount).toBe(10);
      expect(result.unitsPerPack).toBe(100);
    });

    it('should handle missing format', () => {
      const line = {
        name: 'Generic Packaging',
        quantity: 1,
        unitPrice: 20.00,
        totalPrice: 20.00
      };

      const result = packagingDistributorHandler.processLine(line);

      expect(result.name).toBe('Generic Packaging');
      // Should still process without format info
    });
  });

  // ============================================
  // analyzeLineItem - Uses base handler (no weight warnings)
  // Packaging uses baseHandler.analyzeLineItem which doesn't check weight
  // ============================================
  describe('analyzeLineItem (via base handler)', () => {
    it('should NOT flag MISSING_WEIGHT for packaging items', () => {
      const line = {
        name: 'Containers',
        quantity: 1,
        unitPrice: 50.00,
        totalPrice: 50.00,
        format: '1/500' // No weight, just units
      };

      // Packaging uses base analyzeLineItem which doesn't flag missing weight
      const result = baseAnalyzeLineItem(line);

      const missingWeight = result.anomalies.find(a => a.type === ANOMALY_TYPES.MISSING_WEIGHT);
      expect(missingWeight).toBeUndefined();
    });

    it('should still detect math mismatch', () => {
      const line = {
        name: 'Cups',
        quantity: 2,
        unitPrice: 10.00,
        totalPrice: 30.00 // Should be 20
      };

      const result = baseAnalyzeLineItem(line);

      expect(result.anomalies).toContainEqual(
        expect.objectContaining({ type: ANOMALY_TYPES.MATH_MISMATCH })
      );
    });

    it('should return OK for valid packaging line', () => {
      const line = {
        name: 'Boxes',
        quantity: 5,
        unitPrice: 12.00,
        totalPrice: 60.00,
        format: '1/50'
      };

      const result = baseAnalyzeLineItem(line);

      expect(result.status).toBe(ANALYSIS_STATUS.OK);
    });
  });

  // ============================================
  // processLines
  // ============================================
  describe('processLines', () => {
    it('should process multiple packaging lines', () => {
      const lines = [
        { name: 'Cups', quantity: 2, unitPrice: 40.00, totalPrice: 80.00, format: '1/500' },
        { name: 'Lids', quantity: 2, unitPrice: 35.00, totalPrice: 70.00, format: '1/500' }
      ];

      const result = packagingDistributorHandler.processLines(lines);

      expect(result.lines).toHaveLength(2);
      expect(result.summary.calculatedSubtotal).toBe(150.00);
    });

    it('should not generate weight warnings', () => {
      const lines = [
        { name: 'Boxes', quantity: 1, unitPrice: 50.00, totalPrice: 50.00, format: '1/100' }
      ];

      const result = packagingDistributorHandler.processLines(lines);

      const weightWarnings = result.allAnomalies.filter(a => a.type === ANOMALY_TYPES.MISSING_WEIGHT);
      expect(weightWarnings).toHaveLength(0);
    });
  });
});
