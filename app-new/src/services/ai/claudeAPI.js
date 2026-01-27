/**
 * Claude API Service
 *
 * Barrel export for backwards compatibility.
 * New code should import from specific modules:
 * - claudeBase.js: Shared infrastructure, rate limiting
 * - claudeRecipe.js: Recipe parsing functions
 *
 * For invoice parsing, use the Vision-based parser:
 * - services/invoice/vision/
 *
 * @module services/ai/claudeAPI
 */

// Re-export base utilities
export {
  isUsingCloudFunction,
  checkRateLimitStatus,
  getRateLimitRemainingTime,
  getRetryConfig,
  API_ERROR_TYPES,
  classifyError,
} from './claudeBase';

// Re-export recipe parsing functions
export {
  parsePDFRecipeWithClaude,
  parseBulkIngredientsWithClaude,
  parseBulkMethodStepsWithClaude,
  parseBulkPlatingWithClaude,
  parseBulkNotesWithClaude,
  parseImageRecipeWithClaude,
} from './claudeRecipe';

// Re-export translation functions
export {
  translateTerm,
  expandSearchTerms,
  translateBatch,
  getCacheStats,
  clearCache,
} from './claudeTranslate';
