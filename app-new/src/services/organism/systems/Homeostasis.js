/**
 * Homeostasis - Maintains balance in the organism
 *
 * Unlike static thresholds, homeostasis actively seeks equilibrium:
 * - Monitors all organs continuously
 * - Detects deviation from healthy ranges
 * - Initiates corrective actions
 * - The system WANTS to return to balance
 *
 * @module organism/systems/Homeostasis
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getNervousSystem } from './NervousSystem';

/**
 * Target ranges for different metrics
 */
export const TARGET_RANGES = {
  // Inventory health targets
  inventory: {
    stockLevel: { min: 0.3, ideal: 0.8, max: 1.5 },  // As ratio of par
    pricingCoverage: { min: 0.7, ideal: 0.95, max: 1.0 },
    freshness: { min: 0.5, ideal: 0.9, max: 1.0 }  // Data freshness
  },

  // Invoice flow targets
  invoice: {
    flowRate: { min: 1, ideal: 5, max: 20 },  // Per day
    processingBacklog: { min: 0, ideal: 0, max: 5 },
    accuracy: { min: 0.8, ideal: 0.95, max: 1.0 }
  },

  // Recipe health targets
  recipe: {
    costingCoverage: { min: 0.7, ideal: 0.95, max: 1.0 },
    completeness: { min: 0.6, ideal: 0.9, max: 1.0 }
  },

  // Task execution targets
  task: {
    completionRate: { min: 0.6, ideal: 0.9, max: 1.0 },
    overdueRatio: { min: 0, ideal: 0, max: 0.1 }
  },

  // Overall organism
  organism: {
    overallHealth: { min: 50, ideal: 85, max: 100 }
  }
};

/**
 * Corrective actions for different imbalances
 */
const CORRECTIVE_ACTIONS = {
  LOW_STOCK: 'trigger_reorder',
  HIGH_BACKLOG: 'increase_processing_rate',
  LOW_COSTING: 'queue_cost_calculation',
  HIGH_OVERDUE: 'prioritize_tasks',
  LOW_ENERGY: 'reduce_activity'
};

/**
 * Homeostasis class
 */
export class Homeostasis {
  constructor() {
    this.measurements = new Map();  // organ -> latest measurements
    this.deviations = [];           // Current imbalances
    this.corrections = [];          // Active corrective actions
    this.history = [];              // Historical measurements
    this.isMonitoring = false;
    this.monitorInterval = null;

    // Connect to nervous system
    this.connectToNervousSystem();
  }

  /**
   * Connect to nervous system
   */
  connectToNervousSystem() {
    const nervous = getNervousSystem();
    nervous.registerOrgan('homeostasis', this);
  }

  /**
   * Feel signals from nervous system
   */
  feel(signal) {
    switch (signal.type) {
      case SIGNAL_TYPES.HEARTBEAT:
        // Record health measurement
        this.recordMeasurement('organism', {
          health: signal.intensity * 100,
          timestamp: Date.now()
        });
        return { acknowledged: true };

      case SIGNAL_TYPES.HUNGER:
        // Record hunger from an organ
        this.recordDeviation(signal.origin, 'hunger', signal.intensity);
        return { acknowledged: true };

      case SIGNAL_TYPES.PAIN:
        // Record pain/stress
        this.recordDeviation(signal.origin, 'pain', signal.intensity);
        return { acknowledged: true };

      default:
        return null;
    }
  }

  /**
   * Record a measurement from an organ
   */
  recordMeasurement(organ, measurement) {
    this.measurements.set(organ, {
      ...measurement,
      recordedAt: Date.now()
    });

    // Add to history
    this.history.push({
      organ,
      measurement,
      timestamp: Date.now()
    });

    // Trim history
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }

  /**
   * Record a deviation from healthy state
   */
  recordDeviation(organ, type, intensity) {
    this.deviations.push({
      organ,
      type,
      intensity,
      timestamp: Date.now(),
      resolved: false
    });

    // If deviation is significant, trigger regulation
    if (intensity >= INTENSITY.HIGH) {
      this.regulate(organ, type, intensity);
    }
  }

  /**
   * Check a value against its target range
   */
  checkRange(value, range) {
    if (value < range.min) {
      return {
        status: 'low',
        deviation: (range.min - value) / range.min,
        action: 'increase'
      };
    } else if (value > range.max) {
      return {
        status: 'high',
        deviation: (value - range.max) / range.max,
        action: 'decrease'
      };
    } else if (value >= range.ideal * 0.9 && value <= range.ideal * 1.1) {
      return {
        status: 'ideal',
        deviation: 0,
        action: 'maintain'
      };
    } else {
      return {
        status: 'acceptable',
        deviation: Math.abs(value - range.ideal) / range.ideal,
        action: 'adjust'
      };
    }
  }

