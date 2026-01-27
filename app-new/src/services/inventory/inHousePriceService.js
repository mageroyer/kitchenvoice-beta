/**
 * In-House Price Service
 *
 * Utilities for recalculating prices on in-house produced inventory items
 * based on their source recipe costs.
 */

import { inventoryItemDB, recipeDB } from '../database/indexedDB.js';

// Metric to grams conversion (same as RecipeCostSummary)
const METRIC_TO_GRAMS = { g: 1, kg: 1000, ml: 1, l: 1000, cl: 10 };

/**
 * Parse metric string to grams/ml
 */
function parseMetricToGrams(metric) {
  if (!metric || typeof metric !== 'string') return null;
  const match = metric.trim().match(/^([\d.,]+)\s*(g|kg|ml|l|cl)?$/i);
  if (!match) return null;
  const quantity = parseFloat(match[1].replace(',', '.'));
  if (isNaN(quantity) || quantity < 0) return null;
  const unit = (match[2] || 'g').toLowerCase();
  return quantity * (METRIC_TO_GRAMS[unit] || 1);
}

/**
 * Calculate total recipe cost from ingredients
 *
 * @param {Object} recipe - Recipe with ingredients array
 * @returns {Promise<{cost: number, debug: Object}>} Total cost and debug info
 */
async function calculateRecipeCost(recipe) {
  const debug = {
    recipeName: recipe?.name,
    ingredientCount: 0,
    linkedCount: 0,
    pricedCount: 0,
    ingredients: []
  };

  if (!recipe?.ingredients || !Array.isArray(recipe.ingredients)) {
    console.warn('[inHousePriceService] Recipe has no ingredients array');
    return { cost: 0, debug };
  }

  let totalCost = 0;
  debug.ingredientCount = recipe.ingredients.length;

  for (const ing of recipe.ingredients) {
    if (ing.isSection || !ing.linkedIngredientId) continue;
    debug.linkedCount++;

    try {
      const item = await inventoryItemDB.getById(ing.linkedIngredientId);
      if (!item) {
        console.warn(`[inHousePriceService] Linked item not found: ${ing.linkedIngredientId}`);
        debug.ingredients.push({ name: ing.name, error: 'Item not found' });
        continue;
      }

      let cost = 0;
      const quantity = parseMetricToGrams(ing.metric);

      const ingDebug = {
        name: ing.name,
        metric: ing.metric,
        quantityInGrams: quantity,
        itemPricePerG: item.pricePerG,
        itemPricePerML: item.pricePerML,
        itemPricePerUnit: item.pricePerUnit
      };

      if (quantity && quantity > 0) {
        if (item.pricePerG > 0) {
          cost = quantity * item.pricePerG;
          ingDebug.costMethod = 'pricePerG';
        } else if (item.pricePerML > 0) {
          cost = quantity * item.pricePerML;
          ingDebug.costMethod = 'pricePerML';
        } else if (item.pricePerUnit > 0) {
          // For unit-based, parse quantity from metric
          const qtyMatch = (ing.metric || '').match(/^([\d.,]+)/);
          const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 0;
          cost = qty * item.pricePerUnit;
          ingDebug.costMethod = 'pricePerUnit';
          ingDebug.unitQty = qty;
        } else {
          ingDebug.costMethod = 'none - no pricing data';
        }
      } else {
        ingDebug.costMethod = 'none - invalid quantity';
      }

      ingDebug.cost = cost;
      debug.ingredients.push(ingDebug);

      if (cost > 0) debug.pricedCount++;
      totalCost += cost;
    } catch (err) {
      console.warn(`[inHousePriceService] Error calculating cost for ingredient:`, err);
      debug.ingredients.push({ name: ing.name, error: err.message });
    }
  }

  debug.totalCost = totalCost;
  console.log('[inHousePriceService] Recipe cost calculation:', debug);

  return { cost: totalCost, debug };
}

/**
 * Recalculate price for in-house items from a recipe
 *
 * For multi-output recipes, ALL outputs get the same price per gram/ml
 * because they come from the same input cost.
 *
 * @param {string} recipeId - Recipe ID
 * @param {Array} items - All in-house items from this recipe
 * @returns {Promise<Array>} Results for each item
 */
