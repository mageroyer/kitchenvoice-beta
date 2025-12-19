/**
 * ReceiveOrderModal Component
 *
 * Modal for receiving items from a purchase order.
 * Allows partial receiving and tracks discrepancies.
 */

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/receiveordermodal.module.css';

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

/**
 * Format date for display
 */
const formatDate = (dateString) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function ReceiveOrderModal({
  order,
  lines = [],
  onReceive,
  onClose,
  loading = false,
}) {
  // Initialize received quantities from existing data
  const [receivedQuantities, setReceivedQuantities] = useState({});
  const [notes, setNotes] = useState({});
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState(null);
  const [receiveAll, setReceiveAll] = useState(false);

  // Initialize quantities from lines
  useEffect(() => {
    const quantities = {};
    const lineNotes = {};

    lines.forEach((line) => {
      // Default to remaining quantity (ordered - already received)
      const remaining = Math.max(0, (line.quantity || 0) - (line.quantityReceived || 0));
      quantities[line.id] = remaining;
      lineNotes[line.id] = '';
    });

    setReceivedQuantities(quantities);
    setNotes(lineNotes);
  }, [lines]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Calculate totals and status
  const stats = useMemo(() => {
    let totalOrdered = 0;
    let totalPreviouslyReceived = 0;
    let totalReceivingNow = 0;
    let itemsWithDiscrepancy = 0;

    lines.forEach((line) => {
      const ordered = line.quantity || 0;
      const previouslyReceived = line.quantityReceived || 0;
      const receivingNow = receivedQuantities[line.id] || 0;
      const remaining = ordered - previouslyReceived;

      totalOrdered += ordered;
      totalPreviouslyReceived += previouslyReceived;
      totalReceivingNow += receivingNow;

      // Check for discrepancy (receiving different from remaining)
      if (receivingNow !== remaining && receivingNow > 0) {
        itemsWithDiscrepancy++;
      }
    });

    const totalAfterReceiving = totalPreviouslyReceived + totalReceivingNow;
    const isComplete = totalAfterReceiving >= totalOrdered;
    const isPartial = totalAfterReceiving > 0 && totalAfterReceiving < totalOrdered;

    return {
      totalOrdered,
      totalPreviouslyReceived,
      totalReceivingNow,
      totalAfterReceiving,
      itemsWithDiscrepancy,
      isComplete,
      isPartial,
      percentComplete: totalOrdered > 0 ? Math.round((totalAfterReceiving / totalOrdered) * 100) : 0,
    };
  }, [lines, receivedQuantities]);

  // Handle quantity change
  const handleQuantityChange = useCallback((lineId, value) => {
    const quantity = Math.max(0, parseInt(value) || 0);
    setReceivedQuantities((prev) => ({
      ...prev,
      [lineId]: quantity,
    }));
  }, []);

  // Handle notes change
  const handleNotesChange = useCallback((lineId, value) => {
    setNotes((prev) => ({
      ...prev,
      [lineId]: value,
    }));
  }, []);

  // Receive all remaining
  const handleReceiveAll = useCallback(() => {
    const quantities = {};
    lines.forEach((line) => {
      const remaining = Math.max(0, (line.quantity || 0) - (line.quantityReceived || 0));
      quantities[line.id] = remaining;
    });
    setReceivedQuantities(quantities);
    setReceiveAll(true);
  }, [lines]);

  // Clear all quantities
  const handleClearAll = useCallback(() => {
    const quantities = {};
    lines.forEach((line) => {
      quantities[line.id] = 0;
    });
    setReceivedQuantities(quantities);
    setReceiveAll(false);
  }, [lines]);

  // Submit receiving
  const handleSubmit = useCallback(async () => {
    // Validate at least one item is being received
    const totalReceiving = Object.values(receivedQuantities).reduce((sum, qty) => sum + qty, 0);
    if (totalReceiving === 0) {
      setError('Please enter quantities for at least one item');
      return;
    }

    setReceiving(true);
    setError(null);

    try {
      const receivedLines = lines
        .filter((line) => (receivedQuantities[line.id] || 0) > 0)
        .map((line) => ({
          lineId: line.id,
          inventoryItemId: line.inventoryItemId,
          quantityReceived: receivedQuantities[line.id],
          notes: notes[line.id] || '',
        }));

      await onReceive?.(order, receivedLines);
    } catch (err) {
      setError(err.message || 'Failed to receive items');
    } finally {
      setReceiving(false);
    }
  }, [order, lines, receivedQuantities, notes, onReceive]);

  if (!order) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-order-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id="receive-order-title" className={styles.title}>
              Receive Order
            </h2>
            <div className={styles.orderInfo}>
              <span className={styles.orderNumber}>{order.orderNumber}</span>
              <span className={styles.vendorName}>{order.vendorName}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Order Summary */}
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Order Date</span>
            <span className={styles.summaryValue}>{formatDate(order.createdAt)}</span>
          </div>
          {order.expectedDeliveryDate && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Expected</span>
              <span className={styles.summaryValue}>
                {formatDate(order.expectedDeliveryDate)}
              </span>
            </div>
          )}
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total</span>
            <span className={styles.summaryValue}>{formatCurrency(order.total)}</span>
          </div>
          {stats.totalPreviouslyReceived > 0 && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Previously Received</span>
              <span className={styles.summaryValue}>
                {stats.totalPreviouslyReceived} / {stats.totalOrdered}
              </span>
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>Loading order items...</span>
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {/* Quick Actions */}
          <div className={styles.quickActions}>
            <button
              type="button"
              className={styles.quickActionButton}
              onClick={handleReceiveAll}
            >
              Receive All Remaining
            </button>
            <button
              type="button"
              className={styles.quickActionButton}
              onClick={handleClearAll}
            >
              Clear All
            </button>
          </div>

          {/* Line Items */}
          <div className={styles.linesList}>
            {/* Header */}
            <div className={styles.linesHeader}>
              <span className={styles.colItem}>Item</span>
              <span className={styles.colOrdered}>Ordered</span>
              <span className={styles.colReceived}>Received</span>
              <span className={styles.colRemaining}>Remaining</span>
              <span className={styles.colReceiving}>Receiving</span>
            </div>

            {/* Lines */}
            {lines.map((line) => {
              const ordered = line.quantity || 0;
              const previouslyReceived = line.quantityReceived || 0;
              const remaining = Math.max(0, ordered - previouslyReceived);
              const receivingNow = receivedQuantities[line.id] || 0;
              const isDiscrepancy = receivingNow !== remaining && receivingNow > 0;
              const isComplete = previouslyReceived + receivingNow >= ordered;

              return (
                <div
                  key={line.id}
                  className={`${styles.lineItem} ${isComplete ? styles.complete : ''} ${
                    isDiscrepancy ? styles.discrepancy : ''
                  }`}
                >
                  <div className={styles.lineMain}>
                    {/* Item Info */}
                    <div className={styles.itemInfo}>
                      <span className={styles.itemName}>{line.inventoryItemName}</span>
                      {line.inventoryItemSku && (
                        <span className={styles.itemSku}>{line.inventoryItemSku}</span>
                      )}
                    </div>

                    {/* Ordered */}
                    <div className={styles.colOrdered}>
                      <span className={styles.quantity}>
                        {ordered} {line.unit || 'ea'}
                      </span>
                    </div>

                    {/* Previously Received */}
                    <div className={styles.colReceived}>
                      <span className={styles.quantity}>{previouslyReceived}</span>
                    </div>

                    {/* Remaining */}
                    <div className={styles.colRemaining}>
                      <span
                        className={`${styles.quantity} ${remaining === 0 ? styles.zero : ''}`}
                      >
                        {remaining}
                      </span>
                    </div>

                    {/* Receiving Input */}
                    <div className={styles.colReceiving}>
                      <input
                        type="number"
                        className={`${styles.receivingInput} ${
                          isDiscrepancy ? styles.hasDiscrepancy : ''
                        }`}
                        value={receivingNow}
                        onChange={(e) => handleQuantityChange(line.id, e.target.value)}
                        min="0"
                        max={remaining + 10} // Allow slight over-receiving
                        disabled={remaining === 0}
                        aria-label={`Receiving quantity for ${line.inventoryItemName}`}
                      />
                    </div>
                  </div>

                  {/* Discrepancy Note */}
                  {isDiscrepancy && (
                    <div className={styles.discrepancyRow}>
                      <span className={styles.discrepancyLabel}>
                        {receivingNow < remaining
                          ? `Short by ${remaining - receivingNow}`
                          : `Over by ${receivingNow - remaining}`}
                      </span>
                      <input
                        type="text"
                        className={styles.discrepancyNote}
                        placeholder="Add note about discrepancy..."
                        value={notes[line.id] || ''}
                        onChange={(e) => handleNotesChange(line.id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {/* Progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${stats.percentComplete}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {stats.totalAfterReceiving} / {stats.totalOrdered} items ({stats.percentComplete}%)
              {stats.isComplete && ' - Complete'}
              {stats.isPartial && ' - Partial'}
            </span>
          </div>

          {/* Discrepancy Warning */}
          {stats.itemsWithDiscrepancy > 0 && (
            <div className={styles.discrepancyWarning}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                {stats.itemsWithDiscrepancy} item{stats.itemsWithDiscrepancy !== 1 ? 's' : ''} with
                quantity discrepancy
              </span>
            </div>
          )}

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={receiving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.receiveButton}
              onClick={handleSubmit}
              disabled={receiving || stats.totalReceivingNow === 0}
            >
              {receiving
                ? 'Receiving...'
                : `Receive ${stats.totalReceivingNow} Item${stats.totalReceivingNow !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ReceiveOrderModal.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    orderNumber: PropTypes.string,
    vendorName: PropTypes.string,
    createdAt: PropTypes.string,
    expectedDeliveryDate: PropTypes.string,
    total: PropTypes.number,
  }),
  lines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      inventoryItemId: PropTypes.string,
      inventoryItemName: PropTypes.string,
      inventoryItemSku: PropTypes.string,
      quantity: PropTypes.number,
      unit: PropTypes.string,
      quantityReceived: PropTypes.number,
    })
  ),
  onReceive: PropTypes.func,
  onClose: PropTypes.func,
  loading: PropTypes.bool,
};

export default memo(ReceiveOrderModal);
