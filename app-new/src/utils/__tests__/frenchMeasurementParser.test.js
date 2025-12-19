/**
 * Unit Tests for frenchMeasurementParser.js
 *
 * Tests French measurement parsing including:
 * - Metric unit conversions (grams, kilograms, liters, milliliters)
 * - French number words to digits
 * - Tool measure parsing (cups, spoons, etc.)
 * - Field-specific parsing behavior
 */

import { describe, it, expect } from 'vitest';
import frenchParser, {
  parseFrenchMeasurement,
  parseIngredientField,
} from '../frenchMeasurementParser.js';

// Access exported constants from default export
const { FRENCH_NUMBERS, METRIC_UNITS } = frenchParser;

describe('FRENCH_NUMBERS mapping', () => {
  it('should have correct basic numbers', () => {
    expect(FRENCH_NUMBERS['un']).toBe('1');
    expect(FRENCH_NUMBERS['une']).toBe('1');
    expect(FRENCH_NUMBERS['deux']).toBe('2');
    expect(FRENCH_NUMBERS['trois']).toBe('3');
    expect(FRENCH_NUMBERS['quatre']).toBe('4');
    expect(FRENCH_NUMBERS['cinq']).toBe('5');
  });

  it('should have correct teen numbers', () => {
    expect(FRENCH_NUMBERS['dix']).toBe('10');
    expect(FRENCH_NUMBERS['onze']).toBe('11');
    expect(FRENCH_NUMBERS['douze']).toBe('12');
    expect(FRENCH_NUMBERS['quinze']).toBe('15');
    expect(FRENCH_NUMBERS['seize']).toBe('16');
  });

  it('should have correct tens', () => {
    expect(FRENCH_NUMBERS['vingt']).toBe('20');
    expect(FRENCH_NUMBERS['trente']).toBe('30');
    expect(FRENCH_NUMBERS['quarante']).toBe('40');
    expect(FRENCH_NUMBERS['cinquante']).toBe('50');
    expect(FRENCH_NUMBERS['soixante']).toBe('60');
  });

  it('should have large numbers', () => {
    expect(FRENCH_NUMBERS['cent']).toBe('100');
    expect(FRENCH_NUMBERS['mille']).toBe('1000');
  });
});

describe('METRIC_UNITS mapping', () => {
  describe('weight units', () => {
    it('should map grams correctly', () => {
      expect(METRIC_UNITS['gramme']).toBe('g');
      expect(METRIC_UNITS['grammes']).toBe('g');
      expect(METRIC_UNITS['gr']).toBe('g');
      expect(METRIC_UNITS['g']).toBe('g');
    });

    it('should map kilograms correctly', () => {
      expect(METRIC_UNITS['kilogramme']).toBe('kg');
      expect(METRIC_UNITS['kilogrammes']).toBe('kg');
      expect(METRIC_UNITS['kilo']).toBe('kg');
      expect(METRIC_UNITS['kilos']).toBe('kg');
      expect(METRIC_UNITS['kg']).toBe('kg');
    });
  });

  describe('volume units', () => {
    it('should map liters correctly', () => {
      expect(METRIC_UNITS['litre']).toBe('l');
      expect(METRIC_UNITS['litres']).toBe('l');
      expect(METRIC_UNITS['l']).toBe('l');
    });

    it('should map milliliters correctly', () => {
      expect(METRIC_UNITS['millilitre']).toBe('ml');
      expect(METRIC_UNITS['millilitres']).toBe('ml');
      expect(METRIC_UNITS['ml']).toBe('ml');
    });

    it('should map centiliters correctly', () => {
      expect(METRIC_UNITS['centilitre']).toBe('cl');
      expect(METRIC_UNITS['centilitres']).toBe('cl');
      expect(METRIC_UNITS['cl']).toBe('cl');
    });
  });

  describe('cooking measures', () => {
    it('should map cups', () => {
      expect(METRIC_UNITS['tasse']).toBe('tasse');
      expect(METRIC_UNITS['tasses']).toBe('tasse');
    });

    it('should map spoons', () => {
      expect(METRIC_UNITS['cuillère']).toBe('c.');
      expect(METRIC_UNITS['cuillères']).toBe('c.');
      expect(METRIC_UNITS['cuillère à soupe']).toBe('c. à soupe');
      expect(METRIC_UNITS['cuillère à café']).toBe('c. à café');
    });

    it('should map other measures', () => {
      expect(METRIC_UNITS['boîte']).toBe('boîte');
      expect(METRIC_UNITS['canne']).toBe('canne');
      expect(METRIC_UNITS['pincée']).toBe('pincée');
    });
  });
});

