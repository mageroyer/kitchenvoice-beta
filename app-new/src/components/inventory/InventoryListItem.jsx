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
import { getEffectiveStock, getEffectivePar } from '../../services/database/inventoryHelpers';
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
 * Format stock number with appropriate decimal places
 * Fixes floating-point precision issues (e.g., 0.5000000000001 → 0.5)
 * @param {number} value - Stock value
 * @returns {string} Formatted number
 */
const formatStock = (value) => {
  if (value == null || isNaN(value)) return '0';
  // Round to 2 decimal places, remove trailing zeros
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * Format stock weight/volume with user-friendly units
 * Converts ml → L (when >= 1000) and g → kg (when >= 1000)
 * @param {number} value - The stock value in base units (ml or g)
 * @param {string} unit - The unit (ml, g, etc.)
 * @returns {Object} { value: string, unit: string }
 */
const formatStockWithUnit = (value, unit) => {
  if (value == null || isNaN(value)) return { value: '0', unit: unit || 'pc' };

  const unitLower = (unit || '').toLowerCase();

  // Convert ml to L when >= 1000
  if (unitLower === 'ml' && value >= 1000) {
    return { value: formatStock(value / 1000), unit: 'L' };
  }

  // Convert g to kg when >= 1000
  if (unitLower === 'g' && value >= 1000) {
    return { value: formatStock(value / 1000), unit: 'kg' };
  }

  return { value: formatStock(value), unit: unit || 'pc' };
};

/**
 * Format normalized price (pricePerML, pricePerG, pricePerKg, pricePerLb, etc.)
 * Shows in user-friendly units ($/L, $/kg, $/lb, $/ea)
 * @param {Object} item - Inventory item
 * @returns {string|null} Formatted price string or null
 */
const formatNormalizedPrice = (item) => {
  // Direct $/kg pricing (preferred for weight items)
  if (item.pricePerKg != null && item.pricePerKg > 0) {
    return `$${item.pricePerKg.toFixed(2)}/kg`;
  }

  // Direct $/lb pricing
  if (item.pricePerLb != null && item.pricePerLb > 0) {
    return `$${item.pricePerLb.toFixed(2)}/lb`;
  }

  // Direct $/L pricing (preferred for volume items)
  if (item.pricePerL != null && item.pricePerL > 0) {
    return `$${item.pricePerL.toFixed(2)}/L`;
  }

  // Weight-based pricing stored as pricePerG (convert to $/kg)
  if (item.pricePerG != null && item.pricePerG > 0) {
    const pricePerKg = item.pricePerG * 1000;
    return `$${pricePerKg.toFixed(2)}/kg`;
  }

  // Volume-based pricing stored as pricePerML (convert to $/L)
  if (item.pricePerML != null && item.pricePerML > 0) {
    const pricePerL = item.pricePerML * 1000;
    return `$${pricePerL.toFixed(2)}/L`;
  }

  // Unit-based pricing
  if (item.pricePerUnit != null && item.pricePerUnit > 0) {
    return `$${item.pricePerUnit.toFixed(2)}/ea`;
  }

  return null;
};

/**
 * Format the packaging format for display
 * Uses unitSize fields if available, falls back to parsing lastBoxingFormat
 * @param {Object} item - Inventory item
 * @returns {string|null} Formatted packaging string or null
 */
const formatPackaging = (item) => {
  // For in-house items, show boxing size (portion size)
  if (item.itemType === 'in-house' && item.boxingSize > 0) {
    const unit = item.boxingSizeUnit || item.stockWeightUnit || 'kg';
    return `${item.boxingSize} ${unit}/portion`;
  }

  // Prefer structured unitSize fields (e.g., unitSize=500, unitSizeUnit="ml", unitsPerCase=6)
  if (item.unitSize != null && item.unitSizeUnit && item.unitsPerCase) {
    return `${item.unitsPerCase} × ${item.unitSize}${item.unitSizeUnit}`;
  }

  // Fall back to parsing lastBoxingFormat string
  const format = item.lastBoxingFormat || item.packagingFormat;
  if (!format) return null;

  // Clean up format string for display (e.g., "6x500ML" → "6×500ml")
  return format
    .replace(/x/gi, '×')
    .replace(/(\d+)(ml|l|kg|lb|g|oz)/gi, '$1$2')
    .toLowerCase()
    .replace(/×(\d)/, '× $1');
};

/**
 * Format stock quantity for items with unitsPerCase
 * Shows: "2 × 200ct = 400 pc" for packaging items
 * @param {Object} item - Inventory item
 * @returns {Object} { display: string, totalPieces: number } or null
 */
const formatContainerStock = (item) => {
  const boxes = item.stockQuantity ?? item.currentStock ?? 0;
  const unitsPerCase = item.unitsPerCase || 0;

  // Only format if we have unitsPerCase > 1 (packaging/container items)
  if (unitsPerCase > 1 && boxes > 0) {
    const totalPieces = boxes * unitsPerCase;
    return {
      display: `${formatStock(boxes)} × ${unitsPerCase}ct = ${formatStock(totalPieces)}`,
      totalPieces,
    };
  }

  return null;
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
  // Calculate stock status using effective stock (respects item type: weight vs quantity)
  const effectiveStockData = getEffectiveStock(item);
  const effectiveParData = getEffectivePar(item);
  const stockStatus = getStockStatus(effectiveStockData.value, effectiveParData.value);

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

  // Build ARIA label using effective stock data
  const ariaLabel = `${item.name}${item.vendorName ? ` from ${item.vendorName}` : ''}: ${effectiveStockData.value} of ${effectiveParData.value} ${effectiveStockData.unit}${item.unitPrice ? `, ${formatCurrency(item.unitPrice)} per ${item.unit || 'unit'}` : ''}`;

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
          {/* Use stockQuantity/stockWeight (new schema) with fallback to currentStock (legacy) */}
          {(item.stockQuantity > 0 || item.stockWeight > 0 || item.currentStock > 0) ? (
            <div className={styles.dualStock}>
              {(item.stockQuantity > 0 || item.currentStock > 0) && (() => {
                // For container items with unitsPerCase, show: "2 × 200ct = 400 pc"
                const containerStock = formatContainerStock(item);
                if (containerStock) {
                  return (
                    <span className={styles.stockValue}>
                      {containerStock.display} pc
                    </span>
                  );
                }
                // Default display for regular items
                return (
                  <span className={styles.stockValue}>
                    {formatStock(item.stockQuantity ?? item.currentStock)} {item.stockQuantityUnit || 'pc'}
                    {/* Show format breakdown if available */}
                    {formatPackaging(item) && (
                      <span className={styles.formatHint}> ({formatPackaging(item)})</span>
                    )}
                  </span>
                );
              })()}
              {/* Show weight per portion/unit if available (e.g., "1 L unit") */}
              {item.weightPerPortion > 0 && item.stockWeight > 0 && (
                <>
                  <span className={styles.stockSeparator}>|</span>
                  {(() => {
                    const formatted = formatStockWithUnit(item.weightPerPortion, item.stockWeightUnit);
                    return (
                      <span className={styles.unitWeight}>
                        {formatted.value} {formatted.unit}
                      </span>
                    );
                  })()}
                </>
              )}
              {/* Add separator before stockWeight only if no weightPerPortion was shown */}
              {(item.stockQuantity > 0 || item.currentStock > 0) && item.stockWeight > 0 && !item.weightPerPortion && (
                <span className={styles.stockSeparator}>|</span>
              )}
              {item.weightPerPortion > 0 && item.stockWeight > 0 && (
                <span className={styles.stockSeparator}>|</span>
              )}
              {item.stockWeight > 0 && (() => {
                const formatted = formatStockWithUnit(item.stockWeight, item.stockWeightUnit);
                return (
                  <span className={styles.stockValue}>
                    {formatted.value} {formatted.unit}
                  </span>
                );
              })()}
              {/* Show normalized price */}
              {formatNormalizedPrice(item) && (
                <>
                  <span className={styles.stockSeparator}>|</span>
                  <span className={styles.normalizedPrice}>
                    {formatNormalizedPrice(item)}
                  </span>
                </>
              )}
            </div>
          ) : (
            /* Fallback for items without new stock fields */
            <div className={styles.dualStock}>
              <span className={styles.stockValue}>
                {formatStock(item.stockQuantity || 0)} {item.unit || 'pc'}
              </span>
              {/* Show normalized price for legacy items too */}
              {formatNormalizedPrice(item) && (
                <>
                  <span className={styles.stockSeparator}>|</span>
                  <span className={styles.normalizedPrice}>
                    {formatNormalizedPrice(item)}
                  </span>
                </>
              )}
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
    // Par levels
    parQuantity: PropTypes.number,
    parWeight: PropTypes.number,
    fullStock: PropTypes.number,
    unitPrice: PropTypes.number,
    totalValue: PropTypes.number,
    // Normalized pricing
    pricePerKg: PropTypes.number,
    pricePerLb: PropTypes.number,
    pricePerL: PropTypes.number,
    pricePerG: PropTypes.number,
    pricePerML: PropTypes.number,
    pricePerUnit: PropTypes.number,
  }).isRequired,
  /** Whether to display vendor badge */
  showVendor: PropTypes.bool,
  /** Use compact display mode */
  compact: PropTypes.bool,
  /** Callback when item is clicked */
  onClick: PropTypes.func,
};

export default InventoryListItem;
