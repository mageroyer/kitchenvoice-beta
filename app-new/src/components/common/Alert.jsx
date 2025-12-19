import PropTypes from 'prop-types';
import Button from './Button';
import styles from '../../styles/components/alert.module.css';

/**
 * Alert Component
 *
 * A notification alert/toast message with semantic color variants and optional dismiss functionality.
 * Includes default icons per variant that can be customized.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Alert message content
 * @param {string} [props.title] - Optional bold title above the message
 * @param {'success'|'info'|'warning'|'danger'} [props.variant='info'] - Color/semantic variant
 * @param {boolean} [props.dismissible=false] - Show dismiss/close button
 * @param {Function} [props.onDismiss] - Handler called when dismiss button is clicked
 * @param {boolean} [props.show=true] - Control visibility (returns null when false)
 * @param {string} [props.icon] - Custom icon (emoji or text) to override default
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element|null} Rendered alert or null if show is false
 *
 * @example
 * // Success alert after saving
 * <Alert variant="success" title="Saved!">
 *   Your recipe has been saved successfully.
 * </Alert>
 *
 * @example
 * // Dismissible warning alert
 * <Alert
 *   variant="warning"
 *   dismissible
 *   onDismiss={() => setShowWarning(false)}
 *   show={showWarning}
 * >
 *   You have unsaved changes that will be lost.
 * </Alert>
 *
 * @example
 * // Error alert with custom icon
 * <Alert variant="danger" icon="🚫" title="Connection Error">
 *   Unable to connect to the server. Please check your internet connection.
 * </Alert>
 *
 * @example
 * // Info alert for tips
 * <Alert variant="info">
 *   Tip: Use voice input to quickly add ingredients by speaking.
 * </Alert>
 */
function Alert({
  children,
  title,
  variant = 'info',
  dismissible = false,
  onDismiss = () => {},
  show = true,
  icon,
  className = '',
}) {
  if (!show) return null;

  const defaultIcons = {
    success: '✅',
    info: 'ℹ️',
    warning: '⚠️',
    danger: '❌',
  };

  const displayIcon = icon || defaultIcons[variant];

  const alertClasses = [styles.alert, styles[variant], className].filter(Boolean).join(' ');

  return (
    <div className={alertClasses} role="alert">
      <div className={styles.content}>
        {displayIcon && <span className={styles.icon}>{displayIcon}</span>}
        <div className={styles.message}>
          {title && <div className={styles.title}>{title}</div>}
          <div className={styles.body}>{children}</div>
        </div>
      </div>
      {dismissible && (
        <Button variant="ghost" size="small" onClick={onDismiss} className={styles.closeButton}>
          ✕
        </Button>
      )}
    </div>
  );
}

Alert.propTypes = {
  /** Alert content */
  children: PropTypes.node.isRequired,
  /** Alert title (optional) */
  title: PropTypes.string,
  /** Alert type/color variant */
  variant: PropTypes.oneOf(['success', 'info', 'warning', 'danger']),
  /** Show close button */
  dismissible: PropTypes.bool,
  /** Dismiss handler */
  onDismiss: PropTypes.func,
  /** Control visibility */
  show: PropTypes.bool,
  /** Custom icon (emoji or text) */
  icon: PropTypes.string,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Alert;
