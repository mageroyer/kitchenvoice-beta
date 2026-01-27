/**
 * Claude API Base Module
 *
 * Shared infrastructure for Claude API integration:
 * - Retry configuration and logic
 * - Rate limiting state management
 * - Error handling utilities
 * - API configuration
 * - Authentication helpers
 *
 * @module services/ai/claudeBase
 */

import { auth } from '../database/firebase';
import { checkCredits, deductCredits, CREDIT_COSTS } from '../credits/creditService';

// ============================================
// RETRY CONFIGURATION
// ============================================

export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,     // Start with 1 second
  maxDelayMs: 30000,        // Cap at 30 seconds for non-rate-limit errors
  rateLimitDelayMs: 60000,  // Wait 60 seconds for rate limit (429) errors
  backoffMultiplier: 2,     // Double the delay each retry
  jitterFactor: 0.1,        // Add 10% random jitter to prevent thundering herd
};

// Error types that should trigger a retry
export const RETRYABLE_STATUS_CODES = [
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
export async function fetchWithTimeout(url, options, timeoutMs = 60000) {
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
export function validateClaudeResponse(data, functionName) {
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
 * Attempt to repair common JSON issues from LLM output
 * @param {string} jsonText - Potentially malformed JSON
 * @returns {string} - Repaired JSON string
 */
function repairJSON(jsonText) {
  let repaired = jsonText;

  // Remove any leading/trailing whitespace or markdown code blocks
  repaired = repaired.trim();
  if (repaired.startsWith('```json')) {
    repaired = repaired.slice(7);
  } else if (repaired.startsWith('```')) {
    repaired = repaired.slice(3);
  }
  if (repaired.endsWith('```')) {
    repaired = repaired.slice(0, -3);
  }
  repaired = repaired.trim();

  // Remove any text before the first { or [ or after the last } or ]
  const firstBrace = repaired.indexOf('{');
  const firstBracket = repaired.indexOf('[');
  const lastBrace = repaired.lastIndexOf('}');
  const lastBracket = repaired.lastIndexOf(']');

  // Find the actual start (first { or [)
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else {
    start = firstBrace !== -1 ? firstBrace : firstBracket;
  }

  // Find the actual end (last } or ])
  let end = Math.max(lastBrace, lastBracket);

  if (start !== -1 && end !== -1 && end > start) {
    repaired = repaired.substring(start, end + 1);
  }

  // Fix unquoted property names (common Claude issue)
  // e.g., {metricQty:"10"} -> {"metricQty":"10"}
  // Pattern: after { or , followed by unquoted word and :
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // Fix trailing commas before } or ] (multiple passes for nested)
  // e.g., {"a": 1,} -> {"a": 1}
  for (let i = 0; i < 5; i++) {
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  }

  // Fix missing commas between array elements (][)
  // e.g., ["a"]\n["b"] -> ["a"],\n["b"]
  repaired = repaired.replace(/\](\s*)\[/g, '],$1[');

  // Fix missing commas between objects in arrays
  // e.g., }\n{ -> },\n{
  repaired = repaired.replace(/\}(\s*)\{/g, '},$1{');

  // Fix missing commas between string values and next key
  // e.g., "value"\n"key" -> "value",\n"key"
  repaired = repaired.replace(/"(\s*\n\s*)"/g, '",\n"');

  // Fix missing commas after ] before next property
  // e.g., ]\n"nextKey" -> ],\n"nextKey"
  repaired = repaired.replace(/\](\s*\n\s*)"([^"]+)":/g, '],\n"$2":');

  // Fix missing commas after } before next property
  // e.g., }\n"nextKey" -> },\n"nextKey"
  repaired = repaired.replace(/\}(\s*\n\s*)"([^"]+)":/g, '},\n"$2":');

  // Fix missing commas after number/boolean before next property
  repaired = repaired.replace(/(\d)(\s*\n\s*)"([^"]+)":/g, '$1,\n"$3":');
  repaired = repaired.replace(/(true|false|null)(\s*\n\s*)"([^"]+)":/g, '$1,\n"$3":');

  // Fix missing commas in arrays between values
  // e.g., ["a"\n"b"] -> ["a",\n"b"]
  repaired = repaired.replace(/"(\s*\n\s*)"(?=[^:]*[\],])/g, '",\n"');

  // Fix missing commas after numbers in arrays
  // e.g., [1\n2] -> [1,\n2]
  repaired = repaired.replace(/(\d)(\s*\n\s*)(\d)/g, '$1,$2$3');

  // Fix missing commas after quoted values in arrays followed by quotes
  // e.g., "value1" "value2" -> "value1", "value2"
  repaired = repaired.replace(/"(\s+)"/g, '",$1"');

  // Fix unescaped newlines in strings (common LLM issue)
  repaired = repaired.replace(/:\s*"([^"]*)\n([^"]*)"(?=\s*[,}\]])/g, (match, p1, p2) => {
    return `: "${p1}\\n${p2}"`;
  });

  // Fix unescaped quotes inside strings - very common LLM issue
  // This is tricky - we look for patterns like: "some text "embedded" more text"
  // We need to escape the inner quotes
  repaired = repaired.replace(/"([^"]*)"([^",:\[\]{}]+)"([^"]*)"/g, '"$1\\"$2\\"$3"');

  // Fix rawColumns arrays with missing commas between elements
  // Pattern: "rawColumns": ["val1" "val2"] -> "rawColumns": ["val1", "val2"]
  repaired = repaired.replace(/"rawColumns"\s*:\s*\[([\s\S]*?)\]/g, (match, content) => {
    // Fix missing commas between quoted values in the array
    let fixed = content.replace(/"(\s+)"/g, '", "');
    // Also fix trailing commas
    fixed = fixed.replace(/,(\s*)\]/g, '$1]');
    return `"rawColumns": [${fixed}]`;
  });

  // Final pass: remove any double commas that might have been introduced
  repaired = repaired.replace(/,,+/g, ',');

  // Handle truncated responses - try to close open brackets/braces
  // Count open vs close brackets
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/]/g) || []).length;

  // If we have more opens than closes, try to close them
  if (openBrackets > closeBrackets || openBraces > closeBraces) {
    console.warn(`repairJSON: Detected truncated response - open: { ${openBraces}/${closeBraces} } [ ${openBrackets}/${closeBrackets} ]`);

    // Remove any trailing incomplete value (like a partial string or number)
    repaired = repaired.replace(/,\s*"[^"]*$/, '');  // Incomplete string at end
    repaired = repaired.replace(/,\s*\d+\.?$/, '');  // Incomplete number at end
    repaired = repaired.replace(/:\s*"[^"]*$/, ': null');  // Incomplete value after colon

    // Add missing closing brackets/braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += ']';
    }
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += '}';
    }
  }

  return repaired;
}

