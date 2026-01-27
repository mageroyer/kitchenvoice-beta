/**
 * JSON Normalizer - Transform variable Vision JSON to standard format
 *
 * Claude Vision returns semantically correct but structurally variable JSON.
 * This module normalizes it to a consistent format for downstream processing.
 *
 * Based on testing with 5 different vendor invoice types:
 * - C&C Packing (meat, weight-based)
 * - Norref (seafood)
 * - Acema (specialty foods, ordered/delivered tracking)
 * - Les Dépendances (cheese/dairy, triple quantity tracking)
 * - Carrousel (packaging/containers)
 *
 * @module services/invoice/vision/jsonNormalizer
 */

import { vendorDB } from '../../database/vendorDB';

// ============================================================================
// FIELD ALIASES - Maps standard field names to possible Vision output paths
// ============================================================================

const FIELD_ALIASES = {
  // Vendor Information
  vendorName: [
    // Nested paths (most common Vision API outputs)
    'invoice_header.company',        // "LES DÉPENDANCES" - actual Vision output
    'invoice_header.company_name',
    'invoice_details.company',       // "Courchesne Larose Ltée" - another Vision format
    'invoice_details.company_name',
    'invoice.company.name',
    'invoice.supplier.name',
    'invoice.supplier.company',
    'vendor.name',
    'vendor.company',
    'supplier.name',
    'company.name',
    'from.name',
    'from.company',
    'seller.name',
    'seller.company',
    // Flat field names
    'vendor_name',
    'vendorName',
    'supplier_name',
    'supplierName',
    'company_name',
    'companyName',
    'company',
    'from_name',
    'seller_name',
  ],
  vendorAddress: [
    'invoice_details.address',
    'invoice_header.address',
    'invoice.company.address',
    'invoice.supplier.address',
    'vendor.address',
    'contact_info.address',
    'supplier.address'
  ],
  vendorPhone: [
    'invoice_details.phone',
    'invoice_header.phone',
    'invoice.company.phone',
    'invoice.supplier.phone',
    'vendor.phone',
    'contact_info.phone',
    'supplier.phone'
  ],

  // Tax Numbers (for vendor matching)
  taxTPS: [
    'invoice.tax_numbers.tps_gst',
    'tax_numbers.tps_gst',
    'tax_numbers.tps',
    'additional_info.tps',
    'tps_gst',
    'tps'
  ],
  taxTVQ: [
    'invoice.tax_numbers.tvq_qst',
    'tax_numbers.tvq_qst',
    'tax_numbers.tvq',
    'additional_info.tvq',
    'tvq_qst',
    'tvq'
  ],

  // Customer Information
  customerName: [
    'customer.bill_to.name',
    'customer.bill_to.company',
    'invoice.customer.name',
    'invoice.bill_to.company',
    'invoice.bill_to.name',
    'sold_to.name',
    'addresses.sold_to.name',
    'bill_to.company',
    'bill_to.name',
    'customer.name'
  ],
  customerAddress: [
    'invoice.customer.sold_to',
    'invoice.customer.address',
    'invoice.bill_to.address',
    'sold_to.address',
    'addresses.sold_to.address',
    'bill_to.address',
    'customer.address'
  ],

  // Invoice Details
  invoiceNumber: [
    'invoice.number',
    'invoice.invoice_number',
    'invoice.invoice_details.invoice_number',
    'invoice_header.invoice_number',
    'invoice_details.invoice_number',
    'invoice_number'
  ],
  invoiceDate: [
    'invoice.date',
    'invoice.invoice_details.date',
    'invoice_header.invoice_date',
    'invoice_details.invoice_date',
    'invoice_details.date',
    'date'
  ],
  paymentTerms: [
    'invoice_details.terms',
    'invoice.terms',
    'invoice.invoice_details.payment_terms',
    'invoice_header.terms',
    'invoice.terms.payment_terms',
    'terms.payment_terms',
    'payment_terms',
    'terms'
  ],
  poNumber: [
    'invoice.po_number',
    'invoice.invoice_details.po_number',
    'invoice.invoice_details.customer_order_no',
    'transaction_details.po_reference',
    'invoice_details.po_number',
    'po_number',
    'po_reference'
  ],

  // Totals
  subtotal: [
    'totals.subtotal',
    'invoice.totals.subtotal',
    'invoice.summary.subtotal',
    'pricing.subtotal',
    'summary.subtotal',
    'subtotal'
  ],
  grandTotal: [
    'totals.grand_total',
    'totals.invoice_total',
    'totals.total',
    'totals.amount_due',
    'totals.balance_due',
    'totals.net_total',
    'invoice.totals.grand_total',
    'invoice.totals.total',
    'invoice.totals.amount_due',
    'invoice.summary.total',
    'pricing.total',
    'summary.total',
    'grand_total',
    'invoice_total',
    'amount_due',
    'balance_due',
    'net_total',
    'total'
  ],

  // Tax Amounts
  taxTPSAmount: [
    'totals.tps_gst_5_percent',
    'totals.tps_gst',
    'totals.gst_tps',
    'invoice.totals.tps_gst',
    'invoice.summary.tps_gst_5_percent',
    'pricing.tps',
    'summary.tps_gst',
    'tps_gst',
    'gst_tps',
    'tps'
  ],
  taxTVQAmount: [
    'totals.tvq_qst_9_975_percent',
    'totals.tvq_qst',
    'totals.qst_tvq',
    'invoice.totals.tvq_qst',
    'invoice.summary.tvq_qst_9_975_percent',
    'pricing.tvq',
    'summary.tvq_qst',
    'qst_tvq',
    'tvq_qst',
    'tvq'
  ],

  // Items Array
  items: [
    'line_items',
    'lineItems',
    'invoice.items',
    'items'
  ]
};

