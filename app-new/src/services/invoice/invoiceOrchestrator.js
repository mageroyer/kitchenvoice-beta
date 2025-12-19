/**
 * Invoice Processing Orchestrator
 *
 * Main entry point for the new invoice processing flow.
 * Coordinates vendor detection, profile management, parsing, and matching.
 *
 * This orchestrator sits ABOVE the existing invoice services and calls
 * into them without modifying them. The existing flow remains available
 * as a fallback.
 *
 * Flow:
 * 1. Upload → Quick vendor detection
 * 2. If new vendor → Return for onboarding (profile wizard)
 * 3. If known vendor → Parse with profile → Intelligent match
 * 4. Return results for review UI
 *
 * ## Field Naming Convention
 *
 * This module uses two different property names for line items:
 *
 * **`lines`** (ProcessingResult output):
 *   - Used in the orchestrator result object returned to callers
 *   - Represents processed/merged line data with match results
 *   - UI components map this to `parsedInvoice.lineItems` for display
 *
 * **`lineItems`** (internal invoice objects):
 *   - Used in parsed/merged invoice objects (parsed.lineItems, merged.lineItems)
 *   - Standard field name for structured invoice data
 *   - Matches database schema and API contracts
 *
 * The mapping happens in InvoiceUploadPage.jsx when converting result to state.
 * This separation allows the orchestrator to attach additional processing
 * metadata (matchResult, etc.) to lines before UI consumption.
 *
 * @module services/invoice/invoiceOrchestrator
 */

import vendorDetector from './vendorDetector';
import parsingProfileManager from './parsingProfileManager';
import intelligentMatcher from './intelligentMatcher';

// Import existing services (unchanged)
import { parseInvoiceImageWithClaude } from '../ai/claudeAPI';
import { analyzeInvoice } from '../inventory/invoiceAnalyzer';
import { mergeInvoice } from '../inventory/invoiceMerger';
import { vendorDB, invoiceDB, invoiceLineDB } from '../database/indexedDB';

// Math-first validation engine
import {
  enhanceWithMathValidation,
  suggestColumnMapping,
  validateAllLineItems,
  validateInvoiceTotals,
} from './mathEngine/integration';

// Format pattern extraction for pack weights
import { extractAllFormats } from './mathEngine/formatPatterns';

// Centralized line calculator - SINGLE SOURCE OF TRUTH for format parsing
import { parseFormat, FORMAT_TYPE } from './lineCalculator';

// ============================================
// CONSTANTS
// ============================================

/**
 * Processing status codes
 */
export const PROCESSING_STATUS = {
  NEEDS_ONBOARDING: 'needs_onboarding',
  READY_FOR_REVIEW: 'ready_for_review',
  ERROR: 'error'
};

/**
 * Known unit tags for package format parsing
 */
export const UNIT_TAGS = {
  weight: ['lb', 'lbs', 'kg', 'g', 'oz'],
  volume: ['L', 'l', 'ml', 'gal', 'pt', 'fl'],
};

/**
 * Parse a package format string to extract embedded weight/count
 *
 * THIS IS A WRAPPER around lineCalculator.parseFormat() for backwards compatibility.
 * All actual parsing logic lives in lineCalculator.js (SINGLE SOURCE OF TRUTH).
 *
 * Supports multiple formats:
 * - Pack weight: "2/5LB", "4/5LB" → 2 bags × 5lb = 10lb
 * - Multiplier: "4x5lb" → 4 × 5lb = 20lb
 * - Simple: "50lb", "Caisse 4lb"
 * - Count: "12CT", "24PK"
 *
 * @param {string} formatString - The raw format string
 * @returns {Object} Parsed format with fields: format, value, unit, unitType, packCount, unitValue, totalValue, raw, needsReview, reviewReason
 */
export function parsePackageFormat(formatString) {
  // Empty/invalid input
  if (!formatString || typeof formatString !== 'string') {
    return {
      format: null,
      value: null,
      unit: null,
      unitType: null,
      packCount: null,
      unitValue: null,
      totalValue: null,
      raw: formatString || '',
      needsReview: true,
      reviewReason: 'Empty or invalid format string'
    };
  }

  // Use centralized lineCalculator for parsing
  const parsed = parseFormat(formatString);

  // Build backwards-compatible result
  const result = {
    format: null,
    value: null,
    unit: parsed.unit?.toUpperCase() || null,
    unitType: null,
    packCount: null,
    unitValue: null,
    totalValue: null,
    raw: formatString.trim(),
    needsReview: false,
    reviewReason: null
  };

  // Map lineCalculator result to legacy format
  switch (parsed.type) {
    case FORMAT_TYPE.PACK_WEIGHT:
      // "2/5LB" → packCount=2, unitValue=5, totalValue=10
      result.packCount = parsed.packCount;
      result.unitValue = parsed.unitWeight;
      result.totalValue = parsed.weightPerCase;
      result.value = parsed.weightPerCase;
      result.unitType = 'weight';
      result.format = `${parsed.packCount}×${parsed.unitWeight}${result.unit}`;
      console.log(`[PackFormat] Parsed "${formatString}": ${parsed.packCount} × ${parsed.unitWeight}${result.unit} = ${parsed.weightPerCase}${result.unit} total`);
      break;

    case FORMAT_TYPE.MULTIPLIER:
      // "4x5lb" → multiplier=4, unitWeight=5, weightPerCase=20
      result.packCount = parsed.multiplier;
      result.unitValue = parsed.unitWeight;
      result.totalValue = parsed.weightPerCase;
      result.value = parsed.weightPerCase;
      result.unitType = 'weight';
      result.format = `${parsed.multiplier}×${parsed.unitWeight}${result.unit}`;
      console.log(`[PackFormat] Parsed "${formatString}": ${parsed.multiplier} × ${parsed.unitWeight}${result.unit} = ${parsed.weightPerCase}${result.unit} total`);
      break;

    case FORMAT_TYPE.SIMPLE_WEIGHT:
      // "50lb" → weight=50
      result.packCount = 1;
      result.unitValue = parsed.weight;
      result.totalValue = parsed.weight;
      result.value = parsed.weight;
      result.unitType = 'weight';
      result.format = `${parsed.weight}${result.unit}`;
      console.log(`[PackFormat] Parsed "${formatString}": ${parsed.weight}${result.unit}`);
      break;

    case FORMAT_TYPE.COUNT_PACK:
      // "12CT" → count=12
      result.packCount = 1;
      result.unitValue = parsed.count;
      result.totalValue = parsed.count;
      result.value = parsed.count;
      result.unit = 'CT';
      result.unitType = 'count';
      result.format = `${parsed.count}CT`;
      console.log(`[PackFormat] Parsed "${formatString}": ${parsed.count} count units`);
      break;

    default:
      // Try to extract name + number pattern for "Caisse 4lb" style
      const simpleMatch = formatString.trim().match(/^([A-Za-zÀ-ÿ\s]+?)\s*([\d.,]+)\s*([A-Za-z]*)\s*$/i);
      if (simpleMatch) {
        result.format = simpleMatch[1].trim();
        result.value = parseFloat(simpleMatch[2].replace(',', '.'));
        result.unit = simpleMatch[3]?.toUpperCase() || null;
        result.unitValue = result.value;
        result.packCount = 1;
        result.totalValue = result.value;

        if (result.unit) {
          const unitLower = result.unit.toLowerCase();
          if (UNIT_TAGS.weight.includes(unitLower)) {
            result.unitType = 'weight';
          } else if (UNIT_TAGS.volume.includes(unitLower)) {
            result.unitType = 'volume';
          } else if (unitLower === 'ct') {
            result.unitType = 'count';
          } else {
            result.unitType = 'other';
          }
        } else {
          result.needsReview = true;
          result.reviewReason = `No unit specified for "${result.format} ${result.value}"`;
        }
      } else {
        // Could not parse
        result.needsReview = true;
        result.reviewReason = 'Could not parse format string';
      }
      break;
  }

  return result;
}

