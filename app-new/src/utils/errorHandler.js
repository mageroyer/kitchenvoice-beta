/**
 * Centralized Error Handling Utility
 *
 * Provides standardized error handling across the application.
 * Ensures consistent error messages and logging.
 */

import { error as logErrorToLogger, createLogger } from './logger';

// Create a logger for error handler itself
const errorLogger = createLogger('ErrorHandler');

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Application error types for categorization
 */
export const ErrorType = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  VALIDATION: 'VALIDATION',
  DATABASE: 'DATABASE',
  FILE: 'FILE',
  API: 'API',
  PERMISSION: 'PERMISSION',
  NOT_FOUND: 'NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  SYNC: 'SYNC',
  UNIT_CONVERSION: 'UNIT_CONVERSION',
  UNKNOWN: 'UNKNOWN',
};

// =============================================================================
// ERROR CODES & USER-FRIENDLY MESSAGES
// =============================================================================

/**
 * Map of error codes/patterns to user-friendly messages
 */
const ERROR_MESSAGES = {
  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'NetworkError': 'Network error. Please check your connection and try again.',
  'net::ERR': 'Connection failed. Please check your internet connection.',
  'ECONNREFUSED': 'Server is not responding. Please try again later.',

  // Timeout errors
  'timeout': 'Request timed out. Please try again.',
  'TimeoutError': 'The operation took too long. Please try again.',
  'ETIMEDOUT': 'Connection timed out. Please check your internet and try again.',

  // Auth errors (Firebase)
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/requires-recent-login': 'Please log in again to complete this action.',
  'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',

  // Database errors
  'QuotaExceededError': 'Storage is full. Please delete some data and try again.',
  'ConstraintError': 'This item already exists.',
  'NotFoundError': 'The requested item was not found.',
  'InvalidStateError': 'Database is not ready. Please refresh the page.',

  // File errors
  'File too large': 'File is too large. Please choose a smaller file.',
  'Invalid file type': 'This file type is not supported.',
  'Upload failed': 'Failed to upload file. Please try again.',

  // API errors
  '400': 'Invalid request. Please check your input.',
  '401': 'Please log in to continue.',
  '403': 'You do not have permission for this action.',
  '404': 'The requested resource was not found.',
  '429': 'Too many requests. Please wait a moment.',
  '500': 'Server error. Please try again later.',
  '502': 'Server is temporarily unavailable.',
  '503': 'Service unavailable. Please try again later.',

  // QuickBooks specific
  'QB_NOT_CONNECTED': 'QuickBooks is not connected. Please connect first.',
  'QB_TOKEN_EXPIRED': 'QuickBooks session expired. Please reconnect.',
  'QB_RATE_LIMIT': 'QuickBooks rate limit reached. Please wait a moment.',

  // Sync errors
  'SYNC_FAILED': 'Failed to sync data to cloud. Changes saved locally.',
  'SYNC_NOT_AVAILABLE': 'Cloud sync not available. Please log in.',
  'SYNC_CONFLICT': 'Data was modified on another device. Please refresh.',
  'SYNC_OFFLINE': 'You are offline. Changes will sync when connected.',
  'SYNC_RETRY_EXHAUSTED': 'Sync failed after multiple attempts. Changes saved locally.',
  'SYNC_INVENTORY_FAILED': 'Failed to sync inventory item. Will retry automatically.',
  'SYNC_RECIPE_FAILED': 'Failed to sync recipe. Will retry automatically.',
  'SYNC_TASK_FAILED': 'Failed to sync task completion. Please try again.',

  // Unit conversion errors
  'UNIT_INCOMPATIBLE': 'Cannot convert between incompatible units.',
  'UNIT_UNKNOWN': 'Unknown unit. Please specify conversion manually.',
  'QUANTITY_MISSING': 'Quantity is required. Please enter a value.',
  'QUANTITY_INVALID': 'Quantity must be a positive number.',

  // Generic
  'PERMISSION_DENIED': 'You do not have permission to perform this action.',
  'OFFLINE': 'You appear to be offline. Please check your connection.',
};

// =============================================================================
// CUSTOM APP ERROR CLASS
// =============================================================================

/**
 * Custom application error with type and user-friendly message
 */
export class AppError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, originalError = null) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    this.userMessage = getUserFriendlyMessage(message, originalError);
  }

  /**
   * Get a loggable representation of this error
   */
  toLogObject() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      userMessage: this.userMessage,
      timestamp: this.timestamp,
      originalError: this.originalError?.message || null,
      stack: this.stack,
    };
  }
}

