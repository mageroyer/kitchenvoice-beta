/**
 * Cloud Sync Conflict Resolution Tests
 *
 * Tests for handling conflicting edits from multiple devices including:
 * - Timestamp-based conflict resolution (last-write-wins)
 * - Concurrent edit scenarios
 * - Edge cases in conflict handling
 *
 * EXPECTED BEHAVIOR DOCUMENTATION:
 * ================================
 * The SmartCookBook sync system uses a "last-write-wins" strategy based on
 * the `updatedAt` timestamp field. When conflicts occur:
 *
 * 1. NEWER TIMESTAMP WINS: The version with the more recent `updatedAt`
 *    timestamp is kept, regardless of which device made the change.
 *
 * 2. CLOUD vs LOCAL SYNC:
 *    - During initial sync: Cloud and local are compared by timestamp
 *    - If cloud is newer: Local data is updated from cloud
 *    - If local is newer: Local data is pushed to cloud
 *
 * 3. REAL-TIME SYNC:
 *    - Changes are pushed immediately after local save
 *    - Snapshot listeners receive remote changes in real-time
 *    - The `updatedAt` field is set at save time on each device
 *
 * 4. CONFLICT SCENARIOS:
 *    - Same field edited: Last save wins
 *    - Different fields edited: Last save wins (entire document)
 *    - Offline edits: Resolved when device comes online based on timestamps
 *
 * 5. EDGE CASES:
 *    - Missing timestamps: Treated as epoch (0) - any valid timestamp wins
 *    - Identical timestamps: Cloud version is preferred (arbitrary but consistent)
 *    - Rapid edits: Each edit gets a unique timestamp (millisecond precision)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Simulated cloud storage
let cloudRecipes = new Map();
let cloudCategories = new Map();
let cloudDepartments = new Map();

// Simulated local storage (Device A)
let localRecipesDeviceA = new Map();

// Simulated local storage (Device B)
let localRecipesDeviceB = new Map();

// Network state per device
let deviceAOnline = true;
let deviceBOnline = true;

// =============================================================================
// CONFLICT RESOLUTION FUNCTIONS (matching cloudSync.js logic)
// =============================================================================

/**
 * Resolves conflict between two versions of the same record
 * Uses timestamp-based "last-write-wins" strategy
 *
 * @param {Object} version1 - First version with updatedAt field
 * @param {Object} version2 - Second version with updatedAt field
 * @returns {Object} The winning version
 */
const resolveConflict = (version1, version2) => {
  const date1 = new Date(version1.updatedAt || 0);
  const date2 = new Date(version2.updatedAt || 0);

  if (date1.getTime() === date2.getTime()) {
    // Identical timestamps - prefer version2 (cloud) for consistency
    return { winner: version2, reason: 'identical_timestamps_prefer_cloud' };
  }

  if (date1 > date2) {
    return { winner: version1, reason: 'timestamp_newer' };
  }

  return { winner: version2, reason: 'timestamp_newer' };
};

/**
 * Simulates syncing local data to cloud
 */
const syncToCloud = async (localData, deviceName) => {
  const cloudData = cloudRecipes.get(localData.id);

  if (!cloudData) {
    // New record - just push
    cloudRecipes.set(localData.id, {
      ...localData,
      syncedAt: new Date().toISOString(),
      lastSyncedBy: deviceName,
    });
    return { action: 'created', data: localData };
  }

  // Existing record - check for conflicts
  const { winner, reason } = resolveConflict(localData, cloudData);

  if (winner === localData) {
    cloudRecipes.set(localData.id, {
      ...localData,
      syncedAt: new Date().toISOString(),
      lastSyncedBy: deviceName,
    });
    return { action: 'updated', data: localData, reason };
  }

  return { action: 'skipped', data: cloudData, reason: 'cloud_is_newer' };
};

/**
 * Simulates pulling data from cloud to local
 */
