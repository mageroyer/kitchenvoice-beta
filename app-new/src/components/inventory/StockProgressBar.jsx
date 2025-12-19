import PropTypes from 'prop-types';
import { useMemo } from 'react';
import styles from '../../styles/components/stockprogressbar.module.css';

/**
 * Stock status thresholds (percentage)
 */
const DEFAULT_THRESHOLDS = {
  CRITICAL: 10,
  LOW: 25,
  WARNING: 50
};

/**
 * Stock status values
 */
const STOCK_STATUS = {
  CRITICAL: 'critical',
  LOW: 'low',
  WARNING: 'warning',
  OK: 'ok'
};

/**
 * Calculate percentage from current and full values
 * @param {number} current - Current stock level
 * @param {number} full - Full stock level
 * @returns {number} Percentage (0-100, capped)
 */
function calculatePercentage(current, full) {
  if (!full || full <= 0) {
    return current > 0 ? 100 : 0;
  }
  const percent = (current / full) * 100;
  return Math.min(Math.max(0, Math.round(percent)), 100);
}

/**
 * Determine stock status based on percentage and threshold
 * @param {number} percentage - Stock percentage
 * @param {number} threshold - Low stock threshold
 * @returns {string} Status: 'critical', 'low', 'warning', or 'ok'
 */
function getStockStatus(percentage, threshold = DEFAULT_THRESHOLDS.LOW) {
  if (percentage <= DEFAULT_THRESHOLDS.CRITICAL) {
    return STOCK_STATUS.CRITICAL;
  }
  if (percentage <= threshold) {
    return STOCK_STATUS.LOW;
  }
  if (percentage <= DEFAULT_THRESHOLDS.WARNING) {
    return STOCK_STATUS.WARNING;
  }
  return STOCK_STATUS.OK;
}

/**
 * StockProgressBar Component
 *
 * A visual progress bar for displaying inventory stock levels.
 * Automatically colors based on stock status (critical/low/warning/ok).
 *
 * @component
 * @param {Object} props - Component props
 * @param {number} props.current - Current stock level (required)
 * @param {number} props.full - Full stock level (required)
 * @param {number} [props.threshold=25] - Low stock warning threshold (percentage)
 * @param {string} props.unit - Unit of measurement (required)
 * @param {'compact'|'normal'} [props.size='normal'] - Bar size variant
 * @param {boolean} [props.showLabel=true] - Show percentage and quantity labels
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {string} [props.ariaLabel] - Custom aria-label for accessibility
 * @returns {JSX.Element} Rendered progress bar
 *
 * @example
 * // Normal stock display
 * <StockProgressBar current={15} full={20} unit="kg" />
 *
 * @example
 * // Low stock warning
 * <StockProgressBar current={3} full={20} unit="lbs" threshold={20} />
 *
 * @example
 * // Compact mode for lists
 * <StockProgressBar current={8} full={10} unit="ea" size="compact" />
 *
 * @example
 * // Without labels
 * <StockProgressBar current={5} full={10} unit="boxes" showLabel={false} />
 */
function StockProgressBar({
  current,
  full,
  threshold = DEFAULT_THRESHOLDS.LOW,
  unit,
  size = 'normal',
  showLabel = true,
  className = '',
  ariaLabel,
}) {
  // Normalize values - handle null, undefined, negative
  const normalizedCurrent = Math.max(0, Number(current) || 0);
  const normalizedFull = Math.max(0, Number(full) || 0);

  // Calculate percentage and status
  const percentage = useMemo(
    () => calculatePercentage(normalizedCurrent, normalizedFull),
    [normalizedCurrent, normalizedFull]
  );

  const status = useMemo(
    () => getStockStatus(percentage, threshold),
    [percentage, threshold]
  );

  // Format quantity display
  const quantityLabel = useMemo(() => {
    const formattedCurrent = Number.isInteger(normalizedCurrent)
      ? normalizedCurrent
      : normalizedCurrent.toFixed(1);
    const formattedFull = Number.isInteger(normalizedFull)
      ? normalizedFull
      : normalizedFull.toFixed(1);
    return `${formattedCurrent}/${formattedFull} ${unit}`;
  }, [normalizedCurrent, normalizedFull, unit]);

  // Build class names
  const containerClasses = [
    styles.container,
    styles[size],
    className
  ].filter(Boolean).join(' ');

  const fillClasses = [
    styles.fill,
    styles[status]
  ].filter(Boolean).join(' ');

  // Accessibility label
  const accessibleLabel = ariaLabel ||
    `Stock level: ${percentage}% (${quantityLabel}). Status: ${status}`;

  return (
    <div
      className={containerClasses}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={accessibleLabel}
    >
      {showLabel && (
        <div className={styles.labels}>
          <span className={styles.percentage}>{percentage}%</span>
          <span className={styles.quantity}>{quantityLabel}</span>
        </div>
      )}
      <div className={styles.track}>
        <div
          className={fillClasses}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && size !== 'compact' && (
        <span className={`${styles.statusBadge} ${styles[status]}`}>
          {status === STOCK_STATUS.CRITICAL && 'Critical'}
          {status === STOCK_STATUS.LOW && 'Low'}
          {status === STOCK_STATUS.WARNING && 'Warning'}
          {status === STOCK_STATUS.OK && 'OK'}
        </span>
      )}
    </div>
  );
}

StockProgressBar.propTypes = {
  /** Current stock level */
  current: PropTypes.number.isRequired,
  /** Full stock level (100%) */
  full: PropTypes.number.isRequired,
  /** Low stock warning threshold (percentage, default 25) */
  threshold: PropTypes.number,
  /** Unit of measurement */
  unit: PropTypes.string.isRequired,
  /** Size variant */
  size: PropTypes.oneOf(['compact', 'normal']),
  /** Show percentage and quantity labels */
  showLabel: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Custom aria-label for accessibility */
  ariaLabel: PropTypes.string,
};

export default StockProgressBar;
