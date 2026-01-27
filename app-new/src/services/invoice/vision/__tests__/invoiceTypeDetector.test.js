/**
 * Invoice Type Detector Tests
 *
 * Tests the pattern-based invoice type detection using mock Vision JSON output.
 * Each test case simulates what Claude Vision would return for different invoice types.
 */

import { describe, it, expect } from 'vitest';
import {
  detectInvoiceType,
  getTypeLabel,
  getTypeIcon,
  isHighConfidence,
  FOOD_SUPPLY_PATTERNS,
  PACKAGING_PATTERNS,
  UTILITIES_PATTERNS,
  SERVICES_PATTERNS
} from '../invoiceTypeDetector';

// ============================================================================
// MOCK VISION DATA - Simulates Claude Vision output for different invoice types
// ============================================================================

/**
 * Mock: Food Supply Invoice (C&C Packing style - meat distributor)
 * Key signals: weight formats (2/5LB), weight fields, food keywords
 */
const MOCK_FOOD_SUPPLY_INVOICE = {
  invoice: {
    invoiceNumber: 'CC-78234',
    date: '2025-01-15',
    vendorName: 'C&C Packing Co.',
    vendorTaxTPS: '123456789RT0001',
    subtotal: 1245.50,
    total: 1432.33
  },
  lineItems: [
    {
      description: 'BEEF STRIPLOIN AAA',
      format: '2/5LB',
      quantity: 4,
      weight: 40,
      weightUnit: 'lb',
      unitPrice: 12.50,
      totalPrice: 500.00
    },
    {
      description: 'PORK TENDERLOIN',
      format: '4/2.5KG',
      quantity: 2,
      weight: 20,
      weightUnit: 'kg',
      unitPrice: 8.99,
      totalPrice: 179.80
    },
    {
      description: 'CHICKEN BREAST BONELESS',
      format: '1/5KG',
      quantity: 10,
      weight: 50,
      weightUnit: 'kg',
      unitPrice: 11.30,
      totalPrice: 565.00
    }
  ],
  vendor: null,
  warnings: []
};

/**
 * Mock: Packaging Distributor Invoice (Carrousel style)
 * Key signals: container sizes (500ML), case counts (1000/case), packaging keywords
 */
const MOCK_PACKAGING_INVOICE = {
  invoice: {
    invoiceNumber: 'CRS-12789',
    date: '2025-01-10',
    vendorName: 'Carrousel Emballage',
    subtotal: 892.45,
    total: 1026.32
  },
  lineItems: [
    {
      description: 'CONTENEUR NOIR 24OZ AVEC COUVERCLE',
      format: '150/CASE',
      quantity: 2,
      unit: 'case',
      unitPrice: 89.50,
      totalPrice: 179.00
    },
    {
      description: 'SAC KRAFT 8X4X16',
      format: '500/BX',
      quantity: 3,
      unit: 'box',
      unitPrice: 45.00,
      totalPrice: 135.00
    },
    {
      description: 'GOBELET PLASTIQUE 16OZ',
      format: '1000/CS',
      quantity: 1,
      unit: 'case',
      unitPrice: 125.00,
      totalPrice: 125.00
    },
    {
      description: 'FILM ÉTIRABLE 18" ROLL',
      format: '4/CASE',
      quantity: 2,
      unit: 'case',
      unitPrice: 65.00,
      totalPrice: 130.00
    },
    {
      description: 'CONSIGNE CONTENEURS',
      quantity: 1,
      unitPrice: 25.00,
      totalPrice: 25.00
    }
  ],
  vendor: null,
  warnings: []
};

/**
 * Mock: Utility Bill (Hydro-Québec style)
 * Key signals: usage units (kWh), billing period, fixed charges, few line items
 */
const MOCK_UTILITIES_INVOICE = {
  invoice: {
    invoiceNumber: 'HQ-2025-01-15234',
    date: '2025-01-20',
    vendorName: 'Hydro-Québec',
    billingPeriod: '2025-01-01 to 2025-01-31',
    accountNumber: '1234567890',
    subtotal: 456.78,
    total: 525.30
  },
  lineItems: [
    {
      description: 'Electricity consumption - 2,450 kWh',
      usage: 2450,
      usageUnit: 'kWh',
      rate: 0.08,
      amount: 196.00
    },
    {
      description: 'Delivery charge',
      amount: 45.50
    },
    {
      description: 'Fixed service charge',
      amount: 12.50
    },
    {
      description: 'TPS (5%)',
      amount: 12.70
    },
    {
      description: 'TVQ (9.975%)',
      amount: 25.36
    }
  ],
  vendor: null,
  warnings: []
};

