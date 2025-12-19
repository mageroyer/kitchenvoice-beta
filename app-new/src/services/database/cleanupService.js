/**
 * Data Cleanup Service
 *
 * Provides utilities for cleaning up orphaned references, deleted remnants,
 * and validating data integrity across all database tables.
 */

import db from './indexedDB';
import { createLogger } from '../../utils/logger';

const logger = createLogger('CleanupService');

// =============================================================================
// ORPHANED REFERENCE CLEANUP
// =============================================================================

/**
 * Remove orphaned category references (categories pointing to deleted departments)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedCategories(options = { dryRun: false }) {
  logger.info('Checking for orphaned categories', { action: 'cleanOrphanedCategories' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const categories = await db.categories.toArray();
    const departmentIds = new Set((await db.departments.toArray()).map(d => d.id));

    for (const cat of categories) {
      // Check if category references a non-existent department
      if (cat.departmentId && !departmentIds.has(cat.departmentId)) {
        results.found++;
        results.details.push({
          type: 'orphaned_category',
          categoryId: cat.id,
          categoryName: cat.name,
          missingDepartmentId: cat.departmentId
        });

        if (!options.dryRun) {
          // Set departmentId to null (category becomes unassigned)
          await db.categories.update(cat.id, { departmentId: null });
          results.fixed++;
        }
      }
    }

    logger.info('Orphaned categories cleanup complete', {
      action: 'cleanOrphanedCategories',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedCategories', error);
    throw error;
  }
}

/**
 * Remove orphaned recipe references (recipes with invalid category/department)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedRecipes(options = { dryRun: false }) {
  logger.info('Checking for orphaned recipe references', { action: 'cleanOrphanedRecipes' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const recipes = await db.recipes.toArray();
    const departments = await db.departments.toArray();
    const categories = await db.categories.toArray();

    const departmentIds = new Set(departments.map(d => d.id));
    const departmentNames = new Set(departments.map(d => d.name));
    const categoryNames = new Set(categories.map(c => c.name));

    for (const recipe of recipes) {
      const issues = [];
      const fixes = {};

      // Check departmentId reference
      if (recipe.departmentId && !departmentIds.has(recipe.departmentId)) {
        issues.push(`invalid departmentId: ${recipe.departmentId}`);
        fixes.departmentId = null;
      }

      // Check department name reference
      if (recipe.department && !departmentNames.has(recipe.department)) {
        issues.push(`invalid department name: ${recipe.department}`);
        fixes.department = null;
      }

      // Check category name reference (categories are stored by name in recipes)
      if (recipe.category && !categoryNames.has(recipe.category)) {
        issues.push(`invalid category: ${recipe.category}`);
        // Don't null category - keep it as-is (might be intentional custom category)
      }

      if (issues.length > 0) {
        results.found++;
        results.details.push({
          type: 'orphaned_recipe_refs',
          recipeId: recipe.id,
          recipeName: recipe.name,
          issues
        });

        if (!options.dryRun && Object.keys(fixes).length > 0) {
          await db.recipes.update(recipe.id, fixes);
          results.fixed++;
        }
      }
    }

    logger.info('Orphaned recipe refs cleanup complete', {
      action: 'cleanOrphanedRecipes',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedRecipes', error);
    throw error;
  }
}

/**
 * Remove orphaned ingredient references (recipe ingredients pointing to deleted inventory items)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedIngredientRefs(options = { dryRun: false }) {
  logger.info('Checking for orphaned ingredient references', { action: 'cleanOrphanedIngredientRefs' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const recipes = await db.recipes.toArray();
    const inventoryItemIds = new Set((await db.inventoryItems.toArray()).map(i => i.id));

    for (const recipe of recipes) {
      if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) continue;

      let hasChanges = false;
      const updatedIngredients = recipe.ingredients.map(ing => {
        // Check linkedInventoryItemId (link to inventory item)
        const linkedId = ing.linkedInventoryItemId;
        if (linkedId && !inventoryItemIds.has(linkedId)) {
          results.found++;
          results.details.push({
            type: 'orphaned_ingredient_link',
            recipeId: recipe.id,
            recipeName: recipe.name,
            ingredientName: ing.name,
            missingItemId: linkedId
          });
          hasChanges = true;
          // Remove the invalid link but keep the ingredient data
          return { ...ing, linkedInventoryItemId: null, ingredientId: null };
        }
        return ing;
      });

      if (hasChanges && !options.dryRun) {
        await db.recipes.update(recipe.id, { ingredients: updatedIngredients });
        results.fixed++;
      }
    }

    logger.info('Orphaned ingredient refs cleanup complete', {
      action: 'cleanOrphanedIngredientRefs',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedIngredientRefs', error);
    throw error;
  }
}

/**
 * Remove orphaned price history (price records for deleted inventory items)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedPriceHistory(options = { dryRun: false }) {
  logger.info('Checking for orphaned price history', { action: 'cleanOrphanedPriceHistory' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const priceHistory = await db.priceHistory.toArray();
    const inventoryItemIds = new Set((await db.inventoryItems.toArray()).map(i => i.id));

    for (const record of priceHistory) {
      if (!inventoryItemIds.has(record.inventoryItemId)) {
        results.found++;
        results.details.push({
          type: 'orphaned_price_history',
          priceHistoryId: record.id,
          missingInventoryItemId: record.inventoryItemId,
          price: record.price,
          recordedAt: record.recordedAt
        });

        if (!options.dryRun) {
          await db.priceHistory.delete(record.id);
          results.fixed++;
        }
      }
    }

    logger.info('Orphaned price history cleanup complete', {
      action: 'cleanOrphanedPriceHistory',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedPriceHistory', error);
    throw error;
  }
}

/**
 * Remove orphaned invoice references (invoices pointing to deleted vendors)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedInvoices(options = { dryRun: false }) {
  logger.info('Checking for orphaned invoices', { action: 'cleanOrphanedInvoices' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const invoices = await db.invoices.toArray();
    const vendorIds = new Set((await db.vendors.toArray()).map(v => v.id));

    for (const invoice of invoices) {
      // Check vendorId against vendors table
      if (invoice.vendorId && !vendorIds.has(invoice.vendorId)) {
        results.found++;
        results.details.push({
          type: 'orphaned_invoice',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          missingVendorId: invoice.vendorId,
          vendorName: invoice.vendorName
        });

        if (!options.dryRun) {
          // Keep the invoice but null the vendorId (we still have vendorName)
          await db.invoices.update(invoice.id, { vendorId: null });
          results.fixed++;
        }
      }
    }

    logger.info('Orphaned invoices cleanup complete', {
      action: 'cleanOrphanedInvoices',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedInvoices', error);
    throw error;
  }
}

/**
 * Remove orphaned production logs (logs for deleted recipes)
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, details: Array}>}
 */
