/**
 * Vendor Service Tests
 *
 * Unit tests for vendorService business logic layer.
 * Tests validation, CRUD operations, search, and statistics.
 *
 * Run with: npm test -- --grep vendorService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database modules
vi.mock('../../database/indexedDB', () => ({
  vendorDB: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hardDelete: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    getActive: vi.fn(),
    getActiveExternal: vi.fn(),
    getExternal: vi.fn(),
    getInternal: vi.fn(),
    getPrimary: vi.fn(),
    getByName: vi.fn(),
    getByCode: vi.fn(),
    search: vi.fn(),
    generateNextCode: vi.fn()
  },
  inventoryItemDB: {
    getByVendor: vi.fn()
  }
}));

vi.mock('../../../utils/validation', () => ({
  isValidEmail: vi.fn((email) => {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  })
}));

// Import after mocking
import {
  createVendor,
  updateVendor,
  deleteVendor,
  getVendor,
  getAllVendors,
  searchVendors,
  getVendorWithItems,
  getVendorStats,
  isValidPhone,
  validateVendorData
} from '../vendorService';

import { vendorDB, inventoryItemDB } from '../../database/indexedDB';
import { isValidEmail } from '../../../utils/validation';

describe('VendorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================
  // Validation Tests
  // ============================================

  describe('isValidPhone', () => {
    it('should accept empty phone (optional field)', () => {
      expect(isValidPhone('')).toBe(true);
      expect(isValidPhone(null)).toBe(true);
      expect(isValidPhone(undefined)).toBe(true);
    });

    it('should accept valid phone formats', () => {
      expect(isValidPhone('5145551234')).toBe(true);
      expect(isValidPhone('514-555-1234')).toBe(true);
      expect(isValidPhone('(514) 555-1234')).toBe(true);
      expect(isValidPhone('+1-514-555-1234')).toBe(true);
      expect(isValidPhone('1.514.555.1234')).toBe(true);
    });

    it('should reject invalid phone formats', () => {
      expect(isValidPhone('123')).toBe(false);
      expect(isValidPhone('abcdefghij')).toBe(false);
      expect(isValidPhone('514-555-123a')).toBe(false);
    });
  });

  describe('validateVendorData', () => {
    it('should require name on create', () => {
      const result = validateVendorData({}, { isUpdate: false });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Vendor name is required');
    });

    it('should not require name on update', () => {
      const result = validateVendorData({}, { isUpdate: true });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate email format', () => {
      const result = validateVendorData({
        name: 'Test Vendor',
        email: 'invalid-email'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should validate rating range', () => {
      const result1 = validateVendorData({ name: 'Test', rating: -1 });
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('Rating must be a number between 0 and 5');

      const result2 = validateVendorData({ name: 'Test', rating: 6 });
      expect(result2.valid).toBe(false);

      const result3 = validateVendorData({ name: 'Test', rating: 3 });
      expect(result3.valid).toBe(true);
    });

    it('should accept valid data with all optional fields', () => {
      const result = validateVendorData({
        name: 'Complete Vendor',
        legalName: 'Complete Vendor Inc.',
        email: 'vendor@example.com',
        phone: '514-555-1234',
        orderEmail: 'orders@example.com',
        orderPhone: '514-555-5678',
        rating: 4.5,
        minimumOrder: 100,
        leadTimeDays: 3,
        postalCode: 'H2X 1Y4',
        website: 'https://example.com'
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================
  // Create Vendor Tests
  // ============================================

  describe('createVendor', () => {
    it('should create vendor with valid data and return with id', async () => {
      const mockVendor = {
        id: 1,
        name: 'Sysco Canada',
        email: 'orders@sysco.ca',
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z'
      };

      vendorDB.create.mockResolvedValue(1);
      vendorDB.getById.mockResolvedValue(mockVendor);

      const result = await createVendor({
        name: 'Sysco Canada',
        email: 'orders@sysco.ca'
      });

      expect(result).toEqual(mockVendor);
      expect(result.id).toBe(1);
      expect(vendorDB.create).toHaveBeenCalledTimes(1);
      expect(vendorDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sysco Canada',
          email: 'orders@sysco.ca',
          isActive: true
        })
      );
    });

    it('should throw validation error when name is missing', async () => {
      await expect(createVendor({
        email: 'test@example.com'
      })).rejects.toThrow('Vendor name is required');

      expect(vendorDB.create).not.toHaveBeenCalled();
    });

    it('should throw validation error for invalid email', async () => {
      await expect(createVendor({
        name: 'Test Vendor',
        email: 'not-an-email'
      })).rejects.toThrow('Invalid email format');

      expect(vendorDB.create).not.toHaveBeenCalled();
    });

    it('should save all optional fields correctly', async () => {
      const mockVendor = {
        id: 1,
        name: 'Complete Vendor',
        legalName: 'Complete Vendor Inc.',
        vendorCode: 'VEN-001',
        email: 'vendor@example.com',
        phone: '514-555-1234',
        contactName: 'John Doe',
        address: '123 Main St',
        city: 'Montreal',
        province: 'QC',
        postalCode: 'H2X 1Y4',
        country: 'Canada',
        paymentTerms: 'Net 30',
        minimumOrder: 100,
        leadTimeDays: 3,
        rating: 4.5,
        isActive: true,
        createdAt: '2025-01-01T00:00:00.000Z'
      };

      vendorDB.create.mockResolvedValue(1);
      vendorDB.getById.mockResolvedValue(mockVendor);

      const result = await createVendor({
        name: 'Complete Vendor',
        legalName: 'Complete Vendor Inc.',
        vendorCode: 'VEN-001',
        email: 'vendor@example.com',
        phone: '514-555-1234',
        contactName: 'John Doe',
        address: '123 Main St',
        city: 'Montreal',
        province: 'QC',
        postalCode: 'H2X 1Y4',
        country: 'Canada',
        paymentTerms: 'Net 30',
        minimumOrder: 100,
        leadTimeDays: 3,
        rating: 4.5
      });

      expect(result.legalName).toBe('Complete Vendor Inc.');
      expect(result.city).toBe('Montreal');
      expect(result.rating).toBe(4.5);
      expect(vendorDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Complete Vendor',
          legalName: 'Complete Vendor Inc.',
          city: 'Montreal',
          rating: 4.5
        })
      );
    });

    it('should trigger cloud sync via vendorDB.create', async () => {
      vendorDB.create.mockResolvedValue(1);
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });

      await createVendor({ name: 'Test Vendor' });

      // vendorDB.create handles cloud sync internally
      expect(vendorDB.create).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Update Vendor Tests
  // ============================================

  describe('updateVendor', () => {
    it('should update existing vendor successfully', async () => {
      const existingVendor = {
        id: 1,
        name: 'Original Name',
        city: 'Montreal'
      };

      const updatedVendor = {
        id: 1,
        name: 'Updated Name',
        city: 'Toronto',
        updatedAt: '2025-01-02T00:00:00.000Z'
      };

      vendorDB.getById
        .mockResolvedValueOnce(existingVendor)
        .mockResolvedValueOnce(updatedVendor);
      vendorDB.update.mockResolvedValue(true);

      const result = await updateVendor(1, {
        name: 'Updated Name',
        city: 'Toronto'
      });

      expect(result.name).toBe('Updated Name');
      expect(result.city).toBe('Toronto');
      expect(vendorDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'Updated Name',
        city: 'Toronto',
        updatedAt: expect.any(String)
      }));
    });

    it('should throw error when vendor not found', async () => {
      vendorDB.getById.mockResolvedValue(null);

      await expect(updateVendor(99999, {
        name: 'New Name'
      })).rejects.toThrow('Vendor not found');

      expect(vendorDB.update).not.toHaveBeenCalled();
    });

    it('should throw validation error for invalid data', async () => {
      const existingVendor = { id: 1, name: 'Test' };
      vendorDB.getById.mockResolvedValue(existingVendor);

      await expect(updateVendor(1, {
        email: 'not-valid-email'
      })).rejects.toThrow('Invalid email format');

      expect(vendorDB.update).not.toHaveBeenCalled();
    });

    it('should trigger cloud sync via vendorDB.update', async () => {
      vendorDB.getById
        .mockResolvedValueOnce({ id: 1, name: 'Test' })
        .mockResolvedValueOnce({ id: 1, name: 'Updated' });
      vendorDB.update.mockResolvedValue(true);

      await updateVendor(1, { name: 'Updated' });

      // vendorDB.update handles cloud sync internally
      expect(vendorDB.update).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Delete Vendor Tests
  // ============================================

  describe('deleteVendor', () => {
    it('should delete vendor with no linked items', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });
      inventoryItemDB.getByVendor.mockResolvedValue([]);
      vendorDB.delete.mockResolvedValue(true);

      const result = await deleteVendor(1);

      expect(result).toBe(true);
      expect(vendorDB.delete).toHaveBeenCalledWith(1);
    });

    it('should throw error when vendor has linked items', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test Vendor' });
      inventoryItemDB.getByVendor.mockResolvedValue([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ]);

      await expect(deleteVendor(1)).rejects.toThrow(
        'Cannot delete vendor. 3 inventory items are linked to this vendor'
      );

      expect(vendorDB.delete).not.toHaveBeenCalled();
    });

    it('should include correct item count in error message for single item', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });
      inventoryItemDB.getByVendor.mockResolvedValue([
        { id: 1, name: 'Single Item' }
      ]);

      await expect(deleteVendor(1)).rejects.toThrow(
        '1 inventory item is linked'
      );
    });

    it('should allow force delete with linked items', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });
      inventoryItemDB.getByVendor.mockResolvedValue([
        { id: 1, name: 'Item 1' }
      ]);
      vendorDB.delete.mockResolvedValue(true);

      const result = await deleteVendor(1, { force: true });

      expect(result).toBe(true);
      expect(vendorDB.delete).toHaveBeenCalledWith(1);
    });

    it('should trigger cloud sync via vendorDB.delete', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });
      inventoryItemDB.getByVendor.mockResolvedValue([]);
      vendorDB.delete.mockResolvedValue(true);

      await deleteVendor(1);

      // vendorDB.delete handles cloud sync internally
      expect(vendorDB.delete).toHaveBeenCalledTimes(1);
    });

    it('should use hardDelete when option is true', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Test' });
      inventoryItemDB.getByVendor.mockResolvedValue([]);
      vendorDB.hardDelete.mockResolvedValue(true);

      await deleteVendor(1, { hardDelete: true });

      expect(vendorDB.hardDelete).toHaveBeenCalledWith(1);
      expect(vendorDB.delete).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Search Vendor Tests
  // ============================================

  describe('searchVendors', () => {
    it('should return exact match vendor', async () => {
      const vendors = [
        { id: 1, name: 'Sysco Canada', isActive: true }
      ];
      vendorDB.search.mockResolvedValue(vendors);
      // Defensive code uses getExternal for external vendors
      vendorDB.getExternal.mockResolvedValue(vendors);

      const results = await searchVendors('Sysco Canada');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Sysco Canada');
    });

    it('should return partial matches', async () => {
      const vendors = [
        { id: 1, name: 'Sysco Canada', isActive: true },
        { id: 2, name: 'Sysco USA', isActive: true }
      ];
      vendorDB.search.mockResolvedValue(vendors);
      vendorDB.getExternal.mockResolvedValue(vendors);

      const results = await searchVendors('Sysco');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every(v => v.name.includes('Sysco'))).toBe(true);
    });

    it('should return empty array for no matches', async () => {
      vendorDB.search.mockResolvedValue([]);
      vendorDB.getExternal.mockResolvedValue([]);

      const results = await searchVendors('NonExistentVendor12345');

      expect(results).toHaveLength(0);
    });

    it('should match case insensitively', async () => {
      const vendors = [
        { id: 1, name: 'Sysco Canada', isActive: true }
      ];
      vendorDB.search.mockResolvedValue(vendors);
      vendorDB.getExternal.mockResolvedValue(vendors);

      const results = await searchVendors('SYSCO CANADA');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Sysco Canada');
    });

    it('should return empty array for empty query', async () => {
      const results = await searchVendors('');
      expect(results).toHaveLength(0);
      expect(vendorDB.search).not.toHaveBeenCalled();
    });

    it('should return empty array for null query', async () => {
      const results = await searchVendors(null);
      expect(results).toHaveLength(0);
    });

    it('should search legalName as well', async () => {
      vendorDB.search.mockResolvedValue([]);
      // Defensive code uses getExternal for external vendors
      vendorDB.getExternal.mockResolvedValue([
        { id: 1, name: 'ABC Foods', legalName: 'ABC Foods Corporation', isActive: true }
      ]);

      const results = await searchVendors('Corporation');

      expect(results).toHaveLength(1);
      expect(results[0].legalName).toBe('ABC Foods Corporation');
    });
  });

  // ============================================
  // Get Vendor Stats Tests
  // ============================================

  describe('getVendorStats', () => {
    it('should return correct counts for vendor with items', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'Sysco Canada'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([
        {
          id: 1,
          name: 'Flour',
          isActive: true,
          currentStock: 10,
          currentPrice: 25.00,
          category: 'Dry Goods',
          lastPurchaseDate: '2025-01-01',
          purchaseCount: 5,
          totalSpent: 500
        },
        {
          id: 2,
          name: 'Sugar',
          isActive: true,
          currentStock: 5,
          currentPrice: 15.00,
          category: 'Dry Goods',
          lastPurchaseDate: '2025-01-10',
          purchaseCount: 3,
          totalSpent: 200
        },
        {
          id: 3,
          name: 'Salt',
          isActive: false,
          currentStock: 0,
          currentPrice: 5.00,
          category: 'Spices',
          purchaseCount: 1,
          totalSpent: 10
        }
      ]);

      const stats = await getVendorStats(1);

      expect(stats.itemCount).toBe(3);
      expect(stats.activeItemCount).toBe(2);
      expect(stats.totalInventoryValue).toBe(325); // (10*25) + (5*15) + (0*5)
      expect(stats.totalPurchases).toBe(9); // 5 + 3 + 1
      expect(stats.totalSpent).toBe(710); // 500 + 200 + 10
    });

    it('should return zero counts for vendor with no items', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'New Vendor'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([]);

      const stats = await getVendorStats(1);

      expect(stats.itemCount).toBe(0);
      expect(stats.activeItemCount).toBe(0);
      expect(stats.totalInventoryValue).toBe(0);
      expect(stats.totalPurchases).toBe(0);
      expect(stats.totalSpent).toBe(0);
      expect(stats.lastOrderDate).toBeNull();
    });

    it('should return correct last order date', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'Test Vendor'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([
        {
          id: 1,
          name: 'Item 1',
          isActive: true,
          lastPurchaseDate: '2025-01-01T00:00:00.000Z',
          purchaseCount: 1
        },
        {
          id: 2,
          name: 'Item 2',
          isActive: true,
          lastPurchaseDate: '2025-01-15T00:00:00.000Z',
          purchaseCount: 2
        },
        {
          id: 3,
          name: 'Item 3',
          isActive: true,
          lastPurchaseDate: '2025-01-10T00:00:00.000Z',
          purchaseCount: 1
        }
      ]);

      const stats = await getVendorStats(1);

      // Should return the most recent date
      expect(stats.lastOrderDate).toBe('2025-01-15T00:00:00.000Z');
    });

    it('should return null for non-existent vendor', async () => {
      vendorDB.getById.mockResolvedValue(null);

      const stats = await getVendorStats(99999);

      expect(stats).toBeNull();
      expect(inventoryItemDB.getByVendor).not.toHaveBeenCalled();
    });

    it('should track categories correctly', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'Test Vendor'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([
        { id: 1, name: 'Item 1', isActive: true, category: 'Produce' },
        { id: 2, name: 'Item 2', isActive: true, category: 'Dairy' },
        { id: 3, name: 'Item 3', isActive: true, category: 'Produce' }
      ]);

      const stats = await getVendorStats(1);

      expect(stats.categories).toContain('Produce');
      expect(stats.categories).toContain('Dairy');
      expect(stats.categoryCount).toBe(2);
    });
  });

  // ============================================
  // Get Vendor With Items Tests
  // ============================================

  describe('getVendorWithItems', () => {
    it('should return vendor with items array', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'Test Vendor'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]);

      const result = await getVendorWithItems(1);

      expect(result.name).toBe('Test Vendor');
      expect(result.items).toHaveLength(2);
      expect(result.itemCount).toBe(2);
    });

    it('should return null for non-existent vendor', async () => {
      vendorDB.getById.mockResolvedValue(null);

      const result = await getVendorWithItems(99999);

      expect(result).toBeNull();
    });

    it('should return empty items array if vendor has no items', async () => {
      vendorDB.getById.mockResolvedValue({
        id: 1,
        name: 'Empty Vendor'
      });

      inventoryItemDB.getByVendor.mockResolvedValue([]);

      const result = await getVendorWithItems(1);

      expect(result.items).toHaveLength(0);
      expect(result.itemCount).toBe(0);
    });
  });

  // ============================================
  // Get All Vendors Tests
  // ============================================

  describe('getAllVendors', () => {
    it('should return all vendors sorted by name', async () => {
      const vendors = [
        { id: 2, name: 'Zeta Foods' },
        { id: 1, name: 'Alpha Supplies' },
        { id: 3, name: 'Beta Inc' }
      ];
      // Defensive code uses getExternal for external vendors (default behavior)
      vendorDB.getExternal.mockResolvedValue(vendors);

      const results = await getAllVendors();

      expect(results[0].name).toBe('Alpha Supplies');
      expect(results[1].name).toBe('Beta Inc');
      expect(results[2].name).toBe('Zeta Foods');
    });

    it('should filter by active status', async () => {
      const activeVendors = [
        { id: 1, name: 'Active Vendor', isActive: true }
      ];
      // Defensive code tries getActiveExternal first (external vendors only)
      vendorDB.getActiveExternal.mockResolvedValue(activeVendors);

      const results = await getAllVendors({ isActive: true });

      // Defensive code uses getActiveExternal for external-only active vendors
      expect(vendorDB.getActiveExternal).toHaveBeenCalled();
      expect(results).toEqual(activeVendors);
    });

    it('should filter by city', async () => {
      const vendors = [
        { id: 1, name: 'Vendor 1', city: 'Montreal' },
        { id: 2, name: 'Vendor 2', city: 'Toronto' },
        { id: 3, name: 'Vendor 3', city: 'Montreal' }
      ];
      // Defensive code uses getExternal for external vendors only (default behavior)
      vendorDB.getExternal.mockResolvedValue(vendors);

      const results = await getAllVendors({ city: 'Montreal' });

      expect(results).toHaveLength(2);
      expect(results.every(v => v.city === 'Montreal')).toBe(true);
    });
  });

  // ============================================
  // Get Vendor Tests
  // ============================================

  describe('getVendor', () => {
    it('should return vendor by id', async () => {
      const vendor = { id: 1, name: 'Test Vendor' };
      vendorDB.getById.mockResolvedValue(vendor);

      const result = await getVendor(1);

      expect(result).toEqual(vendor);
      expect(vendorDB.getById).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent id', async () => {
      vendorDB.getById.mockResolvedValue(undefined);

      const result = await getVendor(99999);

      expect(result).toBeNull();
    });
  });
});
