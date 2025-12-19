/**
 * Cloud Sync Service
 *
 * Automatic real-time sync using Firebase Firestore.
 * Syncs recipes, categories, and departments across all devices.
 */

import { db, auth } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { recipeDB, categoryDB, departmentDB } from './indexedDB';
import localDb from './indexedDB';
import { createLogger } from '../../utils/logger';

// Create scoped logger for cloudSync module
const logger = createLogger('cloudSync');

/**
 * Remove undefined values from object (Firestore doesn't accept undefined)
 * @param {Object} obj - Object to clean
 * @returns {Object} Object with undefined values removed
 */
const cleanForFirestore = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value === null) {
      cleaned[key] = null;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        typeof item === 'object' ? cleanForFirestore(item) : item
      );
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      cleaned[key] = cleanForFirestore(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// Data change notification callbacks
let dataChangeCallbacks = [];

/**
 * Register a callback for data change notifications
 */
export const onDataChange = (callback) => {
  dataChangeCallbacks.push(callback);
  return () => {
    dataChangeCallbacks = dataChangeCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notify all registered callbacks of a data change
 */
const notifyDataChange = (dataType) => {
  console.log(`📢 Data changed: ${dataType}`);
  dataChangeCallbacks.forEach(cb => {
    try {
      cb(dataType);
    } catch (err) {
      console.error('Error in data change callback:', err);
    }
  });
};

// Sync state
let syncListeners = [];
let syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
let statusCallbacks = [];
let initialSyncDone = false;
let pendingDataChange = null;

/**
 * Get the sync ID for the current user
 * SECURITY: Each user gets their own isolated data space based on their UID
 */
const getSyncId = () => {
  // CRITICAL: Use the authenticated user's UID for data isolation
  const currentUser = auth?.currentUser;
  if (currentUser?.uid) {
    return `user_${currentUser.uid}`;
  }

  // Fallback for legacy/migration - but warn about it
  const legacySyncId = localStorage.getItem('smartcookbook_sync_id');
  if (legacySyncId && legacySyncId !== 'shared_recipes') {
    console.warn('⚠️ Using legacy sync ID. Consider migrating to user-based sync.');
    return legacySyncId;
  }

  // No authenticated user - this shouldn't happen in normal flow
  console.error('❌ SECURITY: No authenticated user for sync. Data will not sync.');
  return null;
};

export const setSyncId = (newSyncId) => {
  // This is now deprecated - sync ID is based on user UID
  console.warn('⚠️ setSyncId is deprecated. Sync ID is now based on user UID.');
  localStorage.setItem('smartcookbook_sync_id', newSyncId);
};

// Collection references - with null safety
const getRecipesCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'recipes');
};

const getCategoriesCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'categories');
};

const getDepartmentsCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'departments');
};

// ============================================
// INVENTORY COLLECTION GETTERS
// ============================================

const getVendorsCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'vendors');
};

const getInventoryItemsCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'inventoryItems');
};

const getInvoicesCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'invoices');
};

const getInvoiceLineItemsCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'invoiceLineItems');
};

const getPriceHistoryCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'priceHistory');
};

const getStockTransactionsCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'stockTransactions');
};

const getPurchaseOrdersCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'purchaseOrders');
};

const getPurchaseOrderLinesCollection = () => {
  const syncId = getSyncId();
  if (!syncId) return null;
  return collection(db, 'cookbooks', syncId, 'purchaseOrderLines');
};


// Status management
const setSyncStatus = (status) => {
  syncStatus = status;
  statusCallbacks.forEach(cb => cb(status));
};

export const onSyncStatusChange = (callback) => {
  statusCallbacks.push(callback);
  return () => {
    statusCallbacks = statusCallbacks.filter(cb => cb !== callback);
  };
};

export const getSyncStatusValue = () => syncStatus;

// ============================================
// PUSH TO CLOUD (called after local saves)
// ============================================

/**
 * Sync a recipe to Firestore cloud
 * @param {Object} recipe - Recipe object with id property
 * @returns {Promise<void>}
 */
