/**
 * InventoryListItem Component
 *
 * A reusable inventory item display component that shows item details,
 * vendor information, stock progress, and pricing.
 *
 * @module components/inventory/InventoryListItem
 */

import { useCallback } from 'react';
import PropTypes from 'prop-types';
import VendorBadge from './VendorBadge';
import StockProgressBar from './StockProgressBar';
import StockStatusBadge from './StockStatusBadge';
import styles from '../../styles/components/inventorylistitem.module.css';

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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * InventoryListItem - Display a single inventory item
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.item - Inventory item data
 * @param {boolean} [props.showVendor=true] - Whether to show vendor badge
 * @param {boolean} [props.compact=false] - Use compact display mode
 * @param {Function} [props.onClick] - Callback when item is clicked
 * @returns {JSX.Element} Inventory item display
 *
 * @example
 * // Standard display
 * <InventoryListItem
 *   item={{
 *     id: '1',
 *     name: 'All-Purpose Flour',
 *     sku: 'FLR-001',
 *     category: 'Dry Goods',
 *     vendorId: 'v1',
 *     vendorName: 'Sysco Foods',
 *     currentStock: 15,
 *     parLevel: 50,
 *     unit: 'kg',
 *     unitPrice: 2.50
 *   }}
 *   onClick={(item) => openDetail(item)}
 * />
 *
 * @example
 * // Compact mode without vendor
 * <InventoryListItem
 *   item={item}
 *   showVendor={false}
 *   compact
 * />
 */
function InventoryListItem({
  item,
  showVendor = true,
  compact = false,
  onClick,
}) {
  // Calculate stock status
  const stockStatus = getStockStatus(
    item.currentStock || 0,
    item.parLevel || item.fullStock || 0
  );

  /**
   * Handle click on item
   */
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(item);
    }
  }, [item, onClick]);

  /**
   * Handle keyboard interaction
   */
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && onClick) {
        e.preventDefault();
        onClick(item);
      }
    },
    [item, onClick]
  );

  // Build container class
  const containerClass = [
    styles.container,
    compact ? styles.compact : '',
    onClick ? styles.clickable : '',
    styles[stockStatus],
  ]
    .filter(Boolean)
    .join(' ');

  // Build ARIA label
  const ariaLabel = `${item.name}${item.vendorName ? ` from ${item.vendorName}` : ''}: ${item.currentStock || 0} of ${item.parLevel || 0} ${item.unit || 'units'}${item.unitPrice ? `, ${formatCurrency(item.unitPrice)} per ${item.unit || 'unit'}` : ''}`;

  return (
    <div
      className={containerClass}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel}
    >
      {/* Main Content */}
      <div className={styles.content}>
        {/* Left: Item Info */}
        <div className={styles.itemInfo}>
          <div className={styles.nameRow}>
            <h4 className={styles.itemName}>{item.name}</h4>
            <StockStatusBadge
              status={stockStatus}
              size={compact ? 'small' : 'default'}
            />
          </div>

          <div className={styles.metaRow}>
            {item.sku && <span className={styles.sku}>SKU: {item.sku}</span>}
            {item.category && (
              <span className={styles.category}>{item.category}</span>
            )}
          </div>

          {showVendor && item.vendorName && (
            <div className={styles.vendorRow}>
              <VendorBadge
                vendor={{
                  id: item.vendorId,
                  name: item.vendorName,
                  isPrimary: item.isPrimaryVendor,
                }}
                size="small"
              />
            </div>
          )}
        </div>

        {/* Center: Stock Progress */}
        <div className={styles.stockSection}>
          {/* Dual stock display: show quantity and/or weight */}
          {(item.stockQuantity > 0 || item.stockWeight > 0) ? (
            <div className={styles.dualStock}>
              {item.stockQuantity > 0 && (
                <span className={styles.stockValue}>
                  {item.stockQuantity} {item.stockQuantityUnit || 'pc'}
                </span>
              )}
              {item.stockQuantity > 0 && item.stockWeight > 0 && (
                <span className={styles.stockSeparator}>|</span>
              )}
              {item.stockWeight > 0 && (
                <span className={styles.stockValue}>
                  {item.stockWeight} {item.stockWeightUnit || 'lb'}
                </span>
              )}
            </div>
          ) : (
            /* Fallback for legacy data or items without new stock fields */
            <div className={styles.dualStock}>
              <span className={styles.stockValue}>
                {item.currentStock || 0} {item.unit || 'pc'}
              </span>
            </div>
          )}
        </div>

        {/* Right: Price & Actions */}
        <div className={styles.priceSection}>
          {item.unitPrice !== undefined && item.unitPrice !== null && (
            <div className={styles.priceInfo}>
              <span className={styles.unitPrice}>
                {formatCurrency(item.unitPrice)}
              </span>
              <span className={styles.priceUnit}>
                per {item.unit || 'unit'}
              </span>
            </div>
          )}

          {item.totalValue !== undefined && (
            <div className={styles.totalValue}>
              <span className={styles.totalLabel}>Total:</span>
              <span className={styles.totalAmount}>
                {formatCurrency(item.totalValue)}
              </span>
            </div>
          )}

          {/* Click indicator */}
          {onClick && (
            <span className={styles.clickIndicator} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Alert Indicator for critical/low */}
      {(stockStatus === 'critical' || stockStatus === 'low') && (
        <div
          className={`${styles.alertIndicator} ${styles[stockStatus]}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

InventoryListItem.propTypes = {
  /** Inventory item data */
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    sku: PropTypes.string,
    category: PropTypes.string,
    unit: PropTypes.string,
    vendorId: PropTypes.string,
    vendorName: PropTypes.string,
    isPrimaryVendor: PropTypes.bool,
    // Dual stock tracking
    stockQuantity: PropTypes.number,
    stockQuantityUnit: PropTypes.string,
    stockWeight: PropTypes.number,
    stockWeightUnit: PropTypes.string,
    // Legacy/computed fields
    currentStock: PropTypes.number,
    parLevel: PropTypes.number,
    fullStock: PropTypes.number,
    unitPrice: PropTypes.number,
    totalValue: PropTypes.number,
  }).isRequired,
  /** Whether to display vendor badge */
  showVendor: PropTypes.bool,
  /** Use compact display mode */
  compact: PropTypes.bool,
  /** Callback when item is clicked */
  onClick: PropTypes.func,
};

export default InventoryListItem;