export async function cleanOrphanedProductionLogs(options = { dryRun: false }) {
  logger.info('Checking for orphaned production logs', { action: 'cleanOrphanedProductionLogs' });

  const results = {
    found: 0,
    fixed: 0,
    details: []
  };

  try {
    const productionLogs = await db.productionLogs.toArray();
    const recipeIds = new Set((await db.recipes.toArray()).map(r => r.id));

    for (const log of productionLogs) {
      if (log.recipeId && !recipeIds.has(log.recipeId)) {
        results.found++;
        results.details.push({
          type: 'orphaned_production_log',
          logId: log.id,
          missingRecipeId: log.recipeId,
          recipeName: log.recipeName,
          completedAt: log.completedAt
        });

        if (!options.dryRun) {
          // Delete orphaned production logs (historical data for deleted recipes)
          await db.productionLogs.delete(log.id);
          results.fixed++;
        }
      }
    }

    logger.info('Orphaned production logs cleanup complete', {
      action: 'cleanOrphanedProductionLogs',
      data: { found: results.found, fixed: results.fixed }
    });

    return results;
  } catch (error) {
    logger.logError('cleanOrphanedProductionLogs', error);
    throw error;
  }
}

// =============================================================================
// DELETED REMNANTS CLEANUP
// =============================================================================

/**
 * Clean up incomplete/corrupted recipe entries
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, deleted: number, details: Array}>}
 */
