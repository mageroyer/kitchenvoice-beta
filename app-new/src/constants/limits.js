/**
 * Application Limits & Validation Constants
 *
 * Centralized configuration for all size limits, timeouts, and validation rules.
 * Import these constants instead of using magic numbers in your code.
 */

// =============================================================================
// FILE SIZE LIMITS
// =============================================================================

/**
 * Maximum file sizes for uploads (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  /** Maximum image file size before compression (10MB) */
  IMAGE_MAX: 10 * 1024 * 1024,

  /** Maximum image size after compression for storage (5MB) */
  IMAGE_COMPRESSED_MAX: 5 * 1024 * 1024,

  /** Maximum PDF file size (10MB) */
  PDF_MAX: 10 * 1024 * 1024,

  /** Maximum logo file size (2MB) */
  LOGO_MAX: 2 * 1024 * 1024,

  /** Byte multiplier for KB */
  KB: 1024,

  /** Byte multiplier for MB */
  MB: 1024 * 1024,
};

// =============================================================================
// TEXT LENGTH LIMITS
// =============================================================================

/**
 * Maximum character lengths for text inputs
 */
export const TEXT_LIMITS = {
  /** Recipe name maximum length */
  RECIPE_NAME: 500,

  /** Category name maximum length */
  CATEGORY_NAME: 100,

  /** Department name maximum length */
  DEPARTMENT_NAME: 100,

  /** Ingredient name maximum length */
  INGREDIENT_NAME: 200,

  /** Ingredient specification maximum length */
  INGREDIENT_SPEC: 200,

  /** Unit/quantity string maximum length */
  UNIT_QUANTITY: 50,

  /** Metric string maximum length */
  METRIC: 100,

  /** Tool measure maximum length */
  TOOL_MEASURE: 100,

  /** Single-line text default maximum */
  SINGLE_LINE_DEFAULT: 500,

  /** Multi-line text (steps, notes) maximum length */
  MULTILINE_DEFAULT: 5000,

  /** Method step maximum length */
  METHOD_STEP: 2000,

  /** Plating instruction maximum length */
  PLATING_INSTRUCTION: 2000,

  /** Note maximum length */
  NOTE: 2000,

  /** Email maximum length (RFC 5321) */
  EMAIL: 254,

  /** Filename maximum length */
  FILENAME: 200,

  /** Feedback message maximum length */
  FEEDBACK_MESSAGE: 5000,
};

// =============================================================================
// NUMERIC LIMITS
// =============================================================================

/**
 * Numeric value limits
 */
export const NUMERIC_LIMITS = {
  /** Minimum portions for a recipe */
  PORTIONS_MIN: 1,

  /** Maximum portions for a recipe */
  PORTIONS_MAX: 10000,

  /** Default portions */
  PORTIONS_DEFAULT: 4,

  /** Default max for sanitized numbers */
  NUMBER_MAX_DEFAULT: 10000,

  /** Timer minimum minutes */
  TIMER_MIN_MINUTES: 1,

  /** Timer maximum minutes */
  TIMER_MAX_MINUTES: 120,
};

// =============================================================================
// TIMEOUT DURATIONS (in milliseconds)
// =============================================================================

/**
 * Timeout values for various operations
 */
export const TIMEOUTS = {
  /** Toast notification display duration */
  TOAST_DURATION: 3000,

  /** Success message display duration */
  SUCCESS_MESSAGE: 3000,

  /** Feedback success message duration */
  FEEDBACK_SUCCESS: 2000,

  /** Login redirect delay */
  LOGIN_REDIRECT: 500,

  /** Modal close animation delay */
  MODAL_CLOSE_DELAY: 500,

  /** Voice silence detection timeout (auto-stop after silence) */
  VOICE_SILENCE: 5000,

  /** Voice silence detection - short timeout for quick responses */
  VOICE_SILENCE_SHORT: 3000,

  /** Voice silence detection - long timeout for thoughtful speakers */
  VOICE_SILENCE_LONG: 8000,

  /** Voice pause detection for line breaks (bulk dictation) */
  VOICE_PAUSE_DETECTION: 1500,

  /** Voice pause detection - short for fast speakers */
  VOICE_PAUSE_SHORT: 1000,

  /** Voice pause detection - long for slow speakers */
  VOICE_PAUSE_LONG: 2500,

  /** Minimum audio level threshold to detect speech (0-255) */
  VOICE_SPEECH_THRESHOLD: 20,

  /** API request timeout */
  API_REQUEST: 60000,

  /** Timer tick interval */
  TIMER_TICK: 1000,

  /** Audio notification delay */
  AUDIO_NOTIFICATION_DELAY_1: 500,
  AUDIO_NOTIFICATION_DELAY_2: 1000,

  /** Slider pause after interaction */
  SLIDER_PAUSE_DURATION: 10000,

  /** Slider transition duration */
  SLIDER_TRANSITION: 500,

  /** Voice level update interval */
  VOICE_LEVEL_UPDATE: 100,

  /** Search debounce delay */
  SEARCH_DEBOUNCE: 100,

  /** Guided tour start delay */
  TOUR_START_DELAY: 1000,

  /** Auto-save debounce delay - waits for user to stop typing */
  AUTO_SAVE_DEBOUNCE: 1500,

  /** Auto-save maximum wait - force save after this time even if still editing */
  AUTO_SAVE_MAX_WAIT: 10000,
};

