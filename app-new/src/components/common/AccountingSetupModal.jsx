/**
 * AccountingSetupModal Component
 *
 * Modal for configuring accounting settings:
 * - QuickBooks Online integration
 * - Tax handling (TPS/TVQ)
 * - Invoice approval workflow
 * - COGS account mapping
 * - Accountant access
 */

import { useState, useEffect } from 'react';
import Button from './Button';
import Input from './Input';
import Alert from './Alert';
import { kitchenSettingsDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/accountingsetupmodal.module.css';

// QuickBooks plan options
const QB_PLANS = [
  { value: 'none', label: 'Not using QuickBooks' },
  { value: 'simple_start', label: 'Simple Start' },
  { value: 'essentials', label: 'Essentials' },
  { value: 'plus', label: 'Plus' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'unknown', label: "I don't know yet" }
];

// Tax configuration options
const TAX_OPTIONS = [
  { value: 'combined', label: 'Combined (TPS+TVQ together)' },
  { value: 'separate', label: 'Separate (TPS and TVQ as separate lines)' },
  { value: 'no_tax', label: 'No tax tracking needed' }
];

// Approval workflow options
const APPROVAL_OPTIONS = [
  { value: 'none', label: 'No approval needed - direct sync to QuickBooks', icon: '⚡' },
  { value: 'accountant', label: 'Accountant reviews and approves before sync', icon: '👤' },
  { value: 'manager_accountant', label: 'Manager reviews, then Accountant approves', icon: '👥' }
];

// Default COGS categories for restaurants
const DEFAULT_COGS_CATEGORIES = [
  { category: 'Meat', account: '' },
  { category: 'Seafood', account: '' },
  { category: 'Dairy', account: '' },
  { category: 'Produce', account: '' },
  { category: 'Dry Goods', account: '' },
  { category: 'Beverages', account: '' },
  { category: 'Frozen', account: '' },
  { category: 'Other', account: '' }
];

function AccountingSetupModal({ isOpen, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [settings, setSettings] = useState({
    quickbooksPlan: 'unknown',
    taxHandling: 'separate',
    approvalWorkflow: 'accountant',
    defaultCOGSAccount: '',
    accountantEmail: '',
    accountantName: '',
    cogsMapping: DEFAULT_COGS_CATEGORIES
  });

  // Load existing settings on mount
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const saved = await kitchenSettingsDB.get('accountingSettings');
      if (saved) {
        setSettings(prev => ({ ...prev, ...saved }));
      }
    } catch (err) {
      console.error('Error loading accounting settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Validate email if provided
      if (settings.accountantEmail &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.accountantEmail)) {
        setError('Please enter a valid email address');
        setSaving(false);
        return;
      }

      // Save to IndexedDB
      await kitchenSettingsDB.set('accountingSettings', settings);

      setSuccess('Accounting settings saved successfully!');

      if (onSave) {
        onSave(settings);
      }

      // Auto-close after success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error saving accounting settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateCOGSMapping = (index, value) => {
    setSettings(prev => ({
      ...prev,
      cogsMapping: prev.cogsMapping.map((item, i) =>
        i === index ? { ...item, account: value } : item
      )
    }));
  };

  const applyDefaultAccount = () => {
    if (!settings.defaultCOGSAccount.trim()) return;
    setSettings(prev => ({
      ...prev,
      cogsMapping: prev.cogsMapping.map(item => ({
        ...item,
        account: item.account || settings.defaultCOGSAccount
      }))
    }));
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerIcon}>💰</div>
          <div>
            <h2 className={styles.title}>Accounting Setup</h2>
            <p className={styles.subtitle}>Configure invoices, QuickBooks, and cost tracking</p>
          </div>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading settings...</div>
          ) : (
            <>
              {/* Alerts */}
              {error && (
                <Alert variant="danger" dismissible onDismiss={() => setError('')}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert variant="success">
                  {success}
                </Alert>
              )}

              {/* Section 1: QuickBooks */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>QuickBooks Online</h3>

                <div className={styles.formGroup}>
                  <label className={styles.label}>QuickBooks Plan</label>
                  <select
                    className={styles.select}
                    value={settings.quickbooksPlan}
                    onChange={(e) => setSettings(prev => ({ ...prev, quickbooksPlan: e.target.value }))}
                  >
                    {QB_PLANS.map(plan => (
                      <option key={plan.value} value={plan.value}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                  {settings.quickbooksPlan !== 'none' && settings.quickbooksPlan !== 'unknown' && (
                    <p className={styles.hint}>
                      Go to Settings → QuickBooks to connect your account
                    </p>
                  )}
                </div>
              </div>

              {/* Section 2: Tax Handling */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Tax Handling (Quebec)</h3>

                <div className={styles.formGroup}>
                  <div className={styles.taxOptions}>
                    {TAX_OPTIONS.map(opt => (
                      <label key={opt.value} className={styles.radioCard}>
                        <input
                          type="radio"
                          name="taxHandling"
                          value={opt.value}
                          checked={settings.taxHandling === opt.value}
                          onChange={(e) => setSettings(prev => ({ ...prev, taxHandling: e.target.value }))}
                        />
                        <span className={styles.radioCardContent}>
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className={styles.hint}>
                    TPS (5%) + TVQ (9.975%) = 14.975% total for Quebec
                  </p>
                </div>
              </div>

              {/* Section 3: Approval Workflow */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Invoice Approval Workflow</h3>

                <div className={styles.workflowOptions}>
                  {APPROVAL_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className={`${styles.workflowCard} ${settings.approvalWorkflow === opt.value ? styles.selected : ''}`}
                    >
                      <input
                        type="radio"
                        name="approvalWorkflow"
                        value={opt.value}
                        checked={settings.approvalWorkflow === opt.value}
                        onChange={(e) => setSettings(prev => ({ ...prev, approvalWorkflow: e.target.value }))}
                      />
                      <span className={styles.workflowIcon}>{opt.icon}</span>
                      <span className={styles.workflowLabel}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Section 4: COGS Account Mapping */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>COGS Account Mapping</h3>
                <p className={styles.sectionDesc}>
                  Map ingredient categories to QuickBooks expense accounts
                </p>

                <div className={styles.defaultAccountRow}>
                  <Input
                    value={settings.defaultCOGSAccount}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultCOGSAccount: e.target.value }))}
                    placeholder="Default account name (e.g., Cost of Goods Sold)"
                  />
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={applyDefaultAccount}
                    disabled={!settings.defaultCOGSAccount.trim()}
                  >
                    Apply to All
                  </Button>
                </div>

                <div className={styles.cogsGrid}>
                  {settings.cogsMapping.map((item, index) => (
                    <div key={item.category} className={styles.cogsRow}>
                      <span className={styles.cogsCategory}>{item.category}</span>
                      <Input
                        value={item.account}
                        onChange={(e) => updateCOGSMapping(index, e.target.value)}
                        placeholder={`Account for ${item.category}`}
                        size="small"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 5: Accountant Access */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Accountant Access</h3>
                <p className={styles.sectionDesc}>
                  Invite your accountant to manage invoices and costs
                </p>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Accountant Name</label>
                    <Input
                      value={settings.accountantName}
                      onChange={(e) => setSettings(prev => ({ ...prev, accountantName: e.target.value }))}
                      placeholder="e.g., Marie Tremblay"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Accountant Email</label>
                    <Input
                      type="email"
                      value={settings.accountantEmail}
                      onChange={(e) => setSettings(prev => ({ ...prev, accountantEmail: e.target.value }))}
                      placeholder="accountant@example.com"
                    />
                  </div>
                </div>

                <div className={styles.infoBox}>
                  <span className={styles.infoIcon}>💡</span>
                  <div>
                    <p><strong>Accountant permissions:</strong></p>
                    <ul>
                      <li>Upload and review vendor invoices</li>
                      <li>Approve invoices for QuickBooks sync</li>
                      <li>View ingredient costs and price history</li>
                      <li>See recipe food costs (cannot edit recipes)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AccountingSetupModal;
