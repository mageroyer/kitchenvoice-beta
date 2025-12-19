/**
 * Settings Storage Service
 *
 * Manages application settings in localStorage
 */

const SETTINGS_KEY = 'smartcookbook_settings';

const DEFAULT_SETTINGS = {
  claudeApiKey: '',
  voiceLanguage: 'fr-CA',
  autoSave: true,
  theme: 'light',
  ingredientMode: 'standard', // 'standard' or 'advanced'
};

/**
 * Get all settings
 * @returns {Object} Settings object
 */
export function getSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save all settings
 * @param {Object} settings - Settings object to save
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

/**
 * Get a specific setting value
 * @param {string} key - Setting key
 * @returns {any} Setting value
 */
export function getSetting(key) {
  const settings = getSettings();
  return settings[key];
}

/**
 * Update a specific setting
 * @param {string} key - Setting key
 * @param {any} value - New value
 */
export function updateSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  return saveSettings(settings);
}

/**
 * Get Claude API key
 * @deprecated SECURITY WARNING: Storing API keys in localStorage is insecure.
 * Use the Cloud Function proxy instead (services/ai/claudeAPI.js useCloudFunction=true)
 * @returns {string} API key or empty string
 */
export function getClaudeApiKey() {
  console.warn('⚠️ getClaudeApiKey: Storing API keys in localStorage is insecure. Use Cloud Function proxy.');
  return getSetting('claudeApiKey') || '';
}

/**
 * Save Claude API key
 * @deprecated SECURITY WARNING: Storing API keys in localStorage is insecure.
 * Use the Cloud Function proxy instead.
 * @param {string} apiKey - Claude API key
 */
export function saveClaudeApiKey(apiKey) {
  console.warn('⚠️ saveClaudeApiKey: Storing API keys in localStorage is insecure. Use Cloud Function proxy.');
  return updateSetting('claudeApiKey', apiKey);
}

/**
 * Clear all settings
 */
export function clearSettings() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing settings:', error);
    return false;
  }
}

export default {
  getSettings,
  saveSettings,
  getSetting,
  updateSetting,
  getClaudeApiKey,
  saveClaudeApiKey,
  clearSettings,
};