export async function cleanIncompleteRecipes(options = { dryRun: false }) {
  logger.info('Checking for incomplete recipes', { action: 'cleanIncompleteRecipes' });

  const results = {
    found: 0,
    fixed: 0,
    deleted: 0,
    details: []
  };

  try {
    const recipes = await db.recipes.toArray();

    for (const recipe of recipes) {
      const issues = [];
      const fixes = {};

      // Check for missing required name
      if (!recipe.name || (typeof recipe.name === 'string' && recipe.name.trim() === '')) {
        issues.push('missing name');
      }

      // Check for missing nameLower (needs migration)
      if (recipe.name && recipe.nameLower === undefined) {
        issues.push('missing nameLower index');
        fixes.nameLower = recipe.name.toLowerCase().trim();
      }

      // Check for corrupted arrays
      if (recipe.ingredients && !Array.isArray(recipe.ingredients)) {
        issues.push('corrupted ingredients array');
        fixes.ingredients = [];
      }
      if (recipe.methods && !Array.isArray(recipe.methods)) {
        issues.push('corrupted methods array');
        fixes.methods = [];
      }
      if (recipe.notes && !Array.isArray(recipe.notes)) {
        issues.push('corrupted notes array');
        fixes.notes = [];
      }
      if (recipe.platingInstructions && !Array.isArray(recipe.platingInstructions)) {
        issues.push('corrupted platingInstructions array');
        fixes.platingInstructions = [];
      }

      // Check for invalid portions
      if (recipe.portions !== undefined && (isNaN(recipe.portions) || recipe.portions < 0)) {
        issues.push(`invalid portions: ${recipe.portions}`);
        fixes.portions = 1;
      }

      if (issues.length > 0) {
        results.found++;

        // If recipe has no name, it's a ghost record - mark for deletion
        const isGhostRecord = !recipe.name || recipe.name.trim() === '';

        results.details.push({
          type: isGhostRecord ? 'ghost_recipe' : 'incomplete_recipe',
          recipeId: recipe.id,
          recipeName: recipe.name || '(no name)',
          issues,
          action: isGhostRecord ? 'delete' : 'fix'
        });

        if (!options.dryRun) {
          if (isGhostRecord) {
            await db.recipes.delete(recipe.id);
            results.deleted++;
          } else if (Object.keys(fixes).length > 0) {
            await db.recipes.update(recipe.id, fixes);
            results.fixed++;
          }
        }
      }
    }

    logger.info('Incomplete recipes cleanup complete', {
      action: 'cleanIncompleteRecipes',
      data: results
    });

    return results;
  } catch (error) {
    logger.logError('cleanIncompleteRecipes', error);
    throw error;
  }
}

/**
 * Clean up incomplete/corrupted inventory item entries
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<{found: number, fixed: number, deleted: number, details: Array}>}
 */
export async function cleanIncompleteInventoryItems(options = { dryRun: false }) {
  logger.info('Checking for incomplete inventory items', { action: 'cleanIncompleteInventoryItems' });

  const results = {
    found: 0,
    fixed: 0,
    deleted: 0,
    details: []
  };

  try {
    const items = await db.inventoryItems.toArray();

    for (const item of items) {
      const issues = [];
      const fixes = {};

      // Check for missing required name
      if (!item.name || (typeof item.name === 'string' && item.name.trim() === '')) {
        issues.push('missing name');
      }

      // Check for missing nameNormalized
      if (item.name && item.nameNormalized === undefined) {
        issues.push('missing nameNormalized index');
        fixes.nameNormalized = item.name.toLowerCase().trim();
      }

      // Check for negative prices
      if (item.currentPrice < 0) {
        issues.push(`negative price: ${item.currentPrice}`);
        fixes.currentPrice = 0;
      }

      // Check for invalid unit
      if (!item.unit || item.unit.trim() === '') {
        issues.push('missing unit');
        fixes.unit = 'unit';
      }

      if (issues.length > 0) {
        results.found++;

        const isGhostRecord = !item.name || item.name.trim() === '';

        results.details.push({
          type: isGhostRecord ? 'ghost_inventory_item' : 'incomplete_inventory_item',
          inventoryItemId: item.id,
          itemName: item.name || '(no name)',
          issues,
          action: isGhostRecord ? 'delete' : 'fix'
        });

        if (!options.dryRun) {
          if (isGhostRecord) {
            await db.inventoryItems.delete(item.id);
            // Also delete associated price history
            await db.priceHistory.where('inventoryItemId').equals(item.id).delete();
            results.deleted++;
          } else if (Object.keys(fixes).length > 0) {
            await db.inventoryItems.update(item.id, fixes);
            results.fixed++;
          }
        }
      }
    }

    logger.info('Incomplete inventory items cleanup complete', {
      action: 'cleanIncompleteInventoryItems',
      data: results
    });

    return results;
  } catch (error) {
    logger.logError('cleanIncompleteInventoryItems', error);
    throw error;
  }
}

