/**
 * InventoryListByVendor Component
 *
 * Displays inventory items grouped by vendor with expandable sections,
 * summary statistics, and item lists per vendor.
 *
 * @module components/inventory/InventoryListByVendor
 */

import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import VendorBadge from './VendorBadge';
import StockProgressBar from './StockProgressBar';
import StockStatusBadge from './StockStatusBadge';
import styles from '../../styles/components/inventorylistbyvendor.module.css';

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
 * Group items by vendor and calculate statistics
 * @param {Array} items - Raw inventory items
 * @param {Array} vendors - Vendor information
 * @returns {Array} Vendors with their items and stats
 */
const groupItemsByVendor = (items, vendors) => {
  // Create a map of vendor data
  const vendorMap = {};
  vendors.forEach((vendor) => {
    vendorMap[vendor.id] = {
      ...vendor,
      items: [],
      totalItems: 0,
      criticalCount: 0,
      lowCount: 0,
      okCount: 0,
      totalValue: 0,
    };
  });

  // Add "Unknown Vendor" for items without vendor
  vendorMap['unknown'] = {
    id: 'unknown',
    name: 'Unknown Vendor',
    items: [],
    totalItems: 0,
    criticalCount: 0,
    lowCount: 0,
    okCount: 0,
    totalValue: 0,
  };

  // Group items by vendor
  items.forEach((item) => {
    const vendorId = item.vendorId || 'unknown';

    // Create vendor entry if doesn't exist
    if (!vendorMap[vendorId]) {
      vendorMap[vendorId] = {
        id: vendorId,
        name: item.vendorName || 'Unknown Vendor',
        items: [],
        totalItems: 0,
        criticalCount: 0,
        lowCount: 0,
        okCount: 0,
        totalValue: 0,
      };
    }

    const vendor = vendorMap[vendorId];
    vendor.items.push(item);
    vendor.totalItems += 1;

    // Calculate status counts
    const status = getStockStatus(
      item.currentStock || 0,
      item.parLevel || item.fullStock || 0
    );

    if (status === 'critical') vendor.criticalCount += 1;
    else if (status === 'low') vendor.lowCount += 1;
    else vendor.okCount += 1;

    // Calculate total value
    if (item.unitPrice && item.currentStock) {
      vendor.totalValue += item.unitPrice * item.currentStock;
    }
  });

  // Convert to array and filter out empty vendors
  return Object.values(vendorMap)
    .filter((vendor) => vendor.items.length > 0)
    .sort((a, b) => {
      // Sort by alert priority (critical + low), then alphabetically
      const aAlerts = a.criticalCount + a.lowCount;
      const bAlerts = b.criticalCount + b.lowCount;
      if (aAlerts !== bAlerts) return bAlerts - aAlerts;
      return a.name.localeCompare(b.name);
    });
};

/**
 * InventoryListByVendor - Display inventory grouped by vendor
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.items - Array of inventory items
 * @param {Array} [props.vendors=[]] - Array of vendor information
 * @param {Function} [props.onItemClick] - Callback when an item is clicked
 * @param {Function} [props.onVendorClick] - Callback when vendor header is clicked
 * @returns {JSX.Element} Vendor-grouped inventory list
 *
 * @example
 * <InventoryListByVendor
 *   items={inventoryItems}
 *   vendors={vendorList}
 *   onItemClick={(item) => openItemDetail(item)}
 *   onVendorClick={(vendor) => openVendorPage(vendor)}
 * />
 */
