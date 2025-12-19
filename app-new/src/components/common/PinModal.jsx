/**
 * PIN Modal Component
 *
 * Numeric keypad for PIN entry with visual feedback
 */

import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/pinmodal.module.css';

/**
 * PIN Modal Component
 */
function PinModal({
  isOpen,
  onClose,
  onSubmit,
  title = 'Enter PIN',
  error = '',
  loading = false
}) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const MAX_PIN_LENGTH = 6;

  // Reset PIN when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setShowPin(false);
    }
  }, [isOpen]);

  // Handle keyboard input
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (loading) return;

      // Number keys
      if (/^\d$/.test(e.key) && pin.length < MAX_PIN_LENGTH) {
        setPin(prev => prev + e.key);
      }
      // Backspace
      else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      }
      // Enter
      else if (e.key === 'Enter' && pin.length >= 4) {
        onSubmit(pin);
      }
      // Escape
      else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, loading, onSubmit, onClose]);

  // Handle keypad button press
  const handleKeyPress = useCallback((key) => {
    if (loading) return;

    if (key === 'clear') {
      setPin('');
    } else if (key === 'backspace') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < MAX_PIN_LENGTH) {
      setPin(prev => prev + key);
    }
  }, [pin, loading]);

  // Handle submit
  const handleSubmit = () => {
    if (pin.length >= 4 && !loading) {
      onSubmit(pin);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        {/* PIN Display */}
        <div className={styles.pinDisplay}>
          <div className={styles.pinDots}>
            {[...Array(MAX_PIN_LENGTH)].map((_, i) => (
              <div
                key={i}
                className={`${styles.pinDot} ${i < pin.length ? styles.filled : ''}`}
              >
                {showPin && pin[i] ? pin[i] : ''}
              </div>
            ))}
          </div>
          <button
            className={styles.showPinButton}
            onClick={() => setShowPin(!showPin)}
            type="button"
          >
            {showPin ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        {/* Keypad */}
        <div className={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              className={styles.keypadButton}
              onClick={() => handleKeyPress(String(num))}
              disabled={loading}
            >
              {num}
            </button>
          ))}
          <button
            className={`${styles.keypadButton} ${styles.keypadAction}`}
            onClick={() => handleKeyPress('clear')}
            disabled={loading}
          >
            Clear
          </button>
          <button
            className={styles.keypadButton}
            onClick={() => handleKeyPress('0')}
            disabled={loading}
          >
            0
          </button>
          <button
            className={`${styles.keypadButton} ${styles.keypadAction}`}
            onClick={() => handleKeyPress('backspace')}
            disabled={loading}
          >
            &#9003;
          </button>
        </div>

        {/* Submit Button */}
        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
        >
          {loading ? 'Verifying...' : 'Unlock'}
        </button>

        {/* View Only Option */}
        <button
          className={styles.viewOnlyButton}
          onClick={onClose}
          disabled={loading}
        >
          Continue as Viewer
        </button>
      </div>
    </div>
  );
}

PinModal.propTypes = {
  /** Modal visibility */
  isOpen: PropTypes.bool.isRequired,
  /** Close handler */
  onClose: PropTypes.func.isRequired,
  /** Submit handler (receives PIN) */
  onSubmit: PropTypes.func.isRequired,
  /** Modal title */
  title: PropTypes.string,
  /** Error message to display */
  error: PropTypes.string,
  /** Loading state */
  loading: PropTypes.bool,
};

export default PinModal;