async function recalculateRecipeOutputPrices(recipeId, items) {
  const results = [];

  console.log('[inHousePriceService] recalculateRecipeOutputPrices called:', { recipeId, itemCount: items.length });

  try {
    // Get the source recipe
    console.log('[inHousePriceService] Looking up recipe:', recipeId);
    const recipe = await recipeDB.getById(recipeId);
    console.log('[inHousePriceService] Recipe lookup result:', recipe ? recipe.name : 'NOT FOUND');

    if (!recipe) {
      console.error('[inHousePriceService] Recipe not found by ID:', recipeId);

      // Try to find recipe by name from sourceRecipeName
      const sourceRecipeName = items[0]?.sourceRecipeName;
      if (sourceRecipeName) {
        console.log('[inHousePriceService] Trying to find recipe by name:', sourceRecipeName);
        const allRecipes = await recipeDB.getAll();
        const matchedRecipe = allRecipes.find(r =>
          r.name.toLowerCase() === sourceRecipeName.toLowerCase()
        );

        if (matchedRecipe) {
          console.log('[inHousePriceService] Found recipe by name:', matchedRecipe.id, matchedRecipe.name);
          // Update items with correct sourceRecipeId
          for (const item of items) {
            await inventoryItemDB.update(item.id, { sourceRecipeId: matchedRecipe.id });
          }
          // Recursively call with correct ID
          return recalculateRecipeOutputPrices(matchedRecipe.id, items);
        }
      }

      return items.map(item => ({
        success: false,
        itemId: item.id,
        itemName: item.name,
        error: `Source recipe not found: ${recipeId} (tried name: ${sourceRecipeName})`
      }));
    }

    // Calculate recipe cost (total input cost)
    const { cost: recipeCost, debug: costDebug } = await calculateRecipeCost(recipe);
    console.log('[inHousePriceService] Recipe cost result:', { recipeCost, costDebug });

    if (recipeCost <= 0) {
      console.warn('[inHousePriceService] Recipe cost is 0 or negative:', costDebug);
      return items.map(item => ({
        success: false,
        itemId: item.id,
        itemName: item.name,
        error: `Could not calculate recipe cost (no priced ingredients). Debug: ${JSON.stringify(costDebug)}`
      }));
    }

    // Calculate TOTAL output weight across all items from this recipe
    let totalOutputWeightKg = 0;
    let isVolume = false;
    const itemWeights = [];

    for (const item of items) {
      const unit = (item.stockWeightUnit || 'kg').toLowerCase();
      const itemIsVolume = item.isLiquid || item.pricingType === 'volume' ||
                           ['l', 'ml', 'cl', 'dl'].includes(unit);

      if (itemIsVolume) isVolume = true;

      // Convert to kg (or L for volume)
      let weightInKg = item.stockWeight || 0;
      const originalWeight = weightInKg;
      if (unit === 'g') weightInKg = weightInKg / 1000;
      else if (unit === 'lb' || unit === 'lbs') weightInKg = weightInKg * 0.453592;
      else if (unit === 'oz') weightInKg = weightInKg * 0.0283495;
      else if (unit === 'ml') weightInKg = weightInKg / 1000;
      else if (unit === 'cl') weightInKg = weightInKg / 100;
      else if (unit === 'dl') weightInKg = weightInKg / 10;
      // kg and L stay as-is

      itemWeights.push({
        name: item.name,
        stockWeight: originalWeight,
        unit,
        convertedKg: weightInKg
      });

      totalOutputWeightKg += weightInKg;
    }

    console.log('[inHousePriceService] Output weight calculation:', {
      items: itemWeights,
      totalOutputWeightKg
    });

    if (totalOutputWeightKg <= 0) {
      return items.map(item => ({
        success: false,
        itemId: item.id,
        itemName: item.name,
        error: 'No output weight found'
      }));
    }

    // Calculate unified price per kg (or per L)
    // All outputs from this recipe get the SAME price per unit weight
    const pricePerKgOrL = recipeCost / totalOutputWeightKg;
    const pricePerGOrML = pricePerKgOrL / 1000;

    console.log('[inHousePriceService] Price calculation:', {
      recipeCost,
      totalOutputWeightKg,
      pricePerKgOrL,
      pricePerGOrML
    });

    // Update all items with the same price
    for (const item of items) {
      try {
        const updateData = {
          updatedAt: new Date().toISOString()
        };

        const itemUnit = (item.stockWeightUnit || 'kg').toLowerCase();
        const itemIsVolume = item.isLiquid || item.pricingType === 'volume' ||
                             ['l', 'ml', 'cl', 'dl'].includes(itemUnit);

        if (itemIsVolume) {
          updateData.pricePerML = Math.round(pricePerGOrML * 1000000) / 1000000;
          updateData.pricingType = 'volume';
        } else {
          updateData.pricePerG = Math.round(pricePerGOrML * 1000000) / 1000000;
          updateData.pricingType = 'weight';
        }

        await inventoryItemDB.update(item.id, updateData);

        results.push({
          success: true,
          itemId: item.id,
          itemName: item.name,
          recipeName: recipe.name,
          recipeCost,
          totalOutputWeight: totalOutputWeightKg,
          itemWeight: item.stockWeight,
          weightUnit: item.stockWeightUnit || 'kg',
          pricePerKg: !itemIsVolume ? Math.round(pricePerKgOrL * 100) / 100 : null,
          pricePerL: itemIsVolume ? Math.round(pricePerKgOrL * 100) / 100 : null,
          isVolume: itemIsVolume
        });
      } catch (err) {
        results.push({
          success: false,
          itemId: item.id,
          itemName: item.name,
          error: err.message
        });
      }
    }

    return results;
  } catch (err) {
    console.error(`[inHousePriceService] Error recalculating prices for recipe ${recipeId}:`, err);
    return items.map(item => ({
      success: false,
      itemId: item.id,
      itemName: item.name,
      error: err.message
    }));
  }
}

