/**
 * VendorDetailModal Component
 *
 * Modal displaying comprehensive vendor information including contact details,
 * business information, statistics, and linked inventory items.
 *
 * @module components/vendors/VendorDetailModal
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/vendordetailmodal.module.css';

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
const formatPhone = (phone) => {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
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
 * Star rating component
 */
const StarRating = ({ rating, size = 'normal' }) => {
  if (rating === undefined || rating === null) return <span>—</span>;

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div
      className={`${styles.rating} ${styles[size]}`}
      aria-label={`Rating: ${rating} out of 5 stars`}
    >
      {[...Array(fullStars)].map((_, i) => (
        <span key={`full-${i}`} className={styles.starFull}>
          ★
        </span>
      ))}
      {hasHalfStar && <span className={styles.starHalf}>★</span>}
      {[...Array(emptyStars)].map((_, i) => (
        <span key={`empty-${i}`} className={styles.starEmpty}>
          ☆
        </span>
      ))}
      <span className={styles.ratingValue}>{rating.toFixed(1)}</span>
    </div>
  );
};

StarRating.propTypes = {
  rating: PropTypes.number,
  size: PropTypes.oneOf(['small', 'normal', 'large']),
};

/**
 * VendorDetailModal - Display vendor details in a modal
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.vendor - Vendor data to display
 * @param {Function} props.onClose - Callback to close modal
 * @param {Function} [props.onEdit] - Callback when edit button clicked
 * @param {Function} [props.onDelete] - Callback when delete confirmed
 * @param {Function} [props.onSetPrimary] - Callback when set as primary clicked
 * @param {Array} [props.items] - Linked inventory items
 * @param {Object} [props.stats] - Vendor statistics
 * @param {boolean} [props.loading=false] - Show loading state
 * @returns {JSX.Element} Vendor detail modal
 */
