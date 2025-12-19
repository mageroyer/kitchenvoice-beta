/**
 * Claude API Service
 *
 * Wrapper for Anthropic's Claude API for recipe parsing
 * Includes robust error handling with retry logic and rate limiting support
 */

// ============================================
// RETRY CONFIGURATION
// ============================================

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,     // Start with 1 second
  maxDelayMs: 30000,        // Cap at 30 seconds for non-rate-limit errors
  rateLimitDelayMs: 60000,  // Wait 60 seconds for rate limit (429) errors
  backoffMultiplier: 2,     // Double the delay each retry
  jitterFactor: 0.1,        // Add 10% random jitter to prevent thundering herd
};

// Error types that should trigger a retry
const RETRYABLE_STATUS_CODES = [
  429,  // Rate limited
  500,  // Internal server error
  502,  // Bad gateway
  503,  // Service unavailable
  504,  // Gateway timeout
  529,  // Overloaded (Anthropic specific)
];

// Track rate limit state globally to prevent concurrent requests during cooldown
let rateLimitState = {
  isLimited: false,
  retryAfter: null,
  resetTime: null,
};

// ============================================
// ERROR HANDLING HELPERS
// ============================================

/**
 * Fetch with timeout - prevents hanging requests
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 60s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs / 1000}s - server not responding. Check your internet connection.`);
    }
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      throw new Error('Network error - check your internet connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate Claude API response structure
 * @param {Object} data - Response data
 * @param {string} functionName - Name of calling function for error context
 * @returns {string} - The text content from response
 */
function validateClaudeResponse(data, functionName) {
  if (!data) {
    throw new Error(`${functionName}: Empty response from Claude API`);
  }

  if (!Array.isArray(data.content) || data.content.length === 0) {
    throw new Error(`${functionName}: Invalid response structure - missing content`);
  }

  if (typeof data.content[0].text !== 'string') {
    throw new Error(`${functionName}: Invalid response - content is not text`);
  }

  return data.content[0].text;
}

/**
 * Safely parse JSON with better error messages
 * @param {string} jsonText - JSON string to parse
 * @param {string} functionName - Name of calling function for error context
 * @returns {Object} - Parsed JSON
 */
function safeJSONParse(jsonText, functionName) {
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    console.error(`${functionName}: JSON parse error:`, err.message);
    console.error(`${functionName}: Failed text (first 200 chars):`, jsonText.substring(0, 200));
    throw new Error(`${functionName}: Could not parse API response. The AI returned invalid data.`);
  }
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number} retryAfterMs - Optional retry-after header value in ms
 * @param {number} statusCode - HTTP status code (for rate limit handling)
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoffDelay(attempt, retryAfterMs = null, statusCode = null) {
  // For rate limit (429) errors, wait the full 60 seconds
  if (statusCode === 429) {
    // If server specified retry-after, use that, otherwise use our rate limit delay
    if (retryAfterMs && retryAfterMs > 0) {
      return retryAfterMs;
    }
    return RETRY_CONFIG.rateLimitDelayMs;
  }

  // If server specified retry-after, use that (capped at maxDelayMs)
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, RETRY_CONFIG.maxDelayMs);
  }

  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = RETRY_CONFIG.initialDelayMs *
    Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();

  // Cap at max delay
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Parse retry-after header value
 * @param {Response} response - Fetch response
 * @returns {number|null} - Retry after in milliseconds, or null
 */
function parseRetryAfter(response) {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return null;

  // Check if it's a number (seconds)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Check if it's a date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

/**
 * Update rate limit state from response
 * @param {Response} response - Fetch response
 */
function updateRateLimitState(response) {
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response);
    rateLimitState = {
      isLimited: true,
      retryAfter: retryAfterMs,
      resetTime: retryAfterMs ? Date.now() + retryAfterMs : Date.now() + 60000,
    };
  } else if (response.ok) {
    // Clear rate limit state on successful request
    if (rateLimitState.isLimited && Date.now() > rateLimitState.resetTime) {
      rateLimitState = { isLimited: false, retryAfter: null, resetTime: null };
    }
  }
}

/**
 * Check if we're currently rate limited
 * @returns {boolean}
 */
function isRateLimited() {
  if (!rateLimitState.isLimited) return false;
  if (Date.now() > rateLimitState.resetTime) {
    rateLimitState = { isLimited: false, retryAfter: null, resetTime: null };
    return false;
  }
  return true;
}

/**
 * Get remaining rate limit wait time in seconds
 * @returns {number}
 */
