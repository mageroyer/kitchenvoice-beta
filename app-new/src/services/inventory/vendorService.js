/**
 * Vendor Service
 *
 * Business logic layer for vendor management operations.
 * Handles validation, database operations, and cloud synchronization.
 *
 * @module services/inventory/vendorService
 */

import { vendorDB, inventoryItemDB } from '../database/indexedDB';
import { isValidEmail } from '../../utils/validation';

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
    console.warn(`[VendorService] ${methodName} is not available, using fallback`);
    return fallback;
  }
  try {
    const result = await obj[methodName](...args);
    return result ?? fallback;
  } catch (error) {
    console.warn(`[VendorService] ${methodName} failed:`, error.message);
    return fallback;
  }
}

/**
 * Get vendors with fallback chain
 * Tries specialized functions first, falls back to getAll
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Vendors array (never null)
 */
async function getVendorsWithFallback({ activeOnly = false, externalOnly = true } = {}) {
  let vendors = null;

  // Try specialized functions first
  if (activeOnly && externalOnly) {
    vendors = await safeCall(vendorDB, 'getActiveExternal', [], null);
  } else if (externalOnly) {
    vendors = await safeCall(vendorDB, 'getExternal', [], null);
  } else if (activeOnly) {
    vendors = await safeCall(vendorDB, 'getActive', [], null);
  }

  // Fallback to getAll and filter manually
  if (vendors === null) {
    vendors = await safeCall(vendorDB, 'getAll', [], []);

    // Apply filters manually
    if (Array.isArray(vendors)) {
      if (externalOnly) {
        vendors = vendors.filter(v => v.isInternal !== true && v.isInternal !== 1);
      }
      if (activeOnly) {
        vendors = vendors.filter(v => v.isActive === true || v.isActive === 1);
      }
    }
  }

  return Array.isArray(vendors) ? vendors : [];
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate phone number format
 * Accepts various formats: (555) 555-5555, 555-555-5555, +1-555-555-5555, etc.
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid format or empty
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return true; // Empty is valid (optional field)
  }

  const trimmed = phone.trim();
  if (trimmed === '') {
    return true;
  }

  // Remove common formatting characters for validation
  const digitsOnly = trimmed.replace(/[\s\-\.\(\)\+]/g, '');

  // Must have 10-15 digits (accommodates international)
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    return false;
  }

  return true;
}

