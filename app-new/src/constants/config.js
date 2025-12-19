// Application configuration constants
export const APP_CONFIG = {
  NAME: import.meta.env.VITE_APP_NAME || 'SmartCookBook',
  VERSION: '2.0.0',
  ENV: import.meta.env.VITE_APP_ENV || 'development',

  // Feature flags
  FEATURES: {
    VOICE_INPUT: true,
    OFFLINE_MODE: true,
    FIREBASE_SYNC: true,
    INVOICE_PROCESSING: false, // Enable in Phase 1
    MULTI_LANGUAGE: false,     // Future: English/French
  },

  // Default recipe settings
  DEFAULT_PORTIONS: 4,

  // Voice recognition settings
  VOICE: {
    LANGUAGE: 'en-US', // or 'fr-FR' for French
    CONTINUOUS: false,
    INTERIM_RESULTS: true,
    MAX_ALTERNATIVES: 1,
  },

  // Database settings
  DATABASE: {
    NAME: 'KitchenRecipeDB',
    VERSION: 1,
  },

  // UI settings
  UI: {
    ITEMS_PER_PAGE: 20,
    DEBOUNCE_DELAY: 300, // milliseconds for search/input debouncing
    TOAST_DURATION: 3000, // milliseconds
  },

  // File upload settings (for invoices - Phase 1)
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ACCEPTED_FORMATS: ['image/jpeg', 'image/png', 'application/pdf'],
    MAX_BATCH_SIZE: 20,
  },
};

// Export environment check helpers
export const isDevelopment = () => APP_CONFIG.ENV === 'development';
export const isProduction = () => APP_CONFIG.ENV === 'production';
export const isFeatureEnabled = (feature) => APP_CONFIG.FEATURES[feature] || false;