// =============================================================================
// DATA INTEGRITY VALIDATION
// =============================================================================

/**
 * Comprehensive data integrity check across all tables
 * @returns {Promise<{healthy: boolean, issues: Array, stats: Object}>}
 */
export async function validateDataIntegrity() {
  logger.info('Running comprehensive data integrity check', { action: 'validateDataIntegrity' });

  const issues = [];
  const stats = {
    recipes: { total: 0, valid: 0, issues: 0 },
    departments: { total: 0, valid: 0, issues: 0 },
    categories: { total: 0, valid: 0, issues: 0 },
    vendors: { total: 0, valid: 0, issues: 0 },
    inventoryItems: { total: 0, valid: 0, issues: 0 },
    invoices: { total: 0, valid: 0, issues: 0 },
    productionLogs: { total: 0, valid: 0, issues: 0 },
    priceHistory: { total: 0, valid: 0, issues: 0 }
  };

  try {
    // Validate Recipes
    const recipes = await db.recipes.toArray();
    stats.recipes.total = recipes.length;
    for (const recipe of recipes) {
      const recipeIssues = validateRecipe(recipe);
      if (recipeIssues.length > 0) {
        stats.recipes.issues++;
        issues.push({
          table: 'recipes',
          id: recipe.id,
          name: recipe.name,
          severity: recipeIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: recipeIssues
        });
      } else {
        stats.recipes.valid++;
      }
    }

    // Validate Departments
    const departments = await db.departments.toArray();
    stats.departments.total = departments.length;
    for (const dept of departments) {
      const deptIssues = validateDepartment(dept);
      if (deptIssues.length > 0) {
        stats.departments.issues++;
        issues.push({
          table: 'departments',
          id: dept.id,
          name: dept.name,
          severity: deptIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: deptIssues
        });
      } else {
        stats.departments.valid++;
      }
    }

    // Validate Categories
    const categories = await db.categories.toArray();
    const departmentIds = new Set(departments.map(d => d.id));
    stats.categories.total = categories.length;
    for (const cat of categories) {
      const catIssues = validateCategory(cat, departmentIds);
      if (catIssues.length > 0) {
        stats.categories.issues++;
        issues.push({
          table: 'categories',
          id: cat.id,
          name: cat.name,
          severity: catIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: catIssues
        });
      } else {
        stats.categories.valid++;
      }
    }

    // Validate Vendors
    const vendors = await db.vendors.toArray();
    stats.vendors.total = vendors.length;
    for (const vendor of vendors) {
      const vendorIssues = validateVendor(vendor);
      if (vendorIssues.length > 0) {
        stats.vendors.issues++;
        issues.push({
          table: 'vendors',
          id: vendor.id,
          name: vendor.name,
          severity: vendorIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: vendorIssues
        });
      } else {
        stats.vendors.valid++;
      }
    }

    // Validate Inventory Items
    const inventoryItems = await db.inventoryItems.toArray();
    stats.inventoryItems.total = inventoryItems.length;
    for (const item of inventoryItems) {
      const itemIssues = validateInventoryItem(item);
      if (itemIssues.length > 0) {
        stats.inventoryItems.issues++;
        issues.push({
          table: 'inventoryItems',
          id: item.id,
          name: item.name,
          severity: itemIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: itemIssues
        });
      } else {
        stats.inventoryItems.valid++;
      }
    }

    // Validate Invoices
    const vendorIds = new Set(vendors.map(v => v.id));
    const invoices = await db.invoices.toArray();
    stats.invoices.total = invoices.length;
    for (const invoice of invoices) {
      const invIssues = validateInvoice(invoice, vendorIds);
      if (invIssues.length > 0) {
        stats.invoices.issues++;
        issues.push({
          table: 'invoices',
          id: invoice.id,
          name: invoice.invoiceNumber,
          severity: invIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: invIssues
        });
      } else {
        stats.invoices.valid++;
      }
    }

    // Validate Production Logs
    const recipeIds = new Set(recipes.map(r => r.id));
    const productionLogs = await db.productionLogs.toArray();
    stats.productionLogs.total = productionLogs.length;
    for (const log of productionLogs) {
      const logIssues = validateProductionLog(log, recipeIds);
      if (logIssues.length > 0) {
        stats.productionLogs.issues++;
        issues.push({
          table: 'productionLogs',
          id: log.id,
          name: log.recipeName,
          severity: logIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: logIssues
        });
      } else {
        stats.productionLogs.valid++;
      }
    }

    // Validate Price History
    const inventoryItemIds = new Set(inventoryItems.map(i => i.id));
    const priceHistory = await db.priceHistory.toArray();
    stats.priceHistory.total = priceHistory.length;
    for (const record of priceHistory) {
      const phIssues = validatePriceHistory(record, inventoryItemIds);
      if (phIssues.length > 0) {
        stats.priceHistory.issues++;
        issues.push({
          table: 'priceHistory',
          id: record.id,
          name: `Item ${record.inventoryItemId}`,
          severity: phIssues.some(i => i.severity === 'error') ? 'error' : 'warning',
          issues: phIssues
        });
      } else {
        stats.priceHistory.valid++;
      }
    }

    const healthy = issues.filter(i => i.severity === 'error').length === 0;

    logger.info('Data integrity check complete', {
      action: 'validateDataIntegrity',
      data: { healthy, issueCount: issues.length }
    });

    return { healthy, issues, stats };
  } catch (error) {
    logger.logError('validateDataIntegrity', error);
    throw error;
  }
}

