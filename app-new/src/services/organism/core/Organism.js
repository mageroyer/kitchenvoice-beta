/**
 * Organism - The living system core
 *
 * This is the root of the SmartCookBook organism. It:
 * - Creates and coordinates all systems
 * - Manages the heartbeat cycle
 * - Provides the main interface for interacting with the organism
 *
 * "A kitchen is not a collection of separate systems. It's a living thing."
 * - PHILOSOPHY.md
 *
 * @module organism/core/Organism
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getNervousSystem, NervousSystem } from '../systems/NervousSystem';
import { getMetabolism, Metabolism, METABOLIC_STATE } from '../systems/Metabolism';
import { getHomeostasis, Homeostasis } from '../systems/Homeostasis';
import { getImmuneSystem, ImmuneSystem } from '../systems/ImmuneSystem';

/**
 * Organism states
 */
export const ORGANISM_STATE = {
  DORMANT: 'dormant',      // Not started
  AWAKENING: 'awakening',  // Starting up
  ALIVE: 'alive',          // Running normally
  STRESSED: 'stressed',    // Under pressure
  HEALING: 'healing',      // Recovering from issues
  DYING: 'dying',          // Shutting down
  DEAD: 'dead'             // Stopped
};

/**
 * Heartbeat intervals
 */
const HEARTBEAT_INTERVAL = 60000;  // 1 minute
const FAST_HEARTBEAT = 30000;      // 30 seconds when stressed

/**
 * The Organism class
 */
export class Organism {
  constructor() {
    this.state = ORGANISM_STATE.DORMANT;
    this.birthTime = null;
    this.heartbeatInterval = null;
    this.heartbeatCount = 0;

    // Core systems (singletons)
    this.nervous = null;
    this.metabolism = null;
    this.homeostasis = null;
    this.immune = null;

    // Organs registry
    this.organs = new Map();

    // Health tracking
    this.health = 100;
    this.healthHistory = [];

    // Event callbacks
    this.callbacks = {
      onHeartbeat: [],
      onStateChange: [],
      onHealthChange: [],
      onAlert: []
    };
  }

  /**
   * Awaken the organism
   */
  async awaken() {
    if (this.state !== ORGANISM_STATE.DORMANT) {
      console.warn('[Organism] Already awakened');
      return;
    }

    this.setState(ORGANISM_STATE.AWAKENING);
    this.birthTime = Date.now();

    try {
      // Initialize core systems
      this.nervous = getNervousSystem();
      this.metabolism = getMetabolism();
      this.homeostasis = getHomeostasis();
      this.immune = getImmuneSystem();

      // Start nervous system
      this.nervous.start();

      // Register self as the heart
      this.nervous.registerOrgan('heart', this);

      // Start homeostasis monitoring
      this.homeostasis.startMonitoring();

      // Begin heartbeat
      this.startHeartbeat();

      // We're alive
      this.setState(ORGANISM_STATE.ALIVE);

      // First heartbeat
      await this.heartbeat();

      return true;
    } catch (error) {
      console.error('[Organism] Failed to awaken:', error);
      this.setState(ORGANISM_STATE.DEAD);
      return false;
    }
  }

  /**
   * Handle signals from nervous system (this is the heart)
   */
  feel(signal) {
    // The heart feels everything
    switch (signal.type) {
      case SIGNAL_TYPES.PAIN:
        this.onPainSignal(signal);
        break;

      case SIGNAL_TYPES.CRITICAL:
        this.onCriticalSignal(signal);
        break;

      case SIGNAL_TYPES.HUNGER:
        // Multiple hunger signals = organism needs attention
        if (signal.intensity >= INTENSITY.HIGH) {
          this.adjustHealth(-5);
        }
        break;

      case SIGNAL_TYPES.SATIATION:
        // Resources received = healthier
        this.adjustHealth(2);
        break;

      case SIGNAL_TYPES.HEALING:
        // Healing in progress
        this.adjustHealth(1);
        break;
    }

    return { heartAcknowledged: true };
  }

  /**
   * Handle pain signals
   */
  onPainSignal(signal) {
    if (signal.intensity >= INTENSITY.URGENT) {
      this.setState(ORGANISM_STATE.STRESSED);
      this.adjustHealth(-10);
    } else if (signal.intensity >= INTENSITY.MEDIUM) {
      this.adjustHealth(-3);
    }
  }

  /**
   * Handle critical signals
   */
  onCriticalSignal(signal) {
    console.error('[Organism] ⚠️ CRITICAL:', signal.data);
    this.setState(ORGANISM_STATE.STRESSED);
    this.adjustHealth(-15);

    // Trigger alert callbacks
    for (const callback of this.callbacks.onAlert) {
      callback(signal);
    }
  }

  /**
   * Adjust organism health
   */
  adjustHealth(delta) {
    const oldHealth = this.health;
    this.health = Math.max(0, Math.min(100, this.health + delta));

    if (this.health !== oldHealth) {
      this.healthHistory.push({
        health: this.health,
        delta,
        timestamp: Date.now()
      });

      // Trim history
      if (this.healthHistory.length > 1000) {
        this.healthHistory = this.healthHistory.slice(-500);
      }

      // Notify callbacks
      for (const callback of this.callbacks.onHealthChange) {
        callback(this.health, oldHealth);
      }

      // State transitions based on health
      if (this.health < 30 && this.state === ORGANISM_STATE.ALIVE) {
        this.setState(ORGANISM_STATE.HEALING);
      } else if (this.health >= 50 && this.state === ORGANISM_STATE.HEALING) {
        this.setState(ORGANISM_STATE.ALIVE);
      }
    }
  }

