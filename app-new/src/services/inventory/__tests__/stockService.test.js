/**
 * Stock Service Tests
 *
 * Unit tests for stockService business logic layer.
 * Tests stock adjustments, calculations, and threshold alerts.
 *
 * Run with: npm test -- --grep stockService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create hoisted mocks that can be referenced in vi.mock factory
const { mockInventoryItemDB, mockStockTransactionDB, mockDb } = vi.hoisted(() => ({
  mockInventoryItemDB: {
    getById: vi.fn(),
    getActive: vi.fn(),
    update: vi.fn()
  },
  mockStockTransactionDB: {
    create: vi.fn(),
    recordPurchase: vi.fn(),
    recordTaskUsage: vi.fn(),
    recordCountCorrection: vi.fn(),
    recordWaste: vi.fn(),
    recordTransfer: vi.fn()
  },
  mockDb: {
    transaction: vi.fn(async (mode, tables, callback) => {
      await callback();
    }),
    inventoryItems: {},
    stockTransactions: {}
  }
}));

// Mock the database modules
vi.mock('../../database/indexedDB', () => ({
  inventoryItemDB: mockInventoryItemDB,
  stockTransactionDB: mockStockTransactionDB,
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
  },
  default: mockDb
}));

// Import after mocking
import {
  adjustStock,
  setStock,
  addStockFromInvoice,
  deductStockFromTask,
  bulkAdjustStock,
  getStockPercentage,
  getStockStatus,
  getStockAlerts,
  DEFAULT_THRESHOLDS,
  STOCK_STATUS
} from '../stockService';

import {
  inventoryItemDB,
  stockTransactionDB,
  TRANSACTION_TYPE,
  REFERENCE_TYPE
} from '../../database/indexedDB';

describe('StockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================
  // Adjust Stock Tests
  // ============================================

  describe('adjustStock', () => {
    it('should add positive amount and increase stock', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const result = await adjustStock(1, 5, 'Received shipment');

      expect(result.newStock).toBe(15);
      expect(result.previousStock).toBe(10);
      expect(result.delta).toBe(5);
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockQuantity: 15
      }));
    });

    it('should subtract amount and decrease stock', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 20,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const result = await adjustStock(1, -8, 'Used in production');

      expect(result.newStock).toBe(12);
      expect(result.previousStock).toBe(20);
      expect(result.delta).toBe(-8);
    });

    it('should allow subtract to zero', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const result = await adjustStock(1, -10, 'Used all stock');

      expect(result.newStock).toBe(0);
    });

    it('should throw error when subtract below zero', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 5,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      await expect(adjustStock(1, -10, 'Too much'))
        .rejects.toThrow('Insufficient stock');
    });

    it('should create transaction record', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        parQuantity: 100,
        stockQuantityUnit: 'kg',
        currentPrice: 5.00
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      await adjustStock(1, 5, 'Test adjustment', REFERENCE_TYPE.MANUAL, null, {
        createdBy: 'user123',
        notes: 'Test notes'
      });

      expect(stockTransactionDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          inventoryItemId: 1,
          transactionType: TRANSACTION_TYPE.ADJUSTMENT,
          quantityChange: 5,
          stockBefore: 10,
          stockAfter: 15,
          unit: 'kg',
          reason: 'Test adjustment',
          referenceType: REFERENCE_TYPE.MANUAL,
          createdBy: 'user123',
          notes: 'Test notes'
        })
      );
    });

    it('should return alert when stock becomes low', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 30,
        parQuantity: 100,
        criticalThreshold: 10,
        lowStockThreshold: 25,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const result = await adjustStock(1, -15, 'Used in production');

      // 15% is below low threshold (25%)
      expect(result.newStock).toBe(15);
      expect(result.alert).toBe(true);
      expect(result.status).toBe(STOCK_STATUS.LOW);
      expect(result.alertMessage).toContain('Flour');
      expect(result.alertMessage).toContain('low');
    });

    it('should throw error when reason is missing', async () => {
      await expect(adjustStock(1, 5, ''))
        .rejects.toThrow('Reason is required');
    });

    it('should throw error when item not found', async () => {
      inventoryItemDB.getById.mockResolvedValue(null);

      await expect(adjustStock(99999, 5, 'Test'))
        .rejects.toThrow('Inventory item not found');
    });
  });

  // ============================================
  // Set Stock Tests
  // ============================================

  describe('setStock', () => {
    it('should set higher value and update stock', async () => {
      const mockItem = {
        id: 1,
        name: 'Sugar',
        stockQuantity: 10,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordCountCorrection.mockResolvedValue(1);

      const result = await setStock(1, 50, 'Physical count');

      expect(result.newStock).toBe(50);
      expect(result.previousStock).toBe(10);
      expect(result.delta).toBe(40);
    });

    it('should set lower value and update stock', async () => {
      const mockItem = {
        id: 1,
        name: 'Sugar',
        stockQuantity: 100,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordCountCorrection.mockResolvedValue(1);

      const result = await setStock(1, 30, 'Inventory audit');

      expect(result.newStock).toBe(30);
      expect(result.delta).toBe(-70);
    });

    it('should allow setting to zero', async () => {
      const mockItem = {
        id: 1,
        name: 'Sugar',
        stockQuantity: 50,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordCountCorrection.mockResolvedValue(1);

      const result = await setStock(1, 0, 'Stock depleted');

      expect(result.newStock).toBe(0);
    });

    it('should throw error for negative value', async () => {
      await expect(setStock(1, -10, 'Invalid'))
        .rejects.toThrow('Stock value cannot be negative');
    });

    it('should create correction transaction with correct type', async () => {
      const mockItem = {
        id: 1,
        name: 'Sugar',
        stockQuantity: 10,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordCountCorrection.mockResolvedValue(1);

      await setStock(1, 25, 'Physical count', {
        countSessionId: 'session123',
        createdBy: 'user123'
      });

      expect(stockTransactionDB.recordCountCorrection).toHaveBeenCalledWith(
        1,
        25,
        10,
        expect.objectContaining({
          countSessionId: 'session123',
          createdBy: 'user123'
        })
      );
    });

    it('should skip transaction when no change', async () => {
      const mockItem = {
        id: 1,
        name: 'Sugar',
        stockQuantity: 50,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const result = await setStock(1, 50, 'Count matches');

      expect(result.noChange).toBe(true);
      expect(result.delta).toBe(0);
      expect(stockTransactionDB.recordCountCorrection).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Add From Invoice Tests
  // ============================================

  describe('addStockFromInvoice', () => {
    it('should add to current stock correctly', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 20,
        stockQuantity: 20, // Dual-tracking: unit count
        fullStock: 100,
        parQuantity: 100,
        unit: 'kg',
        currentPrice: 5.00,
        purchaseCount: 3,
        totalQuantityPurchased: 200,
        totalSpent: 1000
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordPurchase.mockResolvedValue(1);

      const result = await addStockFromInvoice(1, 30, 'INV-001', {
        unitCost: 4.50
      });

      expect(result.newStock).toBe(50); // 20 + 30
      expect(result.previousStock).toBe(20);
      expect(result.quantity).toBe(30);
    });

    it('should update stockQuantity correctly', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 20,
        parQuantity: 100,
        stockQuantityUnit: 'case'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordPurchase.mockResolvedValue(1);

      const result = await addStockFromInvoice(1, 30, 'INV-001');

      // 20 + 30 = 50
      expect(result.newStockQuantity).toBe(50);
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockQuantity: 50
      }));
    });

    it('should create purchase transaction', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        stockQuantityUnit: 'case',
        currentPrice: 5.00
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordPurchase.mockResolvedValue(1);

      await addStockFromInvoice(1, 25, 'INV-123', {
        invoiceLineId: 456,
        unitCost: 4.00,
        createdBy: 'user123'
      });

      expect(stockTransactionDB.recordPurchase).toHaveBeenCalledWith(
        1,
        25,
        expect.objectContaining({
          invoiceId: 'INV-123',
          invoiceLineId: 456,
          unitCost: 4.00,
          currentStock: 10,
          createdBy: 'user123'
        })
      );
    });

    it('should update all lastPurchase fields', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        unit: 'kg',
        currentPrice: 5.00
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordPurchase.mockResolvedValue(1);

      await addStockFromInvoice(1, 20, 'INV-999', {
        unitCost: 6.00
      });

      // Note: purchaseCount, totalQuantityPurchased, totalSpent are now computed on-demand
      // from invoiceLineItems, not stored on the inventory item
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        lastInvoiceId: 'INV-999',
        lastPurchaseDate: expect.any(String),
        currentPrice: 6.00
      }));
    });

    it('should throw error for zero or negative quantity', async () => {
      await expect(addStockFromInvoice(1, 0, 'INV-001'))
        .rejects.toThrow('Quantity must be a positive number');

      await expect(addStockFromInvoice(1, -5, 'INV-001'))
        .rejects.toThrow('Quantity must be a positive number');
    });

    it('should throw error when invoice ID is missing', async () => {
      await expect(addStockFromInvoice(1, 10, null))
        .rejects.toThrow('Invoice ID is required');
    });
  });

  // ============================================
  // Deduct From Task Tests
  // ============================================

  describe('deductStockFromTask', () => {
    it('should deduct from stock correctly', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 50,
        parQuantity: 100,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);

      const result = await deductStockFromTask(1, 15, 'TASK-001');

      expect(result.newStock).toBe(35);
      expect(result.previousStock).toBe(50);
      expect(result.quantityUsed).toBe(15);
    });

    it('should throw error for insufficient stock', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 10,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      await expect(deductStockFromTask(1, 20, 'TASK-001'))
        .rejects.toThrow('Insufficient stock');
    });

    it('should create task usage transaction', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 50,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);

      await deductStockFromTask(1, 10, 'TASK-123', {
        recipeId: 456,
        recipeName: 'Bread',
        createdBy: 'user123'
      });

      expect(stockTransactionDB.recordTaskUsage).toHaveBeenCalledWith(
        1,
        10,
        expect.objectContaining({
          taskId: 'TASK-123',
          recipeId: 456,
          recipeName: 'Bread',
          currentStock: 50,
          createdBy: 'user123'
        })
      );
    });

    it('should return alert when stock becomes low', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 30,
        parQuantity: 100,
        criticalThreshold: 10,
        lowStockThreshold: 25,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);

      const result = await deductStockFromTask(1, 20, 'TASK-001');

      // 10% is at critical threshold
      expect(result.newStock).toBe(10);
      expect(result.alert).toBe(true);
      expect(result.status).toBe(STOCK_STATUS.CRITICAL);
      expect(result.alertMessage).toContain('Flour');
    });

    it('should update usage statistics', async () => {
      const mockItem = {
        id: 1,
        name: 'Flour',
        stockQuantity: 50,
        unit: 'kg'
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.recordTaskUsage.mockResolvedValue(1);

      await deductStockFromTask(1, 15, 'TASK-001');

      // Note: usageCount and totalQuantityUsed are now computed on-demand
      // from stockTransactions, not stored on the inventory item
      expect(inventoryItemDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
        stockQuantity: 35,
        lastUsageDate: expect.any(String)
      }));
    });
  });

  // ============================================
  // Bulk Adjust Stock Tests
  // ============================================

  describe('bulkAdjustStock', () => {
    it('should succeed when all adjustments are valid', async () => {
      const mockItem1 = { id: 1, name: 'Flour', stockQuantity: 50, parQuantity: 100, unit: 'kg' };
      const mockItem2 = { id: 2, name: 'Sugar', stockQuantity: 30, parQuantity: 100, unit: 'kg' };

      inventoryItemDB.getById
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2)
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const adjustments = [
        { itemId: 1, delta: 10, reason: 'Add flour' },
        { itemId: 2, delta: -5, reason: 'Use sugar' }
      ];

      const result = await bulkAdjustStock(adjustments, { createdBy: 'user123' });

      expect(result.success.length).toBe(2);
      expect(result.failed.length).toBe(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should rollback all when one fails (default behavior)', async () => {
      const mockItem1 = { id: 1, name: 'Flour', stockQuantity: 50, parQuantity: 100, unit: 'kg' };
      const mockItem2 = { id: 2, name: 'Sugar', stockQuantity: 5, parQuantity: 100, unit: 'kg' };

      inventoryItemDB.getById
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2);

      const adjustments = [
        { itemId: 1, delta: 10, reason: 'Add flour' },
        { itemId: 2, delta: -20, reason: 'Too much sugar' } // Will fail - insufficient stock
      ];

      const result = await bulkAdjustStock(adjustments);

      expect(result.aborted).toBe(true);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error).toContain('Insufficient stock');
    });

    it('should handle empty array gracefully', async () => {
      await expect(bulkAdjustStock([]))
        .rejects.toThrow('Adjustments array is required');
    });

    it('should validate all adjustments before processing', async () => {
      const mockItem = { id: 1, name: 'Flour', stockQuantity: 50, unit: 'kg' };
      inventoryItemDB.getById
        .mockResolvedValueOnce(null) // Item not found
        .mockResolvedValueOnce(mockItem);

      const adjustments = [
        { itemId: 99, delta: 10, reason: 'Missing item' },
        { itemId: 1, delta: 5, reason: 'Valid' }
      ];

      const result = await bulkAdjustStock(adjustments);

      expect(result.aborted).toBe(true);
      expect(result.failed.some(f => f.error === 'Item not found')).toBe(true);
    });

    it('should collect alerts from all adjustments', async () => {
      const mockItem1 = { id: 1, name: 'Flour', stockQuantity: 20, parQuantity: 100, lowStockThreshold: 25, unit: 'kg' };
      const mockItem2 = { id: 2, name: 'Sugar', stockQuantity: 10, parQuantity: 100, criticalThreshold: 10, unit: 'kg' };

      inventoryItemDB.getById
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2)
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2);
      inventoryItemDB.update.mockResolvedValue(true);
      stockTransactionDB.create.mockResolvedValue(1);

      const adjustments = [
        { itemId: 1, delta: -10, reason: 'Use flour' },
        { itemId: 2, delta: -5, reason: 'Use sugar' }
      ];

      const result = await bulkAdjustStock(adjustments);

      // Both items end up in low/critical status
      expect(result.alerts.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Stock Calculation Tests
  // ============================================

  describe('getStockPercentage', () => {
    it('should calculate percentage correctly', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 25,
        parQuantity: 100
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const percentage = await getStockPercentage(1);

      expect(percentage).toBe(25);
    });

    it('should use fullStock when parQuantity is 0', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 50,
        parQuantity: 0,
        fullStock: 100
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const percentage = await getStockPercentage(1);

      expect(percentage).toBe(50);
    });

    it('should return 100 when stock > 0 but no base level', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 25,
        parQuantity: 0,
        fullStock: 0
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const percentage = await getStockPercentage(1);

      expect(percentage).toBe(100);
    });

    it('should throw error when item not found', async () => {
      inventoryItemDB.getById.mockResolvedValue(null);

      await expect(getStockPercentage(99999))
        .rejects.toThrow('Inventory item not found');
    });
  });

  describe('getStockStatus', () => {
    it('should return critical for low percentage', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 5,
        parQuantity: 100,
        criticalThreshold: 10
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const status = await getStockStatus(1);

      expect(status).toBe(STOCK_STATUS.CRITICAL);
    });

    it('should return low for medium-low percentage', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 15,
        parQuantity: 100,
        criticalThreshold: 10,
        lowStockThreshold: 25
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const status = await getStockStatus(1);

      expect(status).toBe(STOCK_STATUS.LOW);
    });

    it('should return ok for high percentage', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 75,
        parQuantity: 100
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const status = await getStockStatus(1);

      expect(status).toBe(STOCK_STATUS.OK);
    });

    it('should respect item-specific thresholds', async () => {
      const mockItem = {
        id: 1,
        stockQuantity: 20,
        parQuantity: 100,
        criticalThreshold: 25, // Custom: 25% is critical
        lowStockThreshold: 50
      };

      inventoryItemDB.getById.mockResolvedValue(mockItem);

      const status = await getStockStatus(1);

      // 20% is below custom critical threshold of 25%
      expect(status).toBe(STOCK_STATUS.CRITICAL);
    });
  });

  // ============================================
  // Stock Alerts Tests
  // ============================================

  describe('getStockAlerts', () => {
    it('should return all low and critical items', async () => {
      const mockItems = [
        { id: 1, name: 'Critical Item', stockQuantity: 5, parQuantity: 100, criticalThreshold: 10, lowStockThreshold: 25 },
        { id: 2, name: 'Low Item', stockQuantity: 20, parQuantity: 100, criticalThreshold: 10, lowStockThreshold: 25 },
        { id: 3, name: 'OK Item', stockQuantity: 80, parQuantity: 100, criticalThreshold: 10, lowStockThreshold: 25 }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const alerts = await getStockAlerts();

      expect(alerts.length).toBe(2);
      expect(alerts.some(a => a.itemName === 'Critical Item')).toBe(true);
      expect(alerts.some(a => a.itemName === 'Low Item')).toBe(true);
      expect(alerts.some(a => a.itemName === 'OK Item')).toBe(false);
    });

    it('should filter to critical only when requested', async () => {
      const mockItems = [
        { id: 1, name: 'Critical', stockQuantity: 5, parQuantity: 100, criticalThreshold: 10 },
        { id: 2, name: 'Low', stockQuantity: 20, parQuantity: 100, criticalThreshold: 10, lowStockThreshold: 25 }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const alerts = await getStockAlerts({ criticalOnly: true });

      expect(alerts.length).toBe(1);
      expect(alerts[0].itemName).toBe('Critical');
    });

    it('should sort by percentage ascending (most critical first)', async () => {
      const mockItems = [
        { id: 1, name: 'Medium Low', stockQuantity: 20, parQuantity: 100, lowStockThreshold: 25 },
        { id: 2, name: 'Very Critical', stockQuantity: 2, parQuantity: 100, criticalThreshold: 10 },
        { id: 3, name: 'Barely Low', stockQuantity: 24, parQuantity: 100, lowStockThreshold: 25 }
      ];

      inventoryItemDB.getActive.mockResolvedValue(mockItems);

      const alerts = await getStockAlerts();

      expect(alerts[0].itemName).toBe('Very Critical');
      expect(alerts[0].percentage).toBe(2);
    });
  });

  // ============================================
  // Constants Tests
  // ============================================

  describe('Constants', () => {
    it('should export default thresholds', () => {
      expect(DEFAULT_THRESHOLDS.CRITICAL).toBe(10);
      expect(DEFAULT_THRESHOLDS.LOW).toBe(25);
      expect(DEFAULT_THRESHOLDS.WARNING).toBe(50);
    });

    it('should export stock status values', () => {
      expect(STOCK_STATUS.CRITICAL).toBe('critical');
      expect(STOCK_STATUS.LOW).toBe('low');
      expect(STOCK_STATUS.WARNING).toBe('warning');
      expect(STOCK_STATUS.OK).toBe('ok');
    });
  });
});
