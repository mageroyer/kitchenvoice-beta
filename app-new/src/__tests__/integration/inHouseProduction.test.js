/**
 * Integration Test: In-House Production Flow
 *
 * Tests the production flow where completing a recipe task creates
 * new inventory items (prepared items available for sale or as ingredients).
 *
 * Flow:
 * 1. Create internal vendor (in-house production)
 * 2. Create recipe marked as availableForSale or availableAsIngredient
 * 3. Create and complete task for that recipe
 * 4. Verify new inventory item created for produced output
 * 5. Complete another task and verify stock increases
 *
 * This tests the "prep item" production flow where kitchen-made items
 * become trackable inventory (e.g., house-made sauces, stocks, desserts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// Mock Database Layer
// ============================================

const mockDatabase = {
  vendors: new Map(),
  inventoryItems: new Map(),
  recipes: new Map(),
  tasks: new Map(),
  productionLogs: new Map(),
  kitchenSettings: {
    trackProduction: true
  },
  nextId: {
    vendor: 1,
    item: 1,
    recipe: 1,
    task: 1,
    log: 1
  }
};

function resetDatabase() {
  mockDatabase.vendors.clear();
  mockDatabase.inventoryItems.clear();
  mockDatabase.recipes.clear();
  mockDatabase.tasks.clear();
  mockDatabase.productionLogs.clear();
  mockDatabase.kitchenSettings = { trackProduction: true };
  mockDatabase.nextId = {
    vendor: 1,
    item: 1,
    recipe: 1,
    task: 1,
    log: 1
  };
}

// ============================================
// Production Service (Simulates actual implementation)
// ============================================

const ProductionService = {
  /**
   * Get or create internal vendor for in-house production
   */
  async getOrCreateInternalVendor() {
    // Check for existing internal vendor
    for (const vendor of mockDatabase.vendors.values()) {
      if (vendor.isInternal) return vendor;
    }

    // Create internal vendor
    const id = mockDatabase.nextId.vendor++;
    const vendor = {
      id,
      name: 'In-House Production',
      vendorCode: 'INTERNAL',
      isInternal: true,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    mockDatabase.vendors.set(id, vendor);
    return vendor;
  },

  /**
   * Add produced item to inventory after task completion
   */
  async addProducedItemToInventory(recipe, task) {
    const internalVendor = await this.getOrCreateInternalVendor();

    // Calculate produced quantity
    const portions = task.portions || recipe.portions || 1;
    const scaleFactor = task.scaleFactor || 1;
    const producedQuantity = portions * scaleFactor;

    // Item name follows pattern: "Recipe Name (Prep)"
    const itemName = `${recipe.name} (Prep)`;

    // Check for existing inventory item
    let existingItem = null;
    for (const item of mockDatabase.inventoryItems.values()) {
      if (item.name === itemName && item.vendorId === internalVendor.id) {
        existingItem = item;
        break;
      }
    }

    if (existingItem) {
      // Update existing stock
      const newStock = (existingItem.currentStock || 0) + producedQuantity;
      const updated = {
        ...existingItem,
        currentStock: newStock,
        fullStock: newStock,
        lastProductionDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      mockDatabase.inventoryItems.set(existingItem.id, updated);

      return {
        action: 'updated',
        itemId: existingItem.id,
        itemName: existingItem.name,
        addedQuantity: producedQuantity,
        newStock
      };
    } else {
      // Create new inventory item
      const id = mockDatabase.nextId.item++;
      const newItem = {
        id,
        name: itemName,
        vendorId: internalVendor.id,
        vendorName: internalVendor.name,
        category: recipe.category || 'Prepared Items',
        unit: 'portion',
        currentStock: producedQuantity,
        fullStock: producedQuantity,
        parLevel: producedQuantity,
        currentPrice: recipe.portionCost || 0,
        isActive: true,
        availableForSale: recipe.availableForSale || false,
        availableAsIngredient: recipe.availableAsIngredient || false,
        sourceRecipeId: recipe.id,
        sourceRecipeName: recipe.name,
        lastProductionDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      mockDatabase.inventoryItems.set(id, newItem);

      return {
        action: 'created',
        itemId: id,
        itemName: newItem.name,
        addedQuantity: producedQuantity,
        newStock: producedQuantity
      };
    }
  },

  /**
   * Create production log entry
   */
  async createProductionLog(task, result) {
    const id = mockDatabase.nextId.log++;
    const log = {
      id,
      taskId: task.id,
      recipeId: task.recipeId,
      recipeName: task.recipeName,
      producedQuantity: result.addedQuantity,
      inventoryItemId: result.itemId,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    mockDatabase.productionLogs.set(id, log);
    return log;
  },

  /**
   * Complete task and handle production
   */
  async completeProductionTask(taskId) {
    const task = mockDatabase.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    const recipe = mockDatabase.recipes.get(task.recipeId);
    if (!recipe) throw new Error('Recipe not found');

    // Update task status
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    mockDatabase.tasks.set(taskId, task);

    const results = {
      taskCompleted: true,
      production: null,
      productionLog: null
    };

    // Check if recipe produces inventory item
    if (recipe.availableForSale || recipe.availableAsIngredient) {
      results.production = await this.addProducedItemToInventory(recipe, task);

      // Create production log if tracking enabled
      if (mockDatabase.kitchenSettings.trackProduction) {
        results.productionLog = await this.createProductionLog(task, results.production);
      }
    }

    return results;
  }
};

// ============================================
// Test Helpers
// ============================================

function createRecipe(data) {
  const id = mockDatabase.nextId.recipe++;
  const recipe = {
    id,
    name: data.name || 'Test Recipe',
    category: data.category || 'Main Course',
    portions: data.portions || 4,
    portionCost: data.portionCost || 5.00,
    // All recipes are production recipes - default to true
    availableForSale: data.availableForSale !== false,
    availableAsIngredient: data.availableAsIngredient !== false,
    ingredients: data.ingredients || [],
    createdAt: new Date().toISOString()
  };
  mockDatabase.recipes.set(id, recipe);
  return recipe;
}

function createTask(recipeId, data = {}) {
  const recipe = mockDatabase.recipes.get(recipeId);
  if (!recipe) throw new Error('Recipe not found');

  const id = mockDatabase.nextId.task++;
  const task = {
    id,
    recipeId,
    recipeName: recipe.name,
    portions: data.portions || recipe.portions,
    scaleFactor: data.scaleFactor || 1,
    status: 'pending',
    department: data.department || 'Kitchen',
    createdAt: new Date().toISOString()
  };
  mockDatabase.tasks.set(id, task);
  return task;
}

// ============================================
// Tests
// ============================================

describe('In-House Production Flow', () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe('Internal Vendor', () => {
    it('should create internal vendor on first production', async () => {
      expect(mockDatabase.vendors.size).toBe(0);

      const vendor = await ProductionService.getOrCreateInternalVendor();

      expect(vendor.name).toBe('In-House Production');
      expect(vendor.vendorCode).toBe('INTERNAL');
      expect(vendor.isInternal).toBe(true);
      expect(mockDatabase.vendors.size).toBe(1);
    });

    it('should reuse existing internal vendor', async () => {
      const vendor1 = await ProductionService.getOrCreateInternalVendor();
      const vendor2 = await ProductionService.getOrCreateInternalVendor();

      expect(vendor1.id).toBe(vendor2.id);
      expect(mockDatabase.vendors.size).toBe(1);
    });
  });

  describe('Recipe Available for Sale', () => {
    it('should create inventory item when task completes', async () => {
      const recipe = createRecipe({
        name: 'Chocolate Mousse',
        category: 'Desserts',
        portions: 8,
        portionCost: 3.50,
        availableForSale: true
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.taskCompleted).toBe(true);
      expect(result.production).not.toBeNull();
      expect(result.production.action).toBe('created');
      expect(result.production.itemName).toBe('Chocolate Mousse (Prep)');
      expect(result.production.newStock).toBe(8);
    });

    it('should set availableForSale flag on inventory item', async () => {
      const recipe = createRecipe({
        name: 'Tiramisu',
        availableForSale: true,
        availableAsIngredient: false
      });

      const task = createTask(recipe.id);
      await ProductionService.completeProductionTask(task.id);

      const item = Array.from(mockDatabase.inventoryItems.values())[0];
      expect(item.availableForSale).toBe(true);
      expect(item.availableAsIngredient).toBe(false);
    });
  });

  describe('Recipe Available as Ingredient', () => {
    it('should create inventory item for prep ingredient', async () => {
      const recipe = createRecipe({
        name: 'House Tomato Sauce',
        category: 'Sauces',
        portions: 10,
        availableAsIngredient: true
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.production.action).toBe('created');
      expect(result.production.itemName).toBe('House Tomato Sauce (Prep)');

      const item = Array.from(mockDatabase.inventoryItems.values())[0];
      expect(item.availableAsIngredient).toBe(true);
      expect(item.sourceRecipeId).toBe(recipe.id);
    });
  });

  describe('Stock Accumulation', () => {
    it('should add to existing stock on subsequent production', async () => {
      const recipe = createRecipe({
        name: 'Beef Stock',
        portions: 20,
        availableAsIngredient: true
      });

      // First batch
      const task1 = createTask(recipe.id);
      const result1 = await ProductionService.completeProductionTask(task1.id);
      expect(result1.production.action).toBe('created');
      expect(result1.production.newStock).toBe(20);

      // Second batch
      const task2 = createTask(recipe.id);
      const result2 = await ProductionService.completeProductionTask(task2.id);
      expect(result2.production.action).toBe('updated');
      expect(result2.production.newStock).toBe(40);

      // Third batch with scale
      const task3 = createTask(recipe.id, { scaleFactor: 0.5 });
      const result3 = await ProductionService.completeProductionTask(task3.id);
      expect(result3.production.newStock).toBe(50); // 40 + (20 * 0.5)
    });

    it('should not create duplicate inventory items', async () => {
      const recipe = createRecipe({
        name: 'Chicken Stock',
        availableAsIngredient: true
      });

      // Complete multiple tasks
      for (let i = 0; i < 5; i++) {
        const task = createTask(recipe.id);
        await ProductionService.completeProductionTask(task.id);
      }

      // Should only have 1 inventory item
      expect(mockDatabase.inventoryItems.size).toBe(1);
    });
  });

  describe('Scale Factor', () => {
    it('should apply scale factor to production quantity', async () => {
      const recipe = createRecipe({
        name: 'Caesar Dressing',
        portions: 10,
        availableAsIngredient: true
      });

      const task = createTask(recipe.id, { scaleFactor: 2 });
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.production.addedQuantity).toBe(20); // 10 * 2
    });

    it('should handle fractional scale factors', async () => {
      const recipe = createRecipe({
        name: 'Special Sauce',
        portions: 8,
        availableAsIngredient: true
      });

      const task = createTask(recipe.id, { scaleFactor: 1.5 });
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.production.addedQuantity).toBe(12); // 8 * 1.5
    });

    it('should handle task with custom portions', async () => {
      const recipe = createRecipe({
        name: 'Soup of the Day',
        portions: 10,
        availableForSale: true
      });

      const task = createTask(recipe.id, { portions: 25 });
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.production.addedQuantity).toBe(25);
    });
  });

  describe('Production Logging', () => {
    it('should create production log when tracking enabled', async () => {
      mockDatabase.kitchenSettings.trackProduction = true;

      const recipe = createRecipe({
        name: 'Herb Butter',
        availableAsIngredient: true
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.productionLog).not.toBeNull();
      expect(result.productionLog.recipeId).toBe(recipe.id);
      expect(result.productionLog.taskId).toBe(task.id);
      expect(mockDatabase.productionLogs.size).toBe(1);
    });

    it('should not create production log when tracking disabled', async () => {
      mockDatabase.kitchenSettings.trackProduction = false;

      const recipe = createRecipe({
        name: 'Garlic Oil',
        availableAsIngredient: true
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.productionLog).toBeNull();
      expect(mockDatabase.productionLogs.size).toBe(0);
    });
  });

  describe('All Recipes Are Production', () => {
    it('should always create inventory for any recipe by default', async () => {
      // All recipes produce inventory - this is a core business rule
      const recipe = createRecipe({
        name: 'Grilled Salmon'
        // availableForSale and availableAsIngredient default to true
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.taskCompleted).toBe(true);
      expect(result.production).not.toBeNull();
      expect(result.production.action).toBe('created');
      expect(mockDatabase.inventoryItems.size).toBe(1);
    });

    it('should create inventory even for simple dishes', async () => {
      const recipe = createRecipe({
        name: 'House Salad',
        portions: 1
      });

      const task = createTask(recipe.id);
      const result = await ProductionService.completeProductionTask(task.id);

      expect(result.production.itemName).toBe('House Salad (Prep)');
      expect(result.production.newStock).toBe(1);
    });
  });

  describe('Item Metadata', () => {
    it('should link inventory item to source recipe', async () => {
      const recipe = createRecipe({
        name: 'Balsamic Reduction',
        category: 'Sauces',
        portionCost: 2.50,
        availableAsIngredient: true
      });

      const task = createTask(recipe.id);
      await ProductionService.completeProductionTask(task.id);

      const item = Array.from(mockDatabase.inventoryItems.values())[0];
      expect(item.sourceRecipeId).toBe(recipe.id);
      expect(item.sourceRecipeName).toBe('Balsamic Reduction');
      expect(item.category).toBe('Sauces');
      expect(item.currentPrice).toBe(2.50);
    });

    it('should set internal vendor on produced items', async () => {
      const recipe = createRecipe({
        name: 'Pesto',
        availableAsIngredient: true
      });

      const task = createTask(recipe.id);
      await ProductionService.completeProductionTask(task.id);

      const item = Array.from(mockDatabase.inventoryItems.values())[0];
      const vendor = mockDatabase.vendors.get(item.vendorId);

      expect(vendor.isInternal).toBe(true);
      expect(item.vendorName).toBe('In-House Production');
    });

    it('should track last production date', async () => {
      const recipe = createRecipe({
        name: 'Aioli',
        availableAsIngredient: true
      });

      const task1 = createTask(recipe.id);
      await ProductionService.completeProductionTask(task1.id);

      const item1 = Array.from(mockDatabase.inventoryItems.values())[0];
      const date1 = item1.lastProductionDate;

      // Wait a moment for time difference
      await new Promise(r => setTimeout(r, 10));

      const task2 = createTask(recipe.id);
      await ProductionService.completeProductionTask(task2.id);

      const item2 = Array.from(mockDatabase.inventoryItems.values())[0];
      expect(new Date(item2.lastProductionDate) >= new Date(date1)).toBe(true);
    });
  });

  describe('Full Production Flow', () => {
    it('should handle complete production workflow', async () => {
      // 1. Create recipe for prep item
      const recipe = createRecipe({
        name: 'House-Made Pasta Dough',
        category: 'Pasta',
        portions: 12,
        portionCost: 1.25,
        availableForSale: true,
        availableAsIngredient: true
      });

      // 2. Create internal vendor (happens automatically)
      expect(mockDatabase.vendors.size).toBe(0);

      // 3. First production run
      const task1 = createTask(recipe.id, { scaleFactor: 1 });
      const result1 = await ProductionService.completeProductionTask(task1.id);

      expect(result1.taskCompleted).toBe(true);
      expect(result1.production.action).toBe('created');
      expect(result1.production.newStock).toBe(12);
      expect(mockDatabase.vendors.size).toBe(1); // Internal vendor created
      expect(mockDatabase.inventoryItems.size).toBe(1);

      // 4. Double batch production
      const task2 = createTask(recipe.id, { scaleFactor: 2 });
      const result2 = await ProductionService.completeProductionTask(task2.id);

      expect(result2.production.action).toBe('updated');
      expect(result2.production.addedQuantity).toBe(24);
      expect(result2.production.newStock).toBe(36);

      // 5. Verify final inventory state
      const finalItem = Array.from(mockDatabase.inventoryItems.values())[0];
      expect(finalItem.name).toBe('House-Made Pasta Dough (Prep)');
      expect(finalItem.currentStock).toBe(36);
      expect(finalItem.availableForSale).toBe(true);
      expect(finalItem.availableAsIngredient).toBe(true);

      // 6. Verify production logs
      expect(mockDatabase.productionLogs.size).toBe(2);
    });
  });
});