describe('parseFrenchMeasurement', () => {
  describe('metric field parsing', () => {
    describe('gram measurements', () => {
      it('should parse numeric grams', () => {
        expect(parseFrenchMeasurement('250 grammes', 'metric')).toBe('250g');
        expect(parseFrenchMeasurement('500 gramme', 'metric')).toBe('500g');
        expect(parseFrenchMeasurement('100 g', 'metric')).toBe('100g');
      });

      it('should parse French word numbers with grams', () => {
        expect(parseFrenchMeasurement('deux grammes', 'metric')).toBe('2g');
        expect(parseFrenchMeasurement('cinq grammes', 'metric')).toBe('5g');
        expect(parseFrenchMeasurement('dix grammes', 'metric')).toBe('10g');
      });

      it('should handle decimal grams', () => {
        expect(parseFrenchMeasurement('2.5 grammes', 'metric')).toBe('2.5g');
        expect(parseFrenchMeasurement('2,5 grammes', 'metric')).toBe('2.5g');
      });
    });

    describe('kilogram measurements', () => {
      it('should parse numeric kilograms', () => {
        expect(parseFrenchMeasurement('2 kilogrammes', 'metric')).toBe('2kg');
        expect(parseFrenchMeasurement('1 kilo', 'metric')).toBe('1kg');
        expect(parseFrenchMeasurement('5 kilos', 'metric')).toBe('5kg');
        expect(parseFrenchMeasurement('3 kg', 'metric')).toBe('3kg');
      });

      it('should parse French word numbers with kilograms', () => {
        expect(parseFrenchMeasurement('deux kilogrammes', 'metric')).toBe('2kg');
        expect(parseFrenchMeasurement('trois kilos', 'metric')).toBe('3kg');
      });
    });

    describe('liter measurements', () => {
      it('should parse numeric liters', () => {
        expect(parseFrenchMeasurement('2 litres', 'metric')).toBe('2l');
        expect(parseFrenchMeasurement('1 litre', 'metric')).toBe('1l');
        expect(parseFrenchMeasurement('5 l', 'metric')).toBe('5l');
      });

      it('should parse French word numbers with liters', () => {
        expect(parseFrenchMeasurement('deux litres', 'metric')).toBe('2l');
      });
    });

    describe('milliliter measurements', () => {
      it('should parse numeric milliliters', () => {
        expect(parseFrenchMeasurement('500 millilitres', 'metric')).toBe('500ml');
        expect(parseFrenchMeasurement('250 ml', 'metric')).toBe('250ml');
      });

      it('should parse French word numbers with milliliters', () => {
        expect(parseFrenchMeasurement('cent millilitres', 'metric')).toBe('100ml');
      });
    });

    describe('centiliter measurements', () => {
      it('should parse numeric centiliters', () => {
        expect(parseFrenchMeasurement('50 centilitres', 'metric')).toBe('50cl');
        expect(parseFrenchMeasurement('25 cl', 'metric')).toBe('25cl');
      });
    });
  });

  describe('toolMeasure field parsing', () => {
    describe('cup measurements', () => {
      it('should parse numeric cups', () => {
        expect(parseFrenchMeasurement('2 tasses', 'toolMeasure')).toBe('2 tasse');
        expect(parseFrenchMeasurement('1 tasse', 'toolMeasure')).toBe('1 tasse');
      });

      it('should parse French word numbers with cups', () => {
        expect(parseFrenchMeasurement('deux tasses', 'toolMeasure')).toBe('2 tasse');
        expect(parseFrenchMeasurement('une tasse', 'toolMeasure')).toBe('1 tasse');
      });
    });

    describe('spoon measurements', () => {
      it('should parse spoons', () => {
        expect(parseFrenchMeasurement('2 cuillères', 'toolMeasure')).toBe('2 c.');
        expect(parseFrenchMeasurement('une cuillère', 'toolMeasure')).toBe('1 c.');
      });
    });

    describe('other tool measures', () => {
      it('should parse boxes/cans', () => {
        expect(parseFrenchMeasurement('1 boîte', 'toolMeasure')).toBe('1 boîte');
        expect(parseFrenchMeasurement('2 boites', 'toolMeasure')).toBe('2 boîte');
        expect(parseFrenchMeasurement('une canne', 'toolMeasure')).toBe('1 canne');
      });

      it('should parse pinches', () => {
        expect(parseFrenchMeasurement('1 pincée', 'toolMeasure')).toBe('1 pincée');
        // Note: pincées returns pincées because METRIC_UNITS maps it to 'pincée' but
        // the regex captures plural forms which may not all be in the mapping
        expect(parseFrenchMeasurement('deux pincées', 'toolMeasure')).toBe('2 pincées');
      });
    });
  });

  describe('non-metric/toolMeasure fields', () => {
    it('should return text as-is for name field', () => {
      expect(parseFrenchMeasurement('250 grammes', 'name')).toBe('250 grammes');
      expect(parseFrenchMeasurement('farine', 'name')).toBe('farine');
    });

    it('should return text as-is for specification field', () => {
      expect(parseFrenchMeasurement('finement haché', 'specification')).toBe('finement haché');
    });

    it('should return text as-is for unknown field', () => {
      expect(parseFrenchMeasurement('test text', 'unknown')).toBe('test text');
    });
  });

  describe('edge cases', () => {
    it('should handle empty/null input', () => {
      expect(parseFrenchMeasurement('', 'metric')).toBe('');
      expect(parseFrenchMeasurement(null, 'metric')).toBe(null);
      expect(parseFrenchMeasurement(undefined, 'metric')).toBe(undefined);
    });

    it('should handle non-string input', () => {
      expect(parseFrenchMeasurement(123, 'metric')).toBe(123);
    });

    it('should handle text without units', () => {
      expect(parseFrenchMeasurement('some random text', 'metric')).toBe('some random text');
    });

    it('should be case insensitive', () => {
      expect(parseFrenchMeasurement('250 GRAMMES', 'metric')).toBe('250g');
      expect(parseFrenchMeasurement('2 LITRES', 'metric')).toBe('2l');
    });

    it('should handle extra whitespace', () => {
      expect(parseFrenchMeasurement('  250 grammes  ', 'metric')).toBe('250g');
    });
  });
});

