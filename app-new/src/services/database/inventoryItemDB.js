// Inventory Item Database Module
import { db, getCloudSync } from './db.js';
import { priceHistoryDB } from './supportingDB.js';
import { classifyUnit } from '../../utils/unitConversion.js';

/**
 * Inventory Item Database
 *
 * Comprehensive inventory management for invoice imports.
 * Replaces/extends the ingredients table with full vendor support.
 * Supports fuzzy name matching for invoice parsing.
 *
 * @typedef {Object} InventoryItem
 * @property {number} id - Auto-generated unique identifier
 * @property {string} name - Display name (required)
 * @property {string} nameNormalized - Normalized name for fuzzy search (lowercase, no accents)
 * @property {string} description - Item description
 * @property {string} sku - Vendor SKU/product code
 * @property {string} upc - Universal Product Code (barcode)
 * @property {number} vendorId - Reference to vendors table (FK)
 * @property {string} vendorName - Vendor display name (denormalized)
 * @property {string} vendorProductCode - Vendor's product code
 * @property {string} category - Item category (Meat, Seafood, Dairy, Produce, Dry Goods, etc.)
 * @property {string} subcategory - Item subcategory
 * @property {string} unit - Base unit of measure (kg, L, ea, etc.) or full package description (e.g., "Caisse 5lb")
 * @property {'tool' | 'weight' | 'volume' | 'count' | 'unknown'} unitType - Classified unit type for linking enforcement
 * @property {string} toolUnit - If unitType is 'tool', the tool unit name (e.g., "canne", "botte", "caisse")
 * @property {string} toolAbbrev - Abbreviation for tool unit (e.g., "cn", "bt", "cs")
 * @property {number} weightPerUnit - Weight in grams per unit (for tool units with known weight)
 * @property {number} packageSize - Package/case size
 * @property {string} packageUnit - Package unit (case, box, bag, etc.)
 * @property {number} unitsPerPackage - Number of base units per package
 * @property {number} purchaseQty - Purchase quantity (e.g., 5 for "5lb case")
 * @property {string} purchaseUnit - Purchase unit (e.g., "lb" for "5lb case")
 * @property {number} currentPrice - Current price per package
 * @property {number} pricePerUnit - Calculated price per base unit
 * @property {number} lastPrice - Previous price (for comparison)
 * @property {number} avgPrice - Average price (calculated)
 * @property {number} minPrice - Minimum price seen
 * @property {number} maxPrice - Maximum price seen
 * @property {string} currency - Currency code (e.g., "CAD", "USD")
 * @property {number} taxRate - Tax rate percentage (0-100)
 * @property {boolean} isTaxable - Whether item is taxable
 * @property {string} lastPurchaseDate - Last purchase date (ISO)
 * @property {number} lastInvoiceId - Reference to last invoice (FK)
 * @property {number} purchaseCount - Number of times purchased
 * @property {number} totalQuantityPurchased - Total quantity ever purchased
 * @property {number} totalSpent - Total amount spent on this item
 * @property {number} linkedIngredientId - Link to legacy ingredients table (for migration)
 * @property {string[]} aliases - Alternative names for fuzzy matching
 * @property {string[]} tags - Tags for filtering/grouping
 * @property {number} parLevel - Par level for inventory
 * @property {number} reorderPoint - Reorder point quantity
 * @property {number} reorderQuantity - Default reorder quantity
 * @property {string} storageLocation - Storage location in kitchen
 * @property {string} storageTemp - Storage temperature requirements
 * @property {number} shelfLifeDays - Shelf life in days
 * @property {boolean} isActive - Whether item is active (soft delete)
 * @property {boolean} isPreferred - Whether this is a preferred item
 * @property {string} notes - Additional notes
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} createdBy - User ID who created the record
 * @property {RecipeTool[]} recipeTools - User-defined measurement tools for this item
 *
 * @typedef {Object} RecipeTool
 * @property {string} id - Unique identifier (nanoid)
 * @property {string} name - Display name (e.g., "cup", "sac", "botte")
 * @property {string} abbrev - Abbreviation for display (e.g., "c", "sac", "bt")
 * @property {number} weightG - Weight in grams for this tool (required for weight-based)
 * @property {number} volumeML - Volume in ml (optional, for liquids)
 * @property {'weight'|'volume'|'count'} convertType - What this tool converts to
 * @property {string} source - Source of this tool ("invoice" | "user" | "ai")
 * @property {string} createdAt - ISO timestamp
 */
