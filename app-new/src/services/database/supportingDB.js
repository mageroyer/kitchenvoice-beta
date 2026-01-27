// Supporting Database Modules
// Smaller DB modules grouped together: department, category, slider, settings, productionLog, priceHistory, expenseCategory, expenseRecord
import { db, getCloudSync } from './db.js';

// ============================================
// Restriction Levels - Constants
// ============================================
export const RESTRICTION_LEVELS = {
  QUICK: 1,      // Minimal friction - no required fields
  STANDARD: 2,   // Balanced - basic required fields
  ACCOUNTING: 3  // Full control - all fields, audit trail
};

export const RESTRICTION_LEVEL_CONFIG = {
  [RESTRICTION_LEVELS.QUICK]: {
    name: 'Quick Mode',
    description: 'Minimal friction - create recipes instantly',
    requiredRecipeFields: ['name'],
    requiredIngredientFields: ['name'],
    requireCosts: false,
    requireApproval: false,
    trackProduction: false
  },
  [RESTRICTION_LEVELS.STANDARD]: {
    name: 'Standard Mode',
    description: 'Balanced - basic tracking and organization',
    requiredRecipeFields: ['name', 'category', 'portions'],
    requiredIngredientFields: ['name', 'metric'],
    requireCosts: false,
    requireApproval: false,
    trackProduction: true
  },
  [RESTRICTION_LEVELS.ACCOUNTING]: {
    name: 'Accounting Mode',
    description: 'Full control - complete cost tracking and audit trail',
    requiredRecipeFields: ['name', 'category', 'portions', 'department'],
    requiredIngredientFields: ['name', 'metric', 'ingredientId'],
    requireCosts: true,
    requireApproval: true,
    trackProduction: true
  }
};

