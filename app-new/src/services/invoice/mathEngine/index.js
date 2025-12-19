/**
 * Math Engine - Main Orchestrator
 *
 * Math-first invoice parsing that identifies columns by mathematical
 * validation rather than semantic header matching.
 *
 * Philosophy: If all the math validates (line, sum, tax, total),
 * we have correctly identified the columns.
 *
 * @module services/invoice/mathEngine
 */

// Re-export all modules
export * from './types.js';
export * from './lineValidator.js';
export * from './formatPatterns.js';
export * from './cascadeValidator.js';
export * from './columnSolver.js';
export * from './integration.js';

// Import for orchestration
import { validateAllLines, findValidFormula } from './lineValidator.js';
import { validateCascade, isInvoiceMathValid, getValidationSummary } from './cascadeValidator.js';
import { solveColumns, solveColumnsWithConsensus, parseNumericValue } from './columnSolver.js';
import { extractAllFormats, getBillingValueFromFormat } from './formatPatterns.js';
import { VALIDATION_STATUS } from './types.js';

// ============================================
// Main Orchestration
// ============================================

/**
 * Process an invoice with math-first validation
 *
 * @param {Object} invoice - Raw invoice data
 * @param {Array<Array>} invoice.lines - Raw line data (arrays of column values)
 * @param {number} [invoice.descriptionIndex] - Index of description column
 * @param {number} [invoice.subtotal] - Invoice subtotal
 * @param {number} [invoice.tps] - TPS tax
 * @param {number} [invoice.tvq] - TVQ tax
 * @param {number} [invoice.grandTotal] - Grand total
 * @returns {Object} Processing result with validation
 */
export function processInvoice(invoice) {
  const {
    lines = [],
    descriptionIndex,
    subtotal,
    tps,
    tvq,
    grandTotal,
  } = invoice;

  if (lines.length === 0) {
    return {
      success: false,
      error: 'No lines to process',
      confidence: 0,
    };
  }

  // Step 1: Solve column mapping
  const columnResult = solveColumnsWithConsensus(lines, {
    descriptionIndex,
    minConsensus: 0.7,
  });

  if (!columnResult.found && !columnResult.mapping) {
    return {
      success: false,
      error: 'Could not identify column mapping',
      columnResult,
      confidence: 0,
    };
  }

  const mapping = columnResult.mapping;

  // Step 2: Extract structured line data
  const structuredLines = extractStructuredLines(lines, mapping, descriptionIndex);

  // Step 3: Validate all lines
  const lineValidation = validateAllLines(structuredLines);

  // Step 4: Extract line totals for cascade
  const lineTotals = structuredLines.map((l) => l.totalPrice).filter((t) => t != null);

  // Step 5: Run cascade validation
  const cascadeResult = validateCascade({
    lineTotals,
    subtotal,
    tps,
    tvq,
    grandTotal,
  });

  // Step 6: Calculate overall confidence
  const confidence = calculateConfidence(lineValidation, cascadeResult, columnResult);

  return {
    success: confidence >= 0.8,
    confidence,
    columnMapping: mapping,
    lineValidation,
    cascadeValidation: cascadeResult,
    structuredLines,
    summary: {
      linesProcessed: lines.length,
      linesValid: lineValidation.summary.valid,
      linesInvalid: lineValidation.summary.invalid,
      mathMessage: getValidationSummary(cascadeResult),
      isFullyValidated: cascadeResult.summary.allValid && lineValidation.allValid,
    },
  };
}

/**
 * Extract structured line data using mapping
 */
function extractStructuredLines(lines, mapping, descriptionIndex) {
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Get basic values from mapping
    const totalPrice = parseNumericValue(raw[mapping.totalIndex]);
    const unitPrice = parseNumericValue(raw[mapping.priceIndex]);

    // Get billing value
    let billingValue = null;
    let billingSource = mapping.source;

    if (mapping.source === 'column' && mapping.billingIndex != null) {
      billingValue = parseNumericValue(raw[mapping.billingIndex]);
    } else if (mapping.source === 'format' && descriptionIndex != null) {
      billingValue = getBillingValueFromFormat(raw[descriptionIndex]);
      billingSource = 'format';
    } else if (mapping.source === 'derived' && unitPrice && totalPrice) {
      billingValue = Math.round((totalPrice / unitPrice) * 1000) / 1000;
      billingSource = 'derived';
    }

    // Get description if available
    const description = descriptionIndex != null ? raw[descriptionIndex] : null;

    // Extract format info from description
    const formatInfo = description ? extractAllFormats(description) : null;

    result.push({
      lineNumber: i + 1,
      raw,
      description,
      quantity: billingValue, // For compatibility
      billingValue,
      billingSource,
      unitPrice,
      totalPrice,
      formatInfo,
    });
  }

  return result;
}

/**
 * Calculate overall confidence score
 */
function calculateConfidence(lineValidation, cascadeResult, columnResult) {
  // Weights for different validation levels
  const WEIGHTS = {
    lineValidation: 0.4,
    sumValidation: 0.2,
    taxValidation: 0.2,
    totalValidation: 0.1,
    columnConsensus: 0.1,
  };

  let score = 0;

  // Line validation (40%)
  score += WEIGHTS.lineValidation * (lineValidation.summary.validRate / 100);

  // Sum validation (20%)
  if (cascadeResult.results.sum.status === VALIDATION_STATUS.VALID) {
    score += WEIGHTS.sumValidation;
  } else if (cascadeResult.results.sum.status === VALIDATION_STATUS.SKIPPED) {
    score += WEIGHTS.sumValidation * 0.5; // Partial credit for skipped
  }

  // Tax validation (20%)
  const taxScore =
    (cascadeResult.results.tps.isValid ? 0.5 : 0) +
    (cascadeResult.results.tvq.isValid ? 0.5 : 0);
  score += WEIGHTS.taxValidation * taxScore;

  // Total validation (10%)
  if (cascadeResult.results.total.status === VALIDATION_STATUS.VALID) {
    score += WEIGHTS.totalValidation;
  }

  // Column consensus (10%)
  if (columnResult.consensus) {
    score += WEIGHTS.columnConsensus * columnResult.consensus;
  } else if (columnResult.found) {
    score += WEIGHTS.columnConsensus;
  }

  return Math.round(score * 100) / 100;
}

