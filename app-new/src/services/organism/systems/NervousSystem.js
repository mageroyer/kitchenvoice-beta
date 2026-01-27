/**
 * NervousSystem - Broadcasts signals to all organs
 *
 * The nervous system doesn't use traditional pub/sub. Instead, every signal
 * propagates to ALL organs. Each organ "feels" the signal and responds
 * according to its nature. This creates emergent behavior.
 *
 * @module organism/systems/NervousSystem
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';

/**
 * Maximum signals to keep in memory
 */
const SIGNAL_HISTORY_LIMIT = 1000;

/**
 * Signal decay rate (signals older than this are considered stale)
 */
const SIGNAL_STALE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * NervousSystem class
 */
export class NervousSystem {
  constructor() {
    this.organs = new Map();  // organ name -> organ instance
    this.signalHistory = [];  // Recent signals for pattern detection
    this.isActive = false;
    this.signalQueue = [];    // Signals waiting to be processed
    this.processing = false;
  }

  /**
   * Register an organ to receive signals
   * @param {string} name - Organ identifier
   * @param {Object} organ - Organ instance (must implement `feel` method)
   */
  registerOrgan(name, organ) {
    if (typeof organ.feel !== 'function') {
      console.warn(`[NervousSystem] Organ ${name} has no 'feel' method - signals won't reach it`);
    }
    this.organs.set(name, organ);
  }

  /**
   * Unregister an organ
   */
  unregisterOrgan(name) {
    this.organs.delete(name);
  }

  /**
   * Broadcast a signal to all organs
   * @param {Signal} signal - The signal to broadcast
   */
  async broadcast(signal) {
    if (!(signal instanceof Signal)) {
      console.error('[NervousSystem] Invalid signal - must be Signal instance');
      return;
    }

    // Add to queue for processing
    this.signalQueue.push(signal);

    // Process queue if not already processing
    if (!this.processing) {
      await this.processQueue();
    }
  }

  /**
   * Process signal queue
   */
  async processQueue() {
    if (this.processing || this.signalQueue.length === 0) return;

    this.processing = true;

    while (this.signalQueue.length > 0) {
      const signal = this.signalQueue.shift();
      await this.propagateSignal(signal);
    }

    this.processing = false;
  }

  /**
   * Propagate a single signal to all organs
   */
  async propagateSignal(signal) {
    // Record in history
    this.recordSignal(signal);

    // Propagate to all organs
    const propagationPromises = [];

    for (const [name, organ] of this.organs) {
      // Don't send signal back to its origin (unless it's a heartbeat)
      if (name === signal.origin && signal.type !== SIGNAL_TYPES.HEARTBEAT) {
        continue;
      }

      // Each organ feels the signal
      if (typeof organ.feel === 'function') {
        propagationPromises.push(
          this.deliverSignal(name, organ, signal)
        );
      }
    }

    // Wait for all organs to respond
    await Promise.allSettled(propagationPromises);

    // Mark signal as propagated
    signal.markPropagated();

    // Check for critical signals that need escalation
    if (signal.isCritical) {
      this.handleCriticalSignal(signal);
    }
  }

  /**
   * Deliver signal to a single organ
   */
  async deliverSignal(name, organ, signal) {
    try {
      const response = await organ.feel(signal);
      if (response) {
        signal.addResponse(name, response);
      }
    } catch (error) {
      console.error(`[NervousSystem] Organ ${name} failed to process signal:`, error);
      // Organ failure might trigger a pain signal
      const painSignal = Signal.pain(name, INTENSITY.HIGH, {
        error: error.message,
        failedSignal: signal.type
      });
      // Queue pain signal (don't await to avoid recursion)
      this.signalQueue.push(painSignal);
    }
  }

  /**
   * Record signal in history for pattern detection
   */
  recordSignal(signal) {
    this.signalHistory.push(signal);

    // Trim history if too large
    if (this.signalHistory.length > SIGNAL_HISTORY_LIMIT) {
      this.signalHistory = this.signalHistory.slice(-SIGNAL_HISTORY_LIMIT / 2);
    }
  }

  /**
   * Handle critical signals
   */
  handleCriticalSignal(signal) {
    console.error(`[NervousSystem] ⚠️ CRITICAL SIGNAL from ${signal.origin}: ${signal.type}`);
    // Could trigger notifications, alerts, etc.
  }

  /**
   * Get recent signals of a specific type
   */
  getRecentSignals(type, maxAge = SIGNAL_STALE_MS) {
    const now = Date.now();
    return this.signalHistory.filter(s =>
      s.type === type && (now - s.timestamp) < maxAge
    );
  }

  /**
   * Detect signal patterns (for learning)
   */
  detectPatterns() {
    const patterns = {};

    // Count signal types in recent history
    for (const signal of this.signalHistory) {
      patterns[signal.type] = (patterns[signal.type] || 0) + 1;
    }

    // Detect repeated hunger (system needs resources)
    const hungerSignals = this.getRecentSignals(SIGNAL_TYPES.HUNGER);
    if (hungerSignals.length > 3) {
      patterns.repeatedHunger = true;
    }

    // Detect pain cluster (system under stress)
    const painSignals = this.getRecentSignals(SIGNAL_TYPES.PAIN);
    if (painSignals.length > 2) {
      patterns.painCluster = true;
    }

    return patterns;
  }

  /**
   * Get system activity metrics
   */
  getMetrics() {
    const now = Date.now();
    const recentSignals = this.signalHistory.filter(s =>
      (now - s.timestamp) < 60000 // Last minute
    );

    return {
      totalSignals: this.signalHistory.length,
      recentSignals: recentSignals.length,
      signalsPerMinute: recentSignals.length,
      organCount: this.organs.size,
      queueLength: this.signalQueue.length,
      patterns: this.detectPatterns()
    };
  }

  /**
   * Clear old signals
   */
  cleanup() {
    const now = Date.now();
    this.signalHistory = this.signalHistory.filter(s =>
      (now - s.timestamp) < SIGNAL_STALE_MS * 2
    );
  }

  /**
   * Start the nervous system
   */
  start() {
    this.isActive = true;

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Stop the nervous system
   */
  stop() {
    this.isActive = false;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton NervousSystem instance
 */
export function getNervousSystem() {
  if (!instance) {
    instance = new NervousSystem();
  }
  return instance;
}

export default NervousSystem;
