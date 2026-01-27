/**
 * OrderEditor Component
 *
 * Modal form for creating and editing purchase orders.
 * Allows vendor selection, adding items, and setting delivery details.
 */

import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import OrderLineItem from './OrderLineItem';
import styles from '../../styles/components/ordereditor.module.css';
// Import Quebec tax config from central source
import { QUEBEC_TAX } from '../../services/invoice/mathEngine/types';

// Province options for Canada
const PROVINCE_OPTIONS = [
  { value: '', label: 'Select Province' },
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland and Labrador' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'NT', label: 'Northwest Territories' },
  { value: 'NU', label: 'Nunavut' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
  { value: 'YT', label: 'Yukon' },
];

// Tax rates - mapped from central config (TPS=GST, TVQ=QST)
const TAX_RATES = {
  GST: QUEBEC_TAX.TPS_RATE,
  QST: QUEBEC_TAX.TVQ_RATE,
};

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
 * Initial form state
 */
const getInitialFormState = (order) => ({
  vendorId: order?.vendorId || '',
  vendorName: order?.vendorName || '',
  expectedDeliveryDate: order?.expectedDeliveryDate?.split('T')[0] || '',
  deliveryAddress: order?.deliveryAddress || '',
  vendorNotes: order?.vendorNotes || '',
  internalNotes: order?.internalNotes || '',
  applyGST: order?.taxGST > 0,
  applyQST: order?.taxQST > 0,
});

/**
 * Initial line state
 */
const getInitialLines = (lines) =>
  lines?.map((line) => ({
    ...line,
    _key: line.id || `temp-${Date.now()}-${Math.random()}`,
  })) || [];

function OrderEditor({
  order,
  lines: initialLines = [],
  vendors = [],
  inventoryItems = [],
  onSave,
  onClose,
  loading = false,
}) {
  const isEditMode = !!order?.id;
  const [formValues, setFormValues] = useState(() => getInitialFormState(order));
  const [lines, setLines] = useState(() => getInitialLines(initialLines));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemSearch, setShowItemSearch] = useState(false);
  const itemSearchRef = useRef(null);

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + (line.quantity || 0) * (line.unitPrice || 0),
      0
    );
    const gst = formValues.applyGST ? subtotal * TAX_RATES.GST : 0;
    const qst = formValues.applyQST ? subtotal * TAX_RATES.QST : 0;
    const total = subtotal + gst + qst;
    return { subtotal, gst, qst, total };
  }, [lines, formValues.applyGST, formValues.applyQST]);

  // Filter items for search
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return [];
    const search = itemSearch.toLowerCase();
    const existingItemIds = new Set(lines.map((l) => l.inventoryItemId));

    return inventoryItems
      .filter((item) => {
        if (existingItemIds.has(item.id)) return false;
        // If vendor is selected, only show items from that vendor
        if (formValues.vendorId && item.vendorId !== formValues.vendorId) return false;
        return (
          item.name?.toLowerCase().includes(search) ||
          item.sku?.toLowerCase().includes(search)
        );
      })
      .slice(0, 10);
  }, [itemSearch, inventoryItems, lines, formValues.vendorId]);

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

  // Focus item search when shown
  useEffect(() => {
    if (showItemSearch && itemSearchRef.current) {
      itemSearchRef.current.focus();
    }
  }, [showItemSearch]);

  // Form field change handler
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error on change
    setErrors((prev) => ({ ...prev, [name]: null }));
  }, []);

  // Vendor selection handler
  const handleVendorChange = useCallback(
    (e) => {
      const vendorId = e.target.value;
      const vendor = vendors.find((v) => v.id === vendorId);
      setFormValues((prev) => ({
        ...prev,
        vendorId,
        vendorName: vendor?.name || '',
      }));
      // Clear lines if vendor changed (items are vendor-specific)
      if (vendorId !== formValues.vendorId) {
        setLines([]);
      }
      setErrors((prev) => ({ ...prev, vendorId: null }));
    },
    [vendors, formValues.vendorId]
  );

  // Add item to order
  const handleAddItem = useCallback(
    (item) => {
      const newLine = {
        _key: `temp-${Date.now()}-${Math.random()}`,
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        inventoryItemSku: item.sku,
        quantity: 1,
        unit: item.unit || 'ea',
        unitPrice: item.lastPrice || item.unitPrice || 0,
        stockAtOrder: item.stockQuantity ?? item.stockWeight ?? 0,
        quantityReceived: 0,
        notes: '',
      };
      setLines((prev) => [...prev, newLine]);
      setItemSearch('');
      setShowItemSearch(false);
    },
    []
  );

  // Line item handlers
  const handleQuantityChange = useCallback((lineKey, quantity) => {
    setLines((prev) =>
      prev.map((line) =>
        line._key === lineKey || line.id === lineKey ? { ...line, quantity } : line
      )
    );
  }, []);

  const handlePriceChange = useCallback((lineKey, unitPrice) => {
    setLines((prev) =>
      prev.map((line) =>
        line._key === lineKey || line.id === lineKey ? { ...line, unitPrice } : line
      )
    );
  }, []);

  const handleNotesChange = useCallback((lineKey, notes) => {
    setLines((prev) =>
      prev.map((line) =>
        line._key === lineKey || line.id === lineKey ? { ...line, notes } : line
      )
    );
  }, []);

  const handleRemoveLine = useCallback((lineKey) => {
    setLines((prev) => prev.filter((line) => line._key !== lineKey && line.id !== lineKey));
  }, []);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formValues.vendorId) {
      newErrors.vendorId = 'Please select a vendor';
    }

    if (lines.length === 0) {
      newErrors.lines = 'Please add at least one item';
    }

    // Check for invalid quantities
    const invalidLines = lines.filter((line) => !line.quantity || line.quantity <= 0);
    if (invalidLines.length > 0) {
      newErrors.lines = 'All items must have a quantity greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formValues, lines]);

  // Submit handler
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!validateForm()) return;

      setSaving(true);
      try {
        const orderData = {
          ...formValues,
          subtotal: totals.subtotal,
          taxGST: totals.gst,
          taxQST: totals.qst,
          total: totals.total,
          lines: lines.map((line) => ({
            id: line.id, // Will be undefined for new lines
            inventoryItemId: line.inventoryItemId,
            inventoryItemName: line.inventoryItemName,
            inventoryItemSku: line.inventoryItemSku,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            stockAtOrder: line.stockAtOrder,
            notes: line.notes,
          })),
        };

        if (isEditMode) {
          orderData.id = order.id;
        }

        await onSave?.(orderData);
      } catch (error) {
        setErrors({ submit: error.message || 'Failed to save order' });
      } finally {
        setSaving(false);
      }
    },
    [formValues, lines, totals, isEditMode, order, validateForm, onSave]
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-editor-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="order-editor-title" className={styles.title}>
            {isEditMode ? `Edit Order ${order.orderNumber}` : 'Create Purchase Order'}
          </h2>
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

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.content}>
            {/* Vendor Selection */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Vendor</h3>
              <div className={styles.field}>
                <label htmlFor="vendorId" className={styles.label}>
                  Select Vendor <span className={styles.required}>*</span>
                </label>
                <select
                  id="vendorId"
                  name="vendorId"
                  className={`${styles.select} ${errors.vendorId ? styles.hasError : ''}`}
                  value={formValues.vendorId}
                  onChange={handleVendorChange}
                  disabled={saving || loading}
                >
                  <option value="">Choose a vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                      {vendor.vendorCode && ` (${vendor.vendorCode})`}
                    </option>
                  ))}
                </select>
                {errors.vendorId && <span className={styles.errorText}>{errors.vendorId}</span>}
              </div>
            </section>

            {/* Line Items */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Order Items</h3>
                {formValues.vendorId && (
                  <button
                    type="button"
                    className={styles.addItemButton}
                    onClick={() => setShowItemSearch(true)}
                    disabled={saving}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Item
                  </button>
                )}
              </div>

              {/* Item Search */}
              {showItemSearch && (
                <div className={styles.itemSearchContainer}>
                  <div className={styles.itemSearchWrapper}>
                    <input
                      ref={itemSearchRef}
                      type="text"
                      className={styles.itemSearchInput}
                      placeholder="Search items by name or SKU..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.itemSearchClose}
                      onClick={() => {
                        setShowItemSearch(false);
                        setItemSearch('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {filteredItems.length > 0 && (
                    <ul className={styles.itemSearchResults}>
                      {filteredItems.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={styles.itemSearchResult}
                            onClick={() => handleAddItem(item)}
                          >
                            <span className={styles.itemName}>{item.name}</span>
                            {item.sku && <span className={styles.itemSku}>{item.sku}</span>}
                            <span className={styles.itemStock}>
                              Stock: {item.stockQuantity ?? item.stockWeight ?? 0} {item.unit || 'ea'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {itemSearch && filteredItems.length === 0 && (
                    <p className={styles.noResults}>No items found</p>
                  )}
                </div>
              )}

              {/* Lines List */}
              {lines.length === 0 ? (
                <div className={styles.emptyLines}>
                  {formValues.vendorId ? (
                    <p>No items added. Click &quot;Add Item&quot; to add items to this order.</p>
                  ) : (
                    <p>Select a vendor first to add items.</p>
                  )}
                </div>
              ) : (
                <div className={styles.linesList}>
                  {/* Header */}
                  <div className={styles.linesHeader}>
                    <span className={styles.colItem}>Item</span>
                    <span className={styles.colQty}>Qty</span>
                    <span className={styles.colPrice}>Unit Price</span>
                    <span className={styles.colTotal}>Total</span>
                    <span className={styles.colActions}></span>
                  </div>
                  {/* Line Items */}
                  {lines.map((line) => (
                    <OrderLineItem
                      key={line._key || line.id}
                      line={{ ...line, id: line._key || line.id }}
                      editable
                      onQuantityChange={handleQuantityChange}
                      onPriceChange={handlePriceChange}
                      onNotesChange={handleNotesChange}
                      onRemove={handleRemoveLine}
                    />
                  ))}
                </div>
              )}

              {errors.lines && <span className={styles.errorText}>{errors.lines}</span>}
            </section>

            {/* Delivery Details */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Delivery Details</h3>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="expectedDeliveryDate" className={styles.label}>
                    Expected Delivery Date
                  </label>
                  <input
                    id="expectedDeliveryDate"
                    name="expectedDeliveryDate"
                    type="date"
                    className={styles.input}
                    value={formValues.expectedDeliveryDate}
                    onChange={handleChange}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="deliveryAddress" className={styles.label}>
                  Delivery Address
                </label>
                <textarea
                  id="deliveryAddress"
                  name="deliveryAddress"
                  className={styles.textarea}
                  value={formValues.deliveryAddress}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Enter delivery address..."
                  disabled={saving}
                />
              </div>
            </section>

            {/* Notes */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Notes</h3>
              <div className={styles.field}>
                <label htmlFor="vendorNotes" className={styles.label}>
                  Notes for Vendor
                </label>
                <textarea
                  id="vendorNotes"
                  name="vendorNotes"
                  className={styles.textarea}
                  value={formValues.vendorNotes}
                  onChange={handleChange}
                  rows={2}
                  placeholder="These notes will be visible to the vendor..."
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="internalNotes" className={styles.label}>
                  Internal Notes
                </label>
                <textarea
                  id="internalNotes"
                  name="internalNotes"
                  className={styles.textarea}
                  value={formValues.internalNotes}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Internal notes (not visible to vendor)..."
                  disabled={saving}
                />
              </div>
            </section>

            {/* Tax Options */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Taxes</h3>
              <div className={styles.checkboxRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="applyGST"
                    checked={formValues.applyGST}
                    onChange={handleChange}
                    disabled={saving}
                  />
                  <span>Apply GST (5%)</span>
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    name="applyQST"
                    checked={formValues.applyQST}
                    onChange={handleChange}
                    disabled={saving}
                  />
                  <span>Apply QST (9.975%)</span>
                </label>
              </div>
            </section>
          </div>

          {/* Footer with Totals */}
          <div className={styles.footer}>
            <div className={styles.totals}>
              <div className={styles.totalRow}>
                <span>Subtotal ({lines.length} items)</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {formValues.applyGST && (
                <div className={styles.totalRow}>
                  <span>GST (5%)</span>
                  <span>{formatCurrency(totals.gst)}</span>
                </div>
              )}
              {formValues.applyQST && (
                <div className={styles.totalRow}>
                  <span>QST (9.975%)</span>
                  <span>{formatCurrency(totals.qst)}</span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>

            {errors.submit && (
              <div className={styles.submitError} role="alert">
                {errors.submit}
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.saveButton}
                disabled={saving || loading || lines.length === 0}
              >
                {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

OrderEditor.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.string,
    orderNumber: PropTypes.string,
    vendorId: PropTypes.string,
    vendorName: PropTypes.string,
    expectedDeliveryDate: PropTypes.string,
    deliveryAddress: PropTypes.string,
    vendorNotes: PropTypes.string,
    internalNotes: PropTypes.string,
    taxGST: PropTypes.number,
    taxQST: PropTypes.number,
  }),
  lines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      inventoryItemId: PropTypes.string,
      inventoryItemName: PropTypes.string,
      quantity: PropTypes.number,
      unitPrice: PropTypes.number,
    })
  ),
  vendors: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      vendorCode: PropTypes.string,
    })
  ),
  inventoryItems: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      sku: PropTypes.string,
      vendorId: PropTypes.string,
      stockQuantity: PropTypes.number,
      stockWeight: PropTypes.number,
      unit: PropTypes.string,
      lastPrice: PropTypes.number,
    })
  ),
  onSave: PropTypes.func,
  onClose: PropTypes.func,
  loading: PropTypes.bool,
};

export default memo(OrderEditor);
