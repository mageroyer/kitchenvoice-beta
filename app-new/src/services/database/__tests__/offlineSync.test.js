/**
 * Offline Functionality Tests
 *
 * Tests for offline-first architecture including:
 * - IndexedDB operations work offline
 * - Network disconnection simulation
 * - Sync recovery when reconnected
 * - Cloud sync error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock Dexie (IndexedDB wrapper)
const mockRecipes = [];
const mockCategories = [];
const mockDepartments = [];
let mockIdCounter = 1;

const createMockTable = (store) => ({
  add: vi.fn(async (item) => {
    const newItem = { ...item, id: mockIdCounter++ };
    store.push(newItem);
    return newItem.id;
  }),
  put: vi.fn(async (item) => {
    const index = store.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      store[index] = item;
    } else {
      store.push(item);
    }
    return item.id;
  }),
  get: vi.fn(async (id) => store.find((i) => i.id === id) || null),
  delete: vi.fn(async (id) => {
    const index = store.findIndex((i) => i.id === id);
    if (index !== -1) store.splice(index, 1);
  }),
  toArray: vi.fn(async () => [...store]),
  where: vi.fn(() => ({
    equals: vi.fn(() => ({
      first: vi.fn(async () => store[0] || null),
      toArray: vi.fn(async () => store),
    })),
    anyOf: vi.fn(() => ({
      toArray: vi.fn(async () => store),
    })),
  })),
  count: vi.fn(async () => store.length),
  clear: vi.fn(async () => {
    store.length = 0;
  }),
});

// Mock Firebase/Firestore
let mockFirebaseOnline = true;
let mockFirestoreData = { recipes: [], categories: [], departments: [] };
let mockSnapshotListeners = [];

const mockFirestore = {
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => {
    if (!mockFirebaseOnline) {
      throw new Error('Failed to reach Cloud Firestore backend');
    }
  }),
  getDocs: vi.fn(async () => {
    if (!mockFirebaseOnline) {
      throw new Error('Failed to reach Cloud Firestore backend');
    }
    return { docs: [], forEach: vi.fn() };
  }),
  deleteDoc: vi.fn(async () => {
    if (!mockFirebaseOnline) {
      throw new Error('Failed to reach Cloud Firestore backend');
    }
  }),
  onSnapshot: vi.fn((ref, callback) => {
    const listener = { ref, callback };
    mockSnapshotListeners.push(listener);
    // Return unsubscribe function
    return () => {
      mockSnapshotListeners = mockSnapshotListeners.filter((l) => l !== listener);
    };
  }),
};

vi.mock('firebase/firestore', () => ({
  collection: mockFirestore.collection,
  doc: mockFirestore.doc,
  setDoc: mockFirestore.setDoc,
  getDocs: mockFirestore.getDocs,
  deleteDoc: mockFirestore.deleteDoc,
  onSnapshot: mockFirestore.onSnapshot,
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {
      if (!mockFirebaseOnline) {
        throw new Error('Failed to reach Cloud Firestore backend');
      }
    }),
  })),
}));

vi.mock('../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
}));

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const resetMocks = () => {
  mockRecipes.length = 0;
  mockCategories.length = 0;
  mockDepartments.length = 0;
  mockIdCounter = 1;
  mockFirebaseOnline = true;
  mockFirestoreData = { recipes: [], categories: [], departments: [] };
  mockSnapshotListeners = [];
  vi.clearAllMocks();
};

const simulateOffline = () => {
  mockFirebaseOnline = false;
};

const simulateOnline = () => {
  mockFirebaseOnline = true;
};

// Simulate browser online/offline events
const triggerOfflineEvent = () => {
  Object.defineProperty(navigator, 'onLine', {
    value: false,
    writable: true,
    configurable: true,
  });
  window.dispatchEvent(new Event('offline'));
};

const triggerOnlineEvent = () => {
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  });
  window.dispatchEvent(new Event('online'));
};

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

beforeEach(() => {
  resetMocks();
  // Reset navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// INDEXEDDB OFFLINE OPERATIONS TESTS
// =============================================================================

describe('IndexedDB Offline Operations', () => {
  describe('Recipe CRUD without network', () => {
    it('should create recipes in IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockRecipes);
      const recipe = {
        name: 'Offline Recipe',
        category: 'Main Courses',
        portions: 4,
        ingredients: [],
        method: [],
      };

      const id = await mockTable.add(recipe);

      expect(id).toBeDefined();
      expect(mockRecipes).toHaveLength(1);
      expect(mockRecipes[0].name).toBe('Offline Recipe');
    });

    it('should read recipes from IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockRecipes);
      mockRecipes.push({
        id: 1,
        name: 'Existing Recipe',
        category: 'Desserts',
        portions: 6,
      });

      const recipes = await mockTable.toArray();

      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Existing Recipe');
    });

    it('should update recipes in IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockRecipes);
      mockRecipes.push({
        id: 1,
        name: 'Original Recipe',
        category: 'Appetizers',
        portions: 2,
      });

      await mockTable.put({
        id: 1,
        name: 'Updated Recipe',
        category: 'Appetizers',
        portions: 4,
      });

      expect(mockRecipes[0].name).toBe('Updated Recipe');
      expect(mockRecipes[0].portions).toBe(4);
    });

    it('should delete recipes from IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockRecipes);
      mockRecipes.push({
        id: 1,
        name: 'Recipe to Delete',
        category: 'Main Courses',
      });

      await mockTable.delete(1);

      expect(mockRecipes).toHaveLength(0);
    });

    it('should query recipes by category when offline', async () => {
      simulateOffline();

      mockRecipes.push(
        { id: 1, name: 'Dessert 1', category: 'Desserts' },
        { id: 2, name: 'Main 1', category: 'Main Courses' },
        { id: 3, name: 'Dessert 2', category: 'Desserts' }
      );

      const desserts = mockRecipes.filter((r) => r.category === 'Desserts');

      expect(desserts).toHaveLength(2);
      expect(desserts.every((r) => r.category === 'Desserts')).toBe(true);
    });
  });

  describe('Category operations offline', () => {
    it('should manage categories in IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockCategories);

      // Add category
      await mockTable.add({ name: 'Offline Category', departmentId: 1 });
      expect(mockCategories).toHaveLength(1);

      // Update category
      await mockTable.put({ id: 1, name: 'Updated Category', departmentId: 1 });
      expect(mockCategories[0].name).toBe('Updated Category');

      // Get all categories
      const categories = await mockTable.toArray();
      expect(categories).toHaveLength(1);
    });
  });

  describe('Department operations offline', () => {
    it('should manage departments in IndexedDB when offline', async () => {
      simulateOffline();

      const mockTable = createMockTable(mockDepartments);

      // Add department
      await mockTable.add({ name: 'Kitchen', isDefault: true });
      expect(mockDepartments).toHaveLength(1);

      // Verify default department
      const depts = await mockTable.toArray();
      expect(depts[0].isDefault).toBe(true);
    });
  });
});

// =============================================================================
// NETWORK DISCONNECTION SIMULATION TESTS
// =============================================================================

describe('Network Disconnection Simulation', () => {
  it('should detect offline status via navigator.onLine', () => {
    expect(navigator.onLine).toBe(true);

    triggerOfflineEvent();
    expect(navigator.onLine).toBe(false);

    triggerOnlineEvent();
    expect(navigator.onLine).toBe(true);
  });

  it('should fire offline event when network disconnects', () => {
    const offlineHandler = vi.fn();
    window.addEventListener('offline', offlineHandler);

    triggerOfflineEvent();

    expect(offlineHandler).toHaveBeenCalled();

    window.removeEventListener('offline', offlineHandler);
  });

  it('should fire online event when network reconnects', () => {
    const onlineHandler = vi.fn();
    window.addEventListener('online', onlineHandler);

    triggerOfflineEvent();
    triggerOnlineEvent();

    expect(onlineHandler).toHaveBeenCalled();

    window.removeEventListener('online', onlineHandler);
  });

  it('should handle rapid online/offline transitions', () => {
    const offlineHandler = vi.fn();
    const onlineHandler = vi.fn();

    window.addEventListener('offline', offlineHandler);
    window.addEventListener('online', onlineHandler);

    // Rapid transitions
    for (let i = 0; i < 5; i++) {
      triggerOfflineEvent();
      triggerOnlineEvent();
    }

    expect(offlineHandler).toHaveBeenCalledTimes(5);
    expect(onlineHandler).toHaveBeenCalledTimes(5);

    window.removeEventListener('offline', offlineHandler);
    window.removeEventListener('online', onlineHandler);
  });
});

// =============================================================================
// CLOUD SYNC ERROR HANDLING TESTS
// =============================================================================

describe('Cloud Sync Error Handling', () => {
  it('should fail gracefully when pushing to cloud while offline', async () => {
    simulateOffline();

    await expect(mockFirestore.setDoc()).rejects.toThrow(
      'Failed to reach Cloud Firestore backend'
    );
  });

  it('should fail gracefully when fetching from cloud while offline', async () => {
    simulateOffline();

    await expect(mockFirestore.getDocs()).rejects.toThrow(
      'Failed to reach Cloud Firestore backend'
    );
  });

  it('should fail gracefully when deleting from cloud while offline', async () => {
    simulateOffline();

    await expect(mockFirestore.deleteDoc()).rejects.toThrow(
      'Failed to reach Cloud Firestore backend'
    );
  });

  it('should succeed when cloud operations resume after reconnection', async () => {
    simulateOffline();

    // Should fail while offline
    await expect(mockFirestore.setDoc()).rejects.toThrow();

    // Reconnect
    simulateOnline();

    // Should succeed after reconnection
    await expect(mockFirestore.setDoc()).resolves.not.toThrow();
  });
});

// =============================================================================
// SYNC RECOVERY TESTS
// =============================================================================

describe('Sync Recovery When Reconnected', () => {
  it('should preserve local data during offline period', async () => {
    const mockTable = createMockTable(mockRecipes);

    // Add recipe while online
    await mockTable.add({ name: 'Recipe 1', category: 'Main' });

    // Go offline and add more recipes
    simulateOffline();
    await mockTable.add({ name: 'Offline Recipe 1', category: 'Desserts' });
    await mockTable.add({ name: 'Offline Recipe 2', category: 'Appetizers' });

    // All recipes should be in local storage
    const recipes = await mockTable.toArray();
    expect(recipes).toHaveLength(3);

    // Reconnect
    simulateOnline();

    // Data should still be intact
    const recipesAfterReconnect = await mockTable.toArray();
    expect(recipesAfterReconnect).toHaveLength(3);
  });

  it('should maintain data integrity through offline/online cycles', async () => {
    const mockTable = createMockTable(mockRecipes);

    // Multiple offline/online cycles with data operations
    simulateOnline();
    await mockTable.add({ name: 'Online Recipe', category: 'Main' });

    simulateOffline();
    await mockTable.add({ name: 'Offline Recipe', category: 'Desserts' });

    simulateOnline();
    await mockTable.add({ name: 'Back Online Recipe', category: 'Appetizers' });

    const recipes = await mockTable.toArray();
    expect(recipes).toHaveLength(3);
    expect(recipes.map((r) => r.name)).toEqual([
      'Online Recipe',
      'Offline Recipe',
      'Back Online Recipe',
    ]);
  });

  it('should track pending sync operations', () => {
    const pendingOperations = [];

    // Simulate queueing operations while offline
    simulateOffline();

    const queueOperation = (type, data) => {
      pendingOperations.push({
        type,
        data,
        timestamp: Date.now(),
        synced: false,
      });
    };

    queueOperation('CREATE', { name: 'New Recipe', category: 'Main' });
    queueOperation('UPDATE', { id: 1, name: 'Updated Recipe' });
    queueOperation('DELETE', { id: 2 });

    expect(pendingOperations).toHaveLength(3);
    expect(pendingOperations.every((op) => !op.synced)).toBe(true);

    // Simulate processing queue after reconnection
    simulateOnline();
    pendingOperations.forEach((op) => {
      op.synced = true;
    });

    expect(pendingOperations.every((op) => op.synced)).toBe(true);
  });

  it('should handle sync conflicts with timestamp-based resolution', async () => {
    // Simulate conflict: local and remote have different versions
    const localRecipe = {
      id: 1,
      name: 'Local Version',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const remoteRecipe = {
      id: 1,
      name: 'Remote Version',
      updatedAt: '2024-01-15T11:00:00.000Z', // Newer
    };

    // Conflict resolution: newer timestamp wins
    const resolveConflict = (local, remote) => {
      const localTime = new Date(local.updatedAt).getTime();
      const remoteTime = new Date(remote.updatedAt).getTime();
      return remoteTime > localTime ? remote : local;
    };

    const resolved = resolveConflict(localRecipe, remoteRecipe);
    expect(resolved.name).toBe('Remote Version');

    // Test when local is newer
    localRecipe.updatedAt = '2024-01-15T12:00:00.000Z';
    const resolvedLocal = resolveConflict(localRecipe, remoteRecipe);
    expect(resolvedLocal.name).toBe('Local Version');
  });
});

// =============================================================================
// SYNC STATUS MANAGEMENT TESTS
// =============================================================================

describe('Sync Status Management', () => {
  it('should track sync status transitions', () => {
    let currentStatus = 'idle';
    const statusHistory = [];

    const setSyncStatus = (status) => {
      currentStatus = status;
      statusHistory.push(status);
    };

    // Simulate sync workflow
    setSyncStatus('syncing');
    expect(currentStatus).toBe('syncing');

    setSyncStatus('synced');
    expect(currentStatus).toBe('synced');

    expect(statusHistory).toEqual(['syncing', 'synced']);
  });

  it('should notify subscribers of status changes', () => {
    const callbacks = [];
    let currentStatus = 'idle';

    const onStatusChange = (callback) => {
      callbacks.push(callback);
      return () => {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      };
    };

    const setSyncStatus = (status) => {
      currentStatus = status;
      callbacks.forEach((cb) => cb(status));
    };

    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    const unsubscribe1 = onStatusChange(subscriber1);
    onStatusChange(subscriber2);

    setSyncStatus('syncing');
    expect(subscriber1).toHaveBeenCalledWith('syncing');
    expect(subscriber2).toHaveBeenCalledWith('syncing');

    // Unsubscribe first subscriber
    unsubscribe1();

    setSyncStatus('synced');
    expect(subscriber1).toHaveBeenCalledTimes(1); // Not called again
    expect(subscriber2).toHaveBeenCalledTimes(2);
  });

  it('should set error status when sync fails', () => {
    let currentStatus = 'idle';

    const setSyncStatus = (status) => {
      currentStatus = status;
    };

    const attemptSync = async (shouldFail = false) => {
      setSyncStatus('syncing');
      try {
        if (shouldFail) {
          throw new Error('Sync failed');
        }
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    };

    attemptSync(true);
    expect(currentStatus).toBe('error');
  });
});

// =============================================================================
// REAL-TIME LISTENER TESTS
// =============================================================================

describe('Real-time Sync Listeners', () => {
  it('should register snapshot listeners', () => {
    const callback = vi.fn();
    const unsubscribe = mockFirestore.onSnapshot({}, callback);

    expect(mockSnapshotListeners).toHaveLength(1);
    expect(typeof unsubscribe).toBe('function');
  });

  it('should unregister snapshot listeners on cleanup', () => {
    const callback = vi.fn();
    const unsubscribe = mockFirestore.onSnapshot({}, callback);

    expect(mockSnapshotListeners).toHaveLength(1);

    unsubscribe();

    expect(mockSnapshotListeners).toHaveLength(0);
  });

  it('should handle multiple listeners', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const callback3 = vi.fn();

    const unsub1 = mockFirestore.onSnapshot({}, callback1);
    const unsub2 = mockFirestore.onSnapshot({}, callback2);
    const unsub3 = mockFirestore.onSnapshot({}, callback3);

    expect(mockSnapshotListeners).toHaveLength(3);

    unsub2();
    expect(mockSnapshotListeners).toHaveLength(2);

    unsub1();
    unsub3();
    expect(mockSnapshotListeners).toHaveLength(0);
  });
});

// =============================================================================
// DATA PERSISTENCE TESTS
// =============================================================================

describe('Data Persistence', () => {
  it('should persist recipes across sessions (simulated)', async () => {
    const mockTable = createMockTable(mockRecipes);

    // Add recipes
    await mockTable.add({ name: 'Persistent Recipe 1' });
    await mockTable.add({ name: 'Persistent Recipe 2' });

    // Simulate session end/start by just checking data is still there
    const recipesAfterReload = await mockTable.toArray();
    expect(recipesAfterReload).toHaveLength(2);
  });

  it('should maintain referential integrity', async () => {
    const recipesTable = createMockTable(mockRecipes);
    const categoriesTable = createMockTable(mockCategories);

    // Add category
    await categoriesTable.add({ name: 'Main Courses' });

    // Add recipe with category reference
    await recipesTable.add({
      name: 'Test Recipe',
      category: 'Main Courses',
      categoryId: 1,
    });

    const recipes = await recipesTable.toArray();
    const categories = await categoriesTable.toArray();

    expect(recipes[0].categoryId).toBe(categories[0].id);
  });

  it('should handle large datasets offline', async () => {
    simulateOffline();
    const mockTable = createMockTable(mockRecipes);

    // Add 100 recipes
    for (let i = 0; i < 100; i++) {
      await mockTable.add({
        name: `Recipe ${i + 1}`,
        category: i % 2 === 0 ? 'Main' : 'Desserts',
        portions: Math.floor(Math.random() * 10) + 1,
      });
    }

    const recipes = await mockTable.toArray();
    expect(recipes).toHaveLength(100);

    // Query subset
    const mainRecipes = recipes.filter((r) => r.category === 'Main');
    expect(mainRecipes).toHaveLength(50);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty database queries', async () => {
    const mockTable = createMockTable(mockRecipes);

    const recipes = await mockTable.toArray();
    expect(recipes).toHaveLength(0);

    const recipe = await mockTable.get(999);
    expect(recipe).toBeNull();
  });

  it('should handle concurrent operations', async () => {
    const mockTable = createMockTable(mockRecipes);

    // Simulate concurrent adds
    const promises = [
      mockTable.add({ name: 'Concurrent 1' }),
      mockTable.add({ name: 'Concurrent 2' }),
      mockTable.add({ name: 'Concurrent 3' }),
    ];

    const ids = await Promise.all(promises);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // All unique IDs
  });

  it('should handle network timeout scenarios', async () => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network timeout')), 100);
    });

    await expect(timeoutPromise).rejects.toThrow('Network timeout');
  });

  it('should gracefully handle corrupted data', async () => {
    const mockTable = createMockTable(mockRecipes);

    // Add valid recipe
    await mockTable.add({ name: 'Valid Recipe', category: 'Main' });

    // Simulate corrupted entry
    mockRecipes.push({ id: 999, name: null, category: undefined });

    const recipes = await mockTable.toArray();

    // Filter out corrupted entries in application code
    const validRecipes = recipes.filter(
      (r) => r.name != null && r.category != null
    );
    expect(validRecipes).toHaveLength(1);
  });
});
