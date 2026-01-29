/**
 * RecipePhotoGallery Component
 *
 * Modal for viewing and managing recipe photos.
 * - View all photos for a recipe
 * - Select one as the promotional photo (for public website)
 * - Delete photos
 */

import React, { useState } from 'react';
import styles from '../../styles/components/recipephotogallery.module.css';

export default function RecipePhotoGallery({
  photos = [],
  promotionalPhotoId = null,
  onSetPromotional,
  onDeletePhoto,
  onClose,
}) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const handleSetPromotional = (photoId) => {
    if (onSetPromotional) {
      onSetPromotional(photoId);
    }
  };

  const handleDelete = (photoId) => {
    if (onDeletePhoto && confirm('Delete this photo?')) {
      onDeletePhoto(photoId);
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null);
      }
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Recipe Photos</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {photos.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📷</span>
              <p>No photos yet</p>
              <p className={styles.emptyHint}>
                Use the camera or import button to add photos
              </p>
            </div>
          ) : (
            <>
              {/* Selected Photo Preview */}
              {selectedPhoto && (
                <div className={styles.previewSection}>
                  <img
                    src={selectedPhoto.url}
                    alt={selectedPhoto.caption || 'Recipe photo'}
                    className={styles.previewImage}
                  />
                  <div className={styles.previewActions}>
                    <button
                      className={`${styles.promoBtn} ${promotionalPhotoId === selectedPhoto.id ? styles.isPromo : ''}`}
                      onClick={() => handleSetPromotional(selectedPhoto.id)}
                    >
                      {promotionalPhotoId === selectedPhoto.id ? '⭐ Promotional' : '☆ Set as Promotional'}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(selectedPhoto.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                  {selectedPhoto.takenAt && (
                    <p className={styles.photoDate}>
                      Taken: {new Date(selectedPhoto.takenAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Photo Grid */}
              <div className={styles.grid}>
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className={`${styles.gridItem} ${selectedPhoto?.id === photo.id ? styles.selected : ''} ${promotionalPhotoId === photo.id ? styles.promotional : ''}`}
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img src={photo.url} alt={photo.caption || 'Recipe photo'} />
                    {promotionalPhotoId === photo.id && (
                      <span className={styles.promoBadge}>⭐</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.hint}>
            💡 Mark one photo as "Promotional" to display it on your public website
          </p>
        </div>
      </div>
    </div>
  );
}
