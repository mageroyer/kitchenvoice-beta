/**
 * ImmuneSystem - Detects and heals anomalies
 *
 * Unlike traditional validation (reject bad input), the immune system:
 * - Detects threats and anomalies
 * - Attempts to heal when possible
 * - Quarantines what can't be healed
 * - Learns from past threats
 *
 * @module organism/systems/ImmuneSystem
 */

import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getNervousSystem } from './NervousSystem';

/**
 * Threat types
 */
export const THREAT_TYPES = {
  INVALID_DATA: 'invalid_data',
  MISSING_REQUIRED: 'missing_required',
  OUT_OF_RANGE: 'out_of_range',
  SUSPICIOUS_PATTERN: 'suspicious_pattern',
  DUPLICATE: 'duplicate',
  CORRUPTED: 'corrupted',
  STALE: 'stale',
  INCONSISTENT: 'inconsistent'
};

/**
 * Threat severity levels
 */
export const SEVERITY = {
  LOW: 1,      // Can be ignored or auto-fixed
  MEDIUM: 2,   // Should be addressed
  HIGH: 3,     // Requires attention
  CRITICAL: 4  // Immediate action required
};

/**
 * ImmuneSystem class
 */
export class ImmuneSystem {
  constructor() {
    this.knownThreats = new Map();     // Threat signatures we've seen
    this.quarantine = [];               // Items that couldn't be healed
    this.healingLog = [];               // Record of healed items
    this.activeScans = new Set();       // Currently scanning
    this.rules = [];                    // Detection rules

    // Initialize default rules
    this.initializeRules();

    // Connect to nervous system
    this.connectToNervousSystem();
  }

  /**
   * Connect to nervous system
   */
  connectToNervousSystem() {
    const nervous = getNervousSystem();
    nervous.registerOrgan('immune', this);
  }

  /**
   * Feel signals from nervous system
   */
  feel(signal) {
    if (signal.type === SIGNAL_TYPES.PAIN) {
      // Investigate pain signals
      this.investigatePain(signal);
      return { response: 'investigating' };
    }
    return null;
  }

  /**
   * Initialize default detection rules
   */
  initializeRules() {
    // Invoice rules
    this.addRule({
      name: 'invoice_missing_total',
      type: THREAT_TYPES.MISSING_REQUIRED,
      severity: SEVERITY.HIGH,
      target: 'invoice',
      detect: (entity) => !entity.total && entity.total !== 0,
      heal: (entity) => {
        // Try to calculate from line items
        if (entity.lineItems && entity.lineItems.length > 0) {
          entity.total = entity.lineItems.reduce((sum, item) =>
            sum + (item.lineTotal || item.total || 0), 0
          );
          return { healed: true, field: 'total', value: entity.total };
        }
        return { healed: false, reason: 'No line items to calculate from' };
      }
    });

    this.addRule({
      name: 'invoice_negative_total',
      type: THREAT_TYPES.OUT_OF_RANGE,
      severity: SEVERITY.MEDIUM,
      target: 'invoice',
      detect: (entity) => entity.total < 0,
      heal: (entity) => {
        // Could be a credit memo - mark it
        entity.isCredit = true;
        entity.total = Math.abs(entity.total);
        return { healed: true, note: 'Converted to credit memo' };
      }
    });

    // Inventory rules
    this.addRule({
      name: 'inventory_negative_stock',
      type: THREAT_TYPES.OUT_OF_RANGE,
      severity: SEVERITY.HIGH,
      target: 'inventory',
      detect: (entity) => entity.currentStock < 0,
      heal: (entity) => {
        // Can't have negative stock - set to 0 and flag
        entity.currentStock = 0;
        entity.needsAudit = true;
        return { healed: true, field: 'currentStock', note: 'Set to 0, flagged for audit' };
      }
    });

    this.addRule({
      name: 'inventory_missing_price',
      type: THREAT_TYPES.MISSING_REQUIRED,
      severity: SEVERITY.LOW,
      target: 'inventory',
      detect: (entity) => !entity.pricePerG && !entity.pricePerUnit && !entity.pricePerML,
      heal: null // Can't auto-heal - needs invoice data
    });

    // Line item rules
    this.addRule({
      name: 'line_quantity_zero',
      type: THREAT_TYPES.SUSPICIOUS_PATTERN,
      severity: SEVERITY.MEDIUM,
      target: 'lineItem',
      detect: (entity) => entity.quantity === 0 && entity.total > 0,
      heal: (entity) => {
        // Try to calculate from total and unit price
        if (entity.unitPrice && entity.unitPrice > 0) {
          entity.quantity = entity.total / entity.unitPrice;
          return { healed: true, field: 'quantity', value: entity.quantity };
        }
        return { healed: false, reason: 'Cannot determine quantity' };
      }
    });

    this.addRule({
      name: 'line_math_mismatch',
      type: THREAT_TYPES.INCONSISTENT,
      severity: SEVERITY.MEDIUM,
      target: 'lineItem',
      detect: (entity) => {
        if (!entity.quantity || !entity.unitPrice || !entity.total) return false;
        const calculated = entity.quantity * entity.unitPrice;
        const tolerance = 0.02; // 2% tolerance for rounding
        return Math.abs(calculated - entity.total) / entity.total > tolerance;
      },
      heal: (entity) => {
        // Trust total, recalculate unit price
        if (entity.quantity > 0) {
          entity.unitPrice = entity.total / entity.quantity;
          return { healed: true, field: 'unitPrice', value: entity.unitPrice };
        }
        return { healed: false, reason: 'Cannot fix math with zero quantity' };
      }
    });
  }

  /**
   * Add a detection rule
   */
  addRule(rule) {
    this.rules.push({
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    });
  }

