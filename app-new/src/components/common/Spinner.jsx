import PropTypes from 'prop-types';
import styles from '../../styles/components/spinner.module.css';

/**
 * Spinner Component
 *
 * An accessible loading spinner with multiple animation styles and sizes.
 * Can be displayed inline or as a fullscreen overlay.
 *
 * @component
 * @param {Object} props - Component props
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Spinner size
 * @param {'primary'|'secondary'|'white'} [props.color='primary'] - Spinner color theme
 * @param {'circle'|'dots'|'bars'} [props.variant='circle'] - Animation style variant
 * @param {boolean} [props.fullscreen=false] - Display as fullscreen overlay
 * @param {string} [props.label='Loading...'] - Accessible label for screen readers
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered spinner element
 *
 * @example
 * // Default circle spinner
 * <Spinner />
 *
 * @example
 * // Small spinner for buttons
 * <Button loading>
 *   <Spinner size="small" color="white" /> Saving...
 * </Button>
 *
 * @example
 * // Dots variant for content loading
 * <Spinner variant="dots" size="large" />
 *
 * @example
 * // Fullscreen loading overlay
 * {isLoading && <Spinner fullscreen label="Loading recipes..." />}
 *
 * @example
 * // Custom styled spinner
 * <Spinner
 *   variant="bars"
 *   color="secondary"
 *   size="medium"
 *   label="Processing invoice..."
 * />
 */
function Spinner({
  size = 'medium',
  color = 'primary',
  variant = 'circle',
  fullscreen = false,
  label = 'Loading...',
  className = '',
}) {
  const spinnerClasses = [
    styles.spinner,
    styles[size],
    styles[color],
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const spinnerElement = (
    <div className={spinnerClasses} role="status" aria-label={label}>
      {variant === 'circle' && <div className={styles.circle}></div>}
      {variant === 'dots' && (
        <div className={styles.dots}>
          <div className={styles.dot}></div>
          <div className={styles.dot}></div>
          <div className={styles.dot}></div>
        </div>
      )}
      {variant === 'bars' && (
        <div className={styles.bars}>
          <div className={styles.bar}></div>
          <div className={styles.bar}></div>
          <div className={styles.bar}></div>
          <div className={styles.bar}></div>
        </div>
      )}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className={styles.fullscreenOverlay}>
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
}

Spinner.propTypes = {
  /** Spinner size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Spinner color */
  color: PropTypes.oneOf(['primary', 'secondary', 'white']),
  /** Spinner animation style */
  variant: PropTypes.oneOf(['circle', 'dots', 'bars']),
  /** Show as fullscreen overlay */
  fullscreen: PropTypes.bool,
  /** Accessible label for screen readers */
  label: PropTypes.string,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Spinner;
