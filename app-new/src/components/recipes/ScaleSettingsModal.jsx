/**
 * ScaleSettingsModal Component
 *
 * Optional modal for configuring WiFi scale integration settings for a recipe.
 * This is completely optional - recipes work without scale settings.
 * When configured, enables automatic sync to WiFi scales for label printing.
 *
 * @module components/recipes/ScaleSettingsModal
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import styles from '../../styles/components/scalesettingsmodal.module.css';

/**
 * Label format options for scales
 */
const LABEL_FORMATS = [
  { value: 'standard', label: 'Standard (Name, Price, Weight)' },
  { value: 'detailed', label: 'Detailed (+ Ingredients, Allergens)' },
  { value: 'simple', label: 'Simple (Name, Price only)' },
];

/**
 * Scale department options (common deli/prepared foods departments)
 */
const SCALE_DEPARTMENTS = [
  { value: '01', label: '01 - Deli Meats' },
  { value: '02', label: '02 - Salads & Sides' },
  { value: '03', label: '03 - Prepared Meals' },
  { value: '04', label: '04 - Bakery' },
  { value: '05', label: '05 - Seafood' },
  { value: '06', label: '06 - Meat' },
  { value: '07', label: '07 - Cheese' },
  { value: '99', label: '99 - Other' },
];

/**
 * Price unit options
 */
const PRICE_UNITS = [
  { value: 'kg', label: 'Per kg' },
  { value: 'lb', label: 'Per lb' },
  { value: 'portion', label: 'Per portion' },
  { value: '100g', label: 'Per 100g' },
];

/**
 * Generate a PLU code suggestion based on recipe ID
 * @param {number} recipeId - Recipe ID
 * @returns {string} Suggested PLU code
 */
const generatePLU = (recipeId) => {
  // PLU codes typically start with 50001 for in-store items
  const base = 50000;
  return String(base + (recipeId || 1));
};

/**
 * ScaleSettingsModal - Configure WiFi scale integration for a recipe
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether modal is visible
 * @param {Function} props.onClose - Callback when modal closes
 * @param {Function} props.onSave - Callback with scale settings data
 * @param {Object} props.recipe - Current recipe data
 * @returns {JSX.Element|null} Scale settings modal or null if closed
 */
