/**
 * Column Solver
 *
 * Identifies invoice columns by trying mathematical combinations.
 * The solver doesn't care about column names - it finds columns
 * where B × P = T validates across all lines.
 *
 * @module services/invoice/mathEngine/columnSolver
 */

import { validateLine, validateAllLines } from './lineValidator.js';
import { extractAllFormats, getBillingValueFromFormat } from './formatPatterns.js';
import { calculateTolerance, VALIDATION_STATUS } from './types.js';

// ============================================
// Column Analysis
// ============================================

/**
 * Extract numeric values from raw columns
 *
 * @param {Array<string|number>} columns - Raw column values
 * @returns {Array<Object>} Numeric columns with index and value
 */
export function extractNumericColumns(columns) {
  if (!Array.isArray(columns)) return [];

  const result = [];

  for (let i = 0; i < columns.length; i++) {
    const raw = columns[i];
    if (raw == null || raw === '') continue;

    const value = parseNumericValue(raw);
    if (value !== null && !isNaN(value)) {
      result.push({
        index: i,
        raw,
        value,
        isLikelyPrice: looksLikePrice(raw, value),
        isLikelyQuantity: looksLikeQuantity(raw, value),
        isLikelyTotal: looksLikeTotal(raw, value),
      });
    }
  }

  return result;
}

/**
 * Parse numeric value from string
 * Handles French format (1 234,56) and standard (1,234.56)
 *
 * @param {string|number} raw - Raw value
 * @returns {number|null} Parsed number or null
 */
