/**
 * E2E Test: New User Setup Flow
 *
 * Tests the complete onboarding flow for a new user:
 * 1. User registers account
 * 2. Business setup wizard runs
 * 3. Default departments created
 * 4. Internal vendor created
 * 5. Kitchen settings initialized
 * 6. User can access main app
 *
 * This simulates the full journey from registration to first use.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// Mock State (Simulates Firebase + IndexedDB)
// ============================================

const appState = {
  // Auth state
  auth: {
    currentUser: null,
    isAuthenticated: false
  },
  // Firestore user document
  userDoc: null,
  // IndexedDB state
  database: {
    departments: [],
    categories: [],
    vendors: [],
    kitchenSettings: null,
    recipes: [],
    inventoryItems: []
  },
  // UI state
  ui: {
    currentPage: 'landing',
    wizardStep: 0,
    wizardComplete: false
  }
};

function resetAppState() {
  appState.auth = { currentUser: null, isAuthenticated: false };
  appState.userDoc = null;
  appState.database = {
    departments: [],
    categories: [],
    vendors: [],
    kitchenSettings: null,
    recipes: [],
    inventoryItems: []
  };
  appState.ui = {
    currentPage: 'landing',
    wizardStep: 0,
    wizardComplete: false
  };
}

// ============================================
// Auth Service (Simulates Firebase Auth)
// ============================================

const AuthService = {
  async register(email, password, displayName) {
    // Validate
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Create user
    const uid = `user_${Date.now()}`;
    appState.auth.currentUser = {
      uid,
      email,
      displayName: displayName || email.split('@')[0]
    };
    appState.auth.isAuthenticated = true;

    return appState.auth.currentUser;
  },

  async login(email, password) {
    if (!appState.auth.currentUser || appState.auth.currentUser.email !== email) {
      throw new Error('User not found');
    }
    appState.auth.isAuthenticated = true;
    return appState.auth.currentUser;
  },

  async logout() {
    appState.auth.isAuthenticated = false;
  },

  getCurrentUser() {
    return appState.auth.isAuthenticated ? appState.auth.currentUser : null;
  }
};

// ============================================
// Business Setup Service
// ============================================

const DEFAULT_DEPARTMENTS = [
  { name: 'Kitchen', color: '#4CAF50', order: 1 },
  { name: 'Pastry', color: '#E91E63', order: 2 },
  { name: 'Garde Manger', color: '#2196F3', order: 3 }
];

const DEFAULT_CATEGORIES = {
  'Kitchen': ['Main Course', 'Appetizers', 'Soups', 'Sauces'],
  'Pastry': ['Desserts', 'Breads', 'Pastries', 'Ice Cream'],
  'Garde Manger': ['Salads', 'Cold Appetizers', 'Charcuterie']
};

const BusinessSetupService = {
  async initializeForNewUser(businessData) {
    const { businessName, businessType, departments } = businessData;

    // 1. Create user document in Firestore
    appState.userDoc = {
      businessName,
      businessType,
      setupComplete: false,
      createdAt: new Date().toISOString()
    };

    // 2. Create departments
    const deptList = departments || DEFAULT_DEPARTMENTS;
    for (const dept of deptList) {
      const id = appState.database.departments.length + 1;
      appState.database.departments.push({
        id,
        ...dept,
        isActive: true,
        createdAt: new Date().toISOString()
      });

      // 3. Create categories for each department
      const cats = DEFAULT_CATEGORIES[dept.name] || [];
      for (const catName of cats) {
        appState.database.categories.push({
          id: appState.database.categories.length + 1,
          name: catName,
          departmentId: id,
          departmentName: dept.name,
          isActive: true
        });
      }
    }

    // 4. Create internal vendor
    appState.database.vendors.push({
      id: 1,
      name: 'In-House Production',
      vendorCode: 'INTERNAL',
      isInternal: true,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    // 5. Initialize kitchen settings
    appState.database.kitchenSettings = {
      id: 1,
      businessName,
      defaultDepartment: deptList[0].name,
      trackProduction: true,
      trackInventory: true,
      requirePinForEdit: false,
      autoSyncEnabled: true,
      createdAt: new Date().toISOString()
    };

    // 6. Mark setup complete
    appState.userDoc.setupComplete = true;
    appState.ui.wizardComplete = true;

    return {
      departments: appState.database.departments,
      categories: appState.database.categories,
      vendors: appState.database.vendors,
      settings: appState.database.kitchenSettings
    };
  },

  isSetupComplete() {
    return appState.userDoc?.setupComplete === true;
  },

  async getBusinessInfo() {
    return appState.userDoc;
  }
};

// ============================================
// Navigation Service
// ============================================

const NavigationService = {
  navigate(page) {
    appState.ui.currentPage = page;
  },

  getCurrentPage() {
    return appState.ui.currentPage;
  },

  canAccessApp() {
    return appState.auth.isAuthenticated && BusinessSetupService.isSetupComplete();
  }
};

// ============================================
// Tests
// ============================================

describe('New User Setup Flow', () => {
  beforeEach(() => {
    resetAppState();
  });

  describe('Registration', () => {
    it('should register new user with email and password', async () => {
      const user = await AuthService.register(
        'chef@restaurant.com',
        'securepass123',
        'Chef John'
      );

      expect(user.email).toBe('chef@restaurant.com');
      expect(user.displayName).toBe('Chef John');
      expect(user.uid).toBeDefined();
      expect(appState.auth.isAuthenticated).toBe(true);
    });

    it('should reject invalid email', async () => {
      await expect(
        AuthService.register('invalid-email', 'password123')
      ).rejects.toThrow('Invalid email');
    });

    it('should reject short password', async () => {
      await expect(
        AuthService.register('chef@restaurant.com', '123')
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should use email prefix as display name if not provided', async () => {
      const user = await AuthService.register('newchef@kitchen.com', 'password123');
      expect(user.displayName).toBe('newchef');
    });
  });

  describe('Business Setup Wizard', () => {
    beforeEach(async () => {
      await AuthService.register('owner@myrestaurant.com', 'password123', 'Restaurant Owner');
    });

    it('should initialize business with default departments', async () => {
      const result = await BusinessSetupService.initializeForNewUser({
        businessName: 'My Restaurant',
        businessType: 'restaurant'
      });

      expect(result.departments).toHaveLength(3);
      expect(result.departments.map(d => d.name)).toEqual([
        'Kitchen', 'Pastry', 'Garde Manger'
      ]);
    });

    it('should create categories for each department', async () => {
      const result = await BusinessSetupService.initializeForNewUser({
        businessName: 'My Restaurant',
        businessType: 'restaurant'
      });

      const kitchenCategories = result.categories.filter(
        c => c.departmentName === 'Kitchen'
      );
      expect(kitchenCategories.length).toBeGreaterThan(0);
      expect(kitchenCategories.map(c => c.name)).toContain('Main Course');
    });

    it('should create internal vendor for in-house production', async () => {
      const result = await BusinessSetupService.initializeForNewUser({
        businessName: 'My Restaurant',
        businessType: 'restaurant'
      });

      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].name).toBe('In-House Production');
      expect(result.vendors[0].isInternal).toBe(true);
    });

    it('should initialize kitchen settings', async () => {
      const result = await BusinessSetupService.initializeForNewUser({
        businessName: 'My Restaurant',
        businessType: 'restaurant'
      });

      expect(result.settings.businessName).toBe('My Restaurant');
      expect(result.settings.trackProduction).toBe(true);
      expect(result.settings.trackInventory).toBe(true);
    });

    it('should mark setup as complete', async () => {
      expect(BusinessSetupService.isSetupComplete()).toBe(false);

      await BusinessSetupService.initializeForNewUser({
        businessName: 'My Restaurant',
        businessType: 'restaurant'
      });

      expect(BusinessSetupService.isSetupComplete()).toBe(true);
    });

    it('should allow custom departments', async () => {
      const customDepts = [
        { name: 'Hot Kitchen', color: '#FF5722', order: 1 },
        { name: 'Cold Kitchen', color: '#03A9F4', order: 2 }
      ];

      const result = await BusinessSetupService.initializeForNewUser({
        businessName: 'Custom Kitchen',
        businessType: 'catering',
        departments: customDepts
      });

      expect(result.departments).toHaveLength(2);
      expect(result.departments.map(d => d.name)).toEqual([
        'Hot Kitchen', 'Cold Kitchen'
      ]);
    });
  });

  describe('Post-Setup Navigation', () => {
    it('should not allow app access before setup', async () => {
      await AuthService.register('user@test.com', 'password123');

      expect(NavigationService.canAccessApp()).toBe(false);
    });

    it('should allow app access after setup complete', async () => {
      await AuthService.register('user@test.com', 'password123');
      await BusinessSetupService.initializeForNewUser({
        businessName: 'Test Kitchen',
        businessType: 'restaurant'
      });

      expect(NavigationService.canAccessApp()).toBe(true);
    });

    it('should redirect to recipes page after setup', async () => {
      await AuthService.register('user@test.com', 'password123');
      await BusinessSetupService.initializeForNewUser({
        businessName: 'Test Kitchen',
        businessType: 'restaurant'
      });

      NavigationService.navigate('recipes');
      expect(NavigationService.getCurrentPage()).toBe('recipes');
    });
  });

  describe('Complete Onboarding Flow', () => {
    it('should complete full onboarding journey', async () => {
      // Step 1: User lands on landing page
      expect(appState.ui.currentPage).toBe('landing');
      expect(appState.auth.isAuthenticated).toBe(false);

      // Step 2: User clicks "Get Started" and registers
      NavigationService.navigate('register');
      const user = await AuthService.register(
        'newowner@mykitchen.com',
        'mypassword123',
        'Kitchen Owner'
      );
      expect(user).toBeDefined();
      expect(appState.auth.isAuthenticated).toBe(true);

      // Step 3: User is redirected to setup wizard
      NavigationService.navigate('setup');
      expect(NavigationService.canAccessApp()).toBe(false);

      // Step 4: User completes business setup
      const setupResult = await BusinessSetupService.initializeForNewUser({
        businessName: 'My Professional Kitchen',
        businessType: 'restaurant'
      });

      expect(setupResult.departments.length).toBeGreaterThan(0);
      expect(setupResult.vendors.length).toBeGreaterThan(0);
      expect(setupResult.settings).toBeDefined();

      // Step 5: User can now access the app
      expect(NavigationService.canAccessApp()).toBe(true);

      // Step 6: User navigates to recipes page
      NavigationService.navigate('recipes');
      expect(NavigationService.getCurrentPage()).toBe('recipes');

      // Step 7: Verify all initial data is in place
      expect(appState.database.departments.length).toBe(3);
      expect(appState.database.categories.length).toBeGreaterThan(0);
      expect(appState.database.vendors.length).toBe(1);
      expect(appState.database.kitchenSettings).not.toBeNull();
    });
  });

  describe('Return User Login', () => {
    it('should allow existing user to login and access app', async () => {
      // Setup: Create and setup user
      await AuthService.register('returning@user.com', 'password123');
      await BusinessSetupService.initializeForNewUser({
        businessName: 'Established Kitchen',
        businessType: 'restaurant'
      });

      // Logout
      await AuthService.logout();
      expect(appState.auth.isAuthenticated).toBe(false);

      // Login again
      await AuthService.login('returning@user.com', 'password123');
      expect(appState.auth.isAuthenticated).toBe(true);

      // Should still have access (setup was completed)
      expect(NavigationService.canAccessApp()).toBe(true);
    });
  });
});
