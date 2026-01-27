/**
 * Credit Service
 *
 * Manages user API credits for Claude API usage.
 * Each user gets 50 credits per month.
 * Different operations cost different amounts based on API cost.
 *
 * Credit Costs:
 * - Invoice vision parse: 5 credits
 * - Recipe image parse: 5 credits
 * - Recipe text parse: 2 credits
 * - Translation: 1 credit
 * - Bulk dictation: 3 credits
 * - Recipe suggestions: 2 credits
 */

import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db as firestore } from '../database/firebase';
import { auth } from '../database/firebase';

// Monthly credit allocation
export const MONTHLY_CREDITS = 50;

// Owner emails that bypass credit limits (unlimited credits)
const OWNER_BYPASS_EMAILS = [
  'mageroyer@hotmail.com',
];

/**
 * Check if current user is an owner with unlimited credits
 */
function isOwnerUser() {
  const user = auth.currentUser;
  if (!user?.email) return false;
  return OWNER_BYPASS_EMAILS.includes(user.email.toLowerCase());
}

// Credit costs per operation type
export const CREDIT_COSTS = {
  INVOICE_VISION: 5,
  RECIPE_IMAGE: 5,
  RECIPE_TEXT: 2,
  TRANSLATION: 1,
  BULK_DICTATION: 3,
  RECIPE_SUGGESTIONS: 2,
  GENERIC: 2, // Default for unspecified operations
};

// Operation type labels for history/display
export const OPERATION_LABELS = {
  INVOICE_VISION: 'Invoice Parse',
  RECIPE_IMAGE: 'Recipe Image',
  RECIPE_TEXT: 'Recipe Text',
  TRANSLATION: 'Translation',
  BULK_DICTATION: 'Bulk Dictation',
  RECIPE_SUGGESTIONS: 'Recipe Suggestions',
  GENERIC: 'API Call',
};

/**
 * Get start of current month timestamp
 */
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * Get user's credit document reference
 */
function getCreditDocRef(userId) {
  return doc(firestore, 'userCredits', userId);
}

/**
 * Initialize credits for a new user
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Initial credit data
 */
