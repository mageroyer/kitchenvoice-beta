/**
 * Integration Test: Complete Invoice Processing Flow
 *
 * Tests the end-to-end invoice processing including:
 * 1. Initial upload and parsing
 * 2. Math validation (B × P = T, cascade)
 * 3. User corrections
 * 4. Learning/correction storage
 * 5. Re-upload to verify learning applies
 * 6. Transfer to inventory
 *
 * This simulates a real user workflow across multiple invoices.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================
// Mock Database Layer
// ============================================

const mockDatabase = {
  vendors: new Map(),
  inventoryItems: new Map(),
  invoices: new Map(),
  invoiceLines: new Map(),
  stockTransactions: new Map(),
  nextId: { vendor: 1, item: 1, invoice: 1, line: 1, transaction: 1 },
};

function resetDatabase() {
  mockDatabase.vendors.clear();
  mockDatabase.inventoryItems.clear();
  mockDatabase.invoices.clear();
  mockDatabase.invoiceLines.clear();
  mockDatabase.stockTransactions.clear();
  mockDatabase.nextId = { vendor: 1, item: 1, invoice: 1, line: 1, transaction: 1 };
}

// Mock the database module
vi.mock('../../services/database/indexedDB', () => ({
  vendorDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.vendor++;
      const vendor = {
        ...data,
        id,
        itemCorrections: data.itemCorrections || {},
        parsingProfile: data.parsingProfile || null,
        createdAt: new Date().toISOString(),
      };
      mockDatabase.vendors.set(id, vendor);
      return id;
    }),
    getById: vi.fn(async (id) => mockDatabase.vendors.get(id) || null),
    getAll: vi.fn(async () => Array.from(mockDatabase.vendors.values())),
    update: vi.fn(async (id, data) => {
      const vendor = mockDatabase.vendors.get(id);
      if (!vendor) throw new Error('Vendor not found');
      const updated = { ...vendor, ...data, updatedAt: new Date().toISOString() };
      mockDatabase.vendors.set(id, updated);
      return updated;
    }),
    search: vi.fn(async (query) => {
      const all = Array.from(mockDatabase.vendors.values());
      if (!query) return all;
      return all.filter((v) =>
        v.name?.toLowerCase().includes(query.toLowerCase())
      );
    }),
  },
  inventoryItemDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.item++;
      const item = {
        ...data,
        id,
        currentStock: data.currentStock || 0,
        purchaseCount: 0,
        totalQuantityPurchased: 0,
        totalSpent: 0,
        pricePerG: data.pricePerG || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      mockDatabase.inventoryItems.set(id, item);
      return id;
    }),
    getById: vi.fn(async (id) => mockDatabase.inventoryItems.get(id) || null),
    getAll: vi.fn(async () => Array.from(mockDatabase.inventoryItems.values())),
    getByVendor: vi.fn(async (vendorId) =>
      Array.from(mockDatabase.inventoryItems.values()).filter(
        (i) => i.vendorId === vendorId
      )
    ),
    update: vi.fn(async (id, data) => {
      const item = mockDatabase.inventoryItems.get(id);
      if (!item) throw new Error('Inventory item not found');
      const updated = { ...item, ...data, updatedAt: new Date().toISOString() };
      mockDatabase.inventoryItems.set(id, updated);
      return updated;
    }),
    search: vi.fn(async (query) => {
      const all = Array.from(mockDatabase.inventoryItems.values());
      if (!query) return all;
      return all.filter((i) =>
        i.name?.toLowerCase().includes(query.toLowerCase())
      );
    }),
  },
  invoiceDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.invoice++;
      const invoice = {
        ...data,
        id,
        status: data.status || 'pending',
        createdAt: new Date().toISOString(),
      };
      mockDatabase.invoices.set(id, invoice);
      return id;
    }),
    getById: vi.fn(async (id) => mockDatabase.invoices.get(id) || null),
    update: vi.fn(async (id, data) => {
      const invoice = mockDatabase.invoices.get(id);
      if (!invoice) throw new Error('Invoice not found');
      const updated = { ...invoice, ...data };
      mockDatabase.invoices.set(id, updated);
      return updated;
    }),
  },
  invoiceLineDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.line++;
      const line = { ...data, id };
      mockDatabase.invoiceLines.set(id, line);
      return id;
    }),
    getByInvoice: vi.fn(async (invoiceId) =>
      Array.from(mockDatabase.invoiceLines.values()).filter(
        (l) => l.invoiceId === invoiceId
      )
    ),
    update: vi.fn(async (id, data) => {
      const line = mockDatabase.invoiceLines.get(id);
      if (!line) throw new Error('Line not found');
      const updated = { ...line, ...data };
      mockDatabase.invoiceLines.set(id, updated);
      return updated;
    }),
  },
  stockTransactionDB: {
    create: vi.fn(async (data) => {
      const id = mockDatabase.nextId.transaction++;
      mockDatabase.stockTransactions.set(id, { ...data, id });
      return id;
    }),
    getByItem: vi.fn(async (itemId) =>
      Array.from(mockDatabase.stockTransactions.values()).filter(
        (t) => t.inventoryItemId === itemId
      )
    ),
  },
}));

// Import after mocking
import {
  vendorDB,
  inventoryItemDB,
  invoiceDB,
  invoiceLineDB,
  stockTransactionDB,
} from '../../services/database/indexedDB';

// Import math engine
import {
  validateLine,
  findValidFormula,
  validateAllLines,
  validateCascade,
  extractAllFormats,
} from '../../services/invoice/mathEngine';

// ============================================
// Test Data: Simulated Invoice Parsing Results
// ============================================

/**
 * Simulates what Claude AI returns after parsing an invoice image
 */
