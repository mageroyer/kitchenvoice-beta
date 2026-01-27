/**
 * Field Variation Service - Maintenance utility to discover Vision API field name variations
 *
 * This service processes test invoices multiple times through Vision API
 * to collect all possible field name variations. The results help maintain
 * the jsonNormalizer.js alias lists.
 *
 * Run periodically or when users report parsing issues.
 *
 * @module services/invoice/vision/fieldVariationService
 */

import { parseInvoice, parseInvoiceImage } from './visionParser.js';

// Current known aliases from jsonNormalizer.js
// Keep this in sync with the normalizer
const KNOWN_ALIASES = {
  // Line item price fields
  unitPrice: [
    'unit_price', 'price', 'unitPrice', 'prix', 'prix_unitaire',
    'unit_cost', 'cost', 'rate'
  ],

  // Line item total fields
  totalPrice: [
    'extended_price', 'extendedPrice', 'extended', 'amount', 'total',
    'totalPrice', 'line_total', 'montant', 'ext_price', 'extension'
  ],

  // Quantity fields
  quantity: [
    'qty_invoiced', 'quantity_invoiced', 'qtyInvoiced',
    'quantity_ordered', 'qty_ordered',  // Vision variations discovered 2026-01-09
    'shipped', 'qty_shipped', 'quantity_shipped', 'delivered', 'qty_delivered',
    'quantity_delivered', 'quantity', 'qty', 'qte', 'qté', 'quantite'
  ],

  // SKU/Code fields
  sku: [
    'product_code', 'product_number', 'item_number', 'code', 'product_no', 'sku',
    'item_code', 'itemNo', 'itemNumber', 'item_no', 'article',
    'reference', 'ref', 'upc'
  ],

  // Description fields
  description: [
    'description', 'desc', 'name', 'product_name', 'item_name',
    'produit', 'article', 'designation', 'libelle'
  ],

  // Unit fields
  unit: [
    'unit', 'uom', 'unit_of_measure', 'unite', 'unité', 'um'
  ],

  // Weight fields
  weight: [
    'weight', 'poids', 'net_weight', 'gross_weight', 'wgt',
    'total_weight', 'weight_kg', 'weight_lb', 'weight_unit'
  ],

  // Format/packaging fields
  format: [
    'format', 'boxing_format', 'packagingFormat', 'pack', 'size',
    'unit_size', 'package_size', 'packaging', 'container_size', 'pack_size'
  ]
};

/**
 * Recursively extract all field names from an object
 * @param {Object} obj - Object to analyze
 * @param {string} prefix - Current path prefix
 * @returns {Set<string>} Set of all field paths
 */
function extractFieldNames(obj, prefix = '') {
  const fields = new Set();

  if (!obj || typeof obj !== 'object') return fields;

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    fields.add(path);

    if (Array.isArray(value)) {
      // For arrays, analyze first few items
      value.slice(0, 3).forEach((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          extractFieldNames(item, `${path}[item]`).forEach(f => fields.add(f));
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      extractFieldNames(value, path).forEach(f => fields.add(f));
    }
  }

  return fields;
}

/**
 * Extract just the leaf field names from line items (the ones we care about for normalization)
 * @param {Object} rawJson - Raw Vision JSON
 * @returns {Set<string>} Set of line item field names
 */
function extractLineItemFields(rawJson) {
  const fields = new Set();

  // Find the items array (could be at different locations)
  const itemsArrays = [
    rawJson.line_items,
    rawJson.lineItems,
    rawJson.items,
    rawJson.invoice?.items,
    rawJson.invoice?.line_items
  ].filter(Boolean);

  for (const items of itemsArrays) {
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => fields.add(key));
        }
      }
    }
  }

  return fields;
}

/**
 * Categorize a field name into known categories
 * @param {string} fieldName - The field name to categorize
 * @returns {{ category: string|null, isKnown: boolean }}
 */
function categorizeField(fieldName) {
  const lowerField = fieldName.toLowerCase();

  for (const [category, aliases] of Object.entries(KNOWN_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === lowerField)) {
      return { category, isKnown: true };
    }
  }

  // Try to guess category by patterns
  if (/price|prix|cost|rate|tarif/i.test(fieldName)) {
    return { category: 'unitPrice', isKnown: false };
  }
  if (/total|amount|montant|ext|extended/i.test(fieldName)) {
    return { category: 'totalPrice', isKnown: false };
  }
  if (/qty|quantity|quantit|shipped|delivered|qte/i.test(fieldName)) {
    return { category: 'quantity', isKnown: false };
  }
  if (/code|sku|item.*no|product.*no|ref|upc|article/i.test(fieldName)) {
    return { category: 'sku', isKnown: false };
  }
  if (/desc|name|produit|designation|libelle/i.test(fieldName)) {
    return { category: 'description', isKnown: false };
  }
  if (/unit(?!_price)|uom|unite|mesure/i.test(fieldName)) {
    return { category: 'unit', isKnown: false };
  }
  if (/weight|poids|wgt/i.test(fieldName)) {
    return { category: 'weight', isKnown: false };
  }
  if (/format|pack|size|container|boxing/i.test(fieldName)) {
    return { category: 'format', isKnown: false };
  }

  return { category: null, isKnown: false };
}

/**
 * Process a single invoice multiple times and collect field variations
 * @param {File} file - PDF or image file
 * @param {number} runs - Number of times to parse (default 5)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<InvoiceFieldReport>}
 */
