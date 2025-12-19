import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Alert from '../common/Alert';
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
      packagingItems: [], // Array of packaging items
      actualWeight: null,
      wasteWeight: null,
      completed: false
    };
  }
  // Already an object, ensure all fields exist
  // Backward compatible: convert old `packaging` to `packagingItems` array
  let packagingItems = step.packagingItems || [];
  if (!packagingItems.length && step.packaging) {
    // Migrate old single packaging object to array
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
}) {
  // Ensure steps is always an array (handles null, undefined, string, etc.)
  const steps = Array.isArray(stepsProp) ? stepsProp : [];

  const [newStep, setNewStep] = useState('');
  const [fieldVoiceActive, setFieldVoiceActive] = useState(null); // { type: 'new'|'edit', index: number }
  const [fieldVoiceTranscript, setFieldVoiceTranscript] = useState('');

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
      const newPackaging = {
        itemId: null,
        itemName: '',
        quantity: 1,
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
        console.log('🎤 Bulk method steps recording started');
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
    console.log('🎤 Bulk voice complete:', result);
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

      console.log('📤 Sending to Claude:', fullText);
      const parsedSteps = await parseBulkMethodStepsWithClaude(fullText);

      console.log('✅ Received', parsedSteps.length, 'method steps from Claude');

      // Use ref to get current steps (avoid stale closure)
      const currentSteps = currentStepsRef.current;
      console.log('📋 Current steps count:', currentSteps.length);

      // Add all steps to the list (normalize to object format)
      const normalizedNewSteps = parsedSteps.map(s => normalizeStep(s));
      const updatedSteps = [...currentSteps, ...normalizedNewSteps];
      console.log('📋 Updated steps count:', updatedSteps.length);
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
                            <label className={styles.fieldLabel}>Expected weight</label>
                            <div className={styles.weightInput}>
                              <Input
                                type="number"
                                value={normalizedStep.expectedWeight || ''}
                                onChange={(e) => handleUpdateStepField(index, 'expectedWeight', parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                size="small"
                                compact
                                min="0"
                                step="0.1"
                                className={styles.numberInput}
                              />
                              <span className={styles.unitLabel}>kg</span>
                            </div>
                          </div>
                        </div>

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
                                    <Input
                                      value={pkg.itemName || ''}
                                      onChange={(e) => handleUpdatePackagingItem(index, pkgIndex, { itemName: e.target.value, itemId: null })}
                                      placeholder="Search packaging item..."
                                      size="small"
                                      compact
                                      className={styles.packagingInput}
                                    />
                                    <span className={styles.timesSign}>×</span>
                                    <Input
                                      type="number"
                                      value={pkg.quantity || 1}
                                      onChange={(e) => handleUpdatePackagingItem(index, pkgIndex, { quantity: parseInt(e.target.value) || 1 })}
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
                ) : (
                  <div className={styles.readOnlyItem}>
                    <div className={styles.stepNumber}>•</div>
                    <div className={styles.stepContent}>
                      <p className={styles.stepText}>{stepText}</p>
                      {normalizedStep.producesItem && (
                        <div className={styles.readOnlyProduction}>
                          <Badge variant="success" size="small">
                            → {normalizedStep.outputName || 'Unnamed'} ({normalizedStep.expectedWeight || 0} kg)
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
        completed: PropTypes.bool
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
};

export default MethodSteps;