function createParsedInvoice(vendorName, lines, totals = {}) {
  return {
    vendor: { name: vendorName },
    invoiceNumber: `INV-${Date.now()}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    lineItems: lines,
    subtotal: totals.subtotal || lines.reduce((sum, l) => sum + (l.totalPrice || 0), 0),
    tps: totals.tps,
    tvq: totals.tvq,
    grandTotal: totals.grandTotal,
    tableHeaders: ['Code', 'Description', 'Qty', 'Price', 'Total'],
  };
}

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  resetDatabase();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================
// Test Suite: Math Validation on Parsed Lines
// ============================================

describe('Math Validation on Parsed Lines', () => {
  it('validates lines that pass B × P = T', () => {
    const parsedLines = [
      { description: 'Chicken Breast', quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { description: 'Ground Beef', quantity: 3, unitPrice: 15.0, totalPrice: 45.0 },
      { description: 'Salmon Fillet', quantity: 2, unitPrice: 25.0, totalPrice: 50.0 },
    ];

    const result = validateAllLines(parsedLines);

    expect(result.summary.valid).toBe(3);
    expect(result.summary.invalid).toBe(0);
    expect(result.allValid).toBe(true);
  });

  it('flags lines that fail math validation', () => {
    const parsedLines = [
      { description: 'Chicken Breast', quantity: 5, unitPrice: 10.0, totalPrice: 50.0 }, // Valid
      { description: 'Ground Beef', quantity: 3, unitPrice: 15.0, totalPrice: 99.0 }, // INVALID
      { description: 'Salmon Fillet', quantity: 2, unitPrice: 25.0, totalPrice: 50.0 }, // Valid
    ];

    const result = validateAllLines(parsedLines);

    expect(result.summary.valid).toBe(2);
    expect(result.summary.invalid).toBe(1);
    expect(result.allValid).toBe(false);

    // The invalid line should be marked
    const invalidLine = result.results.find((r) => r.lineNumber === 2);
    expect(invalidLine.found).toBe(false);
  });

  it('validates weight-based lines using billingQuantity', () => {
    // Cheese invoice: ordered 3 wheels, billed for 12.45kg
    const parsedLines = [
      {
        description: 'Cheddar Wheel',
        quantity: 3, // Ordered qty (wheels)
        billingQuantity: 12.45, // Billing qty (kg)
        unitPrice: 8.5, // Per kg
        totalPrice: 105.83, // 12.45 × 8.5 = 105.825
      },
    ];

    const result = validateAllLines(parsedLines);

    expect(result.summary.valid).toBe(1);
    // Should have found BILLING_QTY formula
    expect(result.results[0].bestMatch?.formulaType).toBe('BILLING_QTY');
  });

  it('validates pack format lines', () => {
    // Pack format: 2 cases of "4/5LB" = 2 × 4 × 5 = 40lb
    const parsedLines = [
      {
        description: 'Flour 4/5LB',
        quantity: 2,
        packCount: 4,
        packWeight: 5,
        unitPrice: 2.5, // Per lb
        totalPrice: 100.0, // 40 × 2.5 = 100
      },
    ];

    const result = validateAllLines(parsedLines);

    expect(result.summary.valid).toBe(1);
    expect(result.results[0].bestMatch?.formulaType).toBe('PACK_WEIGHT');
  });
});

// ============================================
// Test Suite: Cascade Validation
// ============================================

describe('Cascade Validation', () => {
  it('validates full invoice: sum, TPS, TVQ, total', () => {
    const invoice = {
      lineTotals: [150.0, 200.0, 100.0], // = 450
      subtotal: 450.0,
      tps: 22.5, // 450 × 5%
      tvq: 47.14, // (450 + 22.5) × 9.975%
      grandTotal: 519.64,
    };

    const result = validateCascade(invoice);

    expect(result.summary.allValid).toBe(true);
    expect(result.results.sum.isValid).toBe(true);
    expect(result.results.tps.isValid).toBe(true);
    expect(result.results.tvq.isValid).toBe(true);
    expect(result.results.total.isValid).toBe(true);
  });

  it('detects missing line (sum mismatch)', () => {
    const invoice = {
      lineTotals: [150.0, 100.0], // Missing the $200 line
      subtotal: 450.0, // But subtotal includes it
      tps: 22.5,
      tvq: 47.14,
      grandTotal: 519.64,
    };

    const result = validateCascade(invoice);

    expect(result.summary.allValid).toBe(false);
    expect(result.results.sum.isValid).toBe(false);
    expect(result.results.sum.difference).toBe(200.0); // The missing amount
  });

  it('detects wrong TVQ (non-compound calculation)', () => {
    const invoice = {
      lineTotals: [100.0],
      subtotal: 100.0,
      tps: 5.0,
      tvq: 9.98, // WRONG: 100 × 9.975% (should be 105 × 9.975% = 10.47)
      grandTotal: 114.98,
    };

    const result = validateCascade(invoice);

    // TVQ should fail because it used wrong formula
    expect(result.results.tvq.isValid).toBe(false);
  });
});

// ============================================
// Test Suite: User Corrections & Learning
// ============================================

describe('User Corrections and Learning', () => {
  it('stores user correction on vendor profile', async () => {
    // Step 1: Create vendor
    const vendorId = await vendorDB.create({
      name: 'Sysco Foods',
      itemCorrections: {},
    });

    // Step 2: User corrects a line item format
    const correction = {
      itemCode: 'CH001',
      itemName: 'Chicken Breast 4/5LB',
      format: '4/5LB',
      value: 20, // 4 × 5 = 20lb
      unit: 'lb',
      unitType: 'weight',
      packCount: 4,
      unitValue: 5,
      totalValue: 20,
    };

    // Step 3: Save correction to vendor
    await vendorDB.update(vendorId, {
      itemCorrections: { [correction.itemCode]: correction },
    });

    // Step 4: Verify correction stored
    const vendor = await vendorDB.getById(vendorId);
    expect(vendor.itemCorrections['CH001']).toBeDefined();
    expect(vendor.itemCorrections['CH001'].totalValue).toBe(20);
    expect(vendor.itemCorrections['CH001'].unitType).toBe('weight');
  });

  it('applies learned correction on re-upload', async () => {
    // Step 1: Create vendor with existing correction
    const vendorId = await vendorDB.create({
      name: 'Sysco Foods',
      itemCorrections: {
        CH001: {
          itemCode: 'CH001',
          itemName: 'Chicken Breast 4/5LB',
          format: '4/5LB',
          value: 20,
          unit: 'lb',
          unitType: 'weight',
          packCount: 4,
          unitValue: 5,
          totalValue: 20,
        },
      },
    });

    // Step 2: Simulate new invoice with same item
    const parsedLines = [
      {
        itemCode: 'CH001',
        description: 'Chicken Breast 4/5LB',
        quantity: 2, // 2 cases
        unitPrice: 2.5, // per lb
        totalPrice: 100.0, // 2 × 20 × 2.5 = 100
      },
    ];

    // Step 3: Apply corrections from vendor profile
    const vendor = await vendorDB.getById(vendorId);
    const correctedLines = parsedLines.map((line) => {
      const learned = vendor.itemCorrections[line.itemCode];
      if (learned && learned.unitType === 'weight') {
        return {
          ...line,
          weight: learned.totalValue * line.quantity, // 20 × 2 = 40lb
          weightUnit: learned.unit,
          learnedCorrection: true,
        };
      }
      return line;
    });

    // Step 4: Verify correction applied
    expect(correctedLines[0].weight).toBe(40);
    expect(correctedLines[0].learnedCorrection).toBe(true);

    // Step 5: Now validate math with corrected weight
    const validationResult = findValidFormula({
      weight: correctedLines[0].weight, // 40lb
      unitPrice: correctedLines[0].unitPrice, // $2.50/lb
      totalPrice: correctedLines[0].totalPrice, // $100
    });

    expect(validationResult.found).toBe(true);
    expect(validationResult.bestMatch.formulaType).toBe('SIMPLE_WEIGHT');
  });

  it('user corrects billing quantity column', async () => {
    // Cheese invoice scenario: user maps Qté Fact column
    const vendorId = await vendorDB.create({
      name: 'Fromagerie du Quebec',
      parsingProfile: {
        columns: {
          description: { index: 1 },
          quantity: { index: 2 }, // Qté Cmd
          billingQuantity: { index: 4 }, // Qté Fact - THE KEY COLUMN
          quantityUnit: { index: 5 }, // U/M (kg, UN)
          unitPrice: { index: 6 },
          totalPrice: { index: 7 },
        },
      },
    });

    // Simulate parsing with profile
    const rawLine = ['CH001', 'Cheddar Wheel', '3', '3', '12.45', 'kg', '8.50', '105.83'];

    const vendor = await vendorDB.getById(vendorId);
    const profile = vendor.parsingProfile;

    // Apply profile mapping
    const parsedLine = {
      itemCode: rawLine[0],
      description: rawLine[profile.columns.description.index],
      quantity: parseFloat(rawLine[profile.columns.quantity.index]),
      billingQuantity: parseFloat(rawLine[profile.columns.billingQuantity.index]),
      unitPrice: parseFloat(rawLine[profile.columns.unitPrice.index]),
      totalPrice: parseFloat(rawLine[profile.columns.totalPrice.index]),
    };

    // Validate with billing quantity
    const result = findValidFormula({
      count: parsedLine.quantity, // 3 (won't validate)
      billingQuantity: parsedLine.billingQuantity, // 12.45 (will validate)
      unitPrice: parsedLine.unitPrice,
      totalPrice: parsedLine.totalPrice,
    });

    expect(result.found).toBe(true);
    expect(result.bestMatch.formulaType).toBe('BILLING_QTY');
    expect(result.bestMatch.billingValue).toBe(12.45);
  });
});

// ============================================
// Test Suite: Full Flow - Upload to Inventory
// ============================================

describe('Full Flow: Upload to Inventory', () => {
  it('processes invoice and creates stock transactions', async () => {
    // Step 1: Create vendor
    const vendorId = await vendorDB.create({
      name: 'Local Supplier',
    });

    // Step 2: Create inventory items
    const itemId1 = await inventoryItemDB.create({
      name: 'Chicken Breast',
      vendorId,
      unit: 'lb',
      currentStock: 10,
    });

    const itemId2 = await inventoryItemDB.create({
      name: 'Ground Beef',
      vendorId,
      unit: 'lb',
      currentStock: 5,
    });

    // Step 3: Simulate parsed invoice
    const parsedInvoice = createParsedInvoice('Local Supplier', [
      {
        description: 'Chicken Breast',
        quantity: 20,
        unitPrice: 3.5,
        totalPrice: 70.0,
        matchedItemId: itemId1,
      },
      {
        description: 'Ground Beef',
        quantity: 15,
        unitPrice: 4.0,
        totalPrice: 60.0,
        matchedItemId: itemId2,
      },
    ]);

    // Step 4: Validate math
    const mathResult = validateAllLines(parsedInvoice.lineItems);
    expect(mathResult.allValid).toBe(true);

    // Step 5: Create invoice record
    const invoiceId = await invoiceDB.create({
      vendorId,
      invoiceNumber: parsedInvoice.invoiceNumber,
      subtotal: parsedInvoice.subtotal,
      status: 'processed',
    });

    // Step 6: Create line items and update inventory
    for (const line of parsedInvoice.lineItems) {
      // Create invoice line
      await invoiceLineDB.create({
        invoiceId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        inventoryItemId: line.matchedItemId,
      });

      // Update inventory stock
      if (line.matchedItemId) {
        const item = await inventoryItemDB.getById(line.matchedItemId);
        await inventoryItemDB.update(line.matchedItemId, {
          currentStock: item.currentStock + line.quantity,
          purchaseCount: item.purchaseCount + 1,
          totalQuantityPurchased: item.totalQuantityPurchased + line.quantity,
          totalSpent: item.totalSpent + line.totalPrice,
          pricePerG: line.unitPrice / 453.592, // lb to g
        });

        // Create stock transaction
        await stockTransactionDB.create({
          inventoryItemId: line.matchedItemId,
          type: 'purchase',
          quantity: line.quantity,
          invoiceId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Step 7: Verify inventory updated
    const chicken = await inventoryItemDB.getById(itemId1);
    expect(chicken.currentStock).toBe(30); // 10 + 20
    expect(chicken.purchaseCount).toBe(1);
    expect(chicken.totalSpent).toBe(70);

    const beef = await inventoryItemDB.getById(itemId2);
    expect(beef.currentStock).toBe(20); // 5 + 15
    expect(beef.totalSpent).toBe(60);

    // Step 8: Verify transactions created
    const chickenTransactions = await stockTransactionDB.getByItem(itemId1);
    expect(chickenTransactions).toHaveLength(1);
    expect(chickenTransactions[0].type).toBe('purchase');
    expect(chickenTransactions[0].quantity).toBe(20);
  });

  it('calculates pricePerG from invoice', async () => {
    const vendorId = await vendorDB.create({ name: 'Test Vendor' });

    const itemId = await inventoryItemDB.create({
      name: 'Flour',
      vendorId,
      unit: 'kg',
      currentStock: 0,
    });

    // Invoice line: 25kg @ $2.50/kg = $62.50
    const line = {
      quantity: 25,
      unitPrice: 2.5,
      totalPrice: 62.5,
      unit: 'kg',
    };

    // Calculate pricePerG: $2.50/kg = $0.0025/g
    const pricePerG = line.unitPrice / 1000;

    await inventoryItemDB.update(itemId, {
      currentStock: 25,
      pricePerG: pricePerG,
      lastPurchasePrice: line.unitPrice,
      lastPurchaseUnit: 'kg',
    });

    const item = await inventoryItemDB.getById(itemId);
    expect(item.pricePerG).toBeCloseTo(0.0025, 5);
  });
});

// ============================================
// Test Suite: Complete Workflow Simulation
// ============================================

describe('Complete Workflow: First Invoice to Second Invoice', () => {
  it('learns from first invoice and applies to second', async () => {
    // ========== FIRST INVOICE ==========

    // Step 1: New vendor, no profile
    const vendorId = await vendorDB.create({
      name: 'Sysco Foods',
      itemCorrections: {},
    });

    // Step 2: First invoice parsed (has issues)
    const firstInvoiceLines = [
      {
        itemCode: 'SYS001',
        description: 'Chicken Breast 4/5LB',
        quantity: 2, // Cases
        unitPrice: 2.5, // Per lb
        totalPrice: 100.0, // 2 × 20 × 2.5 = 100
        // AI doesn't understand 4/5LB format
      },
    ];

    // Step 3: Math validation FAILS (2 × 2.5 ≠ 100)
    const firstResult = validateAllLines(firstInvoiceLines);
    expect(firstResult.allValid).toBe(false);

    // Step 4: User corrects the format
    const correction = {
      itemCode: 'SYS001',
      itemName: 'Chicken Breast 4/5LB',
      format: '4/5LB',
      value: 20,
      unit: 'lb',
      unitType: 'weight',
      packCount: 4,
      unitValue: 5,
      totalValue: 20,
    };

    // Step 5: Save correction
    await vendorDB.update(vendorId, {
      itemCorrections: { [correction.itemCode]: correction },
    });

    // ========== SECOND INVOICE (SAME ITEM) ==========

    // Step 6: Second invoice uploaded
    const secondInvoiceLines = [
      {
        itemCode: 'SYS001',
        description: 'Chicken Breast 4/5LB',
        quantity: 3, // 3 cases this time
        unitPrice: 2.5,
        totalPrice: 150.0, // 3 × 20 × 2.5 = 150
      },
    ];

    // Step 7: Apply learned corrections
    const vendor = await vendorDB.getById(vendorId);
    const correctedLines = secondInvoiceLines.map((line) => {
      const learned = vendor.itemCorrections[line.itemCode];
      if (learned) {
        return {
          ...line,
          weight: learned.totalValue * line.quantity, // 20 × 3 = 60lb
          weightUnit: learned.unit,
          learnedCorrection: true,
          packCount: learned.packCount,
          unitValue: learned.unitValue,
        };
      }
      return line;
    });

    // Step 8: Math validation NOW PASSES
    const secondResult = findValidFormula({
      weight: correctedLines[0].weight, // 60lb
      unitPrice: correctedLines[0].unitPrice, // $2.50
      totalPrice: correctedLines[0].totalPrice, // $150
    });

    expect(secondResult.found).toBe(true);
    expect(correctedLines[0].learnedCorrection).toBe(true);
    expect(correctedLines[0].weight).toBe(60);

    // Step 9: Both invoices can now be processed correctly!
    console.log('Learning applied successfully:');
    console.log('- First invoice: Required user correction');
    console.log('- Second invoice: Correction auto-applied, math validates');
  });

  it('learns billing quantity column mapping', async () => {
    // Cheese supplier with complex column structure

    // Step 1: Create vendor with learned profile
    const vendorId = await vendorDB.create({
      name: 'Fromagerie du Quebec',
      parsingProfile: {
        version: 1,
        columns: {
          itemCode: { index: 0 },
          description: { index: 1 },
          quantity: { index: 2 }, // Qté Cmd (ordered)
          pieceCount: { index: 3 }, // Qté Mcx
          billingQuantity: { index: 4 }, // Qté Fact (BILLING - key column!)
          quantityUnit: { index: 5 }, // U/M
          unitPrice: { index: 6 },
          totalPrice: { index: 7 },
        },
      },
    });

    // Step 2: Parse raw invoice with profile
    const rawLines = [
      ['CH001', 'Cheddar Wheel', '3', '3', '12.45', 'kg', '8.50', '105.83'],
      ['CH002', 'Brie Round', '2', '2', '5.50', 'kg', '15.00', '82.50'],
      ['CH003', 'Gouda Block', '5', '5', '8.75', 'kg', '12.00', '105.00'],
    ];

    const vendor = await vendorDB.getById(vendorId);
    const profile = vendor.parsingProfile;

    // Apply column mapping
    const parsedLines = rawLines.map((raw) => ({
      itemCode: raw[profile.columns.itemCode.index],
      description: raw[profile.columns.description.index],
      quantity: parseFloat(raw[profile.columns.quantity.index]),
      billingQuantity: parseFloat(raw[profile.columns.billingQuantity.index]),
      unitPrice: parseFloat(raw[profile.columns.unitPrice.index]),
      totalPrice: parseFloat(raw[profile.columns.totalPrice.index]),
    }));

    // Step 3: Validate ALL lines with billing quantity
    const results = parsedLines.map((line) =>
      findValidFormula({
        count: line.quantity,
        billingQuantity: line.billingQuantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
      })
    );

    // All should validate with BILLING_QTY formula
    expect(results.every((r) => r.found)).toBe(true);
    expect(results.every((r) => r.bestMatch.formulaType === 'BILLING_QTY')).toBe(
      true
    );

    // Step 4: Validate cascade
    const subtotal = parsedLines.reduce((sum, l) => sum + l.totalPrice, 0);
    const tps = Math.round(subtotal * 0.05 * 100) / 100;
    const tvq = Math.round((subtotal + tps) * 0.09975 * 100) / 100;

    const cascadeResult = validateCascade({
      lineTotals: parsedLines.map((l) => l.totalPrice),
      subtotal,
      tps,
      tvq,
      grandTotal: subtotal + tps + tvq,
    });

    expect(cascadeResult.summary.allValid).toBe(true);
  });
});

// ============================================
// Test Suite: Error Cases
// ============================================

describe('Error Cases', () => {
  it('handles invoice with no matching formula', async () => {
    const lines = [
      {
        description: 'Mystery Item',
        quantity: 5,
        unitPrice: 10.0,
        totalPrice: 999.0, // Makes no sense
      },
    ];

    const result = validateAllLines(lines);

    expect(result.allValid).toBe(false);
    expect(result.summary.invalid).toBe(1);

    // Should still return closest match for debugging
    expect(result.results[0].bestMatch).not.toBeNull();
  });

  it('handles missing vendor on re-upload', async () => {
    // Simulate vendor not found
    const vendor = await vendorDB.getById(9999);
    expect(vendor).toBeNull();

    // System should handle gracefully
    const parsedLines = [
      { description: 'Item', quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
    ];

    // Without vendor corrections, just validate as-is
    const result = validateAllLines(parsedLines);
    expect(result.allValid).toBe(true);
  });

  it('handles corrupt correction data', async () => {
    const vendorId = await vendorDB.create({
      name: 'Test Vendor',
      itemCorrections: {
        ITEM001: {
          // Missing required fields
          itemCode: 'ITEM001',
          // No format, value, unit
        },
      },
    });

    const vendor = await vendorDB.getById(vendorId);
    const correction = vendor.itemCorrections['ITEM001'];

    // System should handle gracefully
    expect(correction.value).toBeUndefined();

    // Line should still process without correction
    const line = {
      itemCode: 'ITEM001',
      quantity: 5,
      unitPrice: 10.0,
      totalPrice: 50.0,
    };

    const result = findValidFormula({
      count: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    });

    expect(result.found).toBe(true);
  });
});
