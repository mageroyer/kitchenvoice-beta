/**
 * OrganCard Component
 *
 * Displays a single organ's health and statistics
 * Part of the Heartbeat Dashboard's organism visualization
 *
 * @module components/heartbeat/OrganCard
 */

import React from 'react';
import styles from '../../styles/pages/heartbeatdashboard.module.css';

/**
 * Get the appropriate CSS class for health status
 * @param {string} status - Health status (healthy, attention, critical)
 * @returns {string} CSS class name
 */
function getHealthClass(status) {
  switch (status) {
    case 'healthy': return styles.healthy;
    case 'attention': return styles.attention;
    case 'critical': return styles.critical;
    default: return '';
  }
}

/**
 * Get the fill class for health factor bars
 * @param {number} value - Factor value (0-100)
 * @returns {string} CSS class name
 */
function getFactorFillClass(value) {
  if (value >= 70) return styles.high;
  if (value >= 40) return styles.medium;
  return styles.low;
}

/**
 * Get pulse message style based on content
 * @param {string} message - Pulse message text
 * @returns {string} CSS class name
 */
function getPulseMessageClass(message) {
  if (message.includes('Error') || message.includes('overdue')) return styles.error;
  if (message.includes('low') || message.includes('need')) return styles.warning;
  return styles.success;
}

/**
 * Format stat values for display
 * @param {string} key - Stat key
 * @param {*} value - Stat value
 * @returns {string} Formatted value
 */
function formatStatValue(key, value) {
  if (typeof value === 'number') {
    if (key.toLowerCase().includes('total') && key.toLowerCase().includes('value')) {
      return `$${value.toFixed(2)}`;
    }
    if (key.toLowerCase().includes('total') && typeof value === 'number' && value > 1000) {
      return `$${value.toFixed(2)}`;
    }
    return value.toLocaleString();
  }
  return String(value);
}

/**
 * Format stat label for display
 * @param {string} key - Stat key in camelCase
 * @returns {string} Formatted label
 */
function formatStatLabel(key) {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Get primary stats to display for each organ type
 * @param {string} organType - Type of organ (invoice, inventory, recipe, task)
 * @param {Object} stats - Full stats object
 * @returns {Array} Array of {key, value} objects for display
 */
function getPrimaryStats(organType, stats) {
  const statConfigs = {
    invoice: [
      { key: 'todayCount', label: 'Today' },
      { key: 'weekCount', label: 'This Week' },
      { key: 'pendingCount', label: 'Pending' },
      { key: 'totalCount', label: 'Total' }
    ],
    inventory: [
      { key: 'totalItems', label: 'Total Items' },
      { key: 'healthyStock', label: 'Healthy' },
      { key: 'lowStock', label: 'Low Stock' },
      { key: 'outOfStock', label: 'Out of Stock' }
    ],
    recipe: [
      { key: 'totalRecipes', label: 'Total' },
      { key: 'costed', label: 'Costed' },
      { key: 'needsCosting', label: 'Needs Costing' },
      { key: 'complete', label: 'Complete' }
    ],
    task: [
      { key: 'active', label: 'Active' },
      { key: 'completedToday', label: 'Done Today' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'pending', label: 'Pending' }
    ]
  };

  const config = statConfigs[organType] || [];
  return config.map(({ key, label }) => ({
    key,
    label,
    value: stats[key] ?? 0
  }));
}

/**
 * OrganCard - Visual card representing one organ of the system
 *
 * @param {Object} props
 * @param {Object} props.organ - Organ data from dashboardData service
 * @param {Function} props.onClick - Click handler for navigation
 */
function OrganCard({ organ, onClick }) {
  if (!organ) return null;

  const {
    organ: organType,
    label,
    icon,
    metaphor,
    description,
    stats,
    health,
    pulseMessage,
    alerts
  } = organ;

  const healthStatus = health?.status || 'attention';
  const healthScore = health?.score ?? 0;
  const healthFactors = health?.factors || [];
  const primaryStats = getPrimaryStats(organType, stats || {});

  return (
    <div
      className={`${styles.organCard} ${getHealthClass(healthStatus)}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={`${label} organ - ${healthStatus} - ${healthScore}% health`}
    >
      {/* Header */}
      <div className={styles.organHeader}>
        <div className={styles.organTitleSection}>
          <span className={styles.organIcon} role="img" aria-hidden="true">
            {icon}
          </span>
          <div className={styles.organTitles}>
            <h3 className={styles.organLabel}>{label}</h3>
            <span className={styles.organMetaphor}>{metaphor}</span>
          </div>
        </div>
        <div className={`${styles.organHealth} ${getHealthClass(healthStatus)}`}>
          <span>{healthScore}%</span>
        </div>
      </div>

      {/* Description */}
      <p className={styles.organDescription}>{description}</p>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {primaryStats.map(({ key, label: statLabel, value }) => (
          <div key={key} className={styles.statItem}>
            <span className={styles.statValue}>{formatStatValue(key, value)}</span>
            <span className={styles.statLabel}>{statLabel}</span>
          </div>
        ))}
      </div>

      {/* Pulse Message */}
      {pulseMessage && (
        <div className={`${styles.pulseMessage} ${getPulseMessageClass(pulseMessage)}`}>
          {pulseMessage}
        </div>
      )}

      {/* Health Factors */}
      {healthFactors.length > 0 && (
        <div className={styles.healthFactors}>
          <div className={styles.factorTitle}>Health Factors</div>
          <div className={styles.factorList}>
            {healthFactors.map((factor, idx) => (
              <div key={idx} className={styles.factorItem}>
                <span className={styles.factorName}>{factor.name}</span>
                <div className={styles.factorBar}>
                  <div
                    className={`${styles.factorFill} ${getFactorFillClass(factor.value)}`}
                    style={{ width: `${factor.value}%` }}
                  />
                </div>
                <span className={styles.factorValue}>{factor.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts (for inventory) */}
      {alerts && alerts.length > 0 && (
        <div className={styles.alertsSection}>
          {alerts.slice(0, 3).map((alert, idx) => (
            <div key={idx} className={styles.alertItem}>
              <span>{alert.item}: {alert.current}/{alert.threshold}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrganCard;
