/**
 * OrderCard Component
 *
 * Displays a purchase order in card format for list/grid views.
 * Shows order number, vendor, status, totals, and quick actions.
 */

import { memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/ordercard.module.css';

// Status display configuration
const STATUS_CONFIG = {
  draft: { label: 'Draft', className: 'statusDraft', icon: '📝' },
  pending_approval: { label: 'Pending Approval', className: 'statusPending', icon: '⏳' },
  approved: { label: 'Approved', className: 'statusApproved', icon: '✓' },
  sent: { label: 'Sent', className: 'statusSent', icon: '📤' },
  confirmed: { label: 'Confirmed', className: 'statusConfirmed', icon: '📋' },
  partially_received: { label: 'Partial', className: 'statusPartial', icon: '📦' },
  received: { label: 'Received', className: 'statusReceived', icon: '✅' },
  cancelled: { label: 'Cancelled', className: 'statusCancelled', icon: '✕' },
  closed: { label: 'Closed', className: 'statusClosed', icon: '🔒' },
};

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

/**
 * Calculate days until expected delivery
 */
const getDaysUntilDelivery = (expectedDate) => {
  if (!expectedDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(expectedDate);
  delivery.setHours(0, 0, 0, 0);
  const diffTime = delivery - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

function OrderCard({
  order,
  onClick,
  onEdit,
  onSend,
  onReceive,
  compact = false,
  selected = false,
}) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
  const lineCount = order.lineCount || order.lines?.length || 0;
  const daysUntil = getDaysUntilDelivery(order.expectedDeliveryDate);

  // Card click handler
  const handleClick = useCallback(() => {
    onClick?.(order);
  }, [onClick, order]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(order);
      }
    },
    [onClick, order]
  );

  // Action button handlers (prevent card click)
  const handleEdit = useCallback(
    (e) => {
      e.stopPropagation();
      onEdit?.(order);
    },
    [onEdit, order]
  );

  const handleSend = useCallback(
    (e) => {
      e.stopPropagation();
      onSend?.(order);
    },
    [onSend, order]
  );

  const handleReceive = useCallback(
    (e) => {
      e.stopPropagation();
      onReceive?.(order);
    },
    [onReceive, order]
  );

  // Determine which actions are available
  const canEdit = order.status === 'draft';
  const canSend = order.status === 'draft' || order.status === 'approved';
  const canReceive = ['sent', 'confirmed', 'partially_received'].includes(order.status);

  // Card classes
  const cardClasses = [
    styles.card,
    onClick && styles.clickable,
    selected && styles.selected,
    compact && styles.compact,
    order.status === 'cancelled' && styles.cancelled,
  ]
    .filter(Boolean)
    .join(' ');

  // Render as button if clickable, otherwise article
  const CardElement = onClick ? 'div' : 'article';
  const cardProps = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        'aria-label': `View order ${order.orderNumber} details`,
      }
    : {};

  return (
    <CardElement className={cardClasses} {...cardProps}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.orderInfo}>
          <span className={styles.orderNumber}>{order.orderNumber || 'New Order'}</span>
          <span className={`${styles.status} ${styles[statusConfig.className]}`}>
            <span className={styles.statusIcon}>{statusConfig.icon}</span>
            {statusConfig.label}
          </span>
        </div>

        {/* Quick Actions */}
        {!compact && (onEdit || onSend || onReceive) && (
          <div className={styles.quickActions}>
            {canEdit && onEdit && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleEdit}
                title="Edit order"
                aria-label="Edit order"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {canSend && onSend && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleSend}
                title="Send order"
                aria-label="Send order"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
            {canReceive && onReceive && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleReceive}
                title="Receive order"
                aria-label="Receive order"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vendor */}
      <div className={styles.vendor}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={styles.vendorIcon}
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className={styles.vendorName}>{order.vendorName || 'No Vendor'}</span>
      </div>

      {/* Stats (hidden in compact mode) */}
      {!compact && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{lineCount}</span>
            <span className={styles.statLabel}>{lineCount === 1 ? 'Item' : 'Items'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatCurrency(order.total)}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          {order.status === 'partially_received' && order.receivedPercent != null && (
            <div className={styles.stat}>
              <span className={styles.statValue}>{Math.round(order.receivedPercent)}%</span>
              <span className={styles.statLabel}>Received</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.dates}>
          <span className={styles.dateItem}>
            <span className={styles.dateLabel}>Created:</span>
            <span className={styles.dateValue}>{formatDate(order.createdAt)}</span>
          </span>
          {order.expectedDeliveryDate && (
            <span className={styles.dateItem}>
              <span className={styles.dateLabel}>Expected:</span>
              <span
                className={`${styles.dateValue} ${
                  daysUntil !== null && daysUntil < 0 ? styles.overdue : ''
                }`}
              >
                {formatDate(order.expectedDeliveryDate)}
                {daysUntil !== null && daysUntil <= 3 && daysUntil >= 0 && (
                  <span className={styles.daysUntil}>({daysUntil}d)</span>
                )}
                {daysUntil !== null && daysUntil < 0 && (
                  <span className={styles.overdueBadge}>Overdue</span>
                )}
              </span>
            </span>
          )}
        </div>

        {/* Created by */}
        {order.createdByName && !compact && (
          <span className={styles.createdBy}>by {order.createdByName}</span>
        )}
      </div>
    </CardElement>
  );
}

OrderCard.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    orderNumber: PropTypes.string,
    status: PropTypes.string.isRequired,
    vendorId: PropTypes.string,
    vendorName: PropTypes.string,
    total: PropTypes.number,
    lineCount: PropTypes.number,
    lines: PropTypes.array,
    createdAt: PropTypes.string,
    createdByName: PropTypes.string,
    expectedDeliveryDate: PropTypes.string,
    receivedPercent: PropTypes.number,
  }).isRequired,
  onClick: PropTypes.func,
  onEdit: PropTypes.func,
  onSend: PropTypes.func,
  onReceive: PropTypes.func,
  compact: PropTypes.bool,
  selected: PropTypes.bool,
};

export default memo(OrderCard);