/**
 * Mock: Services Invoice (Repair company style)
 * Key signals: hourly rates, labor terms, service descriptions
 */
const MOCK_SERVICES_INVOICE = {
  invoice: {
    invoiceNumber: 'SVC-45678',
    date: '2025-01-18',
    vendorName: 'ProTech Equipment Repair',
    subtotal: 485.00,
    total: 557.78
  },
  lineItems: [
    {
      description: 'Labor - Equipment diagnostic and repair',
      hours: 3.5,
      rate: 85.00,
      amount: 297.50
    },
    {
      description: 'Parts - Compressor motor',
      quantity: 1,
      unitPrice: 125.00,
      totalPrice: 125.00
    },
    {
      description: 'Service call fee',
      amount: 62.50
    }
  ],
  vendor: null,
  warnings: []
};

/**
 * Mock: Generic Invoice (Office supplies style)
 * Key signals: no specific patterns, basic quantity/price
 */
const MOCK_GENERIC_INVOICE = {
  invoice: {
    invoiceNumber: 'INV-99001',
    date: '2025-01-12',
    vendorName: 'Office Depot',
    subtotal: 156.80,
    total: 180.32
  },
  lineItems: [
    {
      description: 'Copy Paper Letter 8.5x11',
      quantity: 10,
      unit: 'ream',
      unitPrice: 8.99,
      totalPrice: 89.90
    },
    {
      description: 'Ballpoint Pens Blue 12pk',
      quantity: 3,
      unit: 'pack',
      unitPrice: 5.49,
      totalPrice: 16.47
    },
    {
      description: 'Stapler Heavy Duty',
      quantity: 1,
      unit: 'ea',
      unitPrice: 24.99,
      totalPrice: 24.99
    }
  ],
  vendor: null,
  warnings: []
};

/**
 * Mock: Known vendor with profile (should use vendor type directly)
 */
const MOCK_KNOWN_VENDOR_INVOICE = {
  invoice: {
    invoiceNumber: 'TEST-001',
    vendorName: 'Known Vendor Inc.'
  },
  lineItems: [
    { description: 'Test Item', quantity: 1, unitPrice: 10.00, totalPrice: 10.00 }
  ],
  vendor: {
    id: 'vendor-123',
    name: 'Known Vendor Inc.',
    invoiceType: 'foodSupply'
  },
  warnings: []
};

// ============================================================================
// TESTS
// ============================================================================

