/**
 * InvoiceLineList Component
 *
 * Container for displaying and managing a list of invoice lines.
 * Handles selection, filtering, and summary calculations.
 *
 * @module components/invoice/InvoiceLineList
 */

import { memo, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import InvoiceLineItem from './InvoiceLineItem';
import { LINE_CATEGORY, getCategoryDisplay } from '../../services/invoice/lineCategorizer';
import styles from '../../styles/components/invoicelinelist.module.css';

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
 * InvoiceLineList - Container for invoice line items
 */
function InvoiceLineList({
  lines = [],
  onLineEdit,
  onSelectionChange,
  showFilters = true,
  showSummary = true,
  showSelectAll = true,
  compact = false,
}) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Filter state
  const [activeFilter, setActiveFilter] = useState('all');
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

  // Calculate counts by category (using AI categories from Vision pipeline)
  const categoryCounts = useMemo(() => {
    const counts = {
      all: lines.length,
      [LINE_CATEGORY.FOOD]: 0,
      [LINE_CATEGORY.PACKAGING]: 0,
      [LINE_CATEGORY.SUPPLY]: 0,
      [LINE_CATEGORY.FEE]: 0,
      [LINE_CATEGORY.DIVERS]: 0,
      anomalies: 0,
    };

    lines.forEach(line => {
      // Count by AI category
      const cat = line.category || LINE_CATEGORY.DIVERS;
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts[LINE_CATEGORY.DIVERS]++;
      }

      // Count anomalies
      if (line.anomalies?.length > 0 || line.lineWarnings?.length > 0) {
        counts.anomalies++;
      }
    });

    return counts;
  }, [lines]);

  // Filter lines
  const filteredLines = useMemo(() => {
    let filtered = lines;

    // Apply category filter (using AI categories)
    if (activeFilter !== 'all') {
      filtered = filtered.filter(line => {
        const cat = line.category || LINE_CATEGORY.DIVERS;
        return cat === activeFilter;
      });
    }

    // Apply anomalies filter
    if (showAnomaliesOnly) {
      filtered = filtered.filter(line =>
        line.anomalies?.length > 0 || line.lineWarnings?.length > 0
      );
    }

    return filtered;
  }, [lines, activeFilter, showAnomaliesOnly]);

  // Calculate summary for selected/filtered lines
  const summary = useMemo(() => {
    const selectedLines = selectedIds.size > 0
      ? filteredLines.filter(l => selectedIds.has(l.id || l.lineNumber))
      : filteredLines;

    let subtotal = 0;
    let productsTotal = 0;
    let feesTotal = 0;

    selectedLines.forEach(line => {
      const amount = line.totalPrice || 0;
      subtotal += amount;

      // FEE category items go to fees, everything else to products
      if (line.category === LINE_CATEGORY.FEE) {
        feesTotal += amount;
      } else {
        productsTotal += amount;
      }
    });

    return {
      lineCount: selectedLines.length,
      subtotal,
      productsTotal,
      feesTotal,
    };
  }, [filteredLines, selectedIds]);

  // Toggle line selection
  const handleToggle = useCallback((lineId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [onSelectionChange]);

  // Select all visible lines
  const handleSelectAll = useCallback(() => {
    const allIds = new Set(filteredLines.map(l => l.id || l.lineNumber));
    setSelectedIds(allIds);
    onSelectionChange?.(Array.from(allIds));
  }, [filteredLines, onSelectionChange]);

  // Deselect all
  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // Check if all visible are selected
  const allSelected = filteredLines.length > 0 &&
    filteredLines.every(l => selectedIds.has(l.id || l.lineNumber));

  // Filter button component
  const FilterButton = ({ filterKey, label, icon, count }) => (
    <button
      type="button"
      className={`${styles.filterButton} ${activeFilter === filterKey ? styles.active : ''}`}
      onClick={() => setActiveFilter(filterKey)}
      disabled={count === 0}
    >
      {icon && <span className={styles.filterIcon}>{icon}</span>}
      <span>{label}</span>
      <span className={styles.filterCount}>{count}</span>
    </button>
  );

  return (
    <div className={styles.container}>
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HEADER: Filters + Selection Controls                          */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {(showFilters || showSelectAll) && (
        <div className={styles.header}>
          {/* Filter Tabs - AI Categories */}
          {showFilters && (
            <div className={styles.filters}>
              <FilterButton filterKey="all" label="All" count={categoryCounts.all} />

              {categoryCounts[LINE_CATEGORY.FOOD] > 0 && (
                <FilterButton
                  filterKey={LINE_CATEGORY.FOOD}
                  label={getCategoryDisplay(LINE_CATEGORY.FOOD).label}
                  icon={getCategoryDisplay(LINE_CATEGORY.FOOD).icon}
                  count={categoryCounts[LINE_CATEGORY.FOOD]}
                />
              )}
              {categoryCounts[LINE_CATEGORY.PACKAGING] > 0 && (
                <FilterButton
                  filterKey={LINE_CATEGORY.PACKAGING}
                  label={getCategoryDisplay(LINE_CATEGORY.PACKAGING).label}
                  icon={getCategoryDisplay(LINE_CATEGORY.PACKAGING).icon}
                  count={categoryCounts[LINE_CATEGORY.PACKAGING]}
                />
              )}
              {categoryCounts[LINE_CATEGORY.SUPPLY] > 0 && (
                <FilterButton
                  filterKey={LINE_CATEGORY.SUPPLY}
                  label={getCategoryDisplay(LINE_CATEGORY.SUPPLY).label}
                  icon={getCategoryDisplay(LINE_CATEGORY.SUPPLY).icon}
                  count={categoryCounts[LINE_CATEGORY.SUPPLY]}
                />
              )}
              {categoryCounts[LINE_CATEGORY.FEE] > 0 && (
                <FilterButton
                  filterKey={LINE_CATEGORY.FEE}
                  label={getCategoryDisplay(LINE_CATEGORY.FEE).label}
                  icon={getCategoryDisplay(LINE_CATEGORY.FEE).icon}
                  count={categoryCounts[LINE_CATEGORY.FEE]}
                />
              )}
              {categoryCounts[LINE_CATEGORY.DIVERS] > 0 && (
                <FilterButton
                  filterKey={LINE_CATEGORY.DIVERS}
                  label={getCategoryDisplay(LINE_CATEGORY.DIVERS).label}
                  icon={getCategoryDisplay(LINE_CATEGORY.DIVERS).icon}
                  count={categoryCounts[LINE_CATEGORY.DIVERS]}
                />
              )}

              {/* Anomalies toggle */}
              {categoryCounts.anomalies > 0 && (
                <button
                  type="button"
                  className={`${styles.filterButton} ${styles.anomalyFilter} ${showAnomaliesOnly ? styles.active : ''}`}
                  onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
                >
                  <span className={styles.filterIcon}>⚠️</span>
                  <span>Issues</span>
                  <span className={styles.filterCount}>{categoryCounts.anomalies}</span>
                </button>
              )}
            </div>
          )}

          {/* Selection Controls */}
          {showSelectAll && (
            <div className={styles.selectionControls}>
              <span className={styles.selectionCount}>
                {selectedIds.size} of {filteredLines.length} selected
              </span>
              <button
                type="button"
                className={styles.selectButton}
                onClick={allSelected ? handleDeselectAll : handleSelectAll}
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* LINE ITEMS                                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className={styles.lineList}>
        {filteredLines.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📋</span>
            <p>No lines to display</p>
            {showAnomaliesOnly && (
              <button
                type="button"
                className={styles.clearFilterButton}
                onClick={() => setShowAnomaliesOnly(false)}
              >
                Show all lines
              </button>
            )}
          </div>
        ) : (
          filteredLines.map((line, index) => (
            <InvoiceLineItem
              key={line.id ?? `line-${index}`}
              line={line}
              selected={selectedIds.has(line.id ?? line.lineNumber)}
              onToggle={handleToggle}
              onEdit={onLineEdit}
              showCheckbox={showSelectAll}
              compact={compact}
            />
          ))
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SUMMARY FOOTER                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showSummary && filteredLines.length > 0 && (
        <div className={styles.footer}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Lines</span>
              <span className={styles.summaryValue}>{summary.lineCount}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Products</span>
              <span className={styles.summaryValue}>{formatCurrency(summary.productsTotal)}</span>
            </div>
            {summary.feesTotal !== 0 && (
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Fees</span>
                <span className={styles.summaryValue}>{formatCurrency(summary.feesTotal)}</span>
              </div>
            )}
            <div className={`${styles.summaryItem} ${styles.total}`}>
              <span className={styles.summaryLabel}>Subtotal</span>
              <span className={styles.summaryValue}>{formatCurrency(summary.subtotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

InvoiceLineList.propTypes = {
  /** Array of line items */
  lines: PropTypes.arrayOf(PropTypes.object),
  /** Callback when line edit is clicked */
  onLineEdit: PropTypes.func,
  /** Callback when selection changes */
  onSelectionChange: PropTypes.func,
  /** Show filter tabs */
  showFilters: PropTypes.bool,
  /** Show summary footer */
  showSummary: PropTypes.bool,
  /** Show select all checkbox */
  showSelectAll: PropTypes.bool,
  /** Compact display mode */
  compact: PropTypes.bool,
};

export default memo(InvoiceLineList);
