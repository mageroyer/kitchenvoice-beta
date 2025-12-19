import PropTypes from 'prop-types';
import { useState, useEffect, useCallback, useMemo } from 'react';
import styles from '../../styles/components/inventorydashboard.module.css';

// Services
import {
  getAllItems,
  searchItems,
  getCategories,
  getLowStockItems,
  getCriticalStockItems,
  getInventorySummary,
  STOCK_THRESHOLDS,
  getInHouseItems,
} from '../../services/inventory/inventoryItemService';
import {
  getAllVendors,
  getInternalVendor,
} from '../../services/inventory/vendorService';
import { departmentDB } from '../../services/database/indexedDB';
import {
  previewAutoOrders,
  generateOrdersFromLowStock,
} from '../../services/inventory/autoOrderService';
import { getBusinessInfo } from '../../services/database/businessService';
import {
  generateInventoryReportPDF,
  generateLowStockReportPDF,
  downloadPDF,
} from '../../services/exports/pdfExportService';

// Components
import Spinner from '../common/Spinner';
import Alert from '../common/Alert';
import Button from '../common/Button';
import {
  StockProgressBar,
  ItemSearchInput,
} from './index';
import InventoryItemAllFieldsModal from './InventoryItemAllFieldsModal';

/**
 * View mode options for the dashboard
 */
const VIEW_MODES = {
  BY_ITEM: 'byItem',
  BY_VENDOR: 'byVendor',
  BY_CATEGORY: 'byCategory',
  IN_HOUSE: 'inHouse',
};

/**
 * Stock filter options
 */
const STOCK_FILTERS = {
  ALL: 'all',
  LOW: 'low',
  CRITICAL: 'critical',
  OK: 'ok',
};

/**
 * Default filter state
 */
const DEFAULT_FILTERS = {
  search: '',
  category: '',
  status: STOCK_FILTERS.ALL,
  vendorId: '',
  department: '',
};

/**
 * InventoryDashboard Component
 *
 * Main container component for inventory management.
 * Displays inventory items with filtering, grouping, and actions.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Function} [props.onItemSelect] - Called when an item is selected
 * @param {Function} [props.onGenerateOrders] - Called after orders are generated
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered dashboard
 *
 * @example
 * <InventoryDashboard
 *   onItemSelect={(item) => openItemDetail(item.id)}
 *   onGenerateOrders={(orders) => showOrderConfirmation(orders)}
 * />
 */