// ============================================
// Department DB with auto-sync
// ============================================
export const departmentDB = {
  async getAll() {
    return await db.departments.orderBy('name').toArray();
  },

  async getById(id) {
    return await db.departments.get(id);
  },

  async add(name) {
    const deptData = {
      name,
      isDefault: false,
      createdAt: new Date().toISOString()
    };
    const id = await db.departments.add(deptData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushDepartment({ ...deptData, id });

    return id;
  },

  async delete(id) {
    const dept = await db.departments.get(id);
    if (dept && !dept.isDefault) {
      // Also delete associated categories
      const categories = await db.categories.where('departmentId').equals(id).toArray();
      for (const cat of categories) {
        await db.categories.delete(cat.id);
        const sync = await getCloudSync();
        sync.deleteCategoryFromCloud(cat.id);
      }

      await db.departments.delete(id);

      // Auto-sync to cloud
      const sync = await getCloudSync();
      sync.deleteDepartmentFromCloud(id);

      return true;
    }
    return false;
  },

  async update(id, name) {
    const dept = await db.departments.get(id);
    if (dept) {
      await db.departments.update(id, { name });

      // Auto-sync to cloud
      const updatedDept = await db.departments.get(id);
      const sync = await getCloudSync();
      sync.pushDepartment(updatedDept);

      return true;
    }
    return false;
  }
};

// ============================================
// Category DB with auto-sync
// ============================================
export const categoryDB = {
  async getAll() {
    return await db.categories.orderBy('name').toArray();
  },

  async getByDepartment(departmentId) {
    return await db.categories
      .where('departmentId')
      .equals(departmentId)
      .sortBy('name');
  },

  async getById(id) {
    return await db.categories.get(id);
  },

  async add(name, departmentId) {
    const catData = {
      name,
      departmentId,
      isDefault: false,
      createdAt: new Date().toISOString()
    };
    const id = await db.categories.add(catData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushCategory({ ...catData, id });

    return id;
  },

  async delete(id) {
    const cat = await db.categories.get(id);
    if (cat && !cat.isDefault) {
      await db.categories.delete(id);

      // Auto-sync to cloud
      const sync = await getCloudSync();
      sync.deleteCategoryFromCloud(id);

      return true;
    }
    return false;
  },

  async update(id, name) {
    const cat = await db.categories.get(id);
    if (cat) {
      await db.categories.update(id, { name });

      // Auto-sync to cloud
      const updatedCat = await db.categories.get(id);
      const sync = await getCloudSync();
      sync.pushCategory(updatedCat);

      return true;
    }
    return false;
  },

  /**
   * Get recipe count for a category (uses indexed query - fast)
   */
  async getRecipeCount(categoryName) {
    return await db.recipes
      .where('category')
      .equals(categoryName)
      .count();
  }
};

// ============================================
// Slider DB for configurable feature showcases
// ============================================
export const sliderDB = {
  async getAll() {
    return await db.sliders.toArray();
  },

  async getByLocation(location) {
    return await db.sliders
      .where('location')
      .equals(location)
      .first();
  },

  async getById(id) {
    return await db.sliders.get(id);
  },

  async add(slider) {
    const sliderData = {
      name: slider.name || 'Untitled Slider',
      location: slider.location || 'landing',
      autoPlay: slider.autoPlay !== false,
      interval: slider.interval || 5000,
      animation: slider.animation || 'slide',
      showDots: slider.showDots !== false,
      showArrows: slider.showArrows !== false,
      slides: slider.slides || [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    const id = await db.sliders.add(sliderData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushSlider?.({ ...sliderData, id });

    return id;
  },

  async update(id, updates) {
    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await db.sliders.update(id, updatedData);

    // Auto-sync to cloud
    const slider = await db.sliders.get(id);
    if (slider) {
      const sync = await getCloudSync();
      sync.pushSlider?.(slider);
    }

    return true;
  },

  async delete(id) {
    await db.sliders.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteSliderFromCloud?.(id);

    return true;
  },

  async upsertByLocation(location, sliderData) {
    const existing = await this.getByLocation(location);
    if (existing) {
      await this.update(existing.id, sliderData);
      return existing.id;
    } else {
      return await this.add({ ...sliderData, location });
    }
  }
};

// ============================================
// Kitchen Settings DB
// ============================================
export const kitchenSettingsDB = {
  async get(key) {
    const setting = await db.kitchenSettings.where('key').equals(key).first();
    return setting?.value;
  },

  async set(key, value) {
    const existing = await db.kitchenSettings.where('key').equals(key).first();
    const data = {
      key,
      value,
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      await db.kitchenSettings.update(existing.id, data);
      return existing.id;
    } else {
      return await db.kitchenSettings.add(data);
    }
  },

  async getAll() {
    const settings = await db.kitchenSettings.toArray();
    return settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
  },

  // Convenience methods for common settings
  async getRestrictionLevel() {
    const level = await this.get('restrictionLevel');
    return level || RESTRICTION_LEVELS.STANDARD;
  },

  async setRestrictionLevel(level) {
    return await this.set('restrictionLevel', level);
  },

  async getRestrictionConfig() {
    const level = await this.getRestrictionLevel();
    return RESTRICTION_LEVEL_CONFIG[level];
  },

  async getDefaultLaborRate() {
    const rate = await this.get('defaultLaborRate');
    return rate || 18; // Default $18/hour
  },

  async setDefaultLaborRate(rate) {
    return await this.set('defaultLaborRate', rate);
  }
};

// ============================================
// Production Log Database
// ============================================
export const productionLogDB = {
  async getAll() {
    return await db.productionLogs.orderBy('createdAt').reverse().toArray();
  },

  async getById(id) {
    return await db.productionLogs.get(id);
  },

  async getByRecipe(recipeId) {
    return await db.productionLogs
      .where('recipeId')
      .equals(recipeId)
      .reverse()
      .sortBy('createdAt');
  },

  async getByTask(taskId) {
    return await db.productionLogs
      .where('taskId')
      .equals(taskId)
      .first();
  },

  async getByEmployee(employeeId) {
    return await db.productionLogs
      .where('employeeId')
      .equals(employeeId)
      .reverse()
      .sortBy('createdAt');
  },

  async getByDateRange(startDate, endDate) {
    return await db.productionLogs
      .filter(log => {
        const created = new Date(log.createdAt);
        return created >= startDate && created <= endDate;
      })
      .toArray();
  },

  /**
   * Create production log from completed task
   * This is the main entry point - called when a task is marked complete
   */
  async createFromTask(task, options = {}) {
    const settings = await kitchenSettingsDB.getAll();
    const laborRate = settings.defaultLaborRate || 18;

    // Calculate duration in hours
    const startedAt = task.startedAt ? new Date(task.startedAt) : null;
    const completedAt = task.completedAt ? new Date(task.completedAt) : new Date();
    const durationMs = startedAt ? (completedAt - startedAt) : 0;
    const durationHours = durationMs / (1000 * 60 * 60);

    // Calculate costs
    const laborCost = durationHours * laborRate;
    const foodCost = options.foodCost || 0; // Will be calculated from recipe ingredients
    const totalCost = laborCost + foodCost;
    const costPerPortion = task.portions > 0 ? totalCost / task.portions : 0;

    const data = {
      recipeId: task.recipeId,
      recipeName: task.recipeName,
      taskId: task.id,
      employeeId: task.assignedTo,
      employeeName: task.assignedToName,
      department: task.department,
      portions: task.portions || 1,
      scaleFactor: task.scaleFactor || 1,
      startedAt: startedAt?.toISOString() || null,
      completedAt: completedAt.toISOString(),
      durationMs,
      durationHours: Math.round(durationHours * 100) / 100,
      laborRate,
      laborCost: Math.round(laborCost * 100) / 100,
      foodCost: Math.round(foodCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      costPerPortion: Math.round(costPerPortion * 100) / 100,
      notes: options.notes || '',
      createdAt: new Date().toISOString()
    };

    const id = await db.productionLogs.add(data);

    const sync = await getCloudSync();
    sync.pushProductionLog?.({ ...data, id });

    return { id, ...data };
  },

  /**
   * Get production stats for a recipe
   */
  async getRecipeStats(recipeId) {
    const logs = await this.getByRecipe(recipeId);

    if (logs.length === 0) {
      return {
        totalProduced: 0,
        avgDurationHours: 0,
        avgCostPerPortion: 0,
        totalLaborCost: 0,
        totalFoodCost: 0,
        productionCount: 0
      };
    }

    const totalProduced = logs.reduce((sum, l) => sum + (l.portions || 0), 0);
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationHours || 0), 0);
    const totalLabor = logs.reduce((sum, l) => sum + (l.laborCost || 0), 0);
    const totalFood = logs.reduce((sum, l) => sum + (l.foodCost || 0), 0);
    const totalCostPerPortion = logs.reduce((sum, l) => sum + (l.costPerPortion || 0), 0);

    return {
      totalProduced,
      avgDurationHours: Math.round((totalDuration / logs.length) * 100) / 100,
      avgCostPerPortion: Math.round((totalCostPerPortion / logs.length) * 100) / 100,
      totalLaborCost: Math.round(totalLabor * 100) / 100,
      totalFoodCost: Math.round(totalFood * 100) / 100,
      productionCount: logs.length
    };
  },

  /**
   * Get daily production summary
   */
  async getDailySummary(date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await this.getByDateRange(startOfDay, endOfDay);

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalRecipesProduced: logs.length,
      totalPortions: logs.reduce((sum, l) => sum + (l.portions || 0), 0),
      totalLaborHours: Math.round(logs.reduce((sum, l) => sum + (l.durationHours || 0), 0) * 100) / 100,
      totalLaborCost: Math.round(logs.reduce((sum, l) => sum + (l.laborCost || 0), 0) * 100) / 100,
      totalFoodCost: Math.round(logs.reduce((sum, l) => sum + (l.foodCost || 0), 0) * 100) / 100,
      byDepartment: logs.reduce((acc, l) => {
        const dept = l.department || 'Unknown';
        if (!acc[dept]) acc[dept] = { count: 0, portions: 0, laborCost: 0 };
        acc[dept].count++;
        acc[dept].portions += l.portions || 0;
        acc[dept].laborCost += l.laborCost || 0;
        return acc;
      }, {})
    };
  }
};

// ============================================
// Price History Database
// ============================================
export const priceHistoryDB = {
  /**
   * Get all price history records for an inventory item
   * @param {number} inventoryItemId - The inventory item ID
   */
  async getByInventoryItem(inventoryItemId) {
    return await db.priceHistory
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .sortBy('recordedAt');
  },

  // Alias for backwards compatibility
  async getByIngredient(ingredientId) {
    return await this.getByInventoryItem(ingredientId);
  },

  /**
   * Get price history for multiple inventory items
   */
  async getByInventoryItems(inventoryItemIds) {
    return await db.priceHistory
      .where('inventoryItemId')
      .anyOf(inventoryItemIds)
      .reverse()
      .sortBy('recordedAt');
  },

  // Alias for backwards compatibility
  async getByIngredients(ingredientIds) {
    return await this.getByInventoryItems(ingredientIds);
  },

  /**
   * Get recent price changes (last N days)
   */
  async getRecent(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await db.priceHistory
      .filter(h => new Date(h.recordedAt) >= cutoffDate)
      .reverse()
      .sortBy('recordedAt');
  },

  /**
   * Add a price history record
   */
  async add(record) {
    const data = {
      inventoryItemId: record.inventoryItemId,
      price: record.price,
      previousPrice: record.previousPrice || 0,
      priceChange: record.price - (record.previousPrice || 0),
      priceChangePercent: record.previousPrice
        ? Math.round(((record.price - record.previousPrice) / record.previousPrice) * 10000) / 100
        : 0,
      invoiceId: record.invoiceId || null,
      vendorId: record.vendorId || null,
      recordedAt: new Date().toISOString()
    };

    const id = await db.priceHistory.add(data);
    return { id, ...data };
  },

  /**
   * Get price trend for an inventory item (returns min, max, avg, latest)
   */
  async getTrend(inventoryItemId) {
    const history = await this.getByInventoryItem(inventoryItemId);

    if (history.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        latest: 0,
        oldest: 0,
        change: 0,
        changePercent: 0
      };
    }

    const prices = history.map(h => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const latest = history[0].price;
    const oldest = history[history.length - 1].price;
    const change = latest - oldest;
    const changePercent = oldest ? Math.round((change / oldest) * 10000) / 100 : 0;

    return {
      count: history.length,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      avg: Math.round(avg * 100) / 100,
      latest: Math.round(latest * 100) / 100,
      oldest: Math.round(oldest * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent,
      history
    };
  },

  /**
   * Delete history for an inventory item
   */
  async deleteByInventoryItem(inventoryItemId) {
    await db.priceHistory
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .delete();
    return true;
  },

  // Alias for backwards compatibility
  async deleteByIngredient(ingredientId) {
    return await this.deleteByInventoryItem(ingredientId);
  }
};

// ============================================
// Expense Category Database
// For accounting expense classification (utilities, services, rent, etc.)
// ============================================
export const expenseCategoryDB = {
  /**
   * Get all expense categories
   * @param {boolean} activeOnly - Only return active categories
   * @returns {Promise<Array>} Array of expense categories
   */
  async getAll(activeOnly = false) {
    let query = db.expenseCategories.orderBy('name');
    if (activeOnly) {
      query = query.filter(cat => cat.isActive !== false);
    }
    return await query.toArray();
  },

  /**
   * Get expense category by ID
   * @param {number} id - Category ID
   * @returns {Promise<Object|undefined>} Expense category or undefined
   */
  async getById(id) {
    return await db.expenseCategories.get(id);
  },

  /**
   * Get expense category by name (case-insensitive)
   * @param {string} name - Category name
   * @returns {Promise<Object|undefined>} Expense category or undefined
   */
  async getByName(name) {
    const normalized = name.toLowerCase().trim();
    return await db.expenseCategories
      .filter(cat => cat.name.toLowerCase() === normalized)
      .first();
  },

  /**
   * Add a new expense category
   * @param {Object} category - Category data
   * @param {string} category.name - Category name
   * @param {string} [category.description] - Category description
   * @param {string} [category.qbAccountId] - QuickBooks account ID mapping
   * @returns {Promise<number>} New category ID
   */
  async add(category) {
    const now = new Date().toISOString();
    const catData = {
      name: category.name,
      description: category.description || '',
      isDefault: false,
      isActive: true,
      qbAccountId: category.qbAccountId || null,
      createdAt: now,
      updatedAt: now
    };
    const id = await db.expenseCategories.add(catData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushExpenseCategory?.({ ...catData, id });

    return id;
  },

  /**
   * Update an expense category
   * @param {number} id - Category ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success
   */
  async update(id, updates) {
    const cat = await db.expenseCategories.get(id);
    if (!cat) return false;

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await db.expenseCategories.update(id, updateData);

    // Auto-sync to cloud
    const updatedCat = await db.expenseCategories.get(id);
    const sync = await getCloudSync();
    sync.pushExpenseCategory?.(updatedCat);

    return true;
  },

  /**
   * Delete an expense category (soft delete - deactivate)
   * Default categories cannot be deleted
   * @param {number} id - Category ID
   * @returns {Promise<boolean>} Success
   */
  async delete(id) {
    const cat = await db.expenseCategories.get(id);
    if (!cat || cat.isDefault) return false;

    // Soft delete by deactivating
    await db.expenseCategories.update(id, {
      isActive: false,
      updatedAt: new Date().toISOString()
    });

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteExpenseCategoryFromCloud?.(id);

    return true;
  },

  /**
   * Map expense category to QuickBooks account
   * @param {number} id - Category ID
   * @param {string} qbAccountId - QuickBooks account ID
   * @returns {Promise<boolean>} Success
   */
  async mapToQuickBooks(id, qbAccountId) {
    return await this.update(id, { qbAccountId });
  },

  /**
   * Get expense record count for a category
   * @param {number} categoryId - Category ID
   * @returns {Promise<number>} Record count
   */
  async getRecordCount(categoryId) {
    return await db.expenseRecords
      .where('expenseCategoryId')
      .equals(categoryId)
      .count();
  }
};

// ============================================
// Expense Record Database
// For tracking non-inventory expenses (utilities, services, etc.)
// ============================================
export const expenseRecordDB = {
  /**
   * Get all expense records
   * @param {Object} options - Query options
   * @param {number} [options.limit] - Max records to return
   * @param {number} [options.offset] - Records to skip
   * @returns {Promise<Array>} Array of expense records
   */
  async getAll(options = {}) {
    let query = db.expenseRecords.orderBy('invoiceDate').reverse();
    if (options.offset) {
      query = query.offset(options.offset);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    return await query.toArray();
  },

  /**
   * Get expense record by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object|undefined>} Expense record or undefined
   */
  async getById(id) {
    return await db.expenseRecords.get(id);
  },

  /**
   * Get expense records by invoice ID
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<Array>} Array of expense records
   */
  async getByInvoice(invoiceId) {
    return await db.expenseRecords
      .where('invoiceId')
      .equals(invoiceId)
      .toArray();
  },

  /**
   * Get expense records by vendor
   * @param {number} vendorId - Vendor ID
   * @returns {Promise<Array>} Array of expense records
   */
  async getByVendor(vendorId) {
    return await db.expenseRecords
      .where('vendorId')
      .equals(vendorId)
      .reverse()
      .sortBy('invoiceDate');
  },

  /**
   * Get expense records by category
   * @param {number} expenseCategoryId - Expense category ID
   * @returns {Promise<Array>} Array of expense records
   */
  async getByCategory(expenseCategoryId) {
    return await db.expenseRecords
      .where('expenseCategoryId')
      .equals(expenseCategoryId)
      .reverse()
      .sortBy('invoiceDate');
  },

  /**
   * Get expense records by date range
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @returns {Promise<Array>} Array of expense records
   */
  async getByDateRange(startDate, endDate) {
    const start = new Date(startDate).toISOString().split('T')[0];
    const end = new Date(endDate).toISOString().split('T')[0];

    return await db.expenseRecords
      .filter(record => {
        const date = record.invoiceDate?.split('T')[0];
        return date >= start && date <= end;
      })
      .toArray();
  },

  /**
   * Create a new expense record
   * @param {Object} record - Expense record data
   * @returns {Promise<Object>} Created record with ID
   */
  async create(record) {
    const now = new Date().toISOString();
    const recordData = {
      invoiceId: record.invoiceId || null,
      vendorId: record.vendorId,
      vendorName: record.vendorName || '',
      expenseCategoryId: record.expenseCategoryId,
      expenseCategoryName: record.expenseCategoryName || '',
      description: record.description || '',
      amount: parseFloat(record.amount) || 0,
      invoiceNumber: record.invoiceNumber || '',
      invoiceDate: record.invoiceDate || now.split('T')[0],
      dueDate: record.dueDate || null,
      periodStart: record.periodStart || null,
      periodEnd: record.periodEnd || null,
      accountNumber: record.accountNumber || '',
      reference: record.reference || '',
      notes: record.notes || '',
      qbSynced: false,
      createdAt: now,
      updatedAt: now
    };

    const id = await db.expenseRecords.add(recordData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushExpenseRecord?.({ ...recordData, id });

    return { id, ...recordData };
  },

  /**
   * Update an expense record
   * @param {number} id - Record ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success
   */
  async update(id, updates) {
    const record = await db.expenseRecords.get(id);
    if (!record) return false;

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Parse amount if provided
    if (updateData.amount !== undefined) {
      updateData.amount = parseFloat(updateData.amount) || 0;
    }

    await db.expenseRecords.update(id, updateData);

    // Auto-sync to cloud
    const updatedRecord = await db.expenseRecords.get(id);
    const sync = await getCloudSync();
    sync.pushExpenseRecord?.(updatedRecord);

    return true;
  },

  /**
   * Delete an expense record
   * @param {number} id - Record ID
   * @returns {Promise<boolean>} Success
   */
  async delete(id) {
    const record = await db.expenseRecords.get(id);
    if (!record) return false;

    await db.expenseRecords.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteExpenseRecordFromCloud?.(id);

    return true;
  },

  /**
   * Mark expense record as synced to QuickBooks
   * @param {number} id - Record ID
   * @param {boolean} synced - Sync status
   * @returns {Promise<boolean>} Success
   */
  async markQBSynced(id, synced = true) {
    return await this.update(id, { qbSynced: synced });
  },

  /**
   * Get unsynced records for QuickBooks export
   * @returns {Promise<Array>} Array of unsynced expense records
   */
  async getUnsyncedForQB() {
    return await db.expenseRecords
      .filter(record => !record.qbSynced)
      .toArray();
  },

  /**
   * Get expense summary by category for a date range
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @returns {Promise<Object>} Summary by category
   */
  async getSummaryByCategory(startDate, endDate) {
    const records = await this.getByDateRange(startDate, endDate);

    const summary = records.reduce((acc, record) => {
      const catId = record.expenseCategoryId || 'uncategorized';
      const catName = record.expenseCategoryName || 'Uncategorized';

      if (!acc[catId]) {
        acc[catId] = {
          categoryId: catId,
          categoryName: catName,
          count: 0,
          total: 0
        };
      }

      acc[catId].count++;
      acc[catId].total += record.amount || 0;
      return acc;
    }, {});

    return {
      categories: Object.values(summary),
      grandTotal: records.reduce((sum, r) => sum + (r.amount || 0), 0),
      recordCount: records.length
    };
  },

  /**
   * Get monthly expense totals
   * @param {number} months - Number of months to look back
   * @returns {Promise<Array>} Monthly totals
   */
  async getMonthlyTotals(months = 12) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const records = await this.getByDateRange(startDate, endDate);

    const monthlyTotals = records.reduce((acc, record) => {
      const month = record.invoiceDate?.substring(0, 7); // YYYY-MM
      if (!month) return acc;

      if (!acc[month]) {
        acc[month] = { month, total: 0, count: 0 };
      }
      acc[month].total += record.amount || 0;
      acc[month].count++;
      return acc;
    }, {});

    return Object.values(monthlyTotals).sort((a, b) => a.month.localeCompare(b.month));
  }
};
