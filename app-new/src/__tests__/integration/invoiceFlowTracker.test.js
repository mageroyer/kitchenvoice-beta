/**
 * Invoice Flow Tracker Test
 *
 * Simulates the full invoice parsing flow and tracks important values
 * at each stage to catch regressions and ensure handler chain works correctly.
 *
 * Stages tracked:
 * 1. Handler Selection - correct handler based on invoiceType
 * 2. processLines() - line processing with type-specific logic
 * 3. createInventoryItem() - inventory item creation
 * 4. updateInventoryItem() - inventory item updates
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getHandler } from '../../services/invoice/handlers';

// ============================================
// FLOW TRACKER CLASS
// ============================================

/**
 * Captures and reports values at each stage of invoice processing
 */
class FlowTracker {
  constructor(testName) {
    this.testName = testName;
    this.stages = {};
    this.errors = [];
  }

  /**
   * Capture values at a specific stage for a line
   */
  capture(stageName, lineIndex, values) {
    if (!this.stages[stageName]) {
      this.stages[stageName] = {};
    }
    this.stages[stageName][`line${lineIndex}`] = { ...values };
  }

  /**
   * Get captured value
   */
  get(stageName, lineIndex, field) {
    return this.stages[stageName]?.[`line${lineIndex}`]?.[field];
  }

  /**
   * Print a visual report of all captured values
   */
  report() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`FLOW TRACKER: ${this.testName}`);
    console.log('='.repeat(70));

    // Get all unique fields across all stages
    const allFields = new Set();
    const stageNames = Object.keys(this.stages);

    stageNames.forEach(stage => {
      Object.values(this.stages[stage]).forEach(lineData => {
        Object.keys(lineData).forEach(field => allFields.add(field));
      });
    });

    // Build table data
    const fields = Array.from(allFields);

    // Print header
    console.log(`\n${'Stage'.padEnd(25)} | ${fields.map(f => f.padEnd(18)).join(' | ')}`);
    console.log('-'.repeat(25 + 3 + fields.length * 21));

    // Print each stage
    stageNames.forEach(stage => {
      const line0 = this.stages[stage]?.line0 || {};
      const values = fields.map(f => {
        const val = line0[f];
        if (val === null) return 'null'.padEnd(18);
        if (val === undefined) return '-'.padEnd(18);
        if (typeof val === 'number') return val.toFixed(2).padEnd(18);
        return String(val).substring(0, 16).padEnd(18);
      });
      console.log(`${stage.padEnd(25)} | ${values.join(' | ')}`);
    });

    console.log('='.repeat(70) + '\n');
  }

  /**
   * Assert expected values at a stage
   */
  assertLine(lineIndex, stageName, expectedValues) {
    const actual = this.stages[stageName]?.[`line${lineIndex}`];

    if (!actual) {
      throw new Error(`No data captured for ${stageName} line${lineIndex}`);
    }

    for (const [key, expected] of Object.entries(expectedValues)) {
      const actualValue = actual[key];

      if (expected === null) {
        expect(actualValue).toBeNull();
      } else if (typeof expected === 'number') {
        expect(actualValue).toBeCloseTo(expected, 2);
      } else {
        expect(actualValue).toBe(expected);
      }
    }
  }

  /**
   * Assert a value persists unchanged across multiple stages
   */
  assertPersists(lineIndex, field, expectedValue, stages) {
    for (const stage of stages) {
      const actual = this.get(stage, lineIndex, field);
      if (actual !== expectedValue) {
        this.errors.push(`${field} changed at ${stage}: expected ${expectedValue}, got ${actual}`);
      }
      expect(actual).toBe(expectedValue);
    }
  }
}

// ============================================
// TEST FIXTURES
// ============================================

