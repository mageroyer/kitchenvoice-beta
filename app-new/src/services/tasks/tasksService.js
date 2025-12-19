/**
 * Tasks Service
 *
 * Manages kitchen tasks assigned to cooks/stations
 * Tasks are stored in Firestore under users/{userId}/tasks
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../database/firebase';
import { convertUnits, areUnitsCompatible } from '../../utils/unitConversion';

// Task statuses
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Collection name
const TASKS_COLLECTION = 'tasks';

/**
 * Get the tasks collection reference for current user
 */
function getTasksCollection() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return collection(db, 'users', user.uid, TASKS_COLLECTION);
}

/**
 * Create a new task
 * @param {Object} taskData - Task data
 * @returns {Promise<string>} New task ID
 */
export async function createTask(taskData) {
  try {
    const {
      recipeId,
      recipeName,
      portions,
      scaleFactor,
      assignedTo,      // Privilege ID or name
      assignedToName,  // Display name
      station,
      department,      // Department name for team view
      dueDate,
      dueTime,
      chefNotes,
      priority,
      type             // 'recipe' or 'custom'
    } = taskData;

    const tasksRef = getTasksCollection();

    // Convert date string to Timestamp if provided
    let dueDateTimestamp = null;
    if (dueDate) {
      const dateStr = dueTime ? `${dueDate}T${dueTime}` : `${dueDate}T23:59`;
      dueDateTimestamp = Timestamp.fromDate(new Date(dateStr));
    }

    const docRef = await addDoc(tasksRef, {
      type: type || 'recipe',
      recipeId: recipeId || null,
      recipeName,
      portions: portions || 1,
      scaleFactor: scaleFactor || 1,
      assignedTo: assignedTo || null,
      assignedToName: assignedToName || 'Team',
      station: station || null,
      department: department || null,
      dueDate: dueDateTimestamp,
      priority: priority || 'normal',
      status: TASK_STATUS.PENDING,
      chefNotes: chefNotes || '',
      cookNotes: '',
      messages: [],
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      totalTime: 0,  // In seconds
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Task created:', docRef.id, 'department:', taskData.department, 'type:', taskData.type);
    return docRef.id;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

/**
 * Get all tasks for current user
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Array of tasks
 */
export async function getAllTasks(options = {}) {
  try {
    const tasksRef = getTasksCollection();
    let q = query(tasksRef, orderBy('createdAt', 'desc'));

    // Apply filters
    if (options.status) {
      q = query(tasksRef, where('status', '==', options.status), orderBy('createdAt', 'desc'));
    }
    if (options.assignedTo) {
      q = query(tasksRef, where('assignedTo', '==', options.assignedTo), orderBy('createdAt', 'desc'));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      dueDate: doc.data().dueDate?.toDate() || null,
      createdAt: doc.data().createdAt?.toDate() || null,
      updatedAt: doc.data().updatedAt?.toDate() || null,
      startedAt: doc.data().startedAt?.toDate() || null,
      completedAt: doc.data().completedAt?.toDate() || null
    }));
  } catch (error) {
    console.error('Error getting tasks:', error);
    throw error;
  }
}

/**
 * Get a single task by ID
 * @param {string} taskId - Task ID
 * @returns {Promise<Object|null>} Task object or null
 */
export async function getTask(taskId) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const taskRef = doc(db, 'users', user.uid, TASKS_COLLECTION, taskId);
    const taskDoc = await getDoc(taskRef);

    if (!taskDoc.exists()) return null;

    const data = taskDoc.data();
    return {
      id: taskDoc.id,
      ...data,
      dueDate: data.dueDate?.toDate() || null,
      createdAt: data.createdAt?.toDate() || null,
      updatedAt: data.updatedAt?.toDate() || null,
      startedAt: data.startedAt?.toDate() || null,
      completedAt: data.completedAt?.toDate() || null
    };
  } catch (error) {
    console.error('Error getting task:', error);
    throw error;
  }
}

/**
 * Update task status
 * @param {string} taskId - Task ID
 * @param {string} status - New status
 * @param {Object} options - Optional: { createProductionLog: true, deductInventory: true }
 * @returns {Promise<Object>} Result with inventoryResults if deduction occurred
 */
