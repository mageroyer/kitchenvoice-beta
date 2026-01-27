/**
 * Task Dependency Service
 *
 * Detects in-house ingredient dependencies when creating tasks.
 * Checks if required in-house items are available in inventory.
 * Returns shortfall information for prerequisite task creation.
 *
 * Phase 1: Detection only
 * - checkRecipeDependencies() - scan recipe for in-house ingredient shortfalls
 * - calculateRequiredQuantity() - calculate scaled quantity needed
 * - getAvailableStock() - get current stock for an item
 */

import { recipeDB, inventoryItemDB } from '../database/indexedDB.js';
import { createTask, updateTask } from './tasksService.js';

// ============================================
// Unit Conversion Constants
// ============================================

const WEIGHT_TO_GRAMS = {
  g: 1,
  kg: 1000,
  lb: 453.592,
  lbs: 453.592,
  oz: 28.3495,
};

const VOLUME_TO_ML = {
  ml: 1,
  l: 1000,
  L: 1000,
  cl: 10,
  dl: 100,
};

// ============================================
// Unit Detection
// ============================================

/**
 * Detect if a unit is volume-based
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
function isVolumeUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  return ['ml', 'l', 'cl', 'dl', 'liter', 'litre'].includes(normalized);
}

/**
 * Detect if a unit is weight-based
 * @param {string} unit - Unit string
 * @returns {boolean}
 */
function isWeightUnit(unit) {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  return ['g', 'kg', 'lb', 'lbs', 'oz', 'gram', 'grams', 'kilogram'].includes(normalized);
}

// ============================================
// Quantity Parsing
// ============================================

/**
 * Parse metric string into quantity and unit
 * Handles formats: "500g", "2.5 kg", "1L", "500 ml"
 *
 * @param {string} metricString - Metric string like "500g" or "2.5 kg"
 * @returns {Object} { quantity: number, unit: string } or null
 */
function parseMetricString(metricString) {
  if (!metricString) return null;

  const str = String(metricString).trim();
  // Match number (with optional decimals) followed by optional unit
  const match = str.match(/^([\d.,]+)\s*(g|kg|lb|lbs|oz|ml|l|L|cl|dl|ea|pc|portion|portions)?$/i);

  if (!match) return null;

  const quantity = parseFloat(match[1].replace(',', '.'));
  const unit = match[2] || 'ea';

  if (isNaN(quantity)) return null;

  return { quantity, unit: unit.toLowerCase() };
}

/**
 * Convert quantity to base unit (grams or ml)
 *
 * @param {number} quantity - Quantity value
 * @param {string} unit - Unit string
 * @returns {Object} { value: number, baseUnit: string } or null
 */
function convertToBaseUnit(quantity, unit) {
  if (!unit) return { value: quantity, baseUnit: 'ea' };

  const normalized = unit.toLowerCase().trim();

  // Weight conversion to grams
  if (WEIGHT_TO_GRAMS[normalized]) {
    return {
      value: quantity * WEIGHT_TO_GRAMS[normalized],
      baseUnit: 'g',
    };
  }

  // Volume conversion to ml
  if (VOLUME_TO_ML[normalized]) {
    return {
      value: quantity * VOLUME_TO_ML[normalized],
      baseUnit: 'ml',
    };
  }

  // Unit-based (ea, pc, portion)
  return { value: quantity, baseUnit: 'ea' };
}

/**
 * Convert from base unit back to display unit
 *
 * @param {number} baseValue - Value in base unit (g or ml)
 * @param {string} baseUnit - Base unit ('g', 'ml', or 'ea')
 * @param {string} targetUnit - Target display unit
 * @returns {number} Converted value
 */
function convertFromBaseUnit(baseValue, baseUnit, targetUnit) {
  if (!targetUnit || baseUnit === 'ea') return baseValue;

  const normalized = targetUnit.toLowerCase().trim();

  if (baseUnit === 'g' && WEIGHT_TO_GRAMS[normalized]) {
    return baseValue / WEIGHT_TO_GRAMS[normalized];
  }

  if (baseUnit === 'ml' && VOLUME_TO_ML[normalized]) {
    return baseValue / VOLUME_TO_ML[normalized];
  }

  return baseValue;
}

