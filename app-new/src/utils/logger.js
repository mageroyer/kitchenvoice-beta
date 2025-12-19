/**
 * Structured Error Logging Utility
 *
 * Provides consistent, structured logging across the application.
 * Supports local console logging and remote error reporting services.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const config = {
  // Minimum level to log (can be changed at runtime)
  minLevel: import.meta.env.DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO,

  // Enable/disable remote logging
  remoteLogging: import.meta.env.PROD,

  // Remote logging endpoint (configure in env)
  remoteEndpoint: import.meta.env.VITE_ERROR_LOGGING_ENDPOINT || null,

  // Include stack traces in logs
  includeStackTrace: true,

  // Max errors to batch before sending to remote
  batchSize: 10,

  // Flush interval in ms (send batched errors)
  flushInterval: 30000,

  // App version for error tracking
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
};

// =============================================================================
// ERROR QUEUE FOR BATCHING
// =============================================================================

let errorQueue = [];
let flushTimer = null;

// =============================================================================
// CONTEXT TRACKING
// =============================================================================

// Global context that persists across log calls
let globalContext = {
  sessionId: generateSessionId(),
  appVersion: config.appVersion,
  environment: import.meta.env.MODE || 'development',
};

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Set global context that will be included in all logs
 * @param {Object} context - Context to merge with global context
 */
export function setGlobalContext(context) {
  globalContext = { ...globalContext, ...context };
}

/**
 * Get current user context for logging
 */
function getUserContext() {
  try {
    // Try to get user info from localStorage/sessionStorage
    const userEmail = sessionStorage.getItem('userEmail');
    const userId = sessionStorage.getItem('userId');
    return {
      userId: userId || 'anonymous',
      userEmail: userEmail ? maskEmail(userEmail) : null,
    };
  } catch {
    return { userId: 'anonymous', userEmail: null };
  }
}

/**
 * Mask email for privacy in logs
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 2
    ? `${local[0]}***${local[local.length - 1]}`
    : '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * Get browser/device context
 */
function getDeviceContext() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    url: window.location.href,
    referrer: document.referrer || null,
  };
}

// =============================================================================
// LOG FORMATTING
// =============================================================================

/**
 * Create a structured log entry
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR, FATAL)
 * @param {string} message - Log message
 * @param {Object} options - Additional options
 * @returns {Object} Structured log entry
 */
function createLogEntry(level, message, options = {}) {
  const {
    component = null,
    action = null,
    data = null,
    error = null,
    tags = [],
  } = options;

  const entry = {
    // Timestamp in ISO format
    timestamp: new Date().toISOString(),

    // Log level
    level,

    // Main message
    message,

    // Context information
    context: {
      component,
      action,
      ...globalContext,
      ...getUserContext(),
    },

    // Additional data (sanitized)
    data: sanitizeData(data),

    // Tags for filtering
    tags,

    // Error details if present
    error: error ? formatError(error) : null,

    // Device context (only for errors)
    device: level === 'ERROR' || level === 'FATAL' ? getDeviceContext() : null,
  };

  return entry;
}

/**
 * Format error object for logging
 */
function formatError(error) {
  if (!error) return null;

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      name: 'Error',
      stack: null,
    };
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || null,
    type: error.type || null,
    stack: config.includeStackTrace ? error.stack : null,
    // Include original error if it's an AppError
    originalError: error.originalError ? {
      name: error.originalError.name,
      message: error.originalError.message,
    } : null,
  };
}

/**
 * Sanitize data to remove sensitive information
 */
