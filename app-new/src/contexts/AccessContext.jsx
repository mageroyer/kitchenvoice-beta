/**
 * Access Context
 *
 * Manages the current access level based on PIN authentication
 * Provides access control throughout the app
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  verifyPin,
  canPerformAction,
  hasAccessToDepartment,
  ACCESS_LEVELS
} from '../services/auth/privilegesService';
import { isDemoMode } from '../services/demo/demoService';
import { useAuth } from './AuthContext';

// Create context
const AccessContext = createContext(null);

// Helper to get saved department from localStorage
const getSavedDepartment = () => {
  try {
    const saved = localStorage.getItem('smartcookbook_department');
    // In demo mode, default to first demo department if not set
    if (isDemoMode() && !saved) {
      return 'Cuisine';
    }
    return saved || 'Cuisine';
  } catch {
    return 'Cuisine';
  }
};

// Helper to save department to localStorage
const saveDepartment = (dept) => {
  try {
    localStorage.setItem('smartcookbook_department', dept);
  } catch {
    // Ignore storage errors
  }
};

// Demo owner privilege - full access for demo users
const DEMO_OWNER_PRIVILEGE = {
  id: 'demo-owner',
  name: 'Demo Owner',
  accessLevel: ACCESS_LEVELS.OWNER,
  departments: null // null = all departments
};

// Authenticated user owner privilege - full access for logged-in users
const AUTH_OWNER_PRIVILEGE = {
  id: 'auth-owner',
  name: 'Owner',
  accessLevel: ACCESS_LEVELS.OWNER,
  departments: null // null = all departments
};

/**
 * Access Provider Component
 */