  /**
   * Scan an entity for threats
   * @param {Object} entity - Entity to scan
   * @param {string} entityType - Type of entity (invoice, inventory, lineItem)
   * @returns {Array} Detected threats
   */
  scan(entity, entityType) {
    const threats = [];
    const relevantRules = this.rules.filter(r => r.target === entityType);

    for (const rule of relevantRules) {
      try {
        if (rule.detect(entity)) {
          threats.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: rule.type,
            severity: rule.severity,
            canHeal: !!rule.heal,
            entity: entity.id || entity.name || 'unknown'
          });
        }
      } catch (error) {
        console.error(`[ImmuneSystem] Rule ${rule.name} failed:`, error);
      }
    }

    // Record threats in memory
    for (const threat of threats) {
      this.recordThreat(threat);
    }

    return threats;
  }

  /**
   * Attempt to heal an entity
   * @param {Object} entity - Entity to heal
   * @param {string} entityType - Type of entity
   * @returns {Object} Healing result
   */
  async heal(entity, entityType) {
    const threats = this.scan(entity, entityType);

    if (threats.length === 0) {
      return { healthy: true, entity };
    }

    const healingResults = [];
    let allHealed = true;

    for (const threat of threats) {
      const rule = this.rules.find(r => r.id === threat.ruleId);

      if (rule && rule.heal) {
        try {
          const result = rule.heal(entity);
          healingResults.push({
            threat: threat.ruleName,
            ...result
          });

          if (!result.healed) {
            allHealed = false;
          }
        } catch (error) {
          healingResults.push({
            threat: threat.ruleName,
            healed: false,
            error: error.message
          });
          allHealed = false;
        }
      } else {
        // Can't heal this threat
        healingResults.push({
          threat: threat.ruleName,
          healed: false,
          reason: 'No healing available'
        });
        allHealed = false;
      }
    }

    // Log healing attempt
    this.healingLog.push({
      entityType,
      entityId: entity.id || entity.name,
      threats: threats.length,
      healed: healingResults.filter(r => r.healed).length,
      timestamp: Date.now()
    });

    // If couldn't heal all critical threats, quarantine
    const criticalUnhealed = threats.filter(t =>
      t.severity >= SEVERITY.HIGH &&
      !healingResults.find(r => r.threat === t.ruleName && r.healed)
    );

    if (criticalUnhealed.length > 0) {
      this.addToQuarantine(entity, entityType, criticalUnhealed);

      // Emit pain signal
      const nervous = getNervousSystem();
      await nervous.broadcast(Signal.pain('immune', INTENSITY.HIGH, {
        reason: 'quarantined_entity',
        entityType,
        threats: criticalUnhealed.length
      }));
    }

    return {
      healthy: allHealed,
      entity,
      results: healingResults,
      quarantined: criticalUnhealed.length > 0
    };
  }

  /**
   * Record a threat signature for future recognition
   */
  recordThreat(threat) {
    const signature = `${threat.type}:${threat.ruleName}`;
    const count = this.knownThreats.get(signature) || 0;
    this.knownThreats.set(signature, count + 1);
  }

  /**
   * Add entity to quarantine
   */
  addToQuarantine(entity, entityType, threats) {
    this.quarantine.push({
      entity: { ...entity },
      entityType,
      threats,
      quarantinedAt: Date.now()
    });

    console.warn(`[ImmuneSystem] Entity quarantined: ${entityType}`, threats);
  }

  /**
   * Get quarantined items
   */
  getQuarantine() {
    return [...this.quarantine];
  }

  /**
   * Release from quarantine after manual review
   */
  releaseFromQuarantine(index) {
    if (index >= 0 && index < this.quarantine.length) {
      const released = this.quarantine.splice(index, 1)[0];
      return released.entity;
    }
    return null;
  }

  /**
   * Investigate a pain signal
   */
  async investigatePain(signal) {
    // If error data provided, learn from it
    if (signal.data && signal.data.error) {
      this.learnFromError(signal.origin, signal.data.error);
    }
  }

  /**
   * Learn from an error (create new detection rules)
   */
  learnFromError(source, errorMessage) {
    // Simple pattern matching to create new rules
    // In a real system, this could use ML

    const patterns = [
      { match: /undefined|null/i, type: THREAT_TYPES.MISSING_REQUIRED },
      { match: /NaN|infinity/i, type: THREAT_TYPES.CORRUPTED },
      { match: /duplicate/i, type: THREAT_TYPES.DUPLICATE }
    ];

    for (const pattern of patterns) {
      if (pattern.match.test(errorMessage)) {
        // Could create dynamic rules here
      }
    }
  }

  /**
   * Get immune system status
   */
  getStatus() {
    // Most common threats
    const threatCounts = Array.from(this.knownThreats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      rulesCount: this.rules.length,
      quarantineCount: this.quarantine.length,
      healingAttempts: this.healingLog.length,
      recentHealing: this.healingLog.slice(-10),
      topThreats: threatCounts.map(([signature, count]) => ({
        signature,
        count
      })),
      healthyRate: this.calculateHealthyRate()
    };
  }

  /**
   * Calculate rate of successful healing
   */
  calculateHealthyRate() {
    if (this.healingLog.length === 0) return 1;

    const recent = this.healingLog.slice(-100);
    const totalThreats = recent.reduce((sum, log) => sum + log.threats, 0);
    const totalHealed = recent.reduce((sum, log) => sum + log.healed, 0);

    return totalThreats > 0 ? totalHealed / totalThreats : 1;
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton ImmuneSystem instance
 */
export function getImmuneSystem() {
  if (!instance) {
    instance = new ImmuneSystem();
  }
  return instance;
}

export default ImmuneSystem;
