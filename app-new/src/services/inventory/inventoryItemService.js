/**
 * Inventory Item Service
 *
 * Business logic layer for inventory item management operations.
 * Handles validation, stock tracking, and cloud synchronization.
 *
 * @module services/inventory/inventoryItemService
 */

import {
  inventoryItemDB,
  vendorDB,
  stockTransactionDB,
  purchaseOrderLineDB,
  TRANSACTION_TYPE,
  REFERENCE_TYPE
} from '../database/indexedDB';

// ============================================
// Defensive Utilities
// ============================================

/**
 * Safely call a function if it exists, otherwise return fallback
 * @param {Object} obj - Object containing the function
 * @param {string} methodName - Name of the method to call
 * @param {Array} args - Arguments to pass to the method
 * @param {*} fallback - Fallback value if function doesn't exist or fails
 * @returns {Promise<*>} Result or fallback
 */
async function safeCall(obj, methodName, args = [], fallback = null) {
  if (!obj || typeof obj[methodName] !== 'function') {
    console.warn(`[InventoryItemService] ${methodName} is not available, using fallback`);
    return fallback;
  }
  try {
    const result = await obj[methodName](...args);
    return result ?? fallback;
  } catch (error) {
    console.warn(`[InventoryItemService] ${methodName} failed:`, error.message);
    return fallback;
  }
}

/**
 * Get items with fallback chain
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Items array (never null)
 */
async function getItemsWithFallback({ vendorId = null, category = null, activeOnly = false } = {}) {
  let items = null;

  // Try specialized functions first
  if (vendorId) {
    items = await safeCall(inventoryItemDB, 'getByVendor', [vendorId], null);
  } else if (category) {
    items = await safeCall(inventoryItemDB, 'getByCategory', [category], null);
  } else if (activeOnly) {
    items = await safeCall(inventoryItemDB, 'getActive', [], null);
  }

  // Fallback to getAll
  if (items === null) {
    items = await safeCall(inventoryItemDB, 'getAll', [], []);

    // Apply filters manually
    if (Array.isArray(items)) {
      if (vendorId) {
        items = items.filter(i => i && i.vendorId === vendorId);
      }
      if (category) {
        items = items.filter(i => i && i.category === category);
      }
      if (activeOnly) {
        items = items.filter(i => i && (i.isActive === true || i.isActive === 1));
      }
    }
  }

  return Array.isArray(items) ? items : [];
}

// ============================================
// Constants
// ============================================

/**
 * Default thresholds for stock calculations
 */
export const STOCK_THRESHOLDS = {
  CRITICAL: 10,   // Below 10% of par level
  LOW: 25,        // Below 25% of par level
  WARNING: 50,    // Below 50% of par level
  OPTIMAL: 100    // At or above par level
};

/**
 * Default item categories
 */
export const ITEM_CATEGORIES = [
  'Meat',
  'Seafood',
  'Dairy',
  'Produce',
  'Dry Goods',
  'Frozen',
  'Beverages',
  'Bakery',
  'Condiments',
  'Spices',
  'Cleaning',
  'Paper Goods',
  'Other'
];

// ============================================
// Validation Helpers
// ============================================

