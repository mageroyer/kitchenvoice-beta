import PropTypes from 'prop-types';
import styles from '../../styles/components/badge.module.css';

/**
 * Badge Component
 *
 * A small status indicator or label badge for displaying counts, statuses, or categories.
 * Supports various color variants, sizes, and can render as a simple dot indicator.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} [props.children] - Badge content (text, number, or icon)
 * @param {'primary'|'secondary'|'success'|'warning'|'danger'|'info'} [props.variant='primary'] - Color variant
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Badge size
 * @param {boolean} [props.dot=false] - Render as dot indicator (ignores children)
 * @param {boolean} [props.outlined=false] - Use outlined style instead of filled
 * @param {boolean} [props.rounded=false] - Fully rounded pill shape
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered badge element
 *
 * @example
 * // Category badge
 * <Badge variant="primary">Main Course</Badge>
 *
 * @example
 * // Notification count badge
 * <Badge variant="danger" rounded size="small">5</Badge>
 *
 * @example
 * // Status dot indicator
 * <Badge variant="success" dot />
 *
 * @example
 * // Outlined badge for tags
 * <Badge variant="info" outlined rounded>
 *   Vegetarian
 * </Badge>
 *
 * @example
 * // Multiple badges for recipe tags
 * <div className="flex gap-2">
 *   <Badge variant="success" size="small">Quick</Badge>
 *   <Badge variant="warning" size="small">Spicy</Badge>
 *   <Badge variant="info" size="small">Gluten-Free</Badge>
 * </div>
 */
function Badge({
  children,
  variant = 'primary',
  size = 'medium',
  dot = false,
  outlined = false,
  rounded = false,
  className = '',
}) {
  const badgeClasses = [
    styles.badge,
    styles[variant],
    styles[size],
    dot && styles.dot,
    outlined && styles.outlined,
    rounded && styles.rounded,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={badgeClasses}>{!dot && children}</span>;
}

Badge.propTypes = {
  /** Badge content (text, number, icon) */
  children: PropTypes.node,
  /** Badge color variant */
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'warning', 'danger', 'info']),
  /** Badge size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Show as dot badge (ignores children) */
  dot: PropTypes.bool,
  /** Outlined style instead of filled */
  outlined: PropTypes.bool,
  /** Fully rounded (pill shape) */
  rounded: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Badge;
