/**
 * InventoryItemDetail Component
 *
 * Modal component displaying detailed inventory item information,
 * recent transactions, and action buttons for editing/adjusting stock.
 *
 * @module components/inventory/InventoryItemDetail
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import StockProgressBar from './StockProgressBar';
import StockStatusBadge from './StockStatusBadge';
import VendorBadge from './VendorBadge';
import { getItem, getItemStockHistory } from '../../services/inventory/inventoryItemService';
import styles from '../../styles/components/inventoryitemdetail.module.css';

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
 * Format currency value
 * @param {number} value - Currency amount
 * @returns {string} Formatted currency string
 */
const formatCurrency = (value) => {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format date for display
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Format datetime for display
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted datetime string
 */
const formatDateTime = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Load item details from service - defensive wrapper
 * @param {string} itemId - Item ID to load
 * @returns {Promise<Object|null>} Item details or null
 */
const loadItemDetails = async (itemId) => {
  if (!itemId) return null;

  try {
    const item = await getItem(itemId, { includeVendor: true, includeCalculations: true });
    return item || null;
  } catch (error) {
    console.warn('[InventoryItemDetail] Failed to load item:', error.message);
    return null;
  }
};

/**
 * Load recent transactions from service - defensive wrapper
 * @param {string} itemId - Item ID to load transactions for
 * @returns {Promise<Array>} Recent transactions
 */
const loadRecentTransactions = async (itemId) => {
  if (!itemId) return [];

  try {
    const transactions = await getItemStockHistory(itemId, { limit: 10 });
    return Array.isArray(transactions) ? transactions : [];
  } catch (error) {
    console.warn('[InventoryItemDetail] Failed to load transactions:', error.message);
    return [];
  }
};

/**
 * InventoryItemDetail - Modal for viewing inventory item details
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} props.itemId - ID of the item to display
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Function} [props.onEdit] - Callback when edit button is clicked
 * @param {Function} [props.onAdjustStock] - Callback when adjust stock button is clicked
 * @param {Function} [props.onDelete] - Callback when delete is confirmed
 * @returns {JSX.Element} Item detail modal
 *
 * @example
 * <InventoryItemDetail
 *   itemId="item-123"
 *   onClose={() => setShowDetail(false)}
 *   onEdit={(item) => openEditForm(item)}
 *   onAdjustStock={(item) => openStockAdjustment(item)}
 * />
 */
function InventoryItemDetail({
  itemId,
  onClose,
  onEdit,
  onAdjustStock,
  onDelete,
}) {
  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Load item details
  useEffect(() => {
    const loadData = async () => {
      if (!itemId) return;

      setLoading(true);
      setError(null);

      try {
        const [itemData, transactionData] = await Promise.all([
          loadItemDetails(itemId),
          loadRecentTransactions(itemId),
        ]);
        setItem(itemData);
        setTransactions(transactionData);
      } catch (err) {
        setError('Failed to load item details. Please try again.');
        console.error('Error loading item details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [itemId]);

  // Focus management
  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showDeleteConfirm]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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
   * Handle edit button click
   */
  const handleEdit = useCallback(() => {
    if (onEdit && item) {
      onEdit(item);
    }
  }, [onEdit, item]);

  /**
   * Handle adjust stock button click
   */
  const handleAdjustStock = useCallback(() => {
    if (onAdjustStock && item) {
      onAdjustStock(item);
    }
  }, [onAdjustStock, item]);

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!onDelete || !item) return;

    setDeleting(true);
    try {
      await onDelete(item);
      onClose();
    } catch (err) {
      setError('Failed to delete item. Please try again.');
      console.error('Error deleting item:', err);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [onDelete, item, onClose]);

  /**
   * Get transaction type label and color
   */
  const getTransactionStyle = (type) => {
    switch (type) {
      case 'received':
        return { label: 'Received', className: styles.received };
      case 'used':
        return { label: 'Used', className: styles.used };
      case 'adjustment':
        return { label: 'Adjusted', className: styles.adjustment };
      case 'waste':
        return { label: 'Waste', className: styles.waste };
      case 'transfer':
        return { label: 'Transfer', className: styles.transfer };
      default:
        return { label: type, className: '' };
    }
  };

  // Calculate stock status
  const stockStatus = item
    ? getStockStatus(item.currentStock || 0, item.parLevel || 0)
    : 'ok';

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-detail-title"
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
            {loading ? (
              <div className={styles.headerSkeleton}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonSubtitle} />
              </div>
            ) : item ? (
              <>
                <h2 id="item-detail-title" className={styles.title}>
                  {item.name}
                </h2>
                <div className={styles.subtitle}>
                  {item.sku && <span className={styles.sku}>{item.sku}</span>}
                  {item.category && (
                    <span className={styles.category}>{item.category}</span>
                  )}
                  <StockStatusBadge status={stockStatus} showText />
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close detail view"
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
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading item details...</p>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <svg
                className={styles.errorIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>{error}</p>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
            </div>
          ) : item ? (
            <>
              {/* Stock Overview */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Stock Level</h3>
                <div className={styles.stockOverview}>
                  <StockProgressBar
                    current={item.currentStock || 0}
                    full={item.parLevel || 0}
                    unit={item.unit || 'units'}
                    showLabel
                  />
                  <div className={styles.stockDetails}>
                    <div className={styles.stockStat}>
                      <span className={styles.statLabel}>Current</span>
                      <span className={styles.statValue}>
                        {item.currentStock || 0} {item.unit}
                      </span>
                    </div>
                    <div className={styles.stockStat}>
                      <span className={styles.statLabel}>Par Level</span>
                      <span className={styles.statValue}>
                        {item.parLevel || 0} {item.unit}
                      </span>
                    </div>
                    <div className={styles.stockStat}>
                      <span className={styles.statLabel}>Min</span>
                      <span className={styles.statValue}>
                        {item.minStock || 0} {item.unit}
                      </span>
                    </div>
                    <div className={styles.stockStat}>
                      <span className={styles.statLabel}>Reorder Point</span>
                      <span className={styles.statValue}>
                        {item.reorderPoint || 0} {item.unit}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Vendor Information */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Vendor</h3>
                <div className={styles.vendorInfo}>
                  <div className={styles.primaryVendor}>
                    <VendorBadge
                      vendor={{
                        id: item.vendorId,
                        name: item.vendorName,
                        isPrimary: item.isPrimaryVendor,
                      }}
                    />
                    <span className={styles.vendorPrice}>
                      {formatCurrency(item.unitPrice)}/{item.unit}
                    </span>
                  </div>
                  {item.alternateVendors && item.alternateVendors.length > 0 && (
                    <div className={styles.alternateVendors}>
                      <span className={styles.alternateLabel}>
                        Alternate vendors:
                      </span>
                      {item.alternateVendors.map((vendor) => (
                        <div key={vendor.id} className={styles.alternateVendor}>
                          <span className={styles.alternateName}>
                            {vendor.name}
                          </span>
                          <span className={styles.alternatePrice}>
                            {formatCurrency(vendor.price)}/{item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Pricing */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Pricing</h3>
                <div className={styles.pricingGrid}>
                  <div className={styles.priceStat}>
                    <span className={styles.priceLabel}>Current Price</span>
                    <span className={styles.priceValue}>
                      {formatCurrency(item.unitPrice)}
                    </span>
                  </div>
                  <div className={styles.priceStat}>
                    <span className={styles.priceLabel}>Last Price</span>
                    <span className={styles.priceValue}>
                      {formatCurrency(item.lastPrice)}
                    </span>
                  </div>
                  <div className={styles.priceStat}>
                    <span className={styles.priceLabel}>Average Price</span>
                    <span className={styles.priceValue}>
                      {formatCurrency(item.averagePrice)}
                    </span>
                  </div>
                  <div className={styles.priceStat}>
                    <span className={styles.priceLabel}>Stock Value</span>
                    <span className={styles.priceValue}>
                      {formatCurrency(
                        (item.currentStock || 0) * (item.unitPrice || 0)
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {/* Details */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Details</h3>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Location</span>
                    <span className={styles.detailValue}>
                      {item.location || '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Barcode</span>
                    <span className={styles.detailValue}>
                      {item.barcode || '—'}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Last Ordered</span>
                    <span className={styles.detailValue}>
                      {formatDate(item.lastOrdered)}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Last Received</span>
                    <span className={styles.detailValue}>
                      {formatDate(item.lastReceived)}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Last Counted</span>
                    <span className={styles.detailValue}>
                      {formatDate(item.lastCounted)}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Reorder Qty</span>
                    <span className={styles.detailValue}>
                      {item.reorderQuantity || 0} {item.unit}
                    </span>
                  </div>
                </div>
                {item.notes && (
                  <div className={styles.notes}>
                    <span className={styles.notesLabel}>Notes</span>
                    <p className={styles.notesText}>{item.notes}</p>
                  </div>
                )}
              </section>

              {/* Recent Transactions */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Recent Transactions</h3>
                {transactions.length > 0 ? (
                  <div className={styles.transactionsList}>
                    {transactions.map((tx) => {
                      const txStyle = getTransactionStyle(tx.type);
                      return (
                        <div key={tx.id} className={styles.transactionRow}>
                          <div className={styles.transactionInfo}>
                            <span
                              className={`${styles.transactionType} ${txStyle.className}`}
                            >
                              {txStyle.label}
                            </span>
                            <span className={styles.transactionQty}>
                              {tx.quantity > 0 ? '+' : ''}
                              {tx.quantity} {item.unit}
                            </span>
                          </div>
                          <div className={styles.transactionMeta}>
                            <span className={styles.transactionDate}>
                              {formatDateTime(tx.date)}
                            </span>
                            <span className={styles.transactionUser}>
                              {tx.user}
                            </span>
                          </div>
                          {tx.notes && (
                            <span className={styles.transactionNotes}>
                              {tx.notes}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.noTransactions}>
                    No recent transactions found
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        {!loading && !error && item && (
          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              {onDelete && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="3,6 5,6 21,6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
            <div className={styles.footerRight}>
              {onAdjustStock && (
                <button
                  type="button"
                  className={styles.adjustButton}
                  onClick={handleAdjustStock}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Adjust Stock
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={handleEdit}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Item
                </button>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmModal}>
              <div className={styles.confirmIcon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h4 className={styles.confirmTitle}>Delete Item?</h4>
              <p className={styles.confirmMessage}>
                Are you sure you want to delete &quot;{item?.name}&quot;? This
                action cannot be undone.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

InventoryItemDetail.propTypes = {
  /** ID of the inventory item to display */
  itemId: PropTypes.string.isRequired,
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
  /** Callback when edit button is clicked, receives item object */
  onEdit: PropTypes.func,
  /** Callback when adjust stock button is clicked, receives item object */
  onAdjustStock: PropTypes.func,
  /** Callback when delete is confirmed, receives item object */
  onDelete: PropTypes.func,
};

export default InventoryItemDetail;
