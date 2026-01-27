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
  purchaseOrderLines: '++id, purchaseOrderId, inventoryItemId, [purchaseOrderId+lineNumber], createdAt',

  // Expense Categories: Non-inventory expense classification for accounting
  // Used for utilities, services, rent, etc. - NOT operational departments
  expenseCategories: '++id, name, isDefault, isActive, qbAccountId, createdAt, updatedAt',

  // Expense Records: Non-inventory invoice tracking for accounting
  // Linked to expenseCategories instead of inventoryItems
  expenseRecords: '++id, invoiceId, vendorId, expenseCategoryId, [vendorId+invoiceDate], [expenseCategoryId+invoiceDate], invoiceDate, amount, qbSynced, createdAt, updatedAt'
});

// Version 2: Add deletedItems table for tracking intentional deletions (prevents phantom resurrection)
db.version(2).stores({
  // Deleted Items Tracker: Prevents cloud sync from resurrecting deleted items
  // entityType: 'recipe', 'department', 'category', 'vendor', 'inventoryItem', etc.
  // entityId: The local ID of the deleted item
  // deletedAt: When it was deleted (for potential cleanup of old tombstones)
  deletedItems: '++id, [entityType+entityId], entityType, deletedAt'
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
 * Default expense categories for accounting (non-inventory expenses)
 * @type {Array<{name: string, description: string, isDefault: boolean}>}
 */
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Utilities - Electricity', description: 'Electric bills (Hydro-Québec, etc.)', isDefault: true },
  { name: 'Utilities - Gas', description: 'Natural gas bills (Énergir, etc.)', isDefault: true },
  { name: 'Utilities - Water', description: 'Water and sewer bills', isDefault: true },
  { name: 'Rent', description: 'Building/space rental payments', isDefault: true },
  { name: 'Maintenance & Repairs', description: 'Equipment repairs, HVAC service, etc.', isDefault: true },
  { name: 'Cleaning Services', description: 'Professional cleaning, waste removal', isDefault: true },
  { name: 'Insurance', description: 'Business insurance premiums', isDefault: true },
  { name: 'Professional Services', description: 'Accounting, legal, consulting fees', isDefault: true },
  { name: 'Office Supplies', description: 'Non-inventory office materials', isDefault: true },
  { name: 'Marketing', description: 'Advertising, promotions, signage', isDefault: true },
];

/**
 * Seed database with default expense categories on first run.
 *
 * NOTE: Departments and recipe categories are NO LONGER auto-seeded.
 * They should come from:
 *   1. Cloud sync (existing users)
 *   2. BusinessSetupWizard (new users)
 * This prevents duplicate issues when local seeds conflict with cloud data.
 *
 * @returns {Promise<void>}
 */
const seedDatabase = async () => {
  try {
    // Only seed expense categories (for accounting features)
    // Departments/categories are managed by cloud sync or user setup
    const expenseCatCount = await db.expenseCategories.count();
    if (expenseCatCount === 0) {
      for (const expCat of DEFAULT_EXPENSE_CATEGORIES) {
        await db.expenseCategories.add({
          ...expCat,
          isActive: true,
          qbAccountId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
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
    await db.expenseCategories.clear();
    await db.expenseRecords.clear();
    await db.deletedItems.clear();
    return true;
  } catch (error) {
    console.error('[Database] Error clearing local data:', error);
    return false;
  }
};

// Export database instance and utilities
export { db, getCloudSync, clearAllLocalData, DEFAULT_DEPARTMENTS, DEFAULT_CATEGORIES_BY_DEPT, DEFAULT_EXPENSE_CATEGORIES };
export default db;
