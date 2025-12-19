/**
 * InventoryAlertSummary Component
 *
 * Displays an alert banner summarizing critical and low stock items.
 * Provides quick actions to generate orders or filter by stock status.
 *
 * @module components/inventory/InventoryAlertSummary
 */

import PropTypes from 'prop-types';
import styles from '../../styles/components/inventoryalertsummary.module.css';

/**
 * Stock status filter constants
 */
const STOCK_STATUS = {
  CRITICAL: 'critical',
  LOW: 'low',
};

/**
 * InventoryAlertSummary - Alert banner for stock level warnings
 *
 * @component
 * @param {Object} props - Component props
 * @param {number} props.criticalCount - Number of items at critical stock level
 * @param {number} props.lowCount - Number of items at low stock level
 * @param {Function} [props.onGenerateOrders] - Callback when generate orders button is clicked
 * @param {Function} [props.onFilterStatus] - Callback when a status count is clicked, receives status string
 * @returns {JSX.Element|null} Alert banner or null if no alerts
 *
 * @example
 * // Basic usage
 * <InventoryAlertSummary
 *   criticalCount={3}
 *   lowCount={7}
 *   onGenerateOrders={() => console.log('Generate orders')}
 *   onFilterStatus={(status) => console.log('Filter by:', status)}
 * />
 *
 * @example
 * // No alerts - renders nothing
 * <InventoryAlertSummary criticalCount={0} lowCount={0} />
 */
function InventoryAlertSummary({
  criticalCount = 0,
  lowCount = 0,
  onGenerateOrders,
  onFilterStatus,
}) {
  const totalAlerts = criticalCount + lowCount;

  // Hide banner when no alerts
  if (totalAlerts === 0) {
    return null;
  }

  /**
   * Handle click on critical count
   */
  const handleCriticalClick = () => {
    if (onFilterStatus && criticalCount > 0) {
      onFilterStatus(STOCK_STATUS.CRITICAL);
    }
  };

  /**
   * Handle click on low count
   */
  const handleLowClick = () => {
    if (onFilterStatus && lowCount > 0) {
      onFilterStatus(STOCK_STATUS.LOW);
    }
  };

  /**
   * Handle keyboard navigation for count buttons
   * @param {KeyboardEvent} event - Keyboard event
   * @param {Function} handler - Click handler to invoke
   */
  const handleKeyDown = (event, handler) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };

  // Determine severity for styling
  const hasCritical = criticalCount > 0;
  const bannerClass = `${styles.banner} ${hasCritical ? styles.critical : styles.warning}`;

  return (
    <div
      className={bannerClass}
      role="alert"
      aria-live="polite"
      aria-label={`Inventory alert: ${criticalCount} critical items, ${lowCount} low stock items`}
    >
      <div className={styles.content}>
        {/* Alert Icon */}
        <div className={styles.iconWrapper} aria-hidden="true">
          {hasCritical ? (
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        {/* Alert Message */}
        <div className={styles.message}>
          <span className={styles.title}>
            {hasCritical ? 'Stock Alert' : 'Low Stock Notice'}
          </span>
          <span className={styles.counts}>
            {criticalCount > 0 && (
              <button
                type="button"
                className={`${styles.countButton} ${styles.criticalCount}`}
                onClick={handleCriticalClick}
                onKeyDown={(e) => handleKeyDown(e, handleCriticalClick)}
                aria-label={`${criticalCount} critical items. Click to filter.`}
              >
                <span className={styles.countValue}>{criticalCount}</span>
                <span className={styles.countLabel}>critical</span>
              </button>
            )}
            {criticalCount > 0 && lowCount > 0 && (
              <span className={styles.separator} aria-hidden="true">•</span>
            )}
            {lowCount > 0 && (
              <button
                type="button"
                className={`${styles.countButton} ${styles.lowCount}`}
                onClick={handleLowClick}
                onKeyDown={(e) => handleKeyDown(e, handleLowClick)}
                aria-label={`${lowCount} low stock items. Click to filter.`}
              >
                <span className={styles.countValue}>{lowCount}</span>
                <span className={styles.countLabel}>low stock</span>
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Actions */}
      {onGenerateOrders && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.generateButton}
            onClick={onGenerateOrders}
            aria-label="Generate purchase orders for low stock items"
          >
            <svg
              className={styles.buttonIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Generate Orders
          </button>
        </div>
      )}
    </div>
  );
}

InventoryAlertSummary.propTypes = {
  /** Number of items at critical stock level */
  criticalCount: PropTypes.number,
  /** Number of items at low stock level */
  lowCount: PropTypes.number,
  /** Callback when generate orders button is clicked */
  onGenerateOrders: PropTypes.func,
  /** Callback when a status count is clicked, receives status string ('critical' or 'low') */
  onFilterStatus: PropTypes.func,
};

export default InventoryAlertSummary;