// ============================================
// Stock Calculation
// ============================================

/**
 * Get available stock for an inventory item in base units
 *
 * @param {Object} item - Inventory item
 * @returns {Object} { value: number, baseUnit: string, displayValue: number, displayUnit: string }
 */
function getAvailableStock(item) {
  if (!item) return { value: 0, baseUnit: 'ea', displayValue: 0, displayUnit: 'ea' };

  // Volume-based items (pricePerML or pricingType='volume')
  if (item.pricePerML > 0 || item.pricingType === 'volume' || item.isLiquid) {
    const stockValue = item.stockWeight || 0;
    const stockUnit = item.stockWeightUnit || 'L';
    const converted = convertToBaseUnit(stockValue, stockUnit);
    return {
      value: converted.value,
      baseUnit: 'ml',
      displayValue: stockValue,
      displayUnit: stockUnit,
    };
  }

  // Weight-based items (pricePerG or pricingType='weight')
  if (item.pricePerG > 0 || item.pricingType === 'weight') {
    const stockValue = item.stockWeight || 0;
    const stockUnit = item.stockWeightUnit || 'kg';
    const converted = convertToBaseUnit(stockValue, stockUnit);
    return {
      value: converted.value,
      baseUnit: 'g',
      displayValue: stockValue,
      displayUnit: stockUnit,
    };
  }

  // Unit-based items
  const stockValue = item.stockQuantity || item.currentStock || 0;
  const stockUnit = item.stockQuantityUnit || 'ea';
  return {
    value: stockValue,
    baseUnit: 'ea',
    displayValue: stockValue,
    displayUnit: stockUnit,
  };
}

/**
 * Calculate required quantity for an ingredient scaled by portions
 *
 * @param {Object} ingredient - Recipe ingredient
 * @param {number} basePortions - Recipe base portions
 * @param {number} targetPortions - Task target portions
 * @returns {Object} { value: number, baseUnit: string, displayValue: number, displayUnit: string }
 */
function calculateRequiredQuantity(ingredient, basePortions, targetPortions) {
  const scaleFactor = targetPortions / (basePortions || 1);

  // Try to parse from metric string first
  let parsed = parseMetricString(ingredient.metric);

  // Fallback to metricQty + metricUnit
  if (!parsed && ingredient.metricQty) {
    parsed = {
      quantity: parseFloat(ingredient.metricQty) || 0,
      unit: ingredient.metricUnit || 'ea',
    };
  }

  if (!parsed) {
    return { value: 0, baseUnit: 'ea', displayValue: 0, displayUnit: 'ea' };
  }

  const scaledQuantity = parsed.quantity * scaleFactor;
  const converted = convertToBaseUnit(scaledQuantity, parsed.unit);

  return {
    value: converted.value,
    baseUnit: converted.baseUnit,
    displayValue: scaledQuantity,
    displayUnit: parsed.unit,
  };
}

// ============================================
// Main Detection Function
// ============================================

/**
 * Check recipe dependencies for in-house items
 *
 * Scans recipe ingredients for items that:
 * 1. Are linked to inventory (linkedIngredientId)
 * 2. Are in-house items (isInternal: true)
 * 3. Have a source recipe (sourceRecipeId)
 * 4. Have insufficient stock
 *
 * @param {number} recipeId - Recipe ID to check
 * @param {number} targetPortions - Target portions for the task
 * @returns {Promise<Object>} Dependency check result
 *
 * @example
 * const result = await checkRecipeDependencies(123, 10);
 * // Returns:
 * // {
 * //   hasDependencies: true,
 * //   hasShortfalls: true,
 * //   dependencies: [...],
 * //   shortfalls: [...],
 * //   summary: { total: 3, sufficient: 1, shortfall: 2 }
 * // }
 */
