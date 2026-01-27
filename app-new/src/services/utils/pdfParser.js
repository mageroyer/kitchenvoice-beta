/**
 * PDF Parser Service
 *
 * Extracts text from PDF files using PDF.js
 */

import * as pdfjsLib from 'pdfjs-dist';

// Set worker path - must match installed pdfjs-dist version
// Using unpkg CDN which has the latest version (cdnjs is outdated at 2.6.347)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs`;

/**
 * Extract text from PDF file
 * Preserves line structure for better parsing
 *
 * @param {File} pdfFile - PDF file object
 * @returns {Promise<string>} Extracted text with preserved line breaks
 */
export async function extractTextFromPDF(pdfFile) {
  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();

    // Load PDF document
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    let fullText = '';

    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      // Group text items by their Y position to preserve line structure
      // PDF text items have transform[5] as Y coordinate
      const lines = [];
      let currentLine = [];
      let lastY = null;
      const LINE_THRESHOLD = 5; // Y difference threshold to consider same line

      for (const item of textContent.items) {
        const y = item.transform[5]; // Y coordinate

        if (lastY === null || Math.abs(y - lastY) < LINE_THRESHOLD) {
          // Same line - add to current line
          currentLine.push(item.str);
        } else {
          // New line - save current and start new
          if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
          }
          currentLine = [item.str];
        }
        lastY = y;
      }

      // Don't forget the last line
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }

      const pageText = lines.join('\n');
      fullText += pageText + '\n\n';
    }

    // Clean up multiple blank lines
    fullText = fullText.replace(/\n{3,}/g, '\n\n');

    return fullText.trim();

  } catch (error) {
    console.error('❌ Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF. Make sure it\'s a valid PDF file.');
  }
}

/**
 * Convert PDF to image(s) for Claude Vision API
 * Renders all pages to canvas and exports as PNG
 *
 * @param {File} pdfFile - PDF file object
 * @param {Object} options - Conversion options
 * @param {number} [options.scale=2] - Render scale (2 = 2x resolution)
 * @param {number} [options.maxPages=10] - Max pages to convert
 * @returns {Promise<string|string[]>} Single data URL (1 page) or array of data URLs (multi-page)
 */
export async function convertPdfToImage(pdfFile, options = {}) {
  const { scale = 2, maxPages = 10 } = options;

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

    const pagesToConvert = Math.min(maxPages, pdf.numPages);

    const imageDataUrls = [];

    // Convert each page to an image
    for (let pageNum = 1; pageNum <= pagesToConvert; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext('2d');

      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Convert to PNG data URL
      const imageDataUrl = canvas.toDataURL('image/png');
      imageDataUrls.push(imageDataUrl);
    }

    // Return single string for 1 page (backwards compatible), array for multi-page
    return pagesToConvert === 1 ? imageDataUrls[0] : imageDataUrls;

  } catch (error) {
    console.error('❌ Error converting PDF to image:', error);
    throw new Error('Failed to convert PDF to image: ' + error.message);
  }
}

/**
 * Validate PDF file
 *
 * @param {File} file - File to validate
 * @returns {boolean} True if valid PDF
 */
export function isValidPDF(file) {
  if (!file) return false;

  // Check file type
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    return false;
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return false;
  }

  return true;
}

/**
 * Get file size in human-readable format
 *
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "2.5 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