function getRateLimitWaitTime() {
  if (!rateLimitState.isLimited) return 0;
  const remaining = Math.ceil((rateLimitState.resetTime - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Handle API errors with user-friendly messages
 * @param {Response} response - Fetch response
 * @param {string} functionName - Name of calling function
 * @returns {Object} - Error info including isRetryable flag
 */
async function handleAPIError(response, functionName) {
  let errorMessage = response.statusText;

  try {
    const errorData = await response.json();
    console.error(`🔍 [${functionName}] Full error response:`, JSON.stringify(errorData, null, 2));
    errorMessage = errorData.error?.message || errorData.message || JSON.stringify(errorData);
  } catch (e) {
    try {
      const textError = await response.text();
      console.error(`🔍 [${functionName}] Error as text:`, textError);
      errorMessage = textError || response.statusText;
    } catch (e2) {
      // Can't read error response
    }
  }

  console.error(`🔍 [${functionName}] Status: ${response.status}, Error: ${errorMessage}`);

  // Update rate limit state
  updateRateLimitState(response);

  // Determine if error is retryable
  const isRetryable = RETRYABLE_STATUS_CODES.includes(response.status);
  const retryAfterMs = parseRetryAfter(response);

  // Create error with metadata
  const error = new Error(getErrorMessage(response.status, errorMessage));
  error.status = response.status;
  error.isRetryable = isRetryable;
  error.retryAfterMs = retryAfterMs;

  throw error;
}

/**
 * Get user-friendly error message based on status code
 * @param {number} status - HTTP status code
 * @param {string} errorMessage - Original error message
 * @returns {string} - User-friendly message
 */
function getErrorMessage(status, errorMessage) {
  switch (status) {
    case 401:
    case 403:
      return 'API key is invalid or expired. Please check your Claude API key in Settings.';
    case 429: {
      const waitTime = getRateLimitWaitTime();
      return waitTime > 0
        ? `API rate limit exceeded. Please wait ${waitTime} seconds and try again.`
        : 'API rate limit exceeded. Please wait a moment and try again.';
    }
    case 400:
      return `Invalid request: ${errorMessage}`;
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Claude API server error. The request will be retried automatically.';
    case 529:
      return 'Claude API is temporarily overloaded. Retrying automatically...';
    default:
      return `API Error (${status}): ${errorMessage}`;
  }
}

/**
 * Fetch with automatic retry logic for transient failures
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 60s)
 * @param {string} functionName - Name of calling function for logging
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, timeoutMs = 60000, functionName = 'API', onRetry = null) {
  // Check if we're rate limited before even trying
  if (isRateLimited()) {
    const waitTime = getRateLimitWaitTime();
    console.log(`${functionName}: Rate limited, waiting ${waitTime}s before request`);
    if (onRetry) {
      onRetry({
        type: 'rate_limit_wait',
        waitSeconds: waitTime,
        message: `Rate limited. Waiting ${waitTime} seconds...`
      });
    }
    await sleep(waitTime * 1000);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // Update rate limit state
      updateRateLimitState(response);

      if (response.ok) {
        return response;
      }

      // Handle error response
      const isRetryable = RETRYABLE_STATUS_CODES.includes(response.status);

      if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
        // Non-retryable error or out of retries - throw
        await handleAPIError(response, functionName);
      }

      // Retryable error - calculate delay and retry
      const retryAfterMs = parseRetryAfter(response);
      const delayMs = calculateBackoffDelay(attempt, retryAfterMs, response.status);

      console.warn(
        `${functionName}: Request failed with ${response.status}, ` +
        `retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`
      );

      if (onRetry) {
        onRetry({
          type: 'retry',
          attempt: attempt + 1,
          maxRetries: RETRY_CONFIG.maxRetries,
          delayMs,
          status: response.status,
          message: `Request failed. Retrying in ${Math.round(delayMs / 1000)}s...`
        });
      }

      await sleep(delayMs);

    } catch (error) {
      lastError = error;

      // Network errors are always retryable
      const isNetworkError = error.message.includes('Network error') ||
                             error.message.includes('timeout') ||
                             error.message.includes('Failed to fetch');

      if (!isNetworkError && !error.isRetryable) {
        throw error;
      }

      if (attempt === RETRY_CONFIG.maxRetries) {
        // Out of retries
        throw new Error(
          `${functionName}: Request failed after ${RETRY_CONFIG.maxRetries + 1} attempts. ` +
          `Last error: ${error.message}`
        );
      }

      const delayMs = calculateBackoffDelay(attempt, error.retryAfterMs);

      console.warn(
        `${functionName}: ${error.message}, ` +
        `retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`
      );

      if (onRetry) {
        onRetry({
          type: 'retry',
          attempt: attempt + 1,
          maxRetries: RETRY_CONFIG.maxRetries,
          delayMs,
          isNetworkError,
          message: `${error.message} Retrying in ${Math.round(delayMs / 1000)}s...`
        });
      }

      await sleep(delayMs);
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error(`${functionName}: Request failed after all retries`);
}

/**
 * Validate required recipe fields
 * @param {Object} recipe - Recipe object to validate
 * @param {string} functionName - Name of calling function
 * @returns {Object} - Validated recipe with defaults applied
 */
function validateRecipeFields(recipe, functionName) {
  if (!recipe || typeof recipe !== 'object') {
    throw new Error(`${functionName}: Invalid recipe data received`);
  }

  // Apply defaults for missing fields
  return {
    name: recipe.name || 'Untitled Recipe',
    category: recipe.category || 'Other',
    portions: typeof recipe.portions === 'number' ? recipe.portions : parseInt(recipe.portions) || 0,
    department: recipe.department || '',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    method: typeof recipe.method === 'string' ? recipe.method :
            Array.isArray(recipe.method) ? recipe.method.join('\n') : '',
    platingInstructions: Array.isArray(recipe.platingInstructions) ? recipe.platingInstructions :
                         recipe.platingInstructions ? [recipe.platingInstructions] : [],
    notes: Array.isArray(recipe.notes) ? recipe.notes :
           recipe.notes ? [recipe.notes] : [],
    ...recipe
  };
}

// ============================================
// CONFIGURATION
// ============================================

// Firebase Cloud Function URL for production (secure server-side API key)
const CLOUD_FUNCTION_URL = 'https://us-central1-smartcookbook-2afe2.cloudfunctions.net/claudeProxy';

// For local development: use localhost proxy (HTTPS on port 3000)
// For tablet testing: replace with your computer's IP (e.g., 'https://192.168.1.100:3000/api/claude')
const LOCAL_PROXY_URL = import.meta.env.VITE_PROXY_URL || null;

// Determine which endpoint to use:
// - If VITE_PROXY_URL is set, use it (local development with proxy)
// - Otherwise, use Cloud Function (production or dev without local proxy)
const useLocalProxy = !!LOCAL_PROXY_URL;
const API_URL = useLocalProxy ? LOCAL_PROXY_URL : CLOUD_FUNCTION_URL;

// Flag to indicate if we're using the cloud function (no client API key needed)
const USE_CLOUD_FUNCTION = !useLocalProxy;

/**
 * Check if the app is using the cloud function (no client API key needed)
 * @returns {boolean}
 */
export function isUsingCloudFunction() {
  return USE_CLOUD_FUNCTION;
}

/**
 * Validate and fix ingredient fields
 * Ensures metric = metricQty + metricUnit and toolMeasure = toolQty + toolUnit
 * Also fixes misplaced values (non-metric in metric fields → move to tool fields)
 */
function validateAndFixIngredients(ingredients) {
  // Valid metric units (weight and liquid volume only)
  // Include common variations: gr, grs, gramme, grammes, etc.
  const VALID_METRIC_UNITS = ['g', 'kg', 'ml', 'l'];
  const METRIC_UNIT_ALIASES = {
    'gr': 'g',
    'grs': 'g',
    'gramme': 'g',
    'grammes': 'g',
    'gram': 'g',
    'grams': 'g',
    'kilogramme': 'kg',
    'kilogrammes': 'kg',
    'kilogram': 'kg',
    'kilograms': 'kg',
    'litre': 'l',
    'litres': 'l',
    'liter': 'l',
    'liters': 'l',
    'millilitre': 'ml',
    'millilitres': 'ml',
    'milliliter': 'ml',
    'milliliters': 'ml',
  };

  // Helper to normalize metric units
  const normalizeMetricUnit = (unit) => {
    if (!unit) return '';
    const lower = unit.toLowerCase().trim();
    if (VALID_METRIC_UNITS.includes(lower)) return lower;
    if (METRIC_UNIT_ALIASES[lower]) return METRIC_UNIT_ALIASES[lower];
    return null; // Not a metric unit
  };

  return ingredients.map(ing => {
    // Skip validation for section tags - just return as-is
    if (ing.isSection) {
      return { isSection: true, sectionName: ing.sectionName || '' };
    }

    const fixed = { ...ing };

    // Ensure all required fields exist and convert null/undefined to empty strings
    if (fixed.metricQty === undefined || fixed.metricQty === null) fixed.metricQty = '';
    if (fixed.metricUnit === undefined || fixed.metricUnit === null) fixed.metricUnit = '';
    if (fixed.metric === undefined || fixed.metric === null) fixed.metric = '';
    if (fixed.toolQty === undefined || fixed.toolQty === null) fixed.toolQty = '';
    if (fixed.toolUnit === undefined || fixed.toolUnit === null) fixed.toolUnit = '';
    if (fixed.toolMeasure === undefined || fixed.toolMeasure === null) fixed.toolMeasure = '';
    if (fixed.specification === undefined || fixed.specification === null) fixed.specification = '';

    // Convert to strings
    fixed.metricQty = String(fixed.metricQty);
    fixed.metricUnit = String(fixed.metricUnit);
    fixed.metric = String(fixed.metric);
    fixed.toolQty = String(fixed.toolQty);
    fixed.toolUnit = String(fixed.toolUnit);
    fixed.toolMeasure = String(fixed.toolMeasure);

    // === FIX 1: Move metric values FROM tool TO metric ===
    // If toolUnit is actually a metric unit (g, kg, ml, l, gr, etc.), move to metric fields
    if (fixed.toolUnit) {
      const normalizedUnit = normalizeMetricUnit(fixed.toolUnit);
      if (normalizedUnit && !fixed.metricQty) {
        console.log(`🔧 Moving metric unit "${fixed.toolUnit}" from tool to metric`);
        fixed.metricQty = fixed.toolQty;
        fixed.metricUnit = normalizedUnit;
        // Clear tool fields
        fixed.toolQty = '';
        fixed.toolUnit = '';
        fixed.toolMeasure = '';
      }
    }

    // Also check toolMeasure for metric patterns like "525 gr", "75g", "500 g"
    if (fixed.toolMeasure && !fixed.metricQty) {
      const toolMatch = fixed.toolMeasure.match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
      if (toolMatch) {
        const normalizedUnit = normalizeMetricUnit(toolMatch[2]);
        if (normalizedUnit) {
          console.log(`🔧 Moving metric value "${fixed.toolMeasure}" from toolMeasure to metric`);
          fixed.metricQty = toolMatch[1].replace(',', '.');
          fixed.metricUnit = normalizedUnit;
          // Clear tool fields
          fixed.toolQty = '';
          fixed.toolUnit = '';
          fixed.toolMeasure = '';
        }
      }
    }

    // === FIX 2: Move non-metric values FROM metric TO tool ===
    // If metricUnit is not a valid metric unit, move to tool fields
    if (fixed.metricUnit) {
      const normalizedUnit = normalizeMetricUnit(fixed.metricUnit);
      if (!normalizedUnit) {
        console.log(`🔧 Moving non-metric unit "${fixed.metricUnit}" from metric to tool`);
        // Move to tool fields if tool is empty
        if (!fixed.toolQty) {
          fixed.toolQty = fixed.metricQty;
          fixed.toolUnit = fixed.metricUnit;
        }
        // Clear metric fields
        fixed.metricQty = '';
        fixed.metricUnit = '';
        fixed.metric = '';
      } else {
        // Normalize the metric unit (e.g., "gr" → "g")
        fixed.metricUnit = normalizedUnit;
      }
    }

    // Also check the combined metric field for non-metric patterns
    if (fixed.metric && !fixed.metricUnit) {
      const metricMatch = fixed.metric.match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
      if (metricMatch) {
        const normalizedUnit = normalizeMetricUnit(metricMatch[2]);
        if (!normalizedUnit) {
          console.log(`🔧 Moving non-metric value "${fixed.metric}" to tool`);
          if (!fixed.toolQty) {
            fixed.toolQty = metricMatch[1];
            fixed.toolUnit = metricMatch[2];
          }
          fixed.metricQty = '';
          fixed.metricUnit = '';
          fixed.metric = '';
        } else {
          // It's a valid metric, extract and normalize
          fixed.metricQty = metricMatch[1].replace(',', '.');
          fixed.metricUnit = normalizedUnit;
        }
      }
    }

    // === Rebuild metric field from metricQty + metricUnit ===
    if (fixed.metricQty && fixed.metricUnit) {
      fixed.metric = `${fixed.metricQty}${fixed.metricUnit}`;
    } else if (fixed.metricQty && !fixed.metricUnit) {
      // Check if it's a pure number (might be countable, move to tool)
      if (!fixed.toolQty) {
        fixed.toolQty = fixed.metricQty;
        fixed.toolUnit = 'unt';
      }
      fixed.metricQty = '';
      fixed.metric = '';
    } else {
      fixed.metric = '';
    }

    // === Rebuild toolMeasure field from toolQty + toolUnit ===
    if (fixed.toolQty && fixed.toolUnit) {
      fixed.toolMeasure = `${fixed.toolQty} ${fixed.toolUnit}`;
    } else if (fixed.toolQty && !fixed.toolUnit) {
      fixed.toolMeasure = fixed.toolQty;
    } else {
      fixed.toolMeasure = '';
    }

    // Normalize units to lowercase
    if (typeof fixed.metricUnit === 'string') {
      fixed.metricUnit = fixed.metricUnit.toLowerCase();
    }

    return fixed;
  });
}

/**
 * Parse PDF recipe text using Claude API
 *
 * @param {string} pdfText - Extracted text from PDF
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Object>} Parsed recipe object
 */
export async function parsePDFRecipeWithClaude(pdfText, apiKey, onRetry = null) {
  console.log('📄 Parsing PDF recipe with Claude...');
  console.log('📝 Text length:', pdfText.length, 'characters');

  const prompt = `Analyser ce texte de recette (extrait d'un PDF) et retourner un JSON structuré.

Texte de la recette:
"""
${pdfText}
"""

=== RÈGLE CRITIQUE: ANALYSE LIGNE PAR LIGNE ===
CHAQUE LIGNE DU PDF = UN INGRÉDIENT DISTINCT.

=== STRATÉGIE DE PARSING (dans cet ordre) ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ (début ou fin de ligne)
- Début: "25 kg viande" → quantité=25, unité=kg
- Fin entre parenthèses: "Darne de thon (25)" → quantité=25, unité=unt
- Fin descriptif: "Tomates (3 cannes)" → quantité=3, unité=bt
- Aucune quantité? → laisser champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN, en reculant)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée, en julienne
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette", "voir autre recette"
- DESCRIPTION VISUELLE: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Le nom inclut:
- Marques: "Perrilini", "Philadelphia"
- Variétés: "de chèvre", "basmati", "italien"
- Types: "Sauce Gastrique à la fraise"

=== EXEMPLES DE PARSING ===

"Fromage de chèvre Perrilini en flocons":
→ name: "fromage de chèvre perrilini", specification: "en flocons"
(Perrilini = marque, pas une transformation)

"Darne de Thon (25)":
→ toolQty: "25", toolUnit: "unt", name: "darne de thon", specification: ""
(25 = quantité, pas specification)

"Sauce Gastrique à la fraise (voir recette)":
→ name: "sauce gastrique à la fraise", specification: "voir recette"

"Graines de sésame noir et blanc":
→ name: "graines de sésame", specification: "noir et blanc"

"Tomates italiennes broyées (3 cannes)":
→ toolQty: "3", toolUnit: "bt", name: "tomates italiennes", specification: "broyées"

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES INGRÉDIENTS ===

"10 kg Viande haché":
metric:"10kg", metricQty:"10", metricUnit:"kg", toolQty:"", toolUnit:"", toolMeasure:"", name:"viande haché", specification:""

"2,4 kg Oignons en dés":
metric:"2.4kg", metricQty:"2.4", metricUnit:"kg", toolQty:"", toolUnit:"", toolMeasure:"", name:"oignons", specification:"en dés"

"3 bottes d'aneth hachée finement":
metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"botte", toolMeasure:"3 botte", name:"aneth", specification:"hachée finement"

"1/3 paquet de fromage à la crème":
metric:"", metricQty:"", metricUnit:"", toolQty:"0.33", toolUnit:"pqt", toolMeasure:"0.33 pqt", name:"fromage à la crème", specification:""

"1 tasse de crème sure":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"T", toolMeasure:"1 T", name:"crème sure", specification:""

"Champignons tranchés (une boite)":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"bt", toolMeasure:"1 bt", name:"champignons", specification:"tranchés"

"Tomates broyés en canne (3)":
metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"bt", toolMeasure:"3 bt", name:"tomates", specification:"broyés"

"4 gousses d'ail émincées":
metric:"", metricQty:"", metricUnit:"", toolQty:"4", toolUnit:"gousse", toolMeasure:"4 gousse", name:"ail", specification:"émincées"

"1 cuillère à soupe d'huile":
metric:"", metricQty:"", metricUnit:"", toolQty:"1", toolUnit:"c.s.", toolMeasure:"1 c.s.", name:"huile", specification:""

"sel et poivre":
(SÉPARER EN 2 INGRÉDIENTS)
1. name:"sel", specification:"au goût"
2. name:"poivre", specification:"au goût"

=== SECTIONS (lignes avec astérisque) ===
- Si une ligne contient * avant le nom, créer une section
- Format: {"isSection": true, "sectionName": "NOM EN MAJUSCULES"}
- Exemple: "*SAUCE" → {"isSection": true, "sectionName": "SAUCE"}
- Si la ligne avec * a une mesure, c'est un ingrédient normal, pas une section

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75
- Virgule décimale: 2,4 → 2.4

=== MÉTHODE (CRITIQUE - NE PAS OMETTRE) ===
⚠️ LA MÉTHODE EST OBLIGATOIRE - TOUJOURS L'EXTRAIRE EN ENTIER!

- Extraire TOUTES les étapes de préparation/cuisson du texte
- Combiner en une seule chaîne avec \\n entre chaque étape
- Inclure: temps, température, techniques, ordre des opérations
- Si le texte contient une section "Méthode", "Procédure", "Préparation", "Étapes" - extraire son contenu
- NE JAMAIS retourner un champ "method" vide si le texte contient des instructions

EXEMPLE:
method: "1. Préchauffer le four à 180°C.\\n2. Mélanger les ingrédients secs.\\n3. Incorporer les oeufs.\\n4. Cuire 25 minutes."

=== MISE EN PLAT / PLATING ===
Section souvent intitulée: "Mise en plat", "Plating", "Présentation", "Dressage"
- CHAQUE LIGNE = une instruction distincte
- Inclure TOUS les éléments listés (contenants, garnitures, sauces, etc.)
- Exemples de lignes à capturer:
  * "Plats magasin rég:" → "Plats magasin régulier"
  * "De tranches de thon" → "Tranches de thon"
  * "Sacs sous-vides:" → "Sacs sous-vides"
  * "45min Temps de mise en plats" → "45 min temps de mise en plats"
- Retirer les "De" au début si orphelins
- VERBATIM: ne pas reformuler, garder le texte original

=== NOTES ===
- Conseils, temps de conservation, variations
- CHAQUE ligne ou phrase = une note distincte

=== MÉTADONNÉES (CRITIQUE) ===

⚠️ NOM DE LA RECETTE - RÈGLES IMPORTANTES:
- Le nom est le PLAT/PRÉPARATION, PAS le nom de l'entreprise/restaurant
- IGNORER les en-têtes de compagnie (ex: "Aux saveurs de...", "Restaurant...", "Cuisine de...")
- Chercher le nom qui décrit le PLAT (ex: "Boulette Italienne", "Sauce Béchamel", "Poulet Rôti")
- Souvent près de "Portions:", "Ingrédients:", ou après l'en-tête de compagnie

Exemples:
❌ "Aux saveurs des Sévelin" = Nom d'entreprise → IGNORER
✅ "Boulette Italienne" = Nom du plat → UTILISER

- name: Nom du PLAT (pas l'entreprise)
- category: UN de [Appetizers, Soups, Salads, Main Courses, Side Dishes, Desserts, Beverages, Sauces, Breads, Breakfast, Pastries, Other]
- portions: nombre (défaut 0 si non spécifié)
- department: TOUJOURS utiliser "Cuisine" comme valeur par défaut

Retourne SEULEMENT le JSON valide:
{
  "name": "Nom de la recette",
  "category": "Main Courses",
  "portions": 0,
  "department": "Cuisine",
  "ingredients": [
    {
      "groupColor": null,
      "metric": "",
      "metricQty": "",
      "metricUnit": "",
      "toolQty": "",
      "toolUnit": "",
      "toolMeasure": "",
      "name": "",
      "specification": ""
    }
  ],
  "method": "Étape 1\\nÉtape 2\\nÉtape 3",
  "platingInstructions": ["instruction 1", "instruction 2"],
  "notes": ["note 1", "note 2"]
}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    console.log(`🔗 Using ${USE_CLOUD_FUNCTION ? 'Cloud Function' : 'Local Proxy'}: ${API_URL}`);

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 4096, // Haiku max limit
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      90000, // 90 second timeout
      'parsePDFRecipeWithClaude',
      onRetry
    );

    // Log rate limit info (only available from direct API or proxy that forwards headers)
    const requestsRemaining = response.headers.get('x-ratelimit-requests-remaining');
    const tokensRemaining = response.headers.get('x-ratelimit-tokens-remaining');
    if (requestsRemaining || tokensRemaining) {
      console.log('🔍 Claude API Rate Limit Info:');
      console.log('  Requests Remaining:', requestsRemaining);
      console.log('  Tokens Remaining:', tokensRemaining);
    }

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parsePDFRecipeWithClaude');

    console.log('🤖 Claude response received');

    // Extract JSON from response
    let jsonText = content.trim();

    // Try markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first { and last }
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = content.substring(jsonStart, jsonEnd + 1);
      }
    }

    const parsedRecipe = safeJSONParse(jsonText, 'parsePDFRecipeWithClaude');

    // Validate recipe fields
    const validatedRecipe = validateRecipeFields(parsedRecipe, 'parsePDFRecipeWithClaude');

    // Validate and fix ingredients
    if (validatedRecipe.ingredients && Array.isArray(validatedRecipe.ingredients)) {
      validatedRecipe.ingredients = validateAndFixIngredients(validatedRecipe.ingredients);
      console.log('✅ Validated and fixed', validatedRecipe.ingredients.length, 'ingredients');
    }

    // Add metadata
    const recipe = {
      ...validatedRecipe,
      updatedAt: new Date().toISOString()
    };

    console.log('✅ Recipe parsed successfully:', recipe.name);
    console.log('📊 Ingredients:', recipe.ingredients?.length || 0);

    return recipe;

  } catch (error) {
    console.error('❌ Error parsing PDF with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk ingredient text using Claude API
 *
 * @param {string} ingredientText - Multiple ingredient lines (spoken text)
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of parsed ingredient objects
 */
export async function parseBulkIngredientsWithClaude(ingredientText, apiKey, onRetry = null) {
  console.log('🎤 Parsing bulk ingredients with Claude...');
  console.log('📝 Input text:', ingredientText);

  const prompt = `Analyse les ingrédients de recette québécoise et retourne un JSON.

ENTRÉE (texte dicté avec ponctuation automatique):
"""
${ingredientText}
"""

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UN INGRÉDIENT ET LE DÉBUT D'UN NOUVEAU.

=== STRATÉGIE DE PARSING (dans cet ordre) ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ
- Début: "500g boeuf" → quantité=500, unité=g
- Fin: "tomates (3 cannes)" → quantité=3, unité=bt
- Aucune? → champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette"
- DESCRIPTION: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Inclut marques, variétés, types.

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES ===

Entrée: "500g de boeuf haché. 2 cannes de tomates. 3 gousses d'ail."
Sortie: [
  {metric:"500g", metricQty:"500", metricUnit:"g", toolQty:"", toolUnit:"", toolMeasure:"", name:"boeuf haché"},
  {metric:"", metricQty:"", metricUnit:"", toolQty:"2", toolUnit:"bt", toolMeasure:"2 bt", name:"tomates"},
  {metric:"", metricQty:"", metricUnit:"", toolQty:"3", toolUnit:"gousse", toolMeasure:"3 gousse", name:"ail"}
]

Entrée: "une demi tasse d'huile d'olive, 750 ml de bouillon, sel et poivre."
Sortie: [
  {toolQty:"0.5", toolUnit:"T", toolMeasure:"0.5 T", name:"huile d'olive"},
  {metric:"750ml", metricQty:"750", metricUnit:"ml", name:"bouillon"},
  {name:"sel", specification:"au goût"},
  {name:"poivre", specification:"au goût"}
]

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- "et" sépare souvent 2 ingrédients (ex: "sel et poivre" = 2 ingrédients)
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75
- NE JAMAIS inventer ou ajouter du texte - retourner SEULEMENT ce que l'utilisateur a dit

=== SECTIONS (étiquettes de groupe) ===
Si l'utilisateur dit "section sauce" ou "pour la sauce" ou nomme une catégorie:
- Créer un objet section: {"isSection": true, "sectionName": "SAUCE"}
- sectionName en MAJUSCULES
- Placer la section AVANT les ingrédients qui y appartiennent

Retourne SEULEMENT le tableau JSON, pas de texte explicatif.`;


  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkIngredientsWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkIngredientsWithClaude');

    console.log('🤖 [CLAUDE] Raw response:', content);

    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    console.log('🤖 [CLAUDE] Extracted JSON:', jsonText);

    const parsedIngredients = safeJSONParse(jsonText, 'parseBulkIngredientsWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedIngredients)) {
      throw new Error('parseBulkIngredientsWithClaude: Expected array of ingredients');
    }

    console.log('🤖 [CLAUDE] Parsed ingredients (before validation):', JSON.stringify(parsedIngredients, null, 2));

    // Validate and fix ingredients
    const validatedIngredients = validateAndFixIngredients(parsedIngredients);

    console.log('🤖 [CLAUDE] Validated ingredients (after fix):', JSON.stringify(validatedIngredients, null, 2));
    console.log('✅ Parsed', validatedIngredients.length, 'ingredients');
    return validatedIngredients;

  } catch (error) {
    console.error('❌ Error parsing bulk ingredients with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk method steps using Claude API
 *
 * @param {string} methodText - Multiple method step lines (spoken text)
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of method step strings
 */
export async function parseBulkMethodStepsWithClaude(methodText, apiKey, onRetry = null) {
  console.log('🎤 Parsing bulk method steps with Claude...');
  console.log('📝 Input text:', methodText);

  const prompt = `Séparer les étapes de méthode dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${methodText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) MARQUE LA FIN D'UNE ÉTAPE.
Le texte entre deux points = UNE étape distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente
- "degrés" ou "degré" → "°C" (conversion autorisée)

=== EXEMPLES ===

Entrée: "Préchauffer le four à 180 degrés. Mélanger farine et sucre. Battre les oeufs."
Sortie: ["Préchauffer le four à 180°C.", "Mélanger farine et sucre.", "Battre les oeufs."]

Entrée: "euh faire revenir oignons. ajouter ail. cuire 5 minutes."
Sortie: ["Faire revenir oignons.", "Ajouter ail.", "Cuire 5 minutes."]

=== INTERDIT ===
❌ "Cuire 5 min" → "Faire cuire à feu moyen pendant 5 minutes" (AJOUT DE MOTS)
❌ "Mélanger" → "Bien mélanger tous les ingrédients ensemble" (REFORMULATION)
❌ Combiner plusieurs étapes en une seule

Retourne SEULEMENT le tableau JSON:
["étape 1", "étape 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkMethodStepsWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkMethodStepsWithClaude');

    console.log('🤖 Claude response received');

    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedSteps = safeJSONParse(jsonText, 'parseBulkMethodStepsWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedSteps)) {
      throw new Error('parseBulkMethodStepsWithClaude: Expected array of steps');
    }

    console.log('✅ Parsed', parsedSteps.length, 'method steps');
    return parsedSteps;

  } catch (error) {
    console.error('❌ Error parsing bulk method steps with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk plating instructions using Claude API
 *
 * @param {string} platingText - Raw plating instructions from voice
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of plating instruction strings
 */
export async function parseBulkPlatingWithClaude(platingText, apiKey, onRetry = null) {
  const prompt = `Séparer les instructions de dressage dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${platingText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots (comme "translucide", "Placer", etc.)
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UNE INSTRUCTION.
Le texte entre deux ponctuations = UNE instruction distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente (ex: "magasing" → "magasin")

=== EXEMPLES ===

Entrée: "Plat magasin régulier 1 litre. Mettre couvercle."
Sortie: ["Plat magasin régulier 1 litre.", "Mettre couvercle."]

Entrée: "Garnir avec persil. Sauce sur le côté."
Sortie: ["Garnir avec persil.", "Sauce sur le côté."]

Entrée: "euh disposer les légumes autour. voilà ajouter huile."
Sortie: ["Disposer les légumes autour.", "Ajouter huile."]

=== INTERDIT ===
❌ "Plat magasin" → "Placer un plat magasin translucide" (AJOUT DE MOTS)
❌ "Sauce côté" → "Verser délicatement la sauce sur le côté" (REFORMULATION)
❌ Combiner plusieurs instructions en une seule

Retourne SEULEMENT le tableau JSON:
["instruction 1", "instruction 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkPlatingWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkPlatingWithClaude');

    console.log('🤖 Claude response received');

    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedInstructions = safeJSONParse(jsonText, 'parseBulkPlatingWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedInstructions)) {
      throw new Error('parseBulkPlatingWithClaude: Expected array of instructions');
    }

    console.log('✅ Parsed', parsedInstructions.length, 'plating instructions');
    return parsedInstructions;

  } catch (error) {
    console.error('❌ Error parsing bulk plating instructions with Claude:', error);
    throw error;
  }
}

/**
 * Parse bulk notes using Claude API
 *
 * @param {string} notesText - Raw notes from voice
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Array>} Array of note strings
 */
export async function parseBulkNotesWithClaude(notesText, apiKey, onRetry = null) {
  const prompt = `Séparer les notes de recette dictées en tableau JSON.

ENTRÉE (transcription vocale avec ponctuation automatique):
"""
${notesText}
"""

=== RÈGLE CRITIQUE: VERBATIM ===
RETOURNER LE TEXTE EXACTEMENT COMME DICTÉ.
- NE PAS reformuler
- NE PAS compléter les phrases
- NE PAS ajouter de mots
- NE PAS corriger la grammaire
- SEULEMENT séparer par les points et nettoyer les hésitations

=== RÈGLE CRITIQUE: PONCTUATION ===
CHAQUE POINT (.) OU VIRGULE (,) MARQUE LA FIN D'UNE NOTE.
Le texte entre deux ponctuations = UNE note distincte.

=== NETTOYAGE AUTORISÉ (SEULEMENT) ===
- Supprimer: "euh", "alors", "bon", "voilà", "donc"
- Majuscule au début
- Point à la fin
- Corriger l'orthographe évidente

=== EXEMPLES ===

Entrée: "Se conserve 3 jours au frigo. Meilleur chaud."
Sortie: ["Se conserve 3 jours au frigo.", "Meilleur chaud."]

Entrée: "euh peut congeler. bon servir avec pain."
Sortie: ["Peut congeler.", "Servir avec pain."]

=== INTERDIT ===
❌ "Congeler" → "Ce plat peut se congeler pendant 3 mois" (AJOUT DE MOTS)
❌ "Servir chaud" → "Il est recommandé de servir ce plat bien chaud" (REFORMULATION)
❌ Combiner plusieurs notes en une seule

Retourne SEULEMENT le tableau JSON:
["note 1", "note 2"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    // Use fetchWithRetry for automatic retry on transient failures
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 2048,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      },
      60000,
      'parseBulkNotesWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseBulkNotesWithClaude');

    console.log('🤖 Claude response received');

    // Extract JSON array from response
    let jsonText = content.trim();

    // Try to find JSON array in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first [ and last ]
      const arrayStart = content.indexOf('[');
      const arrayEnd = content.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonText = content.substring(arrayStart, arrayEnd + 1);
      }
    }

    const parsedNotes = safeJSONParse(jsonText, 'parseBulkNotesWithClaude');

    // Ensure we got an array
    if (!Array.isArray(parsedNotes)) {
      throw new Error('parseBulkNotesWithClaude: Expected array of notes');
    }

    console.log('✅ Parsed', parsedNotes.length, 'notes');
    return parsedNotes;

  } catch (error) {
    console.error('❌ Error parsing bulk notes with Claude:', error);
    throw error;
  }
}

/**
 * Parse invoice from image(s) using Claude Vision API
 * Supports single image or multiple images (multi-page PDFs)
 *
 * @param {string|string[]} imageDataUrl - Base64 data URL(s) of the invoice image(s)
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @param {string} promptHints - Optional vendor profile hints to guide parsing
 * @returns {Promise<Object>} Parsed invoice object
 */
export async function parseInvoiceImageWithClaude(imageDataUrl, apiKey, onRetry = null, promptHints = '') {
  // Normalize to array for consistent handling
  const imageUrls = Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl];
  const isMultiPage = imageUrls.length > 1;

  console.log(`🖼️ Parsing invoice from ${imageUrls.length} image(s) with Claude Vision...`);

  // Build image content blocks
  const imageBlocks = [];
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error(`Invalid image data URL format for image ${i + 1}`);
    }

    const mediaType = matches[1];
    const base64Data = matches[2];

    if (!supportedTypes.includes(mediaType)) {
      console.error(`❌ Unsupported image type: ${mediaType}`);
      throw new Error(`Unsupported image format: ${mediaType}. Please use JPEG, PNG, GIF, or WebP images.`);
    }

    console.log(`📷 Page ${i + 1}: ${mediaType}, ${Math.round(base64Data.length / 1024)}KB`);

    imageBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Data
      }
    });
  }

  if (promptHints) {
    console.log(`📝 Profile hints: ${promptHints.substring(0, 100)}...`);
  }

  // Build prompt with multi-page note if applicable
  const hintsSection = promptHints ? `\n\nIMPORTANT PROFILE HINTS:\n${promptHints}\n` : '';
  const multiPageNote = isMultiPage
    ? `\n\nNOTE: Cette facture a ${imageUrls.length} pages. Extraire TOUS les produits de TOUTES les pages dans un seul tableau lineItems.\n`
    : '';

  const prompt = `Tu es un comptable. Extraire les données de cette facture.${hintsSection}${multiPageNote}

ÉTAPE 1 - VENDEUR
Extraire le nom, téléphone, email, adresse, numéro de facture, date (YYYY-MM-DD).

ÉTAPE 2 - TABLEAU
A) Trouve la LIGNE D'EN-TÊTES (habituellement: No, Description, Commande, Qté, Poids, Prix, Montant)
B) Copie chaque en-tête DE GAUCHE À DROITE dans tableHeaders

DISTINCTION IMPORTANTE DES COLONNES:
- "Commande/Commandé/Ordered" = quantité COMMANDÉE → orderedQuantity
- "Qté/Quantité/Qty/Livré/Shipped" = quantité LIVRÉE → quantity
Ces deux valeurs peuvent différer (livraison partielle). Capturer les DEUX si présentes.

ÉTAPE 3 - LIGNES DE PRODUITS
Pour CHAQUE ligne du tableau (de TOUTES les pages), extraire:
- itemCode = code produit
- description = texte complet
- name = nom court
- orderedQuantity = quantité COMMANDÉE (colonne Commande/Ordered) - peut être null
- quantity = quantité LIVRÉE/FACTURÉE (colonne Qté/Qty)
- weight = poids VENDU de la COLONNE POIDS (ex: colonne "Poids" = 12.45 → weight=12.45)
- weightUnit = unité de la colonne poids ("kg", "lb")
- nominalWeight = poids dans la DESCRIPTION (ex: "Comté 4kg" → 4) - taille du produit complet
- unitPrice = prix unitaire
- totalPrice = montant ligne
- quantityUnit = valeur EXACTE de la colonne U/M: "kg", "lb", "un", "pc", "cs"

DISTINCTION CRUCIALE - POIDS NOMINAL vs POIDS VENDU:
- nominalWeight = poids DANS LE NOM (taille du produit: "Comté 4kg" = meule de 4kg)
- weight = poids de la COLONNE (poids réellement vendu: on a coupé 12.45kg de la meule)
Exemple: "Comté AOP 4kg" avec colonne Poids=12.45 et U/M="kg"
→ nominalWeight=4 (la meule fait 4kg), weight=12.45 (vendu 12.45kg), prix = 12.45 × prix/kg

{
  "vendor": { "name": "", "phone": null, "email": null, "address": null, "invoiceNumber": "", "invoiceDate": null },
  "totals": { "subtotal": null, "taxAmount": null, "totalAmount": null },
  "tableHeaders": { "col1": "", "col2": "", "col3": "", "col4": "", "col5": "", "col6": "", "col7": "", "col8": "" },
  "lineItems": [
    {
      "itemCode": "CH-4501",
      "description": "Comté AOP 18 mois 4kg",
      "name": "Comté AOP 18 mois",
      "category": "Dairy",
      "orderedQuantity": 3,
      "quantity": 3,
      "weight": 12.45,
      "weightUnit": "kg",
      "nominalWeight": 4,
      "unitPrice": 45.90,
      "totalPrice": 571.45,
      "quantityUnit": "kg",
      "rawColumns": ["CH-4501", "Comté AOP 18 mois 4kg", "3", "12.45", "12.45", "kg", "45.90", "571.45"]
    }
  ]
}

IMPORTANT: rawColumns MUST contain the EXACT text from each column, left to right, matching tableHeaders order.
Example: If tableHeaders = {col1:"CODE", col2:"PRODUIT", col3:"ORIGINE", col4:"FORMAT", col5:"QTÉ", col6:"PRIX/U", col7:"TOTAL"}
Then rawColumns = ["LG-1001", "Laitue Romaine", "Québec", "Caisse 24", "4", "28.50", "114.00"]`;

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    console.log(`🔗 Using ${USE_CLOUD_FUNCTION ? 'Cloud Function' : 'Local Proxy'}: ${API_URL}`);

    // Build content array: all images first, then the prompt
    const contentBlocks = [
      ...imageBlocks,
      {
        type: 'text',
        text: prompt
      }
    ];

    // Use Sonnet for invoice image parsing - better vision for messy documents
    // Rate limit: 8K output tokens/min - wait 60s between requests if hitting limits
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 6000, // Reduced from 16K to leave headroom for rate limits
          messages: [{
            role: 'user',
            content: contentBlocks
          }]
        })
      },
      180000, // 180s for multi-page PDFs
      'parseInvoiceImageWithClaude',
      onRetry
    );

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseInvoiceImageWithClaude');

    let jsonText = content.trim();
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = content.substring(jsonStart, jsonEnd + 1);
      }
    }

    const parsedInvoice = safeJSONParse(jsonText, 'parseInvoiceImageWithClaude');

    if (!parsedInvoice.vendor || !parsedInvoice.lineItems) {
      throw new Error('parseInvoiceImageWithClaude: Invalid invoice structure');
    }

    console.log('✅ Invoice parsed from image:', parsedInvoice.vendor?.name);
    return parsedInvoice;

  } catch (error) {
    console.error('❌ Error parsing invoice image with Claude:', error);
    throw error;
  }
}

