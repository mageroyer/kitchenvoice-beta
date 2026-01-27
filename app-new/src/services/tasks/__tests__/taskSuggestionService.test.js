/**
 * Task Suggestion Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSuggestionsForDay,
  createTasksFromSuggestions
} from '../taskSuggestionService';

// Mock the dependencies
vi.mock('../../database/supportingDB', () => ({
  productionLogDB: {
    getByDateRange: vi.fn(),
    getAll: vi.fn()
  }
}));

vi.mock('../tasksService', () => ({
  createTask: vi.fn()
}));

import { productionLogDB } from '../../database/supportingDB';
import { createTask } from '../tasksService';

describe('TaskSuggestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSuggestionsForDay', () => {
    it('should return empty suggestions when no production history exists', async () => {
      productionLogDB.getByDateRange.mockResolvedValue([]);

      const result = await getSuggestionsForDay('Cuisine');

      expect(result.suggestions).toEqual([]);
      expect(result.message).toContain('No production history found');
    });

    it('should return suggestions based on last week same day', async () => {
      // Create sample production logs from "last week"
      const lastWeekDate = new Date();
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);

      const sampleLogs = [
        {
          recipeId: 1,
          recipeName: 'Béchamel',
          department: 'Cuisine',
          portions: 20,
          scaleFactor: 2,
          completedAt: lastWeekDate.toISOString()
        },
        {
          recipeId: 1,
          recipeName: 'Béchamel',
          department: 'Cuisine',
          portions: 15,
          scaleFactor: 1.5,
          completedAt: lastWeekDate.toISOString()
        },
        {
          recipeId: 2,
          recipeName: 'Bolognaise',
          department: 'Cuisine',
          portions: 50,
          scaleFactor: 5,
          completedAt: lastWeekDate.toISOString()
        }
      ];

      productionLogDB.getByDateRange.mockResolvedValue(sampleLogs);

      const result = await getSuggestionsForDay('Cuisine');

      expect(result.suggestions).toHaveLength(2);

      // Bolognaise should be first (more portions)
      expect(result.suggestions[0].recipeName).toBe('Bolognaise');
      expect(result.suggestions[0].suggestedPortions).toBe(50);
      expect(result.suggestions[0].taskCount).toBe(1);

      // Béchamel second (2 tasks, 35 total portions)
      expect(result.suggestions[1].recipeName).toBe('Béchamel');
      expect(result.suggestions[1].suggestedPortions).toBe(35); // 20 + 15
      expect(result.suggestions[1].taskCount).toBe(2);
    });

    it('should filter by department', async () => {
      const lastWeekDate = new Date();
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);

      const sampleLogs = [
        {
          recipeId: 1,
          recipeName: 'Béchamel',
          department: 'Cuisine',
          portions: 20,
          completedAt: lastWeekDate.toISOString()
        },
        {
          recipeId: 3,
          recipeName: 'Filet de Saumon',
          department: 'Poissonerie',
          portions: 30,
          completedAt: lastWeekDate.toISOString()
        }
      ];

      productionLogDB.getByDateRange.mockResolvedValue(sampleLogs);

      // Filter by Cuisine only
      const result = await getSuggestionsForDay('Cuisine');

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].recipeName).toBe('Béchamel');
    });

    it('should return all departments when department is null', async () => {
      const lastWeekDate = new Date();
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);

      const sampleLogs = [
        {
          recipeId: 1,
          recipeName: 'Béchamel',
          department: 'Cuisine',
          portions: 20,
          completedAt: lastWeekDate.toISOString()
        },
        {
          recipeId: 3,
          recipeName: 'Filet de Saumon',
          department: 'Poissonerie',
          portions: 30,
          completedAt: lastWeekDate.toISOString()
        }
      ];

      productionLogDB.getByDateRange.mockResolvedValue(sampleLogs);

      // No department filter
      const result = await getSuggestionsForDay(null);

      expect(result.suggestions).toHaveLength(2);
    });

    it('should include day name and reference date in result', async () => {
      productionLogDB.getByDateRange.mockResolvedValue([]);

      const result = await getSuggestionsForDay('Cuisine');

      expect(result.dayName).toBeDefined();
      expect(result.referenceDate).toBeInstanceOf(Date);
      expect(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
        .toContain(result.dayName);
    });
  });

  describe('createTasksFromSuggestions', () => {
    it('should create tasks from suggestions', async () => {
      createTask.mockResolvedValue('task-123');

      const suggestions = [
        {
          recipeId: 1,
          recipeName: 'Béchamel',
          department: 'Cuisine',
          suggestedPortions: 35,
          suggestedScaleFactor: 1.8,
          reason: 'Made 35 portions last Monday'
        },
        {
          recipeId: 2,
          recipeName: 'Bolognaise',
          department: 'Cuisine',
          suggestedPortions: 50,
          suggestedScaleFactor: 5,
          reason: 'Made 50 portions last Monday'
        }
      ];

      const result = await createTasksFromSuggestions(suggestions, {
        department: 'Cuisine',
        dueDate: '2026-01-10'
      });

      expect(result.created).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.tasks).toHaveLength(2);
      expect(createTask).toHaveBeenCalledTimes(2);

      // Check first task was created with correct data
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        recipeId: 1,
        recipeName: 'Béchamel',
        portions: 35,
        scaleFactor: 1.8,
        department: 'Cuisine'
      }));
    });

    it('should handle task creation errors gracefully', async () => {
      createTask
        .mockResolvedValueOnce('task-123')
        .mockRejectedValueOnce(new Error('Failed to create'));

      const suggestions = [
        { recipeId: 1, recipeName: 'Béchamel', suggestedPortions: 20, suggestedScaleFactor: 1 },
        { recipeId: 2, recipeName: 'Bolognaise', suggestedPortions: 50, suggestedScaleFactor: 1 }
      ];

      const result = await createTasksFromSuggestions(suggestions);

      expect(result.created).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.failedRecipes).toHaveLength(1);
      expect(result.failedRecipes[0].recipeName).toBe('Bolognaise');
    });

    it('should use default values when options not provided', async () => {
      createTask.mockResolvedValue('task-123');

      const suggestions = [
        { recipeId: 1, recipeName: 'Test', suggestedPortions: 10, suggestedScaleFactor: 1 }
      ];

      await createTasksFromSuggestions(suggestions);

      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
        assignedTo: null,
        assignedToName: 'Team',
        priority: 'normal'
      }));
    });
  });
});
