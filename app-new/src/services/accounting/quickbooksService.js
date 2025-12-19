/**
 * QuickBooks Online Integration Service
 *
 * Handles OAuth flow, connection management, and API calls to QuickBooks
 * Uses Firebase Cloud Functions for production-ready OAuth handling
 * Supports both sandbox (testing) and production environments
 */

import { handleQBError, logError } from '../../utils/errorHandler';

// Cloud Functions base URL
const FUNCTIONS_BASE = 'https://us-central1-smartcookbook-2afe2.cloudfunctions.net';

// Default environment - stored in localStorage
const QB_ENV_KEY = 'qb_environment';

/**
 * Get current QuickBooks environment setting
 * @returns {'sandbox' | 'production'}
 */
export function getQBEnvironment() {
  return localStorage.getItem(QB_ENV_KEY) || 'sandbox';
}

/**
 * Set QuickBooks environment
 * @param {'sandbox' | 'production'} environment
 */
export function setQBEnvironment(environment) {
  localStorage.setItem(QB_ENV_KEY, environment);
}

/**
 * Get QuickBooks connection status
 * @param {string} environment - Optional override for environment
 */
export async function getQBStatus(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksStatus?environment=${env}`);
    return await response.json();
  } catch (error) {
    const appError = logError(error, 'checking QB status');
    return { connected: false, error: appError.userMessage };
  }
}

/**
 * Get QuickBooks token health and expiration warnings
 * Returns detailed token status including expiration warnings
 * @param {string} environment - Optional override for environment
 * @returns {Promise<{
 *   connected: boolean,
 *   environment: string,
 *   accessToken?: { expiresAt: number, expiresIn: string, expired: boolean, status: string },
 *   refreshToken?: {
 *     expiresAt: number,
 *     expiresIn: string,
 *     expired: boolean,
 *     status: 'healthy' | 'warning' | 'critical' | 'expired',
 *     message: string | null,
 *     daysRemaining: number
 *   }
 * }>}
 */
export async function getTokenHealth(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksTokenHealth?environment=${env}`);
    return await response.json();
  } catch (error) {
    const appError = logError(error, 'checking token health');
    return { connected: false, error: appError.userMessage };
  }
}

/**
 * Check if QuickBooks token needs attention (warning or critical)
 * @param {string} environment - Optional override for environment
 * @returns {Promise<{ needsAttention: boolean, status: string, message: string | null }>}
 */
export async function checkTokenExpiration(environment = null) {
  const health = await getTokenHealth(environment);

  if (!health.connected) {
    return { needsAttention: false, status: 'disconnected', message: null };
  }

  const { refreshToken } = health;

  if (refreshToken.status === 'expired' || refreshToken.status === 'critical' || refreshToken.status === 'warning') {
    return {
      needsAttention: true,
      status: refreshToken.status,
      message: refreshToken.message,
      daysRemaining: refreshToken.daysRemaining
    };
  }

  return { needsAttention: false, status: 'healthy', message: null };
}

/**
 * Get QuickBooks authorization URL to start OAuth flow
 * @param {string} environment - Optional override for environment
 */
export async function getAuthUrl(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksAuthUrl?environment=${env}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || data.error);
    }

    return data;
  } catch (error) {
    throw handleQBError(error, 'getting auth URL');
  }
}

/**
 * Start QuickBooks OAuth connection flow
 * @param {string} environment - Optional override for environment
 */
export async function connectQuickBooks(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const { authUrl } = await getAuthUrl(env);

    // Open QuickBooks authorization in a new window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'QuickBooks Authorization',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      console.error('[QB] Popup blocked - please allow popups for QuickBooks authorization');
      return {
        success: false,
        error: 'popup_blocked',
        message: 'Popup was blocked. Please allow popups for this site and try again.'
      };
    }

    return { success: true, popup };
  } catch (error) {
    throw handleQBError(error, 'connecting to QuickBooks');
  }
}

/**
 * Disconnect from QuickBooks
 * @param {string} environment - Optional override for environment
 */
export async function disconnectQuickBooks(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksDisconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ environment: env })
    });
    return await response.json();
  } catch (error) {
    throw handleQBError(error, 'disconnecting from QuickBooks');
  }
}

/**
 * Get vendors from QuickBooks
 * @param {string} environment - Optional override for environment
 */
