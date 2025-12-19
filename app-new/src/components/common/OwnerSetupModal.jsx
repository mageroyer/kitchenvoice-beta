/**
 * Owner Setup Modal Component
 *
 * Prompts first-time users to set up their owner PIN
 * This modal appears only once after initial registration
 */

import { useState } from 'react';
import Button from './Button';
import Input from './Input';
import Alert from './Alert';
import { createInitialOwnerPrivilege } from '../../services/auth/privilegesService';
import styles from '../../styles/components/ownersetupmodal.module.css';

/**
 * Owner Setup Modal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Object} props.user - Firebase user object (uid, displayName)
 * @param {Function} props.onComplete - Callback after setup is complete
 */
function OwnerSetupModal({ isOpen, user, onComplete }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePinChange = (value) => {
    // Only allow digits, max 6
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setPin(cleaned);
  };

  const handleConfirmPinChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setConfirmPin(cleaned);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    try {
      await createInitialOwnerPrivilege(
        user.uid,
        user.displayName || 'Owner',
        pin
      );
      onComplete();
    } catch (err) {
      console.error('Error creating owner privilege:', err);
      setError(err.message || 'Failed to set up owner access');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <span className={styles.icon}>🔐</span>
          </div>
          <h2 className={styles.title}>Set Up Owner Access</h2>
          <p className={styles.subtitle}>
            Create a PIN to unlock full owner privileges in the app.
            You'll use this PIN to access the Control Panel and manage your team.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="danger" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Create Owner PIN (4-6 digits)</label>
            <Input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="Enter 4-6 digit PIN"
              maxLength={6}
              autoComplete="off"
              inputMode="numeric"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Confirm PIN</label>
            <Input
              type={showPin ? 'text' : 'password'}
              value={confirmPin}
              onChange={(e) => handleConfirmPinChange(e.target.value)}
              placeholder="Confirm your PIN"
              maxLength={6}
              autoComplete="off"
              inputMode="numeric"
              error={confirmPin && pin !== confirmPin}
              errorMessage={confirmPin && pin !== confirmPin ? "PINs don't match" : ''}
            />
          </div>

          <label className={styles.showPinLabel}>
            <input
              type="checkbox"
              checked={showPin}
              onChange={(e) => setShowPin(e.target.checked)}
            />
            <span>Show PIN</span>
          </label>

          {/* PIN Strength Indicator */}
          {pin && (
            <div className={styles.pinStrength}>
              <div className={styles.strengthDots}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className={`${styles.dot} ${index < pin.length ? styles.filled : ''}`}
                  />
                ))}
              </div>
              <span className={styles.pinLength}>{pin.length}/6 digits</span>
            </div>
          )}

          <div className={styles.infoBox}>
            <span className={styles.infoIcon}>💡</span>
            <p>
              <strong>Important:</strong> Remember this PIN! You'll need it to:
            </p>
            <ul>
              <li>Access the Control Panel</li>
              <li>Manage team members and their privileges</li>
              <li>Delete recipes and make critical changes</li>
            </ul>
          </div>

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            disabled={loading || pin.length < 4 || pin !== confirmPin}
          >
            {loading ? 'Setting Up...' : 'Complete Setup'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default OwnerSetupModal;
