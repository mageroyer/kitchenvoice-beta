/**
 * Invoice Processing Types
 *
 * JSDoc type definitions for the invoice processing orchestrator.
 * These types define the contracts between services.
 *
 * @module services/invoice/types
 */

// ============================================
// VENDOR DETECTION TYPES
// ============================================

/**
 * @typedef {'exact' | 'high' | 'medium' | 'low' | 'none'} DetectionConfidence
 */

/**
 * @typedef {'taxNumber' | 'phone' | 'email' | 'exactName' | 'fuzzyName' | 'none'} DetectionMethod
 */

/**
 * @typedef {Object} VendorDetectionResult
 * @property {Object|null} vendor - Matched vendor or null
 * @property {DetectionConfidence} confidence - Confidence level
 * @property {DetectionMethod} method - How vendor was detected
 * @property {boolean} isNew - True if no vendor found (needs creation)
 * @property {Object} extractedInfo - Info extracted from invoice for new vendor
 */

// ============================================
// PARSING PROFILE TYPES
// ============================================

/**
 * @typedef {'weight' | 'unit' | 'mixed'} PricingModel
 */

/**
 * @typedef {Object} ColumnMapping
 * @property {boolean} detected - Whether this column was detected
 * @property {string|null} header - Column header text
 * @property {number|null} position - Column position (0-indexed)
 * @property {string[]} [aliases] - Alternative header names
 */

/**
 * @typedef {Object} PricingIndicator
 * @property {string} column - Column name to check for pricing type
 * @property {string[]} weightValues - Values indicating weight-based pricing
 * @property {string[]} unitValues - Values indicating unit-based pricing
 */

/**
 * @typedef {Object} ProfileQuirks
 * @property {boolean} hasDeposits - Vendor charges container deposits
 * @property {boolean} weightInDescription - Weight embedded in description text
 * @property {boolean} priceIncludesTax - Prices already include tax
 * @property {string[]} skipPatterns - Row patterns to skip (e.g., "SUBTOTAL")
 * @property {boolean} isContainerDistributor - Vendor uses container format notation (10/100, 6/RL)
 * @property {boolean} hasNestedUnits - Format column uses nested unit notation (10/100)
 * @property {boolean} hasRollProducts - Vendor sells roll/linear products (6/RL)
 * @property {boolean} hasContainerCapacity - Products have capacity specs (2.25LB = capacity, not weight)
 */

/**
 * @typedef {Object} ProfileStats
 * @property {number} timesUsed - Number of invoices processed with this profile
 * @property {string|null} lastUsed - ISO timestamp of last use
 * @property {number|null} successRate - Success rate percentage (0-100)
 * @property {number} manualCorrections - Number of user corrections needed
 */

/**
 * @typedef {Object} ParsingProfile
 * @property {number} version - Profile schema version
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string} [createdBy] - User ID who created the profile
 * @property {PricingModel} pricingModel - How this vendor prices items
 * @property {PricingIndicator} [pricingIndicator] - For mixed pricing vendors
 * @property {Object.<string, ColumnMapping>} columns - Column mappings
 * @property {ProfileQuirks} quirks - Special handling flags
 * @property {string|null} promptHints - Custom hints for Claude
 * @property {ProfileStats} stats - Usage statistics
 */

/**
 * @typedef {Object} StructureAnalysis
 * @property {PricingModel} suggestedPricingModel - AI-detected pricing model
 * @property {number} pricingConfidence - Confidence in pricing detection (0-100)
 * @property {Object.<string, ColumnMapping>} detectedColumns - Detected columns
 * @property {ProfileQuirks} suggestedQuirks - Detected special handling needs
 * @property {SampleLine[]} sampleLines - Sample lines for verification
 * @property {string|null} promptHints - Suggested prompt hints
 */

/**
 * @typedef {Object} SampleLine
 * @property {number} lineNumber - Line number in invoice
 * @property {string} raw - Raw line text
 * @property {Object} parsed - Parsed values
 * @property {string} parsed.description - Item description
 * @property {number|null} parsed.quantity - Quantity
 * @property {number|null} parsed.weight - Weight
 * @property {string|null} parsed.weightUnit - Weight unit
 * @property {number|null} parsed.unitPrice - Unit price
 * @property {number|null} parsed.total - Total price
 * @property {number|null} parsed.pricePerG - Calculated price per gram
 * @property {string|null} parsed.packagingFormat - Container format string (10/100, 6/RL)
 * @property {string|null} parsed.packagingType - Type: nested_units, rolls, simple
 * @property {number|null} parsed.totalUnitsPerCase - Calculated total units per case
 * @property {number|null} parsed.containerCapacity - Container capacity (for containers/lids)
 * @property {string|null} parsed.containerCapacityUnit - Capacity unit (lb, oz, ml)
 * @property {string} lineType - Detected type (product/deposit/fee/credit)
 * @property {boolean} mathValid - Whether math checks out
 */

// ============================================
// INTELLIGENT MATCHING TYPES
// ============================================

