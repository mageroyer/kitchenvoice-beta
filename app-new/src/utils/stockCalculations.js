/**
 * Stock Calculation Utilities
 *
 * Pure utility functions for stock level calculations, formatting, and display.
 * No database dependencies - these are stateless calculation functions.
 *
 * @module utils/stockCalculations
 */

// ============================================
// Constants
// ============================================

/**
 * Stock status values
 */
export const STOCK_STATUS = {
  CRITICAL: 'critical',
  LOW: 'low',
  OK: 'ok'
};

/**
 * Default thresholds (percentages)
 */
export const DEFAULT_THRESHOLDS = {
  CRITICAL: 10,  // 10% or below
  LOW: 20        // 20% or below (but above critical)
};

/**
 * Status colors - accessible color palette
 * Colors chosen for visibility and WCAG contrast
 */
export const STATUS_COLORS = {
  critical: '#dc2626', // Red-600 - high contrast
  low: '#d97706',      // Amber-600 - distinguishable from red
  ok: '#16a34a'        // Green-600 - positive indication
};

/**
 * Status icons (emoji)
 */
export const STATUS_ICONS = {
  critical: '\u{1F534}', // Red circle
  low: '\u{1F7E1}',      // Yellow circle
  ok: '\u{1F7E2}'        // Green circle
};

/**
 * Status labels for accessibility
 */
export const STATUS_LABELS = {
  critical: 'Critical',
  low: 'Low',
  ok: 'OK'
};

// ============================================
// Core Calculation Functions
// ============================================

/**
 * Calculate stock percentage
 *
 * @param {number} current - Current stock level
 * @param {number} full - Full/par stock level (100% reference)
 * @returns {number} Percentage (0-100+, can exceed 100 if overstocked)
 *
 * @example
 * calculatePercentage(5, 10) // returns 50
 * calculatePercentage(0, 10) // returns 0
 * calculatePercentage(10, 0) // returns 100 (no target = assume OK)
 * calculatePercentage(-5, 10) // returns 0 (negative treated as 0)
 */
export function calculatePercentage(current, full) {
  // Handle invalid inputs
  if (typeof current !== 'number' || isNaN(current)) {
    return 0;
  }

  if (typeof full !== 'number' || isNaN(full)) {
    // No full stock defined - return 100 if we have stock, 0 otherwise
    return current > 0 ? 100 : 0;
  }

  // Handle negative current (shouldn't happen, but defensive)
  if (current < 0) {
    return 0;
  }

  // Handle zero or negative full stock
  if (full <= 0) {
    // No target defined - return 100 if we have stock, 0 otherwise
    return current > 0 ? 100 : 0;
  }

  // Calculate percentage
  const percentage = (current / full) * 100;

  // Return rounded to avoid floating point issues
  return Math.round(percentage * 100) / 100;
}

/**
 * Get status from percentage
 *
 * @param {number} percent - Stock percentage
 * @param {number} [threshold=20] - Low stock threshold
 * @param {number} [criticalThreshold=10] - Critical stock threshold
 * @returns {string} Status: 'critical', 'low', or 'ok'
 *
 * @example
 * getStatusFromPercentage(5)   // returns 'critical'
 * getStatusFromPercentage(15)  // returns 'low'
 * getStatusFromPercentage(50)  // returns 'ok'
 * getStatusFromPercentage(15, 25, 10) // returns 'low' (custom thresholds)
 */
export function getStatusFromPercentage(
  percent,
  threshold = DEFAULT_THRESHOLDS.LOW,
  criticalThreshold = DEFAULT_THRESHOLDS.CRITICAL
) {
  // Handle invalid input
  if (typeof percent !== 'number' || isNaN(percent)) {
    return STOCK_STATUS.OK;
  }

  // Ensure critical is always lower than threshold
  const effectiveCritical = Math.min(criticalThreshold, threshold);
  const effectiveThreshold = Math.max(criticalThreshold, threshold);

  if (percent <= effectiveCritical) {
    return STOCK_STATUS.CRITICAL;
  }

  if (percent <= effectiveThreshold) {
    return STOCK_STATUS.LOW;
  }

  return STOCK_STATUS.OK;
}

