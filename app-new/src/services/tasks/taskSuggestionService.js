/**
 * Task Suggestion Service
 *
 * Analyzes production history to suggest tasks based on patterns.
 * Uses productionLogs to determine what was made on the same day last week.
 */

import { productionLogDB } from '../database/supportingDB';
import { createTask } from './tasksService';

/**
 * Get the date range for "same day last week"
 * @param {Date} targetDate - The date to suggest for (default: today)
 * @returns {{ start: Date, end: Date }} Start and end of the target day last week
 */
function getSameDayLastWeek(targetDate = new Date()) {
  const lastWeek = new Date(targetDate);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const start = new Date(lastWeek);
  start.setHours(0, 0, 0, 0);

  const end = new Date(lastWeek);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Get day name for display
 * @param {Date} date
 * @returns {string} Day name (e.g., "Monday")
 */
function getDayName(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Get suggestions based on same day last week's production
 * @param {string|null} department - Filter by department (null = all)
 * @param {Date} targetDate - The date to suggest for (default: today)
 * @returns {Promise<Array>} Array of suggestions
 */
export async function getSuggestionsForDay(department = null, targetDate = new Date()) {
  try {
    const { start, end } = getSameDayLastWeek(targetDate);
    const dayName = getDayName(start);

    // Get production logs from same day last week
    const logs = await productionLogDB.getByDateRange(start, end);

    // Filter by department if specified
    const filteredLogs = department
      ? logs.filter(log => log.department === department)
      : logs;

    if (filteredLogs.length === 0) {
      return {
        suggestions: [],
        message: `No production history found for ${dayName} last week${department ? ` in ${department}` : ''}.`,
        referenceDate: start,
        dayName
      };
    }

    // Group by recipe and sum quantities
    const recipeMap = new Map();

    for (const log of filteredLogs) {
      const key = log.recipeId || log.recipeName; // Use recipeId if available, else name

      if (recipeMap.has(key)) {
        const existing = recipeMap.get(key);
        existing.totalPortions += log.portions || 1;
        existing.taskCount += 1;
        existing.logs.push(log);
      } else {
        recipeMap.set(key, {
          recipeId: log.recipeId,
          recipeName: log.recipeName,
          portionUnit: log.portionUnit || '',
          department: log.department,
          totalPortions: log.portions || 1,
          taskCount: 1,
          logs: [log],
          // Use average scaleFactor from logs
          avgScaleFactor: log.scaleFactor || 1
        });
      }
    }

    // Calculate averages and build suggestions
    const suggestions = [];

    for (const [key, data] of recipeMap) {
      // Calculate average portions per task
      const avgPortionsPerTask = Math.round(data.totalPortions / data.taskCount);

      // Calculate average scale factor
      const totalScale = data.logs.reduce((sum, log) => sum + (log.scaleFactor || 1), 0);
      const avgScaleFactor = Math.round((totalScale / data.logs.length) * 10) / 10;

      suggestions.push({
        recipeId: data.recipeId,
        recipeName: data.recipeName,
        portionUnit: data.portionUnit || '',
        department: data.department,
        suggestedPortions: data.totalPortions, // Total made last week same day
        suggestedScaleFactor: avgScaleFactor,
        taskCount: data.taskCount, // How many tasks were created
        avgPortionsPerTask,
        reason: `Made ${data.totalPortions} portions in ${data.taskCount} task(s) last ${dayName}`
      });
    }

    // Sort by total portions (most produced first)
    suggestions.sort((a, b) => b.suggestedPortions - a.suggestedPortions);

    return {
      suggestions,
      message: `Found ${suggestions.length} recipe(s) from ${dayName} last week.`,
      referenceDate: start,
      dayName,
      totalTasks: filteredLogs.length
    };

  } catch (error) {
    console.error('Error getting task suggestions:', error);
    throw error;
  }
}

/**
 * Create tasks from suggestions
 * @param {Array} suggestions - Array of suggestions from getSuggestionsForDay
 * @param {Object} options - Options for task creation
 * @param {string} options.assignedTo - Privilege ID to assign to
 * @param {string} options.assignedToName - Display name
 * @param {string} options.dueDate - Due date (YYYY-MM-DD format)
 * @param {string} options.department - Department name
 * @returns {Promise<{created: number, errors: number, tasks: Array}>}
 */
export async function createTasksFromSuggestions(suggestions, options = {}) {
  const {
    assignedTo = null,
    assignedToName = 'Team',
    dueDate = new Date().toISOString().split('T')[0], // Today
    department = null
  } = options;

  const created = [];
  const errors = [];

  for (const suggestion of suggestions) {
    try {
      const taskId = await createTask({
        type: 'recipe',
        recipeId: suggestion.recipeId,
        recipeName: suggestion.recipeName,
        portions: suggestion.suggestedPortions,
        portionUnit: suggestion.portionUnit || '',
        scaleFactor: suggestion.suggestedScaleFactor,
        assignedTo,
        assignedToName,
        department: suggestion.department || department,
        dueDate,
        priority: 'normal',
        chefNotes: `Suggested based on last week: ${suggestion.reason}`
      });

      created.push({
        taskId,
        recipeName: suggestion.recipeName,
        portions: suggestion.suggestedPortions
      });
    } catch (err) {
      console.error(`Failed to create task for ${suggestion.recipeName}:`, err);
      errors.push({
        recipeName: suggestion.recipeName,
        error: err.message
      });
    }
  }

  console.log(`[TaskSuggestion] Created ${created.length} tasks, ${errors.length} errors`);

  return {
    created: created.length,
    errors: errors.length,
    tasks: created,
    failedRecipes: errors
  };
}

/**
 * Get production history for a specific day of the week
 * Useful for viewing "What do we usually make on Mondays?"
 * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @param {string|null} department - Filter by department
 * @param {number} weeksBack - How many weeks of history to analyze (default: 4)
 * @returns {Promise<Object>} Aggregated production stats
 */
export async function getProductionByDayOfWeek(dayOfWeek, department = null, weeksBack = 4) {
  try {
    const allLogs = await productionLogDB.getAll();

    // Filter logs by day of week and optionally department
    const filteredLogs = allLogs.filter(log => {
      const logDate = new Date(log.completedAt || log.createdAt);
      const isCorrectDay = logDate.getDay() === dayOfWeek;
      const isWithinRange = (Date.now() - logDate.getTime()) < (weeksBack * 7 * 24 * 60 * 60 * 1000);
      const matchesDept = !department || log.department === department;

      return isCorrectDay && isWithinRange && matchesDept;
    });

    // Group by recipe
    const recipeStats = new Map();

    for (const log of filteredLogs) {
      const key = log.recipeId || log.recipeName;

      if (recipeStats.has(key)) {
        const stats = recipeStats.get(key);
        stats.totalPortions += log.portions || 1;
        stats.occurrences += 1;
        stats.weeks.add(getWeekNumber(new Date(log.completedAt || log.createdAt)));
      } else {
        recipeStats.set(key, {
          recipeId: log.recipeId,
          recipeName: log.recipeName,
          department: log.department,
          totalPortions: log.portions || 1,
          occurrences: 1,
          weeks: new Set([getWeekNumber(new Date(log.completedAt || log.createdAt))])
        });
      }
    }

    // Convert to array with averages
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const results = [];

    for (const [key, stats] of recipeStats) {
      results.push({
        recipeId: stats.recipeId,
        recipeName: stats.recipeName,
        department: stats.department,
        totalPortions: stats.totalPortions,
        avgPortionsPerWeek: Math.round(stats.totalPortions / stats.weeks.size),
        weeksProduced: stats.weeks.size,
        frequency: `${stats.weeks.size}/${weeksBack} weeks`
      });
    }

    results.sort((a, b) => b.avgPortionsPerWeek - a.avgPortionsPerWeek);

    return {
      dayName: dayNames[dayOfWeek],
      dayOfWeek,
      weeksAnalyzed: weeksBack,
      department,
      recipes: results,
      totalRecipes: results.length
    };

  } catch (error) {
    console.error('Error getting production by day of week:', error);
    throw error;
  }
}

/**
 * Get week number of the year
 * @param {Date} date
 * @returns {number}
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export default {
  getSuggestionsForDay,
  createTasksFromSuggestions,
  getProductionByDayOfWeek
};
