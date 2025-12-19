/**
 * StockAdjustmentModal Component
 *
 * Modal for adjusting inventory stock levels with reason tracking,
 * validation, and preview before saving.
 *
 * @module components/inventory/StockAdjustmentModal
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import StockProgressBar from './StockProgressBar';
import styles from '../../styles/components/stockadjustmentmodal.module.css';

/**
 * Adjustment reason options
 */
const ADJUSTMENT_REASONS = [
  { value: '', label: 'Select a reason...' },
  { value: 'count', label: 'Physical Count' },
  { value: 'received', label: 'Received Delivery' },
  { value: 'used', label: 'Used in Production' },
  { value: 'waste', label: 'Waste / Spoilage' },
  { value: 'damaged', label: 'Damaged Goods' },
  { value: 'returned', label: 'Returned to Vendor' },
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'correction', label: 'Error Correction' },
  { value: 'other', label: 'Other' },
];

/**
 * Calculate stock status based on percentage
 * @param {number} current - Current stock level
 * @param {number} full - Maximum/par stock level
 * @returns {string} Status key
 */
const getStockStatus = (current, full) => {
  if (!full || full === 0) return 'ok';
  const percentage = (current / full) * 100;
  if (percentage <= 10) return 'critical';
  if (percentage <= 25) return 'low';
  if (percentage <= 50) return 'warning';
  return 'ok';
};

/**
 * StockAdjustmentModal - Adjust inventory stock levels
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.item - Inventory item to adjust
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Function} props.onSave - Callback when adjustment is saved
 * @returns {JSX.Element} Stock adjustment modal
 *
 * @example
 * <StockAdjustmentModal
 *   item={{
 *     id: '1',
 *     name: 'Flour',
 *     currentStock: 15,
 *     parLevel: 50,
 *     unit: 'kg'
 *   }}
 *   onClose={() => setShowModal(false)}
 *   onSave={(adjustment) => saveAdjustment(adjustment)}
 * />
 */
