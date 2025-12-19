/**
 * Firebase Query Cache Service
 *
 * In-memory caching layer for Firebase/Firestore queries to reduce
 * unnecessary reads for frequently accessed, rarely-changed data.
 */

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} data - Cached data
 * @property {number} timestamp - When the entry was cached
 * @property {number} ttl - Time to live in milliseconds
 */

class FirebaseCache {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();

    /** Default TTL: 5 minutes */
    this.defaultTTL = 5 * 60 * 1000;

    /** Short TTL for frequently updated data: 30 seconds */
    this.shortTTL = 30 * 1000;

    /** Long TTL for rarely changed data: 15 minutes */
    this.longTTL = 15 * 60 * 1000;
  }

  /**
   * Generate a cache key from components
   * @param {string} collection - Collection name
   * @param {string} [docId] - Optional document ID
   * @param {string} [query] - Optional query identifier
   * @returns {string} Cache key
   */
  generateKey(collection, docId = '', query = '') {
    return `${collection}:${docId}:${query}`.replace(/:+$/, '');
  }

  /**
   * Get cached data if valid
   * @param {string} key - Cache key
   * @returns {any|null} Cached data or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Entry expired, remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cached data
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} [ttl] - Time to live in milliseconds
   */
  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * Invalidate a specific cache entry
   * @param {string} key - Cache key to invalidate
   */
  invalidate(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all entries for a collection
   * @param {string} collection - Collection name prefix
   */
  invalidateCollection(collection) {
    const prefix = `${collection}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    let validEntries = 0;
    let expiredEntries = 0;
    const now = Date.now();

    for (const [, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
    };
  }

  /**
   * Clean up expired entries (call periodically)
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// Singleton instance
const firebaseCache = new FirebaseCache();

// Cache key constants for consistency
export const CACHE_KEYS = {
  PRIVILEGES: 'privileges',
  BUSINESS_INFO: 'businessInfo',
  CATEGORIES: 'categories',
  DEPARTMENTS: 'departments',
};

// TTL constants
export const CACHE_TTL = {
  /** Short TTL for frequently updated data: 30 seconds */
  SHORT: 30 * 1000,
  /** Default TTL: 5 minutes */
  DEFAULT: 5 * 60 * 1000,
  /** Long TTL for rarely changed data: 15 minutes */
  LONG: 15 * 60 * 1000,
  /** Very long TTL for static data: 1 hour */
  VERY_LONG: 60 * 60 * 1000,
};

export default firebaseCache;
