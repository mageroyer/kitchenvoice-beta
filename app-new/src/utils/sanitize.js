/**
 * Input Sanitization Utility
 *
 * Provides functions to sanitize user inputs and prevent XSS attacks.
 * React already escapes content by default, but these utilities provide
 * additional protection for edge cases and data storage.
 */

import {
  TEXT_LIMITS,
  NUMERIC_LIMITS,
  FILE_SIZE_LIMITS
} from '../constants/limits';

/**
 * HTML entities to escape
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char]);
}

/**
 * Remove HTML tags from string
 * @param {string} str - String to strip
 * @returns {string} String without HTML tags
 */
export function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a text input (recipe name, ingredient name, etc.)
 * - Trims whitespace
 * - Removes HTML tags
 * - Limits length
 * - Removes control characters
 *
 * @param {string} input - User input
 * @param {number} maxLength - Maximum allowed length (default: TEXT_LIMITS.SINGLE_LINE_DEFAULT)
 * @returns {string} Sanitized string
 */
export function sanitizeText(input, maxLength = TEXT_LIMITS.SINGLE_LINE_DEFAULT) {
  if (typeof input !== 'string') return '';

  return input
    // Remove control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
    // Limit length
    .substring(0, maxLength);
}

/**
 * Sanitize multiline text (method steps, notes, etc.)
 * - Preserves newlines
 * - Removes HTML tags
 * - Limits length
 *
 * @param {string} input - User input
 * @param {number} maxLength - Maximum allowed length (default: TEXT_LIMITS.MULTILINE_DEFAULT)
 * @returns {string} Sanitized string
 */
export function sanitizeMultilineText(input, maxLength = TEXT_LIMITS.MULTILINE_DEFAULT) {
  if (typeof input !== 'string') return '';

  return input
    // Remove control characters (except newlines, tabs, carriage returns)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Normalize multiple newlines to max 2
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim()
    // Limit length
    .substring(0, maxLength);
}

/**
 * Sanitize a number input
 * @param {any} input - User input
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: NUMERIC_LIMITS.NUMBER_MAX_DEFAULT)
 * @param {number} defaultValue - Default if invalid (default: 0)
 * @returns {number} Sanitized number
 */
export function sanitizeNumber(input, min = 0, max = NUMERIC_LIMITS.NUMBER_MAX_DEFAULT, defaultValue = 0) {
  const num = parseFloat(input);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * Sanitize an integer input
 * @param {any} input - User input
 * @param {number} min - Minimum value (default: 0)
 * @param {number} max - Maximum value (default: NUMERIC_LIMITS.NUMBER_MAX_DEFAULT)
 * @param {number} defaultValue - Default if invalid (default: 0)
 * @returns {number} Sanitized integer
 */
export function sanitizeInteger(input, min = 0, max = NUMERIC_LIMITS.NUMBER_MAX_DEFAULT, defaultValue = 0) {
  const num = parseInt(input, 10);
  if (isNaN(num)) return defaultValue;
  return Math.min(Math.max(num, min), max);
}

/**
 * Sanitize a recipe object before saving
 * @param {Object} recipe - Recipe object
 * @returns {Object} Sanitized recipe
 */
// Valid portion units for recipe yield
const VALID_PORTION_UNITS = ['portion', 'ml', 'L', 'g', 'kg'];

export function sanitizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error('Invalid recipe object');
  }

  // Validate portionUnit - default to 'portion' if invalid
  const portionUnit = VALID_PORTION_UNITS.includes(recipe.portionUnit)
    ? recipe.portionUnit
    : 'portion';

  // Validate outputContainerUnit - must be a valid volume/weight unit
  const validContainerUnits = ['L', 'ml', 'kg', 'g'];
  const outputContainerUnit = validContainerUnits.includes(recipe.outputContainerUnit)
    ? recipe.outputContainerUnit
    : null;

  // Validate outputContainerSize - must be a positive number
  const outputContainerSize = typeof recipe.outputContainerSize === 'number' && recipe.outputContainerSize > 0
    ? recipe.outputContainerSize
    : null;

  return {
    ...recipe,
    name: sanitizeText(recipe.name, TEXT_LIMITS.RECIPE_NAME),
    category: sanitizeText(recipe.category, TEXT_LIMITS.CATEGORY_NAME),
    department: sanitizeText(recipe.department, TEXT_LIMITS.DEPARTMENT_NAME),
    portions: sanitizeInteger(recipe.portions, NUMERIC_LIMITS.PORTIONS_MIN, NUMERIC_LIMITS.PORTIONS_MAX, NUMERIC_LIMITS.PORTIONS_DEFAULT),
    portionUnit,
    outputContainerSize,
    outputContainerUnit,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map(sanitizeIngredient)
      : [],
    method: Array.isArray(recipe.method)
      ? recipe.method.map(sanitizeMethodStep)
      : typeof recipe.method === 'string' && recipe.method.trim()
        ? recipe.method.split('\n').filter(s => s.trim()).map(step => sanitizeMultilineText(step, TEXT_LIMITS.METHOD_STEP))
        : [],
    platingInstructions: Array.isArray(recipe.platingInstructions)
      ? recipe.platingInstructions.map(sanitizePlatingItem)
      : null,
    notes: Array.isArray(recipe.notes)
      ? recipe.notes.map(note => sanitizeMultilineText(note, TEXT_LIMITS.NOTE))
      : null,
  };
}

