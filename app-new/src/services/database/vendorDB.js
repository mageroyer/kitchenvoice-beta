// Vendor Database Module
import { db, getCloudSync } from './db.js';

/**
 * Vendor Database
 *
 * Comprehensive vendor/supplier management for inventory tracking.
 * Stores business details, contact info, payment terms, and ordering preferences.
 *
 * @typedef {Object} Vendor
 * @property {number} id - Auto-generated unique identifier
 * @property {string} name - Display name (required)
 * @property {string} nameLower - Lowercase name for indexed search
 * @property {string} legalName - Legal business name
 * @property {string} vendorCode - Internal vendor code (e.g., "SUP-001")
 * @property {string} contactName - Primary contact person
 * @property {string} contactTitle - Contact's job title
 * @property {string} email - Primary email
 * @property {string} phone - Primary phone
 * @property {string} fax - Fax number
 * @property {string} website - Website URL
 * @property {string} address - Street address
 * @property {string} city - City
 * @property {string} province - Province/State
 * @property {string} postalCode - Postal/ZIP code
 * @property {string} country - Country
 * @property {string} accountNumber - Customer account number with vendor
 * @property {string} taxNumber - Vendor's tax/GST number
 * @property {string} paymentTerms - Payment terms (e.g., "Net 30", "COD")
 * @property {string} currency - Currency code (e.g., "CAD", "USD")
 * @property {number} minimumOrder - Minimum order amount
 * @property {string} deliveryDays - Delivery days (e.g., "Mon, Wed, Fri")
 * @property {number} leadTimeDays - Lead time in days for orders
 * @property {string} orderEmail - Email for placing orders
 * @property {string} orderPhone - Phone for placing orders
 * @property {boolean} isActive - Whether vendor is active (soft delete)
 * @property {boolean} isPrimary - Whether this is a primary/preferred vendor
 * @property {number} rating - Rating 1-5 (0 = not rated)
 * @property {string} notes - Additional notes
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} createdBy - User ID who created the record
 */