// ============================================================================
// KNOWN LINE ITEM FIELDS - All recognized field names for line items
// ============================================================================

const KNOWN_LINE_ITEM_FIELDS = new Set([
  // SKU/Code
  'product_code', 'product_number', 'item_number', 'code', 'product_no', 'sku',
  'item_code', 'itemNo', 'itemNumber', 'item_no', 'article', 'reference', 'ref', 'upc',
  // Description
  'description', 'desc', 'name', 'product_name', 'item_name', 'produit',
  'designation', 'libelle', 'product_description',
  // Quantity
  'qty_invoiced', 'quantity_invoiced', 'qtyInvoiced', 'quantity_ordered', 'qty_ordered',
  'shipped', 'qty_shipped', 'quantity_shipped', 'delivered', 'qty_delivered',
  'quantity_delivered', 'quantity', 'qty', 'qte', 'qté', 'quantite', 'ordered',
  // Price
  'unit_price', 'price', 'unitPrice', 'prix', 'prix_unitaire', 'unit_cost', 'cost', 'rate',
  // Total
  'extended_price', 'extendedPrice', 'extended', 'amount', 'total',
  'totalPrice', 'line_total', 'montant', 'ext_price', 'extension',
  // Unit
  'unit', 'uom', 'unit_of_measure', 'unite', 'unité', 'um',
  // Weight
  'weight', 'poids', 'net_weight', 'gross_weight', 'wgt', 'total_weight',
  'weight_kg', 'weight_lb', 'weight_unit', 'weightUnit',
  // Format
  'format', 'boxing_format', 'packagingFormat', 'pack', 'size',
  'unit_size', 'package_size', 'packaging', 'container_size', 'pack_size',
  // Other known fields
  'price_variation', 'type', 'line_number', 'lineNumber'
]);

// Track unknown fields encountered in this session
let unknownFieldsThisSession = new Set();
let lastTriggerTime = 0;
const TRIGGER_COOLDOWN_MS = 60000; // Don't trigger more than once per minute

