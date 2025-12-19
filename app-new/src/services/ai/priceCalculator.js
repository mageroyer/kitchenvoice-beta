/**
 * Price Calculator Service
 *
 * Calculates ingredient costs using a simple formula:
 *   price = grams × pricePerG × scalingFactor
 *
 * Requirements:
 * - Inventory item must have pricePerG (set during invoice import)
 * - Recipe ingredient must have metric value (e.g., "4kg", "500g")
 *
 * No fallbacks - missing data shows error prompting user to fix.
 */

import { inventoryItemDB } from '../database/indexedDB';

// ============================================
// CONSTANTS
// ============================================

/** Convert metric units to base grams/ml */
const METRIC_TO_GRAMS = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  cl: 10,
};

/** Error codes returned by calculateIngredientPrice */
export const PRICE_ERROR = {
  NOT_LINKED: 'not_linked',
  DB_ERROR: 'db_error',
  NOT_FOUND: 'ingredient_not_found',
  NO_PRICE: 'no_price',
  NO_METRIC: 'no_metric',
};

// ============================================
// PARSING UTILITIES
// ============================================

/**
 * Parse metric string to grams (or ml for liquids)
 *
 * @param {string} metric - e.g., "4kg", "500g", "250ml", "1.5l"
 * @returns {number|null} Weight in grams/ml, or null if invalid
 *
 * @example
 * parseMetricToGrams("4kg")   // → 4000
 * parseMetricToGrams("500g")  // → 500
 * parseMetricToGrams("1.5l")  // → 1500
 * parseMetricToGrams("abc")   // → null
 */
function parseMetricToGrams(metric) {
  if (!metric || typeof metric !== 'string') {
    return null;
  }

  const match = metric.trim().match(/^([\d.,]+)\s*(g|kg|ml|l|cl)?$/i);
  if (!match) {
    return null;
  }

  const quantity = parseFloat(match[1].replace(',', '.'));
  if (isNaN(quantity) || quantity < 0) {
    return null;
  }

  const unit = (match[2] || 'g').toLowerCase();
  const factor = METRIC_TO_GRAMS[unit];
  if (!factor) {
    return null;
  }

  return quantity * factor;
}

// ============================================
// PRICE CALCULATION
// ============================================

/**
 * Get price per gram from inventory item
 *
 * @param {Object} item - Inventory item with pricePerG or pricePerML
 * @returns {number} Price per gram (or ml), or 0 if not set
 */
function getPricePerGram(item) {
  if (item.pricePerG != null && item.pricePerG > 0) {
    return item.pricePerG;
  }
  if (item.pricePerML != null && item.pricePerML > 0) {
    return item.pricePerML;
  }
  return 0;
}

/**
 * Calculate ingredient price
 *
 * Formula: price = grams × pricePerG × scalingFactor
 *
 * @param {Object} recipeIngredient - Recipe ingredient with linkedIngredientId and metric
 * @param {number} scalingFactor - Recipe scaling factor (default 1)
 * @returns {Promise<Object>} { price, pricePerKg, unit, error }
 *
 * @example
 * // Linked ingredient with metric
 * const result = await calculateIngredientPrice({ linkedIngredientId: 'abc', metric: '4kg' });
 * // → { price: 31.75, pricePerKg: 7.94, unit: 'kg', error: null }
 *
 * // Missing pricePerG
 * const result = await calculateIngredientPrice({ linkedIngredientId: 'xyz', metric: '500g' });
 * // → { price: null, pricePerKg: 0, unit: 'kg', error: 'no_price' }
 */
export async function calculateIngredientPrice(recipeIngredient, scalingFactor = 1) {
  if (!recipeIngredient.linkedIngredientId) {
    return { price: null, pricePerKg: 0, unit: '', error: PRICE_ERROR.NOT_LINKED };
  }

  let item;
  try {
    item = await inventoryItemDB.getById(recipeIngredient.linkedIngredientId);
  } catch (err) {
    console.error('[PriceCalculator] Database error:', err);
    return { price: null, pricePerKg: 0, unit: '', error: PRICE_ERROR.DB_ERROR };
  }

  if (!item) {
    return { price: null, pricePerKg: 0, unit: '', error: PRICE_ERROR.NOT_FOUND };
  }

  const unit = item.unit || 'kg';
  const pricePerG = getPricePerGram(item);

  if (pricePerG <= 0) {
    return { price: null, pricePerKg: 0, unit, error: PRICE_ERROR.NO_PRICE };
  }

  const pricePerKg = Math.round(pricePerG * 1000 * 100) / 100;
  const grams = parseMetricToGrams(recipeIngredient.metric);

  if (grams === null) {
    return { price: null, pricePerKg, unit, error: PRICE_ERROR.NO_METRIC };
  }

  const price = Math.round(grams * pricePerG * scalingFactor * 100) / 100;

  return { price, pricePerKg, unit, error: null };
}

/**
 * Calculate total recipe cost from all ingredients
 *
 * @param {Array} ingredients - Array of recipe ingredients
 * @param {number} scalingFactor - Recipe scaling factor (default 1)
 * @returns {Promise<Object>} { totalCost, breakdown, errors, completeCount, totalCount }
 *
 * @example
 * const result = await calculateRecipeCost(recipe.ingredients, 2);
 * // → { totalCost: 45.50, breakdown: [...], errors: [...], completeCount: 8, totalCount: 10 }
 */
export async function calculateRecipeCost(ingredients, scalingFactor = 1) {
  const breakdown = [];
  const errors = [];
  let totalCost = 0;

  for (const ingredient of ingredients) {
    if (ingredient.isSection) {
      continue;
    }

    const result = await calculateIngredientPrice(ingredient, scalingFactor);

    breakdown.push({
      name: ingredient.name,
      metric: ingredient.metric,
      ...result,
    });

    if (result.price !== null) {
      totalCost += result.price;
    } else if (result.error) {
      errors.push({ name: ingredient.name, error: result.error });
    }
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    breakdown,
    errors,
    completeCount: breakdown.filter((b) => b.price !== null).length,
    totalCount: breakdown.length,
  };
}

export default {
  calculateIngredientPrice,
  calculateRecipeCost,
  PRICE_ERROR,
};