/**
 * Get color for a status
 *
 * @param {string} status - Status value ('critical', 'low', 'ok')
 * @returns {string} Hex color code
 *
 * @example
 * getStatusColor('critical') // returns '#dc2626'
 * getStatusColor('low')      // returns '#d97706'
 * getStatusColor('ok')       // returns '#16a34a'
 */
export function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.ok;
}

/**
 * Get icon/emoji for a status
 *
 * @param {string} status - Status value ('critical', 'low', 'ok')
 * @returns {string} Emoji character
 *
 * @example
 * getStatusIcon('critical') // returns '🔴'
 * getStatusIcon('low')      // returns '🟡'
 * getStatusIcon('ok')       // returns '🟢'
 */
export function getStatusIcon(status) {
  return STATUS_ICONS[status] || STATUS_ICONS.ok;
}

/**
 * Get accessible label for a status
 *
 * @param {string} status - Status value
 * @returns {string} Human-readable label
 */
export function getStatusLabel(status) {
  return STATUS_LABELS[status] || 'Unknown';
}

// ============================================
// Formatting Functions
// ============================================

/**
 * Format stock display string
 *
 * @param {number} current - Current stock level
 * @param {number} [full] - Full/par stock level
 * @param {string} [unit=''] - Unit of measure
 * @returns {string} Formatted display string
 *
 * @example
 * formatStockDisplay(1.25, 10, 'kg')  // returns '1.25kg / 10kg'
 * formatStockDisplay(5, null, 'ea')   // returns '5ea'
 * formatStockDisplay(0.333, 1, 'L')   // returns '0.33L / 1L'
 * formatStockDisplay(100, 100)        // returns '100 / 100'
 */
export function formatStockDisplay(current, full, unit = '') {
  // Format current stock
  const formattedCurrent = formatNumber(current);
  const unitStr = unit ? unit.trim() : '';

  // If no full stock, just show current
  if (full === null || full === undefined || full === 0) {
    return unitStr ? `${formattedCurrent}${unitStr}` : formattedCurrent;
  }

  // Format full stock
  const formattedFull = formatNumber(full);

  // Build display string
  if (unitStr) {
    return `${formattedCurrent}${unitStr} / ${formattedFull}${unitStr}`;
  }

  return `${formattedCurrent} / ${formattedFull}`;
}

/**
 * Format a number with appropriate decimal places
 *
 * @param {number} value - Number to format
 * @param {number} [maxDecimals=2] - Maximum decimal places
 * @returns {string} Formatted number string
 */
export function formatNumber(value, maxDecimals = 2) {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0';
  }

  // Round to max decimal places
  const multiplier = Math.pow(10, maxDecimals);
  const rounded = Math.round(value * multiplier) / multiplier;

  // Format - remove unnecessary trailing zeros
  if (Number.isInteger(rounded)) {
    return rounded.toString();
  }

  return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/**
 * Format percentage for display
 *
 * @param {number} percent - Percentage value
 * @returns {string} Formatted string with % symbol
 *
 * @example
 * formatPercentage(50)     // returns '50%'
 * formatPercentage(33.33)  // returns '33%'
 * formatPercentage(100.5)  // returns '101%'
 */
export function formatPercentage(percent) {
  if (typeof percent !== 'number' || isNaN(percent)) {
    return '0%';
  }

  // Round to nearest integer
  const rounded = Math.round(percent);

  return `${rounded}%`;
}

/**
 * Format percentage with decimal for precision display
 *
 * @param {number} percent - Percentage value
 * @param {number} [decimals=1] - Decimal places
 * @returns {string} Formatted string with % symbol
 *
 * @example
 * formatPercentagePrecise(33.33)    // returns '33.3%'
 * formatPercentagePrecise(50.00)    // returns '50%'
 */
