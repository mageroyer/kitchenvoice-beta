/**
 * Invoice Analyzer - Phase 1: Local Analysis
 *
 * Performs mandatory local analysis on invoice data BEFORE AI processing.
 * This is the "ground truth" layer - regex doesn't hallucinate.
 *
 * Responsibilities:
 * - Extract weights from product names (MANDATORY)
 * - Validate line item math (qty × price ≈ total)
 * - Detect zero-price items (likely unavailable)
 * - Check for duplicate invoices
 * - Validate invoice totals
 *
 * @module services/inventory/invoiceAnalyzer
 */

import { extractWeightFromName } from '../../utils/format';
import { invoiceDB } from '../database/indexedDB';

// ============================================
// Constants
// ============================================

/**
 * Tolerance for math validation (in dollars)
 * Allows for small rounding differences
 */
export const MATH_TOLERANCE = 0.02;

/**
 * Tolerance for totals validation (in dollars)
 * Invoice totals may have larger rounding differences
 */
export const TOTALS_TOLERANCE = 1.00;

/**
 * Quebec tax rates and configuration
 * TPS (GST) = Federal Goods & Services Tax
 * TVQ (QST) = Quebec Sales Tax
 *
 * IMPORTANT: Quebec uses compound taxation - TVQ is calculated on (subtotal + TPS)
 * Formula: TVQ = (subtotal + TPS) × 9.975%
 */
export const QUEBEC_TAX = {
  TPS_RATE: 0.05,        // Federal GST: 5%
  TVQ_RATE: 0.09975,     // Quebec QST: 9.975%
  // Tolerance: 0.5% of expected value or $0.02, whichever is larger
  TOLERANCE_PERCENT: 0.005,
  TOLERANCE_MIN: 0.02,
};

/**
 * Analysis result status codes
 */
export const ANALYSIS_STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Anomaly type codes
 */
export const ANOMALY_TYPES = {
  MATH_MISMATCH: 'math_mismatch',
  ZERO_PRICE: 'zero_price',
  MISSING_WEIGHT: 'missing_weight',
  WEIGHT_DISCREPANCY: 'weight_discrepancy',
  SUBTOTAL_MISMATCH: 'subtotal_mismatch',
  TAX_MISMATCH: 'tax_mismatch',
  TPS_MISMATCH: 'tps_mismatch',
  TVQ_MISMATCH: 'tvq_mismatch',
  TAX_EXEMPT: 'tax_exempt',
  TOTAL_MISMATCH: 'total_mismatch',
  DUPLICATE_INVOICE: 'duplicate_invoice',
  MISSING_QUANTITY: 'missing_quantity',
  NEGATIVE_VALUE: 'negative_value',
};

// ============================================
// Line Item Analysis
// ============================================

/**
 * Analyze a single line item
 * Extracts weight, validates math, detects anomalies
 *
 * @param {Object} line - Raw line item from invoice
 * @param {number} lineNumber - Line number (1-indexed)
 * @returns {Object} Analysis result with extracted data and anomalies
 */
