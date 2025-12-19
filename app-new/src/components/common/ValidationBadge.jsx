/**
 * ValidationBadge Component
 *
 * A clickable badge that shows validation status for ingredients.
 * Shows icon + tooltip, and opens a popover with details when clicked.
 * Supports "fix mode" for resolving validation issues inline.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import styles from '../../styles/components/validationbadge.module.css';

// Issue types that can be fixed by the modal (inventory-side issues)
const MODAL_FIXABLE_ISSUES = [
  'unit_mismatch',
  'unit_missing_inventory',
  'inventory_not_found',
];

// Issue types that must be fixed inline (ingredient-side issues)
const INLINE_FIXABLE_ISSUES = [
  'quantity_missing',
  'quantity_invalid',
  'unit_missing_ingredient',
];

/**
 * @param {Object} props
 * @param {Object} props.badge - Badge info from getValidationBadge()
 * @param {Function} props.onAction - Called with (action, context) when user takes action
 * @param {boolean} props.disabled - Disable interactions
 */
function ValidationBadge({ badge, onAction, disabled = false }) {
  const [showPopover, setShowPopover] = useState(false);
  const badgeRef = useRef(null);
  const popoverRef = useRef(null);

  // Categorize issues
  const { modalFixable, inlineFixable } = useMemo(() => {
    const issues = badge?.issues || [];
    return {
      modalFixable: issues.filter(i => MODAL_FIXABLE_ISSUES.includes(i.type)),
      inlineFixable: issues.filter(i => INLINE_FIXABLE_ISSUES.includes(i.type)),
    };
  }, [badge?.issues]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          badgeRef.current && !badgeRef.current.contains(event.target)) {
        setShowPopover(false);
      }
    }

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  if (!badge) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (disabled) return;

    // If has issues, show popover first
    if (badge.status === 'warning' && badge.issues?.length > 0) {
      setShowPopover(!showPopover);
    } else {
      // Otherwise trigger action directly
      onAction?.(badge.clickAction);
    }
  };

  const handleActionClick = (action) => {
    setShowPopover(false);
    // Pass issues context so modal knows what to fix
    onAction?.(action, { issues: badge.issues || [] });
  };

  const colorClass = {
    green: styles.green,
    orange: styles.orange,
    gray: styles.gray,
    red: styles.red,
  }[badge.color] || styles.gray;

  return (
    <div
      className={styles.container}
      style={showPopover ? { zIndex: 100 } : {}}
    >
      <button
        ref={badgeRef}
        className={`${styles.badge} ${colorClass} ${disabled ? styles.disabled : ''}`}
        onClick={handleClick}
        title={badge.tooltip}
        disabled={disabled}
        type="button"
      >
        {badge.icon}
      </button>

      {/* Popover for warnings */}
      {showPopover && badge.issues?.length > 0 && (
        <div ref={popoverRef} className={styles.popover}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverIcon}>⚠️</span>
            <span className={styles.popoverTitle}>Validation Issues</span>
            <button
              className={styles.popoverClose}
              onClick={() => setShowPopover(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <div className={styles.popoverContent}>
            {/* Inline-fixable issues (edit in row) */}
            {inlineFixable.length > 0 && (
              <div className={styles.issueSection}>
                <div className={styles.issueSectionHeader}>Edit in row:</div>
                {inlineFixable.map((issue, idx) => (
                  <div key={`inline-${idx}`} className={styles.issueItem}>
                    <div className={styles.issueMessage}>{issue.message}</div>
                    {issue.suggestion && (
                      <div className={styles.issueSuggestion}>{issue.suggestion}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Modal-fixable issues (inventory-side) */}
            {modalFixable.length > 0 && (
              <div className={styles.issueSection}>
                <div className={styles.issueSectionHeader}>Inventory issue:</div>
                {modalFixable.map((issue, idx) => (
                  <div key={`modal-${idx}`} className={styles.issueItem}>
                    <div className={styles.issueMessage}>{issue.message}</div>
                    {issue.suggestion && (
                      <div className={styles.issueSuggestion}>{issue.suggestion}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.popoverActions}>
            {/* Only show "Fix Now" if there are modal-fixable issues */}
            {modalFixable.length > 0 && (
              <button
                className={styles.actionButton}
                onClick={() => handleActionClick('openLinkModal')}
                type="button"
              >
                Fix Inventory
              </button>
            )}
            <button
              className={styles.actionButtonSecondary}
              onClick={() => setShowPopover(false)}
              type="button"
            >
              {modalFixable.length > 0 ? 'Later' : 'OK'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ValidationBadge;
