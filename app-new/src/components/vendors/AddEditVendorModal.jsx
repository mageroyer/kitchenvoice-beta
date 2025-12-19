/**
 * AddEditVendorModal Component
 *
 * Modal form for creating and editing vendors with comprehensive validation,
 * duplicate checking, and organized field sections.
 *
 * @module components/vendors/AddEditVendorModal
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { validateVendorData, isValidPhone } from '../../services/inventory/vendorService';
import styles from '../../styles/components/addeditvendormodal.module.css';

/**
 * Default form values for new vendor
 */
const DEFAULT_FORM_VALUES = {
  name: '',
  legalName: '',
  vendorCode: '',
  contactName: '',
  phone: '',
  email: '',
  fax: '',
  orderPhone: '',
  orderEmail: '',
  address: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Canada',
  website: '',
  paymentTerms: 'Net 30',
  minimumOrder: '',
  leadTimeDays: '',
  deliveryDays: '',
  isPrimary: false,
  isActive: true,
  rating: '',
  notes: '',
};

/**
 * Payment terms options
 */
const PAYMENT_TERMS_OPTIONS = [
  'COD',
  'Net 7',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Net 90',
  '2/10 Net 30',
  'Prepaid',
];

/**
 * Province options (Canadian)
 */
const PROVINCE_OPTIONS = [
  { value: '', label: 'Select province...' },
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

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
  if (!email || !email.trim()) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * AddEditVendorModal - Form modal for adding/editing vendors
 *
 * @component
 * @param {Object} props - Component props
 * @param {Object} [props.vendor] - Existing vendor to edit (null for new)
 * @param {Function} props.onClose - Callback to close modal
 * @param {Function} props.onSave - Callback when vendor is saved
 * @param {Function} [props.checkDuplicate] - Function to check for duplicate names
 * @returns {JSX.Element} Vendor form modal
 */
function AddEditVendorModal({
  vendor,
  onClose,
  onSave,
  checkDuplicate,
}) {
  const isEditMode = Boolean(vendor?.id);

  // Form state
  const [formValues, setFormValues] = useState(DEFAULT_FORM_VALUES);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Refs
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Initialize form with vendor data if editing
  useEffect(() => {
    if (vendor) {
      setFormValues({
        name: vendor.name || '',
        legalName: vendor.legalName || '',
        vendorCode: vendor.vendorCode || '',
        contactName: vendor.contactName || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        fax: vendor.fax || '',
        orderPhone: vendor.orderPhone || '',
        orderEmail: vendor.orderEmail || '',
        address: vendor.address || '',
        city: vendor.city || '',
        province: vendor.province || '',
        postalCode: vendor.postalCode || '',
        country: vendor.country || 'Canada',
        website: vendor.website || '',
        paymentTerms: vendor.paymentTerms || 'Net 30',
        minimumOrder: vendor.minimumOrder ? String(vendor.minimumOrder) : '',
        leadTimeDays: vendor.leadTimeDays ? String(vendor.leadTimeDays) : '',
        deliveryDays: vendor.deliveryDays || '',
        isPrimary: vendor.isPrimary || false,
        isActive: vendor.isActive !== false,
        rating: vendor.rating !== undefined ? String(vendor.rating) : '',
        notes: vendor.notes || '',
      });
    }
  }, [vendor]);

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
        if (!value.trim()) return 'Vendor name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        if (value.trim().length > 200) return 'Name must be less than 200 characters';
        return null;

      case 'email':
        if (value && !isValidEmail(value)) return 'Invalid email format';
        return null;

      case 'orderEmail':
        if (value && !isValidEmail(value)) return 'Invalid email format';
        return null;

      case 'phone':
        if (value && !isValidPhone(value)) return 'Invalid phone format';
        return null;

      case 'orderPhone':
        if (value && !isValidPhone(value)) return 'Invalid phone format';
        return null;

      case 'fax':
        if (value && !isValidPhone(value)) return 'Invalid fax format';
        return null;

      case 'minimumOrder':
        if (value && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
          return 'Must be a non-negative number';
        }
        return null;

      case 'leadTimeDays':
        if (value && (isNaN(parseInt(value)) || parseInt(value) < 0)) {
          return 'Must be a non-negative number';
        }
        return null;

      case 'rating':
        if (value) {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0 || num > 5) {
            return 'Rating must be between 0 and 5';
          }
        }
        return null;

      case 'postalCode':
        if (value && value.trim()) {
          const postalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
          if (!postalRegex.test(value.trim())) {
            return 'Invalid postal code (use A1A 1A1)';
          }
        }
        return null;

      case 'website':
        if (value && value.trim()) {
          try {
            new URL(value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`);
          } catch {
            return 'Invalid website URL';
          }
        }
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
      const { name, value, type, checked } = e.target;
      const newValue = type === 'checkbox' ? checked : value;

      setFormValues((prev) => ({ ...prev, [name]: newValue }));
      setSubmitError(null);
      setDuplicateWarning(null);

      // Validate on change if field was touched
      if (touched[name]) {
        const error = validateField(name, newValue);
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
        const firstErrorField = Object.keys(formErrors)[0];
        const element = document.getElementById(`field-${firstErrorField}`);
        if (element) element.focus();
        return;
      }

      setSaving(true);
      setSubmitError(null);

      try {
        // Check for duplicate name if function provided
        if (checkDuplicate && formValues.name) {
          const isDuplicate = await checkDuplicate(
            formValues.name,
            isEditMode ? vendor.id : null
          );
          if (isDuplicate) {
            setDuplicateWarning({
              field: 'name',
              message: `A vendor named "${formValues.name}" already exists`,
            });
            setSaving(false);
            return;
          }
        }

        // Prepare vendor data
        const vendorData = {
          ...(isEditMode ? { id: vendor.id } : {}),
          name: formValues.name.trim(),
          legalName: formValues.legalName.trim() || null,
          vendorCode: formValues.vendorCode.trim().toUpperCase() || null,
          contactName: formValues.contactName.trim() || null,
          phone: formValues.phone.trim() || null,
          email: formValues.email.trim().toLowerCase() || null,
          fax: formValues.fax.trim() || null,
          orderPhone: formValues.orderPhone.trim() || null,
          orderEmail: formValues.orderEmail.trim().toLowerCase() || null,
          address: formValues.address.trim() || null,
          city: formValues.city.trim() || null,
          province: formValues.province || null,
          postalCode: formValues.postalCode.trim().toUpperCase() || null,
          country: formValues.country || null,
          website: formValues.website.trim() || null,
          paymentTerms: formValues.paymentTerms || null,
          minimumOrder: formValues.minimumOrder
            ? parseFloat(formValues.minimumOrder)
            : null,
          leadTimeDays: formValues.leadTimeDays
            ? parseInt(formValues.leadTimeDays)
            : null,
          deliveryDays: formValues.deliveryDays.trim() || null,
          isPrimary: formValues.isPrimary,
          isActive: formValues.isActive,
          rating: formValues.rating ? parseFloat(formValues.rating) : null,
          notes: formValues.notes.trim() || null,
        };

        await onSave(vendorData);
        onClose();
      } catch (err) {
        setSubmitError(err.message || 'Failed to save vendor. Please try again.');
        console.error('Error saving vendor:', err);
      } finally {
        setSaving(false);
      }
    },
    [formValues, validateForm, checkDuplicate, isEditMode, vendor, onSave, onClose]
  );

  /**
   * Render form field
   */
  const renderField = (name, label, type = 'text', options = {}) => {
    const {
      required = false,
      placeholder = '',
      helpText = '',
      selectOptions = null,
      rows = 3,
      half = false,
    } = options;

    const hasError = touched[name] && errors[name];
    const isDuplicateField = duplicateWarning?.field === name;

    const fieldClasses = [
      styles.field,
      half && styles.half,
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
            {selectOptions?.map((opt) => (
              <option
                key={opt.value !== undefined ? opt.value : opt}
                value={opt.value !== undefined ? opt.value : opt}
              >
                {opt.label !== undefined ? opt.label : opt}
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
        ) : type === 'checkbox' ? (
          <label className={styles.checkboxLabel}>
            <input
              id={`field-${name}`}
              name={name}
              type="checkbox"
              className={styles.checkbox}
              checked={formValues[name]}
              onChange={handleChange}
              disabled={saving}
            />
            <span className={styles.checkboxText}>{placeholder || label}</span>
          </label>
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
      aria-labelledby="vendor-form-title"
    >
      <div
        ref={modalRef}
        className={styles.modal}
        tabIndex={-1}
        role="document"
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="vendor-form-title" className={styles.title}>
            {isEditMode ? 'Edit Vendor' : 'Add Vendor'}
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form className={styles.content} onSubmit={handleSubmit}>
          {/* Basic Information */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Basic Information</h3>
            <div className={styles.fieldRow}>
              {renderField('name', 'Vendor Name', 'text', {
                required: true,
                placeholder: 'e.g., Sysco Foods',
              })}
              {renderField('vendorCode', 'Vendor Code', 'text', {
                placeholder: 'e.g., VEN-001',
                helpText: 'Optional unique identifier',
                half: true,
              })}
            </div>
            {renderField('legalName', 'Legal Business Name', 'text', {
              placeholder: 'Full legal name if different',
            })}
          </section>

          {/* Contact Information */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Contact Information</h3>
            <div className={styles.fieldRow}>
              {renderField('contactName', 'Contact Name', 'text', {
                placeholder: 'Primary contact person',
              })}
              {renderField('phone', 'Phone', 'tel', {
                placeholder: '(555) 123-4567',
                half: true,
              })}
            </div>
            <div className={styles.fieldRow}>
              {renderField('email', 'Email', 'email', {
                placeholder: 'contact@vendor.com',
              })}
              {renderField('fax', 'Fax', 'tel', {
                placeholder: '(555) 123-4568',
                half: true,
              })}
            </div>
          </section>

          {/* Order Contact */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Order Contact</h3>
            <p className={styles.sectionHint}>
              Separate contact for placing orders (if different)
            </p>
            <div className={styles.fieldRow}>
              {renderField('orderPhone', 'Order Phone', 'tel', {
                placeholder: '(555) 123-4567',
                half: true,
              })}
              {renderField('orderEmail', 'Order Email', 'email', {
                placeholder: 'orders@vendor.com',
              })}
            </div>
          </section>

          {/* Address */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Address</h3>
            {renderField('address', 'Street Address', 'text', {
              placeholder: '123 Main Street',
            })}
            <div className={styles.fieldRow}>
              {renderField('city', 'City', 'text', {
                placeholder: 'Toronto',
              })}
              {renderField('province', 'Province', 'select', {
                selectOptions: PROVINCE_OPTIONS,
                half: true,
              })}
            </div>
            <div className={styles.fieldRow}>
              {renderField('postalCode', 'Postal Code', 'text', {
                placeholder: 'A1A 1A1',
                half: true,
              })}
              {renderField('country', 'Country', 'text', {
                placeholder: 'Canada',
                half: true,
              })}
            </div>
            {renderField('website', 'Website', 'url', {
              placeholder: 'www.vendor.com',
            })}
          </section>

          {/* Business Terms */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Business Terms</h3>
            <div className={styles.fieldRow}>
              {renderField('paymentTerms', 'Payment Terms', 'select', {
                selectOptions: PAYMENT_TERMS_OPTIONS,
                half: true,
              })}
              {renderField('minimumOrder', 'Minimum Order ($)', 'text', {
                placeholder: '0.00',
                half: true,
              })}
            </div>
            <div className={styles.fieldRow}>
              {renderField('leadTimeDays', 'Lead Time (days)', 'text', {
                placeholder: 'Days to receive order',
                half: true,
              })}
              {renderField('deliveryDays', 'Delivery Days', 'text', {
                placeholder: 'e.g., Mon, Wed, Fri',
              })}
            </div>
          </section>

          {/* Status & Rating */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Status & Rating</h3>
            <div className={styles.checkboxRow}>
              {renderField('isActive', 'Active', 'checkbox', {
                placeholder: 'Vendor is currently active',
              })}
              {renderField('isPrimary', 'Primary Vendor', 'checkbox', {
                placeholder: 'Set as primary/preferred vendor',
              })}
            </div>
            {renderField('rating', 'Rating (0-5)', 'text', {
              placeholder: 'e.g., 4.5',
              helpText: 'Your rating of this vendor',
              half: true,
            })}
          </section>

          {/* Notes */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            {renderField('notes', 'Notes', 'textarea', {
              placeholder: 'Additional information about this vendor...',
              rows: 4,
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
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                {isEditMode ? 'Save Changes' : 'Add Vendor'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

AddEditVendorModal.propTypes = {
  /** Existing vendor to edit (null/undefined for new vendor) */
  vendor: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    legalName: PropTypes.string,
    vendorCode: PropTypes.string,
    contactName: PropTypes.string,
    phone: PropTypes.string,
    email: PropTypes.string,
    fax: PropTypes.string,
    orderPhone: PropTypes.string,
    orderEmail: PropTypes.string,
    address: PropTypes.string,
    city: PropTypes.string,
    province: PropTypes.string,
    postalCode: PropTypes.string,
    country: PropTypes.string,
    website: PropTypes.string,
    paymentTerms: PropTypes.string,
    minimumOrder: PropTypes.number,
    leadTimeDays: PropTypes.number,
    deliveryDays: PropTypes.string,
    isPrimary: PropTypes.bool,
    isActive: PropTypes.bool,
    rating: PropTypes.number,
    notes: PropTypes.string,
  }),
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
  /** Callback when vendor is saved, receives vendor data object */
  onSave: PropTypes.func.isRequired,
  /** Function to check for duplicate vendor name, receives (name, excludeId) */
  checkDuplicate: PropTypes.func,
};

export default AddEditVendorModal;
