/**
 * Metabolism - Controls the rate of processing in the organism
 *
 * Unlike traditional batch processing, metabolism adapts:
 * - When hungry (low inventory), process faster
 * - When full (high inventory), slow down, save energy
 * - When stressed (many errors), pause and recover
 *
 * @module organism/systems/Metabolism
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getNervousSystem } from './NervousSystem';

/**
 * Metabolic states
 */
export const METABOLIC_STATE = {
  DORMANT: 'dormant',       // Minimal activity
  RESTING: 'resting',       // Low activity, conserving
  ACTIVE: 'active',         // Normal processing
  ELEVATED: 'elevated',     // Increased activity
  URGENT: 'urgent',         // Maximum speed
  RECOVERING: 'recovering'  // Healing, reduced activity
};

/**
 * Rate multipliers for each state
 */
const RATE_MULTIPLIERS = {
  [METABOLIC_STATE.DORMANT]: 0.1,
  [METABOLIC_STATE.RESTING]: 0.5,
  [METABOLIC_STATE.ACTIVE]: 1.0,
  [METABOLIC_STATE.ELEVATED]: 1.5,
  [METABOLIC_STATE.URGENT]: 2.0,
  [METABOLIC_STATE.RECOVERING]: 0.3
};

/**
 * Metabolism class
 */
export class Metabolism {
  constructor() {
    this.state = METABOLIC_STATE.RESTING;
    this.rate = 1.0;
    this.energy = 100;           // Available energy (0-100)
    this.processingQueue = [];   // Items waiting to be processed
    this.isProcessing = false;
    this.stats = {
      itemsProcessed: 0,
      totalProcessingTime: 0,
      errors: 0
    };

    // Processing intervals by type (ms)
    this.intervals = {
      invoice: 2000,    // Invoice processing
      inventory: 500,   // Inventory updates
      recipe: 1000,     // Recipe calculations
      task: 1000        // Task processing
    };

    // Register with nervous system
    this.connectToNervousSystem();
  }

  /**
   * Connect to nervous system to receive signals
   */
  connectToNervousSystem() {
    const nervous = getNervousSystem();
    nervous.registerOrgan('metabolism', this);
  }

  /**
   * Feel signals from nervous system
   */
  feel(signal) {
    switch (signal.type) {
      case SIGNAL_TYPES.HUNGER:
        // Increase metabolic rate when hungry
        this.elevateRate(signal.intensity);
        return { response: 'increasing_rate' };

      case SIGNAL_TYPES.SATIATION:
        // Decrease rate when full
        this.reduceRate();
        return { response: 'decreasing_rate' };

      case SIGNAL_TYPES.PAIN:
        // Enter recovery mode on pain
        if (signal.intensity >= INTENSITY.HIGH) {
          this.enterRecovery();
          return { response: 'entering_recovery' };
        }
        break;

      case SIGNAL_TYPES.CRITICAL:
        // Emergency mode
        this.setState(METABOLIC_STATE.URGENT);
        return { response: 'emergency_mode' };

      default:
        return null;
    }
  }

  /**
   * Set metabolic state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.rate = RATE_MULTIPLIERS[newState];

    // Emit metabolism signal
    this.emitMetabolismSignal();
  }

  /**
   * Elevate metabolic rate based on need
   */
  elevateRate(need) {
    if (need >= INTENSITY.URGENT) {
      this.setState(METABOLIC_STATE.URGENT);
    } else if (need >= INTENSITY.HIGH) {
      this.setState(METABOLIC_STATE.ELEVATED);
    } else {
      this.setState(METABOLIC_STATE.ACTIVE);
    }
  }

  /**
   * Reduce metabolic rate
   */
  reduceRate() {
    if (this.state === METABOLIC_STATE.URGENT) {
      this.setState(METABOLIC_STATE.ELEVATED);
    } else if (this.state === METABOLIC_STATE.ELEVATED) {
      this.setState(METABOLIC_STATE.ACTIVE);
    } else if (this.state === METABOLIC_STATE.ACTIVE) {
      this.setState(METABOLIC_STATE.RESTING);
    }
  }