/**
 * Validate vendor data
 * @param {Object} data - Vendor data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.isUpdate - True if updating (name not required)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateVendorData(data, { isUpdate = false } = {}) {
  const errors = [];

  // Required fields (only on create)
  if (!isUpdate) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      errors.push('Vendor name is required');
    }
  }

  // Name length validation
  if (data.name && data.name.trim().length > 200) {
    errors.push('Vendor name must be 200 characters or less');
  }

  // Email validation
  if (data.email && data.email.trim()) {
    if (!isValidEmail(data.email)) {
      errors.push('Invalid email format');
    }
  }

  // Order email validation (separate email for orders)
  if (data.orderEmail && data.orderEmail.trim()) {
    if (!isValidEmail(data.orderEmail)) {
      errors.push('Invalid order email format');
    }
  }

  // Phone validation
  if (data.phone && !isValidPhone(data.phone)) {
    errors.push('Invalid phone number format');
  }

  // Order phone validation
  if (data.orderPhone && !isValidPhone(data.orderPhone)) {
    errors.push('Invalid order phone number format');
  }

  // Fax validation
  if (data.fax && !isValidPhone(data.fax)) {
    errors.push('Invalid fax number format');
  }

  // Rating validation
  if (data.rating !== undefined && data.rating !== null) {
    if (typeof data.rating !== 'number' || data.rating < 0 || data.rating > 5) {
      errors.push('Rating must be a number between 0 and 5');
    }
  }

  // Minimum order validation
  if (data.minimumOrder !== undefined && data.minimumOrder !== null) {
    if (typeof data.minimumOrder !== 'number' || data.minimumOrder < 0) {
      errors.push('Minimum order must be a non-negative number');
    }
  }

  // Lead time validation
  if (data.leadTimeDays !== undefined && data.leadTimeDays !== null) {
    if (typeof data.leadTimeDays !== 'number' || data.leadTimeDays < 0) {
      errors.push('Lead time must be a non-negative number');
    }
  }

  // Postal code validation (Canadian format)
  if (data.postalCode && data.postalCode.trim()) {
    const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
    if (!postalRegex.test(data.postalCode.trim())) {
      errors.push('Invalid postal code format (use A1A 1A1)');
    }
  }

  // Website URL validation
  if (data.website && data.website.trim()) {
    try {
      new URL(data.website.trim().startsWith('http') ? data.website.trim() : `https://${data.website.trim()}`);
    } catch {
      errors.push('Invalid website URL format');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new vendor
 *
 * @param {Object} data - Vendor data
 * @param {string} data.name - Vendor name (required)
 * @param {string} [data.legalName] - Legal business name
 * @param {string} [data.vendorCode] - Unique vendor code
 * @param {string} [data.email] - Primary contact email
 * @param {string} [data.phone] - Primary contact phone
 * @param {string} [data.contactName] - Contact person name
 * @param {string} [data.address] - Street address
 * @param {string} [data.city] - City
 * @param {string} [data.province] - Province/State
 * @param {string} [data.postalCode] - Postal/ZIP code
 * @param {string} [data.country] - Country
 * @param {string} [data.paymentTerms] - Payment terms (e.g., "Net 30", "COD")
 * @param {number} [data.minimumOrder] - Minimum order amount
 * @param {string} [data.deliveryDays] - Delivery days
 * @param {number} [data.leadTimeDays] - Lead time in days
 * @param {string} [data.orderEmail] - Email for orders
 * @param {string} [data.orderPhone] - Phone for orders
 * @param {boolean} [data.isActive] - Active status (default: true)
 * @param {boolean} [data.isPrimary] - Primary vendor flag
 * @param {number} [data.rating] - Vendor rating 0-5
 * @param {string} [data.notes] - Additional notes
 * @param {string} [data.createdBy] - User ID who created
 * @returns {Promise<Object>} Created vendor with ID
 * @throws {Error} If validation fails or database error
 */
export async function createVendor(data) {
  // Validate input
  const validation = validateVendorData(data, { isUpdate: false });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Prepare data with defaults
  const vendorData = {
    ...data,
    isActive: data.isActive !== false,
    createdAt: new Date().toISOString()
  };

  try {
    // Check if create function exists
    if (typeof vendorDB?.create !== 'function') {
      throw new Error('Database create function not available');
    }

    // Create vendor (vendorDB handles defaults, sync, and duplicate check)
    const id = await vendorDB.create(vendorData);
    if (!id) {
      throw new Error('Failed to create vendor - no ID returned');
    }

    // Fetch and return the created vendor
    const vendor = await safeCall(vendorDB, 'getById', [id], { id, ...vendorData });
    return vendor;
  } catch (error) {
    // Re-throw with user-friendly message
    if (error.message?.includes('already exists')) {
      throw new Error(`A vendor named "${data.name}" already exists. Please use a different name.`);
    }
    throw new Error(`Failed to create vendor: ${error.message}`);
  }
}

/**
 * Update an existing vendor
 *
 * @param {number} id - Vendor ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated vendor
 * @throws {Error} If vendor not found, validation fails, or database error
 */
export async function updateVendor(id, data) {
  if (!id) {
    throw new Error('Vendor ID is required');
  }

  // Validate input
  const validation = validateVendorData(data, { isUpdate: true });
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Check vendor exists
  const existing = await safeCall(vendorDB, 'getById', [id], null);
  if (!existing) {
    throw new Error('Vendor not found');
  }

  // Prepare update data
  const updateData = {
    ...data,
    updatedAt: new Date().toISOString()
  };

  try {
    // Check if update function exists
    if (typeof vendorDB?.update !== 'function') {
      throw new Error('Database update function not available');
    }

    // Update vendor (vendorDB handles sync)
    await vendorDB.update(id, updateData);

    // Fetch and return updated vendor
    const vendor = await safeCall(vendorDB, 'getById', [id], { ...existing, ...updateData });
    return vendor;
  } catch (error) {
    if (error.message?.includes('already exists')) {
      throw new Error(`A vendor named "${data.name}" already exists. Please use a different name.`);
    }
    throw new Error(`Failed to update vendor: ${error.message}`);
  }
}