export function analyzeLineItem(line, lineNumber) {
  const anomalies = [];

  // Get raw values
  const description = line.description || line.name || '';
  const quantity = parseFloat(line.quantity) || 0;
  const unitPrice = parseFloat(line.unitPrice) || 0;
  const totalPrice = parseFloat(line.totalPrice) || 0;

  // ═══════════════════════════════════════════════════════════
  // MANDATORY: Extract weight from product name OR unit column
  // Some invoices put weight in description: "FARINE 2.5KG"
  // Others put it in unit column: "Sac 50lb"
  // ═══════════════════════════════════════════════════════════
  const quantityUnit = line.quantityUnit || '';
  let extractedWeight = extractWeightFromName(description);
  let weightSource = 'description';

  // If no weight in description, try the unit column (e.g., "Sac 50lb", "Boîte 350g")
  if (!extractedWeight && quantityUnit) {
    extractedWeight = extractWeightFromName(quantityUnit);
    weightSource = 'quantityUnit';
  }

  if (extractedWeight) {
    console.log(`[Analyzer] Line ${lineNumber}: Extracted ${extractedWeight.value}${extractedWeight.unit} from ${weightSource}: "${weightSource === 'description' ? description : quantityUnit}"`);
  }

  // ═══════════════════════════════════════════════════════════
  // MANDATORY: Validate math - AUTO-DETECT pricing type
  // Try both formulas and see which one matches:
  // 1. Weight-based: weight × unitPrice = total (meat/produce invoices)
  // 2. Standard: qty × unitPrice = total (regular invoices)
  // ═══════════════════════════════════════════════════════════
  const weight = parseFloat(line.weight) || 0;

  // Infer weight unit if missing - check priceUnit first, then default to 'lb' (common in NA)
  let weightUnit = 'lb';
  if (line.weightUnit) {
    weightUnit = line.weightUnit.toLowerCase();
  } else if (line.priceUnit && ['lb', 'kg', 'g', 'oz'].includes(line.priceUnit.toLowerCase())) {
    // If no weightUnit but priceUnit is a weight, use that
    weightUnit = line.priceUnit.toLowerCase();
  }

  // Calculate both formulas
  const weightBasedTotal = weight > 0 ? Math.round(weight * unitPrice * 100) / 100 : null;
  const standardTotal = quantity > 0 ? Math.round(quantity * unitPrice * 100) / 100 : null;

  // Check which formula matches (within tolerance)
  const weightBasedDiff = weightBasedTotal !== null ? Math.abs(weightBasedTotal - totalPrice) : Infinity;
  const standardDiff = standardTotal !== null ? Math.abs(standardTotal - totalPrice) : Infinity;

  const weightBasedMatches = weightBasedDiff <= MATH_TOLERANCE;
  const standardMatches = standardDiff <= MATH_TOLERANCE;

  // AUTO-DETECT: Use weight-based if that formula matches, otherwise use standard
  let isWeightBasedPricing = false;
  let expectedTotal;
  let mathFormula;
  let mathValid;

  if (weightBasedMatches && weight > 0) {
    // Weight-based formula works
    isWeightBasedPricing = true;
    expectedTotal = weightBasedTotal;
    mathFormula = `${weight} ${weightUnit} × $${unitPrice.toFixed(2)}`;
    mathValid = true;
    console.log(`[Analyzer] Line ${lineNumber}: Auto-detected WEIGHT-BASED pricing (${weight}${weightUnit} × $${unitPrice} = $${totalPrice})`);
  } else if (standardMatches && quantity > 0) {
    // Standard formula works
    isWeightBasedPricing = false;
    expectedTotal = standardTotal;
    mathFormula = `${quantity} × $${unitPrice.toFixed(2)}`;
    mathValid = true;
    console.log(`[Analyzer] Line ${lineNumber}: Auto-detected STANDARD pricing (${quantity} × $${unitPrice} = $${totalPrice})`);
  } else {
    // Neither formula matches - flag as warning
    // Default to standard formula for the error message
    isWeightBasedPricing = false;
    expectedTotal = standardTotal || 0;
    mathFormula = `${quantity} × $${unitPrice.toFixed(2)}`;
    mathValid = false;

    // Only add anomaly if we have valid inputs
    if ((quantity > 0 || weight > 0) && unitPrice > 0 && totalPrice > 0) {
      const bestDiff = Math.min(weightBasedDiff, standardDiff);
      anomalies.push({
        type: ANOMALY_TYPES.MATH_MISMATCH,
        severity: 'warning',
        message: weight > 0
          ? `Math error: Neither formula matches. Qty: ${quantity} × $${unitPrice.toFixed(2)} = $${(standardTotal || 0).toFixed(2)}. Weight: ${weight}${weightUnit} × $${unitPrice.toFixed(2)} = $${(weightBasedTotal || 0).toFixed(2)}. Invoice: $${totalPrice.toFixed(2)}`
          : `Math error: ${mathFormula} = $${expectedTotal.toFixed(2)}, but invoice shows $${totalPrice.toFixed(2)}`,
        expected: expectedTotal,
        actual: totalPrice,
        difference: bestDiff,
        pricingType: 'unknown',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Detect zero price (item likely unavailable)
  // ═══════════════════════════════════════════════════════════
  if (unitPrice === 0 && quantity > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.ZERO_PRICE,
      severity: 'info',
      message: `Zero price: "${description}" - item may be unavailable`,
      quantity,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Detect missing quantity
  // ═══════════════════════════════════════════════════════════
  if (quantity === 0 && unitPrice > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.MISSING_QUANTITY,
      severity: 'warning',
      message: `Missing quantity for "${description}"`,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Detect negative values
  // ═══════════════════════════════════════════════════════════
  if (quantity < 0 || unitPrice < 0 || totalPrice < 0) {
    anomalies.push({
      type: ANOMALY_TYPES.NEGATIVE_VALUE,
      severity: 'warning',
      message: `Negative value detected in "${description}" - may be a credit/return`,
      quantity,
      unitPrice,
      totalPrice,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Flag if no weight could be extracted
  // ═══════════════════════════════════════════════════════════
  const hasWeight = !!extractedWeight;
  if (!hasWeight && quantity > 0 && unitPrice > 0) {
    // Only flag as info - not all items have weight in name
    anomalies.push({
      type: ANOMALY_TYPES.MISSING_WEIGHT,
      severity: 'info',
      message: `No weight found in "${description}" - may need manual entry`,
    });
  }

  // Build analysis result
  // Determine the effective mathDiff based on which formula was used
  const effectiveMathDiff = isWeightBasedPricing ? weightBasedDiff : standardDiff;

  // Log pricing detection result
  if (weight > 0 || quantity > 0) {
    console.log(`[Analyzer] Line ${lineNumber} pricing detection:`, {
      desc: description.slice(0, 30),
      qty: quantity,
      weight,
      weightUnit,
      unitPrice,
      total: totalPrice,
      weightCalc: weightBasedTotal,
      stdCalc: standardTotal,
      detected: isWeightBasedPricing ? 'WEIGHT-BASED' : 'STANDARD',
    });
  }

  return {
    lineNumber,
    rawDescription: description,

    // Extracted weight from description (MANDATORY analysis)
    extractedWeight,
    hasWeight,

    // Weight-based pricing info (auto-detected from math)
    invoiceWeight: weight,           // Weight from invoice column (not description)
    invoiceWeightUnit: weightUnit,   // Unit of invoice weight (lb, kg, etc.)
    priceUnit: isWeightBasedPricing ? weightUnit : 'each', // Detected pricing unit
    pricingType: isWeightBasedPricing ? 'weight' : 'unit', // Friendly pricing type
    isWeightBasedPricing,

    // Validated values
    quantity,
    unitPrice,
    totalPrice,
    expectedTotal,
    mathDiff: effectiveMathDiff === Infinity ? 0 : effectiveMathDiff,
    mathValid,

    // Flags
    isZeroPrice: unitPrice === 0,
    isCredit: totalPrice < 0,

    // Anomalies found
    anomalies,
    hasAnomalies: anomalies.length > 0,

    // Status
    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

/**
 * Analyze all line items in an invoice
 *
 * @param {Array} lineItems - Array of raw line items
 * @returns {Object} Analysis results with summary
 */
export function analyzeAllLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return {
      lines: [],
      summary: {
        totalLines: 0,
        linesWithWeight: 0,
        linesWithAnomalies: 0,
        totalAnomalies: 0,
        calculatedSubtotal: 0,
      },
    };
  }

  const analyzedLines = lineItems.map((line, index) =>
    analyzeLineItem(line, index + 1)
  );

  // Calculate summary
  const linesWithWeight = analyzedLines.filter(l => l.hasWeight).length;
  const linesWithAnomalies = analyzedLines.filter(l => l.hasAnomalies).length;
  const totalAnomalies = analyzedLines.reduce((sum, l) => sum + l.anomalies.length, 0);
  const calculatedSubtotal = analyzedLines.reduce((sum, l) => sum + l.totalPrice, 0);

  return {
    lines: analyzedLines,
    summary: {
      totalLines: analyzedLines.length,
      linesWithWeight,
      linesWithoutWeight: analyzedLines.length - linesWithWeight,
      linesWithAnomalies,
      totalAnomalies,
      calculatedSubtotal: Math.round(calculatedSubtotal * 100) / 100,
      weightExtractionRate: Math.round((linesWithWeight / analyzedLines.length) * 100),
    },
  };
}

// ============================================
// Invoice Totals Analysis
// ============================================

/**
 * Calculate expected Quebec taxes using compound rule
 * TVQ is calculated on (subtotal + TPS), not just subtotal
 *
 * @param {number} subtotal - Invoice subtotal before taxes
 * @returns {Object} Expected tax amounts
 */
export function calculateQuebecTaxes(subtotal) {
  if (subtotal <= 0) {
    return { tps: 0, tvq: 0, total: 0, combinedRate: 0 };
  }

  // TPS (GST) = 5% of subtotal
  const tps = Math.round(subtotal * QUEBEC_TAX.TPS_RATE * 100) / 100;

  // TVQ (QST) = 9.975% of (subtotal + TPS) - COMPOUND RULE
  const tvq = Math.round((subtotal + tps) * QUEBEC_TAX.TVQ_RATE * 100) / 100;

  const total = Math.round((tps + tvq) * 100) / 100;

  // Effective combined rate (for reference)
  const combinedRate = (total / subtotal) * 100;

  return { tps, tvq, total, combinedRate };
}

/**
 * Validate Quebec taxes (TPS/GST and TVQ/QST)
 * Uses compound tax rule: TVQ = (subtotal + TPS) × 9.975%
 *
 * @param {number} subtotal - Invoice subtotal
 * @param {number} invoiceTPS - TPS amount from invoice (taxGST)
 * @param {number} invoiceTVQ - TVQ amount from invoice (taxQST)
 * @returns {Object} Validation result with anomalies
 */
export function validateQuebecTaxes(subtotal, invoiceTPS, invoiceTVQ) {
  const anomalies = [];

  // Handle null/undefined gracefully
  const actualTPS = parseFloat(invoiceTPS) || 0;
  const actualTVQ = parseFloat(invoiceTVQ) || 0;
  const actualTotal = actualTPS + actualTVQ;

  // Calculate expected taxes
  const expected = calculateQuebecTaxes(subtotal);

  // Calculate tolerances (0.5% or $0.02 minimum)
  const tpsTolerance = Math.max(expected.tps * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN);
  const tvqTolerance = Math.max(expected.tvq * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN);

  // Track validation results
  let tpsValid = true;
  let tvqValid = true;
  let isTaxExempt = false;

  // ═══════════════════════════════════════════════════════════
  // Check for tax-exempt scenario
  // ═══════════════════════════════════════════════════════════
  if (subtotal > 0 && actualTPS === 0 && actualTVQ === 0) {
    isTaxExempt = true;
    anomalies.push({
      type: ANOMALY_TYPES.TAX_EXEMPT,
      severity: 'info',
      message: 'No taxes detected - verify if vendor is tax-exempt or taxes are included in prices',
      subtotal,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Validate TPS (GST) - 5%
  // ═══════════════════════════════════════════════════════════
  if (!isTaxExempt && subtotal > 0) {
    const tpsDiff = Math.abs(actualTPS - expected.tps);
    if (tpsDiff > tpsTolerance) {
      tpsValid = false;
      const tpsRate = (actualTPS / subtotal) * 100;
      anomalies.push({
        type: ANOMALY_TYPES.TPS_MISMATCH,
        severity: 'warning',
        message: `TPS/GST mismatch: Expected $${expected.tps.toFixed(2)} (5%), invoice shows $${actualTPS.toFixed(2)} (${tpsRate.toFixed(2)}%)`,
        expected: expected.tps,
        actual: actualTPS,
        difference: tpsDiff,
        expectedRate: QUEBEC_TAX.TPS_RATE * 100,
        actualRate: tpsRate,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Validate TVQ (QST) - 9.975% compound
  // ═══════════════════════════════════════════════════════════
  if (!isTaxExempt && subtotal > 0) {
    const tvqDiff = Math.abs(actualTVQ - expected.tvq);
    if (tvqDiff > tvqTolerance) {
      tvqValid = false;
      // Note: TVQ rate is on (subtotal + TPS), not just subtotal
      const tvqBase = subtotal + actualTPS;
      const tvqRate = tvqBase > 0 ? (actualTVQ / tvqBase) * 100 : 0;
      anomalies.push({
        type: ANOMALY_TYPES.TVQ_MISMATCH,
        severity: 'warning',
        message: `TVQ/QST mismatch: Expected $${expected.tvq.toFixed(2)} (9.975% compound), invoice shows $${actualTVQ.toFixed(2)} (${tvqRate.toFixed(2)}%)`,
        expected: expected.tvq,
        actual: actualTVQ,
        difference: tvqDiff,
        expectedRate: QUEBEC_TAX.TVQ_RATE * 100,
        actualRate: tvqRate,
        note: 'TVQ is calculated on (subtotal + TPS), not just subtotal',
      });
    }
  }

  return {
    expected,
    actual: { tps: actualTPS, tvq: actualTVQ, total: actualTotal },
    tpsValid,
    tvqValid,
    isTaxExempt,
    anomalies,
    hasAnomalies: anomalies.length > 0,
    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

/**
 * Validate invoice totals
 * Checks subtotal, tax, and total calculations
 * Supports both legacy single taxAmount and Quebec-specific TPS/TVQ
 *
 * @param {Object} totals - Invoice totals from parsed data
 * @param {number} calculatedSubtotal - Sum of line items
 * @returns {Object} Validation result with anomalies
 */
export function validateTotals(totals, calculatedSubtotal) {
  const anomalies = [];

  const subtotal = parseFloat(totals?.subtotal) || 0;
  const totalAmount = parseFloat(totals?.totalAmount) || 0;

  // Support both formats: separate TPS/TVQ or combined taxAmount
  const taxGST = parseFloat(totals?.taxGST) || parseFloat(totals?.taxTPS) || 0;
  const taxQST = parseFloat(totals?.taxQST) || parseFloat(totals?.taxTVQ) || 0;
  const taxAmount = parseFloat(totals?.taxAmount) || (taxGST + taxQST);

  // ═══════════════════════════════════════════════════════════
  // Check subtotal matches sum of line items
  // ═══════════════════════════════════════════════════════════
  const subtotalDiff = Math.abs(calculatedSubtotal - subtotal);
  if (subtotalDiff > TOTALS_TOLERANCE && subtotal > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.SUBTOTAL_MISMATCH,
      severity: 'warning',
      message: `Subtotal mismatch: Line items sum to $${calculatedSubtotal.toFixed(2)}, but invoice shows $${subtotal.toFixed(2)}`,
      calculated: calculatedSubtotal,
      invoiceValue: subtotal,
      difference: subtotalDiff,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Quebec tax validation (TPS + TVQ with compound rule)
  // ═══════════════════════════════════════════════════════════
  let quebecTaxValidation = null;
  if (taxGST > 0 || taxQST > 0) {
    // Separate TPS/TVQ provided - do Quebec-specific validation
    quebecTaxValidation = validateQuebecTaxes(subtotal, taxGST, taxQST);
    anomalies.push(...quebecTaxValidation.anomalies);
  } else if (subtotal > 0 && taxAmount > 0) {
    // Legacy: single taxAmount - check if it matches expected Quebec combined rate
    const expected = calculateQuebecTaxes(subtotal);
    const taxDiff = Math.abs(taxAmount - expected.total);
    const tolerance = Math.max(expected.total * QUEBEC_TAX.TOLERANCE_PERCENT, QUEBEC_TAX.TOLERANCE_MIN * 2);

    if (taxDiff > tolerance) {
      const taxRate = (taxAmount / subtotal) * 100;
      anomalies.push({
        type: ANOMALY_TYPES.TAX_MISMATCH,
        severity: 'warning',
        message: `Tax amount mismatch: Expected $${expected.total.toFixed(2)} (${expected.combinedRate.toFixed(2)}% Quebec rate), invoice shows $${taxAmount.toFixed(2)} (${taxRate.toFixed(1)}%)`,
        expected: expected.total,
        actual: taxAmount,
        difference: taxDiff,
        expectedRate: expected.combinedRate,
        actualRate: taxRate,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Check total = subtotal + taxes
  // ═══════════════════════════════════════════════════════════
  const expectedTotal = subtotal + taxAmount;
  const totalDiff = Math.abs(expectedTotal - totalAmount);
  if (totalDiff > TOTALS_TOLERANCE && totalAmount > 0) {
    anomalies.push({
      type: ANOMALY_TYPES.TOTAL_MISMATCH,
      severity: 'warning',
      message: `Total mismatch: $${subtotal.toFixed(2)} + $${taxAmount.toFixed(2)} tax = $${expectedTotal.toFixed(2)}, but invoice shows $${totalAmount.toFixed(2)}`,
      calculated: expectedTotal,
      invoiceValue: totalAmount,
      difference: totalDiff,
    });
  }

  return {
    subtotal,
    taxAmount,
    taxGST,
    taxQST,
    totalAmount,
    calculatedSubtotal,
    expectedTotal,

    subtotalValid: subtotalDiff <= TOTALS_TOLERANCE,
    totalValid: totalDiff <= TOTALS_TOLERANCE,

    // Quebec tax validation results (if applicable)
    quebecTaxValidation,

    anomalies,
    hasAnomalies: anomalies.length > 0,

    status: anomalies.some(a => a.severity === 'error')
      ? ANALYSIS_STATUS.ERROR
      : anomalies.some(a => a.severity === 'warning')
        ? ANALYSIS_STATUS.WARNING
        : ANALYSIS_STATUS.OK,
  };
}

// ============================================
// Duplicate Detection
// ============================================

/**
 * Check if invoice already exists in database
 * Uses indexed query for O(1) performance instead of full table scan.
 *
 * @param {string} vendorName - Vendor name
 * @param {string} invoiceNumber - Invoice number
 * @param {string} invoiceDate - Invoice date (YYYY-MM-DD) - reserved for future use
 * @returns {Promise<Object>} Duplicate check result
 */
export async function checkDuplicateInvoice(vendorName, invoiceNumber, _invoiceDate) {
  if (!invoiceNumber) {
    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'No invoice number provided',
    };
  }

  try {
    // Use optimized indexed query (O(1) instead of O(n) full scan)
    const result = await invoiceDB.checkDuplicate(vendorName, invoiceNumber);

    if (result.isDuplicate) {
      return {
        isDuplicate: true,
        existingInvoice: result.existingInvoice,
        message: `Duplicate found: Invoice #${invoiceNumber} from ${vendorName} already exists (ID: ${result.existingInvoice.id})`,
      };
    }

    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'No duplicate found',
    };

  } catch (error) {
    console.error('[Analyzer] Error checking for duplicate:', error);
    return {
      isDuplicate: false,
      existingInvoice: null,
      message: 'Could not check for duplicates',
      error: error.message,
    };
  }
}

// ============================================
// Full Invoice Analysis
// ============================================

/**
 * Perform complete local analysis on parsed invoice
 * This is the main entry point for Phase 1 analysis
 *
 * @param {Object} parsedInvoice - Raw parsed invoice from Claude
 * @returns {Promise<Object>} Complete analysis result
 */
export async function analyzeInvoice(parsedInvoice) {
  console.log('[Analyzer] Starting Phase 1: Local Analysis...');
  const startTime = performance.now();

  const result = {
    // Metadata
    analyzedAt: new Date().toISOString(),
    analysisVersion: '1.0.0',

    // Line item analysis
    lineItems: null,

    // Totals analysis
    totals: null,

    // Duplicate check
    duplicateCheck: null,

    // Overall summary
    summary: {
      status: ANALYSIS_STATUS.OK,
      totalAnomalies: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
    },

    // All anomalies collected
    allAnomalies: [],
  };

  // ═══════════════════════════════════════════════════════════
  // 1. Analyze all line items
  // ═══════════════════════════════════════════════════════════
  result.lineItems = analyzeAllLineItems(parsedInvoice.lineItems || []);

  // Collect line item anomalies
  result.lineItems.lines.forEach(line => {
    line.anomalies.forEach(anomaly => {
      result.allAnomalies.push({
        ...anomaly,
        lineNumber: line.lineNumber,
        description: line.rawDescription,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. Validate totals
  // ═══════════════════════════════════════════════════════════
  result.totals = validateTotals(
    parsedInvoice.totals,
    result.lineItems.summary.calculatedSubtotal
  );

  // Collect totals anomalies
  result.totals.anomalies.forEach(anomaly => {
    result.allAnomalies.push({
      ...anomaly,
      lineNumber: null,
      description: 'Invoice totals',
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. Check for duplicate invoice
  // ═══════════════════════════════════════════════════════════
  const vendorName = parsedInvoice.vendor?.name;
  const invoiceNumber = parsedInvoice.vendor?.invoiceNumber;
  const invoiceDate = parsedInvoice.vendor?.invoiceDate;

  result.duplicateCheck = await checkDuplicateInvoice(
    vendorName,
    invoiceNumber,
    invoiceDate
  );

  if (result.duplicateCheck.isDuplicate) {
    result.allAnomalies.push({
      type: ANOMALY_TYPES.DUPLICATE_INVOICE,
      severity: 'error',
      message: result.duplicateCheck.message,
      existingInvoice: result.duplicateCheck.existingInvoice,
      lineNumber: null,
      description: 'Invoice',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 4. Calculate summary
  // ═══════════════════════════════════════════════════════════
  result.summary.totalAnomalies = result.allAnomalies.length;
  result.summary.errors = result.allAnomalies.filter(a => a.severity === 'error').length;
  result.summary.warnings = result.allAnomalies.filter(a => a.severity === 'warning').length;
  result.summary.infos = result.allAnomalies.filter(a => a.severity === 'info').length;

  // Determine overall status
  if (result.summary.errors > 0) {
    result.summary.status = ANALYSIS_STATUS.ERROR;
  } else if (result.summary.warnings > 0) {
    result.summary.status = ANALYSIS_STATUS.WARNING;
  } else {
    result.summary.status = ANALYSIS_STATUS.OK;
  }

  const duration = Math.round(performance.now() - startTime);
  console.log(`[Analyzer] Phase 1 complete in ${duration}ms:`, {
    lines: result.lineItems.summary.totalLines,
    withWeight: result.lineItems.summary.linesWithWeight,
    anomalies: result.summary.totalAnomalies,
    status: result.summary.status,
  });

  return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get extracted weights as a map for easy lookup
 *
 * @param {Object} analysisResult - Result from analyzeInvoice
 * @returns {Map} Map of lineNumber -> extractedWeight
 */
export function getExtractedWeightsMap(analysisResult) {
  const map = new Map();

  analysisResult.lineItems.lines.forEach(line => {
    if (line.extractedWeight) {
      map.set(line.lineNumber, line.extractedWeight);
    }
  });

  return map;
}

/**
 * Get anomalies filtered by type
 *
 * @param {Object} analysisResult - Result from analyzeInvoice
 * @param {string} type - Anomaly type to filter by
 * @returns {Array} Filtered anomalies
 */
export function getAnomaliesByType(analysisResult, type) {
  return analysisResult.allAnomalies.filter(a => a.type === type);
}

/**
 * Get anomalies filtered by severity
 *
 * @param {Object} analysisResult - Result from analyzeInvoice
 * @param {string} severity - Severity level ('error', 'warning', 'info')
 * @returns {Array} Filtered anomalies
 */
export function getAnomaliesBySeverity(analysisResult, severity) {
  return analysisResult.allAnomalies.filter(a => a.severity === severity);
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  MATH_TOLERANCE,
  TOTALS_TOLERANCE,
  QUEBEC_TAX,
  ANALYSIS_STATUS,
  ANOMALY_TYPES,

  // Line item analysis
  analyzeLineItem,
  analyzeAllLineItems,

  // Totals analysis
  validateTotals,

  // Quebec tax validation
  calculateQuebecTaxes,
  validateQuebecTaxes,

  // Duplicate detection
  checkDuplicateInvoice,

  // Full analysis
  analyzeInvoice,

  // Utilities
  getExtractedWeightsMap,
  getAnomaliesByType,
  getAnomaliesBySeverity,
};
