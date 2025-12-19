/**
 * InventoryFilters Component
 *
 * Provides filtering controls for inventory items including search,
 * category, status, vendor dropdowns, and view mode toggle.
 *
 * @module components/inventory/InventoryFilters
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/inventoryfilters.module.css';

/**
 * Stock status options for filtering
 */
const STOCK_STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'critical', label: 'Critical' },
  { value: 'low', label: 'Low Stock' },
  { value: 'warning', label: 'Warning' },
  { value: 'ok', label: 'In Stock' },
];

/**
 * View mode options
 */
const VIEW_MODE_OPTIONS = [
  { value: 'byItem', label: 'By Item', icon: 'grid' },
  { value: 'byVendor', label: 'By Vendor', icon: 'users' },
  { value: 'byCategory', label: 'By Category', icon: 'folder' },
];

/**
 * Default debounce delay for search input (ms)
 */
const SEARCH_DEBOUNCE_DELAY = 300;

/**
 * InventoryFilters - Filter controls for inventory management
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.filters - Current filter values
 * @param {string} [props.filters.search=''] - Search query
 * @param {string} [props.filters.category='all'] - Selected category
 * @param {string} [props.filters.status='all'] - Selected stock status
 * @param {string} [props.filters.vendor='all'] - Selected vendor
 * @param {string} [props.filters.viewMode='byItem'] - Current view mode
 * @param {Function} props.onChange - Callback when any filter changes
 * @param {Array} [props.categories=[]] - Available category options
 * @param {Array} [props.vendors=[]] - Available vendor options
 * @returns {JSX.Element} Filter controls component
 *
 * @example
 * // Basic usage
 * <InventoryFilters
 *   filters={{ search: '', category: 'all', status: 'all', vendor: 'all', viewMode: 'byItem' }}
 *   onChange={(newFilters) => setFilters(newFilters)}
 *   categories={[{ id: '1', name: 'Produce' }, { id: '2', name: 'Dairy' }]}
 *   vendors={[{ id: '1', name: 'Sysco' }, { id: '2', name: 'US Foods' }]}
 * />
 */
