/**
 * VendorList Component
 *
 * Displays a list of vendors with sorting, filtering, and view mode options.
 * Supports grid and list layouts with customizable actions.
 *
 * @module components/vendors/VendorList
 */

import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import VendorCard from './VendorCard';
import styles from '../../styles/components/vendorlist.module.css';

/**
 * Sort options configuration
 */
const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A-Z)', field: 'name', direction: 'asc' },
  { value: 'name-desc', label: 'Name (Z-A)', field: 'name', direction: 'desc' },
  { value: 'items-desc', label: 'Most Items', field: 'itemCount', direction: 'desc' },
  { value: 'items-asc', label: 'Fewest Items', field: 'itemCount', direction: 'asc' },
  { value: 'rating-desc', label: 'Highest Rated', field: 'rating', direction: 'desc' },
  { value: 'alerts-desc', label: 'Most Alerts', field: 'alerts', direction: 'desc' },
  { value: 'value-desc', label: 'Highest Value', field: 'totalValue', direction: 'desc' },
];

/**
 * View mode options
 */
const VIEW_MODES = {
  GRID: 'grid',
  LIST: 'list',
};

/**
 * Sort vendors by specified field and direction
 * @param {Array} vendors - Vendors to sort
 * @param {string} field - Field to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted vendors
 */
