/**
 * PromotionModal Component
 *
 * Modal for adding a recipe to the website promotions carousel.
 * Prompts user for promo description, price, and valid dates.
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getWebsiteData, updateWebsiteSection } from '../../services/database/websiteDB';
import { recipeDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/promotionmodal.module.css';

function PromotionModal({ recipe, onClose, onSaved }) {
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Set default dates (today to 7 days from now)
  useEffect(() => {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    setValidFrom(today.toISOString().split('T')[0]);
    setValidTo(nextWeek.toISOString().split('T')[0]);

    // Set default description
    if (recipe?.name) {
      setDescription(`Special: ${recipe.name}`);
    }
  }, [recipe]);

  const handleSave = async () => {
    if (!validFrom || !validTo) {
      setError('Please set valid dates for the promotion');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Toggle website visibility ON
      await recipeDB.toggleWebsiteVisibility(recipe.id);

      // 2. Get current website data
      const websiteData = await getWebsiteData();
      const promotions = websiteData.promotions || { items: [] };

      // 3. Get the updated recipe to get the promotional photo
      const updatedRecipe = await recipeDB.getById(recipe.id);

      // 4. Create new promotion entry
      const newPromotion = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        photo: updatedRecipe?.public?.photo || null,
        description: description || `Special: ${recipe.name}`,
        price: price ? parseFloat(price) : null,
        validFrom,
        validTo,
        sortOrder: promotions.items.length + 1,
        createdAt: new Date().toISOString(),
      };

      // 5. Add to promotions
      const updatedItems = [...(promotions.items || [])];

      // Check if recipe already has a promotion - update it
      const existingIndex = updatedItems.findIndex(p => p.recipeId === recipe.id);
      if (existingIndex >= 0) {
        updatedItems[existingIndex] = { ...updatedItems[existingIndex], ...newPromotion };
      } else {
        updatedItems.push(newPromotion);
      }

      // 6. Save to Firestore
      await updateWebsiteSection('promotions', {
        ...promotions,
        items: updatedItems,
      });

      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error saving promotion:', err);
      setError(err.message || 'Failed to save promotion');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Add to Promotions</h2>
          <button className={styles.closeButton} onClick={handleCancel}>
            &times;
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Recipe Name (readonly) */}
          <div className={styles.recipeInfo}>
            <span className={styles.recipeIcon}>🏷️</span>
            <span className={styles.recipeName}>{recipe?.name}</span>
          </div>

          {/* Description */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Promo Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Special of the Week!"
              className={styles.input}
            />
          </div>

          {/* Price */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Price (optional)</label>
            <div className={styles.priceInput}>
              <span className={styles.currency}>$</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className={styles.input}
              />
            </div>
          </div>

          {/* Date Range */}
          <div className={styles.dateRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valid From</label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valid To</label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Add to Carousel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

PromotionModal.propTypes = {
  /** Recipe to promote */
  recipe: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  /** Close handler */
  onClose: PropTypes.func.isRequired,
  /** Called after promotion is saved */
  onSaved: PropTypes.func,
};

export default PromotionModal;