function sanitizeData(data) {
  if (!data) return null;

  // List of keys to redact
  const sensitiveKeys = [
    'password', 'token', 'apiKey', 'api_key', 'secret',
    'authorization', 'auth', 'credential', 'pin', 'ssn',
    'creditCard', 'credit_card', 'cvv', 'cardNumber',
  ];

  const sanitize = (obj, depth = 0) => {
    // Prevent deep recursion
    if (depth > 5) return '[MAX_DEPTH]';

    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
      return obj.slice(0, 100).map(item => sanitize(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          sanitized[key] = sanitize(value, depth + 1);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return obj;
  };

  return sanitize(data);
}

/**
 * Format log entry for console output
 */
function formatForConsole(entry) {
  const parts = [
    `[${entry.level}]`,
    entry.timestamp.split('T')[1].split('.')[0], // HH:MM:SS
  ];

  if (entry.context.component) {
    parts.push(`[${entry.context.component}]`);
  }

  if (entry.context.action) {
    parts.push(`(${entry.context.action})`);
  }

  parts.push(entry.message);

  return parts.join(' ');
}

// =============================================================================
// CONSOLE OUTPUT
// =============================================================================

/**
 * Output log entry to console
 */
function logToConsole(entry) {
  const formattedMessage = formatForConsole(entry);
  const consoleData = {};

  if (entry.context.component || entry.context.action) {
    consoleData.context = {
      component: entry.context.component,
      action: entry.context.action,
    };
  }

  if (entry.data) {
    consoleData.data = entry.data;
  }

  if (entry.error) {
    consoleData.error = entry.error;
  }

  if (entry.device) {
    consoleData.device = {
      url: entry.device.url,
      online: entry.device.online,
    };
  }

  const hasData = Object.keys(consoleData).length > 0;

  switch (entry.level) {
    case 'DEBUG':
      if (hasData) {
        console.debug(formattedMessage, consoleData);
      } else {
        console.debug(formattedMessage);
      }
      break;
    case 'INFO':
      if (hasData) {
        console.info(formattedMessage, consoleData);
      } else {
        console.info(formattedMessage);
      }
      break;
    case 'WARN':
      if (hasData) {
        console.warn(formattedMessage, consoleData);
      } else {
        console.warn(formattedMessage);
      }
      break;
    case 'ERROR':
    case 'FATAL':
      if (hasData) {
        console.error(formattedMessage, consoleData);
      } else {
        console.error(formattedMessage);
      }
      break;
    default:
      if (hasData) {
        console.log(formattedMessage, consoleData);
      } else {
        console.log(formattedMessage);
      }
  }
}

// =============================================================================
// REMOTE LOGGING
// =============================================================================

/**
 * Queue error for remote logging
 */
function queueForRemote(entry) {
  if (!config.remoteLogging || !config.remoteEndpoint) return;

  errorQueue.push(entry);

  // Flush if batch size reached
  if (errorQueue.length >= config.batchSize) {
    flushErrorQueue();
  }

  // Set up flush timer if not already running
  if (!flushTimer) {
    flushTimer = setTimeout(flushErrorQueue, config.flushInterval);
  }
}

/**
 * Flush error queue to remote service
 */
async function flushErrorQueue() {
  if (errorQueue.length === 0) return;

  const errors = [...errorQueue];
  errorQueue = [];

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (!config.remoteEndpoint) return;

  try {
    await fetch(config.remoteEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        errors,
        meta: {
          ...globalContext,
          batchTimestamp: new Date().toISOString(),
        },
      }),
    });
  } catch (err) {
    // Log locally if remote fails, but don't recurse
    console.error('[Logger] Failed to send errors to remote:', err.message);
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (errorQueue.length > 0 && config.remoteEndpoint) {
      // Use sendBeacon for reliable delivery on page unload
      navigator.sendBeacon?.(
        config.remoteEndpoint,
        JSON.stringify({
          errors: errorQueue,
          meta: { ...globalContext, batchTimestamp: new Date().toISOString() },
        })
      );
    }
  });
}

// =============================================================================
// MAIN LOGGING FUNCTIONS
// =============================================================================

/**
 * Log a debug message
 * @param {string} message - Log message
 * @param {Object} options - { component, action, data, tags }
 */
export function debug(message, options = {}) {
  if (LOG_LEVELS.DEBUG < config.minLevel) return;

  const entry = createLogEntry('DEBUG', message, options);
  logToConsole(entry);
}

/**
 * Log an info message
 * @param {string} message - Log message
 * @param {Object} options - { component, action, data, tags }
 */
export function info(message, options = {}) {
  if (LOG_LEVELS.INFO < config.minLevel) return;

  const entry = createLogEntry('INFO', message, options);
  logToConsole(entry);
}

/**
 * Log a warning message
 * @param {string} message - Log message
 * @param {Object} options - { component, action, data, error, tags }
 */
export function warn(message, options = {}) {
  if (LOG_LEVELS.WARN < config.minLevel) return;

  const entry = createLogEntry('WARN', message, options);
  logToConsole(entry);
}

