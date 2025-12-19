/**
 * OrderList Component
 *
 * Displays a list of purchase orders with sorting, filtering, and view modes.
 * Supports grid and list layouts with summary statistics.
 */

import { memo, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import OrderCard from './OrderCard';
import styles from '../../styles/components/orderlist.module.css';

// Sort options
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'number-asc', label: 'Order # (A-Z)' },
  { value: 'number-desc', label: 'Order # (Z-A)' },
  { value: 'total-desc', label: 'Total (High-Low)' },
  { value: 'total-asc', label: 'Total (Low-High)' },
  { value: 'vendor-asc', label: 'Vendor (A-Z)' },
  { value: 'delivery-asc', label: 'Delivery Date' },
];

// Status filter options
const STATUS_FILTERS = [
  { value: 'all', label: 'All Orders' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'receiving', label: 'Receiving' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Active statuses (not completed or cancelled)
const ACTIVE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'confirmed',
  'partially_received',
];

// Receiving statuses
const RECEIVING_STATUSES = ['sent', 'confirmed', 'partially_received'];

// Completed statuses
const COMPLETED_STATUSES = ['received', 'closed'];

/**
 * Format currency value
 */
const formatCurrency = (value) => {
  if (value == null || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value);
};

function OrderList({
  orders = [],
  loading = false,
  emptyMessage = 'No orders found',
  selectedId,
  onOrderClick,
  onOrderEdit,
  onOrderSend,
  onOrderReceive,
}) {
  const [sortBy, setSortBy] = useState('date-desc');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState('grid');

  // Filter orders by status
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    return orders.filter((order) => {
      switch (statusFilter) {
        case 'all':
          return true;
        case 'active':
          return ACTIVE_STATUSES.includes(order.status);
        case 'receiving':
          return RECEIVING_STATUSES.includes(order.status);
        case 'completed':
          return COMPLETED_STATUSES.includes(order.status);
        default:
          return order.status === statusFilter;
      }
    });
  }, [orders, statusFilter]);

  // Sort filtered orders
  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    const [field, direction] = sortBy.split('-');
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (field) {
        case 'date':
          return multiplier * (new Date(a.createdAt) - new Date(b.createdAt));
        case 'number':
          return multiplier * (a.orderNumber || '').localeCompare(b.orderNumber || '');
        case 'total':
          return multiplier * ((a.total || 0) - (b.total || 0));
        case 'vendor':
          return multiplier * (a.vendorName || '').localeCompare(b.vendorName || '');
        case 'delivery':
          if (!a.expectedDeliveryDate && !b.expectedDeliveryDate) return 0;
          if (!a.expectedDeliveryDate) return 1;
          if (!b.expectedDeliveryDate) return -1;
          return (
            multiplier * (new Date(a.expectedDeliveryDate) - new Date(b.expectedDeliveryDate))
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [filteredOrders, sortBy]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    const pendingTotal = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const awaitingReceiving = orders.filter((o) => RECEIVING_STATUSES.includes(o.status)).length;
    const needsApproval = orders.filter((o) => o.status === 'pending_approval').length;

    return {
      total: orders.length,
      active: activeOrders.length,
      pendingTotal,
      awaitingReceiving,
      needsApproval,
    };
  }, [orders]);

  // Handlers
  const handleSortChange = useCallback((e) => {
    setSortBy(e.target.value);
  }, []);

  const handleStatusFilterChange = useCallback((e) => {
    setStatusFilter(e.target.value);
  }, []);

  const handleSetGridView = useCallback(() => {
    setViewMode('grid');
  }, []);

  const handleSetListView = useCallback(() => {
    setViewMode('list');
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Loading orders...</span>
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
            {sortedOrders.length} {sortedOrders.length === 1 ? 'order' : 'orders'}
            {stats.active > 0 && statusFilter !== 'active' && ` (${stats.active} active)`}
          </span>
          {stats.pendingTotal > 0 && statusFilter === 'active' && (
            <span className={styles.pendingTotal}>
              {formatCurrency(stats.pendingTotal)} pending
            </span>
          )}
          {stats.needsApproval > 0 && (
            <span className={styles.alertCount}>{stats.needsApproval} need approval</span>
          )}
          {stats.awaitingReceiving > 0 && (
            <span className={styles.receivingCount}>{stats.awaitingReceiving} awaiting delivery</span>
          )}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {/* Status Filter */}
          <div className={styles.filterGroup}>
            <label htmlFor="status-filter" className={styles.filterLabel}>
              Status
            </label>
            <select
              id="status-filter"
              className={styles.filterSelect}
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className={styles.sortGroup}>
            <label htmlFor="sort-select" className={styles.sortLabel}>
              Sort
            </label>
            <select
              id="sort-select"
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
          <div className={styles.viewModes}>
            <button
              type="button"
              className={`${styles.viewModeButton} ${viewMode === 'grid' ? styles.active : ''}`}
              onClick={handleSetGridView}
              title="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.viewModeButton} ${viewMode === 'list' ? styles.active : ''}`}
              onClick={handleSetListView}
              title="List view"
              aria-pressed={viewMode === 'list'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* Orders Container */}
      {sortedOrders.length === 0 ? (
        <div className={styles.emptyState}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={styles.emptyIcon}
          >
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
          </svg>
          <p className={styles.emptyText}>{emptyMessage}</p>
          {statusFilter !== 'all' && (
            <button
              type="button"
              className={styles.showAllButton}
              onClick={() => setStatusFilter('all')}
            >
              Show all orders
            </button>
          )}
        </div>
      ) : (
        <div
          className={`${styles.orderContainer} ${
            viewMode === 'grid' ? styles.gridView : styles.listView
          }`}
        >
          {sortedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={onOrderClick}
              onEdit={onOrderEdit}
              onSend={onOrderSend}
              onReceive={onOrderReceive}
              compact={viewMode === 'list'}
              selected={order.id === selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

OrderList.propTypes = {
  orders: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      orderNumber: PropTypes.string,
      status: PropTypes.string.isRequired,
      vendorName: PropTypes.string,
      total: PropTypes.number,
      createdAt: PropTypes.string,
      expectedDeliveryDate: PropTypes.string,
    })
  ),
  loading: PropTypes.bool,
  emptyMessage: PropTypes.string,
  selectedId: PropTypes.string,
  onOrderClick: PropTypes.func,
  onOrderEdit: PropTypes.func,
  onOrderSend: PropTypes.func,
  onOrderReceive: PropTypes.func,
};

export default memo(OrderList);