// ============================================
// MAIN ORCHESTRATOR
// ============================================

/**
 * Process an invoice through the new intelligent flow
 *
 * @param {File|Blob} file - Invoice file (PDF or image)
 * @param {Object} options - Processing options
 * @param {string} [options.apiKey] - Claude API key (if not in env)
 * @param {boolean} [options.skipOnboarding=false] - Skip profile wizard (use defaults)
 * @param {number} [options.forceVendorId] - Force use of specific vendor
 * @returns {Promise<import('./types').ProcessingResult>}
 */
export async function processInvoice(file, options = {}) {
  const { apiKey, skipOnboarding = false, forceVendorId = null } = options;

  try {
    // Step 1: Extract image data from file (always image - Vision API required)
    const { text, imageDataUrl } = await extractFileContent(file);

    // Step 2: Quick parse for vendor detection
    console.log('[Orchestrator] Step 1: Quick vendor detection...');
    const quickParse = await quickParseForVendorInfo(text, imageDataUrl, apiKey);

    // Step 3: Detect vendor
    let detection;
    if (forceVendorId) {
      const vendor = await vendorDB.getById(forceVendorId);
      detection = {
        vendor,
        confidence: 'exact',
        method: 'forced',
        isNew: false,
        extractedInfo: quickParse.vendor || {}
      };
    } else {
      detection = await vendorDetector.detect(quickParse.vendor || {});
    }

    console.log(`[Orchestrator] Vendor detection: ${detection.vendor?.name || 'NEW'} (${detection.confidence})`);

    // Step 4: Check for profile
    let profile = null;
    if (detection.vendor) {
      profile = await parsingProfileManager.getProfile(detection.vendor.id);
      console.log(`[Orchestrator] Profile check for vendor ${detection.vendor.id}: ${profile ? 'FOUND' : 'NOT FOUND'}`);
      if (profile) {
        console.log(`[Orchestrator] Profile version: ${profile.version}, columns:`, Object.keys(profile.columns || {}));
      }
    }

    // Step 5: If no profile and not skipping onboarding, return for wizard
    if (!profile && !skipOnboarding) {
      console.log('[Orchestrator] No profile found - needs onboarding');
      console.log(`[Orchestrator] Vendor parsingProfile field:`, detection.vendor?.parsingProfile ? 'EXISTS' : 'MISSING');

      // Analyze structure for profile suggestions
      const structureAnalysis = await parsingProfileManager.analyzeStructure(
        text,
        quickParse
      );

      // Build detected columns from the first line item for wizard
      // Use Claude's tableHeaders if available (shows actual invoice headers)
      const detectedColumns = buildDetectedColumns(
        quickParse.fullParse?.lineItems || [],
        quickParse.fullParse?.tableHeaders || null
      );

      // Math-based column suggestion: Try to auto-detect columns using B × P = T
      const sampleLines = (quickParse.fullParse?.lineItems || []).slice(0, 5);
      let mathColumnSuggestion = null;
      if (sampleLines.length > 0) {
        mathColumnSuggestion = suggestColumnMapping(sampleLines);
        if (mathColumnSuggestion.found) {
          console.log(`[Orchestrator] Math engine suggested columns with ${mathColumnSuggestion.confidence?.toFixed(0)}% confidence`);
        }
      }

      return {
        status: PROCESSING_STATUS.NEEDS_ONBOARDING,
        vendor: detection.vendor,
        vendorInfo: detection.extractedInfo,
        profile: null,
        suggestedProfile: structureAnalysis,
        invoice: null,
        lines: [],
        // Sample lines for wizard verification step
        sampleLines,
        // Detected columns with values for column mapping step
        detectedColumns,
        // Math-based column suggestion (auto-detected via B × P = T validation)
        mathColumnSuggestion,
        // Auto-corrections made during parsing (when AI swapped columns)
        autoCorrections: quickParse.fullParse?._columnCorrections || null,
        // IMPORTANT: Store the full parse to avoid re-calling Claude API
        cachedParse: quickParse.fullParse,
        rawText: text,
        imageDataUrl,
        file,
        error: null
      };
    }

    // Step 6: Full parse with Claude Vision (profile-guided if available)
    console.log('[Orchestrator] Step 2: Full AI parsing...');
    const parsed = await parseWithProfile(imageDataUrl, profile, apiKey);

    // Step 6.5: Apply learned item corrections from vendor profile
    // IMPORTANT: Fetch vendor fresh from DB to get latest itemCorrections
    // (detection.vendor may be stale from initial getAll() in vendorDetector)
    let freshVendor = detection.vendor;
    if (detection.vendor?.id) {
      freshVendor = await vendorDB.getById(detection.vendor.id);
      console.log(`[Orchestrator] Fetched fresh vendor data, itemCorrections:`,
        freshVendor?.itemCorrections ? Object.keys(freshVendor.itemCorrections).length + ' items' : 'none');
    }
    parsed.lineItems = applyLearnedCorrections(parsed.lineItems, freshVendor?.itemCorrections);

    // Step 7: Local analysis (existing)
    console.log('[Orchestrator] Step 3: Local analysis...');
    const localAnalysis = await analyzeInvoice(parsed);

    // Step 8: Merge local + AI (existing)
    console.log('[Orchestrator] Step 4: Merge & reconcile...');
    const merged = mergeInvoice(localAnalysis, parsed);

    // Step 9: Intelligent matching
    console.log('[Orchestrator] Step 5: Intelligent matching...');
    const matchResults = await intelligentMatcher.matchLines(merged.lineItems, {
      vendorId: detection.vendor?.id,
      profile
    });

    // Step 10: Update profile stats if used
    if (detection.vendor && profile) {
      await parsingProfileManager.updateStats(detection.vendor.id, {
        success: true,
        corrections: 0
      });
    }

    // Combine match results with line data
    const linesWithMatches = merged.lineItems.map((line, index) => ({
      ...line,
      matchResult: matchResults[index] || null
    }));

    const summary = intelligentMatcher.getMatchingSummary(matchResults);
    console.log(`[Orchestrator] Matching complete: ${summary.matched}/${summary.total} matched (${summary.matchRate}%)`);

    // Build detected columns for adaptive review UI
    const detectedColumns = buildDetectedColumns(
      parsed.lineItems || [],
      parsed.tableHeaders || null
    );

    // Step 11: Math validation (B × P = T for each line, cascade for totals)
    console.log('[Orchestrator] Step 6: Math validation...');
    const baseResult = {
      status: PROCESSING_STATUS.READY_FOR_REVIEW,
      vendor: detection.vendor,
      vendorInfo: detection.extractedInfo,
      profile,
      suggestedProfile: null,
      invoice: {
        ...merged.invoice,
        vendorId: detection.vendor?.id,
        vendorName: detection.vendor?.name
      },
      lines: linesWithMatches,
      matchingSummary: summary,
      // For adaptive review UI
      detectedColumns,
      tableHeaders: parsed.tableHeaders || null,
      rawText: text,
      file,
      error: null
    };

    // Enhance with math validation
    const enhancedResult = enhanceWithMathValidation(baseResult);
    if (enhancedResult.mathValidation) {
      console.log(`[Orchestrator] Math validation: ${enhancedResult.mathValidation.message}`);
    }

    return enhancedResult;

  } catch (error) {
    console.error('[Orchestrator] Processing error:', error);

    return {
      status: PROCESSING_STATUS.ERROR,
      vendor: null,
      vendorInfo: null,
      profile: null,
      suggestedProfile: null,
      invoice: null,
      lines: [],
      rawText: null,
      file,
      error: error.message
    };
  }
}