function InventoryFilters({
  filters = {},
  onChange,
  categories = [],
  vendors = [],
}) {
  // Local state for search input (for debouncing)
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const debounceRef = useRef(null);

  // Sync local search value with external filters
  useEffect(() => {
    if (filters.search !== searchValue && filters.search !== undefined) {
      setSearchValue(filters.search);
    }
  }, [filters.search]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /**
   * Handle search input change with debounce
   */
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchValue(value);

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the onChange callback
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, SEARCH_DEBOUNCE_DELAY);
  }, [filters, onChange]);

  /**
   * Handle category filter change
   */
  const handleCategoryChange = useCallback((e) => {
    onChange({ ...filters, category: e.target.value });
  }, [filters, onChange]);

  /**
   * Handle status filter change
   */
  const handleStatusChange = useCallback((e) => {
    onChange({ ...filters, status: e.target.value });
  }, [filters, onChange]);

  /**
   * Handle vendor filter change
   */
  const handleVendorChange = useCallback((e) => {
    onChange({ ...filters, vendor: e.target.value });
  }, [filters, onChange]);

  /**
   * Handle view mode change
   */
  const handleViewModeChange = useCallback((viewMode) => {
    onChange({ ...filters, viewMode });
  }, [filters, onChange]);

  /**
   * Clear all filters
   */
  const handleClearAll = useCallback(() => {
    setSearchValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onChange({
      search: '',
      category: 'all',
      status: 'all',
      vendor: 'all',
      viewMode: filters.viewMode || 'byItem',
    });
  }, [filters.viewMode, onChange]);

  /**
   * Check if any filters are active
   */
  const hasActiveFilters =
    (filters.search && filters.search.trim() !== '') ||
    (filters.category && filters.category !== 'all') ||
    (filters.status && filters.status !== 'all') ||
    (filters.vendor && filters.vendor !== 'all');

  /**
   * Render view mode icon
   */
  const renderViewModeIcon = (iconType) => {
    switch (iconType) {
      case 'grid':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        );
      case 'users':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        );
      case 'folder':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {/* Search Row */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search items..."
            value={searchValue}
            onChange={handleSearchChange}
            aria-label="Search inventory items"
          />
          {searchValue && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => {
                setSearchValue('');
                if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                }
                onChange({ ...filters, search: '' });
              }}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* View Mode Toggle */}
        <div className={styles.viewModes} role="tablist" aria-label="View mode">
          {VIEW_MODE_OPTIONS.map((mode) => (
            <button
              key={mode.value}
              type="button"
              role="tab"
              className={`${styles.viewModeButton} ${filters.viewMode === mode.value ? styles.active : ''}`}
              onClick={() => handleViewModeChange(mode.value)}
              aria-selected={filters.viewMode === mode.value}
              aria-label={`View ${mode.label}`}
            >
              <span className={styles.viewModeIcon} aria-hidden="true">
                {renderViewModeIcon(mode.icon)}
              </span>
              <span className={styles.viewModeLabel}>{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter Row */}
      <div className={styles.filterRow}>
        {/* Category Filter */}
        <div className={styles.filterGroup}>
          <label htmlFor="category-filter" className={styles.filterLabel}>
            Category
          </label>
          <select
            id="category-filter"
            className={styles.filterSelect}
            value={filters.category || 'all'}
            onChange={handleCategoryChange}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id || cat.name} value={cat.id || cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className={styles.filterGroup}>
          <label htmlFor="status-filter" className={styles.filterLabel}>
            Status
          </label>
          <select
            id="status-filter"
            className={styles.filterSelect}
            value={filters.status || 'all'}
            onChange={handleStatusChange}
          >
            {STOCK_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        {/* Vendor Filter */}
        <div className={styles.filterGroup}>
          <label htmlFor="vendor-filter" className={styles.filterLabel}>
            Vendor
          </label>
          <select
            id="vendor-filter"
            className={styles.filterSelect}
            value={filters.vendor || 'all'}
            onChange={handleVendorChange}
          >
            <option value="all">All Vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id || vendor.name} value={vendor.id || vendor.name}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear All Button */}
        {hasActiveFilters && (
          <button
            type="button"
            className={styles.clearAllButton}
            onClick={handleClearAll}
            aria-label="Clear all filters"
          >
            <svg
              className={styles.clearIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear All
          </button>
        )}
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className={styles.activeFilters} role="status" aria-live="polite">
          <span className={styles.activeFiltersLabel}>Active filters:</span>
          <div className={styles.filterTags}>
            {filters.search && filters.search.trim() !== '' && (
              <span className={styles.filterTag}>
                Search: &quot;{filters.search}&quot;
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => {
                    setSearchValue('');
                    onChange({ ...filters, search: '' });
                  }}
                  aria-label={`Remove search filter: ${filters.search}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            {filters.category && filters.category !== 'all' && (
              <span className={styles.filterTag}>
                Category: {categories.find(c => (c.id || c.name) === filters.category)?.name || filters.category}
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => onChange({ ...filters, category: 'all' })}
                  aria-label={`Remove category filter`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            {filters.status && filters.status !== 'all' && (
              <span className={styles.filterTag}>
                Status: {STOCK_STATUS_OPTIONS.find(s => s.value === filters.status)?.label || filters.status}
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => onChange({ ...filters, status: 'all' })}
                  aria-label={`Remove status filter`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            {filters.vendor && filters.vendor !== 'all' && (
              <span className={styles.filterTag}>
                Vendor: {vendors.find(v => (v.id || v.name) === filters.vendor)?.name || filters.vendor}
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => onChange({ ...filters, vendor: 'all' })}
                  aria-label={`Remove vendor filter`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

InventoryFilters.propTypes = {
  /** Current filter values */
  filters: PropTypes.shape({
    /** Search query string */
    search: PropTypes.string,
    /** Selected category ID or 'all' */
    category: PropTypes.string,
    /** Selected stock status or 'all' */
    status: PropTypes.string,
    /** Selected vendor ID or 'all' */
    vendor: PropTypes.string,
    /** Current view mode */
    viewMode: PropTypes.oneOf(['byItem', 'byVendor', 'byCategory']),
  }),
  /** Callback when any filter changes, receives updated filters object */
  onChange: PropTypes.func.isRequired,
  /** Available category options */
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string.isRequired,
    })
  ),
  /** Available vendor options */
  vendors: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string.isRequired,
    })
  ),
};

export default InventoryFilters;
