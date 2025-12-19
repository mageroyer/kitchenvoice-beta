/**
 * Format Patterns Tests
 *
 * Tests extraction of billing values from pack formats and descriptions.
 */

import { describe, it, expect } from 'vitest';
import {
  extractPackWeight,
  extractPackCount,
  extractMultipliedWeight,
  extractEmbeddedWeight,
  extractSimpleWeight,
  extractSimpleVolume,
  extractAllFormats,
  getBillingValueFromFormat,
  normalizeWeightUnit,
  normalizeVolumeUnit,
  convertWeight,
  convertVolume,
  WEIGHT_TO_GRAMS,
  VOLUME_TO_ML,
} from '../formatPatterns';

// ============================================
// Pack Weight Patterns
// ============================================

describe('extractPackWeight', () => {
  describe('standard formats', () => {
    it('parses "4/5LB" → 4 packs × 5lb = 20lb', () => {
      const result = extractPackWeight('4/5LB');
      expect(result).not.toBeNull();
      expect(result.packCount).toBe(4);
      expect(result.packWeight).toBe(5);
      expect(result.unit).toBe('lb');
      expect(result.totalWeight).toBe(20);
      expect(result.billingValue).toBe(20);
    });

    it('parses "1/50LB" → 1 pack × 50lb = 50lb', () => {
      const result = extractPackWeight('1/50LB');
      expect(result.packCount).toBe(1);
      expect(result.packWeight).toBe(50);
      expect(result.totalWeight).toBe(50);
    });

    it('parses "2/5KG" → 2 × 5kg = 10kg', () => {
      const result = extractPackWeight('2/5KG');
      expect(result.packCount).toBe(2);
      expect(result.packWeight).toBe(5);
      expect(result.unit).toBe('kg');
      expect(result.totalWeight).toBe(10);
    });

    it('parses "6/3LB" → 6 × 3lb = 18lb', () => {
      const result = extractPackWeight('6/3LB');
      expect(result.totalWeight).toBe(18);
    });

    it('parses decimal weights "2/2.5KG"', () => {
      const result = extractPackWeight('2/2.5KG');
      expect(result.packWeight).toBe(2.5);
      expect(result.totalWeight).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('returns null for non-matching formats', () => {
      expect(extractPackWeight('12CT')).toBeNull();
      expect(extractPackWeight('Caisse 4lb')).toBeNull();
      expect(extractPackWeight('')).toBeNull();
      expect(extractPackWeight(null)).toBeNull();
    });

    it('handles lowercase', () => {
      const result = extractPackWeight('4/5lb');
      expect(result).not.toBeNull();
      expect(result.totalWeight).toBe(20);
    });

    it('handles spaces "4 / 5 LB"', () => {
      const result = extractPackWeight('4 / 5 LB');
      expect(result).not.toBeNull();
      expect(result.totalWeight).toBe(20);
    });
  });

  describe('unit type detection', () => {
    it('identifies weight units', () => {
      expect(extractPackWeight('4/5LB').type).toBe('PACK_WEIGHT');
      expect(extractPackWeight('2/3KG').type).toBe('PACK_WEIGHT');
      expect(extractPackWeight('1/500G').type).toBe('PACK_WEIGHT');
    });
  });
});

// ============================================
// Pack Count Patterns
// ============================================

describe('extractPackCount', () => {
  it('parses "12CT" → 12 units', () => {
    const result = extractPackCount('12CT');
    expect(result).not.toBeNull();
    expect(result.count).toBe(12);
    expect(result.unitType).toBe('ct');
    expect(result.billingValue).toBe(12);
  });

  it('parses "24PK" → 24 units', () => {
    const result = extractPackCount('24PK');
    expect(result.count).toBe(24);
  });

  it('parses "6/CASE" → 6 units', () => {
    const result = extractPackCount('6/CASE');
    expect(result.count).toBe(6);
  });

  it('parses "2DZ" → 24 units (2 dozen)', () => {
    const result = extractPackCount('2DZ');
    expect(result.count).toBe(24); // 2 × 12
  });

  it('parses "1DOZEN" → 12 units', () => {
    const result = extractPackCount('1DOZEN');
    expect(result.count).toBe(12);
  });

  it('parses "10EA" → 10 units', () => {
    const result = extractPackCount('10EA');
    expect(result.count).toBe(10);
  });

  it('returns null for weight formats', () => {
    expect(extractPackCount('4/5LB')).toBeNull();
    expect(extractPackCount('5KG')).toBeNull();
  });
});

// ============================================
// Multiplied Weight Patterns
// ============================================

describe('extractMultipliedWeight', () => {
  it('parses "2×5KG" → 10kg', () => {
    const result = extractMultipliedWeight('2×5KG');
    expect(result).not.toBeNull();
    expect(result.multiplier).toBe(2);
    expect(result.value).toBe(5);
    expect(result.totalValue).toBe(10);
    expect(result.type).toBe('MULTIPLIED_WEIGHT');
  });

  it('parses "3x500g" → 1500g', () => {
    const result = extractMultipliedWeight('3x500g');
    expect(result.multiplier).toBe(3);
    expect(result.value).toBe(500);
    expect(result.totalValue).toBe(1500);
  });

  it('parses volume "4x500ml" → 2000ml', () => {
    const result = extractMultipliedWeight('4x500ml');
    expect(result.totalValue).toBe(2000);
    expect(result.type).toBe('MULTIPLIED_VOLUME');
  });
});

// ============================================
// Embedded Weight Patterns
// ============================================

describe('extractEmbeddedWeight', () => {
  it('parses "Caisse 4lb"', () => {
    const result = extractEmbeddedWeight('Caisse 4lb');
    expect(result).not.toBeNull();
    expect(result.weight).toBe(4);
    expect(result.unit).toBe('lb');
    expect(result.billingValue).toBe(4);
  });

  it('parses "Sac 25kg"', () => {
    const result = extractEmbeddedWeight('Sac 25kg');
    expect(result.weight).toBe(25);
    expect(result.unit).toBe('kg');
  });

  it('parses "Boîte de 500g"', () => {
    const result = extractEmbeddedWeight('Boîte de 500g');
    expect(result.weight).toBe(500);
    expect(result.unit).toBe('g');
  });

  it('parses "Box 10lb"', () => {
    const result = extractEmbeddedWeight('Box 10lb');
    expect(result.weight).toBe(10);
  });

  it('parses "Case 20LB"', () => {
    const result = extractEmbeddedWeight('Case 20LB');
    expect(result.weight).toBe(20);
  });

  it('parses "Bag 5kg"', () => {
    const result = extractEmbeddedWeight('Bag 5kg');
    expect(result.weight).toBe(5);
  });

  it('returns null without container word', () => {
    expect(extractEmbeddedWeight('Cheese 5kg')).toBeNull();
    expect(extractEmbeddedWeight('5kg')).toBeNull();
  });
});

// ============================================
// Simple Weight/Volume Patterns
// ============================================

describe('extractSimpleWeight', () => {
  it('parses "5LB"', () => {
    const result = extractSimpleWeight('5LB');
    expect(result.weight).toBe(5);
    expect(result.normalizedUnit).toBe('lb');
  });

  it('parses "2.5KG"', () => {
    const result = extractSimpleWeight('2.5KG');
    expect(result.weight).toBe(2.5);
    expect(result.normalizedUnit).toBe('kg');
  });

  it('parses "500grammes"', () => {
    const result = extractSimpleWeight('500grammes');
    expect(result.weight).toBe(500);
    expect(result.normalizedUnit).toBe('g');
  });

  it('parses "3 kilos"', () => {
    const result = extractSimpleWeight('3 kilos');
    expect(result.weight).toBe(3);
    expect(result.normalizedUnit).toBe('kg');
  });
});

describe('extractSimpleVolume', () => {
  it('parses "500ML"', () => {
    const result = extractSimpleVolume('500ML');
    expect(result.volume).toBe(500);
    expect(result.unit).toBe('ml');
  });

  it('parses "2L"', () => {
    const result = extractSimpleVolume('2L');
    expect(result.volume).toBe(2);
  });

  it('parses "1GAL"', () => {
    const result = extractSimpleVolume('1GAL');
    expect(result.volume).toBe(1);
    expect(result.unit).toBe('gal');
  });

  it('parses "16 fl oz"', () => {
    const result = extractSimpleVolume('16 fl oz');
    expect(result.volume).toBe(16);
  });
});

// ============================================
// extractAllFormats() Master Function
// ============================================

describe('extractAllFormats', () => {
  it('returns all matching formats from complex string', () => {
    // This string could match multiple patterns
    const result = extractAllFormats('4/5LB Fromage Cheddar');
    expect(result.found).toBe(true);
    expect(result.formats.length).toBeGreaterThan(0);
    expect(result.bestMatch.type).toBe('PACK_WEIGHT');
  });

  it('prefers pack weight over simple weight', () => {
    const result = extractAllFormats('4/5LB');
    expect(result.bestMatch.type).toBe('PACK_WEIGHT');
  });

  it('returns found=false for non-matching text', () => {
    const result = extractAllFormats('Plain cheese');
    expect(result.found).toBe(false);
    expect(result.formats.length).toBe(0);
  });

  it('handles null/empty input', () => {
    expect(extractAllFormats(null).found).toBe(false);
    expect(extractAllFormats('').found).toBe(false);
  });
});

describe('getBillingValueFromFormat', () => {
  it('returns billing value for pack format', () => {
    expect(getBillingValueFromFormat('4/5LB')).toBe(20);
  });

  it('returns billing value for count format', () => {
    expect(getBillingValueFromFormat('12CT')).toBe(12);
  });

  it('returns null for non-matching', () => {
    expect(getBillingValueFromFormat('Plain text')).toBeNull();
  });
});

// ============================================
// Unit Conversion Functions
// ============================================

describe('normalizeWeightUnit', () => {
  it('normalizes various forms of kg', () => {
    expect(normalizeWeightUnit('kg')).toBe('kg');
    expect(normalizeWeightUnit('kilo')).toBe('kg');
    expect(normalizeWeightUnit('kilos')).toBe('kg');
    expect(normalizeWeightUnit('kilogram')).toBe('kg');
    expect(normalizeWeightUnit('kilogramme')).toBe('kg');
  });

  it('normalizes various forms of lb', () => {
    expect(normalizeWeightUnit('lb')).toBe('lb');
    expect(normalizeWeightUnit('lbs')).toBe('lb');
    expect(normalizeWeightUnit('livre')).toBe('lb');
    expect(normalizeWeightUnit('livres')).toBe('lb');
    expect(normalizeWeightUnit('pound')).toBe('lb');
  });

  it('normalizes various forms of g', () => {
    expect(normalizeWeightUnit('g')).toBe('g');
    expect(normalizeWeightUnit('gr')).toBe('g');
    expect(normalizeWeightUnit('gram')).toBe('g');
    expect(normalizeWeightUnit('gramme')).toBe('g');
  });
});

describe('normalizeVolumeUnit', () => {
  it('normalizes various forms of L', () => {
    expect(normalizeVolumeUnit('l')).toBe('l');
    expect(normalizeVolumeUnit('liter')).toBe('l');
    expect(normalizeVolumeUnit('litre')).toBe('l');
    expect(normalizeVolumeUnit('litres')).toBe('l');
  });

  it('normalizes various forms of ml', () => {
    expect(normalizeVolumeUnit('ml')).toBe('ml');
    expect(normalizeVolumeUnit('milliliter')).toBe('ml');
    expect(normalizeVolumeUnit('millilitre')).toBe('ml');
  });
});

describe('convertWeight', () => {
  it('converts lb to kg', () => {
    const result = convertWeight(10, 'lb', 'kg');
    expect(result).toBeCloseTo(4.536, 2);
  });

  it('converts kg to lb', () => {
    const result = convertWeight(5, 'kg', 'lb');
    expect(result).toBeCloseTo(11.023, 2);
  });

  it('converts g to kg', () => {
    const result = convertWeight(1000, 'g', 'kg');
    expect(result).toBe(1);
  });

  it('converts oz to g', () => {
    const result = convertWeight(1, 'oz', 'g');
    expect(result).toBeCloseTo(28.35, 1);
  });

  it('handles French units', () => {
    const result = convertWeight(2, 'livres', 'kg');
    expect(result).toBeCloseTo(0.907, 2);
  });
});

describe('convertVolume', () => {
  it('converts L to ml', () => {
    expect(convertVolume(2, 'l', 'ml')).toBe(2000);
  });

  it('converts ml to L', () => {
    expect(convertVolume(500, 'ml', 'l')).toBe(0.5);
  });

  it('converts gal to L', () => {
    const result = convertVolume(1, 'gal', 'l');
    expect(result).toBeCloseTo(3.785, 2);
  });
});

// ============================================
// Constants Validation
// ============================================

describe('WEIGHT_TO_GRAMS constant', () => {
  it('has correct conversions', () => {
    expect(WEIGHT_TO_GRAMS.kg).toBe(1000);
    expect(WEIGHT_TO_GRAMS.lb).toBeCloseTo(453.592, 1);
    expect(WEIGHT_TO_GRAMS.oz).toBeCloseTo(28.35, 1);
    expect(WEIGHT_TO_GRAMS.g).toBe(1);
  });

  it('includes French units', () => {
    expect(WEIGHT_TO_GRAMS.livre).toBe(WEIGHT_TO_GRAMS.lb);
    expect(WEIGHT_TO_GRAMS.kilo).toBe(WEIGHT_TO_GRAMS.kg);
    expect(WEIGHT_TO_GRAMS.gramme).toBe(WEIGHT_TO_GRAMS.g);
  });
});

describe('VOLUME_TO_ML constant', () => {
  it('has correct conversions', () => {
    expect(VOLUME_TO_ML.l).toBe(1000);
    expect(VOLUME_TO_ML.ml).toBe(1);
    expect(VOLUME_TO_ML.gal).toBeCloseTo(3785.41, 0);
  });
});