export async function analyzeInvoiceFields(file, runs = 5, onProgress = null) {
  const allFields = new Set();
  const lineItemFields = new Set();
  const rawResults = [];
  const errors = [];

  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
  const parseFunc = isImage ? parseInvoiceImage : parseInvoice;

  for (let i = 0; i < runs; i++) {
    try {
      onProgress?.({ run: i + 1, total: runs, status: 'parsing' });

      const result = await parseFunc(file);
      rawResults.push(result.rawJson);

      // Extract all fields
      extractFieldNames(result.rawJson).forEach(f => allFields.add(f));

      // Extract line item fields specifically
      extractLineItemFields(result.rawJson).forEach(f => lineItemFields.add(f));

      // Small delay between runs to avoid rate limiting
      if (i < runs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      errors.push({ run: i + 1, error: error.message });
      onProgress?.({ run: i + 1, total: runs, status: 'error', error: error.message });
    }
  }

  // Analyze line item fields
  const fieldAnalysis = [...lineItemFields].map(field => {
    const { category, isKnown } = categorizeField(field);
    return {
      field,
      category,
      isKnown,
      suggestion: !isKnown && category ? `Add '${field}' to ${category} aliases` : null
    };
  });

  const unknownFields = fieldAnalysis.filter(f => !f.isKnown);
  const newAliasesNeeded = fieldAnalysis.filter(f => !f.isKnown && f.category);

  return {
    fileName: file.name,
    runsCompleted: runs - errors.length,
    totalRuns: runs,
    errors,

    // All unique field paths found
    allFields: [...allFields].sort(),

    // Line item fields (what we need for normalization)
    lineItemFields: [...lineItemFields].sort(),

    // Analysis
    fieldAnalysis,
    unknownFields,
    newAliasesNeeded,

    // Raw results for debugging
    rawResults
  };
}

/**
 * Process multiple invoices and generate a comprehensive report
 * @param {File[]} files - Array of invoice files
 * @param {number} runsPerFile - Number of Vision API calls per file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<FieldVariationReport>}
 */
export async function runFieldVariationAnalysis(files, runsPerFile = 5, onProgress = null) {
  const results = [];
  const allLineItemFields = new Set();
  const allUnknownFields = new Map(); // field -> count
  const allNewAliases = new Map(); // field -> { category, count }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({
      file: i + 1,
      totalFiles: files.length,
      fileName: file.name,
      status: 'starting'
    });

    const result = await analyzeInvoiceFields(file, runsPerFile, (progress) => {
      onProgress?.({
        file: i + 1,
        totalFiles: files.length,
        fileName: file.name,
        ...progress
      });
    });

    results.push(result);

    // Aggregate
    result.lineItemFields.forEach(f => allLineItemFields.add(f));

    result.unknownFields.forEach(({ field }) => {
      allUnknownFields.set(field, (allUnknownFields.get(field) || 0) + 1);
    });

    result.newAliasesNeeded.forEach(({ field, category }) => {
      const existing = allNewAliases.get(field);
      if (existing) {
        existing.count++;
      } else {
        allNewAliases.set(field, { category, count: 1 });
      }
    });
  }

  // Generate summary
  const summary = {
    totalFiles: files.length,
    totalRuns: results.reduce((sum, r) => sum + r.runsCompleted, 0),
    totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),

    uniqueLineItemFields: allLineItemFields.size,
    unknownFieldCount: allUnknownFields.size,
    newAliasesNeeded: allNewAliases.size
  };

  // Generate alias update suggestions
  const aliasUpdateSuggestions = [...allNewAliases.entries()]
    .map(([field, { category, count }]) => ({
      field,
      category,
      occurrences: count,
      code: `'${field}'`
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  // Group by category for easy copy-paste
  const suggestionsByCategory = {};
  for (const suggestion of aliasUpdateSuggestions) {
    if (!suggestionsByCategory[suggestion.category]) {
      suggestionsByCategory[suggestion.category] = [];
    }
    suggestionsByCategory[suggestion.category].push(suggestion.field);
  }

  return {
    timestamp: new Date().toISOString(),
    summary,
    results,

    // Aggregated findings
    allLineItemFields: [...allLineItemFields].sort(),
    unknownFields: [...allUnknownFields.entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count),

    // Actionable output
    aliasUpdateSuggestions,
    suggestionsByCategory,

    // Code snippet to add to jsonNormalizer.js
    codeSnippet: generateCodeSnippet(suggestionsByCategory)
  };
}

/**
 * Generate code snippet to add to jsonNormalizer.js
 * @param {Object} suggestionsByCategory
 * @returns {string}
 */
function generateCodeSnippet(suggestionsByCategory) {
  const lines = ['// Add these aliases to jsonNormalizer.js:', ''];

  for (const [category, fields] of Object.entries(suggestionsByCategory)) {
    lines.push(`// ${category}:`);
    fields.forEach(field => {
      lines.push(`'${field}',`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export known aliases for reference
 */
export { KNOWN_ALIASES };

/**
 * @typedef {Object} InvoiceFieldReport
 * @property {string} fileName
 * @property {number} runsCompleted
 * @property {number} totalRuns
 * @property {Array} errors
 * @property {string[]} allFields
 * @property {string[]} lineItemFields
 * @property {Array} fieldAnalysis
 * @property {Array} unknownFields
 * @property {Array} newAliasesNeeded
 * @property {Object[]} rawResults
 */

/**
 * @typedef {Object} FieldVariationReport
 * @property {string} timestamp
 * @property {Object} summary
 * @property {InvoiceFieldReport[]} results
 * @property {string[]} allLineItemFields
 * @property {Array} unknownFields
 * @property {Array} aliasUpdateSuggestions
 * @property {Object} suggestionsByCategory
 * @property {string} codeSnippet
 */

export default {
  analyzeInvoiceFields,
  runFieldVariationAnalysis,
  KNOWN_ALIASES
};
