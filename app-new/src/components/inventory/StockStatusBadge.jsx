import PropTypes from 'prop-types';
import { useState, useRef, useEffect } from 'react';
import styles from '../../styles/components/stockstatusbadge.module.css';

/**
 * Stock status configuration
 * Each status has a label, icon, and description for accessibility
 */
const STATUS_CONFIG = {
  critical: {
    label: 'Critical',
    icon: '!',
    description: 'Stock is critically low and needs immediate attention',
    ariaLabel: 'Critical stock level - immediate reorder needed'
  },
  low: {
    label: 'Low',
    icon: '↓',
    description: 'Stock is running low and should be reordered soon',
    ariaLabel: 'Low stock level - reorder recommended'
  },
  warning: {
    label: 'Warning',
    icon: '⚠',
    description: 'Stock is below optimal levels',
    ariaLabel: 'Warning stock level - monitor closely'
  },
  ok: {
    label: 'OK',
    icon: '✓',
    description: 'Stock levels are healthy',
    ariaLabel: 'Stock level is OK'
  }
};

/**
 * StockStatusBadge Component
 *
 * A compact status indicator for inventory stock levels.
 * Displays an icon with optional text label and tooltip.
 * Uses both color and icon to ensure accessibility.
 *
 * @component
 * @param {Object} props - Component props
 * @param {'critical'|'low'|'warning'|'ok'} props.status - Stock status (required)
 * @param {boolean} [props.showText=false] - Show text label alongside icon
 * @param {'small'|'normal'} [props.size='normal'] - Badge size
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.pulse=false] - Enable pulse animation for critical
 * @returns {JSX.Element} Rendered status badge
 *
 * @example
 * // Icon only (default)
 * <StockStatusBadge status="critical" />
 *
 * @example
 * // With text label
 * <StockStatusBadge status="low" showText />
 *
 * @example
 * // Small size for compact lists
 * <StockStatusBadge status="ok" size="small" />
 *
 * @example
 * // Critical with pulse animation
 * <StockStatusBadge status="critical" pulse />
 */
function StockStatusBadge({
  status,
  showText = false,
  size = 'normal',
  className = '',
  pulse = false,
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const badgeRef = useRef(null);
  const tooltipRef = useRef(null);

  // Get status configuration
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.ok;

  // Calculate tooltip position
  useEffect(() => {
    if (showTooltip && badgeRef.current && tooltipRef.current) {
      const badgeRect = badgeRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      // Position above the badge, centered
      let top = -tooltipRect.height - 8;
      let left = (badgeRect.width - tooltipRect.width) / 2;

      // Adjust if tooltip goes off-screen left
      if (badgeRect.left + left < 8) {
        left = -badgeRect.left + 8;
      }

      // Adjust if tooltip goes off-screen right
      if (badgeRect.left + left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - 8 - badgeRect.left - tooltipRect.width;
      }

      setTooltipPosition({ top, left });
    }
  }, [showTooltip]);

  // Build class names
  const badgeClasses = [
    styles.badge,
    styles[status],
    styles[size],
    pulse && status === 'critical' && styles.pulse,
    className
  ].filter(Boolean).join(' ');

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setShowTooltip(false);
  const handleFocus = () => setShowTooltip(true);
  const handleBlur = () => setShowTooltip(false);

  return (
    <span
      ref={badgeRef}
      className={badgeClasses}
      role="status"
      aria-label={config.ariaLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={0}
    >
      <span className={styles.icon} aria-hidden="true">
        {config.icon}
      </span>
      {showText && (
        <span className={styles.text}>{config.label}</span>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <span
          ref={tooltipRef}
          className={styles.tooltip}
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
          role="tooltip"
        >
          <span className={styles.tooltipTitle}>{config.label}</span>
          <span className={styles.tooltipDesc}>{config.description}</span>
        </span>
      )}
    </span>
  );
}

StockStatusBadge.propTypes = {
  /** Stock status level */
  status: PropTypes.oneOf(['critical', 'low', 'warning', 'ok']).isRequired,
  /** Show text label alongside icon */
  showText: PropTypes.bool,
  /** Badge size variant */
  size: PropTypes.oneOf(['small', 'normal']),
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Enable pulse animation for critical status */
  pulse: PropTypes.bool,
};

export default StockStatusBadge;
