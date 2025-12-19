/**
 * Invoice Line Service
 *
 * Business logic layer for invoice line item management operations.
 * Handles matching to inventory items, validation, and inventory updates.
 *
 * @module services/inventory/invoiceLineService
 */

import {
  invoiceLineDB,
  invoiceDB,
  inventoryItemDB,
  vendorDB,
  db,
  MATCH_STATUS
} from '../database/indexedDB';
import { searchItems, createItem as createInventoryItem, normalizeName } from './inventoryItemService';
import { addStockFromInvoice } from './stockService';
import { extractWeightFromName } from '../../utils/format';
import { detectToolUnit, getUnitFactorForPrice } from '../../utils/unitConversion';

// ============================================
// Unit Parsing Helper
// ============================================

/**
 * Parse a unit string to extract purchase quantity and unit
 * Uses shared detectToolUnit for tool units, falls back to direct parsing
 */
function parseUnitString(unitStr) {
  if (!unitStr || typeof unitStr !== 'string') {
    return { purchaseQty: null, purchaseUnit: null, baseGrams: null };
  }

  // First try tool unit detection (handles "caisse 5lb", etc.)
  const toolResult = detectToolUnit(unitStr);
  if (toolResult.isTool && toolResult.hasWeight) {
    return {
      purchaseQty: null, // Tool units don't have qty in same way
      purchaseUnit: toolResult.toolAbbrev,
      baseGrams: toolResult.weightG
    };
  }

  // Direct pattern match for simple units like "5kg", "10lb", "500ml"
  const normalized = unitStr.toLowerCase().trim();
  const match = normalized.match(/(\d+[.,]?\d*)\s*(lb|lbs|kg|g|oz|ml|l|cl)/i);

  if (match) {
    const qty = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    const unitInfo = getUnitFactorForPrice(unit);

    if (unitInfo) {
      return {
        purchaseQty: qty,
        purchaseUnit: unit === 'lbs' ? 'lb' : unit,
        baseGrams: qty * unitInfo.factor
      };
    }
  }

  return { purchaseQty: null, purchaseUnit: null, baseGrams: null };
}

// ============================================
// Constants
// ============================================

/**
 * Minimum confidence threshold for auto-matching
 */
export const AUTO_MATCH_CONFIDENCE_THRESHOLD = 80;

/**
 * Match status values (re-exported for convenience)
 */
