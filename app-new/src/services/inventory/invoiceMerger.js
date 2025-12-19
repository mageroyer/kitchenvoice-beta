/**
 * Invoice Merger - Phase 3: Merge & Compare
 *
 * Merges local analysis (Phase 1) with AI parsing (Phase 2).
 * Detects discrepancies between local extraction and Claude's parsing.
 * Produces final normalized invoice ready for database.
 *
 * Rules:
 * - Local weight extraction is "ground truth" (regex doesn't hallucinate)
 * - Claude provides: categories, clean names, vendor info
 * - Discrepancies are flagged for user review
 *
 * @module services/inventory/invoiceMerger
 */

import { getUnitFactorForPrice } from '../../utils/unitConversion';

// ============================================
// Constants
// ============================================

/**
 * Weight discrepancy threshold (percentage)
 * If Claude's weight differs by more than this %, flag it
 */
export const WEIGHT_DISCREPANCY_THRESHOLD = 10; // 10%

/**
 * Confidence levels for merged data
 */
export const CONFIDENCE = {
  HIGH: 'high',       // Local extraction matched or Claude confirmed
  MEDIUM: 'medium',   // Only Claude data available
  LOW: 'low',         // Discrepancy detected, needs review
  MANUAL: 'manual',   // No data available, needs manual entry
};

/**
 * Data source indicators
 */
export const SOURCE = {
  LOCAL: 'local',     // From local regex extraction
  CLAUDE: 'claude',   // From Claude AI parsing
  MERGED: 'merged',   // Combination of both
  USER: 'user',       // User-provided override
};

/**
 * Line type classification for accounting/inventory filtering
 */
export const LINE_TYPE = {
  PRODUCT: 'product',     // Regular inventory item
  DEPOSIT: 'deposit',     // Bottle deposit, consignment, container fee
  FEE: 'fee',             // Delivery, shipping, freight charges
  CREDIT: 'credit',       // Returns, refunds, credits
  ZERO: 'zero',           // Zero quantity or zero price items
};

// ============================================
// Line Type Detection
// ============================================

/**
 * Detect line type for accounting/inventory filtering
 *
 * @param {Object} item - Line item with description, quantity, totalPrice
 * @returns {string} LINE_TYPE value
 */
export function detectLineType(item) {
  const desc = (item.description || item.rawDescription || item.name || '').toLowerCase();

  // Use nullish coalescing - only default to 0 if truly null/undefined
  const qty = item.quantity ?? 1;  // Default to 1 if missing (assume it's a valid item)
  const total = item.totalPrice ?? 0;

  // CREDIT: Negative values or explicit credit terms
  if (total < 0 || qty < 0 || item.isCredit) {
    console.log(`[LineType] CREDIT: "${desc.slice(0, 40)}" (qty=${qty}, total=${total})`);
    return LINE_TYPE.CREDIT;
  }

  // DEPOSIT: Bottle deposits, consignment, container fees
  // Check this BEFORE zero check - deposits may have unusual qty/price patterns
  if (/consign|dépôt|depot|deposit|bottle fee|contenan|container|emballage|récup/i.test(desc)) {
    console.log(`[LineType] DEPOSIT: "${desc.slice(0, 40)}" (qty=${qty}, total=${total})`);
    return LINE_TYPE.DEPOSIT;
  }

  // FEE: Delivery, shipping, freight, service charges
  // Note: Use word boundaries to avoid false positives like "fraise" (strawberry) matching "frais"
  if (/delivery|livraison|freight|shipping|\bfrais\b|transport|service charge|surcharge|fuel/i.test(desc)) {
    console.log(`[LineType] FEE: "${desc.slice(0, 40)}" (qty=${qty}, total=${total})`);
    return LINE_TYPE.FEE;
  }

  // ZERO: Explicitly zero quantity AND zero price (informational lines only)
  // Must be explicit zeros, not just missing values
  if (item.quantity === 0 && item.totalPrice === 0) {
    console.log(`[LineType] ZERO: "${desc.slice(0, 40)}" (qty=${qty}, total=${total})`);
    return LINE_TYPE.ZERO;
  }

  // Default: Regular product
  return LINE_TYPE.PRODUCT;
}

// ============================================
// Weight Merging
// ============================================