/**
 * Parse recipe from image using Claude API (Vision)
 *
 * @param {string} imageDataUrl - Base64 data URL of the image
 * @param {string} apiKey - Claude API key
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Object>} Parsed recipe object
 */
export async function parseImageRecipeWithClaude(imageDataUrl, apiKey, onRetry = null) {
  console.log('🤖 Parsing recipe from image with Claude Vision API...');

  // Extract base64 data and media type from data URL
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid image data URL format');
  }

  const mediaType = matches[1]; // e.g., "image/jpeg"
  const base64Data = matches[2];

  const prompt = `Extraire TOUTES les informations de cette recette depuis l'image.

=== STRATÉGIE DE PARSING INGRÉDIENTS ===

ÉTAPE 1: EXTRAIRE LA QUANTITÉ (début ou fin de ligne)
- Début: "25 kg viande" → quantité=25, unité=kg
- Fin entre parenthèses: "Darne de thon (25)" → quantité=25, unité=unt
- Fin descriptif: "Tomates (3 cannes)" → quantité=3, unité=bt
- Aucune quantité? → laisser champs vides

ÉTAPE 2: IDENTIFIER LA SPECIFICATION (depuis la FIN)
Une specification est:
- TRANSFORMATION: haché, émincé, en dés, tranché, coupé, broyé, râpé, en flocons, en purée
- ÉTAT: cuit, cru, frais, congelé, fondu, sec, moulu
- RÉFÉRENCE: "voir recette"
- DESCRIPTION: "3 couleurs", "noir et blanc"

⚠️ UN NOMBRE SEUL N'EST JAMAIS UNE SPECIFICATION → c'est une quantité!

ÉTAPE 3: TOUT LE RESTE = NOM DE L'INGRÉDIENT
Inclut marques, variétés, types.

EXEMPLES:
"Darne de Thon (25)" → toolQty:"25", toolUnit:"unt", name:"darne de thon"
"Fromage Perrilini en flocons" → name:"fromage perrilini", specification:"en flocons"
"Sauce (voir recette)" → name:"sauce", specification:"voir recette"

=== RÈGLE CRITIQUE: MÉTRIQUE vs OUTIL - JAMAIS LES DEUX ===

Chaque ingrédient utilise SOIT métrique SOIT outil, JAMAIS LES DEUX.

MÉTRIQUE = SEULEMENT ces 4 unités: g, kg, ml, L (poids/liquide)
OUTIL = TOUT LE RESTE (tasse, canne, cuillère, comptables, gousse, botte, paquet, etc.)

=== SI MÉTRIQUE (g, kg, ml, L) ===
metricQty: le nombre
metricUnit: g, kg, ml, ou L
metric: combiné (sans espace, ex: "500g")
toolQty: "" (VIDE!)
toolUnit: "" (VIDE!)
toolMeasure: "" (VIDE!)

=== SI OUTIL (tout le reste) ===
metricQty: "" (VIDE!)
metricUnit: "" (VIDE!)
metric: "" (VIDE!)
toolQty: le nombre
toolUnit: l'abréviation (voir liste)
toolMeasure: combiné (avec espace)

=== ABRÉVIATIONS OUTIL (OBLIGATOIRES) ===
tasse/demi-tasse → T (ex: 0.5 T, 1 T, 2 T)
boîte/canne (conserve) → bt
paquet → pqt
cuillère à soupe/table → c.s.
cuillère à thé → c.t.
comptables (poivron, carotte, oeuf, citron, pomme de terre, feuille, filet) → unt
gousse (ail) → gousse
botte (herbes: persil, coriandre, ciboulette, aneth) → botte
tranche → tranche

=== EXEMPLES ===

"3 bottes d'aneth hachée finement":
toolQty:"3", toolUnit:"botte", toolMeasure:"3 botte", name:"aneth", specification:"hachée finement"

"1 botte de ciboulette hachée finement":
toolQty:"1", toolUnit:"botte", toolMeasure:"1 botte", name:"ciboulette", specification:"hachée finement"

"1/3 paquet de fromage à la crème":
toolQty:"0.33", toolUnit:"pqt", toolMeasure:"0.33 pqt", name:"fromage à la crème", specification:""

"1 tasse de crème sure":
toolQty:"1", toolUnit:"T", toolMeasure:"1 T", name:"crème sure", specification:""

"2 citrons (jus et zeste)":
toolQty:"2", toolUnit:"unt", toolMeasure:"2 unt", name:"citron", specification:"jus et zeste"

"500g de saumon cuit":
metric:"500g", metricQty:"500", metricUnit:"g", toolQty:"", toolUnit:"", toolMeasure:"", name:"saumon", specification:"cuit"

"1 cuillère à soupe d'huile":
toolQty:"1", toolUnit:"c.s.", toolMeasure:"1 c.s.", name:"huile", specification:""

"1/2 cuillère à thé de sel":
toolQty:"0.5", toolUnit:"c.t.", toolMeasure:"0.5 c.t.", name:"sel", specification:""

"2 cannes de tomates":
toolQty:"2", toolUnit:"bt", toolMeasure:"2 bt", name:"tomates", specification:""

"4 gousses d'ail émincées":
toolQty:"4", toolUnit:"gousse", toolMeasure:"4 gousse", name:"ail", specification:"émincées"

"sel et poivre":
(SÉPARER EN 2 INGRÉDIENTS)
1. name:"sel", specification:"au goût"
2. name:"poivre", specification:"au goût"

=== RÈGLES ===
- groupColor: toujours null
- name et specification: en minuscules
- JAMAIS de valeurs dans métrique ET outil en même temps
- Fractions: 1/2 → 0.5, 1/3 → 0.33, 1/4 → 0.25, 3/4 → 0.75

=== SECTIONS ===
Si une ligne est un titre comme "POULET" ou "SAUCE", créer: {"isSection": true, "sectionName": "POULET"}

=== MÉTHODE (CRITIQUE - NE PAS OMETTRE) ===
⚠️ LA MÉTHODE EST OBLIGATOIRE - TOUJOURS L'EXTRAIRE EN ENTIER!

- Extraire TOUTES les étapes de préparation/cuisson de l'image
- Retourner comme tableau de strings ["Étape 1", "Étape 2"]
- Inclure: temps, température, techniques, ordre des opérations
- Si l'image contient une section "Méthode", "Procédure", "Préparation" - extraire son contenu
- NE JAMAIS retourner un champ "method" vide si l'image contient des instructions

=== MISE EN PLAT / PLATING ===
Section souvent intitulée: "Mise en plat", "Plating", "Présentation", "Dressage"
- CHAQUE LIGNE = une instruction distincte
- Inclure TOUS les éléments (contenants, garnitures, sauces, temps)
- VERBATIM: ne pas reformuler, garder le texte original

=== NOTES ===
- Conseils, temps de conservation, variations
- CHAQUE ligne = une note distincte

=== NOM DE LA RECETTE (CRITIQUE) ===
⚠️ Le nom est le PLAT, PAS le nom de l'entreprise/restaurant
- IGNORER les en-têtes (ex: "Aux saveurs de...", "Restaurant...")
- Utiliser le nom qui décrit le PLAT (ex: "Boulette Italienne", "Poulet Rôti")

Retourne SEULEMENT le JSON valide:
{
  "name": "Nom du PLAT (pas l'entreprise)",
  "category": "Main Courses",
  "portions": 4,
  "ingredients": [
    {
      "groupColor": null,
      "metric": "",
      "metricQty": "",
      "metricUnit": "",
      "toolQty": "",
      "toolUnit": "",
      "toolMeasure": "",
      "name": "",
      "specification": ""
    }
  ],
  "method": ["Étape 1", "Étape 2"],
  "platingInstructions": ["instruction 1", "instruction 2"],
  "notes": ["note 1", "note 2"]
}`;

  try {
    const requestBody = {
      model: 'claude-3-haiku-20240307', // Claude 3 Haiku with vision support (same as PDF parsing)
      max_tokens: 4096, // Haiku max limit
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    // Only add API key header if not using cloud function
    if (!USE_CLOUD_FUNCTION && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    console.log(`🔗 Using ${USE_CLOUD_FUNCTION ? 'Cloud Function' : 'Local Proxy'}: ${API_URL}`);

    // Use fetchWithRetry for automatic retry on transient failures (90s for images - they take longer)
    const response = await fetchWithRetry(
      API_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      },
      90000,
      'parseImageRecipeWithClaude',
      onRetry
    );

    console.log('📡 Response status:', response.status, response.statusText);

    const data = await response.json();
    const content = validateClaudeResponse(data, 'parseImageRecipeWithClaude');

    console.log('🤖 Claude response received');

    // Extract JSON from response
    let jsonText = content.trim();

    // Try to find JSON in markdown code blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      // Extract between first { and last }
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonText = content.substring(jsonStart, jsonEnd + 1);
      }
    }

    const parsedRecipe = safeJSONParse(jsonText, 'parseImageRecipeWithClaude');

    // Validate recipe fields
    const validatedRecipe = validateRecipeFields(parsedRecipe, 'parseImageRecipeWithClaude');

    // Validate and fix ingredients
    if (validatedRecipe.ingredients) {
      validatedRecipe.ingredients = validateAndFixIngredients(validatedRecipe.ingredients);
    }

    console.log('✅ Recipe parsed from image:', validatedRecipe.name);
    return validatedRecipe;

  } catch (error) {
    console.error('❌ Error parsing recipe from image with Claude:', error);
    throw error;
  }
}