export async function checkRecipeDependencies(recipeId, targetPortions = 1) {
  const result = {
    recipeId,
    recipeName: '',
    targetPortions,
    hasDependencies: false,
    hasShortfalls: false,
    dependencies: [],
    shortfalls: [],
    summary: {
      totalInHouseIngredients: 0,
      sufficientStock: 0,
      insufficientStock: 0,
    },
  };

  try {
    // Get recipe
    const recipe = await recipeDB.getById(recipeId);
    if (!recipe) {
      console.warn(`[TaskDependency] Recipe ${recipeId} not found`);
      return result;
    }

    result.recipeName = recipe.name;
    const basePortions = recipe.portions || 1;

    // Get ingredients (skip sections)
    const ingredients = (recipe.ingredients || []).filter(ing => !ing.isSection);

    // Check each linked ingredient
    for (const ingredient of ingredients) {
      // Skip unlinked ingredients
      if (!ingredient.linkedIngredientId) continue;

      // Get inventory item
      const item = await inventoryItemDB.getById(ingredient.linkedIngredientId);
      if (!item) continue;

      // Only check in-house items with source recipe
      if (!item.isInternal || !item.sourceRecipeId) continue;

      result.hasDependencies = true;
      result.summary.totalInHouseIngredients++;

      // Calculate required quantity
      const required = calculateRequiredQuantity(ingredient, basePortions, targetPortions);

      // Get available stock
      const available = getAvailableStock(item);

      // Compare (must be same base unit)
      const shortfallBase = required.value - available.value;
      const hasShortfall = shortfallBase > 0.001; // Small tolerance for floating point

      // Build dependency info
      const dependency = {
        ingredientName: ingredient.name || ingredient.linkedName || item.name,
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        sourceRecipeId: item.sourceRecipeId,
        sourceRecipeName: item.sourceRecipeName,
        sourceDepartment: item.sourceDepartment || null,

        // Required
        requiredValue: required.value,
        requiredBaseUnit: required.baseUnit,
        requiredDisplay: `${required.displayValue.toFixed(2)} ${required.displayUnit}`,

        // Available
        availableValue: available.value,
        availableBaseUnit: available.baseUnit,
        availableDisplay: `${available.displayValue.toFixed(2)} ${available.displayUnit}`,

        // Shortfall
        hasShortfall,
        shortfallValue: hasShortfall ? shortfallBase : 0,
        shortfallDisplay: hasShortfall
          ? `${convertFromBaseUnit(shortfallBase, required.baseUnit, required.displayUnit).toFixed(2)} ${required.displayUnit}`
          : '0',

        // For prerequisite task creation
        shortfallForTask: hasShortfall
          ? {
              quantity: convertFromBaseUnit(shortfallBase, required.baseUnit, item.stockWeightUnit || item.stockQuantityUnit || required.displayUnit),
              unit: item.stockWeightUnit || item.stockQuantityUnit || required.displayUnit,
            }
          : null,
      };

      result.dependencies.push(dependency);

      if (hasShortfall) {
        result.hasShortfalls = true;
        result.shortfalls.push(dependency);
        result.summary.insufficientStock++;
      } else {
        result.summary.sufficientStock++;
      }
    }

    return result;
  } catch (error) {
    console.error('[TaskDependency] Error checking dependencies:', error);
    return {
      ...result,
      error: error.message,
    };
  }
}

/**
 * Check dependencies for multiple recipes (batch)
 *
 * @param {Array<{recipeId: number, portions: number}>} recipes - Array of recipe/portion pairs
 * @returns {Promise<Array>} Array of dependency results
 */
export async function checkMultipleRecipeDependencies(recipes) {
  const results = [];

  for (const { recipeId, portions } of recipes) {
    const result = await checkRecipeDependencies(recipeId, portions);
    results.push(result);
  }

  return results;
}

/**
 * Get aggregated shortfalls across multiple tasks
 * Useful when creating multiple tasks that need the same in-house item
 *
 * @param {Array} dependencyResults - Results from checkMultipleRecipeDependencies
 * @returns {Object} Aggregated shortfalls by source recipe
 */