export function AccessProvider({ children }) {
  // Get Firebase auth state
  const { isAuthenticated: isFirebaseAuthenticated, user } = useAuth();

  // Track demo mode state reactively
  const [inDemoMode, setInDemoMode] = useState(() => isDemoMode());

  // Current privilege (null = viewer mode, auto-set to owner in demo mode or when authenticated)
  const [currentPrivilege, setCurrentPrivilege] = useState(() => {
    if (isDemoMode()) return DEMO_OWNER_PRIVILEGE;
    return null; // Will be set by useEffect when auth state is known
  });
  // Current department - load from localStorage
  const [currentDepartment, setCurrentDepartment] = useState(getSavedDepartment);
  // PIN modal visibility
  const [showPinModal, setShowPinModal] = useState(false);
  // Pending action after PIN verification
  const [pendingAction, setPendingAction] = useState(null);

  // Grant owner privileges when authenticated with Firebase
  useEffect(() => {
    if (isFirebaseAuthenticated && user) {
      // User is logged in via Firebase - grant owner privileges
      const authPrivilege = {
        ...AUTH_OWNER_PRIVILEGE,
        name: user.displayName || user.email?.split('@')[0] || 'Owner'
      };
      setCurrentPrivilege(authPrivilege);
    } else if (!isFirebaseAuthenticated && !isDemoMode()) {
      // User logged out and not in demo mode - clear privileges
      if (currentPrivilege?.id === 'auth-owner') {
        setCurrentPrivilege(null);
      }
    }
  }, [isFirebaseAuthenticated, user]);

  // Listen for demo mode changes (check on storage event and periodically)
  useEffect(() => {
    const checkDemoMode = () => {
      const currentDemoMode = isDemoMode();
      setInDemoMode(currentDemoMode);

      // Auto-set owner privilege when demo mode is enabled (only if not already authenticated)
      if (currentDemoMode && !isFirebaseAuthenticated && (!currentPrivilege || currentPrivilege.id !== 'demo-owner')) {
        setCurrentPrivilege(DEMO_OWNER_PRIVILEGE);
      }
    };

    // Check immediately
    checkDemoMode();

    // Listen for storage events (cross-tab)
    window.addEventListener('storage', checkDemoMode);

    // Also check when navigating (for same-tab changes)
    const interval = setInterval(checkDemoMode, 500);

    return () => {
      window.removeEventListener('storage', checkDemoMode);
      clearInterval(interval);
    };
  }, [isFirebaseAuthenticated]);

  // Clear demo privilege when exiting demo mode
  useEffect(() => {
    if (!inDemoMode && currentPrivilege?.id === 'demo-owner') {
      setCurrentPrivilege(null);
    }
  }, [inDemoMode, currentPrivilege]);

  /**
   * Attempt to authenticate with a PIN
   * @param {string} pin - The PIN to verify
   * @returns {Promise<Object>} Result with success status and privilege
   */
  const authenticateWithPin = useCallback(async (pin) => {
    try {
      const privilege = await verifyPin(pin);

      if (!privilege) {
        return { success: false, error: 'Invalid PIN' };
      }

      setCurrentPrivilege(privilege);

      // If editor, set to first available department
      if (privilege.accessLevel === ACCESS_LEVELS.EDITOR && privilege.departments?.length > 0) {
        if (!privilege.departments.includes(currentDepartment)) {
          const newDept = privilege.departments[0];
          setCurrentDepartment(newDept);
          saveDepartment(newDept);
        }
      }

      return { success: true, privilege };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: error.message };
    }
  }, [currentDepartment]);

  /**
   * Log out (return to viewer mode)
   */
  const logout = useCallback(() => {
    setCurrentPrivilege(null);
  }, []);

  /**
   * Check if current user can perform an action
   * @param {string} action - Action to check
   * @returns {boolean}
   */
  const canDo = useCallback((action) => {
    return canPerformAction(currentPrivilege, action);
  }, [currentPrivilege]);

  /**
   * Check if current user has access to a department
   * @param {string} department - Department name
   * @returns {boolean}
   */
  const hasAccess = useCallback((department) => {
    if (!currentPrivilege) return true; // Viewers can see all (read-only)
    return hasAccessToDepartment(currentPrivilege, department);
  }, [currentPrivilege]);

  /**
   * Request PIN authentication for an action
   * @param {string} action - Action description
   * @param {Function} callback - Callback to execute after successful auth
   */
  const requestPinForAction = useCallback((action, callback) => {
    setPendingAction({ action, callback });
    setShowPinModal(true);
  }, []);

  /**
   * Handle successful PIN entry
   */
  const handlePinSuccess = useCallback((privilege) => {
    setShowPinModal(false);
    if (pendingAction?.callback) {
      pendingAction.callback(privilege);
    }
    setPendingAction(null);
  }, [pendingAction]);

  /**
   * Handle PIN modal close
   */
  const handlePinClose = useCallback(() => {
    setShowPinModal(false);
    setPendingAction(null);
  }, []);

  /**
   * Switch department (owner only)
   * @param {string} department - Department name
   * @returns {boolean} Success status
   */
  const switchDepartment = useCallback((department) => {
    if (!canPerformAction(currentPrivilege, 'switch_department')) {
      // Check if editor has access to this department
      if (currentPrivilege?.accessLevel === ACCESS_LEVELS.EDITOR) {
        if (currentPrivilege.departments?.includes(department)) {
          setCurrentDepartment(department);
          saveDepartment(department);
          return true;
        }
      }
      return false;
    }

    setCurrentDepartment(department);
    saveDepartment(department);
    return true;
  }, [currentPrivilege]);

  /**
   * Get available departments for current user
   * @returns {Array<string>}
   */
  const getAvailableDepartments = useCallback(() => {
    if (!currentPrivilege) return []; // Viewer has no department switching
    if (currentPrivilege.accessLevel === ACCESS_LEVELS.OWNER) return null; // null = all departments
    return currentPrivilege.departments || [];
  }, [currentPrivilege]);

  /**
   * Update current department directly (used after setup wizard)
   * @param {string} department - Department name
   */
  const updateDepartment = useCallback((department) => {
    setCurrentDepartment(department);
    saveDepartment(department);
  }, []);

  /**
   * Reload department from localStorage (useful after external changes)
   */
  const reloadDepartment = useCallback(() => {
    const saved = getSavedDepartment();
    setCurrentDepartment(saved);
  }, []);

  // Context value
  const value = {
    // State
    currentPrivilege,
    currentDepartment,
    showPinModal,
    pendingAction,
    isAuthenticated: !!currentPrivilege,
    isOwner: currentPrivilege?.accessLevel === ACCESS_LEVELS.OWNER,
    isEditor: currentPrivilege?.accessLevel === ACCESS_LEVELS.EDITOR,
    isViewer: !currentPrivilege,
    userName: currentPrivilege?.name || 'Guest',

    // Actions
    authenticateWithPin,
    logout,
    canDo,
    hasAccess,
    requestPinForAction,
    handlePinSuccess,
    handlePinClose,
    switchDepartment,
    getAvailableDepartments,
    setShowPinModal,
    updateDepartment,
    reloadDepartment,

    // Constants
    ACCESS_LEVELS
  };

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  );
}

/**
 * Hook to use access context
 */
export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error('useAccess must be used within an AccessProvider');
  }
  return context;
}

export default AccessContext;
