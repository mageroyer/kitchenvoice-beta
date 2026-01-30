import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db as firestore, auth } from '../services/database/firebase';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import Badge from '../components/common/Badge';
import Spinner from '../components/common/Spinner';
import { getSettings, saveSettings } from '../services/settings/settingsStorage';
import {
  kitchenSettingsDB,
  RESTRICTION_LEVELS,
  RESTRICTION_LEVEL_CONFIG
} from '../services/database/indexedDB';
import {
  exportAndDownload,
  EXPORT_TYPES,
  readJSONFile,
  validateImportData,
  importData
} from '../services/backup/backupService';
import {
  runFullCleanup,
  validateDataIntegrity
} from '../services/database/cleanupService';
import CreditsDisplay from '../components/common/CreditsDisplay';
import styles from '../styles/pages/settings.module.css';

/**
 * Settings Page
 *
 * Manage application settings
 */
function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(getSettings());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Kitchen settings (from IndexedDB)
  const [restrictionLevel, setRestrictionLevel] = useState(RESTRICTION_LEVELS.STANDARD);
  const [laborRate, setLaborRate] = useState(18);
  const [kitchenSettingsLoaded, setKitchenSettingsLoaded] = useState(false);

  // Backup/Export state
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // Validation preview before import
  const fileInputRef = useRef(null);

  // Data cleanup state
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);

  // Cloud data clear state
  const [clearingCloud, setClearingCloud] = useState(false);
  const [clearCloudStatus, setClearCloudStatus] = useState('');

  // Load kitchen settings on mount
  useEffect(() => {
    const loadKitchenSettings = async () => {
      try {
        const level = await kitchenSettingsDB.getRestrictionLevel();
        const rate = await kitchenSettingsDB.getDefaultLaborRate();
        setRestrictionLevel(level);
        setLaborRate(rate);
        setKitchenSettingsLoaded(true);
      } catch (err) {
        console.error('Error loading kitchen settings:', err);
        setKitchenSettingsLoaded(true);
      }
    };
    loadKitchenSettings();
  }, []);

  const handleSave = async () => {
    setError('');
    setSaved(false);

    try {
      // Save local settings
      const success = saveSettings(settings);
      if (!success) {
        throw new Error('Failed to save local settings');
      }

      // Save kitchen settings to IndexedDB
      await kitchenSettingsDB.setRestrictionLevel(restrictionLevel);
      await kitchenSettingsDB.setDefaultLaborRate(laborRate);

      setSaved(true);
      // Navigate back to recipe list after short delay
      setTimeout(() => {
        navigate('/recipes');
      }, 500);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings. Please try again.');
    }
  };

  const handleReset = () => {
    if (confirm('Reset all settings to default? This cannot be undone.')) {
      const defaultSettings = {
        voiceLanguage: 'fr-CA',
        autoSave: true,
        theme: 'light',
        ingredientMode: 'standard',
      };
      setSettings(defaultSettings);
      saveSettings(defaultSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleCancel = () => {
    navigate(-1); // Go back to previous page
  };

  // Handle /**
 * Handles exporting kitchen data in the specified format
 * @async
 * @function handleExport
 * @param {string} type - The export format type (e.g., 'json', 'csv')
 * @returns {Promise<void>} Promise that resolves when export is complete
 * @throws {Error} When export operation fails
 */
export
  const handleExport = async (type) => {
    setExporting(true);
    setError('');
    try {
      await exportAndDownload({ type });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export data: ' + err.message);
    }
    setExporting(false);
  };

  // Handle import file selection
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file selected for import - show validation preview first
  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setImportResult(null);
    setImportPreview(null);

    try {
      // Read and parse file
      const data = await readJSONFile(file);

      // Validate and show preview
      const validation = validateImportData(data);

      setImportPreview({
        data,
        validation,
        fileName: file.name
      });

    } catch (err) {
      console.error('Import error:', err);
      setError('Failed to read file: ' + err.message);
    }

    // Reset file input
    event.target.value = '';
  };

  // Confirm and perform import
  const handleConfirmImport = async () => {
    if (!importPreview?.data) return;

    setImporting(true);
    setError('');

    try {
      const result = await importData(importPreview.data, { skipDuplicates: true });
      setImportResult(result);
      setImportPreview(null);

      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 5000);
      } else {
        setError('Import completed with errors: ' + result.errors.join(', '));
      }
    } catch (err) {
      console.error('Import error:', err);
      setError('Failed to import data: ' + err.message);
    }

    setImporting(false);
  };

  // Cancel import preview
  const handleCancelImport = () => {
    setImportPreview(null);
  };

  // Run data cleanup (dry run first)
  const handleCleanupCheck = async () => {
    setCleanupRunning(true);
    setCleanupResult(null);
    setError('');

    try {
      const result = await runFullCleanup({ dryRun: true });
      setCleanupResult(result);
    } catch (err) {
      console.error('Cleanup check error:', err);
      setError('Failed to check data: ' + err.message);
    }

    setCleanupRunning(false);
  };

  // Run data cleanup (fix issues)
  const handleCleanupFix = async () => {
    if (!confirm('This will fix all detected data issues. Continue?')) {
      return;
    }

    setCleanupRunning(true);
    setError('');

    try {
      const result = await runFullCleanup({ dryRun: false });
      setCleanupResult(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      console.error('Cleanup fix error:', err);
      setError('Failed to fix data: ' + err.message);
    }

    setCleanupRunning(false);
  };

  // Clear cleanup results
  const handleCleanupDismiss = () => {
    setCleanupResult(null);
  };

  // Clear all cloud data from Firestore
  const handleClearCloudData = useCallback(async () => {
    if (!confirm('⚠️ WARNING: This will DELETE ALL your cloud data (recipes, departments, categories, inventory, invoices, etc.).\n\nThis cannot be undone!\n\nAre you sure?')) {
      return;
    }

    if (!confirm('This is your LAST CHANCE to cancel.\n\nPress OK to permanently delete all cloud data.')) {
      return;
    }

    setClearingCloud(true);
    setClearCloudStatus('Starting...');

    try {
      if (!auth || !auth.currentUser) {
        alert('Not logged in. Please login first.');
        setClearingCloud(false);
        return;
      }

      const userId = auth.currentUser.uid;
      const syncId = `user_${userId}`;

      // Collections under /cookbooks/{syncId}/
      const cookbookCollections = [
        'recipes', 'departments', 'categories', 'vendors',
        'inventoryItems', 'invoices', 'invoiceLineItems',
        'stockTransactions', 'purchaseOrders', 'purchaseOrderLines',
        'priceHistory', 'ingredients'
      ];

      // Collections under /users/{userId}/
      const userCollections = ['tasks', 'privileges', 'settings'];

      let totalDeleted = 0;

      // Clear cookbook collections
      for (const colName of cookbookCollections) {
        setClearCloudStatus(`Clearing ${colName}...`);
        const colRef = collection(firestore, 'cookbooks', syncId, colName);
        const snapshot = await getDocs(colRef);

        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(firestore, 'cookbooks', syncId, colName, docSnap.id));
          totalDeleted++;
        }
      }

      // Clear user collections
      for (const colName of userCollections) {
        setClearCloudStatus(`Clearing user ${colName}...`);
        const colRef = collection(firestore, 'users', userId, colName);
        const snapshot = await getDocs(colRef);

        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(firestore, 'users', userId, colName, docSnap.id));
          totalDeleted++;
        }
      }

      setClearCloudStatus(`✅ Deleted ${totalDeleted} documents from cloud`);
      alert(`Successfully deleted ${totalDeleted} documents from Firestore.\n\nNow clear your browser data to start fresh.`);
    } catch (err) {
      console.error('Error clearing cloud data:', err);
      setClearCloudStatus(`❌ Error: ${err.message}`);
      alert('Error clearing cloud data: ' + err.message);
    } finally {
      setClearingCloud(false);
    }
  }, []);

  return (
    <div className={styles.settingsPage}>
      <div className={styles.header}>
        <h1>⚙️ Settings</h1>
        <p>Configure your SmartCookBook application</p>
      </div>

      {saved && (
        <Alert variant="success" dismissible onDismiss={() => setSaved(false)}>
          Settings saved successfully!
        </Alert>
      )}

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* API Credits */}
      <CreditsDisplay />

      {/* Voice Settings */}
      <Card>
        <h2>🎤 Voice Recognition</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Configure voice input settings
        </p>

        <div className={styles.settingGroup}>
          <label className={styles.label}>Language</label>
          <select
            value={settings.voiceLanguage}
            onChange={(e) => setSettings({ ...settings, voiceLanguage: e.target.value })}
            className={styles.select}
          >
            <option value="fr-CA">French (Canada)</option>
            <option value="fr-FR">French (France)</option>
            <option value="en-US">English (United States)</option>
            <option value="en-GB">English (United Kingdom)</option>
          </select>
        </div>
      </Card>

      {/* Editor Settings */}
      <Card>
        <h2>📝 Recipe Editor</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Configure recipe editing behavior
        </p>

        <div className={styles.settingGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => setSettings({ ...settings, autoSave: e.target.checked })}
            />
            <span>Enable auto-save (saves changes automatically on blur)</span>
          </label>
        </div>

        <div className={styles.settingGroup}>
          <label className={styles.label}>Ingredient Highlighting Mode</label>
          <p className={styles.hint} style={{ marginBottom: '10px' }}>
            Controls which fields are highlighted as needing attention
          </p>
          <div className={styles.ingredientModeOptions}>
            <label
              className={`${styles.modeCard} ${settings.ingredientMode !== 'advanced' ? styles.selected : ''}`}
              onClick={() => setSettings({ ...settings, ingredientMode: 'standard' })}
            >
              <input
                type="radio"
                name="ingredientMode"
                checked={settings.ingredientMode !== 'advanced'}
                onChange={() => setSettings({ ...settings, ingredientMode: 'standard' })}
              />
              <div className={styles.modeContent}>
                <span className={styles.modeName}>Standard</span>
                <span className={styles.modeDesc}>Highlights missing metric measurements only (required for scaling)</span>
              </div>
            </label>
            <label
              className={`${styles.modeCard} ${settings.ingredientMode === 'advanced' ? styles.selected : ''}`}
              onClick={() => setSettings({ ...settings, ingredientMode: 'advanced' })}
            >
              <input
                type="radio"
                name="ingredientMode"
                checked={settings.ingredientMode === 'advanced'}
                onChange={() => setSettings({ ...settings, ingredientMode: 'advanced' })}
              />
              <div className={styles.modeContent}>
                <span className={styles.modeName}>Advanced</span>
                <span className={styles.modeDesc}>Also highlights ingredients not linked to database</span>
              </div>
            </label>
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <h2>🎨 Appearance</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Customize the look and feel
        </p>

        <div className={styles.settingGroup}>
          <label className={styles.label}>Theme</label>
          <select
            value={settings.theme}
            onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
            className={styles.select}
          >
            <option value="light">Light</option>
            <option value="dark">Dark (Coming Soon)</option>
            <option value="auto">Auto (System)</option>
          </select>
        </div>
      </Card>

      {/* Kitchen Operations Settings */}
      <Card>
        <h2>🏭 Kitchen Operations</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Configure how your kitchen operates - from quick entry to full accounting
        </p>

        {/* Restriction Level */}
        <div className={styles.settingGroup}>
          <label className={styles.label}>Operation Mode</label>
          <div className={styles.restrictionLevels}>
            {Object.entries(RESTRICTION_LEVEL_CONFIG).map(([level, config]) => {
              const levelNum = parseInt(level);
              const isSelected = restrictionLevel === levelNum;
              return (
                <div
                  key={level}
                  className={`${styles.restrictionCard} ${isSelected ? styles.selected : ''}`}
                  onClick={() => setRestrictionLevel(levelNum)}
                >
                  <div className={styles.restrictionHeader}>
                    <input
                      type="radio"
                      name="restrictionLevel"
                      checked={isSelected}
                      onChange={() => setRestrictionLevel(levelNum)}
                    />
                    <span className={styles.restrictionName}>{config.name}</span>
                  </div>
                  <p className={styles.restrictionDesc}>{config.description}</p>
                  <ul className={styles.restrictionFeatures}>
                    <li>
                      {config.requireCosts ? '✓' : '○'} Cost tracking
                    </li>
                    <li>
                      {config.trackProduction ? '✓' : '○'} Production logs
                    </li>
                    <li>
                      {config.requireApproval ? '✓' : '○'} Approval workflow
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Labor Rate */}
        <div className={styles.settingGroup}>
          <label className={styles.label}>
            Default Labor Rate ($/hour)
            <span className={styles.optional}>Used for production cost calculations</span>
          </label>
          <input
            type="number"
            value={laborRate}
            onChange={(e) => setLaborRate(parseFloat(e.target.value) || 0)}
            min="0"
            step="0.5"
            className={styles.numberInput}
          />
          <p className={styles.hint}>
            Average hourly rate for kitchen staff. Used to calculate labor costs in production logs.
          </p>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className={styles.actionButtons}>
        <Button
          variant="secondary"
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
        >
          Reset to Defaults
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
        >
          Save Settings
        </Button>
      </div>

      {/* Backup & Export */}
      <Card>
        <h2>💾 Backup & Export</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Export your recipes and data for backup or transfer to another device
        </p>

        {/* Export Options */}
        <div className={styles.settingGroup}>
          <label className={styles.label}>Export Data</label>
          <div className={styles.exportOptions}>
            <div className={styles.exportCard}>
              <div className={styles.exportInfo}>
                <strong>Full Backup</strong>
                <span>All recipes, departments, and categories</span>
              </div>
              <Button
                variant="primary"
                size="small"
                onClick={() => handleExport(EXPORT_TYPES.FULL)}
                loading={exporting}
                disabled={exporting}
              >
                Export All
              </Button>
            </div>

            <div className={styles.exportCard}>
              <div className={styles.exportInfo}>
                <strong>Recipes Only</strong>
                <span>Export just your recipes</span>
              </div>
              <Button
                variant="secondary"
                size="small"
                onClick={() => handleExport(EXPORT_TYPES.RECIPES_ONLY)}
                loading={exporting}
                disabled={exporting}
              >
                Export Recipes
              </Button>
            </div>
          </div>
        </div>

        {/* Import */}
        <div className={styles.settingGroup}>
          <label className={styles.label}>Import Data</label>
          <p className={styles.hint} style={{ marginBottom: '15px' }}>
            Restore from a previous backup. Duplicate recipes will be skipped.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".json"
            style={{ display: 'none' }}
          />

          {!importPreview && (
            <Button
              variant="outline"
              onClick={handleImportClick}
              loading={importing}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Import from JSON File'}
            </Button>
          )}

          {/* Import Validation Preview */}
          {importPreview && (
            <div className={styles.importPreview}>
              <div className={styles.previewHeader}>
                <strong>📄 {importPreview.fileName}</strong>
                {importPreview.validation.valid ? (
                  <Badge variant="success">Valid</Badge>
                ) : (
                  <Badge variant="danger">Invalid</Badge>
                )}
              </div>

              {/* Summary */}
              <div className={styles.previewSummary}>
                <div className={styles.previewStat}>
                  <span className={styles.statNumber}>{importPreview.validation.details.recipesTotal}</span>
                  <span className={styles.statLabel}>Recipes</span>
                </div>
                <div className={styles.previewStat}>
                  <span className={styles.statNumber}>{importPreview.validation.details.departmentsTotal}</span>
                  <span className={styles.statLabel}>Departments</span>
                </div>
                <div className={styles.previewStat}>
                  <span className={styles.statNumber}>{importPreview.validation.details.categoriesTotal}</span>
                  <span className={styles.statLabel}>Categories</span>
                </div>
              </div>

              {/* Recipe validation details */}
              {importPreview.validation.details.recipesTotal > 0 && (
                <div className={styles.previewDetails}>
                  <span style={{ color: '#27ae60' }}>
                    ✓ {importPreview.validation.details.recipesValid} valid
                  </span>
                  {importPreview.validation.details.recipesInvalid > 0 && (
                    <span style={{ color: '#e74c3c' }}>
                      ✗ {importPreview.validation.details.recipesInvalid} invalid
                    </span>
                  )}
                </div>
              )}

              {/* Duplicates within file */}
              {importPreview.validation.details.duplicatesInFile?.length > 0 && (
                <div className={styles.previewWarning}>
                  <strong>⚠️ Duplicate names in file:</strong>
                  <ul>
                    {importPreview.validation.details.duplicatesInFile.map((dup, i) => (
                      <li key={i}>"{dup.name}" appears {dup.count} times</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {importPreview.validation.errors.length > 0 && (
                <div className={styles.previewErrors}>
                  <strong>❌ Errors ({importPreview.validation.errors.length}):</strong>
                  <ul>
                    {importPreview.validation.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importPreview.validation.errors.length > 10 && (
                      <li style={{ fontStyle: 'italic' }}>
                        ...and {importPreview.validation.errors.length - 10} more errors
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {importPreview.validation.warnings.length > 0 && (
                <div className={styles.previewWarnings}>
                  <strong>⚠️ Warnings ({importPreview.validation.warnings.length}):</strong>
                  <ul>
                    {importPreview.validation.warnings.slice(0, 5).map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                    {importPreview.validation.warnings.length > 5 && (
                      <li style={{ fontStyle: 'italic' }}>
                        ...and {importPreview.validation.warnings.length - 5} more warnings
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.previewActions}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleCancelImport}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleConfirmImport}
                  loading={importing}
                  disabled={importing || !importPreview.validation.valid}
                >
                  {importing ? 'Importing...' : 'Confirm Import'}
                </Button>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className={styles.importResult}>
              <strong>Import Complete:</strong>
              <ul>
                <li>Recipes: {importResult.imported.recipes} imported, {importResult.skipped.recipes} skipped</li>
                <li>Departments: {importResult.imported.departments} imported, {importResult.skipped.departments} skipped</li>
                <li>Categories: {importResult.imported.categories} imported, {importResult.skipped.categories} skipped</li>
              </ul>
              {importResult.errors.length > 0 && (
                <div className={styles.importErrors}>
                  <strong>Errors:</strong>
                  <ul>
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Info Section */}
      <Card variant="outlined">
        <h3>ℹ️ About Settings</h3>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#666' }}>
          Settings are stored locally in your browser's localStorage. They will persist
          across sessions but are device-specific. If you clear your browser data, you'll
          need to re-enter your preferences.
        </p>
      </Card>

    </div>
  );
}

export default SettingsPage;