export function formatPercentagePrecise(percent, decimals = 1) {
  if (typeof percent !== 'number' || isNaN(percent)) {
    return '0%';
  }

  const formatted = formatNumber(percent, decimals);
  return `${formatted}%`;
}

// ============================================
// Reorder Calculation Functions
// ============================================

/**
 * Calculate suggested reorder quantity
 *
 * @param {number} current - Current stock level
 * @param {number} full - Full/par stock level (target)
 * @param {number} [minOrder=1] - Minimum order quantity
 * @returns {number} Suggested reorder quantity (rounded up to minOrder multiple)
 *
 * @example
 * calculateReorderQuantity(2, 10, 1)   // returns 8
 * calculateReorderQuantity(2, 10, 5)   // returns 10 (rounded up to multiple of 5)
 * calculateReorderQuantity(12, 10, 1)  // returns 0 (already overstocked)
 * calculateReorderQuantity(8, 10, 3)   // returns 3 (deficit 2, rounded up to 3)
 */
export function calculateReorderQuantity(current, full, minOrder = 1) {
  // Handle invalid inputs
  if (typeof current !== 'number' || isNaN(current)) {
    current = 0;
  }
  if (typeof full !== 'number' || isNaN(full) || full <= 0) {
    return 0;
  }
  if (typeof minOrder !== 'number' || isNaN(minOrder) || minOrder <= 0) {
    minOrder = 1;
  }

  // Calculate deficit
  const deficit = full - Math.max(0, current);

  // If no deficit, no reorder needed
  if (deficit <= 0) {
    return 0;
  }

  // Round up to minimum order multiple
  const orderQuantity = Math.ceil(deficit / minOrder) * minOrder;

  return orderQuantity;
}

/**
 * Calculate reorder with buffer
 *
 * @param {number} current - Current stock level
 * @param {number} full - Full/par stock level
 * @param {number} [buffer=0.1] - Buffer percentage (0.1 = 10% extra)
 * @param {number} [minOrder=1] - Minimum order quantity
 * @returns {number} Suggested reorder quantity with buffer
 */
export function calculateReorderWithBuffer(current, full, buffer = 0.1, minOrder = 1) {
  if (typeof full !== 'number' || full <= 0) {
    return 0;
  }

  // Target is full + buffer
  const target = full * (1 + buffer);

  return calculateReorderQuantity(current, target, minOrder);
}

// ============================================
// Sorting and Grouping Functions
// ============================================

/**
 * Sort items by urgency (stock status)
 *
 * Sorts: critical first, then low, then ok.
 * Within each status, sorts by percentage ascending (most depleted first).
 * Stable sort - preserves original order for equal items.
 *
 * @param {Array<Object>} items - Array of items with stock info
 * @param {Object} [options] - Options
 * @param {string} [options.currentStockField='currentStock'] - Field name for current stock
 * @param {string} [options.fullStockField='parLevel'] - Field name for full/par stock
 * @param {number} [options.threshold=20] - Low stock threshold
 * @param {number} [options.criticalThreshold=10] - Critical threshold
 * @returns {Array<Object>} Sorted array (new array, original not modified)
 *
 * @example
 * const sorted = sortByUrgency([
 *   { name: 'A', currentStock: 50, parLevel: 100 },
 *   { name: 'B', currentStock: 5, parLevel: 100 },
 *   { name: 'C', currentStock: 15, parLevel: 100 }
 * ]);
 * // Returns: B (5%, critical), C (15%, low), A (50%, ok)
 */
