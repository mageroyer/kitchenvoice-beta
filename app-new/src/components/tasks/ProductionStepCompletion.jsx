import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Badge from '../common/Badge';
import Button from '../common/Button';
import styles from '../../styles/components/productionstepcompletion.module.css';

/**
 * Normalize a step to object format
 * @param {string|Object} step - Step as string or object
 * @returns {Object} Normalized step object
 */
function normalizeStep(step) {
  if (typeof step === 'string') {
    return {
      text: step,
      producesItem: false,
      outputName: '',
      expectedWeight: 0,
      packagingItems: [],
      actualWeight: null,
      wasteWeight: null,
      completed: false
    };
  }
  // Backward compatible: convert old `packaging` to `packagingItems` array
  let packagingItems = step.packagingItems || [];
  if (!packagingItems.length && step.packaging) {
    packagingItems = [step.packaging];
  }

  return {
    text: step.text || '',
    producesItem: step.producesItem || false,
    outputName: step.outputName || '',
    expectedWeight: step.expectedWeight || 0,
    packagingItems: packagingItems,
    actualWeight: step.actualWeight ?? null,
    wasteWeight: step.wasteWeight ?? null,
    completed: step.completed || false
  };
}

/**
 * ProductionStepCompletion Component
 *
 * UI for completing production tasks - allows entering actual weights
 * for each step that produces an inventory item.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.steps - Recipe method steps (from recipe.method)
 * @param {Object} props.recipe - Recipe object
 * @param {number} props.scaleFactor - Task scale factor
 * @param {Function} props.onStepsChange - Handler when steps are updated with actual values
 * @param {Function} props.onComplete - Handler when all steps are completed
 */
