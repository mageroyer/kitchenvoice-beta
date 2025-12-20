/**
 * Parsing Profile Manager
 *
 * Manages vendor parsing profiles - the templates that define how to
 * extract data from each vendor's invoices.
 *
 * Handles:
 * - Profile CRUD operations
 * - AI-powered structure analysis for new vendors
 * - Profile validation and migration
 *
 * @module services/invoice/parsingProfileManager
 */

import { vendorDB } from '../database/indexedDB';
import { PROFILE_VERSION, LINE_TYPES } from './types';
import { generateContainerFormatHints } from '../../utils/packagingParser';

// ============================================
// CONSTANTS
// ============================================

/**
 * Default profile structure for new vendors
 */
const DEFAULT_PROFILE = {
  version: PROFILE_VERSION,
  pricingModel: 'unit',
  pricingIndicator: null,
  columns: {
    sku: { detected: false, header: null, position: null },
    description: { detected: false, header: null, position: null },
    quantity: { detected: false, header: null, position: null },
    weight: { detected: false, header: null, position: null },
    unitPrice: { detected: false, header: null, position: null },
    total: { detected: false, header: null, position: null },
    unitIndicator: { detected: false, header: null, position: null }
  },
  quirks: {
    hasDeposits: false,
    weightInDescription: false,
    priceIncludesTax: false,
    skipPatterns: ['SUBTOTAL', 'SOUS-TOTAL', 'TPS', 'TVQ', 'GST', 'HST', 'TOTAL']
  },
  promptHints: null,
  stats: {
    timesUsed: 0,
    lastUsed: null,
    successRate: null,
    manualCorrections: 0
  }
};

/**
 * Column header aliases for detection
 */
const COLUMN_ALIASES = {
  sku: ['code', 'item #', 'item#', 'sku', 'product code', 'code produit', 'no.', 'ref'],
  description: ['description', 'item', 'product', 'produit', 'article', 'desc'],
  quantity: ['qty', 'qté', 'quantity', 'quantité', 'quant', 'q'],
  weight: ['weight', 'poids', 'wt', 'kg', 'lb', 'lbs', 'poids (kg)', 'poids (lb)'],
  unitPrice: ['price', 'prix', 'unit price', 'prix unit', 'prix/kg', 'prix/lb', '$/kg', '$/lb', 'rate'],
  total: ['total', 'amount', 'montant', 'ext', 'extension', 'line total'],
  unitIndicator: ['u/m', 'um', 'unit', 'unité', 'measure', 'mesure', 'uom'],
  // Container/packaging format column
  packFormat: ['format', 'pack', 'emballage', 'packaging', 'fmt', 'pack format', 'format emballage']
};

/**
 * Patterns that indicate weight-based pricing
 */
const WEIGHT_PRICING_INDICATORS = [
  /prix\s*\/\s*kg/i,
  /\$\s*\/\s*kg/i,
  /prix\s*\/\s*lb/i,
  /\$\s*\/\s*lb/i,
  /per\s*kg/i,
  /per\s*lb/i,
  /poids.*prix/i,
  /weight.*price/i
];

/**
 * Patterns that indicate deposits
 */
const DEPOSIT_PATTERNS = [
  /consigne/i,
  /deposit/i,
  /caution/i,
  /bouteille/i,
  /bottle/i,
  /crate/i,
  /caisse\s*vide/i
];

// ============================================
// PROFILE CRUD
// ============================================

/**
 * Get parsing profile for a vendor
 *
 * @param {number} vendorId - Vendor ID
 * @returns {Promise<import('./types').ParsingProfile|null>}
 */
export async function getProfile(vendorId) {
  const vendor = await vendorDB.getById(vendorId);
  if (!vendor) return null;

  const profile = vendor.parsingProfile;
  if (!profile) return null;

  // Migrate if needed
  if (profile.version < PROFILE_VERSION) {
    const migrated = migrateProfile(profile);
    await saveProfile(vendorId, migrated);
    return migrated;
  }

  return profile;
}

/**
 * Save parsing profile for a vendor
 *
 * @param {number} vendorId - Vendor ID
 * @param {import('./types').ParsingProfile} profile - Profile to save
 * @returns {Promise<boolean>}
 */
