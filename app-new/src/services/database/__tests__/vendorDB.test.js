/**
 * Vendor Database Tests
 *
 * Tests for vendorDB CRUD operations and business logic.
 * Run with: npm test -- --grep vendorDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

// Create a test database that mirrors the production schema
let testDb;
let vendorDB;

const createTestDb = () => {
  const db = new Dexie('TestVendorDB');

  db.version(1).stores({
    vendors: '++id, name, nameLower, vendorCode, isActive, isPrimary, rating, city, province, createdAt, updatedAt'
  });

  return db;
};

// Create vendorDB implementation for testing
const createVendorDB = (db) => ({
  async getAll() {
    return await db.vendors.orderBy('name').toArray();
  },

  async getById(id) {
    return await db.vendors.get(id);
  },

  async getActive() {
    return await db.vendors.where('isActive').equals(1).toArray();
  },

  async getPrimary() {
    return await db.vendors.where('isPrimary').equals(1).first();
  },

  async searchByName(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    return await db.vendors
      .filter(v => v.nameLower?.includes(term) || v.name?.toLowerCase().includes(term))
      .toArray();
  },

  async create(vendor) {
    // Validation
    if (!vendor.name?.trim()) {
      throw new Error('Vendor name is required');
    }

    const now = new Date().toISOString();
    const data = {
      name: vendor.name.trim(),
      nameLower: vendor.name.toLowerCase().trim(),
      vendorCode: vendor.vendorCode?.trim() || '',
      legalName: vendor.legalName?.trim() || '',
      dba: vendor.dba?.trim() || '',
      contactName: vendor.contactName?.trim() || '',
      contactTitle: vendor.contactTitle?.trim() || '',
      email: vendor.email?.trim() || '',
      phone: vendor.phone?.trim() || '',
      fax: vendor.fax?.trim() || '',
      website: vendor.website?.trim() || '',
      address: vendor.address?.trim() || '',
      city: vendor.city?.trim() || '',
      province: vendor.province?.trim() || '',
      postalCode: vendor.postalCode?.trim() || '',
      country: vendor.country?.trim() || 'Canada',
      businessNumber: vendor.businessNumber?.trim() || '',
      gstNumber: vendor.gstNumber?.trim() || '',
      qstNumber: vendor.qstNumber?.trim() || '',
      paymentTerms: vendor.paymentTerms || 'net30',
      creditLimit: typeof vendor.creditLimit === 'number' ? vendor.creditLimit : 0,
      currency: vendor.currency || 'CAD',
      accountNumber: vendor.accountNumber?.trim() || '',
      minimumOrder: typeof vendor.minimumOrder === 'number' ? vendor.minimumOrder : 0,
      deliveryDays: vendor.deliveryDays || [],
      cutoffTime: vendor.cutoffTime?.trim() || '',
      leadTimeDays: typeof vendor.leadTimeDays === 'number' ? vendor.leadTimeDays : 1,
      isActive: vendor.isActive !== false ? 1 : 0,
      isPrimary: vendor.isPrimary === true ? 1 : 0,
      rating: typeof vendor.rating === 'number' ? Math.min(5, Math.max(0, vendor.rating)) : null,
      notes: vendor.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
      createdBy: vendor.createdBy || null
    };

    // If setting as primary, unset other primary vendors
    if (data.isPrimary === 1) {
      await db.vendors.where('isPrimary').equals(1).modify({ isPrimary: 0 });
    }

    const id = await db.vendors.add(data);
    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await db.vendors.get(id);
    if (!existing) {
      throw new Error(`Vendor with ID ${id} not found`);
    }

    const data = { ...updates };

    // Update nameLower if name changed
    if (data.name) {
      data.nameLower = data.name.toLowerCase().trim();
    }

    // Handle primary vendor
    if (data.isPrimary === true || data.isPrimary === 1) {
      await db.vendors.where('isPrimary').equals(1).modify({ isPrimary: 0 });
      data.isPrimary = 1;
    }

    data.updatedAt = new Date().toISOString();

    await db.vendors.update(id, data);
    return await db.vendors.get(id);
  },

  async delete(id) {
    const existing = await db.vendors.get(id);
    if (!existing) {
      return false;
    }
    await db.vendors.delete(id);
    return true;
  },

  async setPrimary(id) {
    const vendor = await db.vendors.get(id);
    if (!vendor) {
      throw new Error(`Vendor with ID ${id} not found`);
    }

    // Unset all primary vendors
    await db.vendors.where('isPrimary').equals(1).modify({ isPrimary: 0 });

    // Set this one as primary
    await db.vendors.update(id, { isPrimary: 1, updatedAt: new Date().toISOString() });

    return await db.vendors.get(id);
  },

  async count() {
    return await db.vendors.count();
  }
});

describe('VendorDB', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.open();
    vendorDB = createVendorDB(testDb);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('Create Vendor', () => {
    it('should create vendor with all required fields', async () => {
      const vendor = await vendorDB.create({
        name: 'Sysco Canada',
        vendorCode: 'SYS001',
        email: 'orders@sysco.ca',
        phone: '514-555-1234',
        city: 'Montreal',
        province: 'QC'
      });

      expect(vendor.id).toBeDefined();
      expect(vendor.name).toBe('Sysco Canada');
      expect(vendor.nameLower).toBe('sysco canada');
      expect(vendor.vendorCode).toBe('SYS001');
      expect(vendor.city).toBe('Montreal');
      expect(vendor.isActive).toBe(1);
      expect(vendor.createdAt).toBeDefined();
    });

    it('should fail when creating vendor without name', async () => {
      await expect(vendorDB.create({
        vendorCode: 'TEST001',
        email: 'test@example.com'
      })).rejects.toThrow('Vendor name is required');
    });

    it('should fail when creating vendor with empty name', async () => {
      await expect(vendorDB.create({
        name: '   ',
        vendorCode: 'TEST001'
      })).rejects.toThrow('Vendor name is required');
    });

    it('should set default values correctly', async () => {
      const vendor = await vendorDB.create({
        name: 'Test Vendor'
      });

      expect(vendor.isActive).toBe(1);
      expect(vendor.isPrimary).toBe(0);
      expect(vendor.country).toBe('Canada');
      expect(vendor.currency).toBe('CAD');
      expect(vendor.paymentTerms).toBe('net30');
      expect(vendor.leadTimeDays).toBe(1);
    });

    it('should allow duplicate vendor names (different companies)', async () => {
      await vendorDB.create({ name: 'ABC Foods', city: 'Montreal' });
      const vendor2 = await vendorDB.create({ name: 'ABC Foods', city: 'Toronto' });

      expect(vendor2.id).toBeDefined();
      expect(vendor2.city).toBe('Toronto');

      const count = await vendorDB.count();
      expect(count).toBe(2);
    });

    it('should trim whitespace from fields', async () => {
      const vendor = await vendorDB.create({
        name: '  Test Vendor  ',
        email: '  test@example.com  ',
        city: '  Montreal  '
      });

      expect(vendor.name).toBe('Test Vendor');
      expect(vendor.nameLower).toBe('test vendor');
      expect(vendor.email).toBe('test@example.com');
      expect(vendor.city).toBe('Montreal');
    });

    it('should clamp rating between 0 and 5', async () => {
      const vendor1 = await vendorDB.create({ name: 'Vendor 1', rating: 10 });
      expect(vendor1.rating).toBe(5);

      const vendor2 = await vendorDB.create({ name: 'Vendor 2', rating: -5 });
      expect(vendor2.rating).toBe(0);

      const vendor3 = await vendorDB.create({ name: 'Vendor 3', rating: 3.5 });
      expect(vendor3.rating).toBe(3.5);
    });
  });

  describe('Read Vendor', () => {
    it('should read vendor by id', async () => {
      const created = await vendorDB.create({
        name: 'Test Vendor',
        vendorCode: 'TEST001',
        city: 'Montreal'
      });

      const vendor = await vendorDB.getById(created.id);

      expect(vendor).toBeDefined();
      expect(vendor.name).toBe('Test Vendor');
      expect(vendor.vendorCode).toBe('TEST001');
    });

    it('should return undefined for non-existent id', async () => {
      const vendor = await vendorDB.getById(99999);
      expect(vendor).toBeUndefined();
    });

    it('should get all vendors', async () => {
      await vendorDB.create({ name: 'Vendor A' });
      await vendorDB.create({ name: 'Vendor B' });
      await vendorDB.create({ name: 'Vendor C' });

      const vendors = await vendorDB.getAll();

      expect(vendors.length).toBe(3);
    });

    it('should get vendors sorted by name', async () => {
      await vendorDB.create({ name: 'Zeta Foods' });
      await vendorDB.create({ name: 'Alpha Supplies' });
      await vendorDB.create({ name: 'Beta Inc' });

      const vendors = await vendorDB.getAll();

      expect(vendors[0].name).toBe('Alpha Supplies');
      expect(vendors[1].name).toBe('Beta Inc');
      expect(vendors[2].name).toBe('Zeta Foods');
    });
  });

  describe('Update Vendor', () => {
    it('should update vendor fields correctly', async () => {
      const created = await vendorDB.create({
        name: 'Original Name',
        city: 'Montreal'
      });

      const updated = await vendorDB.update(created.id, {
        name: 'Updated Name',
        city: 'Toronto',
        phone: '416-555-1234'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.nameLower).toBe('updated name');
      expect(updated.city).toBe('Toronto');
      expect(updated.phone).toBe('416-555-1234');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime()
      );
    });

    it('should fail when updating non-existent vendor', async () => {
      await expect(vendorDB.update(99999, {
        name: 'New Name'
      })).rejects.toThrow('Vendor with ID 99999 not found');
    });

    it('should update nameLower when name changes', async () => {
      const created = await vendorDB.create({ name: 'Original' });

      await vendorDB.update(created.id, { name: 'UPPERCASE NAME' });

      const updated = await vendorDB.getById(created.id);
      expect(updated.nameLower).toBe('uppercase name');
    });
  });

  describe('Delete Vendor', () => {
    it('should delete vendor successfully', async () => {
      const vendor = await vendorDB.create({ name: 'To Delete' });

      const result = await vendorDB.delete(vendor.id);

      expect(result).toBe(true);
      const deleted = await vendorDB.getById(vendor.id);
      expect(deleted).toBeUndefined();
    });

    it('should return false when deleting non-existent vendor', async () => {
      const result = await vendorDB.delete(99999);
      expect(result).toBe(false);
    });
  });

  describe('Search Vendors', () => {
    beforeEach(async () => {
      await vendorDB.create({ name: 'Sysco Canada', city: 'Montreal' });
      await vendorDB.create({ name: 'Gordon Food Service', city: 'Toronto' });
      await vendorDB.create({ name: 'Sysco USA', city: 'New York' });
      await vendorDB.create({ name: 'Local Farm Fresh', city: 'Montreal' });
    });

    it('should search vendors by name', async () => {
      const results = await vendorDB.searchByName('Sysco');

      expect(results.length).toBe(2);
      expect(results.every(v => v.name.includes('Sysco'))).toBe(true);
    });

    it('should search vendors with partial match', async () => {
      const results = await vendorDB.searchByName('Food');

      expect(results.length).toBe(1);
      expect(results.some(v => v.name === 'Gordon Food Service')).toBe(true);
    });

    it('should search case-insensitively', async () => {
      const results = await vendorDB.searchByName('SYSCO');

      expect(results.length).toBe(2);
    });

    it('should return empty array for no matches', async () => {
      const results = await vendorDB.searchByName('NonExistent');

      expect(results).toEqual([]);
    });

    it('should handle empty search term', async () => {
      const results = await vendorDB.searchByName('');

      // Should return all or none depending on implementation
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Filter Active Vendors', () => {
    beforeEach(async () => {
      await vendorDB.create({ name: 'Active Vendor 1', isActive: true });
      await vendorDB.create({ name: 'Active Vendor 2', isActive: true });
      await vendorDB.create({ name: 'Inactive Vendor', isActive: false });
    });

    it('should get all active vendors', async () => {
      const active = await vendorDB.getActive();

      expect(active.length).toBe(2);
      expect(active.every(v => v.isActive === 1)).toBe(true);
    });
  });

  describe('Primary Vendor', () => {
    it('should set primary vendor correctly', async () => {
      const vendor1 = await vendorDB.create({ name: 'Vendor 1' });
      const vendor2 = await vendorDB.create({ name: 'Vendor 2' });

      await vendorDB.setPrimary(vendor1.id);

      const primary = await vendorDB.getPrimary();
      expect(primary.id).toBe(vendor1.id);
    });

    it('should ensure only one primary vendor at a time', async () => {
      const vendor1 = await vendorDB.create({ name: 'Vendor 1', isPrimary: true });
      const vendor2 = await vendorDB.create({ name: 'Vendor 2' });

      // Verify vendor1 is primary
      let primary = await vendorDB.getPrimary();
      expect(primary.id).toBe(vendor1.id);

      // Set vendor2 as primary
      await vendorDB.setPrimary(vendor2.id);

      // Verify vendor2 is now primary
      primary = await vendorDB.getPrimary();
      expect(primary.id).toBe(vendor2.id);

      // Verify vendor1 is no longer primary
      const updatedVendor1 = await vendorDB.getById(vendor1.id);
      expect(updatedVendor1.isPrimary).toBe(0);
    });

    it('should fail when setting primary for non-existent vendor', async () => {
      await expect(vendorDB.setPrimary(99999)).rejects.toThrow(
        'Vendor with ID 99999 not found'
      );
    });

    it('should unset previous primary when creating new primary vendor', async () => {
      const vendor1 = await vendorDB.create({ name: 'Vendor 1', isPrimary: true });
      const vendor2 = await vendorDB.create({ name: 'Vendor 2', isPrimary: true });

      // Vendor2 should now be primary
      const primary = await vendorDB.getPrimary();
      expect(primary.id).toBe(vendor2.id);

      // Vendor1 should no longer be primary
      const updatedVendor1 = await vendorDB.getById(vendor1.id);
      expect(updatedVendor1.isPrimary).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in vendor name', async () => {
      const vendor = await vendorDB.create({
        name: "Boulangerie L'Étoile & Fils"
      });

      expect(vendor.name).toBe("Boulangerie L'Étoile & Fils");
      expect(vendor.nameLower).toBe("boulangerie l'étoile & fils");

      const found = await vendorDB.searchByName("L'Étoile");
      expect(found.length).toBe(1);
    });

    it('should handle unicode characters', async () => {
      const vendor = await vendorDB.create({
        name: '日本食品株式会社',
        city: '東京'
      });

      expect(vendor.name).toBe('日本食品株式会社');
      expect(vendor.city).toBe('東京');
    });

    it('should handle very long vendor names', async () => {
      const longName = 'A'.repeat(500);
      const vendor = await vendorDB.create({ name: longName });

      expect(vendor.name).toBe(longName);
      expect(vendor.name.length).toBe(500);
    });

    it('should handle null and undefined fields gracefully', async () => {
      const vendor = await vendorDB.create({
        name: 'Test',
        email: null,
        phone: undefined,
        rating: null
      });

      expect(vendor.email).toBe('');
      expect(vendor.phone).toBe('');
      expect(vendor.rating).toBeNull();
    });
  });
});