/**
 * Normalize item name for fuzzy matching
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
export function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Validate inventory item data
 * @param {Object} data - Item data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.isUpdate - True if updating (required fields relaxed)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateItemData(data, { isUpdate = false } = {}) {
  const errors = [];

  // Required fields (only on create)
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      errors.push('Item name is required');
    }
    if (!data.vendorId && data.vendorId !== 0) {
      errors.push('Vendor is required');
    }
    if (!data.unit || typeof data.unit !== 'string' || !data.unit.trim()) {
      errors.push('Stock unit is required');
    }
  }

  // Name length validation
  if (data.name && data.name.trim().length > 200) {
    errors.push('Item name must be 200 characters or less');
  }

  // Stock validation
  if (data.currentStock !== undefined && data.currentStock !== null) {
    if (typeof data.currentStock !== 'number' || data.currentStock < 0) {
      errors.push('Current stock must be a non-negative number');
    }
  }

  // Par level validation
  if (data.parLevel !== undefined && data.parLevel !== null) {
    if (typeof data.parLevel !== 'number' || data.parLevel < 0) {
      errors.push('Par level must be a non-negative number');
    }
  }

  // Reorder point validation
  if (data.reorderPoint !== undefined && data.reorderPoint !== null) {
    if (typeof data.reorderPoint !== 'number' || data.reorderPoint < 0) {
      errors.push('Reorder point must be a non-negative number');
    }
  }

  // Threshold validation (0-100)
  if (data.criticalThreshold !== undefined && data.criticalThreshold !== null) {
    if (typeof data.criticalThreshold !== 'number' || data.criticalThreshold < 0 || data.criticalThreshold > 100) {
      errors.push('Critical threshold must be between 0 and 100');
    }
  }

  if (data.lowStockThreshold !== undefined && data.lowStockThreshold !== null) {
    if (typeof data.lowStockThreshold !== 'number' || data.lowStockThreshold < 0 || data.lowStockThreshold > 100) {
      errors.push('Low stock threshold must be between 0 and 100');
    }
  }

  // Price validation
  if (data.currentPrice !== undefined && data.currentPrice !== null) {
    if (typeof data.currentPrice !== 'number' || data.currentPrice < 0) {
      errors.push('Price must be a non-negative number');
    }
  }

  // Package size validation
  if (data.packageSize !== undefined && data.packageSize !== null) {
    if (typeof data.packageSize !== 'number' || data.packageSize <= 0) {
      errors.push('Package size must be a positive number');
    }
  }

  // Units per package validation
  if (data.unitsPerPackage !== undefined && data.unitsPerPackage !== null) {
    if (typeof data.unitsPerPackage !== 'number' || data.unitsPerPackage <= 0) {
      errors.push('Units per package must be a positive number');
    }
  }

  // Shelf life validation
  if (data.shelfLifeDays !== undefined && data.shelfLifeDays !== null) {
    if (typeof data.shelfLifeDays !== 'number' || data.shelfLifeDays < 0) {
      errors.push('Shelf life must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate stock percentage relative to par level
 * @param {number} currentStock - Current stock level
 * @param {number} parLevel - Par level (target stock)
 * @returns {number} Percentage (0-100+)
 */
export function calculateStockPercent(currentStock, parLevel) {
  if (!parLevel || parLevel <= 0) {
    return currentStock > 0 ? 100 : 0;
  }
  return Math.round((currentStock / parLevel) * 100);
}

/**
 * Get stock status based on percentage
 * @param {number} percent - Stock percentage
 * @param {Object} thresholds - Custom thresholds
 * @returns {string} Status: 'critical', 'low', 'warning', 'optimal'
 */
export function getStockStatus(percent, thresholds = STOCK_THRESHOLDS) {
  if (percent <= thresholds.CRITICAL) return 'critical';
  if (percent <= thresholds.LOW) return 'low';
  if (percent <= thresholds.WARNING) return 'warning';
  return 'optimal';
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new inventory item
 *
 * @param {Object} data - Item data
 * @param {string} data.name - Item name (required)
 * @param {number} data.vendorId - Vendor ID (required)
 * @param {string} data.unit - Stock unit (required, e.g., 'kg', 'L', 'ea')
 * @param {string} [data.description] - Item description
 * @param {string} [data.sku] - SKU/product code
 * @param {string} [data.category] - Item category
 * @param {number} [data.currentStock=0] - Initial stock level
 * @param {number} [data.parLevel] - Target stock level
 * @param {number} [data.reorderPoint] - Reorder trigger level
 * @param {number} [data.reorderQuantity] - Default reorder quantity
 * @param {number} [data.currentPrice] - Current unit price
 * @param {number} [data.packageSize] - Package size
 * @param {string} [data.packageUnit] - Package unit
 * @param {number} [data.unitsPerPackage] - Units per package
 * @param {string[]} [data.aliases] - Alternative names for matching
 * @param {boolean} [data.isActive=true] - Active status
 * @param {string} [data.createdBy] - User ID
 * @param {Object} [options] - Create options
 * @param {boolean} [options.createInitialTransaction=true] - Create initial stock transaction
 * @returns {Promise<Object>} Created item with ID
 * @throws {Error} If validation fails or duplicate exists
 */
export async function createItem(data, { createInitialTransaction = true } = {}) {
  // Validate input
  const validation = validateItemData(data, { isUpdate: false });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Validate vendor exists (defensive)
  const vendor = await safeCall(vendorDB, 'getById', [data.vendorId], null);
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Generate normalized name
  const nameNormalized = normalizeName(data.name);

  // Prepare item data with defaults
  const itemData = {
    ...data,
    nameNormalized,
    vendorName: data.vendorName || vendor.name,
    currentStock: data.currentStock || 0,
    parLevel: data.parLevel || 0,
    reorderPoint: data.reorderPoint || 0,
    reorderQuantity: data.reorderQuantity || 0,
    criticalThreshold: data.criticalThreshold || STOCK_THRESHOLDS.CRITICAL,
    lowStockThreshold: data.lowStockThreshold || STOCK_THRESHOLDS.LOW,
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString()
  };

  try {
    // Check if create function exists
    if (typeof inventoryItemDB?.create !== 'function') {
      throw new Error('Database create function not available');
    }

    // Create item (inventoryItemDB handles duplicate check and sync)
    const id = await inventoryItemDB.create(itemData);
    if (!id) {
      throw new Error('Failed to create item - no ID returned');
    }

    // Create initial stock transaction if there's starting stock (defensive)
    if (createInitialTransaction && itemData.currentStock > 0) {
      const txnType = TRANSACTION_TYPE?.ADJUSTMENT || 'adjustment';
      const refType = REFERENCE_TYPE?.MANUAL || 'manual';

      await safeCall(stockTransactionDB, 'create', [{
        inventoryItemId: id,
        transactionType: txnType,
        quantityChange: itemData.currentStock,
        stockBefore: 0,
        stockAfter: itemData.currentStock,
        unit: itemData.unit,
        referenceType: refType,
        reason: 'Initial stock entry',
        createdBy: data.createdBy
      }], null);
    }

    // Fetch and return the created item
    const item = await safeCall(inventoryItemDB, 'getById', [id], { id, ...itemData });
    return enrichItemWithCalculations(item);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      throw new Error(`An item named "${data.name}" already exists for this vendor. Choose a different name or vendor.`);
    }
    throw new Error(`Failed to create inventory item: ${error.message}`);
  }
}