export async function saveProfile(vendorId, profile) {
  const now = new Date().toISOString();

  const profileToSave = {
    ...profile,
    version: PROFILE_VERSION,
    updatedAt: now,
    createdAt: profile.createdAt || now
  };

  await vendorDB.update(vendorId, { parsingProfile: profileToSave });
  console.log(`[ParsingProfile] Saved profile for vendor ${vendorId}`);

  return true;
}

/**
 * Delete parsing profile for a vendor
 *
 * @param {number} vendorId - Vendor ID
 * @returns {Promise<boolean>}
 */
export async function deleteProfile(vendorId) {
  await vendorDB.update(vendorId, { parsingProfile: null });
  console.log(`[ParsingProfile] Deleted profile for vendor ${vendorId}`);
  return true;
}

/**
 * Update profile statistics after use
 *
 * @param {number} vendorId - Vendor ID
 * @param {Object} stats - Stats to update
 * @param {boolean} [stats.success] - Whether parsing was successful
 * @param {number} [stats.corrections] - Number of manual corrections
 * @returns {Promise<boolean>}
 */
export async function updateStats(vendorId, { success = true, corrections = 0 } = {}) {
  const profile = await getProfile(vendorId);
  if (!profile) return false;

  const stats = profile.stats || {};
  const timesUsed = (stats.timesUsed || 0) + 1;
  const totalCorrections = (stats.manualCorrections || 0) + corrections;

  // Calculate success rate (simple moving average)
  const previousRate = stats.successRate || 100;
  const newRate = success
    ? Math.min(100, previousRate + (100 - previousRate) * 0.1)
    : Math.max(0, previousRate - previousRate * 0.2);

  const updatedStats = {
    timesUsed,
    lastUsed: new Date().toISOString(),
    successRate: Math.round(newRate * 10) / 10,
    manualCorrections: totalCorrections
  };

  const updatedProfile = { ...profile, stats: updatedStats };
  await saveProfile(vendorId, updatedProfile);

  return true;
}

// ============================================
// AI STRUCTURE ANALYSIS
// ============================================

/**
 * Analyze invoice structure to suggest a parsing profile
 *
 * This is called for new vendors or when structure changes.
 * Uses heuristics first, can be enhanced with Claude.
 *
 * @param {string} invoiceText - Raw invoice text
 * @param {Object} parsedData - Claude's initial parse (if available)
 * @returns {Promise<import('./types').StructureAnalysis>}
 */
export async function analyzeStructure(invoiceText, parsedData = null) {
  const analysis = {
    suggestedPricingModel: 'unit',
    pricingConfidence: 50,
    detectedColumns: { ...DEFAULT_PROFILE.columns },
    suggestedQuirks: { ...DEFAULT_PROFILE.quirks },
    sampleLines: [],
    promptHints: null
  };

  // Detect pricing model from text patterns
  const pricingResult = detectPricingModel(invoiceText, parsedData);
  analysis.suggestedPricingModel = pricingResult.model;
  analysis.pricingConfidence = pricingResult.confidence;

  // Detect columns from headers or data
  analysis.detectedColumns = detectColumns(invoiceText, parsedData);

  // Detect quirks
  analysis.suggestedQuirks = detectQuirks(invoiceText, parsedData);

  // Extract sample lines for verification
  if (parsedData?.lineItems) {
    analysis.sampleLines = extractSampleLines(parsedData.lineItems, analysis);
  }

  // Generate prompt hints based on analysis
  analysis.promptHints = generateSuggestedHints(analysis);

  return analysis;
}

/**
 * Detect pricing model from invoice
 *
 * @param {string} text - Invoice text
 * @param {Object} parsedData - Parsed data if available
 * @returns {{ model: import('./types').PricingModel, confidence: number }}
 */
