/**
 * VendorCard Component
 *
 * Displays vendor information in a card format with contact details,
 * statistics, and action buttons. Used in vendor lists and grids.
 *
 * @module components/vendors/VendorCard
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/vendorcard.module.css';

/**
 * Format phone number for display
 * @param {string} phone - Raw phone number
 * @returns {string} Formatted phone number
 */
const formatPhone = (phone) => {
  if (!phone) return null;
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  // Format as (XXX) XXX-XXXX for 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // Return original if not 10 digits
  return phone;
};

/**
 * Format currency value
 * @param {number} value - Currency amount
 * @returns {string} Formatted currency string
 */
const formatCurrency = (value) => {
  if (value === undefined || value === null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Render star rating
 * @param {number} rating - Rating 0-5
 * @returns {JSX.Element} Star rating display
 */
const StarRating = ({ rating }) => {
  if (rating === undefined || rating === null) return null;

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className={styles.rating} aria-label={`Rating: ${rating} out of 5 stars`}>
      {[...Array(fullStars)].map((_, i) => (
        <span key={`full-${i}`} className={styles.starFull} aria-hidden="true">
          ★
        </span>
      ))}
      {hasHalfStar && (
        <span className={styles.starHalf} aria-hidden="true">
          ★
        </span>
      )}
      {[...Array(emptyStars)].map((_, i) => (
        <span key={`empty-${i}`} className={styles.starEmpty} aria-hidden="true">
          ☆
        </span>
      ))}
      <span className={styles.ratingValue}>{rating.toFixed(1)}</span>
    </div>
  );
};

StarRating.propTypes = {
  rating: PropTypes.number,
};

/**
 * VendorCard - Display vendor information card
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.vendor - Vendor data object
 * @param {Function} [props.onClick] - Callback when card is clicked
 * @param {Function} [props.onEdit] - Callback when edit button clicked
 * @param {Function} [props.onCall] - Callback when call button clicked
 * @param {Function} [props.onEmail] - Callback when email button clicked
 * @param {boolean} [props.compact=false] - Use compact layout
 * @param {boolean} [props.selected=false] - Show as selected
 * @returns {JSX.Element} Vendor card component
 *
 * @example
 * <VendorCard
 *   vendor={{
 *     id: '1',
 *     name: 'Sysco Foods',
 *     contactName: 'John Smith',
 *     phone: '555-123-4567',
 *     email: 'orders@sysco.com',
 *     itemCount: 45,
 *     isPrimary: true,
 *     rating: 4.5
 *   }}
 *   onClick={(vendor) => openVendorDetail(vendor)}
 *   onEdit={(vendor) => openEditModal(vendor)}
 * />
 */
function VendorCard({
  vendor,
  onClick,
  onEdit,
  onCall,
  onEmail,
  compact = false,
  selected = false,
}) {
  // Calculate derived values
  const stats = useMemo(() => {
    return {
      itemCount: vendor.itemCount || 0,
      criticalCount: vendor.criticalCount || 0,
      lowCount: vendor.lowCount || 0,
      totalValue: vendor.totalInventoryValue || vendor.totalValue || 0,
    };
  }, [vendor]);

  const hasAlerts = stats.criticalCount > 0 || stats.lowCount > 0;

  /**
   * Handle card click
   */
  const handleClick = () => {
    if (onClick) {
      onClick(vendor);
    }
  };

  /**
   * Handle card keyboard activation
   */
  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick(vendor);
    }
  };

  /**
   * Handle edit button click
   */
  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(vendor);
    }
  };

  /**
   * Handle call button click
   */
  const handleCall = (e) => {
    e.stopPropagation();
    if (onCall) {
      onCall(vendor);
    } else if (vendor.phone) {
      // Default behavior: open phone app
      window.location.href = `tel:${vendor.phone.replace(/\D/g, '')}`;
    }
  };

  /**
   * Handle email button click
   */
  const handleEmail = (e) => {
    e.stopPropagation();
    if (onEmail) {
      onEmail(vendor);
    } else if (vendor.email || vendor.orderEmail) {
      // Default behavior: open email client
      window.location.href = `mailto:${vendor.orderEmail || vendor.email}`;
    }
  };

  // Build class names
  const cardClasses = [
    styles.card,
    compact && styles.compact,
    selected && styles.selected,
    onClick && styles.clickable,
    hasAlerts && styles.hasAlerts,
    !vendor.isActive && styles.inactive,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClasses}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : 'article'}
      aria-label={onClick ? `View ${vendor.name} details` : undefined}
      aria-pressed={onClick ? selected : undefined}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.nameRow}>
            {vendor.isPrimary && (
              <span
                className={styles.primaryStar}
                title="Primary vendor"
                aria-label="Primary vendor"
              >
                ★
              </span>
            )}
            <h3 className={styles.name}>{vendor.name}</h3>
            {!vendor.isActive && (
              <span className={styles.inactiveBadge}>Inactive</span>
            )}
          </div>
          {vendor.vendorCode && (
            <span className={styles.vendorCode}>{vendor.vendorCode}</span>
          )}
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          {(vendor.phone || onCall) && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleCall}
              aria-label={`Call ${vendor.name}`}
              title="Call vendor"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
            </button>
          )}
          {(vendor.email || vendor.orderEmail || onEmail) && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleEmail}
              aria-label={`Email ${vendor.name}`}
              title="Email vendor"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleEdit}
              aria-label={`Edit ${vendor.name}`}
              title="Edit vendor"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Contact Info */}
      {!compact && (
        <div className={styles.contact}>
          {vendor.contactName && (
            <div className={styles.contactItem}>
              <svg
                className={styles.contactIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{vendor.contactName}</span>
            </div>
          )}
          {vendor.phone && (
            <div className={styles.contactItem}>
              <svg
                className={styles.contactIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span>{formatPhone(vendor.phone)}</span>
            </div>
          )}
          {(vendor.email || vendor.orderEmail) && (
            <div className={styles.contactItem}>
              <svg
                className={styles.contactIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span className={styles.emailText}>
                {vendor.orderEmail || vendor.email}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.itemCount}</span>
          <span className={styles.statLabel}>Items</span>
        </div>
        {hasAlerts && (
          <>
            {stats.criticalCount > 0 && (
              <div className={`${styles.stat} ${styles.critical}`}>
                <span className={styles.statValue}>{stats.criticalCount}</span>
                <span className={styles.statLabel}>Critical</span>
              </div>
            )}
            {stats.lowCount > 0 && (
              <div className={`${styles.stat} ${styles.low}`}>
                <span className={styles.statValue}>{stats.lowCount}</span>
                <span className={styles.statLabel}>Low</span>
              </div>
            )}
          </>
        )}
        {stats.totalValue > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {formatCurrency(stats.totalValue)}
            </span>
            <span className={styles.statLabel}>Inventory</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {!compact && (
        <div className={styles.footer}>
          {vendor.rating !== undefined && vendor.rating !== null && (
            <StarRating rating={vendor.rating} />
          )}
          {vendor.minimumOrder && (
            <span className={styles.minOrder}>
              Min: {formatCurrency(vendor.minimumOrder)}
            </span>
          )}
          {vendor.leadTimeDays && (
            <span className={styles.leadTime}>
              {vendor.leadTimeDays} day{vendor.leadTimeDays !== 1 ? 's' : ''}{' '}
              lead
            </span>
          )}
          {vendor.deliveryDays && (
            <span className={styles.deliveryDays}>{vendor.deliveryDays}</span>
          )}
        </div>
      )}
    </div>
  );
}

VendorCard.propTypes = {
  /** Vendor data object */
  vendor: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    vendorCode: PropTypes.string,
    contactName: PropTypes.string,
    phone: PropTypes.string,
    email: PropTypes.string,
    orderEmail: PropTypes.string,
    isPrimary: PropTypes.bool,
    isActive: PropTypes.bool,
    rating: PropTypes.number,
    minimumOrder: PropTypes.number,
    leadTimeDays: PropTypes.number,
    deliveryDays: PropTypes.string,
    itemCount: PropTypes.number,
    criticalCount: PropTypes.number,
    lowCount: PropTypes.number,
    totalInventoryValue: PropTypes.number,
    totalValue: PropTypes.number,
  }).isRequired,
  /** Callback when card is clicked */
  onClick: PropTypes.func,
  /** Callback when edit button is clicked */
  onEdit: PropTypes.func,
  /** Callback when call button is clicked */
  onCall: PropTypes.func,
  /** Callback when email button is clicked */
  onEmail: PropTypes.func,
  /** Use compact layout */
  compact: PropTypes.bool,
  /** Show card as selected */
  selected: PropTypes.bool,
};

export default VendorCard;
