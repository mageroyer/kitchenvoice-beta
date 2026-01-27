/**
 * Line Categorizer Module
 *
 * Uses Claude API to intelligently categorize invoice line items.
 * Separates categorization from parsing to keep Vision parser focused.
 *
 * Categories:
 * - FOOD: Food ingredients (meat, produce, dairy, oils, vinegars, spices, etc.)
 * - PACKAGING: Containers, boxes, bags, wraps, disposables
 * - FEE: Delivery charges, fuel surcharges, service fees
 * - CREDIT: Returns, refunds, adjustments (negative amounts)
 * - DEPOSIT: Bottle deposits, pallet deposits, container deposits
 *
 * @module services/invoice/lineCategorizer
 */

import {
  fetchWithRetry,
  API_URL,
  validateClaudeResponse,
} from '../ai/claudeBase';

// ============================================
// CONSTANTS
// ============================================

export const LINE_CATEGORY = {
  FOOD: 'FOOD',
  PACKAGING: 'PACKAGING',
  SUPPLY: 'SUPPLY',
  FEE: 'FEE',
  DIVERS: 'DIVERS',
};

/**
 * Line type - determines routing (inventory, accounting, or both)
 */
export const LINE_TYPE = {
  PRODUCT: 'product',     // → Inventory + Accounting
  FEE: 'fee',             // → Accounting only
  CREDIT: 'credit',       // → Negative adjustment
  DEPOSIT: 'deposit',     // → Tracked separately
  ZERO: 'zero',           // → Skip
};

/**
 * Pricing type - how to calculate unit pricing
 */
export const PRICING_TYPE = {
  WEIGHT: 'weight',       // pricePerG, pricePerLb
  UNIT: 'unit',           // pricePerUnit
  VOLUME: 'volume',       // pricePerML, pricePerL
};

// Use Sonnet for better accuracy
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096; // Increased for large invoices (75+ items)
const TIMEOUT_MS = 30000; // 30 seconds for large invoices

// ============================================
// CATEGORIZATION PROMPT
// ============================================

const SYSTEM_PROMPT = `Classify items into: FOOD, PACKAGING, SUPPLY, FEE, or DIVERS. Categorize each item independently, ignore context. Return only JSON array.`;

/**
 * Build the categorization prompt for a batch of items
 * @param {string[]} descriptions - Array of item descriptions
 * @returns {string} - Formatted prompt
 */
function buildPrompt(descriptions) {
  const itemList = descriptions
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join('\n');

  return `${itemList}

Respond with JSON array only:
[{"index":1,"category":"FOOD"},{"index":2,"category":"PACKAGING"},{"index":3,"category":"FEE"}]`;
}

/**
 * Extract JSON array from response text that might have prefix/suffix text
 * @param {string} text - Raw response text
 * @returns {string} - Extracted JSON string
 */
function extractJsonArray(text) {
  // Find the first [ and last ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error('No valid JSON array found in response');
  }

  return text.substring(firstBracket, lastBracket + 1);
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Categorize invoice line items using Claude API
 *
 * @param {Object[]} lineItems - Array of line items with description field
 * @param {Object} options - Optional configuration
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object[]>} - Line items with category field added
 */
