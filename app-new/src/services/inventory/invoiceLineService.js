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
import { getHandler, getHandlerForCategory } from '../invoice/handlers';

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
            stockQuantity: item.stockQuantity,
            stockWeight: item.stockWeight,
            currentPrice: item.currentPrice,
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
 * Uses invoice type handlers to ensure correct calculations:
 * - Food supply: calculates pricePerG, weight tracking
 * - Packaging: calculates containerUnitsStock, NO pricePerG
 * - Generic: basic item creation
 *
 * @param {number} lineId - Line item ID
 * @param {Object} [additionalData] - Additional item data
 * @param {string} [additionalData.category] - Item category
 * @param {number} [additionalData.parQuantity] - Par quantity level
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
  const vendorId = invoice.vendorId;
  if (!vendorId) {
    throw new Error('Invoice does not have a vendor assigned');
  }

  // Get full vendor object (includes parsingProfile with invoiceType)
  const vendor = await vendorDB.getById(vendorId);
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Get the appropriate handler based on vendor's invoice type
  const handler = getHandlerForVendor(vendor);
  const invoiceType = handler.type;

  // Build line item object for handler
  const lineItem = {
    description: line.description || line.rawDescription || '',
    name: line.description || line.rawDescription || '',
    rawDescription: line.rawDescription,
    itemCode: line.sku || line.rawSku || '',
    quantity: line.quantity || 1,
    unit: line.unit || line.rawUnit || 'ea',
    unitPrice: line.unitPrice || 0,
    total: line.totalPrice || (line.unitPrice * line.quantity),
    totalPrice: line.totalPrice || (line.unitPrice * line.quantity),
    // Boxing format from wizard column mapping: boxingFormat > format > packagingFormat
    boxingFormat: line.boxingFormat || null,
    format: line.boxingFormat || line.format || line.packagingFormat || null,
    weight: line.weight,
    weightUnit: line.weightUnit,
    category: additionalData.category || line.category || null,
  };

  // Call handler's createInventoryItem - handles type-specific calculations
  const handlerResult = handler.createInventoryItem(lineItem, vendor, {
    invoiceId: line.invoiceId,
    invoiceDate: invoice.invoiceDate
  });

  // Merge handler result with additional data
  const itemData = {
    ...handlerResult.item,
    // Override with any additional data provided
    ...(additionalData.category && { category: additionalData.category }),
    ...(additionalData.parQuantity !== undefined && { parQuantity: additionalData.parQuantity }),
    ...(additionalData.reorderPoint !== undefined && { reorderPoint: additionalData.reorderPoint }),
    createdBy: additionalData.createdBy,
  };

  // Create the inventory item
  const item = await createInventoryItem(itemData, { createInitialTransaction: false });

  // Build line update based on invoice type
  const lineUpdate = {
    inventoryItemId: item.id,
    matchStatus: MATCH_STATUS.NEW_ITEM,
    matchedBy: additionalData.createdBy || 'user',
    matchedAt: new Date().toISOString(),
    matchNotes: `Created new inventory item (${handler.label})`,
  };

  // Add type-specific fields to line update
  if (handlerResult.item.pricePerG != null) {
    lineUpdate.pricePerG = handlerResult.item.pricePerG;
  }
  if (handlerResult.item.pricePerML != null) {
    lineUpdate.pricePerML = handlerResult.item.pricePerML;
  }
  if (handlerResult.item.receivedWeight != null) {
    lineUpdate.weight = handlerResult.item.receivedWeight;
    lineUpdate.weightUnit = handlerResult.item.weightUnit;
  }
  if (handlerResult.item.containerUnitsStock != null) {
    lineUpdate.containerUnitsStock = handlerResult.item.containerUnitsStock;
  }
  if (handlerResult.item.totalUnitsPerCase != null) {
    lineUpdate.totalUnitsPerCase = handlerResult.item.totalUnitsPerCase;
  }

  // Update line with match info
  await invoiceLineDB.update(lineId, lineUpdate);

  // Get updated line
  const updatedLine = await invoiceLineDB.getById(lineId);

  return { item, line: updatedLine };
}

