/**
 * Unit Tests for invoiceService.js
 *
 * Tests invoice service business logic including:
 * - Invoice creation
 * - Status transitions
 * - Get invoice with lines
 * - Payment handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database modules before importing the service
vi.mock('../../database/indexedDB', () => ({
  invoiceDB: {
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    getByVendor: vi.fn(),
    getByStatus: vi.fn(),
    getByPaymentStatus: vi.fn(),
    getByDateRange: vi.fn(),
    getByVendorAndDateRange: vi.fn(),
    searchByNumber: vi.fn(),
    getPending: vi.fn(),
    getOverdue: vi.fn(),
    delete: vi.fn()
  },
  invoiceLineDB: {
    create: vi.fn(),
    getById: vi.fn(),
    getByInvoice: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUnmatched: vi.fn()
  },
  vendorDB: {
    getById: vi.fn()
  },
  INVOICE_STATUS: {
    DRAFT: 'draft',
    PENDING: 'pending',
    EXTRACTING: 'extracting',
    EXTRACTED: 'extracted',
    REVIEWED: 'reviewed',
    APPROVED: 'approved',
    SYNCED: 'synced',
    ERROR: 'error',
    CANCELLED: 'cancelled'
  },
  PAYMENT_STATUS: {
    UNPAID: 'unpaid',
    PARTIAL: 'partial',
    PAID: 'paid',
    OVERDUE: 'overdue',
    DISPUTED: 'disputed',
    CANCELLED: 'cancelled'
  }
}));

import {
  createInvoice,
  updateInvoice,
  getInvoice,
  getAllInvoices,
  validateStatusTransition,
  validatePaymentTransition,
  validateInvoiceData,
  processInvoice,
  markInvoiceProcessed,
  markInvoiceReviewed,
  approveInvoice,
  markInvoicePaid,
  cancelInvoice,
  getInvoiceStats,
  INVOICE_STATUS,
  PAYMENT_STATUS,
  VALID_STATUS_TRANSITIONS,
  VALID_PAYMENT_TRANSITIONS
} from '../invoiceService';

import { invoiceDB, invoiceLineDB, vendorDB } from '../../database/indexedDB';

// ============================================
// Test Data
// ============================================

const mockVendor = {
  id: 1,
  name: 'Test Vendor Inc',
  phone: '555-1234',
  email: 'vendor@test.com'
};

const mockInvoice = {
  id: 1,
  vendorId: 1,
  vendorName: 'Test Vendor Inc',
  invoiceNumber: 'INV-001',
  invoiceDate: '2024-12-01',
  dueDate: '2024-12-31',
  subtotal: 100.00,
  taxGST: 5.00,
  taxQST: 9.975,
  total: 114.975,
  status: INVOICE_STATUS.PENDING,
  paymentStatus: PAYMENT_STATUS.UNPAID,
  createdAt: '2024-12-01T10:00:00.000Z'
};

const mockLineItems = [
  {
    id: 1,
    invoiceId: 1,
    lineNumber: 1,
    description: 'Item 1',
    quantity: 10,
    unitPrice: 5.00,
    totalPrice: 50.00
  },
  {
    id: 2,
    invoiceId: 1,
    lineNumber: 2,
    description: 'Item 2',
    quantity: 5,
    unitPrice: 10.00,
    totalPrice: 50.00
  }
];

// ============================================
// Setup and Teardown
// ============================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================
// CREATE INVOICE
// ============================================

describe('createInvoice', () => {
  it('should create invoice with valid data and return with id', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    invoiceDB.create.mockResolvedValue(1);
    invoiceDB.getById.mockResolvedValue({
      id: 1,
      vendorId: 1,
      vendorName: 'Test Vendor Inc',
      invoiceNumber: 'INV-001',
      status: INVOICE_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.UNPAID
    });

    const result = await createInvoice({
      vendorId: 1,
      invoiceNumber: 'INV-001',
      subtotal: 100.00,
      total: 115.00
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(invoiceDB.create).toHaveBeenCalled();
  });

  it('should throw error for invalid vendor', async () => {
    vendorDB.getById.mockResolvedValue(null);

    await expect(createInvoice({
      vendorId: 999,
      invoiceNumber: 'INV-001'
    })).rejects.toThrow('Vendor 999 not found');

    expect(invoiceDB.create).not.toHaveBeenCalled();
  });

  it('should set pending status on creation', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    invoiceDB.create.mockResolvedValue(1);
    invoiceDB.getById.mockResolvedValue({
      id: 1,
      vendorId: 1,
      status: INVOICE_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.UNPAID
    });

    const result = await createInvoice({
      vendorId: 1,
      invoiceNumber: 'INV-001'
    });

    expect(result.status).toBe(INVOICE_STATUS.PENDING);

    // Verify the create call included pending status
    const createCall = invoiceDB.create.mock.calls[0][0];
    expect(createCall.status).toBe(INVOICE_STATUS.PENDING);
  });

  it('should denormalize vendor name from vendor record', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    invoiceDB.create.mockResolvedValue(1);
    invoiceDB.getById.mockResolvedValue({
      id: 1,
      vendorId: 1,
      vendorName: 'Test Vendor Inc',
      status: INVOICE_STATUS.PENDING
    });

    await createInvoice({
      vendorId: 1,
      invoiceNumber: 'INV-001'
    });

    // Verify vendor name was denormalized
    const createCall = invoiceDB.create.mock.calls[0][0];
    expect(createCall.vendorName).toBe('Test Vendor Inc');
  });

  it('should throw error when vendorId is missing', async () => {
    await expect(createInvoice({
      invoiceNumber: 'INV-001'
    })).rejects.toThrow('Vendor is required');
  });

  it('should validate invoice number length', async () => {
    const longNumber = 'X'.repeat(101);

    await expect(createInvoice({
      vendorId: 1,
      invoiceNumber: longNumber
    })).rejects.toThrow('Invoice number must be 100 characters or less');
  });

  it('should set unpaid payment status on creation', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    invoiceDB.create.mockResolvedValue(1);
    invoiceDB.getById.mockResolvedValue({
      id: 1,
      vendorId: 1,
      status: INVOICE_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.UNPAID
    });

    await createInvoice({ vendorId: 1 });

    const createCall = invoiceDB.create.mock.calls[0][0];
    expect(createCall.paymentStatus).toBe(PAYMENT_STATUS.UNPAID);
  });
});

// ============================================
// STATUS TRANSITIONS
// ============================================

describe('validateStatusTransition', () => {
  it('should allow pending → extracting transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.PENDING, INVOICE_STATUS.EXTRACTING);
    expect(result.valid).toBe(true);
  });

  it('should allow extracting → extracted transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.EXTRACTING, INVOICE_STATUS.EXTRACTED);
    expect(result.valid).toBe(true);
  });

  it('should allow extracted → reviewed transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.EXTRACTED, INVOICE_STATUS.REVIEWED);
    expect(result.valid).toBe(true);
  });

  it('should allow reviewed → approved transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.REVIEWED, INVOICE_STATUS.APPROVED);
    expect(result.valid).toBe(true);
  });

  it('should NOT allow synced → pending transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.SYNCED, INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition');
  });

  it('should NOT allow approved → pending transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.APPROVED, INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition');
  });

  it('should NOT allow cancelled → pending transition', () => {
    const result = validateStatusTransition(INVOICE_STATUS.CANCELLED, INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition');
    expect(result.error).toContain('none'); // No transitions allowed
  });

  it('should allow retry from error → pending', () => {
    const result = validateStatusTransition(INVOICE_STATUS.ERROR, INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(true);
  });

  it('should allow reprocess from extracted → pending', () => {
    const result = validateStatusTransition(INVOICE_STATUS.EXTRACTED, INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(true);
  });

  it('should allow cancel from pending', () => {
    const result = validateStatusTransition(INVOICE_STATUS.PENDING, INVOICE_STATUS.CANCELLED);
    expect(result.valid).toBe(true);
  });

  it('should allow any initial status for new invoice (no current status)', () => {
    const result = validateStatusTransition(null, INVOICE_STATUS.DRAFT);
    expect(result.valid).toBe(true);
  });

  it('should return error for unknown current status', () => {
    const result = validateStatusTransition('unknown_status', INVOICE_STATUS.PENDING);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown current status');
  });
});

describe('validatePaymentTransition', () => {
  it('should allow unpaid → paid transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PAID);
    expect(result.valid).toBe(true);
  });

  it('should allow unpaid → partial transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PARTIAL);
    expect(result.valid).toBe(true);
  });

  it('should allow partial → paid transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.PARTIAL, PAYMENT_STATUS.PAID);
    expect(result.valid).toBe(true);
  });

  it('should NOT allow paid → unpaid transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.PAID, PAYMENT_STATUS.UNPAID);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot transition payment');
  });

  it('should NOT allow paid → partial transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.PAID, PAYMENT_STATUS.PARTIAL);
    expect(result.valid).toBe(false);
  });

  it('should allow overdue → paid transition', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.OVERDUE, PAYMENT_STATUS.PAID);
    expect(result.valid).toBe(true);
  });

  it('should allow disputed resolution', () => {
    const result = validatePaymentTransition(PAYMENT_STATUS.DISPUTED, PAYMENT_STATUS.PAID);
    expect(result.valid).toBe(true);
  });
});

describe('updateInvoice status transitions', () => {
  it('should allow valid status transition through updateInvoice', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTED })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.REVIEWED });
    invoiceDB.update.mockResolvedValue(true);

    const result = await updateInvoice(1, { status: INVOICE_STATUS.REVIEWED });

    expect(result.status).toBe(INVOICE_STATUS.REVIEWED);
    expect(invoiceDB.update).toHaveBeenCalled();
  });

  it('should reject invalid status transition through updateInvoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.SYNCED });

    await expect(updateInvoice(1, { status: INVOICE_STATUS.PENDING }))
      .rejects.toThrow('Cannot transition');
  });
});

// ============================================
// GET INVOICE WITH LINES
// ============================================

describe('getInvoice', () => {
  it('should return invoice with line items when invoice exists', async () => {
    invoiceDB.getById.mockResolvedValue(mockInvoice);
    invoiceLineDB.getByInvoice.mockResolvedValue(mockLineItems);

    const result = await getInvoice(1);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItemCount).toBe(2);
    expect(result.lineItems[0].description).toBe('Item 1');
    expect(result.lineItems[1].description).toBe('Item 2');
  });

  it('should return empty lines array when no line items exist', async () => {
    invoiceDB.getById.mockResolvedValue(mockInvoice);
    invoiceLineDB.getByInvoice.mockResolvedValue([]);

    const result = await getInvoice(1);

    expect(result).toBeDefined();
    expect(result.lineItems).toEqual([]);
    expect(result.lineItemCount).toBe(0);
  });

  it('should return null when invoice not found', async () => {
    invoiceDB.getById.mockResolvedValue(null);

    const result = await getInvoice(999);

    expect(result).toBeNull();
    expect(invoiceLineDB.getByInvoice).not.toHaveBeenCalled();
  });

  it('should handle null from lineItems query gracefully', async () => {
    invoiceDB.getById.mockResolvedValue(mockInvoice);
    invoiceLineDB.getByInvoice.mockResolvedValue(null);

    const result = await getInvoice(1);

    expect(result.lineItems).toEqual([]);
    expect(result.lineItemCount).toBe(0);
  });
});

// ============================================
// VALIDATE INVOICE DATA
// ============================================

describe('validateInvoiceData', () => {
  it('should require vendorId on create', () => {
    const result = validateInvoiceData({}, { isUpdate: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Vendor is required');
  });

  it('should not require vendorId on update', () => {
    const result = validateInvoiceData({ subtotal: 100 }, { isUpdate: true });
    expect(result.valid).toBe(true);
    expect(result.errors).not.toContain('Vendor is required');
  });

  it('should validate subtotal is non-negative', () => {
    const result = validateInvoiceData({ vendorId: 1, subtotal: -10 }, { isUpdate: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Subtotal must be a non-negative number');
  });

  it('should validate total is non-negative', () => {
    const result = validateInvoiceData({ vendorId: 1, total: -10 }, { isUpdate: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Total must be a non-negative number');
  });

  it('should validate invoice date format', () => {
    const result = validateInvoiceData({ vendorId: 1, invoiceDate: 'not-a-date' }, { isUpdate: false });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invoice date must be in ISO format');
  });

  it('should accept valid ISO date', () => {
    const result = validateInvoiceData({ vendorId: 1, invoiceDate: '2024-12-01' }, { isUpdate: false });
    expect(result.valid).toBe(true);
  });
});

// ============================================
// PROCESS INVOICE
// ============================================

describe('processInvoice', () => {
  it('should start processing for pending invoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.PENDING });
    invoiceDB.update.mockResolvedValue(true);

    const result = await processInvoice(1);

    expect(result.status).toBe(INVOICE_STATUS.EXTRACTING);
    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: INVOICE_STATUS.EXTRACTING
    }));
  });

  it('should allow retry processing for error status', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.ERROR });
    invoiceDB.update.mockResolvedValue(true);

    const result = await processInvoice(1);

    expect(result.status).toBe(INVOICE_STATUS.EXTRACTING);
  });

  it('should throw for invoice not found', async () => {
    invoiceDB.getById.mockResolvedValue(null);

    await expect(processInvoice(999)).rejects.toThrow('Invoice not found');
  });

  it('should throw for invoice in non-processable status', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.SYNCED });

    await expect(processInvoice(1)).rejects.toThrow('Cannot process invoice');
  });
});

// ============================================
// MARK INVOICE PROCESSED
// ============================================

describe('markInvoiceProcessed', () => {
  it('should mark invoice as extracted and create line items', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTING })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTED, lineItems: mockLineItems });
    invoiceDB.update.mockResolvedValue(true);
    invoiceLineDB.create.mockResolvedValue(1);
    invoiceLineDB.getByInvoice.mockResolvedValue(mockLineItems);

    const result = await markInvoiceProcessed(1, mockLineItems);

    expect(invoiceLineDB.create).toHaveBeenCalledTimes(2);
    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: INVOICE_STATUS.EXTRACTED
    }));
  });

  it('should handle empty line items array', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTING })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTED });
    invoiceDB.update.mockResolvedValue(true);
    invoiceLineDB.getByInvoice.mockResolvedValue([]);

    const result = await markInvoiceProcessed(1, []);

    expect(invoiceLineDB.create).not.toHaveBeenCalled();
    expect(invoiceDB.update).toHaveBeenCalled();
  });
});

// ============================================
// MARK INVOICE REVIEWED / APPROVED
// ============================================

describe('markInvoiceReviewed', () => {
  it('should mark extracted invoice as reviewed', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTED })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.REVIEWED });
    invoiceDB.update.mockResolvedValue(true);

    const result = await markInvoiceReviewed(1);

    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: INVOICE_STATUS.REVIEWED
    }));
  });

  it('should throw for non-extracted invoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.PENDING });

    await expect(markInvoiceReviewed(1)).rejects.toThrow('Cannot review invoice');
  });
});

describe('approveInvoice', () => {
  it('should approve reviewed invoice', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.REVIEWED })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.APPROVED });
    invoiceDB.update.mockResolvedValue(true);

    const result = await approveInvoice(1);

    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: INVOICE_STATUS.APPROVED
    }));
  });

  it('should throw for non-reviewed invoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.EXTRACTED });

    await expect(approveInvoice(1)).rejects.toThrow('Cannot approve invoice');
  });
});

// ============================================
// MARK INVOICE PAID
// ============================================

describe('markInvoicePaid', () => {
  it('should mark invoice as fully paid', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, total: 100, paymentStatus: PAYMENT_STATUS.UNPAID })
      .mockResolvedValueOnce({ ...mockInvoice, paymentStatus: PAYMENT_STATUS.PAID });
    invoiceDB.update.mockResolvedValue(true);

    const result = await markInvoicePaid(1, { paymentAmount: 100 });

    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      paymentStatus: PAYMENT_STATUS.PAID,
      paymentAmount: 100
    }));
  });

  it('should mark as partial payment when amount is less than total', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, total: 100, paymentStatus: PAYMENT_STATUS.UNPAID })
      .mockResolvedValueOnce({ ...mockInvoice, paymentStatus: PAYMENT_STATUS.PARTIAL });
    invoiceDB.update.mockResolvedValue(true);

    const result = await markInvoicePaid(1, { paymentAmount: 50 });

    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      paymentStatus: PAYMENT_STATUS.PARTIAL,
      paymentAmount: 50
    }));
  });

  it('should throw error for negative payment amount', async () => {
    // Negative payment amounts should be rejected
    // Note: paymentAmount: 0 is treated as "not specified" and falls back to invoice.total (defensive behavior)
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, total: 100, paymentStatus: PAYMENT_STATUS.UNPAID });

    await expect(markInvoicePaid(1, { paymentAmount: -10 }))
      .rejects.toThrow('Payment amount must be greater than 0');
  });
});

// ============================================
// CANCEL INVOICE
// ============================================

describe('cancelInvoice', () => {
  it('should cancel pending invoice', async () => {
    invoiceDB.getById
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.PENDING })
      .mockResolvedValueOnce({ ...mockInvoice, status: INVOICE_STATUS.CANCELLED });
    invoiceDB.update.mockResolvedValue(true);

    const result = await cancelInvoice(1, 'Duplicate invoice');

    expect(invoiceDB.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: INVOICE_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.CANCELLED
    }));
  });

  it('should not allow cancelling synced invoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.SYNCED });

    await expect(cancelInvoice(1)).rejects.toThrow('Cannot cancel invoice');
  });

  it('should not allow cancelling already cancelled invoice', async () => {
    invoiceDB.getById.mockResolvedValue({ ...mockInvoice, status: INVOICE_STATUS.CANCELLED });

    await expect(cancelInvoice(1)).rejects.toThrow('Cannot cancel invoice');
  });
});

// ============================================
// GET ALL INVOICES
// ============================================

describe('getAllInvoices', () => {
  it('should return all invoices sorted by date descending', async () => {
    const invoices = [
      { id: 1, invoiceDate: '2024-12-01' },
      { id: 2, invoiceDate: '2024-12-15' },
      { id: 3, invoiceDate: '2024-12-10' }
    ];
    invoiceDB.getAll.mockResolvedValue(invoices);

    const result = await getAllInvoices();

    expect(result[0].id).toBe(2); // Dec 15
    expect(result[1].id).toBe(3); // Dec 10
    expect(result[2].id).toBe(1); // Dec 1
  });

  it('should filter by vendor', async () => {
    invoiceDB.getByVendor.mockResolvedValue([mockInvoice]);

    const result = await getAllInvoices({ vendorId: 1 });

    expect(invoiceDB.getByVendor).toHaveBeenCalledWith(1);
    expect(result).toHaveLength(1);
  });

  it('should filter by status', async () => {
    invoiceDB.getByStatus.mockResolvedValue([mockInvoice]);

    const result = await getAllInvoices({ status: INVOICE_STATUS.PENDING });

    expect(invoiceDB.getByStatus).toHaveBeenCalledWith(INVOICE_STATUS.PENDING);
  });
});

// ============================================
// INVOICE STATS
// ============================================

describe('getInvoiceStats', () => {
  it('should calculate invoice statistics', async () => {
    const invoices = [
      { id: 1, status: INVOICE_STATUS.PENDING, paymentStatus: PAYMENT_STATUS.UNPAID, total: 100 },
      { id: 2, status: INVOICE_STATUS.EXTRACTED, paymentStatus: PAYMENT_STATUS.UNPAID, total: 200 },
      { id: 3, status: INVOICE_STATUS.APPROVED, paymentStatus: PAYMENT_STATUS.PAID, total: 150 }
    ];
    invoiceDB.getAll.mockResolvedValue(invoices);

    const stats = await getInvoiceStats();

    expect(stats.total).toBe(3);
    expect(stats.byStatus[INVOICE_STATUS.PENDING]).toBe(1);
    expect(stats.byStatus[INVOICE_STATUS.EXTRACTED]).toBe(1);
    expect(stats.byStatus[INVOICE_STATUS.APPROVED]).toBe(1);
    expect(stats.pendingCount).toBe(2); // pending + extracted
    expect(stats.pendingValue).toBe(300); // 100 + 200
  });

  it('should handle empty invoice list', async () => {
    invoiceDB.getAll.mockResolvedValue([]);

    const stats = await getInvoiceStats();

    expect(stats.total).toBe(0);
    expect(stats.pendingCount).toBe(0);
    expect(stats.pendingValue).toBe(0);
  });
});

// ============================================
// CONSTANTS
// ============================================

describe('Constants', () => {
  it('should export INVOICE_STATUS with all values', () => {
    expect(INVOICE_STATUS.DRAFT).toBe('draft');
    expect(INVOICE_STATUS.PENDING).toBe('pending');
    expect(INVOICE_STATUS.EXTRACTING).toBe('extracting');
    expect(INVOICE_STATUS.EXTRACTED).toBe('extracted');
    expect(INVOICE_STATUS.REVIEWED).toBe('reviewed');
    expect(INVOICE_STATUS.APPROVED).toBe('approved');
    expect(INVOICE_STATUS.SYNCED).toBe('synced');
    expect(INVOICE_STATUS.ERROR).toBe('error');
    expect(INVOICE_STATUS.CANCELLED).toBe('cancelled');
  });

  it('should export PAYMENT_STATUS with all values', () => {
    expect(PAYMENT_STATUS.UNPAID).toBe('unpaid');
    expect(PAYMENT_STATUS.PARTIAL).toBe('partial');
    expect(PAYMENT_STATUS.PAID).toBe('paid');
    expect(PAYMENT_STATUS.OVERDUE).toBe('overdue');
    expect(PAYMENT_STATUS.DISPUTED).toBe('disputed');
    expect(PAYMENT_STATUS.CANCELLED).toBe('cancelled');
  });

  it('should export VALID_STATUS_TRANSITIONS', () => {
    expect(VALID_STATUS_TRANSITIONS).toBeDefined();
    expect(VALID_STATUS_TRANSITIONS[INVOICE_STATUS.PENDING]).toContain(INVOICE_STATUS.EXTRACTING);
    expect(VALID_STATUS_TRANSITIONS[INVOICE_STATUS.SYNCED]).toEqual([]);
  });

  it('should export VALID_PAYMENT_TRANSITIONS', () => {
    expect(VALID_PAYMENT_TRANSITIONS).toBeDefined();
    expect(VALID_PAYMENT_TRANSITIONS[PAYMENT_STATUS.UNPAID]).toContain(PAYMENT_STATUS.PAID);
    expect(VALID_PAYMENT_TRANSITIONS[PAYMENT_STATUS.PAID]).toEqual([]);
  });
});