export { MATCH_STATUS };

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate line data for creation
 * @param {Object} data - Line data to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLineData(data) {
  const errors = [];

  // Quantity validation
  if (data.quantity !== undefined && data.quantity !== null) {
    if (typeof data.quantity !== 'number' || data.quantity < 0) {
      errors.push('Quantity must be a non-negative number');
    }
  }

  // Unit price validation
  if (data.unitPrice !== undefined && data.unitPrice !== null) {
    if (typeof data.unitPrice !== 'number' || data.unitPrice < 0) {
      errors.push('Unit price must be a non-negative number');
    }
  }

  // Total price validation
  if (data.totalPrice !== undefined && data.totalPrice !== null) {
    if (typeof data.totalPrice !== 'number' || data.totalPrice < 0) {
      errors.push('Total price must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate match confidence between line description and inventory item
 * @param {string} description - Line item description
 * @param {Object} item - Inventory item
 * @returns {number} Confidence score (0-100)
 */
export function calculateMatchConfidence(description, item) {
  if (!description || !item) return 0;

  const normalizedDesc = normalizeName(description);
  const normalizedName = normalizeName(item.name);

  // Exact match
  if (normalizedDesc === normalizedName) return 100;

  // SKU match (high confidence)
  if (item.sku && description.toLowerCase().includes(item.sku.toLowerCase())) {
    return 95;
  }

  // Name starts with description or vice versa
  if (normalizedName.startsWith(normalizedDesc) || normalizedDesc.startsWith(normalizedName)) {
    return 90;
  }

  // Containment check
  if (normalizedName.includes(normalizedDesc) || normalizedDesc.includes(normalizedName)) {
    return 85;
  }

  // Check aliases
  if (item.aliases && Array.isArray(item.aliases)) {
    for (const alias of item.aliases) {
      const normalizedAlias = normalizeName(alias);
      if (normalizedAlias === normalizedDesc) return 95;
      if (normalizedAlias.includes(normalizedDesc) || normalizedDesc.includes(normalizedAlias)) {
        return 80;
      }
    }
  }

  // Word overlap scoring
  const descWords = normalizedDesc.split(' ').filter(w => w.length > 2);
  const nameWords = normalizedName.split(' ').filter(w => w.length > 2);

  if (descWords.length === 0 || nameWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of descWords) {
    if (nameWords.some(nw => nw.includes(word) || word.includes(nw))) {
      matchedWords++;
    }
  }

  const wordScore = (matchedWords / Math.max(descWords.length, nameWords.length)) * 70;
  return Math.round(wordScore);
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new invoice line item
 *
 * @param {number} invoiceId - Invoice ID (required)
 * @param {Object} data - Line item data
 * @param {string} [data.rawDescription] - Raw description from invoice
 * @param {string} [data.description] - Parsed description
 * @param {number} [data.quantity] - Quantity
 * @param {string} [data.unit] - Unit of measure
 * @param {number} [data.unitPrice] - Unit price
 * @param {number} [data.totalPrice] - Total price
 * @param {string} [data.sku] - SKU/product code
 * @returns {Promise<Object>} Created line item with ID
 * @throws {Error} If invoice not found or validation fails
 */
export async function createLine(invoiceId, data = {}) {
  // Validate invoiceId exists
  const invoice = await invoiceDB.getById(invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Validate line data
  const validation = validateLineData(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Create line with auto-incrementing line number and default matchStatus
  const lineData = {
    ...data,
    invoiceId,
    matchStatus: MATCH_STATUS.UNMATCHED
  };

  // Let the DB layer handle line number auto-increment
  const id = await invoiceLineDB.create(lineData);

  // Fetch and return the created line
  const createdLine = await invoiceLineDB.getById(id);
  return createdLine;
}

/**
 * Update an existing invoice line item
 *
 * @param {number} id - Line item ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated line item
 * @throws {Error} If line not found or validation fails
 */
export async function updateLine(id, data) {
  // Fetch existing line
  const existingLine = await invoiceLineDB.getById(id);
  if (!existingLine) {
    throw new Error('Invoice line item not found');
  }

  // Validate changes
  const validation = validateLineData(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Prevent updating already-applied lines (except for notes)
  if (existingLine.addedToInventory) {
    const allowedFields = ['notes', 'discrepancyNotes'];
    const attemptedFields = Object.keys(data);
    const disallowedFields = attemptedFields.filter(f => !allowedFields.includes(f));

    if (disallowedFields.length > 0) {
      throw new Error('Cannot update line item that has already been applied to inventory');
    }
  }

  // Update the line
  await invoiceLineDB.update(id, data);

  // Return updated line
  return await invoiceLineDB.getById(id);
}

/**
 * Delete an invoice line item
 *
 * @param {number} id - Line item ID
 * @returns {Promise<{ deleted: boolean, renumbered: number }>}
 * @throws {Error} If line not found or already applied
 */
export async function deleteLine(id) {
  // Fetch existing line
  const existingLine = await invoiceLineDB.getById(id);
  if (!existingLine) {
    throw new Error('Invoice line item not found');
  }

  // Check not already applied to inventory
  if (existingLine.addedToInventory) {
    throw new Error('Cannot delete line item that has already been applied to inventory');
  }

  const invoiceId = existingLine.invoiceId;
  const deletedLineNumber = existingLine.lineNumber;

  // Delete the line
  await invoiceLineDB.delete(id);

  // Renumber remaining lines
  const remainingLines = await invoiceLineDB.getByInvoice(invoiceId);
  let renumbered = 0;

  for (const line of remainingLines) {
    if (line.lineNumber > deletedLineNumber) {
      await invoiceLineDB.update(line.id, {
        lineNumber: line.lineNumber - 1
      });
      renumbered++;
    }
  }

  return { deleted: true, renumbered };
}

// ============================================
// Query Operations
// ============================================

/**
 * Get all line items for an invoice
 *
 * @param {number} invoiceId - Invoice ID
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeItemInfo=true] - Include matched item info
 * @returns {Promise<Object[]>} Line items sorted by lineNumber
 */
export async function getLinesByInvoice(invoiceId, { includeItemInfo = true } = {}) {
  // Fetch lines sorted by lineNumber (DB layer handles sorting)
  const lines = await invoiceLineDB.getByInvoice(invoiceId);

  if (!includeItemInfo) {
    return lines;
  }

  // Enrich with matched item info
  const enrichedLines = await Promise.all(lines.map(async (line) => {
    if (line.inventoryItemId) {
      const item = await inventoryItemDB.getById(line.inventoryItemId);
      if (item) {
        return {
          ...line,
          matchedItem: {
            id: item.id,
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            currentPrice: item.currentPrice,
            currentStock: item.currentStock,
            vendorName: item.vendorName
          }
        };
      }
    }
    return line;
  }));

  return enrichedLines;
}

// ============================================
// Matching Operations
// ============================================

/**
 * Manually match a line item to an inventory item
 *
 * @param {number} lineId - Line item ID
 * @param {number} inventoryItemId - Inventory item ID to match
 * @param {Object} [options] - Options
 * @param {string} [options.matchedBy] - User ID who made the match
 * @param {string} [options.notes] - Match notes
 * @returns {Promise<Object>} Updated line item
 * @throws {Error} If line or item not found
 */
export async function matchLineToItem(lineId, inventoryItemId, { matchedBy = 'user', notes = '' } = {}) {
  // Validate line exists
  const line = await invoiceLineDB.getById(lineId);
  if (!line) {
    throw new Error('Invoice line item not found');
  }

  // Check not already applied
  if (line.addedToInventory) {
    throw new Error('Cannot change match for line already applied to inventory');
  }

  // Validate inventory item exists
  const item = await inventoryItemDB.getById(inventoryItemId);
  if (!item) {
    throw new Error('Inventory item not found');
  }

  // Calculate confidence for manual match
  const confidence = calculateMatchConfidence(line.rawDescription || line.description, item);

  // Update line with match info
  await invoiceLineDB.setMatch(lineId, inventoryItemId, {
    confidence: Math.max(confidence, 100), // Manual match is always 100% confident
    matchedBy,
    notes
  });

  // Override status to manual_matched
  await invoiceLineDB.update(lineId, {
    matchStatus: MATCH_STATUS.MANUAL_MATCHED,
    matchedAt: new Date().toISOString()
  });

  return await invoiceLineDB.getById(lineId);
}

/**
 * Auto-match a line item to inventory
 *
 * Searches inventory items based on the line's description
 * and auto-matches if confidence exceeds threshold.
 *
 * @param {number} lineId - Line item ID
 * @param {Object} [options] - Options
 * @param {number} [options.confidenceThreshold] - Minimum confidence for auto-match
 * @returns {Promise<{ matched: boolean, item?: Object, confidence: number, candidates?: Object[] }>}
 */
export async function autoMatchLine(lineId, { confidenceThreshold = AUTO_MATCH_CONFIDENCE_THRESHOLD } = {}) {
  // Get line
  const line = await invoiceLineDB.getById(lineId);
  if (!line) {
    throw new Error('Invoice line item not found');
  }

  // Check not already applied
  if (line.addedToInventory) {
    return {
      matched: false,
      confidence: 0,
      error: 'Line already applied to inventory'
    };
  }

  // Get description to search
  const searchQuery = line.rawDescription || line.description;
  if (!searchQuery) {
    return {
      matched: false,
      confidence: 0,
      candidates: []
    };
  }

  // Search inventory items
  const searchResults = await searchItems(searchQuery, { limit: 10, activeOnly: true });

  if (searchResults.length === 0) {
    return {
      matched: false,
      confidence: 0,
      candidates: []
    };
  }

  // Calculate confidence for each result
  const candidatesWithConfidence = searchResults.map(item => ({
    inventoryItemId: item.id,
    name: item.name,
    sku: item.sku,
    vendorName: item.vendorName,
    score: calculateMatchConfidence(searchQuery, item)
  }));

  // Sort by confidence
  candidatesWithConfidence.sort((a, b) => b.score - a.score);

  // Store candidates for review
  await invoiceLineDB.setMatchCandidates(lineId, candidatesWithConfidence.slice(0, 5));

  // Get best match
  const bestMatch = candidatesWithConfidence[0];

  // Check if confidence meets threshold
  if (bestMatch.score >= confidenceThreshold) {
    // Get the full item
    const matchedItem = await inventoryItemDB.getById(bestMatch.inventoryItemId);

    // Apply auto-match
    await invoiceLineDB.setMatch(lineId, bestMatch.inventoryItemId, {
      confidence: bestMatch.score,
      matchedBy: 'ai',
      notes: `Auto-matched with ${bestMatch.score}% confidence`
    });

    return {
      matched: true,
      item: matchedItem,
      confidence: bestMatch.score,
      candidates: candidatesWithConfidence.slice(1, 5)
    };
  }

  // Update status to show it needs review
  await invoiceLineDB.update(lineId, {
    matchConfidence: bestMatch.score
  });

  return {
    matched: false,
    confidence: bestMatch.score,
    candidates: candidatesWithConfidence
  };
}

/**
 * Remove match from a line item
 *
 * @param {number} lineId - Line item ID
 * @returns {Promise<Object>} Updated line item
 * @throws {Error} If line not found or already applied
 */
export async function unmatchLine(lineId) {
  // Get line
  const line = await invoiceLineDB.getById(lineId);
  if (!line) {
    throw new Error('Invoice line item not found');
  }

  // Check not already applied
  if (line.addedToInventory) {
    throw new Error('Cannot unmatch line that has already been applied to inventory');
  }

  // Clear match info
  await invoiceLineDB.update(lineId, {
    inventoryItemId: null,
    matchStatus: MATCH_STATUS.UNMATCHED,
    matchConfidence: 0,
    matchedBy: null,
    matchedAt: null,
    matchNotes: ''
  });

  return await invoiceLineDB.getById(lineId);
}

// ============================================
// Inventory Integration
// ============================================

/**
 * Create a new inventory item from a line item
 *
 * Creates a new inventory item using the line's data and
 * automatically matches the line to the new item.
 *
 * @param {number} lineId - Line item ID
 * @param {Object} [additionalData] - Additional item data
 * @param {string} [additionalData.category] - Item category
 * @param {number} [additionalData.parLevel] - Par level
 * @param {number} [additionalData.reorderPoint] - Reorder point
 * @param {string} [additionalData.createdBy] - User ID
 * @returns {Promise<{ item: Object, line: Object }>}
 * @throws {Error} If line not found or already matched
 */
export async function createItemFromLine(lineId, additionalData = {}) {
  // Get line
  const line = await invoiceLineDB.getById(lineId);
  if (!line) {
    throw new Error('Invoice line item not found');
  }

  // Check not already matched
  if (line.inventoryItemId) {
    throw new Error('Line item is already matched to an inventory item');
  }

  // Get invoice for vendor info
  const invoice = await invoiceDB.getById(line.invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Get vendor info
  let vendorId = invoice.vendorId;
  let vendorName = invoice.vendorName;

  if (!vendorId) {
    throw new Error('Invoice does not have a vendor assigned');
  }

  // Get vendor if name not on invoice
  if (!vendorName && vendorId) {
    const vendor = await vendorDB.getById(vendorId);
    if (vendor) {
      vendorName = vendor.name;
    }
  }

  // Parse unit string to extract purchase quantity/unit
  const rawUnit = line.unit || line.rawUnit || 'ea';
  const parsedUnit = parseUnitString(rawUnit);

  // Try to extract weight from item name (e.g., "HUILE 500ML" → 500ml)
  const itemName = line.description || line.rawDescription || '';
  const extractedWeight = extractWeightFromName(itemName);

  // Calculate pricePerG or pricePerML if we have weight info
  let pricePerG = null;
  let pricePerML = null;
  const unitPrice = line.unitPrice || 0;

  if (extractedWeight && unitPrice > 0) {
    // Calculate normalized price per gram/ml
    if (extractedWeight.isVolume) {
      pricePerML = unitPrice / extractedWeight.valueInGrams; // valueInGrams is actually ml for volumes
      pricePerML = Math.round(pricePerML * 1000000) / 1000000; // 6 decimal precision
    } else {
      pricePerG = unitPrice / extractedWeight.valueInGrams;
      pricePerG = Math.round(pricePerG * 1000000) / 1000000;
    }
    console.log(`[InvoiceLineService] Auto-extracted weight from "${itemName}": ${extractedWeight.original} → pricePerG: ${pricePerG}, pricePerML: ${pricePerML}`);
  } else if (parsedUnit.baseGrams && unitPrice > 0) {
    // Fall back to parsed unit if no weight in name
    pricePerG = unitPrice / parsedUnit.baseGrams;
    pricePerG = Math.round(pricePerG * 1000000) / 1000000;
    console.log(`[InvoiceLineService] Calculated from unit "${rawUnit}": pricePerG: ${pricePerG}`);
  }

  // Create inventory item data
  const itemData = {
    name: itemName,
    sku: line.sku || line.rawSku || '',
    unit: rawUnit, // Keep original unit for display
    vendorId,
    vendorName,
    currentPrice: unitPrice,
    category: additionalData.category || line.category || 'Other',
    parLevel: additionalData.parLevel,
    reorderPoint: additionalData.reorderPoint,
    createdBy: additionalData.createdBy,
    // Add normalized price fields
    ...(pricePerG !== null && { pricePerG }),
    ...(pricePerML !== null && { pricePerML }),
    // Add structured purchase fields if parsed successfully
    ...(parsedUnit.purchaseQty && {
      purchaseQty: parsedUnit.purchaseQty,
      purchaseUnit: parsedUnit.purchaseUnit,
      packageSize: parsedUnit.purchaseQty,
      packageUnit: parsedUnit.purchaseUnit,
    }),
    // Store extracted weight info
    ...(extractedWeight && {
      weightPerUnit: extractedWeight.value,
      weightPerUnitUnit: extractedWeight.unit,
    })
  };

  // Create the inventory item
  const item = await createInventoryItem(itemData, { createInitialTransaction: false });

  // Update line with match to new item and extracted weight info
  await invoiceLineDB.update(lineId, {
    inventoryItemId: item.id,
    matchStatus: MATCH_STATUS.NEW_ITEM,
    matchedBy: additionalData.createdBy || 'user',
    matchedAt: new Date().toISOString(),
    matchNotes: 'Created new inventory item',
    // Store extracted weight and calculated prices on line item too (source of truth)
    ...(extractedWeight && {
      weightPerUnit: extractedWeight.value,
      weightPerUnitUnit: extractedWeight.unit,
      weight: extractedWeight.valueInGrams,
      weightUnit: extractedWeight.isVolume ? 'ml' : 'g',
    }),
    ...(pricePerG !== null && { pricePerG }),
    ...(pricePerML !== null && { pricePerML }),
  });

  // Get updated line
  const updatedLine = await invoiceLineDB.getById(lineId);

  return { item, line: updatedLine };
}

/**
 * Apply a line item to inventory (add stock)
 *
 * @param {number} lineId - Line item ID
 * @param {Object} [options] - Options
 * @param {string} [options.appliedBy] - User ID
 * @returns {Promise<{ item: Object, transaction: Object }>}
 * @throws {Error} If line not matched or already applied
 */
export async function applyLineToInventory(lineId, { appliedBy = null } = {}) {
  // Get line
  const line = await invoiceLineDB.getById(lineId);
  if (!line) {
    throw new Error('Invoice line item not found');
  }

  // DEBUG: Log entire line object to see what fields exist
  console.log(`[InvoiceLineService] ═══════════════════════════════════════════`);
  console.log(`[InvoiceLineService] LINE DATA FROM DB:`, JSON.stringify({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    weight: line.weight,
    weightPerUnit: line.weightPerUnit,
    totalWeight: line.totalWeight,
    packCount: line.packCount,
    packWeight: line.packWeight,
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice
  }, null, 2));
  console.log(`[InvoiceLineService] ═══════════════════════════════════════════`);

  // Validate line is matched
  if (!line.inventoryItemId) {
    throw new Error('Line item must be matched to an inventory item before applying');
  }

  // Validate not already applied
  if (line.addedToInventory) {
    throw new Error('Line item has already been applied to inventory');
  }

  // Get matched item
  const item = await inventoryItemDB.getById(line.inventoryItemId);
  if (!item) {
    throw new Error('Matched inventory item not found');
  }

  const previousStock = item.currentStock || 0;

  // ═══════════════════════════════════════════════════════════════════════
  // Calculate stock quantity based on item type and line data
  //
  // For pack formats like "Sac 50lb" with quantity 2:
  //   - line.quantity = 2 (bags)
  //   - line.totalWeight or line.weight = 100 (total weight)
  //   - OR line.weightPerUnit = 50 (per unit weight)
  //
  // Use the TOTAL value (weight or count) for stock, not just the quantity.
  // ═══════════════════════════════════════════════════════════════════════
  let stockQuantity = line.quantity;
  let stockWeight = null;

  // Priority 1: Use totalWeight if available (calculated from pack format)
  if (line.totalWeight != null && line.totalWeight > 0) {
    stockWeight = line.totalWeight;
    console.log(`[InvoiceLineService] Using totalWeight: ${stockWeight}`);
  }
  // Priority 2: Use weight field if available
  else if (line.weight != null && line.weight > 0) {
    stockWeight = line.weight;
    console.log(`[InvoiceLineService] Using weight: ${stockWeight}`);
  }
  // Priority 3: Calculate from quantity × weightPerUnit
  else if (line.weightPerUnit != null && line.weightPerUnit > 0 && line.quantity > 0) {
    stockWeight = line.quantity * line.weightPerUnit;
    console.log(`[InvoiceLineService] Calculated weight: ${line.quantity} × ${line.weightPerUnit} = ${stockWeight}`);
  }
  // Priority 4: Calculate from quantity × packCount × packWeight (4/5LB format)
  else if (line.packCount != null && line.packWeight != null && line.quantity > 0) {
    stockWeight = line.quantity * line.packCount * line.packWeight;
    console.log(`[InvoiceLineService] Pack weight: ${line.quantity} × ${line.packCount} × ${line.packWeight} = ${stockWeight}`);
  }

  // Use weight for stock if item is weight-based, otherwise use quantity
  const isWeightBased = item.unit?.toLowerCase()?.match(/^(lb|lbs|kg|g|oz)$/i) ||
                        item.stockWeightUnit?.toLowerCase()?.match(/^(lb|lbs|kg|g|oz)$/i);
  const finalStockQty = (isWeightBased && stockWeight != null) ? stockWeight : stockQuantity;

  console.log(`[InvoiceLineService] Applying to inventory: item=${item.name}, qty=${stockQuantity}, weight=${stockWeight}, final=${finalStockQty}, unit=${item.unit}, isWeightBased=${!!isWeightBased}`);

  // Add stock from invoice with dual tracking
  // - unitQuantity: number of units (e.g., 2 sacs)
  // - totalWeight: total weight (e.g., 100lb for 2×50lb sacs)
  const transaction = await addStockFromInvoice(
    line.inventoryItemId,
    finalStockQty,
    line.invoiceId,
    {
      invoiceLineId: lineId,
      unitCost: line.unitPrice,
      createdBy: appliedBy,
      // Dual stock tracking
      unitQuantity: stockQuantity,  // Unit count (e.g., 2 sacs)
      totalWeight: stockWeight      // Total weight (e.g., 100lb)
    }
  );

  // Update line with application info
  await invoiceLineDB.update(lineId, {
    addedToInventory: true,
    addedToInventoryAt: new Date().toISOString(),
    addedToInventoryBy: appliedBy,
    previousStock,
    newStock: transaction.newStock,
    previousPrice: item.currentPrice,
    newPrice: line.unitPrice
  });

  // If line was auto-matched, confirm it
  if (line.matchStatus === MATCH_STATUS.AUTO_MATCHED) {
    await invoiceLineDB.update(lineId, {
      matchStatus: MATCH_STATUS.CONFIRMED
    });
  }

  // Get updated item
  const updatedItem = await inventoryItemDB.getById(line.inventoryItemId);

  return {
    item: updatedItem,
    transaction
  };
}

/**
 * Bulk apply all matched lines of an invoice to inventory
 *
 * Wraps all updates in a transaction for atomicity.
 *
 * @param {number} invoiceId - Invoice ID
 * @param {Object} [options] - Options
 * @param {string} [options.appliedBy] - User ID
 * @param {boolean} [options.skipUnmatched=false] - Skip unmatched lines (default: false, treat as errors)
 * @returns {Promise<{ applied: Object[], skipped: Object[], errors: Object[] }>}
 */
export async function bulkApplyLinesToInventory(invoiceId, { appliedBy = null, skipUnmatched = false } = {}) {
  // Get all lines for invoice
  const lines = await invoiceLineDB.getByInvoice(invoiceId);

  const applied = [];
  const skipped = [];
  const errors = [];

  // Use a transaction for atomicity
  await db.transaction('rw', [db.invoiceLineItems, db.inventoryItems, db.stockTransactions], async () => {
    for (const line of lines) {
      // Skip if already applied
      if (line.addedToInventory) {
        skipped.push({
          lineId: line.id,
          lineNumber: line.lineNumber,
          reason: 'Already applied'
        });
        continue;
      }

      // Skip if not matched (if skipUnmatched is true)
      if (!line.inventoryItemId) {
        if (skipUnmatched) {
          skipped.push({
            lineId: line.id,
            lineNumber: line.lineNumber,
            reason: 'Not matched to inventory item'
          });
        } else {
          errors.push({
            lineId: line.id,
            lineNumber: line.lineNumber,
            error: 'Line must be matched before applying'
          });
        }
        continue;
      }

      // Apply the line
      try {
        const result = await applyLineToInventory(line.id, { appliedBy });
        applied.push({
          lineId: line.id,
          lineNumber: line.lineNumber,
          inventoryItemId: line.inventoryItemId,
          previousStock: result.transaction.previousStock,
          newStock: result.transaction.newStock,
          quantity: line.quantity
        });
      } catch (error) {
        errors.push({
          lineId: line.id,
          lineNumber: line.lineNumber,
          error: error.message
        });
      }
    }
  });

  // Update invoice status if all lines applied
  if (applied.length > 0 && errors.length === 0) {
    const allLines = await invoiceLineDB.getByInvoice(invoiceId);
    const allApplied = allLines.every(l => l.addedToInventory || !l.inventoryItemId);

    if (allApplied) {
      await invoiceDB.update(invoiceId, {
        status: 'completed',
        processedAt: new Date().toISOString()
      });
    }
  }

  return { applied, skipped, errors };
}

// ============================================
// Batch Operations
// ============================================

/**
 * Auto-match all unmatched lines in an invoice
 *
 * @param {number} invoiceId - Invoice ID
 * @param {Object} [options] - Options
 * @param {number} [options.confidenceThreshold] - Minimum confidence
 * @returns {Promise<{ matched: Object[], unmatched: Object[] }>}
 */
export async function autoMatchInvoiceLines(invoiceId, { confidenceThreshold = AUTO_MATCH_CONFIDENCE_THRESHOLD } = {}) {
  const lines = await invoiceLineDB.getByInvoice(invoiceId);
  const matched = [];
  const unmatched = [];

  for (const line of lines) {
    // Skip if already matched or applied
    if (line.inventoryItemId || line.addedToInventory) {
      continue;
    }

    const result = await autoMatchLine(line.id, { confidenceThreshold });

    if (result.matched) {
      matched.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        itemId: result.item.id,
        itemName: result.item.name,
        confidence: result.confidence
      });
    } else {
      unmatched.push({
        lineId: line.id,
        lineNumber: line.lineNumber,
        description: line.description || line.rawDescription,
        bestConfidence: result.confidence,
        candidates: result.candidates?.slice(0, 3)
      });
    }
  }

  return { matched, unmatched };
}

/**
 * Get summary statistics for an invoice's line items
 *
 * @param {number} invoiceId - Invoice ID
 * @returns {Promise<Object>} Summary statistics
 */
export async function getLinesSummary(invoiceId) {
  return await invoiceLineDB.getInvoiceSummary(invoiceId);
}

// ============================================
// Default Export
// ============================================

export default {
  // Constants
  AUTO_MATCH_CONFIDENCE_THRESHOLD,
  MATCH_STATUS,

  // Validation
  validateLineData,
  calculateMatchConfidence,

  // CRUD
  createLine,
  updateLine,
  deleteLine,
  getLinesByInvoice,

  // Matching
  matchLineToItem,
  autoMatchLine,
  unmatchLine,

  // Inventory Integration
  createItemFromLine,
  applyLineToInventory,
  bulkApplyLinesToInventory,

  // Batch Operations
  autoMatchInvoiceLines,
  getLinesSummary
};
