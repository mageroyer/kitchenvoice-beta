/**
 * Intelligent Matcher Service
 *
 * SKU-first, vendor-aware matching engine for invoice line items.
 *
 * Matching Priority:
 * 1. SKU exact match (vendor + SKU) → 100% base confidence
 * 2. SKU partial match → 90% base confidence
 * 3. Vendor fuzzy name match → base score + vendor boost
 * 4. Global fuzzy name match → base score only
 *
 * All scores are adjusted by:
 * - Recency decay (items not seen recently get lower confidence)
 * - Vendor context boost (same vendor = +10 points)
 * - SKU-name mismatch penalty (SKU matches but name differs = flag for review)
 *
 * @module services/invoice/intelligentMatcher
 */

import { inventoryItemDB } from '../database/indexedDB';
import {
  CONFIDENCE_THRESHOLDS,
  RECENCY_FACTORS,
  VENDOR_MATCH_BOOST
} from './types';

// ============================================
// NORMALIZATION HELPERS
// ============================================

/**
 * Normalize SKU for comparison
 * @param {string} sku - Raw SKU
 * @returns {string} Normalized SKU (uppercase, trimmed, no special chars)
 */
function normalizeSku(sku) {
  if (!sku) return '';
  return sku
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[\s\-\.]/g, '');
}

/**
 * Normalize name for fuzzy matching
 * @param {string} name - Raw name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, ' ')        // Replace special chars with space
    .replace(/\s+/g, ' ');           // Collapse multiple spaces
}

/**
 * Tokenize name into words
 * @param {string} name - Normalized name
 * @returns {string[]} Word tokens (length > 2)
 */
function tokenize(name) {
  return normalizeName(name)
    .split(' ')
    .filter(w => w.length > 2);
}

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Calculate base match score between description and inventory item
 *
 * @param {string} description - Invoice line description
 * @param {Object} item - Inventory item
 * @returns {number} Base score 0-100
 */
function calculateBaseScore(description, item) {
  const normalizedDesc = normalizeName(description);
  const normalizedName = normalizeName(item.name);

  // Exact match
  if (normalizedDesc === normalizedName) {
    return 100;
  }

  // Prefix match (one starts with the other)
  if (normalizedName.startsWith(normalizedDesc) || normalizedDesc.startsWith(normalizedName)) {
    return 90;
  }

  // Containment (one contains the other)
  if (normalizedName.includes(normalizedDesc) || normalizedDesc.includes(normalizedName)) {
    return 85;
  }

  // Alias match
  if (item.aliases && Array.isArray(item.aliases)) {
    for (const alias of item.aliases) {
      const normalizedAlias = normalizeName(alias);
      if (normalizedAlias === normalizedDesc) return 95;
      if (normalizedAlias.includes(normalizedDesc) || normalizedDesc.includes(normalizedAlias)) {
        return 80;
      }
    }
  }

  // Token overlap (Dice coefficient)
  const descTokens = tokenize(description);
  const nameTokens = tokenize(item.name);

  if (descTokens.length === 0 || nameTokens.length === 0) {
    return 0;
  }

  let matchedTokens = 0;
  for (const token of descTokens) {
    if (nameTokens.some(nt => nt.includes(token) || token.includes(nt))) {
      matchedTokens++;
    }
  }

  const diceScore = (2 * matchedTokens) / (descTokens.length + nameTokens.length);
  return Math.round(diceScore * 70); // Max 70 for token overlap
}

/**
 * Apply recency decay to a score
 *
 * Items not seen recently get reduced confidence to force review.
 *
 * @param {number} baseScore - Base score 0-100
 * @param {string|null} lastPurchaseDate - ISO date string
 * @returns {number} Adjusted score
 */