/**
 * Complete vendor onboarding after profile wizard
 *
 * Called by UI after user confirms/adjusts the profile wizard.
 * IMPORTANT: Uses cached parse from initial upload to avoid duplicate API calls.
 *
 * @param {Object} vendorData - Vendor info (new or updates)
 * @param {import('./types').ParsingProfile} profile - Confirmed profile
 * @param {import('./types').ProcessingResult} originalResult - Original processing result
 * @param {Object|null} wizardItemCorrections - Item corrections from wizard Step 4 (Type 2 corrections)
 * @returns {Promise<import('./types').ProcessingResult>}
 */
export async function completeOnboarding(vendorData, profile, originalResult, wizardItemCorrections = null) {
  try {
    let vendorId;
    let vendor;

    // Merge wizard itemCorrections with any existing corrections
    const itemCorrectionsToSave = wizardItemCorrections || null;
    if (itemCorrectionsToSave) {
      console.log(`[Orchestrator] Received ${Object.keys(itemCorrectionsToSave).length} item corrections from wizard`);
    }

    if (originalResult.vendor) {
      // Update existing vendor with profile and itemCorrections
      vendorId = originalResult.vendor.id;
      console.log(`[Orchestrator] Updating existing vendor ${vendorId} with profile:`, profile ? 'YES' : 'NO');

      // Merge new itemCorrections with existing ones
      const existingCorrections = originalResult.vendor.itemCorrections || {};
      const mergedCorrections = itemCorrectionsToSave
        ? { ...existingCorrections, ...itemCorrectionsToSave }
        : existingCorrections;

      await vendorDB.update(vendorId, {
        ...vendorData,
        parsingProfile: profile,
        itemCorrections: Object.keys(mergedCorrections).length > 0 ? mergedCorrections : null
      });
      vendor = await vendorDB.getById(vendorId);
      console.log(`[Orchestrator] Updated vendor ${vendorId} - parsingProfile:`, vendor?.parsingProfile ? 'YES' : 'NO',
        '- itemCorrections:', vendor?.itemCorrections ? Object.keys(vendor.itemCorrections).length : 0);
    } else {
      // Create new vendor with profile and itemCorrections
      console.log(`[Orchestrator] Creating new vendor with profile:`, profile ? 'YES' : 'NO');
      vendorId = await vendorDB.create({
        ...vendorData,
        parsingProfile: profile,
        itemCorrections: itemCorrectionsToSave,
        isActive: true
      });
      vendor = await vendorDB.getById(vendorId);
      console.log(`[Orchestrator] Created vendor ${vendorId} - parsingProfile:`, vendor?.parsingProfile ? 'YES' : 'NO',
        '- itemCorrections:', vendor?.itemCorrections ? Object.keys(vendor.itemCorrections).length : 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OPTIMIZATION: Use cached parse from initial upload instead of re-calling Claude
    // This saves an API call and avoids rate limit issues
    // ═══════════════════════════════════════════════════════════════════════
    const cachedParse = originalResult.cachedParse;

    if (!cachedParse) {
      console.warn('[Orchestrator] No cached parse available, falling back to re-parse');
      // Fallback: re-process if no cached parse (shouldn't happen normally)
      return await processInvoice(originalResult.file, {
        forceVendorId: vendorId,
        skipOnboarding: true
      });
    }

    console.log('[Orchestrator] Using cached parse data (no additional API call)');

    // Apply profile corrections to the cached parse
    let parsed = { ...cachedParse };
    if (profile && parsed.lineItems) {
      // Find package format column from user's mapping (if any)
      // profile.columns is an object: { packageFormat: { index: 3, ... }, description: { index: 1, ... } }
      const hasPackageUnits = !!profile.columns?.packageUnits;
      const hasPackageFormat = !!profile.columns?.packageFormat;
      const packageFormatCol = profile.columns?.packageFormat || profile.columns?.packageUnits;
      const packageFormatType = profile.packageFormat?.type; // 'weight' or 'units'
      const packageColIndex = packageFormatCol?.index;

      // Check for linked quantity unit column (U/M column that tells us what QTY means)
      const hasQuantityUnit = !!profile.columns?.quantityUnit;
      const quantityUnitColIndex = profile.columns?.quantityUnit?.index;

      // Determine if we should treat as units (count) or look for embedded weight
      const treatAsUnits = packageFormatType === 'units' || hasPackageUnits;

      parsed.lineItems = parsed.lineItems.map(line => {
        const corrected = { ...line };

        // Apply weight unit from profile if specified (for explicit weight column)
        if (profile.weightUnit && line.weight != null) {
          corrected.weightUnit = profile.weightUnit;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // BILLING QUANTITY & U/M: The U/M column tells us what unit the billing qty is in
        //
        // Invoice formats like cheese suppliers have multiple quantity columns:
        //   - Qté Cmd (ordered quantity): e.g., 3 wheels
        //   - Qté Mcx (piece count): e.g., 3 pieces
        //   - Qté Fact (billing quantity): e.g., 12.45 kg ← THIS is what we bill
        //   - U/M: tells us the unit of Qté Fact (kg, UN, etc.)
        //
        // When U/M = "kg": billingQuantity IS the weight for pricing
        // When U/M = "UN": billingQuantity IS the count for pricing
        //
        // IMPORTANT: Use billingQuantity (Qté Fact) for weight, NOT ordered quantity!
        // ═══════════════════════════════════════════════════════════════════════
        if (hasQuantityUnit && quantityUnitColIndex != null && line.rawColumns) {
          const unitValue = (line.rawColumns[quantityUnitColIndex] || '').toLowerCase().trim();

          // Look for billing quantity column first (Qté Fact), fall back to quantity
          const hasBillingQty = !!profile.columns?.billingQuantity;
          const billingQtyColIndex = profile.columns?.billingQuantity?.index;

          // Get the billing quantity value from the correct column
          let billingQty;
          let billingQtySource = 'quantity';

          if (hasBillingQty && billingQtyColIndex != null && line.rawColumns[billingQtyColIndex] != null) {
            // Use the Qté Fact column (billing quantity)
            billingQty = parseFloat(line.rawColumns[billingQtyColIndex]);
            billingQtySource = 'billingQuantity';
          } else if (line.billingQuantity != null) {
            // Use structured billingQuantity field
            billingQty = parseFloat(line.billingQuantity);
            billingQtySource = 'billingQuantity';
          } else {
            // Fall back to regular quantity (may be wrong for some invoice formats)
            billingQty = line.quantity;
            billingQtySource = 'quantity (fallback)';
          }

          // Check if unit is a weight unit
          if (unitValue && billingQty != null && !isNaN(billingQty)) {
            if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(unitValue)) {
              corrected.weight = billingQty;
              corrected.weightUnit = 'kg';
              corrected.isWeightBasedPricing = true;
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is weight in kg (from U/M column)`);
            } else if (['lb', 'lbs', 'pound', 'pounds', 'livre', 'livres'].includes(unitValue)) {
              corrected.weight = billingQty;
              corrected.weightUnit = 'lb';
              corrected.isWeightBasedPricing = true;
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is weight in lb (from U/M column)`);
            } else if (['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'].includes(unitValue)) {
              corrected.weight = billingQty;
              corrected.weightUnit = 'g';
              corrected.isWeightBasedPricing = true;
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is weight in g (from U/M column)`);
            } else if (['oz', 'ounce', 'ounces', 'once', 'onces'].includes(unitValue)) {
              corrected.weight = billingQty;
              corrected.weightUnit = 'oz';
              corrected.isWeightBasedPricing = true;
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is weight in oz (from U/M column)`);
            } else if (['l', 'lt', 'litre', 'litres', 'liter', 'liters'].includes(unitValue)) {
              corrected.volume = billingQty;
              corrected.volumeUnit = 'L';
              corrected.isWeightBasedPricing = true; // Volume-based pricing similar to weight
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is volume in L (from U/M column)`);
            } else if (['ml', 'millilitre', 'millilitres'].includes(unitValue)) {
              corrected.volume = billingQty;
              corrected.volumeUnit = 'ml';
              corrected.isWeightBasedPricing = true;
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is volume in ml (from U/M column)`);
            } else {
              // Count-based units (ea, pc, un, cs, etc.) - billing qty is count, not weight
              corrected.quantityUnit = unitValue;
              // For count-based, update quantity to billing quantity if different
              if (billingQtySource === 'billingQuantity' && billingQty !== line.quantity) {
                corrected.quantity = billingQty;
              }
              console.log(`[Orchestrator] Line "${line.description}": ${billingQtySource}=${billingQty} is count in "${unitValue}" (from U/M column)`);
            }
          }
        }

        // Extract weight/units from package format column (e.g., "Caisse 4lb" or "Caisse 24")
        if (packageColIndex != null && line.rawColumns && line.rawColumns[packageColIndex]) {
          const formatValue = line.rawColumns[packageColIndex];
          const parsedFormat = parsePackageFormat(formatValue);

          if (parsedFormat.value != null) {
            if (treatAsUnits) {
              // Units per case - apply as package count (not weight)
              corrected.packageCount = parsedFormat.value;
              corrected.packageType = parsedFormat.format; // e.g., "Caisse"
              console.log(`[Orchestrator] Line "${line.description}": package ${parsedFormat.format} × ${parsedFormat.value} units`);
            } else if (parsedFormat.unit && parsedFormat.unitType === 'weight') {
              // Weight embedded - apply to line weight for cost calculation
              // weightPerUnit = weight per unit (e.g., 50lb per sac)
              // totalWeight = weightPerUnit × quantity (e.g., 2 sacs × 50lb = 100lb)
              const qty = parseFloat(corrected.quantity) || 1;
              corrected.weightPerUnit = parsedFormat.value;
              corrected.weight = parsedFormat.value; // Keep for backward compat
              corrected.weightUnit = parsedFormat.unit;
              corrected.totalWeight = parsedFormat.value * qty;
              corrected.packageType = parsedFormat.format; // e.g., "Caisse"
              console.log(`[Orchestrator] Line "${line.description}": extracted weight ${parsedFormat.value} ${parsedFormat.unit} × ${qty} = ${corrected.totalWeight} ${parsedFormat.unit} from "${formatValue}"`);
            } else if (parsedFormat.unit && parsedFormat.unitType === 'volume') {
              // Volume embedded - store for volume-based items
              corrected.volume = parsedFormat.value;
              corrected.volumeUnit = parsedFormat.unit;
              corrected.packageType = parsedFormat.format;
              console.log(`[Orchestrator] Line "${line.description}": extracted volume ${parsedFormat.value} ${parsedFormat.unit} from "${formatValue}"`);
            }
          }
        }

        return corrected;
      });

      console.log(`[Orchestrator] Applied profile corrections: weightUnit=${profile.weightUnit || 'none'}, packageFormat=${treatAsUnits ? 'units' : (hasPackageFormat ? 'weight' : 'none')}`);
    }

    // Apply learned item corrections from vendor profile
    parsed.lineItems = applyLearnedCorrections(parsed.lineItems, vendor?.itemCorrections);

    // Step 1: Local analysis
    console.log('[Orchestrator] Step 1: Local analysis...');
    const localAnalysis = await analyzeInvoice(parsed);

    // Step 2: Merge local + AI
    console.log('[Orchestrator] Step 2: Merge & reconcile...');
    const merged = mergeInvoice(localAnalysis, parsed);

    // Step 3: Intelligent matching
    console.log('[Orchestrator] Step 3: Intelligent matching...');
    const matchResults = await intelligentMatcher.matchLines(merged.lineItems, {
      vendorId: vendorId,
      profile
    });

    // Update profile stats
    await parsingProfileManager.updateStats(vendorId, {
      success: true,
      corrections: 0
    });

    // Combine match results with line data
    const linesWithMatches = merged.lineItems.map((line, index) => ({
      ...line,
      matchResult: matchResults[index] || null
    }));

    const summary = intelligentMatcher.getMatchingSummary(matchResults);
    console.log(`[Orchestrator] Matching complete: ${summary.matched}/${summary.total} matched (${summary.matchRate}%)`);

    // Build detected columns for adaptive review UI
    const detectedColumns = buildDetectedColumns(
      parsed.lineItems || [],
      parsed.tableHeaders || null
    );

    // Math validation (B × P = T for each line, cascade for totals)
    console.log('[Orchestrator] Math validation...');
    const baseResult = {
      status: PROCESSING_STATUS.READY_FOR_REVIEW,
      vendor: vendor,
      vendorInfo: originalResult.vendorInfo,
      profile,
      suggestedProfile: null,
      invoice: {
        ...merged.invoice,
        vendorId: vendorId,
        vendorName: vendor?.name
      },
      lines: linesWithMatches,
      matchingSummary: summary,
      // For adaptive review UI
      detectedColumns,
      tableHeaders: parsed.tableHeaders || null,
      rawText: originalResult.rawText,
      file: originalResult.file,
      error: null
    };

    // Enhance with math validation
    const enhancedResult = enhanceWithMathValidation(baseResult);
    if (enhancedResult.mathValidation) {
      console.log(`[Orchestrator] Math validation: ${enhancedResult.mathValidation.message}`);
    }

    return enhancedResult;

  } catch (error) {
    console.error('[Orchestrator] Onboarding error:', error);

    return {
      status: PROCESSING_STATUS.ERROR,
      vendor: null,
      vendorInfo: originalResult.vendorInfo,
      profile: null,
      suggestedProfile: originalResult.suggestedProfile,
      invoice: null,
      lines: [],
      rawText: originalResult.rawText,
      file: originalResult.file,
      error: error.message
    };
  }
}

