/**
 * Claude Translation Service
 *
 * Provides bilingual (French/English) translation for ingredient search.
 * Uses Claude Haiku for fast, cost-effective translations.
 *
 * Features:
 * - In-memory cache to avoid repeated API calls
 * - Batch translation support
 * - Automatic language detection
 *
 * @module services/ai/claudeTranslate
 */

import {
  API_URL,
  USE_CLOUD_FUNCTION,
  fetchWithRetry,
  safeJSONParse,
  validateClaudeResponse,
  withCredits
} from './claudeBase';

// ============================================
// TRANSLATION CACHE
// ============================================

// In-memory cache: { "patate": { en: "potato", fr: "patate" } }
const translationCache = new Map();

// Cache stats for debugging
let cacheStats = {
  hits: 0,
  misses: 0,
  apiCalls: 0
};

/**
 * Get cache statistics
 * @returns {Object} Cache hit/miss stats
 */
export function getCacheStats() {
  return { ...cacheStats };
}

/**
 * Clear the translation cache
 */
export function clearCache() {
  translationCache.clear();
  cacheStats = { hits: 0, misses: 0, apiCalls: 0 };
}

// ============================================
// PLURAL/SINGULAR STEMMING
// ============================================

/**
 * Remove plural endings to get singular form (basic stemming).
 * Handles common English and French plural patterns.
 *
 * @param {string} word - Word to stem
 * @returns {string[]} Array of possible singular forms
 */
function getSingularForms(word) {
  if (!word || word.length < 3) return [word];

  const forms = new Set([word]);

  // English plurals
  if (word.endsWith('ies')) {
    // berries → berry
    forms.add(word.slice(0, -3) + 'y');
  }
  if (word.endsWith('es')) {
    // tomatoes → tomato, boxes → box
    forms.add(word.slice(0, -2));
    forms.add(word.slice(0, -1)); // also try just removing 's'
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    // carrots → carrot
    forms.add(word.slice(0, -1));
  }

  // French plurals
  if (word.endsWith('aux')) {
    // chevaux → cheval
    forms.add(word.slice(0, -3) + 'al');
  }
  if (word.endsWith('eaux')) {
    // gâteaux → gâteau
    forms.add(word.slice(0, -1));
  }
  if (word.endsWith('x') && !word.endsWith('aux')) {
    // choux → chou
    forms.add(word.slice(0, -1));
  }

  return Array.from(forms);
}

/**
 * Expand a single term with its singular/plural variants
 * @param {string} term - Term to expand
 * @returns {string[]} Array including original and stemmed forms
 */
function expandWithStemming(term) {
  const forms = new Set([term]);

  // Add singular forms
  for (const singular of getSingularForms(term)) {
    forms.add(singular);
  }

  // Also add common plural if word looks singular
  if (!term.endsWith('s') && !term.endsWith('x')) {
    forms.add(term + 's');
  }

  return Array.from(forms);
}

// ============================================
// TRANSLATION FUNCTIONS
// ============================================

/**
 * Translate a food/ingredient term to both English and French.
 * Returns cached result if available.
 *
 * @param {string} term - The term to translate (any language)
 * @param {string} [apiKey] - Claude API key (optional if using cloud function)
 * @returns {Promise<{en: string, fr: string, original: string}>} Translations
 *
 * @example
 * const result = await translateTerm("patate");
 * // { en: "potato", fr: "patate", original: "patate" }
 */
export async function translateTerm(term, apiKey = null) {
  if (!term || typeof term !== 'string') {
    return { en: '', fr: '', original: '' };
  }

  const normalizedTerm = term.toLowerCase().trim();

  // Check cache first
  if (translationCache.has(normalizedTerm)) {
    cacheStats.hits++;
    return { ...translationCache.get(normalizedTerm), original: term };
  }

  cacheStats.misses++;

  // Call Claude for translation
  const translation = await callClaudeForTranslation(normalizedTerm, apiKey);

  // Cache the result
  translationCache.set(normalizedTerm, translation);

  return { ...translation, original: term };
}

/**
 * Expand search terms by adding translations AND singular/plural forms.
 * Given a search query, returns an array of terms to search for.
 *
 * @param {string} query - Search query (can be multi-word)
 * @param {string} [apiKey] - Claude API key (optional if using cloud function)
 * @returns {Promise<string[]>} Array of search terms (original + translations + stems)
 *
 * @example
 * const terms = await expandSearchTerms("carottes");
 * // ["carottes", "carotte", "carrots", "carrot"]
 */
export async function expandSearchTerms(query, apiKey = null) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const terms = new Set([normalizedQuery]);

  // Step 1: Add singular/plural forms of original query
  for (const stemmed of expandWithStemming(normalizedQuery)) {
    terms.add(stemmed);
  }

  // Step 2: Translate the full phrase
  try {
    const fullTranslation = await translateTerm(normalizedQuery, apiKey);
    if (fullTranslation.en && fullTranslation.en !== normalizedQuery) {
      terms.add(fullTranslation.en.toLowerCase());
      // Also stem the translation
      for (const stemmed of expandWithStemming(fullTranslation.en.toLowerCase())) {
        terms.add(stemmed);
      }
    }
    if (fullTranslation.fr && fullTranslation.fr !== normalizedQuery) {
      terms.add(fullTranslation.fr.toLowerCase());
      // Also stem the translation
      for (const stemmed of expandWithStemming(fullTranslation.fr.toLowerCase())) {
        terms.add(stemmed);
      }
    }
  } catch (err) {
    console.warn('Translation failed for full query, continuing with partial:', err.message);
  }

  // Step 3: For multi-word queries, also translate individual words
  const words = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

  if (words.length > 1) {
    for (const word of words) {
      // Add stems for each word
      for (const stemmed of expandWithStemming(word)) {
        terms.add(stemmed);
      }

      try {
        const wordTranslation = await translateTerm(word, apiKey);
        if (wordTranslation.en && wordTranslation.en !== word) {
          terms.add(wordTranslation.en.toLowerCase());
          for (const stemmed of expandWithStemming(wordTranslation.en.toLowerCase())) {
            terms.add(stemmed);
          }
        }
        if (wordTranslation.fr && wordTranslation.fr !== word) {
          terms.add(wordTranslation.fr.toLowerCase());
          for (const stemmed of expandWithStemming(wordTranslation.fr.toLowerCase())) {
            terms.add(stemmed);
          }
        }
      } catch (err) {
        // Silently continue - partial translations are fine
      }
    }
  }

  return Array.from(terms);
}

