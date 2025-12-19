/**
 * Privileges Service
 *
 * Manages PIN-based access control for employees
 * - Owner creates privileges with PIN + departments
 * - Staff enters PIN to unlock their access level
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../database/firebase';
import firebaseCache, { CACHE_KEYS, CACHE_TTL } from '../database/firebaseCache';

// Access levels
export const ACCESS_LEVELS = {
  VIEWER: 'viewer',     // View only (default, no PIN needed)
  EDITOR: 'editor',     // Edit and create recipes
  OWNER: 'owner'        // Full access: delete, control panel, switch departments
};

// Collection name
const PRIVILEGES_COLLECTION = 'privileges';

/**
 * Get the privileges collection reference for current user
 */
function getPrivilegesCollection() {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return collection(db, 'users', user.uid, PRIVILEGES_COLLECTION);
}

/**
 * Get all privileges for the current user
 * @param {boolean} [bypassCache=false] - Skip cache and fetch fresh data
 * @returns {Promise<Array>} Array of privilege objects
 */
export async function getAllPrivileges(bypassCache = false) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const cacheKey = firebaseCache.generateKey(CACHE_KEYS.PRIVILEGES, user.uid);

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const cached = firebaseCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const privilegesRef = getPrivilegesCollection();
    const snapshot = await getDocs(privilegesRef);

    const privileges = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Cache for 5 minutes (privileges don't change often)
    firebaseCache.set(cacheKey, privileges, CACHE_TTL.DEFAULT);

    return privileges;
  } catch (error) {
    console.error('Error getting privileges:', error);
    throw error;
  }
}

/**
 * Verify a PIN and return the associated privilege
 * Uses cached privileges list to avoid extra Firestore queries
 * @param {string} pin - The PIN to verify
 * @returns {Promise<Object|null>} Privilege object if found, null otherwise
 */
export async function verifyPin(pin) {
  try {
    // Use cached privileges list instead of separate query
    const allPrivileges = await getAllPrivileges();
    const privilege = allPrivileges.find(p => p.pin === pin);
    return privilege || null;
  } catch (error) {
    console.error('Error verifying PIN:', error);
    throw error;
  }
}

/**
 * Invalidate privileges cache (call after any privilege mutation)
 */
export function invalidatePrivilegesCache() {
  const user = auth.currentUser;
  if (user) {
    const cacheKey = firebaseCache.generateKey(CACHE_KEYS.PRIVILEGES, user.uid);
    firebaseCache.invalidate(cacheKey);
  }
}

/**
 * Create a new privilege
 * @param {Object} privilegeData - Privilege data
 * @param {string} privilegeData.name - Employee name
 * @param {string} privilegeData.pin - 4-6 digit PIN
 * @param {string} privilegeData.accessLevel - ACCESS_LEVELS value
 * @param {Array<string>} privilegeData.departments - Array of department names
 * @returns {Promise<string>} New privilege ID
 */
export async function createPrivilege(privilegeData) {
  try {
    const { name, pin, accessLevel, departments, position } = privilegeData;

    // Validate PIN format
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      throw new Error('PIN must be 4-6 digits');
    }

    // Check if PIN already exists
    const existing = await verifyPin(pin);
    if (existing) {
      throw new Error('This PIN is already in use');
    }

    // Validate access level
    if (!Object.values(ACCESS_LEVELS).includes(accessLevel)) {
      throw new Error('Invalid access level');
    }

    const privilegesRef = getPrivilegesCollection();
    const docRef = await addDoc(privilegesRef, {
      name: name.trim(),
      pin,
      accessLevel,
      departments: departments || [],
      position: position || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Invalidate cache after creating
    invalidatePrivilegesCache();

    console.log('✅ Privilege created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating privilege:', error);
    throw error;
  }
}

/**
 * Update an existing privilege
 * @param {string} privilegeId - Privilege document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updatePrivilege(privilegeId, updates) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // If updating PIN, check it's not already in use
    if (updates.pin) {
      if (updates.pin.length < 4 || updates.pin.length > 6 || !/^\d+$/.test(updates.pin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      const existing = await verifyPin(updates.pin);
      if (existing && existing.id !== privilegeId) {
        throw new Error('This PIN is already in use');
      }
    }

    const privilegeRef = doc(db, 'users', user.uid, PRIVILEGES_COLLECTION, privilegeId);
    await updateDoc(privilegeRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });

    // Invalidate cache after updating
    invalidatePrivilegesCache();

    console.log('✅ Privilege updated:', privilegeId);
  } catch (error) {
    console.error('Error updating privilege:', error);
    throw error;
  }
}

/**
 * Delete a privilege
 * @param {string} privilegeId - Privilege document ID
 * @returns {Promise<void>}
 */
export async function deletePrivilege(privilegeId) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const privilegeRef = doc(db, 'users', user.uid, PRIVILEGES_COLLECTION, privilegeId);
    await deleteDoc(privilegeRef);

    // Invalidate cache after deleting
    invalidatePrivilegesCache();

    console.log('✅ Privilege deleted:', privilegeId);
  } catch (error) {
    console.error('Error deleting privilege:', error);
    throw error;
  }
}

/**
 * Add a department to a privilege
 * @param {string} privilegeId - Privilege document ID
 * @param {string} department - Department name to add
 * @returns {Promise<void>}
 */
export async function addDepartmentToPrivilege(privilegeId, department) {
  try {
    const privileges = await getAllPrivileges();
    const privilege = privileges.find(p => p.id === privilegeId);

    if (!privilege) {
      throw new Error('Privilege not found');
    }

    const departments = privilege.departments || [];
    if (!departments.includes(department)) {
      departments.push(department);
      await updatePrivilege(privilegeId, { departments });
    }
  } catch (error) {
    console.error('Error adding department:', error);
    throw error;
  }
}