export const pushRecipe = async (recipe) => {
  if (!db) return;
  const recipesRef = getRecipesCollection();
  if (!recipesRef) {
    console.error('❌ Cannot push recipe: No authenticated user');
    return;
  }
  try {
    setSyncStatus('syncing');
    const recipeDoc = doc(recipesRef, `recipe_${recipe.id}`);
    const cleanedRecipe = cleanForFirestore({
      ...recipe,
      localId: recipe.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(recipeDoc, cleanedRecipe);
    setSyncStatus('synced');
    console.log('☁️ Recipe synced:', recipe.name);
  } catch (error) {
    console.error('❌ Failed to sync recipe:', error);
    setSyncStatus('error');
  }
};

/**
 * Delete a recipe from Firestore cloud
 * @param {number} recipeId - Recipe ID to delete
 * @returns {Promise<void>}
 */
export const deleteRecipeFromCloud = async (recipeId) => {
  if (!db) return;
  const recipesRef = getRecipesCollection();
  if (!recipesRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(recipesRef, `recipe_${recipeId}`));
    setSyncStatus('synced');
    console.log('☁️ Recipe deleted from cloud:', recipeId);
  } catch (error) {
    console.error('❌ Failed to delete recipe from cloud:', error);
    setSyncStatus('error');
  }
};

/**
 * Sync a category to Firestore cloud
 * @param {Object} category - Category object with id property
 * @returns {Promise<void>}
 */
export const pushCategory = async (category) => {
  if (!db) return;
  const categoriesRef = getCategoriesCollection();
  if (!categoriesRef) return;
  try {
    setSyncStatus('syncing');
    const categoryDoc = doc(categoriesRef, `category_${category.id}`);
    const cleanedCategory = cleanForFirestore({
      ...category,
      localId: category.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(categoryDoc, cleanedCategory);
    setSyncStatus('synced');
    console.log('☁️ Category synced:', category.name);
  } catch (error) {
    console.error('❌ Failed to sync category:', error);
    setSyncStatus('error');
  }
};

/**
 * Delete a category from Firestore cloud
 * @param {number} categoryId - Category ID to delete
 * @returns {Promise<void>}
 */
export const deleteCategoryFromCloud = async (categoryId) => {
  if (!db) return;
  const categoriesRef = getCategoriesCollection();
  if (!categoriesRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(categoriesRef, `category_${categoryId}`));
    setSyncStatus('synced');
    console.log('☁️ Category deleted from cloud:', categoryId);
  } catch (error) {
    console.error('❌ Failed to delete category from cloud:', error);
    setSyncStatus('error');
  }
};

/**
 * Sync a department to Firestore cloud
 * @param {Object} department - Department object with id property
 * @returns {Promise<void>}
 */
export const pushDepartment = async (department) => {
  if (!db) return;
  const departmentsRef = getDepartmentsCollection();
  if (!departmentsRef) return;
  try {
    setSyncStatus('syncing');
    const departmentDoc = doc(departmentsRef, `department_${department.id}`);
    const cleanedDepartment = cleanForFirestore({
      ...department,
      localId: department.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(departmentDoc, cleanedDepartment);
    setSyncStatus('synced');
    console.log('☁️ Department synced:', department.name);
  } catch (error) {
    console.error('❌ Failed to sync department:', error);
    setSyncStatus('error');
  }
};

/**
 * Delete a department from Firestore cloud
 * @param {number} departmentId - Department ID to delete
 * @returns {Promise<void>}
 */
export const deleteDepartmentFromCloud = async (departmentId) => {
  if (!db) return;
  const departmentsRef = getDepartmentsCollection();
  if (!departmentsRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(departmentsRef, `department_${departmentId}`));
    setSyncStatus('synced');
    console.log('☁️ Department deleted from cloud:', departmentId);
  } catch (error) {
    console.error('❌ Failed to delete department from cloud:', error);
    setSyncStatus('error');
  }
};

// ============================================
// INVENTORY PUSH FUNCTIONS
// ============================================

/**
 * Sync a vendor to Firestore cloud
 * @param {Object} vendor - Vendor object with id property
 * @returns {Promise<void>}
 */
export const pushVendor = async (vendor) => {
  if (!db) return;
  const vendorsRef = getVendorsCollection();
  if (!vendorsRef) return;
  try {
    setSyncStatus('syncing');
    const vendorDoc = doc(vendorsRef, `vendor_${vendor.id}`);
    // Clean undefined values before pushing to Firestore
    const cleanedVendor = cleanForFirestore({
      ...vendor,
      localId: vendor.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(vendorDoc, cleanedVendor);
    setSyncStatus('synced');
    logger.debug('Vendor synced', { action: 'pushVendor', data: { name: vendor.name, id: vendor.id } });
  } catch (error) {
    logger.logError('pushVendor', error, { vendorId: vendor?.id });
    setSyncStatus('error');
  }
};

/**
 * Delete a vendor from Firestore cloud
 * @param {number} vendorId - Vendor ID to delete
 * @returns {Promise<void>}
 */
export const deleteVendorFromCloud = async (vendorId) => {
  if (!db) return;
  const vendorsRef = getVendorsCollection();
  if (!vendorsRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(vendorsRef, `vendor_${vendorId}`));
    setSyncStatus('synced');
    logger.debug('Vendor deleted from cloud', { action: 'deleteVendor', data: { vendorId } });
  } catch (error) {
    logger.logError('deleteVendorFromCloud', error, { vendorId });
    setSyncStatus('error');
  }
};

/**
 * Push inventory item to Firestore with retry support
 * @param {Object} item - Inventory item to sync
 * @param {Object} options - Sync options
 * @param {boolean} options.throwOnError - If true, throws error instead of swallowing (default: false for backwards compat)
 * @param {number} options.retryCount - Current retry attempt (default: 0)
 * @param {number} options.maxRetries - Max retry attempts (default: 3)
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
export const pushInventoryItem = async (item, options = {}) => {
  const { throwOnError = false, retryCount = 0, maxRetries = 3 } = options;

  if (!db) {
    const error = new Error('SYNC_NOT_AVAILABLE');
    if (throwOnError) throw error;
    return { success: false, error, offline: true };
  }

  const itemsRef = getInventoryItemsCollection();
  if (!itemsRef) {
    const error = new Error('SYNC_NOT_AVAILABLE');
    if (throwOnError) throw error;
    return { success: false, error, offline: true };
  }

  try {
    setSyncStatus('syncing');
    const itemDoc = doc(itemsRef, `item_${item.id}`);
    // Clean undefined values before pushing to Firestore
    const cleanedItem = cleanForFirestore({
      ...item,
      localId: item.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(itemDoc, cleanedItem);
    setSyncStatus('synced');
    logger.debug('Inventory item synced', { action: 'pushInventoryItem', data: { name: item.name, id: item.id } });
    return { success: true };
  } catch (error) {
    logger.logError('pushInventoryItem', error, { itemId: item?.id, retryCount });
    setSyncStatus('error');

    // Retry logic for transient errors
    const isRetryable = error.code === 'unavailable' || error.message?.includes('network');
    if (isRetryable && retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      logger.debug(`Retrying pushInventoryItem in ${delay}ms`, { retryCount: retryCount + 1 });
      await new Promise(resolve => setTimeout(resolve, delay));
      return pushInventoryItem(item, { ...options, retryCount: retryCount + 1 });
    }

    if (throwOnError) {
      error.syncContext = { entityType: 'inventoryItem', entityId: item?.id, operation: 'push' };
      throw error;
    }
    return { success: false, error, retryExhausted: retryCount >= maxRetries };
  }
};

/**
 * Delete an inventory item from Firestore cloud
 * @param {number} itemId - Inventory item ID to delete
 * @returns {Promise<void>}
 */
export const deleteInventoryItemFromCloud = async (itemId) => {
  if (!db) return;
  const itemsRef = getInventoryItemsCollection();
  if (!itemsRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(itemsRef, `item_${itemId}`));
    setSyncStatus('synced');
    logger.debug('Inventory item deleted from cloud', { action: 'deleteInventoryItem', data: { itemId } });
  } catch (error) {
    logger.logError('deleteInventoryItemFromCloud', error, { itemId });
    setSyncStatus('error');
  }
};

/**
 * Sync an invoice to Firestore cloud
 * @param {Object} invoice - Invoice object with id property
 * @returns {Promise<void>}
 */
export const pushInvoice = async (invoice) => {
  if (!db) return;
  const invoicesRef = getInvoicesCollection();
  if (!invoicesRef) return;
  try {
    setSyncStatus('syncing');
    const invoiceDoc = doc(invoicesRef, `invoice_${invoice.id}`);
    const cleanedInvoice = cleanForFirestore({
      ...invoice,
      localId: invoice.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(invoiceDoc, cleanedInvoice);
    setSyncStatus('synced');
    logger.debug('Invoice synced', { action: 'pushInvoice', data: { invoiceNumber: invoice.invoiceNumber, id: invoice.id } });
  } catch (error) {
    logger.logError('pushInvoice', error, { invoiceId: invoice?.id });
    setSyncStatus('error');
  }
};

export const deleteInvoiceFromCloud = async (invoiceId) => {
  if (!db) return;
  const invoicesRef = getInvoicesCollection();
  if (!invoicesRef) return;
  try {
    setSyncStatus('syncing');
    await deleteDoc(doc(invoicesRef, `invoice_${invoiceId}`));
    setSyncStatus('synced');
    logger.debug('Invoice deleted from cloud', { action: 'deleteInvoice', data: { invoiceId } });
  } catch (error) {
    logger.logError('deleteInvoiceFromCloud', error, { invoiceId });
    setSyncStatus('error');
  }
};

export const pushInvoiceLineItem = async (lineItem) => {
  if (!db) return;
  const linesRef = getInvoiceLineItemsCollection();
  if (!linesRef) return;
  try {
    const lineDoc = doc(linesRef, `line_${lineItem.id}`);
    const cleanedLine = cleanForFirestore({
      ...lineItem,
      localId: lineItem.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(lineDoc, cleanedLine);
  } catch (error) {
    logger.logError('pushInvoiceLineItem', error, { lineItemId: lineItem?.id });
  }
};

export const deleteInvoiceLineItemFromCloud = async (lineItemId) => {
  if (!db) return;
  const linesRef = getInvoiceLineItemsCollection();
  if (!linesRef) return;
  try {
    await deleteDoc(doc(linesRef, `line_${lineItemId}`));
  } catch (error) {
    logger.logError('deleteInvoiceLineItemFromCloud', error, { lineItemId });
  }
};

export const pushPriceHistory = async (priceRecord) => {
  if (!db) return;
  const historyRef = getPriceHistoryCollection();
  if (!historyRef) return;
  try {
    const priceDoc = doc(historyRef, `price_${priceRecord.id}`);
    const cleanedRecord = cleanForFirestore({
      ...priceRecord,
      localId: priceRecord.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(priceDoc, cleanedRecord);
  } catch (error) {
    logger.logError('pushPriceHistory', error, { priceRecordId: priceRecord?.id });
  }
};

export const pushStockTransaction = async (transaction) => {
  if (!db) return;
  const txRef = getStockTransactionsCollection();
  if (!txRef) return;
  try {
    const txDoc = doc(txRef, `tx_${transaction.id}`);
    const cleanedTx = cleanForFirestore({
      ...transaction,
      localId: transaction.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(txDoc, cleanedTx);
  } catch (error) {
    logger.logError('pushStockTransaction', error, { transactionId: transaction?.id });
  }
};

export const pushPurchaseOrder = async (order) => {
  if (!db) return;
  const ordersRef = getPurchaseOrdersCollection();
  if (!ordersRef) return;
  try {
    setSyncStatus('syncing');
    const orderDoc = doc(ordersRef, `po_${order.id}`);
    const cleanedOrder = cleanForFirestore({
      ...order,
      localId: order.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(orderDoc, cleanedOrder);
    setSyncStatus('synced');
    logger.debug('Purchase order synced', { action: 'pushPurchaseOrder', data: { id: order.id } });
  } catch (error) {
    logger.logError('pushPurchaseOrder', error, { orderId: order?.id });
    setSyncStatus('error');
  }
};

export const deletePurchaseOrderFromCloud = async (orderId) => {
  if (!db) return;
  const ordersRef = getPurchaseOrdersCollection();
  if (!ordersRef) return;
  try {
    await deleteDoc(doc(ordersRef, `po_${orderId}`));
  } catch (error) {
    logger.logError('deletePurchaseOrderFromCloud', error, { orderId });
  }
};

export const pushPurchaseOrderLine = async (line) => {
  if (!db) return;
  const linesRef = getPurchaseOrderLinesCollection();
  if (!linesRef) return;
  try {
    const lineDoc = doc(linesRef, `poLine_${line.id}`);
    const cleanedLine = cleanForFirestore({
      ...line,
      localId: line.id,
      syncedAt: new Date().toISOString()
    });
    await setDoc(lineDoc, cleanedLine);
  } catch (error) {
    logger.logError('pushPurchaseOrderLine', error, { lineId: line?.id });
  }
};

export const deletePurchaseOrderLineFromCloud = async (lineId) => {
  if (!db) return;
  const linesRef = getPurchaseOrderLinesCollection();
  if (!linesRef) return;
  try {
    await deleteDoc(doc(linesRef, `poLine_${lineId}`));
  } catch (error) {
    logger.logError('deletePurchaseOrderLineFromCloud', error, { lineId });
  }
};


// ============================================
// INITIAL SYNC (on app load)
// ============================================

export const initialSync = async () => {
  if (!db) {
    console.warn('⚠️ Firebase not initialized, skipping sync');
    return;
  }

  // Check for authenticated user
  const syncId = getSyncId();
  if (!syncId) {
    console.error('❌ Cannot sync: No authenticated user');
    setSyncStatus('error');
    return;
  }

  setSyncStatus('syncing');
  console.log('🔄 Starting initial sync for user:', syncId);

  try {
    // Sync departments first (categories depend on them)
    await syncDepartments();

    // Then sync categories
    await syncCategories();

    // Finally sync recipes
    await syncRecipes();

    // Sync inventory data (in dependency order)
    await syncVendors();
    await syncInventoryItems();
    await syncInvoices();
    await syncPurchaseOrders();
    await syncInvoiceLineItems();
    await syncPriceHistory();
    await syncStockTransactions();
    await syncPurchaseOrderLines();

    initialSyncDone = true;
    setSyncStatus('synced');
    console.log('✅ Initial sync complete (including inventory)');
  } catch (error) {
    console.error('❌ Initial sync failed:', error);
    setSyncStatus('error');
  }
};


/**
 * Reset sync state (call on logout or app close)
 * Clears all pending timeouts and resets flags to prevent memory leaks
 */
export const resetSyncState = () => {
  initialSyncDone = false;
  syncStatus = 'idle';

  // Clear pending data change timeout
  if (pendingDataChange) {
    clearTimeout(pendingDataChange);
    pendingDataChange = null;
  }

  // Clear status callbacks to prevent memory leaks from orphaned listeners
  statusCallbacks = [];

  console.log('[CloudSync] Sync state reset');
};

const syncDepartments = async () => {
  const deptCollection = getDepartmentsCollection();
  if (!deptCollection) return;

  const cloudDepts = await getDocs(deptCollection);
  const localDepts = await departmentDB.getAll();

  const cloudMap = new Map();
  cloudDepts.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localDepts.forEach(dept => localMap.set(dept.id, dept));

  // Download new/updated from cloud
  for (const [localId, cloudDept] of cloudMap) {
    const localDept = localMap.get(localId);
    if (!localDept) {
      // New from cloud - use put() to preserve the ID
      await localDb.departments.put({
        id: localId,
        name: cloudDept.name,
        isDefault: cloudDept.isDefault || false,
        createdAt: cloudDept.createdAt
      });
      console.log('⬇️ Downloaded department:', cloudDept.name);
    }
  }

  // Upload local to cloud
  for (const [id, localDept] of localMap) {
    if (!cloudMap.has(id)) {
      await pushDepartment(localDept);
      console.log('⬆️ Uploaded department:', localDept.name);
    }
  }
};

const syncCategories = async () => {
  const catCollection = getCategoriesCollection();
  if (!catCollection) return;

  const cloudCats = await getDocs(catCollection);
  const localCats = await categoryDB.getAll();

  const cloudMap = new Map();
  cloudCats.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localCats.forEach(cat => localMap.set(cat.id, cat));

  // Download new from cloud - use put() to preserve the ID
  for (const [localId, cloudCat] of cloudMap) {
    const localCat = localMap.get(localId);
    if (!localCat) {
      await localDb.categories.put({
        id: localId,
        name: cloudCat.name,
        departmentId: cloudCat.departmentId,
        isDefault: cloudCat.isDefault || false,
        createdAt: cloudCat.createdAt
      });
      console.log('⬇️ Downloaded category:', cloudCat.name);
    }
  }

  // Upload local to cloud
  for (const [id, localCat] of localMap) {
    if (!cloudMap.has(id)) {
      await pushCategory(localCat);
      console.log('⬆️ Uploaded category:', localCat.name);
    }
  }
};

const syncRecipes = async () => {
  const recipeCollection = getRecipesCollection();
  if (!recipeCollection) return;

  const cloudRecipes = await getDocs(recipeCollection);
  const localRecipes = await recipeDB.getAll();

  const cloudMap = new Map();
  cloudRecipes.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localRecipes.forEach(recipe => localMap.set(recipe.id, recipe));

  // Download new/updated from cloud
  for (const [localId, cloudRecipe] of cloudMap) {
    const localRecipe = localMap.get(localId);
    const { localId: _, syncedAt, ...recipeData } = cloudRecipe;

    if (!localRecipe) {
      // New from cloud - use put() to preserve the ID
      await localDb.recipes.put({
        ...recipeData,
        id: localId
      });
      console.log('⬇️ Downloaded recipe:', cloudRecipe.name);
    } else {
      // Compare timestamps
      const cloudDate = new Date(cloudRecipe.updatedAt || 0);
      const localDate = new Date(localRecipe.updatedAt || 0);

      if (cloudDate > localDate) {
        await localDb.recipes.update(localId, recipeData);
        console.log('⬇️ Updated recipe from cloud:', cloudRecipe.name);
      }
    }
  }

  // Upload local to cloud
  for (const [id, localRecipe] of localMap) {
    const cloudRecipe = cloudMap.get(id);

    if (!cloudRecipe) {
      await pushRecipe(localRecipe);
      console.log('⬆️ Uploaded recipe:', localRecipe.name);
    } else {
      const cloudDate = new Date(cloudRecipe.updatedAt || 0);
      const localDate = new Date(localRecipe.updatedAt || 0);

      if (localDate > cloudDate) {
        await pushRecipe(localRecipe);
        console.log('⬆️ Updated recipe to cloud:', localRecipe.name);
      }
    }
  }
};

// ============================================
// INVENTORY SYNC FUNCTIONS
// ============================================

const syncVendors = async () => {
  const vendorCollection = getVendorsCollection();
  if (!vendorCollection) return;

  const cloudVendors = await getDocs(vendorCollection);
  const localVendors = await localDb.vendors.toArray();

  const cloudMap = new Map();
  cloudVendors.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localVendors.forEach(v => localMap.set(v.id, v));

  // Download new/updated from cloud
  for (const [localId, cloudVendor] of cloudMap) {
    const localVendor = localMap.get(localId);
    const { localId: _, syncedAt, ...vendorData } = cloudVendor;

    if (!localVendor) {
      await localDb.vendors.put({ ...vendorData, id: localId });
      logger.debug('Downloaded vendor', { action: 'syncVendors', data: { name: cloudVendor.name } });
    } else {
      const cloudDate = new Date(cloudVendor.updatedAt || 0);
      const localDate = new Date(localVendor.updatedAt || 0);
      if (cloudDate > localDate) {
        await localDb.vendors.update(localId, vendorData);
        logger.debug('Updated vendor from cloud', { action: 'syncVendors', data: { name: cloudVendor.name } });
      }
    }
  }

  // Upload local to cloud
  for (const [id, localVendor] of localMap) {
    const cloudVendor = cloudMap.get(id);
    if (!cloudVendor) {
      await pushVendor(localVendor);
      logger.debug('Uploaded vendor', { action: 'syncVendors', data: { name: localVendor.name } });
    } else {
      const cloudDate = new Date(cloudVendor.updatedAt || 0);
      const localDate = new Date(localVendor.updatedAt || 0);
      if (localDate > cloudDate) {
        await pushVendor(localVendor);
      }
    }
  }
};

const syncInventoryItems = async () => {
  const itemCollection = getInventoryItemsCollection();
  if (!itemCollection) return;

  const cloudItems = await getDocs(itemCollection);
  const localItems = await localDb.inventoryItems.toArray();

  const cloudMap = new Map();
  cloudItems.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localItems.forEach(i => localMap.set(i.id, i));

  for (const [localId, cloudItem] of cloudMap) {
    const localItem = localMap.get(localId);
    const { localId: _, syncedAt, ...itemData } = cloudItem;

    if (!localItem) {
      await localDb.inventoryItems.put({ ...itemData, id: localId });
      logger.debug('Downloaded inventory item', { action: 'syncInventoryItems', data: { name: cloudItem.name } });
    } else {
      const cloudDate = new Date(cloudItem.updatedAt || 0);
      const localDate = new Date(localItem.updatedAt || 0);
      if (cloudDate > localDate) {
        await localDb.inventoryItems.update(localId, itemData);
      }
    }
  }

  for (const [id, localItem] of localMap) {
    const cloudItem = cloudMap.get(id);
    if (!cloudItem) {
      await pushInventoryItem(localItem);
    } else {
      const cloudDate = new Date(cloudItem.updatedAt || 0);
      const localDate = new Date(localItem.updatedAt || 0);
      if (localDate > cloudDate) {
        await pushInventoryItem(localItem);
      }
    }
  }
};

const syncInvoices = async () => {
  const invoiceCollection = getInvoicesCollection();
  if (!invoiceCollection) return;

  const cloudInvoices = await getDocs(invoiceCollection);
  const localInvoices = await localDb.invoices.toArray();

  const cloudMap = new Map();
  cloudInvoices.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localInvoices.forEach(i => localMap.set(i.id, i));

  for (const [localId, cloudInvoice] of cloudMap) {
    const localInvoice = localMap.get(localId);
    const { localId: _, syncedAt, ...invoiceData } = cloudInvoice;

    if (!localInvoice) {
      await localDb.invoices.put({ ...invoiceData, id: localId });
      logger.debug('Downloaded invoice', { action: 'syncInvoices', data: { invoiceNumber: cloudInvoice.invoiceNumber } });
    } else {
      const cloudDate = new Date(cloudInvoice.updatedAt || 0);
      const localDate = new Date(localInvoice.updatedAt || 0);
      if (cloudDate > localDate) {
        await localDb.invoices.update(localId, invoiceData);
      }
    }
  }

  for (const [id, localInvoice] of localMap) {
    if (!cloudMap.has(id)) {
      await pushInvoice(localInvoice);
    }
  }
};

const syncInvoiceLineItems = async () => {
  const lineCollection = getInvoiceLineItemsCollection();
  if (!lineCollection) return;

  const cloudLines = await getDocs(lineCollection);
  const localLines = await localDb.invoiceLineItems.toArray();

  const cloudMap = new Map();
  cloudLines.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localLines.forEach(l => localMap.set(l.id, l));

  for (const [localId, cloudLine] of cloudMap) {
    const localLine = localMap.get(localId);
    const { localId: _, syncedAt, ...lineData } = cloudLine;

    if (!localLine) {
      await localDb.invoiceLineItems.put({ ...lineData, id: localId });
    }
  }

  for (const [id, localLine] of localMap) {
    if (!cloudMap.has(id)) {
      await pushInvoiceLineItem(localLine);
    }
  }
};

const syncPriceHistory = async () => {
  const historyCollection = getPriceHistoryCollection();
  if (!historyCollection) return;

  const cloudHistory = await getDocs(historyCollection);
  const localHistory = await localDb.priceHistory.toArray();

  const cloudMap = new Map();
  cloudHistory.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localHistory.forEach(h => localMap.set(h.id, h));

  for (const [localId, cloudRecord] of cloudMap) {
    if (!localMap.has(localId)) {
      const { localId: _, syncedAt, ...recordData } = cloudRecord;
      await localDb.priceHistory.put({ ...recordData, id: localId });
    }
  }

  for (const [id, localRecord] of localMap) {
    if (!cloudMap.has(id)) {
      await pushPriceHistory(localRecord);
    }
  }
};

const syncStockTransactions = async () => {
  const txCollection = getStockTransactionsCollection();
  if (!txCollection) return;

  const cloudTx = await getDocs(txCollection);
  const localTx = await localDb.stockTransactions.toArray();

  const cloudMap = new Map();
  cloudTx.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localTx.forEach(t => localMap.set(t.id, t));

  for (const [localId, cloudTransaction] of cloudMap) {
    if (!localMap.has(localId)) {
      const { localId: _, syncedAt, ...txData } = cloudTransaction;
      await localDb.stockTransactions.put({ ...txData, id: localId });
    }
  }

  for (const [id, localTransaction] of localMap) {
    if (!cloudMap.has(id)) {
      await pushStockTransaction(localTransaction);
    }
  }
};

const syncPurchaseOrders = async () => {
  const orderCollection = getPurchaseOrdersCollection();
  if (!orderCollection) return;

  const cloudOrders = await getDocs(orderCollection);
  const localOrders = await localDb.purchaseOrders.toArray();

  const cloudMap = new Map();
  cloudOrders.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localOrders.forEach(o => localMap.set(o.id, o));

  for (const [localId, cloudOrder] of cloudMap) {
    const localOrder = localMap.get(localId);
    const { localId: _, syncedAt, ...orderData } = cloudOrder;

    if (!localOrder) {
      await localDb.purchaseOrders.put({ ...orderData, id: localId });
      logger.debug('Downloaded purchase order', { action: 'syncPurchaseOrders', data: { id: localId } });
    } else {
      const cloudDate = new Date(cloudOrder.updatedAt || 0);
      const localDate = new Date(localOrder.updatedAt || 0);
      if (cloudDate > localDate) {
        await localDb.purchaseOrders.update(localId, orderData);
      }
    }
  }

  for (const [id, localOrder] of localMap) {
    if (!cloudMap.has(id)) {
      await pushPurchaseOrder(localOrder);
    }
  }
};

const syncPurchaseOrderLines = async () => {
  const lineCollection = getPurchaseOrderLinesCollection();
  if (!lineCollection) return;

  const cloudLines = await getDocs(lineCollection);
  const localLines = await localDb.purchaseOrderLines.toArray();

  const cloudMap = new Map();
  cloudLines.forEach(doc => {
    const data = doc.data();
    cloudMap.set(data.localId, data);
  });

  const localMap = new Map();
  localLines.forEach(l => localMap.set(l.id, l));

  for (const [localId, cloudLine] of cloudMap) {
    if (!localMap.has(localId)) {
      const { localId: _, syncedAt, ...lineData } = cloudLine;
      await localDb.purchaseOrderLines.put({ ...lineData, id: localId });
    }
  }

  for (const [id, localLine] of localMap) {
    if (!cloudMap.has(id)) {
      await pushPurchaseOrderLine(localLine);
    }
  }
};


// ============================================
// REAL-TIME LISTENERS
// ============================================

export const startRealtimeSync = (onDataChange) => {
  if (!db) {
    console.warn('⚠️ Firebase not initialized, skipping realtime sync');
    return;
  }

  // Verify we have collections to listen to
  const recipeCollection = getRecipesCollection();
  const catCollection = getCategoriesCollection();
  const deptCollection = getDepartmentsCollection();

  if (!recipeCollection || !catCollection || !deptCollection) {
    console.error('❌ Cannot start realtime sync: No authenticated user');
    return;
  }

  console.log('👂 Starting real-time sync listeners...');

  // Listen for recipe changes
  const recipesUnsubscribe = onSnapshot(recipeCollection, async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      const { localId, syncedAt, ...recipeData } = data;

      if (change.type === 'added' || change.type === 'modified') {
        const localRecipe = await recipeDB.getById(localId);

        if (!localRecipe) {
          // New recipe from another device
          await localDb.recipes.put({ ...recipeData, id: localId });
          console.log('📥 Real-time: New recipe received:', data.name);
          onDataChange?.('recipes');
        } else {
          const cloudDate = new Date(data.updatedAt || 0);
          const localDate = new Date(localRecipe.updatedAt || 0);

          if (cloudDate > localDate) {
            await localDb.recipes.update(localId, recipeData);
            console.log('📥 Real-time: Recipe updated:', data.name);
            onDataChange?.('recipes');
          }
        }
      } else if (change.type === 'removed') {
        await localDb.recipes.delete(localId);
        console.log('📥 Real-time: Recipe deleted:', localId);
        onDataChange?.('recipes');
      }
    });
  });

  // Listen for category changes
  const categoriesUnsubscribe = onSnapshot(catCollection, async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      const { localId, syncedAt, ...catData } = data;

      if (change.type === 'added' || change.type === 'modified') {
        const localCat = await categoryDB.getById(localId);

        if (!localCat) {
          await localDb.categories.put({ ...catData, id: localId });
          console.log('📥 Real-time: New category received:', data.name);
          onDataChange?.('categories');
        }
      } else if (change.type === 'removed') {
        await localDb.categories.delete(localId);
        console.log('📥 Real-time: Category deleted:', localId);
        onDataChange?.('categories');
      }
    });
  });

  // Listen for department changes
  const departmentsUnsubscribe = onSnapshot(deptCollection, async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const data = change.doc.data();
      const { localId, syncedAt, ...deptData } = data;

      if (change.type === 'added' || change.type === 'modified') {
        const localDept = await departmentDB.getById(localId);

        if (!localDept) {
          await localDb.departments.put({ ...deptData, id: localId });
          console.log('📥 Real-time: New department received:', data.name);
          onDataChange?.('departments');
        }
      } else if (change.type === 'removed') {
        await localDb.departments.delete(localId);
        console.log('📥 Real-time: Department deleted:', localId);
        onDataChange?.('departments');
      }
    });
  });

  

  // ============================================
  // INVENTORY REAL-TIME LISTENERS
  // ============================================

  // Vendors listener
  const vendorsCollection = getVendorsCollection();
  const vendorsUnsubscribe = vendorsCollection ? onSnapshot(vendorsCollection, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      const { localId, syncedAt, ...vendorData } = data;
      if (change.type === 'added' || change.type === 'modified') {
        const localVendor = await localDb.vendors.get(localId);
        if (!localVendor) {
          await localDb.vendors.put({ ...vendorData, id: localId });
          notifyDataChange('vendors');
        } else {
          const cloudDate = new Date(data.updatedAt || 0);
          const localDate = new Date(localVendor.updatedAt || 0);
          if (cloudDate > localDate) {
            await localDb.vendors.update(localId, vendorData);
            notifyDataChange('vendors');
          }
        }
      } else if (change.type === 'removed') {
        await localDb.vendors.delete(localId);
        notifyDataChange('vendors');
      }
    }
  }) : () => {};

  // Inventory items listener
  const itemsCollection = getInventoryItemsCollection();
  const itemsUnsubscribe = itemsCollection ? onSnapshot(itemsCollection, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      const { localId, syncedAt, ...itemData } = data;
      if (change.type === 'added' || change.type === 'modified') {
        const localItem = await localDb.inventoryItems.get(localId);
        if (!localItem) {
          await localDb.inventoryItems.put({ ...itemData, id: localId });
          notifyDataChange('inventoryItems');
        } else {
          const cloudDate = new Date(data.updatedAt || 0);
          const localDate = new Date(localItem.updatedAt || 0);
          if (cloudDate > localDate) {
            await localDb.inventoryItems.update(localId, itemData);
            notifyDataChange('inventoryItems');
          }
        }
      } else if (change.type === 'removed') {
        await localDb.inventoryItems.delete(localId);
        notifyDataChange('inventoryItems');
      }
    }
  }) : () => {};

  // Invoices listener
  const invoicesCollection = getInvoicesCollection();
  const invoicesUnsubscribe = invoicesCollection ? onSnapshot(invoicesCollection, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      const { localId, syncedAt, ...invoiceData } = data;
      if (change.type === 'added' || change.type === 'modified') {
        const localInvoice = await localDb.invoices.get(localId);
        if (!localInvoice) {
          await localDb.invoices.put({ ...invoiceData, id: localId });
          notifyDataChange('invoices');
        } else {
          const cloudDate = new Date(data.updatedAt || 0);
          const localDate = new Date(localInvoice.updatedAt || 0);
          if (cloudDate > localDate) {
            await localDb.invoices.update(localId, invoiceData);
            notifyDataChange('invoices');
          }
        }
      } else if (change.type === 'removed') {
        await localDb.invoices.delete(localId);
        notifyDataChange('invoices');
      }
    }
  }) : () => {};

  // Purchase orders listener
  const ordersCollection = getPurchaseOrdersCollection();
  const ordersUnsubscribe = ordersCollection ? onSnapshot(ordersCollection, async (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data();
      const { localId, syncedAt, ...orderData } = data;
      if (change.type === 'added' || change.type === 'modified') {
        const localOrder = await localDb.purchaseOrders.get(localId);
        if (!localOrder) {
          await localDb.purchaseOrders.put({ ...orderData, id: localId });
          notifyDataChange('purchaseOrders');
        } else {
          const cloudDate = new Date(data.updatedAt || 0);
          const localDate = new Date(localOrder.updatedAt || 0);
          if (cloudDate > localDate) {
            await localDb.purchaseOrders.update(localId, orderData);
            notifyDataChange('purchaseOrders');
          }
        }
      } else if (change.type === 'removed') {
        await localDb.purchaseOrders.delete(localId);
        notifyDataChange('purchaseOrders');
      }
    }
  }) : () => {};

  syncListeners = [
    recipesUnsubscribe, categoriesUnsubscribe, departmentsUnsubscribe,
    vendorsUnsubscribe, itemsUnsubscribe, invoicesUnsubscribe, ordersUnsubscribe
  ];
  console.log('✅ Real-time listeners active');
};