/**
 * Sanitize a method step (string or object with production fields)
 * @param {string|Object} step - Method step
 * @returns {string|Object} Sanitized step
 */
export function sanitizeMethodStep(step) {
  // Handle string steps (legacy format)
  if (typeof step === 'string') {
    return sanitizeMultilineText(step, TEXT_LIMITS.METHOD_STEP);
  }

  // Handle object steps (production format)
  if (step && typeof step === 'object') {
    // Valid weight/volume units
    const validUnits = ['kg', 'g', 'lb', 'L', 'ml'];
    const weightUnit = validUnits.includes(step.weightUnit) ? step.weightUnit : 'kg';

    // Valid boxing size units (same as weight units)
    const boxingSizeUnit = validUnits.includes(step.boxingSizeUnit) ? step.boxingSizeUnit : weightUnit;

    const sanitized = {
      text: sanitizeMultilineText(step.text || '', TEXT_LIMITS.METHOD_STEP),
      producesItem: Boolean(step.producesItem),
      outputName: sanitizeText(step.outputName || '', TEXT_LIMITS.INGREDIENT_NAME),
      expectedWeight: typeof step.expectedWeight === 'number' ? step.expectedWeight : 0,
      weightUnit, // Unit for expected weight (kg, g, lb, L, ml)
      boxingSize: typeof step.boxingSize === 'number' && step.boxingSize > 0 ? step.boxingSize : null, // Size per container (e.g., 1 for 1L jars)
      boxingSizeUnit, // Unit for boxing size (defaults to weightUnit)
      portionsPerItem: typeof step.portionsPerItem === 'number' && step.portionsPerItem >= 1
        ? step.portionsPerItem : 1, // How many portions each output item makes
      actualWeight: step.actualWeight ?? null,
      wasteWeight: step.wasteWeight ?? null,
      completed: Boolean(step.completed),
    };

    // Sanitize packaging items array
    if (Array.isArray(step.packagingItems)) {
      sanitized.packagingItems = step.packagingItems.map(pkg => ({
        itemId: pkg?.itemId ?? null,
        itemName: sanitizeText(pkg?.itemName || '', TEXT_LIMITS.INGREDIENT_NAME),
        quantity: typeof pkg?.quantity === 'number' ? pkg.quantity : 1,
        notes: sanitizeText(pkg?.notes || '', TEXT_LIMITS.NOTE),
      }));
    } else {
      sanitized.packagingItems = [];
    }

    return sanitized;
  }

  // Fallback for invalid input
  return '';
}

/**
 * Sanitize a plating instruction item (string or package object)
 * @param {string|Object} item - Plating instruction or package
 * @returns {string|Object} Sanitized item
 */
