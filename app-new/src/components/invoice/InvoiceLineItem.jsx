/**
 * InvoiceLineItem Component
 *
 * Two-row display for invoice line items with visual category tags.
 * Row 1: Checkbox, Tag, Name/SKU
 * Row 2: Quantity, Format, Weight/Units, Pricing, Total, Validation
 *
 * @module components/invoice/InvoiceLineItem
 */

import { memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { getCategoryDisplay, LINE_CATEGORY, PRICING_TYPE, LINE_TYPE } from '../../services/invoice/lineCategorizer';
import styles from '../../styles/components/invoicelineitem.module.css';

/**
 * Format currency value
 */
const formatCurrency = (value) => {
  if (value == null || isNaN(value)) return '-';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format small currency (for per-unit pricing)
 */
const formatSmallCurrency = (value) => {
  if (value == null || isNaN(value)) return '-';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
};

/**
 * InvoiceLineItem - Two-row invoice line display
 */
function InvoiceLineItem({
  line,
  selected = false,
  onToggle,
  onEdit,
  showCheckbox = true,
  compact = false,
}) {
  // Get tag configuration from category
  const tag = getCategoryDisplay(line.category || LINE_CATEGORY.DIVERS);

  // Derive pricingType from category if not explicitly set (for database records)
  const effectivePricingType = line.pricingType || (() => {
    const cat = line.category;
    if (cat === LINE_CATEGORY.PACKAGING || cat === LINE_CATEGORY.SUPPLY) {
      return PRICING_TYPE.UNIT;
    }
    if (cat === LINE_CATEGORY.FEE || cat === LINE_CATEGORY.DIVERS) {
      return PRICING_TYPE.UNIT;
    }
    return PRICING_TYPE.WEIGHT;
  })();

  // Calculate totalUnits for packaging if not set (from database fields)
  const effectiveTotalUnits = line.totalUnits || (() => {
    if (effectivePricingType !== PRICING_TYPE.UNIT) return null;
    const packCount = line.packCount || 1;
    const unitsPerPack = line.unitsPerPack || line.totalUnitsPerCase || 1;
    const qty = line.quantity || 1;
    // If we have boxing format info, calculate total units
    if (line.totalUnitsPerCase > 1) {
      return line.totalUnitsPerCase * qty;
    }
    if (packCount > 1 || unitsPerPack > 1) {
      return packCount * unitsPerPack * qty;
    }
    return qty; // Fallback to quantity
  })();

  // Calculate pricePerUnit if not set
  const effectivePricePerUnit = line.pricePerUnit || (() => {
    if (effectivePricingType !== PRICING_TYPE.UNIT) return null;
    if (!line.unitPrice || !line.totalUnitsPerCase) return null;
    if (line.totalUnitsPerCase <= 1) return line.unitPrice;
    return line.unitPrice / line.totalUnitsPerCase;
  })();

  // Handle checkbox toggle
  const handleToggle = useCallback(() => {
    onToggle?.(line.id || line.lineNumber);
  }, [line.id, line.lineNumber, onToggle]);

  // Handle edit click
  const handleEdit = useCallback(() => {
    onEdit?.(line);
  }, [line, onEdit]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onEdit) {
        handleEdit();
      } else if (onToggle) {
        handleToggle();
      }
    }
  }, [handleEdit, handleToggle, onEdit, onToggle]);

  // Determine if line has issues
  const hasAnomalies = line.anomalies?.length > 0;
  const hasMathError = line.mathValid === false;

  // Build container classes
  const containerClasses = [
    styles.lineItem,
    selected && styles.selected,
    compact && styles.compact,
    hasAnomalies && styles.hasWarning,
    hasMathError && styles.hasError,
    line.lineType === LINE_TYPE.CREDIT && styles.isCredit,
    line.lineType === LINE_TYPE.FEE && styles.isFee,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={containerClasses}
      onClick={onEdit ? handleEdit : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={onEdit ? 0 : undefined}
      role={onEdit ? 'button' : undefined}
      aria-label={`Line ${line.lineNumber}: ${line.description}`}
    >
      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ROW 1: Checkbox + Tag + Name                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className={styles.primaryRow}>
        {/* Checkbox */}
        {showCheckbox && (
          <label className={styles.checkboxWrapper} onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={handleToggle}
              className={styles.checkbox}
              aria-label={`Select line ${line.lineNumber}`}
            />
            <span className={styles.checkboxCustom}>
              {selected && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              )}
            </span>
          </label>
        )}

        {/* Category Tag */}
        <div
          className={styles.tag}
          style={{
            color: tag.color,
            backgroundColor: tag.bgColor,
            borderColor: tag.color,
          }}
        >
          <span className={styles.tagIcon}>{tag.icon}</span>
          <span className={styles.tagLabel}>{tag.label}</span>
        </div>

        {/* Name and SKU */}
        <div className={styles.nameBlock}>
          <span className={styles.name}>{line.description || line.name || 'Unknown Item'}</span>
          {line.sku && <span className={styles.sku}>SKU: {line.sku}</span>}
          {line.itemCode && !line.sku && <span className={styles.sku}>{line.itemCode}</span>}
        </div>

        {/* Right side indicators */}
        <div className={styles.indicators}>
          {/* Anomaly count */}
          {hasAnomalies && (
            <span className={styles.anomalyBadge} title={line.anomalies.map(a => a.message).join('\n')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {line.anomalies.length}
            </span>
          )}

          {/* Confidence indicator */}
          {line.confidence != null && (
            <span
              className={`${styles.confidenceBadge} ${
                line.confidence >= 80 ? styles.high :
                line.confidence >= 60 ? styles.medium : styles.low
              }`}
              title={`Confidence: ${line.confidence}%`}
            >
              {line.confidence}%
            </span>
          )}

          {/* Edit button */}
          {onEdit && (
            <button
              type="button"
              className={styles.editButton}
              onClick={(e) => { e.stopPropagation(); handleEdit(); }}
              aria-label="Edit line"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ROW 2: Details                                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div className={styles.detailsRow}>
        {/* Quantity */}
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Qty</span>
          <span className={styles.detailValue}>{line.quantity || 0}</span>
        </div>

        {/* Format (if available) */}
        {line.format && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Format</span>
            <span className={styles.detailValue}>{line.format}</span>
          </div>
        )}

        {/* Weight-based details */}
        {effectivePricingType === PRICING_TYPE.WEIGHT && (
          <>
            {line.weight?.total > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Weight</span>
                <span className={styles.detailValue}>
                  {line.weight.total} {line.weight.unit || 'lb'}
                </span>
              </div>
            )}
            {line.pricePerLb > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>$/lb</span>
                <span className={styles.detailValue}>{formatSmallCurrency(line.pricePerLb)}</span>
              </div>
            )}
            {line.pricePerKg > 0 && !line.pricePerLb && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>$/kg</span>
                <span className={styles.detailValue}>{formatSmallCurrency(line.pricePerKg)}</span>
              </div>
            )}
          </>
        )}

        {/* Unit-based details (packaging) */}
        {effectivePricingType === PRICING_TYPE.UNIT && (
          <>
            {/* Boxing format (e.g., 1/500, 6/RL) */}
            {(line.boxingFormat || line.format) && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Pack</span>
                <span className={styles.detailValue}>{line.boxingFormat || line.format}</span>
              </div>
            )}
            {/* Total units ordered */}
            {effectiveTotalUnits > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Units</span>
                <span className={styles.detailValue}>
                  {effectiveTotalUnits.toLocaleString()} pcs
                  {line.totalUnitsPerCase > 1 && (
                    <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
                      {' '}({line.quantity} × {line.totalUnitsPerCase.toLocaleString()})
                    </span>
                  )}
                </span>
              </div>
            )}
            {effectivePricePerUnit > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>$/ea</span>
                <span className={styles.detailValue}>{formatSmallCurrency(effectivePricePerUnit)}</span>
              </div>
            )}
          </>
        )}

        {/* Volume-based details (beverages) */}
        {effectivePricingType === PRICING_TYPE.VOLUME && (
          <>
            {line.totalVolume > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Volume</span>
                <span className={styles.detailValue}>
                  {line.totalVolume} {line.volumeUnit || 'ml'}
                </span>
              </div>
            )}
            {line.pricePerL > 0 && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>$/L</span>
                <span className={styles.detailValue}>{formatSmallCurrency(line.pricePerL)}</span>
              </div>
            )}
          </>
        )}

        {/* Unit Price (always show) */}
        {line.unitPrice > 0 && (
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Unit</span>
            <span className={styles.detailValue}>{formatCurrency(line.unitPrice)}</span>
          </div>
        )}

        {/* Spacer to push total to right */}
        <div className={styles.detailSpacer} />

        {/* Total Price */}
        <div className={`${styles.detailItem} ${styles.totalPrice}`}>
          <span className={styles.detailLabel}>Total</span>
          <span className={styles.detailValue}>
            {line.lineType === LINE_TYPE.CREDIT && line.totalPrice > 0 && '-'}
            {formatCurrency(Math.abs(line.totalPrice || 0))}
          </span>
        </div>

        {/* Math Validation Status */}
        <div className={`${styles.validationBadge} ${line.mathValid ? styles.valid : styles.invalid}`}>
          {line.mathValid ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12" />
              </svg>
              <span>Valid</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Check</span>
            </>
          )}
        </div>

        {/* Routing indicator for fees/credits */}
        {(line.lineType === LINE_TYPE.FEE || line.lineType === LINE_TYPE.CREDIT) && (
          <div className={styles.routingBadge}>
            Accounting Only
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ANOMALY ROW (if any)                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {hasAnomalies && (
        <div className={styles.anomalyRow}>
          {line.anomalies.slice(0, 2).map((anomaly, idx) => (
            <div
              key={idx}
              className={`${styles.anomalyItem} ${styles[anomaly.severity] || ''}`}
            >
              <span className={styles.anomalyType}>{anomaly.type}</span>
              <span className={styles.anomalyMessage}>{anomaly.message}</span>
            </div>
          ))}
          {line.anomalies.length > 2 && (
            <span className={styles.moreAnomalies}>
              +{line.anomalies.length - 2} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

InvoiceLineItem.propTypes = {
  /** Line item data */
  line: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    lineNumber: PropTypes.number,
    description: PropTypes.string,
    name: PropTypes.string,
    sku: PropTypes.string,
    itemCode: PropTypes.string,
    quantity: PropTypes.number,
    unitPrice: PropTypes.number,
    totalPrice: PropTypes.number,
    format: PropTypes.string,
    lineType: PropTypes.string,
    category: PropTypes.string,
    pricingType: PropTypes.string,
    weight: PropTypes.shape({
      total: PropTypes.number,
      unit: PropTypes.string,
    }),
    pricePerLb: PropTypes.number,
    pricePerKg: PropTypes.number,
    pricePerUnit: PropTypes.number,
    pricePerL: PropTypes.number,
    totalUnits: PropTypes.number,
    totalUnitsPerCase: PropTypes.number,
    boxingFormat: PropTypes.string,
    totalVolume: PropTypes.number,
    volumeUnit: PropTypes.string,
    mathValid: PropTypes.bool,
    confidence: PropTypes.number,
    anomalies: PropTypes.arrayOf(PropTypes.shape({
      type: PropTypes.string,
      severity: PropTypes.string,
      message: PropTypes.string,
    })),
  }).isRequired,
  /** Whether line is selected */
  selected: PropTypes.bool,
  /** Callback when checkbox toggled */
  onToggle: PropTypes.func,
  /** Callback when edit clicked */
  onEdit: PropTypes.func,
  /** Show checkbox */
  showCheckbox: PropTypes.bool,
  /** Compact mode */
  compact: PropTypes.bool,
};

export default memo(InvoiceLineItem);
