/**
 * GenerateOrdersModal Component
 *
 * Modal for auto-generating purchase orders based on low stock items.
 * Groups items by vendor and allows selection of which orders to create.
 */

import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/generateordersmodal.module.css';

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

/**
 * Stock status configuration
 */
const STOCK_STATUS = {
  critical: { label: 'Critical', className: 'critical', priority: 1 },
  low: { label: 'Low', className: 'low', priority: 2 },
  ok: { label: 'OK', className: 'ok', priority: 3 },
};

function GenerateOrdersModal({
  lowStockItems = [],
  vendors = [],
  onGenerate,
  onClose,
  loading = false,
}) {
  const [selectedVendors, setSelectedVendors] = useState(new Set());
  const [itemQuantities, setItemQuantities] = useState({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Group items by vendor
  const vendorGroups = useMemo(() => {
    const groups = new Map();

    lowStockItems.forEach((item) => {
      if (!item.vendorId) return;

      if (!groups.has(item.vendorId)) {
        const vendor = vendors.find((v) => v.id === item.vendorId);
        groups.set(item.vendorId, {
          vendorId: item.vendorId,
          vendorName: vendor?.name || 'Unknown Vendor',
          vendorCode: vendor?.vendorCode,
          items: [],
          totalValue: 0,
          criticalCount: 0,
          lowCount: 0,
        });
      }

      const group = groups.get(item.vendorId);
      const suggestedQty = calculateSuggestedQuantity(item);

      group.items.push({
        ...item,
        suggestedQty,
        stockStatus: getStockStatus(item),
      });

      group.totalValue += suggestedQty * (item.lastPrice || item.unitPrice || 0);

      const effectiveStock = item.stockQuantity ?? item.stockWeight ?? item.currentStock ?? 0;
      if (effectiveStock <= 0) {
        group.criticalCount++;
      } else if (effectiveStock <= (item.reorderPoint || 0)) {
        group.lowCount++;
      }
    });

    // Sort groups by critical count (most critical first)
    return Array.from(groups.values()).sort(
      (a, b) => b.criticalCount - a.criticalCount || b.lowCount - a.lowCount
    );
  }, [lowStockItems, vendors]);

  // Initialize quantities and selections
  useEffect(() => {
    const quantities = {};
    const initialSelection = new Set();

    vendorGroups.forEach((group) => {
      // Auto-select vendors with critical items
      if (group.criticalCount > 0) {
        initialSelection.add(group.vendorId);
      }

      group.items.forEach((item) => {
        quantities[item.id] = item.suggestedQty;
      });
    });

    setItemQuantities(quantities);
    setSelectedVendors(initialSelection);
  }, [vendorGroups]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Toggle vendor selection
  const handleVendorToggle = useCallback((vendorId) => {
    setSelectedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) {
        next.delete(vendorId);
      } else {
        next.add(vendorId);
      }
      return next;
    });
  }, []);

  // Select all vendors
  const handleSelectAll = useCallback(() => {
    setSelectedVendors(new Set(vendorGroups.map((g) => g.vendorId)));
  }, [vendorGroups]);

  // Deselect all vendors
  const handleDeselectAll = useCallback(() => {
    setSelectedVendors(new Set());
  }, []);

  // Update item quantity
  const handleQuantityChange = useCallback((itemId, quantity) => {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, quantity),
    }));
  }, []);

  // Calculate totals for selected vendors
  const selectedTotals = useMemo(() => {
    let orderCount = 0;
    let itemCount = 0;
    let totalValue = 0;

    vendorGroups.forEach((group) => {
      if (selectedVendors.has(group.vendorId)) {
        orderCount++;
        group.items.forEach((item) => {
          const qty = itemQuantities[item.id] || 0;
          if (qty > 0) {
            itemCount++;
            totalValue += qty * (item.lastPrice || item.unitPrice || 0);
          }
        });
      }
    });

    return { orderCount, itemCount, totalValue };
  }, [vendorGroups, selectedVendors, itemQuantities]);

  // Generate orders
  const handleGenerate = useCallback(async () => {
    if (selectedVendors.size === 0) {
      setError('Please select at least one vendor');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const ordersToCreate = vendorGroups
        .filter((group) => selectedVendors.has(group.vendorId))
        .map((group) => ({
          vendorId: group.vendorId,
          vendorName: group.vendorName,
          items: group.items
            .filter((item) => (itemQuantities[item.id] || 0) > 0)
            .map((item) => ({
              inventoryItemId: item.id,
              inventoryItemName: item.name,
              inventoryItemSku: item.sku,
              quantity: itemQuantities[item.id],
              unit: item.unit,
              unitPrice: item.lastPrice || item.unitPrice || 0,
              stockAtOrder: item.stockQuantity ?? item.stockWeight ?? 0,
            })),
        }))
        .filter((order) => order.items.length > 0);

      await onGenerate?.(ordersToCreate);
    } catch (err) {
      setError(err.message || 'Failed to generate orders');
    } finally {
      setGenerating(false);
    }
  }, [vendorGroups, selectedVendors, itemQuantities, onGenerate]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-orders-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id="generate-orders-title" className={styles.title}>
              Generate Purchase Orders
            </h2>
            <p className={styles.subtitle}>
              Create orders for items that need restocking
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>Loading inventory data...</span>
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {vendorGroups.length === 0 ? (
            <div className={styles.emptyState}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className={styles.emptyIcon}
              >
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
              <h3>All Stocked Up!</h3>
              <p>No items currently need restocking.</p>
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              <div className={styles.selectionControls}>
                <span className={styles.selectionInfo}>
                  {selectedVendors.size} of {vendorGroups.length} vendors selected
                </span>
                <div className={styles.selectionButtons}>
                  <button
                    type="button"
                    className={styles.selectButton}
                    onClick={handleSelectAll}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className={styles.selectButton}
                    onClick={handleDeselectAll}
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Vendor Groups */}
              <div className={styles.vendorGroups}>
                {vendorGroups.map((group) => (
                  <div
                    key={group.vendorId}
                    className={`${styles.vendorGroup} ${
                      selectedVendors.has(group.vendorId) ? styles.selected : ''
                    }`}
                  >
                    {/* Vendor Header */}
                    <div className={styles.vendorHeader}>
                      <label className={styles.vendorCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedVendors.has(group.vendorId)}
                          onChange={() => handleVendorToggle(group.vendorId)}
                        />
                        <span className={styles.vendorName}>
                          {group.vendorName}
                          {group.vendorCode && (
                            <span className={styles.vendorCode}>({group.vendorCode})</span>
                          )}
                        </span>
                      </label>
                      <div className={styles.vendorStats}>
                        {group.criticalCount > 0 && (
                          <span className={`${styles.badge} ${styles.critical}`}>
                            {group.criticalCount} critical
                          </span>
                        )}
                        {group.lowCount > 0 && (
                          <span className={`${styles.badge} ${styles.low}`}>
                            {group.lowCount} low
                          </span>
                        )}
                        <span className={styles.vendorTotal}>
                          {formatCurrency(group.totalValue)}
                        </span>
                      </div>
                    </div>

                    {/* Items List */}
                    {selectedVendors.has(group.vendorId) && (
                      <div className={styles.itemsList}>
                        {group.items.map((item) => (
                          <div key={item.id} className={styles.itemRow}>
                            <div className={styles.itemInfo}>
                              <span className={styles.itemName}>{item.name}</span>
                              {item.sku && (
                                <span className={styles.itemSku}>{item.sku}</span>
                              )}
                              <span
                                className={`${styles.stockBadge} ${
                                  styles[item.stockStatus.className]
                                }`}
                              >
                                Stock: {item.stockQuantity ?? item.stockWeight ?? 0} / {item.reorderPoint || 0}
                              </span>
                            </div>
                            <div className={styles.itemQuantity}>
                              <input
                                type="number"
                                className={styles.quantityInput}
                                value={itemQuantities[item.id] || 0}
                                onChange={(e) =>
                                  handleQuantityChange(item.id, parseInt(e.target.value) || 0)
                                }
                                min="0"
                                aria-label={`Quantity for ${item.name}`}
                              />
                              <span className={styles.unit}>{item.unit || 'ea'}</span>
                            </div>
                            <div className={styles.itemPrice}>
                              {formatCurrency(item.lastPrice || item.unitPrice || 0)}
                            </div>
                            <div className={styles.itemTotal}>
                              {formatCurrency(
                                (itemQuantities[item.id] || 0) *
                                  (item.lastPrice || item.unitPrice || 0)
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.summary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Orders</span>
              <span className={styles.summaryValue}>{selectedTotals.orderCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Items</span>
              <span className={styles.summaryValue}>{selectedTotals.itemCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Total</span>
              <span className={styles.summaryValue}>
                {formatCurrency(selectedTotals.totalValue)}
              </span>
            </div>
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={generating}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.generateButton}
              onClick={handleGenerate}
              disabled={generating || selectedVendors.size === 0 || vendorGroups.length === 0}
            >
              {generating ? 'Generating...' : `Generate ${selectedTotals.orderCount} Order${selectedTotals.orderCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate suggested order quantity
 */
function calculateSuggestedQuantity(item) {
  const currentStock = item.stockQuantity ?? item.stockWeight ?? 0;
  const reorderPoint = item.reorderPoint || 0;
  const parLevel = item.parQuantity ?? item.parWeight ?? reorderPoint * 2;

  // Order enough to reach par level
  const needed = Math.max(0, parLevel - currentStock);

  // Round up to minimum order quantity if set
  const minOrder = item.minOrderQty || 1;
  return Math.ceil(needed / minOrder) * minOrder;
}

/**
 * Get stock status
 */
function getStockStatus(item) {
  const currentStock = item.stockQuantity ?? item.stockWeight ?? 0;
  const reorderPoint = item.reorderPoint || 0;

  if (currentStock <= 0) return STOCK_STATUS.critical;
  if (currentStock <= reorderPoint) return STOCK_STATUS.low;
  return STOCK_STATUS.ok;
}

GenerateOrdersModal.propTypes = {
  lowStockItems: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      sku: PropTypes.string,
      vendorId: PropTypes.string,
      stockQuantity: PropTypes.number,
      stockWeight: PropTypes.number,
      reorderPoint: PropTypes.number,
      parQuantity: PropTypes.number,
      parWeight: PropTypes.number,
      unit: PropTypes.string,
      lastPrice: PropTypes.number,
      unitPrice: PropTypes.number,
      minOrderQty: PropTypes.number,
    })
  ),
  vendors: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      vendorCode: PropTypes.string,
    })
  ),
  onGenerate: PropTypes.func,
  onClose: PropTypes.func,
  loading: PropTypes.bool,
};

export default memo(GenerateOrdersModal);