function detectPricingModel(text, parsedData) {
  let weightIndicators = 0;
  let unitIndicators = 0;

  // Check text for pricing patterns
  for (const pattern of WEIGHT_PRICING_INDICATORS) {
    if (pattern.test(text)) {
      weightIndicators++;
    }
  }

  // Check if we have a weight column
  if (/poids|weight|kg|lb/i.test(text)) {
    weightIndicators++;
  }

  // Check parsed line items if available
  if (parsedData?.lineItems) {
    for (const line of parsedData.lineItems) {
      // If line has weight and math works with weight × price
      if (line.weight && line.unitPrice && line.totalPrice) {
        const weightCalc = line.weight * line.unitPrice;
        const qtyCalc = (line.quantity || 1) * line.unitPrice;

        const weightError = Math.abs(weightCalc - line.totalPrice) / line.totalPrice;
        const qtyError = Math.abs(qtyCalc - line.totalPrice) / line.totalPrice;

        if (weightError < 0.02) {
          weightIndicators += 2;
        } else if (qtyError < 0.02) {
          unitIndicators += 2;
        }
      }
    }
  }

  // Determine model
  if (weightIndicators > unitIndicators + 2) {
    return { model: 'weight', confidence: Math.min(90, 60 + weightIndicators * 10) };
  } else if (unitIndicators > weightIndicators + 2) {
    return { model: 'unit', confidence: Math.min(90, 60 + unitIndicators * 10) };
  } else if (weightIndicators > 0 && unitIndicators > 0) {
    return { model: 'mixed', confidence: 50 };
  }

  return { model: 'unit', confidence: 50 };
}

/**
 * Detect column structure from invoice
 *
 * @param {string} text - Invoice text
 * @param {Object} parsedData - Parsed data if available
 * @returns {Object.<string, import('./types').ColumnMapping>}
 */
function detectColumns(text, parsedData) {
  const columns = { ...DEFAULT_PROFILE.columns };
  const lowerText = text.toLowerCase();

  // Check for each column type
  for (const [columnType, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (lowerText.includes(alias.toLowerCase())) {
        columns[columnType] = {
          detected: true,
          header: alias,
          position: null, // Would need more analysis to determine position
          aliases: COLUMN_ALIASES[columnType]
        };
        break;
      }
    }
  }

  // If we have parsed data, verify columns have data
  if (parsedData?.lineItems?.length > 0) {
    const sample = parsedData.lineItems[0];

    if (sample.itemCode || sample.sku) columns.sku.detected = true;
    if (sample.description) columns.description.detected = true;
    if (sample.quantity !== undefined) columns.quantity.detected = true;
    if (sample.weight !== undefined) columns.weight.detected = true;
    if (sample.unitPrice !== undefined) columns.unitPrice.detected = true;
    if (sample.totalPrice !== undefined) columns.total.detected = true;
  }

  return columns;
}

/**
 * Detect special handling quirks
 *
 * @param {string} text - Invoice text
 * @param {Object} parsedData - Parsed data if available
 * @returns {import('./types').ProfileQuirks}
 */
function detectQuirks(text, parsedData) {
  const quirks = { ...DEFAULT_PROFILE.quirks };

  // Check for deposits
  for (const pattern of DEPOSIT_PATTERNS) {
    if (pattern.test(text)) {
      quirks.hasDeposits = true;
      break;
    }
  }

  // Check for weight in description
  if (parsedData?.lineItems) {
    const weightInDescCount = parsedData.lineItems.filter(line => {
      const desc = line.description || '';
      return /\d+[.,]?\d*\s*(kg|lb|g|oz)/i.test(desc);
    }).length;

    if (weightInDescCount > parsedData.lineItems.length * 0.3) {
      quirks.weightInDescription = true;
    }
  }

  // Check for taxes already included
  if (/taxes?\s*inclus/i.test(text) || /incl.*tax/i.test(text)) {
    quirks.priceIncludesTax = true;
  }

  return quirks;
}

/**
 * Extract sample lines for user verification
 *
 * @param {Object[]} lineItems - Parsed line items
 * @param {import('./types').StructureAnalysis} analysis - Current analysis
 * @returns {import('./types').SampleLine[]}
 */
