/**
 * Ingredient Validation Utility
 *
 * Provides soft validation for ingredients - flags issues but never blocks.
 * Used to show visual indicators for incomplete/problematic ingredient data.
 */

// Unit compatibility imports removed - price calculation uses pricePerG directly

// Validation status levels (non-blocking)
export const ValidationStatus = {
  COMPLETE: 'complete',      // All good, ready for production
  WARNING: 'warning',        // Has issues that should be fixed
  INFO: 'info',              // Optional improvement available
};

// Validation issue types (simplified - price uses pricePerG directly)
export const ValidationIssue = {
  QUANTITY_INVALID: 'quantity_invalid',
  NOT_LINKED: 'not_linked',
  INVENTORY_NOT_FOUND: 'inventory_not_found',
};

// User-friendly messages for each issue
const ISSUE_MESSAGES = {
  [ValidationIssue.QUANTITY_INVALID]: () =>
    'Quantity must be a positive number',
  [ValidationIssue.NOT_LINKED]: () =>
    'Not linked to inventory',
  [ValidationIssue.INVENTORY_NOT_FOUND]: () =>
    'Linked inventory item no longer exists',
};

// Suggestions for fixing each issue
const ISSUE_SUGGESTIONS = {
  [ValidationIssue.QUANTITY_INVALID]: 'Enter a valid positive number for quantity',
  [ValidationIssue.NOT_LINKED]: 'Click to link this ingredient to an inventory item',
  [ValidationIssue.INVENTORY_NOT_FOUND]: 'Re-link this ingredient to an existing inventory item',
};

/**
 * Validate a single ingredient
 * @param {Object} ingredient - Ingredient object from recipe
 * @param {Object} inventoryItem - Linked inventory item (optional)
 * @returns {Object} Validation result { status, issues[], canDeduct }
 */
/**
 * Parse metric string to extract quantity and unit
 * e.g., "420g" -> { qty: 420, unit: "g" }
 *       "2.5kg" -> { qty: 2.5, unit: "kg" }
 *       "500ml" -> { qty: 500, unit: "ml" }
 */
function parseMetric(metricStr) {
  if (!metricStr || typeof metricStr !== 'string') {
    return { qty: null, unit: '' };
  }

  const trimmed = metricStr.trim();
  // Match number (including decimals) followed by optional unit
  const match = trimmed.match(/^([\d.,]+)\s*([a-zA-Z]*)/);

  if (!match) {
    return { qty: null, unit: '' };
  }

  // Handle comma as decimal separator (French format)
  const qtyStr = match[1].replace(',', '.');
  const qty = parseFloat(qtyStr);
  const unit = match[2] || '';

  return { qty: isNaN(qty) ? null : qty, unit };
}

/**
 * Validates an ingredient against inventory data and returns any issues found.
 * Performs soft validation - flags issues but never blocks operations.
 *
 * @param {Object} ingredient - The ingredient object to validate
 * @param {Object|null} [inventoryItem=null] - Optional inventory item to validate against
 * @returns {Array} Array of validation issue objects with severity levels
 * @example
 * const issues = validateIngredient(
 *   { name: 'flour', amount: 100, unit: 'g' },
 *   { name: 'flour', stock: 50, unit: 'g' }
 * );
 * // Returns: [{ type: 'stock', severity: 'warning', message: '...' }]
 */
export function validateIngredient(ingredient, inventoryItem = null) {
  const issues = [];

  // Skip section headers
  if (ingredient.isSection) {
    return { status: ValidationStatus.COMPLETE, issues: [], canDeduct: false, isSection: true };
  }

  // Parse metric field
  const parsedMetric = parseMetric(ingredient.metric);
  const qty = ingredient.metricQty !== undefined ? parseFloat(ingredient.metricQty) : parsedMetric.qty;

  // Only warn about explicitly invalid values (negative numbers)
  if (qty !== null && qty < 0) {
    issues.push({
      type: ValidationIssue.QUANTITY_INVALID,
      severity: 'warning',
      message: ISSUE_MESSAGES[ValidationIssue.QUANTITY_INVALID](),
      suggestion: ISSUE_SUGGESTIONS[ValidationIssue.QUANTITY_INVALID],
    });
  }

  // Check linking status
  if (!ingredient.linkedIngredientId) {
    issues.push({
      type: ValidationIssue.NOT_LINKED,
      severity: 'info', // Info, not warning - linking is optional
      message: ISSUE_MESSAGES[ValidationIssue.NOT_LINKED](),
      suggestion: ISSUE_SUGGESTIONS[ValidationIssue.NOT_LINKED],
    });
  } else if (inventoryItem === null) {
    // Was linked but item not found (might have been deleted)
    issues.push({
      type: ValidationIssue.INVENTORY_NOT_FOUND,
      severity: 'warning',
      message: ISSUE_MESSAGES[ValidationIssue.INVENTORY_NOT_FOUND](),
      suggestion: ISSUE_SUGGESTIONS[ValidationIssue.INVENTORY_NOT_FOUND],
    });
  }
  // If linked and inventory item exists with pricePerG, validation is COMPLETE
  // Price calculation uses: grams × pricePerG - no unit compatibility needed

  // Determine overall status
  const hasWarnings = issues.some(i => i.severity === 'warning');
  const hasInfo = issues.some(i => i.severity === 'info');
  const status = hasWarnings ? ValidationStatus.WARNING
               : hasInfo ? ValidationStatus.INFO
               : ValidationStatus.COMPLETE;

  // Can deduct if linked and inventory item exists
  const canDeduct = ingredient.linkedIngredientId &&
                    inventoryItem &&
                    !issues.some(i => i.type === ValidationIssue.INVENTORY_NOT_FOUND);

  return { status, issues, canDeduct };
}