/**
 * Specialized error for sync operations with retry support
 */
export class SyncError extends AppError {
  constructor(message, originalError = null, context = {}) {
    super(message, ErrorType.SYNC, originalError);
    this.name = 'SyncError';
    this.context = context; // { entityType, entityId, operation }
    this.retryable = context.retryable !== false; // Default to retryable
    this.retryCount = context.retryCount || 0;
    this.maxRetries = context.maxRetries || 3;
  }

  /**
   * Check if retry is available
   */
  canRetry() {
    return this.retryable && this.retryCount < this.maxRetries;
  }

  /**
   * Create a new error with incremented retry count
   */
  withRetry() {
    return new SyncError(this.message, this.originalError, {
      ...this.context,
      retryCount: this.retryCount + 1,
    });
  }

  toLogObject() {
    return {
      ...super.toLogObject(),
      context: this.context,
      retryable: this.retryable,
      retryCount: this.retryCount,
      canRetry: this.canRetry(),
    };
  }
}

/**
 * Specialized error for validation failures
 */
export class ValidationError extends AppError {
  constructor(message, field = null, originalError = null) {
    super(message, ErrorType.VALIDATION, originalError);
    this.name = 'ValidationError';
    this.field = field;
    this.userMessage = message; // Validation messages are already user-friendly
  }

  toLogObject() {
    return {
      ...super.toLogObject(),
      field: this.field,
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get user-friendly message from error
 * @param {string} message - Original error message
 * @param {Error} originalError - Original error object
 * @returns {string} User-friendly message
 */
export function getUserFriendlyMessage(message, originalError = null) {
  const errorString = message || originalError?.message || '';

  // Check for known error patterns
  for (const [pattern, friendlyMessage] of Object.entries(ERROR_MESSAGES)) {
    if (errorString.includes(pattern)) {
      return friendlyMessage;
    }
  }

  // Check error code if present
  if (originalError?.code) {
    const codeMessage = ERROR_MESSAGES[originalError.code];
    if (codeMessage) return codeMessage;
  }

  // Check HTTP status code
  if (originalError?.status) {
    const statusMessage = ERROR_MESSAGES[String(originalError.status)];
    if (statusMessage) return statusMessage;
  }

  // Default messages based on content
  if (errorString.toLowerCase().includes('network')) {
    return ERROR_MESSAGES['NetworkError'];
  }
  if (errorString.toLowerCase().includes('timeout')) {
    return ERROR_MESSAGES['timeout'];
  }
  if (errorString.toLowerCase().includes('permission')) {
    return ERROR_MESSAGES['PERMISSION_DENIED'];
  }

  // Return a generic message for unknown errors
  return 'Something went wrong. Please try again.';
}

/**
 * Determine error type from error object
 * @param {Error} error - Error object
 * @returns {string} ErrorType value
 */
export function getErrorType(error) {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || '';

  if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
    return ErrorType.NETWORK;
  }
  if (code.startsWith('auth/') || message.includes('auth')) {
    return ErrorType.AUTH;
  }
  if (message.includes('timeout')) {
    return ErrorType.TIMEOUT;
  }
  if (message.includes('permission') || message.includes('403')) {
    return ErrorType.PERMISSION;
  }
  if (message.includes('not found') || message.includes('404')) {
    return ErrorType.NOT_FOUND;
  }
  if (message.includes('database') || message.includes('indexeddb') || message.includes('quota')) {
    return ErrorType.DATABASE;
  }
  if (message.includes('file') || message.includes('upload')) {
    return ErrorType.FILE;
  }
  if (message.includes('invalid') || message.includes('validation')) {
    return ErrorType.VALIDATION;
  }
  if (message.includes('api') || message.includes('500') || message.includes('502') || message.includes('503')) {
    return ErrorType.API;
  }

  return ErrorType.UNKNOWN;
}

// =============================================================================
// ERROR HANDLING FUNCTIONS
// =============================================================================

/**
 * Handle and transform any error into AppError
 * @param {Error|string} error - Error to handle
 * @param {string} context - Context description (e.g., 'saving recipe')
 * @returns {AppError} Standardized application error
 */
export function handleError(error, context = '') {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // String error
  if (typeof error === 'string') {
    return new AppError(error, ErrorType.UNKNOWN);
  }

  // Standard error
  const type = getErrorType(error);
  const message = context
    ? `Error ${context}: ${error.message}`
    : error.message;

  return new AppError(message, type, error);
}

/**
 * Log error with consistent format using structured logger
 * @param {Error} error - Error to log
 * @param {string} context - Context (function name, operation)
 * @param {Object} options - Additional options { component, data }
 */
export function logErrorWithContext(error, context = '', options = {}) {
  const appError = handleError(error, context);
  const { component = null, data = null } = options;

  // Use structured logger
  logErrorToLogger(appError.message, {
    component: component || 'App',
    action: context,
    error: appError.originalError || appError,
    data: {
      type: appError.type,
      userMessage: appError.userMessage,
      timestamp: appError.timestamp,
      ...data,
    },
    tags: [appError.type],
  });

  return appError;
}

/**
 * @deprecated Use logErrorWithContext instead for structured logging
 * Log error with consistent format (legacy support)
 * @param {Error} error - Error to log
 * @param {string} context - Context (function name, operation)
 */
export function legacyLogError(error, context = '') {
  const appError = handleError(error, context);

  console.error(`[${appError.type}] ${context}:`, {
    message: appError.message,
    userMessage: appError.userMessage,
    timestamp: appError.timestamp,
    originalError: appError.originalError?.message,
  });

  return appError;
}

/**
 * Create error handler for async operations
 * Returns a tuple [data, error] pattern
 * @param {Promise} promise - Promise to handle
 * @param {string} context - Operation context
 * @param {Object} options - Additional options { component, data }
 * @returns {Promise<[any, AppError|null]>} Tuple of [result, error]
 */
export async function safeAsync(promise, context = '', options = {}) {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    const appError = logErrorWithContext(error, context, options);
    return [null, appError];
  }
}

/**
 * Wrap an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Operation context
 * @param {Object} options - Additional options { component }
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, context = '', options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw logErrorWithContext(error, context, options);
    }
  };
}

// =============================================================================
// SERVICE-SPECIFIC ERROR HANDLERS
// =============================================================================

/**
 * Handle API response errors
 * @param {Response} response - Fetch response
 * @param {string} context - API endpoint/operation
 * @throws {AppError} If response is not ok
 */
export async function handleApiResponse(response, context = 'API call') {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const data = await response.json();
      errorMessage = data.error || data.message || errorMessage;
    } catch {
      // Response wasn't JSON
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    throw handleError(error, context);
  }

