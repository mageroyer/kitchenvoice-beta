// =============================================================================
// IndexedDB Barrel Export
// =============================================================================
//
// This file re-exports all database modules for backwards compatibility.
// All imports from 'indexedDB.js' will continue to work unchanged.
//
// The database has been split into focused modules:
// - db.js: Core Dexie instance, schema, and utilities
// - recipeDB.js: Recipe CRUD operations
// - vendorDB.js: Vendor management
// - inventoryItemDB.js: Inventory item management
// - invoiceDB.js: Invoice and invoice line item processing
// - orderDB.js: Purchase orders and stock transactions
// - supportingDB.js: Department, category, slider, settings, productionLog, priceHistory
//
// =============================================================================

// Core database instance and utilities
export {
  db,
  getCloudSync,
  clearAllLocalData,
  DEFAULT_DEPARTMENTS,
  DEFAULT_CATEGORIES_BY_DEPT
} from './db.js';

// Recipe module
export { recipeDB } from './recipeDB.js';

// Vendor module
export { vendorDB } from './vendorDB.js';

// Inventory item module
export { inventoryItemDB } from './inventoryItemDB.js';

// Invoice modules and constants
export {
  INVOICE_STATUS,
  PAYMENT_STATUS,
  DOCUMENT_TYPE,
  MATCH_STATUS,
  invoiceDB,
  invoiceLineDB
} from './invoiceDB.js';

// Order modules and constants (stock transactions, purchase orders)
export {
  TRANSACTION_TYPE,
  REFERENCE_TYPE,
  PO_STATUS,
  PO_SEND_METHOD,
  stockTransactionDB,
  purchaseOrderDB,
  purchaseOrderLineDB
} from './orderDB.js';

// Supporting modules and constants
export {
  RESTRICTION_LEVELS,
  RESTRICTION_LEVEL_CONFIG,
  departmentDB,
  categoryDB,
  sliderDB,
  kitchenSettingsDB,
  productionLogDB,
  priceHistoryDB
} from './supportingDB.js';

// Default export for backwards compatibility
import { db } from './db.js';
export default db;