export function sortByUrgency(items, options = {}) {
  if (!Array.isArray(items)) {
    return [];
  }

  const {
    currentStockField = 'currentStock',
    fullStockField = 'parLevel',
    threshold = DEFAULT_THRESHOLDS.LOW,
    criticalThreshold = DEFAULT_THRESHOLDS.CRITICAL
  } = options;

  // Calculate percentage and status for each item
  const withCalculations = items.map((item, originalIndex) => {
    const current = item[currentStockField] || 0;
    const full = item[fullStockField] || item.fullStock || 0;
    const percentage = calculatePercentage(current, full);
    const status = getStatusFromPercentage(percentage, threshold, criticalThreshold);

    return {
      ...item,
      _percentage: percentage,
      _status: status,
      _originalIndex: originalIndex // For stable sort
    };
  });

  // Status priority (lower = more urgent)
  const statusPriority = {
    [STOCK_STATUS.CRITICAL]: 0,
    [STOCK_STATUS.LOW]: 1,
    [STOCK_STATUS.OK]: 2
  };

  // Sort by status priority, then by percentage, then by original index (stable)
  withCalculations.sort((a, b) => {
    // First by status
    const statusDiff = statusPriority[a._status] - statusPriority[b._status];
    if (statusDiff !== 0) return statusDiff;

    // Then by percentage (ascending - lower percentage = more urgent)
    const percentDiff = a._percentage - b._percentage;
    if (percentDiff !== 0) return percentDiff;

    // Stable sort - preserve original order
    return a._originalIndex - b._originalIndex;
  });

  // Remove internal calculation fields
  return withCalculations.map(({ _percentage, _status, _originalIndex, ...item }) => item);
}

/**
 * Group items by stock status
 *
 * @param {Array<Object>} items - Array of items with stock info
 * @param {Object} [options] - Options (same as sortByUrgency)
 * @returns {Object} Grouped object { critical: [], low: [], ok: [] }
 *
 * @example
 * const grouped = groupByStatus([
 *   { name: 'A', currentStock: 50, parLevel: 100 },
 *   { name: 'B', currentStock: 5, parLevel: 100 },
 *   { name: 'C', currentStock: 15, parLevel: 100 }
 * ]);
 * // Returns: { critical: [B], low: [C], ok: [A] }
 */
export function groupByStatus(items, options = {}) {
  if (!Array.isArray(items)) {
    return {
      [STOCK_STATUS.CRITICAL]: [],
      [STOCK_STATUS.LOW]: [],
      [STOCK_STATUS.OK]: []
    };
  }

  const {
    currentStockField = 'currentStock',
    fullStockField = 'parLevel',
    threshold = DEFAULT_THRESHOLDS.LOW,
    criticalThreshold = DEFAULT_THRESHOLDS.CRITICAL
  } = options;

  const grouped = {
    [STOCK_STATUS.CRITICAL]: [],
    [STOCK_STATUS.LOW]: [],
    [STOCK_STATUS.OK]: []
  };

  for (const item of items) {
    const current = item[currentStockField] || 0;
    const full = item[fullStockField] || item.fullStock || 0;
    const percentage = calculatePercentage(current, full);
    const status = getStatusFromPercentage(percentage, threshold, criticalThreshold);

    grouped[status].push({
      ...item,
      _percentage: percentage // Include for potential sorting within group
    });
  }

  // Sort within each group by percentage ascending
  for (const status in grouped) {
    grouped[status].sort((a, b) => a._percentage - b._percentage);
    // Remove internal field
    grouped[status] = grouped[status].map(({ _percentage, ...item }) => item);
  }

  return grouped;
}

/**
 * Get summary statistics for a collection of items
 *
 * @param {Array<Object>} items - Array of items with stock info
 * @param {Object} [options] - Options (same as sortByUrgency)
 * @returns {Object} Summary with counts and totals
 */