// ============================================
// Quick Validation Functions
// ============================================

/**
 * Quick check if a line validates mathematically
 *
 * @param {number} quantity - Billing quantity
 * @param {number} price - Unit price
 * @param {number} total - Line total
 * @returns {boolean} True if B × P ≈ T
 */
export function quickValidateLine(quantity, price, total) {
  const result = findValidFormula({
    count: quantity,
    unitPrice: price,
    totalPrice: total,
  });
  return result.found;
}

/**
 * Quick check if invoice totals validate
 *
 * @param {Object} totals - Invoice totals
 * @returns {boolean} True if all math validates
 */
export function quickValidateTotals(totals) {
  return isInvoiceMathValid(totals);
}

/**
 * Suggest column roles based on values
 *
 * @param {Array<Array>} sampleLines - Sample invoice lines
 * @returns {Object} Suggested column mapping
 */
export function suggestColumnMapping(sampleLines) {
  return solveColumns(sampleLines);
}

// ============================================
// Diagnostic Functions
// ============================================

/**
 * Diagnose why validation failed
 *
 * @param {Object} result - Result from processInvoice
 * @returns {Array<string>} List of issues
 */
export function diagnoseValidationIssues(result) {
  const issues = [];

  if (!result.success) {
    if (result.error) {
      issues.push(`Error: ${result.error}`);
    }

    // Check line validation
    if (result.lineValidation) {
      const { invalid, total } = result.lineValidation.summary;
      if (invalid > 0) {
        issues.push(`${invalid} of ${total} lines failed B × P = T validation`);

        // Find the worst offenders
        const invalidLines = result.lineValidation.results
          .filter((r) => !r.found)
          .slice(0, 3);

        for (const line of invalidLines) {
          if (line.bestMatch) {
            issues.push(
              `  Line ${line.lineNumber}: off by $${line.bestMatch.difference?.toFixed(2) || '?'}`
            );
          }
        }
      }
    }

    // Check cascade validation
    if (result.cascadeValidation) {
      const { results } = result.cascadeValidation;

      if (results.sum.status === VALIDATION_STATUS.INVALID) {
        issues.push(
          `Sum validation failed: expected $${results.sum.expected}, got $${results.sum.calculated}`
        );
      }

      if (results.tps.status === VALIDATION_STATUS.INVALID) {
        issues.push(
          `TPS validation failed: expected $${results.tps.expected}, calculated $${results.tps.calculated}`
        );
      }

      if (results.tvq.status === VALIDATION_STATUS.INVALID) {
        issues.push(
          `TVQ validation failed: expected $${results.tvq.expected}, calculated $${results.tvq.calculated}`
        );
      }

      if (results.total.status === VALIDATION_STATUS.INVALID) {
        issues.push(
          `Grand total failed: expected $${results.total.expected}, calculated $${results.total.calculated}`
        );
      }
    }
  }

  return issues;
}

/**
 * Get a human-readable report
 *
 * @param {Object} result - Result from processInvoice
 * @returns {string} Formatted report
 */
export function generateReport(result) {
  const lines = [];

  lines.push('=== Invoice Math Validation Report ===');
  lines.push('');

  // Overall status
  lines.push(`Status: ${result.success ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  lines.push('');

  // Column mapping
  if (result.columnMapping) {
    lines.push('Column Mapping:');
    lines.push(`  Billing (B): Column ${result.columnMapping.billingIndex ?? 'derived'}`);
    lines.push(`  Price (P): Column ${result.columnMapping.priceIndex}`);
    lines.push(`  Total (T): Column ${result.columnMapping.totalIndex}`);
    lines.push('');
  }

  // Line validation
  if (result.lineValidation) {
    const { summary } = result.lineValidation;
    lines.push('Line Validation:');
    lines.push(`  Valid: ${summary.valid}/${summary.total}`);
    lines.push(`  Invalid: ${summary.invalid}`);
    lines.push(`  Skipped: ${summary.skipped}`);
    lines.push(`  Rate: ${summary.validRate.toFixed(1)}%`);
    lines.push('');
  }

  // Cascade validation
  if (result.cascadeValidation) {
    const { results } = result.cascadeValidation;
    lines.push('Cascade Validation:');
    lines.push(`  Line Sum: ${results.sum.status} ${results.sum.isValid ? '✓' : ''}`);
    lines.push(`  TPS Tax: ${results.tps.status} ${results.tps.isValid ? '✓' : ''}`);
    lines.push(`  TVQ Tax: ${results.tvq.status} ${results.tvq.isValid ? '✓' : ''}`);
    lines.push(`  Grand Total: ${results.total.status} ${results.total.isValid ? '✓' : ''}`);
    lines.push('');
  }

  // Issues
  const issues = diagnoseValidationIssues(result);
  if (issues.length > 0) {
    lines.push('Issues:');
    for (const issue of issues) {
      lines.push(`  ${issue}`);
    }
  }

  return lines.join('\n');
}

// ============================================
// Default Export
// ============================================

export default {
  // Main orchestration
  processInvoice,

  // Quick validation
  quickValidateLine,
  quickValidateTotals,
  suggestColumnMapping,

  // Diagnostics
  diagnoseValidationIssues,
  generateReport,
};