/**
 * Delete a vendor
 *
 * Checks for linked inventory items before deletion.
 * Performs soft delete (sets isActive: false) by default.
 *
 * @param {number} id - Vendor ID
 * @param {Object} options - Delete options
 * @param {boolean} [options.hardDelete=false] - Permanently delete
 * @param {boolean} [options.force=false] - Delete even if items linked
 * @returns {Promise<boolean>} True if deleted
 * @throws {Error} If vendor not found or has linked items
 */
export async function deleteVendor(id, { hardDelete = false, force = false } = {}) {
  if (!id) {
    throw new Error('Vendor ID is required');
  }

  // Check vendor exists
  const existing = await safeCall(vendorDB, 'getById', [id], null);
  if (!existing) {
    throw new Error('Vendor not found');
  }

  // Check for linked inventory items
  if (!force) {
    const linkedItems = await safeCall(inventoryItemDB, 'getByVendor', [id], []);
    if (Array.isArray(linkedItems) && linkedItems.length > 0) {
      throw new Error(
        `Cannot delete vendor. ${linkedItems.length} inventory item${linkedItems.length === 1 ? ' is' : 's are'} ` +
        `linked to this vendor. Remove or reassign the items first.`
      );
    }
  }

  try {
    if (hardDelete) {
      const deleted = await safeCall(vendorDB, 'hardDelete', [id], false);
      return deleted !== false;
    } else {
      const deleted = await safeCall(vendorDB, 'delete', [id], false);
      return deleted !== false;
    }
  } catch (error) {
    throw new Error(`Failed to delete vendor: ${error.message}`);
  }
}

/**
 * Get a vendor by ID
 *
 * @param {number} id - Vendor ID
 * @returns {Promise<Object|null>} Vendor object or null if not found
 */
export async function getVendor(id) {
  if (!id) return null;

  try {
    const vendor = await safeCall(vendorDB, 'getById', [id], null);
    return vendor || null;
  } catch (error) {
    console.warn('[VendorService] getVendor error:', error.message);
    return null; // Return null instead of throwing
  }
}

/**
 * Get all vendors with optional filters
 *
 * By default, excludes the internal business vendor.
 * Set includeInternal: true to include it.
 *
 * @param {Object} [filters] - Filter options
 * @param {boolean} [filters.isActive] - Filter by active status
 * @param {boolean} [filters.isPrimary] - Filter by primary status
 * @param {string} [filters.search] - Search query
 * @param {string} [filters.city] - Filter by city
 * @param {string} [filters.province] - Filter by province
 * @param {number} [filters.minRating] - Minimum rating filter
 * @param {boolean} [filters.includeInternal=false] - Include internal business vendor
 * @returns {Promise<Object[]>} Array of vendors sorted by name
 */
