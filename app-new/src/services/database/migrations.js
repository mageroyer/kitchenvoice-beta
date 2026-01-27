/**
 * IndexedDB Migration Strategy & Utilities
 *
 * This file provides database utilities for schema validation, data integrity,
 * backup/restore, and diagnostics.
 *
 * IMPORTANT: This database has a single schema version (v1).
 * No migration utilities are needed since there are no legacy users.
 */

import db from './indexedDB';

// =============================================================================
// SCHEMA VERSION
// =============================================================================

/**
 * Current schema version - single version, no migrations needed
 */
export const CURRENT_VERSION = 1;

/**
 * Current schema definition
 */
export const CURRENT_SCHEMA = {
  version: 1,
  date: '2025-12-20',
  description: 'Clean schema - vendors, inventory, invoices, purchase orders, expense tracking',
  stores: {
    recipes: '++id, name, nameLower, category, department, departmentId, [department+category], portions, plu, updatedAt',
    departments: '++id, name, isDefault, createdAt',
    categories: '++id, name, departmentId, isDefault, createdAt',
    sliders: '++id, name, location, autoPlay, interval, animation, updatedAt',
    kitchenSettings: '++id, key, value, updatedAt',
    productionLogs: '++id, recipeId, taskId, employeeId, employeeName, [recipeId+createdAt], portions, startedAt, completedAt, duration, laborCost, foodCost, totalCost, createdAt',
    priceHistory: '++id, inventoryItemId, price, invoiceId, vendorId, recordedAt',
    vendors: '++id, name, nameLower, vendorCode, isActive, isPrimary, isInternal, rating, city, province, createdAt, updatedAt',
    inventoryItems: '++id, name, nameNormalized, sku, vendorId, [vendorId+name], category, isActive, currentPrice, lastPurchaseDate, createdAt, updatedAt',
    invoices: '++id, vendorId, vendorName, invoiceNumber, invoiceDate, [vendorId+invoiceDate], status, paymentStatus, dueDate, total, createdAt, updatedAt',
    invoiceLineItems: '++id, invoiceId, inventoryItemId, [invoiceId+lineNumber], matchStatus, createdAt',
    stockTransactions: '++id, inventoryItemId, transactionType, [inventoryItemId+createdAt], referenceType, referenceId, createdAt',
    purchaseOrders: '++id, orderNumber, vendorId, status, createdAt, expectedDeliveryDate, updatedAt',
    purchaseOrderLines: '++id, purchaseOrderId, inventoryItemId, [purchaseOrderId+lineNumber], createdAt',
    expenseCategories: '++id, name, isDefault, isActive, qbAccountId, createdAt, updatedAt',
    expenseRecords: '++id, invoiceId, vendorId, expenseCategoryId, [vendorId+invoiceDate], [expenseCategoryId+invoiceDate], invoiceDate, amount, qbSynced, createdAt, updatedAt'
  }
};

/**
 * All tables in the current schema
 */
export const ALL_TABLES = [
  'recipes', 'departments', 'categories', 'sliders',
  'kitchenSettings', 'productionLogs', 'priceHistory',
  'vendors', 'inventoryItems', 'invoices', 'invoiceLineItems',
  'stockTransactions', 'purchaseOrders', 'purchaseOrderLines',
  'expenseCategories', 'expenseRecords'
];

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

/**
 * Get the current database version
 * @returns {Promise<number>} Current version number
 */
export async function getCurrentVersion() {
  try {
    return db.verno;
  } catch {
    return 0;
  }
}