export function aggregateShortfalls(dependencyResults) {
  const aggregated = {};

  for (const result of dependencyResults) {
    for (const shortfall of result.shortfalls || []) {
      const key = shortfall.sourceRecipeId;

      if (!aggregated[key]) {
        aggregated[key] = {
          sourceRecipeId: shortfall.sourceRecipeId,
          sourceRecipeName: shortfall.sourceRecipeName,
          sourceDepartment: shortfall.sourceDepartment,
          inventoryItemId: shortfall.inventoryItemId,
          inventoryItemName: shortfall.inventoryItemName,
          totalShortfall: 0,
          unit: shortfall.shortfallForTask?.unit || 'ea',
          neededBy: [],
        };
      }

      aggregated[key].totalShortfall += shortfall.shortfallForTask?.quantity || 0;
      aggregated[key].neededBy.push({
        recipeId: result.recipeId,
        recipeName: result.recipeName,
        portions: result.targetPortions,
        shortfall: shortfall.shortfallForTask?.quantity || 0,
      });
    }
  }

  return Object.values(aggregated);
}

/**
 * Calculate portions needed to produce a given quantity
 * Used when creating prerequisite tasks
 *
 * @param {number} sourceRecipeId - Source recipe ID
 * @param {number} requiredQuantity - Required quantity
 * @param {string} requiredUnit - Required unit
 * @returns {Promise<Object>} { portions, outputPerPortion, unit }
 */
export async function calculatePortionsForOutput(sourceRecipeId, requiredQuantity, requiredUnit) {
  try {
    const recipe = await recipeDB.getById(sourceRecipeId);
    if (!recipe) {
      return { portions: 1, outputPerPortion: requiredQuantity, unit: requiredUnit };
    }

    const basePortions = recipe.portions || 1;
    const portionUnit = recipe.portionUnit || 'portion';

    // If recipe produces volume/weight, calculate portions needed
    if (isVolumeUnit(portionUnit) || isWeightUnit(portionUnit)) {
      // Recipe output = basePortions in portionUnit
      // e.g., 10L sauce recipe: basePortions=10, portionUnit='L'
      // Need 3L → portions = 3

      // Convert required quantity to recipe's portion unit
      const requiredBase = convertToBaseUnit(requiredQuantity, requiredUnit);
      const recipeBase = convertToBaseUnit(basePortions, portionUnit);

      if (recipeBase.value > 0) {
        const portionsNeeded = Math.ceil((requiredBase.value / recipeBase.value) * basePortions);
        return {
          portions: Math.max(1, portionsNeeded),
          outputPerPortion: basePortions,
          unit: portionUnit,
        };
      }
    }

    // Default: 1:1 mapping
    return {
      portions: Math.ceil(requiredQuantity),
      outputPerPortion: 1,
      unit: portionUnit,
    };
  } catch (error) {
    console.error('[TaskDependency] Error calculating portions:', error);
    return { portions: Math.ceil(requiredQuantity), outputPerPortion: 1, unit: requiredUnit };
  }
}

// ============================================
// Phase 2: Prerequisite Task Creation
// ============================================

/**
 * Create prerequisite tasks for shortfalls
 *
 * For each shortfall, creates a task for the source recipe
 * with the appropriate portions to produce the needed quantity.
 * Links the prerequisite tasks to the main task.
 *
 * @param {Object} options - Creation options
 * @param {string|null} options.mainTaskId - Main task ID to link prerequisites to (null if creating main task after)
 * @param {Array} options.shortfalls - Shortfall items from checkRecipeDependencies
 * @param {string|null} options.assignedTo - User ID to assign tasks to
 * @param {string|null} options.assignedToName - User name
 * @param {string|null} options.department - Department for tasks
 * @param {string|null} options.dueDate - Due date for tasks
 * @param {string|null} options.dueTime - Due time for tasks
 * @param {string} options.priority - Priority level ('low', 'normal', 'high', 'urgent')
 * @returns {Promise<Object>} Result with created task IDs and any errors
 *
 * @example
 * const result = await createPrerequisiteTasks({
 *   mainTaskId: 'task-123',
 *   shortfalls: dependencyResult.shortfalls,
 *   assignedTo: 'user-456',
 *   department: 'Cuisine',
 *   priority: 'high'
 * });
 * // Returns: { success: true, createdTasks: [...], errors: [] }
 */