function applyRecencyDecay(baseScore, lastPurchaseDate) {
  if (!lastPurchaseDate) {
    // Never seen = significant decay
    return Math.round(baseScore * RECENCY_FACTORS.OLD_FACTOR);
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  let factor;
  if (daysSince < RECENCY_FACTORS.RECENT_DAYS) {
    factor = RECENCY_FACTORS.RECENT_FACTOR;
  } else if (daysSince < RECENCY_FACTORS.MODERATE_DAYS) {
    factor = RECENCY_FACTORS.MODERATE_FACTOR;
  } else if (daysSince < RECENCY_FACTORS.STALE_DAYS) {
    factor = RECENCY_FACTORS.STALE_FACTOR;
  } else {
    factor = RECENCY_FACTORS.OLD_FACTOR;
  }

  return Math.round(baseScore * factor);
}

/**
 * Apply vendor context boost
 *
 * @param {number} score - Current score
 * @param {number|null} itemVendorId - Item's vendor ID
 * @param {number|null} invoiceVendorId - Invoice's vendor ID
 * @returns {number} Boosted score (capped at 100)
 */
function applyVendorBoost(score, itemVendorId, invoiceVendorId) {
  if (invoiceVendorId && itemVendorId === invoiceVendorId) {
    return Math.min(100, score + VENDOR_MATCH_BOOST);
  }
  return score;
}

// ============================================
// SKU MATCHING
// ============================================

/**
 * Find inventory item by vendor SKU (exact match)
 *
 * @param {number} vendorId - Vendor ID
 * @param {string} sku - SKU to match
 * @returns {Promise<Object|null>} Matched item or null
 */
async function findBySkuExact(vendorId, sku) {
  if (!vendorId || !sku) return null;

  const normalizedSku = normalizeSku(sku);
  if (!normalizedSku) return null;

  // Get all items for this vendor
  const vendorItems = await inventoryItemDB.getByVendor(vendorId);

  // Find exact SKU match
  return vendorItems.find(item => {
    const itemSku = normalizeSku(item.vendorProductCode) || normalizeSku(item.sku);
    return itemSku === normalizedSku;
  }) || null;
}

/**
 * Find inventory item by vendor SKU (partial match)
 *
 * @param {number} vendorId - Vendor ID
 * @param {string} sku - SKU to match
 * @returns {Promise<Object|null>} Matched item or null
 */
async function findBySkuPartial(vendorId, sku) {
  if (!vendorId || !sku) return null;

  const normalizedSku = normalizeSku(sku);
  if (normalizedSku.length < 3) return null; // Too short for partial match

  const vendorItems = await inventoryItemDB.getByVendor(vendorId);

  // Find partial SKU match (one contains the other)
  return vendorItems.find(item => {
    const itemSku = normalizeSku(item.vendorProductCode) || normalizeSku(item.sku);
    if (!itemSku) return false;
    return itemSku.includes(normalizedSku) || normalizedSku.includes(itemSku);
  }) || null;
}

// ============================================
// FUZZY MATCHING
// ============================================

/**
 * Search inventory with fuzzy matching
 *
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number|null} options.vendorId - Filter to vendor
 * @param {number} options.limit - Max results
 * @param {boolean} options.activeOnly - Only active items
 * @returns {Promise<Object[]>} Matched items with scores
 */
async function fuzzySearch(query, { vendorId = null, limit = 10, activeOnly = true } = {}) {
  // Get candidate items
  let candidates;
  if (vendorId) {
    candidates = await inventoryItemDB.getByVendor(vendorId);
  } else if (activeOnly) {
    candidates = await inventoryItemDB.getActive();
  } else {
    candidates = await inventoryItemDB.getAll();
  }

  // Score each candidate
  const scored = candidates.map(item => ({
    item,
    score: calculateBaseScore(query, item)
  }));

  // Filter and sort
  return scored
    .filter(s => s.score >= CONFIDENCE_THRESHOLDS.SUGGESTION)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

// ============================================
// MAIN MATCHING API
// ============================================

/**
 * Match a single invoice line to inventory
 *
 * @param {Object} line - Invoice line item
 * @param {string} line.description - Item description
 * @param {string} [line.rawDescription] - Raw description
 * @param {string} [line.sku] - SKU/product code
 * @param {Object} options - Matching options
 * @param {number} [options.vendorId] - Vendor ID for context
 * @param {number} [options.autoMatchThreshold] - Min score for auto-match
 * @param {boolean} [options.applyRecencyDecay] - Apply recency decay
 * @param {boolean} [options.boostSameVendor] - Boost same-vendor matches
 * @returns {Promise<import('./types').LineMatchResult>}
 */
export async function matchLine(line, options = {}) {
  const {
    vendorId = null,
    autoMatchThreshold = CONFIDENCE_THRESHOLDS.AUTO_MATCH,
    applyRecencyDecay: useRecency = true,
    boostSameVendor = true
  } = options;

  const description = line.rawDescription || line.description || '';
  const sku = line.sku || line.rawSku || line.itemCode || '';

  const result = {
    lineId: line.id,
    lineNumber: line.lineNumber,
    matched: false,
    bestMatch: null,
    candidates: [],
    autoApplied: false,
    warning: null
  };

  // === PHASE 1: SKU Exact Match ===
  if (vendorId && sku) {
    const skuMatch = await findBySkuExact(vendorId, sku);

    if (skuMatch) {
      // Verify name isn't wildly different (detect SKU reuse)
      const nameScore = calculateBaseScore(description, skuMatch);

      if (nameScore < CONFIDENCE_THRESHOLDS.SKU_NAME_MISMATCH) {
        // SKU matches but name is very different - flag for review
        result.warning = 'sku_name_mismatch';
        result.bestMatch = {
          inventoryItemId: skuMatch.id,
          name: skuMatch.name,
          sku: skuMatch.vendorProductCode || skuMatch.sku,
          vendorId: skuMatch.vendorId,
          vendorName: skuMatch.vendorName,
          score: 95,
          rawScore: 100,
          matchType: 'sku_exact',
          warning: `SKU matches but name differs (${nameScore}% similar)`
        };
        result.candidates = [result.bestMatch];
        return result;
      }

      // Good SKU match
      let score = 100;
      if (useRecency) {
        score = applyRecencyDecay(score, skuMatch.lastPurchaseDate);
      }

      result.matched = true;
      result.autoApplied = score >= autoMatchThreshold;
      result.bestMatch = {
        inventoryItemId: skuMatch.id,
        name: skuMatch.name,
        sku: skuMatch.vendorProductCode || skuMatch.sku,
        vendorId: skuMatch.vendorId,
        vendorName: skuMatch.vendorName,
        score,
        rawScore: 100,
        matchType: 'sku_exact',
        warning: null
      };

      console.log(`[IntelligentMatcher] SKU exact match: ${sku} → ${skuMatch.name} (${score}%)`);
      return result;
    }
  }

  // === PHASE 2: SKU Partial Match ===
  if (vendorId && sku) {
    const skuPartialMatch = await findBySkuPartial(vendorId, sku);

    if (skuPartialMatch) {
      const nameScore = calculateBaseScore(description, skuPartialMatch);

      // Partial SKU match needs higher name correlation
      if (nameScore >= 60) {
        let score = 90;
        if (useRecency) {
          score = applyRecencyDecay(score, skuPartialMatch.lastPurchaseDate);
        }

        result.matched = score >= autoMatchThreshold;
        result.autoApplied = result.matched;
        result.bestMatch = {
          inventoryItemId: skuPartialMatch.id,
          name: skuPartialMatch.name,
          sku: skuPartialMatch.vendorProductCode || skuPartialMatch.sku,
          vendorId: skuPartialMatch.vendorId,
          vendorName: skuPartialMatch.vendorName,
          score,
          rawScore: 90,
          matchType: 'sku_partial',
          warning: null
        };

        console.log(`[IntelligentMatcher] SKU partial match: ${sku} → ${skuPartialMatch.name} (${score}%)`);
        return result;
      }
    }
  }

  // === PHASE 3: Vendor Fuzzy Match ===
  if (vendorId && description) {
    const vendorMatches = await fuzzySearch(description, {
      vendorId,
      limit: 5,
      activeOnly: true
    });

    if (vendorMatches.length > 0) {
      const candidates = vendorMatches.map(item => {
        let score = calculateBaseScore(description, item);
        const rawScore = score;

        if (boostSameVendor) {
          score = applyVendorBoost(score, item.vendorId, vendorId);
        }
        if (useRecency) {
          score = applyRecencyDecay(score, item.lastPurchaseDate);
        }

        return {
          inventoryItemId: item.id,
          name: item.name,
          sku: item.vendorProductCode || item.sku,
          vendorId: item.vendorId,
          vendorName: item.vendorName,
          score,
          rawScore,
          matchType: 'vendor_fuzzy',
          warning: null
        };
      });

      candidates.sort((a, b) => b.score - a.score);
      result.candidates = candidates;

      const best = candidates[0];
      if (best.score >= autoMatchThreshold) {
        result.matched = true;
        result.autoApplied = true;
        result.bestMatch = best;
        console.log(`[IntelligentMatcher] Vendor fuzzy match: "${description}" → ${best.name} (${best.score}%)`);
        return result;
      } else if (best.score >= CONFIDENCE_THRESHOLDS.SUGGESTION) {
        result.bestMatch = best;
        console.log(`[IntelligentMatcher] Vendor fuzzy suggestion: "${description}" → ${best.name} (${best.score}%)`);
        return result;
      }
    }
  }

  // === PHASE 4: Global Fuzzy Match ===
  if (description) {
    const globalMatches = await fuzzySearch(description, {
      vendorId: null,
      limit: 5,
      activeOnly: true
    });

    if (globalMatches.length > 0) {
      const candidates = globalMatches.map(item => {
        let score = calculateBaseScore(description, item);
        const rawScore = score;

        if (boostSameVendor && vendorId) {
          score = applyVendorBoost(score, item.vendorId, vendorId);
        }
        if (useRecency) {
          score = applyRecencyDecay(score, item.lastPurchaseDate);
        }

        return {
          inventoryItemId: item.id,
          name: item.name,
          sku: item.vendorProductCode || item.sku,
          vendorId: item.vendorId,
          vendorName: item.vendorName,
          score,
          rawScore,
          matchType: 'global_fuzzy',
          warning: null
        };
      });

      candidates.sort((a, b) => b.score - a.score);

      // Merge with existing candidates, avoiding duplicates
      for (const candidate of candidates) {
        if (!result.candidates.some(c => c.inventoryItemId === candidate.inventoryItemId)) {
          result.candidates.push(candidate);
        }
      }

      // Sort merged candidates
      result.candidates.sort((a, b) => b.score - a.score);
      result.candidates = result.candidates.slice(0, 5);

      const best = result.candidates[0];
      if (!result.bestMatch && best) {
        result.bestMatch = best;

        if (best.score >= autoMatchThreshold) {
          result.matched = true;
          result.autoApplied = true;
          console.log(`[IntelligentMatcher] Global fuzzy match: "${description}" → ${best.name} (${best.score}%)`);
        } else {
          console.log(`[IntelligentMatcher] Global fuzzy suggestion: "${description}" → ${best.name} (${best.score}%)`);
        }
      }
    }
  }

  return result;
}

/**
 * Match all lines for an invoice
 *
 * Uses parallel processing with batching for performance.
 * Processes up to BATCH_SIZE lines concurrently to avoid overwhelming the database.
 *
 * @param {Object[]} lines - Invoice line items
 * @param {Object} options - Matching options
 * @param {number} [options.batchSize=15] - Max concurrent matches per batch
 * @returns {Promise<import('./types').LineMatchResult[]>}
 */
export async function matchLines(lines, options = {}) {
  const { batchSize = 15, ...matchOptions } = options;

  if (!lines || lines.length === 0) {
    return [];
  }

  // Process each line - returns a promise or immediate result for skipped lines
  const processLine = async (line, index) => {
    // Skip non-product lines (no async needed)
    if (line.lineType && line.lineType !== 'product') {
      return {
        lineId: line.id,
        lineNumber: line.lineNumber ?? index + 1,
        matched: false,
        bestMatch: null,
        candidates: [],
        autoApplied: false,
        warning: `Skipped: ${line.lineType} line`
      };
    }

    return matchLine(line, matchOptions);
  };

  // Process in batches to avoid overwhelming IndexedDB
  const results = [];

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    const batchPromises = batch.map((line, batchIndex) =>
      processLine(line, i + batchIndex)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get matching summary statistics
 *
 * @param {import('./types').LineMatchResult[]} results - Match results
 * @returns {Object} Summary statistics
 */
export function getMatchingSummary(results) {
  const total = results.length;
  const matched = results.filter(r => r.matched).length;
  const autoApplied = results.filter(r => r.autoApplied).length;
  const needsReview = results.filter(r => !r.matched && r.candidates.length > 0).length;
  const noMatch = results.filter(r => !r.matched && r.candidates.length === 0).length;
  const warnings = results.filter(r => r.warning).length;

  const byMatchType = {
    sku_exact: results.filter(r => r.bestMatch?.matchType === 'sku_exact').length,
    sku_partial: results.filter(r => r.bestMatch?.matchType === 'sku_partial').length,
    vendor_fuzzy: results.filter(r => r.bestMatch?.matchType === 'vendor_fuzzy').length,
    global_fuzzy: results.filter(r => r.bestMatch?.matchType === 'global_fuzzy').length
  };

  return {
    total,
    matched,
    matchRate: total > 0 ? Math.round((matched / total) * 100) : 0,
    autoApplied,
    autoApplyRate: total > 0 ? Math.round((autoApplied / total) * 100) : 0,
    needsReview,
    noMatch,
    warnings,
    byMatchType
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  matchLine,
  matchLines,
  getMatchingSummary,

  // Expose for testing
  _helpers: {
    normalizeSku,
    normalizeName,
    tokenize,
    calculateBaseScore,
    applyRecencyDecay,
    applyVendorBoost,
    findBySkuExact,
    findBySkuPartial,
    fuzzySearch
  }
};