/**
 * Validate database schema integrity
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateSchema() {
  const errors = [];
  const warnings = [];

  try {
    // Check all expected tables exist
    for (const table of ALL_TABLES) {
      if (!db[table]) {
        errors.push(`Missing table: ${table}`);
      }
    }

    // Check nameLower fields exist on relevant tables
    const sampleRecipe = await db.recipes.limit(1).first();
    if (sampleRecipe && sampleRecipe.nameLower === undefined) {
      warnings.push('Recipes missing nameLower field');
    }

    const sampleVendor = await db.vendors?.limit(1).first();
    if (sampleVendor && sampleVendor.nameLower === undefined) {
      warnings.push('Vendors missing nameLower field');
    }

    // Check invoice has vendorId (not supplierId)
    const sampleInvoice = await db.invoices.limit(1).first();
    if (sampleInvoice && sampleInvoice.vendorId === undefined) {
      warnings.push('Invoices missing vendorId field');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Schema validation failed: ${error.message}`],
      warnings
    };
  }
}

// =============================================================================
// DATA INTEGRITY CHECKS
// =============================================================================

/**
 * Check data integrity across all tables
 * @returns {Promise<{healthy: boolean, issues: Object[]}>}
 */
export async function checkDataIntegrity() {
  const issues = [];

  try {
    // Check recipes have required fields
    const recipesWithoutName = await db.recipes.filter(r => !r.name).count();
    if (recipesWithoutName > 0) {
      issues.push({
        table: 'recipes',
        severity: 'error',
        message: `${recipesWithoutName} recipes missing name field`
      });
    }

    // Check categories reference valid departments
    const categories = await db.categories.toArray();
    const departmentIds = new Set((await db.departments.toArray()).map(d => d.id));

    for (const cat of categories) {
      if (cat.departmentId && !departmentIds.has(cat.departmentId)) {
        issues.push({
          table: 'categories',
          severity: 'warning',
          message: `Category "${cat.name}" references non-existent department ${cat.departmentId}`
        });
      }
    }

    // Check inventoryItems reference valid vendors
    const inventoryItems = await db.inventoryItems.toArray();
    const vendorIds = new Set((await db.vendors.toArray()).map(v => v.id));

    for (const item of inventoryItems) {
      if (item.vendorId && !vendorIds.has(item.vendorId)) {
        issues.push({
          table: 'inventoryItems',
          severity: 'warning',
          message: `Inventory item "${item.name}" references non-existent vendor ${item.vendorId}`
        });
      }
    }

    // Check invoices reference valid vendors
    const invoices = await db.invoices.toArray();
    for (const inv of invoices) {
      if (inv.vendorId && !vendorIds.has(inv.vendorId)) {
        issues.push({
          table: 'invoices',
          severity: 'warning',
          message: `Invoice "${inv.invoiceNumber}" references non-existent vendor ${inv.vendorId}`
        });
      }
    }

    // Check invoiceLineItems reference valid invoices and inventoryItems
    const lineItems = await db.invoiceLineItems.toArray();
    const invoiceIds = new Set(invoices.map(i => i.id));
    const inventoryItemIds = new Set(inventoryItems.map(i => i.id));

    for (const line of lineItems) {
      if (!invoiceIds.has(line.invoiceId)) {
        issues.push({
          table: 'invoiceLineItems',
          severity: 'error',
          message: `Invoice line ${line.id} references non-existent invoice ${line.invoiceId}`
        });
      }
      if (line.inventoryItemId && !inventoryItemIds.has(line.inventoryItemId)) {
        issues.push({
          table: 'invoiceLineItems',
          severity: 'warning',
          message: `Invoice line ${line.id} references non-existent inventory item ${line.inventoryItemId}`
        });
      }
    }

    // Check stockTransactions reference valid inventoryItems
    const transactions = await db.stockTransactions.toArray();
    const orphanedTransactions = transactions.filter(
      t => !inventoryItemIds.has(t.inventoryItemId)
    ).length;
    if (orphanedTransactions > 0) {
      issues.push({
        table: 'stockTransactions',
        severity: 'warning',
        message: `${orphanedTransactions} stock transactions reference deleted inventory items`
      });
    }

    // Check purchaseOrders reference valid vendors
    const orders = await db.purchaseOrders.toArray();
    for (const order of orders) {
      if (order.vendorId && !vendorIds.has(order.vendorId)) {
        issues.push({
          table: 'purchaseOrders',
          severity: 'warning',
          message: `Purchase order "${order.orderNumber}" references non-existent vendor ${order.vendorId}`
        });
      }
    }

    // Check purchaseOrderLines reference valid POs and inventoryItems
    const poLines = await db.purchaseOrderLines.toArray();
    const poIds = new Set(orders.map(po => po.id));

    for (const line of poLines) {
      if (!poIds.has(line.purchaseOrderId)) {
        issues.push({
          table: 'purchaseOrderLines',
          severity: 'error',
          message: `PO line ${line.id} references non-existent purchase order ${line.purchaseOrderId}`
        });
      }
      if (line.inventoryItemId && !inventoryItemIds.has(line.inventoryItemId)) {
        issues.push({
          table: 'purchaseOrderLines',
          severity: 'warning',
          message: `PO line ${line.id} references non-existent inventory item ${line.inventoryItemId}`
        });
      }
    }

    // Check priceHistory references valid inventoryItems
    const priceHistory = await db.priceHistory.toArray();
    const orphanedPriceHistory = priceHistory.filter(
      ph => !inventoryItemIds.has(ph.inventoryItemId)
    ).length;
    if (orphanedPriceHistory > 0) {
      issues.push({
        table: 'priceHistory',
        severity: 'info',
        message: `${orphanedPriceHistory} price history records reference deleted inventory items`
      });
    }

    return {
      healthy: issues.filter(i => i.severity === 'error').length === 0,
      issues
    };
  } catch (error) {
    return {
      healthy: false,
      issues: [{
        table: 'unknown',
        severity: 'error',
        message: `Integrity check failed: ${error.message}`
      }]
    };
  }
}

