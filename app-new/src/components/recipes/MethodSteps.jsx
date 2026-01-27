import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Alert from '../common/Alert';
import PackagingLinkModal from './PackagingLinkModal';
import { GoogleCloudVoiceService } from '../../services/speech/googleCloudVoice';
import { parseBulkMethodStepsWithClaude } from '../../services/ai/claudeAPI';
import styles from '../../styles/components/methodsteps.module.css';

/**
 * Normalize a step to object format (backward compatible)
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
      weightUnit: 'kg', // Default unit
      boxingSize: null, // Size per container (e.g., 1 for 1L jars)
      boxingSizeUnit: 'kg', // Unit for boxing size
      portionsPerItem: 1, // How many portions each output item makes
      packagingItems: [], // Array of packaging items
      actualWeight: null,
      wasteWeight: null,
      completed: false,
      // Production execution fields
      isVariable: false, // Variable outputs (bones, trim) must be weighed
      yieldPercent: null, // Optional yield % for auto-calculation
    };
  }
  // Already an object, ensure all fields exist
  // Backward compatible: convert old `packaging` to `packagingItems` array
  let packagingItems = step.packagingItems || [];
  if (!packagingItems.length && step.packaging) {
    // Migrate old single packaging object to array
    packagingItems = [step.packaging];
  }

  const weightUnit = step.weightUnit || 'kg';

  return {
    text: step.text || '',
    producesItem: step.producesItem || false,
    outputName: step.outputName || '',
    expectedWeight: step.expectedWeight || 0,
    weightUnit, // Default unit
    boxingSize: step.boxingSize || null, // Size per container
    boxingSizeUnit: step.boxingSizeUnit || weightUnit, // Defaults to weightUnit
    portionsPerItem: step.portionsPerItem || 1, // How many portions each output item makes
    packagingItems: packagingItems,
    actualWeight: step.actualWeight ?? null,
    wasteWeight: step.wasteWeight ?? null,
    completed: step.completed || false,
    // Production execution fields
    isVariable: step.isVariable || false,
    yieldPercent: step.yieldPercent ?? null,
  };
}

/**
 * Get text from a step (string or object)
 * @param {string|Object} step - Step
 * @returns {string} Step text
 */
function getStepText(step) {
  if (typeof step === 'string') return step;
  return step?.text || '';
}

/**
 * Check if step has production output enabled
 * @param {string|Object} step - Step
 * @returns {boolean}
 */
function hasProductionOutput(step) {
  if (typeof step === 'string') return false;
  return step?.producesItem || false;
}

/**
 * MethodSteps Component
 *
 * An editable list of cooking method steps with add, edit, delete, and reorder capabilities.
 * Supports voice dictation for individual steps and bulk voice input with Claude AI parsing.
 *
 * Enhanced to support production output - each step can optionally produce an inventory item
 * with yield tracking and packaging.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array<string|Object>} [props.steps=[]] - Array of method steps (string or object)
 * @param {Function} [props.onChange] - Handler called with updated steps array
 * @param {boolean} [props.editable=true] - Enable editing mode (add/edit/delete/reorder)
 * @param {boolean} [props.micFlag=false] - Enable voice input on individual fields
 * @param {boolean} [props.showVoice=false] - Show voice input button
 * @param {boolean} [props.voiceActive=false] - Whether voice input is currently active
 * @param {Function} [props.onVoiceClick] - Handler for voice button click
 * @param {Function} [props.onPackagingSearch] - Handler to search for packaging items
 * @returns {JSX.Element} Rendered method steps list
 */