/**
 * Safely parse JSON with repair attempts and better error messages
 * @param {string} jsonText - JSON string to parse
 * @param {string} functionName - Name of calling function for error context
 * @returns {Object} - Parsed JSON
 */
export function safeJSONParse(jsonText, functionName) {
  // First try direct parse
  try {
    return JSON.parse(jsonText);
  } catch (firstErr) {
    console.warn(`${functionName}: First parse failed: ${firstErr.message}`);

    // Try to repair and parse again
    try {
      const repaired = repairJSON(jsonText);
      const result = JSON.parse(repaired);
      console.warn(`${functionName}: JSON repaired successfully (original had: ${firstErr.message})`);
      return result;
    } catch (repairErr) {
      // Both failed - log detailed debug info
      console.error(`${functionName}: JSON parse error after repair:`, repairErr.message);
      console.error(`${functionName}: Original error:`, firstErr.message);
      console.error(`${functionName}: Response length: ${jsonText.length} chars`);
      console.error(`${functionName}: First 300 chars:`, jsonText.substring(0, 300));
      console.error(`${functionName}: Last 300 chars:`, jsonText.substring(jsonText.length - 300));

      // Try to identify the problematic area from BOTH errors
      for (const err of [repairErr, firstErr]) {
        const match = err.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1]);
          const start = Math.max(0, pos - 100);
          const end = Math.min(jsonText.length, pos + 100);
          const context = jsonText.substring(start, end);
          const marker = ' '.repeat(Math.min(100, pos - start)) + '^';
          console.error(`${functionName}: Error at position ${pos}:`);
          console.error(context);
          console.error(marker);

          // Show the specific character at that position
          if (pos < jsonText.length) {
            const char = jsonText[pos];
            const charCode = jsonText.charCodeAt(pos);
            console.error(`${functionName}: Character at position ${pos}: "${char}" (code: ${charCode})`);
          }
          break;
        }
      }

      // Also log the full response to browser console for debugging
      console.error(`${functionName}: FULL RAW RESPONSE (for debugging):`, jsonText);

      throw new Error(`${functionName}: Could not parse API response. The AI returned invalid JSON. Check browser console for details.`);
    }
  }
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number} retryAfterMs - Optional retry-after header value in ms
 * @param {number} statusCode - HTTP status code (for rate limit handling)
 * @returns {number} - Delay in milliseconds
 */
