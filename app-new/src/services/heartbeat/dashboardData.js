/**
 * Heartbeat Dashboard Data Service
 *
 * Aggregates data from all four "organs" of the SmartCookBook organism:
 * - Invoice (Blood) - brings resources in
 * - Inventory (Cells) - stores state
 * - Recipe (DNA) - transformation blueprints
 * - Task (Muscle) - execution
 *
 * @module services/heartbeat/dashboardData
 */

import { invoiceDB, inventoryItemDB, vendorDB } from '../database/indexedDB';
import { recipeDB } from '../database/recipeDB';

// ============================================
// CONSTANTS
// ============================================

export const ORGAN_TYPES = {
  INVOICE: 'invoice',
  INVENTORY: 'inventory',
  RECIPE: 'recipe',
  TASK: 'task'
};

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',      // 80-100
  ATTENTION: 'attention',  // 50-79
  CRITICAL: 'critical'     // 0-49
};

// ============================================
// ORGAN DATA FETCHERS
// ============================================

/**
 * Get Invoice organ data (The Blood)
 * @returns {Promise<Object>} Invoice organ stats
 */
export async function getInvoiceOrganData() {
  try {
    const invoices = await invoiceDB.getAll();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Recent invoices (last 7 days)
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.createdAt || inv.invoiceDate);
      return invDate >= weekAgo;
    });

    const todayInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.createdAt || inv.invoiceDate);
      invDate.setHours(0, 0, 0, 0);
      return invDate.getTime() === today.getTime();
    });

    // Calculate totals
    const todayTotal = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const weekTotal = recentInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

    // Pending review (status not 'completed' or 'approved')
    const pendingCount = invoices.filter(inv =>
      inv.status && !['completed', 'approved', 'saved'].includes(inv.status)
    ).length;

    // Health calculation
    const healthFactors = [
      { name: 'Recent activity', value: recentInvoices.length > 0 ? 90 : 50, weight: 0.4 },
      { name: 'Processing complete', value: pendingCount === 0 ? 100 : Math.max(0, 100 - pendingCount * 10), weight: 0.3 },
      { name: 'Data flowing', value: todayInvoices.length > 0 ? 100 : 70, weight: 0.3 }
    ];

    const healthScore = Math.round(
      healthFactors.reduce((sum, f) => sum + f.value * f.weight, 0)
    );

    return {
      organ: ORGAN_TYPES.INVOICE,
      label: 'Invoice',
      icon: '🩸',
      metaphor: 'The Blood',
      description: 'Brings resources into the system',
      stats: {
        todayCount: todayInvoices.length,
        todayTotal,
        weekCount: recentInvoices.length,
        weekTotal,
        pendingCount,
        totalCount: invoices.length
      },
      health: {
        score: healthScore,
        status: healthScore >= 80 ? HEALTH_STATUS.HEALTHY :
                healthScore >= 50 ? HEALTH_STATUS.ATTENTION : HEALTH_STATUS.CRITICAL,
        factors: healthFactors
      },
      pulseMessage: todayInvoices.length > 0
        ? `${todayInvoices.length} invoice${todayInvoices.length > 1 ? 's' : ''} today ($${todayTotal.toFixed(2)})`
        : 'No invoices today'
    };
  } catch (error) {
    console.error('[Heartbeat] Error fetching invoice data:', error);
    return createErrorOrganData(ORGAN_TYPES.INVOICE, 'Invoice', '🩸', error);
  }
}

/**
 * Get Inventory organ data (The Cells)
 * @returns {Promise<Object>} Inventory organ stats
 */