export function parseNumericValue(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  // Remove currency symbols
  cleaned = cleaned.replace(/[$€£]/g, '');

  // Handle French format: 1 234,56 → 1234.56
  if (/^\d{1,3}(\s\d{3})*,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s/g, '').replace(',', '.');
  }
  // Handle standard format: 1,234.56 → 1234.56
  else if (/^\d{1,3}(,\d{3})*\.\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  }
  // Handle comma as decimal: 12,34 → 12.34
  else if (/^\d+,\d{2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

/**
 * Check if value looks like a price
 */
function looksLikePrice(raw, value) {
  const str = String(raw);
  // Has currency symbol
  if (/[$€£]/.test(str)) return true;
  // Has exactly 2 decimal places and reasonable range
  if (/\.\d{2}$/.test(str) && value > 0 && value < 10000) return true;
  // Price per unit is usually < $500
  return value > 0 && value < 500;
}

/**
 * Check if value looks like a quantity
 */
function looksLikeQuantity(raw, value) {
  // Quantities are usually integers or simple decimals
  // Usually small numbers (< 1000)
  return value > 0 && value < 1000 && (Number.isInteger(value) || value.toFixed(2).endsWith('00') || value.toFixed(2).endsWith('50'));
}

/**
 * Check if value looks like a line total
 */
function looksLikeTotal(raw, value) {
  const str = String(raw);
  // Has currency symbol
  if (/[$€£]/.test(str)) return true;
  // Has exactly 2 decimal places
  if (/\.\d{2}$/.test(str)) return true;
  // Totals are usually larger than unit prices
  return value > 1;
}

// ============================================
// Column Role Detection
// ============================================

/**
 * Identify the Total column (T)
 * Usually the rightmost numeric column with 2 decimal places
 *
 * @param {Array<Object>} numericCols - Numeric columns from extractNumericColumns
 * @returns {Object|null} The identified total column
 */
export function identifyTotalColumn(numericCols) {
  if (numericCols.length === 0) return null;

  // Filter to likely totals
  const likelyTotals = numericCols.filter((c) => c.isLikelyTotal);

  if (likelyTotals.length > 0) {
    // Return rightmost likely total
    return likelyTotals.reduce((right, c) => (c.index > right.index ? c : right));
  }

  // Fallback: rightmost numeric column
  return numericCols.reduce((right, c) => (c.index > right.index ? c : right));
}

/**
 * Identify the Price column (P)
 * Usually second-to-last numeric column
 *
 * @param {Array<Object>} numericCols - Numeric columns
 * @param {number} totalColIndex - Index of total column
 * @returns {Object|null} The identified price column
 */
export function identifyPriceColumn(numericCols, totalColIndex) {
  // Filter out the total column
  const candidates = numericCols.filter((c) => c.index !== totalColIndex);

  if (candidates.length === 0) return null;

  // Prefer columns that look like prices
  const pricelike = candidates.filter((c) => c.isLikelyPrice);
  if (pricelike.length > 0) {
    // Return rightmost price-like column (usually just before total)
    return pricelike.reduce((right, c) => (c.index > right.index ? c : right));
  }

  // Fallback: rightmost remaining column
  return candidates.reduce((right, c) => (c.index > right.index ? c : right));
}

/**
 * Identify potential Billing Value columns (B)
 *
 * @param {Array<Object>} numericCols - Numeric columns
 * @param {number} totalColIndex - Index of total column
 * @param {number} priceColIndex - Index of price column
 * @returns {Array<Object>} Potential B columns
 */
export function identifyBillingColumns(numericCols, totalColIndex, priceColIndex) {
  return numericCols.filter(
    (c) => c.index !== totalColIndex && c.index !== priceColIndex
  );
}

// ============================================
// Column Combination Solver
// ============================================

/**
 * Try all B column combinations to find which validates
 *
 * @param {Array<Array>} lines - Array of raw lines, each line is array of columns
 * @param {string} [descriptionColIndex] - Index of description column for format extraction
 * @returns {Object} Best column mapping that validates
 */
export function solveColumns(lines, descriptionColIndex = null) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { found: false, reason: 'No lines provided' };
  }

  // Analyze first line to identify column structure
  const firstLineNumeric = extractNumericColumns(lines[0]);

  if (firstLineNumeric.length < 2) {
    return { found: false, reason: 'Need at least 2 numeric columns' };
  }

  // Identify T (total) column
  const totalCol = identifyTotalColumn(firstLineNumeric);
  if (!totalCol) {
    return { found: false, reason: 'Could not identify total column' };
  }

  // Identify P (price) column
  const priceCol = identifyPriceColumn(firstLineNumeric, totalCol.index);
  if (!priceCol) {
    return { found: false, reason: 'Could not identify price column' };
  }

  // Identify potential B columns
  const billingCandidates = identifyBillingColumns(
    firstLineNumeric,
    totalCol.index,
    priceCol.index
  );

  const results = [];

  // Strategy 1: Try each numeric column as B
  for (const bCol of billingCandidates) {
    const mapping = {
      billingIndex: bCol.index,
      priceIndex: priceCol.index,
      totalIndex: totalCol.index,
      source: 'column',
    };

    const validation = validateMapping(lines, mapping);
    results.push({ ...mapping, validation });

    if (validation.allValid) {
      return {
        found: true,
        mapping,
        validation,
        allResults: results,
      };
    }
  }

  // Strategy 2: Try format extraction from description
  if (descriptionColIndex != null) {
    const mapping = {
      billingIndex: null,
      billingSource: 'description',
      descriptionIndex: descriptionColIndex,
      priceIndex: priceCol.index,
      totalIndex: totalCol.index,
      source: 'format',
    };

    const validation = validateMappingWithFormat(lines, mapping);
    results.push({ ...mapping, validation });

    if (validation.allValid) {
      return {
        found: true,
        mapping,
        validation,
        allResults: results,
      };
    }
  }

  // Strategy 3: Derive B from T / P
  const derivedMapping = {
    billingIndex: null,
    billingSource: 'derived',
    priceIndex: priceCol.index,
    totalIndex: totalCol.index,
    source: 'derived',
  };

  const derivedValidation = validateMappingDerived(lines, derivedMapping);
  results.push({ ...derivedMapping, validation: derivedValidation });

  // Return best result (highest valid rate)
  const best = results.reduce((best, r) =>
    r.validation.validRate > best.validation.validRate ? r : best
  );

  return {
    found: best.validation.allValid,
    mapping: best,
    validation: best.validation,
    allResults: results,
    suggestion: !best.validation.allValid
      ? 'Manual column mapping may be needed'
      : null,
  };
}

/**
 * Validate a column mapping against all lines
 *
 * @param {Array<Array>} lines - Raw lines
 * @param {Object} mapping - Column mapping
 * @returns {Object} Validation summary
 */
function validateMapping(lines, mapping) {
  const { billingIndex, priceIndex, totalIndex } = mapping;

  let valid = 0;
  let invalid = 0;
  let skipped = 0;
  const details = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const b = parseNumericValue(line[billingIndex]);
    const p = parseNumericValue(line[priceIndex]);
    const t = parseNumericValue(line[totalIndex]);

    if (t === 0 || (b === 0 && p === 0)) {
      skipped++;
      details.push({ line: i, status: 'skipped', reason: 'Zero value line' });
      continue;
    }

    const result = validateLine(b, p, t);

    if (result.status === VALIDATION_STATUS.VALID) {
      valid++;
    } else if (result.status === VALIDATION_STATUS.SKIPPED) {
      skipped++;
    } else {
      invalid++;
    }

    details.push({ line: i, b, p, t, ...result });
  }

  const total = lines.length;
  const validRate = total > 0 ? (valid / (total - skipped)) * 100 : 0;

  return {
    valid,
    invalid,
    skipped,
    total,
    validRate,
    allValid: invalid === 0,
    details,
  };
}