export function getStockSummary(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      total: 0,
      criticalCount: 0,
      lowCount: 0,
      okCount: 0,
      averagePercentage: 0,
      lowestItem: null,
      highestItem: null
    };
  }

  const {
    currentStockField = 'currentStock',
    fullStockField = 'parLevel',
    threshold = DEFAULT_THRESHOLDS.LOW,
    criticalThreshold = DEFAULT_THRESHOLDS.CRITICAL
  } = options;

  let criticalCount = 0;
  let lowCount = 0;
  let okCount = 0;
  let totalPercentage = 0;
  let lowestItem = null;
  let lowestPercentage = Infinity;
  let highestItem = null;
  let highestPercentage = -Infinity;

  for (const item of items) {
    const current = item[currentStockField] || 0;
    const full = item[fullStockField] || item.fullStock || 0;
    const percentage = calculatePercentage(current, full);
    const status = getStatusFromPercentage(percentage, threshold, criticalThreshold);

    // Count by status
    switch (status) {
      case STOCK_STATUS.CRITICAL: criticalCount++; break;
      case STOCK_STATUS.LOW: lowCount++; break;
      case STOCK_STATUS.OK: okCount++; break;
    }

    totalPercentage += percentage;

    // Track lowest
    if (percentage < lowestPercentage) {
      lowestPercentage = percentage;
      lowestItem = item;
    }

    // Track highest
    if (percentage > highestPercentage) {
      highestPercentage = percentage;
      highestItem = item;
    }
  }

  return {
    total: items.length,
    criticalCount,
    lowCount,
    okCount,
    averagePercentage: Math.round(totalPercentage / items.length),
    lowestItem,
    lowestPercentage: Math.round(lowestPercentage),
    highestItem,
    highestPercentage: Math.round(highestPercentage)
  };
}

// ============================================
// Accessibility Helpers
// ============================================

/**
 * Get accessible description for stock status
 *
 * Returns a description suitable for screen readers that doesn't rely on color.
 *
 * @param {string} status - Status value
 * @param {number} [percentage] - Optional percentage for detail
 * @returns {string} Accessible description
 */
export function getAccessibleStatusDescription(status, percentage) {
  const label = getStatusLabel(status);

  if (percentage !== undefined && typeof percentage === 'number') {
    switch (status) {
      case STOCK_STATUS.CRITICAL:
        return `Critical stock level at ${Math.round(percentage)}%. Immediate reorder required.`;
      case STOCK_STATUS.LOW:
        return `Low stock level at ${Math.round(percentage)}%. Consider reordering soon.`;
      case STOCK_STATUS.OK:
        return `Stock level OK at ${Math.round(percentage)}%.`;
      default:
        return `Stock at ${Math.round(percentage)}%`;
    }
  }

  switch (status) {
    case STOCK_STATUS.CRITICAL:
      return 'Critical stock level. Immediate reorder required.';
    case STOCK_STATUS.LOW:
      return 'Low stock level. Consider reordering soon.';
    case STOCK_STATUS.OK:
      return 'Stock level OK.';
    default:
      return label;
  }
}

/**
 * Get ARIA attributes for stock status display
 *
 * @param {string} status - Status value
 * @param {number} [percentage] - Optional percentage
 * @returns {Object} Object with aria-* attributes
 */
export function getAriaAttributes(status, percentage) {
  const description = getAccessibleStatusDescription(status, percentage);

  return {
    'aria-label': description,
    'role': 'status',
    'aria-live': status === STOCK_STATUS.CRITICAL ? 'assertive' : 'polite'
  };
}

// ============================================
// Export all functions and constants
// ============================================

export default {
  // Constants
  STOCK_STATUS,
  DEFAULT_THRESHOLDS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,

  // Core calculations
  calculatePercentage,
  getStatusFromPercentage,
  getStatusColor,
  getStatusIcon,
  getStatusLabel,

  // Formatting
  formatStockDisplay,
  formatNumber,
  formatPercentage,
  formatPercentagePrecise,

  // Reorder calculations
  calculateReorderQuantity,
  calculateReorderWithBuffer,

  // Sorting and grouping
  sortByUrgency,
  groupByStatus,
  getStockSummary,

  // Accessibility
  getAccessibleStatusDescription,
  getAriaAttributes
};