// Individual validators
function validateRecipe(recipe) {
  const issues = [];
  if (!recipe.name) issues.push({ field: 'name', severity: 'error', message: 'Missing name' });
  if (recipe.nameLower === undefined) issues.push({ field: 'nameLower', severity: 'warning', message: 'Missing nameLower index' });
  if (recipe.portions !== undefined && (isNaN(recipe.portions) || recipe.portions < 0)) {
    issues.push({ field: 'portions', severity: 'warning', message: `Invalid portions: ${recipe.portions}` });
  }
  if (recipe.ingredients && !Array.isArray(recipe.ingredients)) {
    issues.push({ field: 'ingredients', severity: 'error', message: 'Corrupted ingredients array' });
  }
  return issues;
}

function validateDepartment(dept) {
  const issues = [];
  if (!dept.name) issues.push({ field: 'name', severity: 'error', message: 'Missing name' });
  return issues;
}

function validateCategory(cat, departmentIds) {
  const issues = [];
  if (!cat.name) issues.push({ field: 'name', severity: 'error', message: 'Missing name' });
  if (cat.departmentId && !departmentIds.has(cat.departmentId)) {
    issues.push({ field: 'departmentId', severity: 'warning', message: 'References non-existent department' });
  }
  return issues;
}

function validateVendor(vendor) {
  const issues = [];
  if (!vendor.name) issues.push({ field: 'name', severity: 'error', message: 'Missing name' });
  if (vendor.nameLower === undefined) issues.push({ field: 'nameLower', severity: 'warning', message: 'Missing nameLower index' });
  return issues;
}

function validateInventoryItem(item) {
  const issues = [];
  if (!item.name) issues.push({ field: 'name', severity: 'error', message: 'Missing name' });
  if (item.currentPrice < 0) issues.push({ field: 'currentPrice', severity: 'warning', message: 'Negative price' });
  return issues;
}

function validateInvoice(invoice, vendorIds) {
  const issues = [];
  if (invoice.vendorId && !vendorIds.has(invoice.vendorId)) {
    issues.push({ field: 'vendorId', severity: 'warning', message: 'References non-existent vendor' });
  }
  if (invoice.total < 0) {
    issues.push({ field: 'total', severity: 'warning', message: 'Negative total amount' });
  }
  return issues;
}

function validateProductionLog(log, recipeIds) {
  const issues = [];
  if (log.recipeId && !recipeIds.has(log.recipeId)) {
    issues.push({ field: 'recipeId', severity: 'warning', message: 'References non-existent recipe' });
  }
  if (log.laborCost < 0) issues.push({ field: 'laborCost', severity: 'warning', message: 'Negative labor cost' });
  if (log.foodCost < 0) issues.push({ field: 'foodCost', severity: 'warning', message: 'Negative food cost' });
  return issues;
}

