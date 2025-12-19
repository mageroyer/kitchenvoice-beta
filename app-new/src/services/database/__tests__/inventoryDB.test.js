/**
 * Inventory Item Database Tests
 *
 * Tests for inventoryItemDB CRUD operations and business logic.
 * Run with: npm test -- --grep inventoryDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

// Create a test database
let testDb;
let inventoryItemDB;

const createTestDb = () => {
  const db = new Dexie('TestInventoryDB');

  db.version(1).stores({
    vendors: '++id, name, nameLower, isActive',
    inventoryItems: '++id, name, nameNormalized, sku, vendorId, [vendorId+name], category, isActive, currentPrice, lastPurchaseDate, createdAt, updatedAt'
  });

  return db;
};

// Normalize name helper (remove accents, lowercase)
const normalizeName = (name) => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
};

// Create inventoryItemDB implementation for testing
const createInventoryItemDB = (db) => ({
  async getAll() {
    return await db.inventoryItems.orderBy('name').toArray();
  },

  async getById(id) {
    const item = await db.inventoryItems.get(id);
    if (item && item.vendorId) {
      const vendor = await db.vendors.get(item.vendorId);
      if (vendor) {
        item.vendor = vendor;
      }
    }
    return item;
  },

  async getByVendor(vendorId) {
    return await db.inventoryItems.where('vendorId').equals(vendorId).toArray();
  },

  async getByCategory(category) {
    return await db.inventoryItems.where('category').equals(category).toArray();
  },

  async getActive() {
    return await db.inventoryItems.where('isActive').equals(1).toArray();
  },

  async searchByName(searchTerm) {
    const normalized = normalizeName(searchTerm);
    return await db.inventoryItems
      .filter(item =>
        item.nameNormalized?.includes(normalized) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .toArray();
  },

  async getLowStock(threshold = null) {
    return await db.inventoryItems
      .filter(item => {
        const limit = threshold !== null ? threshold : (item.reorderPoint || 0);
        return item.isActive === 1 &&
               item.currentStock !== null &&
               item.currentStock <= limit;
      })
      .toArray();
  },

  async checkDuplicate(vendorId, name) {
    const normalized = normalizeName(name);
    const existing = await db.inventoryItems
      .where('[vendorId+name]')
      .equals([vendorId, name])
      .first();

    if (existing) return existing;

    // Also check normalized name
    return await db.inventoryItems
      .filter(item =>
        item.vendorId === vendorId &&
        item.nameNormalized === normalized
      )
      .first();
  },

  async create(item) {
    // Validation
    if (!item.name?.trim()) {
      throw new Error('Item name is required');
    }
    if (!item.vendorId) {
      throw new Error('Vendor ID is required');
    }

    // Check vendor exists
    const vendor = await db.vendors.get(item.vendorId);
    if (!vendor) {
      throw new Error(`Vendor with ID ${item.vendorId} not found`);
    }

    // Check for duplicate
    const duplicate = await this.checkDuplicate(item.vendorId, item.name);
    if (duplicate) {
      throw new Error(`Item "${item.name}" already exists for this vendor`);
    }

    const now = new Date().toISOString();
    const data = {
      name: item.name.trim(),
      nameNormalized: normalizeName(item.name),
      displayName: item.displayName?.trim() || item.name.trim(),
      description: item.description?.trim() || '',
      sku: item.sku?.trim() || '',
      vendorSku: item.vendorSku?.trim() || '',
      vendorId: item.vendorId,
      vendorName: vendor.name,
      category: item.category?.trim() || '',
      subcategory: item.subcategory?.trim() || '',
      unit: item.unit?.trim() || 'ea',
      unitSize: typeof item.unitSize === 'number' ? item.unitSize : null,
      unitsPerCase: typeof item.unitsPerCase === 'number' ? item.unitsPerCase : null,
      currentPrice: typeof item.currentPrice === 'number' ? Math.round(item.currentPrice * 100) / 100 : 0,
      lastPrice: typeof item.lastPrice === 'number' ? Math.round(item.lastPrice * 100) / 100 : null,
      parLevel: typeof item.parLevel === 'number' ? item.parLevel : null,
      reorderPoint: typeof item.reorderPoint === 'number' ? item.reorderPoint : null,
      reorderQty: typeof item.reorderQty === 'number' ? item.reorderQty : null,
      currentStock: typeof item.currentStock === 'number' ? item.currentStock : null,
      storageLocation: item.storageLocation?.trim() || '',
      isActive: item.isActive !== false ? 1 : 0,
      lastPurchaseDate: item.lastPurchaseDate || null,
      createdAt: now,
      updatedAt: now,
      createdBy: item.createdBy || null
    };

    const id = await db.inventoryItems.add(data);
    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await db.inventoryItems.get(id);
    if (!existing) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    const data = { ...updates };

    // Update nameNormalized if name changed
    if (data.name) {
      data.nameNormalized = normalizeName(data.name);
    }

    // Round price values
    if (typeof data.currentPrice === 'number') {
      data.currentPrice = Math.round(data.currentPrice * 100) / 100;
    }

    data.updatedAt = new Date().toISOString();

    await db.inventoryItems.update(id, data);
    return await db.inventoryItems.get(id);
  },

  async updateStock(id, newStock) {
    const existing = await db.inventoryItems.get(id);
    if (!existing) {
      throw new Error(`Inventory item with ID ${id} not found`);
    }

    await db.inventoryItems.update(id, {
      currentStock: newStock,
      updatedAt: new Date().toISOString()
    });

    return await db.inventoryItems.get(id);
  },

  async delete(id) {
    const existing = await db.inventoryItems.get(id);
    if (!existing) {
      return false;
    }
    await db.inventoryItems.delete(id);
    return true;
  },

  async count() {
    return await db.inventoryItems.count();
  }
});

describe('InventoryItemDB', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.open();
    inventoryItemDB = createInventoryItemDB(testDb);

    // Add test vendors
    await testDb.vendors.bulkAdd([
      { id: 1, name: 'Sysco Canada', nameLower: 'sysco canada', isActive: 1 },
      { id: 2, name: 'Gordon Food Service', nameLower: 'gordon food service', isActive: 1 },
      { id: 3, name: 'Local Farm', nameLower: 'local farm', isActive: 1 }
    ]);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('Create Item', () => {
    it('should create item with required fields', async () => {
      const item = await inventoryItemDB.create({
        name: 'Organic Tomatoes',
        vendorId: 1,
        category: 'Produce',
        unit: 'case',
        currentPrice: 24.99
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Organic Tomatoes');
      expect(item.nameNormalized).toBe('organic tomatoes');
      expect(item.vendorId).toBe(1);
      expect(item.vendorName).toBe('Sysco Canada');
      expect(item.currentPrice).toBe(24.99);
      expect(item.isActive).toBe(1);
    });

    it('should fail when creating item without vendorId', async () => {
      await expect(inventoryItemDB.create({
        name: 'Test Item',
        category: 'Test'
      })).rejects.toThrow('Vendor ID is required');
    });

    it('should fail when creating item without name', async () => {
      await expect(inventoryItemDB.create({
        vendorId: 1,
        category: 'Test'
      })).rejects.toThrow('Item name is required');
    });

    it('should fail when creating item with non-existent vendor', async () => {
      await expect(inventoryItemDB.create({
        name: 'Test Item',
        vendorId: 99999
      })).rejects.toThrow('Vendor with ID 99999 not found');
    });

    it('should fail when creating duplicate name+vendor combination', async () => {
      await inventoryItemDB.create({
        name: 'Tomatoes',
        vendorId: 1,
        category: 'Produce'
      });

      await expect(inventoryItemDB.create({
        name: 'Tomatoes',
        vendorId: 1,
        category: 'Produce'
      })).rejects.toThrow('Item "Tomatoes" already exists for this vendor');
    });

    it('should allow same name with different vendor', async () => {
      await inventoryItemDB.create({
        name: 'Tomatoes',
        vendorId: 1,
        category: 'Produce'
      });

      const item2 = await inventoryItemDB.create({
        name: 'Tomatoes',
        vendorId: 2,
        category: 'Produce'
      });

      expect(item2.id).toBeDefined();
      expect(item2.vendorId).toBe(2);

      const count = await inventoryItemDB.count();
      expect(count).toBe(2);
    });

    it('should normalize name for search', async () => {
      const item = await inventoryItemDB.create({
        name: 'Crème Fraîche',
        vendorId: 1,
        category: 'Dairy'
      });

      expect(item.nameNormalized).toBe('creme fraiche');
    });

    it('should round price to 2 decimal places', async () => {
      const item = await inventoryItemDB.create({
        name: 'Test Item',
        vendorId: 1,
        currentPrice: 12.999
      });

      expect(item.currentPrice).toBe(13);
    });
  });

  describe('Read Item', () => {
    it('should read item by id with vendor info', async () => {
      const created = await inventoryItemDB.create({
        name: 'Test Item',
        vendorId: 1,
        category: 'Test'
      });

      const item = await inventoryItemDB.getById(created.id);

      expect(item).toBeDefined();
      expect(item.name).toBe('Test Item');
      expect(item.vendor).toBeDefined();
      expect(item.vendor.name).toBe('Sysco Canada');
    });

    it('should return undefined for non-existent id', async () => {
      const item = await inventoryItemDB.getById(99999);
      expect(item).toBeUndefined();
    });

    it('should get all items', async () => {
      await inventoryItemDB.create({ name: 'Item A', vendorId: 1 });
      await inventoryItemDB.create({ name: 'Item B', vendorId: 1 });
      await inventoryItemDB.create({ name: 'Item C', vendorId: 2 });

      const items = await inventoryItemDB.getAll();

      expect(items.length).toBe(3);
    });
  });

  describe('Update Item', () => {
    it('should update item stock correctly', async () => {
      const created = await inventoryItemDB.create({
        name: 'Test Item',
        vendorId: 1,
        currentStock: 100
      });

      const updated = await inventoryItemDB.updateStock(created.id, 75);

      expect(updated.currentStock).toBe(75);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime()
      );
    });

    it('should update multiple fields', async () => {
      const created = await inventoryItemDB.create({
        name: 'Test Item',
        vendorId: 1,
        currentPrice: 10.00
      });

      const updated = await inventoryItemDB.update(created.id, {
        name: 'Updated Item',
        currentPrice: 15.00,
        category: 'New Category'
      });

      expect(updated.name).toBe('Updated Item');
      expect(updated.nameNormalized).toBe('updated item');
      expect(updated.currentPrice).toBe(15);
      expect(updated.category).toBe('New Category');
    });

    it('should fail when updating non-existent item', async () => {
      await expect(inventoryItemDB.update(99999, {
        name: 'New Name'
      })).rejects.toThrow('Inventory item with ID 99999 not found');
    });
  });

  describe('Search Items', () => {
    beforeEach(async () => {
      await inventoryItemDB.create({ name: 'Tomatoes Roma', vendorId: 1, category: 'Produce' });
      await inventoryItemDB.create({ name: 'Tomatoes Cherry', vendorId: 1, category: 'Produce' });
      await inventoryItemDB.create({ name: 'Tomatoes Heirloom', vendorId: 2, category: 'Produce' });
      await inventoryItemDB.create({ name: 'Crème Fraîche', vendorId: 1, category: 'Dairy' });
      await inventoryItemDB.create({ name: 'Beef Tenderloin', vendorId: 3, category: 'Meat' });
    });

    it('should search by name and return all vendors versions', async () => {
      const results = await inventoryItemDB.searchByName('Tomatoes');

      expect(results.length).toBe(3);
      expect(results.some(i => i.vendorId === 1)).toBe(true);
      expect(results.some(i => i.vendorId === 2)).toBe(true);
    });

    it('should search by normalized name (no accents)', async () => {
      const results = await inventoryItemDB.searchByName('creme fraiche');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Crème Fraîche');
    });

    it('should search case-insensitively', async () => {
      const results = await inventoryItemDB.searchByName('TOMATOES');

      expect(results.length).toBe(3);
    });

    it('should handle partial matches', async () => {
      const results = await inventoryItemDB.searchByName('Roma');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Tomatoes Roma');
    });
  });

  describe('Filter Items', () => {
    beforeEach(async () => {
      await inventoryItemDB.create({ name: 'Tomatoes', vendorId: 1, category: 'Produce' });
      await inventoryItemDB.create({ name: 'Lettuce', vendorId: 1, category: 'Produce' });
      await inventoryItemDB.create({ name: 'Milk', vendorId: 2, category: 'Dairy' });
      await inventoryItemDB.create({ name: 'Butter', vendorId: 2, category: 'Dairy' });
      await inventoryItemDB.create({ name: 'Inactive Item', vendorId: 1, category: 'Test', isActive: false });
    });

    it('should filter by category', async () => {
      const produce = await inventoryItemDB.getByCategory('Produce');

      expect(produce.length).toBe(2);
      expect(produce.every(i => i.category === 'Produce')).toBe(true);
    });

    it('should filter by vendor', async () => {
      const vendor1Items = await inventoryItemDB.getByVendor(1);

      expect(vendor1Items.length).toBe(3); // Including inactive
      expect(vendor1Items.every(i => i.vendorId === 1)).toBe(true);
    });

    it('should get only active items', async () => {
      const active = await inventoryItemDB.getActive();

      expect(active.length).toBe(4);
      expect(active.every(i => i.isActive === 1)).toBe(true);
    });
  });

  describe('Low Stock Items', () => {
    beforeEach(async () => {
      await inventoryItemDB.create({
        name: 'Low Stock Item',
        vendorId: 1,
        currentStock: 5,
        reorderPoint: 10,
        isActive: true
      });
      await inventoryItemDB.create({
        name: 'OK Stock Item',
        vendorId: 1,
        currentStock: 50,
        reorderPoint: 10,
        isActive: true
      });
      await inventoryItemDB.create({
        name: 'Zero Stock Item',
        vendorId: 1,
        currentStock: 0,
        reorderPoint: 5,
        isActive: true
      });
      await inventoryItemDB.create({
        name: 'Inactive Low Stock',
        vendorId: 1,
        currentStock: 1,
        reorderPoint: 10,
        isActive: false
      });
    });

    it('should get low stock items below threshold', async () => {
      const lowStock = await inventoryItemDB.getLowStock();

      expect(lowStock.length).toBe(2); // Low Stock Item and Zero Stock Item
      expect(lowStock.every(i => i.currentStock <= i.reorderPoint)).toBe(true);
    });

    it('should respect custom threshold', async () => {
      const lowStock = await inventoryItemDB.getLowStock(60);

      expect(lowStock.length).toBe(3); // All active items below 60
    });

    it('should exclude inactive items from low stock', async () => {
      const lowStock = await inventoryItemDB.getLowStock();

      expect(lowStock.every(i => i.isActive === 1)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in item names', async () => {
      const item = await inventoryItemDB.create({
        name: "Bœuf Bourguignon (1kg)",
        vendorId: 1
      });

      expect(item.name).toBe("Bœuf Bourguignon (1kg)");
      expect(item.nameNormalized).toBe('buf bourguignon 1kg');

      // Search using normalized form (œ removed)
      const found = await inventoryItemDB.searchByName('buf');
      expect(found.length).toBe(1);
    });

    it('should handle unicode characters', async () => {
      const item = await inventoryItemDB.create({
        name: '味噌 (Miso)',
        vendorId: 1,
        category: 'Asian'
      });

      expect(item.name).toBe('味噌 (Miso)');
    });

    it('should handle null stock values', async () => {
      const item = await inventoryItemDB.create({
        name: 'No Stock Tracked',
        vendorId: 1,
        currentStock: null
      });

      expect(item.currentStock).toBeNull();
    });

    it('should handle zero prices', async () => {
      const item = await inventoryItemDB.create({
        name: 'Free Item',
        vendorId: 1,
        currentPrice: 0
      });

      expect(item.currentPrice).toBe(0);
    });

    it('should handle very long item names', async () => {
      const longName = 'A'.repeat(500);
      const item = await inventoryItemDB.create({
        name: longName,
        vendorId: 1
      });

      expect(item.name.length).toBe(500);
    });
  });
});
