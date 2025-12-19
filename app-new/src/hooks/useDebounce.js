/**
 * Debounce Hooks
 *
 * Reusable hooks for debouncing values and callbacks.
 * Useful for auto-save, search, and other operations that shouldn't fire too frequently.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Debounce a value - returns the debounced value after delay
 *
 * @param {any} value - Value to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {any} Debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   // This runs 300ms after user stops typing
 *   performSearch(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Create a debounced callback function
 *
 * The callback will only execute after the specified delay has passed
 * since the last invocation. Useful for auto-save, search, etc.
 *
 * @param {Function} callback - Function to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @param {Array} deps - Dependencies array (like useCallback)
 * @returns {Function} Debounced function
 *
 * @example
 * const debouncedSave = useDebouncedCallback(
 *   (data) => saveToDatabase(data),
 *   1500,
 *   []
 * );
 *
 * // Call on every change - only executes 1.5s after last change
 * onChange={(data) => debouncedSave(data)}
 */
export function useDebouncedCallback(callback, delay, deps = []) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedFn = useCallback((...args) => {
    // Clear existing timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timer
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
      timeoutRef.current = null;
    }, delay);
  }, [delay, ...deps]);

  return debouncedFn;
}

/**
 * Create a debounced callback with max wait (leading edge after maxWait)
 *
 * Combines debounce with a maximum wait time. The callback will execute:
 * 1. After `delay` ms of inactivity (trailing edge), OR
 * 2. After `maxWait` ms since first call (forced execution)
 *
 * This prevents indefinite delays during continuous rapid changes.
 *
 * @param {Function} callback - Function to debounce
 * @param {number} delay - Debounce delay in milliseconds
 * @param {number} maxWait - Maximum wait time before forced execution
 * @param {Array} deps - Dependencies array
 * @returns {Object} { debouncedFn, flush, cancel, pending }
 *
 * @example
 * const { debouncedFn: autoSave, flush, cancel, pending } = useDebouncedCallbackWithMaxWait(
 *   async (data) => {
 *     await saveToDatabase(data);
 *   },
 *   1500,  // Wait 1.5s after user stops
 *   10000, // But force save after 10s max
 *   []
 * );
 *
 * // In component:
 * onChange={(data) => autoSave(data)}
 *
 * // Force immediate save (e.g., on blur or navigate away)
 * onBlur={() => flush()}
 *
 * // Cancel pending save (e.g., on unmount without saving)
 * useEffect(() => () => cancel(), []);
 */
export function useDebouncedCallbackWithMaxWait(callback, delay, maxWait, deps = []) {
  const timeoutRef = useRef(null);
  const maxWaitTimeoutRef = useRef(null);
  const lastArgsRef = useRef(null);
  const callbackRef = useRef(callback);
  const pendingRef = useRef(false);
  const lastCallTimeRef = useRef(null);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (maxWaitTimeoutRef.current) clearTimeout(maxWaitTimeoutRef.current);
    };
  }, []);

  // Execute the callback with stored args
  const executeCallback = useCallback(() => {
    if (lastArgsRef.current !== null) {
      const args = lastArgsRef.current;
      lastArgsRef.current = null;
      pendingRef.current = false;
      lastCallTimeRef.current = null;

      // Clear timers
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (maxWaitTimeoutRef.current) {
        clearTimeout(maxWaitTimeoutRef.current);
        maxWaitTimeoutRef.current = null;
      }

      callbackRef.current(...args);
    }
  }, []);

  // Flush: execute immediately if pending
  const flush = useCallback(() => {
    executeCallback();
  }, [executeCallback]);

  // Cancel: clear without executing
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
    }
    lastArgsRef.current = null;
    pendingRef.current = false;
    lastCallTimeRef.current = null;
  }, []);

  // The debounced function
  const debouncedFn = useCallback((...args) => {
    lastArgsRef.current = args;
    pendingRef.current = true;
    const now = Date.now();

    // Clear existing debounce timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set up max wait timer on first call
    if (!lastCallTimeRef.current) {
      lastCallTimeRef.current = now;

      maxWaitTimeoutRef.current = setTimeout(() => {
        executeCallback();
      }, maxWait);
    }

    // Set up debounce timer (trailing edge)
    timeoutRef.current = setTimeout(() => {
      executeCallback();
    }, delay);

  }, [delay, maxWait, executeCallback, ...deps]);

  // Return function and controls
  return useMemo(() => ({
    debouncedFn,
    flush,
    cancel,
    pending: () => pendingRef.current,
  }), [debouncedFn, flush, cancel]);
}

export default useDebounce;