/**
 * Validate all ingredients in a recipe
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Map|Object} inventoryItemsMap - Map of id -> inventoryItem (or function to lookup)
 * @returns {Object} { overall, byIndex: { [index]: validationResult }, summary }
 */
export async function validateAllIngredients(ingredients, inventoryItemsMap) {
  const results = {
    overall: ValidationStatus.COMPLETE,
    byIndex: {},
    summary: {
      total: 0,
      complete: 0,
      warnings: 0,
      info: 0,
      canDeduct: 0,
      issues: [],
    },
  };

  for (let i = 0; i < ingredients.length; i++) {
    const ingredient = ingredients[i];

    // Skip section headers
    if (ingredient.isSection) {
      results.byIndex[i] = { status: ValidationStatus.COMPLETE, issues: [], isSection: true };
      continue;
    }

    results.summary.total++;

    // Get inventory item if linked
    let inventoryItem = null;
    if (ingredient.linkedIngredientId) {
      if (typeof inventoryItemsMap === 'function') {
        inventoryItem = await inventoryItemsMap(ingredient.linkedIngredientId);
      } else if (inventoryItemsMap instanceof Map) {
        inventoryItem = inventoryItemsMap.get(ingredient.linkedIngredientId);
      } else if (inventoryItemsMap && typeof inventoryItemsMap === 'object') {
        inventoryItem = inventoryItemsMap[ingredient.linkedIngredientId];
      }
    }

    const validation = validateIngredient(ingredient, inventoryItem);
    results.byIndex[i] = validation;

    // Update summary
    if (validation.status === ValidationStatus.COMPLETE) {
      results.summary.complete++;
    } else if (validation.status === ValidationStatus.WARNING) {
      results.summary.warnings++;
      // Collect all warning issues with ingredient context
      validation.issues.filter(i => i.severity === 'warning').forEach(issue => {
        results.summary.issues.push({
          ...issue,
          ingredientIndex: i,
          ingredientName: ingredient.name,
        });
      });
    } else if (validation.status === ValidationStatus.INFO) {
      results.summary.info++;
    }

    if (validation.canDeduct) {
      results.summary.canDeduct++;
    }
  }

  // Determine overall status
  if (results.summary.warnings > 0) {
    results.overall = ValidationStatus.WARNING;
  } else if (results.summary.info > 0) {
    results.overall = ValidationStatus.INFO;
  }

  return results;
}

/**
 * Get validation badge info for an ingredient
 * @param {Object} validationResult - Result from validateIngredient
 * @param {Object} ingredient - The ingredient object
 * @returns {Object} { icon, color, tooltip, clickAction }
 */
export function getValidationBadge(validationResult, ingredient) {
  const { status, issues, canDeduct, isSection } = validationResult;

  if (isSection) {
    return null; // No badge for section headers
  }

  // Not linked - show link icon
  if (!ingredient.linkedIngredientId) {
    return {
      icon: '⛓️',
      color: 'gray',
      tooltip: 'Not linked to inventory',
      status: 'unlinked',
      clickAction: 'openLinkModal',
    };
  }

  // Has warnings - show warning icon
  if (status === ValidationStatus.WARNING) {
    const primaryIssue = issues.find(i => i.severity === 'warning');
    return {
      icon: '⚠️',
      color: 'orange',
      tooltip: primaryIssue?.message || 'Has validation issues',
      issues,
      status: 'warning',
      clickAction: 'showIssues',
    };
  }

  // Complete - show linked icon
  return {
    icon: '🔗',
    color: 'green',
    tooltip: `Linked to ${ingredient.linkedName || 'inventory item'}`,
    status: 'complete',
    clickAction: 'openLinkModal',
  };
}

/**
 * Quick check if ingredient can be deducted from inventory
 * @param {Object} ingredient - Ingredient object
 * @param {Object} inventoryItem - Linked inventory item
 * @returns {boolean}
 */
export function canDeductIngredient(ingredient, inventoryItem) {
  if (!ingredient || ingredient.isSection) return false;
  if (!ingredient.linkedIngredientId) return false;
  if (!inventoryItem) return false;

  // Parse metric to get quantity
  const parsedMetric = parseMetric(ingredient.metric);
  const qty = ingredient.metricQty !== undefined ? parseFloat(ingredient.metricQty) : parsedMetric.qty;

  return qty != null && qty > 0;
}
