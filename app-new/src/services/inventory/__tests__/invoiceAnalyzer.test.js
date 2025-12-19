/**
 * Invoice Analyzer Tests
 *
 * Tests for Quebec tax validation with compound rule
 */

import { describe, it, expect } from 'vitest';
import {
  calculateQuebecTaxes,
  validateQuebecTaxes,
  validateTotals,
  QUEBEC_TAX,
  ANOMALY_TYPES,
} from '../invoiceAnalyzer';

describe('Quebec Tax Calculation', () => {
  describe('calculateQuebecTaxes', () => {
    it('should calculate TPS at 5%', () => {
      const result = calculateQuebecTaxes(100);
      expect(result.tps).toBe(5.00);
    });

    it('should calculate TVQ using compound rule (on subtotal + TPS)', () => {
      // TVQ = (100 + 5) * 0.09975 = 10.47375 → rounds to 10.47
      const result = calculateQuebecTaxes(100);
      expect(result.tvq).toBe(10.47);
    });

    it('should calculate correct total taxes', () => {
      // TPS: 5.00 + TVQ: 10.47 = 15.47
      const result = calculateQuebecTaxes(100);
      expect(result.total).toBe(15.47);
    });

    it('should handle zero subtotal', () => {
      const result = calculateQuebecTaxes(0);
      expect(result.tps).toBe(0);
      expect(result.tvq).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle negative subtotal', () => {
      const result = calculateQuebecTaxes(-100);
      expect(result.tps).toBe(0);
      expect(result.tvq).toBe(0);
    });

    it('should calculate correctly for realistic invoice amounts', () => {
      // $1,250.00 invoice
      const result = calculateQuebecTaxes(1250);
      // TPS: 1250 * 0.05 = 62.50
      expect(result.tps).toBe(62.50);
      // TVQ: (1250 + 62.50) * 0.09975 = 130.92 (rounded)
      expect(result.tvq).toBe(130.92);
      // Total: 62.50 + 130.92 = 193.42
      expect(result.total).toBe(193.42);
    });

    it('should return combined rate (~15.47% due to compound)', () => {
      const result = calculateQuebecTaxes(1000);
      // Effective combined rate is ~15.47% because TVQ is on (subtotal + TPS)
      // TPS: 50 + TVQ: 104.74 = 154.74 → 15.474%
      expect(result.combinedRate).toBeCloseTo(15.47, 1);
    });
  });

  describe('validateQuebecTaxes', () => {
    it('should pass when taxes match exactly', () => {
      const expected = calculateQuebecTaxes(100);
      const result = validateQuebecTaxes(100, expected.tps, expected.tvq);

      expect(result.tpsValid).toBe(true);
      expect(result.tvqValid).toBe(true);
      expect(result.hasAnomalies).toBe(false);
    });

    it('should pass within tolerance (0.5%)', () => {
      const expected = calculateQuebecTaxes(1000);
      // Add small rounding difference within tolerance
      const result = validateQuebecTaxes(1000, expected.tps + 0.01, expected.tvq - 0.02);

      expect(result.tpsValid).toBe(true);
      expect(result.tvqValid).toBe(true);
    });

    it('should flag TPS mismatch when outside tolerance', () => {
      // Expected TPS for $1000 is $50
      // Pass $60 (20% off)
      const result = validateQuebecTaxes(1000, 60, 104.74);

      expect(result.tpsValid).toBe(false);
      expect(result.anomalies.some(a => a.type === ANOMALY_TYPES.TPS_MISMATCH)).toBe(true);
    });

    it('should flag TVQ mismatch when outside tolerance', () => {
      // Expected TVQ for $1000 is ~$104.74 (compound on 1050)
      // Pass $100 (using incorrect non-compound calculation)
      const result = validateQuebecTaxes(1000, 50, 99.75);

      expect(result.tvqValid).toBe(false);
      expect(result.anomalies.some(a => a.type === ANOMALY_TYPES.TVQ_MISMATCH)).toBe(true);
    });

    it('should detect tax-exempt scenario', () => {
      const result = validateQuebecTaxes(1000, 0, 0);

      expect(result.isTaxExempt).toBe(true);
      expect(result.anomalies.some(a => a.type === ANOMALY_TYPES.TAX_EXEMPT)).toBe(true);
      expect(result.anomalies[0].severity).toBe('info');
    });

    it('should catch incorrect non-compound TVQ calculation', () => {
      // This simulates an invoice calculated WITHOUT compound rule
      // Incorrect: TVQ = 1000 * 0.09975 = 99.75
      // Correct:   TVQ = 1050 * 0.09975 = 104.74
      const incorrectTVQ = 1000 * 0.09975;
      const result = validateQuebecTaxes(1000, 50, incorrectTVQ);

      // Should flag the TVQ as wrong
      expect(result.tvqValid).toBe(false);
      const tvqAnomaly = result.anomalies.find(a => a.type === ANOMALY_TYPES.TVQ_MISMATCH);
      expect(tvqAnomaly).toBeDefined();
      expect(tvqAnomaly.note).toContain('subtotal + TPS');
    });
  });

  describe('validateTotals with Quebec taxes', () => {
    it('should validate separate TPS/TVQ fields', () => {
      const totals = {
        subtotal: 1000,
        taxGST: 50,
        taxQST: 104.74,
        totalAmount: 1154.74,
      };

      const result = validateTotals(totals, 1000);

      expect(result.quebecTaxValidation).not.toBeNull();
      expect(result.taxGST).toBe(50);
      expect(result.taxQST).toBe(104.74);
    });

    it('should validate legacy single taxAmount against Quebec rate', () => {
      const totals = {
        subtotal: 1000,
        taxAmount: 149.75, // Combined Quebec taxes
        totalAmount: 1149.75,
      };

      const result = validateTotals(totals, 1000);

      // Should use combined validation
      expect(result.taxAmount).toBe(149.75);
    });

    it('should still check subtotal matches line items', () => {
      const totals = {
        subtotal: 1000,
        taxGST: 50,
        taxQST: 104.74,
        totalAmount: 1154.74,
      };

      // Pass different calculated subtotal
      const result = validateTotals(totals, 950);

      expect(result.subtotalValid).toBe(false);
      expect(result.anomalies.some(a => a.type === ANOMALY_TYPES.SUBTOTAL_MISMATCH)).toBe(true);
    });
  });

  describe('QUEBEC_TAX constants', () => {
    it('should have correct TPS rate', () => {
      expect(QUEBEC_TAX.TPS_RATE).toBe(0.05);
    });

    it('should have correct TVQ rate', () => {
      expect(QUEBEC_TAX.TVQ_RATE).toBe(0.09975);
    });

    it('should have reasonable tolerance settings', () => {
      expect(QUEBEC_TAX.TOLERANCE_PERCENT).toBe(0.005);
      expect(QUEBEC_TAX.TOLERANCE_MIN).toBe(0.02);
    });
  });
});
