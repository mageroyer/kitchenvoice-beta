/**
 * AddInventoryItemModal Component
 *
 * Modal form for adding new inventory items with validation,
 * duplicate checking, and vendor/category selection.
 *
 * @module components/inventory/AddInventoryItemModal
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/addinventoryitemmodal.module.css';

/**
 * Default form values
 */
const DEFAULT_FORM_VALUES = {
  name: '',
  sku: '',
  category: '',
  subcategory: '',
  unit: 'units',
  currentStock: '',
  parLevel: '',
  minStock: '',
  reorderPoint: '',
  reorderQuantity: '',
  unitPrice: '',
  vendorId: '',
  location: '',
  barcode: '',
  notes: '',
};

/**
 * Unit options
 */
const UNIT_OPTIONS = [
  { value: 'units', label: 'Units' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'g', label: 'Grams (g)' },
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'oz', label: 'Ounces (oz)' },
  { value: 'L', label: 'Liters (L)' },
  { value: 'mL', label: 'Milliliters (mL)' },
  { value: 'gal', label: 'Gallons (gal)' },
  { value: 'qt', label: 'Quarts (qt)' },
  { value: 'pt', label: 'Pints (pt)' },
  { value: 'cup', label: 'Cups' },
  { value: 'tbsp', label: 'Tablespoons' },
  { value: 'tsp', label: 'Teaspoons' },
  { value: 'case', label: 'Cases' },
  { value: 'box', label: 'Boxes' },
  { value: 'bag', label: 'Bags' },
  { value: 'can', label: 'Cans' },
  { value: 'bottle', label: 'Bottles' },
  { value: 'each', label: 'Each' },
];

/**
 * Default categories (can be overridden by props)
 */
const DEFAULT_CATEGORIES = [
  { id: 'produce', name: 'Produce' },
  { id: 'dairy', name: 'Dairy' },
  { id: 'meat', name: 'Meat & Poultry' },
  { id: 'seafood', name: 'Seafood' },
  { id: 'dry-goods', name: 'Dry Goods' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'beverages', name: 'Beverages' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'spices', name: 'Spices & Seasonings' },
  { id: 'oils', name: 'Oils & Vinegars' },
  { id: 'sauces', name: 'Sauces & Condiments' },
  { id: 'paper', name: 'Paper & Disposables' },
  { id: 'cleaning', name: 'Cleaning Supplies' },
  { id: 'other', name: 'Other' },
];

/**
 * Mock function to load vendors (replace with actual service)
 */
const loadVendors = async () => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return [
    { id: 'v1', name: 'Sysco Foods' },
    { id: 'v2', name: 'US Foods' },
    { id: 'v3', name: 'Restaurant Depot' },
    { id: 'v4', name: 'Local Farms Co.' },
    { id: 'v5', name: 'Premium Seafood' },
  ];
};

/**
 * Mock function to check for duplicates (replace with actual service)
 */
const checkDuplicate = async (name, sku) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  // Mock: return duplicate if name is "Test Item"
  if (name.toLowerCase() === 'test item') {
    return { isDuplicate: true, field: 'name', existingItem: { name, id: '123' } };
  }
  if (sku && sku.toUpperCase() === 'DUP-001') {
    return { isDuplicate: true, field: 'sku', existingItem: { sku, id: '456' } };
  }
  return { isDuplicate: false };
};

/**
 * AddInventoryItemModal - Form modal for adding inventory items
 *
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onClose - Callback to close the modal
 * @param {Function} props.onSave - Callback when item is saved
 * @param {Object} [props.prefilledVendor] - Pre-selected vendor
 * @param {Array} [props.categories] - Custom category list
 * @returns {JSX.Element} Add item modal form
 *
 * @example
 * <AddInventoryItemModal
 *   onClose={() => setShowModal(false)}
 *   onSave={(item) => addItem(item)}
 *   prefilledVendor={{ id: 'v1', name: 'Sysco Foods' }}
 * />
 */
