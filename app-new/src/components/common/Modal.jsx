import { useEffect, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/modal.module.css';

/**
 * Modal Component
 *
 * An overlay modal dialog with backdrop, header, body, and footer sections.
 * Handles escape key closing, backdrop click, and body scroll locking.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} [props.isOpen=false] - Whether the modal is visible
 * @param {Function} [props.onClose] - Handler called when modal should close
 * @param {string} [props.title] - Modal header title
 * @param {React.ReactNode} [props.children] - Modal body content
 * @param {React.ReactNode} [props.footer] - Modal footer content (typically buttons)
 * @param {'small'|'medium'|'large'|'fullscreen'} [props.size='medium'] - Modal size variant
 * @param {boolean} [props.closeOnEscape=true] - Close modal when Escape key is pressed
 * @param {boolean} [props.closeOnBackdrop=true] - Close modal when backdrop is clicked
 * @param {boolean} [props.showCloseButton=true] - Show X close button in header
 * @returns {JSX.Element|null} Rendered modal or null if not open
 *
 * @example
 * // Basic confirmation modal
 * <Modal
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   title="Delete Recipe?"
 *   footer={
 *     <>
 *       <Button variant="secondary" onClick={() => setShowConfirm(false)}>
 *         Cancel
 *       </Button>
 *       <Button variant="danger" onClick={handleDelete}>
 *         Delete
 *       </Button>
 *     </>
 *   }
 * >
 *   <p>Are you sure you want to delete this recipe? This action cannot be undone.</p>
 * </Modal>
 *
 * @example
 * // Large modal for forms
 * <Modal
 *   isOpen={showForm}
 *   onClose={handleClose}
 *   title="Edit Recipe"
 *   size="large"
 *   closeOnBackdrop={false}
 * >
 *   <RecipeForm recipe={recipe} onSave={handleSave} />
 * </Modal>
 *
 * @example
 * // Fullscreen modal without close button
 * <Modal
 *   isOpen={showViewer}
 *   onClose={handleClose}
 *   size="fullscreen"
 *   showCloseButton={false}
 * >
 *   <ImageViewer src={imageSrc} onClose={handleClose} />
 * </Modal>
 */
function Modal({
  isOpen = false,
  onClose = () => {},
  title,
  children,
  footer,
  size = 'medium',
  closeOnEscape = true,
  closeOnBackdrop = true,
  showCloseButton = true,
  ariaLabel,
  ariaDescribedBy,
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus management - trap focus within modal
  useEffect(() => {
    if (!isOpen) return;

    // Store currently focused element to restore later
    previousActiveElement.current = document.activeElement;

    // Focus the modal or first focusable element
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements?.length > 0) {
      // Focus close button or first focusable element
      const closeBtn = modalRef.current?.querySelector('[data-modal-close]');
      if (closeBtn) {
        closeBtn.focus();
      } else {
        focusableElements[0].focus();
      }
    }

    // Handle tab key to trap focus
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (!focusable || focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleTab);
      // Restore focus when modal closes
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Determine aria-labelledby - use title if present, otherwise ariaLabel
  const labelledBy = title ? titleId : undefined;
  const describedBy = ariaDescribedBy || (children ? descId : undefined);

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`${styles.modal} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={!title ? ariaLabel : undefined}
        aria-describedby={describedBy}
      >
        {(title || showCloseButton) && (
          <div className={styles.header}>
            {title && <h2 id={titleId} className={styles.title}>{title}</h2>}
            {showCloseButton && (
              <button
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close dialog"
                data-modal-close
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div id={describedBy ? descId : undefined} className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

Modal.propTypes = {
  /** Whether modal is visible */
  isOpen: PropTypes.bool,
  /** Close handler */
  onClose: PropTypes.func,
  /** Modal title */
  title: PropTypes.string,
  /** Modal body content */
  children: PropTypes.node,
  /** Modal footer content (buttons, etc.) */
  footer: PropTypes.node,
  /** Modal size */
  size: PropTypes.oneOf(['small', 'medium', 'large', 'fullscreen']),
  /** Close on Escape key */
  closeOnEscape: PropTypes.bool,
  /** Close on backdrop click */
  closeOnBackdrop: PropTypes.bool,
  /** Show X close button */
  showCloseButton: PropTypes.bool,
  /** Accessible label for modal when no title is provided */
  ariaLabel: PropTypes.string,
  /** ID of element that describes the modal content */
  ariaDescribedBy: PropTypes.string,
};

export default Modal;