const syncFromCloud = async (localMap, deviceName) => {
  const updates = [];

  for (const [id, cloudData] of cloudRecipes) {
    const localData = localMap.get(id);

    if (!localData) {
      // New from cloud
      localMap.set(id, { ...cloudData });
      updates.push({ action: 'downloaded', id, data: cloudData });
    } else {
      // Check for conflicts
      const { winner, reason } = resolveConflict(localData, cloudData);

      if (winner === cloudData) {
        localMap.set(id, { ...cloudData });
        updates.push({ action: 'updated_from_cloud', id, data: cloudData, reason });
      }
    }
  }

  return updates;
};

/**
 * Creates a timestamp with optional offset in milliseconds
 */
const createTimestamp = (offsetMs = 0) => {
  return new Date(Date.now() + offsetMs).toISOString();
};

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

beforeEach(() => {
  cloudRecipes.clear();
  cloudCategories.clear();
  cloudDepartments.clear();
  localRecipesDeviceA.clear();
  localRecipesDeviceB.clear();
  deviceAOnline = true;
  deviceBOnline = true;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// BASIC CONFLICT RESOLUTION TESTS
// =============================================================================

describe('Basic Conflict Resolution', () => {
  it('should resolve conflict in favor of newer timestamp', () => {
    const olderVersion = {
      id: 1,
      name: 'Old Name',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const newerVersion = {
      id: 1,
      name: 'New Name',
      updatedAt: '2024-01-15T11:00:00.000Z',
    };

    const { winner, reason } = resolveConflict(olderVersion, newerVersion);

    expect(winner).toBe(newerVersion);
    expect(reason).toBe('timestamp_newer');
    expect(winner.name).toBe('New Name');
  });

  it('should prefer cloud version when timestamps are identical', () => {
    const localVersion = {
      id: 1,
      name: 'Local Edit',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const cloudVersion = {
      id: 1,
      name: 'Cloud Edit',
      updatedAt: '2024-01-15T10:00:00.000Z', // Same timestamp
    };

    const { winner, reason } = resolveConflict(localVersion, cloudVersion);

    expect(winner).toBe(cloudVersion);
    expect(reason).toBe('identical_timestamps_prefer_cloud');
  });

  it('should handle missing timestamps by treating as epoch', () => {
    const noTimestamp = {
      id: 1,
      name: 'No Timestamp',
      // updatedAt is missing
    };

    const withTimestamp = {
      id: 1,
      name: 'Has Timestamp',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const { winner } = resolveConflict(noTimestamp, withTimestamp);

    expect(winner).toBe(withTimestamp);
    expect(winner.name).toBe('Has Timestamp');
  });

  it('should handle both missing timestamps', () => {
    const version1 = { id: 1, name: 'Version 1' };
    const version2 = { id: 1, name: 'Version 2' };

    const { winner, reason } = resolveConflict(version1, version2);

    // Both have epoch time (0), so cloud (version2) is preferred
    expect(winner).toBe(version2);
    expect(reason).toBe('identical_timestamps_prefer_cloud');
  });
});

// =============================================================================
// TWO-DEVICE CONFLICT SCENARIOS
// =============================================================================

describe('Two-Device Conflict Scenarios', () => {
  it('should resolve conflict when Device A edits before Device B', async () => {
    const recipeId = 1;

    // Device A makes edit at 10:00
    const deviceAEdit = {
      id: recipeId,
      name: 'Device A Edit',
      category: 'Main Courses',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, deviceAEdit);

    // Device A syncs to cloud
    await syncToCloud(deviceAEdit, 'DeviceA');

    // Device B makes edit at 10:05 (5 minutes later)
    const deviceBEdit = {
      id: recipeId,
      name: 'Device B Edit',
      category: 'Desserts',
      updatedAt: '2024-01-15T10:05:00.000Z',
    };
    localRecipesDeviceB.set(recipeId, deviceBEdit);

    // Device B syncs to cloud
    const syncResult = await syncToCloud(deviceBEdit, 'DeviceB');

    expect(syncResult.action).toBe('updated');
    expect(cloudRecipes.get(recipeId).name).toBe('Device B Edit');
    expect(cloudRecipes.get(recipeId).lastSyncedBy).toBe('DeviceB');
  });

  it('should resolve conflict when Device B edits before Device A', async () => {
    const recipeId = 1;

    // Device B makes edit first at 10:00
    const deviceBEdit = {
      id: recipeId,
      name: 'Device B First',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    localRecipesDeviceB.set(recipeId, deviceBEdit);
    await syncToCloud(deviceBEdit, 'DeviceB');

    // Device A makes edit later at 10:10
    const deviceAEdit = {
      id: recipeId,
      name: 'Device A Later',
      updatedAt: '2024-01-15T10:10:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, deviceAEdit);
    await syncToCloud(deviceAEdit, 'DeviceA');

    // Device A's later edit should win
    expect(cloudRecipes.get(recipeId).name).toBe('Device A Later');
  });

  it('should handle simultaneous edits (within same second)', async () => {
    const recipeId = 1;

    // Both devices edit almost simultaneously
    const deviceAEdit = {
      id: recipeId,
      name: 'Device A Simultaneous',
      updatedAt: '2024-01-15T10:00:00.100Z', // 100ms
    };

    const deviceBEdit = {
      id: recipeId,
      name: 'Device B Simultaneous',
      updatedAt: '2024-01-15T10:00:00.200Z', // 200ms (100ms later)
    };

    // Device A syncs first
    await syncToCloud(deviceAEdit, 'DeviceA');
    expect(cloudRecipes.get(recipeId).name).toBe('Device A Simultaneous');

    // Device B syncs second (with newer timestamp)
    await syncToCloud(deviceBEdit, 'DeviceB');
    expect(cloudRecipes.get(recipeId).name).toBe('Device B Simultaneous');
  });

  it('should propagate winning version to other devices', async () => {
    const recipeId = 1;

    // Device A creates recipe
    const deviceARecipe = {
      id: recipeId,
      name: 'Original Recipe',
      updatedAt: '2024-01-15T09:00:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, deviceARecipe);
    await syncToCloud(deviceARecipe, 'DeviceA');

    // Device B edits with newer timestamp
    const deviceBEdit = {
      id: recipeId,
      name: 'Device B Update',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    localRecipesDeviceB.set(recipeId, deviceBEdit);
    await syncToCloud(deviceBEdit, 'DeviceB');

    // Device A pulls from cloud
    await syncFromCloud(localRecipesDeviceA, 'DeviceA');

    // Device A should now have Device B's version
    expect(localRecipesDeviceA.get(recipeId).name).toBe('Device B Update');
  });
});

// =============================================================================
// OFFLINE CONFLICT SCENARIOS
// =============================================================================

describe('Offline Conflict Scenarios', () => {
  it('should resolve conflict when device comes back online', async () => {
    const recipeId = 1;

    // Initial state - both devices have same version
    const initialRecipe = {
      id: recipeId,
      name: 'Initial Recipe',
      updatedAt: '2024-01-15T09:00:00.000Z',
    };
    cloudRecipes.set(recipeId, initialRecipe);
    localRecipesDeviceA.set(recipeId, { ...initialRecipe });
    localRecipesDeviceB.set(recipeId, { ...initialRecipe });

    // Device A goes offline and makes edit
    deviceAOnline = false;
    const deviceAOfflineEdit = {
      id: recipeId,
      name: 'Device A Offline Edit',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, deviceAOfflineEdit);

    // Meanwhile, Device B (online) makes edit
    const deviceBOnlineEdit = {
      id: recipeId,
      name: 'Device B Online Edit',
      updatedAt: '2024-01-15T10:30:00.000Z', // 30 min later
    };
    localRecipesDeviceB.set(recipeId, deviceBOnlineEdit);
    await syncToCloud(deviceBOnlineEdit, 'DeviceB');

    // Device A comes back online and tries to sync
    deviceAOnline = true;
    const syncResult = await syncToCloud(deviceAOfflineEdit, 'DeviceA');

    // Device B's edit was newer, so Device A's edit should be skipped
    expect(syncResult.action).toBe('skipped');
    expect(cloudRecipes.get(recipeId).name).toBe('Device B Online Edit');
  });

  it('should handle offline edits that are newer than cloud', async () => {
    const recipeId = 1;

    // Cloud has old version
    const cloudRecipe = {
      id: recipeId,
      name: 'Old Cloud Version',
      updatedAt: '2024-01-15T08:00:00.000Z',
    };
    cloudRecipes.set(recipeId, cloudRecipe);

    // Device A was offline but made newer edit
    const deviceAOfflineEdit = {
      id: recipeId,
      name: 'Newer Offline Edit',
      updatedAt: '2024-01-15T12:00:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, deviceAOfflineEdit);

    // Device A syncs
    const syncResult = await syncToCloud(deviceAOfflineEdit, 'DeviceA');

    expect(syncResult.action).toBe('updated');
    expect(cloudRecipes.get(recipeId).name).toBe('Newer Offline Edit');
  });

  it('should handle multiple offline edits from same device', async () => {
    const recipeId = 1;

    // Device A goes offline and makes multiple edits
    deviceAOnline = false;

    const edit1 = {
      id: recipeId,
      name: 'First Offline Edit',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, edit1);

    const edit2 = {
      id: recipeId,
      name: 'Second Offline Edit',
      updatedAt: '2024-01-15T10:05:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, edit2);

    const edit3 = {
      id: recipeId,
      name: 'Third Offline Edit',
      updatedAt: '2024-01-15T10:10:00.000Z',
    };
    localRecipesDeviceA.set(recipeId, edit3);

    // Device A comes online - only latest state is synced
    deviceAOnline = true;
    await syncToCloud(localRecipesDeviceA.get(recipeId), 'DeviceA');

    // Cloud should have the final edit
    expect(cloudRecipes.get(recipeId).name).toBe('Third Offline Edit');
  });
});

// =============================================================================
// FIELD-LEVEL CONFLICT TESTS
// =============================================================================

describe('Field-Level Conflict Behavior', () => {
  it('should replace entire document even when only one field differs', async () => {
    const recipeId = 1;

    // Device A has version with specific values
    const deviceAVersion = {
      id: recipeId,
      name: 'Same Name',
      category: 'Main Courses',
      portions: 4,
      notes: 'Device A notes',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    await syncToCloud(deviceAVersion, 'DeviceA');

    // Device B only changes notes but has newer timestamp
    const deviceBVersion = {
      id: recipeId,
      name: 'Same Name',
      category: 'Main Courses',
      portions: 4,
      notes: 'Device B notes', // Only this changed
      updatedAt: '2024-01-15T10:05:00.000Z',
    };
    await syncToCloud(deviceBVersion, 'DeviceB');

    // Entire document is replaced
    const cloudVersion = cloudRecipes.get(recipeId);
    expect(cloudVersion.notes).toBe('Device B notes');
    expect(cloudVersion.name).toBe('Same Name');
    expect(cloudVersion.lastSyncedBy).toBe('DeviceB');
  });

  it('should handle field addition in newer version', async () => {
    const recipeId = 1;

    // Original version without notes
    const originalVersion = {
      id: recipeId,
      name: 'Recipe',
      category: 'Main',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    await syncToCloud(originalVersion, 'DeviceA');

    // Newer version adds notes field
    const versionWithNotes = {
      id: recipeId,
      name: 'Recipe',
      category: 'Main',
      notes: 'New notes field',
      updatedAt: '2024-01-15T10:05:00.000Z',
    };
    await syncToCloud(versionWithNotes, 'DeviceB');

    expect(cloudRecipes.get(recipeId).notes).toBe('New notes field');
  });

  it('should handle field removal in newer version', async () => {
    const recipeId = 1;

    // Original version with notes
    const originalVersion = {
      id: recipeId,
      name: 'Recipe',
      notes: 'Has notes',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    await syncToCloud(originalVersion, 'DeviceA');

    // Newer version removes notes (undefined/null)
    const versionWithoutNotes = {
      id: recipeId,
      name: 'Recipe',
      notes: null,
      updatedAt: '2024-01-15T10:05:00.000Z',
    };
    await syncToCloud(versionWithoutNotes, 'DeviceB');

    expect(cloudRecipes.get(recipeId).notes).toBeNull();
  });
});

// =============================================================================
// RAPID EDIT TESTS
// =============================================================================

describe('Rapid Edit Handling', () => {
  it('should handle rapid sequential edits from same device', async () => {
    const recipeId = 1;
    const edits = [];

    // Simulate rapid edits (1ms apart)
    for (let i = 0; i < 10; i++) {
      const edit = {
        id: recipeId,
        name: `Edit ${i + 1}`,
        updatedAt: new Date(Date.now() + i).toISOString(),
      };
      edits.push(edit);
      await syncToCloud(edit, 'DeviceA');
    }

    // Last edit should be in cloud
    expect(cloudRecipes.get(recipeId).name).toBe('Edit 10');
  });

  it('should handle interleaved rapid edits from multiple devices', async () => {
    const recipeId = 1;
    const baseTime = Date.now();

    // Device A and B make alternating rapid edits
    const edits = [
      { device: 'A', time: baseTime },
      { device: 'B', time: baseTime + 10 },
      { device: 'A', time: baseTime + 20 },
      { device: 'B', time: baseTime + 30 },
      { device: 'A', time: baseTime + 40 },
    ];

    for (const edit of edits) {
      await syncToCloud(
        {
          id: recipeId,
          name: `Device ${edit.device} at ${edit.time}`,
          updatedAt: new Date(edit.time).toISOString(),
        },
        `Device${edit.device}`
      );
    }

    // Last edit (Device A at baseTime + 40) should win
    const cloudVersion = cloudRecipes.get(recipeId);
    expect(cloudVersion.lastSyncedBy).toBe('DeviceA');
    expect(cloudVersion.name).toContain('Device A');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Conflict Resolution Edge Cases', () => {
  it('should handle timezone differences in timestamps', () => {
    // Same moment in time, different timezone representations
    const utcVersion = {
      id: 1,
      name: 'UTC Version',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    // This is the same moment but represented differently
    const localVersion = {
      id: 1,
      name: 'Local Version',
      updatedAt: '2024-01-15T05:00:00.000-05:00', // UTC-5 = same as 10:00 UTC
    };

    const { winner, reason } = resolveConflict(utcVersion, localVersion);

    // Should be identical timestamps
    expect(reason).toBe('identical_timestamps_prefer_cloud');
  });

  it('should handle invalid date strings gracefully', () => {
    const validVersion = {
      id: 1,
      name: 'Valid Date',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const invalidVersion = {
      id: 1,
      name: 'Invalid Date',
      updatedAt: 'not-a-date',
    };

    // NOTE: JavaScript's Date comparison with NaN (invalid date) always returns false
    // This means invalid dates will fall through to return version2 in our current logic
    // This documents actual behavior - in production, dates should be validated before storage
    const { winner } = resolveConflict(validVersion, invalidVersion);

    // When validVersion is version1 and invalidVersion is version2:
    // - date1.getTime() === date2.getTime() is false (valid timestamp !== NaN)
    // - date1 > date2 is false (comparisons with NaN always return false)
    // - Falls through to return version2 (invalidVersion)
    expect(winner).toBe(invalidVersion);

    // Reverse order: invalid as version1, valid as version2
    const { winner: winner2 } = resolveConflict(invalidVersion, validVersion);
    // - date1.getTime() === date2.getTime() is false
    // - date1 > date2 is false (NaN > anything is false)
    // - Falls through to return version2 (validVersion)
    expect(winner2).toBe(validVersion);
  });

  it('should handle very old timestamps', () => {
    const oldVersion = {
      id: 1,
      name: 'Year 2000',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };

    const newVersion = {
      id: 1,
      name: 'Year 2024',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const { winner } = resolveConflict(oldVersion, newVersion);
    expect(winner.name).toBe('Year 2024');
  });

  it('should handle future timestamps', () => {
    const currentVersion = {
      id: 1,
      name: 'Current',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const futureVersion = {
      id: 1,
      name: 'Future (clock skew)',
      updatedAt: '2025-01-15T10:00:00.000Z', // 1 year in future
    };

    const { winner } = resolveConflict(currentVersion, futureVersion);

    // Future timestamp still wins (system trusts timestamps)
    expect(winner.name).toBe('Future (clock skew)');
  });

  it('should handle millisecond precision timestamps', () => {
    const version1 = {
      id: 1,
      name: 'Version 1',
      updatedAt: '2024-01-15T10:00:00.001Z', // 1ms
    };

    const version2 = {
      id: 1,
      name: 'Version 2',
      updatedAt: '2024-01-15T10:00:00.002Z', // 2ms (1ms later)
    };

    const { winner } = resolveConflict(version1, version2);
    expect(winner.name).toBe('Version 2');
  });
});

// =============================================================================
// MULTI-RECORD CONFLICT TESTS
// =============================================================================

describe('Multi-Record Conflict Handling', () => {
  it('should resolve conflicts independently for each record', async () => {
    // Recipe 1: Device A is newer
    const recipe1DeviceA = {
      id: 1,
      name: 'Recipe 1 - Device A',
      updatedAt: '2024-01-15T11:00:00.000Z',
    };
    const recipe1DeviceB = {
      id: 1,
      name: 'Recipe 1 - Device B',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    // Recipe 2: Device B is newer
    const recipe2DeviceA = {
      id: 2,
      name: 'Recipe 2 - Device A',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };
    const recipe2DeviceB = {
      id: 2,
      name: 'Recipe 2 - Device B',
      updatedAt: '2024-01-15T11:00:00.000Z',
    };

    // Sync both devices
    await syncToCloud(recipe1DeviceB, 'DeviceB');
    await syncToCloud(recipe1DeviceA, 'DeviceA');

    await syncToCloud(recipe2DeviceA, 'DeviceA');
    await syncToCloud(recipe2DeviceB, 'DeviceB');

    // Each recipe should have correct winner
    expect(cloudRecipes.get(1).name).toBe('Recipe 1 - Device A');
    expect(cloudRecipes.get(2).name).toBe('Recipe 2 - Device B');
  });

  it('should handle batch sync with mixed conflicts', async () => {
    // Simulate batch of local changes
    const localBatch = [
      { id: 1, name: 'Local 1', updatedAt: '2024-01-15T12:00:00.000Z' },
      { id: 2, name: 'Local 2', updatedAt: '2024-01-15T09:00:00.000Z' },
      { id: 3, name: 'Local 3', updatedAt: '2024-01-15T11:00:00.000Z' },
    ];

    // Pre-existing cloud data
    cloudRecipes.set(1, {
      id: 1,
      name: 'Cloud 1',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });
    cloudRecipes.set(2, {
      id: 2,
      name: 'Cloud 2',
      updatedAt: '2024-01-15T11:00:00.000Z',
    });
    // Recipe 3 doesn't exist in cloud

    // Sync batch
    const results = [];
    for (const recipe of localBatch) {
      results.push(await syncToCloud(recipe, 'DeviceA'));
    }

    // Recipe 1: Local wins (12:00 > 10:00)
    expect(results[0].action).toBe('updated');
    expect(cloudRecipes.get(1).name).toBe('Local 1');

    // Recipe 2: Cloud wins (11:00 > 09:00)
    expect(results[1].action).toBe('skipped');
    expect(cloudRecipes.get(2).name).toBe('Cloud 2');

    // Recipe 3: Created (didn't exist)
    expect(results[2].action).toBe('created');
    expect(cloudRecipes.get(3).name).toBe('Local 3');
  });
});

// =============================================================================
// SYNC DIRECTION TESTS
// =============================================================================

describe('Sync Direction Handling', () => {
  it('should correctly identify push vs pull operations', async () => {
    const recipeId = 1;

    // Setup: Cloud is newer
    cloudRecipes.set(recipeId, {
      id: recipeId,
      name: 'Cloud Version',
      updatedAt: '2024-01-15T12:00:00.000Z',
    });

    localRecipesDeviceA.set(recipeId, {
      id: recipeId,
      name: 'Local Version',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });

    // Pull from cloud should update local
    const pullResults = await syncFromCloud(localRecipesDeviceA, 'DeviceA');

    expect(pullResults).toHaveLength(1);
    expect(pullResults[0].action).toBe('updated_from_cloud');
    expect(localRecipesDeviceA.get(recipeId).name).toBe('Cloud Version');
  });

  it('should handle bidirectional sync correctly', async () => {
    // Device A has recipe 1 (newer) and recipe 2 (older)
    localRecipesDeviceA.set(1, {
      id: 1,
      name: 'Local Recipe 1',
      updatedAt: '2024-01-15T12:00:00.000Z',
    });
    localRecipesDeviceA.set(2, {
      id: 2,
      name: 'Local Recipe 2',
      updatedAt: '2024-01-15T08:00:00.000Z',
    });

    // Cloud has recipe 1 (older) and recipe 2 (newer)
    cloudRecipes.set(1, {
      id: 1,
      name: 'Cloud Recipe 1',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });
    cloudRecipes.set(2, {
      id: 2,
      name: 'Cloud Recipe 2',
      updatedAt: '2024-01-15T11:00:00.000Z',
    });

    // Push local to cloud
    await syncToCloud(localRecipesDeviceA.get(1), 'DeviceA');
    await syncToCloud(localRecipesDeviceA.get(2), 'DeviceA');

    // Pull cloud to local
    await syncFromCloud(localRecipesDeviceA, 'DeviceA');

    // Recipe 1: Local was newer, cloud should have local version
    expect(cloudRecipes.get(1).name).toBe('Local Recipe 1');

    // Recipe 2: Cloud was newer, local should have cloud version
    expect(localRecipesDeviceA.get(2).name).toBe('Cloud Recipe 2');
  });
});

// =============================================================================
// CONFLICT LOGGING AND DEBUGGING
// =============================================================================

describe('Conflict Logging', () => {
  it('should provide detailed conflict resolution info', () => {
    const conflicts = [];

    const logConflict = (local, cloud, resolution) => {
      conflicts.push({
        recordId: local.id,
        localTimestamp: local.updatedAt,
        cloudTimestamp: cloud.updatedAt,
        winner: resolution.winner === local ? 'local' : 'cloud',
        reason: resolution.reason,
        localName: local.name,
        cloudName: cloud.name,
        resolvedName: resolution.winner.name,
      });
    };

    const local = {
      id: 1,
      name: 'Local Edit',
      updatedAt: '2024-01-15T10:00:00.000Z',
    };

    const cloud = {
      id: 1,
      name: 'Cloud Edit',
      updatedAt: '2024-01-15T11:00:00.000Z',
    };

    const resolution = resolveConflict(local, cloud);
    logConflict(local, cloud, resolution);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      recordId: 1,
      localTimestamp: '2024-01-15T10:00:00.000Z',
      cloudTimestamp: '2024-01-15T11:00:00.000Z',
      winner: 'cloud',
      reason: 'timestamp_newer',
      localName: 'Local Edit',
      cloudName: 'Cloud Edit',
      resolvedName: 'Cloud Edit',
    });
  });
});
