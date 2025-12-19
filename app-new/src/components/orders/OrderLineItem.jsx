/**
 * OrderLineItem Component
 *
 * Displays a single line item in a purchase order.
 * Supports view mode and edit mode with quantity/price inputs.
 */

import { memo, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/orderlineitem.module.css';

/**
 * Format currency value
 */
const formatCurrency = (value) => {
  if (value == null || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value);
};

function OrderLineItem({
  line,
  editable = false,
  showReceived = false,
  onQuantityChange,
  onPriceChange,
  onNotesChange,
  onRemove,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate line total
  const lineTotal = (line.quantity || 0) * (line.unitPrice || 0);

  // Calculate received percentage
  const receivedPercent =
    line.quantity > 0 ? Math.round((line.quantityReceived / line.quantity) * 100) : 0;

  // Toggle expanded state for notes
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Quantity change handler
  const handleQuantityChange = useCallback(
    (e) => {
      const value = parseFloat(e.target.value) || 0;
      onQuantityChange?.(line.id, Math.max(0, value));
    },
    [line.id, onQuantityChange]
  );

  // Price change handler
  const handlePriceChange = useCallback(
    (e) => {
      const value = parseFloat(e.target.value) || 0;
      onPriceChange?.(line.id, Math.max(0, value));
    },
    [line.id, onPriceChange]
  );

  // Notes change handler
  const handleNotesChange = useCallback(
    (e) => {
      onNotesChange?.(line.id, e.target.value);
    },
    [line.id, onNotesChange]
  );

  // Remove handler
  const handleRemove = useCallback(() => {
    onRemove?.(line.id);
  }, [line.id, onRemove]);

  // Stock status indicator
  const getStockStatus = () => {
    if (line.stockAtOrder == null) return null;
    if (line.stockAtOrder <= 0) return { label: 'Out', className: 'stockOut' };
    if (line.stockAtOrder < line.quantity) return { label: 'Low', className: 'stockLow' };
    return { label: 'OK', className: 'stockOk' };
  };

  const stockStatus = getStockStatus();

  return (
    <div className={`${styles.lineItem} ${editable ? styles.editable : ''}`}>
      {/* Main Row */}
      <div className={styles.mainRow}>
        {/* Item Info */}
        <div className={styles.itemInfo}>
          <span className={styles.itemName}>{line.inventoryItemName || 'Unknown Item'}</span>
          {line.inventoryItemSku && (
            <span className={styles.itemSku}>{line.inventoryItemSku}</span>
          )}
          {stockStatus && (
            <span className={`${styles.stockBadge} ${styles[stockStatus.className]}`}>
              Stock: {stockStatus.label}
            </span>
          )}
        </div>

        {/* Quantity */}
        <div className={styles.quantity}>
          {editable ? (
            <input
              type="number"
              className={styles.quantityInput}
              value={line.quantity || ''}
              onChange={handleQuantityChange}
              min="0"
              step="1"
              aria-label={`Quantity for ${line.inventoryItemName}`}
            />
          ) : (
            <span className={styles.quantityValue}>{line.quantity || 0}</span>
          )}
          <span className={styles.unit}>{line.unit || 'ea'}</span>
        </div>

        {/* Unit Price */}
        <div className={styles.price}>
          {editable ? (
            <div className={styles.priceInputWrapper}>
              <span className={styles.currencySymbol}>$</span>
              <input
                type="number"
                className={styles.priceInput}
                value={line.unitPrice || ''}
                onChange={handlePriceChange}
                min="0"
                step="0.01"
                aria-label={`Unit price for ${line.inventoryItemName}`}
              />
            </div>
          ) : (
            <span className={styles.priceValue}>{formatCurrency(line.unitPrice)}</span>
          )}
        </div>

        {/* Line Total */}
        <div className={styles.total}>
          <span className={styles.totalValue}>{formatCurrency(lineTotal)}</span>
        </div>

        {/* Received (for received orders) */}
        {showReceived && (
          <div className={styles.received}>
            <span className={styles.receivedValue}>
              {line.quantityReceived || 0} / {line.quantity || 0}
            </span>
            <div className={styles.receivedBar}>
              <div
                className={styles.receivedProgress}
                style={{ width: `${Math.min(100, receivedPercent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {/* Expand/Notes toggle */}
          {(line.notes || editable) && (
            <button
              type="button"
              className={`${styles.actionButton} ${isExpanded ? styles.active : ''}`}
              onClick={handleToggleExpand}
              title={isExpanded ? 'Hide notes' : 'Show notes'}
              aria-expanded={isExpanded}
              aria-label="Toggle notes"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </button>
          )}

          {/* Remove button (edit mode only) */}
          {editable && onRemove && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.removeButton}`}
              onClick={handleRemove}
              title="Remove item"
              aria-label={`Remove ${line.inventoryItemName}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Notes Row */}
      {isExpanded && (
        <div className={styles.notesRow}>
          {editable ? (
            <textarea
              className={styles.notesInput}
              value={line.notes || ''}
              onChange={handleNotesChange}
              placeholder="Add notes for this line item..."
              rows={2}
              aria-label={`Notes for ${line.inventoryItemName}`}
            />
          ) : (
            <p className={styles.notesText}>{line.notes || 'No notes'}</p>
          )}
        </div>
      )}
    </div>
  );
}

OrderLineItem.propTypes = {
  line: PropTypes.shape({
    id: PropTypes.string.isRequired,
    inventoryItemId: PropTypes.string,
    inventoryItemName: PropTypes.string,
    inventoryItemSku: PropTypes.string,
    quantity: PropTypes.number,
    unit: PropTypes.string,
    unitPrice: PropTypes.number,
    stockAtOrder: PropTypes.number,
    quantityReceived: PropTypes.number,
    notes: PropTypes.string,
  }).isRequired,
  editable: PropTypes.bool,
  showReceived: PropTypes.bool,
  onQuantityChange: PropTypes.func,
  onPriceChange: PropTypes.func,
  onNotesChange: PropTypes.func,
  onRemove: PropTypes.func,
};

export default memo(OrderLineItem);