  /**
   * Start heartbeat cycle
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    const interval = this.state === ORGANISM_STATE.STRESSED
      ? FAST_HEARTBEAT
      : HEARTBEAT_INTERVAL;

    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, interval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Perform a heartbeat - the organism's pulse
   */
  async heartbeat() {
    this.heartbeatCount++;

    // Collect health from all organs
    const organHealths = [];

    for (const [name, organ] of this.organs) {
      try {
        const pulse = await organ.pulse?.();
        if (pulse && typeof pulse.health === 'number') {
          organHealths.push(pulse.health);
        }
      } catch (error) {
        console.error(`[Organism] Organ ${name} failed to pulse:`, error);
        organHealths.push(0);
      }
    }

    // Calculate overall health
    if (organHealths.length > 0) {
      const avgOrganHealth = organHealths.reduce((a, b) => a + b, 0) / organHealths.length;
      // Blend with current health (smooth transitions)
      this.health = Math.round(this.health * 0.3 + avgOrganHealth * 0.7);
    }

    // Emit heartbeat signal
    const heartbeatSignal = Signal.heartbeat(this.health, {
      heartbeatCount: this.heartbeatCount,
      organCount: this.organs.size,
      uptime: Date.now() - this.birthTime,
      state: this.state
    });

    await this.nervous.broadcast(heartbeatSignal);

    // Notify callbacks
    for (const callback of this.callbacks.onHeartbeat) {
      callback(this.getVitals());
    }

    // Recovery if healthy enough
    if (this.state === ORGANISM_STATE.STRESSED && this.health >= 70) {
      this.setState(ORGANISM_STATE.ALIVE);
    }
  }

  /**
   * Set organism state
   */
  setState(newState) {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;

    // Adjust heartbeat rate
    if (this.heartbeatInterval) {
      this.stopHeartbeat();
      this.startHeartbeat();
    }

    // Notify callbacks
    for (const callback of this.callbacks.onStateChange) {
      callback(newState, oldState);
    }
  }

  /**
   * Register an organ
   */
  registerOrgan(name, organ) {
    this.organs.set(name, organ);

    // Connect organ to nervous system
    if (organ.connect) {
      organ.connect();
    } else {
      this.nervous.registerOrgan(name, organ);
    }
  }

  /**
   * Unregister an organ
   */
  unregisterOrgan(name) {
    const organ = this.organs.get(name);
    if (organ) {
      if (organ.disconnect) {
        organ.disconnect();
      }
      this.organs.delete(name);
    }
  }

  /**
   * Get organism vitals
   */
  getVitals() {
    return {
      state: this.state,
      health: this.health,
      healthStatus: this.getHealthStatus(),
      heartbeatCount: this.heartbeatCount,
      uptime: this.birthTime ? Date.now() - this.birthTime : 0,
      organCount: this.organs.size,
      organs: Array.from(this.organs.keys()),
      metabolism: this.metabolism?.getStatus() || null,
      homeostasis: this.homeostasis?.getStatus() || null,
      immune: this.immune?.getStatus() || null,
      nervous: this.nervous?.getMetrics() || null
    };
  }

  /**
   * Get health status string
   */
  getHealthStatus() {
    if (this.health >= 80) return 'healthy';
    if (this.health >= 50) return 'attention';
    if (this.health >= 20) return 'critical';
    return 'dying';
  }

  /**
   * Feed the organism (process incoming data)
   */
  async ingest(data, type) {
    // Immune system scans incoming data
    const scanResult = this.immune.scan(data, type);

    if (scanResult.length > 0) {
      // Attempt healing
      const healResult = await this.immune.heal(data, type);

      if (healResult.quarantined) {
        console.warn('[Organism] Data quarantined:', type);
        return { accepted: false, quarantined: true, data };
      }

      // Use healed data
      data = healResult.entity;
    }

    // Process through metabolism
    return new Promise((resolve) => {
      this.metabolism.queue(data, type, async (item) => {
        // Emit flow signal
        await this.nervous.broadcast(Signal.flowStart(type, { item }));

        // Processing would happen here (delegated to specific organs)
        // For now, just signal completion
        await this.nervous.broadcast(Signal.flowComplete(type, { item }));

        resolve({ accepted: true, data: item });
      });
    });
  }

  /**
   * Register callbacks
   */
  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  /**
   * Remove callback
   */
  off(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Put the organism to sleep (pause activity)
   */
  sleep() {
    this.setState(ORGANISM_STATE.DORMANT);
    this.stopHeartbeat();
    this.metabolism?.setState?.(METABOLIC_STATE.DORMANT);
    this.homeostasis?.stopMonitoring();
  }

  /**
   * Shutdown the organism
   */
  async shutdown() {
    this.setState(ORGANISM_STATE.DYING);

    // Stop heartbeat
    this.stopHeartbeat();

    // Disconnect all organs
    for (const [name, organ] of this.organs) {
      try {
        await organ.shutdown?.();
      } catch (error) {
        console.error(`[Organism] Error shutting down ${name}:`, error);
      }
    }
    this.organs.clear();

    // Stop systems
    this.homeostasis?.stopMonitoring();
    this.nervous?.stop();

    this.setState(ORGANISM_STATE.DEAD);
  }
}

// Singleton instance
let organism = null;

/**
 * Get the singleton Organism instance
 */
export function getOrganism() {
  if (!organism) {
    organism = new Organism();
  }
  return organism;
}

/**
 * Awaken the organism (convenience function)
 */
export async function awakenOrganism() {
  const org = getOrganism();
  if (org.state === ORGANISM_STATE.DORMANT) {
    await org.awaken();
  }
  return org;
}

export default Organism;