export async function createPrerequisiteTasks({
  mainTaskId = null,
  shortfalls = [],
  assignedTo = null,
  assignedToName = 'Team',
  department = null,
  dueDate = null,
  dueTime = null,
  priority = 'high', // Prerequisites are usually high priority
}) {
  const result = {
    success: true,
    createdTasks: [],
    prerequisiteTaskIds: [],
    errors: [],
  };

  if (!shortfalls || shortfalls.length === 0) {
    return result;
  }

  // Group shortfalls by source recipe to avoid duplicates
  const groupedByRecipe = {};
  for (const shortfall of shortfalls) {
    const key = shortfall.sourceRecipeId;
    if (!groupedByRecipe[key]) {
      groupedByRecipe[key] = {
        sourceRecipeId: shortfall.sourceRecipeId,
        sourceRecipeName: shortfall.sourceRecipeName,
        sourceDepartment: shortfall.sourceDepartment,
        inventoryItemName: shortfall.inventoryItemName,
        totalShortfall: 0,
        unit: shortfall.shortfallForTask?.unit || 'ea',
        shortfalls: [],
      };
    }
    groupedByRecipe[key].totalShortfall += shortfall.shortfallForTask?.quantity || 0;
    groupedByRecipe[key].shortfalls.push(shortfall);
  }

  // Create task for each unique source recipe
  for (const group of Object.values(groupedByRecipe)) {
    try {
      // Calculate portions needed to produce the shortfall
      const portionCalc = await calculatePortionsForOutput(
        group.sourceRecipeId,
        group.totalShortfall,
        group.unit
      );

      // Get source recipe for additional info
      const sourceRecipe = await recipeDB.getById(group.sourceRecipeId);
      if (!sourceRecipe) {
        result.errors.push({
          sourceRecipeId: group.sourceRecipeId,
          error: `Source recipe not found: ${group.sourceRecipeName}`,
        });
        continue;
      }

      // Create the prerequisite task
      const taskId = await createTask({
        recipeId: group.sourceRecipeId,
        recipeName: group.sourceRecipeName,
        portions: portionCalc.portions,
        portionUnit: sourceRecipe.portionUnit || portionCalc.unit,
        scaleFactor: portionCalc.portions / (sourceRecipe.portions || 1),
        assignedTo,
        assignedToName,
        station: null,
        department: group.sourceDepartment || department,
        dueDate,
        dueTime,
        priority,
        type: 'recipe',
        // Prerequisite tracking
        prerequisiteFor: mainTaskId,
        autoGenerated: true,
        chefNotes: `Auto-created: Need ${group.totalShortfall.toFixed(2)} ${group.unit} of ${group.inventoryItemName}`,
      });

      result.createdTasks.push({
        taskId,
        sourceRecipeId: group.sourceRecipeId,
        sourceRecipeName: group.sourceRecipeName,
        portions: portionCalc.portions,
        portionUnit: sourceRecipe.portionUnit || portionCalc.unit,
        forItem: group.inventoryItemName,
        shortfall: group.totalShortfall,
        unit: group.unit,
      });
      result.prerequisiteTaskIds.push(taskId);

    } catch (error) {
      console.error(`[TaskDependency] Error creating prerequisite task for ${group.sourceRecipeName}:`, error);
      result.errors.push({
        sourceRecipeId: group.sourceRecipeId,
        sourceRecipeName: group.sourceRecipeName,
        error: error.message,
      });
      result.success = false;
    }
  }

  // If we have a main task and created prerequisites, update the main task's dependsOn
  if (mainTaskId && result.prerequisiteTaskIds.length > 0) {
    try {
      await updateTask(mainTaskId, {
        dependsOn: result.prerequisiteTaskIds,
        hasDependencies: true,
      });
    } catch (error) {
      console.error('[TaskDependency] Error updating main task dependencies:', error);
      result.errors.push({
        mainTaskId,
        error: `Failed to link prerequisites to main task: ${error.message}`,
      });
    }
  }

  return result;
}

