/**
 * Vision-based Invoice Processing
 *
 * A new, simplified invoice parsing pipeline that uses Claude Vision
 * to extract structured data from invoice PDFs in a single API call.
 *
 * Replaces the complex text-extraction + parsing pipeline (~2000 lines)
 * with a simple Vision API call + JSON normalization (~300 lines).
 *
 * Flow:
 * 1. parseInvoice() - PDF → Images → Claude Vision → Raw JSON
 * 2. normalize() - Raw JSON → Normalized format with field aliases
 * 3. detectInvoiceType() - Pattern matching to determine invoice type
 * 4. Handler selection based on detected type
 *
 * @module services/invoice/vision
 *
 * @example
 * import { processInvoice } from './vision';
 *
 * const result = await processInvoice(pdfFile);
 * console.log(result.detectedType);  // { type: 'foodSupply', confidence: 85 }
 * console.log(result.invoice);       // Normalized invoice header
 * console.log(result.lineItems);     // Normalized line items
 */

export { parseInvoice, parseInvoiceImage } from './visionParser';
export { normalize, toInvoiceDBFormat } from './jsonNormalizer';
export {
  detectInvoiceType,
  getTypeLabel,
  getTypeIcon,
  isHighConfidence,
  getConfidenceLevel
} from './invoiceTypeDetector';

/**
 * Complete pipeline: PDF → Normalized Invoice with Type Detection → Handler V2 Processing
 *
 * Flow:
 * 1. Parse PDF with Vision API
 * 2. Normalize JSON (field aliases, unit normalization)
 * 3. Detect invoice type (foodSupply, packaging, etc.)
 * 4. Process lines through handler V2 pipeline (weight extraction, pricePerG, validation)
 * 5. Convert to DB format
 *
 * @param {File} pdfFile - The PDF file to process
 * @param {Object} options - Options
 * @param {boolean} [options.detectType=true] - Whether to detect invoice type
 * @param {Object} [options.vendorProfile] - Vendor profile (overrides type detection)
 * @returns {Promise<ProcessedInvoice>} Complete processed invoice with V2 data
 *
 * @example
 * const result = await processInvoice(pdfFile);
 * console.log(result.detectedType);     // { type: 'foodSupply', confidence: 85 }
 * console.log(result.processedLines);   // V2 processed lines with validation
 * console.log(result.v2Summary);        // { canBillCount, canProcessCount, warnings }
 */
export async function processInvoice(pdfFile, options = {}) {
  const { detectType = true, vendorProfile = null, categorizeItems = true } = options;

  const { parseInvoice } = await import('./visionParser');
  const { normalize, toInvoiceDBFormat } = await import('./jsonNormalizer');
  const { detectInvoiceType } = await import('./invoiceTypeDetector');
  const { categorizeLineItems } = await import('../lineCategorizer');
  const { processLinesV2ByCategory } = await import('../handlers');

  // Step 1: Parse PDF with Vision
  const parseResult = await parseInvoice(pdfFile, options);

  // Step 2: Normalize JSON
  const normalized = await normalize(parseResult.rawJson, options);

  // Step 2.5: Categorize line items (AI-powered)
  let categorizedLines = normalized.lineItems;
  let categoryStats = null;

  if (categorizeItems && normalized.lineItems?.length > 0) {
    try {
      const startCat = Date.now();
      categorizedLines = await categorizeLineItems(normalized.lineItems);
      const catTime = Date.now() - startCat;

      // Calculate stats
      categoryStats = {};
      categorizedLines.forEach(line => {
        categoryStats[line.category] = (categoryStats[line.category] || 0) + 1;
      });

    } catch (catError) {
      console.warn('[Vision] Categorization failed, continuing without:', catError.message);
      // Continue with uncategorized lines
    }
  }

  // Update normalized with categorized lines
  normalized.lineItems = categorizedLines;

  // Step 3: Detect invoice type (or use vendor profile)
  let detectedType = null;
  let invoiceType = vendorProfile?.invoiceType || null;

  if (detectType && !invoiceType) {
    detectedType = detectInvoiceType(normalized);
    invoiceType = detectedType.type;
  } else if (vendorProfile?.invoiceType) {
    detectedType = {
      type: vendorProfile.invoiceType,
      confidence: 100,
      source: 'vendor_profile'
    };
  }

  // Step 4: Process lines through handler V2 pipeline (category-based routing)
  // Each line goes to the appropriate handler based on its AI category:
  // FOOD → foodSupplyHandler, PACKAGING/SUPPLY → packagingHandler, FEE/DIVERS → genericHandler
  const v2Result = processLinesV2ByCategory({
    lines: normalized.lineItems,
    profile: vendorProfile,
    options
  });

  // Step 5: Convert to DB format
  const dbFormat = toInvoiceDBFormat(normalized);

  return {
    // Raw Vision output (for debugging)
    _rawJson: parseResult.rawJson,

    // Normalized data (before V2 processing)
    normalized,

    // V2 Processed lines (with validation, weight extraction, pricing)
    processedLines: v2Result.lines,
    v2Summary: v2Result.summary,
    v2Available: v2Result.v2Available,
    handlerType: v2Result.handlerType,
    handlerLabel: v2Result.handlerLabel,

    // Ready for invoiceDB.create()
    dbFormat,

    // Convenience accessors (use processedLines for display, normalized for raw)
    invoice: normalized.invoice,
    lineItems: v2Result.v2Available ? v2Result.lines : normalized.lineItems,
    vendor: normalized.vendor,
    warnings: [
      ...(normalized.warnings || []),
      ...(v2Result.allWarnings || [])
    ],

    // Type detection result
    detectedType,

    // AI categorization stats (FOOD, PACKAGING, etc.)
    categoryStats,

    // Metadata
    meta: {
      fileName: parseResult.fileName,
      fileSize: parseResult.fileSize,
      pageCount: parseResult.pageCount,
      parseTimeMs: parseResult.parseTimeMs,
      timestamp: parseResult.timestamp
    }
  };
}

/**
 * @typedef {Object} ProcessedInvoice
 * @property {Object} _rawJson - Raw JSON from Vision API (for debugging)
 * @property {Object} normalized - Normalized invoice data (before V2 processing)
 * @property {Object[]} processedLines - V2 processed lines with validation, weight, pricing
 * @property {Object} v2Summary - V2 processing summary (canBillCount, warningCount, etc.)
 * @property {boolean} v2Available - Whether V2 pipeline was used
 * @property {string} handlerType - Handler type used (foodSupply, packaging, etc.)
 * @property {string} handlerLabel - Handler display label
 * @property {Object} dbFormat - Data ready for invoiceDB.create()
 * @property {Object} invoice - Invoice header (shortcut)
 * @property {Object[]} lineItems - Line items (V2 if available, otherwise normalized)
 * @property {Object|null} vendor - Matched vendor
 * @property {Object[]} warnings - Combined warnings (normalization + V2)
 * @property {DetectedType|null} detectedType - Type detection result
 * @property {Object} meta - Processing metadata
 */

/**
 * @typedef {Object} DetectedType
 * @property {string} type - Detected type: 'foodSupply', 'packaging', 'utilities', 'services', 'generic'
 * @property {number} confidence - Confidence score (0-100)
 * @property {string} source - Detection source: 'vendor_profile' or 'detection'
 * @property {Object|null} signals - Score breakdown by type
 * @property {Object[]|null} matches - Pattern matches that contributed to score
 * @property {Object[]} topMatches - Top 5 matches for detected type
 * @property {string|null} alternativeType - Second-best type if applicable
 * @property {number} alternativeScore - Score for alternative type
 */