export async function getAllVendors(filters = {}) {
  try {
    let vendors = [];

    // Start with appropriate base query using defensive fallback
    if (filters.isPrimary === true) {
      vendors = await safeCall(vendorDB, 'getPrimary', [], []);
    } else if (filters.search) {
      vendors = await safeCall(vendorDB, 'search', [filters.search, { limit: 100 }], []);
    } else {
      // Use defensive helper with fallback chain
      vendors = await getVendorsWithFallback({
        activeOnly: filters.isActive === true,
        externalOnly: !filters.includeInternal
      });
    }

    // Ensure vendors is always an array
    if (!Array.isArray(vendors)) {
      vendors = [];
    }

    // Filter out internal vendor from search/primary results (unless includeInternal)
    if (!filters.includeInternal && (filters.isPrimary || filters.search)) {
      vendors = vendors.filter(v => v && v.isInternal !== true && v.isInternal !== 1);
    }

    // Apply additional filters
    if (filters.isActive === false) {
      vendors = vendors.filter(v => v && (v.isActive === false || v.isActive === 0));
    }

    if (filters.city) {
      const cityLower = filters.city.toLowerCase();
      vendors = vendors.filter(v => v && v.city?.toLowerCase() === cityLower);
    }

    if (filters.province) {
      const provinceLower = filters.province.toLowerCase();
      vendors = vendors.filter(v => v && v.province?.toLowerCase() === provinceLower);
    }

    if (typeof filters.minRating === 'number') {
      vendors = vendors.filter(v => v && (v.rating || 0) >= filters.minRating);
    }

    // Sort by name
    vendors.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));

    return vendors;
  } catch (error) {
    console.warn('[VendorService] getAllVendors error:', error.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Get the internal business vendor
 *
 * This vendor represents in-house production (sauces, prep items, finished dishes).
 * Used when completing tasks to add produced items to inventory.
 *
 * @returns {Promise<Object|null>} Internal vendor or null if not found
 */
export async function getInternalVendor() {
  try {
    const vendor = await safeCall(vendorDB, 'getInternal', [], null);
    return vendor || null;
  } catch (error) {
    console.warn('[VendorService] getInternalVendor error:', error.message);
    return null; // Return null instead of throwing
  }
}

/**
 * Search vendors by query
 *
 * Searches name and legalName fields.
 * Excludes internal business vendor by default.
 *
 * @param {string} query - Search query
 * @param {Object} [options] - Search options
 * @param {number} [options.limit=20] - Max results
 * @param {boolean} [options.activeOnly=false] - Only active vendors
 * @param {boolean} [options.includeInternal=false] - Include internal business vendor
 * @returns {Promise<Object[]>} Matching vendors sorted by relevance
 */
export async function searchVendors(query, { limit = 20, activeOnly = false, includeInternal = false } = {}) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  try {
    // Get candidates from indexed name search (with fallback to empty array)
    let results = await safeCall(vendorDB, 'search', [normalizedQuery, { limit: limit * 2, activeOnly }], []);
    if (!Array.isArray(results)) results = [];

    // Also search legalName using defensive helper
    const allVendors = await getVendorsWithFallback({
      activeOnly,
      externalOnly: !includeInternal
    });

    const legalNameMatches = allVendors.filter(v =>
      v && v.legalName?.toLowerCase().includes(normalizedQuery) &&
      !results.some(r => r && r.id === v.id)
    );

    results = [...results, ...legalNameMatches];

    // Filter out internal vendor if not included
    if (!includeInternal) {
      results = results.filter(v => v && v.isInternal !== true && v.isInternal !== 1);
    }

    // Score and sort by relevance
    const scored = results
      .filter(vendor => vendor != null)
      .map(vendor => {
        let score = 0;
        const nameLower = (vendor.name || '').toLowerCase();
        const legalNameLower = (vendor.legalName || '').toLowerCase();

        // Exact match gets highest score
        if (nameLower === normalizedQuery) score += 100;
        else if (legalNameLower === normalizedQuery) score += 90;
        // Starts with gets high score
        else if (nameLower.startsWith(normalizedQuery)) score += 80;
        else if (legalNameLower.startsWith(normalizedQuery)) score += 70;
        // Contains gets lower score
        else if (nameLower.includes(normalizedQuery)) score += 50;
        else if (legalNameLower.includes(normalizedQuery)) score += 40;

        // Boost active vendors
        if (vendor.isActive) score += 5;
        // Boost primary vendors
        if (vendor.isPrimary) score += 3;
        // Boost by rating
        score += (vendor.rating || 0);

        return { vendor, score };
      });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.vendor);
  } catch (error) {
    console.warn('[VendorService] searchVendors error:', error.message);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Get vendor with all linked inventory items
 *
 * @param {number} id - Vendor ID
 * @returns {Promise<Object|null>} Vendor with items array, or null if not found
 */
export async function getVendorWithItems(id) {
  if (!id) return null;

  try {
    const vendor = await safeCall(vendorDB, 'getById', [id], null);
    if (!vendor) {
      return null;
    }

    const items = await safeCall(inventoryItemDB, 'getByVendor', [id], []);
    const safeItems = Array.isArray(items) ? items : [];

    return {
      ...vendor,
      items: safeItems,
      itemCount: safeItems.length
    };
  } catch (error) {
    console.warn('[VendorService] getVendorWithItems error:', error.message);
    return null; // Return null instead of throwing
  }
}

/**
 * Set a vendor as the preferred/primary vendor
 *
 * Clears isPrimary flag on all other vendors first.
 *
 * @param {number} id - Vendor ID to set as primary
 * @returns {Promise<Object>} Updated vendor
 * @throws {Error} If vendor not found
 */
export async function setPreferredVendor(id) {
  if (!id) {
    throw new Error('Vendor ID is required');
  }

  // Check vendor exists
  const vendor = await safeCall(vendorDB, 'getById', [id], null);
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  try {
    // Get all currently primary vendors
    const currentPrimary = await safeCall(vendorDB, 'getPrimary', [], []);
    const safePrimary = Array.isArray(currentPrimary) ? currentPrimary : [];

    // Clear isPrimary on all (if update function exists)
    if (typeof vendorDB?.update === 'function') {
      for (const v of safePrimary) {
        if (v && v.id !== id) {
          await vendorDB.update(v.id, { isPrimary: false });
        }
      }

      // Set target vendor as primary
      await vendorDB.update(id, { isPrimary: true });
    }

    // Return updated vendor
    return await safeCall(vendorDB, 'getById', [id], { ...vendor, isPrimary: true });
  } catch (error) {
    throw new Error(`Failed to set preferred vendor: ${error.message}`);
  }
}

/**
 * Get vendor statistics
 *
 * Returns counts, totals, and dates for the vendor.
 *
 * @param {number} id - Vendor ID
 * @returns {Promise<Object|null>} Stats object or null if vendor not found
 * @returns {number} stats.itemCount - Number of inventory items
 * @returns {number} stats.activeItemCount - Number of active items
 * @returns {number} stats.totalInventoryValue - Sum of (currentPrice * currentStock)
 * @returns {string|null} stats.lastOrderDate - Most recent purchase date
 * @returns {number} stats.totalPurchases - Total number of purchases
 * @returns {number} stats.totalSpent - Total amount spent with vendor
 */
export async function getVendorStats(id) {
  if (!id) return null;

  try {
    const vendor = await safeCall(vendorDB, 'getById', [id], null);
    if (!vendor) {
      return null;
    }

    // Get all items for this vendor
    const items = await safeCall(inventoryItemDB, 'getByVendor', [id], []);
    const safeItems = Array.isArray(items) ? items : [];

    // Calculate stats
    const stats = {
      vendorId: id,
      vendorName: vendor.name || 'Unknown',
      itemCount: safeItems.length,
      activeItemCount: safeItems.filter(i => i && i.isActive).length,
      totalInventoryValue: 0,
      lastOrderDate: null,
      totalPurchases: 0,
      totalSpent: 0,
      categories: new Set()
    };

    for (const item of safeItems) {
      if (!item) continue;

      // Inventory value
      const stock = item.currentStock || 0;
      const price = item.currentPrice || 0;
      stats.totalInventoryValue += stock * price;

      // Track last purchase date
      if (item.lastPurchaseDate) {
        if (!stats.lastOrderDate || item.lastPurchaseDate > stats.lastOrderDate) {
          stats.lastOrderDate = item.lastPurchaseDate;
        }
      }

      // Aggregate purchase stats
      stats.totalPurchases += item.purchaseCount || 0;
      stats.totalSpent += item.totalSpent || 0;

      // Track categories
      if (item.category) {
        stats.categories.add(item.category);
      }
    }

    // Round money values
    stats.totalInventoryValue = Math.round(stats.totalInventoryValue * 100) / 100;
    stats.totalSpent = Math.round(stats.totalSpent * 100) / 100;

    // Convert Set to array
    stats.categories = Array.from(stats.categories).sort();
    stats.categoryCount = stats.categories.length;

    return stats;
  } catch (error) {
    console.warn('[VendorService] getVendorStats error:', error.message);
    return null; // Return null instead of throwing
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a vendor name is available
 *
 * @param {string} name - Vendor name to check
 * @param {number} [excludeId] - Vendor ID to exclude (for updates)
 * @returns {Promise<boolean>} True if name is available
 */
export async function isVendorNameAvailable(name, excludeId = null) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  try {
    const existing = await safeCall(vendorDB, 'getByName', [name], null);
    if (!existing) {
      return true;
    }
    return excludeId !== null && existing.id === excludeId;
  } catch (error) {
    console.warn('[VendorService] isVendorNameAvailable error:', error.message);
    return true; // Assume available if check fails
  }
}

/**
 * Get vendor by code
 *
 * @param {string} code - Vendor code
 * @returns {Promise<Object|null>} Vendor or null if not found
 */
export async function getVendorByCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  try {
    return await safeCall(vendorDB, 'getByCode', [code.trim()], null);
  } catch (error) {
    console.warn('[VendorService] getVendorByCode error:', error.message);
    return null;
  }
}

/**
 * Generate a unique vendor code
 *
 * @param {string} [prefix='VEN'] - Code prefix
 * @returns {Promise<string>} Next available code (e.g., 'VEN-001')
 */
export async function generateVendorCode(prefix = 'VEN') {
  try {
    const code = await safeCall(vendorDB, 'generateNextCode', [prefix], null);
    if (code) {
      return code;
    }
    // Fallback: generate simple code with timestamp
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  } catch (error) {
    console.warn('[VendorService] generateVendorCode error:', error.message);
    // Fallback: generate simple code with timestamp
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }
}

/**
 * Bulk update vendor status
 *
 * @param {number[]} ids - Array of vendor IDs
 * @param {boolean} isActive - New active status
 * @returns {Promise<number>} Number of vendors updated
 * @throws {Error} If any vendor update fails
 */
export async function bulkUpdateVendorStatus(ids, isActive) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }

  // Check if update function exists
  if (typeof vendorDB?.update !== 'function') {
    console.warn('[VendorService] bulkUpdateVendorStatus: update function not available');
    return 0;
  }

  let updatedCount = 0;
  for (const id of ids) {
    if (!id) continue;
    try {
      await vendorDB.update(id, { isActive });
      updatedCount++;
    } catch (error) {
      console.warn(`[VendorService] Failed to update vendor ${id}:`, error.message);
    }
  }

  return updatedCount;
}