  /**
   * Enter recovery mode
   */
  enterRecovery() {
    this.setState(METABOLIC_STATE.RECOVERING);

    // Auto-exit recovery after a period
    setTimeout(() => {
      if (this.state === METABOLIC_STATE.RECOVERING) {
        this.setState(METABOLIC_STATE.RESTING);
      }
    }, 30000); // 30 seconds recovery
  }

  /**
   * Emit metabolism signal
   */
  async emitMetabolismSignal() {
    const nervous = getNervousSystem();
    const signal = new Signal(
      SIGNAL_TYPES.METABOLISM,
      this.rate / 2, // Normalize to 0-1 range
      'metabolism',
      {
        state: this.state,
        rate: this.rate,
        energy: this.energy
      }
    );
    await nervous.broadcast(signal);
  }

  /**
   * Get the processing interval for a type
   * Adjusted by current metabolic rate
   */
  getInterval(type) {
    const baseInterval = this.intervals[type] || 1000;
    return Math.round(baseInterval / this.rate);
  }

  /**
   * Queue an item for processing
   */
  queue(item, type, processor) {
    this.processingQueue.push({
      item,
      type,
      processor,
      queuedAt: Date.now()
    });

    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) return;
    if (this.state === METABOLIC_STATE.DORMANT) return;

    this.isProcessing = true;

    while (this.processingQueue.length > 0 && this.state !== METABOLIC_STATE.DORMANT) {
      const task = this.processingQueue.shift();
      const interval = this.getInterval(task.type);

      try {
        const startTime = Date.now();

        // Process the item
        await task.processor(task.item);

        // Update stats
        this.stats.itemsProcessed++;
        this.stats.totalProcessingTime += (Date.now() - startTime);

        // Consume energy
        this.consumeEnergy(1);

      } catch (error) {
        console.error(`[Metabolism] Processing error:`, error);
        this.stats.errors++;

        // Pain signal on error
        const nervous = getNervousSystem();
        await nervous.broadcast(Signal.pain('metabolism', INTENSITY.MEDIUM, {
          error: error.message,
          taskType: task.type
        }));
      }

      // Wait according to metabolic rate
      if (this.processingQueue.length > 0) {
        await this.wait(interval);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Wait for specified time
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Consume energy
   */
  consumeEnergy(amount) {
    this.energy = Math.max(0, this.energy - amount);

    // If energy depleted, slow down
    if (this.energy < 20 && this.state !== METABOLIC_STATE.RECOVERING) {
      this.setState(METABOLIC_STATE.RESTING);
    }

    // If energy critical, go dormant
    if (this.energy < 5) {
      this.setState(METABOLIC_STATE.DORMANT);
    }
  }

  /**
   * Restore energy
   */
  restoreEnergy(amount) {
    this.energy = Math.min(100, this.energy + amount);

    // If energy restored, can increase activity
    if (this.energy > 50 && this.state === METABOLIC_STATE.DORMANT) {
      this.setState(METABOLIC_STATE.RESTING);
    }
  }

  /**
   * Process a batch with controlled rate
   * @param {Array} items - Items to process
   * @param {Function} processor - Processing function
   * @param {string} type - Processing type
   */
  async processBatch(items, processor, type = 'default') {
    const results = [];
    const interval = this.getInterval(type);

    for (const item of items) {
      if (this.state === METABOLIC_STATE.DORMANT) {
        console.warn('[Metabolism] Dormant - stopping batch');
        break;
      }

      try {
        const result = await processor(item);
        results.push({ success: true, result });
        this.stats.itemsProcessed++;
      } catch (error) {
        results.push({ success: false, error: error.message });
        this.stats.errors++;
      }

      // Wait between items
      if (items.indexOf(item) < items.length - 1) {
        await this.wait(interval);
      }
    }

    return results;
  }

  /**
   * Get current metabolic status
   */
  getStatus() {
    return {
      state: this.state,
      rate: this.rate,
      energy: this.energy,
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      stats: { ...this.stats },
      avgProcessingTime: this.stats.itemsProcessed > 0
        ? this.stats.totalProcessingTime / this.stats.itemsProcessed
        : 0
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Metabolism instance
 */
export function getMetabolism() {
  if (!instance) {
    instance = new Metabolism();
  }
  return instance;
}

export default Metabolism;
