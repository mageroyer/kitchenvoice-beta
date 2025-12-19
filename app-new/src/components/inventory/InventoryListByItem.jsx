/**
 * InventoryListByItem Component
 *
 * Displays inventory items grouped by item name, showing vendor variants
 * under each item with collapsible sections organized by stock status.
 *
 * @module components/inventory/InventoryListByItem
 */

import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import StockProgressBar from './StockProgressBar';
import StockStatusBadge from './StockStatusBadge';
import VendorBadge from './VendorBadge';
import styles from '../../styles/components/inventorylistbyitem.module.css';

/**
 * Stock status configuration with display order
 */
const STATUS_CONFIG = {
  critical: { label: 'Critical Stock', order: 1, threshold: 10 },
  low: { label: 'Low Stock', order: 2, threshold: 25 },
  warning: { label: 'Warning', order: 3, threshold: 50 },
  ok: { label: 'In Stock', order: 4, threshold: 100 },
};

/**
 * Calculate stock status based on percentage
 * @param {number} current - Current stock level
 * @param {number} full - Maximum/par stock level
 * @returns {string} Status key
 */
const getStockStatus = (current, full) => {
  if (!full || full === 0) return 'ok';
  const percentage = (current / full) * 100;
  if (percentage <= STATUS_CONFIG.critical.threshold) return 'critical';
  if (percentage <= STATUS_CONFIG.low.threshold) return 'low';
  if (percentage <= STATUS_CONFIG.warning.threshold) return 'warning';
  return 'ok';
};

/**
 * Group items by name and calculate totals
 * @param {Array} items - Raw inventory items
 * @returns {Array} Grouped items with vendor variants and totals
 */
const groupItemsByName = (items) => {
  const grouped = {};

  items.forEach((item) => {
    const name = item.name || 'Unknown Item';

    if (!grouped[name]) {
      grouped[name] = {
        name,
        category: item.category,
        unit: item.unit || 'units',
        variants: [],
        totalCurrent: 0,
        totalFull: 0,
      };
    }

    grouped[name].variants.push(item);
    grouped[name].totalCurrent += item.currentStock || 0;
    grouped[name].totalFull += item.parLevel || item.fullStock || 0;
  });

  // Calculate overall status for each group
  return Object.values(grouped).map((group) => ({
    ...group,
    status: getStockStatus(group.totalCurrent, group.totalFull),
  }));
};

/**
 * Group items by their stock status
 * @param {Array} groupedItems - Items grouped by name
 * @returns {Object} Items organized by status sections
 */
const organizeByStatus = (groupedItems) => {
  const sections = {
    critical: [],
    low: [],
    warning: [],
    ok: [],
  };

  groupedItems.forEach((item) => {
    sections[item.status].push(item);
  });

  // Sort each section alphabetically
  Object.keys(sections).forEach((status) => {
    sections[status].sort((a, b) => a.name.localeCompare(b.name));
  });

  return sections;
};

/**
 * InventoryListByItem - Display inventory grouped by item name
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.items - Array of inventory items
 * @param {Function} [props.onItemClick] - Callback when an item is clicked
 * @param {Function} [props.onReorder] - Callback when reorder button is clicked
 * @returns {JSX.Element} Grouped inventory list
 *
 * @example
 * <InventoryListByItem
 *   items={[
 *     { id: '1', name: 'Flour', vendorId: 'v1', vendorName: 'Sysco', currentStock: 5, parLevel: 20 },
 *     { id: '2', name: 'Flour', vendorId: 'v2', vendorName: 'US Foods', currentStock: 10, parLevel: 20 },
 *   ]}
 *   onItemClick={(item) => console.log('Clicked:', item)}
 *   onReorder={(item) => console.log('Reorder:', item)}
 * />
 */