/**
 * Merge weight data from local analysis and Claude parsing
 *
 * @param {Object} localWeight - From extractWeightFromName() { value, unit, valueInGrams }
 * @param {Object} claudeWeight - From Claude { weight, weightUnit }
 * @returns {Object} Merged weight with source and confidence
 */
export function mergeWeight(localWeight, claudeWeight) {
  const hasLocal = localWeight && localWeight.value && localWeight.unit;
  const hasClaude = claudeWeight?.weight && claudeWeight?.weightUnit;

  // Case 1: Both sources available - compare and detect discrepancy
  if (hasLocal && hasClaude) {
    const localGrams = localWeight.valueInGrams;

    // Convert Claude weight to grams for comparison
    const claudeUnit = claudeWeight.weightUnit.toLowerCase();
    const unitInfo = getUnitFactorForPrice(claudeUnit);
    const claudeGrams = unitInfo ? claudeWeight.weight * unitInfo.factor : null;

    if (claudeGrams) {
      const diffPercent = Math.abs((localGrams - claudeGrams) / localGrams) * 100;

      if (diffPercent <= WEIGHT_DISCREPANCY_THRESHOLD) {
        // Match! Use local as source of truth
        return {
          value: localWeight.value,
          unit: localWeight.unit,
          valueInGrams: localGrams,
          source: SOURCE.LOCAL,
          confidence: CONFIDENCE.HIGH,
          discrepancy: null,
        };
      } else {
        // Discrepancy detected
        return {
          value: localWeight.value,           // Use local as primary
          unit: localWeight.unit,
          valueInGrams: localGrams,
          source: SOURCE.LOCAL,
          confidence: CONFIDENCE.LOW,
          discrepancy: {
            type: 'weight_mismatch',
            message: `Local: ${localWeight.value}${localWeight.unit} (${localGrams}g) vs Claude: ${claudeWeight.weight}${claudeWeight.weightUnit} (${claudeGrams}g)`,
            local: { value: localWeight.value, unit: localWeight.unit, grams: localGrams },
            claude: { value: claudeWeight.weight, unit: claudeWeight.weightUnit, grams: claudeGrams },
            diffPercent: Math.round(diffPercent),
          },
        };
      }
    }
  }

  // Case 2: Only local weight available
  if (hasLocal) {
    return {
      value: localWeight.value,
      unit: localWeight.unit,
      valueInGrams: localWeight.valueInGrams,
      source: SOURCE.LOCAL,
      confidence: CONFIDENCE.HIGH,
      discrepancy: null,
    };
  }

  // Case 3: Only Claude weight available
  if (hasClaude) {
    const claudeUnit = claudeWeight.weightUnit.toLowerCase();
    const unitInfo = getUnitFactorForPrice(claudeUnit);
    const claudeGrams = unitInfo ? claudeWeight.weight * unitInfo.factor : claudeWeight.weight;

    return {
      value: claudeWeight.weight,
      unit: claudeWeight.weightUnit,
      valueInGrams: claudeGrams,
      source: SOURCE.CLAUDE,
      confidence: CONFIDENCE.MEDIUM,
      discrepancy: null,
    };
  }

  // Case 4: No weight from either source
  return {
    value: null,
    unit: null,
    valueInGrams: null,
    source: null,
    confidence: CONFIDENCE.MANUAL,
    discrepancy: null,
  };
}

// ============================================
// Line Item Merging
// ============================================

/**
 * Merge a single line item from local analysis and Claude parsing
 *
 * @param {Object} localLine - From analyzeLineItem()
 * @param {Object} claudeLine - From Claude's lineItems[]
 * @returns {Object} Merged line item
 */
