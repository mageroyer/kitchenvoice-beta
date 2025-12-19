/**
 * Integration Test: Invoice Math & Inventory Cascade
 *
 * Tests the complete data flow from invoice parsing through
 * math validation to inventory updates.
 *
 * Focus areas:
 * 1. Price per gram calculation from invoices
 * 2. Stock quantity updates
 * 3. Purchase history tracking
 * 4. Cost aggregation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================
// In-Memory Database Mock
// ============================================

const db = {
  vendors: new Map(),
  items: new Map(),
  invoices: new Map(),
  lines: new Map(),
  transactions: new Map(),
  nextId: { v: 1, i: 1, inv: 1, l: 1, t: 1 },
};

function reset() {
  db.vendors.clear();
  db.items.clear();
  db.invoices.clear();
  db.lines.clear();
  db.transactions.clear();
  db.nextId = { v: 1, i: 1, inv: 1, l: 1, t: 1 };
}

// ============================================
// Service Implementations (simplified)
// ============================================

const vendorService = {
  create: async (data) => {
    const id = db.nextId.v++;
    db.vendors.set(id, { ...data, id });
    return id;
  },
  get: async (id) => db.vendors.get(id),
  update: async (id, data) => {
    const v = db.vendors.get(id);
    if (v) db.vendors.set(id, { ...v, ...data });
  },
};

const inventoryService = {
  create: async (data) => {
    const id = db.nextId.i++;
    const item = {
      ...data,
      id,
      currentStock: data.currentStock || 0,
      purchaseCount: 0,
      totalQuantityPurchased: 0,
      totalSpent: 0,
      avgPricePerUnit: null,
      pricePerG: null,
    };
    db.items.set(id, item);
    return id;
  },
  get: async (id) => db.items.get(id),
  update: async (id, data) => {
    const item = db.items.get(id);
    if (item) db.items.set(id, { ...item, ...data });
  },
  applyPurchase: async (itemId, qty, totalCost, unit) => {
    const item = db.items.get(itemId);
    if (!item) throw new Error('Item not found');

    const newStock = item.currentStock + qty;
    const newPurchaseCount = item.purchaseCount + 1;
    const newTotalQty = item.totalQuantityPurchased + qty;
    const newTotalSpent = item.totalSpent + totalCost;

    // Calculate price per gram based on unit
    const pricePerUnit = totalCost / qty;
    let pricePerG = null;

    if (unit === 'kg') {
      pricePerG = pricePerUnit / 1000;
    } else if (unit === 'lb') {
      pricePerG = pricePerUnit / 453.592;
    } else if (unit === 'g') {
      pricePerG = pricePerUnit;
    } else if (unit === 'oz') {
      pricePerG = pricePerUnit / 28.3495;
    }

    db.items.set(itemId, {
      ...item,
      currentStock: newStock,
      purchaseCount: newPurchaseCount,
      totalQuantityPurchased: newTotalQty,
      totalSpent: newTotalSpent,
      avgPricePerUnit: newTotalSpent / newTotalQty,
      pricePerG,
      lastPurchasePrice: pricePerUnit,
      lastPurchaseUnit: unit,
    });

    // Create transaction
    const txId = db.nextId.t++;
    db.transactions.set(txId, {
      id: txId,
      itemId,
      type: 'purchase',
      quantity: qty,
      cost: totalCost,
      pricePerUnit,
      unit,
      timestamp: new Date().toISOString(),
    });

    return txId;
  },
};

const invoiceService = {
  create: async (data) => {
    const id = db.nextId.inv++;
    db.invoices.set(id, { ...data, id, lines: [] });
    return id;
  },
  addLine: async (invoiceId, lineData) => {
    const id = db.nextId.l++;
    const line = { ...lineData, id, invoiceId };
    db.lines.set(id, line);

    const invoice = db.invoices.get(invoiceId);
    if (invoice) {
      invoice.lines.push(id);
    }
    return id;
  },
  getWithLines: async (invoiceId) => {
    const invoice = db.invoices.get(invoiceId);
    if (!invoice) return null;
    return {
      ...invoice,
      lineItems: invoice.lines.map((id) => db.lines.get(id)),
    };
  },
};

// Import math engine
import {
  validateLine,
  findValidFormula,
  validateAllLines,
  validateCascade,
  VALIDATION_STATUS,
} from '../../services/invoice/mathEngine';

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  reset();
});

// ============================================
// Price Per Gram Calculations
// ============================================

describe('Price Per Gram Calculations', () => {
  it('calculates pricePerG from kg purchase', async () => {
    const vendorId = await vendorService.create({ name: 'Supplier A' });
    const itemId = await inventoryService.create({
      name: 'Flour',
      vendorId,
      unit: 'kg',
    });

    // Invoice line: 25kg @ $50 = $2/kg = $0.002/g
    await inventoryService.applyPurchase(itemId, 25, 50.0, 'kg');

    const item = await inventoryService.get(itemId);
    expect(item.pricePerG).toBeCloseTo(0.002, 5);
    expect(item.lastPurchasePrice).toBe(2.0); // $2/kg
  });

  it('calculates pricePerG from lb purchase', async () => {
    const vendorId = await vendorService.create({ name: 'Supplier B' });
    const itemId = await inventoryService.create({
      name: 'Chicken',
      vendorId,
      unit: 'lb',
    });

    // Invoice line: 20lb @ $70 = $3.50/lb
    // $3.50/lb ÷ 453.592g/lb = $0.00772/g
    await inventoryService.applyPurchase(itemId, 20, 70.0, 'lb');

    const item = await inventoryService.get(itemId);
    expect(item.pricePerG).toBeCloseTo(0.00772, 4);
    expect(item.lastPurchasePrice).toBe(3.5);
  });

  it('calculates pricePerG from g purchase', async () => {
    const vendorId = await vendorService.create({ name: 'Spice Co' });
    const itemId = await inventoryService.create({
      name: 'Saffron',
      vendorId,
      unit: 'g',
    });

    // Invoice line: 10g @ $50 = $5/g
    await inventoryService.applyPurchase(itemId, 10, 50.0, 'g');

    const item = await inventoryService.get(itemId);
    expect(item.pricePerG).toBe(5.0);
  });

  it('calculates pricePerG from oz purchase', async () => {
    const vendorId = await vendorService.create({ name: 'Herb Farm' });
    const itemId = await inventoryService.create({
      name: 'Fresh Basil',
      vendorId,
      unit: 'oz',
    });

    // Invoice line: 8oz @ $12 = $1.50/oz
    // $1.50/oz ÷ 28.3495g/oz = $0.0529/g
    await inventoryService.applyPurchase(itemId, 8, 12.0, 'oz');

    const item = await inventoryService.get(itemId);
    expect(item.pricePerG).toBeCloseTo(0.0529, 3);
  });
});

// ============================================
// Stock Quantity Updates
// ============================================

describe('Stock Quantity Updates', () => {
  it('adds purchase quantity to current stock', async () => {
    const vendorId = await vendorService.create({ name: 'Test' });
    const itemId = await inventoryService.create({
      name: 'Rice',
      vendorId,
      unit: 'kg',
      currentStock: 10, // Start with 10kg
    });

    // Purchase 25kg
    await inventoryService.applyPurchase(itemId, 25, 62.5, 'kg');

    const item = await inventoryService.get(itemId);
    expect(item.currentStock).toBe(35); // 10 + 25
  });

  it('handles multiple purchases correctly', async () => {
    const vendorId = await vendorService.create({ name: 'Test' });
    const itemId = await inventoryService.create({
      name: 'Olive Oil',
      vendorId,
      unit: 'l',
      currentStock: 0,
    });

    // First purchase: 5L @ $50
    await inventoryService.applyPurchase(itemId, 5, 50.0, 'l');

    // Second purchase: 3L @ $33
    await inventoryService.applyPurchase(itemId, 3, 33.0, 'l');

    const item = await inventoryService.get(itemId);
    expect(item.currentStock).toBe(8); // 5 + 3
    expect(item.purchaseCount).toBe(2);
    expect(item.totalQuantityPurchased).toBe(8);
    expect(item.totalSpent).toBe(83); // 50 + 33
    expect(item.avgPricePerUnit).toBeCloseTo(10.375, 2); // 83/8
  });
});

// ============================================
// Full Invoice to Inventory Flow
// ============================================

describe('Full Invoice to Inventory Flow', () => {
  it('processes complete invoice with math validation', async () => {
    // Setup
    const vendorId = await vendorService.create({ name: 'Food Supplier' });

    const chickenId = await inventoryService.create({
      name: 'Chicken Breast',
      vendorId,
      unit: 'lb',
      currentStock: 5,
    });

    const beefId = await inventoryService.create({
      name: 'Ground Beef',
      vendorId,
      unit: 'lb',
      currentStock: 10,
    });

    const flourId = await inventoryService.create({
      name: 'All Purpose Flour',
      vendorId,
      unit: 'kg',
      currentStock: 20,
    });

    // Parsed invoice lines
    const invoiceLines = [
      {
        description: 'Chicken Breast',
        quantity: 20,
        unitPrice: 3.5,
        totalPrice: 70.0,
        unit: 'lb',
        matchedItemId: chickenId,
      },
      {
        description: 'Ground Beef',
        quantity: 15,
        unitPrice: 4.0,
        totalPrice: 60.0,
        unit: 'lb',
        matchedItemId: beefId,
      },
      {
        description: 'All Purpose Flour',
        quantity: 25,
        unitPrice: 2.0,
        totalPrice: 50.0,
        unit: 'kg',
        matchedItemId: flourId,
      },
    ];

    // Step 1: Validate all lines mathematically
    const mathResult = validateAllLines(invoiceLines);
    expect(mathResult.allValid).toBe(true);
    expect(mathResult.summary.valid).toBe(3);

    // Step 2: Calculate totals
    const subtotal = invoiceLines.reduce((sum, l) => sum + l.totalPrice, 0);
    expect(subtotal).toBe(180.0);

    // Step 3: Validate cascade (Quebec taxes)
    const tps = Math.round(subtotal * 0.05 * 100) / 100; // $9.00
    const tvq = Math.round((subtotal + tps) * 0.09975 * 100) / 100; // $18.85

    const cascadeResult = validateCascade({
      lineTotals: invoiceLines.map((l) => l.totalPrice),
      subtotal,
      tps,
      tvq,
      grandTotal: subtotal + tps + tvq,
    });

    expect(cascadeResult.summary.allValid).toBe(true);

    // Step 4: Create invoice record
    const invoiceId = await invoiceService.create({
      vendorId,
      invoiceNumber: 'INV-001',
      subtotal,
      tps,
      tvq,
      grandTotal: subtotal + tps + tvq,
      status: 'validated',
    });

    // Step 5: Process each line
    for (const line of invoiceLines) {
      // Add line to invoice
      await invoiceService.addLine(invoiceId, {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        unit: line.unit,
        inventoryItemId: line.matchedItemId,
        mathValidated: true,
      });

      // Apply to inventory
      await inventoryService.applyPurchase(
        line.matchedItemId,
        line.quantity,
        line.totalPrice,
        line.unit
      );
    }

    // Step 6: Verify final state
    const chicken = await inventoryService.get(chickenId);
    expect(chicken.currentStock).toBe(25); // 5 + 20
    expect(chicken.pricePerG).toBeCloseTo(0.00772, 4);
    expect(chicken.totalSpent).toBe(70);

    const beef = await inventoryService.get(beefId);
    expect(beef.currentStock).toBe(25); // 10 + 15
    expect(beef.totalSpent).toBe(60);

    const flour = await inventoryService.get(flourId);
    expect(flour.currentStock).toBe(45); // 20 + 25
    expect(flour.pricePerG).toBe(0.002); // $2/kg = $0.002/g
    expect(flour.totalSpent).toBe(50);

    // Step 7: Verify invoice stored correctly
    const savedInvoice = await invoiceService.getWithLines(invoiceId);
    expect(savedInvoice.lineItems).toHaveLength(3);
    expect(savedInvoice.grandTotal).toBeCloseTo(207.85, 1);
  });

  it('handles weight-based billing (cheese invoice)', async () => {
    const vendorId = await vendorService.create({ name: 'Fromagerie' });

    const chedderId = await inventoryService.create({
      name: 'Cheddar Wheel',
      vendorId,
      unit: 'kg',
      currentStock: 0,
    });

    // Cheese invoice: ordered 3 wheels, billed by weight
    const line = {
      description: 'Cheddar Wheel',
      quantity: 3, // Wheels ordered
      billingQuantity: 12.45, // kg billed
      unitPrice: 8.5, // per kg
      totalPrice: 105.83, // 12.45 × 8.5
      unit: 'kg',
      matchedItemId: chedderId,
    };

    // Validate with billing quantity
    const result = findValidFormula({
      count: line.quantity,
      billingQuantity: line.billingQuantity,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    });

    expect(result.found).toBe(true);
    expect(result.bestMatch.formulaType).toBe('BILLING_QTY');

    // Apply to inventory using billingQuantity (actual kg received)
    await inventoryService.applyPurchase(
      chedderId,
      line.billingQuantity, // 12.45 kg
      line.totalPrice, // $105.83
      'kg'
    );

    const item = await inventoryService.get(chedderId);
    expect(item.currentStock).toBe(12.45);
    expect(item.pricePerG).toBeCloseTo(0.0085, 4); // $8.50/kg
  });

  it('handles pack format (4/5LB) with learned correction', async () => {
    const vendorId = await vendorService.create({
      name: 'Sysco',
      itemCorrections: {
        SYS001: {
          format: '4/5LB',
          packCount: 4,
          unitValue: 5,
          totalValue: 20,
          unit: 'lb',
          unitType: 'weight',
        },
      },
    });

    const itemId = await inventoryService.create({
      name: 'Chicken 4/5LB',
      vendorId,
      unit: 'lb',
      currentStock: 0,
    });

    // Invoice line: 2 cases of 4/5LB format
    const line = {
      itemCode: 'SYS001',
      description: 'Chicken Breast 4/5LB',
      quantity: 2, // Cases
      unitPrice: 2.5, // Per lb
      totalPrice: 100.0, // 2 × 20 × 2.5
    };

    // Get vendor correction
    const vendor = await vendorService.get(vendorId);
    const correction = vendor.itemCorrections[line.itemCode];

    // Calculate actual weight
    const actualWeight = correction.totalValue * line.quantity; // 20 × 2 = 40lb

    // Validate
    const result = findValidFormula({
      weight: actualWeight,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    });

    expect(result.found).toBe(true);
    expect(result.bestMatch.billingValue).toBe(40);

    // Apply to inventory
    await inventoryService.applyPurchase(itemId, actualWeight, line.totalPrice, 'lb');

    const item = await inventoryService.get(itemId);
    expect(item.currentStock).toBe(40);
    expect(item.pricePerG).toBeCloseTo(0.00551, 4); // $2.50/lb
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  it('handles zero-price promo lines', async () => {
    const lines = [
      { quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { quantity: 1, unitPrice: 0, totalPrice: 0 }, // FREE SAMPLE
      { quantity: 3, unitPrice: 15.0, totalPrice: 45.0 },
    ];

    const result = validateAllLines(lines);

    expect(result.summary.valid).toBe(2);
    expect(result.summary.skipped).toBe(1);
    expect(result.allValid).toBe(true); // Skipped doesn't count as invalid
  });

  it('handles deposit lines (non-inventory)', async () => {
    const invoiceLines = [
      { description: 'Product A', quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { description: 'DEPOSIT - PALLETS', quantity: 2, unitPrice: 15.0, totalPrice: 30.0 },
    ];

    // Both lines should validate mathematically
    const result = validateAllLines(invoiceLines);
    expect(result.allValid).toBe(true);

    // But only product lines go to inventory
    const inventoryLines = invoiceLines.filter(
      (l) => !l.description.toLowerCase().includes('deposit')
    );
    expect(inventoryLines).toHaveLength(1);
  });

  it('handles credit lines (negative amounts)', async () => {
    const lines = [
      { quantity: 5, unitPrice: 10.0, totalPrice: 50.0 },
      { quantity: -2, unitPrice: 10.0, totalPrice: -20.0 }, // Return/credit
    ];

    // Math still validates for credits
    const result = validateAllLines(lines);
    expect(result.summary.valid).toBe(2);
  });

  it('calculates correct totals with mixed units', async () => {
    const vendorId = await vendorService.create({ name: 'Mixed Supplier' });

    const itemKg = await inventoryService.create({
      name: 'Item A',
      vendorId,
      unit: 'kg',
    });

    const itemLb = await inventoryService.create({
      name: 'Item B',
      vendorId,
      unit: 'lb',
    });

    // Purchase both
    await inventoryService.applyPurchase(itemKg, 10, 25.0, 'kg'); // $2.50/kg
    await inventoryService.applyPurchase(itemLb, 20, 50.0, 'lb'); // $2.50/lb

    const itemA = await inventoryService.get(itemKg);
    const itemB = await inventoryService.get(itemLb);

    // pricePerG should be different even though $/unit is same
    expect(itemA.pricePerG).toBeCloseTo(0.0025, 4); // kg
    expect(itemB.pricePerG).toBeCloseTo(0.00551, 4); // lb (more expensive per gram)
  });
});

// ============================================
// Regression Tests
// ============================================

describe('Regression Tests', () => {
  it('compound TVQ calculation is correct', () => {
    // Bug: TVQ was calculated on subtotal only, not (subtotal + TPS)
    const subtotal = 100.0;
    const tps = 5.0; // 100 × 5%
    const tvqCorrect = Math.round((subtotal + tps) * 0.09975 * 100) / 100; // 10.47
    const tvqWrong = Math.round(subtotal * 0.09975 * 100) / 100; // 9.98

    expect(tvqCorrect).toBe(10.47);
    expect(tvqWrong).toBe(9.98);

    // Validate with correct TVQ
    const resultCorrect = validateCascade({
      lineTotals: [100],
      subtotal,
      tps,
      tvq: tvqCorrect,
      grandTotal: subtotal + tps + tvqCorrect,
    });
    expect(resultCorrect.results.tvq.isValid).toBe(true);

    // Validate with wrong TVQ should fail
    const resultWrong = validateCascade({
      lineTotals: [100],
      subtotal,
      tps,
      tvq: tvqWrong,
      grandTotal: subtotal + tps + tvqWrong,
    });
    expect(resultWrong.results.tvq.isValid).toBe(false);
  });

  it('billingQuantity takes precedence over quantity', () => {
    const fields = {
      count: 3, // Wrong for pricing
      billingQuantity: 12.45, // Correct for pricing
      unitPrice: 8.5,
      totalPrice: 105.83,
    };

    const result = findValidFormula(fields);

    expect(result.found).toBe(true);
    expect(result.bestMatch.formulaType).toBe('BILLING_QTY');
    expect(result.bestMatch.billingValue).toBe(12.45);

    // If we only used count, it would fail
    const wrongResult = validateLine(fields.count, fields.unitPrice, fields.totalPrice);
    expect(wrongResult.isValid).toBe(false);
  });
});