function ProductionStepCompletion({
  steps = [],
  recipe = {},
  scaleFactor = 1,
  onStepsChange = () => {},
  onComplete = () => {},
}) {
  // Get production steps (those that produce items)
  const productionSteps = useMemo(() => {
    return steps
      .map((step, index) => ({ ...normalizeStep(step), originalIndex: index }))
      .filter(step => step.producesItem);
  }, [steps]);

  // Local state for step completion data
  const [completionData, setCompletionData] = useState(() => {
    return productionSteps.map(step => ({
      originalIndex: step.originalIndex,
      outputName: step.outputName,
      expectedWeight: (step.expectedWeight || 0) * scaleFactor,
      actualWeight: step.actualWeight ?? '',
      wasteWeight: step.wasteWeight ?? '',
      completed: step.completed || false,
      packagingItems: step.packagingItems || [],
    }));
  });

  // Calculate totals
  const totals = useMemo(() => {
    const totalExpected = completionData.reduce((sum, s) => sum + (s.expectedWeight || 0), 0);
    const totalActual = completionData.reduce((sum, s) => sum + (parseFloat(s.actualWeight) || 0), 0);
    const totalWaste = completionData.reduce((sum, s) => sum + (parseFloat(s.wasteWeight) || 0), 0);
    const completedCount = completionData.filter(s => s.completed).length;

    // Calculate yield if we have actual values
    const yieldPercent = totalExpected > 0 && totalActual > 0
      ? ((totalActual / totalExpected) * 100).toFixed(1)
      : null;

    return {
      totalExpected,
      totalActual,
      totalWaste,
      completedCount,
      totalSteps: completionData.length,
      yieldPercent,
      allCompleted: completedCount === completionData.length && completionData.length > 0,
    };
  }, [completionData]);

  // Update a step's completion data
  const handleUpdateStep = (index, field, value) => {
    setCompletionData(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Toggle step completion
  const handleToggleComplete = (index) => {
    const step = completionData[index];
    // Require actual weight before marking complete
    if (!step.completed && (!step.actualWeight || parseFloat(step.actualWeight) <= 0)) {
      return; // Can't complete without actual weight
    }
    handleUpdateStep(index, 'completed', !step.completed);
  };

  // Notify parent of changes
  useEffect(() => {
    // Build updated steps array with completion data
    const updatedSteps = steps.map((step, index) => {
      const completionStep = completionData.find(c => c.originalIndex === index);
      if (!completionStep) {
        return step; // Not a production step, keep as-is
      }
      const normalized = normalizeStep(step);
      return {
        ...normalized,
        actualWeight: parseFloat(completionStep.actualWeight) || null,
        wasteWeight: parseFloat(completionStep.wasteWeight) || null,
        completed: completionStep.completed,
      };
    });
    onStepsChange(updatedSteps);
  }, [completionData, steps, onStepsChange]);

  // Handle complete all
  const handleCompleteAll = () => {
    if (totals.allCompleted) {
      onComplete(completionData);
    }
  };

  // Get input ingredient info (for display)
  const inputIngredient = recipe.ingredients?.find(ing => ing.linkedIngredientId && !ing.isSection);

  if (productionSteps.length === 0) {
    return (
      <div className={styles.noProduction}>
        <p>This recipe has no production output steps.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Input summary */}
      {inputIngredient && (
        <div className={styles.inputSummary}>
          <span className={styles.inputLabel}>INPUT:</span>
          <span className={styles.inputName}>
            {inputIngredient.linkedName || inputIngredient.name}
          </span>
          {inputIngredient.metricQty && (
            <span className={styles.inputWeight}>
              {(inputIngredient.metricQty * scaleFactor / 1000).toFixed(2)} kg
            </span>
          )}
        </div>
      )}

      {/* Production steps */}
      <div className={styles.stepsList}>
        {completionData.map((step, index) => (
          <div
            key={step.originalIndex}
            className={`${styles.stepCard} ${step.completed ? styles.stepCompleted : ''}`}
          >
            <div className={styles.stepHeader}>
              <span className={styles.stepNumber}>Step {step.originalIndex + 1}</span>
              <span className={styles.stepText}>
                {productionSteps[index]?.text || ''}
              </span>
            </div>

            <div className={styles.stepContent}>
              <div className={styles.outputInfo}>
                <Badge variant="success" size="small">
                  → {step.outputName || 'Unnamed Output'}
                </Badge>
                {step.packagingItems?.length > 0 && step.packagingItems.map((pkg, pkgIdx) => (
                  pkg.itemName && (
                    <Badge key={pkgIdx} variant="info" size="small">
                      📦 {pkg.itemName} × {pkg.quantity || 1}
                    </Badge>
                  )
                ))}
              </div>

              <div className={styles.weightFields}>
                <div className={styles.weightField}>
                  <label className={styles.fieldLabel}>Expected</label>
                  <div className={styles.weightValue}>
                    {step.expectedWeight.toFixed(2)} kg
                  </div>
                </div>

                <div className={styles.weightField}>
                  <label className={styles.fieldLabel}>Actual</label>
                  <div className={styles.weightInput}>
                    <Input
                      type="number"
                      value={step.actualWeight}
                      onChange={(e) => handleUpdateStep(index, 'actualWeight', e.target.value)}
                      placeholder="0.00"
                      size="small"
                      compact
                      min="0"
                      step="0.01"
                      disabled={step.completed}
                      className={styles.numberInput}
                    />
                    <span className={styles.unitLabel}>kg</span>
                  </div>
                </div>

                <div className={styles.weightField}>
                  <label className={styles.fieldLabel}>Waste</label>
                  <div className={styles.weightInput}>
                    <Input
                      type="number"
                      value={step.wasteWeight}
                      onChange={(e) => handleUpdateStep(index, 'wasteWeight', e.target.value)}
                      placeholder="0.00"
                      size="small"
                      compact
                      min="0"
                      step="0.01"
                      disabled={step.completed}
                      className={styles.numberInput}
                    />
                    <span className={styles.unitLabel}>kg</span>
                  </div>
                </div>

                <div className={styles.completeToggle}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={step.completed}
                      onChange={() => handleToggleComplete(index)}
                      disabled={!step.actualWeight || parseFloat(step.actualWeight) <= 0}
                      className={styles.checkbox}
                    />
                    <span>Complete</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className={styles.summary}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Output:</span>
          <span className={styles.summaryValue}>
            {totals.totalActual.toFixed(2)} kg
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Total Waste:</span>
          <span className={styles.summaryValue}>
            {totals.totalWaste.toFixed(2)} kg
          </span>
        </div>
        {totals.yieldPercent && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Yield:</span>
            <span className={`${styles.summaryValue} ${parseFloat(totals.yieldPercent) >= 90 ? styles.yieldGood : styles.yieldLow}`}>
              {totals.yieldPercent}%
            </span>
          </div>
        )}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Progress:</span>
          <span className={styles.summaryValue}>
            {totals.completedCount} / {totals.totalSteps} steps
          </span>
        </div>
      </div>

      {/* Complete button */}
      <div className={styles.actions}>
        <Button
          variant="success"
          onClick={handleCompleteAll}
          disabled={!totals.allCompleted}
          className={styles.completeButton}
        >
          {totals.allCompleted ? 'Complete Task' : `Complete all ${totals.totalSteps} steps first`}
        </Button>
      </div>
    </div>
  );
}

ProductionStepCompletion.propTypes = {
  steps: PropTypes.array,
  recipe: PropTypes.object,
  scaleFactor: PropTypes.number,
  onStepsChange: PropTypes.func,
  onComplete: PropTypes.func,
};

export default ProductionStepCompletion;