/**
 * Validate mapping using format extraction
 */
function validateMappingWithFormat(lines, mapping) {
  const { descriptionIndex, priceIndex, totalIndex } = mapping;

  let valid = 0;
  let invalid = 0;
  let skipped = 0;
  const details = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const description = line[descriptionIndex];
    const formatResult = extractAllFormats(description);
    const b = formatResult.bestMatch?.billingValue;

    const p = parseNumericValue(line[priceIndex]);
    const t = parseNumericValue(line[totalIndex]);

    if (!b || t === 0) {
      skipped++;
      details.push({ line: i, status: 'skipped', reason: 'No format or zero total' });
      continue;
    }

    const result = validateLine(b, p, t);

    if (result.status === VALIDATION_STATUS.VALID) {
      valid++;
    } else if (result.status === VALIDATION_STATUS.SKIPPED) {
      skipped++;
    } else {
      invalid++;
    }

    details.push({ line: i, b, p, t, format: formatResult.bestMatch, ...result });
  }

  const total = lines.length;
  const validRate = total > 0 ? (valid / (total - skipped)) * 100 : 0;

  return {
    valid,
    invalid,
    skipped,
    total,
    validRate,
    allValid: invalid === 0,
    details,
  };
}

/**
 * Validate by deriving B from T/P
 * This always "validates" but tells us what B should be
 */
function validateMappingDerived(lines, mapping) {
  const { priceIndex, totalIndex } = mapping;

  let valid = 0;
  let skipped = 0;
  const details = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const p = parseNumericValue(line[priceIndex]);
    const t = parseNumericValue(line[totalIndex]);

    if (t === 0 || p === 0) {
      skipped++;
      details.push({ line: i, status: 'skipped', reason: 'Zero value' });
      continue;
    }

    // Derive B = T / P
    const derivedB = Math.round((t / p) * 1000) / 1000;

    valid++;
    details.push({
      line: i,
      derivedB,
      p,
      t,
      status: VALIDATION_STATUS.VALID,
      note: 'B derived from T/P',
    });
  }

  return {
    valid,
    invalid: 0,
    skipped,
    total: lines.length,
    validRate: 100,
    allValid: true,
    isDerived: true,
    details,
  };
}

// ============================================
// Multi-Line Solver
// ============================================

/**
 * Solve columns using multiple lines for consensus
 * More reliable than single-line detection
 *
 * @param {Array<Array>} lines - Multiple invoice lines
 * @param {Object} options - Solver options
 * @returns {Object} Column mapping with confidence
 */
export function solveColumnsWithConsensus(lines, options = {}) {
  const { minConsensus = 0.8, descriptionIndex = null } = options;

  if (lines.length < 3) {
    // Not enough lines for consensus, use basic solver
    return solveColumns(lines, descriptionIndex);
  }

  // Try solving with different subsets
  const subsetResults = [];

  // Try each line as reference
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const result = solveColumns(lines, descriptionIndex);
    if (result.found) {
      subsetResults.push(result.mapping);
    }
  }

  if (subsetResults.length === 0) {
    return { found: false, reason: 'No valid mapping found in any subset' };
  }

  // Find consensus mapping (most common)
  const mappingCounts = {};
  for (const m of subsetResults) {
    const key = `${m.billingIndex}-${m.priceIndex}-${m.totalIndex}`;
    mappingCounts[key] = (mappingCounts[key] || 0) + 1;
  }

  const [bestKey, bestCount] = Object.entries(mappingCounts).reduce(
    (best, [k, v]) => (v > best[1] ? [k, v] : best),
    ['', 0]
  );

  const consensus = bestCount / subsetResults.length;

  if (consensus < minConsensus) {
    return {
      found: false,
      reason: `Consensus too low: ${(consensus * 100).toFixed(0)}%`,
      suggestions: Object.keys(mappingCounts),
    };
  }

  // Return the consensus mapping with full validation
  const [bIdx, pIdx, tIdx] = bestKey.split('-').map(Number);
  const mapping = {
    billingIndex: isNaN(bIdx) ? null : bIdx,
    priceIndex: pIdx,
    totalIndex: tIdx,
  };

  const validation = validateMapping(lines, mapping);

  return {
    found: validation.allValid,
    mapping,
    validation,
    consensus,
    confidence: consensus * (validation.validRate / 100),
  };
}

// ============================================
// Export
// ============================================

export default {
  extractNumericColumns,
  parseNumericValue,
  identifyTotalColumn,
  identifyPriceColumn,
  identifyBillingColumns,
  solveColumns,
  solveColumnsWithConsensus,
};