export async function initializeCredits(userId) {
  if (!userId) throw new Error('User ID required');

  const creditDoc = getCreditDocRef(userId);
  const monthStart = getMonthStart();

  const initialData = {
    userId,
    credits: MONTHLY_CREDITS,
    creditsUsed: 0,
    monthStart,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await setDoc(creditDoc, initialData);
  return initialData;
}

/**
 * Get user's current credit balance
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Credit data with balance and usage
 */
export async function getCredits(userId) {
  if (!userId) {
    return { credits: 0, creditsUsed: 0, error: 'Not logged in' };
  }

  try {
    const creditDoc = getCreditDocRef(userId);
    const snapshot = await getDoc(creditDoc);

    if (!snapshot.exists()) {
      // Initialize credits for new user
      return await initializeCredits(userId);
    }

    const data = snapshot.data();
    const currentMonthStart = getMonthStart();

    // Check if we need to reset for new month
    if (data.monthStart < currentMonthStart) {
      // New month - reset credits
      const resetData = {
        credits: MONTHLY_CREDITS,
        creditsUsed: 0,
        monthStart: currentMonthStart,
        updatedAt: Date.now(),
        previousMonth: {
          creditsUsed: data.creditsUsed,
          monthStart: data.monthStart,
        },
      };

      await updateDoc(creditDoc, resetData);
      return { ...data, ...resetData };
    }

    return data;
  } catch (error) {
    console.error('Error getting credits:', error);
    return { credits: 0, creditsUsed: 0, error: error.message };
  }
}

/**
 * Check if user has enough credits for an operation
 * @param {string} userId - Firebase user ID
 * @param {string} operationType - Type of operation (from CREDIT_COSTS keys)
 * @returns {Promise<Object>} { canProceed, credits, cost, message, isOwner }
 */
export async function checkCredits(userId, operationType = 'GENERIC') {
  // Owner bypass - unlimited credits
  if (isOwnerUser()) {
    return {
      canProceed: true,
      credits: Infinity,
      cost: 0,
      message: 'Owner account - unlimited credits',
      isOwner: true,
    };
  }

  const creditData = await getCredits(userId);

  if (creditData.error) {
    return {
      canProceed: false,
      credits: 0,
      cost: 0,
      message: creditData.error,
    };
  }

  const cost = CREDIT_COSTS[operationType] || CREDIT_COSTS.GENERIC;
  const canProceed = creditData.credits >= cost;

  return {
    canProceed,
    credits: creditData.credits,
    cost,
    message: canProceed
      ? `This will use ${cost} credit${cost > 1 ? 's' : ''}`
      : `Insufficient credits. You have ${creditData.credits} credits, but this operation requires ${cost}.`,
  };
}

/**
 * Deduct credits for an operation
 * @param {string} userId - Firebase user ID
 * @param {string} operationType - Type of operation
 * @param {Object} metadata - Optional metadata about the operation
 * @returns {Promise<Object>} { success, creditsRemaining, message, isOwner }
 */
export async function deductCredits(userId, operationType = 'GENERIC', metadata = {}) {
  // Owner bypass - no deduction needed
  if (isOwnerUser()) {
    return {
      success: true,
      creditsRemaining: Infinity,
      cost: 0,
      message: 'Owner account - no credits deducted',
      isOwner: true,
    };
  }

  if (!userId) {
    return { success: false, creditsRemaining: 0, message: 'Not logged in' };
  }

  const cost = CREDIT_COSTS[operationType] || CREDIT_COSTS.GENERIC;

  try {
    // First check if user has enough credits
    const check = await checkCredits(userId, operationType);

    if (!check.canProceed) {
      return {
        success: false,
        creditsRemaining: check.credits,
        message: check.message,
      };
    }

    // Deduct credits
    const creditDoc = getCreditDocRef(userId);
    await updateDoc(creditDoc, {
      credits: increment(-cost),
      creditsUsed: increment(cost),
      updatedAt: Date.now(),
      lastOperation: {
        type: operationType,
        cost,
        timestamp: Date.now(),
        ...metadata,
      },
    });

    return {
      success: true,
      creditsRemaining: check.credits - cost,
      cost,
      message: `Used ${cost} credit${cost > 1 ? 's' : ''}. ${check.credits - cost} remaining.`,
    };
  } catch (error) {
    console.error('Error deducting credits:', error);
    return {
      success: false,
      creditsRemaining: 0,
      message: `Error: ${error.message}`,
    };
  }
}

/**
 * Add credits to a user (admin function)
 * @param {string} userId - Firebase user ID
 * @param {number} amount - Number of credits to add
 * @param {string} reason - Reason for adding credits
 * @returns {Promise<Object>} { success, newBalance, message }
 */
export async function addCredits(userId, amount, reason = 'Admin adjustment') {
  if (!userId) {
    return { success: false, message: 'User ID required' };
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return { success: false, message: 'Invalid amount' };
  }

  try {
    const creditDoc = getCreditDocRef(userId);
    const snapshot = await getDoc(creditDoc);

    if (!snapshot.exists()) {
      await initializeCredits(userId);
    }

    await updateDoc(creditDoc, {
      credits: increment(amount),
      updatedAt: Date.now(),
      lastAdjustment: {
        amount,
        reason,
        timestamp: Date.now(),
      },
    });

    const updated = await getCredits(userId);

    return {
      success: true,
      newBalance: updated.credits,
      message: `Added ${amount} credits. New balance: ${updated.credits}`,
    };
  } catch (error) {
    console.error('Error adding credits:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Get credit usage summary for display
 * @param {string} userId - Firebase user ID
 * @returns {Promise<Object>} Summary object for UI
 */
export async function getCreditSummary(userId) {
  // Owner bypass - show unlimited
  if (isOwnerUser()) {
    return {
      available: Infinity,
      used: 0,
      total: Infinity,
      percentUsed: 0,
      daysUntilReset: 0,
      isOwner: true,
      message: 'Owner account - unlimited credits',
    };
  }

  const data = await getCredits(userId);

  if (data.error) {
    return {
      available: 0,
      used: 0,
      total: MONTHLY_CREDITS,
      percentUsed: 0,
      daysUntilReset: 0,
      error: data.error,
    };
  }

  // Calculate days until reset
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntilReset = Math.ceil((nextMonth - now) / (1000 * 60 * 60 * 24));

  return {
    available: data.credits,
    used: data.creditsUsed,
    total: MONTHLY_CREDITS,
    percentUsed: Math.round((data.creditsUsed / MONTHLY_CREDITS) * 100),
    daysUntilReset,
    lastOperation: data.lastOperation || null,
  };
}

export default {
  MONTHLY_CREDITS,
  CREDIT_COSTS,
  OPERATION_LABELS,
  initializeCredits,
  getCredits,
  checkCredits,
  deductCredits,
  addCredits,
  getCreditSummary,
};