describe('parseIngredientField', () => {
  describe('metric field', () => {
    it('should parse metric measurements', () => {
      expect(parseIngredientField('250 grammes', 'metric')).toBe('250g');
      expect(parseIngredientField('2 litres', 'metric')).toBe('2l');
    });
  });

  describe('toolMeasure field', () => {
    it('should parse tool measurements', () => {
      expect(parseIngredientField('2 tasses', 'toolMeasure')).toBe('2 tasse');
      expect(parseIngredientField('1 cuillère', 'toolMeasure')).toBe('1 c.');
    });
  });

  describe('name field', () => {
    it('should capitalize first letter', () => {
      expect(parseIngredientField('flour', 'name')).toBe('Flour');
      expect(parseIngredientField('sugar', 'name')).toBe('Sugar');
      expect(parseIngredientField('sel de mer', 'name')).toBe('Sel de mer');
    });

    it('should preserve already capitalized text', () => {
      expect(parseIngredientField('Flour', 'name')).toBe('Flour');
    });
  });

  describe('specification field', () => {
    it('should capitalize first letter', () => {
      expect(parseIngredientField('finely chopped', 'specification')).toBe('Finely chopped');
      expect(parseIngredientField('room temperature', 'specification')).toBe('Room temperature');
    });
  });

  describe('default/unknown field', () => {
    it('should return text as-is', () => {
      expect(parseIngredientField('test', 'unknown')).toBe('test');
      expect(parseIngredientField('test', undefined)).toBe('test');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      expect(parseIngredientField('', 'name')).toBe('');
      expect(parseIngredientField(null, 'name')).toBe(null);
      expect(parseIngredientField(undefined, 'name')).toBe(undefined);
    });
  });
});

