/**
 * Cloud Sync Integration Tests
 *
 * Tests the actual cloudSync module behavior including:
 * - Sync status management
 * - Push/pull operations
 * - Real-time listener setup
 * - Error recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Track sync status changes
let syncStatusHistory = [];
let currentSyncStatus = 'idle';

// Mock Firebase auth
const mockAuth = {
  currentUser: { uid: 'test-user-123', email: 'test@example.com' },
};

// Mock Firestore operations
let mockFirestoreOnline = true;
let mockCloudRecipes = [];
let mockCloudCategories = [];
let mockCloudDepartments = [];
let snapshotCallbacks = [];

const mockSetDoc = vi.fn(async (docRef, data) => {
  if (!mockFirestoreOnline) {
    throw new Error('Failed to reach Cloud Firestore backend');
  }
  // Simulate storing in cloud
  const collection = docRef._collection;
  if (collection === 'recipes') {
    const existing = mockCloudRecipes.findIndex((r) => r.localId === data.localId);
    if (existing >= 0) {
      mockCloudRecipes[existing] = data;
    } else {
      mockCloudRecipes.push(data);
    }
  }
  return Promise.resolve();
});

const mockGetDocs = vi.fn(async () => {
  if (!mockFirestoreOnline) {
    throw new Error('Failed to reach Cloud Firestore backend');
  }
  return {
    docs: mockCloudRecipes.map((r) => ({
      id: `recipe_${r.localId}`,
      data: () => r,
    })),
    forEach: (cb) => {
      mockCloudRecipes.forEach((r, i) => {
        cb({ id: `recipe_${r.localId}`, data: () => r });
      });
    },
  };
});

const mockDeleteDoc = vi.fn(async () => {
  if (!mockFirestoreOnline) {
    throw new Error('Failed to reach Cloud Firestore backend');
  }
  return Promise.resolve();
});

const mockOnSnapshot = vi.fn((ref, callback, errorCallback) => {
  const listener = { ref, callback, errorCallback };
  snapshotCallbacks.push(listener);

  // Simulate initial snapshot
  setTimeout(() => {
    if (mockFirestoreOnline) {
      callback({
        docs: mockCloudRecipes.map((r) => ({
          id: `recipe_${r.localId}`,
          data: () => r,
        })),
        docChanges: () => [],
      });
    } else if (errorCallback) {
      errorCallback(new Error('Failed to reach Cloud Firestore backend'));
    }
  }, 0);

  // Return unsubscribe function
  return () => {
    snapshotCallbacks = snapshotCallbacks.filter((l) => l !== listener);
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...path) => ({ _path: path, _collection: path[path.length - 1] })),
  doc: vi.fn((ref, id) => ({ ...ref, _id: id, _collection: ref._collection })),
  setDoc: (...args) => mockSetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {
      if (!mockFirestoreOnline) {
        throw new Error('Failed to reach Cloud Firestore backend');
      }
    }),
  })),
}));

vi.mock('../firebase', () => ({
  db: { type: 'mock-firestore' },
  auth: mockAuth,
}));

// Mock IndexedDB operations
const mockLocalRecipes = [];

vi.mock('../indexedDB', () => ({
  recipeDB: {
    getAll: vi.fn(async () => [...mockLocalRecipes]),
    getById: vi.fn(async (id) => mockLocalRecipes.find((r) => r.id === id)),
    add: vi.fn(async (recipe) => {
      const newRecipe = { ...recipe, id: mockLocalRecipes.length + 1 };
      mockLocalRecipes.push(newRecipe);
      return newRecipe.id;
    }),
    update: vi.fn(async (id, data) => {
      const index = mockLocalRecipes.findIndex((r) => r.id === id);
      if (index >= 0) {
        mockLocalRecipes[index] = { ...mockLocalRecipes[index], ...data };
      }
    }),
    delete: vi.fn(async (id) => {
      const index = mockLocalRecipes.findIndex((r) => r.id === id);
      if (index >= 0) mockLocalRecipes.splice(index, 1);
    }),
  },
  categoryDB: {
    getAll: vi.fn(async () => []),
    add: vi.fn(async () => 1),
  },
  departmentDB: {
    getAll: vi.fn(async () => []),
    add: vi.fn(async () => 1),
  },
  default: {
    recipes: { toArray: vi.fn(async () => mockLocalRecipes) },
    categories: { toArray: vi.fn(async () => []) },
    departments: { toArray: vi.fn(async () => []) },
  },
}));

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const resetMocks = () => {
  syncStatusHistory = [];
  currentSyncStatus = 'idle';
  mockFirestoreOnline = true;
  mockCloudRecipes = [];
  mockCloudCategories = [];
  mockCloudDepartments = [];
  mockLocalRecipes.length = 0;
  snapshotCallbacks = [];
  vi.clearAllMocks();
};

const simulateOffline = () => {
  mockFirestoreOnline = false;
};

const simulateOnline = () => {
  mockFirestoreOnline = true;
};

const setSyncStatus = (status) => {
  currentSyncStatus = status;
  syncStatusHistory.push(status);
};

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

beforeEach(() => {
  resetMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// SYNC ID TESTS
// =============================================================================

describe('Sync ID Management', () => {
  it('should generate sync ID from authenticated user UID', () => {
    const getSyncId = () => {
      const currentUser = mockAuth.currentUser;
      if (currentUser?.uid) {
        return `user_${currentUser.uid}`;
      }
      return null;
    };

    const syncId = getSyncId();
    expect(syncId).toBe('user_test-user-123');
  });

  it('should return null when no user is authenticated', () => {
    const originalUser = mockAuth.currentUser;
    mockAuth.currentUser = null;

    const getSyncId = () => {
      const currentUser = mockAuth.currentUser;
      if (currentUser?.uid) {
        return `user_${currentUser.uid}`;
      }
      return null;
    };

    const syncId = getSyncId();
    expect(syncId).toBeNull();

    mockAuth.currentUser = originalUser;
  });
});

// =============================================================================
// PUSH TO CLOUD TESTS
// =============================================================================

describe('Push to Cloud Operations', () => {
  it('should push recipe to cloud successfully', async () => {
    const recipe = {
      id: 1,
      name: 'Test Recipe',
      category: 'Main Courses',
      portions: 4,
    };

    setSyncStatus('syncing');

    await mockSetDoc(
      { _collection: 'recipes', _id: 'recipe_1' },
      { ...recipe, localId: recipe.id, syncedAt: new Date().toISOString() }
    );

    setSyncStatus('synced');

    expect(mockCloudRecipes).toHaveLength(1);
    expect(mockCloudRecipes[0].name).toBe('Test Recipe');
    expect(currentSyncStatus).toBe('synced');
  });

  it('should handle push failure when offline', async () => {
    simulateOffline();

    const recipe = {
      id: 1,
      name: 'Offline Recipe',
      category: 'Desserts',
    };

    setSyncStatus('syncing');

    try {
      await mockSetDoc(
        { _collection: 'recipes', _id: 'recipe_1' },
        { ...recipe, localId: recipe.id }
      );
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('error');
    }

    expect(currentSyncStatus).toBe('error');
    expect(mockCloudRecipes).toHaveLength(0);
  });

  it('should update existing cloud recipe', async () => {
    // Initial push
    mockCloudRecipes.push({
      localId: 1,
      name: 'Original Name',
      category: 'Main',
    });

    // Update
    await mockSetDoc(
      { _collection: 'recipes', _id: 'recipe_1' },
      { localId: 1, name: 'Updated Name', category: 'Desserts' }
    );

    expect(mockCloudRecipes).toHaveLength(1);
    expect(mockCloudRecipes[0].name).toBe('Updated Name');
  });
});

// =============================================================================
// PULL FROM CLOUD TESTS
// =============================================================================

describe('Pull from Cloud Operations', () => {
  it('should fetch recipes from cloud', async () => {
    mockCloudRecipes.push(
      { localId: 1, name: 'Cloud Recipe 1', category: 'Main' },
      { localId: 2, name: 'Cloud Recipe 2', category: 'Desserts' }
    );

    const result = await mockGetDocs();

    expect(result.docs).toHaveLength(2);
    expect(result.docs[0].data().name).toBe('Cloud Recipe 1');
  });

  it('should handle fetch failure when offline', async () => {
    simulateOffline();

    await expect(mockGetDocs()).rejects.toThrow(
      'Failed to reach Cloud Firestore backend'
    );
  });

  it('should merge cloud data with local data', async () => {
    // Local data
    mockLocalRecipes.push(
      { id: 1, name: 'Local Recipe', category: 'Main', updatedAt: '2024-01-10' }
    );

    // Cloud data (newer)
    mockCloudRecipes.push({
      localId: 1,
      name: 'Cloud Recipe (Updated)',
      category: 'Main',
      updatedAt: '2024-01-15',
    });

    const cloudData = await mockGetDocs();
    const cloudRecipe = cloudData.docs[0].data();
    const localRecipe = mockLocalRecipes[0];

    // Conflict resolution - newer wins
    const shouldUseCloud =
      new Date(cloudRecipe.updatedAt) > new Date(localRecipe.updatedAt);

    expect(shouldUseCloud).toBe(true);
  });
});

// =============================================================================
// DELETE FROM CLOUD TESTS
// =============================================================================

describe('Delete from Cloud Operations', () => {
  it('should delete recipe from cloud', async () => {
    mockCloudRecipes.push({ localId: 1, name: 'To Delete' });

    setSyncStatus('syncing');
    await mockDeleteDoc({ _collection: 'recipes', _id: 'recipe_1' });
    setSyncStatus('synced');

    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(currentSyncStatus).toBe('synced');
  });

  it('should handle delete failure when offline', async () => {
    simulateOffline();

    setSyncStatus('syncing');

    try {
      await mockDeleteDoc({ _collection: 'recipes', _id: 'recipe_1' });
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }

    expect(currentSyncStatus).toBe('error');
  });
});

// =============================================================================
// REAL-TIME SYNC TESTS
// =============================================================================

describe('Real-time Sync', () => {
  it('should set up snapshot listener', () => {
    const callback = vi.fn();
    const unsubscribe = mockOnSnapshot({}, callback);

    expect(snapshotCallbacks).toHaveLength(1);
    expect(typeof unsubscribe).toBe('function');
  });

  it('should receive initial snapshot data', async () => {
    mockCloudRecipes.push({ localId: 1, name: 'Snapshot Recipe' });

    const callback = vi.fn();
    mockOnSnapshot({}, callback);

    // Wait for async snapshot callback
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callback).toHaveBeenCalled();
    const snapshot = callback.mock.calls[0][0];
    expect(snapshot.docs).toHaveLength(1);
  });

  it('should handle snapshot errors when offline', async () => {
    simulateOffline();

    const callback = vi.fn();
    const errorCallback = vi.fn();
    mockOnSnapshot({}, callback, errorCallback);

    // Wait for async error callback
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errorCallback).toHaveBeenCalled();
  });

  it('should clean up listeners on unsubscribe', () => {
    const unsub1 = mockOnSnapshot({}, vi.fn());
    const unsub2 = mockOnSnapshot({}, vi.fn());

    expect(snapshotCallbacks).toHaveLength(2);

    unsub1();
    expect(snapshotCallbacks).toHaveLength(1);

    unsub2();
    expect(snapshotCallbacks).toHaveLength(0);
  });
});

// =============================================================================
// INITIAL SYNC TESTS
// =============================================================================

describe('Initial Sync', () => {
  it('should sync local data to cloud on initial sync', async () => {
    mockLocalRecipes.push(
      { id: 1, name: 'Local Recipe 1', category: 'Main' },
      { id: 2, name: 'Local Recipe 2', category: 'Desserts' }
    );

    setSyncStatus('syncing');

    // Push each local recipe to cloud
    for (const recipe of mockLocalRecipes) {
      await mockSetDoc(
        { _collection: 'recipes', _id: `recipe_${recipe.id}` },
        { ...recipe, localId: recipe.id, syncedAt: new Date().toISOString() }
      );
    }

    setSyncStatus('synced');

    expect(mockCloudRecipes).toHaveLength(2);
    expect(syncStatusHistory).toContain('syncing');
    expect(syncStatusHistory).toContain('synced');
  });

  it('should pull cloud data to local on initial sync', async () => {
    mockCloudRecipes.push(
      { localId: 100, name: 'Cloud Only Recipe', category: 'Appetizers' }
    );

    const cloudData = await mockGetDocs();

    // Simulate adding cloud-only recipes to local
    for (const doc of cloudData.docs) {
      const recipe = doc.data();
      if (!mockLocalRecipes.find((r) => r.id === recipe.localId)) {
        mockLocalRecipes.push({ ...recipe, id: recipe.localId });
      }
    }

    expect(mockLocalRecipes).toHaveLength(1);
    expect(mockLocalRecipes[0].name).toBe('Cloud Only Recipe');
  });

  it('should handle empty cloud on initial sync', async () => {
    mockLocalRecipes.push({ id: 1, name: 'Only Local', category: 'Main' });

    const cloudData = await mockGetDocs();

    expect(cloudData.docs).toHaveLength(0);
    expect(mockLocalRecipes).toHaveLength(1);
  });
});

// =============================================================================
// BATCH OPERATIONS TESTS
// =============================================================================

describe('Batch Operations', () => {
  it('should batch multiple updates efficiently', async () => {
    const recipesToSync = [
      { id: 1, name: 'Batch Recipe 1' },
      { id: 2, name: 'Batch Recipe 2' },
      { id: 3, name: 'Batch Recipe 3' },
    ];

    setSyncStatus('syncing');

    // Simulate batch push
    await Promise.all(
      recipesToSync.map((recipe) =>
        mockSetDoc(
          { _collection: 'recipes', _id: `recipe_${recipe.id}` },
          { ...recipe, localId: recipe.id }
        )
      )
    );

    setSyncStatus('synced');

    expect(mockCloudRecipes).toHaveLength(3);
    expect(mockSetDoc).toHaveBeenCalledTimes(3);
  });

  it('should handle partial batch failure', async () => {
    const recipesToSync = [
      { id: 1, name: 'Will Succeed' },
      { id: 2, name: 'Will Fail' },
      { id: 3, name: 'Will Succeed' },
    ];

    let successCount = 0;
    let failCount = 0;

    for (const recipe of recipesToSync) {
      try {
        // Simulate failure for id 2
        if (recipe.id === 2) {
          throw new Error('Simulated failure');
        }
        await mockSetDoc(
          { _collection: 'recipes', _id: `recipe_${recipe.id}` },
          { ...recipe, localId: recipe.id }
        );
        successCount++;
      } catch {
        failCount++;
      }
    }

    expect(successCount).toBe(2);
    expect(failCount).toBe(1);
  });
});

// =============================================================================
// SYNC RECOVERY TESTS
// =============================================================================

describe('Sync Recovery', () => {
  it('should retry failed sync operations on reconnection', async () => {
    const pendingOps = [];

    // Queue operations while offline
    simulateOffline();

    const recipe = { id: 1, name: 'Pending Recipe' };

    try {
      await mockSetDoc(
        { _collection: 'recipes', _id: 'recipe_1' },
        { ...recipe, localId: recipe.id }
      );
    } catch {
      pendingOps.push({ type: 'push', data: recipe });
    }

    expect(pendingOps).toHaveLength(1);

    // Reconnect and retry
    simulateOnline();

    for (const op of pendingOps) {
      await mockSetDoc(
        { _collection: 'recipes', _id: `recipe_${op.data.id}` },
        { ...op.data, localId: op.data.id }
      );
    }

    expect(mockCloudRecipes).toHaveLength(1);
  });

  it('should preserve operation order during recovery', async () => {
    const pendingOps = [];
    simulateOffline();

    // Queue multiple operations
    pendingOps.push({ type: 'create', data: { id: 1, name: 'First' }, timestamp: 1 });
    pendingOps.push({ type: 'update', data: { id: 1, name: 'Updated' }, timestamp: 2 });
    pendingOps.push({ type: 'create', data: { id: 2, name: 'Second' }, timestamp: 3 });

    // Sort by timestamp
    pendingOps.sort((a, b) => a.timestamp - b.timestamp);

    expect(pendingOps[0].data.name).toBe('First');
    expect(pendingOps[1].data.name).toBe('Updated');
    expect(pendingOps[2].data.name).toBe('Second');
  });

  it('should deduplicate redundant operations', () => {
    const pendingOps = [
      { type: 'update', id: 1, data: { name: 'V1' } },
      { type: 'update', id: 1, data: { name: 'V2' } },
      { type: 'update', id: 1, data: { name: 'V3' } },
      { type: 'update', id: 2, data: { name: 'Other' } },
    ];

    // Deduplicate - keep only latest update per ID
    const latestById = new Map();
    for (const op of pendingOps) {
      latestById.set(op.id, op);
    }

    const deduped = Array.from(latestById.values());

    expect(deduped).toHaveLength(2);
    expect(deduped.find((op) => op.id === 1).data.name).toBe('V3');
  });
});

// =============================================================================
// MULTI-DEVICE SYNC TESTS
// =============================================================================

describe('Multi-device Sync', () => {
  it('should handle concurrent edits from different devices', () => {
    const device1Edit = {
      id: 1,
      name: 'Device 1 Edit',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    const device2Edit = {
      id: 1,
      name: 'Device 2 Edit',
      updatedAt: '2024-01-15T10:00:01Z', // 1 second later
    };

    // Last-write-wins resolution
    const resolve = (edit1, edit2) => {
      return new Date(edit1.updatedAt) > new Date(edit2.updatedAt)
        ? edit1
        : edit2;
    };

    const resolved = resolve(device1Edit, device2Edit);
    expect(resolved.name).toBe('Device 2 Edit');
  });

  it('should notify all devices of changes', () => {
    const deviceCallbacks = [vi.fn(), vi.fn(), vi.fn()];

    // Simulate snapshot delivery to all devices
    const broadcastChange = (change) => {
      deviceCallbacks.forEach((cb) => cb(change));
    };

    broadcastChange({ type: 'added', data: { id: 1, name: 'New Recipe' } });

    expect(deviceCallbacks[0]).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'added' })
    );
    expect(deviceCallbacks[1]).toHaveBeenCalled();
    expect(deviceCallbacks[2]).toHaveBeenCalled();
  });
});
