/**
 * Image Storage Service
 *
 * Handles uploading and managing dish photos in Firebase Storage
 * for public website display.
 */

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app, auth } from '../database/firebase';
import { compressToBlob } from '../../utils/imageCompression';

// Initialize Firebase Storage
let storage = null;
try {
  if (app) {
    storage = getStorage(app);
  }
} catch (error) {
  console.warn('Firebase Storage not initialized:', error);
}

/**
 * Upload a dish photo to Firebase Storage
 * @param {File} file - The image file to upload
 * @param {number} recipeId - The recipe ID this photo belongs to
 * @param {Object} options - Upload options
 * @param {number} options.maxWidth - Max image width (default: 1200)
 * @param {number} options.maxHeight - Max image height (default: 900)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.85)
 * @returns {Promise<string>} The public URL of the uploaded image
 */
export const uploadDishPhoto = async (file, recipeId, options = {}) => {
  if (!storage) {
    throw new Error('Firebase Storage not initialized');
  }

  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to upload photos');
  }

  const { maxWidth = 1200, maxHeight = 900, quality = 0.85 } = options;

  // Compress image before upload
  const compressedBlob = await compressToBlob(file, {
    maxWidth,
    maxHeight,
    quality,
    type: 'image/webp' // Use WebP for better compression
  });

  // Generate unique filename
  const timestamp = Date.now();
  const storagePath = `dish-photos/${currentUser.uid}/${recipeId}_${timestamp}.webp`;
  const storageRef = ref(storage, storagePath);

  // Upload the compressed image
  const snapshot = await uploadBytes(storageRef, compressedBlob, {
    contentType: 'image/webp',
    customMetadata: {
      recipeId: String(recipeId),
      uploadedBy: currentUser.uid,
      originalName: file.name
    }
  });

  // Get the public download URL
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
};

/**
 * Delete a dish photo from Firebase Storage
 * @param {string} photoUrl - The URL of the photo to delete
 * @returns {Promise<void>}
 */
export const deleteDishPhoto = async (photoUrl) => {
  if (!storage || !photoUrl) {
    return;
  }

  try {
    // Extract the storage path from the URL
    // Firebase Storage URLs contain the path encoded
    const storageRef = ref(storage, photoUrl);
    await deleteObject(storageRef);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if (error.code !== 'storage/object-not-found') {
      console.error('Error deleting dish photo:', error);
      throw error;
    }
  }
};

/**
 * Get the storage reference for a dish photo
 * @param {number} recipeId - Recipe ID
 * @returns {string} The storage path prefix for this recipe's photos
 */
export const getDishPhotoPath = (recipeId) => {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated');
  }
  return `dish-photos/${currentUser.uid}/${recipeId}`;
};

export default {
  uploadDishPhoto,
  deleteDishPhoto,
  getDishPhotoPath
};