function VendorDetailModal({
  vendor,
  onClose,
  onEdit,
  onDelete,
  onSetPrimary,
  items = [],
  stats = {},
  loading = false,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

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

  // Prevent body scroll
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
   * Handle edit click
   */
  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit(vendor);
    }
  }, [onEdit, vendor]);

  /**
   * Handle set as primary
   */
  const handleSetPrimary = useCallback(() => {
    if (onSetPrimary) {
      onSetPrimary(vendor);
    }
  }, [onSetPrimary, vendor]);

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!onDelete) return;

    setDeleting(true);
    try {
      await onDelete(vendor);
      onClose();
    } catch (error) {
      console.error('Failed to delete vendor:', error);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [onDelete, vendor, onClose]);

  /**
   * Build full address string
   */
  const getFullAddress = () => {
    const parts = [
      vendor.address,
      vendor.city,
      vendor.province,
      vendor.postalCode,
      vendor.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  if (!vendor) return null;

  const fullAddress = getFullAddress();

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-detail-title"
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
            <div className={styles.titleRow}>
              {vendor.isPrimary && (
                <span className={styles.primaryStar} title="Primary vendor">
                  ★
                </span>
              )}
              <h2 id="vendor-detail-title" className={styles.title}>
                {vendor.name}
              </h2>
              {!vendor.isActive && (
                <span className={styles.inactiveBadge}>Inactive</span>
              )}
            </div>
            <div className={styles.subtitle}>
              {vendor.vendorCode && (
                <span className={styles.vendorCode}>{vendor.vendorCode}</span>
              )}
              {vendor.legalName && vendor.legalName !== vendor.name && (
                <span className={styles.legalName}>{vendor.legalName}</span>
              )}
            </div>
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'info' ? styles.active : ''}`}
            onClick={() => setActiveTab('info')}
            aria-selected={activeTab === 'info'}
            aria-controls="panel-info"
          >
            Information
          </button>
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'items' ? styles.active : ''}`}
            onClick={() => setActiveTab('items')}
            aria-selected={activeTab === 'items'}
            aria-controls="panel-items"
          >
            Items ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            className={`${styles.tab} ${activeTab === 'stats' ? styles.active : ''}`}
            onClick={() => setActiveTab('stats')}
            aria-selected={activeTab === 'stats'}
            aria-controls="panel-stats"
          >
            Statistics
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Loading vendor details...</p>
            </div>
          ) : (
            <>
              {/* Info Tab */}
              {activeTab === 'info' && (
                <div id="panel-info" role="tabpanel" className={styles.panel}>
                  {/* Contact Information */}
                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Contact Information</h3>
                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Contact Name</span>
                        <span className={styles.infoValue}>
                          {vendor.contactName || '—'}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Phone</span>
                        <span className={styles.infoValue}>
                          {vendor.phone ? (
                            <a
                              href={`tel:${vendor.phone.replace(/\D/g, '')}`}
                              className={styles.link}
                            >
                              {formatPhone(vendor.phone)}
                            </a>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Email</span>
                        <span className={styles.infoValue}>
                          {vendor.email ? (
                            <a
                              href={`mailto:${vendor.email}`}
                              className={styles.link}
                            >
                              {vendor.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Fax</span>
                        <span className={styles.infoValue}>
                          {formatPhone(vendor.fax)}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Order Contact */}
                  {(vendor.orderEmail || vendor.orderPhone) && (
                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Order Contact</h3>
                      <div className={styles.infoGrid}>
                        {vendor.orderPhone && (
                          <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Order Phone</span>
                            <span className={styles.infoValue}>
                              <a
                                href={`tel:${vendor.orderPhone.replace(/\D/g, '')}`}
                                className={styles.link}
                              >
                                {formatPhone(vendor.orderPhone)}
                              </a>
                            </span>
                          </div>
                        )}
                        {vendor.orderEmail && (
                          <div className={styles.infoItem}>
                            <span className={styles.infoLabel}>Order Email</span>
                            <span className={styles.infoValue}>
                              <a
                                href={`mailto:${vendor.orderEmail}`}
                                className={styles.link}
                              >
                                {vendor.orderEmail}
                              </a>
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Address */}
                  {fullAddress && (
                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Address</h3>
                      <p className={styles.address}>{fullAddress}</p>
                      {vendor.website && (
                        <a
                          href={
                            vendor.website.startsWith('http')
                              ? vendor.website
                              : `https://${vendor.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.websiteLink}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                          </svg>
                          {vendor.website}
                        </a>
                      )}
                    </section>
                  )}

                  {/* Business Terms */}
                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Business Terms</h3>
                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Payment Terms</span>
                        <span className={styles.infoValue}>
                          {vendor.paymentTerms || 'Net 30'}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Minimum Order</span>
                        <span className={styles.infoValue}>
                          {vendor.minimumOrder
                            ? formatCurrency(vendor.minimumOrder)
                            : '—'}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Lead Time</span>
                        <span className={styles.infoValue}>
                          {vendor.leadTimeDays
                            ? `${vendor.leadTimeDays} day${vendor.leadTimeDays !== 1 ? 's' : ''}`
                            : '—'}
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>Delivery Days</span>
                        <span className={styles.infoValue}>
                          {vendor.deliveryDays || '—'}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Rating & Notes */}
                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Rating & Notes</h3>
                    <div className={styles.ratingSection}>
                      <span className={styles.infoLabel}>Rating</span>
                      <StarRating rating={vendor.rating} size="large" />
                    </div>
                    {vendor.notes && (
                      <div className={styles.notes}>
                        <span className={styles.infoLabel}>Notes</span>
                        <p className={styles.notesText}>{vendor.notes}</p>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* Items Tab */}
              {activeTab === 'items' && (
                <div id="panel-items" role="tabpanel" className={styles.panel}>
                  {items.length === 0 ? (
                    <div className={styles.emptyItems}>
                      <p>No inventory items linked to this vendor</p>
                    </div>
                  ) : (
                    <div className={styles.itemsList}>
                      {items.map((item) => (
                        <div key={item.id} className={styles.itemRow}>
                          <div className={styles.itemInfo}>
                            <span className={styles.itemName}>{item.name}</span>
                            {item.sku && (
                              <span className={styles.itemSku}>{item.sku}</span>
                            )}
                          </div>
                          <div className={styles.itemStock}>
                            <span className={styles.stockValue}>
                              {item.currentStock || 0} / {item.parLevel || 0}
                            </span>
                            <span className={styles.stockUnit}>
                              {item.unit || 'units'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <div id="panel-stats" role="tabpanel" className={styles.panel}>
                  <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {stats.itemCount || items.length || 0}
                      </span>
                      <span className={styles.statLabel}>Total Items</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {stats.activeItemCount || 0}
                      </span>
                      <span className={styles.statLabel}>Active Items</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {formatCurrency(stats.totalInventoryValue || 0)}
                      </span>
                      <span className={styles.statLabel}>Inventory Value</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {stats.categoryCount || 0}
                      </span>
                      <span className={styles.statLabel}>Categories</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {formatDate(stats.lastOrderDate)}
                      </span>
                      <span className={styles.statLabel}>Last Order</span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {formatCurrency(stats.totalSpent || 0)}
                      </span>
                      <span className={styles.statLabel}>Total Spent</span>
                    </div>
                  </div>

                  {stats.categories && stats.categories.length > 0 && (
                    <section className={styles.section}>
                      <h3 className={styles.sectionTitle}>Categories</h3>
                      <div className={styles.categoryTags}>
                        {stats.categories.map((cat) => (
                          <span key={cat} className={styles.categoryTag}>
                            {cat}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && (
          <div className={styles.footer}>
            <div className={styles.footerLeft}>
              {onDelete && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete
                </button>
              )}
            </div>
            <div className={styles.footerRight}>
              {onSetPrimary && !vendor.isPrimary && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleSetPrimary}
                >
                  Set as Primary
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleEdit}
                >
                  Edit Vendor
                </button>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
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
              <h4 className={styles.confirmTitle}>Delete Vendor?</h4>
              <p className={styles.confirmMessage}>
                Are you sure you want to delete &quot;{vendor.name}&quot;?
                {items.length > 0 && (
                  <span className={styles.confirmWarning}>
                    {' '}
                    This vendor has {items.length} linked item
                    {items.length !== 1 ? 's' : ''}.
                  </span>
                )}
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

VendorDetailModal.propTypes = {
  /** Vendor data to display */
  vendor: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    legalName: PropTypes.string,
    vendorCode: PropTypes.string,
    contactName: PropTypes.string,
    phone: PropTypes.string,
    email: PropTypes.string,
    fax: PropTypes.string,
    orderPhone: PropTypes.string,
    orderEmail: PropTypes.string,
    address: PropTypes.string,
    city: PropTypes.string,
    province: PropTypes.string,
    postalCode: PropTypes.string,
    country: PropTypes.string,
    website: PropTypes.string,
    paymentTerms: PropTypes.string,
    minimumOrder: PropTypes.number,
    leadTimeDays: PropTypes.number,
    deliveryDays: PropTypes.string,
    isPrimary: PropTypes.bool,
    isActive: PropTypes.bool,
    rating: PropTypes.number,
    notes: PropTypes.string,
  }).isRequired,
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
  /** Callback when edit button is clicked */
  onEdit: PropTypes.func,
  /** Callback when delete is confirmed */
  onDelete: PropTypes.func,
  /** Callback when set as primary is clicked */
  onSetPrimary: PropTypes.func,
  /** Array of linked inventory items */
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      sku: PropTypes.string,
      currentStock: PropTypes.number,
      parLevel: PropTypes.number,
      unit: PropTypes.string,
    })
  ),
  /** Vendor statistics */
  stats: PropTypes.shape({
    itemCount: PropTypes.number,
    activeItemCount: PropTypes.number,
    totalInventoryValue: PropTypes.number,
    categoryCount: PropTypes.number,
    categories: PropTypes.arrayOf(PropTypes.string),
    lastOrderDate: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.instanceOf(Date),
    ]),
    totalSpent: PropTypes.number,
  }),
  /** Show loading state */
  loading: PropTypes.bool,
};

export default VendorDetailModal;
