/**
 * Unit Tests for purchaseOrderService.js
 *
 * Tests purchase order service business logic including:
 * - Order creation
 * - Order lines management
 * - Status transitions
 * - Receiving workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database modules before importing the service
vi.mock('../../database/indexedDB', () => ({
  purchaseOrderDB: {
    create: vi.fn(),
    getById: vi.fn(),
    getAll: vi.fn(),
    getByStatus: vi.fn(),
    getByVendor: vi.fn(),
    getByDateRange: vi.fn(),
    getAwaitingDelivery: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    generateOrderNumber: vi.fn(),
    isValidSendMethod: vi.fn(),
    submitForApproval: vi.fn(),
    approve: vi.fn(),
    markSent: vi.fn(),
    markPartiallyReceived: vi.fn(),
    markReceived: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    recordConfirmation: vi.fn(),
    recalculateTotals: vi.fn(),
    getSummary: vi.fn()
  },
  purchaseOrderLineDB: {
    create: vi.fn(),
    getById: vi.fn(),
    getByPurchaseOrder: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordReceive: vi.fn(),
    getReceivingStatus: vi.fn()
  },
  vendorDB: {
    getById: vi.fn()
  },
  inventoryItemDB: {
    getById: vi.fn(),
    getByVendor: vi.fn()
  },
  db: {
    transaction: vi.fn((mode, tables, callback) => callback()),
    purchaseOrders: {},
    purchaseOrderLines: {},
    inventoryItems: {},
    stockTransactions: {}
  },
  PO_STATUS: {
    DRAFT: 'draft',
    PENDING_APPROVAL: 'pending_approval',
    APPROVED: 'approved',
    SENT: 'sent',
    CONFIRMED: 'confirmed',
    PARTIALLY_RECEIVED: 'partially_received',
    RECEIVED: 'received',
    CANCELLED: 'cancelled',
    CLOSED: 'closed'
  },
  PO_SEND_METHOD: {
    EMAIL: 'email',
    FAX: 'fax',
    PHONE: 'phone',
    PORTAL: 'portal',
    IN_PERSON: 'in_person',
    OTHER: 'other'
  }
}));

// Mock stockService
vi.mock('../stockService', () => ({
  addStockFromInvoice: vi.fn()
}));

import {
  createOrder,
  updateOrder,
  deleteOrder,
  getOrder,
  getAllOrders,
  getDraftOrders,
  addLineToOrder,
  updateOrderLine,
  removeOrderLine,
  calculateOrderTotals,
  sendOrder,
  receiveOrder,
  cancelOrder,
  submitForApproval,
  approveOrder,
  confirmOrder,
  closeOrder,
  generateOrderNumber,
  isValidTransition,
  canEditOrder,
  canCancelOrder,
  canReceiveOrder,
  createOrderFromLowStock,
  getOrderStats,
  PO_STATUS,
  PO_SEND_METHOD,
  EDITABLE_STATUSES,
  CANCELLABLE_STATUSES,
  RECEIVABLE_STATUSES,
  VALID_STATUS_TRANSITIONS
} from '../purchaseOrderService';

import {
  purchaseOrderDB,
  purchaseOrderLineDB,
  vendorDB,
  inventoryItemDB,
  db
} from '../../database/indexedDB';

import { addStockFromInvoice } from '../stockService';

// ============================================
// Test Data
// ============================================

const mockVendor = {
  id: 1,
  name: 'Test Supplier Ltd',
  phone: '555-1234',
  email: 'orders@testsupplier.com'
};

const mockOrder = {
  id: 1,
  vendorId: 1,
  vendorName: 'Test Supplier Ltd',
  orderNumber: 'PO-2025-0001',
  status: PO_STATUS.DRAFT,
  subtotal: 100.00,
  taxGST: 5.00,
  taxQST: 9.975,
  total: 114.975,
  createdAt: '2025-01-01T10:00:00.000Z'
};

const mockItem = {
  id: 1,
  name: 'Test Item',
  sku: 'TEST-001',
  unit: 'kg',
  currentStock: 5,
  parLevel: 20,
  currentPrice: 10.00
};

const mockOrderLine = {
  id: 1,
  purchaseOrderId: 1,
  inventoryItemId: 1,
  inventoryItemName: 'Test Item',
  inventoryItemSku: 'TEST-001',
  quantity: 10,
  unit: 'kg',
  unitPrice: 10.00,
  totalPrice: 100.00,
  quantityReceived: 0
};

const mockOrderLines = [
  mockOrderLine,
  {
    id: 2,
    purchaseOrderId: 1,
    inventoryItemId: 2,
    inventoryItemName: 'Test Item 2',
    inventoryItemSku: 'TEST-002',
    quantity: 5,
    unit: 'ea',
    unitPrice: 20.00,
    totalPrice: 100.00,
    quantityReceived: 0
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
// CREATE ORDER
// ============================================

describe('createOrder', () => {
  it('should create order with valid vendor and return with order number', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    purchaseOrderDB.generateOrderNumber.mockResolvedValue('PO-2025-0001');
    purchaseOrderDB.create.mockResolvedValue({
      id: 1,
      vendorId: 1,
      vendorName: 'Test Supplier Ltd',
      orderNumber: 'PO-2025-0001',
      status: PO_STATUS.DRAFT
    });

    const result = await createOrder(1);

    expect(result).toBeDefined();
    expect(result.orderNumber).toBe('PO-2025-0001');
    expect(result.status).toBe(PO_STATUS.DRAFT);
    expect(vendorDB.getById).toHaveBeenCalledWith(1);
    expect(purchaseOrderDB.generateOrderNumber).toHaveBeenCalled();
    expect(purchaseOrderDB.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: 1,
        vendorName: 'Test Supplier Ltd',
        orderNumber: 'PO-2025-0001',
        status: PO_STATUS.DRAFT
      })
    );
  });

  it('should throw error for invalid vendor', async () => {
    vendorDB.getById.mockResolvedValue(null);

    await expect(createOrder(999)).rejects.toThrow('Vendor not found');

    expect(purchaseOrderDB.create).not.toHaveBeenCalled();
  });

  it('should denormalize vendor name from vendor record', async () => {
    vendorDB.getById.mockResolvedValue(mockVendor);
    purchaseOrderDB.generateOrderNumber.mockResolvedValue('PO-2025-0002');
    purchaseOrderDB.create.mockResolvedValue({
      id: 2,
      vendorId: 1,
      vendorName: 'Test Supplier Ltd',
      orderNumber: 'PO-2025-0002',
      status: PO_STATUS.DRAFT
    });

    await createOrder(1);

    expect(purchaseOrderDB.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorName: 'Test Supplier Ltd'
      })
    );
  });
});

describe('generateOrderNumber', () => {
  it('should return order number in format PO-YYYY-NNNN', async () => {
    purchaseOrderDB.generateOrderNumber.mockResolvedValue('PO-2025-0001');

    const result = await generateOrderNumber();

    expect(result).toBe('PO-2025-0001');
    expect(result).toMatch(/^PO-\d{4}-\d{4}$/);
  });

  it('should generate sequential numbers', async () => {
    purchaseOrderDB.generateOrderNumber
      .mockResolvedValueOnce('PO-2025-0001')
      .mockResolvedValueOnce('PO-2025-0002')
      .mockResolvedValueOnce('PO-2025-0003');

    const num1 = await generateOrderNumber();
    const num2 = await generateOrderNumber();
    const num3 = await generateOrderNumber();

    expect(num1).toBe('PO-2025-0001');
    expect(num2).toBe('PO-2025-0002');
    expect(num3).toBe('PO-2025-0003');

    // Extract sequence numbers and verify they increment
    const seq1 = parseInt(num1.split('-')[2]);
    const seq2 = parseInt(num2.split('-')[2]);
    const seq3 = parseInt(num3.split('-')[2]);

    expect(seq2).toBe(seq1 + 1);
    expect(seq3).toBe(seq2 + 1);
  });

  it('should have unique order numbers', async () => {
    const numbers = new Set();
    purchaseOrderDB.generateOrderNumber
      .mockResolvedValueOnce('PO-2025-0001')
      .mockResolvedValueOnce('PO-2025-0002')
      .mockResolvedValueOnce('PO-2025-0003');

    for (let i = 0; i < 3; i++) {
      const num = await generateOrderNumber();
      expect(numbers.has(num)).toBe(false);
      numbers.add(num);
    }

    expect(numbers.size).toBe(3);
  });
});

// ============================================
// ORDER LINES
// ============================================

describe('addLineToOrder', () => {
  it('should add line to draft order successfully', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.DRAFT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.DRAFT });
    inventoryItemDB.getById
      .mockResolvedValueOnce(mockItem)
      .mockResolvedValueOnce(mockItem);
    purchaseOrderLineDB.create.mockResolvedValue(mockOrderLine);
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([mockOrderLine]);

    const result = await addLineToOrder(1, 1, 10);

    expect(result).toBeDefined();
    expect(purchaseOrderLineDB.create).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseOrderId: 1,
        inventoryItemId: 1,
        quantity: 10,
        inventoryItemName: 'Test Item'
      })
    );
  });

  it('should throw error when adding line to sent order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });

    await expect(addLineToOrder(1, 1, 10))
      .rejects.toThrow('Can only add lines to draft orders');

    expect(purchaseOrderLineDB.create).not.toHaveBeenCalled();
  });

  it('should throw error when adding line to received order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });

    await expect(addLineToOrder(1, 1, 10))
      .rejects.toThrow('Can only add lines to draft orders');
  });

  it('should throw error when inventory item not found', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    inventoryItemDB.getById.mockResolvedValue(null);

    await expect(addLineToOrder(1, 999, 10))
      .rejects.toThrow('Inventory item not found');
  });

  it('should use item current price as default unit price', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.DRAFT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.DRAFT });
    inventoryItemDB.getById
      .mockResolvedValueOnce({ ...mockItem, currentPrice: 15.50 })
      .mockResolvedValueOnce({ ...mockItem, currentPrice: 15.50 });
    purchaseOrderLineDB.create.mockResolvedValue(mockOrderLine);
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([mockOrderLine]);

    await addLineToOrder(1, 1, 10);

    expect(purchaseOrderLineDB.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPrice: 15.50
      })
    );
  });
});

describe('updateOrderLine', () => {
  it('should update line on draft order successfully', async () => {
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderLineDB.update.mockResolvedValue({ ...mockOrderLine, quantity: 20 });

    const result = await updateOrderLine(1, { quantity: 20 });

    expect(purchaseOrderLineDB.update).toHaveBeenCalledWith(1, { quantity: 20 });
  });

  it('should throw error when updating line on sent order', async () => {
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });

    await expect(updateOrderLine(1, { quantity: 20 }))
      .rejects.toThrow('Can only update lines on draft orders');
  });

  it('should throw error when line not found', async () => {
    purchaseOrderLineDB.getById.mockResolvedValue(null);

    await expect(updateOrderLine(999, { quantity: 20 }))
      .rejects.toThrow('Order line not found');
  });
});

describe('removeOrderLine', () => {
  it('should remove line from draft order successfully', async () => {
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderLineDB.delete.mockResolvedValue(true);

    const result = await removeOrderLine(1);

    expect(result).toEqual({ deleted: true });
    expect(purchaseOrderLineDB.delete).toHaveBeenCalledWith(1);
  });

  it('should throw error when removing line from sent order', async () => {
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });

    await expect(removeOrderLine(1))
      .rejects.toThrow('Can only remove lines from draft orders');

    expect(purchaseOrderLineDB.delete).not.toHaveBeenCalled();
  });
});

describe('calculateOrderTotals', () => {
  it('should recalculate totals correctly', async () => {
    purchaseOrderDB.recalculateTotals.mockResolvedValue({
      id: 1,
      subtotal: 200.00,
      taxGST: 10.00,
      taxQST: 19.95,
      total: 229.95
    });

    const result = await calculateOrderTotals(1);

    expect(result.subtotal).toBe(200.00);
    expect(result.taxGST).toBe(10.00);
    expect(result.taxQST).toBe(19.95);
    expect(result.total).toBe(229.95);
    expect(purchaseOrderDB.recalculateTotals).toHaveBeenCalledWith(1);
  });
});

// ============================================
// STATUS TRANSITIONS
// ============================================

describe('isValidTransition', () => {
  it('should allow draft → sent transition', () => {
    expect(isValidTransition(PO_STATUS.DRAFT, PO_STATUS.SENT)).toBe(true);
  });

  it('should allow sent → received transition', () => {
    expect(isValidTransition(PO_STATUS.SENT, PO_STATUS.RECEIVED)).toBe(true);
  });

  it('should allow sent → cancelled transition', () => {
    expect(isValidTransition(PO_STATUS.SENT, PO_STATUS.CANCELLED)).toBe(true);
  });

  it('should allow sent → partially_received transition', () => {
    expect(isValidTransition(PO_STATUS.SENT, PO_STATUS.PARTIALLY_RECEIVED)).toBe(true);
  });

  it('should allow partially_received → received transition', () => {
    expect(isValidTransition(PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.RECEIVED)).toBe(true);
  });

  it('should NOT allow received → draft transition', () => {
    expect(isValidTransition(PO_STATUS.RECEIVED, PO_STATUS.DRAFT)).toBe(false);
  });

  it('should NOT allow cancelled → draft transition', () => {
    expect(isValidTransition(PO_STATUS.CANCELLED, PO_STATUS.DRAFT)).toBe(false);
  });

  it('should NOT allow closed → any transition', () => {
    expect(isValidTransition(PO_STATUS.CLOSED, PO_STATUS.DRAFT)).toBe(false);
    expect(isValidTransition(PO_STATUS.CLOSED, PO_STATUS.SENT)).toBe(false);
    expect(isValidTransition(PO_STATUS.CLOSED, PO_STATUS.RECEIVED)).toBe(false);
  });

  it('should allow received → closed transition', () => {
    expect(isValidTransition(PO_STATUS.RECEIVED, PO_STATUS.CLOSED)).toBe(true);
  });
});

describe('canEditOrder', () => {
  it('should return true for draft orders', () => {
    expect(canEditOrder(PO_STATUS.DRAFT)).toBe(true);
  });

  it('should return false for sent orders', () => {
    expect(canEditOrder(PO_STATUS.SENT)).toBe(false);
  });

  it('should return false for received orders', () => {
    expect(canEditOrder(PO_STATUS.RECEIVED)).toBe(false);
  });
});

describe('canCancelOrder', () => {
  it('should return true for draft orders', () => {
    expect(canCancelOrder(PO_STATUS.DRAFT)).toBe(true);
  });

  it('should return true for sent orders', () => {
    expect(canCancelOrder(PO_STATUS.SENT)).toBe(true);
  });

  it('should return false for received orders', () => {
    expect(canCancelOrder(PO_STATUS.RECEIVED)).toBe(false);
  });

  it('should return false for closed orders', () => {
    expect(canCancelOrder(PO_STATUS.CLOSED)).toBe(false);
  });
});

describe('canReceiveOrder', () => {
  it('should return true for sent orders', () => {
    expect(canReceiveOrder(PO_STATUS.SENT)).toBe(true);
  });

  it('should return true for confirmed orders', () => {
    expect(canReceiveOrder(PO_STATUS.CONFIRMED)).toBe(true);
  });

  it('should return true for partially_received orders', () => {
    expect(canReceiveOrder(PO_STATUS.PARTIALLY_RECEIVED)).toBe(true);
  });

  it('should return false for draft orders', () => {
    expect(canReceiveOrder(PO_STATUS.DRAFT)).toBe(false);
  });

  it('should return false for received orders', () => {
    expect(canReceiveOrder(PO_STATUS.RECEIVED)).toBe(false);
  });
});

describe('sendOrder', () => {
  it('should send draft order successfully', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderDB.isValidSendMethod.mockReturnValue(true);
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue(mockOrderLines);
    purchaseOrderDB.markSent.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });

    const result = await sendOrder(1, 'email');

    expect(result.status).toBe(PO_STATUS.SENT);
    expect(purchaseOrderDB.markSent).toHaveBeenCalledWith(1, 'email', undefined);
  });

  it('should throw error for order with no lines', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderDB.isValidSendMethod.mockReturnValue(true);
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([]);

    await expect(sendOrder(1, 'email'))
      .rejects.toThrow('Cannot send order with no line items');
  });

  it('should throw error for invalid send method', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderDB.isValidSendMethod.mockReturnValue(false);

    await expect(sendOrder(1, 'invalid_method'))
      .rejects.toThrow('Invalid send method');
  });

  it('should throw error for already received order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });

    await expect(sendOrder(1, 'email'))
      .rejects.toThrow('Only draft or approved orders can be sent');
  });
});

describe('cancelOrder', () => {
  it('should cancel draft order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderDB.cancel.mockResolvedValue({ ...mockOrder, status: PO_STATUS.CANCELLED });

    const result = await cancelOrder(1, 'No longer needed');

    expect(result.status).toBe(PO_STATUS.CANCELLED);
    expect(purchaseOrderDB.cancel).toHaveBeenCalledWith(1, 'No longer needed');
  });

  it('should cancel sent order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });
    purchaseOrderDB.cancel.mockResolvedValue({ ...mockOrder, status: PO_STATUS.CANCELLED });

    const result = await cancelOrder(1);

    expect(result.status).toBe(PO_STATUS.CANCELLED);
  });

  it('should throw error for received order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });

    await expect(cancelOrder(1))
      .rejects.toThrow('Cannot cancel order with status "received"');
  });

  it('should throw error for closed order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.CLOSED });

    await expect(cancelOrder(1))
      .rejects.toThrow('Cannot cancel order with status "closed"');
  });
});

// ============================================
// RECEIVE ORDER
// ============================================

describe('receiveOrder', () => {
  it('should mark order as received on full receipt', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderLineDB.recordReceive.mockResolvedValue(true);
    purchaseOrderLineDB.getReceivingStatus.mockResolvedValue({
      isComplete: true,
      received: 1,
      partial: 0,
      pending: 0
    });
    purchaseOrderDB.markReceived.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([
      { ...mockOrderLine, quantityReceived: 10 }
    ]);
    inventoryItemDB.getById.mockResolvedValue(mockItem);
    addStockFromInvoice.mockResolvedValue({
      previousStock: 5,
      newStock: 15
    });

    const result = await receiveOrder(1, [
      { lineId: 1, quantityReceived: 10 }
    ]);

    expect(purchaseOrderDB.markReceived).toHaveBeenCalledWith(1);
    expect(result.receivingStatus.isComplete).toBe(true);
  });

  it('should mark order as partially_received on partial receipt', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.PARTIALLY_RECEIVED });
    purchaseOrderLineDB.getById.mockResolvedValue(mockOrderLine);
    purchaseOrderLineDB.recordReceive.mockResolvedValue(true);
    purchaseOrderLineDB.getReceivingStatus.mockResolvedValue({
      isComplete: false,
      received: 0,
      partial: 1,
      pending: 1
    });
    purchaseOrderDB.markPartiallyReceived.mockResolvedValue({
      ...mockOrder,
      status: PO_STATUS.PARTIALLY_RECEIVED
    });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([
      { ...mockOrderLine, quantityReceived: 5 }
    ]);
    inventoryItemDB.getById.mockResolvedValue(mockItem);
    addStockFromInvoice.mockResolvedValue({
      previousStock: 5,
      newStock: 10
    });

    const result = await receiveOrder(1, [
      { lineId: 1, quantityReceived: 5 }
    ]);

    expect(purchaseOrderDB.markPartiallyReceived).toHaveBeenCalledWith(1);
    expect(result.receivingStatus.isComplete).toBe(false);
    expect(result.receivingStatus.partial).toBe(1);
  });

  it('should update inventory when receiving items', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getById.mockResolvedValue({
      ...mockOrderLine,
      inventoryItemId: 1,
      unitPrice: 10.00
    });
    purchaseOrderLineDB.recordReceive.mockResolvedValue(true);
    purchaseOrderLineDB.getReceivingStatus.mockResolvedValue({
      isComplete: true,
      received: 1,
      partial: 0,
      pending: 0
    });
    purchaseOrderDB.markReceived.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([mockOrderLine]);
    inventoryItemDB.getById.mockResolvedValue(mockItem);
    addStockFromInvoice.mockResolvedValue({
      previousStock: 5,
      newStock: 15
    });

    const result = await receiveOrder(1, [
      { lineId: 1, quantityReceived: 10 }
    ], { receivedBy: 'user123' });

    expect(addStockFromInvoice).toHaveBeenCalledWith(
      1, // inventoryItemId
      10, // quantity
      null, // invoiceId
      expect.objectContaining({
        purchaseOrderId: 1,
        purchaseOrderLineId: 1,
        unitCost: 10.00,
        createdBy: 'user123'
      })
    );

    expect(result.inventoryUpdates).toHaveLength(1);
    expect(result.inventoryUpdates[0]).toEqual({
      lineId: 1,
      inventoryItemId: 1,
      itemName: 'Test Item',
      quantityReceived: 10,
      previousStock: 5,
      newStock: 15
    });
  });

  it('should create stock transactions when receiving', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getById.mockResolvedValue({
      ...mockOrderLine,
      inventoryItemId: 1
    });
    purchaseOrderLineDB.recordReceive.mockResolvedValue(true);
    purchaseOrderLineDB.getReceivingStatus.mockResolvedValue({
      isComplete: true,
      received: 1,
      partial: 0,
      pending: 0
    });
    purchaseOrderDB.markReceived.mockResolvedValue({ ...mockOrder, status: PO_STATUS.RECEIVED });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([mockOrderLine]);
    inventoryItemDB.getById.mockResolvedValue(mockItem);
    addStockFromInvoice.mockResolvedValue({
      previousStock: 5,
      newStock: 15,
      transactionId: 123
    });

    await receiveOrder(1, [{ lineId: 1, quantityReceived: 10 }]);

    // Verify addStockFromInvoice was called which creates the transaction
    expect(addStockFromInvoice).toHaveBeenCalled();
  });

  it('should throw error for order not in receivable state', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });

    await expect(receiveOrder(1, [{ lineId: 1, quantityReceived: 10 }]))
      .rejects.toThrow('Cannot receive items for order with status "draft"');
  });

  it('should throw error for order not found', async () => {
    purchaseOrderDB.getById.mockResolvedValue(null);

    await expect(receiveOrder(999, [{ lineId: 1, quantityReceived: 10 }]))
      .rejects.toThrow('Purchase order not found');
  });

  it('should skip zero quantity received', async () => {
    purchaseOrderDB.getById
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT })
      .mockResolvedValueOnce({ ...mockOrder, status: PO_STATUS.SENT });
    purchaseOrderLineDB.getReceivingStatus.mockResolvedValue({
      isComplete: false,
      received: 0,
      partial: 0,
      pending: 1
    });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([mockOrderLine]);
    inventoryItemDB.getById.mockResolvedValue(mockItem);

    await receiveOrder(1, [{ lineId: 1, quantityReceived: 0 }]);

    expect(purchaseOrderLineDB.recordReceive).not.toHaveBeenCalled();
    expect(addStockFromInvoice).not.toHaveBeenCalled();
  });
});

// ============================================
// OTHER OPERATIONS
// ============================================

describe('getOrder', () => {
  it('should return order with lines', async () => {
    purchaseOrderDB.getById.mockResolvedValue(mockOrder);
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue(mockOrderLines);
    inventoryItemDB.getById.mockResolvedValue(mockItem);

    const result = await getOrder(1);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.lines).toHaveLength(2);
  });

  it('should return null for order not found', async () => {
    purchaseOrderDB.getById.mockResolvedValue(null);

    const result = await getOrder(999);

    expect(result).toBeNull();
  });
});

describe('deleteOrder', () => {
  it('should delete draft order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderDB.delete.mockResolvedValue(true);

    const result = await deleteOrder(1);

    expect(result).toEqual({ deleted: true });
    expect(purchaseOrderDB.delete).toHaveBeenCalledWith(1);
  });

  it('should throw error for non-draft order', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.SENT });

    await expect(deleteOrder(1))
      .rejects.toThrow('Only draft orders can be deleted');
  });
});

describe('submitForApproval', () => {
  it('should submit order with lines for approval', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue(mockOrderLines);
    purchaseOrderDB.submitForApproval.mockResolvedValue({
      ...mockOrder,
      status: PO_STATUS.PENDING_APPROVAL
    });

    const result = await submitForApproval(1);

    expect(result.status).toBe(PO_STATUS.PENDING_APPROVAL);
  });

  it('should throw error for order with no lines', async () => {
    purchaseOrderDB.getById.mockResolvedValue({ ...mockOrder, status: PO_STATUS.DRAFT });
    purchaseOrderLineDB.getByPurchaseOrder.mockResolvedValue([]);

    await expect(submitForApproval(1))
      .rejects.toThrow('Cannot submit order with no line items');
  });
});

// ============================================
// CONSTANTS
// ============================================

describe('Constants', () => {
  it('should export PO_STATUS with all values', () => {
    expect(PO_STATUS.DRAFT).toBe('draft');
    expect(PO_STATUS.PENDING_APPROVAL).toBe('pending_approval');
    expect(PO_STATUS.APPROVED).toBe('approved');
    expect(PO_STATUS.SENT).toBe('sent');
    expect(PO_STATUS.CONFIRMED).toBe('confirmed');
    expect(PO_STATUS.PARTIALLY_RECEIVED).toBe('partially_received');
    expect(PO_STATUS.RECEIVED).toBe('received');
    expect(PO_STATUS.CANCELLED).toBe('cancelled');
    expect(PO_STATUS.CLOSED).toBe('closed');
  });

  it('should export PO_SEND_METHOD with all values', () => {
    expect(PO_SEND_METHOD.EMAIL).toBe('email');
    expect(PO_SEND_METHOD.FAX).toBe('fax');
    expect(PO_SEND_METHOD.PHONE).toBe('phone');
    expect(PO_SEND_METHOD.PORTAL).toBe('portal');
    expect(PO_SEND_METHOD.IN_PERSON).toBe('in_person');
    expect(PO_SEND_METHOD.OTHER).toBe('other');
  });

  it('should export EDITABLE_STATUSES correctly', () => {
    expect(EDITABLE_STATUSES).toContain(PO_STATUS.DRAFT);
    expect(EDITABLE_STATUSES).not.toContain(PO_STATUS.SENT);
  });

  it('should export CANCELLABLE_STATUSES correctly', () => {
    expect(CANCELLABLE_STATUSES).toContain(PO_STATUS.DRAFT);
    expect(CANCELLABLE_STATUSES).toContain(PO_STATUS.SENT);
    expect(CANCELLABLE_STATUSES).not.toContain(PO_STATUS.RECEIVED);
    expect(CANCELLABLE_STATUSES).not.toContain(PO_STATUS.CLOSED);
  });

  it('should export RECEIVABLE_STATUSES correctly', () => {
    expect(RECEIVABLE_STATUSES).toContain(PO_STATUS.SENT);
    expect(RECEIVABLE_STATUSES).toContain(PO_STATUS.CONFIRMED);
    expect(RECEIVABLE_STATUSES).toContain(PO_STATUS.PARTIALLY_RECEIVED);
    expect(RECEIVABLE_STATUSES).not.toContain(PO_STATUS.DRAFT);
  });

  it('should export VALID_STATUS_TRANSITIONS', () => {
    expect(VALID_STATUS_TRANSITIONS).toBeDefined();
    expect(VALID_STATUS_TRANSITIONS[PO_STATUS.DRAFT]).toContain(PO_STATUS.SENT);
    expect(VALID_STATUS_TRANSITIONS[PO_STATUS.RECEIVED]).toContain(PO_STATUS.CLOSED);
    expect(VALID_STATUS_TRANSITIONS[PO_STATUS.CLOSED]).toEqual([]);
    expect(VALID_STATUS_TRANSITIONS[PO_STATUS.CANCELLED]).toEqual([]);
  });
});
