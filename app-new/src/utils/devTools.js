/**
 * Development Tools - Browser Console Utilities
 *
 * These functions are exposed to window for easy console access during testing.
 *
 * Usage in browser console:
 *   window.clearInventory()   - Clear inventory items and invoices
 *   window.clearAllData()     - Clear ALL local database data
 *   window.showInventory()    - Show all inventory items
 */

import { db } from '../services/database/db.js';

/**
 * Clear inventory-related data only (for testing invoice imports)
 */
export const clearInventoryData = async () => {
  console.log('🧹 Clearing inventory data...');
  try {
    const inventoryCount = await db.inventoryItems.count();
    const invoiceCount = await db.invoices.count();
    const vendorCount = await db.vendors.count();

    await db.inventoryItems.clear();
    await db.invoices.clear();
    await db.invoiceLineItems.clear();
    await db.priceHistory.clear();
    await db.stockTransactions.clear();

    // Verify it worked
    const afterCount = await db.inventoryItems.count();
    console.log(`✅ Cleared: ${inventoryCount} → ${afterCount} inventory items`);
    console.log(`   Cleared: ${invoiceCount} invoices`);
    console.log(`   Vendors kept: ${vendorCount}`);
    console.log('⚠️  REFRESH THE PAGE to see changes in UI');
    return { inventoryCount, invoiceCount, afterCount };
  } catch (error) {
    console.error('[DevTools] Error clearing inventory data:', error);
    return false;
  }
};

/**
 * Clear inventory INCLUDING vendors (full reset)
 */
export const clearInventoryFull = async () => {
  console.log('🧹 Clearing ALL inventory data including vendors...');
  try {
    const counts = {
      inventory: await db.inventoryItems.count(),
      invoices: await db.invoices.count(),
      vendors: await db.vendors.count(),
      lineItems: await db.invoiceLineItems.count(),
      priceHistory: await db.priceHistory.count(),
      transactions: await db.stockTransactions.count(),
      orders: await db.purchaseOrders.count(),
      orderLines: await db.purchaseOrderLines.count()
    };

    // Clear all inventory-related tables
    await db.inventoryItems.clear();
    await db.invoices.clear();
    await db.invoiceLineItems.clear();
    await db.priceHistory.clear();
    await db.stockTransactions.clear();
    await db.purchaseOrders.clear();
    await db.purchaseOrderLines.clear();
    await db.vendors.clear();

    console.log('✅ Cleared all inventory tables:');
    console.table(counts);
    console.log('⚠️  HARD REFRESH (Ctrl+Shift+R) to see changes');
    return counts;
  } catch (error) {
    console.error('[DevTools] Error:', error);
    return false;
  }
};

/**
 * Clear ALL local data
 */
export const clearAllData = async () => {
  console.log('🧹 Clearing ALL local data...');
  try {
    await db.recipes.clear();
    await db.departments.clear();
    await db.categories.clear();
    await db.sliders.clear();
    await db.kitchenSettings.clear();
    await db.productionLogs.clear();
    await db.invoices.clear();
    await db.priceHistory.clear();
    await db.vendors.clear();
    await db.inventoryItems.clear();
    await db.invoiceLineItems.clear();
    await db.stockTransactions.clear();
    await db.purchaseOrders.clear();
    await db.purchaseOrderLines.clear();
    console.log('✅ All local data cleared');
    return true;
  } catch (error) {
    console.error('[DevTools] Error clearing all data:', error);
    return false;
  }
};

/**
 * Show all inventory items in console
 */
export const showInventory = async () => {
  try {
    const items = await db.inventoryItems.toArray();
    console.table(items.map(i => ({
      id: i.id,
      name: i.name,
      vendor: i.vendorName,
      stockQty: i.stockQuantity,
      stockWgt: i.stockWeight,
      price: i.currentPrice
    })));
    return items;
  } catch (error) {
    console.error('[DevTools] Error:', error);
    return [];
  }
};

/**
 * Show all invoices in console
 */
export const showInvoices = async () => {
  try {
    const invoices = await db.invoices.toArray();
    console.table(invoices.map(i => ({
      id: i.id,
      vendor: i.vendorName,
      number: i.invoiceNumber,
      total: i.totalAmount,
      status: i.status
    })));
    return invoices;
  } catch (error) {
    console.error('[DevTools] Error:', error);
    return [];
  }
};

// Auto-expose to window in development
if (typeof window !== 'undefined') {
  window.clearInventory = clearInventoryData;
  window.clearInventoryFull = clearInventoryFull;
  window.clearAllData = clearAllData;
  window.showInventory = showInventory;
  window.showInvoices = showInvoices;

  console.log('🔧 DevTools loaded. Available commands:');
  console.log('   window.clearInventory()     - Clear inventory & invoices (keeps vendors)');
  console.log('   window.clearInventoryFull() - Clear ALL inventory + vendors');
  console.log('   window.clearAllData()       - Clear all local data');
  console.log('   window.showInventory()      - Show inventory items');
  console.log('   window.showInvoices()       - Show invoices');
}