/**
 * Update an existing inventory item
 *
 * If stock level changes, creates a stock transaction for audit trail.
 *
 * @param {number} id - Item ID
 * @param {Object} data - Fields to update
 * @param {Object} [options] - Update options
 * @param {boolean} [options.trackStockChange=true] - Create transaction for stock changes
 * @param {string} [options.stockChangeReason] - Reason for stock change
 * @param {string} [options.updatedBy] - User ID
 * @returns {Promise<Object>} Updated item
 * @throws {Error} If item not found or validation fails
 */
export async function updateItem(id, data, { trackStockChange = true, stockChangeReason = '', updatedBy = null } = {}) {
  if (!id) {
    throw new Error('Item ID is required');
  }

  // Validate input
  const validation = validateItemData(data, { isUpdate: true });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Check item exists (defensive)
  const existing = await safeCall(inventoryItemDB, 'getById', [id], null);
  if (!existing) {
    throw new Error('Inventory item not found');
  }

  // If vendor is changing, validate new vendor exists (defensive)
  if (data.vendorId !== undefined && data.vendorId !== existing.vendorId) {
    const vendor = await safeCall(vendorDB, 'getById', [data.vendorId], null);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    data.vendorName = vendor.name;
  }

  // Update normalized name if name changes
  if (data.name && data.name !== existing.name) {
    data.nameNormalized = normalizeName(data.name);
  }

  // Track stock changes
  const stockChanged = data.currentStock !== undefined &&
    data.currentStock !== existing.currentStock;

  try {
    // Check if update function exists
    if (typeof inventoryItemDB?.update !== 'function') {
      throw new Error('Database update function not available');
    }

    // Update item (inventoryItemDB handles sync)
    await inventoryItemDB.update(id, {
      ...data,
      updatedAt: new Date().toISOString()
    });

    // Create stock transaction if stock changed (defensive)
    if (stockChanged && trackStockChange) {
      const stockBefore = existing.currentStock || 0;
      const stockAfter = data.currentStock;
      const quantityChange = stockAfter - stockBefore;
      const txnType = TRANSACTION_TYPE?.ADJUSTMENT || 'adjustment';
      const refType = REFERENCE_TYPE?.MANUAL || 'manual';

      await safeCall(stockTransactionDB, 'create', [{
        inventoryItemId: id,
        transactionType: txnType,
        quantityChange,
        stockBefore,
        stockAfter,
        unit: existing.unit,
        referenceType: refType,
        reason: stockChangeReason || 'Manual stock adjustment',
        createdBy: updatedBy
      }], null);
    }

    // Fetch and return updated item
    const item = await safeCall(inventoryItemDB, 'getById', [id], { ...existing, ...data });
    return enrichItemWithCalculations(item);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      throw new Error(`An item named "${data.name}" already exists for this vendor.`);
    }
    throw new Error(`Failed to update inventory item: ${error.message}`);
  }
}

