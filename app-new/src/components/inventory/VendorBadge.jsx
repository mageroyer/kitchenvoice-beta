import PropTypes from 'prop-types';
import styles from '../../styles/components/vendorbadge.module.css';

/**
 * VendorBadge Component
 *
 * A compact badge displaying vendor information with optional primary indicator.
 * Can be clickable to navigate to vendor details or trigger actions.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.vendor - Vendor data object (required)
 * @param {number|string} props.vendor.id - Vendor ID
 * @param {string} props.vendor.name - Vendor name
 * @param {boolean} [props.vendor.isPrimary] - Whether this is a primary/preferred vendor
 * @param {'small'|'normal'} [props.size='normal'] - Badge size
 * @param {Function} [props.onClick] - Click handler (makes badge interactive)
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered vendor badge
 *
 * @example
 * // Basic vendor badge
 * <VendorBadge vendor={{ id: 1, name: "Sysco Foods" }} />
 *
 * @example
 * // Primary vendor with star indicator
 * <VendorBadge vendor={{ id: 2, name: "US Foods", isPrimary: true }} />
 *
 * @example
 * // Clickable badge
 * <VendorBadge
 *   vendor={{ id: 3, name: "Local Farms" }}
 *   onClick={(vendor) => navigate(`/vendors/${vendor.id}`)}
 * />
 *
 * @example
 * // Small size for compact lists
 * <VendorBadge vendor={{ id: 4, name: "Beverage Co" }} size="small" />
 */
function VendorBadge({
  vendor,
  size = 'normal',
  onClick,
  className = '',
}) {
  // Handle missing or invalid vendor
  if (!vendor || !vendor.name) {
    return (
      <span className={`${styles.badge} ${styles.empty} ${styles[size]}`}>
        No vendor
      </span>
    );
  }

  const isClickable = typeof onClick === 'function';
  const isPrimary = vendor.isPrimary || vendor.isPreferred;

  // Build class names
  const badgeClasses = [
    styles.badge,
    styles[size],
    isClickable && styles.clickable,
    isPrimary && styles.primary,
    className
  ].filter(Boolean).join(' ');

  const handleClick = (e) => {
    if (isClickable) {
      e.preventDefault();
      onClick(vendor);
    }
  };

  const handleKeyDown = (e) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(vendor);
    }
  };

  // Determine element type based on clickability
  const Element = isClickable ? 'button' : 'span';

  const elementProps = isClickable
    ? {
        type: 'button',
        onClick: handleClick,
        'aria-label': `View vendor: ${vendor.name}${isPrimary ? ' (Primary)' : ''}`,
      }
    : {
        role: 'text',
      };

  return (
    <Element
      className={badgeClasses}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      {...elementProps}
    >
      {isPrimary && (
        <span className={styles.star} aria-label="Primary vendor" title="Primary vendor">
          ★
        </span>
      )}
      <span className={styles.name}>{vendor.name}</span>
    </Element>
  );
}

VendorBadge.propTypes = {
  /** Vendor data object */
  vendor: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    name: PropTypes.string.isRequired,
    isPrimary: PropTypes.bool,
    isPreferred: PropTypes.bool,
  }).isRequired,
  /** Badge size variant */
  size: PropTypes.oneOf(['small', 'normal']),
  /** Click handler - receives vendor object */
  onClick: PropTypes.func,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default VendorBadge;
