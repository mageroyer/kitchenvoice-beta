/**
 * Unit Tests for validation.js
 *
 * Tests all validation utility functions including:
 * - Email validation
 * - URL validation
 * - Password strength validation
 * - Required field validation
 * - Number validation (range, positive, integer)
 * - String length validation
 * - Ingredient validation
 * - Array validation
 * - Form schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  isValidUrl,
  validatePassword,
  isRequired,
  isInRange,
  isPositiveNumber,
  isInteger,
  isValidLength,
  validateIngredient,
  validateArray,
  validateForm,
} from '../validation.js';

describe('isValidEmail', () => {
  describe('valid emails', () => {
    it('should accept standard email formats', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.org')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
    });

    it('should accept emails with numbers', () => {
      expect(isValidEmail('user123@domain.com')).toBe(true);
      expect(isValidEmail('123user@domain.com')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(isValidEmail('  test@example.com  ')).toBe(true);
    });
  });

  describe('invalid emails', () => {
    it('should reject emails without @', () => {
      expect(isValidEmail('testexample.com')).toBe(false);
    });

    it('should reject emails without domain', () => {
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('test@.')).toBe(false);
    });

    it('should reject emails without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should reject emails with spaces in middle', () => {
      expect(isValidEmail('test @example.com')).toBe(false);
      expect(isValidEmail('test@ example.com')).toBe(false);
    });

    it('should reject empty/invalid input', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail(123)).toBe(false);
    });
  });
});

describe('isValidUrl', () => {
  describe('valid URLs', () => {
    it('should accept http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://www.example.com')).toBe(true);
    });

    it('should accept https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://www.example.com/path')).toBe(true);
    });

    it('should accept URLs with ports', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true);
      expect(isValidUrl('https://example.com:8080/path')).toBe(true);
    });

    it('should accept URLs with query strings', () => {
      expect(isValidUrl('https://example.com?foo=bar')).toBe(true);
      expect(isValidUrl('https://example.com/path?a=1&b=2')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should reject URLs without protocol', () => {
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('www.example.com')).toBe(false);
    });

    it('should reject empty/invalid input', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
      expect(isValidUrl('not a url')).toBe(false);
    });
  });
});

describe('validatePassword', () => {
  describe('strong passwords', () => {
    it('should accept passwords meeting all criteria', () => {
      const result = validatePassword('SecurePass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should mark long passwords as strong', () => {
      const result = validatePassword('MySecurePassword123!');
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should mark 8-11 char passwords as medium', () => {
      const result = validatePassword('Pass123!');
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('medium');
    });
  });

  describe('weak passwords', () => {
    it('should reject passwords shorter than 8 chars', () => {
      const result = validatePassword('Aa1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should require lowercase letters', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain lowercase letters');
    });

    it('should require uppercase letters', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain uppercase letters');
    });

    it('should require numbers', () => {
      const result = validatePassword('SecurePass!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain numbers');
    });

    it('should require special characters', () => {
      const result = validatePassword('SecurePass123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain special characters');
    });
  });

  describe('edge cases', () => {
    it('should handle empty password', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.strength).toBe('weak');
    });

    it('should handle null/undefined', () => {
      const result1 = validatePassword(null);
      expect(result1.valid).toBe(false);

      const result2 = validatePassword(undefined);
      expect(result2.valid).toBe(false);
    });

    it('should categorize strength based on error count', () => {
      // 2 errors = medium
      const result = validatePassword('password'); // missing uppercase, numbers, special
      expect(result.strength).toBe('weak');
    });
  });
});

describe('isRequired', () => {
  describe('valid values', () => {
    it('should accept non-empty strings', () => {
      expect(isRequired('hello')).toBe(true);
      expect(isRequired('  text  ')).toBe(true);
    });

    it('should accept numbers', () => {
      expect(isRequired(0)).toBe(true);
      expect(isRequired(123)).toBe(true);
    });

    it('should accept non-empty arrays', () => {
      expect(isRequired([1, 2, 3])).toBe(true);
      expect(isRequired(['a'])).toBe(true);
    });

    it('should accept objects', () => {
      expect(isRequired({})).toBe(true);
      expect(isRequired({ key: 'value' })).toBe(true);
    });

    it('should accept boolean values', () => {
      expect(isRequired(true)).toBe(true);
      expect(isRequired(false)).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('should reject null and undefined', () => {
      expect(isRequired(null)).toBe(false);
      expect(isRequired(undefined)).toBe(false);
    });

    it('should reject empty strings', () => {
      expect(isRequired('')).toBe(false);
      expect(isRequired('   ')).toBe(false);
    });

    it('should reject empty arrays', () => {
      expect(isRequired([])).toBe(false);
    });
  });
});

describe('isInRange', () => {
  it('should return true for values within range', () => {
    expect(isInRange(5, 1, 10)).toBe(true);
    expect(isInRange(1, 1, 10)).toBe(true);
    expect(isInRange(10, 1, 10)).toBe(true);
  });

  it('should return false for values outside range', () => {
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
    expect(isInRange(-5, 1, 10)).toBe(false);
  });

  it('should handle string numbers', () => {
    expect(isInRange('5', 1, 10)).toBe(true);
    expect(isInRange('15', 1, 10)).toBe(false);
  });

  it('should handle decimals', () => {
    expect(isInRange(5.5, 1, 10)).toBe(true);
    expect(isInRange(0.5, 1, 10)).toBe(false);
  });

  it('should return false for invalid numbers', () => {
    expect(isInRange(NaN, 1, 10)).toBe(false);
    expect(isInRange('abc', 1, 10)).toBe(false);
    expect(isInRange(null, 1, 10)).toBe(false);
  });
});

describe('isPositiveNumber', () => {
  it('should return true for positive numbers', () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(100)).toBe(true);
    expect(isPositiveNumber(0.1)).toBe(true);
  });

  it('should return false for zero', () => {
    expect(isPositiveNumber(0)).toBe(false);
  });

  it('should return false for negative numbers', () => {
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(-0.5)).toBe(false);
  });

  it('should handle string numbers', () => {
    expect(isPositiveNumber('5')).toBe(true);
    expect(isPositiveNumber('-5')).toBe(false);
  });

  it('should return false for invalid input', () => {
    expect(isPositiveNumber(NaN)).toBe(false);
    expect(isPositiveNumber('abc')).toBe(false);
    expect(isPositiveNumber(null)).toBe(false);
  });
});

describe('isInteger', () => {
  it('should return true for integers', () => {
    expect(isInteger(1)).toBe(true);
    expect(isInteger(0)).toBe(true);
    expect(isInteger(-5)).toBe(true);
    expect(isInteger(1000)).toBe(true);
  });

  it('should return false for decimals', () => {
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(0.1)).toBe(false);
    expect(isInteger(-2.5)).toBe(false);
  });

  it('should handle string integers', () => {
    expect(isInteger('5')).toBe(true);
    expect(isInteger('5.5')).toBe(false);
  });

  it('should return false for invalid input', () => {
    expect(isInteger(NaN)).toBe(false);
    expect(isInteger('abc')).toBe(false);
    expect(isInteger(null)).toBe(false);
  });
});

describe('isValidLength', () => {
  it('should return true for valid lengths', () => {
    expect(isValidLength('hello', 1, 10)).toBe(true);
    expect(isValidLength('ab', 2, 5)).toBe(true);
    expect(isValidLength('12345', 5, 5)).toBe(true);
  });

  it('should return false for too short', () => {
    expect(isValidLength('a', 2, 10)).toBe(false);
    expect(isValidLength('', 1, 10)).toBe(false);
  });

  it('should return false for too long', () => {
    expect(isValidLength('hello world', 1, 5)).toBe(false);
  });

  it('should trim whitespace', () => {
    expect(isValidLength('  abc  ', 3, 5)).toBe(true);
    expect(isValidLength('  a  ', 2, 5)).toBe(false);
  });

  it('should return false for invalid input', () => {
    expect(isValidLength(null, 1, 10)).toBe(false);
    expect(isValidLength(undefined, 1, 10)).toBe(false);
    expect(isValidLength(123, 1, 10)).toBe(false);
  });
});

describe('validateIngredient', () => {
  describe('valid ingredients', () => {
    it('should accept ingredient with name only', () => {
      const result = validateIngredient({ name: 'Salt' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept ingredient with name and valid quantity', () => {
      const result = validateIngredient({ name: 'Sugar', quantity: 2 });
      expect(result.valid).toBe(true);
    });

    it('should accept ingredient with string quantity', () => {
      const result = validateIngredient({ name: 'Flour', quantity: '2.5' });
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid ingredients', () => {
    it('should reject empty name', () => {
      const result = validateIngredient({ name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Ingredient name is required');
    });

    it('should reject whitespace-only name', () => {
      const result = validateIngredient({ name: '   ' });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid quantity', () => {
      const result = validateIngredient({ name: 'Salt', quantity: 'abc' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be a valid number');
    });

    it('should reject missing name', () => {
      const result = validateIngredient({});
      expect(result.valid).toBe(false);
    });
  });
});

describe('validateArray', () => {
  const itemValidator = (item) => ({
    valid: item.value > 0,
    errors: item.value <= 0 ? ['Value must be positive'] : [],
  });

  it('should validate all items pass', () => {
    const items = [{ value: 1 }, { value: 2 }, { value: 3 }];
    const result = validateArray(items, itemValidator);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('should report errors for invalid items', () => {
    const items = [{ value: 1 }, { value: -1 }, { value: 3 }];
    const result = validateArray(items, itemValidator);
    expect(result.valid).toBe(false);
    expect(result.errors[1]).toContain('Value must be positive');
  });

  it('should report multiple invalid items', () => {
    const items = [{ value: -1 }, { value: 2 }, { value: -3 }];
    const result = validateArray(items, itemValidator);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBeDefined();
    expect(result.errors[2]).toBeDefined();
  });

  it('should handle non-array input', () => {
    const result = validateArray('not an array', itemValidator);
    expect(result.valid).toBe(false);
    expect(result.errors._array).toContain('Must be an array');
  });

  it('should handle empty array', () => {
    const result = validateArray([], itemValidator);
    expect(result.valid).toBe(true);
  });
});

describe('validateForm', () => {
  describe('required fields', () => {
    it('should validate required fields', () => {
      const schema = {
        name: { required: true },
        email: { required: true },
      };
      const result = validateForm({ name: '', email: 'test@example.com' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.name).toBeDefined();
      expect(result.errors.email).toBeUndefined();
    });
  });

  describe('email validation', () => {
    it('should validate email fields', () => {
      const schema = {
        email: { email: true },
      };
      const result = validateForm({ email: 'invalid' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBeDefined();
    });

    it('should accept valid email', () => {
      const schema = {
        email: { email: true },
      };
      const result = validateForm({ email: 'test@example.com' }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('length validation', () => {
    it('should validate minLength', () => {
      const schema = {
        password: { minLength: 8 },
      };
      const result = validateForm({ password: '12345' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.password[0]).toContain('at least 8');
    });

    it('should validate maxLength', () => {
      const schema = {
        username: { maxLength: 10 },
      };
      const result = validateForm({ username: 'verylongusername' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.username[0]).toContain('no more than 10');
    });
  });

  describe('numeric validation', () => {
    it('should validate min value', () => {
      const schema = {
        age: { min: 18 },
      };
      const result = validateForm({ age: 15 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.age[0]).toContain('at least 18');
    });

    it('should validate max value', () => {
      const schema = {
        quantity: { max: 100 },
      };
      const result = validateForm({ quantity: 150 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.quantity[0]).toContain('no more than 100');
    });
  });

  describe('custom validation', () => {
    it('should run custom validator', () => {
      const schema = {
        password: {
          custom: (value) => (value === 'password' ? 'Password too common' : true),
        },
      };
      const result = validateForm({ password: 'password' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.password).toContain('Password too common');
    });

    it('should pass custom validation', () => {
      const schema = {
        password: {
          custom: (value) => (value === 'password' ? 'Password too common' : true),
        },
      };
      const result = validateForm({ password: 'securePass123' }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('multiple rules', () => {
    it('should accumulate multiple errors', () => {
      const schema = {
        password: { required: true, minLength: 8 },
      };
      const result = validateForm({ password: '' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.password.length).toBeGreaterThanOrEqual(1);
    });

    it('should validate complex form', () => {
      const schema = {
        name: { required: true, minLength: 2 },
        email: { required: true, email: true },
        age: { min: 18, max: 120 },
      };
      const result = validateForm(
        { name: 'John', email: 'john@example.com', age: 25 },
        schema
      );
      expect(result.valid).toBe(true);
    });
  });
});
