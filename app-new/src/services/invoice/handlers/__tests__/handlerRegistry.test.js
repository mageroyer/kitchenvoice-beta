/**
 * Handler Registry Tests
 *
 * Tests for handler dispatch and registry functions
 */

import { describe, it, expect } from 'vitest';
import {
  getHandler,
  getAllHandlerTypes,
  createInventoryItem,
  updateInventoryItem,
  isExpenseType
} from '../handlerRegistry';
import { INVOICE_TYPES } from '../types';

describe('handlerRegistry', () => {
  // ============================================
  // getHandler
  // ============================================
  describe('getHandler', () => {
    it('should return food supply handler for food_supply type', () => {
      const handler = getHandler(INVOICE_TYPES.FOOD_SUPPLY);

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.FOOD_SUPPLY);
    });

    it('should return packaging handler for packaging_distributor type', () => {
      const handler = getHandler(INVOICE_TYPES.PACKAGING_DISTRIBUTOR);

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.PACKAGING_DISTRIBUTOR);
    });

    it('should return generic handler for unknown type', () => {
      const handler = getHandler('unknown_type');

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.GENERIC);
    });

    it('should return generic handler for null type', () => {
      const handler = getHandler(null);

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.GENERIC);
    });

    it('should return utilities handler', () => {
      const handler = getHandler(INVOICE_TYPES.UTILITIES);

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.UTILITIES);
      expect(handler.isExpenseType).toBe(true);
    });

    it('should return services handler', () => {
      const handler = getHandler(INVOICE_TYPES.SERVICES);

      expect(handler).toBeDefined();
      expect(handler.type).toBe(INVOICE_TYPES.SERVICES);
      expect(handler.isExpenseType).toBe(true);
    });
  });

  // ============================================
  // getAllHandlerTypes
  // ============================================
  describe('getAllHandlerTypes', () => {
    it('should return all registered handler types as objects', () => {
      const handlers = getAllHandlerTypes();

      // Returns array of handler info objects
      const types = handlers.map(h => h.type);

      expect(types).toContain(INVOICE_TYPES.FOOD_SUPPLY);
      expect(types).toContain(INVOICE_TYPES.PACKAGING_DISTRIBUTOR);
      expect(types).toContain(INVOICE_TYPES.GENERIC);
      expect(types).toContain(INVOICE_TYPES.UTILITIES);
      expect(types).toContain(INVOICE_TYPES.SERVICES);
    });

    it('should return an array of handler info objects', () => {
      const handlers = getAllHandlerTypes();

      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers.length).toBeGreaterThanOrEqual(5);

      // Each should have type, label, and isExpenseType
      handlers.forEach(h => {
        expect(h.type).toBeDefined();
        expect(h.label).toBeDefined();
        expect(typeof h.isExpenseType).toBe('boolean');
      });
    });
  });

  // ============================================
  // createInventoryItem
  // ============================================
  describe('createInventoryItem', () => {
    it('should create item using handler', () => {
      const result = createInventoryItem({
        lineItem: {
          name: 'Test Product',
          quantity: 2,
          unitPrice: 10.00,
          totalPrice: 20.00,
          category: 'FOOD'  // Required for category-based routing
        },
        vendor: { id: 'v1', name: 'Test Vendor' },
        invoiceId: 'inv1',
        invoiceDate: '2025-01-01'
      });

      expect(result.item).toBeDefined();
      expect(result.item.name).toBe('Test Product');
      expect(result.item.vendorId).toBe('v1');
      expect(result.warnings).toBeInstanceOf(Array);
    });
  });

  // ============================================
  // updateInventoryItem
  // ============================================
  describe('updateInventoryItem', () => {
    it('should update item using handler', () => {
      const existingItem = {
        id: 'item1',
        name: 'Existing Product',
        stockQuantity: 5,
        currentPrice: 8.00,
        category: 'FOOD'  // Required for category-based routing
      };

      const result = updateInventoryItem({
        existingItem,
        lineItem: {
          name: 'Existing Product',
          quantity: 3,
          unitPrice: 10.00,
          totalPrice: 30.00,
          category: 'FOOD'  // Required for category-based routing
        },
        vendor: { id: 'v1', name: 'Test Vendor' },
        invoiceId: 'inv1',
        invoiceDate: '2025-01-01'
      });

      expect(result.updates).toBeDefined();
      expect(result.updates.stockQuantity).toBe(8); // 5 + 3
      expect(result.previousValues).toBeDefined();
      expect(result.previousValues.stockQuantity).toBe(5);
    });
  });

  // ============================================
  // isExpenseType
  // ============================================
  describe('isExpenseType', () => {
    it('should return true for utilities', () => {
      expect(isExpenseType(INVOICE_TYPES.UTILITIES)).toBe(true);
    });

    it('should return true for services', () => {
      expect(isExpenseType(INVOICE_TYPES.SERVICES)).toBe(true);
    });

    it('should return false for food supply', () => {
      expect(isExpenseType(INVOICE_TYPES.FOOD_SUPPLY)).toBe(false);
    });

    it('should return false for packaging', () => {
      expect(isExpenseType(INVOICE_TYPES.PACKAGING_DISTRIBUTOR)).toBe(false);
    });

    it('should return false for generic', () => {
      expect(isExpenseType(INVOICE_TYPES.GENERIC)).toBe(false);
    });
  });
});