/**
 * Log an error message
 * @param {string} message - Log message
 * @param {Object} options - { component, action, data, error, tags }
 */
export function error(message, options = {}) {
  if (LOG_LEVELS.ERROR < config.minLevel) return;

  const entry = createLogEntry('ERROR', message, options);
  logToConsole(entry);
  queueForRemote(entry);

  return entry;
}

/**
 * Log a fatal error (critical failure)
 * @param {string} message - Log message
 * @param {Object} options - { component, action, data, error, tags }
 */
export function fatal(message, options = {}) {
  const entry = createLogEntry('FATAL', message, options);
  logToConsole(entry);
  queueForRemote(entry);

  // Immediately flush fatal errors
  flushErrorQueue();

  return entry;
}

// =============================================================================
// CONVENIENCE METHODS
// =============================================================================

/**
 * Create a logger scoped to a specific component
 * @param {string} component - Component name
 * @returns {Object} Scoped logger
 */
export function createLogger(component) {
  return {
    debug: (message, options = {}) => debug(message, { ...options, component }),
    info: (message, options = {}) => info(message, { ...options, component }),
    warn: (message, options = {}) => warn(message, { ...options, component }),
    error: (message, options = {}) => error(message, { ...options, component }),
    fatal: (message, options = {}) => fatal(message, { ...options, component }),

    /**
     * Log an error with full context
     * @param {string} action - What was being done when error occurred
     * @param {Error} err - The error object
     * @param {Object} data - Additional data for context
     */
    logError: (action, err, data = null) => {
      return error(`Error during ${action}`, {
        component,
        action,
        error: err,
        data,
      });
    },

    /**
     * Log start of an action (for timing/tracing)
     */
    startAction: (action, data = null) => {
      debug(`Starting: ${action}`, { component, action, data });
    },

    /**
     * Log successful completion of an action
     */
    endAction: (action, data = null) => {
      debug(`Completed: ${action}`, { component, action, data });
    },
  };
}

/**
 * Wrap an async function with automatic error logging
 * @param {Function} fn - Async function to wrap
 * @param {string} component - Component name
 * @param {string} action - Action name
 * @returns {Function} Wrapped function
 */
export function withLogging(fn, component, action) {
  const logger = createLogger(component);

  return async (...args) => {
    logger.startAction(action);
    try {
      const result = await fn(...args);
      logger.endAction(action);
      return result;
    } catch (err) {
      logger.logError(action, err, { args: sanitizeData(args) });
      throw err;
    }
  };
}

/**
 * Log and rethrow an error (useful in catch blocks)
 * @param {Error} err - Error to log
 * @param {string} component - Component where error occurred
 * @param {string} action - Action that failed
 * @param {Object} data - Additional context data
 */
export function logAndThrow(err, component, action, data = null) {
  error(`Error during ${action}`, {
    component,
    action,
    error: err,
    data,
  });
  throw err;
}

/**
 * Log and return an error (useful when you don't want to throw)
 * @param {Error} err - Error to log
 * @param {string} component - Component where error occurred
 * @param {string} action - Action that failed
 * @param {Object} data - Additional context data
 * @returns {Error} The original error
 */
export function logAndReturn(err, component, action, data = null) {
  error(`Error during ${action}`, {
    component,
    action,
    error: err,
    data,
  });
  return err;
}

// =============================================================================
// CONFIGURATION METHODS
// =============================================================================

/**
 * Update logger configuration
 * @param {Object} newConfig - Configuration options to update
 */
export function configure(newConfig) {
  Object.assign(config, newConfig);
}

/**
 * Set minimum log level
 * @param {string} level - 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'
 */
export function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    config.minLevel = LOG_LEVELS[level];
  }
}

/**
 * Enable/disable remote logging
 * @param {boolean} enabled - Whether to enable remote logging
 * @param {string} endpoint - Remote endpoint URL (optional)
 */
export function setRemoteLogging(enabled, endpoint = null) {
  config.remoteLogging = enabled;
  if (endpoint) {
    config.remoteEndpoint = endpoint;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  debug,
  info,
  warn,
  error,
  fatal,
  createLogger,
  withLogging,
  logAndThrow,
  logAndReturn,
  setGlobalContext,
  configure,
  setLogLevel,
  setRemoteLogging,
  LOG_LEVELS,
};