  /**
   * Regulate - initiate corrective action
   */
  async regulate(organ, deviationType, intensity) {
    const action = this.determineAction(organ, deviationType, intensity);

    if (action) {
      this.corrections.push({
        organ,
        deviationType,
        action: action.type,
        initiatedAt: Date.now(),
        status: 'active'
      });

      // Emit signal about corrective action
      const nervous = getNervousSystem();
      await nervous.broadcast(new Signal(
        SIGNAL_TYPES.HEALING,
        INTENSITY.MEDIUM,
        'homeostasis',
        {
          organ,
          action: action.type,
          reason: deviationType
        }
      ));

      // Execute the action
      if (action.execute) {
        await action.execute();
      }
    }
  }

  /**
   * Determine what action to take
   */
  determineAction(organ, deviationType, intensity) {
    // Hunger signals - need resources
    if (deviationType === 'hunger') {
      if (organ === 'inventory') {
        return {
          type: CORRECTIVE_ACTIONS.LOW_STOCK,
          execute: () => this.triggerReorderCheck()
        };
      }
    }

    // Pain signals - something is wrong
    if (deviationType === 'pain') {
      if (intensity >= INTENSITY.URGENT) {
        return {
          type: CORRECTIVE_ACTIONS.LOW_ENERGY,
          execute: () => this.reduceSystemActivity()
        };
      }
    }

    // Backlog - too much pending
    if (deviationType === 'backlog') {
      return {
        type: CORRECTIVE_ACTIONS.HIGH_BACKLOG,
        execute: () => this.increaseProcessingRate()
      };
    }

    return null;
  }

  /**
   * Corrective action: Trigger reorder check
   */
  async triggerReorderCheck() {
    // This would connect to the inventory system
    // For now, emit a signal that inventory organ can respond to
    const nervous = getNervousSystem();
    await nervous.broadcast(new Signal(
      SIGNAL_TYPES.HUNGER,
      INTENSITY.MEDIUM,
      'homeostasis',
      { action: 'check_reorders' }
    ));
  }

  /**
   * Corrective action: Reduce system activity
   */
  async reduceSystemActivity() {
    // Metabolism will receive this signal
    const nervous = getNervousSystem();
    await nervous.broadcast(Signal.pain('homeostasis', INTENSITY.MEDIUM, {
      action: 'reduce_activity'
    }));
  }

  /**
   * Corrective action: Increase processing rate
   */
  async increaseProcessingRate() {
    const nervous = getNervousSystem();
    await nervous.broadcast(new Signal(
      SIGNAL_TYPES.HUNGER,
      INTENSITY.HIGH,
      'homeostasis',
      { action: 'increase_processing' }
    ));
  }

  /**
   * Start monitoring
   */
  startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitorInterval = setInterval(() => {
      this.checkBalance();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
  }

  /**
   * Check overall system balance
   */
  async checkBalance() {
    const imbalances = [];

    // Check each measurement against targets
    for (const [organ, measurement] of this.measurements) {
      const targets = TARGET_RANGES[organ];
      if (!targets) continue;

      for (const [metric, range] of Object.entries(targets)) {
        if (measurement[metric] !== undefined) {
          const check = this.checkRange(measurement[metric], range);
          if (check.status === 'low' || check.status === 'high') {
            imbalances.push({
              organ,
              metric,
              ...check,
              value: measurement[metric]
            });
          }
        }
      }
    }

    // Process imbalances
    for (const imbalance of imbalances) {
      if (imbalance.deviation > 0.2) { // 20% deviation threshold
        await this.regulate(
          imbalance.organ,
          imbalance.metric,
          Math.min(1, imbalance.deviation)
        );
      }
    }

    return imbalances;
  }

  /**
   * Get current homeostatic status
   */
  getStatus() {
    const activeDeviations = this.deviations.filter(d =>
      !d.resolved && (Date.now() - d.timestamp) < 300000 // Last 5 minutes
    );

    const activeCorrections = this.corrections.filter(c =>
      c.status === 'active'
    );

    return {
      isMonitoring: this.isMonitoring,
      measurements: Object.fromEntries(this.measurements),
      activeDeviations: activeDeviations.length,
      activeCorrections: activeCorrections.length,
      deviations: activeDeviations,
      corrections: activeCorrections,
      isBalanced: activeDeviations.length === 0
    };
  }

  /**
   * Mark a deviation as resolved
   */
  resolveDeviation(organ, type) {
    for (const deviation of this.deviations) {
      if (deviation.organ === organ && deviation.type === type && !deviation.resolved) {
        deviation.resolved = true;
        deviation.resolvedAt = Date.now();
      }
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Homeostasis instance
 */
export function getHomeostasis() {
  if (!instance) {
    instance = new Homeostasis();
  }
  return instance;
}

export default Homeostasis;
