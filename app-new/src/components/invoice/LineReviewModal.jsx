/**
 * Line Review Modal Component
 *
 * Allows users to review and fix invoice lines that have anomalies
 * (e.g., bare numbers in format column, missing units)
 *
 * Corrections are per-item (unique inventory item), not per-tag.
 * Bare numbers default to "count" (units).
 */

import { useState, useEffect } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import styles from '../../styles/components/linereviewmodal.module.css';

/**
 * Unit options for weight
 */
const WEIGHT_UNITS = [
  { key: 'lb', label: 'Pounds (lb)' },
  { key: 'kg', label: 'Kilograms (kg)' },
  { key: 'g', label: 'Grams (g)' },
  { key: 'oz', label: 'Ounces (oz)' },
];

/**
 * Unit options for volume
 */
const VOLUME_UNITS = [
  { key: 'L', label: 'Liters (L)' },
  { key: 'ml', label: 'Milliliters (ml)' },
  { key: 'gal', label: 'Gallons (gal)' },
  { key: 'pt', label: 'Pints (pt)' },
];

/**
 * Unit options for count (default for bare numbers)
 */
const COUNT_UNITS = [
  { key: 'unit', label: 'Units (default)' },
  { key: 'pc', label: 'Pieces' },
  { key: 'case', label: 'Cases' },
  { key: 'box', label: 'Boxes' },
];

/**
 * @param {Object} props
 * @param {boolean} props.open - Whether modal is open
 * @param {Array} props.flaggedLines - Lines that need review
 * @param {Function} props.onClose - Called when modal is closed
 * @param {Function} props.onSave - Called with updated lines when saved
 */