export function calculateBackoffDelay(attempt, retryAfterMs = null, statusCode = null) {
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
export function parseRetryAfter(response) {
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
export function updateRateLimitState(response) {
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
export function isRateLimited() {
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
export function getRateLimitWaitTime() {
  if (!rateLimitState.isLimited) return 0;
  const remaining = Math.ceil((rateLimitState.resetTime - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Get user-friendly error message based on status code
 * @param {number} status - HTTP status code
 * @param {string} errorMessage - Original error message
 * @returns {string} - User-friendly message
 */
export function getErrorMessage(status, errorMessage) {
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
 * Handle API errors with user-friendly messages
 * @param {Response} response - Fetch response
 * @param {string} functionName - Name of calling function
 * @returns {Object} - Error info including isRetryable flag
 */
export async function handleAPIError(response, functionName) {
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
 * Add authentication headers to fetch options for Cloud Function calls
 * @param {Object} options - Existing fetch options
 * @param {string} url - URL being called (to determine if auth is needed)
 * @returns {Promise<Object>} Options with auth header added
 * @throws {Error} If authentication is required but user is not logged in
 */
async function addAuthHeaders(options, url) {
  // Only add auth for Cloud Function URL
  if (!url.includes('cloudfunctions.net/claudeProxy')) {
    return options;
  }

  // Check if user is authenticated
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please log in to use AI features.');
  }

  // Get the Firebase ID token
  let authToken;
  try {
    authToken = await user.getIdToken(true);
  } catch (error) {
    console.error('Failed to get auth token:', error);
    throw new Error('Failed to authenticate. Please log in again.');
  }

  // Return options with auth header added
  return {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${authToken}`
    }
  };
}

/**
 * Fetch with automatic retry logic for transient failures
 * Automatically adds authentication for Cloud Function calls
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 60s)
 * @param {string} functionName - Name of calling function for logging
 * @param {Function} onRetry - Optional callback for retry notifications
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, timeoutMs = 60000, functionName = 'API', onRetry = null) {
  // Add authentication headers for Cloud Function calls
  const authenticatedOptions = await addAuthHeaders(options, url);

  // Check if we're rate limited before even trying
  if (isRateLimited()) {
    const waitTime = getRateLimitWaitTime();
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
      const response = await fetchWithTimeout(url, authenticatedOptions, timeoutMs);

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

// ============================================
// CONFIGURATION
// ============================================

// Firebase Cloud Function URL for production (secure server-side API key)
export const CLOUD_FUNCTION_URL = 'https://us-central1-smartcookbook-2afe2.cloudfunctions.net/claudeProxy';

/**
 * Get the current user's Firebase ID token for authenticated API calls
 * @returns {Promise<string|null>} The ID token or null if not authenticated
 */
export async function getAuthToken() {
  const user = auth?.currentUser;
  if (!user) {
    return null;
  }

  try {
    // getIdToken(true) forces a refresh if token is expired
    const token = await user.getIdToken(true);
    return token;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * Check if the current user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!auth?.currentUser;
}

// For local development: use localhost proxy (HTTPS on port 3000)
// For tablet testing: replace with your computer's IP (e.g., 'https://192.168.1.100:3000/api/claude')
export const LOCAL_PROXY_URL = import.meta.env.VITE_PROXY_URL || null;

// Determine which endpoint to use:
// - If VITE_PROXY_URL is set, use it (local development with proxy)
// - Otherwise, use Cloud Function (production or dev without local proxy)
export const useLocalProxy = !!LOCAL_PROXY_URL;
export const API_URL = useLocalProxy ? LOCAL_PROXY_URL : CLOUD_FUNCTION_URL;

// Flag to indicate if we're using the cloud function (no client API key needed)
export const USE_CLOUD_FUNCTION = !useLocalProxy;

/**
 * Check if the app is using the cloud function (no client API key needed)
 * @returns {boolean}
 */
export function isUsingCloudFunction() {
  return USE_CLOUD_FUNCTION;
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
  INSUFFICIENT_CREDITS: 'insufficient_credits',
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

  if (message.includes('Insufficient credits') || message.includes('credits')) {
    return {
      type: API_ERROR_TYPES.INSUFFICIENT_CREDITS,
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

// ============================================
// CREDIT SYSTEM INTEGRATION
// ============================================

// Re-export credit costs for convenience
export { CREDIT_COSTS };

/**
 * Check if user has enough credits for an operation
 * @param {string} operationType - Operation type from CREDIT_COSTS
 * @returns {Promise<Object>} { canProceed, credits, cost, message }
 */
export async function checkAPICredits(operationType) {
  const user = auth?.currentUser;
  if (!user) {
    return {
      canProceed: false,
      credits: 0,
      cost: 0,
      message: 'Please log in to use AI features.',
    };
  }
  return checkCredits(user.uid, operationType);
}

/**
 * Deduct credits after a successful API call
 * @param {string} operationType - Operation type from CREDIT_COSTS
 * @param {Object} metadata - Optional metadata about the operation
 * @returns {Promise<Object>} { success, creditsRemaining, message }
 */
export async function deductAPICredits(operationType, metadata = {}) {
  const user = auth?.currentUser;
  if (!user) {
    return {
      success: false,
      creditsRemaining: 0,
      message: 'Not logged in',
    };
  }
  return deductCredits(user.uid, operationType, metadata);
}

/**
 * Wrapper for API calls that checks and deducts credits
 * Use this to wrap any Claude API call that should consume credits
 *
 * @param {string} operationType - Operation type from CREDIT_COSTS (e.g., 'INVOICE_VISION')
 * @param {Function} apiCallFn - Async function that makes the actual API call
 * @param {Object} options - Optional settings
 * @param {boolean} options.deductOnSuccess - Only deduct if API call succeeds (default: true)
 * @returns {Promise<any>} Result from the API call
 * @throws {Error} If insufficient credits or API call fails
 */
export async function withCredits(operationType, apiCallFn, options = {}) {
  const { deductOnSuccess = true } = options;

  // Check credits first
  const creditCheck = await checkAPICredits(operationType);

  if (!creditCheck.canProceed) {
    const error = new Error(creditCheck.message);
    error.type = API_ERROR_TYPES.INSUFFICIENT_CREDITS;
    error.credits = creditCheck.credits;
    error.cost = creditCheck.cost;
    throw error;
  }

  // Make the API call
  const result = await apiCallFn();

  // Deduct credits after successful call
  if (deductOnSuccess) {
    const deduction = await deductAPICredits(operationType, {
      success: true,
      timestamp: Date.now(),
    });

    // Log remaining credits for debugging
    console.log(`Credits: Used ${deduction.cost}, ${deduction.creditsRemaining} remaining`);
  }

  return result;
}