// =============================================================================
// CLEANUP UTILITIES
// =============================================================================

/**
 * Fix orphaned category references
 * Sets departmentId to null for categories referencing non-existent departments
 * @returns {Promise<number>} Number of categories fixed
 */
export async function fixOrphanedCategories() {
  const departmentIds = new Set((await db.departments.toArray()).map(d => d.id));
  let fixed = 0;

  await db.transaction('rw', db.categories, async () => {
    const categories = await db.categories.toArray();
    for (const cat of categories) {
      if (cat.departmentId && !departmentIds.has(cat.departmentId)) {
        await db.categories.update(cat.id, { departmentId: null });
        fixed++;
      }
    }
  });

  return fixed;
}

/**
 * Fix orphaned inventory items (items with deleted vendors)
 * Sets vendorId to null for items referencing non-existent vendors
 * @returns {Promise<number>} Number of items fixed
 */
export async function fixOrphanedInventoryItems() {
  const vendorIds = new Set((await db.vendors.toArray()).map(v => v.id));
  let fixed = 0;

  await db.transaction('rw', db.inventoryItems, async () => {
    const items = await db.inventoryItems.toArray();
    for (const item of items) {
      if (item.vendorId && !vendorIds.has(item.vendorId)) {
        await db.inventoryItems.update(item.id, { vendorId: null, vendorName: '' });
        fixed++;
      }
    }
  });

  return fixed;
}

/**
 * Clean up orphaned stock transactions
 * Removes transactions for deleted inventory items
 * @returns {Promise<number>} Number of transactions deleted
 */
export async function cleanOrphanedStockTransactions() {
  const itemIds = new Set((await db.inventoryItems.toArray()).map(i => i.id));
  let deleted = 0;

  await db.transaction('rw', db.stockTransactions, async () => {
    const transactions = await db.stockTransactions.toArray();
    for (const tx of transactions) {
      if (!itemIds.has(tx.inventoryItemId)) {
        await db.stockTransactions.delete(tx.id);
        deleted++;
      }
    }
  });

  return deleted;
}