function extractSampleLines(lineItems, analysis) {
  // Get up to 3 diverse samples
  const samples = [];
  const seenTypes = new Set();

  for (const line of lineItems) {
    if (samples.length >= 3) break;

    // Determine line type
    let lineType = LINE_TYPES.PRODUCT;
    const desc = (line.description || '').toLowerCase();

    for (const pattern of DEPOSIT_PATTERNS) {
      if (pattern.test(desc)) {
        lineType = LINE_TYPES.DEPOSIT;
        break;
      }
    }

    if (line.totalPrice < 0) {
      lineType = LINE_TYPES.CREDIT;
    }

    // Skip if we already have this type (want diversity)
    if (seenTypes.has(lineType) && samples.length > 0) continue;
    seenTypes.add(lineType);

    // Calculate pricePerG if weight-based
    let pricePerG = null;
    if (analysis.suggestedPricingModel === 'weight' && line.weight > 0) {
      // Assume weight is in kg for now
      const weightInGrams = line.weight * 1000;
      pricePerG = line.totalPrice / weightInGrams;
    }

    // Verify math
    let mathValid = false;
    if (line.totalPrice && line.unitPrice) {
      if (analysis.suggestedPricingModel === 'weight' && line.weight) {
        mathValid = Math.abs(line.weight * line.unitPrice - line.totalPrice) / line.totalPrice < 0.02;
      } else if (line.quantity) {
        mathValid = Math.abs(line.quantity * line.unitPrice - line.totalPrice) / line.totalPrice < 0.02;
      }
    }

    samples.push({
      lineNumber: line.lineNumber || samples.length + 1,
      raw: line.rawDescription || line.description,
      parsed: {
        description: line.description,
        quantity: line.quantity,
        weight: line.weight,
        weightUnit: line.weightUnit || 'kg',
        unitPrice: line.unitPrice,
        total: line.totalPrice,
        pricePerG: pricePerG ? Math.round(pricePerG * 1000000) / 1000000 : null
      },
      lineType,
      mathValid
    });
  }

  return samples;
}

/**
 * Generate suggested prompt hints from structure analysis (for new vendors)
 * Used during analyzeStructure() to suggest hints before user confirmation.
 *
 * @param {import('./types').StructureAnalysis} analysis - Structure analysis
 * @returns {string|null}
 */
function generateSuggestedHints(analysis) {
  const hints = [];

  if (analysis.suggestedPricingModel === 'weight') {
    hints.push('This vendor uses weight-based pricing: Total = Weight × Price/kg (not Quantity × Price)');
  } else if (analysis.suggestedPricingModel === 'mixed') {
    hints.push('This vendor uses mixed pricing: check U/M column for each line');
  }

  if (analysis.suggestedQuirks.hasDeposits) {
    hints.push('Watch for deposit lines (consigne/deposit) - mark as fee type, not product');
  }

  if (analysis.suggestedQuirks.weightInDescription) {
    hints.push('Weight may be embedded in description (e.g., "Beef 5.2kg") - extract separately');
  }

  if (!analysis.detectedColumns.weight.detected && analysis.suggestedPricingModel === 'weight') {
    hints.push('No dedicated weight column found - weight may be in description or calculated');
  }

  return hints.length > 0 ? hints.join('. ') : null;
}

/**
 * Column type labels for prompt hints
 * Maps internal column keys to human-readable descriptions for Claude
 */
const COLUMN_LABELS = {
  sku: 'SKU / Item Code',
  description: 'Description',
  quantity: 'Quantity (delivered)',
  orderedQuantity: 'Ordered Quantity',
  billingQuantity: 'Billing Quantity (for pricing)',
  pieceCount: 'Piece Count',
  unit: 'Unit of Measure',
  quantityUnit: 'U/M (kg=weight, UN=count)',
  weight: 'Weight',
  packageFormat: 'Package Format (weight embedded)',
  packageUnits: 'Package Format (units per case)',
  packFormat: 'Pack Format (distributor: 4/5LB)',
  // Container/packaging distributor format (e.g., Carrousel)
  containerFormat: 'Container Format (nested: 10/100, rolls: 6/RL)',
  unitPrice: 'Unit Price',
  totalPrice: 'Line Total'
};

/**
 * Weight unit labels for prompt hints
 */