/**
 * Batch translate multiple terms (more efficient for many terms)
 *
 * @param {string[]} terms - Array of terms to translate
 * @param {string} [apiKey] - Claude API key
 * @returns {Promise<Map<string, {en: string, fr: string}>>} Map of translations
 */
export async function translateBatch(terms, apiKey = null) {
  if (!Array.isArray(terms) || terms.length === 0) {
    return new Map();
  }

  const results = new Map();
  const uncached = [];

  // Check cache first
  for (const term of terms) {
    const normalized = term.toLowerCase().trim();
    if (translationCache.has(normalized)) {
      cacheStats.hits++;
      results.set(term, translationCache.get(normalized));
    } else {
      uncached.push(normalized);
    }
  }

  // Batch translate uncached terms
  if (uncached.length > 0) {
    cacheStats.misses += uncached.length;
    const translations = await callClaudeForBatchTranslation(uncached, apiKey);

    for (const [term, translation] of Object.entries(translations)) {
      translationCache.set(term, translation);
      results.set(term, translation);
    }
  }

  return results;
}

// ============================================
// CLAUDE API CALLS
// ============================================

/**
 * Call Claude to translate a single term
 * @private
 */
async function callClaudeForTranslation(term, apiKey) {
  // Wrap with credit checking (TRANSLATION = 1 credit)
  return withCredits('TRANSLATION', async () => {
    return _callClaudeForTranslationInternal(term, apiKey);
  });
}

// Internal implementation
async function _callClaudeForTranslationInternal(term, apiKey) {
  const prompt = `You are a bilingual food/ingredient translator. Translate this food term to both English and French.

Term: "${term}"

Return ONLY valid JSON (no markdown, no explanation):
{"en": "english translation", "fr": "french translation"}

Rules:
- If the term is already English, still provide the French translation
- If the term is already French, still provide the English translation
- Use common culinary terms (e.g., "patate" -> "potato", not "spud")
- For compound terms, translate the whole phrase naturally
- If unsure, return the original term for both`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (!USE_CLOUD_FUNCTION && apiKey) {
    headers['x-api-key'] = apiKey;
  }

  cacheStats.apiCalls++;

  const response = await fetchWithRetry(
    API_URL,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    },
    10000, // 10 second timeout (fast for simple translation)
    'translateTerm'
  );

  const data = await response.json();
  const text = validateClaudeResponse(data, 'translateTerm');

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('translateTerm: No JSON found in response, returning original');
    return { en: term, fr: term };
  }

  const result = safeJSONParse(jsonMatch[0], 'translateTerm');

  return {
    en: (result.en || term).toLowerCase().trim(),
    fr: (result.fr || term).toLowerCase().trim()
  };
}

/**
 * Call Claude to translate multiple terms at once
 * @private
 */
async function callClaudeForBatchTranslation(terms, apiKey) {
  if (terms.length === 0) return {};

  // Wrap with credit checking (TRANSLATION = 1 credit per batch call)
  return withCredits('TRANSLATION', async () => {
    return _callClaudeForBatchTranslationInternal(terms, apiKey);
  });
}

// Internal implementation
async function _callClaudeForBatchTranslationInternal(terms, apiKey) {
  // Limit batch size to prevent token overflow
  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < terms.length; i += batchSize) {
    batches.push(terms.slice(i, i + batchSize));
  }

  const allResults = {};

  for (const batch of batches) {
    const prompt = `You are a bilingual food/ingredient translator. Translate these food terms to both English and French.

Terms: ${JSON.stringify(batch)}

Return ONLY valid JSON (no markdown, no explanation) as an object where each key is the original term:
{
  "term1": {"en": "english", "fr": "french"},
  "term2": {"en": "english", "fr": "french"}
}

Rules:
- Use common culinary terms
- If unsure, return the original term for both languages`;

    const headers = {
      'Content-Type': 'application/json',
    };

    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    cacheStats.apiCalls++;

    try {
      const response = await fetchWithRetry(
        API_URL,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        },
        30000,
        'translateBatch'
      );

      const data = await response.json();
      const text = validateClaudeResponse(data, 'translateBatch');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = safeJSONParse(jsonMatch[0], 'translateBatch');
        Object.assign(allResults, result);
      }
    } catch (err) {
      console.warn('translateBatch: Batch translation failed:', err.message);
      // Return original terms on failure
      for (const term of batch) {
        allResults[term] = { en: term, fr: term };
      }
    }
  }

  return allResults;
}

// ============================================
// EXPORTS
// ============================================

export default {
  translateTerm,
  expandSearchTerms,
  translateBatch,
  getCacheStats,
  clearCache
};