function InventoryListByItem({ items = [], onItemClick, onReorder }) {
  // Track expanded items
  const [expandedItems, setExpandedItems] = useState(new Set());
  // Track collapsed sections
  const [collapsedSections, setCollapsedSections] = useState(new Set());

  // Group and organize items
  const groupedItems = useMemo(() => groupItemsByName(items), [items]);
  const statusSections = useMemo(() => organizeByStatus(groupedItems), [groupedItems]);

  /**
   * Toggle item expansion
   */
  const toggleItemExpanded = useCallback((itemName) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return next;
    });
  }, []);

  /**
   * Toggle section collapse
   */
  const toggleSectionCollapsed = useCallback((status) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  /**
   * Handle item click
   */
  const handleItemClick = useCallback((item, variant) => {
    if (onItemClick) {
      onItemClick(variant || item);
    }
  }, [onItemClick]);

  /**
   * Handle reorder click
   */
  const handleReorder = useCallback((e, item, variant) => {
    e.stopPropagation();
    if (onReorder) {
      onReorder(variant || item);
    }
  }, [onReorder]);

  /**
   * Handle keyboard navigation for item toggle
   */
  const handleItemKeyDown = useCallback((e, itemName) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleItemExpanded(itemName);
    }
  }, [toggleItemExpanded]);

  /**
   * Render a single variant row
   */
  const renderVariant = (variant, itemUnit) => {
    const variantStatus = getStockStatus(
      variant.currentStock || 0,
      variant.parLevel || variant.fullStock || 0
    );

    return (
      <div
        key={variant.id}
        className={styles.variantRow}
        onClick={() => handleItemClick(null, variant)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleItemClick(null, variant);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`${variant.vendorName || 'Unknown vendor'}: ${variant.currentStock || 0} of ${variant.parLevel || 0} ${itemUnit}`}
      >
        <div className={styles.variantInfo}>
          <VendorBadge
            vendor={{
              id: variant.vendorId,
              name: variant.vendorName || 'Unknown',
              isPrimary: variant.isPrimaryVendor,
            }}
            size="small"
          />
          {variant.sku && (
            <span className={styles.variantSku}>SKU: {variant.sku}</span>
          )}
        </div>

        <div className={styles.variantStock}>
          <StockProgressBar
            current={variant.currentStock || 0}
            full={variant.parLevel || variant.fullStock || 0}
            unit={itemUnit}
            size="compact"
            showLabel
          />
        </div>

        <div className={styles.variantActions}>
          <StockStatusBadge status={variantStatus} size="small" />
          {onReorder && (variantStatus === 'critical' || variantStatus === 'low') && (
            <button
              type="button"
              className={styles.reorderButton}
              onClick={(e) => handleReorder(e, null, variant)}
              aria-label={`Reorder ${variant.name} from ${variant.vendorName}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
              </svg>
              Reorder
            </button>
          )}
        </div>
      </div>
    );
  };

  /**
   * Render a grouped item card
   */
  const renderItemCard = (item) => {
    const isExpanded = expandedItems.has(item.name);
    const hasMultipleVariants = item.variants.length > 1;

    return (
      <div
        key={item.name}
        className={`${styles.itemCard} ${isExpanded ? styles.expanded : ''}`}
      >
        {/* Item Header */}
        <div
          className={styles.itemHeader}
          onClick={() => hasMultipleVariants && toggleItemExpanded(item.name)}
          onKeyDown={(e) => hasMultipleVariants && handleItemKeyDown(e, item.name)}
          tabIndex={hasMultipleVariants ? 0 : -1}
          role={hasMultipleVariants ? 'button' : undefined}
          aria-expanded={hasMultipleVariants ? isExpanded : undefined}
          aria-controls={hasMultipleVariants ? `variants-${item.name.replace(/\s+/g, '-')}` : undefined}
        >
          <div className={styles.itemInfo}>
            <div className={styles.itemNameRow}>
              {hasMultipleVariants && (
                <span
                  className={`${styles.expandIcon} ${isExpanded ? styles.rotated : ''}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                </span>
              )}
              <h3 className={styles.itemName}>{item.name}</h3>
              {item.category && (
                <span className={styles.itemCategory}>{item.category}</span>
              )}
            </div>
            <div className={styles.itemMeta}>
              <span className={styles.variantCount}>
                {item.variants.length} vendor{item.variants.length !== 1 ? 's' : ''}
              </span>
              <span className={styles.totalStock}>
                Total: {item.totalCurrent} / {item.totalFull} {item.unit}
              </span>
            </div>
          </div>

          <div className={styles.itemStatus}>
            <StockStatusBadge status={item.status} showText />
            {onReorder && (item.status === 'critical' || item.status === 'low') && (
              <button
                type="button"
                className={styles.reorderButton}
                onClick={(e) => handleReorder(e, item, item.variants[0])}
                aria-label={`Reorder ${item.name}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
                </svg>
                Reorder
              </button>
            )}
          </div>
        </div>

        {/* Variants List */}
        {hasMultipleVariants && (
          <div
            id={`variants-${item.name.replace(/\s+/g, '-')}`}
            className={`${styles.variantsList} ${isExpanded ? styles.visible : ''}`}
            role="region"
            aria-label={`Vendor variants for ${item.name}`}
          >
            {item.variants.map((variant) => renderVariant(variant, item.unit))}
          </div>
        )}

        {/* Single variant inline display */}
        {!hasMultipleVariants && item.variants.length === 1 && (
          <div className={styles.singleVariant}>
            {renderVariant(item.variants[0], item.unit)}
          </div>
        )}
      </div>
    );
  };

  /**
   * Render a status section
   */
  const renderSection = (status) => {
    const sectionItems = statusSections[status];
    if (sectionItems.length === 0) return null;

    const config = STATUS_CONFIG[status];
    const isCollapsed = collapsedSections.has(status);

    return (
      <section
        key={status}
        className={`${styles.section} ${styles[status]}`}
        aria-labelledby={`section-header-${status}`}
      >
        <button
          type="button"
          id={`section-header-${status}`}
          className={styles.sectionHeader}
          onClick={() => toggleSectionCollapsed(status)}
          aria-expanded={!isCollapsed}
          aria-controls={`section-content-${status}`}
        >
          <span className={styles.sectionIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isCollapsed ? '' : styles.rotated}
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </span>
          <span className={styles.sectionTitle}>{config.label}</span>
          <span className={styles.sectionCount}>
            {sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}
          </span>
        </button>

        <div
          id={`section-content-${status}`}
          className={`${styles.sectionContent} ${isCollapsed ? styles.collapsed : ''}`}
        >
          <div className={styles.itemsGrid}>
            {sectionItems.map(renderItemCard)}
          </div>
        </div>
      </section>
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
          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p className={styles.emptyText}>No inventory items found</p>
        <p className={styles.emptyHint}>Try adjusting your filters or add new items</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {Object.keys(STATUS_CONFIG)
        .sort((a, b) => STATUS_CONFIG[a].order - STATUS_CONFIG[b].order)
        .map(renderSection)}
    </div>
  );
}

InventoryListByItem.propTypes = {
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
      isPrimaryVendor: PropTypes.bool,
      currentStock: PropTypes.number,
      parLevel: PropTypes.number,
      fullStock: PropTypes.number,
    })
  ),
  /** Callback when an item or variant is clicked */
  onItemClick: PropTypes.func,
  /** Callback when reorder button is clicked, receives item/variant */
  onReorder: PropTypes.func,
};

export default InventoryListByItem;
