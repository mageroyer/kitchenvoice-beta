/**
 * Invoice Type Handlers
 *
 * Exports all handlers and the registry for invoice type-specific processing.
 *
 * @module services/invoice/handlers
 */

export { INVOICE_TYPES } from './types';
export * from './baseHandler';
export {
  packagingDistributorHandler,
  BOXING_FORMAT_PATTERN,
  extractBoxingFormat,
  isBoxingFormat,
  buildPackageUnit
} from './packagingDistributorHandler';
export { foodSupplyHandler } from './foodSupplyHandler';
export { genericHandler } from './genericHandler';
export { utilitiesHandler } from './utilitiesHandler';
export { servicesHandler } from './servicesHandler';
export {
  getHandler,
  getHandlerForVendor,
  getHandlerForCategory,
  getAllHandlerTypes,
  createInventoryItem,
  updateInventoryItem,
  isExpenseType,
  // V2 Pipeline
  processLinesV2,
  processLinesV2ByCategory
} from './handlerRegistry';