// ============================================
// EXPORTED UTILITIES FOR UI FEEDBACK
// ============================================

/**
 * Check if API is currently rate limited
 * @returns {boolean} True if rate limited
 */
export function checkRateLimitStatus() {
  return isRateLimited();
}

/**
 * Get remaining rate limit wait time
 * @returns {number} Seconds until rate limit resets, or 0 if not limited
 */
export function getRateLimitRemainingTime() {
  return getRateLimitWaitTime();
}

/**
 * Get retry configuration for display purposes
 * @returns {Object} Retry config
 */
export function getRetryConfig() {
  return { ...RETRY_CONFIG };
}

/**
 * Error types for UI handling
 */
export const API_ERROR_TYPES = {
  RATE_LIMITED: 'rate_limited',
  AUTH_ERROR: 'auth_error',
  SERVER_ERROR: 'server_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  INVALID_RESPONSE: 'invalid_response',
  UNKNOWN: 'unknown',
};

/**
 * Classify an error for UI display
 * @param {Error} error - The error to classify
 * @returns {Object} Error info with type, message, and isRetryable
 */
export function classifyError(error) {
  const message = error.message || 'Unknown error';

  if (error.status === 429 || message.includes('rate limit')) {
    return {
      type: API_ERROR_TYPES.RATE_LIMITED,
      message: message,
      isRetryable: true,
      waitSeconds: getRateLimitWaitTime(),
    };
  }

  if (error.status === 401 || error.status === 403 || message.includes('API key')) {
    return {
      type: API_ERROR_TYPES.AUTH_ERROR,
      message: message,
      isRetryable: false,
    };
  }

  if (error.status >= 500 || message.includes('server error')) {
    return {
      type: API_ERROR_TYPES.SERVER_ERROR,
      message: message,
      isRetryable: true,
    };
  }

  if (message.includes('Network error') || message.includes('Failed to fetch')) {
    return {
      type: API_ERROR_TYPES.NETWORK_ERROR,
      message: 'Network error. Please check your internet connection.',
      isRetryable: true,
    };
  }

  if (message.includes('timeout')) {
    return {
      type: API_ERROR_TYPES.TIMEOUT,
      message: 'Request timed out. The server took too long to respond.',
      isRetryable: true,
    };
  }

  if (message.includes('Invalid response') || message.includes('Could not parse')) {
    return {
      type: API_ERROR_TYPES.INVALID_RESPONSE,
      message: message,
      isRetryable: false,
    };
  }

  return {
    type: API_ERROR_TYPES.UNKNOWN,
    message: message,
    isRetryable: error.isRetryable || false,
  };
}