export async function getVendors(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksVendors?environment=${env}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get vendors');
    }

    return data.vendors || [];
  } catch (error) {
    throw handleQBError(error, 'getting vendors');
  }
}

/**
 * Create a vendor in QuickBooks
 * @param {string} environment - Optional override for environment
 */
export async function createVendor(name, email = null, environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksVendors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, environment: env })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create vendor');
    }

    return data.vendor;
  } catch (error) {
    throw handleQBError(error, 'creating vendor');
  }
}

/**
 * Get expense accounts from QuickBooks
 * @param {string} environment - Optional override for environment
 */
export async function getAccounts(environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksAccounts?environment=${env}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get accounts');
    }

    return data.accounts || [];
  } catch (error) {
    throw handleQBError(error, 'getting accounts');
  }
}

/**
 * Create a bill in QuickBooks from an invoice
 *
 * @param {Object} invoice - The invoice object from SmartCookBook
 * @param {string} vendorId - QuickBooks vendor ID
 * @param {string} accountId - QuickBooks expense account ID (optional)
 * @param {string} environment - Optional override for environment
 */
export async function createBill(invoice, vendorId, accountId = null, environment = null) {
  try {
    const env = environment || getQBEnvironment();
    const response = await fetch(`${FUNCTIONS_BASE}/quickbooksBills`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        invoice,
        vendorId,
        accountId,
        environment: env
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create bill');
    }

    return data;
  } catch (error) {
    throw handleQBError(error, 'creating bill');
  }
}

/**
 * Prepare invoice for QuickBooks by filtering line items
 *
 * Filters out non-accounting lines (deposits, zero-qty items) and
 * recalculates totals for accurate expense tracking.
 *
 * @param {Object} invoice - Invoice with lineItems tagged by invoiceMerger
 * @returns {Object} Invoice ready for QuickBooks with:
 *   - filteredLineItems: Only lines where forAccounting=true
 *   - effectiveSubtotal: Sum of product + fee + credit lines
 *   - depositTotal: Sum of deposits (tracked separately)
 *   - filteringSummary: What was filtered and why
 */
export function prepareInvoiceForQuickBooks(invoice) {
  const lineItems = invoice.lineItems || [];

  // Filter to only accounting-relevant lines
  const accountingLines = lineItems.filter(line => line.forAccounting === true);
  const depositLines = lineItems.filter(line => line.isDeposit === true);
  const excludedLines = lineItems.filter(line =>
    !line.forAccounting && !line.isDeposit
  );

  // Calculate filtered totals
  const effectiveSubtotal = Math.round(
    accountingLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100
  ) / 100;

  const depositTotal = Math.round(
    depositLines.reduce((sum, l) => sum + (l.totalPrice || 0), 0) * 100
  ) / 100;

  // Use pre-calculated summary if available
  const summary = invoice.summary?.byType || null;

  return {
    ...invoice,
    // Filtered line items for QB bill creation
    lineItems: accountingLines,

    // Override totals with effective amounts
    totals: {
      ...invoice.totals,
      subtotal: effectiveSubtotal,
      // Keep tax as-is (applies to full invoice)
    },

    // Deposit info (for reference/separate handling)
    deposits: {
      lines: depositLines,
      total: depositTotal,
    },

    // Filtering summary for audit trail
    filteringSummary: {
      originalLineCount: lineItems.length,
      accountingLineCount: accountingLines.length,
      depositLineCount: depositLines.length,
      excludedLineCount: excludedLines.length,
      originalSubtotal: invoice.totals?.subtotal || 0,
      effectiveSubtotal,
      depositTotal,
      difference: (invoice.totals?.subtotal || 0) - effectiveSubtotal - depositTotal,
      byType: summary,
    },
  };
}

/**
 * Sync an invoice to QuickBooks
 *
 * This handles the full workflow:
 * 1. Filter invoice to accounting-relevant lines
 * 2. Check if vendor exists (create if not)
 * 3. Create bill with filtered line items
 *
 * Transaction safety: If bill creation fails after vendor creation,
 * the error is properly tracked and reported. QuickBooks doesn't allow
 * easy vendor deletion, so orphaned vendors may need manual cleanup.
 *
 * @param {Object} invoice - The invoice to sync
 * @param {Array} existingVendors - List of QB vendors (to avoid re-fetching)
 * @param {Object} options - { skipFiltering: boolean, onStatusUpdate: function }
 * @returns {Promise<Object>} Result with billId, vendorId, or error details
 */
