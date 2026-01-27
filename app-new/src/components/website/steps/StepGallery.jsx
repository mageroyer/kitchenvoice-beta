/**
 * Step 8: Gallery
 */

import React, { useState, useRef } from 'react';
import { uploadDishPhoto } from '../../../services/storage/imageStorage';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepGallery({ data, updateField }) {
  const [uploading, setUploading] = useState({});
  const fileInputRefs = useRef({});

  const handleUpload = async (category, file, index = null) => {
    const uploadKey = index !== null ? `${category}-${index}` : category;
    setUploading(prev => ({ ...prev, [uploadKey]: true }));

    try {
      const photoUrl = await uploadDishPhoto(file, `gallery-${category}-${Date.now()}`, {
        maxWidth: category === 'hero' ? 1920 : 1200,
        maxHeight: category === 'hero' ? 800 : 900,
      });

      if (category.startsWith('hero.')) {
        // Hero images (single)
        updateField(`gallery.${category}`, photoUrl);
      } else {
        // Gallery arrays
        const current = data.gallery?.[category] || [];
        const newPhotos = [...current, {
          url: photoUrl,
          caption: '',
          order: current.length,
        }];
        updateField(`gallery.${category}`, newPhotos);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
    }
  };

  const removePhoto = (category, index) => {
    const current = data.gallery?.[category] || [];
    const newPhotos = current.filter((_, i) => i !== index);
    updateField(`gallery.${category}`, newPhotos);
  };

  const updateCaption = (category, index, caption) => {
    const current = [...(data.gallery?.[category] || [])];
    current[index] = { ...current[index], caption };
    updateField(`gallery.${category}`, current);
  };

  const GallerySection = ({ category, title, description, maxPhotos = 10 }) => {
    const photos = data.gallery?.[category] || [];
    const canAddMore = photos.length < maxPhotos;

    return (
      <div className={styles.gallerySection}>
        <h4>{title}</h4>
        <p className={styles.gallerySectionDesc}>{description}</p>

        <div className={styles.galleryGrid}>
          {photos.map((photo, index) => (
            <div key={index} className={styles.galleryItem}>
              <img src={photo.url} alt={photo.caption || `Photo ${index + 1}`} />
              <input
                type="text"
                className={styles.captionInput}
                value={photo.caption || ''}
                onChange={(e) => updateCaption(category, index, e.target.value)}
                placeholder="Add caption..."
              />
              <button
                className={styles.removePhotoBtn}
                onClick={() => removePhoto(category, index)}
              >
                ×
              </button>
            </div>
          ))}

          {canAddMore && (
            <div
              className={styles.addPhotoBox}
              onClick={() => fileInputRefs.current[category]?.click()}
            >
              {uploading[category] ? (
                <span>Uploading...</span>
              ) : (
                <>
                  <span className={styles.addIcon}>+</span>
                  <span>Add Photo</span>
                </>
              )}
              <input
                ref={el => fileInputRefs.current[category] = el}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(category, file);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>

        <p className={styles.photoCount}>
          {photos.length} / {maxPhotos} photos
        </p>
      </div>
    );
  };

  const HeroImageUpload = ({ category, title, description, dimensions }) => {
    const imageUrl = data.gallery?.hero?.[category.replace('hero.', '')];
    const uploadKey = category;

    return (
      <div className={styles.heroImageSection}>
        <h4>{title}</h4>
        <p className={styles.gallerySectionDesc}>{description}</p>
        <p className={styles.dimensionHint}>Recommended: {dimensions}</p>

        <div
          className={`${styles.heroImageUpload} ${imageUrl ? styles.hasImage : ''}`}
          onClick={() => fileInputRefs.current[uploadKey]?.click()}
        >
          {uploading[uploadKey] ? (
            <span className={styles.uploadingText}>Uploading...</span>
          ) : imageUrl ? (
            <>
              <img src={imageUrl} alt={title} />
              <div className={styles.heroImageOverlay}>
                <span>Click to change</span>
              </div>
            </>
          ) : (
            <div className={styles.heroImagePlaceholder}>
              <span className={styles.addIcon}>📷</span>
              <span>Click to upload</span>
            </div>
          )}
        </div>

        <input
          ref={el => fileInputRefs.current[uploadKey] = el}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(category, file);
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />

        {imageUrl && (
          <button
            className={styles.removeHeroBtn}
            onClick={() => updateField(`gallery.hero.${category.replace('hero.', '')}`, null)}
          >
            Remove Image
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.stepGallery}>
      <p className={styles.stepIntro}>
        Upload photos to showcase your business. High-quality images help attract customers
        and build trust.
      </p>

      <div className={styles.formSection}>
        <h3>Hero Images</h3>
        <p className={styles.sectionDesc}>
          These large images appear at the top of each page.
        </p>

        <div className={styles.heroImagesGrid}>
          <HeroImageUpload
            category="hero.homepage"
            title="Homepage Hero"
            description="The main banner image visitors see first"
            dimensions="1920 x 600 pixels"
          />
          <HeroImageUpload
            category="hero.about"
            title="About Page Hero"
            description="Banner for your About Us page"
            dimensions="1920 x 400 pixels"
          />
          <HeroImageUpload
            category="hero.menu"
            title="Menu Page Hero"
            description="Banner for your Menu/Products page"
            dimensions="1920 x 400 pixels"
          />
          <HeroImageUpload
            category="hero.contact"
            title="Contact Page Hero"
            description="Banner for your Contact page"
            dimensions="1920 x 400 pixels"
          />
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Photo Gallery</h3>

        <GallerySection
          category="storefront"
          title="Storefront & Exterior"
          description="Photos of your store from outside, signage, entrance"
          maxPhotos={5}
        />

        <GallerySection
          category="interior"
          title="Interior & Ambiance"
          description="Inside your store, displays, atmosphere"
          maxPhotos={8}
        />

        <GallerySection
          category="products"
          title="Products & Food"
          description="Close-ups of your products, prepared foods, specialties"
          maxPhotos={15}
        />

        <GallerySection
          category="team"
          title="Team & People"
          description="Your staff, owner, behind the scenes"
          maxPhotos={6}
        />

        <GallerySection
          category="behindScenes"
          title="Behind the Scenes"
          description="Kitchen, preparation, craftsmanship"
          maxPhotos={8}
        />

        <GallerySection
          category="events"
          title="Events & Community"
          description="Special events, markets, community involvement"
          maxPhotos={8}
        />
      </div>

      <div className={styles.galleryTips}>
        <h4>📸 Photo Tips</h4>
        <ul>
          <li>Use natural lighting when possible</li>
          <li>Show your products from multiple angles</li>
          <li>Include people to add warmth and scale</li>
          <li>Keep images clear and well-focused</li>
          <li>Horizontal images work best for heroes</li>
        </ul>
      </div>
    </div>
  );
}