/**
 * Remove a department from a privilege
 * @param {string} privilegeId - Privilege document ID
 * @param {string} department - Department name to remove
 * @returns {Promise<void>}
 */
export async function removeDepartmentFromPrivilege(privilegeId, department) {
  try {
    const privileges = await getAllPrivileges();
    const privilege = privileges.find(p => p.id === privilegeId);

    if (!privilege) {
      throw new Error('Privilege not found');
    }

    const departments = (privilege.departments || []).filter(d => d !== department);
    await updatePrivilege(privilegeId, { departments });
  } catch (error) {
    console.error('Error removing department:', error);
    throw error;
  }
}

/**
 * Check if a privilege has access to a specific department
 * @param {Object} privilege - Privilege object
 * @param {string} department - Department name
 * @returns {boolean}
 */
export function hasAccessToDepartment(privilege, department) {
  if (!privilege) return false;
  if (privilege.accessLevel === ACCESS_LEVELS.OWNER) return true;
  return privilege.departments?.includes(department) || false;
}

/**
 * Check if a privilege can perform an action
 * @param {Object} privilege - Privilege object (null = viewer)
 * @param {string} action - Action to check: 'view', 'edit', 'create', 'delete', 'control_panel', 'switch_department'
 * @returns {boolean}
 */
export function canPerformAction(privilege, action) {
  // No privilege = viewer (view only)
  if (!privilege) {
    return action === 'view';
  }

  const level = privilege.accessLevel;

  switch (action) {
    case 'view':
      return true;

    case 'edit':
    case 'create':
      return level === ACCESS_LEVELS.EDITOR || level === ACCESS_LEVELS.OWNER;

    case 'delete':
    case 'control_panel':
    case 'switch_department':
    case 'manage_privileges':
      return level === ACCESS_LEVELS.OWNER;

    default:
      return false;
  }
}

/**
 * Get display name for access level
 * @param {string} accessLevel - ACCESS_LEVELS value
 * @returns {string}
 */
export function getAccessLevelDisplay(accessLevel) {
  switch (accessLevel) {
    case ACCESS_LEVELS.VIEWER:
      return 'Viewer';
    case ACCESS_LEVELS.EDITOR:
      return 'Editor';
    case ACCESS_LEVELS.OWNER:
      return 'Owner (Full Access)';
    default:
      return 'Unknown';
  }
}

/**
 * Create initial owner privilege for a newly registered user
 * @param {string} userId - Firebase user ID
 * @param {string} ownerName - Owner's name
 * @param {string} ownerPin - 4-6 digit PIN for owner access
 * @returns {Promise<string>} New privilege ID
 */
export async function createInitialOwnerPrivilege(userId, ownerName, ownerPin) {
  try {
    // Validate PIN format
    if (!ownerPin || ownerPin.length < 4 || ownerPin.length > 6 || !/^\d+$/.test(ownerPin)) {
      throw new Error('PIN must be 4-6 digits');
    }

    const privilegesRef = collection(db, 'users', userId, PRIVILEGES_COLLECTION);
    const docRef = await addDoc(privilegesRef, {
      name: ownerName.trim(),
      pin: ownerPin,
      accessLevel: ACCESS_LEVELS.OWNER,
      departments: [], // Owner has access to all departments
      position: 'Owner',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log('✅ Initial owner privilege created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating initial owner privilege:', error);
    throw error;
  }
}

/**
 * Check if a user has any privileges set up
 * @param {string} userId - Firebase user ID
 * @returns {Promise<boolean>} True if user has privileges
 */
export async function hasPrivilegesSetup(userId) {
  try {
    const privilegesRef = collection(db, 'users', userId, PRIVILEGES_COLLECTION);
    const snapshot = await getDocs(privilegesRef);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking privileges setup:', error);
    return false;
  }
}

/**
 * Seed test users for development
 * Creates 4 fake users if they don't exist
 * @returns {Promise<void>}
 */
export async function seedTestUsers() {
  const testUsers = [
    {
      name: 'Jean-Pierre Dupont',
      pin: '1111',
      accessLevel: ACCESS_LEVELS.EDITOR,
      departments: ['Cuisine'],
      position: 'Sous Chef'
    },
    {
      name: 'Marie Tremblay',
      pin: '2222',
      accessLevel: ACCESS_LEVELS.EDITOR,
      departments: ['Cuisine'],
      position: 'Line Cook'
    },
    {
      name: 'Lucas Martin',
      pin: '3333',
      accessLevel: ACCESS_LEVELS.VIEWER,
      departments: ['Cuisine'],
      position: 'Prep Cook'
    },
    {
      name: 'Sophie Gagnon',
      pin: '4444',
      accessLevel: ACCESS_LEVELS.EDITOR,
      departments: ['Cuisine', 'Pastry'],
      position: 'Pastry Chef'
    }
  ];

  try {
    const existing = await getAllPrivileges();

    for (const user of testUsers) {
      // Check if user with this PIN already exists
      const exists = existing.some(p => p.pin === user.pin);
      if (!exists) {
        await createPrivilege(user);
        console.log(`✅ Test user created: ${user.name}`);
      } else {
        console.log(`⏭️ Test user already exists: ${user.name}`);
      }
    }

    console.log('✅ Test users seeding complete');
  } catch (error) {
    console.error('Error seeding test users:', error);
    throw error;
  }
}