export function mergeLineItem(localLine, claudeLine) {
  // Merge weight data
  const mergedWeight = mergeWeight(localLine.extractedWeight, {
    weight: claudeLine.weight,
    weightUnit: claudeLine.weightUnit,
  });

  // Build unit string
  let unit = 'ea';
  if (mergedWeight.value && mergedWeight.unit) {
    // Check if there's a package type from Claude
    const quantityUnit = claudeLine.quantityUnit?.toLowerCase();

    // If quantityUnit already contains pack format (e.g., "2/5lb"), use it directly
    // Don't append weight again - that creates duplicates like "2/5lb 5lb"
    const isPackFormat = quantityUnit && /\d+\s*[\/x×]\s*\d+/.test(quantityUnit);

    if (isPackFormat) {
      // Pack format already includes weight info, use as-is
      unit = claudeLine.quantityUnit;
    } else if (quantityUnit && quantityUnit !== 'pc' && quantityUnit !== 'each') {
      // Regular package type (e.g., "case", "box") - append weight
      const packageType = quantityUnit.charAt(0).toUpperCase() + quantityUnit.slice(1);
      unit = `${packageType} ${mergedWeight.value}${mergedWeight.unit}`;
    } else {
      // No package type - just use weight
      unit = `${mergedWeight.value}${mergedWeight.unit}`;
    }
  } else if (claudeLine.quantityUnit) {
    unit = claudeLine.quantityUnit;
  }

  // Calculate pricePerG based on pricing type
  let pricePerG = null;
  let pricePerML = null;

  // Check if this is weight-based pricing (from invoice analysis)
  const isWeightBasedPricing = localLine.isWeightBasedPricing;
  const invoiceWeight = localLine.invoiceWeight || 0;
  const invoiceWeightUnit = (localLine.invoiceWeightUnit || 'lb').toLowerCase();

  if (isWeightBasedPricing && invoiceWeight > 0 && localLine.totalPrice > 0) {
    // WEIGHT-BASED PRICING: pricePerG = totalPrice / totalWeightInGrams
    // Convert invoice weight to grams
    let invoiceWeightInGrams = invoiceWeight;
    if (invoiceWeightUnit === 'lb' || invoiceWeightUnit === 'lbs') {
      invoiceWeightInGrams = invoiceWeight * 453.592;
    } else if (invoiceWeightUnit === 'kg') {
      invoiceWeightInGrams = invoiceWeight * 1000;
    } else if (invoiceWeightUnit === 'oz') {
      invoiceWeightInGrams = invoiceWeight * 28.3495;
    }
    // g stays as is

    pricePerG = localLine.totalPrice / invoiceWeightInGrams;
    pricePerG = Math.round(pricePerG * 1000000) / 1000000;

    console.log(`[Merger] Weight-based pricing: $${localLine.totalPrice} / ${invoiceWeight}${invoiceWeightUnit} (${invoiceWeightInGrams.toFixed(0)}g) = $${pricePerG}/g`);

  } else if (mergedWeight.valueInGrams && localLine.unitPrice > 0) {
    // STANDARD PRICING: pricePerG = unitPrice / weightPerUnit
    const unitInfo = mergedWeight.unit ? getUnitFactorForPrice(mergedWeight.unit) : null;
    if (unitInfo?.isVolume) {
      pricePerML = localLine.unitPrice / mergedWeight.valueInGrams;
      pricePerML = Math.round(pricePerML * 1000000) / 1000000;
      console.log(`[Merger] Standard pricing (volume): $${localLine.unitPrice} / ${mergedWeight.valueInGrams}ml = $${pricePerML}/ml`);
    } else {
      pricePerG = localLine.unitPrice / mergedWeight.valueInGrams;
      pricePerG = Math.round(pricePerG * 1000000) / 1000000;
      console.log(`[Merger] Standard pricing: $${localLine.unitPrice} / ${mergedWeight.valueInGrams}g = $${pricePerG}/g`);
    }
  } else {
    // DEBUG: Log why pricePerG couldn't be calculated
    console.log(`[Merger] ⚠️ Cannot calculate pricePerG for "${localLine.rawDescription}":`, {
      isWeightBasedPricing,
      invoiceWeight,
      'mergedWeight.valueInGrams': mergedWeight.valueInGrams,
      unitPrice: localLine.unitPrice,
      totalPrice: localLine.totalPrice,
      extractedWeight: localLine.extractedWeight,
    });
  }

  // Build merged object
  const merged = {
    lineNumber: localLine.lineNumber,

    // Use DESCRIPTION as primary name (includes weight/size for uniqueness)
    // Claude's "name" is often too generic (e.g., "huile olive" for all olive oils)
    name: claudeLine.description || localLine.rawDescription || claudeLine.name,
    description: claudeLine.description || localLine.rawDescription,
    rawDescription: localLine.rawDescription,
    category: claudeLine.category || 'Other',
    itemCode: claudeLine.itemCode || '',

    // Use local for numeric fields (validated)
    quantity: localLine.quantity,
    orderedQuantity: claudeLine.orderedQuantity, // What was ordered (may differ from delivered)
    unitPrice: localLine.unitPrice,
    totalPrice: localLine.totalPrice,

    // Merged weight data
    weight: mergedWeight.value,
    weightUnit: mergedWeight.unit,
    weightInGrams: mergedWeight.valueInGrams,
    weightSource: mergedWeight.source,
    weightConfidence: mergedWeight.confidence,

    // Built unit string
    unit,
    quantityUnit: claudeLine.quantityUnit || 'ea',

    // Calculated normalized prices
    pricePerG,
    pricePerML,

    // Pricing type detection from local analysis
    isWeightBasedPricing: localLine.isWeightBasedPricing || false,
    pricingType: localLine.pricingType || (localLine.isWeightBasedPricing ? 'weight' : 'unit'),

    // Validation results from local analysis
    mathValid: localLine.mathValid,
    isZeroPrice: localLine.isZeroPrice,
    isCredit: localLine.isCredit,

    // Discrepancies
    discrepancy: mergedWeight.discrepancy,
    hasDiscrepancy: !!mergedWeight.discrepancy,

    // Local anomalies (preserved for display)
    anomalies: localLine.anomalies,

    // Preserve rawColumns from Claude for displaying unmapped columns (FORMAT, ORIGINE, etc.)
    rawColumns: claudeLine.rawColumns || null,

    // Preserve learned corrections from vendor profile (auto-applied by orchestrator)
    learnedCorrection: claudeLine.learnedCorrection || false,
    learnedFormat: claudeLine.learnedFormat || null,
  };

  // Add line type classification and routing tags
  const lineType = detectLineType(merged);
  merged.lineType = lineType;

  // Routing flags for downstream systems
  // forInventory: Only actual products go to inventory
  merged.forInventory = lineType === LINE_TYPE.PRODUCT;

  // forAccounting: Products + fees go to QuickBooks (deposits often handled separately)
  merged.forAccounting = lineType === LINE_TYPE.PRODUCT ||
                         lineType === LINE_TYPE.FEE ||
                         lineType === LINE_TYPE.CREDIT;

  // isDeposit: Quick flag for deposit handling
  merged.isDeposit = lineType === LINE_TYPE.DEPOSIT;

  return merged;
}