function StockAdjustmentModal({ item, onClose, onSave }) {
  // Form state
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Refs
  const modalRef = useRef(null);
  const inputRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Initialize with current stock value
  useEffect(() => {
    if (item?.currentStock !== undefined) {
      setNewValue(String(item.currentStock));
    }
  }, [item]);

  // Focus management
  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    // Focus input after a brief delay for animation
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Calculate derived values
  const currentStock = item?.currentStock || 0;
  const parLevel = item?.parLevel || item?.fullStock || 0;
  const unit = item?.unit || 'units';

  // Parse new value
  const parsedNewValue = useMemo(() => {
    const parsed = parseFloat(newValue);
    return isNaN(parsed) ? null : parsed;
  }, [newValue]);

  // Calculate difference
  const difference = useMemo(() => {
    if (parsedNewValue === null) return 0;
    return parsedNewValue - currentStock;
  }, [parsedNewValue, currentStock]);

  // Validation
  const validation = useMemo(() => {
    const errors = [];

    if (newValue === '' || parsedNewValue === null) {
      errors.push('Please enter a stock value');
    } else if (parsedNewValue < 0) {
      errors.push('Stock value cannot be negative');
    }

    if (!reason) {
      errors.push('Please select a reason');
    }

    if (reason === 'other' && !notes.trim()) {
      errors.push('Please provide notes for "Other" reason');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [newValue, parsedNewValue, reason, notes]);

  // New stock status
  const newStatus = useMemo(() => {
    if (parsedNewValue === null) return getStockStatus(currentStock, parLevel);
    return getStockStatus(parsedNewValue, parLevel);
  }, [parsedNewValue, currentStock, parLevel]);

  /**
   * Handle backdrop click
   */
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Handle value input change
   */
  const handleValueChange = useCallback((e) => {
    const value = e.target.value;
    // Allow empty, numbers, and decimal point
    if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
      setNewValue(value);
      setError(null);
    }
  }, []);

  /**
   * Increment value
   */
  const handleIncrement = useCallback(() => {
    const current = parsedNewValue !== null ? parsedNewValue : currentStock;
    setNewValue(String(current + 1));
    setError(null);
  }, [parsedNewValue, currentStock]);

  /**
   * Decrement value
   */
  const handleDecrement = useCallback(() => {
    const current = parsedNewValue !== null ? parsedNewValue : currentStock;
    const newVal = Math.max(0, current - 1);
    setNewValue(String(newVal));
    setError(null);
  }, [parsedNewValue, currentStock]);

  /**
   * Handle reason change
   */
  const handleReasonChange = useCallback((e) => {
    setReason(e.target.value);
    setError(null);
  }, []);

  /**
   * Handle notes change
   */
  const handleNotesChange = useCallback((e) => {
    setNotes(e.target.value);
    setError(null);
  }, []);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    if (!validation.isValid) {
      setError(validation.errors[0]);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const adjustment = {
        itemId: item.id,
        itemName: item.name,
        previousStock: currentStock,
        newStock: parsedNewValue,
        difference,
        unit,
        reason,
        reasonLabel: ADJUSTMENT_REASONS.find((r) => r.value === reason)?.label,
        notes: notes.trim(),
        timestamp: new Date().toISOString(),
      };

      await onSave(adjustment);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save adjustment. Please try again.');
      console.error('Error saving adjustment:', err);
    } finally {
      setSaving(false);
    }
  }, [
    validation,
    item,
    currentStock,
    parsedNewValue,
    difference,
    unit,
    reason,
    notes,
    onSave,
    onClose,
  ]);

  /**
   * Handle form submit
   */
  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave]
  );

  /**
   * Get difference display class
   */
  const getDifferenceClass = () => {
    if (difference > 0) return styles.positive;
    if (difference < 0) return styles.negative;
    return styles.neutral;
  };

  if (!item) return null;

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjustment-title"
    >
      <div
        ref={modalRef}
        className={styles.modal}
        tabIndex={-1}
        role="document"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id="adjustment-title" className={styles.title}>
              Adjust Stock
            </h2>
            <p className={styles.itemName}>{item.name}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form className={styles.content} onSubmit={handleSubmit}>
          {/* Current Stock Display */}
          <div className={styles.currentStock}>
            <span className={styles.currentLabel}>Current Stock</span>
            <span className={styles.currentValue}>
              {currentStock} {unit}
            </span>
            <StockProgressBar
              current={currentStock}
              full={parLevel}
              unit={unit}
              size="compact"
            />
          </div>

          {/* New Value Input */}
          <div className={styles.inputSection}>
            <label htmlFor="new-stock-value" className={styles.inputLabel}>
              New Stock Value
            </label>
            <div className={styles.inputWrapper}>
              <button
                type="button"
                className={styles.adjustButton}
                onClick={handleDecrement}
                aria-label="Decrease by 1"
                disabled={parsedNewValue !== null && parsedNewValue <= 0}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <input
                ref={inputRef}
                id="new-stock-value"
                type="text"
                inputMode="decimal"
                className={styles.valueInput}
                value={newValue}
                onChange={handleValueChange}
                placeholder="0"
                aria-describedby="stock-unit"
              />
              <span id="stock-unit" className={styles.unitLabel}>
                {unit}
              </span>
              <button
                type="button"
                className={styles.adjustButton}
                onClick={handleIncrement}
                aria-label="Increase by 1"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Reason Dropdown */}
          <div className={styles.fieldGroup}>
            <label htmlFor="adjustment-reason" className={styles.fieldLabel}>
              Reason for Adjustment <span className={styles.required}>*</span>
            </label>
            <select
              id="adjustment-reason"
              className={styles.selectInput}
              value={reason}
              onChange={handleReasonChange}
            >
              {ADJUSTMENT_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes Field */}
          <div className={styles.fieldGroup}>
            <label htmlFor="adjustment-notes" className={styles.fieldLabel}>
              Notes{' '}
              {reason === 'other' && (
                <span className={styles.required}>*</span>
              )}
            </label>
            <textarea
              id="adjustment-notes"
              className={styles.textareaInput}
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add any additional details..."
              rows={3}
            />
          </div>

          {/* Preview Section */}
          {parsedNewValue !== null && reason && (
            <div className={styles.preview}>
              <h3 className={styles.previewTitle}>Preview</h3>
              <div className={styles.previewContent}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Current</span>
                  <span className={styles.previewValue}>
                    {currentStock} {unit}
                  </span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Change</span>
                  <span
                    className={`${styles.previewValue} ${getDifferenceClass()}`}
                  >
                    {difference > 0 ? '+' : ''}
                    {difference} {unit}
                  </span>
                </div>
                <div className={styles.previewDivider} />
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>New Stock</span>
                  <span className={`${styles.previewValue} ${styles.bold}`}>
                    {parsedNewValue} {unit}
                  </span>
                </div>
                <div className={styles.previewProgress}>
                  <StockProgressBar
                    current={parsedNewValue}
                    full={parLevel}
                    unit={unit}
                    size="compact"
                    showLabel
                  />
                </div>
                {newStatus !== getStockStatus(currentStock, parLevel) && (
                  <div className={styles.statusChange}>
                    <span className={styles.statusLabel}>Status will change to:</span>
                    <span className={`${styles.statusBadge} ${styles[newStatus]}`}>
                      {newStatus === 'critical'
                        ? 'Critical'
                        : newStatus === 'low'
                          ? 'Low Stock'
                          : newStatus === 'warning'
                            ? 'Warning'
                            : 'OK'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className={styles.error} role="alert">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={saving || !validation.isValid}
          >
            {saving ? (
              <>
                <span className={styles.spinner} />
                Saving...
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                Save Adjustment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

StockAdjustmentModal.propTypes = {
  /** Inventory item to adjust */
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    currentStock: PropTypes.number,
    parLevel: PropTypes.number,
    fullStock: PropTypes.number,
    unit: PropTypes.string,
  }).isRequired,
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
  /** Callback when adjustment is saved, receives adjustment object */
  onSave: PropTypes.func.isRequired,
};

export default StockAdjustmentModal;