/**
 * Create a main task with its prerequisites in one operation
 *
 * 1. Checks dependencies for the recipe
 * 2. Creates prerequisite tasks for any shortfalls
 * 3. Creates the main task with dependsOn links
 *
 * @param {Object} mainTaskData - Main task creation data
 * @param {Object} options - Options for prerequisite creation
 * @returns {Promise<Object>} Result with main task ID and prerequisites
 */
export async function createTaskWithPrerequisites(mainTaskData, options = {}) {
  const {
    createPrerequisites = true,
    prerequisitePriority = 'high',
  } = options;

  const result = {
    mainTaskId: null,
    mainTaskCreated: false,
    prerequisitesChecked: false,
    prerequisitesCreated: false,
    prerequisites: [],
    dependencyResult: null,
    errors: [],
  };

  try {
    // Step 1: Check dependencies
    if (mainTaskData.recipeId) {
      result.dependencyResult = await checkRecipeDependencies(
        mainTaskData.recipeId,
        mainTaskData.portions || 1
      );
      result.prerequisitesChecked = true;

      // Step 2: Create prerequisites if needed and requested
      if (createPrerequisites && result.dependencyResult.hasShortfalls) {
        const prereqResult = await createPrerequisiteTasks({
          mainTaskId: null, // We'll link after creating main task
          shortfalls: result.dependencyResult.shortfalls,
          assignedTo: mainTaskData.assignedTo,
          assignedToName: mainTaskData.assignedToName,
          department: mainTaskData.department,
          dueDate: mainTaskData.dueDate,
          dueTime: mainTaskData.dueTime,
          priority: prerequisitePriority,
        });

        result.prerequisites = prereqResult.createdTasks;
        result.prerequisitesCreated = prereqResult.createdTasks.length > 0;

        if (prereqResult.errors.length > 0) {
          result.errors.push(...prereqResult.errors);
        }

        // Add dependsOn to main task data
        if (prereqResult.prerequisiteTaskIds.length > 0) {
          mainTaskData.dependsOn = prereqResult.prerequisiteTaskIds;
          mainTaskData.hasDependencies = true;
        }
      }
    }

    // Step 3: Create main task
    result.mainTaskId = await createTask(mainTaskData);
    result.mainTaskCreated = true;

    // Step 4: Update prerequisites with main task ID
    if (result.prerequisites.length > 0) {
      for (const prereq of result.prerequisites) {
        try {
          await updateTask(prereq.taskId, {
            prerequisiteFor: result.mainTaskId,
          });
        } catch (error) {
          console.error(`[TaskDependency] Error linking prerequisite ${prereq.taskId}:`, error);
        }
      }
    }

    return result;

  } catch (error) {
    console.error('[TaskDependency] Error creating task with prerequisites:', error);
    result.errors.push({ error: error.message });
    return result;
  }
}

/**
 * Check if a task can start (all dependencies completed)
 *
 * @param {Object} task - Task object with dependsOn array
 * @param {Function} getTaskById - Function to get task by ID
 * @returns {Promise<Object>} { canStart: boolean, blockedBy: string[] }
 */
export async function checkTaskCanStart(task, getTaskById) {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return { canStart: true, blockedBy: [] };
  }

  const blockedBy = [];

  for (const depTaskId of task.dependsOn) {
    try {
      const depTask = await getTaskById(depTaskId);
      if (depTask && depTask.status !== 'completed') {
        blockedBy.push({
          taskId: depTaskId,
          recipeName: depTask.recipeName,
          status: depTask.status,
        });
      }
    } catch (error) {
      console.error(`[TaskDependency] Error checking dependency ${depTaskId}:`, error);
    }
  }

  return {
    canStart: blockedBy.length === 0,
    blockedBy,
  };
}