export const inventoryItemDB = {
  /**
   * Normalize a name for fuzzy matching
   * Removes accents, lowercases, trims whitespace
   * @param {string} name - Name to normalize
   * @returns {string} Normalized name
   */
  normalizeName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      // Remove accents (é -> e, ô -> o, etc.)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ');
  },

  /**
   * Get all inventory items ordered by name
   * @returns {Promise<InventoryItem[]>}
   */
  async getAll() {
    return await db.inventoryItems.orderBy('name').toArray();
  },

  /**
   * Get inventory items with pagination
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (1-based)
   * @param {number} options.pageSize - Items per page (default: 50)
   * @param {string} options.sortBy - Field to sort by (default: 'name')
   * @param {boolean} options.sortDesc - Sort descending (default: false)
   * @returns {Promise<{items: InventoryItem[], total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async getPaginated({ page = 1, pageSize = 50, sortBy = 'name', sortDesc = false } = {}) {
    const total = await db.inventoryItems.count();
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    let collection = db.inventoryItems.orderBy(sortBy);
    if (sortDesc) {
      collection = collection.reverse();
    }

    const items = await collection
      .offset(offset)
      .limit(pageSize)
      .toArray();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages
    };
  },

  /**
   * Get active inventory items only
   * @returns {Promise<InventoryItem[]>}
   */
  async getActive() {
    // Filter in memory to handle both boolean true and number 1
    const all = await db.inventoryItems.toArray();
    return all
      .filter(item => item.isActive === true || item.isActive === 1)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  /**
   * Get inventory item by ID
   * @param {number} id - Item ID
   * @returns {Promise<InventoryItem|undefined>}
   */
  async getById(id) {
    return await db.inventoryItems.get(id);
  },

  /**
   * Get inventory item by exact name (uses indexed nameNormalized)
   * @param {string} name - Item name
   * @returns {Promise<InventoryItem|undefined>}
   */
  async getByName(name) {
    const normalizedName = this.normalizeName(name);
    return await db.inventoryItems
      .where('nameNormalized')
      .equals(normalizedName)
      .first();
  },

  /**
   * Get inventory item by vendor and name (compound index - ensures uniqueness)
   * @param {number} vendorId - Vendor ID
   * @param {string} name - Item name
   * @returns {Promise<InventoryItem|undefined>}
   */
  async getByVendorAndName(vendorId, name) {
    return await db.inventoryItems
      .where('[vendorId+name]')
      .equals([vendorId, name])
      .first();
  },

  /**
   * Get inventory items by vendor
   * @param {number} vendorId - Vendor ID
   * @returns {Promise<InventoryItem[]>}
   */
  async getByVendor(vendorId) {
    return await db.inventoryItems
      .where('vendorId')
      .equals(vendorId)
      .sortBy('name');
  },

  /**
   * Get inventory items by category
   * @param {string} category - Category name
   * @returns {Promise<InventoryItem[]>}
   */
  async getByCategory(category) {
    return await db.inventoryItems
      .where('category')
      .equals(category)
      .toArray();
  },

  /**
   * Search inventory items by name (optimized with indexed prefix matching)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 50)
   * @param {boolean} options.activeOnly - Only return active items (default: false)
   * @param {number} options.vendorId - Filter by vendor (optional)
   * @returns {Promise<InventoryItem[]>}
   */
  async search(query, { limit = 50, activeOnly = false, vendorId = null } = {}) {
    const normalizedQuery = this.normalizeName(query);

    if (!normalizedQuery) {
      return [];
    }

    // Use indexed startsWith for prefix matching (fast)
    let results = await db.inventoryItems
      .where('nameNormalized')
      .startsWith(normalizedQuery)
      .limit(limit * 2) // Get extra for filtering
      .toArray();

    // Also search in aliases if not enough results
    if (results.length < limit) {
      const aliasMatches = await db.inventoryItems
        .filter(item =>
          item.aliases?.some(alias =>
            this.normalizeName(alias).includes(normalizedQuery)
          ) &&
          !results.some(r => r.id === item.id)
        )
        .limit(limit - results.length)
        .toArray();
      results = [...results, ...aliasMatches];
    }

    // Apply filters
    if (activeOnly) {
      results = results.filter(item => item.isActive === true || item.isActive === 1);
    }
    if (vendorId !== null) {
      results = results.filter(item => item.vendorId === vendorId);
    }

    return results.slice(0, limit);
  },

  /**
   * Fuzzy search for invoice matching
   * Returns items with similarity score
   * @param {string} query - Search query from invoice
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 10)
   * @param {number} options.vendorId - Filter by vendor (optional)
   * @param {number} options.minScore - Minimum similarity score 0-1 (default: 0.5)
   * @returns {Promise<Array<{item: InventoryItem, score: number}>>}
   */
  async fuzzySearch(query, { limit = 10, vendorId = null, minScore = 0.5 } = {}) {
    const normalizedQuery = this.normalizeName(query);

    if (!normalizedQuery) {
      return [];
    }

    // Get candidate items
    let candidates;
    if (vendorId !== null) {
      candidates = await this.getByVendor(vendorId);
    } else {
      candidates = await this.getActive();
    }

    // Calculate similarity scores
    const scored = candidates.map(item => {
      const normalizedName = item.nameNormalized || this.normalizeName(item.name);

      // Calculate simple similarity (Dice coefficient approximation)
      const queryWords = new Set(normalizedQuery.split(' '));
      const nameWords = new Set(normalizedName.split(' '));
      const intersection = new Set([...queryWords].filter(x => nameWords.has(x)));
      const score = (2 * intersection.size) / (queryWords.size + nameWords.size);

      // Boost score for exact prefix match
      const prefixBoost = normalizedName.startsWith(normalizedQuery) ? 0.3 : 0;

      // Boost score for alias match
      const aliasBoost = item.aliases?.some(alias =>
        this.normalizeName(alias).includes(normalizedQuery)
      ) ? 0.2 : 0;

      return {
        item,
        score: Math.min(1, score + prefixBoost + aliasBoost)
      };
    });

    // Filter and sort by score
    return scored
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  /**
   * Create a new inventory item
   * @param {Partial<InventoryItem>} item - Item data
   * @returns {Promise<number>} Created item ID
   */
  async create(item) {
    // Validate required field
    if (!item.name?.trim()) {
      throw new Error('Item name is required');
    }

    const name = item.name.trim();
    const nameNormalized = this.normalizeName(name);

    // Check for duplicate (vendor + name must be unique)
    if (item.vendorId) {
      const existing = await this.getByVendorAndName(item.vendorId, name);
      if (existing) {
        throw new Error(`An item with name "${name}" already exists for this vendor.`);
      }
    }

    const now = new Date().toISOString();
    const data = {
      // Identity
      name,
      nameNormalized,
      description: item.description?.trim() || '',
      sku: item.sku?.trim() || '',
      upc: item.upc?.trim() || '',

      // Vendor relationship
      vendorId: item.vendorId || null,
      vendorName: item.vendorName?.trim() || '',
      vendorProductCode: item.vendorProductCode?.trim() || '',

      // Classification
      category: item.category?.trim() || 'Other',
      subcategory: item.subcategory?.trim() || '',

      // Units & packaging
      unit: item.unit?.trim() || 'ea',
      packageSize: typeof item.packageSize === 'number' ? item.packageSize : 1,
      packageUnit: item.packageUnit?.trim() || '',
      unitsPerPackage: typeof item.unitsPerPackage === 'number' ? item.unitsPerPackage : 1,
      // Parsed purchase quantity/unit (e.g., "Caisse 5lb" -> purchaseQty: 5, purchaseUnit: "lb")
      purchaseQty: typeof item.purchaseQty === 'number' ? item.purchaseQty : null,
      purchaseUnit: item.purchaseUnit?.trim() || null,
      // Auto-classified unit type (tool/weight/volume/count/unknown)
      // Will be set below after data object is created
      unitType: item.unitType || null,
      toolUnit: item.toolUnit?.trim() || null,
      toolAbbrev: item.toolAbbrev?.trim() || null, // Abbreviation for tool unit (e.g., "cs" for caisse)
      weightPerUnit: typeof item.weightPerUnit === 'number' ? item.weightPerUnit : null,

      // Pricing
      currentPrice: typeof item.currentPrice === 'number' ? item.currentPrice : 0,
      pricePerUnit: typeof item.pricePerUnit === 'number' ? item.pricePerUnit : 0,
      // Normalized price for recipe cost calculations (from invoice import)
      pricePerG: typeof item.pricePerG === 'number' ? item.pricePerG : null,
      pricePerML: typeof item.pricePerML === 'number' ? item.pricePerML : null,
      lastPrice: typeof item.lastPrice === 'number' ? item.lastPrice : 0,
      avgPrice: typeof item.avgPrice === 'number' ? item.avgPrice : 0,
      minPrice: typeof item.minPrice === 'number' ? item.minPrice : 0,
      maxPrice: typeof item.maxPrice === 'number' ? item.maxPrice : 0,
      currency: item.currency?.trim() || null,
      taxRate: typeof item.taxRate === 'number' ? item.taxRate : 0,
      isTaxable: item.isTaxable !== false,

      // Purchase history
      lastPurchaseDate: item.lastPurchaseDate || null,
      lastInvoiceId: item.lastInvoiceId || null,
      purchaseCount: typeof item.purchaseCount === 'number' ? item.purchaseCount : 0,
      totalQuantityPurchased: typeof item.totalQuantityPurchased === 'number' ? item.totalQuantityPurchased : 0,
      totalSpent: typeof item.totalSpent === 'number' ? item.totalSpent : 0,

      // Legacy link
      linkedIngredientId: item.linkedIngredientId || null,

      // Matching & tagging
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      tags: Array.isArray(item.tags) ? item.tags : [],

      // Inventory management - dual stock tracking (quantity + weight)
      // Quantity tracking (e.g., 8 pieces, 5 cases)
      stockQuantity: typeof item.stockQuantity === 'number' ? item.stockQuantity : 0,
      stockQuantityUnit: item.stockQuantityUnit?.trim() || 'pc',
      parQuantity: typeof item.parQuantity === 'number' ? item.parQuantity : 0,
      // Weight tracking (e.g., 175 lbs, 50 kg)
      stockWeight: typeof item.stockWeight === 'number' ? item.stockWeight : 0,
      stockWeightUnit: item.stockWeightUnit?.trim() || 'lb',
      parWeight: typeof item.parWeight === 'number' ? item.parWeight : 0,
      // Legacy field (kept for backwards compatibility, computed from qty or weight)
      currentStock: typeof item.currentStock === 'number' ? item.currentStock :
                    (typeof item.stockQuantity === 'number' ? item.stockQuantity :
                    (typeof item.stockWeight === 'number' ? item.stockWeight : 0)),
      parLevel: typeof item.parLevel === 'number' ? item.parLevel :
                (typeof item.parQuantity === 'number' ? item.parQuantity :
                (typeof item.parWeight === 'number' ? item.parWeight : 0)),
      reorderPoint: typeof item.reorderPoint === 'number' ? item.reorderPoint : 0,
      reorderQuantity: typeof item.reorderQuantity === 'number' ? item.reorderQuantity : 0,
      storageLocation: item.storageLocation?.trim() || '',
      storageTemp: item.storageTemp?.trim() || '',
      shelfLifeDays: typeof item.shelfLifeDays === 'number' ? item.shelfLifeDays : 0,

      // Status
      isActive: item.isActive !== false,
      isPreferred: item.isPreferred === true,
      notes: item.notes?.trim() || '',

      // Recipe Tools - user-defined measurement tools
      recipeTools: Array.isArray(item.recipeTools) ? item.recipeTools : [],

      // Timestamps
      createdAt: now,
      updatedAt: now,
      createdBy: item.createdBy || null
    };

    // Calculate pricePerUnit if not provided
    if (data.pricePerUnit === 0 && data.currentPrice > 0 && data.unitsPerPackage > 0) {
      data.pricePerUnit = data.currentPrice / data.unitsPerPackage;
    }

    // Auto-classify unit type if not already set
    if (!data.unitType) {
      const classification = classifyUnit(data.unit);
      data.unitType = classification.unitType;
      data.toolUnit = classification.toolUnit || null;
      data.toolAbbrev = classification.toolAbbrev || null;
      data.weightPerUnit = classification.weightG || null;

      // If classification found a base unit, set it
      if (classification.baseUnit && !data.purchaseUnit) {
        data.purchaseUnit = classification.baseUnit;
      }
    }

    const id = await db.inventoryItems.add(data);

    // Auto-sync to cloud with error handling
    const sync = await getCloudSync();
    if (sync.pushInventoryItem) {
      const syncResult = await sync.pushInventoryItem({ ...data, id }, { throwOnError: false });
      if (!syncResult?.success) {
        console.warn(`⚠️ Inventory item ${id} saved locally but sync failed:`, syncResult?.error?.message);
        // Item is saved locally - sync will retry or user can manually sync later
      }
    }

    return id;
  },

  /**
   * Create inventory item with sync confirmation
   * Use this when sync success is critical (e.g., task completion)
   * @param {Object} item - Item data
   * @param {Object} options - Creation options
   * @param {boolean} options.requireSync - If true, throws if sync fails (default: false)
   * @returns {Promise<{id: number, synced: boolean, syncError?: string}>}
   */
  async createWithSync(item, options = {}) {
    const { requireSync = false } = options;

    // Validate required field
    if (!item.name?.trim()) {
      throw new Error('Item name is required');
    }

    const name = item.name.trim();
    const nameNormalized = this.normalizeName(name);

    // Check for duplicate
    if (item.vendorId) {
      const existing = await this.getByVendorAndName(item.vendorId, name);
      if (existing) {
        throw new Error(`An item with name "${name}" already exists for this vendor.`);
      }
    }

    const now = new Date().toISOString();
    const data = {
      ...item,
      name,
      nameNormalized,
      createdAt: now,
      updatedAt: now,
    };

    const id = await db.inventoryItems.add(data);

    // Sync with confirmation
    const sync = await getCloudSync();
    let synced = false;
    let syncError = null;

    if (sync.pushInventoryItem) {
      const syncResult = await sync.pushInventoryItem({ ...data, id }, { throwOnError: requireSync });
      synced = syncResult?.success ?? false;
      if (!synced) {
        syncError = syncResult?.error?.message || 'Sync failed';
        if (requireSync) {
          // Rollback local save if sync is required
          await db.inventoryItems.delete(id);
          throw new Error(`SYNC_INVENTORY_FAILED: ${syncError}`);
        }
      }
    }

    return { id, synced, syncError };
  },

  /**
   * Update an existing inventory item
   * @param {number} id - Item ID
   * @param {Partial<InventoryItem>} updates - Fields to update
   * @returns {Promise<boolean>}
   */
  async update(id, updates) {
    // Check if item exists
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    // Check for duplicate if name or vendor is being changed
    if (updates.name || updates.vendorId !== undefined) {
      const newName = updates.name?.trim() || existing.name;
      const newVendorId = updates.vendorId !== undefined ? updates.vendorId : existing.vendorId;

      if (newVendorId && (newName !== existing.name || newVendorId !== existing.vendorId)) {
        const duplicate = await this.getByVendorAndName(newVendorId, newName);
        if (duplicate && duplicate.id !== id) {
          throw new Error(`An item with name "${newName}" already exists for this vendor.`);
        }
      }
    }

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Update nameNormalized if name changed
    if (updates.name) {
      updatedData.name = updates.name.trim();
      updatedData.nameNormalized = this.normalizeName(updates.name);
    }

    await db.inventoryItems.update(id, updatedData);

    // Auto-sync to cloud with error handling
    const item = await db.inventoryItems.get(id);
    if (item) {
      const sync = await getCloudSync();
      if (sync.pushInventoryItem) {
        const syncResult = await sync.pushInventoryItem(item, { throwOnError: false });
        if (!syncResult?.success) {
          console.warn(`⚠️ Inventory item ${id} updated locally but sync failed:`, syncResult?.error?.message);
        }
      }
    }

    return true;
  },

  /**
   * Update inventory item with sync confirmation
   * Use this when sync success is critical (e.g., stock deduction)
   * @param {number} id - Item ID
   * @param {Object} updates - Fields to update
   * @param {Object} options - Update options
   * @param {boolean} options.requireSync - If true, throws if sync fails
   * @returns {Promise<{success: boolean, synced: boolean, syncError?: string}>}
   */
  async updateWithSync(id, updates, options = {}) {
    const { requireSync = false } = options;

    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    // Store original values for potential rollback
    const originalValues = { ...existing };

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (updates.name) {
      updatedData.name = updates.name.trim();
      updatedData.nameNormalized = this.normalizeName(updates.name);
    }

    await db.inventoryItems.update(id, updatedData);

    // Sync with confirmation
    const item = await db.inventoryItems.get(id);
    let synced = false;
    let syncError = null;

    if (item) {
      const sync = await getCloudSync();
      if (sync.pushInventoryItem) {
        const syncResult = await sync.pushInventoryItem(item, { throwOnError: requireSync });
        synced = syncResult?.success ?? false;
        if (!synced) {
          syncError = syncResult?.error?.message || 'Sync failed';
          if (requireSync) {
            // Rollback to original values if sync is required
            await db.inventoryItems.update(id, originalValues);
            throw new Error(`SYNC_INVENTORY_FAILED: ${syncError}`);
          }
        }
      }
    }

    return { success: true, synced, syncError };
  },

  /**
   * Update price from invoice import
   * Tracks price history and statistics
   * @param {number} id - Item ID
   * @param {number} newPrice - New price
   * @param {Object} options - Additional options
   * @param {number} options.quantity - Quantity purchased
   * @param {number} options.invoiceId - Invoice ID
   * @param {string} options.purchaseDate - Purchase date (ISO)
   * @returns {Promise<boolean>}
   */
  async updatePriceFromInvoice(id, newPrice, { quantity = 1, invoiceId = null, purchaseDate = null } = {}) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    const oldPrice = item.currentPrice || 0;
    const now = purchaseDate || new Date().toISOString();

    // Calculate new statistics
    const purchaseCount = (item.purchaseCount || 0) + 1;
    const totalQuantityPurchased = (item.totalQuantityPurchased || 0) + quantity;
    const totalSpent = (item.totalSpent || 0) + (newPrice * quantity);
    const avgPrice = totalSpent / totalQuantityPurchased;

    // Track min/max prices
    const minPrice = item.minPrice > 0 ? Math.min(item.minPrice, newPrice) : newPrice;
    const maxPrice = Math.max(item.maxPrice || 0, newPrice);

    // Calculate price per unit
    const pricePerUnit = item.unitsPerPackage > 0 ? newPrice / item.unitsPerPackage : newPrice;

    const updates = {
      lastPrice: oldPrice,
      currentPrice: newPrice,
      pricePerUnit,
      avgPrice: Math.round(avgPrice * 100) / 100,
      minPrice,
      maxPrice,
      lastPurchaseDate: now,
      lastInvoiceId: invoiceId,
      purchaseCount,
      totalQuantityPurchased,
      totalSpent: Math.round(totalSpent * 100) / 100
    };

    await this.update(id, updates);

    // Record price history if price changed
    if (oldPrice !== newPrice && item.linkedIngredientId) {
      await priceHistoryDB.add({
        inventoryItemId: item.linkedIngredientId,
        price: newPrice,
        previousPrice: oldPrice,
        invoiceId,
        vendorId: item.vendorId
      });
    }

    return true;
  },

  /**
   * Add an alias for fuzzy matching
   * @param {number} id - Item ID
   * @param {string} alias - Alias to add
   * @returns {Promise<boolean>}
   */
  async addAlias(id, alias) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    const aliases = item.aliases || [];
    const normalizedAlias = alias.trim();

    if (!aliases.includes(normalizedAlias)) {
      aliases.push(normalizedAlias);
      await this.update(id, { aliases });
    }

    return true;
  },

  /**
   * Remove an alias
   * @param {number} id - Item ID
   * @param {string} alias - Alias to remove
   * @returns {Promise<boolean>}
   */
  async removeAlias(id, alias) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    const aliases = (item.aliases || []).filter(a => a !== alias.trim());
    await this.update(id, { aliases });

    return true;
  },

  /**
   * Soft delete an inventory item (marks as inactive)
   * @param {number} id - Item ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    return await this.update(id, { isActive: false });
  },

  /**
   * Hard delete an inventory item (permanent removal)
   * @param {number} id - Item ID
   * @returns {Promise<boolean>}
   */
  async hardDelete(id) {
    await db.inventoryItems.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteInventoryItemFromCloud?.(id);

    return true;
  },

  /**
   * Link inventory item to legacy ingredient
   * @param {number} inventoryItemId - Inventory item ID
   * @param {number} ingredientId - Legacy ingredient ID
   * @returns {Promise<boolean>}
   */
  async linkToIngredient(inventoryItemId, ingredientId) {
    return await this.update(inventoryItemId, { linkedIngredientId: ingredientId });
  },

  // ============================================
  // RECIPE TOOLS MANAGEMENT
  // ============================================

  /**
   * Add a recipe tool to an inventory item
   * @param {number} id - Item ID
   * @param {Object} tool - Recipe tool data
   * @param {string} tool.name - Tool name (e.g., "cup", "sac")
   * @param {string} tool.abbrev - Abbreviation (e.g., "c", "sac")
   * @param {number} tool.weightG - Weight in grams
   * @param {number} [tool.volumeML] - Volume in ml (optional)
   * @param {'weight'|'volume'|'count'} [tool.convertType] - Conversion type
   * @param {string} [tool.source] - Source ("user", "invoice", "ai")
   * @returns {Promise<string>} Created tool ID
   */
  async addRecipeTool(id, tool) {
    const item = await this.getById(id);
    if (!item) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    // Validate required fields
    if (!tool.name?.trim()) {
      throw new Error('Tool name is required');
    }
    if (typeof tool.weightG !== 'number' || tool.weightG <= 0) {
      throw new Error('Tool weight (weightG) must be a positive number');
    }

    // Generate unique ID
    const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newTool = {
      id: toolId,
      name: tool.name.trim().toLowerCase(),
      abbrev: tool.abbrev?.trim().toLowerCase() || tool.name.trim().substring(0, 3).toLowerCase(),
      weightG: tool.weightG,
      volumeML: typeof tool.volumeML === 'number' ? tool.volumeML : null,
      convertType: tool.convertType || 'weight',
      category: 'unit', // Required for generateUnitSuggestions filter
      source: tool.source || 'user',
      createdAt: new Date().toISOString()
    };

    const recipeTools = [...(item.recipeTools || []), newTool];
    await this.update(id, { recipeTools });

    return toolId;
  },

  /**
   * Update a recipe tool
   * @param {number} itemId - Item ID
   * @param {string} toolId - Tool ID to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>}
   */
  async updateRecipeTool(itemId, toolId, updates) {
    const item = await this.getById(itemId);
    if (!item) {
      throw new Error(`Inventory item with ID ${itemId} not found`);
    }

    const recipeTools = item.recipeTools || [];
    const toolIndex = recipeTools.findIndex(t => t.id === toolId);

    if (toolIndex === -1) {
      throw new Error(`Recipe tool with ID ${toolId} not found`);
    }

    // Update tool fields
    recipeTools[toolIndex] = {
      ...recipeTools[toolIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.update(itemId, { recipeTools });
    return true;
  },

  /**
   * Remove a recipe tool
   * @param {number} itemId - Item ID
   * @param {string} toolId - Tool ID to remove
   * @returns {Promise<boolean>}
   */
  async removeRecipeTool(itemId, toolId) {
    const item = await this.getById(itemId);
    if (!item) {
      throw new Error(`Inventory item with ID ${itemId} not found`);
    }

    const recipeTools = (item.recipeTools || []).filter(t => t.id !== toolId);
    await this.update(itemId, { recipeTools });
    return true;
  },

  /**
   * Get all recipe tools for an inventory item
   * @param {number} id - Item ID
   * @returns {Promise<RecipeTool[]>}
   */
  async getRecipeTools(id) {
    const item = await this.getById(id);
    return item?.recipeTools || [];
  },

  /**
   * Auto-create recipe tool from invoice unit classification
   * Called when an item is created from invoice with a tool unit
   * @param {number} id - Item ID
   * @returns {Promise<string|null>} Created tool ID or null if no tool unit
   */
  async autoCreateToolFromInvoice(id) {
    const item = await this.getById(id);
    if (!item) return null;

    // Only create if this is a tool unit type with known weight
    if (item.unitType !== 'tool' || !item.toolAbbrev) return null;

    // Check if tool already exists
    const existingTools = item.recipeTools || [];
    const toolExists = existingTools.some(
      t => t.abbrev === item.toolAbbrev || t.name === item.toolUnit
    );
    if (toolExists) return null;

    // Create tool with known weight (or default placeholder)
    const tool = {
      name: item.toolUnit || item.toolAbbrev,
      abbrev: item.toolAbbrev,
      weightG: item.weightPerUnit || 0, // May be 0 if unknown
      source: 'invoice',
      convertType: 'weight'
    };

    return await this.addRecipeTool(id, tool);
  },

  /**
   * Get items needing reorder (at or below reorder point)
   * @returns {Promise<InventoryItem[]>}
   */
  async getItemsNeedingReorder() {
    return await db.inventoryItems
      .filter(item =>
        item.isActive &&
        item.reorderPoint > 0 &&
        (item.parLevel || 0) <= item.reorderPoint
      )
      .toArray();
  },

  /**
   * Get total inventory item count
   * @returns {Promise<number>}
   */
  async count() {
    return await db.inventoryItems.count();
  },

  /**
   * Get count of active inventory items
   * @returns {Promise<number>}
   */
  async countActive() {
    return await db.inventoryItems
      .where('isActive')
      .equals(1)
      .or('isActive')
      .equals(true)
      .count();
  },

  /**
   * Get unique categories
   * @returns {Promise<string[]>}
   */
  async getCategories() {
    const items = await db.inventoryItems
      .orderBy('category')
      .uniqueKeys();
    return items.filter(c => c); // Remove nulls/empty
  },

  /**
   * Bulk import items from invoice
   * @param {Array<Partial<InventoryItem>>} items - Items to import
   * @param {Object} options - Import options
   * @param {number} options.vendorId - Vendor ID for all items
   * @param {number} options.invoiceId - Invoice ID
   * @param {string} options.purchaseDate - Purchase date
   * @param {boolean} options.updateExisting - Update existing items (default: true)
   * @returns {Promise<{created: number, updated: number, errors: Array}>}
   */
  async bulkImportFromInvoice(items, { vendorId, invoiceId, purchaseDate, updateExisting = true } = {}) {
    const results = { created: 0, updated: 0, errors: [] };

    for (const item of items) {
      try {
        // Try to find existing item
        let existing = null;
        if (vendorId && item.name) {
          existing = await this.getByVendorAndName(vendorId, item.name);
        }
        if (!existing && item.name) {
          existing = await this.getByName(item.name);
        }

        if (existing) {
          if (updateExisting) {
            // Update existing item with new price
            await this.updatePriceFromInvoice(existing.id, item.currentPrice || item.price, {
              quantity: item.quantity || 1,
              invoiceId,
              purchaseDate
            });
            results.updated++;
          }
        } else {
          // Create new item
          await this.create({
            ...item,
            vendorId,
            lastInvoiceId: invoiceId,
            lastPurchaseDate: purchaseDate,
            purchaseCount: 1,
            totalQuantityPurchased: item.quantity || 1,
            totalSpent: (item.currentPrice || item.price || 0) * (item.quantity || 1)
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push({ item: item.name, error: error.message });
      }
    }

    return results;
  },

  /**
   * Clear all inventory items (use with caution)
   * @returns {Promise<void>}
   */
  async clear() {
    await db.inventoryItems.clear();
  }
};
