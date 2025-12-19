/**
 * E2E Test: Task Workflow Flow
 *
 * Tests the complete task management workflow:
 * 1. Tasks are created from recipes
 * 2. Tasks are assigned to departments/users
 * 3. Kitchen staff starts/pauses/completes tasks
 * 4. Task completion triggers inventory deduction
 * 5. Production output is added to inventory
 * 6. Task history is tracked
 *
 * This simulates the full journey from recipe to production.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// Mock State (Simulates Firebase + IndexedDB)
// ============================================

const appState = {
  // Auth state
  auth: {
    currentUser: { uid: 'test-user-123', email: 'chef@restaurant.com', displayName: 'Head Chef' },
    isAuthenticated: true
  },
  // Database state
  database: {
    departments: [
      { id: 1, name: 'Kitchen', color: '#4CAF50', isActive: true },
      { id: 2, name: 'Pastry', color: '#E91E63', isActive: true }
    ],
    recipes: [
      {
        id: 'recipe-1',
        name: 'Beef Bourguignon',
        department: 'Kitchen',
        portions: 4,
        ingredients: [
          { name: 'Ground Beef', metricQty: 1000, unit: 'g', linkedInventoryItemId: 1 },
          { name: 'Red Wine', metricQty: 500, unit: 'ml', linkedInventoryItemId: 2 },
          { name: 'Carrots', metricQty: 200, unit: 'g', linkedInventoryItemId: 3 }
        ],
        availableForSale: true,
        availableAsIngredient: true
      },
      {
        id: 'recipe-2',
        name: 'Chocolate Mousse',
        department: 'Pastry',
        portions: 8,
        ingredients: [
          { name: 'Dark Chocolate', metricQty: 300, unit: 'g', linkedInventoryItemId: 4 },
          { name: 'Heavy Cream', metricQty: 400, unit: 'ml', linkedInventoryItemId: 5 }
        ],
        availableForSale: true,
        availableAsIngredient: true
      }
    ],
    inventoryItems: [
      { id: 1, name: 'Ground Beef', stockOnHand: 5000, unit: 'g', vendorId: 1 },
      { id: 2, name: 'Red Wine', stockOnHand: 3000, unit: 'ml', vendorId: 1 },
      { id: 3, name: 'Carrots', stockOnHand: 2000, unit: 'g', vendorId: 1 },
      { id: 4, name: 'Dark Chocolate', stockOnHand: 1500, unit: 'g', vendorId: 2 },
      { id: 5, name: 'Heavy Cream', stockOnHand: 2000, unit: 'ml', vendorId: 2 },
      { id: 6, name: 'Beef Bourguignon (produced)', stockOnHand: 0, unit: 'portion', vendorId: 'INTERNAL', isProduced: true },
      { id: 7, name: 'Chocolate Mousse (produced)', stockOnHand: 0, unit: 'portion', vendorId: 'INTERNAL', isProduced: true }
    ],
    tasks: [],
    stockTransactions: [],
    productionLogs: []
  },
  // UI state
  ui: {
    currentView: 'task-list',
    selectedTask: null
  }
};

function resetAppState() {
  taskIdCounter = 0;
  appState.database.tasks = [];
  appState.database.stockTransactions = [];
  appState.database.productionLogs = [];
  // Reset inventory levels
  appState.database.inventoryItems[0].stockOnHand = 5000;
  appState.database.inventoryItems[1].stockOnHand = 3000;
  appState.database.inventoryItems[2].stockOnHand = 2000;
  appState.database.inventoryItems[3].stockOnHand = 1500;
  appState.database.inventoryItems[4].stockOnHand = 2000;
  appState.database.inventoryItems[5].stockOnHand = 0;
  appState.database.inventoryItems[6].stockOnHand = 0;
}

// ============================================
// Task Status Constants
// ============================================

const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Counter for unique task IDs (Date.now() alone can produce duplicates in fast tests)
let taskIdCounter = 0;

// ============================================
// Task Service
// ============================================

const TaskService = {
  async createTask(recipeId, options = {}) {
    const recipe = appState.database.recipes.find(r => r.id === recipeId);
    if (!recipe) {
      throw new Error('Recipe not found');
    }

    const scaleFactor = options.scaleFactor || 1;
    taskIdCounter++;
    const taskId = `task-${Date.now()}-${taskIdCounter}`;

    const task = {
      id: taskId,
      recipeId: recipe.id,
      recipeName: recipe.name,
      department: recipe.department,
      status: TASK_STATUS.PENDING,
      scaleFactor,
      targetPortions: recipe.portions * scaleFactor,
      assignedTo: options.assignedTo || null,
      priority: options.priority || 'normal',
      dueDate: options.dueDate || null,
      ingredients: recipe.ingredients.map(ing => ({
        ...ing,
        scaledQty: ing.metricQty * scaleFactor,
        isChecked: false
      })),
      createdAt: new Date().toISOString(),
      createdBy: appState.auth.currentUser.uid
    };

    appState.database.tasks.push(task);
    return task;
  },

  async getTasks(filters = {}) {
    let tasks = [...appState.database.tasks];

    if (filters.department) {
      tasks = tasks.filter(t => t.department === filters.department);
    }
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === filters.assignedTo);
    }

    return tasks;
  },

  async getTaskById(taskId) {
    return appState.database.tasks.find(t => t.id === taskId) || null;
  },

  async assignTask(taskId, userId) {
    const task = appState.database.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    task.assignedTo = userId;
    task.assignedAt = new Date().toISOString();
    return task;
  },

  async startTask(taskId) {
    const task = appState.database.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== TASK_STATUS.PENDING && task.status !== TASK_STATUS.PAUSED) {
      throw new Error('Can only start pending or paused tasks');
    }

    task.status = TASK_STATUS.IN_PROGRESS;
    task.startedAt = task.startedAt || new Date().toISOString();
    task.lastResumedAt = new Date().toISOString();
    return task;
  },

  async pauseTask(taskId) {
    const task = appState.database.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error('Can only pause in-progress tasks');
    }

    task.status = TASK_STATUS.PAUSED;
    task.pausedAt = new Date().toISOString();
    return task;
  },

  async completeTask(taskId, actualPortions = null) {
    const task = appState.database.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      throw new Error('Can only complete in-progress tasks');
    }

    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date().toISOString();
    task.actualPortions = actualPortions || task.targetPortions;

    // Trigger inventory cascade
    await this._deductIngredients(task);
    await this._addProducedOutput(task);

    return task;
  },

  async cancelTask(taskId, reason = '') {
    const task = appState.database.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    if (task.status === TASK_STATUS.COMPLETED) {
      throw new Error('Cannot cancel completed tasks');
    }

    task.status = TASK_STATUS.CANCELLED;
    task.cancelledAt = new Date().toISOString();
    task.cancelReason = reason;
    return task;
  },

  async _deductIngredients(task) {
    for (const ingredient of task.ingredients) {
      if (ingredient.linkedInventoryItemId) {
        const item = appState.database.inventoryItems.find(
          i => i.id === ingredient.linkedInventoryItemId
        );
        if (item) {
          const previousStock = item.stockOnHand;
          item.stockOnHand = Math.max(0, item.stockOnHand - ingredient.scaledQty);

          appState.database.stockTransactions.push({
            id: appState.database.stockTransactions.length + 1,
            inventoryItemId: item.id,
            type: 'consumption',
            quantity: -ingredient.scaledQty,
            previousStock,
            newStock: item.stockOnHand,
            reference: `Task: ${task.recipeName}`,
            taskId: task.id,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  },

  async _addProducedOutput(task) {
    // Find the produced inventory item for this recipe
    const recipe = appState.database.recipes.find(r => r.id === task.recipeId);
    const producedItem = appState.database.inventoryItems.find(
      i => i.name.includes(recipe.name) && i.isProduced
    );

    if (producedItem) {
      const previousStock = producedItem.stockOnHand;
      producedItem.stockOnHand += task.actualPortions;

      appState.database.stockTransactions.push({
        id: appState.database.stockTransactions.length + 1,
        inventoryItemId: producedItem.id,
        type: 'production',
        quantity: task.actualPortions,
        previousStock,
        newStock: producedItem.stockOnHand,
        reference: `Produced: ${task.recipeName}`,
        taskId: task.id,
        createdAt: new Date().toISOString()
      });

      appState.database.productionLogs.push({
        id: appState.database.productionLogs.length + 1,
        taskId: task.id,
        recipeId: task.recipeId,
        recipeName: task.recipeName,
        portionsProduced: task.actualPortions,
        producedBy: appState.auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
    }
  },

  getTaskProgress(tasks) {
    if (!tasks || tasks.length === 0) {
      return { total: 0, completed: 0, inProgress: 0, pending: 0, paused: 0, percentComplete: 0 };
    }

    const completed = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
    const inProgress = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
    const pending = tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
    const paused = tasks.filter(t => t.status === TASK_STATUS.PAUSED).length;

    return {
      total: tasks.length,
      completed,
      inProgress,
      pending,
      paused,
      percentComplete: Math.floor((completed / tasks.length) * 100)
    };
  }
};

// ============================================
// Department Dashboard Service
// ============================================

const DepartmentDashboardService = {
  getDepartmentTasks(departmentName) {
    return appState.database.tasks.filter(t => t.department === departmentName);
  },

  getDepartmentProgress(departmentName) {
    const tasks = this.getDepartmentTasks(departmentName);
    return TaskService.getTaskProgress(tasks);
  },

  getMyTasks(userId) {
    return appState.database.tasks.filter(t => t.assignedTo === userId);
  },

  getUnassignedTasks() {
    return appState.database.tasks.filter(t => !t.assignedTo && t.status === TASK_STATUS.PENDING);
  }
};

// ============================================
// Tests
// ============================================

describe('Task Workflow Flow', () => {
  beforeEach(() => {
    resetAppState();
  });

  describe('Task Creation', () => {
    it('should create task from recipe', async () => {
      const task = await TaskService.createTask('recipe-1');

      expect(task.recipeName).toBe('Beef Bourguignon');
      expect(task.department).toBe('Kitchen');
      expect(task.status).toBe(TASK_STATUS.PENDING);
      expect(task.targetPortions).toBe(4);
    });

    it('should create task with scale factor', async () => {
      const task = await TaskService.createTask('recipe-1', { scaleFactor: 2 });

      expect(task.scaleFactor).toBe(2);
      expect(task.targetPortions).toBe(8); // 4 × 2
    });

    it('should scale ingredient quantities', async () => {
      const task = await TaskService.createTask('recipe-1', { scaleFactor: 2 });

      const beefIngredient = task.ingredients.find(i => i.name === 'Ground Beef');
      expect(beefIngredient.scaledQty).toBe(2000); // 1000g × 2
    });

    it('should create task with assignment', async () => {
      const task = await TaskService.createTask('recipe-1', {
        assignedTo: 'chef-john',
        priority: 'high'
      });

      expect(task.assignedTo).toBe('chef-john');
      expect(task.priority).toBe('high');
    });

    it('should reject invalid recipe', async () => {
      await expect(
        TaskService.createTask('invalid-recipe')
      ).rejects.toThrow('Recipe not found');
    });
  });

  describe('Task Assignment', () => {
    let taskId;

    beforeEach(async () => {
      const task = await TaskService.createTask('recipe-1');
      taskId = task.id;
    });

    it('should assign task to user', async () => {
      const task = await TaskService.assignTask(taskId, 'chef-john');

      expect(task.assignedTo).toBe('chef-john');
      expect(task.assignedAt).toBeDefined();
    });

    it('should track unassigned tasks', async () => {
      const unassigned = DepartmentDashboardService.getUnassignedTasks();
      expect(unassigned).toHaveLength(1);

      await TaskService.assignTask(taskId, 'chef-john');

      const unassignedAfter = DepartmentDashboardService.getUnassignedTasks();
      expect(unassignedAfter).toHaveLength(0);
    });
  });

  describe('Task Status Transitions', () => {
    let taskId;

    beforeEach(async () => {
      const task = await TaskService.createTask('recipe-1');
      taskId = task.id;
    });

    it('should start pending task', async () => {
      const task = await TaskService.startTask(taskId);

      expect(task.status).toBe(TASK_STATUS.IN_PROGRESS);
      expect(task.startedAt).toBeDefined();
    });

    it('should pause in-progress task', async () => {
      await TaskService.startTask(taskId);
      const task = await TaskService.pauseTask(taskId);

      expect(task.status).toBe(TASK_STATUS.PAUSED);
      expect(task.pausedAt).toBeDefined();
    });

    it('should resume paused task', async () => {
      await TaskService.startTask(taskId);
      await TaskService.pauseTask(taskId);
      const task = await TaskService.startTask(taskId);

      expect(task.status).toBe(TASK_STATUS.IN_PROGRESS);
      expect(task.lastResumedAt).toBeDefined();
    });

    it('should complete in-progress task', async () => {
      await TaskService.startTask(taskId);
      const task = await TaskService.completeTask(taskId);

      expect(task.status).toBe(TASK_STATUS.COMPLETED);
      expect(task.completedAt).toBeDefined();
    });

    it('should not allow completing pending task', async () => {
      await expect(
        TaskService.completeTask(taskId)
      ).rejects.toThrow('Can only complete in-progress tasks');
    });

    it('should cancel pending task', async () => {
      const task = await TaskService.cancelTask(taskId, 'Out of ingredients');

      expect(task.status).toBe(TASK_STATUS.CANCELLED);
      expect(task.cancelReason).toBe('Out of ingredients');
    });

    it('should not allow cancelling completed task', async () => {
      await TaskService.startTask(taskId);
      await TaskService.completeTask(taskId);

      await expect(
        TaskService.cancelTask(taskId)
      ).rejects.toThrow('Cannot cancel completed tasks');
    });
  });

  describe('Inventory Deduction on Completion', () => {
    let taskId;

    beforeEach(async () => {
      const task = await TaskService.createTask('recipe-1');
      taskId = task.id;
      await TaskService.startTask(taskId);
    });

    it('should deduct ingredient stock on completion', async () => {
      const beefBefore = appState.database.inventoryItems[0].stockOnHand;
      const wineBefore = appState.database.inventoryItems[1].stockOnHand;

      await TaskService.completeTask(taskId);

      const beefAfter = appState.database.inventoryItems[0].stockOnHand;
      const wineAfter = appState.database.inventoryItems[1].stockOnHand;

      expect(beefAfter).toBe(beefBefore - 1000); // 1000g deducted
      expect(wineAfter).toBe(wineBefore - 500); // 500ml deducted
    });

    it('should create consumption transactions', async () => {
      await TaskService.completeTask(taskId);

      const consumptionTx = appState.database.stockTransactions.filter(
        t => t.type === 'consumption'
      );
      expect(consumptionTx.length).toBe(3); // 3 ingredients
    });

    it('should handle scaled quantities', async () => {
      // Create scaled task
      const scaledTask = await TaskService.createTask('recipe-1', { scaleFactor: 3 });
      await TaskService.startTask(scaledTask.id);

      const beefBefore = appState.database.inventoryItems[0].stockOnHand;

      await TaskService.completeTask(scaledTask.id);

      const beefAfter = appState.database.inventoryItems[0].stockOnHand;
      expect(beefAfter).toBe(beefBefore - 3000); // 1000g × 3
    });
  });

  describe('Production Output', () => {
    let taskId;

    beforeEach(async () => {
      const task = await TaskService.createTask('recipe-1');
      taskId = task.id;
      await TaskService.startTask(taskId);
    });

    it('should add produced output to inventory', async () => {
      const producedItem = appState.database.inventoryItems[5]; // Beef Bourguignon (produced)
      const before = producedItem.stockOnHand;

      await TaskService.completeTask(taskId);

      expect(producedItem.stockOnHand).toBe(before + 4); // 4 portions
    });

    it('should create production transaction', async () => {
      await TaskService.completeTask(taskId);

      const productionTx = appState.database.stockTransactions.find(
        t => t.type === 'production'
      );
      expect(productionTx).toBeDefined();
      expect(productionTx.quantity).toBe(4);
    });

    it('should log production', async () => {
      await TaskService.completeTask(taskId);

      const log = appState.database.productionLogs[0];
      expect(log.recipeName).toBe('Beef Bourguignon');
      expect(log.portionsProduced).toBe(4);
    });

    it('should allow specifying actual portions', async () => {
      const task = await TaskService.completeTask(taskId, 3); // Only produced 3

      expect(task.actualPortions).toBe(3);

      const producedItem = appState.database.inventoryItems[5];
      expect(producedItem.stockOnHand).toBe(3);
    });
  });

  describe('Department Dashboard', () => {
    beforeEach(async () => {
      await TaskService.createTask('recipe-1'); // Kitchen
      await TaskService.createTask('recipe-1'); // Kitchen
      await TaskService.createTask('recipe-2'); // Pastry
    });

    it('should filter tasks by department', () => {
      const kitchenTasks = DepartmentDashboardService.getDepartmentTasks('Kitchen');
      const pastryTasks = DepartmentDashboardService.getDepartmentTasks('Pastry');

      expect(kitchenTasks).toHaveLength(2);
      expect(pastryTasks).toHaveLength(1);
    });

    it('should calculate department progress', async () => {
      const tasks = await TaskService.getTasks({ department: 'Kitchen' });
      await TaskService.startTask(tasks[0].id);
      await TaskService.completeTask(tasks[0].id);

      const progress = DepartmentDashboardService.getDepartmentProgress('Kitchen');

      expect(progress.total).toBe(2);
      expect(progress.completed).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.percentComplete).toBe(50);
    });

    it('should get user assigned tasks', async () => {
      const tasks = await TaskService.getTasks();
      await TaskService.assignTask(tasks[0].id, 'chef-john');
      await TaskService.assignTask(tasks[1].id, 'chef-john');

      const myTasks = DepartmentDashboardService.getMyTasks('chef-john');
      expect(myTasks).toHaveLength(2);
    });
  });

  describe('Task Progress Calculation', () => {
    it('should calculate progress for empty list', () => {
      const progress = TaskService.getTaskProgress([]);

      expect(progress.total).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('should calculate progress for mixed statuses', async () => {
      const task1 = await TaskService.createTask('recipe-1');
      const task2 = await TaskService.createTask('recipe-1');
      const task3 = await TaskService.createTask('recipe-1');

      await TaskService.startTask(task1.id);
      await TaskService.completeTask(task1.id);
      await TaskService.startTask(task2.id);

      const tasks = await TaskService.getTasks();
      const progress = TaskService.getTaskProgress(tasks);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.percentComplete).toBe(33);
    });
  });

  describe('Complete Task Workflow', () => {
    it('should complete full production cycle', async () => {
      // Step 1: Check initial stock
      const beefInitial = appState.database.inventoryItems[0].stockOnHand;
      const producedInitial = appState.database.inventoryItems[5].stockOnHand;
      expect(beefInitial).toBe(5000);
      expect(producedInitial).toBe(0);

      // Step 2: Create task (prep list)
      const task = await TaskService.createTask('recipe-1', {
        scaleFactor: 2,
        priority: 'high'
      });
      expect(task.targetPortions).toBe(8); // 4 × 2

      // Step 3: Assign to chef
      await TaskService.assignTask(task.id, 'chef-john');
      const assignedTask = await TaskService.getTaskById(task.id);
      expect(assignedTask.assignedTo).toBe('chef-john');

      // Step 4: Chef starts task
      await TaskService.startTask(task.id);
      const inProgress = await TaskService.getTasks({ status: TASK_STATUS.IN_PROGRESS });
      expect(inProgress).toHaveLength(1);

      // Step 5: Chef pauses (break time)
      await TaskService.pauseTask(task.id);
      const pausedTask = await TaskService.getTaskById(task.id);
      expect(pausedTask.status).toBe(TASK_STATUS.PAUSED);

      // Step 6: Chef resumes
      await TaskService.startTask(task.id);

      // Step 7: Chef completes task
      await TaskService.completeTask(task.id);
      const completedTask = await TaskService.getTaskById(task.id);
      expect(completedTask.status).toBe(TASK_STATUS.COMPLETED);

      // Step 8: Verify ingredients deducted
      const beefFinal = appState.database.inventoryItems[0].stockOnHand;
      expect(beefFinal).toBe(beefInitial - 2000); // 1000g × 2 scale

      // Step 9: Verify production output added
      const producedFinal = appState.database.inventoryItems[5].stockOnHand;
      expect(producedFinal).toBe(8); // 8 portions produced

      // Step 10: Verify transaction history
      const transactions = appState.database.stockTransactions;
      expect(transactions.length).toBe(4); // 3 consumption + 1 production

      // Step 11: Verify production log
      const logs = appState.database.productionLogs;
      expect(logs).toHaveLength(1);
      expect(logs[0].portionsProduced).toBe(8);
    });

    it('should handle multiple concurrent tasks', async () => {
      // Create tasks for different departments
      const kitchenTask = await TaskService.createTask('recipe-1');
      const pastryTask = await TaskService.createTask('recipe-2');

      // Start both
      await TaskService.startTask(kitchenTask.id);
      await TaskService.startTask(pastryTask.id);

      // Complete kitchen first
      await TaskService.completeTask(kitchenTask.id);

      // Check progress
      const allTasks = await TaskService.getTasks();
      const progress = TaskService.getTaskProgress(allTasks);

      expect(progress.completed).toBe(1);
      expect(progress.inProgress).toBe(1);

      // Complete pastry
      await TaskService.completeTask(pastryTask.id);

      const finalProgress = TaskService.getTaskProgress(await TaskService.getTasks());
      expect(finalProgress.completed).toBe(2);
      expect(finalProgress.percentComplete).toBe(100);

      // Both outputs should be in inventory
      expect(appState.database.inventoryItems[5].stockOnHand).toBe(4); // Beef Bourguignon
      expect(appState.database.inventoryItems[6].stockOnHand).toBe(8); // Chocolate Mousse
    });
  });
});