export const stopRealtimeSync = () => {
  syncListeners.forEach(unsubscribe => unsubscribe());
  syncListeners = [];
  console.log('🛑 Real-time listeners stopped');
};

// ============================================
// LEGACY FUNCTIONS (keep for manual sync UI)
// ============================================

export const uploadToCloud = async () => {
  if (!db) throw new Error('Firebase not initialized');

  const localRecipes = await recipeDB.getAll();
  const recipesRef = getRecipesCollection();

  const batch = writeBatch(db);

  const existingDocs = await getDocs(recipesRef);
  existingDocs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  for (const recipe of localRecipes) {
    const recipeDoc = doc(recipesRef, `recipe_${recipe.id}`);
    batch.set(recipeDoc, {
      ...recipe,
      localId: recipe.id,
      syncedAt: new Date().toISOString()
    });
  }

  await batch.commit();

  return {
    uploaded: localRecipes.length,
    message: `Uploaded ${localRecipes.length} recipes to cloud`
  };
};

export const downloadFromCloud = async () => {
  if (!db) throw new Error('Firebase not initialized');

  const recipesRef = getRecipesCollection();
  const snapshot = await getDocs(query(recipesRef, orderBy('updatedAt', 'desc')));

  const cloudRecipes = [];
  snapshot.forEach((doc) => {
    cloudRecipes.push(doc.data());
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const cloudRecipe of cloudRecipes) {
    const { localId, syncedAt, ...recipeData } = cloudRecipe;
    const localRecipe = await recipeDB.getById(localId);

    if (!localRecipe) {
      await recipeDB.add({ ...recipeData, id: undefined });
      added++;
    } else {
      const cloudDate = new Date(cloudRecipe.updatedAt);
      const localDate = new Date(localRecipe.updatedAt);

      if (cloudDate > localDate) {
        await recipeDB.update(localId, recipeData);
        updated++;
      } else {
        skipped++;
      }
    }
  }

  return {
    added,
    updated,
    skipped,
    total: cloudRecipes.length,
    message: `Downloaded: ${added} new, ${updated} updated, ${skipped} unchanged`
  };
};

export const getSyncStatus = async () => {
  if (!db) {
    return { connected: false, message: 'Firebase not connected' };
  }

  try {
    const localRecipes = await recipeDB.getAll();
    const recipesRef = getRecipesCollection();
    const snapshot = await getDocs(recipesRef);

    return {
      connected: true,
      localCount: localRecipes.length,
      cloudCount: snapshot.size,
      syncId: getSyncId(),
      message: `Local: ${localRecipes.length}, Cloud: ${snapshot.size}`
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      message: 'Failed to check sync status'
    };
  }
};

export default {
  // Auto-sync
  initialSync,
  startRealtimeSync,
  stopRealtimeSync,
  resetSyncState,
  // Recipe sync
  pushRecipe,
  deleteRecipeFromCloud,
  pushCategory,
  deleteCategoryFromCloud,
  pushDepartment,
  deleteDepartmentFromCloud,
  // Inventory sync
  pushVendor,
  deleteVendorFromCloud,
  pushInventoryItem,
  deleteInventoryItemFromCloud,
  pushInvoice,
  deleteInvoiceFromCloud,
  pushInvoiceLineItem,
  deleteInvoiceLineItemFromCloud,
  pushPriceHistory,
  pushStockTransaction,
  pushPurchaseOrder,
  deletePurchaseOrderFromCloud,
  pushPurchaseOrderLine,
  deletePurchaseOrderLineFromCloud,
  // Status
  onSyncStatusChange,
  getSyncStatusValue,
  // Legacy
  uploadToCloud,
  downloadFromCloud,
  getSyncStatus,
  getSyncId,
  setSyncId
};