/**
 * Clean up orphaned price history records
 * Removes price history for deleted inventory items
 * @returns {Promise<number>} Number of records deleted
 */
export async function cleanOrphanedPriceHistory() {
  const itemIds = new Set((await db.inventoryItems.toArray()).map(i => i.id));
  let deleted = 0;

  await db.transaction('rw', db.priceHistory, async () => {
    const history = await db.priceHistory.toArray();
    for (const record of history) {
      if (!itemIds.has(record.inventoryItemId)) {
        await db.priceHistory.delete(record.id);
        deleted++;
      }
    }
  });

  return deleted;
}

/**
 * Clean up orphaned purchase order lines
 * Removes lines for deleted purchase orders
 * @returns {Promise<number>} Number of lines deleted
 */
export async function cleanOrphanedPOLines() {
  const poIds = new Set((await db.purchaseOrders.toArray()).map(po => po.id));
  let deleted = 0;

  await db.transaction('rw', db.purchaseOrderLines, async () => {
    const lines = await db.purchaseOrderLines.toArray();
    for (const line of lines) {
      if (!poIds.has(line.purchaseOrderId)) {
        await db.purchaseOrderLines.delete(line.id);
        deleted++;
      }
    }
  });

  return deleted;
}

/**
 * Run all cleanup utilities
 * @returns {Promise<Object>} Results of all cleanup operations
 */
export async function runAllCleanup() {
  const results = {
    orphanedCategories: await fixOrphanedCategories(),
    orphanedInventoryItems: await fixOrphanedInventoryItems(),
    orphanedStockTransactions: await cleanOrphanedStockTransactions(),
    orphanedPriceHistory: await cleanOrphanedPriceHistory(),
    orphanedPOLines: await cleanOrphanedPOLines()
  };

  return results;
}

// =============================================================================
// BACKUP & RESTORE
// =============================================================================

/**
 * Export all database data for backup
 * @returns {Promise<Object>} Complete database dump
 */
export async function exportDatabase() {
  const backup = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {}
  };

  for (const table of ALL_TABLES) {
    try {
      if (db[table]) {
        backup.tables[table] = await db[table].toArray();
      }
    } catch (error) {
      console.warn(`Failed to export table ${table}:`, error.message);
      backup.tables[table] = [];
    }
  }

  return backup;
}

/**
 * Import database from backup
 * WARNING: This clears existing data!
 * @param {Object} backup - Backup object from exportDatabase
 * @param {Object} options - Import options
 * @param {boolean} options.clearExisting - Whether to clear existing data (default: true)
 * @returns {Promise<{success: boolean, imported: Object}>}
 */
export async function importDatabase(backup, options = { clearExisting: true }) {
  if (!backup?.tables) {
    throw new Error('Invalid backup format');
  }

  const imported = {};

  // Get available tables
  const allTables = ALL_TABLES.map(t => db[t]).filter(t => t);

  try {
    await db.transaction('rw', ...allTables, async () => {
      // Clear existing data if requested
      if (options.clearExisting) {
        for (const table of allTables) {
          await table.clear();
        }
      }

      // Import each table
      for (const [tableName, records] of Object.entries(backup.tables)) {
        if (db[tableName] && Array.isArray(records) && records.length > 0) {
          await db[tableName].bulkAdd(records);
          imported[tableName] = records.length;
        }
      }
    });

    return { success: true, imported };
  } catch (error) {
    console.error('Import failed:', error);
    return { success: false, imported, error: error.message };
  }
}

// =============================================================================
// DIAGNOSTIC REPORT
// =============================================================================

/**
 * Generate a complete diagnostic report
 * @returns {Promise<Object>} Diagnostic report
 */
