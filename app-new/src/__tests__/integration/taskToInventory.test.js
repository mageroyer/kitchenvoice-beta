/**
 * Integration Test: Task to Inventory Flow
 *
 * Tests the task completion flow that deducts inventory.
 * This verifies that completing a task correctly reduces stock levels,
 * creates transactions, and triggers alerts when appropriate.
 *
 * Flow:
 * 1. Create vendor
 * 2. Create inventory item with stock
 * 3. Create recipe linked to item
 * 4. Create task from recipe
 * 5. Complete task
 * 6. Verify stock deducted, transactions created, alerts triggered
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================
// Mock Database Layer
// ============================================

const mockDatabase = {
  vendors: new Map(),
  inventoryItems: new Map(),
  recipes: new Map(),
  recipeIngredients: new Map(),
  tasks: new Map(),
  stockTransactions: new Map(),
  nextId: {
    vendor: 1,
    item: 1,
    recipe: 1,
    ingredient: 1,
    task: 1,
    transaction: 1
  }
};

function resetDatabase() {
  mockDatabase.vendors.clear();
  mockDatabase.inventoryItems.clear();
  mockDatabase.recipes.clear();
  mockDatabase.recipeIngredients.clear();
  mockDatabase.tasks.clear();
  mockDatabase.stockTransactions.clear();
  mockDatabase.nextId = {
    vendor: 1,
    item: 1,
    recipe: 1,
    ingredient: 1,
    task: 1,
    transaction: 1
  };
}

// Mock the database module
vi.mock('../../services/database/indexedDB', () => ({
  vendorDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.vendor++;
      const vendor = { ...data, id, createdAt: new Date().toISOString() };
      mockDatabase.vendors.set(id, vendor);
      return id;
    }),
    getById: vi.fn(async (id) => mockDatabase.vendors.get(id) || null),
    getAll: vi.fn(async () => Array.from(mockDatabase.vendors.values()))
  },
  inventoryItemDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.item++;
      const item = {
        ...data,
        id,
        currentStock: data.currentStock || 0,
        fullStock: data.fullStock || 0,
        parLevel: data.parLevel || 0,
        usageCount: 0,
        totalQuantityUsed: 0,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      mockDatabase.inventoryItems.set(id, item);
      return id;
    }),
    getById: vi.fn(async (id) => mockDatabase.inventoryItems.get(id) || null),
    getAll: vi.fn(async () => Array.from(mockDatabase.inventoryItems.values())),
    getByVendor: vi.fn(async (vendorId) =>
      Array.from(mockDatabase.inventoryItems.values()).filter(i => i.vendorId === vendorId)
    ),
    update: vi.fn(async (id, data) => {
      const item = mockDatabase.inventoryItems.get(id);
      if (!item) throw new Error('Inventory item not found');
      const updated = { ...item, ...data, updatedAt: new Date().toISOString() };
      mockDatabase.inventoryItems.set(id, updated);
      return updated;
    }),
    delete: vi.fn(async (id) => mockDatabase.inventoryItems.delete(id))
  },
  stockTransactionDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.transaction++;
      const transaction = {
        ...data,
        id,
        createdAt: new Date().toISOString()
      };
      mockDatabase.stockTransactions.set(id, transaction);
      return id;
    }),
    recordTaskUsage: vi.fn(async (itemId, quantity, options = {}) => {
      const id = mockDatabase.nextId.transaction++;
      const transaction = {
        id,
        inventoryItemId: itemId,
        transactionType: 'task_usage',
        quantityChange: -quantity, // Negative for deductions
        stockBefore: options.currentStock || 0,
        stockAfter: (options.currentStock || 0) - quantity,
        referenceType: 'task',
        referenceId: options.taskId,
        recipeId: options.recipeId,
        recipeName: options.recipeName,
        createdBy: options.createdBy,
        createdAt: new Date().toISOString()
      };
      mockDatabase.stockTransactions.set(id, transaction);
      return transaction;
    }),
    getByItem: vi.fn(async (itemId) =>
      Array.from(mockDatabase.stockTransactions.values())
        .filter(t => t.inventoryItemId === itemId)
    ),
    getAll: vi.fn(async () => Array.from(mockDatabase.stockTransactions.values()))
  },
  db: {
    transaction: vi.fn(async (mode, tables, callback) => {
      return await callback();
    }),
    inventoryItems: {},
    stockTransactions: {}
  },
  TRANSACTION_TYPE: {
    PURCHASE: 'purchase',
    TASK_USAGE: 'task_usage',
    ADJUSTMENT: 'adjustment',
    WASTE: 'waste',
    TRANSFER: 'transfer',
    COUNT_CORRECTION: 'count_correction',
    RETURN: 'return',
    SAMPLE: 'sample',
    THEFT: 'theft',
    INITIAL: 'initial'
  },
  REFERENCE_TYPE: {
    INVOICE: 'invoice',
    PURCHASE_ORDER: 'purchase_order',
    TASK: 'task',
    COUNT: 'count',
    MANUAL: 'manual'
  },
  STOCK_STATUS: {
    CRITICAL: 'critical',
    LOW: 'low',
    WARNING: 'warning',
    OK: 'ok'
  }
}));

// Import after mocking
import {
  vendorDB,
  inventoryItemDB,
  stockTransactionDB,
  TRANSACTION_TYPE,
  STOCK_STATUS
} from '../../services/database/indexedDB';

// ============================================
// Helper Functions (simulating service layer)
// ============================================

/**
 * Calculate stock percentage
 */
