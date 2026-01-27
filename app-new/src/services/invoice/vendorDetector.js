/**
 * Vendor Detector Service
 *
 * Detects vendors from invoice data using a cascade of detection methods.
 * Priority: Tax Number → Phone → Email → Exact Name → Fuzzy Name
 *
 * @module services/invoice/vendorDetector
 */

import { vendorDB } from '../database/indexedDB';

// ============================================
// NORMALIZATION HELPERS
// ============================================

/**
 * Normalize a tax number for comparison
 * Removes spaces, dashes, and converts to uppercase
 * @param {string} taxNumber - Raw tax number
 * @returns {string} Normalized tax number
 */
function normalizeTaxNumber(taxNumber) {
  if (!taxNumber) return '';
  return taxNumber
    .replace(/[\s\-\.]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Extract digits from a phone number
 * @param {string} phone - Raw phone number
 * @returns {string} Digits only
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Normalize an email for comparison
 * @param {string} email - Raw email
 * @returns {string} Lowercase trimmed email
 */
function normalizeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Normalize a name for comparison
 * Removes accents, lowercases, trims whitespace
 * @param {string} name - Raw name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Dice coefficient on word tokens
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score 0-1
 */
function calculateSimilarity(str1, str2) {
  const words1 = new Set(normalizeName(str1).split(' ').filter(w => w.length > 1));
  const words2 = new Set(normalizeName(str2).split(' ').filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  return (2 * intersection.size) / (words1.size + words2.size);
}

// ============================================
// DETECTION METHODS
// ============================================

/**
 * Find vendor by tax number (TPS/TVQ for Quebec, GST/HST for rest of Canada)
 * @param {string} taxNumber - Tax registration number
 * @param {Object[]} vendors - All vendors to search
 * @returns {Object|null} Matched vendor or null
 */
function findByTaxNumber(taxNumber, vendors) {
  const normalized = normalizeTaxNumber(taxNumber);
  if (normalized.length < 9) return null; // Tax numbers are at least 9 digits

  return vendors.find(v => {
    const vendorTax = normalizeTaxNumber(v.taxNumber);
    // Exact match or contained (for partial numbers)
    return vendorTax && (
      vendorTax === normalized ||
      vendorTax.includes(normalized) ||
      normalized.includes(vendorTax)
    );
  }) || null;
}

/**
 * Find vendor by phone number
 * @param {string} phone - Phone number
 * @param {Object[]} vendors - All vendors to search
 * @returns {Object|null} Matched vendor or null
 */
function findByPhone(phone, vendors) {
  const digits = normalizePhone(phone);
  if (digits.length < 10) return null;

  // Get last 10 digits (ignore country code)
  const searchDigits = digits.slice(-10);

  return vendors.find(v => {
    const vendorDigits = normalizePhone(v.phone);
    if (vendorDigits.length < 10) return false;

    const vendorLast10 = vendorDigits.slice(-10);
    return vendorLast10 === searchDigits;
  }) || null;
}

/**
 * Find vendor by email
 * @param {string} email - Email address
 * @param {Object[]} vendors - All vendors to search
 * @returns {Object|null} Matched vendor or null
 */
function findByEmail(email, vendors) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;

  return vendors.find(v => {
    const vendorEmail = normalizeEmail(v.email);
    return vendorEmail && vendorEmail === normalized;
  }) || null;
}

/**
 * Find vendor by exact name match
 * @param {string} name - Vendor name
 * @param {Object[]} vendors - All vendors to search
 * @returns {Object|null} Matched vendor or null
 */
function findByExactName(name, vendors) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  return vendors.find(v => {
    const vendorName = normalizeName(v.name);
    return vendorName === normalized;
  }) || null;
}

/**
 * Find vendor by fuzzy name match
 * @param {string} name - Vendor name
 * @param {Object[]} vendors - All vendors to search
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {{ vendor: Object, similarity: number } | null} Best match or null
 */
function findByFuzzyName(name, vendors, minSimilarity = 0.6) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  let bestMatch = null;
  let bestSimilarity = 0;

  for (const vendor of vendors) {
    const vendorName = normalizeName(vendor.name);
    const similarity = calculateSimilarity(normalized, vendorName);

    // Also check legal name
    const legalSimilarity = vendor.legalName
      ? calculateSimilarity(normalized, vendor.legalName)
      : 0;

    const maxSimilarity = Math.max(similarity, legalSimilarity);

    if (maxSimilarity > bestSimilarity) {
      bestSimilarity = maxSimilarity;
      bestMatch = vendor;
    }
  }

  if (bestMatch && bestSimilarity >= minSimilarity) {
    return { vendor: bestMatch, similarity: bestSimilarity };
  }

  return null;
}

// ============================================
// MAIN DETECTION API
// ============================================

/**
 * Detect vendor from extracted invoice data
 *
 * Uses cascade detection:
 * 1. Tax Number (exact) → confidence: 'exact'
 * 2. Phone (exact) → confidence: 'high'
 * 3. Email (exact) → confidence: 'high'
 * 4. Name (exact) → confidence: 'medium'
 * 5. Name (fuzzy) → confidence: 'low'
 *
 * @param {Object} invoiceData - Extracted invoice data
 * @param {string} [invoiceData.taxNumber] - Tax registration number
 * @param {string} [invoiceData.phone] - Phone number
 * @param {string} [invoiceData.email] - Email address
 * @param {string} [invoiceData.vendorName] - Vendor name
 * @param {string} [invoiceData.legalName] - Legal business name
 * @param {string} [invoiceData.address] - Address (for future use)
 * @returns {Promise<import('./types').VendorDetectionResult>}
 */