function InventoryDashboard({
  onItemSelect,
  onGenerateOrders,
  className = '',
}) {
  // ============================================
  // State
  // ============================================

  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [internalVendorId, setInternalVendorId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState(VIEW_MODES.BY_ITEM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [detailItem, setDetailItem] = useState(null); // Item to show in detail modal
  const [generatingOrders, setGeneratingOrders] = useState(false);
  const [orderPreview, setOrderPreview] = useState(null);

  // ============================================
  // Data Loading
  // ============================================

  /**
   * Load initial data
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all data in parallel
      const [itemsData, vendorsData, categoriesData, summaryData, departmentsData, internalVendor] = await Promise.all([
        getAllItems({ activeOnly: true }),
        getAllVendors(),
        getCategories(),
        getInventorySummary(),
        departmentDB.getAll(),
        getInternalVendor(),
      ]);

      setItems(itemsData);
      setVendors(vendorsData);
      setCategories(categoriesData);
      setSummary(summaryData);
      setDepartments(departmentsData || []);
      setInternalVendorId(internalVendor?.id || null);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
      setError('Failed to load inventory data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load items with current filters
   */
  const loadFilteredItems = useCallback(async () => {
    if (loading) return;

    try {
      let filteredItems;

      // For IN_HOUSE view, get only internal vendor items
      if (viewMode === VIEW_MODES.IN_HOUSE) {
        if (internalVendorId) {
          filteredItems = await getAllItems({ activeOnly: true });
          filteredItems = filteredItems.filter(item => item.vendorId === internalVendorId);
        } else {
          // No internal vendor exists - show empty list
          filteredItems = [];
        }
      }
      // Apply status filter first
      else if (filters.status === STOCK_FILTERS.CRITICAL) {
        filteredItems = await getCriticalStockItems();
      } else if (filters.status === STOCK_FILTERS.LOW) {
        filteredItems = await getLowStockItems();
      } else {
        filteredItems = await getAllItems({ activeOnly: true });
      }

      // Apply OK filter (above threshold)
      if (filters.status === STOCK_FILTERS.OK) {
        filteredItems = filteredItems.filter(item => {
          const percent = item.parLevel > 0
            ? (item.currentStock / item.parLevel) * 100
            : 100;
          return percent > STOCK_THRESHOLDS.LOW;
        });
      }

      // Apply category filter
      if (filters.category) {
        filteredItems = filteredItems.filter(
          item => item.category === filters.category
        );
      }

      // Apply vendor filter (only if not in IN_HOUSE view)
      if (filters.vendorId && viewMode !== VIEW_MODES.IN_HOUSE) {
        filteredItems = filteredItems.filter(
          item => item.vendorId === Number(filters.vendorId)
        );
      }

      // Apply department filter (for in-house items with sourceRecipeId)
      if (filters.department) {
        filteredItems = filteredItems.filter(
          item => item.sourceDepartment === filters.department
        );
      }

      // Apply search filter (client-side for quick response)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredItems = filteredItems.filter(
          item =>
            item.name.toLowerCase().includes(searchLower) ||
            item.sku?.toLowerCase().includes(searchLower) ||
            item.sourceRecipeName?.toLowerCase().includes(searchLower)
        );
      }

      setItems(filteredItems);
    } catch (err) {
      console.error('Failed to filter items:', err);
      setError('Failed to filter items. Please try again.');
    }
  }, [filters, loading, viewMode, internalVendorId]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when filters or viewMode change (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) {
        loadFilteredItems();
      }
    }, filters.search ? 300 : 0);

    return () => clearTimeout(timer);
  }, [filters, viewMode, loadFilteredItems, loading]);

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handle filter changes
   */
  const handleFilterChange = useCallback((filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value,
    }));
  }, []);

  /**
   * Handle view mode change
   */
  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
  }, []);

  /**
   * Handle item selection - open detail modal
   */
  const handleItemSelect = useCallback((item) => {
    setSelectedItemId(item.id);
    setDetailItem(item); // Open detail modal
    if (onItemSelect) {
      onItemSelect(item);
    }
  }, [onItemSelect]);

  /**
   * Close detail modal
   */
  const handleCloseDetail = useCallback(() => {
    setDetailItem(null);
  }, []);

  /**
   * Handle search from ItemSearchInput
   */
  const handleSearch = useCallback(async (query) => {
    if (!query.trim()) return [];
    try {
      return await searchItems(query, { limit: 20 });
    } catch (err) {
      console.error('Search failed:', err);
      return [];
    }
  }, []);

  /**
   * Handle search selection
   */
  const handleSearchSelect = useCallback((item) => {
    handleItemSelect(item);
    setFilters(prev => ({ ...prev, search: item.name }));
  }, [handleItemSelect]);

  /**
   * Handle generate orders
   */
  const handleGenerateOrders = useCallback(async () => {
    setGeneratingOrders(true);
    setError(null);

    try {
      // First, preview what will be generated
      const preview = await previewAutoOrders();
      setOrderPreview(preview);

      if (preview.ordersToCreate === 0) {
        setError('No items need reordering at this time.');
        return;
      }

      // Generate the orders
      const result = await generateOrdersFromLowStock();

      if (onGenerateOrders) {
        onGenerateOrders(result);
      }

      // Refresh data
      await loadData();

      setOrderPreview(null);
    } catch (err) {
      console.error('Failed to generate orders:', err);
      setError('Failed to generate orders. Please try again.');
    } finally {
      setGeneratingOrders(false);
    }
  }, [onGenerateOrders, loadData]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    loadData();
  }, [loadData]);

  /**
   * Handle export to PDF
   */
  const handleExportPDF = useCallback(async () => {
    try {
      // Fetch business info for letterhead
      let businessInfo = null;
      try {
        businessInfo = await getBusinessInfo();
      } catch (e) {
        console.log('Business info not available:', e.message);
      }

      // Build filter description
      const filterParts = [];
      if (filters.category) filterParts.push(`Category: ${filters.category}`);
      if (filters.status !== STOCK_FILTERS.ALL) filterParts.push(`Status: ${filters.status}`);
      if (filters.vendorId) {
        const vendor = vendors.find(v => v.id === filters.vendorId);
        if (vendor) filterParts.push(`Vendor: ${vendor.name}`);
      }
      const filterDescription = filterParts.join(', ') || 'All items';

      // Generate PDF based on filter
      let doc;
      let filename;

      if (filters.status === STOCK_FILTERS.LOW || filters.status === STOCK_FILTERS.CRITICAL) {
        // Low stock report
        doc = generateLowStockReportPDF(items, businessInfo);
        filename = `Low_Stock_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      } else {
        // Full inventory report
        doc = generateInventoryReportPDF(
          items,
          summary,
          businessInfo,
          {
            title: 'Inventory Report',
            filterDescription,
            includeValue: true,
            groupByCategory: viewMode === VIEW_MODES.BY_CATEGORY,
            groupByVendor: viewMode === VIEW_MODES.BY_VENDOR,
          }
        );
        filename = `Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      }

      downloadPDF(doc, filename);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError('Failed to generate PDF report. Please try again.');
    }
  }, [items, summary, filters, viewMode, vendors]);

  /**
   * Clear error
   */
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // ============================================
  // Computed Values
  // ============================================

  /**
   * Group items by view mode
   */
  const groupedItems = useMemo(() => {
    if (viewMode === VIEW_MODES.BY_ITEM) {
      return { 'All Items': items };
    }

    if (viewMode === VIEW_MODES.BY_VENDOR) {
      const groups = {};
      items.forEach(item => {
        const vendorName = item.vendorName || 'No Vendor';
        if (!groups[vendorName]) {
          groups[vendorName] = [];
        }
        groups[vendorName].push(item);
      });
      return groups;
    }

    if (viewMode === VIEW_MODES.BY_CATEGORY) {
      const groups = {};
      items.forEach(item => {
        const category = item.category || 'Uncategorized';
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(item);
      });
      return groups;
    }

    if (viewMode === VIEW_MODES.IN_HOUSE) {
      // Group in-house items by source department
      const groups = {};
      items.forEach(item => {
        const department = item.sourceDepartment || 'No Department';
        if (!groups[department]) {
          groups[department] = [];
        }
        groups[department].push(item);
      });
      return groups;
    }

    return { 'All Items': items };
  }, [items, viewMode]);

  /**
   * Sort groups alphabetically
   */
  const sortedGroups = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => {
      // Put placeholder groups at the end
      const placeholders = ['No Vendor', 'Uncategorized', 'No Department'];
      if (placeholders.includes(a)) return 1;
      if (placeholders.includes(b)) return -1;
      return a.localeCompare(b);
    });
  }, [groupedItems]);

  // ============================================
  // Render
  // ============================================

  const containerClasses = [
    styles.dashboard,
    className,
  ].filter(Boolean).join(' ');

  // Loading state
  if (loading && items.length === 0) {
    return (
      <div className={containerClasses}>
        <div className={styles.loadingContainer}>
          <Spinner size="large" label="Loading inventory..." />
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>Inventory Dashboard</h1>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={loading || items.length === 0}
            title="Export inventory report as PDF"
          >
            Export PDF
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerateOrders}
            disabled={loading || generatingOrders}
          >
            {generatingOrders ? 'Generating...' : 'Generate Orders'}
          </Button>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <Alert
          variant="danger"
          dismissible
          onDismiss={handleDismissError}
          className={styles.alert}
        >
          {error}
        </Alert>
      )}


      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <ItemSearchInput
            value={filters.search}
            onChange={(value) => handleFilterChange('search', value)}
            onSearch={handleSearch}
            onSelect={handleSearchSelect}
            placeholder="Search items..."
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="category-filter" className={styles.filterLabel}>
            Category
          </label>
          <select
            id="category-filter"
            className={styles.filterSelect}
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(cat => {
              // Handle both string and object formats defensively
              const catName = typeof cat === 'object' && cat !== null ? (cat.name || cat.id || String(cat)) : cat;
              return <option key={catName} value={catName}>{catName}</option>;
            })}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="status-filter" className={styles.filterLabel}>
            Stock Status
          </label>
          <select
            id="status-filter"
            className={styles.filterSelect}
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value={STOCK_FILTERS.ALL}>All Statuses</option>
            <option value={STOCK_FILTERS.CRITICAL}>Critical Only</option>
            <option value={STOCK_FILTERS.LOW}>Low Stock</option>
            <option value={STOCK_FILTERS.OK}>OK Only</option>
          </select>
        </div>

        {/* Vendor filter - hidden in In-House view */}
        {viewMode !== VIEW_MODES.IN_HOUSE && (
          <div className={styles.filterGroup}>
            <label htmlFor="vendor-filter" className={styles.filterLabel}>
              Vendor
            </label>
            <select
              id="vendor-filter"
              className={styles.filterSelect}
              value={filters.vendorId}
              onChange={(e) => handleFilterChange('vendorId', e.target.value)}
            >
              <option value="">All Vendors</option>
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Department filter - shown in In-House view */}
        {viewMode === VIEW_MODES.IN_HOUSE && departments.length > 0 && (
          <div className={styles.filterGroup}>
            <label htmlFor="department-filter" className={styles.filterLabel}>
              Department
            </label>
            <select
              id="department-filter"
              className={styles.filterSelect}
              value={filters.department}
              onChange={(e) => handleFilterChange('department', e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* View Mode Tabs */}
      <div className={styles.viewModes}>
        <button
          type="button"
          className={`${styles.viewModeTab} ${viewMode === VIEW_MODES.BY_ITEM ? styles.active : ''}`}
          onClick={() => handleViewModeChange(VIEW_MODES.BY_ITEM)}
          aria-pressed={viewMode === VIEW_MODES.BY_ITEM}
        >
          By Item
        </button>
        <button
          type="button"
          className={`${styles.viewModeTab} ${viewMode === VIEW_MODES.BY_VENDOR ? styles.active : ''}`}
          onClick={() => handleViewModeChange(VIEW_MODES.BY_VENDOR)}
          aria-pressed={viewMode === VIEW_MODES.BY_VENDOR}
        >
          By Vendor
        </button>
        <button
          type="button"
          className={`${styles.viewModeTab} ${viewMode === VIEW_MODES.BY_CATEGORY ? styles.active : ''}`}
          onClick={() => handleViewModeChange(VIEW_MODES.BY_CATEGORY)}
          aria-pressed={viewMode === VIEW_MODES.BY_CATEGORY}
        >
          By Category
        </button>
        <button
          type="button"
          className={`${styles.viewModeTab} ${viewMode === VIEW_MODES.IN_HOUSE ? styles.active : ''}`}
          onClick={() => handleViewModeChange(VIEW_MODES.IN_HOUSE)}
          aria-pressed={viewMode === VIEW_MODES.IN_HOUSE}
        >
          In-House
        </button>
      </div>

      {/* Items List */}
      <div className={styles.itemsContainer}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <Spinner size="medium" label="Updating..." />
          </div>
        )}

        {items.length === 0 && !loading ? (
          <div className={styles.emptyState}>
            {/* Check if inventory is truly empty vs filtered empty */}
            {summary?.totalItems === 0 ? (
              <>
                <span className={styles.emptyIcon}>📦</span>
                <h2>Build Your Inventory</h2>
                <p>Your inventory populates automatically from invoices.</p>
                <div className={styles.onboardingPrompt}>
                  <Button
                    variant="primary"
                    onClick={() => window.location.href = '/invoices/upload'}
                  >
                    Upload First Invoice
                  </Button>
                  <span className={styles.promptHint}>
                    Invoice items become inventory items with prices
                  </span>
                </div>
              </>
            ) : (
              <>
                <p>No items found matching your filters.</p>
                <Button variant="outline" onClick={handleRefresh}>
                  Clear Filters
                </Button>
              </>
            )}
          </div>
        ) : (
          sortedGroups.map(groupName => (
            <div key={groupName} className={styles.itemGroup}>
              {viewMode !== VIEW_MODES.BY_ITEM && (
                <h2 className={styles.groupHeader}>
                  {groupName}
                  <span className={styles.groupCount}>
                    ({groupedItems[groupName].length})
                  </span>
                </h2>
              )}
              <div className={styles.itemsList}>
                {groupedItems[groupName].map(item => (
                  <div
                    key={item.id}
                    className={`${styles.itemRow} ${selectedItemId === item.id ? styles.selected : ''}`}
                    onClick={() => handleItemSelect(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemSelect(item);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedItemId === item.id}
                  >
                    {/* Name */}
                    <span className={styles.rowName}>{item.name}</span>

                    {/* Qty / Weight */}
                    <span className={styles.rowStock}>
                      {(item.stockQuantity > 0 || item.stockWeight > 0) ? (
                        <>
                          {item.stockQuantity > 0 && (
                            <>{item.stockQuantity} {item.stockQuantityUnit || 'pc'}</>
                          )}
                          {item.stockQuantity > 0 && item.stockWeight > 0 && ' | '}
                          {item.stockWeight > 0 && (
                            <>{item.stockWeight} {item.stockWeightUnit || 'lb'}</>
                          )}
                        </>
                      ) : (
                        <>{item.currentStock || 0} {item.unit || 'units'}</>
                      )}
                    </span>

                    {/* Progress Bar */}
                    <div className={styles.rowProgress}>
                      <StockProgressBar
                        current={item.currentStock || 0}
                        full={item.parLevel || item.fullStock || 0}
                        unit={item.unit || 'units'}
                        size="compact"
                        showLabel={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Order Preview Modal (simplified inline) */}
      {orderPreview && orderPreview.ordersToCreate > 0 && (
        <div className={styles.orderPreview}>
          <h3>Order Preview</h3>
          <p>
            Ready to create <strong>{orderPreview.ordersToCreate}</strong> orders
            for <strong>{orderPreview.totalItems}</strong> items
            (Est. ${orderPreview.totalValue?.toFixed(2)})
          </p>
        </div>
      )}

      {/* Item Detail Modal - shows all fields */}
      {detailItem && (
        <InventoryItemAllFieldsModal
          item={detailItem}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

InventoryDashboard.propTypes = {
  /** Called when an item is selected */
  onItemSelect: PropTypes.func,
  /** Called after orders are generated */
  onGenerateOrders: PropTypes.func,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default InventoryDashboard;