describe('Invoice Type Detector', () => {

  describe('detectInvoiceType()', () => {

    it('should detect food supply invoice with high confidence', () => {
      const result = detectInvoiceType(MOCK_FOOD_SUPPLY_INVOICE);

      expect(result.type).toBe('foodSupply');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.source).toBe('detection');
      expect(result.signals.foodSupply).toBeGreaterThan(result.signals.packagingDistributor);
      expect(result.signals.foodSupply).toBeGreaterThan(result.signals.utilities);
    });

    it('should detect packaging invoice with high confidence', () => {
      const result = detectInvoiceType(MOCK_PACKAGING_INVOICE);

      expect(result.type).toBe('packagingDistributor');
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.source).toBe('detection');
      expect(result.signals.packagingDistributor).toBeGreaterThan(result.signals.foodSupply);
    });

    it('should detect utilities invoice with high confidence', () => {
      const result = detectInvoiceType(MOCK_UTILITIES_INVOICE);

      expect(result.type).toBe('utilities');
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.source).toBe('detection');
      expect(result.signals.utilities).toBeGreaterThan(result.signals.foodSupply);
      expect(result.signals.utilities).toBeGreaterThan(result.signals.packagingDistributor);
    });

    it('should detect services invoice', () => {
      const result = detectInvoiceType(MOCK_SERVICES_INVOICE);

      expect(result.type).toBe('services');
      expect(result.source).toBe('detection');
      expect(result.signals.services).toBeGreaterThan(0);
    });

    it('should fall back to generic for ambiguous invoices', () => {
      const result = detectInvoiceType(MOCK_GENERIC_INVOICE);

      // Generic invoice should have low signals for all types
      expect(result.type).toBe('generic');
      expect(result.source).toBe('detection');
    });

    it('should use vendor profile type when vendor is matched', () => {
      const result = detectInvoiceType(MOCK_KNOWN_VENDOR_INVOICE);

      expect(result.type).toBe('foodSupply');
      expect(result.confidence).toBe(100);
      expect(result.source).toBe('vendor_profile');
      expect(result.vendorName).toBe('Known Vendor Inc.');
      // Should not have signals when using vendor profile
      expect(result.signals).toBeNull();
    });

    it('should provide alternative type when close scores', () => {
      // Mixed invoice with both food and packaging signals
      const mixedInvoice = {
        invoice: { vendorName: 'Mixed Vendor' },
        lineItems: [
          { description: 'BEEF STRIPLOIN', format: '2/5LB', weight: 10, weightUnit: 'lb', quantity: 1, unitPrice: 50, totalPrice: 50 },
          { description: 'CONTAINER 24OZ', format: '150/CASE', quantity: 1, unitPrice: 80, totalPrice: 80 }
        ],
        vendor: null,
        warnings: []
      };

      const result = detectInvoiceType(mixedInvoice);

      // Should have an alternative type suggested
      expect(result.alternativeType).not.toBeNull();
      expect(result.alternativeScore).toBeGreaterThan(0);
    });

  });

  describe('Pattern Detection - Food Supply', () => {

    it('should match weight format patterns', () => {
      expect(FOOD_SUPPLY_PATTERNS.weightFormat.test('2/5LB')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.weightFormat.test('4/2.5KG')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.weightFormat.test('1/25LB')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.weightFormat.test('12x500G')).toBe(true);
    });

    it('should match simple weight patterns', () => {
      expect(FOOD_SUPPLY_PATTERNS.simpleWeight.test('50lb')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.simpleWeight.test('2.5kg')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.simpleWeight.test('Sac 25lb')).toBe(true);
    });

    it('should match food keywords', () => {
      expect(FOOD_SUPPLY_PATTERNS.foodKeywords.test('BEEF STRIPLOIN AAA')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.foodKeywords.test('Poulet désossé')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.foodKeywords.test('Fresh salmon fillet')).toBe(true);
      expect(FOOD_SUPPLY_PATTERNS.foodKeywords.test('Fromage cheddar')).toBe(true);
    });

  });

  describe('Pattern Detection - Packaging', () => {

    it('should match container size patterns', () => {
      expect(PACKAGING_PATTERNS.containerSize.test('500ML')).toBe(true);
      expect(PACKAGING_PATTERNS.containerSize.test('24OZ')).toBe(true);
      expect(PACKAGING_PATTERNS.containerSize.test('1L')).toBe(true);
      expect(PACKAGING_PATTERNS.containerSize.test('16 oz')).toBe(true);
    });

    it('should match case count patterns', () => {
      expect(PACKAGING_PATTERNS.caseCount.test('1000/case')).toBe(true);
      expect(PACKAGING_PATTERNS.caseCount.test('500/cs')).toBe(true);
      expect(PACKAGING_PATTERNS.caseCount.test('250/BX')).toBe(true);
      expect(PACKAGING_PATTERNS.caseCount.test('150/CASE')).toBe(true);
    });

    it('should match packaging keywords', () => {
      expect(PACKAGING_PATTERNS.packagingKeywords.test('CONTENEUR NOIR')).toBe(true);
      expect(PACKAGING_PATTERNS.packagingKeywords.test('Plastic bag')).toBe(true);
      expect(PACKAGING_PATTERNS.packagingKeywords.test('Film étirable')).toBe(true);
      expect(PACKAGING_PATTERNS.packagingKeywords.test('napkin dispenser')).toBe(true);
    });

    it('should match dimension patterns', () => {
      expect(PACKAGING_PATTERNS.dimensions.test('8X4X16')).toBe(true);
      expect(PACKAGING_PATTERNS.dimensions.test('9x9')).toBe(true);
      expect(PACKAGING_PATTERNS.dimensions.test('12" x 12"')).toBe(true);
    });

  });

  describe('Pattern Detection - Utilities', () => {

    it('should match usage unit patterns', () => {
      expect(UTILITIES_PATTERNS.usageUnits.test('2450 kWh')).toBe(true);
      expect(UTILITIES_PATTERNS.usageUnits.test('consumption 1,250 m3')).toBe(true); // m3 variant
      expect(UTILITIES_PATTERNS.usageUnits.test('45 therms')).toBe(true);
      expect(UTILITIES_PATTERNS.usageUnits.test('500 GJ')).toBe(true);
    });

    it('should match fixed charge patterns', () => {
      expect(UTILITIES_PATTERNS.fixedCharges.test('Fixed service charge')).toBe(true);
      expect(UTILITIES_PATTERNS.fixedCharges.test('Frais de service')).toBe(true);
      expect(UTILITIES_PATTERNS.fixedCharges.test('Delivery charge')).toBe(true);
      expect(UTILITIES_PATTERNS.fixedCharges.test('Customer charge')).toBe(true);
    });

    it('should match billing period patterns', () => {
      expect(UTILITIES_PATTERNS.billingPeriod.test('Billing period: Jan 1-31')).toBe(true);
      expect(UTILITIES_PATTERNS.billingPeriod.test('Service period 2025-01-01')).toBe(true);
      expect(UTILITIES_PATTERNS.billingPeriod.test('from 01/01/2025 to 01/31/2025')).toBe(true);
    });

  });

  describe('Pattern Detection - Services', () => {

    it('should match hourly rate patterns', () => {
      expect(SERVICES_PATTERNS.hourlyRate.test('$85/hr')).toBe(true);
      expect(SERVICES_PATTERNS.hourlyRate.test('$65.00/hour')).toBe(true);
      expect(SERVICES_PATTERNS.hourlyRate.test('Rate: 75/h')).toBe(true);
    });

    it('should match time-based billing patterns', () => {
      expect(SERVICES_PATTERNS.timeBased.test('3.5 hours')).toBe(true);
      expect(SERVICES_PATTERNS.timeBased.test('2 hrs labor')).toBe(true);
      expect(SERVICES_PATTERNS.timeBased.test('1.5 heures')).toBe(true);
    });

    it('should match labor terms', () => {
      expect(SERVICES_PATTERNS.laborTerms.test('Labor - diagnostic')).toBe(true);
      expect(SERVICES_PATTERNS.laborTerms.test('Labour charge')).toBe(true);
      expect(SERVICES_PATTERNS.laborTerms.test("Main d'oeuvre")).toBe(true);
    });

    it('should match repair terms', () => {
      expect(SERVICES_PATTERNS.repairTerms.test('Equipment repair')).toBe(true);
      expect(SERVICES_PATTERNS.repairTerms.test('Maintenance service')).toBe(true);
      expect(SERVICES_PATTERNS.repairTerms.test('Diagnostic fee')).toBe(true);
    });

    it('should match service fee patterns', () => {
      expect(SERVICES_PATTERNS.serviceFee.test('Service call fee')).toBe(true);
      expect(SERVICES_PATTERNS.serviceFee.test('Frais de deplacement')).toBe(true);
      expect(SERVICES_PATTERNS.serviceFee.test('Call-out charge')).toBe(true);
    });

  });

  describe('Helper Functions', () => {

    it('getTypeLabel() should return human-readable labels', () => {
      expect(getTypeLabel('foodSupply')).toBe('Food Supplier');
      expect(getTypeLabel('packagingDistributor')).toBe('Packaging Distributor');
      expect(getTypeLabel('utilities')).toBe('Utilities');
      expect(getTypeLabel('services')).toBe('Services');
      expect(getTypeLabel('generic')).toBe('General');
      expect(getTypeLabel('unknown')).toBe('Unknown');
    });

    it('getTypeIcon() should return emoji icons', () => {
      expect(getTypeIcon('foodSupply')).toBe('🥩');
      expect(getTypeIcon('packagingDistributor')).toBe('📦');
      expect(getTypeIcon('utilities')).toBe('⚡');
      expect(getTypeIcon('services')).toBe('🔧');
      expect(getTypeIcon('generic')).toBe('📄');
    });

    it('isHighConfidence() should correctly classify confidence levels', () => {
      expect(isHighConfidence(85)).toBe(true);
      expect(isHighConfidence(70)).toBe(true);
      expect(isHighConfidence(69)).toBe(false);
      expect(isHighConfidence(50)).toBe(false);
    });

  });

  describe('Edge Cases', () => {

    it('should handle empty line items', () => {
      const emptyInvoice = {
        invoice: { vendorName: 'Test' },
        lineItems: [],
        vendor: null,
        warnings: []
      };

      const result = detectInvoiceType(emptyInvoice);
      expect(result.type).toBe('generic');
    });

    it('should handle missing invoice header', () => {
      const noHeaderInvoice = {
        invoice: null,
        lineItems: [
          { description: 'BEEF 2/5LB', weight: 10, weightUnit: 'lb', quantity: 1, unitPrice: 50, totalPrice: 50 }
        ],
        vendor: null,
        warnings: []
      };

      const result = detectInvoiceType(noHeaderInvoice);
      // Should still detect based on line items
      expect(result.type).toBe('foodSupply');
    });

    it('should handle null/undefined fields gracefully', () => {
      const sparseInvoice = {
        invoice: { vendorName: null },
        lineItems: [
          { description: null, quantity: null, unitPrice: null }
        ],
        vendor: null,
        warnings: []
      };

      // Should not throw
      expect(() => detectInvoiceType(sparseInvoice)).not.toThrow();
    });

  });

});