/**
 * Apply a line item to inventory (add stock)
 *
 * Uses invoice type handlers to ensure correct calculations:
 * - Food supply: weight-based stock tracking, pricePerG updates
 * - Packaging: containerUnitsStock tracking, NO weight calculations
 * - Generic: quantity-based stock tracking
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

  // Validate line is matched
  if (!line.inventoryItemId) {
    throw new Error('Line item must be matched to an inventory item before applying');
  }

  // Validate not already applied
  if (line.addedToInventory) {
    throw new Error('Line item has already been applied to inventory');
  }

  // Get matched item
  const existingItem = await inventoryItemDB.getById(line.inventoryItemId);
  if (!existingItem) {
    throw new Error('Matched inventory item not found');
  }

  // Get invoice for vendor info
  const invoice = await invoiceDB.getById(line.invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Get vendor (includes parsingProfile with invoiceType)
  const vendor = await vendorDB.getById(invoice.vendorId);
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Get the appropriate handler based on vendor's invoice type
  const handler = getHandlerForVendor(vendor);

  // Build line item object for handler
  const lineItem = {
    description: line.description || line.rawDescription || '',
    name: line.description || line.rawDescription || '',
    rawDescription: line.rawDescription,
    itemCode: line.sku || line.rawSku || '',
    quantity: line.quantity || 1,
    unit: line.unit || line.rawUnit || 'ea',
    unitPrice: line.unitPrice || 0,
    total: line.totalPrice || (line.unitPrice * line.quantity),
    totalPrice: line.totalPrice || (line.unitPrice * line.quantity),
    // Boxing format from wizard column mapping: boxingFormat > format > packagingFormat
    boxingFormat: line.boxingFormat || null,
    format: line.boxingFormat || line.format || line.packagingFormat || null,
    weight: line.weight,
    weightUnit: line.weightUnit,
    totalWeight: line.totalWeight,
    weightPerUnit: line.weightPerUnit,
    packCount: line.packCount,
    packWeight: line.packWeight,
    category: line.category,
  };

  // Call handler's updateInventoryItem - handles type-specific calculations
  const handlerResult = handler.updateInventoryItem(existingItem, lineItem, vendor, {
    invoiceId: line.invoiceId,
    invoiceDate: invoice.invoiceDate
  });

  // Update price history for audit trail
  const priceQty = line.weight || line.quantity || 1;
  await inventoryItemDB.updatePriceFromInvoice(
    line.inventoryItemId,
    line.unitPrice || 0,
    { quantity: priceQty, invoiceId: line.invoiceId, purchaseDate: invoice.invoiceDate }
  );

  // Determine stock values based on handler updates
  const previousStockQty = existingItem.stockQuantity || 0;
  const previousStockWeight = existingItem.stockWeight || 0;
  const rawFormat = line.format || line.packagingFormat || existingItem.packagingFormat || null;

  // Extract stock tracking values from handler result
  let stockQuantity = line.quantity;
  let stockWeight = null;
  let stockUnits = null;
  let stockLength = null;

  // For packaging: use stockQuantity (base units)
  if (handlerResult.updates.stockQuantity != null && handler.type === 'packagingDistributor') {
    // The handler calculates the NEW total, we need the delta
    stockUnits = handlerResult.updates.stockQuantity - previousStockQty;
    stockQuantity = stockUnits;
  }
  // For food supply: use weight if available
  else if (handlerResult.updates.stockWeight != null || handlerResult.updates.receivedWeight != null) {
    stockWeight = handlerResult.updates.receivedWeight ||
                  (handlerResult.updates.stockWeight - (existingItem.stockWeight || 0));
  }
  // For rolls: track length
  else if (handlerResult.updates.rollsPerCase != null) {
    stockQuantity = line.quantity * (handlerResult.updates.rollsPerCase || 1);
    if (handlerResult.updates.totalLength) {
      const existingLength = existingItem.totalLength || 0;
      stockLength = handlerResult.updates.totalLength - existingLength;
    }
  }

  // Determine final stock quantity
  const isWeightBased = existingItem.pricingType === 'weight' ||
                        existingItem.stockWeightUnit?.toLowerCase()?.match(/^(lb|lbs|kg|g|oz)$/i);
  const finalStockQty = stockUnits != null ? stockUnits :
                        (isWeightBased && stockWeight != null) ? stockWeight :
                        stockQuantity;

  // Add stock from invoice
  const transaction = await addStockFromInvoice(
    line.inventoryItemId,
    finalStockQty,
    line.invoiceId,
    {
      invoiceLineId: lineId,
      unitCost: line.unitPrice,
      createdBy: appliedBy,
      // Dual stock tracking
      unitQuantity: line.quantity,
      totalWeight: stockWeight,
      // Container format tracking
      containerUnits: stockUnits,
      boxingFormat: rawFormat,
      totalLength: stockLength
    }
  );

  // Apply handler updates to inventory item (price, format info, etc.)
  // Filter out stock fields that are managed by addStockFromInvoice
  const itemUpdates = { ...handlerResult.updates };
  delete itemUpdates.stockQuantity; // Managed by addStockFromInvoice
  delete itemUpdates.stockWeight;   // Managed by addStockFromInvoice

  // Track previous prices for price variation display in recipes
  if (itemUpdates.pricePerG != null && existingItem.pricePerG != null) {
    itemUpdates.previousPricePerG = existingItem.pricePerG;
  }
  if (itemUpdates.pricePerKg != null && existingItem.pricePerKg != null) {
    itemUpdates.previousPricePerKg = existingItem.pricePerKg;
  }
  if (itemUpdates.pricePerLb != null && existingItem.pricePerLb != null) {
    itemUpdates.previousPricePerLb = existingItem.pricePerLb;
  }
  if (itemUpdates.pricePerML != null && existingItem.pricePerML != null) {
    itemUpdates.previousPricePerML = existingItem.pricePerML;
  }
  if (itemUpdates.pricePerL != null && existingItem.pricePerL != null) {
    itemUpdates.previousPricePerL = existingItem.pricePerL;
  }
  if (itemUpdates.pricePerUnit != null && existingItem.pricePerUnit != null) {
    itemUpdates.previousPricePerUnit = existingItem.pricePerUnit;
  }

  if (Object.keys(itemUpdates).length > 0) {
    await inventoryItemDB.update(line.inventoryItemId, itemUpdates);
  }

  // Update line with application info
  const lineUpdate = {
    addedToInventory: true,
    addedToInventoryAt: new Date().toISOString(),
    addedToInventoryBy: appliedBy,
    previousStock,
    newStock: transaction.newStock,
    previousPrice: existingItem.currentPrice,
    newPrice: line.unitPrice
  };

  // Add type-specific fields from handler
  if (handlerResult.updates.pricePerG != null) {
    lineUpdate.pricePerG = handlerResult.updates.pricePerG;
  }
  if (handlerResult.updates.containerUnitsStock != null) {
    lineUpdate.containerUnitsStock = handlerResult.updates.containerUnitsStock;
  }
  if (handlerResult.updates.totalUnitsPerCase != null) {
    lineUpdate.totalUnitsPerCase = handlerResult.updates.totalUnitsPerCase;
  }

  await invoiceLineDB.update(lineId, lineUpdate);

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

  // Dispatch event to notify recipe views that inventory was updated
  if (applied.length > 0) {
    window.dispatchEvent(new CustomEvent('inventory-updated', {
      detail: { applied, invoiceId }
    }));
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
// Batch Inventory Processing
// ============================================

/**
 * Process line items into inventory - creates or updates inventory items.
 * Uses handlers for type-specific logic (weight extraction, pricePerG, etc.)
 *
 * This function is called after invoice lines are saved to DB.
 * It handles both new items (create) and existing items (update).
 *
 * Each line's AI-assigned category determines its handler (food → foodSupplyHandler,
 * packaging → packagingHandler, etc.). Uncategorized lines use genericHandler.
 *
 * @param {Object} options - Processing options
 * @param {Array} options.lineItems - Line items to process (with handler-calculated fields)
 * @param {Array} options.lineItemIds - Corresponding DB line item IDs
 * @param {Object} options.vendor - { id, name }
 * @param {string} options.invoiceId - Invoice ID
 * @param {string} options.invoiceDate - Invoice date
 * @returns {Promise<{ created: number, updated: number, errors: string[] }>}
 */
