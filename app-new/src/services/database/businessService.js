/**
 * Business Service
 *
 * Manages business information stored in Firestore
 * - Business name, type, contact info
 * - Logo storage
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import firebaseCache, { CACHE_KEYS, CACHE_TTL } from './firebaseCache';

// Business types
export const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bakery', label: 'Bakery / Patisserie' },
  { value: 'catering', label: 'Catering Service' },
  { value: 'hotel', label: 'Hotel Kitchen' },
  { value: 'cafe', label: 'Café / Coffee Shop' },
  { value: 'foodtruck', label: 'Food Truck' },
  { value: 'other', label: 'Other' }
];

// Suggested departments for kitchen operations
export const SUGGESTED_DEPARTMENTS = [
  { name: 'Cuisine', description: 'Main kitchen / Hot line' },
  { name: 'Pastry', description: 'Desserts and baked goods' },
  { name: 'Garde Manger', description: 'Cold preparations, salads, appetizers' },
  { name: 'Butchery', description: 'Meat preparation and portioning' },
  { name: 'Prep Kitchen', description: 'Mise en place and prep work' },
  { name: 'Bakery', description: 'Bread and viennoiserie' }
];

/**
 * Invalidate business info cache
 * @param {string} userId - Firebase user ID
 */
export function invalidateBusinessCache(userId) {
  const cacheKey = firebaseCache.generateKey(CACHE_KEYS.BUSINESS_INFO, userId);
  firebaseCache.invalidate(cacheKey);
}

/**
 * Get business info for a user
 * @param {string} userId - Firebase user ID
 * @param {boolean} [bypassCache=false] - Skip cache and fetch fresh data
 * @returns {Promise<Object|null>} Business info or null
 */
export async function getBusinessInfo(userId, bypassCache = false) {
  try {
    const cacheKey = firebaseCache.generateKey(CACHE_KEYS.BUSINESS_INFO, userId);

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const cached = firebaseCache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    const docRef = doc(db, 'users', userId, 'settings', 'business');
    const docSnap = await getDoc(docRef);

    const data = docSnap.exists() ? docSnap.data() : null;

    // Cache for 15 minutes (business info rarely changes)
    firebaseCache.set(cacheKey, data, CACHE_TTL.LONG);

    return data;
  } catch (error) {
    console.error('Error getting business info:', error);
    throw error;
  }
}

/**
 * Save or update business info
 * @param {string} userId - Firebase user ID
 * @param {Object} businessData - Business information
 * @returns {Promise<void>}
 */
export async function saveBusinessInfo(userId, businessData) {
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'business');
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      await updateDoc(docRef, {
        ...businessData,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(docRef, {
        ...businessData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // Invalidate cache after saving
    invalidateBusinessCache(userId);
  } catch (error) {
    console.error('Error saving business info:', error);
    throw error;
  }
}

/**
 * Check if initial setup is complete
 * Uses cached business info to avoid extra Firestore reads
 * @param {string} userId - Firebase user ID
 * @returns {Promise<boolean>}
 */
export async function isSetupComplete(userId) {
  try {
    // Use cached business info
    const businessInfo = await getBusinessInfo(userId);

    // Check explicit flag first
    if (businessInfo?.setupComplete === true) {
      return true;
    }

    // Fallback: if business name exists, consider setup complete
    // This handles cases where data was created without the flag
    if (businessInfo?.name && businessInfo.name.trim().length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking setup status:', error);
    return false;
  }
}

/**
 * Mark setup as complete
 * @param {string} userId - Firebase user ID
 * @returns {Promise<void>}
 */
export async function markSetupComplete(userId) {
  try {
    const docRef = doc(db, 'users', userId, 'settings', 'business');
    await updateDoc(docRef, {
      setupComplete: true,
      setupCompletedAt: serverTimestamp()
    });

    // Invalidate cache after marking complete
    invalidateBusinessCache(userId);
  } catch (error) {
    console.error('Error marking setup complete:', error);
    throw error;
  }
}
