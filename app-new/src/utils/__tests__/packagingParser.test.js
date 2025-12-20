/**
 * Packaging Parser Tests
 *
 * Tests for container-style invoice format parsing
 * Based on real examples from Carrousel Emballage invoices
 */

import { describe, it, expect } from 'vitest';
import {
  parseContainerFormat,
  parsePackagingInfo,
  extractContainerCapacity,
  extractProductDimensions,
  extractLengthFromDescription,
  isContainerProduct,
  isLinearProduct,
  isValidContainerFormat,
  generateContainerFormatHints
} from '../packagingParser';

describe('packagingParser', () => {
  // ============================================
  // parseContainerFormat - Format Column Parsing
  // ============================================
  describe('parseContainerFormat', () => {
    describe('nested units notation (X/Y)', () => {
      it('should parse "10/100" as 10 packs × 100 units = 1000 total', () => {
        const result = parseContainerFormat('10/100', 'GANTS NITRILE M');

        expect(result.packagingType).toBe('nested_units');
        expect(result.packCount).toBe(10);
        expect(result.unitsPerPack).toBe(100);
        expect(result.totalUnitsPerCase).toBe(1000);
      });

      it('should parse "4/500" as 4 packs × 500 units = 2000 total', () => {
        const result = parseContainerFormat('4/500', 'SOME PRODUCT');

        expect(result.packagingType).toBe('nested_units');
        expect(result.packCount).toBe(4);
        expect(result.unitsPerPack).toBe(500);
        expect(result.totalUnitsPerCase).toBe(2000);
      });
    });

    describe('simple case notation (1/Y)', () => {
      it('should parse "1/500" as simple 500 units per case', () => {
        const result = parseContainerFormat('1/500', 'CONTENANT ALUM. 2.25LB');

        expect(result.packagingType).toBe('simple');
        expect(result.packCount).toBe(1);
        expect(result.unitsPerPack).toBe(500);
        expect(result.totalUnitsPerCase).toBe(500);
      });

      it('should parse "1/1000" as simple 1000 units per case', () => {
        const result = parseContainerFormat('1/1000', 'SAC SOUS-VIDE');

        expect(result.packagingType).toBe('simple');
        expect(result.totalUnitsPerCase).toBe(1000);
      });

      it('should parse "1/200" as simple 200 units per case', () => {
        const result = parseContainerFormat('1/200', 'CONTENANT CLAM 8X8');

        expect(result.packagingType).toBe('simple');
        expect(result.totalUnitsPerCase).toBe(200);
      });

      it('should parse "1/250" as simple 250 units per case', () => {
        const result = parseContainerFormat('1/250', 'BOL SOUPE 16OZ');

        expect(result.packagingType).toBe('simple');
        expect(result.totalUnitsPerCase).toBe(250);
      });

      it('should parse "1/3000" as simple 3000 units per case', () => {
        const result = parseContainerFormat('1/3000', 'SERVIETTE DINER');

        expect(result.packagingType).toBe('simple');
        expect(result.totalUnitsPerCase).toBe(3000);
      });
    });

    describe('roll notation (X/RL)', () => {
      it('should parse "6/RL" as 6 rolls per case', () => {
        const result = parseContainerFormat('6/RL', 'PAPIER CIRÉ 12"');

        expect(result.packagingType).toBe('rolls');
        expect(result.rollsPerCase).toBe(6);
        expect(result.totalUnitsPerCase).toBe(6);
      });

      it('should parse "4/RL" as 4 rolls per case', () => {
        const result = parseContainerFormat('4/RL', 'FILM ÉTIRABLE 18"');

        expect(result.packagingType).toBe('rolls');
        expect(result.rollsPerCase).toBe(4);
      });

      it('should extract length from description for roll products', () => {
        const result = parseContainerFormat('6/RL', 'PAPIER CIRÉ 12"');

        expect(result.lengthPerRoll).toBe(12);
        expect(result.lengthUnit).toBe('ft');
      });
    });

    describe('edge cases', () => {
      it('should handle null format', () => {
        const result = parseContainerFormat(null);

        expect(result.packagingType).toBe('unknown');
        expect(result.totalUnitsPerCase).toBe(1);
      });

      it('should handle empty format', () => {
        const result = parseContainerFormat('');

        expect(result.packagingType).toBe('unknown');
      });

      it('should handle plain number format', () => {
        const result = parseContainerFormat('500');

        expect(result.packagingType).toBe('simple');
        expect(result.totalUnitsPerCase).toBe(500);
      });
    });
  });

  // ============================================
  // extractContainerCapacity - Capacity vs Weight
  // ============================================
  describe('extractContainerCapacity', () => {
    it('should extract capacity from "COUVERCLE ALUM. 2.25LB" (lid)', () => {
      const result = extractContainerCapacity('COUVERCLE ALUM. 2.25LB');

      expect(result).not.toBeNull();
      expect(result.capacity).toBe(2.25);
      expect(result.unit).toBe('lb');
      expect(result.isCapacity).toBe(true);
      expect(result.containerType).toBe('lid');
    });

    it('should extract capacity from "BOL SOUPE 16OZ + COUV" (bowl)', () => {
      const result = extractContainerCapacity('BOL SOUPE 16OZ + COUV');

      expect(result).not.toBeNull();
      expect(result.capacity).toBe(16);
      expect(result.unit).toBe('oz');
      expect(result.isCapacity).toBe(true);
      expect(result.containerType).toBe('bowl');
    });

    it('should extract capacity from "CONTENANT ALUM. 1LB ROND" (container)', () => {
      const result = extractContainerCapacity('CONTENANT ALUM. 1LB ROND');

      expect(result).not.toBeNull();
      expect(result.capacity).toBe(1);
      expect(result.unit).toBe('lb');
      expect(result.containerType).toBe('container');
    });

    it('should return null for non-container products', () => {
      const result = extractContainerCapacity('GANTS NITRILE M');

      expect(result).toBeNull();
    });

    it('should return null for roll products even with numbers', () => {
      const result = extractContainerCapacity('FILM ÉTIRABLE 18"');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // extractProductDimensions
  // ============================================
  describe('extractProductDimensions', () => {
    it('should extract dimensions from "SAC POUBELLE 35X50 BLK"', () => {
      const result = extractProductDimensions('SAC POUBELLE 35X50 BLK');

      expect(result.dimensions).toBe('35X50');
      expect(result.specs).toContain('BLK');
    });

    it('should extract dimensions from "CONTENANT CLAM 8X8 3COMP"', () => {
      const result = extractProductDimensions('CONTENANT CLAM 8X8 3COMP');

      expect(result.dimensions).toBe('8X8');
      expect(result.specs).toContain('3COMP');
    });

    it('should extract width from "FILM ÉTIRABLE 18""', () => {
      const result = extractProductDimensions('FILM ÉTIRABLE 18"');

      expect(result.width).toBe(18);
      expect(result.widthUnit).toBe('in');
    });

    it('should extract specs from "SERVIETTE DÎNER 2PLY"', () => {
      const result = extractProductDimensions('SERVIETTE DÎNER 2PLY');

      expect(result.specs).toContain('2PLY');
    });
  });

  // ============================================
  // parsePackagingInfo - Full Line Parsing
  // ============================================
  describe('parsePackagingInfo', () => {
    it('should parse complete line for GANTS NITRILE (nested units)', () => {
      const result = parsePackagingInfo({
        description: 'GANTS NITRILE M',
        format: '10/100',
        quantity: 1
      });

      expect(result.packaging.packagingType).toBe('nested_units');
      expect(result.packaging.totalUnitsPerCase).toBe(1000);
      expect(result.calculatedTotalUnits).toBe(1000);
      expect(result.containerCapacity).toBeNull();
    });

    it('should parse complete line for PAPIER CIRÉ (rolls)', () => {
      const result = parsePackagingInfo({
        description: 'PAPIER CIRÉ 12"',
        format: '6/RL',
        quantity: 2
      });

      expect(result.packaging.packagingType).toBe('rolls');
      expect(result.packaging.rollsPerCase).toBe(6);
      expect(result.packaging.lengthPerRoll).toBe(12);
      expect(result.calculatedTotalLength).toBe(144); // 2 cases × 6 rolls × 12 ft
    });

    it('should parse complete line for COUVERCLE (container capacity)', () => {
      const result = parsePackagingInfo({
        description: 'COUVERCLE ALUM. 2.25LB',
        format: '1/500',
        quantity: 2
      });

      expect(result.packaging.packagingType).toBe('simple');
      expect(result.packaging.totalUnitsPerCase).toBe(500);
      expect(result.calculatedTotalUnits).toBe(1000); // 2 cases × 500
      expect(result.containerCapacity).not.toBeNull();
      expect(result.containerCapacity.capacity).toBe(2.25);
      expect(result.containerCapacity.isCapacity).toBe(true);
    });

    it('should parse complete line for CONTENANT CLAM (dimensions)', () => {
      const result = parsePackagingInfo({
        description: 'CONTENANT CLAM 8X8 3COMP',
        format: '1/200',
        quantity: 2
      });

      expect(result.calculatedTotalUnits).toBe(400); // 2 cases × 200
      expect(result.productDimensions.dimensions).toBe('8X8');
      expect(result.productDimensions.specs).toContain('3COMP');
    });
  });

  // ============================================
  // Validation Helpers
  // ============================================
  describe('isValidContainerFormat', () => {
    it('should validate nested unit format', () => {
      expect(isValidContainerFormat('10/100')).toBe(true);
      expect(isValidContainerFormat('1/500')).toBe(true);
    });

    it('should validate roll format', () => {
      expect(isValidContainerFormat('6/RL')).toBe(true);
      expect(isValidContainerFormat('4/rl')).toBe(true);
    });

    it('should validate simple number', () => {
      expect(isValidContainerFormat('500')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidContainerFormat('abc')).toBe(false);
      expect(isValidContainerFormat('')).toBe(false);
      expect(isValidContainerFormat(null)).toBe(false);
    });
  });

  describe('isContainerProduct', () => {
    it('should identify container products', () => {
      expect(isContainerProduct('CONTENANT ALUM. 2.25LB')).toBe(true);
      expect(isContainerProduct('COUVERCLE ALUM. 2.25LB')).toBe(true);
      expect(isContainerProduct('BOL SOUPE 16OZ')).toBe(true);
      expect(isContainerProduct('VERRE PLASTIQUE')).toBe(true);
    });

    it('should not identify non-container products', () => {
      expect(isContainerProduct('GANTS NITRILE M')).toBe(false);
      expect(isContainerProduct('PAPIER CIRÉ 12"')).toBe(false);
    });
  });

  describe('isLinearProduct', () => {
    it('should identify linear/roll products', () => {
      expect(isLinearProduct('PAPIER CIRÉ 12"')).toBe(true);
      expect(isLinearProduct('FILM ÉTIRABLE 18"')).toBe(true);
      expect(isLinearProduct('ALUMINIUM ROULEAU')).toBe(true);  // Compound pattern: ALUM + ROULEAU
      expect(isLinearProduct('ALUMINUM FOIL ROLL')).toBe(true);
    });

    it('should not identify non-linear products', () => {
      expect(isLinearProduct('GANTS NITRILE M')).toBe(false);
      expect(isLinearProduct('CONTENANT ALUM.')).toBe(false);  // ALUM alone is not linear
      expect(isLinearProduct('COUVERCLE ALUM. 2.25LB')).toBe(false);  // Aluminum lid is not linear
    });
  });

  // ============================================
  // Claude Prompt Hints
  // ============================================
  describe('generateContainerFormatHints', () => {
    it('should generate hints with all options enabled', () => {
      const hints = generateContainerFormatHints({
        hasNestedUnits: true,
        hasRolls: true,
        hasContainers: true
      });

      expect(hints).toContain('CONTAINER/PACKAGING FORMAT');
      expect(hints).toContain('10/100');
      expect(hints).toContain('6/RL');
      expect(hints).toContain('CAPACITY');
      expect(hints).toContain('isCapacity=true');
    });

    it('should exclude sections when disabled', () => {
      const hints = generateContainerFormatHints({
        hasNestedUnits: true,
        hasRolls: false,
        hasContainers: false
      });

      expect(hints).toContain('NESTED UNIT FORMAT');
      expect(hints).not.toContain('ROLL FORMAT');
    });
  });

  // ============================================
  // Real Carrousel Invoice Examples
  // ============================================
  describe('Carrousel Invoice Examples', () => {
    const carrouselLines = [
      { code: 'CE-90123', desc: 'CONTENANT ALUM. 2.25LB RECT', format: '1/500', qty: 2, price: 65.50, total: 131.00 },
      { code: 'CE-90134', desc: 'CONTENANT ALUM. 1LB ROND', format: '1/500', qty: 1, price: 52.75, total: 52.75 },
      { code: 'CE-90145', desc: 'COUVERCLE ALUM. 2.25LB', format: '1/500', qty: 2, price: 38.50, total: 77.00 },
      { code: 'CE-90212', desc: 'SAC SOUS-VIDE 8X12', format: '1/1000', qty: 1, price: 45.75, total: 45.75 },
      { code: 'CE-90312', desc: 'FILM ÉTIRABLE 18"', format: '4/RL', qty: 3, price: 85.00, total: 255.00 },
      { code: 'CE-90323', desc: 'PAPIER CIRÉ 12"', format: '6/RL', qty: 2, price: 72.50, total: 145.00 },
      { code: 'CE-90512', desc: 'CONTENANT CLAM 8X8 3COMP', format: '1/200', qty: 2, price: 68.50, total: 137.00 },
      { code: 'CE-90612', desc: 'BOL SOUPE 16OZ + COUV', format: '1/250', qty: 3, price: 45.50, total: 136.50 },
      { code: 'CE-90714', desc: 'USTENSILES COMBO HVY', format: '1/500', qty: 1, price: 72.50, total: 72.50 },
      { code: 'CE-90723', desc: 'SERVIETTE DÎNER 2PLY', format: '1/3000', qty: 2, price: 45.00, total: 90.00 },
      { code: 'CE-90812', desc: 'GANTS NITRILE M', format: '10/100', qty: 1, price: 85.50, total: 85.50 },
      { code: 'CE-90912', desc: 'SAC POUBELLE 35X50 BLK', format: '1/100', qty: 3, price: 35.75, total: 107.25 }
    ];

    it('should correctly calculate total units for all items', () => {
      const expectations = {
        'CE-90123': 1000,  // 2 × 500
        'CE-90134': 500,   // 1 × 500
        'CE-90145': 1000,  // 2 × 500
        'CE-90212': 1000,  // 1 × 1000
        'CE-90312': 12,    // 3 × 4 rolls
        'CE-90323': 12,    // 2 × 6 rolls
        'CE-90512': 400,   // 2 × 200
        'CE-90612': 750,   // 3 × 250
        'CE-90714': 500,   // 1 × 500
        'CE-90723': 6000,  // 2 × 3000
        'CE-90812': 1000,  // 1 × 1000 (10 × 100)
        'CE-90912': 300    // 3 × 100
      };

      for (const line of carrouselLines) {
        const result = parsePackagingInfo({
          description: line.desc,
          format: line.format,
          quantity: line.qty
        });

        expect(result.calculatedTotalUnits).toBe(expectations[line.code],
          `${line.code}: Expected ${expectations[line.code]} but got ${result.calculatedTotalUnits}`);
      }
    });

    it('should correctly identify container capacity products', () => {
      const capacityProducts = ['CE-90123', 'CE-90134', 'CE-90145', 'CE-90612'];

      for (const line of carrouselLines) {
        const result = parsePackagingInfo({
          description: line.desc,
          format: line.format,
          quantity: line.qty
        });

        if (capacityProducts.includes(line.code)) {
          expect(result.containerCapacity).not.toBeNull(
            `${line.code} (${line.desc}) should have container capacity`);
        }
      }
    });

    it('should calculate total length for roll products', () => {
      // PAPIER CIRÉ 12" with 6/RL format, qty 2
      const papierResult = parsePackagingInfo({
        description: 'PAPIER CIRÉ 12"',
        format: '6/RL',
        quantity: 2
      });

      // 2 cases × 6 rolls × 12 ft = 144 ft
      expect(papierResult.calculatedTotalLength).toBe(144);
    });
  });
});