const WEIGHT_UNIT_LABELS = {
  lb: 'Pounds (lb)',
  kg: 'Kilograms (kg)',
  g: 'Grams (g)',
  oz: 'Ounces (oz)'
};

/**
 * Generate Claude prompt hints from a confirmed profile
 *
 * CONSOLIDATED FUNCTION - used by:
 * - VendorProfileWizard (when building profile)
 * - parseWithProfile() in orchestrator (when parsing with saved profile)
 *
 * Combines:
 * - Column position hints (tells Claude exact table structure)
 * - Quirks hints (deposits, weight in description, etc.)
 * - Pricing model hints
 * - Weight/package format hints
 *
 * @param {import('./types').ParsingProfile} profile - Confirmed vendor profile
 * @returns {string|null} Combined prompt hints string
 */
export function generatePromptHints(profile) {
  if (!profile) return null;

  const hints = [];

  // 1. COLUMN POSITION HINTS (most important for Claude)
  // Build: "TABLE STRUCTURE: Column 1=SKU, Column 2=Description..."
  if (profile.columns && typeof profile.columns === 'object') {
    const columnEntries = Object.entries(profile.columns)
      .filter(([key, col]) => col && col.index != null && key !== 'skip')
      .sort((a, b) => a[1].index - b[1].index);

    if (columnEntries.length > 0) {
      const columnOrder = columnEntries
        .map(([key, col]) => {
          const label = COLUMN_LABELS[key] || key;
          return `Column ${col.index + 1}=${label}`;
        })
        .join(', ');

      hints.push(`TABLE STRUCTURE (by column position): ${columnOrder}.`);
    }
  }

  // 2. PRICING MODEL HINTS
  if (profile.pricingModel === 'weight') {
    hints.push('IMPORTANT: This vendor uses weight-based pricing. Total = Weight × Price/kg, NOT Quantity × Price.');
  } else if (profile.pricingModel === 'mixed') {
    hints.push('This vendor uses mixed pricing. Check U/M column for each line to determine pricing type.');
  }

  // 3. WEIGHT COLUMN HINTS
  if (profile.columns?.weight?.index != null && profile.weightUnit) {
    const unitLabel = WEIGHT_UNIT_LABELS[profile.weightUnit] || profile.weightUnit;
    hints.push(`WEIGHT: Column ${profile.columns.weight.index + 1} contains weight in ${unitLabel}. Set weightUnit="${profile.weightUnit}".`);
  }

  // 4. BILLING QUANTITY HINTS (French invoices)
  if (profile.columns?.billingQuantity?.index != null) {
    hints.push(`BILLING QTY: Column ${profile.columns.billingQuantity.index + 1} is the BILLING quantity (Qté Fact) - use this for pricing calculations, not ordered quantity.`);
  }

  // 5. PACKAGE FORMAT HINTS
  if (profile.packageFormat?.enabled) {
    const packageCol = profile.columns?.packageFormat || profile.columns?.packageUnits || profile.columns?.packFormat;
    const colIndex = packageCol?.index;

    if (profile.packageFormat.type === 'distributor' && colIndex != null) {
      hints.push(`PACK FORMAT: Column ${colIndex + 1} contains distributor pack format like "4/5LB" (4 bags × 5lb each) or "12CT" (12 count). Parse as: packCount/unitValue+unit.`);
    } else if (profile.packageFormat.type === 'weight' && colIndex != null) {
      hints.push(`PACKAGE FORMAT: Column ${colIndex + 1} contains package weight like "Caisse 25lbs" or "Sac 50kg". Extract weight value and unit.`);
    } else if (profile.packageFormat.type === 'units' && colIndex != null) {
      hints.push(`PACKAGE UNITS: Column ${colIndex + 1} contains units per case like "Caisse 24" (24 units). Treat numbers as count, not weight.`);
    }
  }

  // 6. QUIRKS HINTS
  if (profile.quirks?.hasDeposits) {
    hints.push('Watch for deposit/consigne lines - mark as fee type, not product.');
  }

  if (profile.quirks?.weightInDescription) {
    hints.push('Weight may be embedded in description (e.g., "Beef 5.2kg") - extract separately.');
  }

  if (profile.quirks?.weightInPackageFormat) {
    hints.push('IMPORTANT: Weight is embedded in the package/format column. Extract weight value and unit from this column for each line.');
  }

  if (profile.quirks?.skuInDescription) {
    hints.push('SKU/item code may be embedded in description - extract separately.');
  }

  // 7. CONTAINER/PACKAGING DISTRIBUTOR HINTS
  // For vendors like Carrousel Emballage that use nested unit notation (10/100, 6/RL)
  if (profile.quirks?.isContainerDistributor || profile.columns?.containerFormat?.index != null) {
    const containerHints = generateContainerFormatHints({
      hasNestedUnits: true,
      hasRolls: true,
      hasContainers: true
    });
    hints.push(containerHints);
  }

  return hints.length > 0 ? hints.join(' ') : null;
}