/**
 * Merge all line items
 *
 * @param {Object} localAnalysis - From analyzeInvoice()
 * @param {Array} claudeLineItems - From Claude's parsed lineItems
 * @returns {Object} Merged line items with summary
 */
export function mergeAllLineItems(localAnalysis, claudeLineItems) {
  const mergedLines = [];
  const discrepancies = [];

  // Handle missing local analysis - use Claude lines directly
  const localLines = localAnalysis?.lines || [];

  // If no local lines, use Claude lines as base
  if (localLines.length === 0 && claudeLineItems?.length > 0) {
    const lines = claudeLineItems.map((line, idx) => ({
      ...line,
      lineNumber: idx + 1,
      lineType: line.lineType || LINE_TYPE.PRODUCT,
      forInventory: line.forInventory ?? true,
      forAccounting: line.forAccounting ?? true,
    }));
    const productLines = lines.filter(l => l.lineType === LINE_TYPE.PRODUCT || !l.lineType);
    const productSubtotal = Math.round(productLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100) / 100;

    return {
      lines,
      discrepancies: [],
      summary: {
        totalLines: lines.length,
        linesWithWeight: lines.filter(l => l.weight).length,
        linesFromLocal: 0,
        linesFromClaude: lines.length,
        linesNeedingManual: 0,
        discrepancyCount: 0,
        calculatedSubtotal: productSubtotal,
        byType: {
          product: { count: productLines.length, total: productSubtotal },
          deposit: { count: 0, total: 0 },
          fee: { count: 0, total: 0 },
          credit: { count: 0, total: 0 },
          zero: { count: 0, total: 0 },
        },
        inventoryLineCount: lines.filter(l => l.forInventory).length,
        accountingLineCount: lines.filter(l => l.forAccounting).length,
        productSubtotal,
        depositTotal: 0,
        feeTotal: 0,
        creditTotal: 0,
        effectiveSubtotal: productSubtotal,
      }
    };
  }

  // Merge each line
  localLines.forEach((localLine, index) => {
    const claudeLine = claudeLineItems[index] || {};
    const merged = mergeLineItem(localLine, claudeLine);
    mergedLines.push(merged);

    if (merged.hasDiscrepancy) {
      discrepancies.push({
        lineNumber: merged.lineNumber,
        name: merged.name,
        description: merged.rawDescription,
        ...merged.discrepancy,
      });
    }
  });

  // Calculate summary stats
  const linesWithWeight = mergedLines.filter(l => l.weight && l.weightUnit).length;
  const linesFromLocal = mergedLines.filter(l => l.weightSource === SOURCE.LOCAL).length;
  const linesFromClaude = mergedLines.filter(l => l.weightSource === SOURCE.CLAUDE).length;
  const linesNeedingManual = mergedLines.filter(l => l.weightConfidence === CONFIDENCE.MANUAL).length;

  // Calculate subtotals by line type
  const productLines = mergedLines.filter(l => l.lineType === LINE_TYPE.PRODUCT);
  const depositLines = mergedLines.filter(l => l.lineType === LINE_TYPE.DEPOSIT);
  const feeLines = mergedLines.filter(l => l.lineType === LINE_TYPE.FEE);
  const creditLines = mergedLines.filter(l => l.lineType === LINE_TYPE.CREDIT);
  const zeroLines = mergedLines.filter(l => l.lineType === LINE_TYPE.ZERO);

  const productSubtotal = Math.round(productLines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
  const depositTotal = Math.round(depositLines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
  const feeTotal = Math.round(feeLines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
  const creditTotal = Math.round(creditLines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;

  // Effective subtotal = products + fees (what actually goes to QuickBooks expense)
  const effectiveSubtotal = Math.round((productSubtotal + feeTotal + creditTotal) * 100) / 100;

  // Lines for inventory vs accounting
  const inventoryLines = mergedLines.filter(l => l.forInventory);
  const accountingLines = mergedLines.filter(l => l.forAccounting);

  // Debug: Log line type summary
  console.log(`[Merger] Line type summary: product=${productLines.length}, deposit=${depositLines.length}, fee=${feeLines.length}, credit=${creditLines.length}, zero=${zeroLines.length}, total=${mergedLines.length}`);
  console.log(`[Merger] Subtotals: product=$${productSubtotal}, deposit=$${depositTotal}, effective=$${effectiveSubtotal}`);
  // Log sample line to verify structure
  if (mergedLines.length > 0) {
    const sample = mergedLines[0];
    console.log(`[Merger] Sample line: lineType="${sample.lineType}", forInventory=${sample.forInventory}, name="${(sample.name || '').slice(0, 30)}"`);
  }

  return {
    lines: mergedLines,
    discrepancies,
    summary: {
      totalLines: mergedLines.length,
      linesWithWeight,
      linesFromLocal,
      linesFromClaude,
      linesNeedingManual,
      discrepancyCount: discrepancies.length,
      calculatedSubtotal: Math.round(mergedLines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100,

      // Line type breakdown
      byType: {
        product: { count: productLines.length, total: productSubtotal },
        deposit: { count: depositLines.length, total: depositTotal },
        fee: { count: feeLines.length, total: feeTotal },
        credit: { count: creditLines.length, total: creditTotal },
        zero: { count: zeroLines.length, total: 0 },
      },

      // Routing totals
      inventoryLineCount: inventoryLines.length,
      accountingLineCount: accountingLines.length,
      productSubtotal,
      depositTotal,
      feeTotal,
      creditTotal,
      effectiveSubtotal,  // What QuickBooks should receive (products + fees + credits)
    },
  };
}

// ============================================
// Full Invoice Merging
// ============================================

/**
 * Merge complete invoice from local analysis and Claude parsing
 * This is the main entry point for Phase 3
 *
 * @param {Object} localAnalysis - From analyzeInvoice() (Phase 1)
 * @param {Object} claudeParsed - From Claude API (Phase 2)
 * @returns {Object} Merged invoice ready for database
 */
export function mergeInvoice(localAnalysis, claudeParsed) {
  console.log('[Merger] Starting Phase 3: Merge & Compare...');
  const startTime = performance.now();

  // Defensive: handle missing localAnalysis
  const safeLocalAnalysis = localAnalysis || {};
  const safeLocalTotals = safeLocalAnalysis.totals || {};
  const safeLocalLineItems = safeLocalAnalysis.lineItems || {};
  const safeClaude = claudeParsed || {};

  // Merge line items
  const mergedLineItems = mergeAllLineItems(
    safeLocalLineItems,
    safeClaude.lineItems || []
  );

  // Use Claude's vendor info (AI is better at extracting structured data)
  const vendor = safeClaude.vendor || {};

  // Merge totals - prefer local calculated values for validation, fallback to Claude
  const claudeTotals = safeClaude.totals || {};
  const totals = {
    subtotal: safeLocalTotals.subtotal ?? claudeTotals.subtotal ?? 0,
    taxAmount: safeLocalTotals.taxAmount ?? claudeTotals.taxAmount ?? 0,
    totalAmount: safeLocalTotals.totalAmount ?? claudeTotals.totalAmount ?? 0,
    currency: claudeTotals.currency || 'CAD',
    // Include calculated values
    calculatedSubtotal: safeLocalLineItems.summary?.calculatedSubtotal ?? mergedLineItems.summary?.productSubtotal ?? 0,
    subtotalValid: safeLocalTotals.subtotalValid ?? true,
    totalValid: safeLocalTotals.totalValid ?? true,
  };

  // Combine all anomalies and discrepancies
  const localAnomalies = safeLocalAnalysis.allAnomalies || [];
  const allIssues = [
    ...localAnomalies,
    ...mergedLineItems.discrepancies.map(d => ({
      type: 'weight_discrepancy',
      severity: 'warning',
      lineNumber: d.lineNumber,
      description: d.description,
      message: d.message,
      details: d,
    })),
  ];

  // Determine overall status
  let status = 'ready';
  const duplicateCheck = safeLocalAnalysis.duplicateCheck || {};
  if (duplicateCheck.isDuplicate) {
    status = 'duplicate';
  } else if (allIssues.some(i => i.severity === 'error')) {
    status = 'error';
  } else if (allIssues.some(i => i.severity === 'warning')) {
    status = 'warning';
  }

  const result = {
    // Metadata
    mergedAt: new Date().toISOString(),
    status,

    // Vendor info (from Claude)
    vendor: {
      name: vendor.name,
      legalName: vendor.legalName,
      phone: vendor.phone,
      fax: vendor.fax,
      email: vendor.email,
      website: vendor.website,
      address: vendor.address,
      city: vendor.city,
      province: vendor.province,
      postalCode: vendor.postalCode,
      country: vendor.country || 'Canada',
      accountNumber: vendor.accountNumber,
      paymentTerms: vendor.paymentTerms,
      taxNumber: vendor.taxNumber,
      invoiceNumber: vendor.invoiceNumber,
      invoiceDate: vendor.invoiceDate,
      deliveryDate: vendor.deliveryDate,
      poNumber: vendor.poNumber,
    },

    // Merged totals
    totals,

    // Merged line items
    lineItems: mergedLineItems.lines,

    // Issues summary
    issues: {
      all: allIssues,
      errors: allIssues.filter(i => i.severity === 'error'),
      warnings: allIssues.filter(i => i.severity === 'warning'),
      infos: allIssues.filter(i => i.severity === 'info'),
      discrepancies: mergedLineItems.discrepancies,
    },

    // Duplicate check result
    duplicateCheck: duplicateCheck,

    // Summary statistics (with safe defaults)
    summary: {
      status,
      totalLines: mergedLineItems.summary?.totalLines ?? mergedLineItems.lines?.length ?? 0,
      linesWithWeight: mergedLineItems.summary?.linesWithWeight ?? 0,
      linesNeedingManual: mergedLineItems.summary?.linesNeedingManual ?? 0,
      discrepancyCount: mergedLineItems.summary?.discrepancyCount ?? 0,
      totalIssues: allIssues.length,
      errorCount: allIssues.filter(i => i.severity === 'error').length,
      warningCount: allIssues.filter(i => i.severity === 'warning').length,
      // Line type breakdown for reconciliation
      byType: mergedLineItems.summary?.byType ?? { product: { count: 0, total: 0 }, deposit: { count: 0, total: 0 }, fee: { count: 0, total: 0 }, credit: { count: 0, total: 0 }, zero: { count: 0, total: 0 } },
      calculatedSubtotal: mergedLineItems.summary?.calculatedSubtotal ?? 0,
      productSubtotal: mergedLineItems.summary?.productSubtotal ?? 0,
      depositTotal: mergedLineItems.summary?.depositTotal ?? 0,
      feeTotal: mergedLineItems.summary?.feeTotal ?? 0,
      creditTotal: mergedLineItems.summary?.creditTotal ?? 0,
      effectiveSubtotal: mergedLineItems.summary?.effectiveSubtotal ?? 0,
      inventoryLineCount: mergedLineItems.summary?.inventoryLineCount ?? 0,
      accountingLineCount: mergedLineItems.summary?.accountingLineCount ?? 0,
    },

    // Notes from Claude
    notes: safeClaude.notes || '',
  };

  const duration = Math.round(performance.now() - startTime);
  console.log(`[Merger] Phase 3 complete in ${duration}ms:`, {
    status: result.status,
    lines: result.summary.totalLines,
    withWeight: result.summary.linesWithWeight,
    discrepancies: result.summary.discrepancyCount,
    issues: result.summary.totalIssues,
  });

  return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if merged invoice is ready to save
 * (no blocking errors)
 *
 * @param {Object} mergedInvoice - From mergeInvoice()
 * @returns {boolean}
 */
export function isReadyToSave(mergedInvoice) {
  return mergedInvoice.status !== 'duplicate' && mergedInvoice.status !== 'error';
}

/**
 * Get lines that need manual weight entry
 *
 * @param {Object} mergedInvoice - From mergeInvoice()
 * @returns {Array} Lines needing manual entry
 */
export function getLinesNeedingManualWeight(mergedInvoice) {
  return mergedInvoice.lineItems.filter(
    line => line.weightConfidence === CONFIDENCE.MANUAL
  );
}

/**
 * Get lines with weight discrepancies
 *
 * @param {Object} mergedInvoice - From mergeInvoice()
 * @returns {Array} Lines with discrepancies
 */
export function getLinesWithDiscrepancies(mergedInvoice) {
  return mergedInvoice.lineItems.filter(line => line.hasDiscrepancy);
}

/**
 * Apply user override to a line item weight
 *
 * @param {Object} line - Line item to update
 * @param {number} value - User-provided weight value
 * @param {string} unit - User-provided weight unit
 * @returns {Object} Updated line item
 */
export function applyWeightOverride(line, value, unit) {
  const unitInfo = getUnitFactorForPrice(unit);
  const valueInGrams = unitInfo ? value * unitInfo.factor : value;

  // Recalculate pricePerG
  let pricePerG = null;
  let pricePerML = null;
  if (valueInGrams && line.unitPrice > 0) {
    if (unitInfo?.isVolume) {
      pricePerML = line.unitPrice / valueInGrams;
      pricePerML = Math.round(pricePerML * 1000000) / 1000000;
    } else {
      pricePerG = line.unitPrice / valueInGrams;
      pricePerG = Math.round(pricePerG * 1000000) / 1000000;
    }
  }

  return {
    ...line,
    weight: value,
    weightUnit: unit,
    weightInGrams: valueInGrams,
    weightSource: SOURCE.USER,
    weightConfidence: CONFIDENCE.HIGH,
    unit: `${value}${unit}`,
    pricePerG,
    pricePerML,
    discrepancy: null,
    hasDiscrepancy: false,
  };
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  WEIGHT_DISCREPANCY_THRESHOLD,
  CONFIDENCE,
  SOURCE,
  LINE_TYPE,

  // Line type detection
  detectLineType,

  // Merging functions
  mergeWeight,
  mergeLineItem,
  mergeAllLineItems,
  mergeInvoice,

  // Utilities
  isReadyToSave,
  getLinesNeedingManualWeight,
  getLinesWithDiscrepancies,
  applyWeightOverride,
};