  return response;
}

/**
 * Handle QuickBooks specific errors
 * @param {Error} error - Original error
 * @param {string} operation - QB operation name
 * @returns {AppError} Standardized error
 */
export function handleQBError(error, operation = 'QuickBooks operation') {
  const message = error?.message || '';

  // Map QB-specific errors
  if (message.includes('not connected') || message.includes('no token')) {
    return new AppError('QuickBooks is not connected. Please connect first.', ErrorType.AUTH, error);
  }
  if (message.includes('expired') || message.includes('invalid_grant')) {
    return new AppError('QuickBooks session expired. Please reconnect.', ErrorType.AUTH, error);
  }
  if (message.includes('rate') || message.includes('429')) {
    return new AppError('QuickBooks rate limit reached. Please wait a moment.', ErrorType.API, error);
  }

  return handleError(error, operation);
}

/**
 * Handle database (IndexedDB/Firestore) errors
 * @param {Error} error - Original error
 * @param {string} operation - DB operation name
 * @returns {AppError} Standardized error
 */
export function handleDBError(error, operation = 'Database operation') {
  const message = error?.message || '';
  const name = error?.name || '';

  if (name === 'QuotaExceededError' || message.includes('quota')) {
    return new AppError('Storage is full. Please delete some recipes or data.', ErrorType.DATABASE, error);
  }
  if (name === 'ConstraintError' || message.includes('already exists')) {
    return new AppError('This item already exists. Please use a different name.', ErrorType.VALIDATION, error);
  }
  if (message.includes('not found')) {
    return new AppError('The requested item was not found.', ErrorType.NOT_FOUND, error);
  }

  return handleError(error, operation);
}

// =============================================================================
// EXPORTS
// =============================================================================

// Re-export logger utilities for convenience
export { createLogger } from './logger';

// Backwards compatibility alias for logError
export const logError = logErrorWithContext;

export default {
  ErrorType,
  AppError,
  handleError,
  logErrorWithContext,
  logError: logErrorWithContext, // Alias for backwards compatibility
  legacyLogError,
  safeAsync,
  withErrorHandling,
  handleApiResponse,
  handleQBError,
  handleDBError,
  getUserFriendlyMessage,
  getErrorType,
  createLogger,
};