export async function detect(invoiceData) {
  // Get only active external vendors (excludes inactive and internal business vendor)
  // Uses vendorDB.getActiveExternal() instead of loading all and filtering in memory
  const vendors = await vendorDB.getActiveExternal();

  // Extract vendor info for return (even if no match)
  const extractedInfo = {
    name: invoiceData.vendorName || invoiceData.name || null,
    legalName: invoiceData.legalName || null,
    taxNumber: invoiceData.taxNumber || null,
    phone: invoiceData.phone || null,
    email: invoiceData.email || null,
    address: invoiceData.address || null,
    city: invoiceData.city || null,
    province: invoiceData.province || null,
    postalCode: invoiceData.postalCode || null
  };

  // 1. Tax Number Detection (highest confidence)
  if (invoiceData.taxNumber) {
    const vendor = findByTaxNumber(invoiceData.taxNumber, vendors);
    if (vendor) {
      return {
        vendor,
        confidence: 'exact',
        method: 'taxNumber',
        isNew: false,
        extractedInfo
      };
    }
  }

  // 2. Phone Detection
  if (invoiceData.phone) {
    const vendor = findByPhone(invoiceData.phone, vendors);
    if (vendor) {
      return {
        vendor,
        confidence: 'high',
        method: 'phone',
        isNew: false,
        extractedInfo
      };
    }
  }

  // 3. Email Detection
  if (invoiceData.email) {
    const vendor = findByEmail(invoiceData.email, vendors);
    if (vendor) {
      return {
        vendor,
        confidence: 'high',
        method: 'email',
        isNew: false,
        extractedInfo
      };
    }
  }

  // 4. Exact Name Detection
  const searchName = invoiceData.vendorName || invoiceData.name || invoiceData.legalName;
  if (searchName) {
    const vendor = findByExactName(searchName, vendors);
    if (vendor) {
      return {
        vendor,
        confidence: 'medium',
        method: 'exactName',
        isNew: false,
        extractedInfo
      };
    }

    // 5. Fuzzy Name Detection
    const fuzzyResult = findByFuzzyName(searchName, vendors);
    if (fuzzyResult) {
      return {
        vendor: fuzzyResult.vendor,
        confidence: 'low',
        method: 'fuzzyName',
        isNew: false,
        extractedInfo,
        similarity: fuzzyResult.similarity
      };
    }
  }

  // No match found
  return {
    vendor: null,
    confidence: 'none',
    method: 'none',
    isNew: true,
    extractedInfo
  };
}

/**
 * Quick parse invoice text for vendor info only
 * Used for initial detection before full parsing
 *
 * @param {string} text - Raw invoice text
 * @returns {Object} Extracted vendor-related fields
 */
export function quickExtractVendorInfo(text) {
  if (!text) return {};

  const result = {};

  // Tax number patterns (Quebec TPS/TVQ, Canada GST/HST)
  const taxPatterns = [
    /TPS[:\s]*([A-Z0-9\s\-]+)/i,
    /TVQ[:\s]*([A-Z0-9\s\-]+)/i,
    /GST[:\s]*([A-Z0-9\s\-]+)/i,
    /HST[:\s]*([A-Z0-9\s\-]+)/i,
    /Tax\s*(?:Reg(?:istration)?)?[:\s#]*([A-Z0-9\s\-]{9,})/i
  ];

  for (const pattern of taxPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.taxNumber = match[1].trim();
      break;
    }
  }

  // Phone patterns - look for phone numbers near Tel/Phone/Tél labels
  const phonePattern = /(?:Tel|Phone|Tél)[:\s]*\(?(\d{3})\)?[\s\-\.]*(\d{3})[\s\-\.]*(\d{4})/i;
  const phoneMatch = text.match(phonePattern);
  if (phoneMatch) {
    result.phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
  }

  // Email pattern
  const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailPattern);
  if (emailMatch) {
    result.email = emailMatch[1].trim();
  }

  // Vendor name is harder - typically at top of invoice
  // Will rely on Claude for this in most cases

  return result;
}

/**
 * Validate detection result before use
 *
 * @param {import('./types').VendorDetectionResult} result - Detection result
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateDetection(result) {
  const warnings = [];

  if (!result) {
    return { valid: false, warnings: ['No detection result'] };
  }

  if (result.confidence === 'low') {
    warnings.push('Low confidence match - please verify vendor');
  }

  if (result.confidence === 'none' && !result.isNew) {
    warnings.push('Detection failed - manual selection required');
  }

  // Invoice type is now auto-detected, no warning needed

  return {
    valid: result.vendor !== null || result.isNew,
    warnings
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  detect,
  quickExtractVendorInfo,
  validateDetection,
  // Expose helpers for testing
  _helpers: {
    normalizeTaxNumber,
    normalizePhone,
    normalizeEmail,
    normalizeName,
    calculateSimilarity,
    findByTaxNumber,
    findByPhone,
    findByEmail,
    findByExactName,
    findByFuzzyName
  }
};