export function sanitizePlatingItem(item) {
  // Handle string instructions (regular plating text)
  if (typeof item === 'string') {
    return sanitizeMultilineText(item, TEXT_LIMITS.PLATING_INSTRUCTION);
  }

  // Handle package objects
  if (item && typeof item === 'object' && item.isPackage) {
    return {
      isPackage: true,
      qty: typeof item.qty === 'number' ? item.qty : parseFloat(item.qty) || 1,
      unit: sanitizeText(item.unit || 'pc', 10),
      name: sanitizeText(item.name || '', TEXT_LIMITS.INGREDIENT_NAME),
      linkedPackageId: item.linkedPackageId || null,
      linkedName: item.linkedName ? sanitizeText(item.linkedName, TEXT_LIMITS.INGREDIENT_NAME) : undefined,
      isRollType: Boolean(item.isRollType),
    };
  }

  // Fallback for invalid input
  return '';
}

/**
 * Sanitize an ingredient object
 * @param {Object} ingredient - Ingredient object
 * @returns {Object} Sanitized ingredient
 */
export function sanitizeIngredient(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return { name: '', quantity: '', unit: '', metric: '', specification: '' };
  }

  return {
    ...ingredient,
    name: sanitizeText(ingredient.name, TEXT_LIMITS.INGREDIENT_NAME),
    quantity: sanitizeText(String(ingredient.quantity || ''), TEXT_LIMITS.UNIT_QUANTITY),
    unit: sanitizeText(ingredient.unit, TEXT_LIMITS.UNIT_QUANTITY),
    metric: sanitizeText(ingredient.metric, TEXT_LIMITS.METRIC),
    specification: sanitizeText(ingredient.specification, TEXT_LIMITS.INGREDIENT_SPEC),
    toolMeasure: sanitizeText(ingredient.toolMeasure, TEXT_LIMITS.TOOL_MEASURE),
  };
}

/**
 * Validate and sanitize email address
 * @param {string} email - Email to validate
 * @returns {string|null} Sanitized email or null if invalid
 */
export function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;

  const sanitized = email.trim().toLowerCase();

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) return null;

  // Length check (RFC 5321)
  if (sanitized.length > TEXT_LIMITS.EMAIL) return null;

  return sanitized;
}

/**
 * Validate file upload
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateFileUpload(file, options = {}) {
  const {
    allowedTypes = [],
    maxSize = FILE_SIZE_LIMITS.PDF_MAX,
    allowedExtensions = []
  } = options;

  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${Math.round(maxSize / FILE_SIZE_LIMITS.MB)}MB`
    };
  }

  // Check MIME type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  // Check extension
  if (allowedExtensions.length > 0) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return {
        valid: false,
        error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
      };
    }
  }

  // Check for suspicious file names
  const suspiciousPatterns = [
    /\.(exe|bat|cmd|sh|ps1|vbs|js|jar|msi)$/i,
    /\.\./,  // Path traversal
    /[<>:"|?*]/,  // Invalid characters
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(file.name)) {
      return { valid: false, error: 'Invalid file name' };
    }
  }

  return { valid: true };
}

/**
 * Validate image file
 * @param {File} file - Image file to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateImageFile(file) {
  return validateFileUpload(file, {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxSize: FILE_SIZE_LIMITS.IMAGE_COMPRESSED_MAX
  });
}

/**
 * Validate PDF file
 * @param {File} file - PDF file to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validatePdfFile(file) {
  return validateFileUpload(file, {
    allowedTypes: ['application/pdf'],
    allowedExtensions: ['pdf'],
    maxSize: FILE_SIZE_LIMITS.PDF_MAX
  });
}

/**
 * Sanitize filename for storage
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (typeof filename !== 'string') return 'file';

  return filename
    // Remove path components
    .replace(/^.*[\\\/]/, '')
    // Remove dangerous characters
    .replace(/[<>:"|?*\x00-\x1F]/g, '')
    // Replace spaces with underscores
    .replace(/\s+/g, '_')
    // Limit length
    .substring(0, TEXT_LIMITS.FILENAME);
}

/**
 * Check if a string contains potential script injection
 * @param {string} str - String to check
 * @returns {boolean} True if suspicious content detected
 */
export function containsSuspiciousContent(str) {
  if (typeof str !== 'string') return false;

  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,  // onclick=, onerror=, etc.
    /data:text\/html/i,
    /vbscript:/i,
    /expression\s*\(/i,  // CSS expression
    /@import/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(str));
}
