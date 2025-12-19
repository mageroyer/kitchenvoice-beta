/**
 * Validation Utility Functions
 *
 * Functions for validating user input, forms, and data
 */

/**
 * Validate email address
 * @param {string} email - Email address
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate URL
 * @param {string} url - URL string
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate password strength
 * @param {string} password - Password
 * @returns {Object} { valid: boolean, strength: string, errors: Array }
 */
export function validatePassword(password) {
  const errors = [];
  let strength = 'weak';

  if (!password || typeof password !== 'string') {
    return { valid: false, strength: 'weak', errors: ['Password is required'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain special characters');
  }

  // Calculate strength
  if (errors.length === 0) {
    strength = password.length >= 12 ? 'strong' : 'medium';
  } else if (errors.length <= 2) {
    strength = 'medium';
  }

  return {
    valid: errors.length === 0,
    strength,
    errors,
  };
}

/**
 * Validate required field
 * @param {any} value - Field value
 * @returns {boolean} True if not empty
 */
export function isRequired(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

/**
 * Validate number within range
 * @param {number} value - Number value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if within range
 */
export function isInRange(value, min, max) {
  const num = parseFloat(value);

  if (isNaN(num)) {
    return false;
  }

  return num >= min && num <= max;
}

/**
 * Validate positive number
 * @param {number} value - Number value
 * @returns {boolean} True if positive
 */
export function isPositiveNumber(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0;
}

/**
 * Validate integer
 * @param {number} value - Number value
 * @returns {boolean} True if integer
 */
export function isInteger(value) {
  const num = parseFloat(value);
  return !isNaN(num) && Number.isInteger(num);
}

/**
 * Validate string length
 * @param {string} value - String value
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @returns {boolean} True if length is valid
 */
export function isValidLength(value, min, max) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const length = value.trim().length;
  return length >= min && length <= max;
}

// Note: sanitizeInput functionality moved to sanitize.js
// Use sanitizeText() from sanitize.js instead

/**
 * Validate ingredient object
 * @param {Object} ingredient - Ingredient object
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateIngredient(ingredient) {
  const errors = [];

  if (!ingredient.name || ingredient.name.trim() === '') {
    errors.push('Ingredient name is required');
  }

  if (ingredient.quantity && isNaN(parseFloat(ingredient.quantity))) {
    errors.push('Quantity must be a valid number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Note: validateFileUpload moved to sanitize.js for consolidation
// Use: import { validateFileUpload } from './sanitize' or from './index'

/**
 * Validate array of items
 * @param {Array} items - Array to validate
 * @param {Function} validator - Validator function for each item
 * @returns {Object} { valid: boolean, errors: Object }
 */
export function validateArray(items, validator) {
  if (!Array.isArray(items)) {
    return { valid: false, errors: { _array: ['Must be an array'] } };
  }

  const errors = {};
  let hasErrors = false;

  items.forEach((item, index) => {
    const result = validator(item);
    if (!result.valid) {
      errors[index] = result.errors;
      hasErrors = true;
    }
  });

  return {
    valid: !hasErrors,
    errors,
  };
}

/**
 * Validate form data against schema
 * @param {Object} data - Form data
 * @param {Object} schema - Validation schema
 * @returns {Object} { valid: boolean, errors: Object }
 */
export function validateForm(data, schema) {
  const errors = {};

  Object.keys(schema).forEach((field) => {
    const rules = schema[field];
    const value = data[field];

    if (rules.required && !isRequired(value)) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} is required`);
    }

    if (rules.email && value && !isValidEmail(value)) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} must be a valid email`);
    }

    if (rules.minLength && value && value.length < rules.minLength) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength && value && value.length > rules.maxLength) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} must be no more than ${rules.maxLength} characters`);
    }

    if (rules.min !== undefined && value && parseFloat(value) < rules.min) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && value && parseFloat(value) > rules.max) {
      errors[field] = errors[field] || [];
      errors[field].push(`${field} must be no more than ${rules.max}`);
    }

    if (rules.custom && typeof rules.custom === 'function') {
      const customResult = rules.custom(value);
      if (customResult !== true) {
        errors[field] = errors[field] || [];
        errors[field].push(customResult);
      }
    }
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