export const vendorDB = {
  /**
   * Get all vendors ordered by name
   * @returns {Promise<Vendor[]>}
   */
  async getAll() {
    return await db.vendors.orderBy('name').toArray();
  },

  /**
   * Get vendors with pagination
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (1-based)
   * @param {number} options.pageSize - Items per page (default: 50)
   * @param {string} options.sortBy - Field to sort by (default: 'name')
   * @param {boolean} options.sortDesc - Sort descending (default: false)
   * @returns {Promise<{vendors: Vendor[], total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async getPaginated({ page = 1, pageSize = 50, sortBy = 'name', sortDesc = false } = {}) {
    const total = await db.vendors.count();
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    let collection = db.vendors.orderBy(sortBy);
    if (sortDesc) {
      collection = collection.reverse();
    }

    const vendors = await collection
      .offset(offset)
      .limit(pageSize)
      .toArray();

    return {
      vendors,
      total,
      page,
      pageSize,
      totalPages
    };
  },

  /**
   * Get active vendors only
   * Note: IndexedDB doesn't support boolean keys reliably, so we filter in memory.
   * @returns {Promise<Vendor[]>}
   */
  async getActive() {
    // IndexedDB limitation: boolean values can't be indexed reliably
    // Use filter which is still fast for typical vendor counts (<500)
    return await db.vendors
      .filter(v => v.isActive === true || v.isActive === 1)
      .sortBy('name');
  },

  /**
   * Get primary/preferred vendors
   * @returns {Promise<Vendor[]>}
   */
  async getPrimary() {
    return await db.vendors
      .filter(v => v.isPrimary === true || v.isPrimary === 1)
      .sortBy('name');
  },

  /**
   * Get the internal business vendor (for in-house produced items)
   * @returns {Promise<Vendor|undefined>}
   */
  async getInternal() {
    // Use filter with first() - stops at first match
    return await db.vendors
      .filter(v => v.isInternal === true || v.isInternal === 1)
      .first();
  },

  /**
   * Get external vendors only (excluding internal business vendor)
   * Used by vendor list UI to hide the internal vendor.
   * @returns {Promise<Vendor[]>}
   */
  async getExternal() {
    return await db.vendors
      .filter(v => v.isInternal !== true && v.isInternal !== 1)
      .sortBy('name');
  },

  /**
   * Get active external vendors (excluding internal, only active)
   * Used by invoice processing for vendor detection.
   * @returns {Promise<Vendor[]>}
   */
  async getActiveExternal() {
    return await db.vendors
      .filter(v =>
        (v.isActive === true || v.isActive === 1) &&
        v.isInternal !== true && v.isInternal !== 1
      )
      .sortBy('name');
  },

  /**
   * Get vendor by ID
   * @param {number} id - Vendor ID
   * @returns {Promise<Vendor|undefined>}
   */
  async getById(id) {
    return await db.vendors.get(id);
  },

  /**
   * Get vendor by exact name (uses indexed nameLower - very fast)
   * @param {string} name - Vendor name
   * @returns {Promise<Vendor|undefined>}
   */
  async getByName(name) {
    const normalizedName = name.trim().toLowerCase();
    return await db.vendors
      .where('nameLower')
      .equals(normalizedName)
      .first();
  },

  /**
   * Get vendor by vendor code
   * @param {string} code - Vendor code
   * @returns {Promise<Vendor|undefined>}
   */
  async getByCode(code) {
    return await db.vendors
      .where('vendorCode')
      .equals(code)
      .first();
  },

  /**
   * Search vendors by name (optimized with indexed prefix matching)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 20)
   * @param {boolean} options.activeOnly - Only return active vendors (default: false)
   * @returns {Promise<Vendor[]>}
   */
  async search(query, { limit = 20, activeOnly = false } = {}) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    // Use indexed startsWith for prefix matching (fast)
    let results = await db.vendors
      .where('nameLower')
      .startsWith(normalizedQuery)
      .limit(limit)
      .toArray();

    // Filter by active status if requested
    if (activeOnly) {
      results = results.filter(v => v.isActive === true || v.isActive === 1);
    }

    return results;
  },

  /**
   * Create a new vendor
   * @param {Partial<Vendor>} vendor - Vendor data
   * @returns {Promise<number>} Created vendor ID
   */
  async create(vendor) {
    // Validate required field
    if (!vendor.name?.trim()) {
      throw new Error('Vendor name is required');
    }

    const nameLower = vendor.name.trim().toLowerCase();

    // Check for duplicate name
    const existing = await this.getByName(vendor.name);
    if (existing) {
      throw new Error(`A vendor with the name "${vendor.name}" already exists.`);
    }

    const now = new Date().toISOString();
    const data = {
      // Identity
      name: vendor.name.trim(),
      nameLower,
      legalName: vendor.legalName?.trim() || '',
      vendorCode: vendor.vendorCode?.trim() || '',

      // Contact
      contactName: vendor.contactName?.trim() || '',
      contactTitle: vendor.contactTitle?.trim() || '',
      email: vendor.email?.trim() || '',
      phone: vendor.phone?.trim() || '',
      fax: vendor.fax?.trim() || '',
      website: vendor.website?.trim() || '',

      // Address
      address: vendor.address?.trim() || '',
      city: vendor.city?.trim() || '',
      province: vendor.province?.trim() || '',
      postalCode: vendor.postalCode?.trim() || '',
      country: vendor.country?.trim() || null,

      // Business
      accountNumber: vendor.accountNumber?.trim() || '',
      taxNumber: vendor.taxNumber?.trim() || '',
      paymentTerms: vendor.paymentTerms?.trim() || null,
      currency: vendor.currency?.trim() || null,

      // Ordering
      minimumOrder: typeof vendor.minimumOrder === 'number' ? vendor.minimumOrder : 0,
      deliveryDays: vendor.deliveryDays?.trim() || '',
      leadTimeDays: typeof vendor.leadTimeDays === 'number' ? vendor.leadTimeDays : 0,
      orderEmail: vendor.orderEmail?.trim() || '',
      orderPhone: vendor.orderPhone?.trim() || '',

      // Status
      isActive: vendor.isActive !== false,
      isPrimary: vendor.isPrimary === true,
      isInternal: vendor.isInternal === true,
      rating: typeof vendor.rating === 'number' ? Math.min(5, Math.max(0, vendor.rating)) : 0,
      notes: vendor.notes?.trim() || '',

      // Timestamps
      createdAt: now,
      updatedAt: now,
      createdBy: vendor.createdBy || null,

      // Invoice parsing profile (stored during vendor onboarding)
      parsingProfile: vendor.parsingProfile || null,
      // Learned item corrections from invoice processing
      itemCorrections: vendor.itemCorrections || null
    };

    const id = await db.vendors.add(data);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushVendor?.({ ...data, id });

    return id;
  },

  /**
   * Update an existing vendor
   * @param {number} id - Vendor ID
   * @param {Partial<Vendor>} updates - Fields to update
   * @returns {Promise<boolean>}
   */
  async update(id, updates) {
    // Check if vendor exists
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Vendor with ID ${id} not found`);
    }

    // Check for duplicate name if name is being changed
    if (updates.name && updates.name.trim().toLowerCase() !== existing.nameLower) {
      const duplicate = await this.getByName(updates.name);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`A vendor with the name "${updates.name}" already exists.`);
      }
    }

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Update nameLower if name changed
    if (updates.name) {
      updatedData.nameLower = updates.name.trim().toLowerCase();
      updatedData.name = updates.name.trim();
    }

    // Validate rating if provided
    if (typeof updates.rating === 'number') {
      updatedData.rating = Math.min(5, Math.max(0, updates.rating));
    }

    await db.vendors.update(id, updatedData);

    // Auto-sync to cloud
    const vendor = await db.vendors.get(id);
    if (vendor) {
      const sync = await getCloudSync();
      sync.pushVendor?.(vendor);
    }

    return true;
  },

  /**
   * Soft delete a vendor (marks as inactive)
   * @param {number} id - Vendor ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    return await this.update(id, { isActive: false });
  },

  /**
   * Hard delete a vendor (permanent removal)
   * @param {number} id - Vendor ID
   * @returns {Promise<boolean>}
   */
  async hardDelete(id) {
    await db.vendors.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteVendorFromCloud?.(id);

    return true;
  },

  /**
   * Get vendors by city (for regional filtering)
   * @param {string} city - City name
   * @returns {Promise<Vendor[]>}
   */
  async getByCity(city) {
    return await db.vendors
      .where('city')
      .equals(city)
      .toArray();
  },

  /**
   * Get vendors by rating (minimum rating)
   * @param {number} minRating - Minimum rating (1-5)
   * @returns {Promise<Vendor[]>}
   */
  async getByMinRating(minRating) {
    return await db.vendors
      .filter(v => v.rating >= minRating && v.isActive)
      .sortBy('name');
  },

  /**
   * Get total vendor count
   * @returns {Promise<number>}
   */
  async count() {
    return await db.vendors.count();
  },

  /**
   * Get count of active vendors
   * @returns {Promise<number>}
   */
  async countActive() {
    return await db.vendors
      .where('isActive')
      .equals(1)
      .or('isActive')
      .equals(true)
      .count();
  },

  // ============================================
  // NEW: Invoice Processing Support Methods
  // ============================================

  /**
   * Get vendor by tax number (TPS/TVQ for Quebec, GST/HST for Canada)
   * Used by invoice processing for vendor detection.
   * @param {string} taxNumber - Tax registration number
   * @returns {Promise<Vendor|undefined>}
   */
  async getByTaxNumber(taxNumber) {
    if (!taxNumber) return undefined;

    // Normalize: remove spaces, dashes, uppercase
    const normalized = taxNumber.replace(/[\s\-\.]/g, '').toUpperCase();
    if (normalized.length < 9) return undefined;

    const vendors = await db.vendors.toArray();
    return vendors.find(v => {
      if (!v.taxNumber) return false;
      const vendorTax = v.taxNumber.replace(/[\s\-\.]/g, '').toUpperCase();
      // Exact or partial match (for when only TPS or TVQ is provided)
      return vendorTax === normalized ||
             vendorTax.includes(normalized) ||
             normalized.includes(vendorTax);
    });
  },

  /**
   * Get vendor by phone number
   * Used by invoice processing for vendor detection.
   * @param {string} phone - Phone number
   * @returns {Promise<Vendor|undefined>}
   */
  async getByPhone(phone) {
    if (!phone) return undefined;

    // Extract digits only
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return undefined;

    // Use last 10 digits (ignore country code)
    const searchDigits = digits.slice(-10);

    const vendors = await db.vendors.toArray();
    return vendors.find(v => {
      if (!v.phone) return false;
      const vendorDigits = v.phone.replace(/\D/g, '');
      if (vendorDigits.length < 10) return false;
      return vendorDigits.slice(-10) === searchDigits;
    });
  },

  /**
   * Update vendor's parsing profile
   * Used by invoice processing to store vendor-specific parsing rules.
   * @param {number} id - Vendor ID
   * @param {Object} profile - Parsing profile object
   * @returns {Promise<boolean>}
   */
  async updateParsingProfile(id, profile) {
    const vendor = await this.getById(id);
    if (!vendor) {
      throw new Error(`Vendor with ID ${id} not found`);
    }

    const now = new Date().toISOString();
    const profileWithMeta = {
      ...profile,
      updatedAt: now,
      createdAt: profile.createdAt || now
    };

    return await this.update(id, { parsingProfile: profileWithMeta });
  },

  /**
   * Get vendors with parsing profiles
   * Returns vendors that have been configured for invoice processing.
   * @returns {Promise<Vendor[]>}
   */
  async getWithProfiles() {
    const vendors = await db.vendors.toArray();
    return vendors.filter(v => v.parsingProfile != null);
  },

  /**
   * Generate next vendor code
   * @param {string} prefix - Code prefix (default: "VEN")
   * @returns {Promise<string>} Next available code (e.g., "VEN-001")
   */
  async generateNextCode(prefix = 'VEN') {
    const vendors = await db.vendors
      .where('vendorCode')
      .startsWith(prefix)
      .toArray();

    const numbers = vendors
      .map(v => {
        const match = v.vendorCode.match(new RegExp(`^${prefix}-(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));

    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNumber = maxNumber + 1;

    return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  },

  /**
   * Clear all vendors (use with caution)
   * @returns {Promise<void>}
   */
  async clear() {
    await db.vendors.clear();
  }
};