function AddInventoryItemModal({
  onClose,
  onSave,
  prefilledVendor,
  categories = DEFAULT_CATEGORIES,
}) {
  // Form state
  const [formValues, setFormValues] = useState(DEFAULT_FORM_VALUES);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Refs
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Load vendors on mount
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const vendorList = await loadVendors();
        setVendors(vendorList);
      } catch (err) {
        console.error('Failed to load vendors:', err);
      } finally {
        setLoadingVendors(false);
      }
    };
    fetchVendors();
  }, []);

  // Set prefilled vendor
  useEffect(() => {
    if (prefilledVendor?.id) {
      setFormValues((prev) => ({
        ...prev,
        vendorId: prefilledVendor.id,
      }));
    }
  }, [prefilledVendor]);

  // Focus management
  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const timer = setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  /**
   * Validate a single field
   */
  const validateField = useCallback((name, value) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Item name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        if (value.trim().length > 100) return 'Name must be less than 100 characters';
        return null;

      case 'sku':
        if (value && !/^[A-Za-z0-9-_]+$/.test(value)) {
          return 'SKU can only contain letters, numbers, dashes, and underscores';
        }
        return null;

      case 'category':
        if (!value) return 'Category is required';
        return null;

      case 'unit':
        if (!value) return 'Unit is required';
        return null;

      case 'currentStock':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Stock must be a non-negative number';
        }
        return null;

      case 'parLevel':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Par level must be a non-negative number';
        }
        return null;

      case 'minStock':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Min stock must be a non-negative number';
        }
        return null;

      case 'reorderPoint':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Reorder point must be a non-negative number';
        }
        return null;

      case 'reorderQuantity':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) <= 0)) {
          return 'Reorder quantity must be a positive number';
        }
        return null;

      case 'unitPrice':
        if (value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Price must be a non-negative number';
        }
        return null;

      case 'vendorId':
        if (!value) return 'Vendor is required';
        return null;

      default:
        return null;
    }
  }, []);

  /**
   * Validate all fields
   */
  const validateForm = useCallback(() => {
    const newErrors = {};
    Object.keys(formValues).forEach((field) => {
      const error = validateField(field, formValues[field]);
      if (error) {
        newErrors[field] = error;
      }
    });
    return newErrors;
  }, [formValues, validateField]);

  /**
   * Check if form is valid
   */
  const isFormValid = useMemo(() => {
    const formErrors = validateForm();
    return Object.keys(formErrors).length === 0;
  }, [validateForm]);

  /**
   * Handle backdrop click
   */
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Handle input change
   */
  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setFormValues((prev) => ({ ...prev, [name]: value }));
      setSubmitError(null);
      setDuplicateWarning(null);

      // Validate on change if field was touched
      if (touched[name]) {
        const error = validateField(name, value);
        setErrors((prev) => ({
          ...prev,
          [name]: error,
        }));
      }
    },
    [touched, validateField]
  );

  /**
   * Handle input blur
   */
  const handleBlur = useCallback(
    (e) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));

      const error = validateField(name, value);
      setErrors((prev) => ({
        ...prev,
        [name]: error,
      }));
    },
    [validateField]
  );

  /**
   * Handle form submit
   */
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      // Mark all fields as touched
      const allTouched = Object.keys(formValues).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {}
      );
      setTouched(allTouched);

      // Validate all fields
      const formErrors = validateForm();
      setErrors(formErrors);

      if (Object.keys(formErrors).length > 0) {
        // Focus first error field
        const firstErrorField = Object.keys(formErrors)[0];
        const element = document.getElementById(`field-${firstErrorField}`);
        if (element) element.focus();
        return;
      }

      setSaving(true);
      setSubmitError(null);

      try {
        // Check for duplicates
        const duplicateResult = await checkDuplicate(
          formValues.name,
          formValues.sku
        );

        if (duplicateResult.isDuplicate) {
          setDuplicateWarning({
            field: duplicateResult.field,
            message:
              duplicateResult.field === 'name'
                ? `An item with the name "${formValues.name}" already exists`
                : `An item with SKU "${formValues.sku}" already exists`,
          });
          setSaving(false);
          return;
        }

        // Prepare item data
        const selectedVendor = vendors.find((v) => v.id === formValues.vendorId);
        const itemData = {
          name: formValues.name.trim(),
          sku: formValues.sku.trim().toUpperCase() || null,
          category: formValues.category,
          subcategory: formValues.subcategory.trim() || null,
          unit: formValues.unit,
          currentStock: formValues.currentStock
            ? parseFloat(formValues.currentStock)
            : 0,
          parLevel: formValues.parLevel ? parseFloat(formValues.parLevel) : null,
          minStock: formValues.minStock ? parseFloat(formValues.minStock) : null,
          reorderPoint: formValues.reorderPoint
            ? parseFloat(formValues.reorderPoint)
            : null,
          reorderQuantity: formValues.reorderQuantity
            ? parseFloat(formValues.reorderQuantity)
            : null,
          unitPrice: formValues.unitPrice
            ? parseFloat(formValues.unitPrice)
            : null,
          vendorId: formValues.vendorId,
          vendorName: selectedVendor?.name || null,
          location: formValues.location.trim() || null,
          barcode: formValues.barcode.trim() || null,
          notes: formValues.notes.trim() || null,
          createdAt: new Date().toISOString(),
        };

        await onSave(itemData);
        onClose();
      } catch (err) {
        setSubmitError(err.message || 'Failed to save item. Please try again.');
        console.error('Error saving item:', err);
      } finally {
        setSaving(false);
      }
    },
    [formValues, validateForm, vendors, onSave, onClose]
  );

  /**
   * Render form field with error handling
   */
  const renderField = (name, label, type = 'text', options = {}) => {
    const {
      required = false,
      placeholder = '',
      helpText = '',
      selectOptions = null,
      rows = 3,
    } = options;

    const hasError = touched[name] && errors[name];
    const isDuplicateField = duplicateWarning?.field === name;

    const fieldClasses = [
      styles.field,
      hasError ? styles.hasError : '',
      isDuplicateField ? styles.hasDuplicate : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={fieldClasses}>
        <label htmlFor={`field-${name}`} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>

        {type === 'select' ? (
          <select
            id={`field-${name}`}
            name={name}
            className={styles.select}
            value={formValues[name]}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={saving}
          >
            <option value="">Select {label.toLowerCase()}...</option>
            {selectOptions?.map((opt) => (
              <option key={opt.id || opt.value} value={opt.id || opt.value}>
                {opt.name || opt.label}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={`field-${name}`}
            name={name}
            className={styles.textarea}
            value={formValues[name]}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            rows={rows}
            disabled={saving}
          />
        ) : (
          <input
            ref={name === 'name' ? firstInputRef : undefined}
            id={`field-${name}`}
            name={name}
            type={type}
            className={styles.input}
            value={formValues[name]}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={saving}
            inputMode={type === 'number' ? 'decimal' : undefined}
          />
        )}

        {helpText && !hasError && !isDuplicateField && (
          <span className={styles.helpText}>{helpText}</span>
        )}

        {hasError && (
          <span className={styles.errorText} role="alert">
            {errors[name]}
          </span>
        )}

        {isDuplicateField && (
          <span className={styles.duplicateText} role="alert">
            {duplicateWarning.message}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-item-title"
    >
      <div
        ref={modalRef}
        className={styles.modal}
        tabIndex={-1}
        role="document"
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="add-item-title" className={styles.title}>
            Add Inventory Item
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form className={styles.content} onSubmit={handleSubmit}>
          {/* Basic Info Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Basic Information</h3>
            <div className={styles.fieldGrid}>
              {renderField('name', 'Item Name', 'text', {
                required: true,
                placeholder: 'e.g., All-Purpose Flour',
              })}
              {renderField('sku', 'SKU', 'text', {
                placeholder: 'e.g., FLR-AP-001',
                helpText: 'Optional unique identifier',
              })}
            </div>
            <div className={styles.fieldGrid}>
              {renderField('category', 'Category', 'select', {
                required: true,
                selectOptions: categories,
              })}
              {renderField('subcategory', 'Subcategory', 'text', {
                placeholder: 'e.g., Baking',
              })}
            </div>
          </section>

          {/* Stock Info Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Stock Information</h3>
            <div className={styles.fieldGrid}>
              {renderField('unit', 'Unit of Measure', 'select', {
                required: true,
                selectOptions: UNIT_OPTIONS,
              })}
              {renderField('currentStock', 'Current Stock', 'text', {
                placeholder: '0',
              })}
            </div>
            <div className={styles.fieldGrid}>
              {renderField('parLevel', 'Par Level', 'text', {
                placeholder: 'Target stock level',
              })}
              {renderField('minStock', 'Minimum Stock', 'text', {
                placeholder: 'Alert threshold',
              })}
            </div>
            <div className={styles.fieldGrid}>
              {renderField('reorderPoint', 'Reorder Point', 'text', {
                placeholder: 'When to reorder',
              })}
              {renderField('reorderQuantity', 'Reorder Quantity', 'text', {
                placeholder: 'How much to order',
              })}
            </div>
          </section>

          {/* Vendor & Pricing Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Vendor & Pricing</h3>
            <div className={styles.fieldGrid}>
              {renderField('vendorId', 'Primary Vendor', 'select', {
                required: true,
                selectOptions: loadingVendors
                  ? [{ id: '', name: 'Loading...' }]
                  : vendors,
              })}
              {renderField('unitPrice', 'Unit Price ($)', 'text', {
                placeholder: '0.00',
              })}
            </div>
          </section>

          {/* Additional Info Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Additional Information</h3>
            <div className={styles.fieldGrid}>
              {renderField('location', 'Storage Location', 'text', {
                placeholder: 'e.g., Dry Storage - Shelf A3',
              })}
              {renderField('barcode', 'Barcode', 'text', {
                placeholder: 'e.g., 123456789012',
              })}
            </div>
            {renderField('notes', 'Notes', 'textarea', {
              placeholder: 'Additional information about this item...',
              rows: 3,
            })}
          </section>

          {/* Submit Error */}
          {submitError && (
            <div className={styles.submitError} role="alert">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {submitError}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className={styles.footer}>
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
            onClick={handleSubmit}
            disabled={saving || !isFormValid}
          >
            {saving ? (
              <>
                <span className={styles.spinner} />
                Saving...
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Item
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

AddInventoryItemModal.propTypes = {
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
  /** Callback when item is saved, receives item data object */
  onSave: PropTypes.func.isRequired,
  /** Pre-selected vendor */
  prefilledVendor: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }),
  /** Custom category list */
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ),
};

export default AddInventoryItemModal;