/**
 * Save processed invoice to database
 *
 * Called after user reviews and approves the invoice.
 *
 * @param {import('./types').ProcessingResult} result - Processing result
 * @param {Object} options - Save options
 * @param {string} [options.savedBy] - User ID
 * @param {boolean} [options.applyMatches=false] - Auto-apply matched lines to inventory
 * @returns {Promise<{ invoiceId: number, linesCreated: number }>}
 */
export async function saveInvoice(result, options = {}) {
  const { savedBy = null, applyMatches: _applyMatches = false } = options;

  if (result.status !== PROCESSING_STATUS.READY_FOR_REVIEW) {
    throw new Error('Cannot save invoice that is not ready for review');
  }

  // Create invoice record
  const invoiceId = await invoiceDB.create({
    ...result.invoice,
    vendorId: result.vendor?.id,
    vendorName: result.vendor?.name,
    status: 'pending',
    createdBy: savedBy
  });

  // Create line items
  let linesCreated = 0;
  for (const line of result.lines) {
    // Extract weight info from description (e.g., "Sac 50lb" → weightPerUnit: 50)
    const enhancedLine = extractLineWeightInfo(line);

    const lineData = {
      invoiceId,
      lineNumber: enhancedLine.lineNumber,
      rawDescription: enhancedLine.rawDescription,
      description: enhancedLine.description || enhancedLine.name,
      sku: enhancedLine.itemCode || enhancedLine.sku,
      quantity: enhancedLine.quantity,
      orderedQuantity: enhancedLine.orderedQuantity, // What was ordered (may differ from delivered)
      unit: enhancedLine.unit || enhancedLine.quantityUnit,
      weight: enhancedLine.weight,
      weightUnit: enhancedLine.weightUnit,
      // Weight extraction from pack formats (new fields)
      weightPerUnit: enhancedLine.weightPerUnit,
      totalWeight: enhancedLine.totalWeight,
      packCount: enhancedLine.packCount,
      packWeight: enhancedLine.packWeight,
      // Price fields
      unitPrice: enhancedLine.unitPrice,
      totalPrice: enhancedLine.totalPrice,
      pricePerG: enhancedLine.pricePerG,
      pricePerML: enhancedLine.pricePerML,
      category: enhancedLine.category,
      lineType: enhancedLine.lineType,
      forInventory: enhancedLine.forInventory,
      forAccounting: enhancedLine.forAccounting,
      // Match info
      inventoryItemId: enhancedLine.matchResult?.autoApplied ? enhancedLine.matchResult.bestMatch?.inventoryItemId : null,
      matchStatus: enhancedLine.matchResult?.autoApplied ? 'auto_matched' : 'unmatched',
      matchConfidence: enhancedLine.matchResult?.bestMatch?.score || 0,
      matchCandidates: enhancedLine.matchResult?.candidates || []
    };

    await invoiceLineDB.create(lineData);
    linesCreated++;
  }

  // Update invoice status
  await invoiceDB.update(invoiceId, {
    status: 'extracted',
    lineCount: linesCreated
  });

  console.log(`[Orchestrator] Saved invoice ${invoiceId} with ${linesCreated} lines`);

  return { invoiceId, linesCreated };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Apply learned item corrections from vendor profile to line items
 *
 * Matches line items by itemCode or itemName and applies learned format corrections
 * (weight, volume, or count) that were saved from previous invoice processing.
 *
 * @param {Array} lineItems - Array of parsed line items
 * @param {Object} itemCorrections - Vendor's itemCorrections map (from vendor.itemCorrections)
 * @returns {Array} - Line items with learned corrections applied
 */
function applyLearnedCorrections(lineItems, itemCorrections) {
  if (!lineItems || !itemCorrections || Object.keys(itemCorrections).length === 0) {
    return lineItems;
  }

  let appliedCount = 0;

  // Build reverse lookup: itemName -> correction (for flexible matching)
  const correctionsByName = {};
  for (const [key, correction] of Object.entries(itemCorrections)) {
    if (correction.itemName) {
      correctionsByName[correction.itemName] = correction;
    }
  }

  const correctedLines = lineItems.map(line => {
    // Try to match by item code first, then by name
    const itemCode = line.itemCode;
    const itemName = line.name || line.description;

    // Look up correction: try itemCode first, then itemName
    let learned = null;
    let matchedBy = null;

    if (itemCode && itemCorrections[itemCode]) {
      learned = itemCorrections[itemCode];
      matchedBy = `itemCode "${itemCode}"`;
    } else if (itemName && itemCorrections[itemName]) {
      learned = itemCorrections[itemName];
      matchedBy = `itemName "${itemName}"`;
    } else if (itemName && correctionsByName[itemName]) {
      learned = correctionsByName[itemName];
      matchedBy = `itemName lookup "${itemName}"`;
    }

    if (learned && learned.unit && learned.value != null) {
      console.log(`[Orchestrator] Applying learned correction for ${matchedBy}: ${learned.format} (${learned.value}${learned.unit})`);
      appliedCount++;

      // Base correction fields
      const correctionFields = {
        packageType: learned.packageType,
        learnedCorrection: true,
        learnedFormat: learned.format,
        packCount: learned.packCount || 1,
        unitValue: learned.unitValue || learned.value,
        totalValue: learned.totalValue || learned.value
      };

      if (learned.unitType === 'weight') {
        const qty = parseFloat(line.quantity) || 1;
        const weightPerUnit = learned.totalValue || learned.value;
        const totalWeight = weightPerUnit * qty;
        console.log(`[Orchestrator] Weight calculation: ${weightPerUnit} ${learned.unit} × ${qty} = ${totalWeight} ${learned.unit}`);
        return {
          ...line,
          ...correctionFields,
          weightPerUnit,
          weight: weightPerUnit,
          totalWeight,
          weightUnit: learned.unit,
          unitWeight: learned.unitValue || learned.value,
          unitWeightUnit: learned.unit
        };
      } else if (learned.unitType === 'volume') {
        const qty = parseFloat(line.quantity) || 1;
        const volumePerUnit = learned.totalValue || learned.value;
        const totalVolume = volumePerUnit * qty;
        return {
          ...line,
          ...correctionFields,
          volumePerUnit,
          volume: volumePerUnit,
          totalVolume,
          volumeUnit: learned.unit,
          unitVolume: learned.unitValue || learned.value,
          unitVolumeUnit: learned.unit
        };
      } else if (learned.unitType === 'count') {
        const qty = parseFloat(line.quantity) || 1;
        const unitsPerPack = learned.totalValue || learned.value;
        const totalUnits = unitsPerPack * qty;
        return {
          ...line,
          ...correctionFields,
          packCount: learned.packCount || 1,
          unitsPerPack: learned.unitValue || learned.value,
          totalUnits
        };
      }
    }
    return line;
  });

  if (appliedCount > 0) {
    console.log(`[Orchestrator] Applied ${appliedCount} learned item corrections from vendor profile`);
  }

  return correctedLines;
}

/**
 * Extract weight info from line description using format patterns
 *
 * Parses formats like "Sac 50lb", "4/5LB", "Caisse 25kg" to extract:
 * - weightPerUnit: Weight per unit/pack (e.g., 50 for "Sac 50lb")
 * - totalWeight: Total weight (quantity × weightPerUnit)
 * - packCount/packWeight: For pack formats like "4/5LB"
 *
 * @param {Object} line - Line item with description and quantity
 * @returns {Object} - Enhanced line with weight fields
 */
function extractLineWeightInfo(line) {
  if (!line) return line;

  const enhanced = { ...line };
  const textToSearch = [
    line.description,
    line.rawDescription,
    line.format,
    line.unit
  ].filter(Boolean).join(' ');

  if (!textToSearch) return enhanced;

  const formatResult = extractAllFormats(textToSearch);

  if (formatResult.found && formatResult.bestMatch) {
    const match = formatResult.bestMatch;
    const qty = parseFloat(line.quantity) || 1;

    // Handle different format types
    switch (match.type) {
      case 'EMBEDDED_WEIGHT':
        // "Sac 50lb" → weightPerUnit: 50, totalWeight: qty × 50
        enhanced.weightPerUnit = match.billingValue;
        enhanced.weightUnit = match.billingUnit || match.unit;
        enhanced.totalWeight = qty * match.billingValue;
        console.log(`[FormatExtract] ${line.description}: Embedded weight ${match.billingValue}${match.unit} × ${qty} = ${enhanced.totalWeight}`);
        break;

      case 'PACK_WEIGHT':
        // "4/5LB" → packCount: 4, packWeight: 5, totalWeight: 4 × 5 × qty
        enhanced.packCount = match.packCount;
        enhanced.packWeight = match.packWeight;
        enhanced.weightUnit = match.billingUnit || match.unit;
        enhanced.totalWeight = qty * match.packCount * match.packWeight;
        enhanced.weightPerUnit = match.packCount * match.packWeight;
        console.log(`[FormatExtract] ${line.description}: Pack ${match.packCount}×${match.packWeight}${match.unit} × ${qty} = ${enhanced.totalWeight}`);
        break;

      case 'SIMPLE_WEIGHT':
        // "50lb" alone - could be per unit or total
        // If quantity > 1 and weight is a round number, it's likely per unit
        if (qty > 1 && match.billingValue >= 5) {
          enhanced.weightPerUnit = match.billingValue;
          enhanced.weightUnit = match.billingUnit || match.unit;
          enhanced.totalWeight = qty * match.billingValue;
          console.log(`[FormatExtract] ${line.description}: Simple weight ${match.billingValue}${match.unit} × ${qty} = ${enhanced.totalWeight}`);
        } else {
          // Likely total weight already
          enhanced.totalWeight = match.billingValue;
          enhanced.weightUnit = match.billingUnit || match.unit;
        }
        break;

      case 'MULTIPLIED_WEIGHT':
        // "2×5kg" → totalWeight: 10
        enhanced.totalWeight = match.totalValue * qty;
        enhanced.weightUnit = match.billingUnit || match.unit;
        enhanced.weightPerUnit = match.totalValue;
        console.log(`[FormatExtract] ${line.description}: Multiplied ${match.formula} × ${qty} = ${enhanced.totalWeight}`);
        break;

      default:
        // Other formats - use billing value if available
        if (match.billingValue) {
          enhanced.totalWeight = match.billingValue * qty;
        }
    }
  }

  return enhanced;
}

// Supported image types for Claude Vision API
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Build detected columns structure for wizard from parsed data
 *
 * Uses Claude's tableHeaders (col1, col2, etc.) to show what headers
 * Claude found, along with sample values from line items.
 *
 * @param {Array} lineItems - Parsed line items from Claude
 * @param {Object} tableHeaders - Headers from Claude (e.g., { col1: "No", col2: "Description", col3: "Qté" })
 * @returns {Array} Detected columns with headers and sample values
 */
function buildDetectedColumns(lineItems, tableHeaders = null) {
  if (!lineItems || lineItems.length === 0) {
    return [];
  }

  const firstLine = lineItems[0];
  const columns = [];

  /**
   * Match header text to field name using keywords
   * Order matters - more specific patterns checked first
   */
  function matchHeaderToField(headerText) {
    const lower = headerText.toLowerCase().trim();

    // Skip very short or empty headers
    if (lower.length <= 1) return 'skip';

    // Ordered quantity (Commande/Commandé) - captured separately from delivered qty
    // This tracks what was ordered vs what was actually delivered (useful for partial deliveries)
    // Patterns: "Qté Cmd", "Qty Ord", "Commandé", "Ordered", "Qté commandée"
    if (lower.includes('commandé') || lower.includes('commande') || lower.includes('cmd') ||
        lower === 'ordered' || lower === 'ord' || lower.includes('qté cmd') || lower.includes('qty ord')) {
      return 'orderedQuantity';
    }

    // Billing Quantity (Qté Fact, Facturé, Billed) - THE VALUE USED FOR PRICE CALCULATION
    // When U/M = "kg", this column contains the WEIGHT
    // When U/M = "UN", this column contains the COUNT
    // Must check BEFORE generic quantity pattern to avoid "Qté Fact" matching "qté"
    // Patterns: "Qté Fact", "Qté Facturé", "Facturé", "Fact", "Billed", "Billing Qty"
    if (lower.includes('factur') || lower.includes('fact') || lower.includes('billed') || lower.includes('billing')) {
      return 'billingQuantity';
    }

    // Piece/Item count (Mcx, Morceaux, Pieces) - number of physical items
    // Different from billing quantity which may be weight
    // Patterns: "Qté Mcx", "Mcx", "Morceaux", "Pcs", "Pieces"
    if (lower.includes('mcx') || lower.includes('morceaux') || lower.includes('pieces') || lower.includes('pcs')) {
      return 'pieceCount';
    }

    // Unit of Measure (U/M, UM, Unité) - important for weight-based pricing
    if (lower === 'u/m' || lower === 'um' || lower.includes('unit of measure') || lower.includes('unité de mesure') || lower.includes('mesure')) {
      return 'unit';
    }

    // Total/Amount - check first (before "prix" catches it)
    if (lower.includes('total') || lower.includes('montant') || lower.includes('amount') || lower.includes('ext')) {
      return 'totalPrice';
    }

    // Description / Product Name
    // "PRODUIT" in French = product name (description), not product code
    // "PRODUCT" in English similarly means the product name
    if (lower.includes('description') || lower.includes('désignation') || lower.includes('libellé') || lower.includes("l'article") || lower.includes('produit') || lower.includes('product') || lower === 'nom' || lower === 'name') {
      return 'description';
    }

    // SKU/Item Code - explicit code/sku/item references
    if (lower.includes('code') || lower.includes('sku') || lower.includes('item') || lower.includes('no.') || lower.includes('art') || lower.includes('ref') || lower === 'id') {
      return 'sku';
    }

    // Pack Format (distributor style: "4/5LB", "1/50LB", "12CT")
    // Column header is typically just "Pack"
    if (lower === 'pack') {
      return 'packFormat';
    }

    // Package Format (with embedded weight/count)
    // e.g., "FORMAT" column containing "Caisse 4lb", "Flat 12pt", "Sac 25kg"
    if (lower.includes('format') || lower.includes('emballage') || lower.includes('conditionnement')) {
      return 'packageFormat';
    }

    // Quantity
    if (lower.includes('qté') || lower.includes('qty') || lower.includes('quantité') || lower.includes('quantity')) {
      return 'quantity';
    }

    // Weight
    if (lower.includes('poid') || lower.includes('weight') || lower.includes('wt')) {
      return 'weight';
    }

    // Unit Price
    if (lower.includes('prix') || lower.includes('price') || lower.includes('cost') || lower.includes('p.u')) {
      return 'unitPrice';
    }

    return 'skip';
  }

  // Field to display label
  const fieldToLabel = {
    'sku': 'sku',
    'description': 'description',
    'quantity': 'quantity',
    'weight': 'weight',
    'unitPrice': 'unitPrice',
    'totalPrice': 'totalPrice',
  };

  // If we have tableHeaders from Claude, use them to build columns
  if (tableHeaders && typeof tableHeaders === 'object') {
    const headerEntries = Object.entries(tableHeaders)
      .filter(([key, value]) => key.startsWith('col') && value)
      .sort((a, b) => {
        const numA = parseInt(a[0].replace('col', ''));
        const numB = parseInt(b[0].replace('col', ''));
        return numA - numB;
      });

    console.log(`[Orchestrator] Table headers from Claude:`, JSON.stringify(tableHeaders, null, 2));
    console.log(`[Orchestrator] First line item:`, JSON.stringify(firstLine, null, 2));
    console.log(`[Orchestrator] All line items count:`, lineItems.length);

    // Check if we have rawColumns available (preferred - exact column values from invoice)
    const hasRawColumns = firstLine.rawColumns && Array.isArray(firstLine.rawColumns);
    if (hasRawColumns) {
      console.log(`[Orchestrator] Using rawColumns for sample values:`, firstLine.rawColumns);
    }

    // Map our field names to Claude's JSON field names (fallback when no rawColumns)
    const fieldToJsonKey = {
      'sku': 'itemCode',
      'description': 'description',
      'quantity': 'quantity',
      'orderedQuantity': 'orderedQuantity',
      'billingQuantity': 'billingQuantity', // Qté Fact - the value used for price calculation (weight when U/M=kg)
      'pieceCount': 'pieceCount',           // Qté Mcx - number of physical items
      'weight': 'weight',
      'unitPrice': 'unitPrice',
      'totalPrice': 'totalPrice',
      'packageFormat': 'format',  // Package format column (e.g., "Caisse 4lb" - weight embedded)
      'packageUnits': 'format',   // Package format column (e.g., "Caisse 24" - units per case)
      'packFormat': 'format',     // Pack format column (distributor style: "4/5LB", "1/50LB", "12CT")
      'unit': 'unit',             // Unit of measure (informational only)
      'quantityUnit': 'quantityUnit', // U/M column - tells us what unit billingQuantity is in (kg, UN, etc.)
      'ignoreRow': null,          // Column used to identify rows to ignore (headers/footers)
    };

    // Log column mapping with extracted values for debugging
    console.log(`[Orchestrator] Column mapping:`);
    console.table(headerEntries.map(([colKey, headerText]) => {
      const colNum = parseInt(colKey.replace('col', '')) - 1;
      const fieldName = matchHeaderToField(String(headerText));
      const jsonKey = fieldToJsonKey[fieldName] || fieldName;
      // Prefer rawColumns (exact text from invoice), fall back to structured field
      const value = hasRawColumns && firstLine.rawColumns[colNum] != null
        ? firstLine.rawColumns[colNum]
        : firstLine[jsonKey];
      return {
        column: colKey,
        colIndex: colNum,
        header: headerText,
        mappedTo: fieldName,
        jsonKey: jsonKey,
        sampleValue: value != null ? String(value) : '(empty)',
        source: hasRawColumns && firstLine.rawColumns[colNum] != null ? 'rawColumns' : 'structured'
      };
    }));

    headerEntries.forEach(([colKey, headerText]) => {
      // Extract column number from colKey (e.g., "col1" → 0, "col4" → 3)
      const colNum = parseInt(colKey.replace('col', '')) - 1;
      const fieldName = matchHeaderToField(String(headerText));
      const jsonKey = fieldToJsonKey[fieldName] || fieldName;

      // Prefer rawColumns (exact text from invoice), fall back to structured field
      // Use colNum (actual column position) not iteration index
      const value = hasRawColumns && firstLine.rawColumns[colNum] != null
        ? firstLine.rawColumns[colNum]
        : firstLine[jsonKey];

      // Get sample values from multiple lines
      const sampleValues = lineItems.slice(0, 3).map(line => {
        if (hasRawColumns && line.rawColumns && line.rawColumns[colNum] != null) {
          return line.rawColumns[colNum];
        }
        return line[jsonKey];
      }).filter(v => v != null);

      columns.push({
        index: colNum,  // Use actual column position for rawColumns lookup
        headerText: headerText, // Original header text from invoice
        aiLabel: fieldName,
        value: value != null ? String(value) : '',
        sampleValues: sampleValues,
      });
    });
  } else {
    // Fallback: build from line item fields
    const fieldOrder = ['itemCode', 'description', 'quantity', 'weight', 'unitPrice', 'totalPrice'];

    fieldOrder.forEach((field) => {
      const value = firstLine[field];
      const label = fieldToLabel[field] || field;

      if (value != null && value !== '') {
        columns.push({
          index: columns.length,
          aiLabel: label === 'itemCode' ? 'sku' : label,
          value: String(value),
          sampleValues: lineItems.slice(0, 3).map(line => line[field]).filter(v => v != null),
        });
      }
    });
  }

  console.log(`[Orchestrator] Built ${columns.length} detected columns for wizard`);
  return columns;
}

/**
 * Extract image data from file (Vision API required for invoice parsing)
 *
 * @param {File|Blob} file - Input file (image or PDF)
 * @returns {Promise<{ text: string, imageDataUrl: string|string[] }>}
 */
async function extractFileContent(file) {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';

  if (isImage) {
    // Check if image type is supported by Claude Vision
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      console.warn(`[Orchestrator] Unsupported image type: ${file.type}. Supported: jpeg, png, gif, webp`);
      throw new Error(`Unsupported image format: ${file.type}. Please use JPEG, PNG, GIF, or WebP.`);
    }

    // Convert to data URL for Claude Vision
    const imageDataUrl = await fileToDataUrl(file);
    return { text: '', imageDataUrl };
  }

  if (isPdf) {
    // Convert PDF to image for Claude Vision - preserves table structure!
    console.log('[Orchestrator] Converting PDF to image for Vision API...');

    try {
      const { convertPdfToImage } = await import('../utils/pdfParser');
      const imageDataUrl = await convertPdfToImage(file);

      if (imageDataUrl) {
        console.log('[Orchestrator] PDF converted to image successfully');
        return { text: '', imageDataUrl };
      }
    } catch (err) {
      console.warn('[Orchestrator] PDF to image conversion failed:', err.message);
    }

    throw new Error('Could not convert PDF to image. Please upload as a photo/screenshot instead.');
  }

  // Unsupported file type
  throw new Error('Unsupported file type. Please upload an image (JPEG, PNG, GIF, WebP) or PDF.');
}

