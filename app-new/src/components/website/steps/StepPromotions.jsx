/**
 * Step 9: Promotions
 *
 * Manage recipe-based promotions for the public website.
 * Shows recipes with W=green (isVisible), allows setting promo details.
 */

import React, { useState, useEffect } from 'react';
import { recipeDB } from '../../../services/database/indexedDB';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepPromotions({ data, updateField }) {
  const [availableRecipes, setAvailableRecipes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load recipes that are visible on website (W=green)
  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const allRecipes = await recipeDB.getAll();
        // Filter to only recipes with isVisible = true
        const visibleRecipes = allRecipes.filter(r => r.public?.isVisible);
        setAvailableRecipes(visibleRecipes);
      } catch (err) {
        console.error('Failed to load recipes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadRecipes();
  }, []);

  const promotions = data.promotions?.items || [];

  // Check if recipe is already in promotions
  const isInPromotions = (recipeId) => {
    return promotions.some(p => p.recipeId === recipeId);
  };

  // Get promotion for a recipe
  const getPromotion = (recipeId) => {
    return promotions.find(p => p.recipeId === recipeId);
  };

  // Add recipe to promotions
  const addPromotion = (recipe) => {
    // Get promotional photo URL
    let photoUrl = recipe.public?.photo || recipe.imageUrl || null;
    if (recipe.promotionalPhotoId && recipe.photos?.length > 0) {
      const promoPhoto = recipe.photos.find(p => p.id === recipe.promotionalPhotoId);
      if (promoPhoto?.url) photoUrl = promoPhoto.url;
    }

    const newPromo = {
      recipeId: recipe.id,
      recipeName: recipe.name,
      photo: photoUrl,
      description: '',
      price: recipe.public?.sellingPrice || null,
      validFrom: new Date().toISOString().split('T')[0],
      validTo: getNextWeekDate(),
      sortOrder: promotions.length,
    };

    updateField('promotions.items', [...promotions, newPromo]);
  };

  // Remove recipe from promotions
  const removePromotion = (recipeId) => {
    updateField('promotions.items', promotions.filter(p => p.recipeId !== recipeId));
  };

  // Update promotion field
  const updatePromotion = (recipeId, field, value) => {
    const updated = promotions.map(p => {
      if (p.recipeId === recipeId) {
        return { ...p, [field]: value };
      }
      return p;
    });
    updateField('promotions.items', updated);
  };

  // Get date 7 days from now
  const getNextWeekDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  };

  // Check if promotion is active
  const isActive = (promo) => {
    const today = new Date().toISOString().split('T')[0];
    return promo.validFrom <= today && promo.validTo >= today;
  };

  // Check if promotion is expired
  const isExpired = (promo) => {
    const today = new Date().toISOString().split('T')[0];
    return promo.validTo < today;
  };

  if (loading) {
    return <div className={styles.loading}>Loading recipes...</div>;
  }

  return (
    <div className={styles.stepPromotions}>
      <p className={styles.stepIntro}>
        Manage your promotions carousel. Promotions are created when you click the "W" button
        on a recipe in the Recipes list - a modal will prompt you for promo details.
        You can also edit existing promotions here or add more from available recipes.
      </p>

      {/* Carousel Settings */}
      <div className={styles.formSection}>
        <h3>Carousel Settings</h3>

        <div className={styles.formRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.promotions?.carouselEnabled !== false}
              onChange={(e) => updateField('promotions.carouselEnabled', e.target.checked)}
            />
            Show promotions carousel on website
          </label>
        </div>

        <div className={styles.formGroup}>
          <label>Carousel Title</label>
          <input
            type="text"
            value={data.promotions?.carouselTitle || 'Promotions de la Semaine'}
            onChange={(e) => updateField('promotions.carouselTitle', e.target.value)}
            placeholder="Promotions de la Semaine"
          />
        </div>
      </div>

      {/* Available Recipes */}
      <div className={styles.formSection}>
        <h3>Available Recipes</h3>
        <p className={styles.sectionDesc}>
          Recipes with website visibility enabled. Click to add to promotions.
        </p>

        {availableRecipes.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📋</span>
            <p>No recipes with website visibility enabled</p>
            <p className={styles.emptyHint}>
              Go to Recipes and click the "W" button to enable website visibility
            </p>
          </div>
        ) : (
          <div className={styles.recipeChips}>
            {availableRecipes.map((recipe) => (
              <button
                key={recipe.id}
                className={`${styles.recipeChip} ${isInPromotions(recipe.id) ? styles.inPromo : ''}`}
                onClick={() => {
                  if (isInPromotions(recipe.id)) {
                    removePromotion(recipe.id);
                  } else {
                    addPromotion(recipe);
                  }
                }}
              >
                {isInPromotions(recipe.id) ? '✓ ' : '+ '}
                {recipe.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Promotions */}
      <div className={styles.formSection}>
        <h3>Active Promotions ({promotions.length})</h3>

        {promotions.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🏷️</span>
            <p>No promotions yet</p>
            <p className={styles.emptyHint}>
              Click the "W" button on a recipe in the Recipes list to add promotions,
              or click on a recipe above.
            </p>
          </div>
        ) : (
          <div className={styles.promotionsList}>
            {promotions.map((promo) => (
              <div
                key={promo.recipeId}
                className={`${styles.promotionCard} ${isExpired(promo) ? styles.expired : ''} ${isActive(promo) ? styles.active : ''}`}
              >
                {/* Photo */}
                <div className={styles.promoPhoto}>
                  {promo.photo ? (
                    <img src={promo.photo} alt={promo.recipeName} />
                  ) : (
                    <div className={styles.noPhoto}>
                      <span>📷</span>
                      <span>No photo</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className={styles.promoDetails}>
                  <div className={styles.promoHeader}>
                    <h4>{promo.recipeName}</h4>
                    <button
                      className={styles.removePromoBtn}
                      onClick={() => removePromotion(promo.recipeId)}
                      title="Remove promotion"
                    >
                      ×
                    </button>
                  </div>

                  {/* Status Badge */}
                  <div className={styles.promoStatus}>
                    {isExpired(promo) && <span className={styles.expiredBadge}>Expired</span>}
                    {isActive(promo) && <span className={styles.activeBadge}>Active</span>}
                    {!isActive(promo) && !isExpired(promo) && <span className={styles.scheduledBadge}>Scheduled</span>}
                  </div>

                  {/* Description */}
                  <div className={styles.promoField}>
                    <label>Promo Description</label>
                    <textarea
                      value={promo.description || ''}
                      onChange={(e) => updatePromotion(promo.recipeId, 'description', e.target.value)}
                      placeholder="This week's special! Fresh and delicious..."
                      rows={2}
                    />
                  </div>

                  {/* Price */}
                  <div className={styles.promoField}>
                    <label>Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={promo.price || ''}
                      onChange={(e) => updatePromotion(promo.recipeId, 'price', parseFloat(e.target.value) || null)}
                      placeholder="9.99"
                    />
                  </div>

                  {/* Date Range */}
                  <div className={styles.promoDateRange}>
                    <div className={styles.promoField}>
                      <label>Valid From</label>
                      <input
                        type="date"
                        value={promo.validFrom || ''}
                        onChange={(e) => updatePromotion(promo.recipeId, 'validFrom', e.target.value)}
                      />
                    </div>
                    <div className={styles.promoField}>
                      <label>Valid To</label>
                      <input
                        type="date"
                        value={promo.validTo || ''}
                        onChange={(e) => updatePromotion(promo.recipeId, 'validTo', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className={styles.galleryTips}>
        <h4>💡 Promotion Tips</h4>
        <ul>
          <li>Set clear date ranges to automatically show/hide promotions</li>
          <li>Add compelling descriptions to attract customers</li>
          <li>Use promotional photos from the Recipe Editor gallery</li>
          <li>Expired promotions won't show on your public website</li>
        </ul>
      </div>
    </div>
  );
}