// ============================================
// PROFILE VALIDATION & MIGRATION
// ============================================

/**
 * Validate a parsing profile
 *
 * @param {import('./types').ParsingProfile} profile - Profile to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];
  const warnings = [];

  if (!profile) {
    return { valid: false, errors: ['Profile is null'], warnings: [] };
  }

  if (!profile.pricingModel) {
    errors.push('Missing pricing model');
  }

  if (!['weight', 'unit', 'mixed'].includes(profile.pricingModel)) {
    errors.push(`Invalid pricing model: ${profile.pricingModel}`);
  }

  if (profile.pricingModel === 'mixed' && !profile.pricingIndicator) {
    warnings.push('Mixed pricing model without indicator column defined');
  }

  if (!profile.columns) {
    errors.push('Missing columns configuration');
  }

  if (profile.version < PROFILE_VERSION) {
    warnings.push(`Profile version ${profile.version} is outdated (current: ${PROFILE_VERSION})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Migrate profile to current version
 *
 * @param {Object} profile - Old profile
 * @returns {import('./types').ParsingProfile}
 */
function migrateProfile(profile) {
  const migrated = { ...DEFAULT_PROFILE, ...profile };

  // Version 0 → 1 migrations
  if (!profile.version || profile.version < 1) {
    // Ensure all required fields exist
    migrated.columns = { ...DEFAULT_PROFILE.columns, ...profile.columns };
    migrated.quirks = { ...DEFAULT_PROFILE.quirks, ...profile.quirks };
    migrated.stats = { ...DEFAULT_PROFILE.stats, ...profile.stats };
  }

  migrated.version = PROFILE_VERSION;
  return migrated;
}

/**
 * Create a new profile from user confirmation
 *
 * @param {import('./types').StructureAnalysis} analysis - AI analysis
 * @param {Object} userConfirmation - User's confirmed/modified values
 * @returns {import('./types').ParsingProfile}
 */
export function createProfileFromAnalysis(analysis, userConfirmation = {}) {
  const now = new Date().toISOString();

  return {
    version: PROFILE_VERSION,
    createdAt: now,
    updatedAt: now,
    pricingModel: userConfirmation.pricingModel || analysis.suggestedPricingModel,
    pricingIndicator: userConfirmation.pricingIndicator || null,
    columns: userConfirmation.columns || analysis.detectedColumns,
    quirks: userConfirmation.quirks || analysis.suggestedQuirks,
    promptHints: userConfirmation.promptHints || analysis.promptHints,
    stats: {
      timesUsed: 0,
      lastUsed: null,
      successRate: null,
      manualCorrections: 0
    }
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  // CRUD
  getProfile,
  saveProfile,
  deleteProfile,
  updateStats,

  // Analysis
  analyzeStructure,

  // Prompt Hints
  generatePromptHints,  // Consolidated function for confirmed profiles

  // Validation
  validateProfile,
  createProfileFromAnalysis,

  // Constants
  DEFAULT_PROFILE,
  COLUMN_ALIASES,
  COLUMN_LABELS,
  WEIGHT_UNIT_LABELS,

  // Expose for testing
  _helpers: {
    detectPricingModel,
    detectColumns,
    detectQuirks,
    extractSampleLines,
    generateSuggestedHints,  // For structure analysis phase
    migrateProfile
  }
};
