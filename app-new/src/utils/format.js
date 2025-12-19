/**
 * Formatting Utility Functions
 *
 * Functions for formatting data for display (dates, times, numbers, text)
 */

/**
 * Format time in minutes to human-readable format
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time (e.g., "1h 30m", "45m")
 */
export function formatTime(minutes) {
  const mins = parseInt(minutes);

  if (isNaN(mins) || mins <= 0) {
    return '0m';
  }

  if (mins < 60) {
    return `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  const remainingMinutes = mins % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format currency amount
 * @param {number} amount - Amount in dollars/euros/etc
 * @param {string} currency - Currency symbol (default: '$')
 * @returns {string} Formatted currency (e.g., "$12.50")
 */
export function formatCurrency(amount, currency = '$') {
  const num = parseFloat(amount);

  if (isNaN(num)) {
    return `${currency}0.00`;
  }

  return `${currency}${num.toFixed(2)}`;
}

/**
 * Format date to readable string
 * @param {Date|string|number} date - Date object, ISO string, or timestamp
 * @param {string} format - Format type ('short', 'long', 'relative')
 * @returns {string} Formatted date
 */
export function formatDate(date, format = 'short') {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Invalid date';
  }

  if (format === 'relative') {
    return formatRelativeDate(d);
  }

  const options =
    format === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' };

  return d.toLocaleDateString('en-US', options);
}

/**
 * Format date to relative time (e.g., "2 hours ago", "yesterday")
 * @param {Date} date - Date object
 * @returns {string} Relative time string
 */
export function formatRelativeDate(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else if (diffDay === 1) {
    return 'yesterday';
  } else if (diffDay < 7) {
    return `${diffDay} days ago`;
  } else {
    return formatDate(date, 'short');
  }
}

/**
 * Capitalize first letter of string
 * @param {string} text - Input text
 * @returns {string} Capitalized text
 */
export function capitalizeFirst(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Capitalize first letter of each word
 * @param {string} text - Input text
 * @returns {string} Title-cased text
 */
export function toTitleCase(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .toLowerCase()
    .split(' ')
    .map((word) => capitalizeFirst(word))
    .join(' ');
}

/**
 * Truncate text to specified length
 * @param {string} text - Input text
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, suffix = '...') {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number (e.g., "1,234,567")
 */
export function formatNumber(num) {
  const n = parseFloat(num);

  if (isNaN(n)) {
    return '0';
  }

  return n.toLocaleString('en-US');
}

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
export function formatFileSize(bytes) {
  const b = parseInt(bytes);

  if (isNaN(b) || b <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  const size = b / Math.pow(1024, i);

  return `${size.toFixed(2)} ${units[i]}`;
}

/**
 * Format percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage (e.g., "75.5%")
 */
export function formatPercentage(value, total, decimals = 1) {
  if (!total || total === 0) {
    return '0%';
  }

  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Format difficulty level
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @returns {string} Formatted difficulty with emoji
 */
export function formatDifficulty(difficulty) {
  const levels = {
    easy: '⭐ Easy',
    medium: '⭐⭐ Medium',
    hard: '⭐⭐⭐ Hard',
  };

  return levels[difficulty?.toLowerCase()] || '⭐⭐ Medium';
}

/**
 * Format servings
 * @param {number} servings - Number of servings
 * @returns {string} Formatted servings (e.g., "4 servings", "1 serving")
 */
export function formatServings(servings) {
  const num = parseInt(servings);

  if (isNaN(num) || num <= 0) {
    return '0 servings';
  }

  return `${num} serving${num !== 1 ? 's' : ''}`;
}

/**
 * Format placeholder text for empty states
 * @param {string} type - Type of content (recipes, ingredients, etc.)
 * @returns {string} Formatted placeholder text
 */
export function formatEmptyState(type) {
  const messages = {
    recipes: 'No recipes found',
    ingredients: 'No ingredients yet',
    steps: 'No steps yet',
    notes: 'No notes yet',
    plating: 'No plating instructions yet',
  };

  return messages[type?.toLowerCase()] || 'No items found';
}

/**
 * Format metric measurement for display (auto-convert large units)
 * @param {string} metric - Metric value (e.g., "1000g", "2500ml", "500g")
 * @returns {string} Formatted metric (e.g., "1kg", "2.5l", "500g")
 *
 * @example
 * formatMetric("1000g")   // "1kg"
 * formatMetric("2500g")   // "2.5kg"
 * formatMetric("1000ml")  // "1l"
 * formatMetric("500ml")   // "500ml"
 * formatMetric("250g")    // "250g"
 */
export function formatMetric(metric) {
  if (!metric || typeof metric !== 'string') {
    return metric;
  }

  // Extract number and unit - support both dot and comma decimals (French format)
  const match = metric.match(/^([\d]+[.,]?[\d]*)([a-zA-Z]+)$/);
  if (!match) {
    return metric; // Return as-is if doesn't match pattern
  }

  const [, numStr, unit] = match;
  // Handle comma as decimal separator (French format)
  const num = parseFloat(numStr.replace(',', '.'));

  if (isNaN(num)) {
    return metric;
  }

  // Convert grams to kilograms if >= 1000g
  if (unit === 'g' && num >= 1000) {
    const kg = num / 1000;
    // Remove unnecessary decimals (1.0kg -> 1kg, 2.5kg -> 2.5kg)
    return kg % 1 === 0 ? `${kg}kg` : `${kg}kg`;
  }

  // Convert milliliters to liters if >= 1000ml
  if (unit === 'ml' && num >= 1000) {
    const l = num / 1000;
    // Remove unnecessary decimals
    return l % 1 === 0 ? `${l}l` : `${l}l`;
  }

  // Return as-is for other cases
  return metric;
}

/**
 * Extract weight or volume from an item name
 *
 * Parses common patterns found in product names:
 * - "HUILE D'OLIVE 500ML" → { value: 500, unit: 'ml', valueInGrams: 500 }
 * - "FARINE 2.5KG" → { value: 2.5, unit: 'kg', valueInGrams: 2500 }
 * - "BEURRE 454G" → { value: 454, unit: 'g', valueInGrams: 454 }
 * - "VINAIGRE 1L" → { value: 1, unit: 'l', valueInGrams: 1000 }
 * - "BISCUITS 4X40G" → { value: 160, unit: 'g', valueInGrams: 160 } (multiplied!)
 * - "CALISSONS 20X37G" → { value: 740, unit: 'g', valueInGrams: 740 } (multiplied!)
 *
 * @param {string} name - Product/item name to parse
 * @returns {Object|null} Extracted weight info or null if not found
 *
 * @example
 * extractWeightFromName("HUILE D'OLIVE EXTRA VIERGE KALAMATA 500ML")
 * // → { value: 500, unit: 'ml', valueInGrams: 500, isVolume: true }
 *
 * extractWeightFromName("BISCUITS LU PRINCE MINI 4X40G")
 * // → { value: 160, unit: 'g', valueInGrams: 160, multiplier: 4, perUnitValue: 40 }
 */
export function extractWeightFromName(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }

  // FIRST: Check for multiplier pattern (e.g., "4X40G" → 160g total, "20X37G" → 740g)
  // This MUST be checked first to calculate total weight correctly for inventory
  const multiplierPattern = /(\d+)\s*[xX×]\s*(\d+[.,]?\d*)\s*(ml|ML|mL|l|L|cl|CL|g|G|kg|KG|lb|LB|lbs|LBS|oz|OZ)/;
  const multiplierMatch = name.match(multiplierPattern);

  if (multiplierMatch) {
    const count = parseInt(multiplierMatch[1], 10);
    const perUnitValue = parseFloat(multiplierMatch[2].replace(',', '.'));
    const unit = multiplierMatch[3].toLowerCase();
    const totalValue = count * perUnitValue; // Calculate TOTAL weight

    if (!isNaN(totalValue) && totalValue > 0) {
      // Convert total to base units
      let valueInGrams = totalValue;
      let normalizedUnit = unit;
      let isVolume = false;

      switch (unit) {
        case 'kg': valueInGrams = totalValue * 1000; normalizedUnit = 'kg'; break;
        case 'g': valueInGrams = totalValue; normalizedUnit = 'g'; break;
        case 'lb': case 'lbs': valueInGrams = totalValue * 453.592; normalizedUnit = 'lb'; break;
        case 'oz': valueInGrams = totalValue * 28.3495; normalizedUnit = 'oz'; break;
        case 'l': valueInGrams = totalValue * 1000; normalizedUnit = 'l'; isVolume = true; break;
        case 'ml': valueInGrams = totalValue; normalizedUnit = 'ml'; isVolume = true; break;
        case 'cl': valueInGrams = totalValue * 10; normalizedUnit = 'cl'; isVolume = true; break;
        default: normalizedUnit = unit;
      }

      const result = {
        value: totalValue,           // Total (e.g., 160 for "4X40G")
        perUnitValue,                // Per-unit (e.g., 40 for "4X40G")
        multiplier: count,           // Count (e.g., 4 for "4X40G")
        unit: normalizedUnit,
        valueInGrams: Math.round(valueInGrams * 100) / 100,
        isVolume,
        original: multiplierMatch[0].trim(),
        isMultiplied: true,
      };

      console.log(`[extractWeightFromName] ✓ Multiplier found in "${name}": ${count}×${perUnitValue}${unit} = ${totalValue}${unit}`, result);
      return result;
    }
  }

  // Standard patterns (no multiplier)
  const patterns = [
    // End of string patterns (most common)
    /(\d+[.,]?\d*)\s*(ml|ML|mL|l|L|cl|CL|g|G|kg|KG|lb|LB|lbs|LBS|oz|OZ)\s*$/,
    // In parentheses
    /\((\d+[.,]?\d*)\s*(ml|ML|mL|l|L|cl|CL|g|G|kg|KG|lb|LB|lbs|LBS|oz|OZ)\)/,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toLowerCase();

      if (isNaN(value) || value <= 0) {
        continue;
      }

      // Convert to base units (grams or ml)
      let valueInGrams = value;
      let normalizedUnit = unit;
      let isVolume = false;

      switch (unit) {
        case 'kg':
          valueInGrams = value * 1000;
          normalizedUnit = 'kg';
          break;
        case 'g':
          valueInGrams = value;
          normalizedUnit = 'g';
          break;
        case 'lb':
        case 'lbs':
          valueInGrams = value * 453.592;
          normalizedUnit = 'lb';
          break;
        case 'oz':
          valueInGrams = value * 28.3495;
          normalizedUnit = 'oz';
          break;
        case 'l':
          valueInGrams = value * 1000; // ml
          normalizedUnit = 'l';
          isVolume = true;
          break;
        case 'ml':
          valueInGrams = value;
          normalizedUnit = 'ml';
          isVolume = true;
          break;
        case 'cl':
          valueInGrams = value * 10; // to ml
          normalizedUnit = 'cl';
          isVolume = true;
          break;
        default:
          normalizedUnit = unit;
      }

      const result = {
        value,
        unit: normalizedUnit,
        valueInGrams: Math.round(valueInGrams * 100) / 100,
        isVolume,
        original: match[0].trim(),
      };

      console.log(`[extractWeightFromName] ✓ Found in "${name}":`, {
        extracted: result.original,
        value: result.value,
        unit: result.unit,
        baseUnits: `${result.valueInGrams}${isVolume ? 'ml' : 'g'}`,
      });

      return result;
    }
  }

  console.log(`[extractWeightFromName] ✗ No weight/volume found in "${name}"`);
  return null;
}
