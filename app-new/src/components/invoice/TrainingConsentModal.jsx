/**
 * TrainingConsentModal - Ask user consent to contribute invoice for AI training
 */

import React, { useState, useEffect } from 'react';
import { getSetting, updateSetting } from '../../services/settings/settingsStorage';
import styles from '../../styles/components/trainingconsentmodal.module.css';

const SETTING_KEY = 'trainingDataConsent';

export default function TrainingConsentModal({
  isOpen,
  onClose,
  onConsent,
  invoiceData
}) {
  const [rememberChoice, setRememberChoice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user has already made a permanent choice
  useEffect(() => {
    const checkExistingConsent = async () => {
      const consent = await getSetting(SETTING_KEY);
      if (consent === 'always') {
        // Auto-submit if always allowed
        onConsent('always');
        onClose();
      } else if (consent === 'never') {
        // Auto-close if never allowed
        onClose();
      }
    };
    if (isOpen) {
      checkExistingConsent();
    }
  }, [isOpen, onConsent, onClose]);

  if (!isOpen) return null;

  const handleChoice = async (choice) => {
    setIsSubmitting(true);

    try {
      // Save preference if remember is checked
      if (rememberChoice && (choice === 'always' || choice === 'never')) {
        await updateSetting(SETTING_KEY, choice);
      }

      // Trigger consent callback for 'always' or 'once'
      if (choice === 'always' || choice === 'once') {
        await onConsent(choice);
      }

      onClose();
    } catch (error) {
      console.error('Error handling training consent:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.icon}>🤖</div>
          <h2>Help Improve KitchenCommand</h2>
        </div>

        <div className={styles.content}>
          <p className={styles.mainText}>
            Would you like to contribute this invoice to help train our AI parser?
          </p>

          <div className={styles.benefits}>
            <div className={styles.benefitItem}>
              <span className={styles.checkmark}>✓</span>
              <span>Your data helps improve accuracy for everyone</span>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.checkmark}>✓</span>
              <span>Invoices are stored securely and encrypted</span>
            </div>
            <div className={styles.benefitItem}>
              <span className={styles.checkmark}>✓</span>
              <span>You can change your preference anytime in Settings</span>
            </div>
          </div>

          <div className={styles.dataPreview}>
            <span className={styles.previewLabel}>What we collect:</span>
            <ul>
              <li>Invoice PDF ({invoiceData?.pageCount || 1} page{invoiceData?.pageCount !== 1 ? 's' : ''})</li>
              <li>Extracted data and any corrections you made</li>
              <li>Invoice type: {invoiceData?.detectedType || 'Food Supply'}</li>
            </ul>
          </div>

          <label className={styles.rememberChoice}>
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
            />
            <span>Remember my choice</span>
          </label>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.alwaysBtn}
            onClick={() => handleChoice('always')}
            disabled={isSubmitting}
          >
            Always Allow
          </button>
          <button
            className={styles.onceBtn}
            onClick={() => handleChoice('once')}
            disabled={isSubmitting}
          >
            Just This Once
          </button>
          <button
            className={styles.noBtn}
            onClick={() => handleChoice('never')}
            disabled={isSubmitting}
          >
            No Thanks
          </button>
        </div>

        <p className={styles.privacyNote}>
          See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> for details on data handling.
        </p>
      </div>
    </div>
  );
}

/**
 * Check if user has opted into training data contribution
 */
export async function hasTrainingConsent() {
  const consent = await getSetting(SETTING_KEY);
  return consent === 'always';
}

/**
 * Get current training consent setting
 */
export async function getTrainingConsentSetting() {
  return await getSetting(SETTING_KEY);
}

/**
 * Update training consent setting
 */
export async function setTrainingConsentSetting(value) {
  return await updateSetting(SETTING_KEY, value);
}
