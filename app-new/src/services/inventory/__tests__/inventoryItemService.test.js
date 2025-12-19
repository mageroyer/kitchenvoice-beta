/**
 * Inventory Item Service Tests
 *
 * Unit tests for inventoryItemService business logic layer.
 * Tests validation, CRUD operations, search, and stock calculations.
 *
 * Run with: npm test -- --grep inventoryItemService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database modules
vi.mock('../../database/indexedDB', () => ({
  inventoryItemDB: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hardDelete: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    getActive: vi.fn(),
    getByVendor: vi.fn(),
    getByVendorAndName: vi.fn(),
    search: vi.fn(),
    getCategories: vi.fn(),
    addAlias: vi.fn(),
    removeAlias: vi.fn()
  },
  vendorDB: {
    getById: vi.fn()
  },
  stockTransactionDB: {
    create: vi.fn(),
    getItemHistory: vi.fn()
  },
  purchaseOrderLineDB: {
    getPendingByInventoryItem: vi.fn()
  },
  TRANSACTION_TYPE: {
    PURCHASE: 'purchase',
    USAGE: 'usage',
    ADJUSTMENT: 'adjustment',
    WASTE: 'waste',
    TRANSFER: 'transfer',
    COUNT: 'count'
  },
  REFERENCE_TYPE: {
    INVOICE: 'invoice',
    INVOICE_LINE: 'invoice_line',
    RECIPE: 'recipe',
    TASK: 'task',
    PURCHASE_ORDER: 'purchase_order',
    MANUAL: 'manual'
  }
}));

// Import after mocking
import {
  createItem,
  updateItem,
  deleteItem,
  getItem,
  getAllItems,
  searchItems,
  getItemsByVendor,
  getItemsByName,
  getLowStockItems,
  getCriticalStockItems,
  normalizeName,
  validateItemData,
  calculateStockPercent,
  getStockStatus,
  STOCK_THRESHOLDS
} from '../inventoryItemService';

import {
  inventoryItemDB,
  vendorDB,
  stockTransactionDB,
  purchaseOrderLineDB,
  TRANSACTION_TYPE,
  REFERENCE_TYPE
} from '../../database/indexedDB';

describe('InventoryItemService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================
  // Validation Tests
  // ============================================

  describe('normalizeName', () => {
    it('should lowercase and trim', () => {
      expect(normalizeName('  Test Name  ')).toBe('test name');
    });

    it('should remove accents', () => {
      expect(normalizeName('Café')).toBe('cafe');
      expect(normalizeName('crème fraîche')).toBe('creme fraiche');
      expect(normalizeName('jalapeño')).toBe('jalapeno');
    });

    it('should normalize whitespace', () => {
      expect(normalizeName('test   multiple   spaces')).toBe('test multiple spaces');
    });

    it('should handle empty/null input', () => {
      expect(normalizeName('')).toBe('');
      expect(normalizeName(null)).toBe('');
      expect(normalizeName(undefined)).toBe('');
    });
  });

  describe('validateItemData', () => {
    it('should require name on create', () => {
      const result = validateItemData({
        vendorId: 1,
        unit: 'kg'
      }, { isUpdate: false });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item name is required');
    });

    it('should require vendorId on create', () => {
      const result = validateItemData({
        name: 'Test Item',
        unit: 'kg'
      }, { isUpdate: false });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Vendor is required');
    });

    it('should require unit on create', () => {
      const result = validateItemData({
        name: 'Test Item',
        vendorId: 1
      }, { isUpdate: false });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Stock unit is required');
    });

    it('should reject negative stock', () => {
      const result = validateItemData({
        name: 'Test',
        vendorId: 1,
        unit: 'kg',
        currentStock: -5
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Current stock must be a non-negative number');
    });

    it('should reject threshold > 100', () => {
      const result = validateItemData({
        name: 'Test',
        vendorId: 1,
        unit: 'kg',
        criticalThreshold: 150
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Critical threshold must be between 0 and 100');
    });

    it('should reject low stock threshold > 100', () => {
      const result = validateItemData({
        name: 'Test',
        vendorId: 1,
        unit: 'kg',
        lowStockThreshold: 101
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Low stock threshold must be between 0 and 100');
    });

    it('should accept valid data with all fields', () => {
      const result = validateItemData({
        name: 'Complete Item',
        vendorId: 1,
        unit: 'kg',
        currentStock: 10,
        parLevel: 50,
        reorderPoint: 10,
        criticalThreshold: 10,
        lowStockThreshold: 25,
        currentPrice: 9.99,
        packageSize: 5,
        unitsPerPackage: 1,
        shelfLifeDays: 7
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should not require fields on update', () => {
      const result = validateItemData({
        currentStock: 20
      }, { isUpdate: true });

      expect(result.valid).toBe(true);
    });
  });

  describe('calculateStockPercent', () => {
    it('should calculate percentage correctly', () => {
      expect(calculateStockPercent(25, 100)).toBe(25);
      expect(calculateStockPercent(50, 100)).toBe(50);
      expect(calculateStockPercent(100, 100)).toBe(100);
    });

    it('should handle zero par level', () => {
      expect(calculateStockPercent(10, 0)).toBe(100);
      expect(calculateStockPercent(0, 0)).toBe(0);
    });

    it('should handle over 100%', () => {
      expect(calculateStockPercent(150, 100)).toBe(150);
    });
  });

  describe('getStockStatus', () => {
    it('should return critical for low percentage', () => {
      expect(getStockStatus(5)).toBe('critical');
      expect(getStockStatus(10)).toBe('critical');
    });

    it('should return low for medium-low percentage', () => {
      expect(getStockStatus(15)).toBe('low');
      expect(getStockStatus(25)).toBe('low');
    });

    it('should return warning for medium percentage', () => {
      expect(getStockStatus(30)).toBe('warning');
      expect(getStockStatus(50)).toBe('warning');
    });

    it('should return optimal for high percentage', () => {
      expect(getStockStatus(75)).toBe('optimal');
      expect(getStockStatus(100)).toBe('optimal');
    });

    it('should respect custom thresholds', () => {
      const customThresholds = {
        CRITICAL: 20,
        LOW: 40,
        WARNING: 60,
        OPTIMAL: 100
      };

      expect(getStockStatus(15, customThresholds)).toBe('critical');
      expect(getStockStatus(30, customThresholds)).toBe('low');
      expect(getStockStatus(50, customThresholds)).toBe('warning');
      expect(getStockStatus(80, customThresholds)).toBe('optimal');
    });
  });

  // ============================================
  // Create Item Tests
  // ============================================

  describe('createItem', () => {
    it('should create item with required fields', async () => {
      const mockVendor = { id: 1, name: 'Sysco Canada' };
      const mockItem = {
        id: 1,
        name: 'Flour',
        vendorId: 1,
        vendorName: 'Sysco Canada',
        unit: 'kg',
        currentStock: 0,
        parLevel: 0,
        isActive: true,
        nameNormalized: 'flour'
      };

      vendorDB.getById.mockResolvedValue(mockVendor);
      inventoryItemDB.create.mockResolvedValue(1);
      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const result = await createItem({
        name: 'Flour',
        vendorId: 1,
        unit: 'kg'
      });

      expect(result.id).toBe(1);
      expect(result.name).toBe('Flour');
      expect(inventoryItemDB.create).toHaveBeenCalledTimes(1);
      expect(inventoryItemDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Flour',
          vendorId: 1,
          unit: 'kg',
          nameNormalized: 'flour'
        })
      );
    });

    it('should throw validation error when name is missing', async () => {
      await expect(createItem({
        vendorId: 1,
        unit: 'kg'
      })).rejects.toThrow('Item name is required');

      expect(inventoryItemDB.create).not.toHaveBeenCalled();
    });

    it('should throw validation error when vendorId is missing', async () => {
      await expect(createItem({
        name: 'Test Item',
        unit: 'kg'
      })).rejects.toThrow('Vendor is required');

      expect(inventoryItemDB.create).not.toHaveBeenCalled();
    });

    it('should throw validation error for negative stock', async () => {
      await expect(createItem({
        name: 'Test Item',
        vendorId: 1,
        unit: 'kg',
        currentStock: -10
      })).rejects.toThrow('Current stock must be a non-negative number');
    });

    it('should throw validation error for threshold > 100', async () => {
      await expect(createItem({
        name: 'Test Item',
        vendorId: 1,
        unit: 'kg',
        criticalThreshold: 150
      })).rejects.toThrow('Critical threshold must be between 0 and 100');
    });

    it('should throw duplicate error for same name + vendor', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Sysco' });
      inventoryItemDB.create.mockRejectedValue(new Error('Item already exists for this vendor'));

      await expect(createItem({
        name: 'Flour',
        vendorId: 1,
        unit: 'kg'
      })).rejects.toThrow('already exists for this vendor');
    });

    it('should allow same name with different vendor', async () => {
      const mockVendor1 = { id: 1, name: 'Sysco' };
      const mockVendor2 = { id: 2, name: 'Gordon Food' };

      vendorDB.getById
        .mockResolvedValueOnce(mockVendor1)
        .mockResolvedValueOnce(mockVendor2);

      inventoryItemDB.create
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      inventoryItemDB.getById
        .mockResolvedValueOnce({ id: 1, name: 'Flour', vendorId: 1, vendorName: 'Sysco' })
        .mockResolvedValueOnce({ id: 2, name: 'Flour', vendorId: 2, vendorName: 'Gordon Food' });

      const result1 = await createItem({
        name: 'Flour',
        vendorId: 1,
        unit: 'kg'
      });

      const result2 = await createItem({
        name: 'Flour',
        vendorId: 2,
        unit: 'kg'
      });

      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(inventoryItemDB.create).toHaveBeenCalledTimes(2);
    });

    it('should generate nameNormalized correctly', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Vendor' });
      inventoryItemDB.create.mockResolvedValue(1);
      inventoryItemDB.getById.mockResolvedValue({
        id: 1,
        name: 'Crème Fraîche',
        nameNormalized: 'creme fraiche'
      });

      await createItem({
        name: 'Crème Fraîche',
        vendorId: 1,
        unit: 'L'
      });

      expect(inventoryItemDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nameNormalized: 'creme fraiche'
        })
      );
    });

    it('should create initial transaction when stock > 0', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Vendor' });
      inventoryItemDB.create.mockResolvedValue(1);
      inventoryItemDB.getById.mockResolvedValue({
        id: 1,
        name: 'Flour',
        currentStock: 50,
        unit: 'kg'
      });

      await createItem({
        name: 'Flour',
        vendorId: 1,
        unit: 'kg',
        currentStock: 50,
        createdBy: 'user123'
      });

      expect(stockTransactionDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          inventoryItemId: 1,
          transactionType: TRANSACTION_TYPE.ADJUSTMENT,
          quantityChange: 50,
          stockBefore: 0,
          stockAfter: 50,
          reason: 'Initial stock entry',
          createdBy: 'user123'
        })
      );
    });

    it('should not create transaction when stock is 0', async () => {
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Vendor' });
      inventoryItemDB.create.mockResolvedValue(1);
      inventoryItemDB.getById.mockResolvedValue({
        id: 1,
        name: 'New Item',
        currentStock: 0
      });

      await createItem({
        name: 'New Item',
        vendorId: 1,
        unit: 'ea'
      });

      expect(stockTransactionDB.create).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Update Item Tests
  // ============================================

  describe('updateItem', () => {
    it('should update name successfully', async () => {
      const existingItem = {
        id: 1,
        name: 'Old Name',
        vendorId: 1,
        unit: 'kg',
        currentStock: 10
      };

      const updatedItem = {
        ...existingItem,
        name: 'New Name',
        nameNormalized: 'new name'
      };

      inventoryItemDB.getById
        .mockResolvedValueOnce(existingItem)
        .mockResolvedValueOnce(updatedItem);
      inventoryItemDB.update.mockResolvedValue(true);

      const result = await updateItem(1, { name: 'New Name' });

      expect(result.name).toBe('New Name');
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'New Name',
        nameNormalized: 'new name'
      }));
    });

    it('should create transaction when stock changes', async () => {
      const existingItem = {
        id: 1,
        name: 'Item',
        vendorId: 1,
        unit: 'kg',
        currentStock: 10
      };

      const updatedItem = {
        ...existingItem,
        currentStock: 25
      };

      inventoryItemDB.getById
        .mockResolvedValueOnce(existingItem)
        .mockResolvedValueOnce(updatedItem);
      inventoryItemDB.update.mockResolvedValue(true);

      await updateItem(1, { currentStock: 25 }, {
        stockChangeReason: 'Inventory count',
        updatedBy: 'user123'
      });

      expect(stockTransactionDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          inventoryItemId: 1,
          transactionType: TRANSACTION_TYPE.ADJUSTMENT,
          quantityChange: 15,
          stockBefore: 10,
          stockAfter: 25,
          reason: 'Inventory count',
          createdBy: 'user123'
        })
      );
    });

    it('should update threshold successfully', async () => {
      const existingItem = {
        id: 1,
        name: 'Item',
        vendorId: 1,
        unit: 'kg',
        criticalThreshold: 10,
        lowStockThreshold: 25
      };

      inventoryItemDB.getById
        .mockResolvedValueOnce(existingItem)
        .mockResolvedValueOnce({
          ...existingItem,
          criticalThreshold: 15,
          lowStockThreshold: 30
        });
      inventoryItemDB.update.mockResolvedValue(true);

      const result = await updateItem(1, {
        criticalThreshold: 15,
        lowStockThreshold: 30
      });

      expect(result.criticalThreshold).toBe(15);
      expect(result.lowStockThreshold).toBe(30);
    });

    it('should throw error when item not found', async () => {
      inventoryItemDB.getById.mockResolvedValue(null);

      await expect(updateItem(99999, { name: 'New' }))
        .rejects.toThrow('Inventory item not found');
    });

    it('should not create transaction when trackStockChange is false', async () => {
      const existingItem = {
        id: 1,
        name: 'Item',
        unit: 'kg',
        currentStock: 10
      };

      inventoryItemDB.getById
        .mockResolvedValueOnce(existingItem)
        .mockResolvedValueOnce({ ...existingItem, currentStock: 25 });
      inventoryItemDB.update.mockResolvedValue(true);

      await updateItem(1, { currentStock: 25 }, { trackStockChange: false });

      expect(stockTransactionDB.create).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Search Items Tests
  // ============================================

  describe('searchItems', () => {
    it('should return all vendor variants for a name', async () => {
      const mockItems = [
        { id: 1, name: 'Flour', vendorId: 1, vendorName: 'Sysco' },
        { id: 2, name: 'Flour', vendorId: 2, vendorName: 'Gordon Food' }
      ];

      inventoryItemDB.search.mockResolvedValue(mockItems);
      vendorDB.getById.mockResolvedValue(null); // vendorName already on items

      const results = await searchItems('Flour');

      expect(results.length).toBe(2);
      expect(results.some(r => r.vendorName === 'Sysco')).toBe(true);
      expect(results.some(r => r.vendorName === 'Gordon Food')).toBe(true);
    });

    it('should match accented characters via normalization', async () => {
      const mockItems = [
        { id: 1, name: 'Crème Fraîche', nameNormalized: 'creme fraiche', vendorId: 1 }
      ];

      inventoryItemDB.search.mockResolvedValue(mockItems);

      const results = await searchItems('creme fraiche');

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Crème Fraîche');
    });

    it('should include vendor info in results', async () => {
      const mockItems = [
        { id: 1, name: 'Flour', vendorId: 1 }
      ];

      inventoryItemDB.search.mockResolvedValue(mockItems);
      vendorDB.getById.mockResolvedValue({ id: 1, name: 'Sysco Canada' });

      const results = await searchItems('Flour');

      expect(results[0].vendorName).toBe('Sysco Canada');
    });

    it('should return empty array for empty query', async () => {
      const results = await searchItems('');

      expect(results).toHaveLength(0);
      expect(inventoryItemDB.search).not.toHaveBeenCalled();
    });

    it('should return empty array for no matches', async () => {
      inventoryItemDB.search.mockResolvedValue([]);

      const results = await searchItems('NonExistentItem12345');

      expect(results).toHaveLength(0);
    });

    it('should sort by relevance with exact match first', async () => {
      const mockItems = [
        { id: 1, name: 'All Purpose Flour', vendorId: 1 },
        { id: 2, name: 'Flour', vendorId: 2 },
        { id: 3, name: 'Flour Mix', vendorId: 3 }
      ];

      inventoryItemDB.search.mockResolvedValue(mockItems);

      const results = await searchItems('Flour');

      // Exact match "Flour" should come first
      expect(results[0].name).toBe('Flour');
    });
  });

  // ============================================
  // Get Low Stock Tests
  // ============================================

  describe('getLowStockItems', () => {
    it('should return items below threshold', async () => {
      const mockItems = [
        { id: 1, name: 'Item 1', currentStock: 5, parLevel: 100, isActive: true },
        { id: 2, name: 'Item 2', currentStock: 50, parLevel: 100, isActive: true },
        { id: 3, name: 'Item 3', currentStock: 10, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getLowStockItems(25);

      // Items 1 (5%) and 3 (10%) are below 25% threshold
      expect(results.length).toBe(2);
      expect(results.every(r => r.stockPercent < 25)).toBe(true);
    });

    it('should return items at threshold', async () => {
      const mockItems = [
        { id: 1, name: 'Item 1', currentStock: 25, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getLowStockItems(26); // threshold just above 25%

      expect(results.length).toBe(1);
    });

    it('should not return items above threshold', async () => {
      const mockItems = [
        { id: 1, name: 'Item 1', currentStock: 80, parLevel: 100, isActive: true },
        { id: 2, name: 'Item 2', currentStock: 90, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getLowStockItems(25);

      expect(results.length).toBe(0);
    });

    it('should use item-specific threshold overrides', async () => {
      const mockItems = [
        {
          id: 1,
          name: 'Item 1',
          currentStock: 15,
          parLevel: 100,
          criticalThreshold: 20, // Custom threshold
          lowStockThreshold: 30,
          isActive: true
        }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      // Get critical items - should use item's custom threshold
      const results = await getCriticalStockItems();

      // Item 1 at 15% is below its custom criticalThreshold of 20%
      expect(results.length).toBe(1);
    });

    it('should sort by urgency with critical first', async () => {
      const mockItems = [
        { id: 1, name: 'Low Item', currentStock: 20, parLevel: 100, isActive: true },
        { id: 2, name: 'Critical Item', currentStock: 5, parLevel: 100, isActive: true },
        { id: 3, name: 'Medium Item', currentStock: 15, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getLowStockItems(25);

      // Should be sorted by stockPercent ascending (most urgent first)
      expect(results[0].name).toBe('Critical Item'); // 5%
      expect(results[1].name).toBe('Medium Item');   // 15%
      expect(results[2].name).toBe('Low Item');      // 20%
    });

    it('should use default threshold constant', async () => {
      const mockItems = [
        { id: 1, name: 'Item', currentStock: 20, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getLowStockItems(); // Uses default STOCK_THRESHOLDS.LOW (25)

      expect(results.length).toBe(1);
      expect(STOCK_THRESHOLDS.LOW).toBe(25);
    });
  });

  // ============================================
  // Get Critical Stock Tests
  // ============================================

  describe('getCriticalStockItems', () => {
    it('should return only critical items', async () => {
      const mockItems = [
        { id: 1, name: 'Critical', currentStock: 5, parLevel: 100, isActive: true },
        { id: 2, name: 'Low', currentStock: 20, parLevel: 100, isActive: true },
        { id: 3, name: 'OK', currentStock: 50, parLevel: 100, isActive: true }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getCriticalStockItems();

      // Only items at or below default critical threshold (10%)
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Critical');
    });

    it('should respect custom critical threshold', async () => {
      const mockItems = [
        {
          id: 1,
          name: 'Item with custom threshold',
          currentStock: 18,
          parLevel: 100,
          criticalThreshold: 20, // Custom: 20% is critical
          isActive: true
        }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const results = await getCriticalStockItems();

      // 18% is below custom threshold of 20%
      expect(results.length).toBe(1);
    });
  });

  // ============================================
  // Get Items By Vendor Tests
  // ============================================

  describe('getItemsByVendor', () => {
    it('should return all items for a vendor', async () => {
      const mockItems = [
        { id: 1, name: 'Flour', vendorId: 1 },
        { id: 2, name: 'Sugar', vendorId: 1 }
      ];

      inventoryItemDB.getByVendor.mockResolvedValue(mockItems);

      const results = await getItemsByVendor(1);

      expect(results.length).toBe(2);
      expect(inventoryItemDB.getByVendor).toHaveBeenCalledWith(1);
    });

    it('should filter active only when requested', async () => {
      const mockItems = [
        { id: 1, name: 'Active', vendorId: 1, isActive: true },
        { id: 2, name: 'Inactive', vendorId: 1, isActive: false }
      ];

      inventoryItemDB.getByVendor.mockResolvedValue(mockItems);

      const results = await getItemsByVendor(1, { activeOnly: true });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Active');
    });
  });

  // ============================================
  // Get Items By Name Tests
  // ============================================

  describe('getItemsByName', () => {
    it('should return items with same name from different vendors', async () => {
      const mockItems = [
        { id: 1, name: 'Flour', nameNormalized: 'flour', vendorId: 1, vendorName: 'Sysco' },
        { id: 2, name: 'Flour', nameNormalized: 'flour', vendorId: 2, vendorName: 'Gordon' },
        { id: 3, name: 'Sugar', nameNormalized: 'sugar', vendorId: 1, vendorName: 'Sysco' }
      ];

      inventoryItemDB.getAll.mockResolvedValue(mockItems);

      const results = await getItemsByName('Flour');

      expect(results.length).toBe(2);
      expect(results.every(r => r.name === 'Flour')).toBe(true);
    });

    it('should match normalized names', async () => {
      const mockItems = [
        { id: 1, name: 'Crème Fraîche', nameNormalized: 'creme fraiche', vendorId: 1 }
      ];

      inventoryItemDB.getAll.mockResolvedValue(mockItems);

      const results = await getItemsByName('creme fraiche');

      expect(results.length).toBe(1);
    });

    it('should return empty for no matches', async () => {
      inventoryItemDB.getAll.mockResolvedValue([]);

      const results = await getItemsByName('NonExistent');

      expect(results).toHaveLength(0);
    });
  });

  // ============================================
  // Delete Item Tests
  // ============================================

  describe('deleteItem', () => {
    it('should delete item with no pending orders', async () => {
      inventoryItemDB.getById.mockResolvedValue({ id: 1, name: 'Item' });
      purchaseOrderLineDB.getPendingByInventoryItem.mockResolvedValue([]);
      inventoryItemDB.delete.mockResolvedValue(true);

      const result = await deleteItem(1);

      expect(result).toBe(true);
      expect(inventoryItemDB.delete).toHaveBeenCalledWith(1);
    });

    it('should throw error when item has pending orders', async () => {
      inventoryItemDB.getById.mockResolvedValue({ id: 1, name: 'Item' });
      purchaseOrderLineDB.getPendingByInventoryItem.mockResolvedValue([
        { id: 1, purchaseOrderId: 100 },
        { id: 2, purchaseOrderId: 101 }
      ]);

      await expect(deleteItem(1)).rejects.toThrow(
        '2 pending purchase orders include this item'
      );

      expect(inventoryItemDB.delete).not.toHaveBeenCalled();
    });

    it('should allow force delete with pending orders', async () => {
      inventoryItemDB.getById.mockResolvedValue({ id: 1, name: 'Item' });
      purchaseOrderLineDB.getPendingByInventoryItem.mockResolvedValue([
        { id: 1, purchaseOrderId: 100 }
      ]);
      inventoryItemDB.delete.mockResolvedValue(true);

      const result = await deleteItem(1, { force: true });

      expect(result).toBe(true);
      expect(inventoryItemDB.delete).toHaveBeenCalledWith(1);
    });

    it('should throw error when item not found', async () => {
      inventoryItemDB.getById.mockResolvedValue(null);

      await expect(deleteItem(99999)).rejects.toThrow('Inventory item not found');
    });
  });
});
