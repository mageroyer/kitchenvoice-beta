/**
 * VendorsTab Component
 *
 * Main container component for the Vendors management tab.
 * Handles vendor list display, filtering, and CRUD operations.
 *
 * @module components/vendors/VendorsTab
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import VendorList from './VendorList';
import VendorDetailModal from './VendorDetailModal';
import AddEditVendorModal from './AddEditVendorModal';
import {
  getAllVendors,
  searchVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorWithItems,
  getVendorStats,
  isVendorNameAvailable,
  setPreferredVendor,
} from '../../services/inventory/vendorService';
import styles from '../../styles/components/vendorstab.module.css';

/**
 * Filter options for vendor status
 */
const STATUS_FILTERS = {
  ALL: 'all',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  WITH_ALERTS: 'alerts',
};

/**
 * Default filter state
 */
const DEFAULT_FILTERS = {
  search: '',
  status: STATUS_FILTERS.ACTIVE,
};

/**
 * VendorsTab - Main vendors management container
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Vendors tab container
 *
 * @example
 * <VendorsTab />
 */
function VendorsTab({ className = '' }) {
  // Data state
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorItems, setVendorItems] = useState([]);
  const [vendorStats, setVendorStats] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);

  // ============================================
  // Data Loading
  // ============================================

  /**
   * Load vendors from service
   */
  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filterOptions = {};

      // Apply status filter
      if (filters.status === STATUS_FILTERS.ACTIVE) {
        filterOptions.isActive = true;
      } else if (filters.status === STATUS_FILTERS.INACTIVE) {
        filterOptions.isActive = false;
      }

      let vendorList;

      // Use search if query exists
      if (searchQuery.trim()) {
        vendorList = await searchVendors(searchQuery, {
          limit: 100,
          activeOnly: filters.status === STATUS_FILTERS.ACTIVE,
        });
      } else {
        vendorList = await getAllVendors(filterOptions);
      }

      setVendors(vendorList);
    } catch (err) {
      console.error('Failed to load vendors:', err);
      setError('Failed to load vendors. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters.status, searchQuery]);

  /**
   * Load vendor details (items and stats)
   */
  const loadVendorDetails = useCallback(async (vendorId) => {
    setDetailLoading(true);

    try {
      const [vendorWithItems, stats] = await Promise.all([
        getVendorWithItems(vendorId),
        getVendorStats(vendorId),
      ]);

      setVendorItems(vendorWithItems?.items || []);
      setVendorStats(stats || {});
    } catch (err) {
      console.error('Failed to load vendor details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // ============================================
  // Computed Values
  // ============================================

  /**
   * Filter vendors by additional criteria
   */
  const filteredVendors = useMemo(() => {
    let result = [...vendors];

    // Filter by alerts status
    if (filters.status === STATUS_FILTERS.WITH_ALERTS) {
      result = result.filter(
        (v) => (v.criticalCount || 0) > 0 || (v.lowCount || 0) > 0
      );
    }

    return result;
  }, [vendors, filters.status]);

  /**
   * Summary statistics
   */
  const summary = useMemo(() => {
    return {
      total: vendors.length,
      active: vendors.filter((v) => v.isActive !== false).length,
      inactive: vendors.filter((v) => v.isActive === false).length,
      withAlerts: vendors.filter(
        (v) => (v.criticalCount || 0) > 0 || (v.lowCount || 0) > 0
      ).length,
      primary: vendors.filter((v) => v.isPrimary).length,
    };
  }, [vendors]);

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handle search input change
   */
  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  /**
   * Handle search submit (debounced via useEffect)
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      loadVendors();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, loadVendors]);

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback((e) => {
    setFilters((prev) => ({
      ...prev,
      status: e.target.value,
    }));
  }, []);

  /**
   * Handle vendor click - open detail modal
   */
  const handleVendorClick = useCallback(
    (vendor) => {
      setSelectedVendor(vendor);
      setShowDetailModal(true);
      loadVendorDetails(vendor.id);
    },
    [loadVendorDetails]
  );

  /**
   * Handle vendor edit click
   */
  const handleVendorEdit = useCallback((vendor) => {
    setEditingVendor(vendor);
    setShowAddEditModal(true);
    setShowDetailModal(false);
  }, []);

  /**
   * Handle add new vendor
   */
  const handleAddVendor = useCallback(() => {
    setEditingVendor(null);
    setShowAddEditModal(true);
  }, []);

  /**
   * Handle close detail modal
   */
  const handleCloseDetail = useCallback(() => {
    setShowDetailModal(false);
    setSelectedVendor(null);
    setVendorItems([]);
    setVendorStats({});
  }, []);

  /**
   * Handle close add/edit modal
   */
  const handleCloseAddEdit = useCallback(() => {
    setShowAddEditModal(false);
    setEditingVendor(null);
  }, []);

  /**
   * Handle save vendor (create or update)
   */
  const handleSaveVendor = useCallback(
    async (vendorData) => {
      try {
        if (vendorData.id) {
          await updateVendor(vendorData.id, vendorData);
        } else {
          await createVendor(vendorData);
        }

        // Refresh list
        await loadVendors();
      } catch (err) {
        console.error('Failed to save vendor:', err);
        throw err; // Re-throw so modal can display error
      }
    },
    [loadVendors]
  );

  /**
   * Handle delete vendor
   */
  const handleDeleteVendor = useCallback(
    async (vendor) => {
      try {
        await deleteVendor(vendor.id, { force: true });
        await loadVendors();
      } catch (err) {
        console.error('Failed to delete vendor:', err);
        throw err;
      }
    },
    [loadVendors]
  );

  /**
   * Handle set primary vendor
   */
  const handleSetPrimary = useCallback(
    async (vendor) => {
      try {
        await setPreferredVendor(vendor.id);
        await loadVendors();

        // Update selected vendor if it's still open
        if (selectedVendor?.id === vendor.id) {
          setSelectedVendor((prev) => ({ ...prev, isPrimary: true }));
        }
      } catch (err) {
        console.error('Failed to set primary vendor:', err);
      }
    },
    [loadVendors, selectedVendor]
  );

  /**
   * Check for duplicate vendor name
   */
  const checkDuplicateName = useCallback(async (name, excludeId) => {
    const isAvailable = await isVendorNameAvailable(name, excludeId);
    return !isAvailable;
  }, []);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    setSearchQuery('');
    setFilters(DEFAULT_FILTERS);
    loadVendors();
  }, [loadVendors]);

  /**
   * Dismiss error
   */
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // ============================================
  // Render
  // ============================================

  const containerClasses = [styles.container, className].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Vendors</h1>
          <p className={styles.subtitle}>
            {summary.active} active vendor{summary.active !== 1 ? 's' : ''}
            {summary.withAlerts > 0 && (
              <span className={styles.alertBadge}>
                {summary.withAlerts} with alerts
              </span>
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh vendors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={loading ? styles.spinning : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddVendor}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Vendor
          </button>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className={styles.alert} role="alert">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            className={styles.alertDismiss}
            onClick={handleDismissError}
            aria-label="Dismiss error"
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
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search vendors..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search vendors"
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
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
          )}
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="status-filter" className={styles.filterLabel}>
            Status
          </label>
          <select
            id="status-filter"
            className={styles.filterSelect}
            value={filters.status}
            onChange={handleFilterChange}
          >
            <option value={STATUS_FILTERS.ALL}>All Vendors</option>
            <option value={STATUS_FILTERS.ACTIVE}>Active Only</option>
            <option value={STATUS_FILTERS.INACTIVE}>Inactive Only</option>
            <option value={STATUS_FILTERS.WITH_ALERTS}>With Alerts</option>
          </select>
        </div>
      </div>

      {/* Vendor List */}
      <div className={styles.listContainer}>
        <VendorList
          vendors={filteredVendors}
          onVendorClick={handleVendorClick}
          onVendorEdit={handleVendorEdit}
          selectedId={selectedVendor?.id}
          loading={loading}
          emptyMessage={
            searchQuery
              ? `No vendors found matching "${searchQuery}"`
              : 'No vendors found'
          }
        />
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedVendor && (
        <VendorDetailModal
          vendor={selectedVendor}
          items={vendorItems}
          stats={vendorStats}
          loading={detailLoading}
          onClose={handleCloseDetail}
          onEdit={handleVendorEdit}
          onDelete={handleDeleteVendor}
          onSetPrimary={handleSetPrimary}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddEditModal && (
        <AddEditVendorModal
          vendor={editingVendor}
          onClose={handleCloseAddEdit}
          onSave={handleSaveVendor}
          checkDuplicate={checkDuplicateName}
        />
      )}
    </div>
  );
}

VendorsTab.propTypes = {
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default VendorsTab;