export async function categorizeLineItems(lineItems, options = {}) {
  const { onProgress } = options;
  const startTime = Date.now();

  // Validate input
  if (!lineItems || lineItems.length === 0) {
    return lineItems;
  }

  // Extract descriptions
  const descriptions = lineItems.map(item =>
    item.description || item.name || item.itemName || 'Unknown item'
  );

  if (onProgress) {
    onProgress({ status: 'categorizing', count: descriptions.length });
  }

  try {
    // Build request
    const prompt = buildPrompt(descriptions);

    const requestBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'user', content: prompt }
      ],
      system: SYSTEM_PROMPT,
    };

    // Make API call
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      TIMEOUT_MS,
      'lineCategorizer'
    );

    const data = await response.json();
    const responseText = validateClaudeResponse(data, 'lineCategorizer');

    // Extract JSON array from response (handles prefix text like "Here is the JSON...")
    let jsonText;
    try {
      jsonText = extractJsonArray(responseText);
    } catch (extractError) {
      console.error('[Categorizer] Failed to extract JSON. Raw response:', responseText.substring(0, 500));
      throw extractError;
    }

    // Parse response
    const categories = JSON.parse(jsonText);

    // Validate response structure
    if (!Array.isArray(categories)) {
      throw new Error('Expected array response from categorizer');
    }

    // Build category map (index -> category)
    const categoryMap = new Map();
    for (const item of categories) {
      if (item.index && item.category) {
        // Validate category is one of our known categories
        const cat = item.category.toUpperCase();
        if (Object.values(LINE_CATEGORY).includes(cat)) {
          categoryMap.set(item.index, cat);
        } else {
          console.warn(`[Categorizer] Unknown category "${item.category}" for index ${item.index}, defaulting to DIVERS`);
          categoryMap.set(item.index, LINE_CATEGORY.DIVERS);
        }
      }
    }

    // Apply categories to line items
    const categorizedItems = lineItems.map((item, index) => ({
      ...item,
      category: categoryMap.get(index + 1) || LINE_CATEGORY.DIVERS,
    }));

    // Log results
    const elapsed = Date.now() - startTime;
    const summary = {};
    categorizedItems.forEach(item => {
      summary[item.category] = (summary[item.category] || 0) + 1;
    });

    if (onProgress) {
      onProgress({ status: 'complete', elapsed, summary });
    }

    return categorizedItems;

  } catch (error) {
    console.error('[Categorizer] Error:', error.message);
    if (onProgress) {
      onProgress({ status: 'error', error: error.message });
    }

    // Return items with DIVERS category on error (don't fail the whole flow)
    return lineItems.map(item => ({
      ...item,
      category: LINE_CATEGORY.DIVERS,
    }));
  }
}

/**
 * Categorize a single item (for testing or one-off use)
 *
 * @param {string} description - Item description
 * @returns {Promise<string>} - Category
 */
export async function categorizeSingleItem(description) {
  const result = await categorizeLineItems([{ description }]);
  return result[0]?.category || LINE_CATEGORY.DIVERS;
}

// ============================================
// LOCAL FALLBACK (No API)
// ============================================

// Keywords for local fallback when API is unavailable
const PACKAGING_KEYWORDS = [
  'container', 'conteneur', 'box', 'boîte', 'boite', 'bag', 'sac',
  'wrap', 'film', 'foil', 'tray', 'plateau', 'lid', 'couvercle',
  'cup', 'gobelet', 'napkin', 'serviette', 'straw', 'paille',
  'plate', 'assiette', 'bowl', 'bol', 'clamshell', 'carton',
  'plastic', 'plastique', 'disposable', 'jetable',
];

/**
 * Fallback categorization using keyword matching
 * Use when API is unavailable or for testing
 *
 * @param {Object[]} lineItems - Array of line items
 * @returns {Object[]} - Line items with category field added
 */
export function categorizeLineItemsLocal(lineItems) {
  return lineItems.map(item => {
    const desc = (item.description || item.name || '').toLowerCase();

    // Check for packaging keywords
    if (PACKAGING_KEYWORDS.some(kw => desc.includes(kw))) {
      return { ...item, category: LINE_CATEGORY.PACKAGING };
    }

    // Default to FOOD
    return { ...item, category: LINE_CATEGORY.FOOD };
  });
}

/**
 * Get category display info (icon, label, color)
 *
 * @param {string} category - Category key
 * @returns {Object} - Display info
 */
export function getCategoryDisplay(category) {
  const displays = {
    [LINE_CATEGORY.FOOD]: {
      icon: '🥘',
      label: 'Food',
      color: '#16a34a',
      bgColor: '#dcfce7',
    },
    [LINE_CATEGORY.PACKAGING]: {
      icon: '📦',
      label: 'Pack',
      color: '#ca8a04',
      bgColor: '#fef9c3',
    },
    [LINE_CATEGORY.SUPPLY]: {
      icon: '🧹',
      label: 'Supply',
      color: '#7c3aed',
      bgColor: '#ede9fe',
    },
    [LINE_CATEGORY.FEE]: {
      icon: '💰',
      label: 'Fee',
      color: '#dc2626',
      bgColor: '#fee2e2',
    },
    [LINE_CATEGORY.DIVERS]: {
      icon: '📋',
      label: 'Divers',
      color: '#6b7280',
      bgColor: '#f3f4f6',
    },
  };

  return displays[category] || displays[LINE_CATEGORY.DIVERS];
}

export default {
  categorizeLineItems,
  categorizeSingleItem,
  categorizeLineItemsLocal,
  getCategoryDisplay,
  LINE_CATEGORY,
  LINE_TYPE,
  PRICING_TYPE,
};