/**
 * Delete an inventory item
 *
 * Checks for pending orders and recipe links before deletion.
 * Performs soft delete by default.
 *
 * @param {number} id - Item ID
 * @param {Object} [options] - Delete options
 * @param {boolean} [options.hardDelete=false] - Permanently delete
 * @param {boolean} [options.deleteTransactions=false] - Also delete stock transactions
 * @param {boolean} [options.force=false] - Delete even with pending orders
 * @returns {Promise<boolean>} True if deleted
 * @throws {Error} If item not found or has pending orders
 */
export async function deleteItem(id, { hardDelete = false, deleteTransactions = false, force = false } = {}) {
  if (!id) {
    throw new Error('Item ID is required');
  }

  // Check item exists (defensive)
  const existing = await safeCall(inventoryItemDB, 'getById', [id], null);
  if (!existing) {
    throw new Error('Inventory item not found');
  }

  // Check for pending order lines (defensive)
  if (!force) {
    const pendingLines = await safeCall(purchaseOrderLineDB, 'getPendingByInventoryItem', [id], []);
    if (Array.isArray(pendingLines) && pendingLines.length > 0) {
      throw new Error(
        `Cannot delete item. ${pendingLines.length} pending purchase order${pendingLines.length === 1 ? '' : 's'} ` +
        `include this item. Complete or cancel the orders first.`
      );
    }
  }

  try {
    if (hardDelete) {
      // Delete stock transactions if requested (defensive)
      if (deleteTransactions) {
        const transactions = await safeCall(stockTransactionDB, 'getByInventoryItem', [id, { limit: 10000, includeVoided: true }], []);
        if (Array.isArray(transactions)) {
          for (const t of transactions) {
            if (t && t.id) {
              await safeCall(stockTransactionDB, 'void', [t.id, 'Item deleted', null], null);
            }
          }
        }
      }

      const deleted = await safeCall(inventoryItemDB, 'hardDelete', [id], false);
      return deleted !== false;
    } else {
      const deleted = await safeCall(inventoryItemDB, 'delete', [id], false);
      return deleted !== false;
    }
  } catch (error) {
    throw new Error(`Failed to delete inventory item: ${error.message}`);
  }
}

/**
 * Get an inventory item by ID
 *
 * @param {number} id - Item ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeVendor=true] - Include vendor info
 * @param {boolean} [options.includeCalculations=true] - Include stock calculations
 * @returns {Promise<Object|null>} Item with enrichments or null if not found
 */
export async function getItem(id, { includeVendor = true, includeCalculations = true } = {}) {
  if (!id) return null;

  try {
    const item = await safeCall(inventoryItemDB, 'getById', [id], null);
    if (!item) {
      return null;
    }

    let enrichedItem = { ...item };

    // Add vendor info if requested and not already denormalized (defensive)
    if (includeVendor && item.vendorId && !item.vendorName) {
      const vendor = await safeCall(vendorDB, 'getById', [item.vendorId], null);
      if (vendor) {
        enrichedItem.vendorName = vendor.name;
        enrichedItem.vendorCode = vendor.vendorCode;
      }
    }

    // Add calculations if requested
    if (includeCalculations) {
      enrichedItem = enrichItemWithCalculations(enrichedItem);
    }

    return enrichedItem;
  } catch (error) {
    console.warn('[InventoryItemService] getItem error:', error.message);
    return null; // Return null instead of throwing
  }
}

/**
 * Get all inventory items with optional filters
 *
 * @param {Object} [filters] - Filter options
 * @param {string} [filters.category] - Filter by category
 * @param {number} [filters.vendorId] - Filter by vendor
 * @param {boolean} [filters.isActive] - Filter by active status
 * @param {string} [filters.search] - Search query
 * @param {string} [filters.status] - Stock status filter ('critical', 'low', 'warning', 'optimal')
 * @param {string} [filters.sortBy='name'] - Sort field
 * @param {boolean} [filters.sortDesc=false] - Sort descending
 * @returns {Promise<Object[]>} Array of items with calculations
 */
