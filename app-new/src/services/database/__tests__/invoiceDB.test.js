/**
 * Invoice Database Tests
 *
 * Tests for invoiceDB CRUD operations and business logic.
 * Run with: npm test -- --grep invoiceDB
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';

// Status enums
const INVOICE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  REVIEWED: 'reviewed',
  PROCESSED: 'processed',
  SENT_TO_QB: 'sent_to_qb',
  ERROR: 'error',
  ARCHIVED: 'archived'
};

const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  DISPUTED: 'disputed',
  VOIDED: 'voided'
};

// Create a test database
let testDb;
let invoiceDB;

const createTestDb = () => {
  const db = new Dexie('TestInvoiceDB');

  db.version(1).stores({
    vendors: '++id, name, nameLower, isActive',
    invoices: '++id, vendorId, vendorName, invoiceNumber, invoiceDate, [vendorId+invoiceDate], status, paymentStatus, dueDate, total, createdAt, updatedAt'
  });

  return db;
};

// Create invoiceDB implementation for testing
const createInvoiceDB = (db) => ({
  isValidStatus(status) {
    return Object.values(INVOICE_STATUS).includes(status);
  },

  isValidPaymentStatus(status) {
    return Object.values(PAYMENT_STATUS).includes(status);
  },

  async getAll() {
    return await db.invoices.orderBy('createdAt').reverse().toArray();
  },

  async getById(id) {
    return await db.invoices.get(id);
  },

  async getByVendor(vendorId) {
    return await db.invoices
      .where('vendorId')
      .equals(vendorId)
      .reverse()
      .sortBy('invoiceDate');
  },

  async getByStatus(status) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid invoice status: ${status}`);
    }
    return await db.invoices
      .where('status')
      .equals(status)
      .reverse()
      .sortBy('invoiceDate');
  },

  async getByPaymentStatus(paymentStatus) {
    if (!this.isValidPaymentStatus(paymentStatus)) {
      throw new Error(`Invalid payment status: ${paymentStatus}`);
    }
    return await db.invoices
      .where('paymentStatus')
      .equals(paymentStatus)
      .toArray();
  },

  async getByDateRange(startDate, endDate) {
    return await db.invoices
      .where('invoiceDate')
      .between(startDate, endDate, true, true)
      .reverse()
      .toArray();
  },

  async getByVendorAndDateRange(vendorId, startDate, endDate) {
    return await db.invoices
      .where('[vendorId+invoiceDate]')
      .between([vendorId, startDate], [vendorId, endDate], true, true)
      .toArray();
  },

  async getPending() {
    const pendingStatuses = [
      INVOICE_STATUS.DRAFT,
      INVOICE_STATUS.PENDING,
      INVOICE_STATUS.EXTRACTING,
      INVOICE_STATUS.EXTRACTED
    ];
    return await db.invoices
      .filter(inv => pendingStatuses.includes(inv.status))
      .reverse()
      .sortBy('createdAt');
  },

  async getOverdue() {
    const today = new Date().toISOString().split('T')[0];
    return await db.invoices
      .filter(inv =>
        inv.paymentStatus === PAYMENT_STATUS.UNPAID &&
        inv.dueDate &&
        inv.dueDate < today
      )
      .toArray();
  },

  async create(invoice) {
    // Validation
    if (!invoice.vendorId) {
      throw new Error('Vendor ID is required');
    }

    // Check vendor exists
    const vendor = await db.vendors.get(invoice.vendorId);
    if (!vendor) {
      throw new Error(`Vendor with ID ${invoice.vendorId} not found`);
    }

    // Validate status if provided
    if (invoice.status && !this.isValidStatus(invoice.status)) {
      throw new Error(`Invalid invoice status: ${invoice.status}`);
    }

    const now = new Date().toISOString();
    const data = {
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorName || vendor.name,
      invoiceNumber: invoice.invoiceNumber?.trim() || '',
      invoiceDate: invoice.invoiceDate || now.split('T')[0],
      receivedDate: invoice.receivedDate || now.split('T')[0],
      dueDate: invoice.dueDate || null,
      subtotal: typeof invoice.subtotal === 'number' ? Math.round(invoice.subtotal * 100) / 100 : 0,
      taxGST: typeof invoice.taxGST === 'number' ? Math.round(invoice.taxGST * 100) / 100 : 0,
      taxQST: typeof invoice.taxQST === 'number' ? Math.round(invoice.taxQST * 100) / 100 : 0,
      taxOther: typeof invoice.taxOther === 'number' ? Math.round(invoice.taxOther * 100) / 100 : 0,
      total: typeof invoice.total === 'number' ? Math.round(invoice.total * 100) / 100 : 0,
      currency: invoice.currency || 'CAD',
      status: invoice.status || INVOICE_STATUS.DRAFT,
      paymentStatus: invoice.paymentStatus || PAYMENT_STATUS.UNPAID,
      documentUrl: invoice.documentUrl || null,
      documentType: invoice.documentType || null,
      rawExtractedText: invoice.rawExtractedText || null,
      notes: invoice.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
      createdBy: invoice.createdBy || null
    };

    // Calculate total if not provided
    if (data.total === 0 && data.subtotal > 0) {
      data.total = Math.round((data.subtotal + data.taxGST + data.taxQST + data.taxOther) * 100) / 100;
    }

    const id = await db.invoices.add(data);
    return { id, ...data };
  },

  async update(id, updates) {
    const existing = await db.invoices.get(id);
    if (!existing) {
      throw new Error(`Invoice with ID ${id} not found`);
    }

    // Validate status if being changed
    if (updates.status && !this.isValidStatus(updates.status)) {
      throw new Error(`Invalid invoice status: ${updates.status}`);
    }

    // Validate payment status if being changed
    if (updates.paymentStatus && !this.isValidPaymentStatus(updates.paymentStatus)) {
      throw new Error(`Invalid payment status: ${updates.paymentStatus}`);
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

    await db.invoices.update(id, data);
    return await db.invoices.get(id);
  },

  async updateStatus(id, newStatus) {
    if (!this.isValidStatus(newStatus)) {
      throw new Error(`Invalid invoice status: ${newStatus}`);
    }

    return await this.update(id, {
      status: newStatus,
      processedAt: newStatus === INVOICE_STATUS.PROCESSED ? new Date().toISOString() : undefined
    });
  },

  async delete(id) {
    const existing = await db.invoices.get(id);
    if (!existing) {
      return false;
    }
    await db.invoices.delete(id);
    return true;
  },

  async count() {
    return await db.invoices.count();
  }
});

describe('InvoiceDB', () => {
  beforeEach(async () => {
    testDb = createTestDb();
    await testDb.open();
    invoiceDB = createInvoiceDB(testDb);

    // Add test vendors
    await testDb.vendors.bulkAdd([
      { id: 1, name: 'Sysco Canada', nameLower: 'sysco canada', isActive: 1 },
      { id: 2, name: 'Gordon Food Service', nameLower: 'gordon food service', isActive: 1 }
    ]);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('Create Invoice', () => {
    it('should create invoice with vendor', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        invoiceDate: '2025-12-01',
        subtotal: 100.00,
        taxGST: 5.00,
        taxQST: 9.98,
        total: 114.98
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.vendorId).toBe(1);
      expect(invoice.vendorName).toBe('Sysco Canada');
      expect(invoice.invoiceNumber).toBe('INV-001');
      expect(invoice.total).toBe(114.98);
      expect(invoice.status).toBe(INVOICE_STATUS.DRAFT);
      expect(invoice.paymentStatus).toBe(PAYMENT_STATUS.UNPAID);
    });

    it('should fail when creating invoice without vendor', async () => {
      await expect(invoiceDB.create({
        invoiceNumber: 'INV-001',
        total: 100.00
      })).rejects.toThrow('Vendor ID is required');
    });

    it('should fail when creating invoice with non-existent vendor', async () => {
      await expect(invoiceDB.create({
        vendorId: 99999,
        invoiceNumber: 'INV-001'
      })).rejects.toThrow('Vendor with ID 99999 not found');
    });

    it('should fail when creating invoice with invalid status', async () => {
      await expect(invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        status: 'invalid_status'
      })).rejects.toThrow('Invalid invoice status: invalid_status');
    });

    it('should calculate total from subtotal and taxes', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        subtotal: 100.00,
        taxGST: 5.00,
        taxQST: 9.98
      });

      expect(invoice.total).toBe(114.98);
    });

    it('should round money values to 2 decimal places', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        subtotal: 100.999,
        taxGST: 5.001
      });

      expect(invoice.subtotal).toBe(101);
      expect(invoice.taxGST).toBe(5);
    });
  });

  describe('Read Invoice', () => {
    it('should get invoice by id', async () => {
      const created = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        total: 100.00
      });

      const invoice = await invoiceDB.getById(created.id);

      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toBe('INV-001');
    });

    it('should return undefined for non-existent id', async () => {
      const invoice = await invoiceDB.getById(99999);
      expect(invoice).toBeUndefined();
    });

    it('should get all invoices ordered by date descending', async () => {
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-001', invoiceDate: '2025-12-01' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-002', invoiceDate: '2025-12-02' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-003', invoiceDate: '2025-12-03' });

      const invoices = await invoiceDB.getAll();

      expect(invoices.length).toBe(3);
      // Most recent first
      expect(invoices[0].invoiceNumber).toBe('INV-003');
    });
  });

  describe('Update Invoice', () => {
    it('should update invoice status', async () => {
      const created = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        status: INVOICE_STATUS.DRAFT
      });

      const updated = await invoiceDB.updateStatus(created.id, INVOICE_STATUS.PROCESSED);

      expect(updated.status).toBe(INVOICE_STATUS.PROCESSED);
      expect(updated.processedAt).toBeDefined();
    });

    it('should fail when updating with invalid status', async () => {
      const created = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001'
      });

      await expect(invoiceDB.updateStatus(created.id, 'invalid_status'))
        .rejects.toThrow('Invalid invoice status: invalid_status');
    });

    it('should update invoice fields', async () => {
      const created = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        total: 100.00
      });

      const updated = await invoiceDB.update(created.id, {
        total: 150.00,
        notes: 'Updated note'
      });

      expect(updated.total).toBe(150);
      expect(updated.notes).toBe('Updated note');
    });

    it('should fail when updating non-existent invoice', async () => {
      await expect(invoiceDB.update(99999, {
        total: 100.00
      })).rejects.toThrow('Invoice with ID 99999 not found');
    });
  });

  describe('Filter by Vendor', () => {
    beforeEach(async () => {
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'SYS-001', invoiceDate: '2025-12-01' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'SYS-002', invoiceDate: '2025-12-02' });
      await invoiceDB.create({ vendorId: 2, invoiceNumber: 'GFS-001', invoiceDate: '2025-12-01' });
    });

    it('should get invoices by vendor', async () => {
      const vendor1Invoices = await invoiceDB.getByVendor(1);

      expect(vendor1Invoices.length).toBe(2);
      expect(vendor1Invoices.every(inv => inv.vendorId === 1)).toBe(true);
    });

    it('should return empty array for vendor with no invoices', async () => {
      const invoices = await invoiceDB.getByVendor(99999);

      expect(invoices).toEqual([]);
    });
  });

  describe('Filter by Status', () => {
    beforeEach(async () => {
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-001', status: INVOICE_STATUS.DRAFT });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-002', status: INVOICE_STATUS.DRAFT });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-003', status: INVOICE_STATUS.PROCESSED });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-004', status: INVOICE_STATUS.PENDING });
    });

    it('should get invoices by status', async () => {
      const drafts = await invoiceDB.getByStatus(INVOICE_STATUS.DRAFT);

      expect(drafts.length).toBe(2);
      expect(drafts.every(inv => inv.status === INVOICE_STATUS.DRAFT)).toBe(true);
    });

    it('should fail with invalid status', async () => {
      await expect(invoiceDB.getByStatus('invalid_status'))
        .rejects.toThrow('Invalid invoice status: invalid_status');
    });

    it('should get pending invoices (multiple statuses)', async () => {
      const pending = await invoiceDB.getPending();

      expect(pending.length).toBe(3); // DRAFT (2) + PENDING (1)
    });
  });

  describe('Filter by Date Range', () => {
    beforeEach(async () => {
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-001', invoiceDate: '2025-12-01' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-002', invoiceDate: '2025-12-05' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-003', invoiceDate: '2025-12-10' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'INV-004', invoiceDate: '2025-12-15' });
    });

    it('should filter by date range', async () => {
      const invoices = await invoiceDB.getByDateRange('2025-12-01', '2025-12-10');

      expect(invoices.length).toBe(3);
    });

    it('should include boundary dates', async () => {
      const invoices = await invoiceDB.getByDateRange('2025-12-05', '2025-12-10');

      expect(invoices.length).toBe(2);
      expect(invoices.some(inv => inv.invoiceDate === '2025-12-05')).toBe(true);
      expect(invoices.some(inv => inv.invoiceDate === '2025-12-10')).toBe(true);
    });

    it('should return empty for no matches', async () => {
      const invoices = await invoiceDB.getByDateRange('2024-01-01', '2024-12-31');

      expect(invoices).toEqual([]);
    });
  });

  describe('Filter by Vendor and Date Range (Compound Index)', () => {
    beforeEach(async () => {
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'SYS-001', invoiceDate: '2025-12-01' });
      await invoiceDB.create({ vendorId: 1, invoiceNumber: 'SYS-002', invoiceDate: '2025-12-10' });
      await invoiceDB.create({ vendorId: 2, invoiceNumber: 'GFS-001', invoiceDate: '2025-12-05' });
    });

    it('should filter by vendor and date range', async () => {
      const invoices = await invoiceDB.getByVendorAndDateRange(1, '2025-12-01', '2025-12-10');

      expect(invoices.length).toBe(2);
      expect(invoices.every(inv => inv.vendorId === 1)).toBe(true);
    });

    it('should not include other vendors', async () => {
      const invoices = await invoiceDB.getByVendorAndDateRange(1, '2025-12-01', '2025-12-31');

      expect(invoices.every(inv => inv.vendorId === 1)).toBe(true);
      expect(invoices.some(inv => inv.invoiceNumber === 'GFS-001')).toBe(false);
    });
  });

  describe('Delete Invoice', () => {
    it('should delete invoice', async () => {
      const created = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001'
      });

      const result = await invoiceDB.delete(created.id);

      expect(result).toBe(true);
      const deleted = await invoiceDB.getById(created.id);
      expect(deleted).toBeUndefined();
    });

    it('should return false for non-existent invoice', async () => {
      const result = await invoiceDB.delete(99999);
      expect(result).toBe(false);
    });
  });

  describe('Overdue Invoices', () => {
    it('should get overdue invoices', async () => {
      // Past due date, unpaid
      await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        dueDate: '2024-01-01', // Past
        paymentStatus: PAYMENT_STATUS.UNPAID
      });

      // Future due date, unpaid
      await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-002',
        dueDate: '2099-12-31', // Future
        paymentStatus: PAYMENT_STATUS.UNPAID
      });

      // Past due date, but paid
      await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-003',
        dueDate: '2024-01-01',
        paymentStatus: PAYMENT_STATUS.PAID
      });

      const overdue = await invoiceDB.getOverdue();

      expect(overdue.length).toBe(1);
      expect(overdue[0].invoiceNumber).toBe('INV-001');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invoice with no due date', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV-001',
        dueDate: null
      });

      expect(invoice.dueDate).toBeNull();
    });

    it('should handle zero total', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'CREDIT-001',
        total: 0
      });

      expect(invoice.total).toBe(0);
    });

    it('should handle special characters in invoice number', async () => {
      const invoice = await invoiceDB.create({
        vendorId: 1,
        invoiceNumber: 'INV/2025/001-A'
      });

      expect(invoice.invoiceNumber).toBe('INV/2025/001-A');
    });

    it('should validate all status enum values', () => {
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.DRAFT)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.PENDING)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.EXTRACTING)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.EXTRACTED)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.REVIEWED)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.PROCESSED)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.SENT_TO_QB)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.ERROR)).toBe(true);
      expect(invoiceDB.isValidStatus(INVOICE_STATUS.ARCHIVED)).toBe(true);
      expect(invoiceDB.isValidStatus('invalid')).toBe(false);
    });

    it('should validate all payment status enum values', () => {
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.UNPAID)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.PARTIAL)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.PAID)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.OVERDUE)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.DISPUTED)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus(PAYMENT_STATUS.VOIDED)).toBe(true);
      expect(invoiceDB.isValidPaymentStatus('invalid')).toBe(false);
    });
  });
});