const sortVendors = (vendors, field, direction) => {
  const sorted = [...vendors].sort((a, b) => {
    let aVal, bVal;

    switch (field) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        break;
      case 'itemCount':
        aVal = a.itemCount || 0;
        bVal = b.itemCount || 0;
        break;
      case 'rating':
        aVal = a.rating || 0;
        bVal = b.rating || 0;
        break;
      case 'alerts':
        aVal = (a.criticalCount || 0) + (a.lowCount || 0);
        bVal = (b.criticalCount || 0) + (b.lowCount || 0);
        break;
      case 'totalValue':
        aVal = a.totalInventoryValue || a.totalValue || 0;
        bVal = b.totalInventoryValue || b.totalValue || 0;
        break;
      default:
        aVal = a[field] || '';
        bVal = b[field] || '';
    }

    // Primary vendors always first
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;

    // Then sort by field
    if (typeof aVal === 'string') {
      return direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return sorted;
};

/**
 * VendorList - Display list of vendors
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.vendors - Array of vendor objects
 * @param {Function} [props.onVendorClick] - Callback when vendor card is clicked
 * @param {Function} [props.onVendorEdit] - Callback when edit button is clicked
 * @param {string} [props.selectedId] - ID of selected vendor
 * @param {boolean} [props.loading=false] - Show loading state
 * @param {string} [props.emptyMessage] - Custom empty state message
 * @returns {JSX.Element} Vendor list component
 *
 * @example
 * <VendorList
 *   vendors={vendorArray}
 *   onVendorClick={(vendor) => openDetail(vendor)}
 *   onVendorEdit={(vendor) => openEditModal(vendor)}
 *   selectedId={selectedVendorId}
 * />
 */
function VendorList({
  vendors = [],
  onVendorClick,
  onVendorEdit,
  selectedId,
  loading = false,
  emptyMessage = 'No vendors found',
}) {
  // Local state
  const [sortBy, setSortBy] = useState('name-asc');
  const [viewMode, setViewMode] = useState(VIEW_MODES.GRID);
  const [showInactive, setShowInactive] = useState(false);

  // Parse sort option
  const sortConfig = useMemo(() => {
    const option = SORT_OPTIONS.find((opt) => opt.value === sortBy);
    return option || SORT_OPTIONS[0];
  }, [sortBy]);

  // Filter and sort vendors
  const displayVendors = useMemo(() => {
    let filtered = vendors;

    // Filter inactive if needed
    if (!showInactive) {
      filtered = filtered.filter((v) => v.isActive !== false);
    }

    // Sort vendors
    return sortVendors(filtered, sortConfig.field, sortConfig.direction);
  }, [vendors, showInactive, sortConfig]);

  // Calculate stats
  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.isActive !== false);
    const inactive = vendors.filter((v) => v.isActive === false);
    const withAlerts = active.filter(
      (v) => (v.criticalCount || 0) > 0 || (v.lowCount || 0) > 0
    );

    return {
      total: vendors.length,
      active: active.length,
      inactive: inactive.length,
      withAlerts: withAlerts.length,
    };
  }, [vendors]);

  /**
   * Handle sort change
   */
  const handleSortChange = useCallback((e) => {
    setSortBy(e.target.value);
  }, []);

  /**
   * Handle view mode change
   */
  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
  }, []);

  /**
   * Toggle show inactive
   */
  const toggleShowInactive = useCallback(() => {
    setShowInactive((prev) => !prev);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
          <p>Loading vendors...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (vendors.length === 0) {
    return (
      <div className={styles.container}>
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
          <p className={styles.emptyText}>{emptyMessage}</p>
          <p className={styles.emptyHint}>
            Add a vendor to start managing your orders
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Stats Summary */}
        <div className={styles.statsSummary}>
          <span className={styles.statsText}>
            {displayVendors.length} vendor{displayVendors.length !== 1 ? 's' : ''}
            {stats.withAlerts > 0 && (
              <span className={styles.alertCount}>
                {' '}
                ({stats.withAlerts} with alerts)
              </span>
            )}
          </span>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {/* Show Inactive Toggle */}
          {stats.inactive > 0 && (
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                className={styles.toggleInput}
                checked={showInactive}
                onChange={toggleShowInactive}
              />
              <span className={styles.toggleText}>
                Show inactive ({stats.inactive})
              </span>
            </label>
          )}

          {/* Sort Dropdown */}
          <div className={styles.sortGroup}>
            <label htmlFor="vendor-sort" className={styles.sortLabel}>
              Sort:
            </label>
            <select
              id="vendor-sort"
              className={styles.sortSelect}
              value={sortBy}
              onChange={handleSortChange}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className={styles.viewModes} role="group" aria-label="View mode">
            <button
              type="button"
              className={`${styles.viewModeButton} ${
                viewMode === VIEW_MODES.GRID ? styles.active : ''
              }`}
              onClick={() => handleViewModeChange(VIEW_MODES.GRID)}
              aria-pressed={viewMode === VIEW_MODES.GRID}
              aria-label="Grid view"
              title="Grid view"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.viewModeButton} ${
                viewMode === VIEW_MODES.LIST ? styles.active : ''
              }`}
              onClick={() => handleViewModeChange(VIEW_MODES.LIST)}
              aria-pressed={viewMode === VIEW_MODES.LIST}
              aria-label="List view"
              title="List view"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Vendor Grid/List */}
      <div
        className={`${styles.vendorContainer} ${
          viewMode === VIEW_MODES.LIST ? styles.listView : styles.gridView
        }`}
      >
        {displayVendors.map((vendor) => (
          <VendorCard
            key={vendor.id}
            vendor={vendor}
            onClick={onVendorClick}
            onEdit={onVendorEdit}
            compact={viewMode === VIEW_MODES.LIST}
            selected={selectedId === vendor.id || selectedId === String(vendor.id)}
          />
        ))}
      </div>

      {/* No Results After Filter */}
      {displayVendors.length === 0 && vendors.length > 0 && (
        <div className={styles.noResults}>
          <p>No vendors match current filters</p>
          <button
            type="button"
            className={styles.showAllButton}
            onClick={toggleShowInactive}
          >
            Show all vendors
          </button>
        </div>
      )}
    </div>
  );
}

VendorList.propTypes = {
  /** Array of vendor objects to display */
  vendors: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      isPrimary: PropTypes.bool,
      isActive: PropTypes.bool,
      itemCount: PropTypes.number,
      criticalCount: PropTypes.number,
      lowCount: PropTypes.number,
      rating: PropTypes.number,
      totalInventoryValue: PropTypes.number,
    })
  ),
  /** Callback when a vendor card is clicked */
  onVendorClick: PropTypes.func,
  /** Callback when edit button is clicked on a vendor */
  onVendorEdit: PropTypes.func,
  /** ID of currently selected vendor */
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  /** Show loading state */
  loading: PropTypes.bool,
  /** Custom message for empty state */
  emptyMessage: PropTypes.string,
};

export default VendorList;