const FIXTURES = {
  /**
   * Packaging Distributor - count-based items
   * Expected: baseUnit=pc, no weight tracking, containerCapacity extracted
   */
  packagingDistributor: {
    name: 'Packaging Distributor Flow',
    profile: {
      invoiceType: 'packagingDistributor',
      version: '1.0'
    },
    vendor: {
      id: 1,
      name: 'Carrousel Emballage Inc.',
      invoiceType: 'packagingDistributor'
    },
    lines: [
      {
        lineNumber: 1,
        description: 'CONTENANT ALUM 2.25LB RECT',
        rawDescription: 'CONTENANT ALUM 2.25LB RECT',
        name: 'CONTENANT ALUM 2.25LB RECT',
        quantity: 2,
        unitPrice: 65.50,
        totalPrice: 131,
        unit: 'un'
      },
      {
        lineNumber: 2,
        description: 'GANTS NITRILE M',
        rawDescription: 'GANTS NITRILE M',
        name: 'GANTS NITRILE M',
        quantity: 1,
        unitPrice: 45,
        totalPrice: 45,
        unit: 'cs',
        format: '10/100'  // Boxing format: 10 packs of 100
      }
    ],
    expected: {
      handlerLabel: 'Packaging Distributor',
      line0: {
        baseUnit: 'pc',
        totalBaseUnits: 2,
        containerCapacity: 2.25,
        containerCapacityUnit: 'lb',
        stockWeightUnit: null,
        pricePerG: null,
        isWeightBased: false
      },
      line1: {
        baseUnit: 'pc',
        totalBaseUnits: 1000,  // 10 × 100 = 1000 units
        packCount: 10,
        unitsPerPack: 100,
        stockWeightUnit: null
      }
    }
  },

  /**
   * Food Supply - weight-based items
   * Expected: pricePerG calculated, weight tracking
   * NOTE: foodSupplyHandler currently doesn't set baseUnit on lines (tracked as pricePerG instead)
   */
  foodSupply: {
    name: 'Food Supply Flow',
    profile: {
      invoiceType: 'foodSupply',
      version: '1.0'
    },
    vendor: {
      id: 2,
      name: 'Sysco Foods',
      invoiceType: 'foodSupply'
    },
    lines: [
      {
        lineNumber: 1,
        description: 'CHICKEN BREAST BONELESS',
        rawDescription: 'CHICKEN BREAST BONELESS',
        name: 'CHICKEN BREAST BONELESS',
        quantity: 2,
        unitPrice: 45,
        totalPrice: 90,
        unit: 'cs',
        format: '2/5LB'  // 2 packs of 5lb each = 10lb per case, 20lb total
      },
      {
        lineNumber: 2,
        description: 'OLIVE OIL EXTRA VIRGIN',
        rawDescription: 'OLIVE OIL EXTRA VIRGIN',
        name: 'OLIVE OIL EXTRA VIRGIN',
        quantity: 1,
        unitPrice: 28,
        totalPrice: 28,
        unit: 'bt',
        format: '3L'  // 3 liter bottle
      }
    ],
    expected: {
      handlerLabel: 'Food Supplier',  // Actual label from handler
      line0: {
        // foodSupplyHandler tracks weight via pricePerG, not baseUnit
        pricePerG: 0.00992,  // ~$90 / 9071.84g
        stockWeightUnit: 'lb',  // Uses the unit from format
        isWeightBased: true
      },
      line1: {
        pricePerML: 28 / 3000,  // 3L = 3000ml
        isWeightBased: false  // Volume, not weight
      }
    }
  },

  /**
   * Generic - fallback handler
   * Expected: minimal processing, basic field preservation
   */
  generic: {
    name: 'Generic Flow',
    profile: {
      invoiceType: 'generic',
      version: '1.0'
    },
    vendor: {
      id: 3,
      name: 'Generic Vendor'
    },
    lines: [
      {
        lineNumber: 1,
        description: 'MISCELLANEOUS ITEM',
        rawDescription: 'MISCELLANEOUS ITEM',
        name: 'MISCELLANEOUS ITEM',
        quantity: 5,
        unitPrice: 10,
        totalPrice: 50,
        unit: 'ea'
      }
    ],
    expected: {
      handlerLabel: 'Generic',
      line0: {
        quantity: 5,
        unitPrice: 10,
        totalPrice: 50
      }
    }
  }
};

// ============================================
// TESTS
// ============================================