export async function generateDiagnosticReport() {
  const schemaValidation = await validateSchema();
  const dataIntegrity = await checkDataIntegrity();

  // Get table counts
  const tableCounts = {};
  for (const table of ALL_TABLES) {
    try {
      if (db[table]) {
        tableCounts[table] = await db[table].count();
      } else {
        tableCounts[table] = 'missing';
      }
    } catch {
      tableCounts[table] = 'error';
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    currentVersion: db.verno,
    schemaValid: schemaValidation.valid,
    schemaErrors: schemaValidation.errors,
    schemaWarnings: schemaValidation.warnings,
    dataHealthy: dataIntegrity.healthy,
    dataIssues: dataIntegrity.issues,
    tableCounts,
    databaseName: db.name
  };
}

/**
 * Create a backup snapshot
 * @returns {Promise<Object>} Snapshot with backup and diagnostics
 */
export async function createBackupSnapshot() {
  const snapshot = {
    createdAt: new Date().toISOString(),
    diagnostics: await generateDiagnosticReport(),
    backup: await exportDatabase()
  };

  // Store in localStorage as fallback
  try {
    const compressed = JSON.stringify(snapshot);
    if (compressed.length < 5000000) { // 5MB limit for localStorage
      localStorage.setItem('db_backup_snapshot', compressed);
    } else {
      console.warn('Snapshot too large for localStorage - download manually');
    }
  } catch (error) {
    console.warn('Could not save to localStorage:', error.message);
  }

  return snapshot;
}

/**
 * Restore from backup snapshot
 * @returns {Promise<{success: boolean, imported: Object}>}
 */
export async function restoreFromSnapshot() {
  const snapshotStr = localStorage.getItem('db_backup_snapshot');
  if (!snapshotStr) {
    throw new Error('No backup snapshot found in localStorage');
  }

  const snapshot = JSON.parse(snapshotStr);

  return await importDatabase(snapshot.backup);
}

/**
 * Clear inventory-related tables only, preserving recipes and settings
 * @returns {Promise<Object>} Counts of cleared tables
 */
export async function clearInventoryTables() {
  const cleared = {};

  const tablesToClear = [
    'vendors', 'inventoryItems', 'invoices', 'invoiceLineItems',
    'stockTransactions', 'purchaseOrders', 'purchaseOrderLines', 'priceHistory'
  ];

  for (const tableName of tablesToClear) {
    if (db[tableName]) {
      const count = await db[tableName].count();
      await db[tableName].clear();
      cleared[tableName] = count;
    }
  }

  return cleared;
}

// =============================================================================
// EXPORTS FOR CONSOLE ACCESS
// =============================================================================

// Make utilities available in browser console for debugging
if (typeof window !== 'undefined') {
  window.dbMigrations = {
    // Version info
    CURRENT_VERSION,
    CURRENT_SCHEMA,
    ALL_TABLES,

    // Status checks
    getCurrentVersion,
    validateSchema,
    checkDataIntegrity,
    generateDiagnosticReport,

    // Cleanup utilities
    fixOrphanedCategories,
    fixOrphanedInventoryItems,
    cleanOrphanedStockTransactions,
    cleanOrphanedPriceHistory,
    cleanOrphanedPOLines,
    runAllCleanup,

    // Backup & restore
    exportDatabase,
    importDatabase,
    createBackupSnapshot,
    restoreFromSnapshot,
    clearInventoryTables
  };

}

export default {
  // Version info
  CURRENT_VERSION,
  CURRENT_SCHEMA,
  ALL_TABLES,

  // Status checks
  getCurrentVersion,
  validateSchema,
  checkDataIntegrity,
  generateDiagnosticReport,

  // Cleanup utilities
  fixOrphanedCategories,
  fixOrphanedInventoryItems,
  cleanOrphanedStockTransactions,
  cleanOrphanedPriceHistory,
  cleanOrphanedPOLines,
  runAllCleanup,

  // Backup & restore
  exportDatabase,
  importDatabase,
  createBackupSnapshot,
  restoreFromSnapshot,
  clearInventoryTables
};
