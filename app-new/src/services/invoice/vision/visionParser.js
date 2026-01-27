/**
 * Vision Parser - PDF to Structured JSON via Claude Vision API
 *
 * Replaces the complex text-extraction + parsing pipeline with a single
 * Vision API call that "sees" the document and returns structured JSON.
 *
 * SECURITY: All API calls are routed through Firebase Cloud Functions proxy.
 * The Claude API key is stored securely in Firebase Secrets, never exposed to frontend.
 *
 * @module services/invoice/vision/visionParser
 */

import { API_URL, getAuthToken, isAuthenticated, withCredits } from '../../ai/claudeBase.js';

const VISION_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;

/**
 * The magic prompt - extract all invoice details including packaging format
 * Claude Vision infers the structure from the document visually
 */

const PARSE_PROMPT = `Parse this invoice into JSON.
Return ONLY valid JSON, no markdown code blocks.`;

/**
 * Convert a File/Blob to base64 string
 * @param {File|Blob} file - The file to convert
 * @returns {Promise<string>} Base64 encoded string
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert PDF pages to images using PDF.js
 * @param {File} pdfFile - The PDF file
 * @param {Object} options - Options
 * @param {number} options.scale - Render scale (default 2 for good quality)
 * @returns {Promise<string[]>} Array of base64 PNG images
 */
async function pdfToImages(pdfFile, { scale = 2 } = {}) {
  // Dynamically import PDF.js to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist');

  // Use CDN for worker (must match pdfjs-dist version in package.json)
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const images = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const base64 = canvas.toDataURL('image/png').split(',')[1];
    images.push(base64);
  }

  return images;
}

/**
 * Call Claude Vision API via secure Cloud Function proxy
 *
 * SECURITY:
 * - API key is stored in Firebase Secrets, not exposed to frontend.
 * - All requests are routed through the claudeProxy Cloud Function.
 * - Requires Firebase Authentication (sends ID token in Authorization header).
 *
 * @param {string[]} images - Array of base64 PNG images
 * @param {string} prompt - The prompt to send
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If user is not authenticated
 */
async function callVisionAPI(images, prompt) {
  // Check authentication first
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please log in to parse invoices.');
  }

  // Get the Firebase ID token
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('Failed to get authentication token. Please log in again.');
  }

  // Build content array: images first, then text prompt
  const content = [];

  for (const base64 of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: base64
      }
    });
  }

  content.push({ type: 'text', text: prompt });

  // Call through secure Cloud Function proxy with authentication
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Vision API error: ${error.error?.message || error.error || response.statusText}`);
  }

  const data = await response.json();
  const textContent = data.content?.[0]?.text;

  if (!textContent) {
    throw new Error('No response from Vision API');
  }

  // Parse JSON response
  try {
    // Handle case where Claude wraps in markdown code block despite instructions
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse Vision response as JSON: ${e.message}`);
  }
}

/**
 * Parse an invoice PDF using Claude Vision
 *
 * @param {File} pdfFile - The PDF file to parse
 * @param {Object} options - Options
 * @param {string} options.customPrompt - Override the default prompt
 * @param {number} options.scale - Image render scale (default 2)
 * @returns {Promise<VisionParseResult>} The parsed invoice data
 *
 * @example
 * const result = await parseInvoice(pdfFile);
 * console.log(result.rawJson);        // The raw JSON from Vision
 * console.log(result.pageCount);      // Number of pages processed
 * console.log(result.usage);          // Token usage stats
 */
export async function parseInvoice(pdfFile, options = {}) {
  // Wrap with credit checking (INVOICE_VISION = 5 credits)
  return withCredits('INVOICE_VISION', async () => {
    return _parseInvoiceInternal(pdfFile, options);
  });
}

// Internal implementation
async function _parseInvoiceInternal(pdfFile, options = {}) {
  const { customPrompt, scale = 2 } = options;

  const startTime = Date.now();

  // Convert PDF to images
  const images = await pdfToImages(pdfFile, { scale });

  // Call Vision API
  const prompt = customPrompt || PARSE_PROMPT;
  const rawJson = await callVisionAPI(images, prompt);

  const endTime = Date.now();

  return {
    rawJson,
    pageCount: images.length,
    parseTimeMs: endTime - startTime,
    fileName: pdfFile.name,
    fileSize: pdfFile.size,
    timestamp: new Date().toISOString()
  };
}

/**
 * Parse an invoice from an image file (PNG, JPG, etc.)
 * For single-page invoice images
 *
 * @param {File} imageFile - The image file
 * @param {Object} options - Options
 * @returns {Promise<VisionParseResult>} The parsed invoice data
 */
export async function parseInvoiceImage(imageFile, options = {}) {
  // Wrap with credit checking (INVOICE_VISION = 5 credits)
  return withCredits('INVOICE_VISION', async () => {
    return _parseInvoiceImageInternal(imageFile, options);
  });
}

// Internal implementation
async function _parseInvoiceImageInternal(imageFile, options = {}) {
  const { customPrompt } = options;

  const startTime = Date.now();

  const base64 = await fileToBase64(imageFile);
  const prompt = customPrompt || PARSE_PROMPT;
  const rawJson = await callVisionAPI([base64], prompt);

  const endTime = Date.now();

  return {
    rawJson,
    pageCount: 1,
    parseTimeMs: endTime - startTime,
    fileName: imageFile.name,
    fileSize: imageFile.size,
    timestamp: new Date().toISOString()
  };
}

/**
 * @typedef {Object} VisionParseResult
 * @property {Object} rawJson - The raw JSON returned by Vision API
 * @property {number} pageCount - Number of pages/images processed
 * @property {number} parseTimeMs - Time taken to parse in milliseconds
 * @property {string} fileName - Original file name
 * @property {number} fileSize - Original file size in bytes
 * @property {string} timestamp - ISO timestamp of when parsing occurred
 */

export default {
  parseInvoice,
  parseInvoiceImage
};
