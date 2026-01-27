/**
 * Carrousel Invoice Parsing Integration Test
 *
 * Tests the end-to-end flow for parsing container-style invoices
 * from packaging distributors like Carrousel Emballage.
 *
 * Invoice: CARROUSEL_INV_CRS-12789.pdf
 * Vendor: Carrousel Emballage Inc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseContainerFormat,
  parsePackagingInfo,
  extractContainerCapacity,
  extractProductDimensions,
  generateContainerFormatHints
} from '../../utils/packagingParser';

/**
 * Simulated parsed line items from the Carrousel invoice PDF
 * This is what Claude would return after parsing the PDF
 */
const CARROUSEL_INVOICE_LINES = [
  { code: 'CE-90123', description: 'CONTENANT ALUM. 2.25LB RECT', format: '1/500', quantity: 2, unitPrice: 65.50, total: 131.00 },
  { code: 'CE-90134', description: 'CONTENANT ALUM. 1LB ROND', format: '1/500', quantity: 1, unitPrice: 52.75, total: 52.75 },
  { code: 'CE-90145', description: 'COUVERCLE ALUM. 2.25LB', format: '1/500', quantity: 2, unitPrice: 38.50, total: 77.00 },
  { code: 'CE-90212', description: 'SAC SOUS-VIDE 8X12', format: '1/1000', quantity: 1, unitPrice: 45.75, total: 45.75 },
  { code: 'CE-90312', description: 'FILM ÉTIRABLE 18"', format: '4/RL', quantity: 3, unitPrice: 85.00, total: 255.00 },
  { code: 'CE-90323', description: 'PAPIER CIRÉ 12"', format: '6/RL', quantity: 2, unitPrice: 72.50, total: 145.00 },
  { code: 'CE-90512', description: 'CONTENANT CLAM 8X8 3COMP', format: '1/200', quantity: 2, unitPrice: 68.50, total: 137.00 },
  { code: 'CE-90612', description: 'BOL SOUPE 16OZ + COUV', format: '1/250', quantity: 3, unitPrice: 45.50, total: 136.50 },
  { code: 'CE-90714', description: 'USTENSILES COMBO HVY', format: '1/500', quantity: 1, unitPrice: 72.50, total: 72.50 },
  { code: 'CE-90723', description: 'SERVIETTE DÎNER 2PLY', format: '1/3000', quantity: 2, unitPrice: 45.00, total: 90.00 },
  { code: 'CE-90812', description: 'GANTS NITRILE M', format: '10/100', quantity: 1, unitPrice: 85.50, total: 85.50 },
  { code: 'CE-90912', description: 'SAC POUBELLE 35X50 BLK', format: '1/100', quantity: 3, unitPrice: 35.75, total: 107.25 }
];

/**
 * Expected total units after parsing
 */
const EXPECTED_TOTAL_UNITS = {
  'CE-90123': 1000,  // 2 × 500 containers
  'CE-90134': 500,   // 1 × 500 containers
  'CE-90145': 1000,  // 2 × 500 lids
  'CE-90212': 1000,  // 1 × 1000 bags
  'CE-90312': 12,    // 3 × 4 rolls
  'CE-90323': 12,    // 2 × 6 rolls
  'CE-90512': 400,   // 2 × 200 containers
  'CE-90612': 750,   // 3 × 250 bowls
  'CE-90714': 500,   // 1 × 500 utensil sets
  'CE-90723': 6000,  // 2 × 3000 napkins
  'CE-90812': 1000,  // 1 × 1000 (10 × 100 gloves)
  'CE-90912': 300    // 3 × 100 bags
};