function InventoryListByVendor({
  items = [],
  vendors = [],
  onItemClick,
  onVendorClick,
}) {
  // Track expanded vendors
  const [expandedVendors, setExpandedVendors] = useState(new Set());

  // Group items by vendor
  const vendorGroups = useMemo(
    () => groupItemsByVendor(items, vendors),
    [items, vendors]
  );

  // Initialize all vendors as expanded on first render
  useMemo(() => {
    if (expandedVendors.size === 0 && vendorGroups.length > 0) {
      // Expand vendors with alerts by default
      const alertVendors = vendorGroups
        .filter((v) => v.criticalCount > 0 || v.lowCount > 0)
        .map((v) => v.id);
      if (alertVendors.length > 0) {
        setExpandedVendors(new Set(alertVendors));
      }
    }
  }, [vendorGroups]);

  /**
   * Toggle vendor expansion
   */
  const toggleVendorExpanded = useCallback((vendorId) => {
    setExpandedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) {
        next.delete(vendorId);
      } else {
        next.add(vendorId);
      }
      return next;
    });
  }, []);

  /**
   * Handle vendor click (for navigation)
   */
  const handleVendorClick = useCallback(
    (e, vendor) => {
      e.stopPropagation();
      if (onVendorClick) {
        onVendorClick(vendor);
      }
    },
    [onVendorClick]
  );

  /**
   * Handle item click
   */
  const handleItemClick = useCallback(
    (item) => {
      if (onItemClick) {
        onItemClick(item);
      }
    },
    [onItemClick]
  );

  /**
   * Format currency
   */
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  /**
   * Render an item row
   */
  const renderItem = (item) => {
    const status = getStockStatus(
      item.currentStock || 0,
      item.parLevel || item.fullStock || 0
    );

    return (
      <div
        key={item.id}
        className={styles.itemRow}
        onClick={() => handleItemClick(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleItemClick(item);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${item.name}: ${item.currentStock || 0} of ${item.parLevel || 0} ${item.unit || 'units'}`}
      >
        <div className={styles.itemInfo}>
          <span className={styles.itemName}>{item.name}</span>
          {item.sku && <span className={styles.itemSku}>SKU: {item.sku}</span>}
          {item.category && (
            <span className={styles.itemCategory}>{item.category}</span>
          )}
        </div>

        <div className={styles.itemStock}>
          <StockProgressBar
            current={item.currentStock || 0}
            full={item.parLevel || item.fullStock || 0}
            unit={item.unit || 'units'}
            size="compact"
            showLabel
          />
        </div>

        <div className={styles.itemMeta}>
          {item.unitPrice && (
            <span className={styles.itemPrice}>
              {formatCurrency(item.unitPrice)}/{item.unit || 'unit'}
            </span>
          )}
          <StockStatusBadge status={status} size="small" />
        </div>
      </div>
    );
  };

  /**
   * Render a vendor card
   */
  const renderVendorCard = (vendor) => {
    const isExpanded = expandedVendors.has(vendor.id);
    const hasAlerts = vendor.criticalCount > 0 || vendor.lowCount > 0;

    return (
      <div
        key={vendor.id}
        className={`${styles.vendorCard} ${hasAlerts ? styles.hasAlerts : ''}`}
      >
        {/* Vendor Header */}
        <div
          className={styles.vendorHeader}
          onClick={() => toggleVendorExpanded(vendor.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleVendorExpanded(vendor.id);
            }
          }}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
          aria-controls={`vendor-items-${vendor.id}`}
        >
          <div className={styles.vendorInfo}>
            <span
              className={`${styles.expandIcon} ${isExpanded ? styles.rotated : ''}`}
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </span>

            <VendorBadge
              vendor={{
                id: vendor.id,
                name: vendor.name,
                isPrimary: vendor.isPrimary,
              }}
              onClick={onVendorClick ? (e) => handleVendorClick(e, vendor) : undefined}
            />

            <span className={styles.itemCount}>
              {vendor.totalItems} item{vendor.totalItems !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Summary Stats */}
          <div className={styles.vendorStats}>
            {vendor.criticalCount > 0 && (
              <span className={`${styles.statBadge} ${styles.critical}`}>
                {vendor.criticalCount} critical
              </span>
            )}
            {vendor.lowCount > 0 && (
              <span className={`${styles.statBadge} ${styles.low}`}>
                {vendor.lowCount} low
              </span>
            )}
            {vendor.okCount > 0 && (
              <span className={`${styles.statBadge} ${styles.ok}`}>
                {vendor.okCount} OK
              </span>
            )}
            {vendor.totalValue > 0 && (
              <span className={styles.totalValue}>
                {formatCurrency(vendor.totalValue)}
              </span>
            )}
          </div>
        </div>

        {/* Items List */}
        <div
          id={`vendor-items-${vendor.id}`}
          className={`${styles.itemsList} ${isExpanded ? styles.expanded : ''}`}
          role="region"
          aria-label={`Items from ${vendor.name}`}
        >
          {vendor.items
            .sort((a, b) => {
              // Sort by status priority, then name
              const aStatus = getStockStatus(
                a.currentStock || 0,
                a.parLevel || a.fullStock || 0
              );
              const bStatus = getStockStatus(
                b.currentStock || 0,
                b.parLevel || b.fullStock || 0
              );
              const statusOrder = { critical: 0, low: 1, warning: 2, ok: 3 };
              if (statusOrder[aStatus] !== statusOrder[bStatus]) {
                return statusOrder[aStatus] - statusOrder[bStatus];
              }
              return a.name.localeCompare(b.name);
            })
            .map(renderItem)}
        </div>
      </div>
    );
  };

  // Empty state
  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <svg
          className={styles.emptyIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
        <p className={styles.emptyText}>No vendor items found</p>
        <p className={styles.emptyHint}>
          Try adjusting your filters or add items with vendor information
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Summary Bar */}
      <div className={styles.summaryBar}>
        <span className={styles.summaryText}>
          {vendorGroups.length} vendor{vendorGroups.length !== 1 ? 's' : ''} •{' '}
          {items.length} total item{items.length !== 1 ? 's' : ''}
        </span>
        <div className={styles.summaryActions}>
          <button
            type="button"
            className={styles.expandAllButton}
            onClick={() => {
              if (expandedVendors.size === vendorGroups.length) {
                setExpandedVendors(new Set());
              } else {
                setExpandedVendors(new Set(vendorGroups.map((v) => v.id)));
              }
            }}
          >
            {expandedVendors.size === vendorGroups.length
              ? 'Collapse All'
              : 'Expand All'}
          </button>
        </div>
      </div>

      {/* Vendor Cards */}
      <div className={styles.vendorList}>
        {vendorGroups.map(renderVendorCard)}
      </div>
    </div>
  );
}

InventoryListByVendor.propTypes = {
  /** Array of inventory items to display */
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      category: PropTypes.string,
      unit: PropTypes.string,
      sku: PropTypes.string,
      vendorId: PropTypes.string,
      vendorName: PropTypes.string,
      currentStock: PropTypes.number,
      parLevel: PropTypes.number,
      fullStock: PropTypes.number,
      unitPrice: PropTypes.number,
    })
  ),
  /** Array of vendor information */
  vendors: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      isPrimary: PropTypes.bool,
    })
  ),
  /** Callback when an item is clicked */
  onItemClick: PropTypes.func,
  /** Callback when vendor header badge is clicked */
  onVendorClick: PropTypes.func,
};

export default InventoryListByVendor;
