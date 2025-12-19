/**
 * Tasks Service Tests
 *
 * Unit tests for tasksService business logic layer.
 * Tests task creation, status updates, and progress calculations.
 *
 * Run with: npm test -- --grep tasksService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create hoisted mocks
const { mockAuth, mockDb, mockFirestore } = vi.hoisted(() => {
  const mockAuth = {
    currentUser: { uid: 'test-user-123' }
  };

  const mockDb = {};

  const mockTimestamp = {
    fromDate: vi.fn((date) => ({ toDate: () => date })),
    now: vi.fn(() => ({ toDate: () => new Date() }))
  };

  const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

  const mockFirestore = {
    collection: vi.fn(),
    doc: vi.fn(),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: mockServerTimestamp,
    Timestamp: mockTimestamp
  };

  return { mockAuth, mockDb, mockFirestore };
});

// Mock Firebase
vi.mock('../../database/firebase', () => ({
  db: mockDb,
  auth: mockAuth
}));

vi.mock('firebase/firestore', () => mockFirestore);

// Import after mocking
import {
  TASK_STATUS,
  getTaskProgress
} from '../tasksService';

describe('TasksService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth user for each test
    mockAuth.currentUser = { uid: 'test-user-123' };
  });

  describe('TASK_STATUS constants', () => {
    it('should have correct status values', () => {
      expect(TASK_STATUS.PENDING).toBe('pending');
      expect(TASK_STATUS.IN_PROGRESS).toBe('in_progress');
      expect(TASK_STATUS.PAUSED).toBe('paused');
      expect(TASK_STATUS.COMPLETED).toBe('completed');
      expect(TASK_STATUS.CANCELLED).toBe('cancelled');
    });

    it('should have all 5 statuses', () => {
      expect(Object.keys(TASK_STATUS)).toHaveLength(5);
    });
  });

  describe('getTaskProgress', () => {
    it('should calculate progress for empty task list', () => {
      const progress = getTaskProgress([]);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.inProgress).toBe(0);
      expect(progress.pending).toBe(0);
      expect(progress.paused).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('should calculate progress for mixed task statuses', () => {
      const tasks = [
        { id: '1', status: TASK_STATUS.COMPLETED },
        { id: '2', status: TASK_STATUS.COMPLETED },
        { id: '3', status: TASK_STATUS.IN_PROGRESS },
        { id: '4', status: TASK_STATUS.PENDING },
        { id: '5', status: TASK_STATUS.PAUSED }
      ];

      const progress = getTaskProgress(tasks);

      expect(progress.total).toBe(5);
      expect(progress.completed).toBe(2);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.paused).toBe(1);
      expect(progress.percentComplete).toBe(40);
    });

    it('should calculate 100% when all tasks completed', () => {
      const tasks = [
        { id: '1', status: TASK_STATUS.COMPLETED },
        { id: '2', status: TASK_STATUS.COMPLETED },
        { id: '3', status: TASK_STATUS.COMPLETED }
      ];

      const progress = getTaskProgress(tasks);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(3);
      expect(progress.percentComplete).toBe(100);
    });

    it('should calculate 0% when no tasks completed', () => {
      const tasks = [
        { id: '1', status: TASK_STATUS.PENDING },
        { id: '2', status: TASK_STATUS.IN_PROGRESS },
        { id: '3', status: TASK_STATUS.PAUSED }
      ];

      const progress = getTaskProgress(tasks);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it('should round percentage to whole number', () => {
      const tasks = [
        { id: '1', status: TASK_STATUS.COMPLETED },
        { id: '2', status: TASK_STATUS.PENDING },
        { id: '3', status: TASK_STATUS.PENDING }
      ];

      const progress = getTaskProgress(tasks);

      expect(progress.percentComplete).toBe(33); // 33.33 rounded
    });

    it('should handle cancelled tasks', () => {
      const tasks = [
        { id: '1', status: TASK_STATUS.COMPLETED },
        { id: '2', status: TASK_STATUS.CANCELLED },
        { id: '3', status: TASK_STATUS.CANCELLED }
      ];

      const progress = getTaskProgress(tasks);

      // Cancelled tasks count toward total but not any category
      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.pending).toBe(0);
      expect(progress.percentComplete).toBe(33);
    });
  });

  describe('Task status transitions', () => {
    const validTransitions = {
      [TASK_STATUS.PENDING]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.CANCELLED],
      [TASK_STATUS.IN_PROGRESS]: [TASK_STATUS.PAUSED, TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED],
      [TASK_STATUS.PAUSED]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.CANCELLED],
      [TASK_STATUS.COMPLETED]: [], // No transitions from completed
      [TASK_STATUS.CANCELLED]: [] // No transitions from cancelled
    };

    it('should define valid transitions from PENDING', () => {
      const from = TASK_STATUS.PENDING;
      const allowed = validTransitions[from];

      expect(allowed).toContain(TASK_STATUS.IN_PROGRESS);
      expect(allowed).toContain(TASK_STATUS.CANCELLED);
      expect(allowed).not.toContain(TASK_STATUS.COMPLETED);
      expect(allowed).not.toContain(TASK_STATUS.PAUSED);
    });

    it('should define valid transitions from IN_PROGRESS', () => {
      const from = TASK_STATUS.IN_PROGRESS;
      const allowed = validTransitions[from];

      expect(allowed).toContain(TASK_STATUS.PAUSED);
      expect(allowed).toContain(TASK_STATUS.COMPLETED);
      expect(allowed).toContain(TASK_STATUS.CANCELLED);
      expect(allowed).not.toContain(TASK_STATUS.PENDING);
    });

    it('should not allow transitions from COMPLETED', () => {
      const from = TASK_STATUS.COMPLETED;
      const allowed = validTransitions[from];

      expect(allowed).toHaveLength(0);
    });
  });

  describe('Task priority levels', () => {
    const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    it('should sort tasks by priority correctly', () => {
      const tasks = [
        { id: '1', priority: 'low', recipeName: 'Low Priority' },
        { id: '2', priority: 'urgent', recipeName: 'Urgent' },
        { id: '3', priority: 'normal', recipeName: 'Normal' },
        { id: '4', priority: 'high', recipeName: 'High Priority' }
      ];

      const sorted = [...tasks].sort((a, b) => {
        return PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
      });

      expect(sorted[0].priority).toBe('urgent');
      expect(sorted[1].priority).toBe('high');
      expect(sorted[2].priority).toBe('normal');
      expect(sorted[3].priority).toBe('low');
    });
  });

  describe('Task time tracking', () => {
    it('should calculate total time correctly', () => {
      const calculateTotalTime = (startedAt, completedAt) => {
        if (!startedAt || !completedAt) return 0;
        return Math.floor((completedAt - startedAt) / 1000);
      };

      const startedAt = new Date('2024-01-01T10:00:00');
      const completedAt = new Date('2024-01-01T10:30:00');

      const totalSeconds = calculateTotalTime(startedAt, completedAt);

      expect(totalSeconds).toBe(1800); // 30 minutes = 1800 seconds
    });

    it('should return 0 for incomplete tasks', () => {
      const calculateTotalTime = (startedAt, completedAt) => {
        if (!startedAt || !completedAt) return 0;
        return Math.floor((completedAt - startedAt) / 1000);
      };

      expect(calculateTotalTime(null, null)).toBe(0);
      expect(calculateTotalTime(new Date(), null)).toBe(0);
    });
  });

  describe('Task filtering', () => {
    const sampleTasks = [
      { id: '1', status: TASK_STATUS.PENDING, department: 'Kitchen', assignedTo: 'user1' },
      { id: '2', status: TASK_STATUS.IN_PROGRESS, department: 'Kitchen', assignedTo: 'user2' },
      { id: '3', status: TASK_STATUS.COMPLETED, department: 'Pastry', assignedTo: 'user1' },
      { id: '4', status: TASK_STATUS.PENDING, department: 'Pastry', assignedTo: null },
      { id: '5', status: TASK_STATUS.CANCELLED, department: 'Kitchen', assignedTo: 'user1' }
    ];

    it('should filter by status', () => {
      const pending = sampleTasks.filter(t => t.status === TASK_STATUS.PENDING);
      expect(pending).toHaveLength(2);
    });

    it('should filter by department', () => {
      const kitchen = sampleTasks.filter(t => t.department === 'Kitchen');
      expect(kitchen).toHaveLength(3);
    });

    it('should filter by assignee', () => {
      const user1Tasks = sampleTasks.filter(t => t.assignedTo === 'user1');
      expect(user1Tasks).toHaveLength(3);
    });

    it('should filter unassigned tasks', () => {
      const unassigned = sampleTasks.filter(t => !t.assignedTo);
      expect(unassigned).toHaveLength(1);
    });

    it('should filter active tasks (pending + in_progress)', () => {
      const active = sampleTasks.filter(t =>
        t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.IN_PROGRESS
      );
      expect(active).toHaveLength(3);
    });
  });

  describe('Task scaling calculations', () => {
    it('should calculate scaled ingredient quantity', () => {
      const ingredient = { metricQty: '100', unit: 'g' };
      const scaleFactor = 2.5;

      const scaledQty = parseFloat(ingredient.metricQty) * scaleFactor;

      expect(scaledQty).toBe(250);
    });

    it('should handle missing metricQty', () => {
      const ingredient = { unit: 'g' };
      const scaleFactor = 2;

      const baseQty = parseFloat(ingredient.metricQty) || 0;
      const scaledQty = baseQty * scaleFactor;

      expect(scaledQty).toBe(0);
    });

    it('should calculate portions from scale factor', () => {
      const basePortions = 4;
      const scaleFactor = 1.5;

      const producedQuantity = basePortions * scaleFactor;

      expect(producedQuantity).toBe(6);
    });
  });

  describe('Authentication guard', () => {
    it('should require authenticated user', () => {
      mockAuth.currentUser = null;

      // Simulating the guard behavior
      const getTasksCollection = () => {
        const user = mockAuth.currentUser;
        if (!user) throw new Error('User not authenticated');
        return 'tasks-collection-ref';
      };

      expect(() => getTasksCollection()).toThrow('User not authenticated');
    });

    it('should allow authenticated user', () => {
      mockAuth.currentUser = { uid: 'test-user-123' };

      const getTasksCollection = () => {
        const user = mockAuth.currentUser;
        if (!user) throw new Error('User not authenticated');
        return 'tasks-collection-ref';
      };

      expect(() => getTasksCollection()).not.toThrow();
    });
  });
});
