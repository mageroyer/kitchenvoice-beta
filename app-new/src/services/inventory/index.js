/**
 * Inventory Services
 *
 * Business logic layer for inventory management operations.
 *
 * @module services/inventory
 */

export * from './vendorService';
export { default as vendorService } from './vendorService';

export * from './inventoryItemService';
export { default as inventoryItemService } from './inventoryItemService';

export * from './stockService';
export { default as stockService } from './stockService';

export * from './invoiceService';
export { default as invoiceService } from './invoiceService';

export * from './invoiceLineService';
export { default as invoiceLineService } from './invoiceLineService';

export * from './purchaseOrderService';
export { default as purchaseOrderService } from './purchaseOrderService';

export * from './autoOrderService';
export { default as autoOrderService } from './autoOrderService';

// Invoice processing pipeline (Phase 1 & 3)
export * from './invoiceAnalyzer';
export { default as invoiceAnalyzer } from './invoiceAnalyzer';

export * from './invoiceMerger';
export { default as invoiceMerger } from './invoiceMerger';