export async function getInventoryOrganData() {
  try {
    const items = await inventoryItemDB.getAll();

    // Stock analysis
    const lowStockItems = items.filter(item => {
      if (!item.currentStock || !item.reorderPoint) return false;
      return item.currentStock <= item.reorderPoint;
    });

    const outOfStockItems = items.filter(item =>
      item.currentStock === 0 || item.currentStock === null
    );

    const healthyStockItems = items.filter(item =>
      item.currentStock && item.currentStock > (item.reorderPoint || 0)
    );

    // Price data completeness
    const withPricing = items.filter(item =>
      item.pricePerG || item.pricePerML || item.pricePerUnit
    );

    // Calculate total inventory value
    const totalValue = items.reduce((sum, item) => {
      if (item.currentStock && item.pricePerG) {
        return sum + (item.currentStock * item.pricePerG);
      }
      return sum;
    }, 0);

    // Health calculation
    const stockHealthPercent = items.length > 0
      ? (healthyStockItems.length / items.length) * 100
      : 50;

    const pricingPercent = items.length > 0
      ? (withPricing.length / items.length) * 100
      : 50;

    const healthFactors = [
      { name: 'Stock levels', value: Math.round(stockHealthPercent), weight: 0.5 },
      { name: 'Price data', value: Math.round(pricingPercent), weight: 0.3 },
      { name: 'Data completeness', value: items.length > 0 ? 80 : 30, weight: 0.2 }
    ];

    const healthScore = Math.round(
      healthFactors.reduce((sum, f) => sum + f.value * f.weight, 0)
    );

    return {
      organ: ORGAN_TYPES.INVENTORY,
      label: 'Inventory',
      icon: '🧫',
      metaphor: 'The Cells',
      description: 'Stores the state of reality',
      stats: {
        totalItems: items.length,
        healthyStock: healthyStockItems.length,
        lowStock: lowStockItems.length,
        outOfStock: outOfStockItems.length,
        withPricing: withPricing.length,
        totalValue
      },
      health: {
        score: healthScore,
        status: healthScore >= 80 ? HEALTH_STATUS.HEALTHY :
                healthScore >= 50 ? HEALTH_STATUS.ATTENTION : HEALTH_STATUS.CRITICAL,
        factors: healthFactors
      },
      alerts: lowStockItems.slice(0, 5).map(item => ({
        type: 'low_stock',
        item: item.name,
        current: item.currentStock,
        threshold: item.reorderPoint
      })),
      pulseMessage: lowStockItems.length > 0
        ? `⚠️ ${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} low on stock`
        : `✓ ${healthyStockItems.length} items in healthy stock`
    };
  } catch (error) {
    console.error('[Heartbeat] Error fetching inventory data:', error);
    return createErrorOrganData(ORGAN_TYPES.INVENTORY, 'Inventory', '🧫', error);
  }
}

/**
 * Get Recipe organ data (The DNA)
 * @returns {Promise<Object>} Recipe organ stats
 */
export async function getRecipeOrganData() {
  try {
    const recipes = await recipeDB.getAll();

    // Costing analysis
    const costedRecipes = recipes.filter(r =>
      r.calculatedCost != null && r.calculatedCost > 0
    );

    const needsCostingRecipes = recipes.filter(r =>
      !r.calculatedCost || r.calculatedCost === 0
    );

    // Completeness analysis
    const completeRecipes = recipes.filter(r =>
      r.ingredients && r.ingredients.length > 0 &&
      r.methodSteps && r.methodSteps.length > 0
    );

    // Category breakdown
    const byCategory = recipes.reduce((acc, r) => {
      const cat = r.category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    // Health calculation
    const costingPercent = recipes.length > 0
      ? (costedRecipes.length / recipes.length) * 100
      : 50;

    const completenessPercent = recipes.length > 0
      ? (completeRecipes.length / recipes.length) * 100
      : 50;

    const healthFactors = [
      { name: 'Costed recipes', value: Math.round(costingPercent), weight: 0.5 },
      { name: 'Complete recipes', value: Math.round(completenessPercent), weight: 0.3 },
      { name: 'Recipe library', value: recipes.length >= 10 ? 90 : recipes.length * 9, weight: 0.2 }
    ];

    const healthScore = Math.round(
      healthFactors.reduce((sum, f) => sum + f.value * f.weight, 0)
    );

    return {
      organ: ORGAN_TYPES.RECIPE,
      label: 'Recipe',
      icon: '🧬',
      metaphor: 'The DNA',
      description: 'Blueprints for transformation',
      stats: {
        totalRecipes: recipes.length,
        costed: costedRecipes.length,
        needsCosting: needsCostingRecipes.length,
        complete: completeRecipes.length,
        byCategory
      },
      health: {
        score: healthScore,
        status: healthScore >= 80 ? HEALTH_STATUS.HEALTHY :
                healthScore >= 50 ? HEALTH_STATUS.ATTENTION : HEALTH_STATUS.CRITICAL,
        factors: healthFactors
      },
      pulseMessage: needsCostingRecipes.length > 0
        ? `📊 ${needsCostingRecipes.length} recipe${needsCostingRecipes.length > 1 ? 's' : ''} need costing`
        : `✓ All ${recipes.length} recipes costed`
    };
  } catch (error) {
    console.error('[Heartbeat] Error fetching recipe data:', error);
    return createErrorOrganData(ORGAN_TYPES.RECIPE, 'Recipe', '🧬', error);
  }
}

/**
 * Get Task organ data (The Muscle)
 * @returns {Promise<Object>} Task organ stats
 */
export async function getTaskOrganData() {
  try {
    // Tasks might be in Firebase, so we need to handle potential unavailability
    // For now, return mock structure - will integrate with tasksService
    const tasks = []; // TODO: await tasksService.getTasks()

    const activeTasks = tasks.filter(t => t.status === 'in_progress');
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed') return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const completedDate = new Date(t.completedAt);
      completedDate.setHours(0, 0, 0, 0);
      return completedDate.getTime() === today.getTime();
    });

    const overdueTasks = tasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date();
    });

    const pendingTasks = tasks.filter(t =>
      t.status === 'pending' || t.status === 'assigned'
    );

    // Health calculation
    const overduePercent = tasks.length > 0
      ? 100 - (overdueTasks.length / tasks.length) * 100
      : 80;

    const completionRate = tasks.length > 0
      ? (completedToday.length / Math.max(activeTasks.length + completedToday.length, 1)) * 100
      : 70;

    const healthFactors = [
      { name: 'On-time tasks', value: Math.round(overduePercent), weight: 0.4 },
      { name: 'Completion rate', value: Math.round(completionRate), weight: 0.4 },
      { name: 'Active work', value: activeTasks.length > 0 ? 90 : 60, weight: 0.2 }
    ];

    const healthScore = Math.round(
      healthFactors.reduce((sum, f) => sum + f.value * f.weight, 0)
    );

    return {
      organ: ORGAN_TYPES.TASK,
      label: 'Task',
      icon: '💪',
      metaphor: 'The Muscle',
      description: 'Executes the work',
      stats: {
        totalTasks: tasks.length,
        active: activeTasks.length,
        completedToday: completedToday.length,
        overdue: overdueTasks.length,
        pending: pendingTasks.length
      },
      health: {
        score: healthScore,
        status: healthScore >= 80 ? HEALTH_STATUS.HEALTHY :
                healthScore >= 50 ? HEALTH_STATUS.ATTENTION : HEALTH_STATUS.CRITICAL,
        factors: healthFactors
      },
      pulseMessage: overdueTasks.length > 0
        ? `❗ ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`
        : activeTasks.length > 0
          ? `💪 ${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''} in progress`
          : '✓ All tasks complete'
    };
  } catch (error) {
    console.error('[Heartbeat] Error fetching task data:', error);
    return createErrorOrganData(ORGAN_TYPES.TASK, 'Task', '💪', error);
  }
}