function validatePriceHistory(record, inventoryItemIds) {
  const issues = [];
  if (record.inventoryItemId && !inventoryItemIds.has(record.inventoryItemId)) {
    issues.push({ field: 'inventoryItemId', severity: 'warning', message: 'References non-existent inventory item' });
  }
  if (record.price < 0) issues.push({ field: 'price', severity: 'warning', message: 'Negative price' });
  return issues;
}

// =============================================================================
// FULL CLEANUP
// =============================================================================

/**
 * Run all cleanup operations
 * @param {Object} options - Cleanup options
 * @param {boolean} options.dryRun - If true, only report issues without fixing
 * @returns {Promise<Object>} Complete cleanup results
 */
export async function runFullCleanup(options = { dryRun: false }) {
  logger.info('Starting full data cleanup', { action: 'runFullCleanup', data: { dryRun: options.dryRun } });

  const results = {
    dryRun: options.dryRun,
    startedAt: new Date().toISOString(),
    orphanedCategories: null,
    orphanedRecipes: null,
    orphanedIngredientRefs: null,
    orphanedPriceHistory: null,
    orphanedInvoices: null,
    orphanedProductionLogs: null,
    incompleteRecipes: null,
    incompleteInventoryItems: null,
    integrity: null,
    completedAt: null,
    summary: {
      totalIssuesFound: 0,
      totalFixed: 0,
      totalDeleted: 0
    }
  };

  try {
    // Run all orphaned reference cleanups
    results.orphanedCategories = await cleanOrphanedCategories(options);
    results.orphanedRecipes = await cleanOrphanedRecipes(options);
    results.orphanedIngredientRefs = await cleanOrphanedIngredientRefs(options);
    results.orphanedPriceHistory = await cleanOrphanedPriceHistory(options);
    results.orphanedInvoices = await cleanOrphanedInvoices(options);
    results.orphanedProductionLogs = await cleanOrphanedProductionLogs(options);

    // Run incomplete/remnant cleanups
    results.incompleteRecipes = await cleanIncompleteRecipes(options);
    results.incompleteInventoryItems = await cleanIncompleteInventoryItems(options);

    // Run integrity validation
    results.integrity = await validateDataIntegrity();

    // Calculate summary
    const allResults = [
      results.orphanedCategories,
      results.orphanedRecipes,
      results.orphanedIngredientRefs,
      results.orphanedPriceHistory,
      results.orphanedInvoices,
      results.orphanedProductionLogs,
      results.incompleteRecipes,
      results.incompleteInventoryItems
    ];

    for (const r of allResults) {
      results.summary.totalIssuesFound += r.found || 0;
      results.summary.totalFixed += r.fixed || 0;
      results.summary.totalDeleted += r.deleted || 0;
    }

    results.completedAt = new Date().toISOString();

    logger.info('Full cleanup complete', {
      action: 'runFullCleanup',
      data: results.summary
    });

    return results;
  } catch (error) {
    logger.logError('runFullCleanup', error);
    throw error;
  }
}

// =============================================================================
// EXPORTS FOR CONSOLE ACCESS
// =============================================================================

// Make utilities available in browser console
if (typeof window !== 'undefined') {
  window.dbCleanup = {
    // Orphaned reference cleanup
    cleanOrphanedCategories,
    cleanOrphanedRecipes,
    cleanOrphanedIngredientRefs,
    cleanOrphanedPriceHistory,
    cleanOrphanedInvoices,
    cleanOrphanedProductionLogs,

    // Incomplete/remnant cleanup
    cleanIncompleteRecipes,
    cleanIncompleteInventoryItems,

    // Validation
    validateDataIntegrity,

    // Full cleanup
    runFullCleanup,

    // Quick commands
    dryRun: () => runFullCleanup({ dryRun: true }),
    fix: () => runFullCleanup({ dryRun: false })
  };

  console.log('Database cleanup utilities available at window.dbCleanup');
  console.log('  - dbCleanup.dryRun() - Check for issues without fixing');
  console.log('  - dbCleanup.fix() - Fix all issues');
  console.log('  - dbCleanup.validateDataIntegrity() - Run integrity check');
}

export default {
  cleanOrphanedCategories,
  cleanOrphanedRecipes,
  cleanOrphanedIngredientRefs,
  cleanOrphanedPriceHistory,
  cleanOrphanedInvoices,
  cleanOrphanedProductionLogs,
  cleanIncompleteRecipes,
  cleanIncompleteInventoryItems,
  validateDataIntegrity,
  runFullCleanup
};
