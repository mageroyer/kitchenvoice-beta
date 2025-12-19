/**
 * Image Compression Utility
 *
 * Compress and resize images using native Canvas API
 * No external dependencies required
 */

/**
 * Compress an image file to target dimensions and quality
 *
 * @param {File} file - Image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 800)
 * @param {number} options.maxHeight - Maximum height (default: 600)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.8)
 * @param {string} options.outputFormat - Output format (default: 'image/jpeg')
 * @returns {Promise<Blob>} Compressed image as Blob
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 800,
    maxHeight = 600,
    quality = 0.8,
    outputFormat = 'image/jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => reject(new Error('Failed to load image'));

      img.onload = () => {
        try {
          // Calculate new dimensions maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          // Create canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          // Draw image on canvas with high quality
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (blob) {
                console.log(`✅ Image compressed: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            outputFormat,
            quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Convert a Blob to a data URL (base64)
 *
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Data URL
 */
export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a File to a data URL (base64)
 *
 * @param {File} file - File to convert
 * @returns {Promise<string>} Data URL
 */
export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/**
 * Compress image and convert to data URL in one step
 *
 * @param {File} file - Image file
 * @param {Object} options - Compression options (see compressImage)
 * @returns {Promise<string>} Data URL of compressed image
 */
export async function compressToDataUrl(file, options = {}) {
  const compressed = await compressImage(file, options);
  return await blobToDataUrl(compressed);
}

/**
 * Validate if file is a valid image type
 *
 * @param {File} file - File to validate
 * @returns {boolean} True if valid image
 */
export function isValidImageType(file) {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validTypes.includes(file.type.toLowerCase());
}

// Note: Use formatFileSize from utils/format.js instead of duplicating here
