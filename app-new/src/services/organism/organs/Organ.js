/**
 * Organ - Base class for all organs in the organism
 *
 * Every organ:
 * - Has a health score (0-100)
 * - Can feel signals from the nervous system
 * - Can emit signals
 * - Reports its status
 *
 * @module organism/organs/Organ
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getNervousSystem } from '../systems/NervousSystem';

/**
 * Health status thresholds
 */
export const HEALTH_THRESHOLDS = {
  HEALTHY: 80,
  ATTENTION: 50,
  CRITICAL: 0
};

/**
 * Base Organ class
 */
export class Organ {
  /**
   * Create an organ
   * @param {string} name - Organ identifier
   * @param {Object} config - Configuration
   */
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.health = 100;
    this.lastPulse = null;
    this.isAlive = true;
    this.signalHandlers = new Map();
    this.state = {};

    // Register default signal handlers
    this.registerSignalHandler(SIGNAL_TYPES.HEARTBEAT, this.onHeartbeat.bind(this));
    this.registerSignalHandler(SIGNAL_TYPES.PAIN, this.onPain.bind(this));
  }

  /**
   * Register with the nervous system
   */
  connect() {
    const nervousSystem = getNervousSystem();
    nervousSystem.registerOrgan(this.name, this);
  }

  /**
   * Disconnect from nervous system
   */
  disconnect() {
    const nervousSystem = getNervousSystem();
    nervousSystem.unregisterOrgan(this.name);
    this.isAlive = false;
  }

  /**
   * Register a handler for a specific signal type
   * @param {string} signalType - Signal type to handle
   * @param {Function} handler - Handler function
   */
  registerSignalHandler(signalType, handler) {
    this.signalHandlers.set(signalType, handler);
  }

  /**
   * Feel a signal from the nervous system
   * This is called by the NervousSystem for every signal.
   * The organ responds based on its nature.
   *
   * @param {Signal} signal - The signal to feel
   * @returns {Object|null} Response to the signal
   */
  async feel(signal) {
    if (!this.isAlive) return null;

    // Check for registered handler
    const handler = this.signalHandlers.get(signal.type);
    if (handler) {
      return await handler(signal);
    }

    // Default behavior based on signal type
    switch (signal.type) {
      case SIGNAL_TYPES.HUNGER:
        return this.onHunger(signal);

      case SIGNAL_TYPES.CRITICAL:
        return this.onCritical(signal);

      default:
        // Organ doesn't respond to this signal type
        return null;
    }
  }

  /**
   * Emit a signal to the nervous system
   * @param {Signal} signal - Signal to emit
   */
  async emit(signal) {
    const nervousSystem = getNervousSystem();
    await nervousSystem.broadcast(signal);
  }

  /**
   * Quick emit helpers
   */
  async emitHunger(intensity = INTENSITY.MEDIUM, data = {}) {
    await this.emit(Signal.hunger(this.name, intensity, data));
  }

  async emitPain(intensity = INTENSITY.HIGH, data = {}) {
    await this.emit(Signal.pain(this.name, intensity, data));
  }

  async emitGrowth(data = {}) {
    await this.emit(new Signal(SIGNAL_TYPES.GROWTH, INTENSITY.MEDIUM, this.name, data));
  }

  // ============================================
  // DEFAULT SIGNAL HANDLERS
  // ============================================

  /**
   * Handle heartbeat signal
   */
  onHeartbeat(signal) {
    this.lastPulse = Date.now();
    // Each organ can override to respond to heartbeats
    return { acknowledged: true, health: this.health };
  }

  /**
   * Handle hunger signal from another organ
   */
  onHunger(signal) {
    // Override in subclasses
    return null;
  }

  /**
   * Handle pain signal
   */
  onPain(signal) {
    // If pain is severe, affect own health
    if (signal.intensity >= INTENSITY.HIGH) {
      this.health = Math.max(0, this.health - 5);
    }
    return { felt: true };
  }

  /**
   * Handle critical signal
   */
  onCritical(signal) {
    console.warn(`[${this.name}] Received critical signal from ${signal.origin}`);
    return { acknowledged: true };
  }

  // ============================================
  // HEALTH MANAGEMENT
  // ============================================

  /**
   * Get health status
   */
  getHealthStatus() {
    if (this.health >= HEALTH_THRESHOLDS.HEALTHY) return 'healthy';
    if (this.health >= HEALTH_THRESHOLDS.ATTENTION) return 'attention';
    return 'critical';
  }

  /**
   * Update health score
   * @param {number} delta - Amount to change (positive or negative)
   */
  updateHealth(delta) {
    const oldHealth = this.health;
    this.health = Math.max(0, Math.min(100, this.health + delta));

    // Emit signal if health changed significantly
    if (Math.abs(this.health - oldHealth) >= 10) {
      if (this.health < oldHealth) {
        this.emitPain(INTENSITY.MEDIUM, {
          healthDrop: oldHealth - this.health,
          currentHealth: this.health
        });
      }
    }
  }

  /**
   * Calculate health based on factors
   * @param {Array} factors - Array of { name, value, weight }
   */
  calculateHealth(factors) {
    if (!factors || factors.length === 0) return 50;

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedSum = factors.reduce((sum, f) => sum + (f.value * f.weight), 0);

    this.health = Math.round(weightedSum / totalWeight);
    return this.health;
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Get organ state
   */
  getState() {
    return {
      name: this.name,
      health: this.health,
      status: this.getHealthStatus(),
      isAlive: this.isAlive,
      lastPulse: this.lastPulse,
      ...this.state
    };
  }

  /**
   * Update organ state
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /**
   * Initialize the organ
   * Override in subclasses to set up initial state
   */
  async initialize() {
    this.isAlive = true;
  }

  /**
   * Perform a pulse - regular health check
   * Override in subclasses to implement specific checks
   */
  async pulse() {
    // Default implementation - subclasses should override
    return {
      organ: this.name,
      health: this.health,
      status: this.getHealthStatus(),
      timestamp: Date.now()
    };
  }

  /**
   * Shutdown the organ
   */
  async shutdown() {
    this.isAlive = false;
    this.disconnect();
  }
}

export default Organ;