export async function updateTaskStatus(taskId, status, options = {}) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const taskRef = doc(db, 'users', user.uid, TASKS_COLLECTION, taskId);
    const updates = {
      status,
      updatedAt: serverTimestamp()
    };

    // Track timing
    if (status === TASK_STATUS.IN_PROGRESS) {
      updates.startedAt = serverTimestamp();
    } else if (status === TASK_STATUS.COMPLETED) {
      updates.completedAt = serverTimestamp();
    }

    await updateDoc(taskRef, updates);
    console.log('Task status updated:', taskId, status);

    let inventoryResults = null;

    // When task completes, handle inventory deduction and production
    // ALL operations must succeed - no silent failures
    if (status === TASK_STATUS.COMPLETED) {
      const task = await getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found after status update`);
      }

      if (task.recipeId) {
        // Lazy import to avoid circular dependency
        const {
          productionLogDB,
          kitchenSettingsDB,
          recipeDB,
          inventoryItemDB,
          vendorDB
        } = await import('../database/indexedDB.js');
        const { deductStockFromTask } = await import('../inventory/stockService.js');
        const config = await kitchenSettingsDB.getRestrictionConfig();

        const recipe = await recipeDB.getById(task.recipeId);
        if (!recipe) {
          throw new Error(`Recipe ${task.recipeId} not found for task ${taskId}`);
        }

        // ========================================
        // 1. Deduct ingredients from inventory
        // ========================================
        if (recipe.ingredients && options.deductInventory !== false) {
          inventoryResults = await deductIngredientsFromTask(
            recipe,
            task,
            deductStockFromTask,
            inventoryItemDB,
            user.uid
          );
          console.log('📦 Inventory deduction results:', inventoryResults);
        }

        // ========================================
        // 2. Add produced item(s) to inventory (MANDATORY)
        // Every completed task creates/updates inventory items
        // ========================================
        const productionSteps = getProductionSteps(recipe.method);

        if (productionSteps.length > 0) {
          // Multi-output production from method steps with producesItem: true
          const productionResults = await addProducedItemsFromMethodSteps(
            recipe,
            task,
            productionSteps,
            inventoryItemDB,
            vendorDB,
            inventoryResults, // Pass ingredient deduction results for cost calculation
            user.uid
          );
          if (productionResults) {
            console.log('🍳 Produced items added to inventory:', productionResults);
            inventoryResults = inventoryResults || {};
            inventoryResults.producedItems = productionResults.items;
            inventoryResults.packagingDeducted = productionResults.packagingDeducted;

            // Track sync warnings
            for (const item of productionResults.items || []) {
              if (item.syncError) {
                inventoryResults.syncWarnings = inventoryResults.syncWarnings || [];
                inventoryResults.syncWarnings.push({
                  type: 'production',
                  itemName: item.itemName,
                  error: item.syncError
                });
              }
            }
          }
        }

        // ALWAYS create/update main recipe inventory item (mandatory for all tasks)
        // This works like invoice processing - adds to existing item if same name exists
        const productionResult = await addProducedItemToInventory(
          recipe,
          task,
          inventoryItemDB,
          vendorDB,
          user.uid
        );
        if (productionResult) {
          console.log('🍳 Recipe inventory item created/updated:', productionResult);
          inventoryResults = inventoryResults || {};
          inventoryResults.producedItem = productionResult;

          // Track sync warnings
          if (productionResult.syncError) {
            inventoryResults.syncWarnings = inventoryResults.syncWarnings || [];
            inventoryResults.syncWarnings.push({
              type: 'production',
              itemName: productionResult.itemName,
              error: productionResult.syncError
            });
          }
        }

        // ========================================
        // 3. Create production log (if enabled)
        // ========================================
        if (options.createProductionLog !== false && config.trackProduction) {
          const log = await productionLogDB.createFromTask(task);
          console.log('✅ Production log created:', log.id);
        }
      }
    }

    // Determine overall sync status
    const hasSyncWarnings = inventoryResults?.syncWarnings?.length > 0;
    const allSynced = !hasSyncWarnings && (inventoryResults?.producedItem?.synced !== false);

    return {
      success: true,
      inventoryResults,
      syncStatus: {
        allSynced,
        warnings: inventoryResults?.syncWarnings || [],
        message: hasSyncWarnings
          ? 'Task completed. Some items saved locally but sync pending.'
          : 'Task completed and synced successfully.'
      }
    };
  } catch (error) {
    console.error('Error updating task status:', error);
    throw error;
  }
}

/**
 * Deduct ingredients from inventory when a task is completed
 * @param {Object} recipe - Recipe with ingredients array
 * @param {Object} task - Task with scaleFactor
 * @param {Function} deductStockFromTask - Stock deduction function
 * @param {Object} inventoryItemDB - Inventory item database for unit lookup
 * @param {string} userId - User ID for audit trail
 * @returns {Promise<Object>} Deduction results
 */
async function deductIngredientsFromTask(recipe, task, deductStockFromTask, inventoryItemDB, userId) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
    alerts: []
  };

  const scaleFactor = task.scaleFactor || 1;
  console.log('📦 deductIngredientsFromTask: Starting deduction for recipe:', recipe.name);
  console.log('📦 Ingredients count:', recipe.ingredients?.length || 0, 'scaleFactor:', scaleFactor);

  for (const ingredient of recipe.ingredients) {
    console.log('📦 Processing ingredient:', ingredient.name, 'linkedId:', ingredient.linkedIngredientId, 'metric:', ingredient.metric);

    // Skip section headers
    if (ingredient.isSection) {
      console.log('📦 Skipping section header:', ingredient.name);
      continue;
    }

    // Skip unlinked ingredients
    if (!ingredient.linkedIngredientId) {
      console.log('⚠️ Skipping unlinked ingredient:', ingredient.name);
      results.skipped.push({
        name: ingredient.name,
        reason: 'Not linked to inventory'
      });
      continue;
    }

    // Parse metric from string (e.g., "300g", "1.5kg", "500ml")
    // Ingredients store metric as a combined string, not separate qty/unit fields
    const metricString = ingredient.metric || ingredient.metricQty || '';
    const metricMatch = String(metricString).match(/^([\d.,]+)\s*(g|kg|ml|l|ea)?$/i);
    console.log('📦 Parsing metric:', metricString, 'match:', metricMatch);

    if (!metricMatch) {
      results.skipped.push({
        name: ingredient.name,
        reason: 'No metric quantity specified'
      });
      continue;
    }

    let baseQty = parseFloat(metricMatch[1].replace(',', '.')) || 0;
    let ingredientUnit = (metricMatch[2] || ingredient.metricUnit || 'g').toLowerCase();

    // Convert kg/L to base units (g/ml) for consistent deduction
    if (ingredientUnit === 'kg') {
      baseQty *= 1000;
      ingredientUnit = 'g';
    }
    if (ingredientUnit === 'l') {
      baseQty *= 1000;
      ingredientUnit = 'ml';
    }

    if (baseQty <= 0) {
      results.skipped.push({
        name: ingredient.name,
        reason: 'Metric quantity is zero'
      });
      continue;
    }

    const scaledQty = baseQty * scaleFactor;

    try {
      // Get the inventory item to check its unit
      console.log('📦 Looking up inventory item id:', ingredient.linkedIngredientId);
      const inventoryItem = await inventoryItemDB.getById(ingredient.linkedIngredientId);
      if (!inventoryItem) {
        console.error('❌ Inventory item NOT FOUND for id:', ingredient.linkedIngredientId);
        results.failed.push({
          itemId: ingredient.linkedIngredientId,
          name: ingredient.linkedName || ingredient.name,
          quantity: scaledQty,
          error: 'Inventory item not found'
        });
        continue;
      }
      console.log('📦 Found inventory item:', inventoryItem.name, 'unit:', inventoryItem.unit, 'currentStock:', inventoryItem.currentStock);

      const itemUnit = inventoryItem.unit || 'ea';
      let deductQty = scaledQty;
      console.log('📦 Unit check: ingredient uses', ingredientUnit, ', inventory item uses', itemUnit);

      // Check if inventory item is weight-based (has pricePerG from invoice import)
      // These items have currentStock already stored in grams
      const isWeightBasedItem = inventoryItem.pricePerG > 0 ||
                                 inventoryItem.unitType === 'weight' ||
                                 (itemUnit && /\d+\s*(lb|lbs|kg|g|oz)/i.test(itemUnit));

      if (isWeightBasedItem && (ingredientUnit === 'g' || ingredientUnit === 'ml')) {
        // Weight-based item: currentStock is already in grams, deduct directly
        console.log('📦 Weight-based item detected (pricePerG:', inventoryItem.pricePerG, ') - deducting', scaledQty, 'g directly');
        // No conversion needed, scaledQty is already in grams
      } else if (ingredientUnit !== itemUnit) {
        // Handle unit conversion if units differ
        console.log('📦 Units differ, checking compatibility...');
        // Check if units are compatible for conversion
        if (!areUnitsCompatible(ingredientUnit, itemUnit)) {
          console.error('❌ Units NOT compatible:', ingredientUnit, '→', itemUnit);
          results.failed.push({
            itemId: ingredient.linkedIngredientId,
            name: ingredient.linkedName || ingredient.name,
            quantity: scaledQty,
            error: `Cannot convert ${ingredientUnit} to ${itemUnit}`
          });
          continue;
        }

        // Convert the quantity
        const converted = convertUnits(scaledQty, ingredientUnit, itemUnit);
        if (converted === null) {
          console.error('❌ Unit conversion FAILED:', scaledQty, ingredientUnit, '→', itemUnit);
          results.failed.push({
            itemId: ingredient.linkedIngredientId,
            name: ingredient.linkedName || ingredient.name,
            quantity: scaledQty,
            error: `Unit conversion failed: ${ingredientUnit} to ${itemUnit}`
          });
          continue;
        }
        deductQty = converted;
        console.log(`📐 Unit conversion: ${scaledQty} ${ingredientUnit} → ${deductQty} ${itemUnit}`);
      }

      console.log('📦 Attempting to deduct:', deductQty, itemUnit, 'from', inventoryItem.name, '(current stock:', inventoryItem.currentStock, ')');
      const result = await deductStockFromTask(
        ingredient.linkedIngredientId,
        deductQty,
        task.id,
        {
          recipeId: recipe.id,
          recipeName: recipe.name,
          createdBy: userId,
          allowNegative: false // Will throw if insufficient stock
        }
      );

      console.log('✅ Successfully deducted:', deductQty, itemUnit, 'from', result.itemName, '| New stock:', result.newStock);
      results.success.push({
        itemId: ingredient.linkedIngredientId,
        itemName: result.itemName,
        quantity: deductQty,
        originalQuantity: scaledQty,
        originalUnit: ingredientUnit,
        convertedUnit: itemUnit,
        previousStock: result.previousStock,
        newStock: result.newStock
      });

      if (result.alert) {
        results.alerts.push(result.alertMessage);
      }
    } catch (error) {
      console.error('❌ Deduction failed for', ingredient.name, ':', error.message);
      results.failed.push({
        itemId: ingredient.linkedIngredientId,
        name: ingredient.linkedName || ingredient.name,
        quantity: scaledQty,
        error: error.message
      });
    }
  }

  console.log('📦 Deduction summary:', {
    success: results.success.length,
    failed: results.failed.length,
    skipped: results.skipped.length
  });
  return results;
}

/**
 * Add produced item to inventory when a task is completed
 * @param {Object} recipe - Recipe with availableForSale/availableAsIngredient
 * @param {Object} task - Task with portions and scaleFactor
 * @param {Object} inventoryItemDB - Inventory item database
 * @param {Object} vendorDB - Vendor database
 * @param {string} userId - User ID for audit trail
 * @returns {Promise<Object|null>} Created/updated inventory item with sync status
 */
async function addProducedItemToInventory(recipe, task, inventoryItemDB, vendorDB, userId) {
  console.log('🍳 addProducedItemToInventory: Starting for recipe:', recipe.name);

  // Get or create internal vendor for in-house production
  let internalVendor = await vendorDB.getInternal();
  console.log('🍳 Internal vendor lookup result:', internalVendor ? `id=${internalVendor.id}, name=${internalVendor.name}` : 'NOT FOUND');

  if (!internalVendor) {
    // Auto-create internal vendor if missing
    console.log('📦 Creating internal vendor for in-house production...');
    const vendorId = await vendorDB.create({
      name: 'In-House Production',
      vendorCode: 'INTERNAL',
      isInternal: true,
      isActive: true,
      notes: 'Auto-created for in-house production tracking',
    });
    internalVendor = await vendorDB.getById(vendorId);
    console.log('✅ Internal vendor created:', internalVendor.name, 'id:', internalVendor.id);
  }

  // Calculate produced quantity based on portions and scale
  const portions = task.portions || recipe.portions || 1;
  const scaleFactor = task.scaleFactor || 1;
  const producedQuantity = portions * scaleFactor;
  console.log('🍳 Producing:', producedQuantity, 'portions (portions:', portions, '× scale:', scaleFactor, ')');

  // Check if this recipe already has an inventory item
  // Use recipe name directly - items flow naturally in/out of inventory
  const itemName = recipe.name;

  // Use getByVendorAndName for precise lookup (search with limit:1 might miss internal vendor's item)
  const existingItem = await inventoryItemDB.getByVendorAndName(internalVendor.id, itemName);
  console.log('🔍 Looking for existing production item:', itemName, 'vendorId:', internalVendor.id, 'found:', !!existingItem);

  if (existingItem) {
    // Add to existing stock - use sync-aware method
    const newStock = (existingItem.currentStock || 0) + producedQuantity;
    console.log('🍳 Updating existing item:', existingItem.name, 'id:', existingItem.id, 'adding:', producedQuantity, 'newStock:', newStock);

    // Try with sync, but don't require it (task can complete, sync will retry)
    let synced = false;
    let syncError = null;

    if (inventoryItemDB.updateWithSync) {
      const result = await inventoryItemDB.updateWithSync(existingItem.id, {
        currentStock: newStock,
        fullStock: newStock,
        lastProductionDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { requireSync: false });
      synced = result.synced;
      syncError = result.syncError;
    } else {
      // Fallback to regular update
      await inventoryItemDB.update(existingItem.id, {
        currentStock: newStock,
        fullStock: newStock,
        lastProductionDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    if (syncError) {
      console.warn(`⚠️ Production sync warning: ${syncError}`);
    }

    console.log('✅ Production item updated:', existingItem.name, 'newStock:', newStock);
    return {
      action: 'updated',
      itemId: existingItem.id,
      itemName: existingItem.name,
      addedQuantity: producedQuantity,
      newStock,
      unit: existingItem.unit || recipe.portionUnit || 'portion',
      synced,
      syncError
    };
  } else {
    console.log('🍳 Creating new production item:', itemName);
    // Create new inventory item for this recipe
    const itemData = {
      name: itemName,
      vendorId: internalVendor.id,
      vendorName: internalVendor.name,
      category: recipe.category || 'Prepared Items',
      unit: recipe.portionUnit || 'portion',
      currentStock: producedQuantity,
      fullStock: producedQuantity,
      parLevel: producedQuantity,
      currentPrice: recipe.portionCost || 0,
      isActive: true,
      availableForSale: recipe.availableForSale || false,
      availableAsIngredient: recipe.availableAsIngredient || false,
      sourceRecipeId: recipe.id,
      sourceRecipeName: recipe.name,
      sourceDepartment: recipe.department || null,
      lastProductionDate: new Date().toISOString(),
      notes: `Auto-created from recipe: ${recipe.name}`,
      createdBy: userId
    };

    let newItemId;
    let synced = false;
    let syncError = null;

    // Try with sync confirmation
    if (inventoryItemDB.createWithSync) {
      const result = await inventoryItemDB.createWithSync(itemData, { requireSync: false });
      newItemId = result.id;
      synced = result.synced;
      syncError = result.syncError;
    } else {
      // Fallback to regular create
      newItemId = await inventoryItemDB.create(itemData);
    }

    if (syncError) {
      console.warn(`⚠️ Production sync warning: ${syncError}`);
    }

    console.log('✅ Production item created:', itemName, 'id:', newItemId, 'stock:', producedQuantity);
    return {
      action: 'created',
      itemId: newItemId,
      itemName,
      addedQuantity: producedQuantity,
      newStock: producedQuantity,
      unit: recipe.portionUnit || 'portion',
      synced,
      syncError
    };
  }
}

/**
 * Get production steps from recipe method array
 * @param {Array} method - Recipe method array (strings or objects)
 * @returns {Array} Steps that produce inventory items
 */
function getProductionSteps(method) {
  if (!Array.isArray(method)) return [];

  return method
    .map((step, index) => {
      // Handle both string and object format
      if (typeof step === 'string') {
        return null; // String steps don't produce items
      }
      if (step && step.producesItem) {
        return { ...step, stepIndex: index };
      }
      return null;
    })
    .filter(step => step !== null);
}

/**
 * Add multiple produced items from method steps
 * @param {Object} recipe - Recipe with method steps
 * @param {Object} task - Task with scaleFactor and completion data
 * @param {Array} productionSteps - Steps that produce items (from getProductionSteps)
 * @param {Object} inventoryItemDB - Inventory item database
 * @param {Object} vendorDB - Vendor database
 * @param {Object} ingredientResults - Results from ingredient deduction (for cost calculation)
 * @param {string} userId - User ID for audit trail
 * @returns {Promise<Object>} Results with items array and packaging deductions
 */
async function addProducedItemsFromMethodSteps(
  recipe,
  task,
  productionSteps,
  inventoryItemDB,
  vendorDB,
  ingredientResults,
  userId
) {
  // Get or create internal vendor for in-house production
  let internalVendor = await vendorDB.getInternal();
  if (!internalVendor) {
    // Auto-create internal vendor if missing
    console.log('📦 Creating internal vendor for in-house production...');
    const vendorId = await vendorDB.create({
      name: 'In-House Production',
      vendorCode: 'INTERNAL',
      isInternal: true,
      isActive: true,
      notes: 'Auto-created for in-house production tracking',
    });
    internalVendor = await vendorDB.getById(vendorId);
    console.log('✅ Internal vendor created:', internalVendor.name);
  }

  const scaleFactor = task.scaleFactor || 1;
  const results = {
    items: [],
    packagingDeducted: [],
    totalYield: 0,
    totalWaste: 0
  };

  // Calculate total input cost from deducted ingredients
  let totalInputCost = 0;
  if (ingredientResults?.success) {
    for (const deduction of ingredientResults.success) {
      totalInputCost += deduction.cost || 0;
    }
  }

  // Calculate total output weight (for proportional cost distribution)
  let totalOutputWeight = 0;
  for (const step of productionSteps) {
    const weight = (step.actualWeight || step.expectedWeight || 0) * scaleFactor;
    totalOutputWeight += weight;
  }

  // Process each production step
  for (const step of productionSteps) {
    const outputName = step.outputName || `${recipe.name} - Step ${step.stepIndex + 1}`;
    const actualWeight = (step.actualWeight || step.expectedWeight || 0) * scaleFactor;
    const wasteWeight = (step.wasteWeight || 0) * scaleFactor;

    // Calculate proportional cost
    let itemCost = 0;
    let pricePerG = 0;
    if (totalInputCost > 0 && totalOutputWeight > 0 && actualWeight > 0) {
      itemCost = totalInputCost * (actualWeight / totalOutputWeight);
      // Convert actualWeight from kg to grams for pricePerG calculation
      const weightInGrams = actualWeight * 1000;
      pricePerG = itemCost / weightInGrams;
    }

    // Use precise lookup for existing item (search might miss due to name ordering)
    const existingItem = await inventoryItemDB.getByVendorAndName(internalVendor.id, outputName);
    console.log('🔍 Looking for production step item:', outputName, 'vendorId:', internalVendor.id, 'found:', !!existingItem);

    let itemResult;

    if (existingItem) {
      // Update existing item - add to stock
      const newStockWeight = (existingItem.stockWeight || 0) + actualWeight;

      let synced = false;
      let syncError = null;

      if (inventoryItemDB.updateWithSync) {
        const result = await inventoryItemDB.updateWithSync(existingItem.id, {
          stockWeight: newStockWeight,
          pricePerG: pricePerG || existingItem.pricePerG,
          lastProductionDate: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { requireSync: false });
        synced = result.synced;
        syncError = result.syncError;
      } else {
        await inventoryItemDB.update(existingItem.id, {
          stockWeight: newStockWeight,
          pricePerG: pricePerG || existingItem.pricePerG,
          lastProductionDate: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      itemResult = {
        action: 'updated',
        itemId: existingItem.id,
        itemName: outputName,
        addedWeight: actualWeight,
        newStockWeight,
        unit: 'kg',
        pricePerG,
        itemCost,
        synced,
        syncError
      };
    } else {
      // Create new inventory item
      const itemData = {
        name: outputName,
        vendorId: internalVendor.id,
        vendorName: internalVendor.name,
        category: recipe.category || 'In-House Production',
        unit: 'kg',
        stockWeight: actualWeight,
        stockWeightUnit: 'kg', // Match the unit field
        pricePerG: pricePerG,
        isActive: true,
        availableAsIngredient: true,
        sourceRecipeId: recipe.id,
        sourceRecipeName: recipe.name,
        sourceDepartment: recipe.department || null,
        sourceStepIndex: step.stepIndex,
        lastProductionDate: new Date().toISOString(),
        notes: step.text || `Produced from: ${recipe.name}`,
        createdBy: userId
      };

      let newItemId;
      let synced = false;
      let syncError = null;

      if (inventoryItemDB.createWithSync) {
        const result = await inventoryItemDB.createWithSync(itemData, { requireSync: false });
        newItemId = result.id;
        synced = result.synced;
        syncError = result.syncError;
      } else {
        newItemId = await inventoryItemDB.create(itemData);
      }

      itemResult = {
        action: 'created',
        itemId: newItemId,
        itemName: outputName,
        addedWeight: actualWeight,
        newStockWeight: actualWeight,
        unit: 'kg',
        pricePerG,
        itemCost,
        synced,
        syncError
      };
    }

    results.items.push(itemResult);
    results.totalYield += actualWeight;
    results.totalWaste += wasteWeight;

    // Deduct packaging items if specified (supports multiple packaging items per step)
    const packagingItems = step.packagingItems || (step.packaging ? [step.packaging] : []);
    let totalPackagingCost = 0;

    for (const packaging of packagingItems) {
      if (!packaging?.itemId) continue;

      try {
        const packagingItem = await inventoryItemDB.getById(packaging.itemId);
        if (packagingItem) {
          const packagingQty = (packaging.quantity || 1) * scaleFactor;
          const newStock = Math.max(0, (packagingItem.currentStock || 0) - packagingQty);

          await inventoryItemDB.update(packaging.itemId, {
            currentStock: newStock,
            updatedAt: new Date().toISOString()
          });

          // Calculate packaging cost
          const packagingCost = (packagingItem.currentPrice || 0) * packagingQty;
          totalPackagingCost += packagingCost;

          results.packagingDeducted.push({
            itemId: packaging.itemId,
            itemName: packagingItem.name,
            quantity: packagingQty,
            cost: packagingCost,
            forOutput: outputName
          });
        }
      } catch (packagingError) {
        console.warn(`[tasksService] Failed to deduct packaging ${packaging.itemName || packaging.itemId} for ${outputName}:`, packagingError);
      }
    }

    // Add total packaging cost to item's pricePerG
    if (totalPackagingCost > 0 && itemResult.pricePerG > 0) {
      const weightInGrams = actualWeight * 1000;
      const additionalPricePerG = totalPackagingCost / weightInGrams;
      itemResult.pricePerG += additionalPricePerG;

      // Update the item with new pricePerG including all packaging costs
      await inventoryItemDB.update(itemResult.itemId, {
        pricePerG: itemResult.pricePerG
      });
    }
  }

  return results;
}

/**
 * Update task
 * @param {string} taskId - Task ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateTask(taskId, updates) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const taskRef = doc(db, 'users', user.uid, TASKS_COLLECTION, taskId);
    await updateDoc(taskRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('Task updated:', taskId);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

/**
 * Add a message to task
 * @param {string} taskId - Task ID
 * @param {Object} message - Message object { from, text, timestamp }
 * @returns {Promise<void>}
 */
export async function addTaskMessage(taskId, message) {
  try {
    const task = await getTask(taskId);
    if (!task) throw new Error('Task not found');

    const messages = task.messages || [];
    messages.push({
      ...message,
      timestamp: new Date().toISOString()
    });

    await updateTask(taskId, { messages });
    console.log('Message added to task:', taskId);
  } catch (error) {
    console.error('Error adding message:', error);
    throw error;
  }
}

/**
 * Delete a task
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function deleteTask(taskId) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const taskRef = doc(db, 'users', user.uid, TASKS_COLLECTION, taskId);
    await deleteDoc(taskRef);
    console.log('Task deleted:', taskId);
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

/**
 * Subscribe to tasks updates (real-time)
 * @param {Function} callback - Callback function (tasks) => void
 * @param {Object} options - Filter options
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTasks(callback, options = {}) {
  try {
    const tasksRef = getTasksCollection();
    let q = query(tasksRef, orderBy('createdAt', 'desc'));

    if (options.status) {
      q = query(tasksRef, where('status', '==', options.status), orderBy('createdAt', 'desc'));
    }

    console.log('📡 subscribeToTasks: Setting up listener');

    return onSnapshot(q, (snapshot) => {
      console.log('📥 subscribeToTasks: Snapshot received, docs:', snapshot.docs.length);
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dueDate: doc.data().dueDate?.toDate() || null,
        createdAt: doc.data().createdAt?.toDate() || null,
        updatedAt: doc.data().updatedAt?.toDate() || null,
        startedAt: doc.data().startedAt?.toDate() || null,
        completedAt: doc.data().completedAt?.toDate() || null
      }));
      callback(tasks);
    }, (error) => {
      console.error('Tasks subscription error:', error);
    });
  } catch (error) {
    console.error('Error subscribing to tasks:', error);
    throw error;
  }
}

/**
 * Get active tasks count
 * @returns {Promise<number>}
 */
export async function getActiveTasksCount() {
  try {
    const tasks = await getAllTasks();
    return tasks.filter(t =>
      t.status === TASK_STATUS.PENDING ||
      t.status === TASK_STATUS.IN_PROGRESS
    ).length;
  } catch (error) {
    console.error('Error getting active tasks count:', error);
    return 0;
  }
}

/**
 * Get today's tasks
 * @param {string} department - Optional department filter
 * @returns {Promise<Array>}
 */
export async function getTodaysTasks(department = null) {
  try {
    const allTasks = await getAllTasks();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return allTasks.filter(task => {
      // Filter by department if provided
      if (department && task.department !== department) return false;

      // Include tasks due today or created today
      const isDueToday = task.dueDate && task.dueDate >= today && task.dueDate < tomorrow;
      const isCreatedToday = task.createdAt && task.createdAt >= today && task.createdAt < tomorrow;

      // Include active tasks (pending/in_progress) even if not due today
      const isActive = task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.IN_PROGRESS;

      return isDueToday || isCreatedToday || isActive;
    });
  } catch (error) {
    console.error('Error getting today\'s tasks:', error);
    return [];
  }
}

/**
 * Subscribe to department tasks (real-time)
 * @param {string} department - Department name
 * @param {Function} callback - Callback function (tasks) => void
 * @returns {Function} Unsubscribe function
 */
export function subscribeToDepartmentTasks(department, callback) {
  try {
    const tasksRef = getTasksCollection();
    const q = query(tasksRef, orderBy('createdAt', 'desc'));

    console.log('📡 Subscribing to tasks, department filter:', department);

    return onSnapshot(q, (snapshot) => {
      console.log('📥 Snapshot received, docs count:', snapshot.docs.length);

      const allTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dueDate: doc.data().dueDate?.toDate() || null,
        createdAt: doc.data().createdAt?.toDate() || null,
        updatedAt: doc.data().updatedAt?.toDate() || null,
        startedAt: doc.data().startedAt?.toDate() || null,
        completedAt: doc.data().completedAt?.toDate() || null
      }));

      console.log('📋 All tasks:', allTasks.map(t => ({ id: t.id, name: t.recipeName, dept: t.department })));

      // Show all tasks - department filter disabled for now
      const tasks = allTasks;
      console.log('✅ Filtered tasks count:', tasks.length);

      callback(tasks);
    }, (error) => {
      console.error('Department tasks subscription error:', error);
    });
  } catch (error) {
    console.error('Error subscribing to department tasks:', error);
    throw error;
  }
}

/**
 * Get task progress stats for a department
 * @param {Array} tasks - Array of tasks
 * @returns {Object} Progress stats
 */
export function getTaskProgress(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
  const inProgress = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
  const pending = tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
  const paused = tasks.filter(t => t.status === TASK_STATUS.PAUSED).length;

  return {
    total,
    completed,
    inProgress,
    pending,
    paused,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

/**
 * Claim a task (assign to current user)
 * @param {string} taskId - Task ID
 * @param {string} privilegeId - Privilege ID of the user claiming
 * @param {string} privilegeName - Name of the user claiming
 * @returns {Promise<void>}
 */
export async function claimTask(taskId, privilegeId, privilegeName) {
  try {
    await updateTask(taskId, {
      assignedTo: privilegeId,
      assignedToName: privilegeName,
      status: TASK_STATUS.IN_PROGRESS,
      startedAt: serverTimestamp()
    });
    console.log('Task claimed:', taskId, 'by', privilegeName);
  } catch (error) {
    console.error('Error claiming task:', error);
    throw error;
  }
}

/**
 * Release a task (unassign from current user)
 * @param {string} taskId - Task ID
 * @returns {Promise<void>}
 */
export async function releaseTask(taskId) {
  try {
    await updateTask(taskId, {
      assignedTo: null,
      assignedToName: 'Team',
      status: TASK_STATUS.PENDING,
      startedAt: null
    });
    console.log('Task released:', taskId);
  } catch (error) {
    console.error('Error releasing task:', error);
    throw error;
  }
}