export async function getAllItems(filters = {}) {
  try {
    let items = [];

    // Start with appropriate base query using defensive helper
    if (filters.search) {
      items = await safeCall(inventoryItemDB, 'search', [filters.search, { limit: 500 }], []);
    } else {
      items = await getItemsWithFallback({
        vendorId: filters.vendorId,
        category: filters.category,
        activeOnly: filters.isActive === true
      });
    }

    // Ensure items is an array
    if (!Array.isArray(items)) {
      items = [];
    }

    // Apply additional filters
    if (filters.isActive === false) {
      items = items.filter(i => i && (i.isActive === false || i.isActive === 0));
    }

    if (filters.category && !filters.vendorId) {
      items = items.filter(i => i && i.category === filters.category);
    }

    // Enrich items with calculations
    items = items.filter(i => i != null).map(item => enrichItemWithCalculations(item));

    // Filter by stock status
    if (filters.status) {
      items = items.filter(i => i && i.stockStatus === filters.status);
    }

    // Sort
    const sortBy = filters.sortBy || 'name';
    const sortDesc = filters.sortDesc || false;

    if (sortBy === 'urgency') {
      // Sort by stock percent ascending (most urgent first)
      items.sort((a, b) => (a?.stockPercent || 0) - (b?.stockPercent || 0));
    } else {
      items.sort((a, b) => {
        const aVal = a?.[sortBy] || '';
        const bVal = b?.[sortBy] || '';
        const comparison = typeof aVal === 'string'
          ? aVal.localeCompare(bVal)
          : aVal - bVal;
        return sortDesc ? -comparison : comparison;
      });
    }

    return items;
  } catch (error) {
    console.warn('[InventoryItemService] getAllItems error:', error.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Search inventory items by query
 *
 * Returns all items matching the query across all vendors.
 * Includes vendor name for disambiguation.
 *
 * @param {string} query - Search query
 * @param {Object} [options] - Search options
 * @param {number} [options.limit=50] - Max results
 * @param {boolean} [options.activeOnly=true] - Only active items
 * @returns {Promise<Object[]>} Matching items sorted by relevance, then vendor
 */
export async function searchItems(query, { limit = 50, activeOnly = true } = {}) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return [];
  }

  try {
    // Get matches from database (defensive)
    let results = await safeCall(inventoryItemDB, 'search', [normalizedQuery, { limit: limit * 2, activeOnly }], []);
    if (!Array.isArray(results)) results = [];

    // Enrich with vendor info and calculations
    const enriched = await Promise.all(results.filter(i => i != null).map(async (item) => {
      let enrichedItem = enrichItemWithCalculations(item);

      // Add vendor info if not present (defensive)
      if (item.vendorId && !item.vendorName) {
        const vendor = await safeCall(vendorDB, 'getById', [item.vendorId], null);
        if (vendor) {
          enrichedItem.vendorName = vendor.name;
        }
      }

      // Calculate relevance score
      const nameLower = (item.name || '').toLowerCase();
      let score = 0;

      if (nameLower === normalizedQuery) score = 100;
      else if (nameLower.startsWith(normalizedQuery)) score = 80;
      else if (nameLower.includes(normalizedQuery)) score = 60;
      else if (item.aliases?.some(a => normalizeName(a).includes(normalizedQuery))) score = 40;

      enrichedItem._relevanceScore = score;
      return enrichedItem;
    }));

    // Sort by relevance, then vendor name
    enriched.sort((a, b) => {
      if (b._relevanceScore !== a._relevanceScore) {
        return b._relevanceScore - a._relevanceScore;
      }
      return (a?.vendorName || '').localeCompare(b?.vendorName || '');
    });

    // Remove internal score and limit
    return enriched.slice(0, limit).map(({ _relevanceScore, ...item }) => item);
  } catch (error) {
    console.warn('[InventoryItemService] searchItems error:', error.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Get items by vendor
 *
 * @param {number} vendorId - Vendor ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.activeOnly=false] - Only active items
 * @returns {Promise<Object[]>} Items for the vendor
 */
export async function getItemsByVendor(vendorId, { activeOnly = false } = {}) {
  if (!vendorId) return [];

  try {
    let items = await safeCall(inventoryItemDB, 'getByVendor', [vendorId], []);
    if (!Array.isArray(items)) items = [];

    if (activeOnly) {
      items = items.filter(i => i && (i.isActive === true || i.isActive === 1));
    }

    return items.filter(i => i != null).map(item => enrichItemWithCalculations(item));
  } catch (error) {
    console.warn('[InventoryItemService] getItemsByVendor error:', error.message);
    return [];
  }
}

/**
 * Get all items with a specific name (across vendors)
 *
 * Useful for finding the same product from different vendors.
 *
 * @param {string} name - Item name to search
 * @returns {Promise<Object[]>} Items with matching name from different vendors
 */
export async function getItemsByName(name) {
  if (!name || typeof name !== 'string') {
    return [];
  }

  const normalizedName = normalizeName(name);

  try {
    // Get all items and filter by normalized name (defensive)
    const allItems = await safeCall(inventoryItemDB, 'getAll', [], []);
    if (!Array.isArray(allItems)) return [];

    const matches = allItems.filter(item => {
      if (!item) return false;
      const itemNormalized = item.nameNormalized || normalizeName(item.name);
      return itemNormalized === normalizedName;
    });

    // Enrich with vendor info (defensive)
    const enriched = await Promise.all(matches.map(async (item) => {
      let enrichedItem = enrichItemWithCalculations(item);

      if (item.vendorId && !item.vendorName) {
        const vendor = await safeCall(vendorDB, 'getById', [item.vendorId], null);
        if (vendor) {
          enrichedItem.vendorName = vendor.name;
        }
      }

      return enrichedItem;
    }));

    // Sort by vendor name
    enriched.sort((a, b) => (a?.vendorName || '').localeCompare(b?.vendorName || ''));

    return enriched;
  } catch (error) {
    console.warn('[InventoryItemService] getItemsByName error:', error.message);
    return [];
  }
}

// ============================================
// Stock Level Functions
// ============================================

/**
 * Get items with low stock
 *
 * @param {number} [threshold=25] - Percentage threshold (default 25%)
 * @returns {Promise<Object[]>} Items below threshold, sorted by percentage ascending
 */
export async function getLowStockItems(threshold = STOCK_THRESHOLDS.LOW) {
  try {
    const items = await safeCall(inventoryItemDB, 'getActive', [], []);
    if (!Array.isArray(items)) return [];

    // Calculate percentages and filter
    const lowStock = items
      .filter(item => item != null)
      .map(item => enrichItemWithCalculations(item))
      .filter(item => item && item.stockPercent < threshold);

    // Sort by percentage ascending (most urgent first)
    lowStock.sort((a, b) => (a?.stockPercent || 0) - (b?.stockPercent || 0));

    return lowStock;
  } catch (error) {
    console.warn('[InventoryItemService] getLowStockItems error:', error.message);
    return [];
  }
}

/**
 * Get items with critical stock levels
 *
 * @returns {Promise<Object[]>} Items below critical threshold
 */
export async function getCriticalStockItems() {
  try {
    const items = await safeCall(inventoryItemDB, 'getActive', [], []);
    if (!Array.isArray(items)) return [];

    // Calculate percentages and filter by critical
    const critical = items
      .filter(item => item != null)
      .map(item => enrichItemWithCalculations(item))
      .filter(item => {
        if (!item) return false;
        const criticalThreshold = item.criticalThreshold || STOCK_THRESHOLDS.CRITICAL;
        return item.stockPercent <= criticalThreshold;
      });

    // Sort by percentage ascending
    critical.sort((a, b) => (a?.stockPercent || 0) - (b?.stockPercent || 0));

    return critical;
  } catch (error) {
    console.warn('[InventoryItemService] getCriticalStockItems error:', error.message);
    return [];
  }
}

/**
 * Get in-house produced items (from internal vendor)
 *
 * These are items created from completed recipe tasks.
 *
 * @param {Object} [filters] - Filter options
 * @param {string} [filters.department] - Filter by source department
 * @param {boolean} [filters.activeOnly=true] - Only active items
 * @returns {Promise<Object[]>} Array of in-house inventory items
 */
export async function getInHouseItems({ department = null, activeOnly = true } = {}) {
  try {
    // Get internal vendor (defensive)
    const internalVendor = await safeCall(vendorDB, 'getInternal', [], null);
    if (!internalVendor) {
      return [];
    }

    // Get items from internal vendor (defensive)
    let items = await safeCall(inventoryItemDB, 'getByVendor', [internalVendor.id], []);
    if (!Array.isArray(items)) items = [];

    // Filter active only
    if (activeOnly) {
      items = items.filter(item => item && item.isActive !== false && item.isActive !== 0);
    }

    // Filter by department
    if (department) {
      items = items.filter(item => item && item.sourceDepartment === department);
    }

    // Enrich with calculations
    items = items.filter(i => i != null).map(item => enrichItemWithCalculations(item));

    // Sort by name
    items.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));

    return items;
  } catch (error) {
    console.warn('[InventoryItemService] getInHouseItems error:', error.message);
    return [];
  }
}

/**
 * Get items that need reordering, grouped by vendor
 *
 * @param {Object} [options] - Options
 * @param {number} [options.threshold] - Custom threshold percentage
 * @returns {Promise<Object>} Object with vendorId as keys, item arrays as values
 */
export async function getItemsForReorder({ threshold = STOCK_THRESHOLDS.LOW } = {}) {
  try {
    // Get low stock items
    const lowStock = await getLowStockItems(threshold);

    // Filter to only items with vendors
    const reorderable = lowStock.filter(item => item && item.vendorId);

    // Group by vendor
    const byVendor = {};

    for (const item of reorderable) {
      const vendorId = item.vendorId;

      if (!byVendor[vendorId]) {
        // Get vendor info (defensive)
        const vendor = await safeCall(vendorDB, 'getById', [vendorId], null);
        byVendor[vendorId] = {
          vendorId,
          vendorName: vendor?.name || item.vendorName || 'Unknown',
          vendorCode: vendor?.vendorCode || '',
          vendorEmail: vendor?.orderEmail || vendor?.email || '',
          items: [],
          totalValue: 0
        };
      }

      // Calculate suggested order quantity
      const suggestedQuantity = item.reorderQuantity ||
        Math.max(0, (item.parLevel || 0) - (item.currentStock || 0));

      const itemWithSuggestion = {
        ...item,
        suggestedQuantity,
        suggestedValue: suggestedQuantity * (item.currentPrice || 0)
      };

      byVendor[vendorId].items.push(itemWithSuggestion);
      byVendor[vendorId].totalValue += itemWithSuggestion.suggestedValue;
    }

    // Round totals
    for (const vendorId in byVendor) {
      byVendor[vendorId].totalValue = Math.round(byVendor[vendorId].totalValue * 100) / 100;
      byVendor[vendorId].itemCount = byVendor[vendorId].items.length;
    }

    return byVendor;
  } catch (error) {
    console.warn('[InventoryItemService] getItemsForReorder error:', error.message);
    return {};
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Enrich item with stock calculations
 * @param {Object} item - Item to enrich
 * @returns {Object} Item with stockPercent, stockStatus, etc.
 */
function enrichItemWithCalculations(item) {
  const currentStock = item.currentStock || 0;
  const parLevel = item.parLevel || 0;

  const stockPercent = calculateStockPercent(currentStock, parLevel);
  const stockStatus = getStockStatus(stockPercent, {
    CRITICAL: item.criticalThreshold || STOCK_THRESHOLDS.CRITICAL,
    LOW: item.lowStockThreshold || STOCK_THRESHOLDS.LOW,
    WARNING: STOCK_THRESHOLDS.WARNING,
    OPTIMAL: STOCK_THRESHOLDS.OPTIMAL
  });

  const needsReorder = parLevel > 0 &&
    currentStock <= (item.reorderPoint || parLevel * 0.25);

  const quantityToReorder = needsReorder
    ? (item.reorderQuantity || Math.max(0, parLevel - currentStock))
    : 0;

  // Calculate inventory value
  const inventoryValue = currentStock * (item.currentPrice || 0);

  return {
    ...item,
    stockPercent,
    stockStatus,
    needsReorder,
    quantityToReorder,
    inventoryValue: Math.round(inventoryValue * 100) / 100
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if an item name is available for a vendor
 *
 * @param {string} name - Item name
 * @param {number} vendorId - Vendor ID
 * @param {number} [excludeId] - Item ID to exclude (for updates)
 * @returns {Promise<boolean>} True if name is available
 */
export async function isItemNameAvailable(name, vendorId, excludeId = null) {
  if (!name || typeof name !== 'string' || !vendorId) {
    return false;
  }

  try {
    const existing = await safeCall(inventoryItemDB, 'getByVendorAndName', [vendorId, name.trim()], null);
    if (!existing) {
      return true;
    }
    return excludeId !== null && existing.id === excludeId;
  } catch (error) {
    console.warn('[InventoryItemService] isItemNameAvailable error:', error.message);
    return true; // Assume available if check fails
  }
}

/**
 * Get unique categories from all items
 *
 * @returns {Promise<string[]>} Sorted array of unique categories
 */
export async function getCategories() {
  try {
    const categories = await safeCall(inventoryItemDB, 'getCategories', [], []);
    return Array.isArray(categories) ? categories : [];
  } catch (error) {
    console.warn('[InventoryItemService] getCategories error:', error.message);
    return [];
  }
}

/**
 * Add an alias to an item for fuzzy matching
 *
 * @param {number} id - Item ID
 * @param {string} alias - Alias to add
 * @returns {Promise<boolean>}
 */
export async function addItemAlias(id, alias) {
  if (!id || !alias || typeof alias !== 'string') {
    return false;
  }

  try {
    const result = await safeCall(inventoryItemDB, 'addAlias', [id, alias.trim()], false);
    return result !== false;
  } catch (error) {
    console.warn('[InventoryItemService] addItemAlias error:', error.message);
    return false;
  }
}

/**
 * Remove an alias from an item
 *
 * @param {number} id - Item ID
 * @param {string} alias - Alias to remove
 * @returns {Promise<boolean>}
 */
export async function removeItemAlias(id, alias) {
  if (!id || !alias) {
    return false;
  }

  try {
    const result = await safeCall(inventoryItemDB, 'removeAlias', [id, alias], false);
    return result !== false;
  } catch (error) {
    console.warn('[InventoryItemService] removeItemAlias error:', error.message);
    return false;
  }
}

/**
 * Get item stock history (transactions)
 *
 * @param {number} id - Item ID
 * @param {Object} [options] - Options
 * @param {number} [options.limit=50] - Max transactions
 * @returns {Promise<Object[]>} Stock transactions with running balance
 */
export async function getItemStockHistory(id, { limit = 50 } = {}) {
  if (!id) return [];

  try {
    const history = await safeCall(stockTransactionDB, 'getItemHistory', [id, { limit }], []);
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.warn('[InventoryItemService] getItemStockHistory error:', error.message);
    return [];
  }
}

/**
 * Get inventory summary statistics
 *
 * @returns {Promise<Object>} Summary stats
 */
export async function getInventorySummary() {
  try {
    const items = await safeCall(inventoryItemDB, 'getActive', [], []);
    const safeItems = Array.isArray(items) ? items.filter(i => i != null) : [];

    const summary = {
      totalItems: safeItems.length,
      totalValue: 0,
      criticalCount: 0,
      lowCount: 0,
      warningCount: 0,
      optimalCount: 0,
      needsReorderCount: 0,
      categories: new Set(),
      vendors: new Set()
    };

    for (const item of safeItems) {
      const enriched = enrichItemWithCalculations(item);

      summary.totalValue += enriched.inventoryValue || 0;

      switch (enriched.stockStatus) {
        case 'critical': summary.criticalCount++; break;
        case 'low': summary.lowCount++; break;
        case 'warning': summary.warningCount++; break;
        case 'optimal': summary.optimalCount++; break;
      }

      if (enriched.needsReorder) {
        summary.needsReorderCount++;
      }

      if (item.category) summary.categories.add(item.category);
      if (item.vendorId) summary.vendors.add(item.vendorId);
    }

    summary.totalValue = Math.round(summary.totalValue * 100) / 100;
    summary.categoryCount = summary.categories.size;
    summary.vendorCount = summary.vendors.size;
    summary.categories = Array.from(summary.categories).sort();

    return summary;
  } catch (error) {
    console.warn('[InventoryItemService] getInventorySummary error:', error.message);
    return {
      totalItems: 0,
      totalValue: 0,
      criticalCount: 0,
      lowCount: 0,
      warningCount: 0,
      optimalCount: 0,
      needsReorderCount: 0,
      categories: [],
      categoryCount: 0,
      vendors: new Set(),
      vendorCount: 0
    };
  }
}

// ============================================
// Export all functions
// ============================================

export default {
  // Constants
  STOCK_THRESHOLDS,
  ITEM_CATEGORIES,

  // Validation
  normalizeName,
  validateItemData,
  calculateStockPercent,
  getStockStatus,

  // CRUD
  createItem,
  updateItem,
  deleteItem,
  getItem,
  getAllItems,
  searchItems,
  getItemsByVendor,
  getItemsByName,

  // Stock levels
  getLowStockItems,
  getCriticalStockItems,
  getInHouseItems,
  getItemsForReorder,

  // Utilities
  isItemNameAvailable,
  getCategories,
  addItemAlias,
  removeItemAlias,
  getItemStockHistory,
  getInventorySummary
};
