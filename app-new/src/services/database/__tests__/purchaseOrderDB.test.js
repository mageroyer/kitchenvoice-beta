/**
 * Purchase Order Database Tests
 *
 * Tests for purchaseOrderDB and purchaseOrderLineDB CRUD operations and business logic.
 * Run with: npm test -- --grep purchaseOrderDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

// Purchase Order status enum
const PO_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  SENT: 'sent',
  CONFIRMED: 'confirmed',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
};

// Send method enum
const PO_SEND_METHOD = {
  EMAIL: 'email',
  FAX: 'fax',
  PHONE: 'phone',
  PORTAL: 'portal',
  IN_PERSON: 'in_person',
  OTHER: 'other'
};

// Create a test database
let testDb;
let purchaseOrderDB;
let purchaseOrderLineDB;

const createTestDb = () => {
  const db = new Dexie('TestPurchaseOrderDB');

  db.version(1).stores({
    vendors: '++id, name, nameLower, isActive',
    inventoryItems: '++id, name, vendorId, currentStock, unit, currentPrice',
    purchaseOrders: '++id, orderNumber, vendorId, status, createdAt, expectedDeliveryDate, updatedAt',
    purchaseOrderLines: '++id, purchaseOrderId, inventoryItemId, [purchaseOrderId+lineNumber], createdAt'
  });

  return db;
};

// Create purchaseOrderDB implementation for testing
const createPurchaseOrderDB = (db, lineDB) => ({
  isValidStatus(status) {
    return Object.values(PO_STATUS).includes(status);
  },

  isValidSendMethod(method) {
    return Object.values(PO_SEND_METHOD).includes(method);
  },

  async generateOrderNumber() {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;

    const existingOrders = await db.purchaseOrders
      .where('orderNumber')
      .startsWith(prefix)
      .toArray();

    let maxNum = 0;
    for (const order of existingOrders) {
      const numPart = order.orderNumber.replace(prefix, '');
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${prefix}${nextNum}`;
  },

  async getAll({ includeAll = true } = {}) {
    let results = await db.purchaseOrders.orderBy('createdAt').reverse().toArray();

    if (!includeAll) {
      results = results.filter(po => po.status !== PO_STATUS.CANCELLED);
    }

    return results;
  },

  async getById(id) {
    return await db.purchaseOrders.get(id);
  },

  async getByOrderNumber(orderNumber) {
    return await db.purchaseOrders
      .where('orderNumber')
      .equals(orderNumber)
      .first();
  },

  async getByVendor(vendorId) {
    return await db.purchaseOrders
      .where('vendorId')
      .equals(vendorId)
      .reverse()
      .sortBy('createdAt');
  },

  async getByStatus(status) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid PO status: ${status}`);
    }
    return await db.purchaseOrders
      .where('status')
      .equals(status)
      .reverse()
      .sortBy('createdAt');
  },

  async create(order) {
    // Validation
    if (!order.vendorId) {
      throw new Error('Vendor ID is required');
    }

    const vendor = await db.vendors.get(order.vendorId);
    if (!vendor) {
      throw new Error(`Vendor with ID ${order.vendorId} not found`);
    }

    if (order.status && !this.isValidStatus(order.status)) {
      throw new Error(`Invalid PO status: ${order.status}`);
    }

    const now = new Date().toISOString();
    const orderNumber = order.orderNumber || await this.generateOrderNumber();

    const data = {
      orderNumber,
      vendorId: order.vendorId,
      vendorName: order.vendorName || vendor.name,
      status: order.status || PO_STATUS.DRAFT,
      createdAt: now,
      createdBy: order.createdBy || null,
      createdByName: order.createdByName?.trim() || '',
      approvedAt: order.approvedAt || null,
      approvedBy: order.approvedBy || null,
      approvedByName: order.approvedByName?.trim() || '',
      sentAt: order.sentAt || null,
      sentMethod: order.sentMethod || null,
      sentBy: order.sentBy || null,
      confirmedAt: order.confirmedAt || null,
      vendorConfirmationNumber: order.vendorConfirmationNumber?.trim() || '',
      expectedDeliveryDate: order.expectedDeliveryDate || null,
      receivedAt: order.receivedAt || null,
      subtotal: typeof order.subtotal === 'number' ? Math.round(order.subtotal * 100) / 100 : 0,
      taxGST: typeof order.taxGST === 'number' ? Math.round(order.taxGST * 100) / 100 : 0,
      taxQST: typeof order.taxQST === 'number' ? Math.round(order.taxQST * 100) / 100 : 0,
      taxOther: typeof order.taxOther === 'number' ? Math.round(order.taxOther * 100) / 100 : 0,
      total: typeof order.total === 'number' ? Math.round(order.total * 100) / 100 : 0,
      currency: order.currency || 'CAD',
      deliveryAddress: order.deliveryAddress?.trim() || '',
      deliveryInstructions: order.deliveryInstructions?.trim() || '',
      vendorNotes: order.vendorNotes?.trim() || '',
      internalNotes: order.internalNotes?.trim() || '',
      pdfUrl: order.pdfUrl || null,
      lineCount: order.lineCount || 0,
      updatedAt: now
    };

    const id = await db.purchaseOrders.add(data);
    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await db.purchaseOrders.get(id);
    if (!existing) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }

    if (updates.status && !this.isValidStatus(updates.status)) {
      throw new Error(`Invalid PO status: ${updates.status}`);
    }

    const data = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Round money fields
    const moneyFields = ['subtotal', 'taxGST', 'taxQST', 'taxOther', 'total'];
    for (const field of moneyFields) {
      if (typeof data[field] === 'number') {
        data[field] = Math.round(data[field] * 100) / 100;
      }
    }

    await db.purchaseOrders.update(id, data);
    return await db.purchaseOrders.get(id);
  },

  async submitForApproval(id) {
    const order = await this.getById(id);
    if (!order) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }
    if (order.status !== PO_STATUS.DRAFT) {
      throw new Error('Only draft orders can be submitted for approval');
    }

    return await this.update(id, { status: PO_STATUS.PENDING_APPROVAL });
  },

  async approve(id, approvedBy, approvedByName = '') {
    const order = await this.getById(id);
    if (!order) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }
    if (order.status !== PO_STATUS.PENDING_APPROVAL) {
      throw new Error('Only pending orders can be approved');
    }

    return await this.update(id, {
      status: PO_STATUS.APPROVED,
      approvedAt: new Date().toISOString(),
      approvedBy,
      approvedByName
    });
  },

  async markSent(id, sentMethod, sentBy = null) {
    const order = await this.getById(id);
    if (!order) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }
    if (![PO_STATUS.APPROVED, PO_STATUS.DRAFT].includes(order.status)) {
      throw new Error('Only approved or draft orders can be sent');
    }

    return await this.update(id, {
      status: PO_STATUS.SENT,
      sentAt: new Date().toISOString(),
      sentMethod,
      sentBy
    });
  },

  async markReceived(id) {
    const order = await this.getById(id);
    if (!order) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }

    return await this.update(id, {
      status: PO_STATUS.RECEIVED,
      receivedAt: new Date().toISOString()
    });
  },

  async cancel(id, reason = '') {
    const order = await this.getById(id);
    if (!order) {
      throw new Error(`Purchase order with ID ${id} not found`);
    }
    if ([PO_STATUS.RECEIVED, PO_STATUS.CLOSED].includes(order.status)) {
      throw new Error('Cannot cancel received or closed orders');
    }

    return await this.update(id, {
      status: PO_STATUS.CANCELLED,
      internalNotes: order.internalNotes
        ? `${order.internalNotes}\n[Cancelled: ${reason}]`
        : `[Cancelled: ${reason}]`
    });
  },

  async delete(id) {
    const order = await this.getById(id);
    if (!order) {
      return false;
    }

    // Only allow deleting draft orders
    if (order.status !== PO_STATUS.DRAFT) {
      throw new Error('Only draft orders can be deleted');
    }

    // Delete associated line items first
    await lineDB.deleteByPurchaseOrder(id);

    await db.purchaseOrders.delete(id);
    return true;
  },

  async recalculateTotals(id) {
    const lines = await lineDB.getByPurchaseOrder(id);

    const subtotal = lines.reduce((sum, line) => sum + (line.totalPrice || 0), 0);
    // Quebec compound tax rule: TVQ is calculated on (subtotal + TPS)
    const taxGST = Math.round(subtotal * 0.05 * 100) / 100;
    const taxQST = Math.round((subtotal + taxGST) * 0.09975 * 100) / 100;
    const total = Math.round((subtotal + taxGST + taxQST) * 100) / 100;

    return await this.update(id, {
      subtotal: Math.round(subtotal * 100) / 100,
      taxGST,
      taxQST,
      total,
      lineCount: lines.length
    });
  },

  async count() {
    return await db.purchaseOrders.count();
  }
});

// Create purchaseOrderLineDB implementation for testing
const createPurchaseOrderLineDB = (db) => ({
  async getByPurchaseOrder(purchaseOrderId) {
    return await db.purchaseOrderLines
      .where('purchaseOrderId')
      .equals(purchaseOrderId)
      .sortBy('lineNumber');
  },

  async getById(id) {
    return await db.purchaseOrderLines.get(id);
  },

  async getByInventoryItem(inventoryItemId, { limit = 50 } = {}) {
    return await db.purchaseOrderLines
      .where('inventoryItemId')
      .equals(inventoryItemId)
      .reverse()
      .limit(limit)
      .sortBy('createdAt');
  },

  async getNextLineNumber(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);
    if (lines.length === 0) return 1;

    const maxLine = Math.max(...lines.map(l => l.lineNumber || 0));
    return maxLine + 1;
  },

  async create(line, poDb) {
    if (!line.purchaseOrderId) {
      throw new Error('Purchase order ID is required');
    }

    const po = await db.purchaseOrders.get(line.purchaseOrderId);
    if (!po) {
      throw new Error(`Purchase order with ID ${line.purchaseOrderId} not found`);
    }

    let inventoryItem = null;
    if (line.inventoryItemId) {
      inventoryItem = await db.inventoryItems.get(line.inventoryItemId);
      if (!inventoryItem) {
        throw new Error(`Inventory item with ID ${line.inventoryItemId} not found`);
      }
    }

    const now = new Date().toISOString();
    const lineNumber = line.lineNumber || await this.getNextLineNumber(line.purchaseOrderId);
    const quantity = typeof line.quantity === 'number' ? line.quantity : 1;
    const unitPrice = typeof line.unitPrice === 'number' ? Math.round(line.unitPrice * 100) / 100 : 0;
    const totalPrice = Math.round(quantity * unitPrice * 100) / 100;

    const data = {
      purchaseOrderId: line.purchaseOrderId,
      inventoryItemId: line.inventoryItemId || null,
      inventoryItemName: line.inventoryItemName || inventoryItem?.name || '',
      inventoryItemSku: line.inventoryItemSku || inventoryItem?.sku || '',
      lineNumber,
      quantity,
      unit: line.unit?.trim() || inventoryItem?.unit || 'ea',
      unitPrice,
      totalPrice,
      quantityReceived: typeof line.quantityReceived === 'number' ? line.quantityReceived : 0,
      receivedAt: line.receivedAt || null,
      receivedNotes: line.receivedNotes?.trim() || '',
      stockAtOrder: typeof line.stockAtOrder === 'number' ? line.stockAtOrder : null,
      suggestedQty: typeof line.suggestedQty === 'number' ? line.suggestedQty : null,
      notes: line.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    const id = await db.purchaseOrderLines.add(data);

    // Recalculate PO totals
    if (poDb) {
      await poDb.recalculateTotals(line.purchaseOrderId);
    }

    return { id, ...data };
  },

  async update(id, updates, poDb) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Purchase order line with ID ${id} not found`);
    }

    const data = { ...updates };

    // Recalculate total if quantity or price changed
    if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
      const quantity = typeof updates.quantity === 'number' ? updates.quantity : existing.quantity;
      const unitPrice = typeof updates.unitPrice === 'number'
        ? Math.round(updates.unitPrice * 100) / 100
        : existing.unitPrice;
      data.totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    }

    data.updatedAt = new Date().toISOString();

    await db.purchaseOrderLines.update(id, data);

    // Recalculate PO totals
    if (poDb) {
      await poDb.recalculateTotals(existing.purchaseOrderId);
    }

    return await db.purchaseOrderLines.get(id);
  },

  async recordReceive(id, quantityReceived, notes = '', poDb) {
    const line = await this.getById(id);
    if (!line) {
      throw new Error(`Purchase order line with ID ${id} not found`);
    }

    const newTotal = (line.quantityReceived || 0) + quantityReceived;
    const receivedNotes = notes
      ? (line.receivedNotes ? `${line.receivedNotes}\n${notes}` : notes)
      : line.receivedNotes;

    return await this.update(id, {
      quantityReceived: newTotal,
      receivedAt: new Date().toISOString(),
      receivedNotes
    }, poDb);
  },

  async getReceivingStatus(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);

    let total = 0;
    let received = 0;
    let partial = 0;
    let pending = 0;

    for (const line of lines) {
      total++;
      const qtyReceived = line.quantityReceived || 0;

      if (qtyReceived >= line.quantity) {
        received++;
      } else if (qtyReceived > 0) {
        partial++;
      } else {
        pending++;
      }
    }

    return {
      total,
      received,
      partial,
      pending,
      isComplete: received === total && total > 0
    };
  },

  async delete(id, poDb) {
    const line = await this.getById(id);
    if (!line) {
      return false;
    }

    const purchaseOrderId = line.purchaseOrderId;
    await db.purchaseOrderLines.delete(id);

    // Recalculate PO totals
    if (poDb) {
      await poDb.recalculateTotals(purchaseOrderId);
    }

    return true;
  },

  async deleteByPurchaseOrder(purchaseOrderId) {
    const lines = await this.getByPurchaseOrder(purchaseOrderId);

    for (const line of lines) {
      await db.purchaseOrderLines.delete(line.id);
    }

    return lines.length;
  },

  async count() {
    return await db.purchaseOrderLines.count();
  }
});

describe('PurchaseOrderDB', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.open();
    purchaseOrderLineDB = createPurchaseOrderLineDB(testDb);
    purchaseOrderDB = createPurchaseOrderDB(testDb, purchaseOrderLineDB);

    // Add test vendors
    await testDb.vendors.bulkAdd([
      { id: 1, name: 'Sysco Canada', nameLower: 'sysco canada', isActive: 1 },
      { id: 2, name: 'Gordon Food Service', nameLower: 'gordon food service', isActive: 1 }
    ]);

    // Add test inventory items
    await testDb.inventoryItems.bulkAdd([
      { id: 1, name: 'Tomatoes', vendorId: 1, currentStock: 100, unit: 'case', currentPrice: 24.99 },
      { id: 2, name: 'Lettuce', vendorId: 1, currentStock: 50, unit: 'head', currentPrice: 2.99 }
    ]);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('Create Draft Order', () => {
    it('should create draft order successfully', async () => {
      const order = await purchaseOrderDB.create({
        vendorId: 1,
        deliveryAddress: '123 Restaurant St',
        internalNotes: 'Weekly order'
      });

      expect(order.id).toBeDefined();
      expect(order.orderNumber).toMatch(/^PO-\d{4}-\d{3}$/);
      expect(order.vendorId).toBe(1);
      expect(order.vendorName).toBe('Sysco Canada');
      expect(order.status).toBe(PO_STATUS.DRAFT);
      expect(order.currency).toBe('CAD');
    });

    it('should fail without vendor id', async () => {
      await expect(purchaseOrderDB.create({
        deliveryAddress: '123 Restaurant St'
      })).rejects.toThrow('Vendor ID is required');
    });

    it('should fail with non-existent vendor', async () => {
      await expect(purchaseOrderDB.create({
        vendorId: 99999
      })).rejects.toThrow('Vendor with ID 99999 not found');
    });

    it('should fail with invalid status', async () => {
      await expect(purchaseOrderDB.create({
        vendorId: 1,
        status: 'invalid_status'
      })).rejects.toThrow('Invalid PO status: invalid_status');
    });
  });

  describe('Generate Order Number', () => {
    it('should generate unique sequential order numbers', async () => {
      const order1 = await purchaseOrderDB.create({ vendorId: 1 });
      const order2 = await purchaseOrderDB.create({ vendorId: 1 });
      const order3 = await purchaseOrderDB.create({ vendorId: 1 });

      expect(order1.orderNumber).toMatch(/^PO-\d{4}-001$/);
      expect(order2.orderNumber).toMatch(/^PO-\d{4}-002$/);
      expect(order3.orderNumber).toMatch(/^PO-\d{4}-003$/);
    });

    it('should use current year in order number', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      const year = new Date().getFullYear();

      expect(order.orderNumber).toContain(`PO-${year}-`);
    });

    it('should allow custom order number', async () => {
      const order = await purchaseOrderDB.create({
        vendorId: 1,
        orderNumber: 'CUSTOM-001'
      });

      expect(order.orderNumber).toBe('CUSTOM-001');
    });
  });

  describe('Add Line to Order', () => {
    let orderId;

    beforeEach(async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      orderId = order.id;
    });

    it('should add line item to order', async () => {
      const line = await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 24.99
      }, purchaseOrderDB);

      expect(line.id).toBeDefined();
      expect(line.purchaseOrderId).toBe(orderId);
      expect(line.inventoryItemId).toBe(1);
      expect(line.inventoryItemName).toBe('Tomatoes');
      expect(line.quantity).toBe(10);
      expect(line.unitPrice).toBe(24.99);
      expect(line.totalPrice).toBe(249.9);
      expect(line.lineNumber).toBe(1);
    });

    it('should auto-increment line numbers', async () => {
      const line1 = await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 1,
        quantity: 5,
        unitPrice: 10
      }, purchaseOrderDB);

      const line2 = await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 2,
        quantity: 10,
        unitPrice: 5
      }, purchaseOrderDB);

      expect(line1.lineNumber).toBe(1);
      expect(line2.lineNumber).toBe(2);
    });

    it('should update PO totals when adding line', async () => {
      await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 100
      }, purchaseOrderDB);

      const order = await purchaseOrderDB.getById(orderId);

      expect(order.subtotal).toBe(1000);
      expect(order.taxGST).toBe(50); // 5%
      // Quebec TVQ is calculated on (subtotal + TPS/GST): 1050 * 9.975% = 104.74
      expect(order.taxQST).toBe(104.74);
      expect(order.total).toBe(1154.74);
      expect(order.lineCount).toBe(1);
    });
  });

  describe('Update Order Status', () => {
    let orderId;

    beforeEach(async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      orderId = order.id;
    });

    it('should update status correctly', async () => {
      const updated = await purchaseOrderDB.update(orderId, {
        status: PO_STATUS.SENT
      });

      expect(updated.status).toBe(PO_STATUS.SENT);
    });

    it('should fail with invalid status', async () => {
      await expect(purchaseOrderDB.update(orderId, {
        status: 'invalid_status'
      })).rejects.toThrow('Invalid PO status: invalid_status');
    });

    it('should track approval workflow', async () => {
      await purchaseOrderDB.submitForApproval(orderId);
      let order = await purchaseOrderDB.getById(orderId);
      expect(order.status).toBe(PO_STATUS.PENDING_APPROVAL);

      await purchaseOrderDB.approve(orderId, 'user1', 'John Manager');
      order = await purchaseOrderDB.getById(orderId);
      expect(order.status).toBe(PO_STATUS.APPROVED);
      expect(order.approvedBy).toBe('user1');
      expect(order.approvedByName).toBe('John Manager');
      expect(order.approvedAt).toBeDefined();
    });
  });

  describe('Delete Order', () => {
    it('should delete draft order successfully', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });

      const result = await purchaseOrderDB.delete(order.id);

      expect(result).toBe(true);
      const deleted = await purchaseOrderDB.getById(order.id);
      expect(deleted).toBeUndefined();
    });

    it('should fail when deleting sent order', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderDB.markSent(order.id, PO_SEND_METHOD.EMAIL);

      await expect(purchaseOrderDB.delete(order.id))
        .rejects.toThrow('Only draft orders can be deleted');
    });

    it('should delete associated line items', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderLineDB.create({
        purchaseOrderId: order.id,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 24.99
      }, purchaseOrderDB);

      await purchaseOrderDB.delete(order.id);

      const lines = await purchaseOrderLineDB.getByPurchaseOrder(order.id);
      expect(lines.length).toBe(0);
    });
  });

  describe('Cancel Order', () => {
    it('should cancel draft order', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });

      const cancelled = await purchaseOrderDB.cancel(order.id, 'No longer needed');

      expect(cancelled.status).toBe(PO_STATUS.CANCELLED);
      expect(cancelled.internalNotes).toContain('[Cancelled: No longer needed]');
    });

    it('should cancel sent order', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderDB.markSent(order.id, PO_SEND_METHOD.EMAIL);

      const cancelled = await purchaseOrderDB.cancel(order.id, 'Vendor issue');

      expect(cancelled.status).toBe(PO_STATUS.CANCELLED);
    });

    it('should fail when cancelling received order', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderDB.markSent(order.id, PO_SEND_METHOD.EMAIL);
      await purchaseOrderDB.markReceived(order.id);

      await expect(purchaseOrderDB.cancel(order.id, 'Test'))
        .rejects.toThrow('Cannot cancel received or closed orders');
    });
  });

  describe('Filter by Status', () => {
    beforeEach(async () => {
      await purchaseOrderDB.create({ vendorId: 1 }); // Draft
      await purchaseOrderDB.create({ vendorId: 1 }); // Draft

      const order3 = await purchaseOrderDB.create({ vendorId: 2 });
      await purchaseOrderDB.markSent(order3.id, PO_SEND_METHOD.EMAIL);
    });

    it('should get orders by status', async () => {
      const drafts = await purchaseOrderDB.getByStatus(PO_STATUS.DRAFT);

      expect(drafts.length).toBe(2);
      expect(drafts.every(o => o.status === PO_STATUS.DRAFT)).toBe(true);
    });

    it('should fail with invalid status', async () => {
      await expect(purchaseOrderDB.getByStatus('invalid_status'))
        .rejects.toThrow('Invalid PO status: invalid_status');
    });
  });

  describe('Filter by Vendor', () => {
    beforeEach(async () => {
      await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderDB.create({ vendorId: 1 });
      await purchaseOrderDB.create({ vendorId: 2 });
    });

    it('should get orders by vendor', async () => {
      const vendor1Orders = await purchaseOrderDB.getByVendor(1);

      expect(vendor1Orders.length).toBe(2);
      expect(vendor1Orders.every(o => o.vendorId === 1)).toBe(true);
    });

    it('should return empty array for vendor with no orders', async () => {
      const orders = await purchaseOrderDB.getByVendor(99999);

      expect(orders).toEqual([]);
    });
  });

  describe('Partial Receive Tracking', () => {
    let orderId;
    let lineId;

    beforeEach(async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      orderId = order.id;

      const line = await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 24.99
      }, purchaseOrderDB);
      lineId = line.id;
    });

    it('should record partial receive', async () => {
      const updated = await purchaseOrderLineDB.recordReceive(
        lineId,
        5,
        'First shipment',
        purchaseOrderDB
      );

      expect(updated.quantityReceived).toBe(5);
      expect(updated.receivedAt).toBeDefined();
      expect(updated.receivedNotes).toBe('First shipment');
    });

    it('should accumulate received quantity', async () => {
      await purchaseOrderLineDB.recordReceive(lineId, 3, 'First', purchaseOrderDB);
      const updated = await purchaseOrderLineDB.recordReceive(lineId, 4, 'Second', purchaseOrderDB);

      expect(updated.quantityReceived).toBe(7);
      expect(updated.receivedNotes).toContain('First');
      expect(updated.receivedNotes).toContain('Second');
    });

    it('should get receiving status', async () => {
      await purchaseOrderLineDB.create({
        purchaseOrderId: orderId,
        inventoryItemId: 2,
        quantity: 5,
        unitPrice: 2.99
      }, purchaseOrderDB);

      // Receive first line partially
      await purchaseOrderLineDB.recordReceive(lineId, 5, '', purchaseOrderDB);

      const status = await purchaseOrderLineDB.getReceivingStatus(orderId);

      expect(status.total).toBe(2);
      expect(status.received).toBe(0);
      expect(status.partial).toBe(1);
      expect(status.pending).toBe(1);
      expect(status.isComplete).toBe(false);
    });

    it('should mark complete when all lines fully received', async () => {
      // Receive full quantity
      await purchaseOrderLineDB.recordReceive(lineId, 10, '', purchaseOrderDB);

      const status = await purchaseOrderLineDB.getReceivingStatus(orderId);

      expect(status.received).toBe(1);
      expect(status.isComplete).toBe(true);
    });
  });

  describe('Validate Enums', () => {
    it('should validate all PO status values', () => {
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.DRAFT)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.PENDING_APPROVAL)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.APPROVED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.SENT)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.CONFIRMED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.PARTIALLY_RECEIVED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.RECEIVED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.CANCELLED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus(PO_STATUS.CLOSED)).toBe(true);
      expect(purchaseOrderDB.isValidStatus('invalid')).toBe(false);
    });

    it('should validate all send method values', () => {
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.EMAIL)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.FAX)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.PHONE)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.PORTAL)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.IN_PERSON)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod(PO_SEND_METHOD.OTHER)).toBe(true);
      expect(purchaseOrderDB.isValidSendMethod('invalid')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle order with no lines', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });

      expect(order.subtotal).toBe(0);
      expect(order.total).toBe(0);
      expect(order.lineCount).toBe(0);
    });

    it('should handle zero quantity lines', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      const line = await purchaseOrderLineDB.create({
        purchaseOrderId: order.id,
        inventoryItemId: 1,
        quantity: 0,
        unitPrice: 24.99
      }, purchaseOrderDB);

      expect(line.totalPrice).toBe(0);
    });

    it('should track stock at order time', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      const line = await purchaseOrderLineDB.create({
        purchaseOrderId: order.id,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 24.99,
        stockAtOrder: 100
      }, purchaseOrderDB);

      expect(line.stockAtOrder).toBe(100);
    });

    it('should track suggested quantity', async () => {
      const order = await purchaseOrderDB.create({ vendorId: 1 });
      const line = await purchaseOrderLineDB.create({
        purchaseOrderId: order.id,
        inventoryItemId: 1,
        quantity: 10,
        unitPrice: 24.99,
        suggestedQty: 15
      }, purchaseOrderDB);

      expect(line.suggestedQty).toBe(15);
    });
  });
});