export async function syncInvoiceToQuickBooks(invoice, existingVendors = null, options = {}) {
  let createdVendorId = null;
  let createdVendorName = null;

  // Filter invoice unless already filtered
  const preparedInvoice = options.skipFiltering
    ? invoice
    : prepareInvoiceForQuickBooks(invoice);

  // Log filtering results
  if (!options.skipFiltering && preparedInvoice.filteringSummary) {
    const fs = preparedInvoice.filteringSummary;
    console.log(`[QB] Invoice filtered for QuickBooks:`, {
      lines: `${fs.accountingLineCount}/${fs.originalLineCount} (${fs.excludedLineCount + fs.depositLineCount} excluded)`,
      subtotal: `$${fs.effectiveSubtotal} (was $${fs.originalSubtotal})`,
      deposits: fs.depositTotal > 0 ? `$${fs.depositTotal} (tracked separately)` : 'none',
    });
  }

  try {
    // Step 1: Get vendors if not provided
    const vendors = existingVendors || await getVendors();

    // Step 2: Get vendor name from invoice
    const invoiceVendorName = preparedInvoice.vendorName;

    // Step 3: Find matching vendor by name (fuzzy match)
    let vendor = vendors.find(v =>
      v.name.toLowerCase().includes(invoiceVendorName.toLowerCase()) ||
      invoiceVendorName.toLowerCase().includes(v.name.toLowerCase())
    );

    // Step 4: Create vendor if not found (track for potential rollback info)
    if (!vendor) {
      console.log(`[QB] Creating new vendor: ${invoiceVendorName}`);
      vendor = await createVendor(invoiceVendorName);
      createdVendorId = vendor.id;
      createdVendorName = vendor.name;
    }

    // Step 5: Create the bill with filtered invoice
    const result = await createBill(preparedInvoice, vendor.id);

    // Step 6: Notify caller of success (for local DB update)
    if (options.onStatusUpdate) {
      options.onStatusUpdate({
        status: 'sent_to_qb',
        qbBillId: result.billId,
        qbVendorId: vendor.id,
        qbSyncedAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      ...result,
      vendorName: vendor.name,
      vendorId: vendor.id,
      wasNewVendor: !!createdVendorId,
      filteringSummary: preparedInvoice.filteringSummary,
    };

  } catch (error) {
    // Transaction failed - log details for troubleshooting
    console.error('[QB] Sync failed:', error.message);

    // If we created a vendor but bill failed, log for manual cleanup
    if (createdVendorId) {
      console.warn(`[QB] Vendor "${createdVendorName}" (ID: ${createdVendorId}) was created but bill failed.`);
      console.warn('[QB] This vendor may need manual cleanup in QuickBooks.');
    }

    // Notify caller of failure (for local DB update)
    if (options.onStatusUpdate) {
      options.onStatusUpdate({
        status: 'qb_sync_failed',
        qbSyncError: error.message,
        qbSyncAttemptedAt: new Date().toISOString(),
        orphanedVendorId: createdVendorId || null,
      });
    }

    // Return error result instead of throwing (allows caller to handle gracefully)
    return {
      success: false,
      error: error.message,
      wasNewVendor: !!createdVendorId,
      orphanedVendorId: createdVendorId,
      orphanedVendorName: createdVendorName,
      filteringSummary: preparedInvoice.filteringSummary,
    };
  }
}

/**
 * Get lines from invoice that should go to inventory
 * (convenience wrapper for inventory import flow)
 *
 * @param {Object} invoice - Invoice with tagged lineItems
 * @returns {Array} Lines where forInventory=true
 */
export function getInventoryLines(invoice) {
  return (invoice.lineItems || []).filter(line => line.forInventory === true);
}

// Export default object for convenience
export default {
  getQBEnvironment,
  setQBEnvironment,
  getQBStatus,
  getTokenHealth,
  checkTokenExpiration,
  getAuthUrl,
  connectQuickBooks,
  disconnectQuickBooks,
  getVendors,
  createVendor,
  getAccounts,
  createBill,
  prepareInvoiceForQuickBooks,
  syncInvoiceToQuickBooks,
  getInventoryLines,
};