describe('French number word conversions', () => {
  it('should convert basic numbers in context', () => {
    expect(parseFrenchMeasurement('un gramme', 'metric')).toBe('1g');
    expect(parseFrenchMeasurement('une gramme', 'metric')).toBe('1g');
    expect(parseFrenchMeasurement('deux grammes', 'metric')).toBe('2g');
    expect(parseFrenchMeasurement('trois grammes', 'metric')).toBe('3g');
    expect(parseFrenchMeasurement('quatre grammes', 'metric')).toBe('4g');
    expect(parseFrenchMeasurement('cinq grammes', 'metric')).toBe('5g');
    expect(parseFrenchMeasurement('six grammes', 'metric')).toBe('6g');
    expect(parseFrenchMeasurement('sept grammes', 'metric')).toBe('7g');
    expect(parseFrenchMeasurement('huit grammes', 'metric')).toBe('8g');
    expect(parseFrenchMeasurement('neuf grammes', 'metric')).toBe('9g');
  });

  it('should convert teen numbers', () => {
    expect(parseFrenchMeasurement('dix grammes', 'metric')).toBe('10g');
    expect(parseFrenchMeasurement('onze grammes', 'metric')).toBe('11g');
    expect(parseFrenchMeasurement('douze grammes', 'metric')).toBe('12g');
    expect(parseFrenchMeasurement('treize grammes', 'metric')).toBe('13g');
    expect(parseFrenchMeasurement('quatorze grammes', 'metric')).toBe('14g');
    expect(parseFrenchMeasurement('quinze grammes', 'metric')).toBe('15g');
    expect(parseFrenchMeasurement('seize grammes', 'metric')).toBe('16g');
  });

  it('should convert tens', () => {
    expect(parseFrenchMeasurement('vingt grammes', 'metric')).toBe('20g');
    expect(parseFrenchMeasurement('trente grammes', 'metric')).toBe('30g');
    expect(parseFrenchMeasurement('quarante grammes', 'metric')).toBe('40g');
    expect(parseFrenchMeasurement('cinquante grammes', 'metric')).toBe('50g');
    expect(parseFrenchMeasurement('soixante grammes', 'metric')).toBe('60g');
  });

  it('should convert large numbers', () => {
    expect(parseFrenchMeasurement('cent grammes', 'metric')).toBe('100g');
    expect(parseFrenchMeasurement('mille grammes', 'metric')).toBe('1000g');
  });
});

describe('decimal handling', () => {
  it('should handle dot decimals', () => {
    expect(parseFrenchMeasurement('2.5 kilogrammes', 'metric')).toBe('2.5kg');
    expect(parseFrenchMeasurement('0.5 litres', 'metric')).toBe('0.5l');
  });

  it('should convert comma decimals to dot', () => {
    expect(parseFrenchMeasurement('2,5 kilogrammes', 'metric')).toBe('2.5kg');
    expect(parseFrenchMeasurement('0,75 litres', 'metric')).toBe('0.75l');
    expect(parseFrenchMeasurement('1,25 grammes', 'metric')).toBe('1.25g');
  });
});

describe('real-world voice input scenarios', () => {
  it('should handle common baking measurements', () => {
    expect(parseFrenchMeasurement('500 grammes', 'metric')).toBe('500g');
    expect(parseFrenchMeasurement('250 millilitres', 'metric')).toBe('250ml');
    expect(parseFrenchMeasurement('1 kilogramme', 'metric')).toBe('1kg');
  });

  it('should handle spoken tool measurements', () => {
    expect(parseFrenchMeasurement('deux tasses', 'toolMeasure')).toBe('2 tasse');
    expect(parseFrenchMeasurement('une cuillère', 'toolMeasure')).toBe('1 c.');
    expect(parseFrenchMeasurement('trois pincées', 'toolMeasure')).toBe('3 pincées');
  });

  it('should handle ingredient names appropriately', () => {
    expect(parseIngredientField('farine tout usage', 'name')).toBe('Farine tout usage');
    expect(parseIngredientField('beurre', 'name')).toBe('Beurre');
    expect(parseIngredientField('oeufs', 'name')).toBe('Oeufs');
  });

  it('should handle specifications', () => {
    expect(parseIngredientField('température pièce', 'specification')).toBe('Température pièce');
    expect(parseIngredientField('finement haché', 'specification')).toBe('Finement haché');
  });
});
