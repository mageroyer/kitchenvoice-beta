import PropTypes from 'prop-types';
import styles from '../../styles/components/button.module.css';

/**
 * Button Component
 *
 * A reusable button component with multiple variants, sizes, and states.
 * Supports loading state, full-width mode, and all standard button attributes.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Button content (text, icons, etc.)
 * @param {'primary'|'secondary'|'danger'|'outline'|'ghost'|'link'} [props.variant='primary'] - Visual style variant
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Button size
 * @param {boolean} [props.fullWidth=false] - Whether button should take full container width
 * @param {boolean} [props.disabled=false] - Disable button interactions
 * @param {boolean} [props.loading=false] - Show loading state (disables button)
 * @param {Function} [props.onClick] - Click event handler
 * @param {'button'|'submit'|'reset'} [props.type='button'] - HTML button type
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered button element
 *
 * @example
 * // Primary button (default)
 * <Button onClick={handleClick}>Save Recipe</Button>
 *
 * @example
 * // Danger button with loading state
 * <Button variant="danger" loading={isDeleting}>
 *   Delete Recipe
 * </Button>
 *
 * @example
 * // Full-width submit button
 * <Button type="submit" fullWidth variant="primary">
 *   Create Account
 * </Button>
 *
 * @example
 * // Small outline button
 * <Button variant="outline" size="small" onClick={onCancel}>
 *   Cancel
 * </Button>
 */
function Button({
  children,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  onClick = () => {},
  type = 'button',
  className = '',
  ...props
}) {
  const buttonClasses = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    loading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
}

Button.propTypes = {
  /** Button content */
  children: PropTypes.node.isRequired,
  /** Button style variant */
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'outline', 'ghost', 'link']),
  /** Button size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Make button full width */
  fullWidth: PropTypes.bool,
  /** Disable button */
  disabled: PropTypes.bool,
  /** Show loading spinner */
  loading: PropTypes.bool,
  /** Click handler */
  onClick: PropTypes.func,
  /** Button type */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Button;