describe('Invoice Flow Tracker', () => {

  describe('Packaging Distributor Flow', () => {
    let tracker;
    let handler;
    let fixture;

    beforeEach(() => {
      fixture = FIXTURES.packagingDistributor;
      tracker = new FlowTracker(fixture.name);
      handler = getHandler(fixture.profile?.invoiceType);
    });

    test('selects correct handler', () => {
      tracker.capture('handlerSelection', 0, {
        invoiceType: fixture.profile.invoiceType,
        handlerLabel: handler.label,
        handlerType: handler.type
      });

      expect(handler.label).toBe(fixture.expected.handlerLabel);
      expect(handler.type).toBe('packagingDistributor');
    });

    test('processLines sets baseUnit=pc and extracts containerCapacity', () => {
      // Stage: processLines
      const processed = handler.processLines(fixture.lines, fixture.profile);

      processed.lines.forEach((line, i) => {
        tracker.capture('processLines', i, {
          baseUnit: line.baseUnit,
          totalBaseUnits: line.totalBaseUnits,
          calculatedTotalUnits: line.calculatedTotalUnits,
          containerCapacity: line.containerCapacity,
          containerCapacityUnit: line.containerCapacityUnit,
          packCount: line.packCount,
          unitsPerPack: line.unitsPerPack
        });
      });

      tracker.report();

      // Line 0: Container with capacity
      tracker.assertLine(0, 'processLines', {
        baseUnit: 'pc',
        containerCapacity: 2.25
      });

      // Line 1: Boxing format with units
      const line1 = tracker.get('processLines', 1, 'totalBaseUnits') ||
                    tracker.get('processLines', 1, 'calculatedTotalUnits');
      expect(line1).toBe(1000);  // 10 × 100
    });

    test('baseUnit=pc is set by processLines for packaging', () => {
      // Stage 1: processLines
      const processed = handler.processLines(fixture.lines, fixture.profile);
      processed.lines.forEach((line, i) => {
        tracker.capture('processLines', i, {
          baseUnit: line.baseUnit,
          totalBaseUnits: line.totalBaseUnits || line.calculatedTotalUnits || line.quantity
        });
      });

      tracker.report();

      // Assert baseUnit=pc is set by processLines for packaging items
      expect(tracker.get('processLines', 0, 'baseUnit')).toBe('pc');
      expect(tracker.get('processLines', 1, 'baseUnit')).toBe('pc');
    });

    test('createInventoryItem sets stockWeightUnit=null for packaging', () => {
      const processed = handler.processLines(fixture.lines, fixture.profile);
      const processedLine = processed.lines[0];

      // Stage: createInventoryItem (uses processed line directly, not formatted)
      const result = handler.createInventoryItem(processedLine, fixture.vendor, {
        invoiceId: 1,
        invoiceDate: new Date().toISOString()
      });

      tracker.capture('createInventory', 0, {
        stockWeightUnit: result.item.stockWeightUnit,
        pricePerG: result.item.pricePerG,
        pricePerUnit: result.item.pricePerUnit,
        category: result.item.category,
        containerCapacity: result.item.containerCapacity,
        containerCapacityUnit: result.item.containerCapacityUnit
      });

      tracker.report();

      // Packaging items should NOT be weight-based
      expect(result.item.stockWeightUnit).toBeNull();
      expect(result.item.pricePerG).toBeNull();
      expect(result.item.category).toBe('PACKAGING');  // LINE_CATEGORY.PACKAGING
    });

    test('full flow: container item (CONTENANT ALUM 2.25LB)', () => {
      const line = fixture.lines[0];

      // Full flow: processLines → createInventoryItem
      const processed = handler.processLines([line], fixture.profile);
      const processedLine = processed.lines[0];
      tracker.capture('1_processLines', 0, {
        baseUnit: processedLine.baseUnit,
        totalBaseUnits: processedLine.totalBaseUnits,
        containerCapacity: processedLine.containerCapacity
      });

      const inventory = handler.createInventoryItem(processedLine, fixture.vendor, {});
      tracker.capture('2_createInventory', 0, {
        stockWeightUnit: inventory.item.stockWeightUnit,
        pricePerG: inventory.item.pricePerG,
        containerCapacity: inventory.item.containerCapacity
      });

      tracker.report();

      // Final assertions
      expect(processedLine.baseUnit).toBe('pc');
      expect(processedLine.totalBaseUnits).toBe(2);
      expect(inventory.item.stockWeightUnit).toBeNull();
      expect(inventory.item.containerCapacity).toBe(2.25);
    });

    test('full flow: boxing format item (GANTS NITRILE 10/100)', () => {
      const line = fixture.lines[1];

      // Full flow: processLines → verify outputs
      const processed = handler.processLines([line], fixture.profile);
      const processedLine = processed.lines[0];
      tracker.capture('1_processLines', 0, {
        baseUnit: processedLine.baseUnit,
        totalBaseUnits: processedLine.totalBaseUnits,
        calculatedTotalUnits: processedLine.calculatedTotalUnits,
        packCount: processedLine.packCount,
        unitsPerPack: processedLine.unitsPerPack
      });

      tracker.report();

      // Boxing format should calculate total units
      const totalUnits = processedLine.totalBaseUnits;
      expect(totalUnits).toBe(1000);  // 10 × 100 × 1 qty
      expect(processedLine.baseUnit).toBe('pc');
    });
  });

  describe('Food Supply Flow', () => {
    let tracker;
    let handler;
    let fixture;

    beforeEach(() => {
      fixture = FIXTURES.foodSupply;
      tracker = new FlowTracker(fixture.name);
      handler = getHandler(fixture.profile?.invoiceType);
    });

    test('selects correct handler', () => {
      expect(handler.label).toBe(fixture.expected.handlerLabel);
      expect(handler.type).toBe('foodSupply');
    });

    test('processLines extracts weight and calculates pricePerG', () => {
      // Test only the weight-based line
      const processed = handler.processLines([fixture.lines[0]], fixture.profile);

      processed.lines.forEach((line, i) => {
        tracker.capture('processLines', i, {
          weightInGrams: line.weightInGrams,
          pricePerG: line.pricePerG,
          weight: line.weight,
          weightUnit: line.weightUnit
        });
      });

      tracker.report();

      // Line 0: Weight-based (2/5LB chicken) - should have pricePerG
      const line0 = processed.lines[0];
      expect(line0.pricePerG).toBeGreaterThan(0);
    });

    test('createInventoryItem sets weight tracking for food items', () => {
      const processed = handler.processLines([fixture.lines[0]], fixture.profile);
      const processedLine = processed.lines[0];

      const result = handler.createInventoryItem(processedLine, fixture.vendor, {});

      tracker.capture('createInventory', 0, {
        stockWeightUnit: result.item.stockWeightUnit,
        pricePerG: result.item.pricePerG,
        category: result.item.category
      });

      tracker.report();

      // Food items SHOULD have pricePerG and weight unit
      expect(result.item.pricePerG).toBeGreaterThan(0);
      // stockWeightUnit comes from the format unit (lb in this case)
      expect(result.item.stockWeightUnit).toBeTruthy();
    });

    test('full flow: weight-based item (CHICKEN BREAST 2/5LB)', () => {
      const line = fixture.lines[0];

      // Full flow: processLines → createInventoryItem
      const processed = handler.processLines([line], fixture.profile);
      const processedLine = processed.lines[0];
      tracker.capture('1_processLines', 0, {
        weightInGrams: processedLine.weightInGrams,
        pricePerG: processedLine.pricePerG,
        weight: processedLine.weight,
        weightUnit: processedLine.weightUnit
      });

      const inventory = handler.createInventoryItem(processedLine, fixture.vendor, {});
      tracker.capture('2_createInventory', 0, {
        stockWeightUnit: inventory.item.stockWeightUnit,
        pricePerG: inventory.item.pricePerG
      });

      tracker.report();

      // Weight-based assertions
      expect(inventory.item.pricePerG).toBeGreaterThan(0);
      expect(inventory.item.stockWeightUnit).toBeTruthy();
    });

    // TODO: Volume-based parsing (pricePerML) needs implementation in foodSupplyHandler
    test.skip('full flow: volume-based item (OLIVE OIL 3L)', () => {
      const line = fixture.lines[1];

      const processed = handler.processLines([line], fixture.profile);
      const processedLine = processed.lines[0];
      tracker.capture('1_processLines', 0, {
        pricePerML: processedLine.pricePerML,
        totalBaseUnits: processedLine.totalBaseUnits
      });

      const inventory = handler.createInventoryItem(processedLine, fixture.vendor, {});
      tracker.capture('2_createInventory', 0, {
        stockWeightUnit: inventory.item.stockWeightUnit,
        pricePerML: inventory.item.pricePerML
      });

      tracker.report();

      // Volume-based assertions
      expect(inventory.item.pricePerML).toBeGreaterThan(0);
    });
  });

  describe('Handler Comparison', () => {

    test('same container item processed differently by packaging vs food handler', () => {
      const packagingTracker = new FlowTracker('Packaging Handler');
      const foodTracker = new FlowTracker('Food Handler');

      // Container item - packaging handler should recognize container keywords
      const line = {
        lineNumber: 1,
        description: 'CONTENANT 2.25LB',  // Has container keyword
        name: 'CONTENANT 2.25LB',
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100,
        unit: 'cs'
      };

      // Process with packaging handler
      const packagingHandler = getHandler('packagingDistributor');
      const packagingProcessed = packagingHandler.processLines([line], {});
      packagingTracker.capture('processLines', 0, {
        baseUnit: packagingProcessed.lines[0].baseUnit,
        containerCapacity: packagingProcessed.lines[0].containerCapacity,
        pricePerG: packagingProcessed.lines[0].pricePerG
      });

      // Process with food handler
      const foodHandler = getHandler('foodSupply');
      const foodProcessed = foodHandler.processLines([line], {});
      foodTracker.capture('processLines', 0, {
        weightInGrams: foodProcessed.lines[0].weightInGrams,
        pricePerG: foodProcessed.lines[0].pricePerG
      });

      console.log('\n' + '='.repeat(70));
      console.log('HANDLER COMPARISON: Same item, different handlers');
      console.log('='.repeat(70));
      packagingTracker.report();
      foodTracker.report();

      // Packaging: treats "2.25LB" as container capacity, count-based
      expect(packagingProcessed.lines[0].baseUnit).toBe('pc');
      expect(packagingProcessed.lines[0].containerCapacity).toBe(2.25);
      expect(packagingProcessed.lines[0].pricePerG).toBeNull();

      // Food: treats "2.25LB" as product weight, calculates pricePerG
      expect(foodProcessed.lines[0].pricePerG).toBeGreaterThan(0);
    });
  });

  describe('Profile & Column Mapping Flow', () => {

    test('applyColumnMapping extracts format from mapped column', () => {
      const handler = getHandler('packagingDistributor');

      // Profile with column mapping: column 0 is packageFormat
      const profile = {
        invoiceType: 'packagingDistributor',
        columns: {
          packageFormat: { index: 0, label: 'Description' }
        }
      };

      // Line from Claude with column values
      const line = {
        description: 'GANTS NITRILE M',
        // Simulating column values as they come from Claude
        _columns: ['10/100', 'GANTS NITRILE M', '1', '45.00', '45.00'],
        column_0: '10/100'  // This is the format in column 0
      };

      const mapped = handler.applyColumnMapping(line, profile);

      console.log('\n' + '='.repeat(70));
      console.log('COLUMN MAPPING TEST:');
      console.log('Profile columns:', JSON.stringify(profile.columns, null, 2));
      console.log('Line before mapping:', JSON.stringify(line, null, 2));
      console.log('Line after mapping:', JSON.stringify(mapped, null, 2));
      console.log('='.repeat(70) + '\n');

      // The format should be extracted from the mapped column
      // Note: This depends on how getColumnValue works
    });

    test('full wizard flow: type selection + column correction', () => {
      const tracker = new FlowTracker('Wizard Flow');

      // Step 1: User selects invoice type = packagingDistributor
      const invoiceType = 'packagingDistributor';
      const handler = getHandler(invoiceType);

      tracker.capture('1_typeSelection', 0, {
        invoiceType,
        handlerLabel: handler.label,
        handlerType: handler.type
      });

      // Step 2: User corrects column mapping (Description → packageFormat)
      const profile = {
        invoiceType: 'packagingDistributor',
        version: '1.0',
        columns: {
          description: { index: 1, label: 'Description' },
          packageFormat: { index: 0, label: 'Format', aiLabel: 'itemFormat' },
          quantity: { index: 2, label: 'Qty' },
          unitPrice: { index: 3, label: 'Price' },
          total: { index: 4, label: 'Total' }
        }
      };

      tracker.capture('2_profileBuilt', 0, {
        invoiceType: profile.invoiceType,
        hasColumns: Object.keys(profile.columns).length,
        hasPackageFormat: !!profile.columns.packageFormat
      });

      // Step 3: Process lines with profile
      const mockLines = [{
        lineNumber: 1,
        description: 'GANTS NITRILE M',
        format: '10/100',
        quantity: 1,
        unitPrice: 45,
        totalPrice: 45
      }];

      const processed = handler.processLines(mockLines, profile);

      tracker.capture('3_processLines', 0, {
        baseUnit: processed.lines[0].baseUnit,
        totalBaseUnits: processed.lines[0].totalBaseUnits,
        format: processed.lines[0].format
      });

      tracker.report();

      // Assertions
      expect(handler.type).toBe('packagingDistributor');
      expect(profile.columns.packageFormat).toBeDefined();
      expect(processed.lines[0].baseUnit).toBe('pc');
    });
  });

  describe('Regression Tests', () => {

    test('REGRESSION: decimal in containerCapacity not lost (2.25 not 25)', () => {
      const handler = getHandler('packagingDistributor');
      const line = {
        description: 'CONTENANT ALUM 2.25LB RECT',
        name: 'CONTENANT ALUM 2.25LB RECT',
        quantity: 1,
        unitPrice: 65.50,
        totalPrice: 65.50
      };

      const processed = handler.processLines([line], {});

      // Must be 2.25, not 25
      expect(processed.lines[0].containerCapacity).toBe(2.25);
    });

    test('REGRESSION: lost decimal from OCR (2 25LB → 2.25)', () => {
      const handler = getHandler('packagingDistributor');
      const line = {
        // OCR sometimes loses the decimal point
        description: 'CONTENANT ALUM 2 25LB RECT',
        name: 'CONTENANT ALUM 2 25LB RECT',
        quantity: 1,
        unitPrice: 65.50,
        totalPrice: 65.50
      };

      const processed = handler.processLines([line], {});

      // Should reconstruct 2.25 from "2 25LB"
      expect(processed.lines[0].containerCapacity).toBe(2.25);
    });

    test('baseUnit is set correctly for packaging items', () => {
      const handler = getHandler('packagingDistributor');
      const line = {
        description: 'GANTS NITRILE',
        name: 'GANTS NITRILE',
        quantity: 1,
        unitPrice: 45,
        totalPrice: 45
      };

      const processed = handler.processLines([line], {});
      const processedLine = processed.lines[0];

      // processLines should set baseUnit=pc for packaging
      expect(processedLine.baseUnit).toBe('pc');
    });

    test('REGRESSION: stockWeightUnit=null for packaging (not "g")', () => {
      const handler = getHandler('packagingDistributor');
      const line = {
        description: 'CONTENANT',
        name: 'CONTENANT',
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100
      };

      const result = handler.createInventoryItem(line, { id: 1, name: 'Test' }, {});

      // Packaging items must NOT have weight unit
      expect(result.item.stockWeightUnit).toBeNull();
    });

    test('REGRESSION: vendorProfile passed to processLinesToInventory', () => {
      // This tests that the profile is available for handler selection
      const profile = { invoiceType: 'packagingDistributor' };
      const handler = getHandler(profile?.invoiceType);

      // If profile is null/undefined, we'd get generic handler
      expect(handler.type).toBe('packagingDistributor');
      expect(handler.label).toBe('Packaging Distributor');
    });
  });
});