// ============================================
// AGGREGATE FUNCTIONS
// ============================================

/**
 * Get all organ data for the dashboard
 * @returns {Promise<Object>} Complete dashboard data
 */
export async function getDashboardData() {
  const [invoice, inventory, recipe, task] = await Promise.all([
    getInvoiceOrganData(),
    getInventoryOrganData(),
    getRecipeOrganData(),
    getTaskOrganData()
  ]);

  // Calculate overall organism health
  const organHealthScores = [invoice, inventory, recipe, task].map(o => o.health.score);
  const overallHealth = Math.round(
    organHealthScores.reduce((sum, score) => sum + score, 0) / organHealthScores.length
  );

  return {
    timestamp: new Date().toISOString(),
    organs: {
      invoice,
      inventory,
      recipe,
      task
    },
    organism: {
      health: {
        score: overallHealth,
        status: overallHealth >= 80 ? HEALTH_STATUS.HEALTHY :
                overallHealth >= 50 ? HEALTH_STATUS.ATTENTION : HEALTH_STATUS.CRITICAL
      },
      message: getOrganismMessage(overallHealth, { invoice, inventory, recipe, task })
    },
    flows: [
      { from: 'invoice', to: 'inventory', label: 'Supplies', active: invoice.stats.todayCount > 0 },
      { from: 'inventory', to: 'recipe', label: 'Ingredients', active: true },
      { from: 'recipe', to: 'task', label: 'Work Orders', active: task.stats.active > 0 },
      { from: 'task', to: 'inventory', label: 'Deductions', active: task.stats.completedToday > 0 }
    ]
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Create error state for an organ
 */
function createErrorOrganData(organ, label, icon, error) {
  return {
    organ,
    label,
    icon,
    metaphor: 'Error',
    description: 'Unable to fetch data',
    stats: {},
    health: {
      score: 0,
      status: HEALTH_STATUS.CRITICAL,
      factors: []
    },
    error: error.message,
    pulseMessage: `❌ Error: ${error.message}`
  };
}

/**
 * Generate overall organism message based on health
 */
function getOrganismMessage(health, organs) {
  if (health >= 90) {
    return '🌟 Kitchen is thriving! All systems healthy.';
  } else if (health >= 80) {
    return '✓ Kitchen is healthy. Minor attention needed.';
  } else if (health >= 60) {
    const issues = [];
    if (organs.invoice.health.score < 70) issues.push('invoice flow');
    if (organs.inventory.health.score < 70) issues.push('stock levels');
    if (organs.recipe.health.score < 70) issues.push('recipe costing');
    if (organs.task.health.score < 70) issues.push('task completion');
    return `⚠️ Needs attention: ${issues.join(', ')}`;
  } else {
    return '❗ Kitchen needs immediate attention!';
  }
}

export default {
  getInvoiceOrganData,
  getInventoryOrganData,
  getRecipeOrganData,
  getTaskOrganData,
  getDashboardData,
  ORGAN_TYPES,
  HEALTH_STATUS
};
