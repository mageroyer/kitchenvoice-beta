/**
 * API Usage Monitoring Service
 *
 * Tracks and retrieves API usage statistics for:
 * - Google Cloud Speech-to-Text
 * - Claude API
 *
 * Provides cost estimates and usage alerts
 */

// Backend API URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://localhost:3000';

/**
 * Get full API usage statistics
 * Returns usage data for speech and Claude APIs with cost estimates
 *
 * @returns {Promise<{
 *   timestamp: string,
 *   period: { daily: string, monthly: string },
 *   speech: {
 *     session: { requests: number, audioSeconds: number, audioMinutes: string, errors: number },
 *     daily: { requests: number, audioSeconds: number, audioMinutes: string },
 *     monthly: { requests: number, audioSeconds: number, audioMinutes: string, freeMinutesRemaining: string, freeTierPercentUsed: string },
 *     costs: { monthlyMinutes: string, freeMinutesUsed: string, billableMinutes: string, estimatedCost: string }
 *   },
 *   claude: {
 *     session: { requests: number, inputTokens: number, outputTokens: number, totalTokens: number, errors: number },
 *     daily: { requests: number, inputTokens: number, outputTokens: number, totalTokens: number },
 *     monthly: { requests: number, inputTokens: number, outputTokens: number, totalTokens: number },
 *     byModel: object,
 *     costs: { monthlyInputTokens: number, monthlyOutputTokens: number, totalTokens: number, estimatedCost: string }
 *   },
 *   costs: { speech: string, claude: string, total: string },
 *   alerts: { active: Array, history: Array },
 *   limits: object
 * }>}
 */
export async function getApiUsage() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/usage`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch API usage:', error);
    throw error;
  }
}

/**
 * Get active usage alerts
 *
 * @returns {Promise<{
 *   timestamp: string,
 *   status: 'ok' | 'warning' | 'critical',
 *   alertCount: number,
 *   alerts: Array<{ service: string, level: string, message: string, timestamp: number, date: string }>
 * }>}
 */
export async function getUsageAlerts() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/usage/alerts`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch usage alerts:', error);
    throw error;
  }
}

/**
 * Update usage alert thresholds
 *
 * @param {object} limits - New threshold values
 * @param {number} [limits.speechMonthlyMinutesWarning] - Speech warning threshold in minutes
 * @param {number} [limits.speechMonthlyMinutesCritical] - Speech critical threshold in minutes
 * @param {number} [limits.claudeDailyRequestsWarning] - Claude daily requests warning threshold
 * @param {number} [limits.claudeDailyRequestsCritical] - Claude daily requests critical threshold
 * @param {number} [limits.claudeMonthlyTokensWarning] - Claude monthly tokens warning threshold
 * @param {number} [limits.claudeMonthlyTokensCritical] - Claude monthly tokens critical threshold
 * @returns {Promise<{ success: boolean, limits: object }>}
 */
export async function updateUsageLimits(limits) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/usage/limits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(limits),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to update usage limits:', error);
    throw error;
  }
}

/**
 * Check if there are any active warnings or critical alerts
 *
 * @returns {Promise<{ hasAlerts: boolean, status: 'ok' | 'warning' | 'critical', count: number }>}
 */
export async function checkForAlerts() {
  try {
    const data = await getUsageAlerts();
    return {
      hasAlerts: data.alertCount > 0,
      status: data.status,
      count: data.alertCount,
    };
  } catch (error) {
    // Return ok status if we can't reach the backend
    return {
      hasAlerts: false,
      status: 'ok',
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Get a summary of current usage for display
 *
 * @returns {Promise<{
 *   speech: { used: string, remaining: string, percentUsed: number, cost: string },
 *   claude: { requests: number, tokens: string, cost: string },
 *   totalCost: string,
 *   status: 'ok' | 'warning' | 'critical'
 * }>}
 */
export async function getUsageSummary() {
  try {
    const data = await getApiUsage();

    const speechPercentUsed = parseFloat(data.speech.monthly.freeTierPercentUsed);
    const claudeTokensK = Math.round((data.claude.monthly.totalTokens || 0) / 1000);

    // Determine overall status
    const hasActiveAlerts = data.alerts.active.length > 0;
    const hasCritical = data.alerts.active.some(a => a.level === 'critical');
    const status = hasCritical ? 'critical' : hasActiveAlerts ? 'warning' : 'ok';

    return {
      speech: {
        used: `${data.speech.monthly.audioMinutes} min`,
        remaining: `${data.speech.monthly.freeMinutesRemaining} min`,
        percentUsed: speechPercentUsed,
        cost: data.speech.costs.estimatedCost,
      },
      claude: {
        requests: data.claude.monthly.requests,
        tokens: claudeTokensK > 1000 ? `${(claudeTokensK / 1000).toFixed(1)}M` : `${claudeTokensK}K`,
        cost: data.claude.costs.estimatedCost,
      },
      totalCost: data.costs.total,
      status,
      period: data.period.monthly,
    };
  } catch (error) {
    console.error('Failed to get usage summary:', error);
    return {
      speech: { used: 'N/A', remaining: 'N/A', percentUsed: 0, cost: '$0.00' },
      claude: { requests: 0, tokens: '0K', cost: '$0.00' },
      totalCost: '$0.00',
      status: 'ok',
      error: error.message,
    };
  }
}

/**
 * Format token count for display
 * @param {number} tokens
 * @returns {string}
 */
export function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * Format cost for display
 * @param {number} cost
 * @returns {string}
 */
export function formatCost(cost) {
  return `$${cost.toFixed(2)}`;
}

/**
 * Get usage status color
 * @param {'ok' | 'warning' | 'critical'} status
 * @returns {{ bg: string, text: string, border: string }}
 */
export function getStatusColors(status) {
  switch (status) {
    case 'critical':
      return { bg: '#f8d7da', text: '#721c24', border: '#f5c6cb' };
    case 'warning':
      return { bg: '#fff3cd', text: '#856404', border: '#ffeeba' };
    default:
      return { bg: '#d4edda', text: '#155724', border: '#c3e6cb' };
  }
}

// Default export for convenience
export default {
  getApiUsage,
  getUsageAlerts,
  updateUsageLimits,
  checkForAlerts,
  getUsageSummary,
  formatTokens,
  formatCost,
  getStatusColors,
};