describe('Carrousel Invoice Parsing', () => {
  describe('Container Format Parsing', () => {
    it('should correctly parse all format notations from Carrousel invoice', () => {
      for (const line of CARROUSEL_INVOICE_LINES) {
        const result = parsePackagingInfo({
          description: line.description,
          format: line.format,
          quantity: line.quantity
        });

        expect(result.calculatedTotalUnits).toBe(
          EXPECTED_TOTAL_UNITS[line.code],
          `${line.code} (${line.description}): expected ${EXPECTED_TOTAL_UNITS[line.code]} units, got ${result.calculatedTotalUnits}`
        );
      }
    });

    it('should identify nested unit format (10/100) correctly', () => {
      const glovesLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90812');
      const result = parsePackagingInfo({
        description: glovesLine.description,
        format: glovesLine.format,
        quantity: glovesLine.quantity
      });

      expect(result.packaging.packagingType).toBe('nested_units');
      expect(result.packaging.packCount).toBe(10);
      expect(result.packaging.unitsPerPack).toBe(100);
      expect(result.packaging.totalUnitsPerCase).toBe(1000);
      expect(result.calculatedTotalUnits).toBe(1000);
    });

    it('should identify simple case format (1/500) correctly', () => {
      const containerLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90123');
      const result = parsePackagingInfo({
        description: containerLine.description,
        format: containerLine.format,
        quantity: containerLine.quantity
      });

      expect(result.packaging.packagingType).toBe('simple');
      expect(result.packaging.totalUnitsPerCase).toBe(500);
      expect(result.calculatedTotalUnits).toBe(1000); // 2 × 500
    });

    it('should identify roll format (6/RL) correctly', () => {
      const paperLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90323');
      const result = parsePackagingInfo({
        description: paperLine.description,
        format: paperLine.format,
        quantity: paperLine.quantity
      });

      expect(result.packaging.packagingType).toBe('rolls');
      expect(result.packaging.rollsPerCase).toBe(6);
      expect(result.packaging.lengthPerRoll).toBe(12); // Extracted from description
      expect(result.packaging.lengthUnit).toBe('ft');
      expect(result.calculatedTotalLength).toBe(144); // 2 × 6 × 12
    });
  });

  describe('Container Capacity Detection', () => {
    it('should detect container capacity (NOT weight) for containers', () => {
      const containerLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90123');
      const result = parsePackagingInfo({
        description: containerLine.description,
        format: containerLine.format,
        quantity: containerLine.quantity
      });

      expect(result.containerCapacity).not.toBeNull();
      expect(result.containerCapacity.capacity).toBe(2.25);
      expect(result.containerCapacity.unit).toBe('lb');
      expect(result.containerCapacity.isCapacity).toBe(true);
      expect(result.containerCapacity.containerType).toBe('container');
    });

    it('should detect container capacity for lids', () => {
      const lidLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90145');
      const result = parsePackagingInfo({
        description: lidLine.description,
        format: lidLine.format,
        quantity: lidLine.quantity
      });

      expect(result.containerCapacity).not.toBeNull();
      expect(result.containerCapacity.capacity).toBe(2.25);
      expect(result.containerCapacity.containerType).toBe('lid');
      expect(result.containerCapacity.isCapacity).toBe(true);
    });

    it('should detect container capacity for bowls', () => {
      const bowlLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90612');
      const result = parsePackagingInfo({
        description: bowlLine.description,
        format: bowlLine.format,
        quantity: bowlLine.quantity
      });

      expect(result.containerCapacity).not.toBeNull();
      expect(result.containerCapacity.capacity).toBe(16);
      expect(result.containerCapacity.unit).toBe('oz');
      expect(result.containerCapacity.containerType).toBe('bowl');
    });

    it('should NOT detect capacity for non-container products', () => {
      const glovesLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90812');
      const result = parsePackagingInfo({
        description: glovesLine.description,
        format: glovesLine.format,
        quantity: glovesLine.quantity
      });

      expect(result.containerCapacity).toBeNull();
    });
  });

  describe('Product Dimensions Extraction', () => {
    it('should extract dimensions from "8X8 3COMP"', () => {
      const clamLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90512');
      const result = parsePackagingInfo({
        description: clamLine.description,
        format: clamLine.format,
        quantity: clamLine.quantity
      });

      expect(result.productDimensions.dimensions).toBe('8X8');
      expect(result.productDimensions.specs).toContain('3COMP');
    });

    it('should extract dimensions from "35X50 BLK"', () => {
      const bagLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90912');
      const result = parsePackagingInfo({
        description: bagLine.description,
        format: bagLine.format,
        quantity: bagLine.quantity
      });

      expect(result.productDimensions.dimensions).toBe('35X50');
      expect(result.productDimensions.specs).toContain('BLK');
    });

    it('should extract width from film products', () => {
      const filmLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90312');
      const result = parsePackagingInfo({
        description: filmLine.description,
        format: filmLine.format,
        quantity: filmLine.quantity
      });

      expect(result.productDimensions.width).toBe(18);
      expect(result.productDimensions.widthUnit).toBe('in');
    });

    it('should extract ply specification', () => {
      const napkinLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90723');
      const result = parsePackagingInfo({
        description: napkinLine.description,
        format: napkinLine.format,
        quantity: napkinLine.quantity
      });

      expect(result.productDimensions.specs).toContain('2PLY');
    });
  });

  describe('Invoice Totals Verification', () => {
    it('should calculate correct invoice subtotal', () => {
      const subtotal = CARROUSEL_INVOICE_LINES.reduce((sum, line) => sum + line.total, 0);
      expect(subtotal).toBe(1335.25);
    });

    it('should have correct total units across all lines', () => {
      let totalUnits = 0;
      for (const line of CARROUSEL_INVOICE_LINES) {
        const result = parsePackagingInfo({
          description: line.description,
          format: line.format,
          quantity: line.quantity
        });
        totalUnits += result.calculatedTotalUnits;
      }

      // Sum of all expected units:
      // 1000 + 500 + 1000 + 1000 + 12 + 12 + 400 + 750 + 500 + 6000 + 1000 + 300 = 12474
      expect(totalUnits).toBe(12474);
    });

    it('should calculate price per unit correctly', () => {
      const glovesLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90812');
      const result = parsePackagingInfo({
        description: glovesLine.description,
        format: glovesLine.format,
        quantity: glovesLine.quantity
      });

      const pricePerUnit = glovesLine.total / result.calculatedTotalUnits;
      // $85.50 / 1000 gloves = $0.0855 per glove
      expect(pricePerUnit).toBeCloseTo(0.0855, 4);
    });

    it('should calculate price per linear foot for roll products', () => {
      const paperLine = CARROUSEL_INVOICE_LINES.find(l => l.code === 'CE-90323');
      const result = parsePackagingInfo({
        description: paperLine.description,
        format: paperLine.format,
        quantity: paperLine.quantity
      });

      const pricePerFoot = paperLine.total / result.calculatedTotalLength;
      // $145.00 / 144 feet = $1.007 per foot
      expect(pricePerFoot).toBeCloseTo(1.007, 2);
    });
  });

  describe('Stock Quantity Calculation', () => {
    it('should calculate correct stock for nested units format', () => {
      // GANTS NITRILE M: 10/100 × 1 case = 1000 gloves
      const line = { format: '10/100', quantity: 1 };
      const result = parseContainerFormat(line.format);

      const stockUnits = result.totalUnitsPerCase * line.quantity;
      expect(stockUnits).toBe(1000);
    });

    it('should calculate correct stock for roll products', () => {
      // PAPIER CIRÉ 12": 6/RL × 2 cases = 12 rolls
      const line = { format: '6/RL', quantity: 2 };
      const result = parseContainerFormat(line.format, 'PAPIER CIRÉ 12"');

      const stockRolls = result.rollsPerCase * line.quantity;
      expect(stockRolls).toBe(12);

      // With length: 12 rolls × 12ft = 144 linear feet
      const totalLength = stockRolls * result.lengthPerRoll;
      expect(totalLength).toBe(144);
    });

    it('should calculate correct stock for large case quantities', () => {
      // SERVIETTE DÎNER: 1/3000 × 2 cases = 6000 napkins
      const line = { format: '1/3000', quantity: 2 };
      const result = parseContainerFormat(line.format);

      const stockUnits = result.totalUnitsPerCase * line.quantity;
      expect(stockUnits).toBe(6000);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle missing format gracefully', () => {
    const result = parsePackagingInfo({
      description: 'SOME PRODUCT',
      format: null,
      quantity: 1
    });

    expect(result.packaging.packagingType).toBe('unknown');
    expect(result.calculatedTotalUnits).toBe(1);
  });

  it('should handle empty description', () => {
    const result = parsePackagingInfo({
      description: '',
      format: '1/500',
      quantity: 2
    });

    expect(result.calculatedTotalUnits).toBe(1000);
    expect(result.containerCapacity).toBeNull();
  });

  it('should handle zero quantity', () => {
    const result = parsePackagingInfo({
      description: 'GANTS NITRILE M',
      format: '10/100',
      quantity: 0
    });

    expect(result.calculatedTotalUnits).toBe(0);
  });

  it('should handle decimal quantities', () => {
    const result = parsePackagingInfo({
      description: 'CONTENANT ALUM.',
      format: '1/500',
      quantity: 1.5
    });

    expect(result.calculatedTotalUnits).toBe(750);
  });
});