// =============================================================================
// UI CONSTANTS
// =============================================================================

/**
 * UI-related constants
 */
export const UI_CONSTANTS = {
  /** Default slider interval */
  SLIDER_DEFAULT_INTERVAL: 5000,

  /** Tour overlay z-index */
  TOUR_OVERLAY_Z_INDEX: 10000,

  /** Recipe complexity thresholds - ingredients */
  COMPLEXITY_SIMPLE_INGREDIENTS: 5,
  COMPLEXITY_MEDIUM_INGREDIENTS: 10,

  /** Recipe complexity thresholds - method length */
  COMPLEXITY_SIMPLE_METHOD_LENGTH: 200,
  COMPLEXITY_MEDIUM_METHOD_LENGTH: 500,

  /** Percentage calculation base */
  PERCENTAGE_BASE: 100,
};

// =============================================================================
// IMAGE COMPRESSION SETTINGS
// =============================================================================

/**
 * Image compression configuration
 */
export const IMAGE_COMPRESSION = {
  /** Maximum width for recipe images */
  MAX_WIDTH: 1600,

  /** Maximum height for recipe images */
  MAX_HEIGHT: 1200,

  /** JPEG quality (0-1) */
  QUALITY: 0.85,

  /** Default max width */
  DEFAULT_MAX_WIDTH: 800,

  /** Default max height */
  DEFAULT_MAX_HEIGHT: 600,

  /** Default quality */
  DEFAULT_QUALITY: 0.8,
};

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * API-related constants
 */
export const API_CONFIG = {
  /** Claude API max tokens */
  CLAUDE_MAX_TOKENS: 4096,

  /** Speech API default URL */
  SPEECH_API_DEFAULT_URL: 'https://localhost:3000',

  /** QuickBooks vendor query max results */
  QB_VENDOR_MAX_RESULTS: 1000,

  /** QuickBooks accounts query max results */
  QB_ACCOUNTS_MAX_RESULTS: 200,
};

// =============================================================================
// UNIT CONVERSION
// =============================================================================

/**
 * Unit conversion constants (base unit = grams/ml)
 */
export const UNIT_CONVERSIONS = {
  /** Grams per kilogram */
  GRAMS_PER_KG: 1000,

  /** Milliliters per liter */
  ML_PER_LITER: 1000,

  /** Milliseconds per second */
  MS_PER_SECOND: 1000,

  /** Milliseconds per minute */
  MS_PER_MINUTE: 60 * 1000,

  /** Milliseconds per hour */
  MS_PER_HOUR: 60 * 60 * 1000,

  /** Milliseconds per day */
  MS_PER_DAY: 24 * 60 * 60 * 1000,

  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
};

// =============================================================================
// CORS CACHE
// =============================================================================

/**
 * CORS and caching configuration
 */
export const CACHE_CONFIG = {
  /** CORS preflight cache max age (seconds) */
  CORS_MAX_AGE: 86400,

  /** Static asset cache max age (seconds) */
  STATIC_ASSET_CACHE: 31536000,
};

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

/**
 * Validation-related constants
 */
export const VALIDATION = {
  /** PDF extracted text minimum length */
  PDF_MIN_TEXT_LENGTH: 50,

  /** PDF log preview length */
  PDF_PREVIEW_LENGTH: 500,

  /** Error message preview length */
  ERROR_PREVIEW_LENGTH: 200,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "2.5 MB")
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = FILE_SIZE_LIMITS.KB;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Check if file size is within limit
 * @param {number} size - File size in bytes
 * @param {number} limit - Limit in bytes
 * @returns {boolean}
 */
export function isWithinSizeLimit(size, limit) {
  return size <= limit;
}
