/**
 * Website Settings Database Service
 *
 * Handles CRUD operations for store website settings.
 * Settings are stored in Firestore under /stores/{storeId}/settings
 */

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';

/**
 * Get the store ID for the current user
 * @returns {string|null} Store ID or null if not authenticated
 */
const getStoreId = () => {
  const currentUser = auth?.currentUser;
  if (currentUser?.uid) {
    return `store_${currentUser.uid}`;
  }
  return null;
};

/**
 * Default website settings
 */
export const DEFAULT_SETTINGS = {
  enabled: false,
  slug: null,
  template: 'marche', // 'marche' | 'urbain' | 'chaleur'
  branding: {
    logo: null,
    coverPhoto: null,
    tagline: ''
  },
  colors: {
    primary: '#2C5530', // Forest green (Marche default)
    accent: '#D4AF37'   // Gold accent
  },
  displayCategories: [], // Ordered list of category names
  displayOptions: {
    showPrices: true,
    showPhotos: true
  },
  seo: {
    title: '',
    description: ''
  },
  contact: {
    phone: '',
    address: '',
    hours: '',
    social: {
      facebook: '',
      instagram: ''
    }
  },
  createdAt: null,
  updatedAt: null
};

/**
 * Get website settings for the current store
 * @returns {Promise<Object>} Website settings object
 */
export const getWebsiteSettings = async () => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const settingsRef = doc(db, 'stores', storeId, 'settings', 'website');
    const settingsSnap = await getDoc(settingsRef);

    if (settingsSnap.exists()) {
      return { ...DEFAULT_SETTINGS, ...settingsSnap.data() };
    }

    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error('Error fetching website settings:', error);
    throw error;
  }
};

/**
 * Save website settings for the current store
 * @param {Object} settings - Settings to save
 * @returns {Promise<void>}
 */
export const saveWebsiteSettings = async (settings) => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const settingsRef = doc(db, 'stores', storeId, 'settings', 'website');
    const now = new Date().toISOString();

    const dataToSave = {
      ...settings,
      updatedAt: now
    };

    // Check if document exists
    const existing = await getDoc(settingsRef);
    if (!existing.exists()) {
      dataToSave.createdAt = now;
    }

    await setDoc(settingsRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error saving website settings:', error);
    throw error;
  }
};

/**
 * Update specific website settings fields
 * Creates the document if it doesn't exist (for first-time users)
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export const updateWebsiteSettings = async (updates) => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const settingsRef = doc(db, 'stores', storeId, 'settings', 'website');
    const now = new Date().toISOString();

    // Check if document exists to set createdAt for new documents
    const existing = await getDoc(settingsRef);
    const dataToSave = {
      ...updates,
      updatedAt: now
    };

    if (!existing.exists()) {
      dataToSave.createdAt = now;
    }

    // Use setDoc with merge to create or update
    await setDoc(settingsRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error updating website settings:', error);
    throw error;
  }
};

/**
 * Check if a slug is available
 * @param {string} slug - Slug to check
 * @returns {Promise<boolean>} True if available
 */
export const checkSlugAvailable = async (slug) => {
  if (!db || !slug) {
    return false;
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
    return false;
  }

  // Reserved slugs
  const reserved = ['admin', 'api', 'www', 'app', 'help', 'support', 'about', 'contact'];
  if (reserved.includes(slug)) {
    return false;
  }

  try {
    // Check the slugs collection for uniqueness
    const slugRef = doc(db, 'slugs', slug);
    const slugSnap = await getDoc(slugRef);

    if (!slugSnap.exists()) {
      return true;
    }

    // Check if it belongs to current user
    const storeId = getStoreId();
    return slugSnap.data()?.storeId === storeId;
  } catch (error) {
    console.error('Error checking slug:', error);
    return false;
  }
};

/**
 * Reserve a slug for the current store
 * @param {string} slug - Slug to reserve
 * @returns {Promise<boolean>} True if successfully reserved
 */
export const reserveSlug = async (slug) => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  // First check availability
  const available = await checkSlugAvailable(slug);
  if (!available) {
    return false;
  }

  try {
    // Reserve the slug
    const slugRef = doc(db, 'slugs', slug);
    await setDoc(slugRef, {
      storeId,
      reservedAt: new Date().toISOString()
    });

    // Update store settings with the new slug
    await updateWebsiteSettings({ slug });

    return true;
  } catch (error) {
    console.error('Error reserving slug:', error);
    throw error;
  }
};

/**
 * Release a slug (when changing to a new one)
 * @param {string} slug - Slug to release
 * @returns {Promise<void>}
 */
export const releaseSlug = async (slug) => {
  if (!db || !slug) {
    return;
  }

  const storeId = getStoreId();
  if (!storeId) {
    return;
  }

  try {
    // Only release if it belongs to current store
    const slugRef = doc(db, 'slugs', slug);
    const slugSnap = await getDoc(slugRef);

    if (slugSnap.exists() && slugSnap.data()?.storeId === storeId) {
      await deleteDoc(slugRef);
    }
  } catch (error) {
    console.error('Error releasing slug:', error);
    // Don't throw - this is a cleanup operation
  }
};

export default {
  getWebsiteSettings,
  saveWebsiteSettings,
  updateWebsiteSettings,
  checkSlugAvailable,
  reserveSlug,
  releaseSlug,
  DEFAULT_SETTINGS
};