/**
 * Check for unknown fields in a line item and track them
 * @param {Object} item - Raw line item from Vision
 * @returns {string[]} List of unknown field names
 */
function detectUnknownFields(item) {
  const unknown = [];

  for (const key of Object.keys(item)) {
    const lowerKey = key.toLowerCase();
    // Check if this field is known (case-insensitive)
    const isKnown = [...KNOWN_LINE_ITEM_FIELDS].some(
      known => known.toLowerCase() === lowerKey
    );

    if (!isKnown && !key.startsWith('_')) {
      unknown.push(key);
      unknownFieldsThisSession.add(key);
    }
  }

  return unknown;
}

/**
 * Write trigger to Firestore (production) and localStorage (dev)
 * CommandCenter or manual inspection can check for pending triggers
 * @param {string[]} unknownFields - Fields that weren't recognized
 * @param {Object} context - Additional context (invoiceNumber, vendor, etc.)
 */
async function writeTriggerFile(unknownFields, context = {}) {
  // Browser environment check
  if (typeof window === 'undefined') return;

  // Cooldown check - don't spam triggers
  const now = Date.now();
  if (now - lastTriggerTime < TRIGGER_COOLDOWN_MS) {
    console.log('[FieldTrigger] Cooldown active, skipping trigger write');
    return;
  }

  const trigger = {
    timestamp: new Date().toISOString(),
    reason: 'unknown_fields_detected',
    unknownFields: [...unknownFieldsThisSession],
    newFields: unknownFields,
    context: {
      invoiceNumber: context.invoiceNumber || null,
      vendorName: context.vendorName || null,
      itemCount: context.itemCount || 0
    },
    sessionStats: {
      totalUnknownFields: unknownFieldsThisSession.size
    },
    processed: false  // Flag for inspection
  };

  lastTriggerTime = now;

  // Store in localStorage for dev/debugging
  try {
    localStorage.setItem('fieldVariationTrigger', JSON.stringify(trigger));
    console.log('[FieldTrigger] Saved to localStorage:', unknownFields);
  } catch (e) {
    console.warn('[FieldTrigger] localStorage save failed:', e);
  }

  // Save to Firestore for production inspection
  try {
    const { db } = await import('../../database/firebase.js');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

    await addDoc(collection(db, 'maintenanceTriggers'), {
      type: 'field_variation',
      ...trigger,
      createdAt: serverTimestamp()
    });

    console.log('[FieldTrigger] Saved to Firestore:', unknownFields);
  } catch (e) {
    // Firestore save is optional - don't break parsing if it fails
    console.warn('[FieldTrigger] Firestore save failed (non-critical):', e.message);
  }
}

/**
 * Get current unknown field stats
 * @returns {Object} Stats about unknown fields this session
 */
export function getUnknownFieldStats() {
  return {
    count: unknownFieldsThisSession.size,
    fields: [...unknownFieldsThisSession]
  };
}

/**
 * Reset unknown field tracking (call after analysis completes)
 */