function ScaleSettingsModal({ isOpen, onClose, onSave, recipe }) {
  // Form state
  const [formData, setFormData] = useState({
    plu: '',
    sellPrice: '',
    sellPriceUnit: 'kg',
    portionWeight: '',
    tareWeight: '',
    shelfLifeDays: '3',
    labelFormat: 'standard',
    scaleDepartment: '03',
    syncToScale: true,
    availableForSale: true,
    availableAsIngredient: false,
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Initialize form with existing recipe scale settings
  useEffect(() => {
    if (recipe && isOpen) {
      setFormData({
        plu: recipe.plu || generatePLU(recipe.id),
        sellPrice: recipe.sellPrice?.toString() || '',
        sellPriceUnit: recipe.sellPriceUnit || 'kg',
        portionWeight: recipe.portionWeight?.toString() || '',
        tareWeight: recipe.tareWeight?.toString() || '0',
        shelfLifeDays: recipe.shelfLifeDays?.toString() || '3',
        labelFormat: recipe.labelFormat || 'standard',
        scaleDepartment: recipe.scaleDepartment || '03',
        syncToScale: recipe.syncToScale !== false,
        availableForSale: recipe.availableForSale !== false,
        availableAsIngredient: recipe.availableAsIngredient === true,
      });
      setErrors({});
    }
  }, [recipe, isOpen]);

  /**
   * Handle input change
   */
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  }, [errors]);

  /**
   * Validate form data
   * @returns {boolean} True if valid
   */
  const validateForm = useCallback(() => {
    const newErrors = {};

    // PLU is required if sync is enabled
    if (formData.syncToScale && !formData.plu?.trim()) {
      newErrors.plu = 'PLU code is required for scale sync';
    }

    // PLU must be numeric
    if (formData.plu && !/^\d+$/.test(formData.plu.trim())) {
      newErrors.plu = 'PLU must be numeric';
    }

    // Sell price validation
    if (formData.sellPrice && isNaN(parseFloat(formData.sellPrice))) {
      newErrors.sellPrice = 'Invalid price';
    }

    // Portion weight validation
    if (formData.portionWeight && isNaN(parseFloat(formData.portionWeight))) {
      newErrors.portionWeight = 'Invalid weight';
    }

    // Tare weight validation
    if (formData.tareWeight && isNaN(parseFloat(formData.tareWeight))) {
      newErrors.tareWeight = 'Invalid tare weight';
    }

    // Shelf life validation
    if (formData.shelfLifeDays && (isNaN(parseInt(formData.shelfLifeDays)) || parseInt(formData.shelfLifeDays) < 0)) {
      newErrors.shelfLifeDays = 'Invalid shelf life';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  /**
   * Handle save
   */
  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const scaleSettings = {
        plu: formData.plu?.trim() || null,
        sellPrice: formData.sellPrice ? parseFloat(formData.sellPrice) : null,
        sellPriceUnit: formData.sellPriceUnit,
        portionWeight: formData.portionWeight ? parseFloat(formData.portionWeight) : null,
        tareWeight: formData.tareWeight ? parseFloat(formData.tareWeight) : 0,
        shelfLifeDays: formData.shelfLifeDays ? parseInt(formData.shelfLifeDays) : 3,
        labelFormat: formData.labelFormat,
        scaleDepartment: formData.scaleDepartment,
        syncToScale: formData.syncToScale,
        availableForSale: formData.availableForSale,
        availableAsIngredient: formData.availableAsIngredient,
        lastScaleSync: null, // Will be set when actually synced
        scaleSyncStatus: formData.syncToScale ? 'pending' : null,
      };

      await onSave(scaleSettings);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to save scale settings' });
    } finally {
      setSaving(false);
    }
  }, [formData, validateForm, onSave, onClose]);

  /**
   * Clear scale settings (disable scale integration)
   */
  const handleClearSettings = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({
        plu: null,
        sellPrice: null,
        sellPriceUnit: null,
        portionWeight: null,
        tareWeight: null,
        shelfLifeDays: null,
        labelFormat: null,
        scaleDepartment: null,
        syncToScale: false,
        availableForSale: false,
        availableAsIngredient: false,
        lastScaleSync: null,
        scaleSyncStatus: null,
      });
      onClose();
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to clear scale settings' });
    } finally {
      setSaving(false);
    }
  }, [onSave, onClose]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scale Settings"
      size="medium"
    >
      <div className={styles.container}>
        <p className={styles.description}>
          Configure WiFi scale integration for automatic label printing and production tracking.
          These settings are optional.
        </p>

        {errors.submit && (
          <div className={styles.error}>{errors.submit}</div>
        )}

        {/* PLU and Price Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="plu" className={styles.label}>
              PLU Code
              <span className={styles.hint}>Scale product identifier</span>
            </label>
            <Input
              id="plu"
              name="plu"
              type="text"
              value={formData.plu}
              onChange={handleChange}
              placeholder="50001"
              error={errors.plu}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="sellPrice" className={styles.label}>
              Sell Price
            </label>
            <div className={styles.priceInput}>
              <Input
                id="sellPrice"
                name="sellPrice"
                type="number"
                step="0.01"
                value={formData.sellPrice}
                onChange={handleChange}
                placeholder="28.86"
                error={errors.sellPrice}
              />
              <select
                name="sellPriceUnit"
                value={formData.sellPriceUnit}
                onChange={handleChange}
                className={styles.unitSelect}
              >
                {PRICE_UNITS.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Weight Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="portionWeight" className={styles.label}>
              Portion Weight (g)
              <span className={styles.hint}>Expected weight per portion</span>
            </label>
            <Input
              id="portionWeight"
              name="portionWeight"
              type="number"
              step="1"
              value={formData.portionWeight}
              onChange={handleChange}
              placeholder="450"
              error={errors.portionWeight}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="tareWeight" className={styles.label}>
              Tare Weight (g)
              <span className={styles.hint}>Container weight to subtract</span>
            </label>
            <Input
              id="tareWeight"
              name="tareWeight"
              type="number"
              step="1"
              value={formData.tareWeight}
              onChange={handleChange}
              placeholder="40"
              error={errors.tareWeight}
            />
          </div>
        </div>

        {/* Shelf Life and Department Row */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="shelfLifeDays" className={styles.label}>
              Shelf Life (days)
            </label>
            <Input
              id="shelfLifeDays"
              name="shelfLifeDays"
              type="number"
              step="1"
              min="0"
              value={formData.shelfLifeDays}
              onChange={handleChange}
              placeholder="3"
              error={errors.shelfLifeDays}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="scaleDepartment" className={styles.label}>
              Scale Department
            </label>
            <select
              id="scaleDepartment"
              name="scaleDepartment"
              value={formData.scaleDepartment}
              onChange={handleChange}
              className={styles.select}
            >
              {SCALE_DEPARTMENTS.map(dept => (
                <option key={dept.value} value={dept.value}>
                  {dept.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Label Format */}
        <div className={styles.field}>
          <label htmlFor="labelFormat" className={styles.label}>
            Label Format
          </label>
          <select
            id="labelFormat"
            name="labelFormat"
            value={formData.labelFormat}
            onChange={handleChange}
            className={styles.select}
          >
            {LABEL_FORMATS.map(format => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </div>

        {/* Checkboxes */}
        <div className={styles.checkboxGroup}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="syncToScale"
              checked={formData.syncToScale}
              onChange={handleChange}
            />
            <span>Sync to scale on save</span>
          </label>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="availableForSale"
              checked={formData.availableForSale}
              onChange={handleChange}
            />
            <span>Available for sale (shelf item)</span>
          </label>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              name="availableAsIngredient"
              checked={formData.availableAsIngredient}
              onChange={handleChange}
            />
            <span>Available as ingredient (for other recipes)</span>
          </label>
        </div>

        {/* Sync Status (if previously configured) */}
        {recipe?.scaleSyncStatus && (
          <div className={styles.syncStatus}>
            <span className={styles.syncLabel}>Last Sync Status:</span>
            <span className={`${styles.syncBadge} ${styles[recipe.scaleSyncStatus]}`}>
              {recipe.scaleSyncStatus}
            </span>
            {recipe.lastScaleSync && (
              <span className={styles.syncTime}>
                {new Date(recipe.lastScaleSync).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {recipe?.plu && (
            <Button
              variant="danger"
              onClick={handleClearSettings}
              disabled={saving}
            >
              Remove Scale Settings
            </Button>
          )}
          <div className={styles.actionsRight}>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

ScaleSettingsModal.propTypes = {
  /** Whether modal is visible */
  isOpen: PropTypes.bool.isRequired,
  /** Callback when modal closes */
  onClose: PropTypes.func.isRequired,
  /** Callback with scale settings data */
  onSave: PropTypes.func.isRequired,
  /** Current recipe data */
  recipe: PropTypes.shape({
    id: PropTypes.number,
    name: PropTypes.string,
    plu: PropTypes.string,
    sellPrice: PropTypes.number,
    sellPriceUnit: PropTypes.string,
    portionWeight: PropTypes.number,
    tareWeight: PropTypes.number,
    shelfLifeDays: PropTypes.number,
    labelFormat: PropTypes.string,
    scaleDepartment: PropTypes.string,
    syncToScale: PropTypes.bool,
    availableForSale: PropTypes.bool,
    availableAsIngredient: PropTypes.bool,
    lastScaleSync: PropTypes.string,
    scaleSyncStatus: PropTypes.string,
  }),
};

export default ScaleSettingsModal;
