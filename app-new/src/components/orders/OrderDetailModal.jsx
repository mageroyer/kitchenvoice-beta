/**
 * OrderDetailModal Component
 *
 * Displays detailed view of a purchase order with tabs for info, items, and history.
 * Provides actions based on order status (edit, send, receive, cancel, etc.).
 */

import { memo, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import OrderLineItem from './OrderLineItem';
import styles from '../../styles/components/orderdetailmodal.module.css';

// Status display configuration
const STATUS_CONFIG = {
  draft: { label: 'Draft', className: 'statusDraft', icon: '📝' },
  pending_approval: { label: 'Pending Approval', className: 'statusPending', icon: '⏳' },
  approved: { label: 'Approved', className: 'statusApproved', icon: '✓' },
  sent: { label: 'Sent', className: 'statusSent', icon: '📤' },
  confirmed: { label: 'Confirmed', className: 'statusConfirmed', icon: '📋' },
  partially_received: { label: 'Partially Received', className: 'statusPartial', icon: '📦' },
  received: { label: 'Received', className: 'statusReceived', icon: '✅' },
  cancelled: { label: 'Cancelled', className: 'statusCancelled', icon: '✕' },
  closed: { label: 'Closed', className: 'statusClosed', icon: '🔒' },
};

// Send method labels
const SEND_METHOD_LABELS = {
  email: 'Email',
  fax: 'Fax',
  phone: 'Phone',
  portal: 'Vendor Portal',
  in_person: 'In Person',
  other: 'Other',
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
 * Format datetime for display
 */
const formatDateTime = (dateString) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

function OrderDetailModal({
  order,
  lines = [],
  loading = false,
  onClose,
  onEdit,
  onSend,
  onReceive,
  onCancel,
  onApprove,
  onSubmitForApproval,
  onPrint,
}) {
  const [activeTab, setActiveTab] = useState('info');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const statusConfig = STATUS_CONFIG[order?.status] || STATUS_CONFIG.draft;

  // Determine available actions based on status
  const canEdit = order?.status === 'draft';
  const canSubmitForApproval = order?.status === 'draft';
  const canApprove = order?.status === 'pending_approval';
  const canSend = order?.status === 'draft' || order?.status === 'approved';
  const canReceive = ['sent', 'confirmed', 'partially_received'].includes(order?.status);
  const canCancel = [
    'draft',
    'pending_approval',
    'approved',
    'sent',
    'confirmed',
  ].includes(order?.status);

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
        if (showCancelConfirm) {
          setShowCancelConfirm(false);
        } else {
          onClose?.();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showCancelConfirm]);

  // Tab handlers
  const handleTabInfo = useCallback(() => setActiveTab('info'), []);
  const handleTabItems = useCallback(() => setActiveTab('items'), []);
  const handleTabHistory = useCallback(() => setActiveTab('history'), []);

  // Action handlers
  const handleEdit = useCallback(() => {
    onEdit?.(order);
  }, [onEdit, order]);

  const handleSend = useCallback(() => {
    onSend?.(order);
  }, [onSend, order]);

  const handleReceive = useCallback(() => {
    onReceive?.(order);
  }, [onReceive, order]);

  const handleApprove = useCallback(() => {
    onApprove?.(order);
  }, [onApprove, order]);

  const handleSubmitForApproval = useCallback(() => {
    onSubmitForApproval?.(order);
  }, [onSubmitForApproval, order]);

  const handlePrint = useCallback(() => {
    onPrint?.(order);
  }, [onPrint, order]);

  const handleCancelClick = useCallback(() => {
    setShowCancelConfirm(true);
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    setCancelling(true);
    try {
      await onCancel?.(order);
      setShowCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  }, [onCancel, order]);

  const handleCancelDismiss = useCallback(() => {
    setShowCancelConfirm(false);
  }, []);

  // Calculate totals from lines
  const calculatedSubtotal = lines.reduce(
    (sum, line) => sum + (line.quantity || 0) * (line.unitPrice || 0),
    0
  );

  // Calculate received stats
  const receivedStats = lines.reduce(
    (acc, line) => {
      acc.totalOrdered += line.quantity || 0;
      acc.totalReceived += line.quantityReceived || 0;
      return acc;
    },
    { totalOrdered: 0, totalReceived: 0 }
  );
  const receivedPercent =
    receivedStats.totalOrdered > 0
      ? Math.round((receivedStats.totalReceived / receivedStats.totalOrdered) * 100)
      : 0;

  if (!order) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleRow}>
              <h2 id="order-detail-title" className={styles.title}>
                {order.orderNumber || 'New Order'}
              </h2>
              <span className={`${styles.status} ${styles[statusConfig.className]}`}>
                <span className={styles.statusIcon}>{statusConfig.icon}</span>
                {statusConfig.label}
              </span>
            </div>
            <div className={styles.vendorRow}>
              <span className={styles.vendorName}>{order.vendorName || 'No Vendor'}</span>
              {order.confirmationNumber && (
                <span className={styles.confirmationNumber}>
                  Confirmation: {order.confirmationNumber}
                </span>
              )}
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

        {/* Loading state */}
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>Loading order details...</span>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'info' ? styles.activeTab : ''}`}
            onClick={handleTabInfo}
            aria-selected={activeTab === 'info'}
          >
            Information
          </button>
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'items' ? styles.activeTab : ''}`}
            onClick={handleTabItems}
            aria-selected={activeTab === 'items'}
          >
            Items ({lines.length})
          </button>
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
            onClick={handleTabHistory}
            aria-selected={activeTab === 'history'}
          >
            History
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.content}>
          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className={styles.infoTab}>
              {/* Order Details */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Order Details</h3>
                <dl className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <dt>Order Number</dt>
                    <dd>{order.orderNumber || '—'}</dd>
                  </div>
                  <div className={styles.detailItem}>
                    <dt>Status</dt>
                    <dd>{statusConfig.label}</dd>
                  </div>
                  <div className={styles.detailItem}>
                    <dt>Created</dt>
                    <dd>{formatDateTime(order.createdAt)}</dd>
                  </div>
                  <div className={styles.detailItem}>
                    <dt>Created By</dt>
                    <dd>{order.createdByName || '—'}</dd>
                  </div>
                  {order.expectedDeliveryDate && (
                    <div className={styles.detailItem}>
                      <dt>Expected Delivery</dt>
                      <dd>{formatDate(order.expectedDeliveryDate)}</dd>
                    </div>
                  )}
                  {order.sentMethod && (
                    <div className={styles.detailItem}>
                      <dt>Sent Via</dt>
                      <dd>{SEND_METHOD_LABELS[order.sentMethod] || order.sentMethod}</dd>
                    </div>
                  )}
                  {order.sentAt && (
                    <div className={styles.detailItem}>
                      <dt>Sent At</dt>
                      <dd>{formatDateTime(order.sentAt)}</dd>
                    </div>
                  )}
                  {order.confirmedAt && (
                    <div className={styles.detailItem}>
                      <dt>Confirmed At</dt>
                      <dd>{formatDateTime(order.confirmedAt)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Totals */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Totals</h3>
                <div className={styles.totals}>
                  <div className={styles.totalRow}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal || calculatedSubtotal)}</span>
                  </div>
                  {order.taxGST > 0 && (
                    <div className={styles.totalRow}>
                      <span>GST (5%)</span>
                      <span>{formatCurrency(order.taxGST)}</span>
                    </div>
                  )}
                  {order.taxQST > 0 && (
                    <div className={styles.totalRow}>
                      <span>QST (9.975%)</span>
                      <span>{formatCurrency(order.taxQST)}</span>
                    </div>
                  )}
                  <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </section>

              {/* Receiving Progress (for orders being received) */}
              {['sent', 'confirmed', 'partially_received', 'received'].includes(order.status) && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>Receiving Progress</h3>
                  <div className={styles.receivingProgress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${receivedPercent}%` }}
                      />
                    </div>
                    <span className={styles.progressText}>
                      {receivedStats.totalReceived} / {receivedStats.totalOrdered} items received (
                      {receivedPercent}%)
                    </span>
                  </div>
                </section>
              )}

              {/* Delivery Address */}
              {order.deliveryAddress && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>Delivery Address</h3>
                  <p className={styles.addressText}>{order.deliveryAddress}</p>
                </section>
              )}

              {/* Notes */}
              {(order.vendorNotes || order.internalNotes) && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>Notes</h3>
                  {order.vendorNotes && (
                    <div className={styles.noteBlock}>
                      <span className={styles.noteLabel}>For Vendor:</span>
                      <p className={styles.noteText}>{order.vendorNotes}</p>
                    </div>
                  )}
                  {order.internalNotes && (
                    <div className={styles.noteBlock}>
                      <span className={styles.noteLabel}>Internal:</span>
                      <p className={styles.noteText}>{order.internalNotes}</p>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div className={styles.itemsTab}>
              {lines.length === 0 ? (
                <div className={styles.emptyItems}>
                  <p>No items in this order</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className={styles.itemsHeader}>
                    <span className={styles.colItem}>Item</span>
                    <span className={styles.colQty}>Qty</span>
                    <span className={styles.colPrice}>Unit Price</span>
                    <span className={styles.colTotal}>Total</span>
                    {canReceive && <span className={styles.colReceived}>Received</span>}
                  </div>
                  {/* Line Items */}
                  <div className={styles.itemsList}>
                    {lines.map((line) => (
                      <OrderLineItem
                        key={line.id}
                        line={line}
                        editable={false}
                        showReceived={canReceive || order.status === 'received'}
                      />
                    ))}
                  </div>
                  {/* Items Total */}
                  <div className={styles.itemsTotal}>
                    <span>{lines.length} items</span>
                    <span>{formatCurrency(calculatedSubtotal)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className={styles.historyTab}>
              <div className={styles.timeline}>
                {/* Created */}
                <div className={styles.timelineItem}>
                  <div className={styles.timelineDot} />
                  <div className={styles.timelineContent}>
                    <span className={styles.timelineTitle}>Order Created</span>
                    <span className={styles.timelineDate}>{formatDateTime(order.createdAt)}</span>
                    {order.createdByName && (
                      <span className={styles.timelineUser}>by {order.createdByName}</span>
                    )}
                  </div>
                </div>

                {/* Submitted for approval */}
                {order.submittedAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>Submitted for Approval</span>
                      <span className={styles.timelineDate}>{formatDateTime(order.submittedAt)}</span>
                    </div>
                  </div>
                )}

                {/* Approved */}
                {order.approvedAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>Approved</span>
                      <span className={styles.timelineDate}>{formatDateTime(order.approvedAt)}</span>
                      {order.approvedByName && (
                        <span className={styles.timelineUser}>by {order.approvedByName}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Sent */}
                {order.sentAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>
                        Sent via {SEND_METHOD_LABELS[order.sentMethod] || order.sentMethod}
                      </span>
                      <span className={styles.timelineDate}>{formatDateTime(order.sentAt)}</span>
                    </div>
                  </div>
                )}

                {/* Confirmed */}
                {order.confirmedAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>
                        Confirmed
                        {order.confirmationNumber && ` (${order.confirmationNumber})`}
                      </span>
                      <span className={styles.timelineDate}>{formatDateTime(order.confirmedAt)}</span>
                    </div>
                  </div>
                )}

                {/* Received */}
                {order.receivedAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>Received</span>
                      <span className={styles.timelineDate}>{formatDateTime(order.receivedAt)}</span>
                    </div>
                  </div>
                )}

                {/* Cancelled */}
                {order.cancelledAt && (
                  <div className={`${styles.timelineItem} ${styles.cancelled}`}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>Cancelled</span>
                      <span className={styles.timelineDate}>{formatDateTime(order.cancelledAt)}</span>
                      {order.cancelReason && (
                        <span className={styles.timelineReason}>{order.cancelReason}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Closed */}
                {order.closedAt && (
                  <div className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineTitle}>Closed</span>
                      <span className={styles.timelineDate}>{formatDateTime(order.closedAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {onPrint && (
              <button type="button" className={styles.secondaryButton} onClick={handlePrint}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print
              </button>
            )}
            {canCancel && onCancel && (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleCancelClick}
              >
                Cancel Order
              </button>
            )}
          </div>
          <div className={styles.footerRight}>
            {canEdit && onEdit && (
              <button type="button" className={styles.secondaryButton} onClick={handleEdit}>
                Edit
              </button>
            )}
            {canSubmitForApproval && onSubmitForApproval && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSubmitForApproval}
              >
                Submit for Approval
              </button>
            )}
            {canApprove && onApprove && (
              <button type="button" className={styles.primaryButton} onClick={handleApprove}>
                Approve
              </button>
            )}
            {canSend && onSend && (
              <button type="button" className={styles.primaryButton} onClick={handleSend}>
                Send Order
              </button>
            )}
            {canReceive && onReceive && (
              <button type="button" className={styles.primaryButton} onClick={handleReceive}>
                Receive Items
              </button>
            )}
          </div>
        </div>

        {/* Cancel Confirmation Dialog */}
        {showCancelConfirm && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmDialog}>
              <h3>Cancel Order?</h3>
              <p>
                Are you sure you want to cancel order <strong>{order.orderNumber}</strong>? This
                action cannot be undone.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCancelDismiss}
                  disabled={cancelling}
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={handleCancelConfirm}
                  disabled={cancelling}
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

OrderDetailModal.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string.isRequired,
    orderNumber: PropTypes.string,
    status: PropTypes.string.isRequired,
    vendorId: PropTypes.string,
    vendorName: PropTypes.string,
    createdAt: PropTypes.string,
    createdByName: PropTypes.string,
    expectedDeliveryDate: PropTypes.string,
    subtotal: PropTypes.number,
    taxGST: PropTypes.number,
    taxQST: PropTypes.number,
    total: PropTypes.number,
    sentMethod: PropTypes.string,
    sentAt: PropTypes.string,
    confirmedAt: PropTypes.string,
    confirmationNumber: PropTypes.string,
    receivedAt: PropTypes.string,
    cancelledAt: PropTypes.string,
    cancelReason: PropTypes.string,
    closedAt: PropTypes.string,
    deliveryAddress: PropTypes.string,
    vendorNotes: PropTypes.string,
    internalNotes: PropTypes.string,
    submittedAt: PropTypes.string,
    approvedAt: PropTypes.string,
    approvedByName: PropTypes.string,
  }),
  lines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      inventoryItemName: PropTypes.string,
      quantity: PropTypes.number,
      unitPrice: PropTypes.number,
      quantityReceived: PropTypes.number,
    })
  ),
  loading: PropTypes.bool,
  onClose: PropTypes.func,
  onEdit: PropTypes.func,
  onSend: PropTypes.func,
  onReceive: PropTypes.func,
  onCancel: PropTypes.func,
  onApprove: PropTypes.func,
  onSubmitForApproval: PropTypes.func,
  onPrint: PropTypes.func,
};

export default memo(OrderDetailModal);
