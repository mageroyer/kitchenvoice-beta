/**
 * Signal - The nervous system's message format
 *
 * Signals are how organs communicate. Unlike events (which are explicit),
 * signals propagate through the entire system. Every organ "feels" every signal
 * and responds according to its nature.
 *
 * @module organism/signals/Signal
 */

/**
 * Signal types - the "hormones" of the system
 */
export const SIGNAL_TYPES = {
  // Survival signals
  HUNGER: 'hunger',           // Need resources (low inventory)
  SATIATION: 'satiation',     // Resources received (invoice processed)
  PAIN: 'pain',               // Something is wrong (error, anomaly)
  HEALING: 'healing',         // Recovery in progress

  // Activity signals
  HEARTBEAT: 'heartbeat',     // Regular health pulse
  DIGESTION: 'digestion',     // Processing in progress
  METABOLISM: 'metabolism',   // Rate of processing changed

  // State signals
  GROWTH: 'growth',           // New data added
  DECAY: 'decay',             // Data aging/expiring
  MUTATION: 'mutation',       // Data changed unexpectedly

  // Flow signals
  FLOW_START: 'flow_start',   // Blood starting to flow
  FLOW_COMPLETE: 'flow_complete', // Blood finished flowing
  BLOCKAGE: 'blockage',       // Flow interrupted

  // Alert signals
  ALERT: 'alert',             // General attention needed
  CRITICAL: 'critical',       // Immediate attention required
  RECOVERY: 'recovery'        // Crisis resolved
};

/**
 * Signal intensity levels
 */
export const INTENSITY = {
  WHISPER: 0.1,    // Background, ignorable
  LOW: 0.3,        // Notable but not urgent
  MEDIUM: 0.5,     // Should pay attention
  HIGH: 0.7,       // Important
  URGENT: 0.9,     // Act now
  CRITICAL: 1.0    // Emergency
};

/**
 * Signal class - a single message in the nervous system
 */
export class Signal {
  /**
   * Create a new signal
   * @param {string} type - Signal type from SIGNAL_TYPES
   * @param {number} intensity - 0.0 to 1.0
   * @param {string} origin - Which organ sent this
   * @param {Object} data - Optional payload
   */
  constructor(type, intensity, origin, data = {}) {
    this.id = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type;
    this.intensity = Math.max(0, Math.min(1, intensity)); // Clamp 0-1
    this.origin = origin;
    this.data = data;
    this.timestamp = Date.now();
    this.propagated = false;
    this.responses = [];
  }

  /**
   * Check if this signal is urgent
   */
  get isUrgent() {
    return this.intensity >= INTENSITY.URGENT;
  }

  /**
   * Check if this signal is critical
   */
  get isCritical() {
    return this.intensity >= INTENSITY.CRITICAL;
  }

  /**
   * Record a response from an organ
   */
  addResponse(organ, response) {
    this.responses.push({
      organ,
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Mark signal as propagated
   */
  markPropagated() {
    this.propagated = true;
  }

  /**
   * Get signal age in milliseconds
   */
  get age() {
    return Date.now() - this.timestamp;
  }

  /**
   * Create a hunger signal
   */
  static hunger(origin, intensity = INTENSITY.MEDIUM, data = {}) {
    return new Signal(SIGNAL_TYPES.HUNGER, intensity, origin, data);
  }

  /**
   * Create a pain signal
   */
  static pain(origin, intensity = INTENSITY.HIGH, data = {}) {
    return new Signal(SIGNAL_TYPES.PAIN, intensity, origin, data);
  }

  /**
   * Create a heartbeat signal
   */
  static heartbeat(healthScore, data = {}) {
    const intensity = healthScore / 100; // Health score as intensity
    return new Signal(SIGNAL_TYPES.HEARTBEAT, intensity, 'heart', data);
  }

  /**
   * Create a flow signal
   */
  static flowStart(origin, data = {}) {
    return new Signal(SIGNAL_TYPES.FLOW_START, INTENSITY.MEDIUM, origin, data);
  }

  /**
   * Create a flow complete signal
   */
  static flowComplete(origin, data = {}) {
    return new Signal(SIGNAL_TYPES.FLOW_COMPLETE, INTENSITY.MEDIUM, origin, data);
  }

  /**
   * Create a critical alert signal
   */
  static critical(origin, message, data = {}) {
    return new Signal(SIGNAL_TYPES.CRITICAL, INTENSITY.CRITICAL, origin, { message, ...data });
  }

  /**
   * Serialize for logging/storage
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      intensity: this.intensity,
      origin: this.origin,
      data: this.data,
      timestamp: this.timestamp,
      age: this.age,
      propagated: this.propagated,
      responseCount: this.responses.length
    };
  }
}

export default Signal;
