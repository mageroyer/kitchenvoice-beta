/**
 * Demo Mode Service
 *
 * Manages demo mode state and data population
 */

import { DEMO_RECIPES, DEMO_INGREDIENTS, DEMO_INVOICES } from './demoData';

const DEMO_MODE_KEY = 'smartcookbook_demo_mode';
const DEMO_INITIALIZED_KEY = 'smartcookbook_demo_initialized';

/**
 * Check if app is in demo mode
 */
export function isDemoMode() {
  return localStorage.getItem(DEMO_MODE_KEY) === 'true';
}

/**
 * Enable demo mode
 */
export function enableDemoMode() {
  localStorage.setItem(DEMO_MODE_KEY, 'true');
}

/**
 * Disable demo mode
 */
export function disableDemoMode() {
  localStorage.removeItem(DEMO_MODE_KEY);
  localStorage.removeItem(DEMO_INITIALIZED_KEY);
}

/**
 * Check if demo data has been initialized
 */
export function isDemoInitialized() {
  return localStorage.getItem(DEMO_INITIALIZED_KEY) === 'true';
}

/**
 * Initialize demo data in IndexedDB
 */
export async function initializeDemoData() {
  if (isDemoInitialized()) {
    console.log('Demo data already initialized');
    return;
  }

  console.log('🎭 Initializing demo data...');

  try {
    // Import database modules
    const { recipeDB, inventoryItemDB, invoiceDB } = await import('../database/indexedDB');

    // Clear any existing data first
    const existingRecipes = await recipeDB.getAll();
    for (const recipe of existingRecipes) {
      await recipeDB.delete(recipe.id);
    }

    const existingItems = await inventoryItemDB.getAll();
    for (const item of existingItems) {
      await inventoryItemDB.delete(item.id);
    }

    const existingInvoices = await invoiceDB.getAll();
    for (const inv of existingInvoices) {
      await invoiceDB.delete(inv.id);
    }

    // Add demo inventory items (from DEMO_INGREDIENTS data)
    console.log('Adding demo inventory items...');
    for (const ingredient of DEMO_INGREDIENTS) {
      // Map old ingredient format to inventoryItem format
      await inventoryItemDB.create({
        name: ingredient.name,
        category: ingredient.category || 'Other',
        vendorId: ingredient.vendorId || null,
        unit: ingredient.unit || 'ea',
        currentPrice: ingredient.currentPrice || 0,
        isActive: true
      });
    }

    // Add demo recipes
    console.log('Adding demo recipes...');
    for (const recipe of DEMO_RECIPES) {
      await recipeDB.add(recipe);
    }

    // Add demo invoices
    console.log('Adding demo invoices...');
    for (const invoice of DEMO_INVOICES) {
      await invoiceDB.add(invoice);
    }

    localStorage.setItem(DEMO_INITIALIZED_KEY, 'true');
    console.log('✅ Demo data initialized successfully!');

    return true;
  } catch (error) {
    console.error('Error initializing demo data:', error);
    throw error;
  }
}

/**
 * Reset demo data (clear and re-initialize)
 */
export async function resetDemoData() {
  localStorage.removeItem(DEMO_INITIALIZED_KEY);
  await initializeDemoData();
}

/**
 * Get demo mode status info
 */
export function getDemoStatus() {
  return {
    isDemo: isDemoMode(),
    isInitialized: isDemoInitialized(),
    recipeCount: DEMO_RECIPES.length,
    ingredientCount: DEMO_INGREDIENTS.length,
    invoiceCount: DEMO_INVOICES.length
  };
}

/**
 * In-House test data for testing the In-House inventory tab
 */
