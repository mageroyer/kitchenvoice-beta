/**
 * Recipe Deduction Service Tests
 *
 * Tests for the new recipe ingredient deduction service with proper unit conversion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDeductionStrategy,
  parseRecipeMetric,
  convertToInventoryUnit,
  deductRecipeIngredients,
} from '../recipeDeductionService.js';

// Mock dependencies
vi.mock('../../database/indexedDB.js', () => ({
  inventoryItemDB: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  stockTransactionDB: {
    recordTaskUsage: vi.fn(),
  },
}));

vi.mock('../../database/inventoryHelpers.js', () => ({
  getEffectivePar: vi.fn(() => ({ value: 100, unit: 'lb', type: 'weight' })),
}));

import { inventoryItemDB, stockTransactionDB } from '../../database/indexedDB.js';

describe('recipeDeductionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // getDeductionStrategy Tests
  // ============================================

  describe('getDeductionStrategy', () => {
    it('returns null for null/undefined item', () => {
      expect(getDeductionStrategy(null)).toBeNull();
      expect(getDeductionStrategy(undefined)).toBeNull();
    });

    it('returns volume strategy for pricePerML > 0', () => {
      const item = { pricePerML: 0.005, stockWeightUnit: 'L' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('volume');
      expect(strategy.stockField).toBe('stockWeight');
      expect(strategy.stockUnit).toBe('L');
      expect(strategy.baseUnit).toBe('ml');
    });

    it('returns weight strategy for pricePerG > 0', () => {
      const item = { pricePerG: 0.01, stockWeightUnit: 'lb' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('weight');
      expect(strategy.stockField).toBe('stockWeight');
      expect(strategy.stockUnit).toBe('lb');
      expect(strategy.baseUnit).toBe('g');
    });

    it('returns weight strategy for pricingType === weight', () => {
      const item = { pricingType: 'weight', stockWeightUnit: 'kg' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('weight');
      expect(strategy.stockUnit).toBe('kg');
    });

    it('returns unit strategy for pricePerUnit > 0', () => {
      const item = { pricePerUnit: 5.99, stockQuantityUnit: 'case' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('unit');
      expect(strategy.stockField).toBe('stockQuantity');
      expect(strategy.stockUnit).toBe('case');
      expect(strategy.baseUnit).toBe('ea');
    });

    it('returns weight strategy fallback for stockWeightUnit set', () => {
      const item = { stockWeightUnit: 'lb' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('weight');
      expect(strategy.stockUnit).toBe('lb');
    });

    it('defaults to unit strategy for unknown items', () => {
      const item = { name: 'Unknown Item' };
      const strategy = getDeductionStrategy(item);

      expect(strategy.type).toBe('unit');
      expect(strategy.stockField).toBe('stockQuantity');
      expect(strategy.stockUnit).toBe('ea');
    });

    it('detects case tracking for weight items with weightPerUnit', () => {
      const item = {
        pricePerG: 0.01,
        stockWeightUnit: 'lb',
        stockQuantity: 5,
        weightPerUnit: 11340, // 25lb in grams
      };
      const strategy = getDeductionStrategy(item);

      expect(strategy.hasCase).toBe(true);
      expect(strategy.weightPerCase).toBeCloseTo(25, 1); // 25lb
    });

    it('calculates case weight from purchaseQty and purchaseUnit', () => {
      const item = {
        pricePerG: 0.01,
        stockWeightUnit: 'lb',
        stockQuantity: 5,
        purchaseQty: 25,
        purchaseUnit: 'lb',
      };
      const strategy = getDeductionStrategy(item);

      expect(strategy.hasCase).toBe(true);
      expect(strategy.weightPerCase).toBeCloseTo(25, 1); // 25lb
    });
  });

  // ============================================
  // parseRecipeMetric Tests
  // ============================================

  describe('parseRecipeMetric', () => {
    it('parses grams correctly', () => {
      const result = parseRecipeMetric('300g');
      expect(result.value).toBe(300);
      expect(result.unit).toBe('g');
      expect(result.original).toBe('300g');
    });

    it('converts kg to grams', () => {
      const result = parseRecipeMetric('1.5kg');
      expect(result.value).toBe(1500);
      expect(result.unit).toBe('g');
    });

    it('parses ml correctly', () => {
      const result = parseRecipeMetric('500ml');
      expect(result.value).toBe(500);
      expect(result.unit).toBe('ml');
    });

    it('converts L to ml', () => {
      const result = parseRecipeMetric('2L');
      expect(result.value).toBe(2000);
      expect(result.unit).toBe('ml');
    });

    it('converts cl to ml', () => {
      const result = parseRecipeMetric('50cl');
      expect(result.value).toBe(500);
      expect(result.unit).toBe('ml');
    });

    it('handles comma as decimal separator', () => {
      const result = parseRecipeMetric('1,5kg');
      expect(result.value).toBe(1500);
    });

    it('handles whitespace', () => {
      const result = parseRecipeMetric('  300 g  ');
      expect(result.value).toBe(300);
      expect(result.unit).toBe('g');
    });

    it('returns null for invalid format', () => {
      expect(parseRecipeMetric('abc')).toBeNull();
      expect(parseRecipeMetric('')).toBeNull();
      expect(parseRecipeMetric(null)).toBeNull();
      expect(parseRecipeMetric('300')).not.toBeNull(); // No unit defaults to 'g'
    });

    it('handles ea/pc units', () => {
      const result = parseRecipeMetric('5ea');
      expect(result.value).toBe(5);
      expect(result.unit).toBe('ea');
    });

    it('handles portion/unit count variations', () => {
      expect(parseRecipeMetric('3 portions').unit).toBe('ea');
      expect(parseRecipeMetric('3 portions').value).toBe(3);
      expect(parseRecipeMetric('5 units').unit).toBe('ea');
      expect(parseRecipeMetric('2 pieces').unit).toBe('ea');
      expect(parseRecipeMetric('10pcs').unit).toBe('ea');
    });

    it('handles lb/oz weight conversions', () => {
      const lb = parseRecipeMetric('1lb');
      expect(lb.unit).toBe('g');
      expect(lb.value).toBeCloseTo(453.592, 1);

      const oz = parseRecipeMetric('1oz');
      expect(oz.unit).toBe('g');
      expect(oz.value).toBeCloseTo(28.35, 1);
    });

    it('handles dl volume conversion', () => {
      const dl = parseRecipeMetric('5dl');
      expect(dl.unit).toBe('ml');
      expect(dl.value).toBe(500);
    });

    it('handles gramme aliases', () => {
      expect(parseRecipeMetric('100gr').unit).toBe('g');
      expect(parseRecipeMetric('100grammes').unit).toBe('g');
    });
  });

  // ============================================
  // convertToInventoryUnit Tests
  // ============================================

  describe('convertToInventoryUnit', () => {
    it('converts grams to pounds', () => {
      const item = { pricePerG: 0.01, stockWeightUnit: 'lb' };
      const result = convertToInventoryUnit(453.592, 'g', item);

      expect(result.amount).toBeCloseTo(1, 2); // ~1 lb
      expect(result.unit).toBe('lb');
    });

    it('converts grams to kg', () => {
      const item = { pricePerG: 0.01, stockWeightUnit: 'kg' };
      const result = convertToInventoryUnit(1000, 'g', item);

      expect(result.amount).toBe(1); // 1 kg
      expect(result.unit).toBe('kg');
    });

    it('converts ml to L', () => {
      const item = { pricePerML: 0.005, stockWeightUnit: 'L' };
      const result = convertToInventoryUnit(500, 'ml', item);

      expect(result.amount).toBe(0.5); // 0.5 L
      expect(result.unit).toBe('L');
    });

    it('returns null for incompatible units (g to volume item)', () => {
      const item = { pricePerML: 0.005, stockWeightUnit: 'L' };
      const result = convertToInventoryUnit(500, 'g', item);

      expect(result).toBeNull();
    });

    it('returns null for incompatible units (ml to weight item)', () => {
      const item = { pricePerG: 0.01, stockWeightUnit: 'lb' };
      const result = convertToInventoryUnit(500, 'ml', item);

      expect(result).toBeNull();
    });

    it('handles unit-based items', () => {
      const item = { pricePerUnit: 5.99, stockQuantityUnit: 'case' };
      const result = convertToInventoryUnit(3, 'ea', item);

      expect(result.amount).toBe(3);
      expect(result.unit).toBe('case');
    });
  });

  // ============================================
  // deductRecipeIngredients Integration Tests
  // ============================================

  describe('deductRecipeIngredients', () => {
    const mockRecipe = {
      id: 1,
      name: 'Test Recipe',
      ingredients: [],
    };

    const mockTask = {
      id: 'TASK-001',
      scaleFactor: 1,
    };

    beforeEach(() => {
      inventoryItemDB.getById.mockResolvedValue(null);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);
    });

    it('returns empty result for recipe with no ingredients', async () => {
      const result = await deductRecipeIngredients(mockRecipe, mockTask, 'user1');

      expect(result.success).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it('skips section headers', async () => {
      const recipe = {
        ...mockRecipe,
        ingredients: [{ isSection: true, name: 'Meats' }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].code).toBe('SECTION');
    });

    it('skips unlinked ingredients', async () => {
      const recipe = {
        ...mockRecipe,
        ingredients: [{ name: 'Salt', metric: '5g' }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].code).toBe('NOT_LINKED');
    });

    it('fails for invalid metric', async () => {
      const recipe = {
        ...mockRecipe,
        ingredients: [{ name: 'Salt', metric: '', linkedIngredientId: 1 }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].code).toBe('NO_METRIC');
    });

    it('fails when inventory item not found', async () => {
      inventoryItemDB.getById.mockResolvedValue(null);

      const recipe = {
        ...mockRecipe,
        ingredients: [{ name: 'Salt', metric: '5g', linkedIngredientId: 999 }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].code).toBe('ITEM_NOT_FOUND');
    });

    it('successfully deducts weight-based ingredient', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Beef Chuck',
        pricePerG: 0.015,
        stockWeightUnit: 'lb',
        stockWeight: 50,
        stockQuantity: 0,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        ...mockRecipe,
        ingredients: [{
          name: 'Beef',
          metric: '500g',
          linkedIngredientId: 1,
          linkedName: 'Beef Chuck',
        }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.success[0].itemName).toBe('Beef Chuck');
      expect(result.success[0].deducted).toBeCloseTo(1.1, 1); // ~1.1 lb
      expect(result.success[0].unit).toBe('lb');

      // Verify update was called with correct deduction
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockWeight: expect.any(Number),
      }));
    });

    it('applies scale factor correctly', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Flour',
        pricePerG: 0.002,
        stockWeightUnit: 'lb',
        stockWeight: 100,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        ...mockRecipe,
        ingredients: [{
          name: 'Flour',
          metric: '500g',
          linkedIngredientId: 1,
        }],
      };

      const taskScaled = { ...mockTask, scaleFactor: 2 };

      const result = await deductRecipeIngredients(recipe, taskScaled, 'user1');

      expect(result.success).toHaveLength(1);
      // 500g * 2 = 1000g = ~2.2 lb
      expect(result.success[0].recipeAmount).toBe(1000);
    });

    it('fails for unit mismatch (g recipe to ml inventory)', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Olive Oil',
        pricePerML: 0.01,
        stockWeightUnit: 'L',
        stockWeight: 5,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        ...mockRecipe,
        ingredients: [{
          name: 'Oil',
          metric: '100g', // Wrong unit for volume item
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].code).toBe('UNIT_MISMATCH');
    });

    it('handles volume-based ingredient correctly', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Olive Oil',
        pricePerML: 0.01,
        stockWeightUnit: 'L',
        stockWeight: 5,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        ...mockRecipe,
        ingredients: [{
          name: 'Oil',
          metric: '500ml',
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.success[0].deducted).toBe(0.5); // 0.5 L
      expect(result.success[0].unit).toBe('L');
    });

    it('continues on failure and collects all results', async () => {
      inventoryItemDB.getById
        .mockResolvedValueOnce(null) // First item not found
        .mockResolvedValueOnce({
          id: 2,
          name: 'Salt',
          pricePerG: 0.001,
          stockWeightUnit: 'lb',
          stockWeight: 10,
        });

      const recipe = {
        ...mockRecipe,
        ingredients: [
          { name: 'Missing', metric: '100g', linkedIngredientId: 1 },
          { name: 'Salt', metric: '50g', linkedIngredientId: 2 },
        ],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.failed).toHaveLength(1);
      expect(result.success).toHaveLength(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.succeeded).toBe(1);
    });

    it('adds low stock warning when threshold reached', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Beef',
        pricePerG: 0.015,
        stockWeightUnit: 'lb',
        stockWeight: 2, // Low stock
        parWeight: 50,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      // Mock getEffectivePar to return a meaningful value
      const { getEffectivePar } = await import('../../database/inventoryHelpers.js');
      getEffectivePar.mockReturnValue({ value: 50, unit: 'lb', type: 'weight' });

      const recipe = {
        ...mockRecipe,
        ingredients: [{
          name: 'Beef',
          metric: '400g', // ~0.9 lb
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, mockTask, 'user1');

      expect(result.success).toHaveLength(1);
      // After deducting ~0.9 lb from 2 lb, we have ~1.1 lb which is ~2% of 50 lb par
      expect(result.warnings.some(w => w.type === 'low_stock')).toBe(true);
    });
  });

  // ============================================
  // Threshold-Based Case Tracking Tests
  // ============================================

  describe('threshold-based case tracking', () => {
    beforeEach(() => {
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);
    });

    it('decreases unit count when threshold crossed (bottles example)', async () => {
      // User example: 4 bottles × 150ml = 600ml. When 150ml consumed, pc should decrease.
      const inventoryItem = {
        id: 1,
        name: 'Olive Oil Bottles',
        pricePerML: 0.01,
        stockWeightUnit: 'ml',
        stockWeight: 600, // 4 bottles total
        stockQuantity: 4,
        volumePerPc: 150, // 150ml per bottle
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Salad',
        ingredients: [{
          name: 'Olive Oil',
          metric: '200ml', // More than one bottle
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.success[0].caseOpened).toBe(true);
      expect(result.warnings.some(w => w.type === 'case_opened')).toBe(true);

      // 600ml - 200ml = 400ml. Floor(400/150) = 2 bottles remaining.
      // Old: floor(600/150) = 4, New: floor(400/150) = 2, Consumed: 2 units
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockWeight: 400,
        stockQuantity: 2, // 4 - 2 = 2 bottles
      }));
    });

    it('decreases case count using unitsPerCase × unitSize pattern', async () => {
      // Paleron example: 3 pc (2 × 5kg) | 30 kg total
      // Each case = 2 × 5kg = 10kg
      const inventoryItem = {
        id: 1,
        name: 'Paleron Beef',
        pricePerG: 0.0229,
        stockWeightUnit: 'kg',
        stockWeight: 30, // 30 kg total
        stockQuantity: 3, // 3 cases
        unitsPerCase: 2,
        unitSize: 5,
        unitSizeUnit: 'kg',
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Boeuf Bourguignon',
        ingredients: [{
          name: 'Paleron',
          metric: '12000g', // 12 kg (more than one case)
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);

      // 30kg - 12kg = 18kg. Floor(18/10) = 1 case remaining from threshold perspective
      // Old: floor(30/10) = 3, New: floor(18/10) = 1, Consumed: 2 units
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockWeight: 18,
        stockQuantity: 1, // 3 - 2 = 1 case
      }));
    });

    it('does not decrease unit count when threshold not crossed', async () => {
      // Small deduction that doesn't cross threshold
      // Start from middle of threshold: 650ml (floor(650/150) = 4)
      // After -50ml: 600ml (floor(600/150) = 4). Same! No threshold crossed.
      const inventoryItem = {
        id: 1,
        name: 'Olive Oil Bottles',
        pricePerML: 0.01,
        stockWeightUnit: 'ml',
        stockWeight: 650, // 4 bottles + 50ml extra
        stockQuantity: 4,
        volumePerPc: 150,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Salad',
        ingredients: [{
          name: 'Olive Oil',
          metric: '50ml', // Small amount within same threshold
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.success[0].caseOpened).toBe(false);

      // 650ml - 50ml = 600ml. Floor(650/150) = 4, Floor(600/150) = 4. No crossing.
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockWeight: 600,
        stockQuantity: 4, // Still 4 bottles
      }));
    });

    it('handles weight-based item with large deduction', async () => {
      // Item: 50 lb total across 2 cases (25 lb per case)
      // Deducting 30 lb crosses from 2 whole cases to 0 whole cases
      const inventoryItem = {
        id: 1,
        name: 'Beef Chuck',
        pricePerG: 0.02,
        stockWeightUnit: 'lb',
        stockWeight: 50, // 50 lb total
        stockQuantity: 2, // 2 cases
        // No explicit weightPerUnit - derive from ratio (50/2 = 25 lb per case)
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Stew',
        ingredients: [{
          name: 'Beef',
          metric: '15000g', // ~33 lb (more than one case worth of 25 lb)
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.success[0].caseOpened).toBe(true);

      // 50lb - 33lb = 17lb. Threshold = 25lb (from 50/2)
      // Old: floor(50/25) = 2, New: floor(17/25) = 0, Consumed: 2 units
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockQuantity: 0, // 2 - 2 = 0 cases
      }));
    });

    it('handles insufficient stock with warning', async () => {
      const inventoryItem = {
        id: 1,
        name: 'Flour 25lb Bag',
        pricePerG: 0.002,
        stockWeightUnit: 'lb',
        stockWeight: 5,
        stockQuantity: 0, // No more cases
        weightPerUnit: 11340,
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Bread',
        ingredients: [{
          name: 'Flour',
          metric: '5000g', // ~11 lb (more than available 5 lb)
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);
      expect(result.warnings.some(w => w.type === 'insufficient_partial')).toBe(true);

      // Should set to 0, not negative
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockWeight: 0,
      }));
    });

    it('derives threshold from stockWeight/stockQuantity ratio', async () => {
      // No explicit weightPerUnit, but can derive from stockWeight/stockQuantity
      const inventoryItem = {
        id: 1,
        name: 'Custom Item',
        pricePerG: 0.01,
        stockWeightUnit: 'lb',
        stockWeight: 100, // 100 lb total
        stockQuantity: 4, // 4 cases → 25 lb per case
        // No weightPerUnit, no unitsPerCase/unitSize
      };
      inventoryItemDB.getById.mockResolvedValue(inventoryItem);

      const recipe = {
        id: 1,
        name: 'Test',
        ingredients: [{
          name: 'Custom',
          metric: '15000g', // ~33 lb (crosses 1 threshold of 25lb)
          linkedIngredientId: 1,
        }],
      };

      const result = await deductRecipeIngredients(recipe, { id: 'TASK-1', scaleFactor: 1 }, 'user1');

      expect(result.success).toHaveLength(1);

      // 100lb - 33lb = 67lb. Threshold = 25lb.
      // Old: floor(100/25) = 4, New: floor(67/25) = 2, Consumed: 2
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockQuantity: 2, // 4 - 2 = 2 cases
      }));
    });
  });
});