/**
 * Recalculate price for a single in-house item
 * (wrapper that handles single item by finding its recipe siblings)
 *
 * @param {Object} item - In-house inventory item
 * @returns {Promise<Object>} Result with success status and updated price
 */
export async function recalculateItemPrice(item) {
  if (!item.sourceRecipeId) {
    return {
      success: false,
      itemId: item.id,
      itemName: item.name,
      error: 'No source recipe linked'
    };
  }

  // Find all items from the same recipe
  const allItems = await inventoryItemDB.getAll();
  const sameRecipeItems = allItems.filter(i => i.sourceRecipeId === item.sourceRecipeId);

  const results = await recalculateRecipeOutputPrices(item.sourceRecipeId, sameRecipeItems);

  // Return result for the requested item
  return results.find(r => r.itemId === item.id) || {
    success: false,
    itemId: item.id,
    itemName: item.name,
    error: 'Item not found in results'
  };
}

/**
 * Recalculate prices for all in-house inventory items
 *
 * Groups items by source recipe and calculates unified price per kg/L
 * for all outputs from the same recipe.
 *
 * @returns {Promise<Object>} Results summary with success/failed counts
 */
export async function recalculateAllInHousePrices() {
  console.log('[inHousePriceService] recalculateAllInHousePrices started');

  const results = {
    total: 0,
    success: [],
    failed: [],
    skipped: []
  };

  try {
    // Get all inventory items
    const allItems = await inventoryItemDB.getAll();
    console.log('[inHousePriceService] Total inventory items:', allItems.length);

    // Filter to in-house items (has sourceRecipeId or itemType='in-house')
    const inHouseItems = allItems.filter(item =>
      item.sourceRecipeId || item.itemType === 'in-house'
    );

    console.log('[inHousePriceService] In-house items found:', inHouseItems.length);
    console.log('[inHousePriceService] In-house items:', inHouseItems.map(i => ({
      name: i.name,
      sourceRecipeId: i.sourceRecipeId,
      itemType: i.itemType
    })));

    results.total = inHouseItems.length;

    if (inHouseItems.length === 0) {
      return results;
    }

    // Group items by source recipe
    const byRecipe = {};
    for (const item of inHouseItems) {
      if (item.sourceRecipeId) {
        if (!byRecipe[item.sourceRecipeId]) {
          byRecipe[item.sourceRecipeId] = [];
        }
        byRecipe[item.sourceRecipeId].push(item);
      } else {
        // Items without sourceRecipeId can't be recalculated
        results.skipped.push({
          itemId: item.id,
          itemName: item.name,
          reason: 'No source recipe linked'
        });
      }
    }

    console.log('[inHousePriceService] Recipes to process:', Object.keys(byRecipe));

    // Process each recipe group (all outputs get same price/kg)
    for (const [recipeId, items] of Object.entries(byRecipe)) {
      console.log('[inHousePriceService] Processing recipe:', recipeId, 'with', items.length, 'items');
      const recipeResults = await recalculateRecipeOutputPrices(recipeId, items);

      for (const result of recipeResults) {
        if (result.success) {
          results.success.push(result);
        } else {
          results.failed.push(result);
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[inHousePriceService] Error in recalculateAllInHousePrices:', err);
    throw err;
  }
}

/**
 * Get summary of in-house items and their pricing status
 *
 * @returns {Promise<Object>} Summary of in-house items
 */
export async function getInHousePricingSummary() {
  try {
    const allItems = await inventoryItemDB.getAll();

    const inHouseItems = allItems.filter(item =>
      item.sourceRecipeId || item.itemType === 'in-house'
    );

    const withPrice = inHouseItems.filter(item =>
      (item.pricePerG && item.pricePerG > 0) ||
      (item.pricePerML && item.pricePerML > 0)
    );

    const withoutPrice = inHouseItems.filter(item =>
      !item.pricePerG && !item.pricePerML
    );

    return {
      total: inHouseItems.length,
      withPrice: withPrice.length,
      withoutPrice: withoutPrice.length,
      items: inHouseItems.map(item => ({
        id: item.id,
        name: item.name,
        sourceRecipeId: item.sourceRecipeId,
        sourceRecipeName: item.sourceRecipeName,
        hasPrice: (item.pricePerG > 0) || (item.pricePerML > 0),
        pricePerKg: item.pricePerG ? Math.round(item.pricePerG * 1000 * 100) / 100 : null,
        pricePerL: item.pricePerML ? Math.round(item.pricePerML * 1000 * 100) / 100 : null
      }))
    };
  } catch (err) {
    console.error('[inHousePriceService] Error in getInHousePricingSummary:', err);
    throw err;
  }
}

export default {
  recalculateItemPrice,
  recalculateAllInHousePrices,
  getInHousePricingSummary
};
