/**
 * E2E Test: Invoice Upload Flow
 *
 * Tests the complete invoice processing workflow:
 * 1. User uploads invoice image/PDF
 * 2. AI extracts invoice data
 * 3. Line items are matched to inventory items
 * 4. Invoice is saved to database
 * 5. Inventory stock levels are updated
 * 6. Invoice appears in accounting dashboard
 *
 * This simulates the full journey from upload to inventory update.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// Mock State (Simulates Firebase + IndexedDB)
// ============================================

const appState = {
  // Auth state
  auth: {
    currentUser: { uid: 'test-user-123', email: 'owner@restaurant.com' },
    isAuthenticated: true
  },
  // Database state
  database: {
    vendors: [
      { id: 1, name: 'Sysco Foods', vendorCode: 'SYSCO', isActive: true },
      { id: 2, name: 'US Foods', vendorCode: 'USF', isActive: true },
      { id: 3, name: 'In-House Production', vendorCode: 'INTERNAL', isInternal: true, isActive: true }
    ],
    inventoryItems: [
      { id: 1, name: 'Chicken Breast', vendorId: 1, vendorCode: 'SYSCO', stockOnHand: 50, unit: 'lb', unitCost: 3.50 },
      { id: 2, name: 'Ground Beef', vendorId: 1, vendorCode: 'SYSCO', stockOnHand: 30, unit: 'lb', unitCost: 4.25 },
      { id: 3, name: 'Salmon Fillet', vendorId: 2, vendorCode: 'USF', stockOnHand: 20, unit: 'lb', unitCost: 12.00 },
      { id: 4, name: 'Olive Oil', vendorId: 1, vendorCode: 'SYSCO', stockOnHand: 10, unit: 'gal', unitCost: 25.00 }
    ],
    invoices: [],
    invoiceLineItems: [],
    stockTransactions: []
  },
  // Processing state
  processing: {
    currentInvoice: null,
    extractedData: null,
    matchedLines: [],
    status: 'idle'
  }
};

function resetAppState() {
  appState.database.invoices = [];
  appState.database.invoiceLineItems = [];
  appState.database.stockTransactions = [];
  appState.processing = {
    currentInvoice: null,
    extractedData: null,
    matchedLines: [],
    status: 'idle'
  };
  // Reset inventory to initial values
  appState.database.inventoryItems[0].stockOnHand = 50;
  appState.database.inventoryItems[1].stockOnHand = 30;
  appState.database.inventoryItems[2].stockOnHand = 20;
  appState.database.inventoryItems[3].stockOnHand = 10;
}

// ============================================
// Invoice Processing Service
// ============================================

const InvoiceProcessingService = {
  async uploadInvoice(file) {
    // Simulate file upload
    if (!file || !file.name) {
      throw new Error('No file provided');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type. Use JPEG, PNG, or PDF.');
    }

    appState.processing.status = 'uploading';
    appState.processing.currentInvoice = {
      fileName: file.name,
      fileType: file.type,
      uploadedAt: new Date().toISOString()
    };

    return { success: true, fileName: file.name };
  },

  async extractWithAI() {
    // Simulate AI extraction (Claude API)
    appState.processing.status = 'extracting';

    // Simulated extraction result
    const extractedData = {
      vendorName: 'Sysco Foods',
      invoiceNumber: 'INV-2024-1234',
      invoiceDate: '2024-01-15',
      dueDate: '2024-02-15',
      subtotal: 245.00,
      tax: 19.60,
      total: 264.60,
      lineItems: [
        { description: 'Chicken Breast 10lb case', quantity: 2, unitPrice: 35.00, total: 70.00 },
        { description: 'Ground Beef 80/20 5lb', quantity: 3, unitPrice: 21.25, total: 63.75 },
        { description: 'Extra Virgin Olive Oil 1gal', quantity: 2, unitPrice: 25.00, total: 50.00 },
        { description: 'Paper Towels (not inventory)', quantity: 1, unitPrice: 15.00, total: 15.00 }
      ]
    };

    appState.processing.extractedData = extractedData;
    appState.processing.status = 'extracted';

    return extractedData;
  },

  async matchLineItems() {
    // Match extracted line items to inventory items
    appState.processing.status = 'matching';

    const extractedLines = appState.processing.extractedData.lineItems;
    const matchedLines = [];

    for (const line of extractedLines) {
      // Simple matching logic (in real app, this uses fuzzy matching)
      let matchedItem = null;
      let confidence = 0;

      if (line.description.toLowerCase().includes('chicken')) {
        matchedItem = appState.database.inventoryItems.find(i => i.name === 'Chicken Breast');
        confidence = 0.95;
      } else if (line.description.toLowerCase().includes('beef')) {
        matchedItem = appState.database.inventoryItems.find(i => i.name === 'Ground Beef');
        confidence = 0.92;
      } else if (line.description.toLowerCase().includes('olive oil')) {
        matchedItem = appState.database.inventoryItems.find(i => i.name === 'Olive Oil');
        confidence = 0.88;
      }

      matchedLines.push({
        ...line,
        matchedInventoryItemId: matchedItem?.id || null,
        matchedInventoryItemName: matchedItem?.name || null,
        matchConfidence: confidence,
        convertedQuantity: matchedItem ? line.quantity * (line.description.includes('10lb') ? 10 : 5) : 0
      });
    }

    appState.processing.matchedLines = matchedLines;
    appState.processing.status = 'matched';

    return matchedLines;
  },

  async confirmAndSaveInvoice(adjustedLines = null) {
    // Save invoice to database
    appState.processing.status = 'saving';

    const linesToSave = adjustedLines || appState.processing.matchedLines;
    const extractedData = appState.processing.extractedData;

    // Find or create vendor
    const vendor = appState.database.vendors.find(
      v => v.name.toLowerCase() === extractedData.vendorName.toLowerCase()
    );

    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Create invoice
    const invoiceId = appState.database.invoices.length + 1;
    const invoice = {
      id: invoiceId,
      vendorId: vendor.id,
      vendorName: vendor.name,
      invoiceNumber: extractedData.invoiceNumber,
      invoiceDate: extractedData.invoiceDate,
      dueDate: extractedData.dueDate,
      subtotal: extractedData.subtotal,
      tax: extractedData.tax,
      total: extractedData.total,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    appState.database.invoices.push(invoice);

    // Create line items
    for (const line of linesToSave) {
      const lineItem = {
        id: appState.database.invoiceLineItems.length + 1,
        invoiceId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.total,
        inventoryItemId: line.matchedInventoryItemId,
        inventoryItemName: line.matchedInventoryItemName,
        convertedQuantity: line.convertedQuantity
      };
      appState.database.invoiceLineItems.push(lineItem);
    }

    appState.processing.status = 'saved';
    return invoice;
  },

  async receiveInventory(invoiceId) {
    // Update inventory stock levels
    const invoice = appState.database.invoices.find(i => i.id === invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const lineItems = appState.database.invoiceLineItems.filter(l => l.invoiceId === invoiceId);

    for (const line of lineItems) {
      if (line.inventoryItemId && line.convertedQuantity > 0) {
        // Find inventory item
        const item = appState.database.inventoryItems.find(i => i.id === line.inventoryItemId);
        if (item) {
          // Update stock
          const previousStock = item.stockOnHand;
          item.stockOnHand += line.convertedQuantity;

          // Create stock transaction
          appState.database.stockTransactions.push({
            id: appState.database.stockTransactions.length + 1,
            inventoryItemId: item.id,
            type: 'receipt',
            quantity: line.convertedQuantity,
            previousStock,
            newStock: item.stockOnHand,
            reference: `Invoice #${invoice.invoiceNumber}`,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Mark invoice as received
    invoice.status = 'received';
    invoice.receivedAt = new Date().toISOString();

    return invoice;
  }
};

// ============================================
// Accounting Dashboard Service
// ============================================

const AccountingDashboardService = {
  getInvoices(filters = {}) {
    let invoices = [...appState.database.invoices];

    if (filters.status) {
      invoices = invoices.filter(i => i.status === filters.status);
    }
    if (filters.vendorId) {
      invoices = invoices.filter(i => i.vendorId === filters.vendorId);
    }

    return invoices;
  },

  getInvoiceWithLines(invoiceId) {
    const invoice = appState.database.invoices.find(i => i.id === invoiceId);
    if (!invoice) return null;

    const lineItems = appState.database.invoiceLineItems.filter(l => l.invoiceId === invoiceId);
    return { ...invoice, lineItems };
  },

  getTotalsByVendor() {
    const totals = {};
    for (const invoice of appState.database.invoices) {
      if (!totals[invoice.vendorId]) {
        totals[invoice.vendorId] = {
          vendorName: invoice.vendorName,
          totalAmount: 0,
          invoiceCount: 0
        };
      }
      totals[invoice.vendorId].totalAmount += invoice.total;
      totals[invoice.vendorId].invoiceCount++;
    }
    return totals;
  }
};

// ============================================
// Tests
// ============================================

describe('Invoice Upload Flow', () => {
  beforeEach(() => {
    resetAppState();
  });

  describe('File Upload', () => {
    it('should accept valid image file', async () => {
      const file = { name: 'invoice.jpg', type: 'image/jpeg' };
      const result = await InvoiceProcessingService.uploadInvoice(file);

      expect(result.success).toBe(true);
      expect(appState.processing.currentInvoice.fileName).toBe('invoice.jpg');
    });

    it('should accept valid PDF file', async () => {
      const file = { name: 'invoice.pdf', type: 'application/pdf' };
      const result = await InvoiceProcessingService.uploadInvoice(file);

      expect(result.success).toBe(true);
      expect(appState.processing.currentInvoice.fileType).toBe('application/pdf');
    });

    it('should reject invalid file types', async () => {
      const file = { name: 'document.docx', type: 'application/msword' };

      await expect(
        InvoiceProcessingService.uploadInvoice(file)
      ).rejects.toThrow('Invalid file type');
    });

    it('should reject empty upload', async () => {
      await expect(
        InvoiceProcessingService.uploadInvoice(null)
      ).rejects.toThrow('No file provided');
    });
  });

  describe('AI Extraction', () => {
    it('should extract invoice data', async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      const extracted = await InvoiceProcessingService.extractWithAI();

      expect(extracted.vendorName).toBe('Sysco Foods');
      expect(extracted.invoiceNumber).toBe('INV-2024-1234');
      expect(extracted.total).toBe(264.60);
      expect(extracted.lineItems).toHaveLength(4);
    });

    it('should extract line item details', async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      const extracted = await InvoiceProcessingService.extractWithAI();

      const firstLine = extracted.lineItems[0];
      expect(firstLine.description).toContain('Chicken');
      expect(firstLine.quantity).toBe(2);
      expect(firstLine.unitPrice).toBe(35.00);
      expect(firstLine.total).toBe(70.00);
    });
  });

  describe('Line Item Matching', () => {
    beforeEach(async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      await InvoiceProcessingService.extractWithAI();
    });

    it('should match line items to inventory', async () => {
      const matched = await InvoiceProcessingService.matchLineItems();

      expect(matched).toHaveLength(4);

      // Chicken should match
      const chickenLine = matched.find(l => l.description.includes('Chicken'));
      expect(chickenLine.matchedInventoryItemName).toBe('Chicken Breast');
      expect(chickenLine.matchConfidence).toBeGreaterThan(0.9);
    });

    it('should calculate converted quantities', async () => {
      const matched = await InvoiceProcessingService.matchLineItems();

      // 2 cases × 10lb = 20lb
      const chickenLine = matched.find(l => l.description.includes('Chicken'));
      expect(chickenLine.convertedQuantity).toBe(20);

      // 3 packs × 5lb = 15lb
      const beefLine = matched.find(l => l.description.includes('Beef'));
      expect(beefLine.convertedQuantity).toBe(15);
    });

    it('should not match non-inventory items', async () => {
      const matched = await InvoiceProcessingService.matchLineItems();

      const paperTowels = matched.find(l => l.description.includes('Paper'));
      expect(paperTowels.matchedInventoryItemId).toBeNull();
      expect(paperTowels.convertedQuantity).toBe(0);
    });
  });

  describe('Invoice Saving', () => {
    beforeEach(async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      await InvoiceProcessingService.extractWithAI();
      await InvoiceProcessingService.matchLineItems();
    });

    it('should save invoice to database', async () => {
      const invoice = await InvoiceProcessingService.confirmAndSaveInvoice();

      expect(invoice.id).toBe(1);
      expect(invoice.vendorName).toBe('Sysco Foods');
      expect(invoice.invoiceNumber).toBe('INV-2024-1234');
      expect(invoice.status).toBe('pending');
    });

    it('should save line items linked to invoice', async () => {
      const invoice = await InvoiceProcessingService.confirmAndSaveInvoice();

      const lineItems = appState.database.invoiceLineItems.filter(
        l => l.invoiceId === invoice.id
      );
      expect(lineItems).toHaveLength(4);
    });

    it('should link matched items to inventory', async () => {
      await InvoiceProcessingService.confirmAndSaveInvoice();

      const chickenLine = appState.database.invoiceLineItems.find(
        l => l.description.includes('Chicken')
      );
      expect(chickenLine.inventoryItemId).toBe(1);
      expect(chickenLine.inventoryItemName).toBe('Chicken Breast');
    });
  });

  describe('Inventory Receipt', () => {
    let invoiceId;

    beforeEach(async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      await InvoiceProcessingService.extractWithAI();
      await InvoiceProcessingService.matchLineItems();
      const invoice = await InvoiceProcessingService.confirmAndSaveInvoice();
      invoiceId = invoice.id;
    });

    it('should update inventory stock levels', async () => {
      const chickenBefore = appState.database.inventoryItems[0].stockOnHand;
      const beefBefore = appState.database.inventoryItems[1].stockOnHand;

      await InvoiceProcessingService.receiveInventory(invoiceId);

      const chickenAfter = appState.database.inventoryItems[0].stockOnHand;
      const beefAfter = appState.database.inventoryItems[1].stockOnHand;

      expect(chickenAfter).toBe(chickenBefore + 20); // 2 × 10lb
      expect(beefAfter).toBe(beefBefore + 15); // 3 × 5lb
    });

    it('should create stock transactions', async () => {
      await InvoiceProcessingService.receiveInventory(invoiceId);

      const transactions = appState.database.stockTransactions;
      expect(transactions.length).toBeGreaterThan(0);

      const chickenTransaction = transactions.find(t => t.inventoryItemId === 1);
      expect(chickenTransaction.type).toBe('receipt');
      expect(chickenTransaction.quantity).toBe(20);
      expect(chickenTransaction.reference).toContain('INV-2024-1234');
    });

    it('should mark invoice as received', async () => {
      await InvoiceProcessingService.receiveInventory(invoiceId);

      const invoice = appState.database.invoices.find(i => i.id === invoiceId);
      expect(invoice.status).toBe('received');
      expect(invoice.receivedAt).toBeDefined();
    });
  });

  describe('Accounting Dashboard', () => {
    beforeEach(async () => {
      // Create and receive an invoice
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      await InvoiceProcessingService.extractWithAI();
      await InvoiceProcessingService.matchLineItems();
      await InvoiceProcessingService.confirmAndSaveInvoice();
    });

    it('should show invoice in dashboard', () => {
      const invoices = AccountingDashboardService.getInvoices();

      expect(invoices).toHaveLength(1);
      expect(invoices[0].vendorName).toBe('Sysco Foods');
    });

    it('should filter invoices by status', async () => {
      const pendingInvoices = AccountingDashboardService.getInvoices({ status: 'pending' });
      expect(pendingInvoices).toHaveLength(1);

      await InvoiceProcessingService.receiveInventory(1);

      const receivedInvoices = AccountingDashboardService.getInvoices({ status: 'received' });
      expect(receivedInvoices).toHaveLength(1);
    });

    it('should get invoice with line items', () => {
      const invoiceWithLines = AccountingDashboardService.getInvoiceWithLines(1);

      expect(invoiceWithLines.invoiceNumber).toBe('INV-2024-1234');
      expect(invoiceWithLines.lineItems).toHaveLength(4);
    });

    it('should calculate totals by vendor', () => {
      const totals = AccountingDashboardService.getTotalsByVendor();

      expect(totals[1]).toBeDefined();
      expect(totals[1].vendorName).toBe('Sysco Foods');
      expect(totals[1].totalAmount).toBe(264.60);
      expect(totals[1].invoiceCount).toBe(1);
    });
  });

  describe('Complete Invoice Flow', () => {
    it('should complete full invoice processing journey', async () => {
      // Step 1: Initial state
      expect(appState.database.invoices).toHaveLength(0);
      const initialChickenStock = appState.database.inventoryItems[0].stockOnHand;

      // Step 2: Upload invoice
      const file = { name: 'sysco-january.pdf', type: 'application/pdf' };
      await InvoiceProcessingService.uploadInvoice(file);
      expect(appState.processing.status).toBe('uploading');

      // Step 3: Extract with AI
      const extracted = await InvoiceProcessingService.extractWithAI();
      expect(extracted.vendorName).toBe('Sysco Foods');
      expect(extracted.lineItems.length).toBeGreaterThan(0);

      // Step 4: Match line items
      const matched = await InvoiceProcessingService.matchLineItems();
      const matchedCount = matched.filter(l => l.matchedInventoryItemId).length;
      expect(matchedCount).toBe(3); // 3 inventory items, 1 non-inventory

      // Step 5: Save invoice
      const invoice = await InvoiceProcessingService.confirmAndSaveInvoice();
      expect(invoice.status).toBe('pending');
      expect(appState.database.invoices).toHaveLength(1);

      // Step 6: Receive inventory
      await InvoiceProcessingService.receiveInventory(invoice.id);
      expect(invoice.status).toBe('received');

      // Step 7: Verify stock updated
      const chickenNow = appState.database.inventoryItems[0].stockOnHand;
      expect(chickenNow).toBe(initialChickenStock + 20);

      // Step 8: Verify shows in dashboard
      const dashboardInvoices = AccountingDashboardService.getInvoices();
      expect(dashboardInvoices).toHaveLength(1);
      expect(dashboardInvoices[0].status).toBe('received');

      // Step 9: Verify stock transactions logged
      expect(appState.database.stockTransactions.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown vendor', async () => {
      await InvoiceProcessingService.uploadInvoice({ name: 'test.jpg', type: 'image/jpeg' });
      await InvoiceProcessingService.extractWithAI();

      // Modify extracted data to have unknown vendor
      appState.processing.extractedData.vendorName = 'Unknown Vendor Co';
      await InvoiceProcessingService.matchLineItems();

      await expect(
        InvoiceProcessingService.confirmAndSaveInvoice()
      ).rejects.toThrow('Vendor not found');
    });

    it('should handle missing invoice for receipt', async () => {
      await expect(
        InvoiceProcessingService.receiveInventory(999)
      ).rejects.toThrow('Invoice not found');
    });
  });
});