const IN_HOUSE_TEST_ITEMS = [
  {
    name: 'Sauce Béarnaise',
    category: 'Sauces',
    sourceDepartment: 'Cuisine',
    sourceRecipeName: 'Sauce Béarnaise',
    unit: 'portion',
    currentStock: 12,
    fullStock: 12,
    parLevel: 20,
    availableAsIngredient: true,
    availableForSale: false,
  },
  {
    name: 'Fond de Veau Maison',
    category: 'Stocks',
    sourceDepartment: 'Cuisine',
    sourceRecipeName: 'Fond de Veau Maison',
    unit: 'L',
    currentStock: 8,
    fullStock: 10,
    parLevel: 15,
    availableAsIngredient: true,
    availableForSale: false,
  },
  {
    name: 'Crème Pâtissière',
    category: 'Pâtisserie',
    sourceDepartment: 'Pâtisserie',
    sourceRecipeName: 'Crème Pâtissière',
    unit: 'kg',
    currentStock: 3,
    fullStock: 5,
    parLevel: 5,
    availableAsIngredient: true,
    availableForSale: false,
  },
  {
    name: 'Tarte aux Pommes',
    category: 'Desserts',
    sourceDepartment: 'Pâtisserie',
    sourceRecipeName: 'Tarte aux Pommes',
    unit: 'portion',
    currentStock: 8,
    fullStock: 12,
    parLevel: 12,
    availableAsIngredient: false,
    availableForSale: true,
  },
  {
    name: 'Vinaigrette Maison',
    category: 'Sauces',
    sourceDepartment: 'Bistro',
    sourceRecipeName: 'Vinaigrette Maison',
    unit: 'L',
    currentStock: 2,
    fullStock: 3,
    parLevel: 4,
    availableAsIngredient: true,
    availableForSale: false,
  },
  {
    name: 'Poulet Rôti',
    category: 'Plats Préparés',
    sourceDepartment: 'Cuisine',
    sourceRecipeName: 'Poulet Rôti aux Herbes',
    unit: 'portion',
    currentStock: 4,
    fullStock: 8,
    parLevel: 10,
    availableAsIngredient: false,
    availableForSale: true,
  },
  {
    name: 'Pâte Feuilletée',
    category: 'Pâtisserie',
    sourceDepartment: 'Pâtisserie',
    sourceRecipeName: 'Pâte Feuilletée',
    unit: 'kg',
    currentStock: 5,
    fullStock: 5,
    parLevel: 8,
    availableAsIngredient: true,
    availableForSale: false,
  },
  {
    name: 'Salade César',
    category: 'Salades',
    sourceDepartment: 'Bistro',
    sourceRecipeName: 'Salade César Classique',
    unit: 'portion',
    currentStock: 0,
    fullStock: 10,
    parLevel: 15,
    availableAsIngredient: false,
    availableForSale: true,
  },
];

/**
 * Seed in-house inventory test data
 * Creates test items linked to the internal vendor for testing the In-House tab
 *
 * Call this from browser console:
 *   import('/src/services/demo/demoService.js').then(m => m.seedInHouseTestData())
 */
export async function seedInHouseTestData() {
  console.log('🏠 Seeding in-house inventory test data...');

  try {
    const { vendorDB, inventoryItemDB } = await import('../database/indexedDB');

    // Get or create internal vendor
    let internalVendor = await vendorDB.getInternal();
    if (!internalVendor) {
      console.log('Creating internal vendor...');
      const internalVendorId = await vendorDB.add({
        name: 'In-House Production',
        vendorCode: 'INTERNAL',
        isInternal: true,
        isActive: true,
        notes: 'Internal vendor for in-house produced items',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      internalVendor = await vendorDB.getById(internalVendorId);
    }
    console.log('Internal vendor:', internalVendor.name, '(ID:', internalVendor.id, ')');

    // Create test in-house items
    let created = 0;
    for (const item of IN_HOUSE_TEST_ITEMS) {
      // Check if item already exists
      const existing = await inventoryItemDB.search(item.name, { limit: 1 });
      if (existing.length > 0 && existing[0].vendorId === internalVendor.id) {
        console.log('  Skipping (exists):', item.name);
        continue;
      }

      await inventoryItemDB.create({
        ...item,
        vendorId: internalVendor.id,
        vendorName: internalVendor.name,
        isActive: true,
        currentPrice: 0,
        lastProductionDate: new Date().toISOString(),
        notes: `Test data - ${item.sourceRecipeName}`,
      });
      console.log('  Created:', item.name);
      created++;
    }

    console.log(`✅ In-house test data seeded! Created ${created} items.`);
    return { success: true, created, total: IN_HOUSE_TEST_ITEMS.length };
  } catch (error) {
    console.error('Error seeding in-house test data:', error);
    throw error;
  }
}

/**
 * Clear in-house test data
 */
export async function clearInHouseTestData() {
  console.log('🗑️ Clearing in-house inventory test data...');

  try {
    const { vendorDB, inventoryItemDB } = await import('../database/indexedDB');

    const internalVendor = await vendorDB.getInternal();
    if (!internalVendor) {
      console.log('No internal vendor found');
      return { success: true, deleted: 0 };
    }

    // Get all items from internal vendor
    const items = await inventoryItemDB.getByVendor(internalVendor.id);

    let deleted = 0;
    for (const item of items) {
      await inventoryItemDB.delete(item.id);
      console.log('  Deleted:', item.name);
      deleted++;
    }

    console.log(`✅ Cleared ${deleted} in-house items`);
    return { success: true, deleted };
  } catch (error) {
    console.error('Error clearing in-house test data:', error);
    throw error;
  }
}

export default {
  isDemoMode,
  enableDemoMode,
  disableDemoMode,
  isDemoInitialized,
  initializeDemoData,
  resetDemoData,
  getDemoStatus,
  seedInHouseTestData,
  clearInHouseTestData
};