/**
 * @typedef {'sku_exact' | 'sku_partial' | 'vendor_fuzzy' | 'global_fuzzy' | 'none'} MatchType
 */

/**
 * @typedef {Object} MatchCandidate
 * @property {number} inventoryItemId - Inventory item ID
 * @property {string} name - Item name
 * @property {string|null} sku - Item SKU
 * @property {number|null} vendorId - Vendor ID
 * @property {string|null} vendorName - Vendor name
 * @property {number} score - Match score (0-100)
 * @property {number} rawScore - Score before adjustments
 * @property {MatchType} matchType - How the match was made
 * @property {string|null} warning - Warning message if any
 */

/**
 * @typedef {Object} LineMatchResult
 * @property {number} lineId - Invoice line ID
 * @property {number} lineNumber - Line number
 * @property {boolean} matched - Whether a match was found above threshold
 * @property {MatchCandidate|null} bestMatch - Best matching candidate
 * @property {MatchCandidate[]} candidates - Top candidates for review
 * @property {boolean} autoApplied - Whether match was auto-applied
 * @property {string|null} warning - Warning message if any
 */

/**
 * @typedef {Object} MatchingOptions
 * @property {number} [vendorId] - Vendor ID for context
 * @property {ParsingProfile} [profile] - Vendor's parsing profile
 * @property {number} [autoMatchThreshold=85] - Minimum score for auto-match
 * @property {number} [suggestionThreshold=50] - Minimum score for suggestions
 * @property {boolean} [applyRecencyDecay=true] - Apply recency-based decay
 * @property {boolean} [boostSameVendor=true] - Boost score for same vendor
 */

// ============================================
// ORCHESTRATOR TYPES
// ============================================

/**
 * @typedef {'needs_onboarding' | 'ready_for_review' | 'error'} ProcessingStatus
 */

/**
 * @typedef {Object} ProcessingResult
 * @property {ProcessingStatus} status - Current processing status
 * @property {Object|null} vendor - Detected/matched vendor
 * @property {Object|null} vendorInfo - Extracted vendor info from invoice
 * @property {ParsingProfile|null} profile - Vendor's parsing profile
 * @property {StructureAnalysis|null} suggestedProfile - For onboarding
 * @property {Object|null} invoice - Parsed invoice header data
 * @property {LineMatchResult[]} lines - Matched line items
 * @property {string|null} rawText - Raw invoice text
 * @property {File|null} file - Original file reference
 * @property {string|null} error - Error message if status is 'error'
 */

/**
 * @typedef {Object} OnboardingData
 * @property {Object} vendorData - Vendor info to create/update
 * @property {ParsingProfile} profile - Confirmed parsing profile
 */

// ============================================
// RECIPE COST CASCADE TYPES
// ============================================

/**
 * @typedef {Object} PriceChangeInfo
 * @property {number} inventoryItemId - Item that changed
 * @property {string} itemName - Item name
 * @property {number} oldPrice - Previous pricePerG
 * @property {number} newPrice - New pricePerG
 * @property {number} priceChangePct - Percentage change
 */

/**
 * @typedef {Object} RecipeCostUpdate
 * @property {number} recipeId - Recipe ID
 * @property {string} recipeName - Recipe name
 * @property {number} oldCost - Previous total cost
 * @property {number} newCost - New total cost
 * @property {number} costDelta - Absolute change
 * @property {number} costDeltaPct - Percentage change
 */

/**
 * @typedef {Object} CostCascadeResult
 * @property {string} itemName - Item that triggered cascade
 * @property {number} priceChangePct - Item's price change
 * @property {number} affectedRecipes - Total recipes affected
 * @property {RecipeCostUpdate[]} significantChanges - Changes >= 5%
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Default confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  AUTO_MATCH: 85,        // Auto-apply match without review
  SUGGESTION: 50,        // Include in suggestions list
  SKU_NAME_MISMATCH: 50  // Flag if SKU matches but name below this
};

/**
 * Recency decay factors
 */
export const RECENCY_FACTORS = {
  RECENT_DAYS: 30,       // Days considered "recent"
  RECENT_FACTOR: 1.0,    // No decay for recent
  MODERATE_DAYS: 90,     // Days considered "moderate"
  MODERATE_FACTOR: 0.95,
  STALE_DAYS: 180,       // Days considered "stale"
  STALE_FACTOR: 0.85,
  OLD_FACTOR: 0.70       // Decay for very old items
};

/**
 * Vendor boost for same-vendor matches
 */
export const VENDOR_MATCH_BOOST = 10;

/**
 * Profile schema version
 */
export const PROFILE_VERSION = 1;

/**
 * Line types for classification
 */
export const LINE_TYPES = {
  PRODUCT: 'product',
  DEPOSIT: 'deposit',
  FEE: 'fee',
  CREDIT: 'credit',
  ZERO: 'zero'
};

export default {
  CONFIDENCE_THRESHOLDS,
  RECENCY_FACTORS,
  VENDOR_MATCH_BOOST,
  PROFILE_VERSION,
  LINE_TYPES
};
