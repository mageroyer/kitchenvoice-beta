/**
 * Recipe Utility Functions
 *
 * Utility functions for recipe data manipulation, scaling, and formatting
 */

/**
 * Scale ingredient quantities for different portion sizes
 * @param {Array} ingredients - Array of ingredient objects
 * @param {number} originalPortions - Original recipe portions
 * @param {number} newPortions - Desired portions
 * @returns {Array} Scaled ingredients
 */
export function scaleIngredients(ingredients, originalPortions, newPortions) {
  if (!originalPortions || originalPortions <= 0) {
    console.warn('Invalid original portions, returning original ingredients');
    return ingredients;
  }

  const scaleFactor = newPortions / originalPortions;

  return ingredients.map((ingredient) => {
    // Parse quantity to number
    const quantity = parseFloat(ingredient.quantity);

    if (isNaN(quantity)) {
      // If quantity is not a number (e.g., "to taste"), return as-is
      return ingredient;
    }

    // Scale the quantity
    const scaledQuantity = quantity * scaleFactor;

    // Round to 2 decimal places and remove trailing zeros
    const formattedQuantity = parseFloat(scaledQuantity.toFixed(2)).toString();

    // Parse and scale metric if it exists
    let scaledMetric = ingredient.metric;
    if (ingredient.metric) {
      const metricMatch = ingredient.metric.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      if (metricMatch) {
        const metricValue = parseFloat(metricMatch[1]);
        const metricUnit = metricMatch[2];
        const scaledMetricValue = parseFloat((metricValue * scaleFactor).toFixed(2));
        scaledMetric = `${scaledMetricValue}${metricUnit}`;
      }
    }

    return {
      ...ingredient,
      quantity: formattedQuantity,
      metric: scaledMetric,
    };
  });
}

/**
 * Calculate total cooking time
 * @param {number} prepTime - Preparation time in minutes
 * @param {number} cookTime - Cooking time in minutes
 * @returns {number} Total time in minutes
 */
export function calculateTotalTime(prepTime, cookTime) {
  const prep = parseInt(prepTime) || 0;
  const cook = parseInt(cookTime) || 0;
  return prep + cook;
}

/**
 * Format ingredient for display (read-only mode)
 * @param {Object} ingredient - Ingredient object
 * @returns {string} Formatted ingredient string
 */
export function formatIngredient(ingredient) {
  const { metric, quantity, unit, name, specification } = ingredient;

  const parts = [];

  if (metric) parts.push(metric);
  if (quantity) parts.push(quantity);
  if (unit) parts.push(unit);
  parts.push(name);
  if (specification) parts.push(specification);

  return parts.join(' ');
}

/**
 * Parse ingredient text into structured object
 * @param {string} text - Raw ingredient text (e.g., "240g 1 cup flour sifted")
 * @returns {Object} Ingredient object
 */
export function parseIngredient(text) {
  // This is a basic parser - can be enhanced with more sophisticated logic
  const parts = text.trim().split(/\s+/);

  const ingredient = {
    metric: '',
    quantity: '',
    unit: '',
    name: '',
    specification: '',
    grouped: false,
  };

  // Try to detect metric (e.g., "240g", "2.5kg")
  const metricMatch = parts[0]?.match(/^(\d+(?:\.\d+)?)(g|kg|ml|l)$/i);
  if (metricMatch) {
    ingredient.metric = parts.shift();
  }

  // Try to detect quantity (number)
  if (parts[0] && !isNaN(parseFloat(parts[0]))) {
    ingredient.quantity = parts.shift();
  }

  // Next part might be unit
  const commonUnits = ['cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'lbs', 'piece', 'pieces'];
  if (parts[0] && commonUnits.includes(parts[0].toLowerCase())) {
    ingredient.unit = parts.shift();
  }

  // Remaining parts are name and specification
  if (parts.length > 0) {
    ingredient.name = parts.join(' ');
  }

  return ingredient;
}

/**
 * Validate recipe object structure
 * @param {Object} recipe - Recipe object
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateRecipe(recipe) {
  const errors = [];

  if (!recipe.title || recipe.title.trim() === '') {
    errors.push('Recipe title is required');
  }

  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    errors.push('At least one ingredient is required');
  }

  if (!recipe.methodSteps || recipe.methodSteps.length === 0) {
    errors.push('At least one method step is required');
  }

  if (recipe.prepTime && (isNaN(recipe.prepTime) || recipe.prepTime < 0)) {
    errors.push('Preparation time must be a valid number');
  }

  if (recipe.cookTime && (isNaN(recipe.cookTime) || recipe.cookTime < 0)) {
    errors.push('Cooking time must be a valid number');
  }

  if (recipe.servings && (isNaN(recipe.servings) || recipe.servings <= 0)) {
    errors.push('Servings must be a positive number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate recipe cost based on ingredient prices
 * @param {Array} ingredients - Array of ingredients with price property
 * @returns {number} Total cost
 */
export function calculateRecipeCost(ingredients) {
  return ingredients.reduce((total, ingredient) => {
    const price = parseFloat(ingredient.price) || 0;
    return total + price;
  }, 0);
}

/**
 * Group ingredients by category
 * @param {Array} ingredients - Array of ingredients
 * @returns {Object} Grouped ingredients by category
 */
export function groupIngredientsByCategory(ingredients) {
  return ingredients.reduce((groups, ingredient) => {
    const category = ingredient.category || 'Other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(ingredient);
    return groups;
  }, {});
}

/**
 * Create empty recipe template
 * @returns {Object} Empty recipe object
 */
export function createEmptyRecipe() {
  return {
    id: null,
    title: '',
    description: '',
    category: '',
    prepTime: 0,
    cookTime: 0,
    servings: 4,
    difficulty: 'medium',
    ingredients: [],
    methodSteps: [],
    platingInstructions: null,
    notes: null,
    imageUrl: '',
    tags: [],
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Duplicate a recipe (for creating variations)
 * @param {Object} recipe - Original recipe
 * @param {string} newTitle - Title for the duplicated recipe
 * @returns {Object} Duplicated recipe
 */
export function duplicateRecipe(recipe, newTitle = null) {
  return {
    ...recipe,
    id: null, // New recipe gets new ID
    title: newTitle || `${recipe.title} (Copy)`,
    createdAt: null,
    updatedAt: null,
  };
}