/**
 * Convert file to data URL
 *
 * @param {File|Blob} file - File to convert
 * @returns {Promise<string>} Data URL
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Quick parse for vendor info only (minimal API usage)
 *
 * @param {string} text - Invoice text (for local extraction fallback)
 * @param {string} imageDataUrl - Image data URL (required)
 * @param {string} apiKey - Claude API key
 * @returns {Promise<Object>} Quick parsed data with vendor info
 */
async function quickParseForVendorInfo(text, imageDataUrl, apiKey) {
  // First try local extraction (no API call)
  const localExtract = vendorDetector.quickExtractVendorInfo(text);
  console.log('[Orchestrator] Local extraction:', localExtract);

  // Always call Claude Vision to get vendor name and full details
  // Image parsing is required for accurate table/column extraction
  try {
    if (!imageDataUrl) {
      throw new Error('Image data required for invoice parsing');
    }
    const parsed = await parseInvoiceImageWithClaude(imageDataUrl, apiKey);

    // NOTE: Auto-correction disabled - new tableHeaders approach lets users see and fix issues
    // parsed = validateAndCorrectColumns(parsed);

    // Merge local extraction with Claude parsing (prefer Claude for most fields)
    return {
      vendor: {
        name: parsed.vendorName || parsed.vendor?.name,
        legalName: parsed.vendor?.legalName,
        taxNumber: parsed.vendor?.taxNumber || localExtract.taxNumber,
        phone: parsed.vendor?.phone || localExtract.phone,
        email: parsed.vendor?.email || localExtract.email,
        address: parsed.vendor?.address,
        city: parsed.vendor?.city,
        province: parsed.vendor?.province,
        postalCode: parsed.vendor?.postalCode
      },
      // Store full parse for later use
      fullParse: parsed
    };
  } catch (error) {
    console.warn('[Orchestrator] Quick parse failed:', error.message);
    // If Claude fails but we have local data, return it
    // User will need to enter vendor name manually
    return { vendor: localExtract };
  }
}