/**
 * Get vendors grouped by city
 *
 * @param {boolean} [activeOnly=true] - Only include active vendors
 * @returns {Promise<Object>} Object with city names as keys, vendor arrays as values
 */
export async function getVendorsByCity(activeOnly = true) {
  try {
    const vendors = await getVendorsWithFallback({
      activeOnly,
      externalOnly: true
    });

    const byCity = {};

    for (const vendor of vendors) {
      if (!vendor) continue;
      const city = vendor.city || 'Unknown';
      if (!byCity[city]) {
        byCity[city] = [];
      }
      byCity[city].push(vendor);
    }

    // Sort vendors within each city
    for (const city in byCity) {
      byCity[city].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }

    return byCity;
  } catch (error) {
    console.warn('[VendorService] getVendorsByCity error:', error.message);
    return {}; // Return empty object instead of throwing
  }
}

// ============================================
// Export all functions
// ============================================

export default {
  // Validation
  isValidPhone,
  validateVendorData,

  // CRUD
  createVendor,
  updateVendor,
  deleteVendor,
  getVendor,
  getAllVendors,
  getInternalVendor,
  searchVendors,
  getVendorWithItems,
  setPreferredVendor,
  getVendorStats,

  // Utilities
  isVendorNameAvailable,
  getVendorByCode,
  generateVendorCode,
  bulkUpdateVendorStatus,
  getVendorsByCity
};