function MethodSteps({
  steps: stepsProp = [],
  onChange = () => {},
  editable = true,
  micFlag = false,
  showVoice = false,
  voiceActive = false,
  onVoiceClick = () => {},
  onPackagingSearch = null,
  productionMode = false, // Only show production fields when enabled
  executionMode = false, // Production execution mode - allows actualWeight entry in view mode
  inputWeight = null, // Total input weight from inventory (for yield calculation)
  inputWeightUnit = 'kg', // Unit for input weight
  recipeCost = 0, // Total recipe cost for calculating cost per output item
  onPackagingCostChange = null, // Callback when packaging cost changes: (totalPackagingCost) => void
}) {
  // Ensure steps is always an array (handles null, undefined, string, etc.)
  const steps = Array.isArray(stepsProp) ? stepsProp : [];

  const [newStep, setNewStep] = useState('');
  const [fieldVoiceActive, setFieldVoiceActive] = useState(null); // { type: 'new'|'edit', index: number }
  const [fieldVoiceTranscript, setFieldVoiceTranscript] = useState('');

  // Packaging link modal state
  const [packagingLinkModal, setPackagingLinkModal] = useState(null); // { stepIndex, pkgIndex, name, quantity, linked }

  // Bulk voice dictation state
  const [bulkVoiceActive, setBulkVoiceActive] = useState(false);
  const [bulkTranscript, setBulkTranscript] = useState({ fullTranscript: '', currentLine: '', lines: [] });
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const bulkVoiceRef = useRef(null);
  const fieldVoiceRef = useRef(null);

  // Ref to always have current steps (avoid stale closure)
  const currentStepsRef = useRef(steps);

  // Update ref when steps change
  useEffect(() => {
    currentStepsRef.current = steps;
  }, [steps]);

  // Cleanup on unmount - use destroy() for full teardown including callback removal
  useEffect(() => {
    return () => {
      if (bulkVoiceRef.current) {
        bulkVoiceRef.current.cancel();
        bulkVoiceRef.current.destroy();
        bulkVoiceRef.current = null;
      }
      if (fieldVoiceRef.current) {
        fieldVoiceRef.current.cancel();
        fieldVoiceRef.current.destroy();
        fieldVoiceRef.current = null;
      }
    };
  }, []);

  // Handle input field focus for new step
  const handleNewStepFocus = async () => {
    if (!micFlag || fieldVoiceActive || bulkVoiceActive) return;

    if (!GoogleCloudVoiceService.isSupported()) {
      console.warn('Google Cloud Voice not supported');
      return;
    }

    const fieldInfo = { type: 'new' };
    setFieldVoiceActive(fieldInfo);
    setFieldVoiceTranscript('');

    fieldVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setFieldVoiceTranscript(data.currentLine || '');
      },
      onComplete: (result) => {
        if (result.fullTranscript) {
          setNewStep(result.fullTranscript);
        }
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      },
      onError: (error) => {
        console.error('Field voice error:', error);
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      }
    });

    try {
      await fieldVoiceRef.current.start();
    } catch (error) {
      console.error('Error starting field voice:', error);
      setFieldVoiceActive(null);
    }
  };

  // Handle input field focus for editing existing step
  const handleEditStepFocus = async (index) => {
    if (!micFlag || fieldVoiceActive || bulkVoiceActive) return;

    if (!GoogleCloudVoiceService.isSupported()) {
      console.warn('Google Cloud Voice not supported');
      return;
    }

    const fieldInfo = { type: 'edit', index };
    setFieldVoiceActive(fieldInfo);
    setFieldVoiceTranscript('');

    fieldVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setFieldVoiceTranscript(data.currentLine || '');
      },
      onComplete: (result) => {
        if (result.fullTranscript) {
          handleUpdateStepText(index, result.fullTranscript);
        }
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      },
      onError: (error) => {
        console.error('Field voice error:', error);
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      }
    });

    try {
      await fieldVoiceRef.current.start();
    } catch (error) {
      console.error('Error starting field voice:', error);
      setFieldVoiceActive(null);
    }
  };

  // Handle voice stop
  const handleVoiceStop = () => {
    if (!fieldVoiceRef.current || !fieldVoiceActive) return;

    // Hide mic immediately when user clicks stop
    setFieldVoiceActive(null);
    fieldVoiceRef.current.stop();
  };

  // Add new step (as object format)
  const handleAddStep = () => {
    if (!newStep.trim()) return;

    const newStepObj = normalizeStep(newStep.trim());
    const updatedSteps = [...steps, newStepObj];
    onChange(updatedSteps);
    setNewStep('');
  };

  const handleRemoveStep = (index) => {
    const updatedSteps = steps.filter((_, i) => i !== index);
    onChange(updatedSteps);
  };

  // Update step text only (preserves other fields)
  const handleUpdateStepText = (index, value) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      return { ...normalized, text: value };
    });
    onChange(updatedSteps);
  };

  // Update a specific field on a step
  const handleUpdateStepField = (index, field, value) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      return { ...normalized, [field]: value };
    });
    onChange(updatedSteps);
  };

  // Toggle producesItem and initialize fields
  const handleToggleProducesItem = (index) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      const newProducesItem = !normalized.producesItem;
      return {
        ...normalized,
        producesItem: newProducesItem,
        // Clear output fields when disabling
        outputName: newProducesItem ? normalized.outputName : '',
        expectedWeight: newProducesItem ? normalized.expectedWeight : 0,
        packagingItems: newProducesItem ? normalized.packagingItems : []
      };
    });
    onChange(updatedSteps);
  };

  // Add a new packaging item to a step
  const handleAddPackagingItem = (stepIndex) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== stepIndex) return step;
      const normalized = normalizeStep(step);
      // Auto-calculate quantity from boxing size if set
      const calculatedQty = (normalized.boxingSize > 0 && normalized.expectedWeight > 0)
        ? Math.round(normalized.expectedWeight / normalized.boxingSize)
        : 1;
      const newPackaging = {
        itemId: null,
        itemName: '',
        quantity: calculatedQty,
        notes: ''
      };
      return {
        ...normalized,
        packagingItems: [...normalized.packagingItems, newPackaging]
      };
    });
    onChange(updatedSteps);
  };

  // Update a specific packaging item
  const handleUpdatePackagingItem = (stepIndex, packagingIndex, update) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== stepIndex) return step;
      const normalized = normalizeStep(step);
      const updatedPackaging = normalized.packagingItems.map((pkg, pi) => {
        if (pi !== packagingIndex) return pkg;
        return { ...pkg, ...update };
      });
      return {
        ...normalized,
        packagingItems: updatedPackaging
      };
    });
    onChange(updatedSteps);
  };

  // Remove a packaging item from a step
  const handleRemovePackagingItem = (stepIndex, packagingIndex) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== stepIndex) return step;
      const normalized = normalizeStep(step);
      return {
        ...normalized,
        packagingItems: normalized.packagingItems.filter((_, pi) => pi !== packagingIndex)
      };
    });
    onChange(updatedSteps);
  };

  // Open packaging link modal
  const handleOpenPackagingLink = (stepIndex, pkgIndex, pkg) => {
    // Check both linkedItemId and itemId for backwards compatibility
    const linkedId = pkg.linkedItemId || pkg.itemId;
    setPackagingLinkModal({
      stepIndex,
      pkgIndex,
      name: pkg.itemName || '',
      quantity: pkg.quantity || 1,
      linked: linkedId ? {
        itemId: linkedId,
        itemName: pkg.linkedItemName || pkg.itemName,
        unitPrice: pkg.unitPrice || 0,
      } : null,
    });
  };

  // Handle packaging link
  const handlePackagingLink = (linkData) => {
    if (!packagingLinkModal) return;
    const { stepIndex, pkgIndex } = packagingLinkModal;

    handleUpdatePackagingItem(stepIndex, pkgIndex, {
      itemId: linkData.itemId, // Original field for compatibility
      itemName: linkData.itemName, // Update display name
      linkedItemId: linkData.itemId,
      linkedItemName: linkData.itemName,
      unitPrice: linkData.unitPrice,
      totalPrice: linkData.totalPrice,
      vendorName: linkData.vendorName,
    });
    setPackagingLinkModal(null);
  };

  // Handle packaging unlink
  const handlePackagingUnlink = () => {
    if (!packagingLinkModal) return;
    const { stepIndex, pkgIndex } = packagingLinkModal;

    handleUpdatePackagingItem(stepIndex, pkgIndex, {
      linkedItemId: null,
      linkedItemName: null,
      unitPrice: 0,
      totalPrice: 0,
      vendorName: null,
    });
    setPackagingLinkModal(null);
  };

  // Update actual weight during production execution
  const handleUpdateActualWeight = (index, value) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      return { ...normalized, actualWeight: value === '' ? null : parseFloat(value) || 0 };
    });
    onChange(updatedSteps);
  };

  // Toggle variable output flag (must weigh vs calculated)
  const handleToggleIsVariable = (index) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      return { ...normalized, isVariable: !normalized.isVariable };
    });
    onChange(updatedSteps);
  };

  // Update yield percentage
  const handleUpdateYieldPercent = (index, value) => {
    const updatedSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const normalized = normalizeStep(step);
      const yieldPercent = value === '' ? null : parseFloat(value) || 0;
      // Auto-calculate expected weight if input weight is provided
      let expectedWeight = normalized.expectedWeight;
      if (inputWeight && yieldPercent !== null) {
        expectedWeight = (inputWeight * yieldPercent) / 100;
      }
      return { ...normalized, yieldPercent, expectedWeight };
    });
    onChange(updatedSteps);
  };

  const handleMoveStep = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === steps.length - 1)
    ) {
      return;
    }

    const updatedSteps = [...steps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedSteps[index], updatedSteps[newIndex]] = [
      updatedSteps[newIndex],
      updatedSteps[index],
    ];
    onChange(updatedSteps);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddStep();
    }
  };

  // Bulk voice dictation handlers
  const handleBulkVoiceStart = async () => {
    setBulkError('');

    if (!GoogleCloudVoiceService.isSupported()) {
      setBulkError('Voice recording not supported in this browser.');
      return;
    }

    // Create new Google Cloud Voice service for bulk dictation
    bulkVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setBulkTranscript(data);
      },
      onComplete: handleBulkVoiceComplete,
      onError: (error) => {
        setBulkError(`Voice error: ${error}`);
        setBulkVoiceActive(false);
      },
      onRecordingStart: () => {
        // Recording started
      }
    });

    try {
      await bulkVoiceRef.current.start();
      setBulkVoiceActive(true);
    } catch (error) {
      setBulkError(error.message);
    }
  };

  const handleBulkVoiceStop = () => {
    // Hide mic immediately when user clicks stop
    setBulkVoiceActive(false);
    if (bulkVoiceRef.current) {
      bulkVoiceRef.current.stop();
    }
  };

  const handleBulkVoiceComplete = async (result) => {
    setBulkVoiceActive(false);

    const hasContent = result.lines.length > 0 || (result.fullTranscript && result.fullTranscript.trim());
    if (!hasContent) {
      setBulkError('No method steps detected. Please try again.');
      return;
    }

    // Parse with Claude API (API key handled server-side via Cloud Function)
    setBulkProcessing(true);
    setBulkError('');

    try {
      const fullText = result.lines.length > 0
        ? result.lines.join('\n')
        : result.fullTranscript;

      const parsedSteps = await parseBulkMethodStepsWithClaude(fullText);

      // Use ref to get current steps (avoid stale closure)
      const currentSteps = currentStepsRef.current;

      // Add all steps to the list (normalize to object format)
      const normalizedNewSteps = parsedSteps.map(s => normalizeStep(s));
      const updatedSteps = [...currentSteps, ...normalizedNewSteps];
      onChange(updatedSteps);

      // Reset bulk voice state
      setBulkTranscript({ fullTranscript: '', currentLine: '', lines: [] });
      setBulkProcessing(false);

    } catch (error) {
      console.error('❌ Error parsing bulk method steps:', error);
      setBulkError(`Failed to parse method steps: ${error.message}`);
      setBulkProcessing(false);
    }
  };

  const handleBulkVoiceToggle = () => {
    if (bulkVoiceActive) {
      handleBulkVoiceStop();
    } else {
      handleBulkVoiceStart();
    }
  };

  // Count production outputs
  const productionOutputCount = steps.filter(s => hasProductionOutput(s)).length;

  // Calculate yield summary for execution mode
  const yieldSummary = useMemo(() => {
    if (!executionMode) return null;

    const outputs = steps.filter(s => hasProductionOutput(s)).map(s => normalizeStep(s));
    const totalExpected = outputs.reduce((sum, s) => sum + (s.expectedWeight || 0), 0);
    // Use actualWeight if set, otherwise fall back to expectedWeight (default behavior)
    const totalActual = outputs.reduce((sum, s) => sum + (s.actualWeight ?? s.expectedWeight ?? 0), 0);
    const variableOutputs = outputs.filter(s => s.isVariable);
    // Variable outputs are filled if they have actual OR expected weight
    const allVariablesFilled = variableOutputs.every(s =>
      (s.actualWeight !== null && s.actualWeight > 0) || (s.expectedWeight > 0)
    );

    // Get unit from first output (they should all be the same)
    const outputUnit = outputs.length > 0 ? (outputs[0].weightUnit || 'kg') : 'kg';

    // Calculate yield percentage
    const yieldPercent = inputWeight && totalActual > 0
      ? ((totalActual / inputWeight) * 100).toFixed(1)
      : null;

    // Calculate waste
    const waste = inputWeight && totalActual > 0
      ? inputWeight - totalActual
      : null;

    return {
      totalExpected,
      totalActual,
      variableCount: variableOutputs.length,
      allVariablesFilled,
      yieldPercent,
      waste,
      outputUnit,
    };
  }, [steps, executionMode, inputWeight]);

  // Calculate total packaging cost across all steps
  const totalPackagingCost = useMemo(() => {
    let total = 0;
    steps.forEach(step => {
      const normalized = normalizeStep(step);
      if (normalized.packagingItems?.length > 0) {
        normalized.packagingItems.forEach(pkg => {
          if (pkg.unitPrice > 0 && pkg.quantity > 0) {
            total += pkg.unitPrice * pkg.quantity;
          }
        });
      }
    });
    return total;
  }, [steps]);

  // Report packaging cost changes to parent
  useEffect(() => {
    if (onPackagingCostChange) {
      onPackagingCostChange(totalPackagingCost);
    }
  }, [totalPackagingCost, onPackagingCostChange]);

  // Calculate cost per output item based on weight distribution
  // Includes both ingredient cost and packaging cost
  const outputCosts = useMemo(() => {
    const outputs = steps
      .map((s, idx) => ({ step: normalizeStep(s), index: idx }))
      .filter(({ step }) => step.producesItem);

    if (outputs.length === 0) return {};

    // Calculate total output weight
    const totalWeight = outputs.reduce((sum, { step }) => sum + (step.expectedWeight || 0), 0);

    // Calculate cost for each output
    const costs = {};
    outputs.forEach(({ step, index }) => {
      const weight = step.expectedWeight || 0;

      // Calculate packaging cost for this step
      let stepPackagingCost = 0;
      if (step.packagingItems?.length > 0) {
        step.packagingItems.forEach(pkg => {
          if (pkg.unitPrice > 0 && pkg.quantity > 0) {
            stepPackagingCost += pkg.unitPrice * pkg.quantity;
          }
        });
      }

      // Ingredient cost distributed by weight (if recipe cost provided)
      let ingredientCost = 0;
      if (recipeCost > 0 && totalWeight > 0 && weight > 0) {
        ingredientCost = (weight / totalWeight) * recipeCost;
      }

      // Total cost = ingredient cost + packaging cost
      const outputTotalCost = ingredientCost + stepPackagingCost;

      // Calculate portions based on boxing size
      const portions = step.boxingSize > 0
        ? Math.round(weight / step.boxingSize)
        : (step.portionsPerItem || 1);

      const costPerPortion = portions > 0 ? outputTotalCost / portions : outputTotalCost;

      costs[index] = {
        totalCost: outputTotalCost,
        ingredientCost,
        packagingCost: stepPackagingCost,
        costPerPortion,
        portions,
      };
    });

    return costs;
  }, [steps, recipeCost]);

  return (
    <div className={styles.methodSteps}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>
          Method Steps
          <Badge variant="info" size="small">
            {steps.length}
          </Badge>
          {productionMode && productionOutputCount > 0 && (
            <Badge variant="success" size="small" title="Steps that produce inventory items">
              {productionOutputCount} output{productionOutputCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </h3>
        {editable && (
          <Button
            variant={bulkVoiceActive ? 'danger' : 'primary'}
            size="small"
            onClick={handleBulkVoiceToggle}
            disabled={bulkProcessing}
          >
            {bulkVoiceActive ? '⏹️ Stop Dictation' : '🎤 Voice Dictation'}
          </Button>
        )}
      </div>

      {/* Bulk Voice Error */}
      {bulkError && (
        <Alert variant="danger" dismissible onDismiss={() => setBulkError('')}>
          {bulkError}
        </Alert>
      )}

      {/* Bulk Voice Active Indicator - Green flashing mic */}
      {bulkVoiceActive && (
        <div className={styles.bulkVoiceIndicator} role="status" aria-live="polite">
          <button
            type="button"
            className={styles.bulkVoiceMic}
            onClick={handleBulkVoiceStop}
            aria-label="Recording in progress. Click to stop"
            title="Click to stop recording"
          >
            <span aria-hidden="true">🎤</span>
          </button>
          <span className="sr-only">Recording audio for method steps</span>
        </div>
      )}

      {/* Steps List */}
      {steps.length > 0 ? (
        <ol className={styles.list}>
          {steps.map((step, index) => {
            const normalizedStep = normalizeStep(step);
            const stepText = getStepText(step);

            return (
              <li key={index} className={styles.listItem}>
                {editable ? (
                  <div className={`${styles.editableItem} ${normalizedStep.producesItem ? styles.hasProduction : ''}`}>
                    {/* Main step row */}
                    <div className={styles.stepMainRow}>
                      <div className={styles.stepNumber}>•</div>
                      <Input
                        value={stepText}
                        onChange={(e) => handleUpdateStepText(index, e.target.value)}
                        onFocus={() => handleEditStepFocus(index)}
                        size="small"
                        compact
                        className={styles.stepInput}
                        showVoice={micFlag}
                        voiceActive={
                          fieldVoiceActive?.type === 'edit' && fieldVoiceActive?.index === index
                        }
                        onVoiceClick={handleVoiceStop}
                      />
                      <div className={styles.actionButtons}>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleMoveStep(index, 'up')}
                          className={styles.moveButton}
                          disabled={index === 0}
                          aria-label={`Move step ${index + 1} up`}
                          title="Move up"
                        >
                          <span aria-hidden="true">↑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleMoveStep(index, 'down')}
                          className={styles.moveButton}
                          disabled={index === steps.length - 1}
                          aria-label={`Move step ${index + 1} down`}
                          title="Move down"
                        >
                          <span aria-hidden="true">↓</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleRemoveStep(index)}
                          className={styles.removeButton}
                          aria-label={`Remove step ${index + 1}`}
                          title="Remove step"
                        >
                          <span aria-hidden="true">🗑️</span>
                        </Button>
                      </div>
                    </div>

                    {/* Production output toggle - only shown in production mode */}
                    {productionMode && (
                      <div className={styles.productionToggle}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={normalizedStep.producesItem}
                            onChange={() => handleToggleProducesItem(index)}
                            className={styles.checkbox}
                          />
                          <span>Creates inventory item</span>
                        </label>
                        {normalizedStep.producesItem && (
                          <label className={`${styles.checkboxLabel} ${styles.variableCheckbox}`}>
                            <input
                              type="checkbox"
                              checked={normalizedStep.isVariable}
                              onChange={() => handleToggleIsVariable(index)}
                              className={styles.checkbox}
                            />
                            <span>Variable (must weigh)</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Production fields (shown when producesItem is true AND in production mode) */}
                    {productionMode && normalizedStep.producesItem && (
                      <div className={styles.productionFields}>
                        <div className={styles.productionRow}>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Item name</label>
                            <Input
                              value={normalizedStep.outputName}
                              onChange={(e) => handleUpdateStepField(index, 'outputName', e.target.value)}
                              placeholder="e.g., Tenderloin"
                              size="small"
                              compact
                              className={styles.productionInput}
                            />
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Total weight/volume</label>
                            <div className={styles.weightInput}>
                              <Input
                                type="number"
                                value={normalizedStep.expectedWeight || ''}
                                onChange={(e) => {
                                  const newWeight = parseFloat(e.target.value) || 0;
                                  handleUpdateStepField(index, 'expectedWeight', newWeight);
                                }}
                                onBlur={() => {
                                  // Auto-update portions and packaging on blur when boxing is set
                                  const newWeight = normalizedStep.expectedWeight;
                                  if (normalizedStep.boxingSize > 0 && newWeight > 0) {
                                    const calculated = Math.round(newWeight / normalizedStep.boxingSize);
                                    handleUpdateStepField(index, 'portionsPerItem', calculated);
                                    // Update first packaging item quantity
                                    if (normalizedStep.packagingItems.length > 0) {
                                      handleUpdatePackagingItem(index, 0, { quantity: calculated });
                                    }
                                  }
                                }}
                                placeholder="0"
                                size="small"
                                compact
                                min="0"
                                step="0.1"
                                className={styles.numberInput}
                              />
                              <select
                                value={normalizedStep.weightUnit || 'kg'}
                                onChange={(e) => {
                                  handleUpdateStepField(index, 'weightUnit', e.target.value);
                                  // Sync boxing unit with weight unit if not set differently
                                  if (!normalizedStep.boxingSize) {
                                    handleUpdateStepField(index, 'boxingSizeUnit', e.target.value);
                                  }
                                }}
                                className={styles.unitSelect}
                              >
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                                <option value="lb">lb</option>
                                <option value="L">L</option>
                                <option value="ml">ml</option>
                              </select>
                            </div>
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Yield %</label>
                            <div className={styles.yieldPercentInput}>
                              <Input
                                type="number"
                                value={normalizedStep.yieldPercent ?? ''}
                                onChange={(e) => handleUpdateYieldPercent(index, e.target.value)}
                                placeholder="e.g., 12"
                                size="small"
                                compact
                                min="0"
                                max="100"
                                step="0.1"
                                className={styles.numberInput}
                                title="Expected yield percentage from input weight"
                              />
                              <span className={styles.percentSign}>%</span>
                            </div>
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Boxing size</label>
                            <div className={styles.weightInput}>
                              <Input
                                type="number"
                                value={normalizedStep.boxingSize ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const boxingSize = val === '' ? null : parseFloat(val);
                                  handleUpdateStepField(index, 'boxingSize', boxingSize);
                                }}
                                onBlur={() => {
                                  // Auto-update portions and packaging on blur when both values are set
                                  const boxingSize = normalizedStep.boxingSize;
                                  if (boxingSize > 0 && normalizedStep.expectedWeight > 0) {
                                    const calculated = Math.round(normalizedStep.expectedWeight / boxingSize);
                                    handleUpdateStepField(index, 'portionsPerItem', calculated);
                                    // Update first packaging item quantity
                                    if (normalizedStep.packagingItems.length > 0) {
                                      handleUpdatePackagingItem(index, 0, { quantity: calculated });
                                    }
                                  }
                                }}
                                placeholder="e.g., 1"
                                size="small"
                                compact
                                min="0"
                                step="0.1"
                                className={styles.numberInput}
                                title="Size per container (e.g., 1 for 1L jars)"
                              />
                              <select
                                value={normalizedStep.boxingSizeUnit || normalizedStep.weightUnit || 'kg'}
                                onChange={(e) => handleUpdateStepField(index, 'boxingSizeUnit', e.target.value)}
                                className={styles.unitSelect}
                              >
                                <option value="kg">kg</option>
                                <option value="g">g</option>
                                <option value="lb">lb</option>
                                <option value="L">L</option>
                                <option value="ml">ml</option>
                              </select>
                            </div>
                            {/* Show calculated containers */}
                            {normalizedStep.boxingSize > 0 && normalizedStep.expectedWeight > 0 && (
                              <span className={styles.calculatedItems}>
                                = {Math.round(normalizedStep.expectedWeight / normalizedStep.boxingSize)} × {normalizedStep.boxingSize} {normalizedStep.boxingSizeUnit || normalizedStep.weightUnit}
                              </span>
                            )}
                          </div>
                          <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Portions/item</label>
                            <Input
                              type="number"
                              value={normalizedStep.boxingSize > 0 && normalizedStep.expectedWeight > 0
                                ? Math.round(normalizedStep.expectedWeight / normalizedStep.boxingSize)
                                : (normalizedStep.portionsPerItem || 1)}
                              onChange={(e) => handleUpdateStepField(index, 'portionsPerItem', parseInt(e.target.value) || 1)}
                              placeholder="1"
                              size="small"
                              compact
                              min="1"
                              step="1"
                              className={styles.numberInput}
                              title="How many portions each output item makes"
                              disabled={normalizedStep.boxingSize > 0 && normalizedStep.expectedWeight > 0}
                            />
                          </div>
                        </div>

                        {/* Cost per item display (if recipe cost available) */}
                        {outputCosts[index] && outputCosts[index].costPerPortion > 0 && (
                          <div className={styles.outputCostRow}>
                            <div className={styles.outputCostItem}>
                              <span className={styles.outputCostLabel}>Coût total:</span>
                              <span className={styles.outputCostValue}>
                                ${outputCosts[index].totalCost.toFixed(2)}
                              </span>
                            </div>
                            <div className={styles.outputCostItem}>
                              <span className={styles.outputCostLabel}>Coût/portion:</span>
                              <span className={styles.outputCostValue + ' ' + styles.costHighlight}>
                                ${outputCosts[index].costPerPortion.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Packaging fields - multiple items */}
                        <div className={styles.packagingSection}>
                          <div className={styles.packagingHeader}>
                            <label className={styles.fieldLabel}>Packaging</label>
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => handleAddPackagingItem(index)}
                              className={styles.addPackageBtn}
                              title="Add packaging item"
                            >
                              + Add Package
                            </Button>
                          </div>

                          {/* List of packaging items */}
                          {normalizedStep.packagingItems.length > 0 ? (
                            <div className={styles.packagingList}>
                              {normalizedStep.packagingItems.map((pkg, pkgIndex) => (
                                <div key={pkgIndex} className={styles.packagingItem}>
                                  <div className={styles.packagingRow}>
                                    <button
                                      type="button"
                                      className={`${styles.packagingLinkBtn} ${(pkg.linkedItemId || pkg.itemId) ? styles.linked : ''}`}
                                      onClick={() => handleOpenPackagingLink(index, pkgIndex, pkg)}
                                      title={(pkg.linkedItemId || pkg.itemId) ? `Linked: ${pkg.linkedItemName || pkg.itemName}` : 'Click to link to inventory'}
                                    >
                                      {pkg.itemName || 'Click to link...'}
                                      {(pkg.linkedItemId || pkg.itemId) && <span className={styles.linkIcon}>🔗</span>}
                                    </button>
                                    <span className={styles.timesSign}>×</span>
                                    <Input
                                      type="number"
                                      value={pkg.quantity || 1}
                                      onChange={(e) => {
                                        const qty = parseInt(e.target.value) || 1;
                                        const totalPrice = (pkg.unitPrice || 0) * qty;
                                        handleUpdatePackagingItem(index, pkgIndex, { quantity: qty, totalPrice });
                                      }}
                                      size="small"
                                      compact
                                      min="1"
                                      className={styles.quantityInput}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="small"
                                      onClick={() => handleRemovePackagingItem(index, pkgIndex)}
                                      className={styles.removePackageBtn}
                                      title="Remove packaging"
                                    >
                                      ✕
                                    </Button>
                                    {/* Price at end of row - like ingredients */}
                                    <div className={styles.packagingPriceEnd}>
                                      {pkg.unitPrice > 0 ? (
                                        <span className={styles.packagingTotalPrice}>
                                          ${((pkg.unitPrice || 0) * (pkg.quantity || 1)).toFixed(2)}
                                        </span>
                                      ) : (
                                        <span className={styles.packagingNoPrice}>—</span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Optional notes per packaging item */}
                                  <Input
                                    value={pkg.notes || ''}
                                    onChange={(e) => handleUpdatePackagingItem(index, pkgIndex, { notes: e.target.value })}
                                    placeholder="Packaging notes (e.g., date label required)"
                                    size="small"
                                    compact
                                    className={styles.packagingNotes}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className={styles.noPackaging}>
                              No packaging added
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : executionMode ? (
                  /* Execution Mode - read-only text but editable actualWeight */
                  <div className={`${styles.readOnlyItem} ${styles.executionItem} ${normalizedStep.isVariable ? styles.variableOutput : ''}`}>
                    <div className={styles.stepNumber}>•</div>
                    <div className={styles.stepContent}>
                      <p className={styles.stepText}>{stepText}</p>
                      {normalizedStep.producesItem && (
                        <div className={styles.executionProduction}>
                          <div className={styles.outputInfo}>
                            <span className={styles.outputName}>
                              → {normalizedStep.outputName || 'Unnamed'}
                            </span>
                            {normalizedStep.isVariable && (
                              <Badge variant="warning" size="small" title="Variable output - must be weighed">
                                Variable
                              </Badge>
                            )}
                          </div>
                          {/* Boxing size display - shows portion size to follow */}
                          {normalizedStep.boxingSize > 0 && (
                            <div className={styles.boxingSizeDisplay}>
                              <span className={styles.boxingLabel}>Portionner en:</span>
                              <span className={styles.boxingValue}>
                                {normalizedStep.boxingSize} {normalizedStep.boxingSizeUnit || normalizedStep.weightUnit || 'kg'}
                              </span>
                              <span className={styles.boxingCount}>
                                ({Math.round((normalizedStep.actualWeight ?? normalizedStep.expectedWeight ?? 0) / normalizedStep.boxingSize)} portions)
                              </span>
                              {/* Cost per portion in execution mode */}
                              {outputCosts[index] && outputCosts[index].costPerPortion > 0 && (
                                <span className={styles.boxingCost}>
                                  • ${outputCosts[index].costPerPortion.toFixed(2)}/portion
                                </span>
                              )}
                            </div>
                          )}
                          <div className={styles.weightRow}>
                            <div className={styles.expectedWeight}>
                              <span className={styles.weightLabel}>Attendu:</span>
                              <span className={styles.weightValue}>
                                {normalizedStep.expectedWeight || 0} {normalizedStep.weightUnit || 'kg'}
                                {normalizedStep.yieldPercent && ` (${normalizedStep.yieldPercent}%)`}
                              </span>
                            </div>
                            <div className={styles.actualWeight}>
                              <span className={styles.weightLabel}>Réel:</span>
                              <Input
                                type="number"
                                value={normalizedStep.actualWeight ?? normalizedStep.expectedWeight ?? ''}
                                onChange={(e) => handleUpdateActualWeight(index, e.target.value)}
                                placeholder="0"
                                size="small"
                                compact
                                min="0"
                                step="0.01"
                                className={`${styles.actualWeightInput} ${normalizedStep.isVariable && !normalizedStep.actualWeight && !normalizedStep.expectedWeight ? styles.required : ''}`}
                              />
                              <span className={styles.weightUnit}>{normalizedStep.weightUnit || 'kg'}</span>
                              {(normalizedStep.actualWeight > 0 || normalizedStep.expectedWeight > 0) && (
                                <span className={styles.checkmark}>✓</span>
                              )}
                              {normalizedStep.isVariable && !normalizedStep.actualWeight && !normalizedStep.expectedWeight && (
                                <span className={styles.requiredIndicator}>⚠️</span>
                              )}
                            </div>
                          </div>
                          {/* Packaging display - clickable to link */}
                          {normalizedStep.packagingItems?.length > 0 && (
                            <div className={styles.packagingDisplay}>
                              {normalizedStep.packagingItems.map((pkg, pkgIdx) => (
                                pkg.itemName && (
                                  <button
                                    key={pkgIdx}
                                    type="button"
                                    className={`${styles.packagingBadgeBtn} ${(pkg.linkedItemId || pkg.itemId) ? styles.linked : styles.unlinked}`}
                                    onClick={() => handleOpenPackagingLink(index, pkgIdx, pkg)}
                                    title={(pkg.linkedItemId || pkg.itemId)
                                      ? `${pkg.linkedItemName || pkg.itemName}: $${pkg.unitPrice?.toFixed(2)}/ea × ${pkg.quantity || 1} = $${((pkg.unitPrice || 0) * (pkg.quantity || 1)).toFixed(2)}`
                                      : 'Click to link to inventory'}
                                  >
                                    📦 {pkg.itemName} × {pkg.quantity || 1}
                                    {(pkg.linkedItemId || pkg.itemId) && pkg.unitPrice > 0 && (
                                      <span className={styles.pkgTotalPrice}>
                                        ${((pkg.unitPrice || 0) * (pkg.quantity || 1)).toFixed(2)}
                                      </span>
                                    )}
                                    {!(pkg.linkedItemId || pkg.itemId) && <span className={styles.linkHint}>🔗</span>}
                                  </button>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Standard Read-Only View */
                  <div className={styles.readOnlyItem}>
                    <div className={styles.stepNumber}>•</div>
                    <div className={styles.stepContent}>
                      <p className={styles.stepText}>{stepText}</p>
                      {normalizedStep.producesItem && (
                        <div className={styles.readOnlyProduction}>
                          <Badge variant="success" size="small">
                            → {normalizedStep.outputName || 'Unnamed'} ({normalizedStep.expectedWeight || 0} {normalizedStep.weightUnit || 'kg'})
                            {normalizedStep.portionsPerItem > 1 && ` • ${normalizedStep.portionsPerItem} portions/item`}
                          </Badge>
                          {normalizedStep.packagingItems?.length > 0 && normalizedStep.packagingItems.map((pkg, pkgIdx) => (
                            pkg.itemName && (
                              <Badge key={pkgIdx} variant="info" size="small">
                                📦 {pkg.itemName} × {pkg.quantity || 1}
                              </Badge>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📝</span>
          <p className={styles.emptyText}>
            No method steps yet. Add your first step below!
          </p>
        </div>
      )}

      {/* Add New Step */}
      {editable && (
        <div className={styles.addSection}>
          <div className={styles.addStepNumber}>•</div>
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onFocus={handleNewStepFocus}
            onKeyPress={handleKeyPress}
            placeholder="Enter new step description..."
            size="small"
            className={styles.stepInput}
            showVoice={micFlag}
            voiceActive={fieldVoiceActive?.type === 'new'}
            onVoiceClick={handleVoiceStop}
          />
          <Button
            variant="primary"
            size="small"
            onClick={handleAddStep}
            disabled={!newStep.trim()}
            className={styles.addButton}
          >
            + Add Step
          </Button>
        </div>
      )}

      {/* Yield Summary (execution mode only) */}
      {executionMode && yieldSummary && productionOutputCount > 0 && (
        <div className={styles.yieldSummary}>
          <div className={styles.yieldHeader}>
            <span className={styles.yieldTitle}>Rendement</span>
            {inputWeight && (
              <span className={styles.inputWeightDisplay}>
                Input: {inputWeight} {yieldSummary.outputUnit}
              </span>
            )}
          </div>
          <div className={styles.yieldStats}>
            <div className={styles.yieldStat}>
              <span className={styles.statLabel}>Attendu:</span>
              <span className={styles.statValue}>{yieldSummary.totalExpected.toFixed(2)} {yieldSummary.outputUnit}</span>
            </div>
            <div className={styles.yieldStat}>
              <span className={styles.statLabel}>Réel:</span>
              <span className={`${styles.statValue} ${yieldSummary.totalActual > 0 ? styles.filled : styles.empty}`}>
                {yieldSummary.totalActual > 0 ? yieldSummary.totalActual.toFixed(2) : '—'} {yieldSummary.outputUnit}
              </span>
            </div>
            {yieldSummary.yieldPercent && (
              <div className={styles.yieldStat}>
                <span className={styles.statLabel}>Rendement:</span>
                <span className={`${styles.statValue} ${styles.yieldPercent}`}>
                  {yieldSummary.yieldPercent}%
                </span>
              </div>
            )}
            {yieldSummary.waste !== null && yieldSummary.waste > 0 && (
              <div className={styles.yieldStat}>
                <span className={styles.statLabel}>Perte:</span>
                <span className={`${styles.statValue} ${styles.waste}`}>
                  {yieldSummary.waste.toFixed(2)} {yieldSummary.outputUnit}
                </span>
              </div>
            )}
          </div>
          {yieldSummary.variableCount > 0 && !yieldSummary.allVariablesFilled && (
            <div className={styles.yieldWarning}>
              <span>⚠️ {yieldSummary.variableCount} output{yieldSummary.variableCount > 1 ? 's' : ''} variable{yieldSummary.variableCount > 1 ? 's' : ''} à peser</span>
            </div>
          )}
        </div>
      )}

      {/* Packaging Link Modal */}
      {packagingLinkModal && (
        <PackagingLinkModal
          packagingName={packagingLinkModal.name}
          quantity={packagingLinkModal.quantity}
          currentLinked={packagingLinkModal.linked}
          onLink={handlePackagingLink}
          onUnlink={handlePackagingUnlink}
          onClose={() => setPackagingLinkModal(null)}
        />
      )}
    </div>
  );
}

MethodSteps.propTypes = {
  /** Array of step strings or objects */
  steps: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        text: PropTypes.string,
        producesItem: PropTypes.bool,
        outputName: PropTypes.string,
        expectedWeight: PropTypes.number,
        weightUnit: PropTypes.string,
        boxingSize: PropTypes.number,
        boxingSizeUnit: PropTypes.string,
        portionsPerItem: PropTypes.number,
        packagingItems: PropTypes.arrayOf(
          PropTypes.shape({
            itemId: PropTypes.number,
            itemName: PropTypes.string,
            quantity: PropTypes.number,
            notes: PropTypes.string
          })
        ),
        actualWeight: PropTypes.number,
        wasteWeight: PropTypes.number,
        completed: PropTypes.bool,
        isVariable: PropTypes.bool,
        yieldPercent: PropTypes.number,
      })
    ])
  ),
  /** Change handler (receives updated steps array) */
  onChange: PropTypes.func,
  /** Enable editing mode */
  editable: PropTypes.bool,
  /** Global voice mode enabled */
  micFlag: PropTypes.bool,
  /** Show voice input for bulk dictation */
  showVoice: PropTypes.bool,
  /** Voice input is active */
  voiceActive: PropTypes.bool,
  /** Voice button click handler */
  onVoiceClick: PropTypes.func,
  /** Handler to search for packaging items */
  onPackagingSearch: PropTypes.func,
  /** Enable production mode (shows production output options) */
  productionMode: PropTypes.bool,
  /** Enable execution mode (allows actualWeight entry in view mode) */
  executionMode: PropTypes.bool,
  /** Total input weight from inventory (for yield calculation) */
  inputWeight: PropTypes.number,
  /** Unit for input weight */
  inputWeightUnit: PropTypes.string,
  /** Total recipe cost (for calculating cost per output item) */
  recipeCost: PropTypes.number,
  /** Callback when packaging cost changes */
  onPackagingCostChange: PropTypes.func,
};

export default MethodSteps;