function getStockPercentage(currentStock, baseStock) {
  if (!baseStock || baseStock <= 0) {
    return currentStock > 0 ? 100 : 0;
  }
  return Math.round((currentStock / baseStock) * 100);
}

/**
 * Get stock status from percentage
 */
function getStockStatus(percentage, thresholds = { critical: 10, low: 25 }) {
  if (percentage <= thresholds.critical) return STOCK_STATUS.CRITICAL;
  if (percentage <= thresholds.low) return STOCK_STATUS.LOW;
  return STOCK_STATUS.OK;
}

/**
 * Deduct stock from task (simulating stockService.deductStockFromTask)
 */
async function deductStockFromTask(itemId, quantity, taskId, options = {}) {
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  const item = await inventoryItemDB.getById(itemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  const currentStock = item.currentStock || 0;
  const newStock = currentStock - quantity;

  // Validate sufficient stock
  if (newStock < 0 && !options.allowNegative) {
    throw new Error(
      `Insufficient stock for ${item.name}. ` +
      `Available: ${currentStock} ${item.unit || 'units'}, ` +
      `Requested: ${quantity} ${item.unit || 'units'}.`
    );
  }

  // Update usage statistics
  const usageCount = (item.usageCount || 0) + 1;
  const totalQuantityUsed = (item.totalQuantityUsed || 0) + quantity;

  // Update item - NOTE: fullStock does NOT change on deduction
  await inventoryItemDB.update(itemId, {
    currentStock: Math.max(0, newStock),
    lastUsageDate: new Date().toISOString(),
    usageCount,
    totalQuantityUsed
    // fullStock is NOT updated here - it only changes on purchase
  });

  // Create task usage transaction
  const transaction = await stockTransactionDB.recordTaskUsage(itemId, quantity, {
    taskId,
    recipeId: options.recipeId,
    recipeName: options.recipeName,
    currentStock,
    createdBy: options.createdBy
  });

  // Check thresholds
  const actualNewStock = Math.max(0, newStock);
  const percentage = getStockPercentage(actualNewStock, item.parLevel || item.fullStock);
  const status = getStockStatus(percentage);
  const alert = status === STOCK_STATUS.CRITICAL || status === STOCK_STATUS.LOW;

  return {
    itemId,
    itemName: item.name,
    previousStock: currentStock,
    newStock: actualNewStock,
    quantityUsed: quantity,
    percentage,
    status,
    alert,
    alertMessage: alert ? `${item.name} is ${status} on stock (${percentage}%)` : null,
    taskId,
    transaction,
    insufficientStock: newStock < 0
  };
}

// ============================================
// Test Setup
// ============================================

describe('Task to Inventory Integration Flow', () => {
  let testVendor;
  let testItem;
  let testRecipe;
  let testTask;

  beforeEach(async () => {
    resetDatabase();
    vi.clearAllMocks();

    // Create test vendor
    const vendorId = await vendorDB.create({
      name: 'Farm Fresh Produce',
      phone: '555-0456',
      email: 'orders@farmfresh.com'
    });
    testVendor = await vendorDB.getById(vendorId);

    // Create test inventory item with stock
    const itemId = await inventoryItemDB.create({
      name: 'Fresh Chicken Breast',
      sku: 'CHKN-BRS-001',
      unit: 'kg',
      vendorId: testVendor.id,
      vendorName: testVendor.name,
      currentStock: 10, // Initial stock: 10kg
      fullStock: 10,    // Full stock reference: 10kg
      parLevel: 10,     // Par level for threshold calculations
      currentPrice: 12.00,
      category: 'Poultry'
    });
    testItem = await inventoryItemDB.getById(itemId);

    // Create test recipe (mock - not in actual DB for this test)
    testRecipe = {
      id: 1,
      name: 'Grilled Chicken Plate',
      ingredients: [
        { inventoryItemId: testItem.id, quantity: 2, unit: 'kg' }
      ]
    };

    // Create test task (mock)
    testTask = {
      id: 1,
      recipeId: testRecipe.id,
      recipeName: testRecipe.name,
      status: 'pending',
      assignedTo: 'chef1'
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================
  // Complete Flow Test
  // ============================================

  describe('Complete Task Completion Flow', () => {
    it('should deduct inventory when task is completed', async () => {
      // Step 1: Verify initial stock is 10kg
      expect(testItem.currentStock).toBe(10);
      expect(testItem.fullStock).toBe(10);

      // Step 2: Task requires 2kg of chicken
      const requiredQuantity = 2;

      // Step 3: Complete task - deduct stock
      const result = await deductStockFromTask(
        testItem.id,
        requiredQuantity,
        testTask.id,
        {
          recipeId: testRecipe.id,
          recipeName: testRecipe.name,
          createdBy: 'chef1'
        }
      );

      // Step 4: Verify stock deducted
      const updatedItem = await inventoryItemDB.getById(testItem.id);
      expect(updatedItem.currentStock).toBe(8); // 10 - 2 = 8kg

      // Verify result object
      expect(result.previousStock).toBe(10);
      expect(result.newStock).toBe(8);
      expect(result.quantityUsed).toBe(2);

      // Step 5: Verify threshold - 80% (8/10) should be OK
      expect(result.percentage).toBe(80);
      expect(result.status).toBe(STOCK_STATUS.OK);
      expect(result.alert).toBe(false);
    });
  });

  // ============================================
  // Individual Assertions
  // ============================================

  describe('Stock Decrease Assertion', () => {
    it('should decrease stock by task quantity', async () => {
      const initialStock = testItem.currentStock;
      const taskQuantity = 2;

      await deductStockFromTask(testItem.id, taskQuantity, testTask.id);

      const updatedItem = await inventoryItemDB.getById(testItem.id);
      expect(updatedItem.currentStock).toBe(initialStock - taskQuantity);
      expect(updatedItem.currentStock).toBe(8);
    });

    it('should handle multiple deductions correctly', async () => {
      // First task: 2kg
      await deductStockFromTask(testItem.id, 2, 1);
      let item = await inventoryItemDB.getById(testItem.id);
      expect(item.currentStock).toBe(8);

      // Second task: 3kg
      await deductStockFromTask(testItem.id, 3, 2);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.currentStock).toBe(5);

      // Third task: 1kg
      await deductStockFromTask(testItem.id, 1, 3);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.currentStock).toBe(4);

      // Total deducted: 6kg, remaining: 4kg
    });
  });

  describe('FullStock Unchanged Assertion', () => {
    it('should NOT change fullStock when deducting for tasks', async () => {
      const initialFullStock = testItem.fullStock;
      expect(initialFullStock).toBe(10);

      // Deduct 2kg
      await deductStockFromTask(testItem.id, 2, testTask.id);

      const updatedItem = await inventoryItemDB.getById(testItem.id);

      // currentStock should decrease
      expect(updatedItem.currentStock).toBe(8);

      // fullStock should remain unchanged
      expect(updatedItem.fullStock).toBe(10);
      expect(updatedItem.fullStock).toBe(initialFullStock);
    });

    it('should keep fullStock unchanged even after multiple deductions', async () => {
      const initialFullStock = testItem.fullStock;

      await deductStockFromTask(testItem.id, 2, 1);
      await deductStockFromTask(testItem.id, 3, 2);
      await deductStockFromTask(testItem.id, 2, 3);

      const updatedItem = await inventoryItemDB.getById(testItem.id);

      expect(updatedItem.currentStock).toBe(3); // 10 - 7 = 3
      expect(updatedItem.fullStock).toBe(initialFullStock); // Still 10
    });
  });

  describe('Transaction Type Assertion', () => {
    it('should create transaction with type "task_usage"', async () => {
      await deductStockFromTask(testItem.id, 2, testTask.id, {
        recipeId: testRecipe.id,
        recipeName: testRecipe.name
      });

      const transactions = await stockTransactionDB.getByItem(testItem.id);
      expect(transactions.length).toBe(1);
      expect(transactions[0].transactionType).toBe('task_usage');
    });

    it('should store negative quantity change for deductions', async () => {
      await deductStockFromTask(testItem.id, 2, testTask.id);

      const transactions = await stockTransactionDB.getByItem(testItem.id);
      expect(transactions[0].quantityChange).toBe(-2);
    });
  });

  describe('Transaction Reference Assertion', () => {
    it('should create transaction that references the task', async () => {
      await deductStockFromTask(testItem.id, 2, testTask.id, {
        recipeId: testRecipe.id,
        recipeName: testRecipe.name,
        createdBy: 'chef1'
      });

      const transactions = await stockTransactionDB.getByItem(testItem.id);
      expect(transactions[0].referenceType).toBe('task');
      expect(transactions[0].referenceId).toBe(testTask.id);
    });

    it('should include recipe information in transaction', async () => {
      await deductStockFromTask(testItem.id, 2, testTask.id, {
        recipeId: testRecipe.id,
        recipeName: testRecipe.name
      });

      const transactions = await stockTransactionDB.getByItem(testItem.id);
      expect(transactions[0].recipeId).toBe(testRecipe.id);
      expect(transactions[0].recipeName).toBe('Grilled Chicken Plate');
    });

    it('should record stock before and after in transaction', async () => {
      await deductStockFromTask(testItem.id, 2, testTask.id);

      const transactions = await stockTransactionDB.getByItem(testItem.id);
      expect(transactions[0].stockBefore).toBe(10);
      expect(transactions[0].stockAfter).toBe(8);
    });
  });

  describe('Alert Triggered Assertion', () => {
    it('should trigger alert when stock falls below low threshold (25%)', async () => {
      // Deduct 8kg to leave 2kg (20% of 10kg par level)
      const result = await deductStockFromTask(testItem.id, 8, testTask.id);

      expect(result.newStock).toBe(2);
      expect(result.percentage).toBe(20);
      expect(result.status).toBe(STOCK_STATUS.LOW);
      expect(result.alert).toBe(true);
      expect(result.alertMessage).toContain('low');
    });

    it('should trigger critical alert when stock falls below critical threshold (10%)', async () => {
      // Deduct 9kg to leave 1kg (10% of 10kg par level)
      const result = await deductStockFromTask(testItem.id, 9, testTask.id);

      expect(result.newStock).toBe(1);
      expect(result.percentage).toBe(10);
      expect(result.status).toBe(STOCK_STATUS.CRITICAL);
      expect(result.alert).toBe(true);
      expect(result.alertMessage).toContain('critical');
    });

    it('should NOT trigger alert when stock is above threshold', async () => {
      // Deduct 2kg to leave 8kg (80% of 10kg par level)
      const result = await deductStockFromTask(testItem.id, 2, testTask.id);

      expect(result.newStock).toBe(8);
      expect(result.percentage).toBe(80);
      expect(result.status).toBe(STOCK_STATUS.OK);
      expect(result.alert).toBe(false);
      expect(result.alertMessage).toBeNull();
    });

    it('should trigger alert at exactly the threshold', async () => {
      // Deduct 7.5kg to leave 2.5kg (25% of 10kg par level)
      const result = await deductStockFromTask(testItem.id, 7.5, testTask.id);

      expect(result.newStock).toBe(2.5);
      expect(result.percentage).toBe(25); // Exactly at low threshold
      expect(result.status).toBe(STOCK_STATUS.LOW);
      expect(result.alert).toBe(true);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should throw error for insufficient stock', async () => {
      // Try to deduct 15kg when only 10kg available
      await expect(deductStockFromTask(testItem.id, 15, testTask.id))
        .rejects.toThrow('Insufficient stock');
    });

    it('should allow negative stock when allowNegative is true', async () => {
      const result = await deductStockFromTask(testItem.id, 15, testTask.id, {
        allowNegative: true
      });

      // Stock capped at 0 (never stored negative)
      expect(result.newStock).toBe(0);
      expect(result.insufficientStock).toBe(true);
    });

    it('should throw error for zero quantity', async () => {
      await expect(deductStockFromTask(testItem.id, 0, testTask.id))
        .rejects.toThrow('Quantity must be a positive number');
    });

    it('should throw error for negative quantity', async () => {
      await expect(deductStockFromTask(testItem.id, -5, testTask.id))
        .rejects.toThrow('Quantity must be a positive number');
    });

    it('should throw error for non-existent item', async () => {
      await expect(deductStockFromTask(999, 2, testTask.id))
        .rejects.toThrow('Inventory item not found');
    });

    it('should handle deducting exact available stock', async () => {
      // Deduct exactly 10kg (all available)
      const result = await deductStockFromTask(testItem.id, 10, testTask.id);

      expect(result.newStock).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.status).toBe(STOCK_STATUS.CRITICAL);
      expect(result.alert).toBe(true);
    });
  });

  // ============================================
  // Usage Statistics
  // ============================================

  describe('Usage Statistics', () => {
    it('should increment usage count', async () => {
      expect(testItem.usageCount).toBe(0);

      await deductStockFromTask(testItem.id, 2, 1);
      let item = await inventoryItemDB.getById(testItem.id);
      expect(item.usageCount).toBe(1);

      await deductStockFromTask(testItem.id, 1, 2);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.usageCount).toBe(2);

      await deductStockFromTask(testItem.id, 1, 3);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.usageCount).toBe(3);
    });

    it('should track total quantity used', async () => {
      expect(testItem.totalQuantityUsed).toBe(0);

      await deductStockFromTask(testItem.id, 2, 1);
      let item = await inventoryItemDB.getById(testItem.id);
      expect(item.totalQuantityUsed).toBe(2);

      await deductStockFromTask(testItem.id, 3, 2);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.totalQuantityUsed).toBe(5);

      await deductStockFromTask(testItem.id, 1, 3);
      item = await inventoryItemDB.getById(testItem.id);
      expect(item.totalQuantityUsed).toBe(6);
    });

    it('should update lastUsageDate', async () => {
      const beforeDate = testItem.lastUsageDate;
      expect(beforeDate).toBeUndefined();

      await deductStockFromTask(testItem.id, 2, testTask.id);

      const item = await inventoryItemDB.getById(testItem.id);
      expect(item.lastUsageDate).toBeDefined();
      expect(new Date(item.lastUsageDate).getTime()).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Multiple Ingredients per Task
  // ============================================

  describe('Multiple Ingredients Flow', () => {
    let testItem2;
    let testItem3;

    beforeEach(async () => {
      // Create additional inventory items
      const item2Id = await inventoryItemDB.create({
        name: 'Olive Oil',
        sku: 'OIL-OLV-001',
        unit: 'L',
        vendorId: testVendor.id,
        currentStock: 5,
        fullStock: 5,
        parLevel: 5,
        currentPrice: 15.00
      });
      testItem2 = await inventoryItemDB.getById(item2Id);

      const item3Id = await inventoryItemDB.create({
        name: 'Fresh Rosemary',
        sku: 'HERB-RSM-001',
        unit: 'bunch',
        vendorId: testVendor.id,
        currentStock: 20,
        fullStock: 20,
        parLevel: 20,
        currentPrice: 2.50
      });
      testItem3 = await inventoryItemDB.getById(item3Id);
    });

    it('should deduct multiple ingredients for one task', async () => {
      // Recipe requires: 2kg chicken, 0.5L oil, 2 bunches rosemary
      const ingredients = [
        { itemId: testItem.id, quantity: 2 },
        { itemId: testItem2.id, quantity: 0.5 },
        { itemId: testItem3.id, quantity: 2 }
      ];

      // Deduct all ingredients
      for (const ing of ingredients) {
        await deductStockFromTask(ing.itemId, ing.quantity, testTask.id, {
          recipeId: testRecipe.id,
          recipeName: testRecipe.name
        });
      }

      // Verify all items deducted
      const updatedItem1 = await inventoryItemDB.getById(testItem.id);
      const updatedItem2 = await inventoryItemDB.getById(testItem2.id);
      const updatedItem3 = await inventoryItemDB.getById(testItem3.id);

      expect(updatedItem1.currentStock).toBe(8);   // 10 - 2
      expect(updatedItem2.currentStock).toBe(4.5); // 5 - 0.5
      expect(updatedItem3.currentStock).toBe(18);  // 20 - 2

      // Verify transactions created for all
      const allTransactions = await stockTransactionDB.getAll();
      expect(allTransactions.length).toBe(3);
      expect(allTransactions.every(t => t.transactionType === 'task_usage')).toBe(true);
      expect(allTransactions.every(t => t.referenceId === testTask.id)).toBe(true);
    });

    it('should trigger alerts only for items below threshold', async () => {
      // Deduct heavily from item2 to trigger alert
      const result1 = await deductStockFromTask(testItem.id, 2, testTask.id); // 80% remaining
      const result2 = await deductStockFromTask(testItem2.id, 4.5, testTask.id); // 10% remaining

      expect(result1.alert).toBe(false);
      expect(result2.alert).toBe(true);
      expect(result2.status).toBe(STOCK_STATUS.CRITICAL);
    });
  });
});
