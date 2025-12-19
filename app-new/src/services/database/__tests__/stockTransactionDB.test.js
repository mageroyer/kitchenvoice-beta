/**
 * Stock Transaction Database Tests
 *
 * Tests for stockTransactionDB CRUD operations and business logic.
 * Run with: npm test -- --grep stockTransactionDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

// Transaction type enum
const TRANSACTION_TYPE = {
  PURCHASE: 'purchase',
  TASK_USAGE: 'task_usage',
  ADJUSTMENT: 'adjustment',
  WASTE: 'waste',
  TRANSFER: 'transfer',
  COUNT_CORRECTION: 'count_correction',
  RETURN: 'return',
  SAMPLE: 'sample',
  THEFT: 'theft',
  INITIAL: 'initial'
};

// Reference type enum
const REFERENCE_TYPE = {
  INVOICE: 'invoice',
  INVOICE_LINE: 'invoice_line',
  TASK: 'task',
  RECIPE: 'recipe',
  COUNT: 'count',
  TRANSFER: 'transfer',
  MANUAL: 'manual'
};

// Create a test database
let testDb;
let stockTransactionDB;

const createTestDb = () => {
  const db = new Dexie('TestStockTransactionDB');

  db.version(1).stores({
    inventoryItems: '++id, name, vendorId, currentStock',
    stockTransactions: '++id, inventoryItemId, transactionType, [inventoryItemId+createdAt], referenceType, referenceId, createdAt'
  });

  return db;
};

// Create stockTransactionDB implementation for testing
const createStockTransactionDB = (db) => ({
  isValidTransactionType(type) {
    return Object.values(TRANSACTION_TYPE).includes(type);
  },

  isValidReferenceType(type) {
    return Object.values(REFERENCE_TYPE).includes(type);
  },

  async getByInventoryItem(inventoryItemId, { limit = 100, includeVoided = false } = {}) {
    let results = await db.stockTransactions
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .sortBy('createdAt');

    if (!includeVoided) {
      results = results.filter(t => !t.isVoided);
    }

    return results.slice(0, limit);
  },

  async getByType(transactionType, { limit = 100 } = {}) {
    if (!this.isValidTransactionType(transactionType)) {
      throw new Error(`Invalid transaction type: ${transactionType}`);
    }
    return await db.stockTransactions
      .where('transactionType')
      .equals(transactionType)
      .reverse()
      .limit(limit)
      .sortBy('createdAt');
  },

  async getById(id) {
    return await db.stockTransactions.get(id);
  },

  async getByReference(referenceType, referenceId) {
    return await db.stockTransactions
      .where('referenceType')
      .equals(referenceType)
      .filter(t => t.referenceId === referenceId)
      .toArray();
  },

  async getByDateRange(startDate, endDate, { inventoryItemId = null, transactionType = null } = {}) {
    let results = await db.stockTransactions
      .where('createdAt')
      .between(startDate, endDate, true, true)
      .toArray();

    if (inventoryItemId !== null) {
      results = results.filter(t => t.inventoryItemId === inventoryItemId);
    }
    if (transactionType !== null) {
      results = results.filter(t => t.transactionType === transactionType);
    }

    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async create(transaction) {
    // Validation
    if (!transaction.inventoryItemId) {
      throw new Error('Inventory item ID is required');
    }
    if (!transaction.transactionType) {
      throw new Error('Transaction type is required');
    }
    if (!this.isValidTransactionType(transaction.transactionType)) {
      throw new Error(`Invalid transaction type: ${transaction.transactionType}`);
    }
    if (transaction.referenceType && !this.isValidReferenceType(transaction.referenceType)) {
      throw new Error(`Invalid reference type: ${transaction.referenceType}`);
    }

    // Get inventory item
    const inventoryItem = await db.inventoryItems.get(transaction.inventoryItemId);
    if (!inventoryItem) {
      throw new Error(`Inventory item with ID ${transaction.inventoryItemId} not found`);
    }

    const now = new Date().toISOString();
    const data = {
      inventoryItemId: transaction.inventoryItemId,
      inventoryItemName: inventoryItem.name,
      transactionType: transaction.transactionType,
      quantityChange: typeof transaction.quantityChange === 'number' ? transaction.quantityChange : 0,
      unit: transaction.unit?.trim() || inventoryItem.unit || 'ea',
      stockBefore: typeof transaction.stockBefore === 'number' ? transaction.stockBefore : 0,
      stockAfter: typeof transaction.stockAfter === 'number' ? transaction.stockAfter : 0,
      referenceType: transaction.referenceType || REFERENCE_TYPE.MANUAL,
      referenceId: transaction.referenceId || null,
      referenceName: transaction.referenceName?.trim() || '',
      reason: transaction.reason?.trim() || '',
      notes: transaction.notes?.trim() || '',
      unitCost: typeof transaction.unitCost === 'number' ? transaction.unitCost : 0,
      totalCost: typeof transaction.totalCost === 'number' ? transaction.totalCost : 0,
      location: transaction.location?.trim() || '',
      locationFrom: transaction.locationFrom?.trim() || '',
      locationTo: transaction.locationTo?.trim() || '',
      createdAt: now,
      createdBy: transaction.createdBy || null,
      createdByName: transaction.createdByName?.trim() || '',
      isVoided: false,
      voidedAt: null,
      voidedBy: null,
      voidReason: ''
    };

    // Calculate stockAfter if not provided
    if (data.stockAfter === 0 && data.stockBefore !== undefined) {
      data.stockAfter = data.stockBefore + data.quantityChange;
    }

    // Calculate totalCost if not provided
    if (data.totalCost === 0 && data.quantityChange !== 0 && data.unitCost > 0) {
      data.totalCost = Math.round(Math.abs(data.quantityChange) * data.unitCost * 100) / 100;
    }

    const id = await db.stockTransactions.add(data);
    return { id, ...data };
  },

  async recordPurchase(inventoryItemId, quantity, options = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.PURCHASE,
      quantityChange: Math.abs(quantity),
      stockBefore: options.currentStock || 0,
      stockAfter: (options.currentStock || 0) + Math.abs(quantity),
      referenceType: options.invoiceLineId ? REFERENCE_TYPE.INVOICE_LINE : REFERENCE_TYPE.INVOICE,
      referenceId: options.invoiceLineId || options.invoiceId,
      referenceName: options.invoiceId ? `Invoice #${options.invoiceId}` : '',
      unitCost: options.unitCost || 0,
      createdBy: options.createdBy
    });
  },

  async recordTaskUsage(inventoryItemId, quantity, options = {}) {
    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.TASK_USAGE,
      quantityChange: -Math.abs(quantity),
      stockBefore: options.currentStock || 0,
      stockAfter: (options.currentStock || 0) - Math.abs(quantity),
      referenceType: options.taskId ? REFERENCE_TYPE.TASK : REFERENCE_TYPE.RECIPE,
      referenceId: options.taskId || options.recipeId,
      referenceName: options.recipeName || '',
      createdBy: options.createdBy
    });
  },

  async recordAdjustment(inventoryItemId, quantityChange, reason, options = {}) {
    if (!reason?.trim()) {
      throw new Error('Reason is required for adjustments');
    }

    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.ADJUSTMENT,
      quantityChange,
      stockBefore: options.currentStock || 0,
      stockAfter: (options.currentStock || 0) + quantityChange,
      referenceType: REFERENCE_TYPE.MANUAL,
      reason,
      notes: options.notes || '',
      createdBy: options.createdBy
    });
  },

  async recordWaste(inventoryItemId, quantity, reason, options = {}) {
    if (!reason?.trim()) {
      throw new Error('Reason is required for waste records');
    }

    return await this.create({
      inventoryItemId,
      transactionType: TRANSACTION_TYPE.WASTE,
      quantityChange: -Math.abs(quantity),
      stockBefore: options.currentStock || 0,
      stockAfter: (options.currentStock || 0) - Math.abs(quantity),
      referenceType: REFERENCE_TYPE.MANUAL,
      reason,
      notes: options.notes || '',
      createdBy: options.createdBy
    });
  },

  async void(id, reason, voidedBy = null) {
    if (!reason?.trim()) {
      throw new Error('Reason is required to void a transaction');
    }

    const transaction = await this.getById(id);
    if (!transaction) {
      throw new Error(`Transaction with ID ${id} not found`);
    }

    if (transaction.isVoided) {
      throw new Error('Transaction is already voided');
    }

    await db.stockTransactions.update(id, {
      isVoided: true,
      voidedAt: new Date().toISOString(),
      voidedBy,
      voidReason: reason
    });

    return await db.stockTransactions.get(id);
  },

  async count() {
    return await db.stockTransactions.count();
  }
});

describe('StockTransactionDB', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.open();
    stockTransactionDB = createStockTransactionDB(testDb);

    // Add test inventory items
    await testDb.inventoryItems.bulkAdd([
      { id: 1, name: 'Tomatoes', vendorId: 1, currentStock: 100, unit: 'case' },
      { id: 2, name: 'Lettuce', vendorId: 1, currentStock: 50, unit: 'head' },
      { id: 3, name: 'Beef Tenderloin', vendorId: 2, currentStock: 25, unit: 'kg' }
    ]);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('Create Transaction', () => {
    it('should create transaction successfully', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100,
        stockAfter: 110,
        unitCost: 24.99
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.inventoryItemId).toBe(1);
      expect(transaction.inventoryItemName).toBe('Tomatoes');
      expect(transaction.transactionType).toBe(TRANSACTION_TYPE.PURCHASE);
      expect(transaction.quantityChange).toBe(10);
      expect(transaction.stockBefore).toBe(100);
      expect(transaction.stockAfter).toBe(110);
      expect(transaction.isVoided).toBe(false);
    });

    it('should fail with invalid transaction type', async () => {
      await expect(stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: 'invalid_type'
      })).rejects.toThrow('Invalid transaction type: invalid_type');
    });

    it('should fail without inventory item id', async () => {
      await expect(stockTransactionDB.create({
        transactionType: TRANSACTION_TYPE.PURCHASE
      })).rejects.toThrow('Inventory item ID is required');
    });

    it('should fail without transaction type', async () => {
      await expect(stockTransactionDB.create({
        inventoryItemId: 1
      })).rejects.toThrow('Transaction type is required');
    });

    it('should fail with non-existent inventory item', async () => {
      await expect(stockTransactionDB.create({
        inventoryItemId: 99999,
        transactionType: TRANSACTION_TYPE.PURCHASE
      })).rejects.toThrow('Inventory item with ID 99999 not found');
    });

    it('should fail with invalid reference type', async () => {
      await expect(stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        referenceType: 'invalid_ref_type'
      })).rejects.toThrow('Invalid reference type: invalid_ref_type');
    });

    it('should calculate stockAfter automatically', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 25,
        stockBefore: 100
      });

      expect(transaction.stockAfter).toBe(125);
    });

    it('should calculate totalCost automatically', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        unitCost: 24.99,
        stockBefore: 100
      });

      expect(transaction.totalCost).toBe(249.9);
    });
  });

  describe('Get Transactions by Item', () => {
    beforeEach(async () => {
      // Create transactions for item 1
      await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100,
        stockAfter: 110
      });
      await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.TASK_USAGE,
        quantityChange: -5,
        stockBefore: 110,
        stockAfter: 105
      });

      // Create transaction for item 2
      await stockTransactionDB.create({
        inventoryItemId: 2,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 20,
        stockBefore: 50,
        stockAfter: 70
      });
    });

    it('should get transactions by inventory item', async () => {
      const transactions = await stockTransactionDB.getByInventoryItem(1);

      expect(transactions.length).toBe(2);
      expect(transactions.every(t => t.inventoryItemId === 1)).toBe(true);
    });

    it('should return transactions ordered by date (newest first)', async () => {
      const transactions = await stockTransactionDB.getByInventoryItem(1);

      // Task usage was created after purchase
      expect(transactions[0].transactionType).toBe(TRANSACTION_TYPE.TASK_USAGE);
      expect(transactions[1].transactionType).toBe(TRANSACTION_TYPE.PURCHASE);
    });

    it('should respect limit parameter', async () => {
      const transactions = await stockTransactionDB.getByInventoryItem(1, { limit: 1 });

      expect(transactions.length).toBe(1);
    });

    it('should exclude voided transactions by default', async () => {
      // Void a transaction
      const transactions = await stockTransactionDB.getByInventoryItem(1);
      await stockTransactionDB.void(transactions[0].id, 'Test void', 'user1');

      const active = await stockTransactionDB.getByInventoryItem(1);
      expect(active.length).toBe(1);

      const all = await stockTransactionDB.getByInventoryItem(1, { includeVoided: true });
      expect(all.length).toBe(2);
    });
  });

  describe('Get Transactions by Type', () => {
    beforeEach(async () => {
      await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100
      });
      await stockTransactionDB.create({
        inventoryItemId: 2,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 20,
        stockBefore: 50
      });
      await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.WASTE,
        quantityChange: -5,
        stockBefore: 110
      });
    });

    it('should filter by transaction type', async () => {
      const purchases = await stockTransactionDB.getByType(TRANSACTION_TYPE.PURCHASE);

      expect(purchases.length).toBe(2);
      expect(purchases.every(t => t.transactionType === TRANSACTION_TYPE.PURCHASE)).toBe(true);
    });

    it('should fail with invalid type', async () => {
      await expect(stockTransactionDB.getByType('invalid_type'))
        .rejects.toThrow('Invalid transaction type: invalid_type');
    });
  });

  describe('Get Transactions by Date Range', () => {
    beforeEach(async () => {
      // We'll rely on createdAt timestamps
      await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100
      });
      await stockTransactionDB.create({
        inventoryItemId: 2,
        transactionType: TRANSACTION_TYPE.WASTE,
        quantityChange: -5,
        stockBefore: 50
      });
    });

    it('should filter by date range', async () => {
      const today = new Date();
      const startDate = new Date(today.getTime() - 86400000).toISOString(); // Yesterday
      const endDate = new Date(today.getTime() + 86400000).toISOString(); // Tomorrow

      const transactions = await stockTransactionDB.getByDateRange(startDate, endDate);

      expect(transactions.length).toBe(2);
    });

    it('should filter by date range and inventory item', async () => {
      const today = new Date();
      const startDate = new Date(today.getTime() - 86400000).toISOString();
      const endDate = new Date(today.getTime() + 86400000).toISOString();

      const transactions = await stockTransactionDB.getByDateRange(
        startDate,
        endDate,
        { inventoryItemId: 1 }
      );

      expect(transactions.length).toBe(1);
      expect(transactions[0].inventoryItemId).toBe(1);
    });

    it('should filter by date range and transaction type', async () => {
      const today = new Date();
      const startDate = new Date(today.getTime() - 86400000).toISOString();
      const endDate = new Date(today.getTime() + 86400000).toISOString();

      const transactions = await stockTransactionDB.getByDateRange(
        startDate,
        endDate,
        { transactionType: TRANSACTION_TYPE.WASTE }
      );

      expect(transactions.length).toBe(1);
      expect(transactions[0].transactionType).toBe(TRANSACTION_TYPE.WASTE);
    });
  });

  describe('Helper Methods', () => {
    describe('recordPurchase', () => {
      it('should record purchase transaction', async () => {
        const transaction = await stockTransactionDB.recordPurchase(1, 25, {
          currentStock: 100,
          invoiceId: 123,
          unitCost: 24.99
        });

        expect(transaction.transactionType).toBe(TRANSACTION_TYPE.PURCHASE);
        expect(transaction.quantityChange).toBe(25);
        expect(transaction.stockBefore).toBe(100);
        expect(transaction.stockAfter).toBe(125);
        expect(transaction.referenceType).toBe(REFERENCE_TYPE.INVOICE);
        expect(transaction.referenceId).toBe(123);
      });
    });

    describe('recordTaskUsage', () => {
      it('should record task usage (negative quantity)', async () => {
        const transaction = await stockTransactionDB.recordTaskUsage(1, 10, {
          currentStock: 100,
          taskId: 456,
          recipeName: 'Tomato Sauce'
        });

        expect(transaction.transactionType).toBe(TRANSACTION_TYPE.TASK_USAGE);
        expect(transaction.quantityChange).toBe(-10);
        expect(transaction.stockBefore).toBe(100);
        expect(transaction.stockAfter).toBe(90);
        expect(transaction.referenceName).toBe('Tomato Sauce');
      });
    });

    describe('recordAdjustment', () => {
      it('should record adjustment with reason', async () => {
        const transaction = await stockTransactionDB.recordAdjustment(
          1,
          -5,
          'Damaged goods',
          { currentStock: 100 }
        );

        expect(transaction.transactionType).toBe(TRANSACTION_TYPE.ADJUSTMENT);
        expect(transaction.quantityChange).toBe(-5);
        expect(transaction.reason).toBe('Damaged goods');
      });

      it('should fail without reason', async () => {
        await expect(stockTransactionDB.recordAdjustment(1, -5, ''))
          .rejects.toThrow('Reason is required for adjustments');
      });
    });

    describe('recordWaste', () => {
      it('should record waste with reason', async () => {
        const transaction = await stockTransactionDB.recordWaste(
          1,
          3,
          'Spoiled',
          { currentStock: 100 }
        );

        expect(transaction.transactionType).toBe(TRANSACTION_TYPE.WASTE);
        expect(transaction.quantityChange).toBe(-3);
        expect(transaction.reason).toBe('Spoiled');
      });

      it('should fail without reason', async () => {
        await expect(stockTransactionDB.recordWaste(1, 3, ''))
          .rejects.toThrow('Reason is required for waste records');
      });
    });
  });

  describe('Void Transaction', () => {
    it('should void transaction with reason', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100
      });

      const voided = await stockTransactionDB.void(
        transaction.id,
        'Entered in error',
        'user1'
      );

      expect(voided.isVoided).toBe(true);
      expect(voided.voidedAt).toBeDefined();
      expect(voided.voidedBy).toBe('user1');
      expect(voided.voidReason).toBe('Entered in error');
    });

    it('should fail without reason', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100
      });

      await expect(stockTransactionDB.void(transaction.id, ''))
        .rejects.toThrow('Reason is required to void a transaction');
    });

    it('should fail for non-existent transaction', async () => {
      await expect(stockTransactionDB.void(99999, 'Test reason'))
        .rejects.toThrow('Transaction with ID 99999 not found');
    });

    it('should fail if already voided', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.PURCHASE,
        quantityChange: 10,
        stockBefore: 100
      });

      await stockTransactionDB.void(transaction.id, 'First void');

      await expect(stockTransactionDB.void(transaction.id, 'Second void'))
        .rejects.toThrow('Transaction is already voided');
    });
  });

  describe('Validate Enums', () => {
    it('should validate all transaction types', () => {
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.PURCHASE)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.TASK_USAGE)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.ADJUSTMENT)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.WASTE)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.TRANSFER)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.COUNT_CORRECTION)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.RETURN)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.SAMPLE)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.THEFT)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType(TRANSACTION_TYPE.INITIAL)).toBe(true);
      expect(stockTransactionDB.isValidTransactionType('invalid')).toBe(false);
    });

    it('should validate all reference types', () => {
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.INVOICE)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.INVOICE_LINE)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.TASK)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.RECIPE)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.COUNT)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.TRANSFER)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType(REFERENCE_TYPE.MANUAL)).toBe(true);
      expect(stockTransactionDB.isValidReferenceType('invalid')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quantity change', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.TRANSFER,
        quantityChange: 0,
        stockBefore: 100
      });

      expect(transaction.quantityChange).toBe(0);
      expect(transaction.stockAfter).toBe(100);
    });

    it('should handle negative stock after', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.TASK_USAGE,
        quantityChange: -150,
        stockBefore: 100
      });

      expect(transaction.stockAfter).toBe(-50);
    });

    it('should store location information for transfers', async () => {
      const transaction = await stockTransactionDB.create({
        inventoryItemId: 1,
        transactionType: TRANSACTION_TYPE.TRANSFER,
        quantityChange: 0,
        stockBefore: 100,
        locationFrom: 'Walk-in Cooler',
        locationTo: 'Line Prep'
      });

      expect(transaction.locationFrom).toBe('Walk-in Cooler');
      expect(transaction.locationTo).toBe('Line Prep');
    });
  });
});
