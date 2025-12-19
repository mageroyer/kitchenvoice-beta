/**
 * Core Database Module
 *
 * Foundation module for the SmartCookBook database layer.
 * Provides the Dexie (IndexedDB) instance and schema definitions.
 * All other DB modules import from this file.
 *
 * @module services/database/db
 */

import Dexie from 'dexie';

// Initialize Dexie database
const db = new Dexie('KitchenRecipeDB');

// =============================================================================
// DATABASE SCHEMA v1 - Clean Start (No Legacy)
// =============================================================================
//
// Tables:
// - recipes: Recipe storage with scale integration fields
// - departments: Kitchen departments
// - categories: Recipe categories per department
// - sliders: UI configuration for featured content
// - kitchenSettings: Global settings (keys/values)
// - productionLogs: Auto-generated when tasks complete
// - priceHistory: Historical price records
// - vendors: Vendor/supplier management (single source of truth)
// - inventoryItems: Comprehensive inventory with dual stock tracking
// - invoices: Invoice records with payment tracking
// - invoiceLineItems: Individual parsed line items
// - stockTransactions: Complete inventory movement audit trail
// - purchaseOrders: Purchase order management
// - purchaseOrderLines: PO line items with receive tracking
//
// =============================================================================

db.version(1).stores({
  // Recipes: with scale integration fields (plu, etc.)
  recipes: '++id, name, nameLower, category, department, departmentId, [department+category], portions, plu, updatedAt',

  // Departments & Categories
  departments: '++id, name, isDefault, createdAt',
  categories: '++id, name, departmentId, isDefault, createdAt',

  // UI Configuration
  sliders: '++id, name, location, autoPlay, interval, animation, updatedAt',

  // Settings
  kitchenSettings: '++id, key, value, updatedAt',

  // Production tracking
  productionLogs: '++id, recipeId, taskId, employeeId, employeeName, [recipeId+createdAt], portions, startedAt, completedAt, duration, laborCost, foodCost, totalCost, createdAt',

  // Price history (uses vendorId, not supplierId)
  priceHistory: '++id, inventoryItemId, price, invoiceId, vendorId, recordedAt',

  // Vendors: Single source of truth for all vendor/supplier data
  // isInternal: true for in-house production vendor
  vendors: '++id, name, nameLower, vendorCode, isActive, isPrimary, isInternal, rating, city, province, createdAt, updatedAt',

  // Inventory: Comprehensive tracking with dual stock (quantity + weight)
  inventoryItems: '++id, name, nameNormalized, sku, vendorId, [vendorId+name], category, isActive, currentPrice, lastPurchaseDate, createdAt, updatedAt',

  // Invoices: Full tracking with payment status
  invoices: '++id, vendorId, vendorName, invoiceNumber, invoiceDate, [vendorId+invoiceDate], status, paymentStatus, dueDate, total, createdAt, updatedAt',

  // Invoice line items
  invoiceLineItems: '++id, invoiceId, inventoryItemId, [invoiceId+lineNumber], matchStatus, createdAt',

  // Stock transactions: Complete audit trail
  stockTransactions: '++id, inventoryItemId, transactionType, [inventoryItemId+createdAt], referenceType, referenceId, createdAt',

  // Purchase orders
  purchaseOrders: '++id, orderNumber, vendorId, status, createdAt, expectedDeliveryDate, updatedAt',
  purchaseOrderLines: '++id, purchaseOrderId, inventoryItemId, [purchaseOrderId+lineNumber], createdAt'
});

/**
 * Default departments seeded on first database initialization
 * @type {Array<{name: string, isDefault: boolean}>}
 */
const DEFAULT_DEPARTMENTS = [
  { name: 'Cuisine', isDefault: true },
  { name: 'Bistro', isDefault: true },
  { name: 'Poissonerie', isDefault: true },
  { name: 'Boucherie', isDefault: true },
];

/**
 * Default categories per department (empty by default, user creates categories)
 * @type {Object<string, string[]>}
 */
const DEFAULT_CATEGORIES_BY_DEPT = {
  'Cuisine': [],
  'Bistro': [],
  'Poissonerie': [],
  'Boucherie': [],
};

/**
 * Seed database with default departments and categories on first run
 * Called automatically when database is opened for the first time.
 *
 * @returns {Promise<void>}
 */
const seedDatabase = async () => {
  const deptCount = await db.departments.count();
  if (deptCount === 0) {
    console.log('🌱 Seeding database with default departments and categories...');

    // Add departments
    for (const dept of DEFAULT_DEPARTMENTS) {
      const deptId = await db.departments.add({
        ...dept,
        createdAt: new Date().toISOString()
      });

      // Add categories for this department
      const categories = DEFAULT_CATEGORIES_BY_DEPT[dept.name] || [];
      for (const catName of categories) {
        await db.categories.add({
          name: catName,
          departmentId: deptId,
          isDefault: true,
          createdAt: new Date().toISOString()
        });
      }
    }

    console.log('✅ Database seeded successfully');
  }
};

// Run seed on database open
db.on('ready', seedDatabase);

// ============================================
// Cloud sync integration (lazy loaded to avoid circular imports)
// ============================================

/** @type {Object|null} Cached cloudSync module */
let cloudSync = null;

/**
 * Lazy-load the cloud sync module to avoid circular imports
 *
 * @returns {Promise<Object>} The cloudSync module with sync functions
 */
const getCloudSync = async () => {
  if (!cloudSync) {
    const module = await import('./cloudSync.js');
    cloudSync = module;
  }
  return cloudSync;
};

/**
 * Clear all data from IndexedDB for a fresh start
 * Used when a new user registers to ensure clean slate
 */
const clearAllLocalData = async () => {
  console.log('🧹 Clearing all local data for fresh user setup...');
  try {
    await db.recipes.clear();
    await db.departments.clear();
    await db.categories.clear();
    await db.sliders.clear();
    await db.kitchenSettings.clear();
    await db.productionLogs.clear();
    await db.invoices.clear();
    await db.priceHistory.clear();
    await db.vendors.clear();
    await db.inventoryItems.clear();
    await db.invoiceLineItems.clear();
    await db.stockTransactions.clear();
    await db.purchaseOrders.clear();
    await db.purchaseOrderLines.clear();
    console.log('✅ All local data cleared');
    return true;
  } catch (error) {
    console.error('[Database] Error clearing local data:', error);
    return false;
  }
};

// Export database instance and utilities
export { db, getCloudSync, clearAllLocalData, DEFAULT_DEPARTMENTS, DEFAULT_CATEGORIES_BY_DEPT };
export default db;