function LineReviewModal({
  open,
  flaggedLines = [],
  onClose,
  onSave
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [corrections, setCorrections] = useState({});

  // Reset when modal opens with new lines
  // Initialize all bare numbers with default "unit" correction
  useEffect(() => {
    if (open && flaggedLines.length > 0) {
      setCurrentIndex(0);
      // Pre-populate with default "unit" for all flagged lines
      const defaultCorrections = {};
      flaggedLines.forEach((line, idx) => {
        // Default bare numbers to "unit" (count)
        defaultCorrections[idx] = {
          unit: 'unit',
          unitType: 'count'
        };
      });
      setCorrections(defaultCorrections);
    }
  }, [open, flaggedLines]);

  if (!open || flaggedLines.length === 0) return null;

  const currentLine = flaggedLines[currentIndex];
  const lineCorrection = corrections[currentIndex] || { unit: 'unit', unitType: 'count' };

  // Handle unit selection for current line
  const handleUnitChange = (unit, unitType) => {
    setCorrections(prev => ({
      ...prev,
      [currentIndex]: {
        unit,
        unitType
      }
    }));
  };

  // Navigate to next/previous line
  const goToNext = () => {
    if (currentIndex < flaggedLines.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Handle save
  const handleSave = () => {
    // Build updated lines with corrections
    const updatedLines = flaggedLines.map((line, idx) => {
      const correction = corrections[idx] || { unit: 'unit', unitType: 'count' };
      return {
        ...line,
        correctedUnit: correction.unit,
        correctedUnitType: correction.unitType,
        needsReview: false
      };
    });

    if (onSave) onSave(updatedLines);
    onClose();
  };

  // Count how many have been explicitly changed (not just default)
  const reviewedCount = Object.keys(corrections).filter(
    idx => corrections[idx] && corrections[idx].unit !== 'unit'
  ).length;

  return (
    <Modal open={open} onClose={onClose} title="Review Flagged Lines">
      <div className={styles.container}>
        {/* Progress */}
        <div className={styles.progress}>
          <span className={styles.progressText}>
            Line {currentIndex + 1} of {flaggedLines.length}
          </span>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${((currentIndex + 1) / flaggedLines.length) * 100}%` }}
            />
          </div>
          <span className={styles.progressStats}>
            {reviewedCount} changed from default, {flaggedLines.length - reviewedCount} using "units"
          </span>
        </div>

        {/* Current Line Info */}
        <div className={styles.lineInfo}>
          <div className={styles.lineHeader}>
            <h3 className={styles.lineDescription}>
              {currentLine.description || currentLine.name || 'Unknown Item'}
            </h3>
            {currentLine.formatParsed?.format && (
              <span className={styles.formatTag}>
                {currentLine.formatParsed.format}
              </span>
            )}
          </div>

          {/* Issue Description */}
          <div className={styles.issue}>
            <span className={styles.issueIcon}>⚠️</span>
            <span className={styles.issueText}>
              {currentLine.formatParsed?.reviewReason || 'Bare number detected - what unit does this represent?'}
            </span>
          </div>

          {/* Format Details */}
          {currentLine.formatParsed && (
            <div className={styles.formatDetails}>
              <div className={styles.formatRow}>
                <span className={styles.formatLabel}>Raw format:</span>
                <code className={styles.formatValue}>{currentLine.formatParsed.raw}</code>
              </div>
              <div className={styles.formatRow}>
                <span className={styles.formatLabel}>Package type:</span>
                <span className={styles.formatValue}>{currentLine.formatParsed.format || '—'}</span>
              </div>
              <div className={styles.formatRow}>
                <span className={styles.formatLabel}>Value:</span>
                <span className={styles.formatValue}>{currentLine.formatParsed.value || '—'}</span>
              </div>
              <div className={styles.formatRow}>
                <span className={styles.formatLabel}>Unit detected:</span>
                <span className={styles.formatValue}>
                  {currentLine.formatParsed.unit || <em className={styles.missing}>None (defaulting to "units")</em>}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Unit Selection */}
        <div className={styles.unitSelection}>
          <h4 className={styles.unitTitle}>
            What does "{currentLine.formatParsed?.value}" mean for this item?
          </h4>

          <div className={styles.unitGroups}>
            {/* Count Units (default - shown first) */}
            <div className={styles.unitGroup}>
              <span className={styles.unitGroupLabel}>Count (Default)</span>
              <div className={styles.unitOptions}>
                {COUNT_UNITS.map(unit => (
                  <button
                    key={unit.key}
                    className={`${styles.unitBtn} ${lineCorrection.unit === unit.key ? styles.selected : ''}`}
                    onClick={() => handleUnitChange(unit.key, 'count')}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Weight Units */}
            <div className={styles.unitGroup}>
              <span className={styles.unitGroupLabel}>Weight</span>
              <div className={styles.unitOptions}>
                {WEIGHT_UNITS.map(unit => (
                  <button
                    key={unit.key}
                    className={`${styles.unitBtn} ${lineCorrection.unit === unit.key ? styles.selected : ''}`}
                    onClick={() => handleUnitChange(unit.key, 'weight')}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume Units */}
            <div className={styles.unitGroup}>
              <span className={styles.unitGroupLabel}>Volume</span>
              <div className={styles.unitOptions}>
                {VOLUME_UNITS.map(unit => (
                  <button
                    key={unit.key}
                    className={`${styles.unitBtn} ${lineCorrection.unit === unit.key ? styles.selected : ''}`}
                    onClick={() => handleUnitChange(unit.key, 'volume')}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className={styles.navigation}>
          <Button
            variant="secondary"
            onClick={goToPrev}
            disabled={currentIndex === 0}
          >
            ← Previous
          </Button>

          <div className={styles.navDots}>
            {flaggedLines.map((_, idx) => (
              <span
                key={idx}
                className={`${styles.navDot} ${idx === currentIndex ? styles.active : ''} ${corrections[idx]?.unit !== 'unit' ? styles.corrected : ''}`}
                onClick={() => setCurrentIndex(idx)}
                title={`Line ${idx + 1}${corrections[idx]?.unit !== 'unit' ? ` (${corrections[idx]?.unit})` : ' (default: units)'}`}
              />
            ))}
          </div>

          <Button
            variant="secondary"
            onClick={goToNext}
            disabled={currentIndex === flaggedLines.length - 1}
          >
            Next →
          </Button>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
          >
            Save All ({flaggedLines.length} items)
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default LineReviewModal;
