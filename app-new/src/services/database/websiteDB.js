/**
 * Website Database Service
 *
 * Handles CRUD operations for complete website data.
 * Stores in Firestore under /stores/{storeId}/website
 */

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { DEFAULT_WEBSITE_DATA } from './websiteSchema';

/**
 * Get the store ID for the current user
 */
const getStoreId = () => {
  const currentUser = auth?.currentUser;
  if (currentUser?.uid) {
    return `store_${currentUser.uid}`;
  }
  return null;
};

/**
 * Get complete website data for the current store
 * @returns {Promise<Object>} Website data object
 */
export const getWebsiteData = async () => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');
    const websiteSnap = await getDoc(websiteRef);

    if (websiteSnap.exists()) {
      // Deep merge with defaults to ensure all fields exist
      return deepMerge(DEFAULT_WEBSITE_DATA, websiteSnap.data());
    }

    return { ...DEFAULT_WEBSITE_DATA };
  } catch (error) {
    console.error('Error fetching website data:', error);
    throw error;
  }
};

/**
 * Save complete website data
 * @param {Object} data - Website data to save
 * @returns {Promise<void>}
 */
export const saveWebsiteData = async (data) => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');
    const now = new Date().toISOString();

    // Check if document exists
    const existing = await getDoc(websiteRef);
    const dataToSave = {
      ...data,
      updatedAt: now,
    };

    if (!existing.exists()) {
      dataToSave.createdAt = now;
    }

    await setDoc(websiteRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error saving website data:', error);
    throw error;
  }
};

/**
 * Update specific section of website data
 * @param {string} section - Section key (e.g., 'identity', 'contact')
 * @param {Object} data - Section data
 * @returns {Promise<void>}
 */
export const updateWebsiteSection = async (section, data) => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');
    const now = new Date().toISOString();

    // Check if document exists, create if not
    const existing = await getDoc(websiteRef);

    const updates = {
      [section]: data,
      updatedAt: now,
    };

    if (!existing.exists()) {
      updates.createdAt = now;
    }

    await setDoc(websiteRef, updates, { merge: true });
  } catch (error) {
    console.error(`Error updating website section ${section}:`, error);
    throw error;
  }
};

/**
 * Publish website (make it live)
 * @returns {Promise<void>}
 */
export const publishWebsite = async () => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');
    const now = new Date().toISOString();

    await setDoc(websiteRef, {
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    }, { merge: true });
  } catch (error) {
    console.error('Error publishing website:', error);
    throw error;
  }
};

/**
 * Unpublish website (take offline)
 * @returns {Promise<void>}
 */
export const unpublishWebsite = async () => {
  if (!db) {
    throw new Error('Firebase not initialized');
  }

  const storeId = getStoreId();
  if (!storeId) {
    throw new Error('User must be authenticated');
  }

  try {
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');

    await setDoc(websiteRef, {
      status: 'disabled',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    console.error('Error unpublishing website:', error);
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
  const reserved = [
    'admin', 'api', 'www', 'app', 'help', 'support', 'about', 'contact',
    'login', 'register', 'dashboard', 'settings', 'blog', 'news',
    'terms', 'privacy', 'legal', 'pricing', 'features'
  ];
  if (reserved.includes(slug)) {
    return false;
  }

  try {
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

    // Update website data with the slug
    await updateWebsiteSection('slug', slug);

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
    const slugRef = doc(db, 'slugs', slug);
    const slugSnap = await getDoc(slugRef);

    if (slugSnap.exists() && slugSnap.data()?.storeId === storeId) {
      await deleteDoc(slugRef);
    }
  } catch (error) {
    console.error('Error releasing slug:', error);
  }
};

/**
 * Get public website data by slug (for public website rendering)
 * @param {string} slug - Website slug
 * @returns {Promise<Object|null>} Website data or null if not found
 */
export const getPublicWebsiteBySlug = async (slug) => {
  if (!db || !slug) {
    return null;
  }

  try {
    // Find store ID from slug
    const slugRef = doc(db, 'slugs', slug);
    const slugSnap = await getDoc(slugRef);

    if (!slugSnap.exists()) {
      return null;
    }

    const storeId = slugSnap.data().storeId;

    // Get website data
    const websiteRef = doc(db, 'stores', storeId, 'website', 'data');
    const websiteSnap = await getDoc(websiteRef);

    if (!websiteSnap.exists()) {
      return null;
    }

    const data = websiteSnap.data();

    // Only return if published
    if (data.status !== 'published') {
      return null;
    }

    return {
      ...data,
      storeId,
    };
  } catch (error) {
    console.error('Error fetching public website:', error);
    return null;
  }
};

/**
 * Get public recipes for a store (for menu page)
 * @param {string} storeId - Store ID
 * @returns {Promise<Array>} Array of public recipes
 */
export const getPublicRecipes = async (storeId) => {
  if (!db || !storeId) {
    return [];
  }

  try {
    const recipesRef = collection(db, 'stores', storeId, 'publicRecipes');
    const recipesSnap = await getDocs(recipesRef);

    const recipes = [];
    recipesSnap.forEach(doc => {
      const data = doc.data();
      if (data.public?.isVisible) {
        recipes.push({ id: doc.id, ...data });
      }
    });

    return recipes;
  } catch (error) {
    console.error('Error fetching public recipes:', error);
    return [];
  }
};

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export default {
  getWebsiteData,
  saveWebsiteData,
  updateWebsiteSection,
  publishWebsite,
  unpublishWebsite,
  checkSlugAvailable,
  reserveSlug,
  releaseSlug,
  getPublicWebsiteBySlug,
  getPublicRecipes,
};