export async function processLinesToInventory({
  lineItems,
  lineItemIds,
  vendor,
  invoiceId,
  invoiceDate
}) {
  const now = new Date().toISOString();

  // Fallback for uncategorized lines (rare - AI categorizes most lines)
  const fallbackHandler = getHandler('generic');

  // Helper to get handler for a line item based on category
  const getLineHandler = (item) => {
    if (item.category) {
      return getHandlerForCategory(item.category);
    }
    return fallbackHandler;
  };

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const lineItemId = lineItemIds[i];
    const itemName = item.name || item.description;

    if (!itemName) {
      errors.push(`Line ${i + 1}: Missing item name`);
      continue;
    }

    try {
      // Check if inventory item exists (by vendor + name)
      let existingItem = null;
      if (vendor.id) {
        existingItem = await inventoryItemDB.getByVendorAndName(vendor.id, itemName);
      }

      if (existingItem) {
        // UPDATE existing item using handler (per-line category routing)
        const lineHandler = getLineHandler(item);
        const { updates, warnings, previousValues } = lineHandler.updateInventoryItem(
          existingItem,
          item,
          vendor,
          { invoiceId, invoiceDate }
        );

        // Update price history
        const priceQty = item.weightInGrams || item.weight || item.quantity || 1;
        await inventoryItemDB.updatePriceFromInvoice(
          existingItem.id,
          item.unitPrice || 0,
          { quantity: priceQty, invoiceId, purchaseDate: invoiceDate }
        );

        // Calculate stock delta for transaction
        const stockDelta = (updates.stockQuantity || 0) - (previousValues?.stockQuantity || existingItem.stockQuantity || 0);
        const weightDelta = updates.receivedWeight ||
                           ((updates.stockWeight || 0) - (existingItem.stockWeight || 0));

        // Create stock transaction for audit trail
        if (stockDelta !== 0 || weightDelta !== 0) {
          await addStockFromInvoice(
            existingItem.id,
            stockDelta || item.quantity || 1,
            invoiceId,
            {
              invoiceLineId: lineItemId,
              unitCost: item.unitPrice || 0,
              createdBy: 'system',
              unitQuantity: item.quantity,
              totalWeight: weightDelta || null,
              boxingFormat: item.format || null
            }
          );
        }

        // Apply updates (excluding stock fields managed by addStockFromInvoice)
        const itemUpdates = { ...updates };
        delete itemUpdates.stockQuantity;
        delete itemUpdates.stockWeight;

        // Track previous prices for price variation display in recipes
        if (itemUpdates.pricePerG != null && existingItem.pricePerG != null) {
          itemUpdates.previousPricePerG = existingItem.pricePerG;
        }
        if (itemUpdates.pricePerKg != null && existingItem.pricePerKg != null) {
          itemUpdates.previousPricePerKg = existingItem.pricePerKg;
        }
        if (itemUpdates.pricePerLb != null && existingItem.pricePerLb != null) {
          itemUpdates.previousPricePerLb = existingItem.pricePerLb;
        }
        if (itemUpdates.pricePerML != null && existingItem.pricePerML != null) {
          itemUpdates.previousPricePerML = existingItem.pricePerML;
        }
        if (itemUpdates.pricePerL != null && existingItem.pricePerL != null) {
          itemUpdates.previousPricePerL = existingItem.pricePerL;
        }
        if (itemUpdates.pricePerUnit != null && existingItem.pricePerUnit != null) {
          itemUpdates.previousPricePerUnit = existingItem.pricePerUnit;
        }

        await inventoryItemDB.update(existingItem.id, itemUpdates);

        // Update line item with inventory link
        if (lineItemId) {
          await invoiceLineDB.update(lineItemId, {
            inventoryItemId: existingItem.id,
            matchStatus: MATCH_STATUS.AUTO_MATCHED,
            matchConfidence: 100,
            matchedBy: 'system',
            matchedAt: now,
            addedToInventory: true,
            addedToInventoryAt: now,
            addedToInventoryBy: 'system',
            previousPrice: previousValues?.price,
            newPrice: item.unitPrice || 0,
            previousStockQuantity: previousValues?.stockQuantity || existingItem.stockQuantity,
            newStockQuantity: updates.stockQuantity
          });
        }

        updated++;
      } else {
        // CREATE new item using handler (per-line category routing)
        const lineHandler = getLineHandler(item);
        const { item: newItemData, warnings } = lineHandler.createInventoryItem(
          item,
          vendor,
          { invoiceId, invoiceDate }
        );

        const newItemId = await inventoryItemDB.create(newItemData);

        // Record initial stock transaction for audit trail
        // skipStockUpdate=true because handler already set stock values in newItemData
        const initialStock = newItemData.stockQuantity || newItemData.stockWeight || item.quantity || 1;
        await addStockFromInvoice(
          newItemId,
          initialStock,
          invoiceId,
          {
            invoiceLineId: lineItemId,
            unitCost: item.unitPrice || 0,
            createdBy: 'system',
            skipStockUpdate: true,  // Handler already set stock - just record transaction
            notes: 'Initial stock from invoice',
            // Option B fix: pass invoice values for accurate purchase statistics
            totalPrice: item.totalPrice,           // Invoice line total (validated)
            unitQuantity: item.quantity,           // Order units (cases/pieces)
            pricingType: item.pricingType || null  // 'weight' or 'unit'
          }
        );

        // Update line item with new inventory link
        if (lineItemId) {
          await invoiceLineDB.update(lineItemId, {
            inventoryItemId: newItemId,
            matchStatus: MATCH_STATUS.NEW_ITEM,
            matchConfidence: 100,
            matchedBy: 'system',
            matchedAt: now,
            addedToInventory: true,
            addedToInventoryAt: now,
            addedToInventoryBy: 'system',
            previousPrice: null,
            newPrice: item.unitPrice || 0,
            previousStockQuantity: null,
            newStockQuantity: newItemData.stockQuantity || newItemData.stockWeight
          });
        }

        created++;
      }
    } catch (err) {
      console.error(`[InvoiceLineService] Error processing ${itemName}:`, err);
      errors.push(`${itemName}: ${err.message}`);
    }
  }

  // Dispatch event to notify recipe views that inventory was updated
  if (created > 0 || updated > 0) {
    window.dispatchEvent(new CustomEvent('inventory-updated', {
      detail: { created, updated, invoiceId }
    }));
  }

  return { created, updated, errors };
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
  getLinesSummary,

  // Batch Inventory Processing
  processLinesToInventory
};