export function resetUnknownFieldTracking() {
  unknownFieldsThisSession.clear();
  lastTriggerTime = 0;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get nested value from object using dot notation path
 * @param {Object} obj - The object to search
 * @param {string} path - Dot notation path (e.g., "invoice.company.name")
 * @returns {*} The value or undefined
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

/**
 * Find first matching value from array of possible paths
 * @param {Object} json - The JSON to search
 * @param {string[]} paths - Array of possible paths
 * @returns {*} The first found value or null
 */
function findField(json, paths) {
  for (const path of paths) {
    const value = getNestedValue(json, path);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

/**
 * Find first matching STRING value from array of possible paths
 * Converts objects to string representation if needed
 * @param {Object} json - The JSON to search
 * @param {string[]} paths - Array of possible paths
 * @returns {string|null} The first found string value or null
 */
function findStringField(json, paths) {
  const value = findField(json, paths);
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  // If it's an object, try to extract a meaningful string
  if (typeof value === 'object') {
    // Look for common text field names
    const textValue = value.text || value.value || value.terms || value.name || value.description;
    if (textValue && typeof textValue === 'string') return textValue;
    // Last resort: stringify simple objects
    if (Object.keys(value).length <= 3) {
      return Object.values(value).filter(v => typeof v === 'string').join(' ') || null;
    }
  }
  return null;
}

/**
 * Extract tax amount from various formats
 * Could be a number, string with currency, or an object with rate+amount
 * @param {number|string|Object} taxField - The tax field value
 * @returns {number} The tax amount
 */
function extractTaxAmount(taxField) {
  if (taxField === null || taxField === undefined) return 0;
  if (typeof taxField === 'number') return taxField;
  if (typeof taxField === 'string') return parseCurrencyValue(taxField);
  if (typeof taxField === 'object' && taxField.amount !== undefined) {
    return parseCurrencyValue(taxField.amount);
  }
  return 0;
}

/**
 * Normalize unit string to lowercase standard
 * @param {string} unit - The unit string
 * @returns {string} Normalized unit
 */
function normalizeUnit(unit) {
  if (!unit) return null;
  const u = unit.toLowerCase().trim();

  // Map common variations
  const unitMap = {
    'un': 'ea',
    'pc': 'ea',
    'pcs': 'ea',
    'each': 'ea',
    'unit': 'ea',
    'units': 'ea',
    'ea': 'ea',
    'kg': 'kg',
    'kilo': 'kg',
    'kilos': 'kg',
    'kilogram': 'kg',
    'lb': 'lb',
    'lbs': 'lb',
    'pound': 'lb',
    'pounds': 'lb',
    'g': 'g',
    'gram': 'g',
    'grams': 'g',
    'oz': 'oz',
    'ounce': 'oz',
    'ounces': 'oz',
    'l': 'L',
    'litre': 'L',
    'liter': 'L',
    'litres': 'L',
    'liters': 'L',
    'ml': 'ml',
    'cs': 'case',
    'case': 'case',
    'cases': 'case',
    'bx': 'box',
    'box': 'box',
    'boxes': 'box',
    'rl': 'roll',
    'roll': 'roll',
    'rolls': 'roll'
  };

  return unitMap[u] || u;
}

/**
 * Parse a quantity string that may contain a unit (e.g., "5.89 kg")
 * @param {string|number} value - The quantity value
 * @returns {{ value: number, unit: string|null }} Parsed quantity and unit
 */
function parseQuantityWithUnit(value) {
  if (value === null || value === undefined) {
    return { value: 0, unit: null };
  }

  // If already a number, return as-is
  if (typeof value === 'number') {
    return { value, unit: null };
  }

  const str = String(value).trim();

  // Match patterns like "5.89 kg", "10.5kg", "25 lb", "100 g"
  const match = str.match(/^([\d.,]+)\s*(kg|lb|lbs|g|oz|L|ml|ea|pc|un)?$/i);
  if (match) {
    const numValue = parseFloat(match[1].replace(',', '.')) || 0;
    const unit = match[2] ? match[2].toLowerCase() : null;
    return { value: numValue, unit };
  }

  // Try to parse as plain number
  const num = parseFloat(str.replace(',', '.'));
  return { value: isNaN(num) ? 0 : num, unit: null };
}

/**
 * Get the billing quantity from item (handles various field names)
 * Priority: qty_invoiced > shipped > delivered > quantity
 * @param {Object} item - The line item
 * @returns {number} The billing quantity (numeric value only)
 */
function getBillingQuantity(item) {
  const raw = item.qty_invoiced       // Common: "qty_invoiced": 6
    ?? item.quantity_invoiced    // Alt: "quantity_invoiced": 6
    ?? item.qtyInvoiced          // CamelCase
    ?? item.quantity_ordered     // Vision variation discovered 2026-01-09
    ?? item.qty_ordered          // Vision variation discovered 2026-01-09
    ?? item.shipped              // Acema: "shipped": 12
    ?? item.qty_shipped
    ?? item.quantity_shipped
    ?? item.delivered
    ?? item.qty_delivered
    ?? item.quantity_delivered
    ?? item.quantity
    ?? item.qty
    ?? item.qte                  // French
    ?? item.qté                  // French with accent
    ?? 0;

  // Parse in case it contains a unit (e.g., "5.89 kg")
  const parsed = parseQuantityWithUnit(raw);
  return parsed.value;
}

/**
 * Get the unit embedded in the quantity field (e.g., "5.89 kg" -> "kg")
 * This handles cases where Vision API puts the unit in the quantity string
 * @param {Object} item - The line item
 * @returns {string|null} The unit if found in quantity string
 */
function getQuantityEmbeddedUnit(item) {
  const raw = item.qty_invoiced ?? item.quantity_invoiced ?? item.qtyInvoiced
    ?? item.quantity_ordered ?? item.qty_ordered
    ?? item.shipped ?? item.qty_shipped ?? item.quantity_shipped
    ?? item.delivered ?? item.qty_delivered ?? item.quantity_delivered
    ?? item.quantity ?? item.qty ?? item.qte ?? item.qté ?? null;

  if (raw === null) return null;

  const parsed = parseQuantityWithUnit(raw);
  return parsed.unit;
}

/**
 * Get the ordered quantity if available
 * @param {Object} item - The line item
 * @returns {number|null} The ordered quantity or null
 */
function getOrderedQuantity(item) {
  return item.quantity_ordered ?? item.ordered ?? null;
}

/**
 * Get the shipped quantity if available
 * @param {Object} item - The line item
 * @returns {number|null} The shipped quantity or null
 */
function getShippedQuantity(item) {
  return item.quantity_shipped ?? item.shipped ?? null;
}

/**
 * Get the product SKU/code from item
 * @param {Object} item - The line item
 * @returns {string|null} The SKU
 */
function getSku(item) {
  return item.product_code
    ?? item.product_number    // Vision variation discovered 2026-01-09
    ?? item.item_number
    ?? item.code
    ?? item.product_no
    ?? item.sku
    ?? item.item_code
    ?? item.itemNo
    ?? item.itemNumber
    ?? null;
}

/**
 * Parse a currency value from string or number
 * Handles formats like "$15.35", "15.35", "15,35", "$1,234.56"
 * @param {string|number} value - The value to parse
 * @returns {number} The numeric value
 */
function parseCurrencyValue(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;

  // Convert to string and strip currency symbols and whitespace
  let str = String(value).trim();

  // Remove currency symbols ($, €, £, etc.)
  str = str.replace(/^[$€£¥₹]/, '');

  // Remove trailing currency codes (CAD, USD, etc.)
  str = str.replace(/\s*(CAD|USD|EUR|GBP)$/i, '');

  // Handle thousand separators - if we have both comma and period,
  // the last one is the decimal separator
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastPeriod = str.lastIndexOf('.');
    if (lastComma > lastPeriod) {
      // European format: 1.234,56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Could be decimal comma (15,35) or thousand separator (1,234)
    // If comma is followed by exactly 2 digits at end, treat as decimal
    if (/,\d{2}$/.test(str)) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Get the unit price from item
 * @param {Object} item - The line item
 * @returns {number} The unit price
 */
function getUnitPrice(item) {
  const raw = item.unit_price ?? item.price ?? item.unitPrice ?? 0;
  return parseCurrencyValue(raw);
}

/**
 * Get the line total from item
 * @param {Object} item - The line item
 * @returns {number} The line total
 */
function getLineTotal(item) {
  const raw = item.extended_price ?? item.extendedPrice ?? item.extended ?? item.amount ?? item.total ?? item.totalPrice ?? item.line_total ?? 0;
  return parseCurrencyValue(raw);
}

/**
 * Get the format/packaging string from item
 * Checks multiple aliases for format field from Vision AI output.
 * @param {Object} item - The line item
 * @returns {string|null} The format string
 */
function getFormat(item) {
  return item.format ?? item.boxing_format ?? item.packagingFormat ??
         item.pack ?? item.size ?? item.unit_size ?? item.package_size ??
         item.packaging ?? item.container_size ?? item.pack_size ?? null;
}

/**
 * Parse date from various formats
 * @param {string} dateStr - The date string
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Common formats:
  // 2025/11/24, 2025.11.24, 2025-11-24
  // 24/11/2025, 24-11-2025 (European)
  // 19/12/2025 (DD/MM/YYYY)

  const str = dateStr.trim();

  // Try YYYY first formats
  let match = str.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  match = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Return as-is if can't parse
  return str;
}

// ============================================================================
// VENDOR MATCHING
// ============================================================================

/**
 * Attempt to match vendor from JSON to database
 * @param {Object} json - The raw Vision JSON
 * @returns {Promise<Object|null>} Matched vendor or null
 */
async function matchVendor(json) {
  const taxTPS = findField(json, FIELD_ALIASES.taxTPS);
  const taxTVQ = findField(json, FIELD_ALIASES.taxTVQ);
  const vendorName = findField(json, FIELD_ALIASES.vendorName);

  // Try matching by tax number first (most reliable)
  if (taxTPS) {
    const vendor = await vendorDB.getByTaxNumber(taxTPS);
    if (vendor) return vendor;
  }

  if (taxTVQ) {
    const vendor = await vendorDB.getByTaxNumber(taxTVQ);
    if (vendor) return vendor;
  }

  // Try matching by exact name
  if (vendorName) {
    const vendor = await vendorDB.getByName(vendorName);
    if (vendor) return vendor;

    // Try fuzzy search if exact match fails
    const results = await vendorDB.search(vendorName, { limit: 1 });
    if (results.length > 0) return results[0];
  }

  return null;
}

// ============================================================================
// MAIN NORMALIZER
// ============================================================================

/**
 * Normalize raw Vision JSON to standard invoice format
 *
 * @param {Object} rawJson - The raw JSON from Vision API
 * @param {Object} options - Options
 * @param {boolean} options.matchVendor - Whether to match vendor from DB (default true)
 * @returns {Promise<NormalizedInvoice>} Normalized invoice data
 *
 * @example
 * const result = await normalize(rawJson);
 * console.log(result.invoice);      // Invoice header
 * console.log(result.lineItems);    // Normalized line items
 * console.log(result.vendor);       // Matched vendor (if found)
 */
export async function normalize(rawJson, options = {}) {
  const { matchVendor: shouldMatchVendor = true } = options;

  // Match vendor
  let vendor = null;
  if (shouldMatchVendor) {
    try {
      vendor = await matchVendor(rawJson);
    } catch (e) {
      console.warn('Vendor matching failed:', e);
    }
  }

  // Extract invoice header fields
  // Use findStringField for text fields to handle objects gracefully
  const invoice = {
    invoiceNumber: findStringField(rawJson, FIELD_ALIASES.invoiceNumber),
    date: parseDate(findField(rawJson, FIELD_ALIASES.invoiceDate)),
    paymentTerms: findStringField(rawJson, FIELD_ALIASES.paymentTerms),
    poNumber: findStringField(rawJson, FIELD_ALIASES.poNumber),

    // Vendor info (from JSON, not DB)
    vendorName: findStringField(rawJson, FIELD_ALIASES.vendorName),
    vendorAddress: findStringField(rawJson, FIELD_ALIASES.vendorAddress),
    vendorPhone: findStringField(rawJson, FIELD_ALIASES.vendorPhone),
    vendorTaxTPS: findStringField(rawJson, FIELD_ALIASES.taxTPS),
    vendorTaxTVQ: findStringField(rawJson, FIELD_ALIASES.taxTVQ),

    // Customer info
    customerName: findStringField(rawJson, FIELD_ALIASES.customerName),
    customerAddress: findStringField(rawJson, FIELD_ALIASES.customerAddress),

    // Totals (parse currency strings like "$123.45")
    subtotal: parseCurrencyValue(findField(rawJson, FIELD_ALIASES.subtotal)),
    taxTPS: extractTaxAmount(findField(rawJson, FIELD_ALIASES.taxTPSAmount)),
    taxTVQ: extractTaxAmount(findField(rawJson, FIELD_ALIASES.taxTVQAmount)),
    total: parseCurrencyValue(findField(rawJson, FIELD_ALIASES.grandTotal)),

    // Linked vendor (if matched)
    vendorId: vendor?.id || null,
    vendorType: vendor?.invoiceType || null
  };

  // Fallback: calculate total if Vision didn't provide it
  if (!invoice.total && invoice.subtotal > 0) {
    invoice.total = invoice.subtotal + invoice.taxTPS + invoice.taxTVQ;
  }

  // Extract and normalize line items
  const rawItems = findField(rawJson, FIELD_ALIASES.items) || [];

  // Track all unknown fields across all items
  const allUnknownFields = new Set();

  const lineItems = rawItems.map((item, index) => {
    // Detect unknown fields in this item
    const unknownInItem = detectUnknownFields(item);
    unknownInItem.forEach(f => allUnknownFields.add(f));

    const quantity = getBillingQuantity(item);
    const unitPrice = getUnitPrice(item);
    const totalPrice = getLineTotal(item);

    // Check if quantity field contains a weight unit (e.g., "5.89 kg")
    const embeddedUnit = getQuantityEmbeddedUnit(item);
    const isWeightInQuantity = embeddedUnit && ['kg', 'lb', 'lbs', 'g', 'oz'].includes(embeddedUnit);

    // Determine weight and weightUnit
    // Priority: explicit weight field > weight embedded in quantity
    let weight = item.weight || null;
    let weightUnit = normalizeUnit(item.weight_unit || item.weightUnit);

    // If quantity contains weight (e.g., "5.89 kg"), use that as weight
    if (isWeightInQuantity && !weight) {
      weight = quantity;  // quantity is already parsed to numeric value
      weightUnit = normalizeUnit(embeddedUnit);
    }

    // If weight is detected, unit_price is actually price per weight unit
    let pricePerWeight = null;
    if (isWeightInQuantity) {
      pricePerWeight = unitPrice;  // e.g., $17.27/kg
    }

    return {
      lineNumber: index + 1,

      // Core fields
      sku: getSku(item),
      description: item.description || '',
      quantity: isWeightInQuantity ? 1 : quantity,  // For weight items, qty is 1 (the weight IS the amount)
      unit: normalizeUnit(item.unit) || (isWeightInQuantity ? weightUnit : null),
      unitPrice,
      totalPrice,

      // Weight fields - critical for weight-based pricing
      weight,
      weightUnit,
      pricePerWeight,  // NEW: price per kg/lb when detected

      // Optional fields
      format: getFormat(item),

      // Order tracking (if available)
      quantityOrdered: getOrderedQuantity(item),
      quantityShipped: getShippedQuantity(item),

      // Flags
      priceVariation: item.price_variation || false,
      type: item.type || null,
      isWeightBasedPricing: isWeightInQuantity,  // Flag for weight-based pricing (matches handler field name)

      // Preserve raw data for debugging/audit
      _raw: item
    };
  });

  // Validation warnings
  const warnings = [];

  // Check if totals match
  const calculatedSubtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotalDiff = Math.abs(calculatedSubtotal - invoice.subtotal);
  if (subtotalDiff > 0.02 && subtotalDiff > invoice.subtotal * 0.01) {
    warnings.push({
      type: 'subtotal_mismatch',
      message: `Calculated subtotal (${calculatedSubtotal.toFixed(2)}) differs from invoice subtotal (${invoice.subtotal.toFixed(2)})`,
      calculated: calculatedSubtotal,
      expected: invoice.subtotal,
      difference: subtotalDiff
    });
  }

  // Check for missing vendor
  if (!vendor && shouldMatchVendor) {
    warnings.push({
      type: 'vendor_not_matched',
      message: `Could not match vendor "${invoice.vendorName}" to database`,
      vendorName: invoice.vendorName
    });
  }

  // Check for items without SKU
  const noSkuItems = lineItems.filter(item => !item.sku);
  if (noSkuItems.length > 0) {
    warnings.push({
      type: 'missing_sku',
      message: `${noSkuItems.length} items have no product code/SKU`,
      lines: noSkuItems.map(i => i.lineNumber)
    });
  }

  // Check for unknown fields - triggers maintenance analysis
  if (allUnknownFields.size > 0) {
    const unknownList = [...allUnknownFields];
    warnings.push({
      type: 'unknown_fields',
      message: `${unknownList.length} unrecognized field(s): ${unknownList.join(', ')}`,
      fields: unknownList
    });

    // Write trigger file for CommandCenter to pick up
    writeTriggerFile(unknownList, {
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      itemCount: lineItems.length
    });
  }

  return {
    invoice,
    lineItems,
    vendor,
    warnings,
    unknownFields: [...allUnknownFields],  // Include in result for easy access
    _rawJson: rawJson
  };
}

/**
 * Convert normalized data to format expected by invoiceDB.create()
 * @param {NormalizedInvoice} normalized - The normalized invoice
 * @returns {Object} Data ready for invoiceDB.create()
 */
export function toInvoiceDBFormat(normalized) {
  const { invoice, lineItems, vendor } = normalized;

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.date,
    vendorId: vendor?.id || null,
    vendorName: invoice.vendorName,
    customerName: invoice.customerName,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxTPS + invoice.taxTVQ,
    taxTPS: invoice.taxTPS,
    taxTVQ: invoice.taxTVQ,
    total: invoice.total,
    paymentTerms: invoice.paymentTerms,
    poNumber: invoice.poNumber,
    status: 'pending_review',
    source: 'vision',
    lineItems: lineItems.map(item => ({
      lineNumber: item.lineNumber,
      sku: item.sku,
      rawSku: item.sku,
      description: item.description,
      rawDescription: item._raw?.description || item.description,
      quantity: item.quantity,
      rawQuantity: String(item._raw?.quantity ?? item._raw?.quantity_invoiced ?? item.quantity),
      unit: item.unit,
      rawUnit: item._raw?.unit || item.unit,
      unitPrice: item.unitPrice,
      rawUnitPrice: String(item._raw?.unit_price ?? item._raw?.price ?? item.unitPrice),
      totalPrice: item.totalPrice,
      rawTotal: String(item._raw?.amount ?? item._raw?.total ?? item.totalPrice),
      format: item.format,
      weight: item.weight,
      weightUnit: item.weightUnit,
      pricePerWeight: item.pricePerWeight,  // Price per kg/lb when detected
      isWeightBasedPricing: item.isWeightBasedPricing || false,  // Flag for weight-based pricing
      matchStatus: 'unmatched'
    }))
  };
}

/**
 * @typedef {Object} NormalizedInvoice
 * @property {Object} invoice - Normalized invoice header
 * @property {Object[]} lineItems - Normalized line items
 * @property {Object|null} vendor - Matched vendor from database
 * @property {Object[]} warnings - Validation warnings
 * @property {Object} _rawJson - Original raw JSON for debugging
 */

export default {
  normalize,
  toInvoiceDBFormat,
  // Unknown field tracking
  getUnknownFieldStats,
  resetUnknownFieldTracking,
  // Export helpers for testing
  _helpers: {
    findField,
    getBillingQuantity,
    getQuantityEmbeddedUnit,
    parseQuantityWithUnit,
    getSku,
    normalizeUnit,
    parseDate,
    parseCurrencyValue,
    getUnitPrice,
    getLineTotal,
    detectUnknownFields
  }
};
