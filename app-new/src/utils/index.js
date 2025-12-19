/**
 * Utility Functions Index
 *
 * Central export point for all utility functions
 * Import utilities using: import { functionName } from '@/utils'
 */

// Recipe utilities
export {
  scaleIngredients,
  calculateTotalTime,
  formatIngredient,
  parseIngredient,
  validateRecipe,
  calculateRecipeCost,
  groupIngredientsByCategory,
  createEmptyRecipe,
  duplicateRecipe,
} from './recipe';

// Formatting utilities
export {
  formatTime,
  formatCurrency,
  formatDate,
  formatRelativeDate,
  capitalizeFirst,
  toTitleCase,
  truncateText,
  formatNumber,
  formatFileSize,
  formatPercentage,
  formatDifficulty,
  formatServings,
  formatEmptyState,
  formatMetric,
  extractWeightFromName,
} from './format';

// Validation utilities (core validators)
export {
  isValidEmail,
  isValidUrl,
  validatePassword,
  isRequired,
  isInRange,
  isPositiveNumber,
  isInteger,
  isValidLength,
  validateIngredient,
  validateArray,
  validateForm,
} from './validation';

// Sanitization utilities (includes file validation)
export {
  escapeHtml,
  stripHtml,
  sanitizeText,
  sanitizeText as sanitizeInput, // Backward compatibility alias
  sanitizeMultilineText,
  sanitizeNumber,
  sanitizeInteger,
  sanitizeRecipe,
  sanitizeIngredient,
  sanitizeEmail,
  sanitizeFilename,
  validateFileUpload,
  validateImageFile,
  validatePdfFile,
  containsSuspiciousContent,
} from './sanitize';

// Voice recognition utilities
export {
  isSpeechRecognitionSupported,
  initSpeechRecognition,
  cleanTranscript,
  extractFinalTranscript,
  extractInterimTranscript,
  createVoiceHandler,
  parseVoiceCommand,
  convertWordsToNumbers,
  convertFractionsToDecimal,
  processVoiceIngredient,
  isVoiceCommand,
} from './voice';

// Image compression utilities
export {
  compressImage,
  blobToDataUrl,
  fileToDataUrl,
  compressToDataUrl,
  isValidImageType,
} from './imageCompression';

// French measurement parsing
export {
  parseFrenchMeasurement,
  parseIngredientField,
} from './frenchMeasurementParser';

// Error handling
export {
  ErrorType,
  AppError,
  handleError,
  logError,
  safeAsync,
  handleQBError,
  handleDBError,
  handleApiResponse,
} from './errorHandler';

// Stock calculation utilities
export {
  STOCK_STATUS,
  DEFAULT_THRESHOLDS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  calculatePercentage,
  getStatusFromPercentage,
  getStatusColor,
  getStatusIcon,
  getStatusLabel,
  formatStockDisplay,
  formatPercentage as formatStockPercentage,
  formatPercentagePrecise,
  calculateReorderQuantity,
  calculateReorderWithBuffer,
  sortByUrgency,
  groupByStatus,
  getStockSummary,
  getAccessibleStatusDescription,
  getAriaAttributes,
} from './stockCalculations';

// Unit conversion utilities
export {
  // Constants
  WEIGHT_UNIT_OPTIONS,
  VOLUME_UNIT_OPTIONS,
  ALL_UNIT_OPTIONS,
  PORTION_UNIT_OPTIONS,
  // Functions
  getUnitType,
  getUnitLabel,
  getUnitFactorForPrice,
  isWeightUnit,
  isVolumeUnit,
  areUnitsCompatible,
  convertUnits,
  formatQuantity,
  calculatePricePerUnit,
  detectToolUnit,
  classifyUnit,
  getEnforcedMeasurement,
} from './unitConversion';