/**
 * Parse invoice with profile-guided prompt (Vision API only)
 *
 * @param {string} imageDataUrl - Image data URL (required)
 * @param {import('./types').ParsingProfile} profile - Vendor profile
 * @param {string} apiKey - Claude API key
 * @returns {Promise<Object>} Parsed invoice data
 */
async function parseWithProfile(imageDataUrl, profile, apiKey) {
  // Use the consolidated generatePromptHints function
  // This generates hints from: columns, quirks, pricingModel, weightUnit, packageFormat
  let promptHints = '';
  if (profile) {
    // Use existing promptHints if available, otherwise regenerate
    // (profile.promptHints should be set when profile was created/saved)
    promptHints = profile.promptHints || parsingProfileManager.generatePromptHints(profile) || '';

    if (promptHints) {
      console.log(`[Orchestrator] Using profile hints (${promptHints.length} chars)`);
    }
  }

  // Always use Vision API - image parsing required for accurate table extraction
  if (!imageDataUrl) {
    throw new Error('Image data required for invoice parsing');
  }
  const parsed = await parseInvoiceImageWithClaude(imageDataUrl, apiKey, null, promptHints);

  // Apply profile corrections to line items (post-processing)
  if (profile && parsed.lineItems) {
    // Find package format column from user's mapping (if any)
    // profile.columns is an object: { packageFormat: { index: 3, ... }, description: { index: 1, ... } }
    const hasPackageUnits = !!profile.columns?.packageUnits;
    const hasPackageFormat = !!profile.columns?.packageFormat;
    const packageFormatCol = profile.columns?.packageFormat || profile.columns?.packageUnits;
    const packageFormatType = profile.packageFormat?.type; // 'weight' or 'units'
    const packageColIndex = packageFormatCol?.index;

    // Determine if we should treat as units (count) or look for embedded weight
    const treatAsUnits = packageFormatType === 'units' || hasPackageUnits;

    parsed.lineItems = parsed.lineItems.map(line => {
      const corrected = { ...line };

      // Apply weight unit from profile if specified (for explicit weight column)
      if (profile.weightUnit && line.weight != null) {
        corrected.weightUnit = profile.weightUnit;
      }

      // Extract weight/units from package format column (e.g., "Caisse 4lb" or "Caisse 24")
      if (packageColIndex != null && line.rawColumns && line.rawColumns[packageColIndex]) {
        const formatValue = line.rawColumns[packageColIndex];
        const parsedFormat = parsePackageFormat(formatValue);

        if (parsedFormat.value != null) {
          if (treatAsUnits) {
            // Units per case - apply as package count (not weight)
            corrected.packageCount = parsedFormat.value;
            corrected.packageType = parsedFormat.format; // e.g., "Caisse"
          } else if (parsedFormat.unit && parsedFormat.unitType === 'weight') {
            // Weight embedded - apply to line weight for cost calculation
            // weightPerUnit = weight per unit (e.g., 50lb per sac)
            // totalWeight = weightPerUnit × quantity (e.g., 2 sacs × 50lb = 100lb)
            const qty = parseFloat(corrected.quantity) || 1;
            corrected.weightPerUnit = parsedFormat.value;
            corrected.weight = parsedFormat.value; // Keep for backward compat
            corrected.weightUnit = parsedFormat.unit;
            corrected.totalWeight = parsedFormat.value * qty;
            corrected.packageType = parsedFormat.format; // e.g., "Caisse"
          } else if (parsedFormat.unit && parsedFormat.unitType === 'volume') {
            // Volume embedded - store for volume-based items
            corrected.volume = parsedFormat.value;
            corrected.volumeUnit = parsedFormat.unit;
            corrected.packageType = parsedFormat.format;
          }
        }
      }

      return corrected;
    });

    console.log(`[Orchestrator] Applied profile corrections: weightUnit=${profile.weightUnit || 'none'}, packageFormat=${treatAsUnits ? 'units' : (hasPackageFormat ? 'weight' : 'none')}`);
  }

  return parsed;
}

// ============================================
// EXPORTS
// ============================================

export default {
  processInvoice,
  completeOnboarding,
  saveInvoice,
  parsePackageFormat,
  PROCESSING_STATUS,
  UNIT_TAGS
};
