/**
 * LineEditModal Component
 *
 * Modal dialog for editing invoice line item details.
 * Allows correction of parsed data before saving to inventory.
 *
 * @module components/invoice/LineEditModal
 */

import { memo, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { LINE_TYPE, LINE_CATEGORY, PRICING_TYPE, getCategoryDisplay } from '../../services/invoice/lineCategorizer';
import styles from '../../styles/components/lineeditmodal.module.css';

/**
 * LineEditModal - Edit dialog for invoice line items
 */
function LineEditModal({
  line,
  isOpen,
  onClose,
  onSave,
}) {
  // Form state
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});

  // Initialize form when line changes
  useEffect(() => {
    if (line && isOpen) {
      setFormData({
        description: line.description || line.name || '',
        itemCode: line.itemCode || line.sku || '',
        quantity: line.quantity || 0,
        unitPrice: line.unitPrice || 0,
        totalPrice: line.totalPrice || 0,
        format: line.format || '',
        weight: line.weight?.total || line.weight || 0,
        weightUnit: line.weight?.unit || line.weightUnit || 'lb',
        pricePerLb: line.pricePerLb || 0,
        lineType: line.lineType || LINE_TYPE.PRODUCT,
        category: line.category || LINE_CATEGORY.FOOD,
        pricingType: line.pricingType || PRICING_TYPE.WEIGHT,
      });
      setErrors({});
    }
  }, [line, isOpen]);

  // Handle field change
  const handleChange = useCallback((field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };

      // Auto-recalculate total when qty or unit price changes
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(prev.quantity) || 0;
        const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(prev.unitPrice) || 0;
        next.totalPrice = qty * price;
      }

      return next;
    });

    // Clear error for this field
    setErrors(prev => ({ ...prev, [field]: null }));
  }, []);

  // Validate form
  const validate = useCallback(() => {
    const newErrors = {};

    if (!formData.description?.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.quantity <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }

    if (formData.lineType === LINE_TYPE.PRODUCT && formData.totalPrice <= 0) {
      newErrors.totalPrice = 'Total price must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle save
  const handleSave = useCallback(() => {
    if (!validate()) return;

    // Build updated line object
    const updatedLine = {
      ...line,
      description: formData.description,
      name: formData.description,
      itemCode: formData.itemCode,
      sku: formData.itemCode,
      quantity: parseFloat(formData.quantity) || 0,
      unitPrice: parseFloat(formData.unitPrice) || 0,
      totalPrice: parseFloat(formData.totalPrice) || 0,
      format: formData.format,
      weight: formData.weight > 0 ? {
        total: parseFloat(formData.weight),
        unit: formData.weightUnit,
      } : null,
      weightUnit: formData.weightUnit,
      pricePerLb: parseFloat(formData.pricePerLb) || 0,
      lineType: formData.lineType,
      category: formData.category,
      pricingType: formData.pricingType,
      // Get tag from getCategoryDisplay based on category
      tagKey: formData.category || LINE_CATEGORY.DIVERS,
      tag: getCategoryDisplay(formData.category || LINE_CATEGORY.DIVERS),
      // Mark as user-edited
      userEdited: true,
      editedAt: new Date().toISOString(),
    };

    onSave(updatedLine);
    onClose();
  }, [line, formData, validate, onSave, onClose]);

  // Handle keyboard
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  }, [onClose, handleSave]);

  // Don't render if not open
  if (!isOpen || !line) return null;

  // Get current tag for display
  const currentTag = getCategoryDisplay(formData.category || LINE_CATEGORY.DIVERS);

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span
              className={styles.headerTag}
              style={{
                color: currentTag.color,
                backgroundColor: currentTag.bgColor,
                borderColor: currentTag.color,
              }}
            >
              {currentTag.icon} {currentTag.label}
            </span>
            <h2>Edit Line Item</h2>
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

        {/* Body */}
        <div className={styles.body}>
          {/* Description */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Description *</label>
            <input
              type="text"
              className={`${styles.input} ${errors.description ? styles.inputError : ''}`}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Item description"
            />
            {errors.description && <span className={styles.error}>{errors.description}</span>}
          </div>

          {/* Item Code / SKU */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Item Code / SKU</label>
            <input
              type="text"
              className={styles.input}
              value={formData.itemCode}
              onChange={(e) => handleChange('itemCode', e.target.value)}
              placeholder="Product code"
            />
          </div>

          {/* Category & Line Type Row */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Category</label>
              <select
                className={styles.select}
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
              >
                <option value={LINE_CATEGORY.FOOD}>Food</option>
                <option value={LINE_CATEGORY.PACKAGING}>Packaging</option>
                <option value={LINE_CATEGORY.SUPPLY}>Supply</option>
                <option value={LINE_CATEGORY.FEE}>Fee</option>
                <option value={LINE_CATEGORY.DIVERS}>Other</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Line Type</label>
              <select
                className={styles.select}
                value={formData.lineType}
                onChange={(e) => handleChange('lineType', e.target.value)}
              >
                <option value={LINE_TYPE.PRODUCT}>Product</option>
                <option value={LINE_TYPE.FEE}>Fee</option>
                <option value={LINE_TYPE.CREDIT}>Credit</option>
                <option value={LINE_TYPE.DEPOSIT}>Deposit</option>
              </select>
            </div>
          </div>

          {/* Quantity & Unit Price Row */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Quantity *</label>
              <input
                type="number"
                className={`${styles.input} ${errors.quantity ? styles.inputError : ''}`}
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                min="0"
                step="1"
              />
              {errors.quantity && <span className={styles.error}>{errors.quantity}</span>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Unit Price</label>
              <div className={styles.inputGroup}>
                <span className={styles.inputPrefix}>$</span>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.unitPrice}
                  onChange={(e) => handleChange('unitPrice', e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Format & Total Price Row */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Format / Pack Size</label>
              <input
                type="text"
                className={styles.input}
                value={formData.format}
                onChange={(e) => handleChange('format', e.target.value)}
                placeholder="e.g., 2/5LB, 1/500, 6x500ML"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Total Price *</label>
              <div className={styles.inputGroup}>
                <span className={styles.inputPrefix}>$</span>
                <input
                  type="number"
                  className={`${styles.input} ${errors.totalPrice ? styles.inputError : ''}`}
                  value={formData.totalPrice}
                  onChange={(e) => handleChange('totalPrice', e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              {errors.totalPrice && <span className={styles.error}>{errors.totalPrice}</span>}
            </div>
          </div>

          {/* Weight Section (for food items) */}
          {formData.category === LINE_CATEGORY.FOOD && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Weight Details</h3>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Total Weight</label>
                  <div className={styles.inputGroup}>
                    <input
                      type="number"
                      className={styles.input}
                      value={formData.weight}
                      onChange={(e) => handleChange('weight', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                    <select
                      className={styles.inputSuffix}
                      value={formData.weightUnit}
                      onChange={(e) => handleChange('weightUnit', e.target.value)}
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="oz">oz</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Price per lb</label>
                  <div className={styles.inputGroup}>
                    <span className={styles.inputPrefix}>$</span>
                    <input
                      type="number"
                      className={styles.input}
                      value={formData.pricePerLb}
                      onChange={(e) => handleChange('pricePerLb', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pricing Type */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Pricing Type</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="pricingType"
                  value={PRICING_TYPE.WEIGHT}
                  checked={formData.pricingType === PRICING_TYPE.WEIGHT}
                  onChange={(e) => handleChange('pricingType', e.target.value)}
                />
                <span>By Weight</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="pricingType"
                  value={PRICING_TYPE.UNIT}
                  checked={formData.pricingType === PRICING_TYPE.UNIT}
                  onChange={(e) => handleChange('pricingType', e.target.value)}
                />
                <span>By Unit</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="pricingType"
                  value={PRICING_TYPE.VOLUME}
                  checked={formData.pricingType === PRICING_TYPE.VOLUME}
                  onChange={(e) => handleChange('pricingType', e.target.value)}
                />
                <span>By Volume</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerHint}>
            Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

LineEditModal.propTypes = {
  /** Line item data to edit */
  line: PropTypes.object,
  /** Whether modal is open */
  isOpen: PropTypes.bool.isRequired,
  /** Callback when modal closes */
  onClose: PropTypes.func.isRequired,
  /** Callback when save is clicked with updated line */
  onSave: PropTypes.func.isRequired,
};

export default memo(LineEditModal);
