/**
 * WebsiteTab Component
 *
 * Allows users to configure public website display settings for a recipe.
 * Includes photo upload, pricing, description, categories, and visibility toggles.
 */

import { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Dropdown from '../common/Dropdown';
import { uploadDishPhoto, deleteDishPhoto } from '../../services/storage/imageStorage';
import { isValidImageType } from '../../utils/imageCompression';
import { validateImageFile } from '../../utils/sanitize';
import styles from '../../styles/components/websitetab.module.css';

// Common display categories for grocery stores
const DISPLAY_CATEGORIES = [
  'Comptoir Chaud',
  'Comptoir Froid',
  'Boucherie',
  'Charcuterie',
  'Boulangerie',
  'Patisserie',
  'Traiteur',
  'Plats Prepares',
  'Salades',
  'Sandwichs',
  'Soupes',
  'Sauces',
  'Accompagnements',
  'Desserts',
  'Boissons',
  'Autre'
];

// Common dietary tags
const DIETARY_TAGS = [
  { value: 'vegetarien', label: 'Vegetarien' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'sans-gluten', label: 'Sans Gluten' },
  { value: 'sans-lactose', label: 'Sans Lactose' },
  { value: 'sans-noix', label: 'Sans Noix' },
  { value: 'bio', label: 'Bio' },
  { value: 'local', label: 'Local' },
  { value: 'halal', label: 'Halal' },
  { value: 'casher', label: 'Casher' },
  { value: 'fait-maison', label: 'Fait Maison' }
];

/**
 * WebsiteTab Component
 *
 * @param {Object} props
 * @param {Object} props.publicData - Current public settings
 * @param {Function} props.onChange - Handler for changes
 * @param {number} props.recipeId - Recipe ID for photo uploads
 * @param {number} props.recipeCost - Calculated recipe cost per portion
 * @param {boolean} props.disabled - Disable editing
 */
function WebsiteTab({
  publicData = {},
  onChange,
  recipeId,
  recipeCost = 0,
  disabled = false
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Default public data structure
  const data = {
    isVisible: false,
    isAvailableToday: false,
    sellingPrice: null,
    description: '',
    photo: null,
    displayCategory: '',
    tags: [],
    sortOrder: 0,
    lastPublished: null,
    ...publicData
  };

  // Calculate margin
  const margin = data.sellingPrice && recipeCost > 0
    ? ((data.sellingPrice - recipeCost) / data.sellingPrice * 100).toFixed(1)
    : null;

  // Handle field changes
  const handleChange = useCallback((field, value) => {
    const newData = { ...data, [field]: value };

    // Auto-set lastPublished when visibility is enabled
    if (field === 'isVisible' && value && !data.lastPublished) {
      newData.lastPublished = new Date().toISOString();
    }

    onChange(newData);
  }, [data, onChange]);

  // Handle photo upload
  const handlePhotoUpload = async (file) => {
    if (!file || !recipeId) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error);
      return;
    }

    if (!isValidImageType(file)) {
      setUploadError('Invalid file type. Please select a JPG, PNG, or WebP image.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Delete old photo if exists
      if (data.photo) {
        await deleteDishPhoto(data.photo);
      }

      // Upload new photo
      const photoUrl = await uploadDishPhoto(file, recipeId);
      handleChange('photo', photoUrl);
    } catch (error) {
      console.error('Photo upload failed:', error);
      setUploadError('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Handle file input change
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoUpload(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handlePhotoUpload(file);
    }
  };

  // Remove photo
  const handleRemovePhoto = async () => {
    if (data.photo) {
      try {
        await deleteDishPhoto(data.photo);
      } catch (error) {
        console.error('Failed to delete photo:', error);
      }
      handleChange('photo', null);
    }
  };

  // Toggle tag
  const toggleTag = (tagValue) => {
    const currentTags = data.tags || [];
    const newTags = currentTags.includes(tagValue)
      ? currentTags.filter(t => t !== tagValue)
      : [...currentTags, tagValue];
    handleChange('tags', newTags);
  };

  return (
    <div className={styles.websiteTab}>
      <h3 className={styles.sectionTitle}>Public Website Settings</h3>

      {/* Photo Upload */}
      <div className={styles.photoSection}>
        <label className={styles.fieldLabel}>Dish Photo</label>
        <div
          className={`${styles.photoDropzone} ${dragOver ? styles.dragOver : ''} ${data.photo ? styles.hasPhoto : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className={styles.uploadingState}>
              <div className={styles.spinner}></div>
              <span>Uploading...</span>
            </div>
          ) : data.photo ? (
            <div className={styles.photoPreview}>
              <img src={data.photo} alt="Dish photo" />
              {!disabled && (
                <button
                  className={styles.removePhotoBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemovePhoto();
                  }}
                  title="Remove photo"
                >
                  X
                </button>
              )}
            </div>
          ) : (
            <div className={styles.dropzoneContent}>
              <span className={styles.dropzoneIcon}>+</span>
              <span className={styles.dropzoneText}>
                {disabled ? 'No photo' : 'Drop image here or click to upload'}
              </span>
              <span className={styles.dropzoneHint}>
                Recommended: 1200x900px, JPG/PNG/WebP
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />
        {uploadError && (
          <div className={styles.uploadError}>{uploadError}</div>
        )}
      </div>

      {/* Pricing */}
      <div className={styles.pricingSection}>
        <div className={styles.priceRow}>
          <div className={styles.priceField}>
            <label className={styles.fieldLabel}>Selling Price ($)</label>
            <Input
              type="number"
              value={data.sellingPrice || ''}
              onChange={(e) => handleChange('sellingPrice', parseFloat(e.target.value) || null)}
              placeholder="0.00"
              min="0"
              step="0.01"
              disabled={disabled}
              size="medium"
            />
          </div>

          <div className={styles.costInfo}>
            <div className={styles.costItem}>
              <span className={styles.costLabel}>Recipe Cost:</span>
              <span className={styles.costValue}>${recipeCost.toFixed(2)}</span>
            </div>
            {margin !== null && (
              <div className={`${styles.costItem} ${parseFloat(margin) < 30 ? styles.lowMargin : ''}`}>
                <span className={styles.costLabel}>Margin:</span>
                <span className={styles.costValue}>{margin}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className={styles.descriptionSection}>
        <label className={styles.fieldLabel}>
          Customer Description
          <span className={styles.charCount}>{data.description?.length || 0}/500</span>
        </label>
        <textarea
          className={styles.descriptionInput}
          value={data.description || ''}
          onChange={(e) => handleChange('description', e.target.value.slice(0, 500))}
          placeholder="Short, appetizing description for customers..."
          maxLength={500}
          rows={3}
          disabled={disabled}
        />
      </div>

      {/* Display Category */}
      <div className={styles.categorySection}>
        <label className={styles.fieldLabel}>Display Category</label>
        <Dropdown
          options={['', ...DISPLAY_CATEGORIES]}
          value={data.displayCategory || ''}
          onChange={(e) => handleChange('displayCategory', e.target.value)}
          placeholder="Select category..."
          disabled={disabled}
        />
      </div>

      {/* Dietary Tags */}
      <div className={styles.tagsSection}>
        <label className={styles.fieldLabel}>Dietary Tags</label>
        <div className={styles.tagsList}>
          {DIETARY_TAGS.map(tag => (
            <button
              key={tag.value}
              className={`${styles.tagChip} ${(data.tags || []).includes(tag.value) ? styles.active : ''}`}
              onClick={() => !disabled && toggleTag(tag.value)}
              disabled={disabled}
              type="button"
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visibility Toggles */}
      <div className={styles.visibilitySection}>
        <label className={styles.fieldLabel}>Visibility</label>
        <div className={styles.toggleRow}>
          <button
            className={`${styles.toggleBtn} ${data.isVisible ? styles.active : ''}`}
            onClick={() => !disabled && handleChange('isVisible', !data.isVisible)}
            disabled={disabled}
            type="button"
          >
            <span className={styles.toggleIcon}>{data.isVisible ? '1' : '0'}</span>
            <span className={styles.toggleLabel}>Show on Website</span>
          </button>

          <button
            className={`${styles.toggleBtn} ${data.isAvailableToday ? styles.active : ''}`}
            onClick={() => !disabled && handleChange('isAvailableToday', !data.isAvailableToday)}
            disabled={disabled}
            type="button"
          >
            <span className={styles.toggleIcon}>{data.isAvailableToday ? '1' : '0'}</span>
            <span className={styles.toggleLabel}>Available Today</span>
          </button>
        </div>
        {data.lastPublished && (
          <div className={styles.lastPublished}>
            Last published: {new Date(data.lastPublished).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

WebsiteTab.propTypes = {
  publicData: PropTypes.shape({
    isVisible: PropTypes.bool,
    isAvailableToday: PropTypes.bool,
    sellingPrice: PropTypes.number,
    description: PropTypes.string,
    photo: PropTypes.string,
    displayCategory: PropTypes.string,
    tags: PropTypes.arrayOf(PropTypes.string),
    sortOrder: PropTypes.number,
    lastPublished: PropTypes.string
  }),
  onChange: PropTypes.func.isRequired,
  recipeId: PropTypes.number,
  recipeCost: PropTypes.number,
  disabled: PropTypes.bool
};

export default WebsiteTab;
