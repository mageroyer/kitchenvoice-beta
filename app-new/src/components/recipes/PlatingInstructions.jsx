import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Alert from '../common/Alert';
import { GoogleCloudVoiceService } from '../../services/speech/googleCloudVoice';
import { parseBulkPlatingWithClaude } from '../../services/ai/claudeAPI';
import styles from '../../styles/components/platinginstructions.module.css';

/**
 * PlatingInstructions Component
 *
 * Editable list of plating/presentation instructions with add/edit/delete
 */
function PlatingInstructions({
  instructions: instructionsProp = [],
  onChange = () => {},
  editable = true,
  micFlag = false,
  showVoice = false,
  voiceActive = false,
  onVoiceClick = () => {},
}) {
  // Ensure instructions is always an array (handles null, undefined, string, etc.)
  const instructions = Array.isArray(instructionsProp) ? instructionsProp : [];

  const [newInstruction, setNewInstruction] = useState('');
  const [fieldVoiceActive, setFieldVoiceActive] = useState(null); // { type: 'new'|'edit', index: number }
  const [fieldVoiceTranscript, setFieldVoiceTranscript] = useState('');

  // Bulk voice dictation state
  const [bulkVoiceActive, setBulkVoiceActive] = useState(false);
  const [bulkTranscript, setBulkTranscript] = useState({ fullTranscript: '', currentLine: '', lines: [] });
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const bulkVoiceRef = useRef(null);
  const fieldVoiceRef = useRef(null);

  // Ref to always have current instructions (avoid stale closure)
  const currentInstructionsRef = useRef(instructions);

  // Update ref when instructions change
  useEffect(() => {
    currentInstructionsRef.current = instructions;
  }, [instructions]);

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

  // Handle input field focus for new instruction
  const handleNewInstructionFocus = async () => {
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
          setNewInstruction(result.fullTranscript);
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

  // Handle input field focus for editing existing instruction
  const handleEditInstructionFocus = async (index) => {
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
          handleUpdateInstruction(index, result.fullTranscript);
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

  const handleAddInstruction = () => {
    if (!newInstruction.trim()) return;

    const updatedInstructions = [...instructions, newInstruction.trim()];
    onChange(updatedInstructions);
    setNewInstruction('');
  };

  const handleRemoveInstruction = (index) => {
    const updatedInstructions = instructions.filter((_, i) => i !== index);

    // If no instructions left, set to null to hide component
    if (updatedInstructions.length === 0) {
      onChange(null);
    } else {
      onChange(updatedInstructions);
    }
  };

  const handleUpdateInstruction = (index, value) => {
    const updatedInstructions = instructions.map((instruction, i) =>
      i === index ? value : instruction
    );
    onChange(updatedInstructions);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddInstruction();
    }
  };

  const handleMoveInstruction = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === instructions.length - 1)
    ) {
      return;
    }

    const updatedInstructions = [...instructions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedInstructions[index], updatedInstructions[newIndex]] = [
      updatedInstructions[newIndex],
      updatedInstructions[index],
    ];
    onChange(updatedInstructions);
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
        console.log('🎤 Bulk plating recording started');
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
    console.log('🎤 Bulk plating voice complete:', result);
    setBulkVoiceActive(false);

    const hasContent = result.lines.length > 0 || (result.fullTranscript && result.fullTranscript.trim());
    if (!hasContent) {
      setBulkError('No plating instructions detected. Please try again.');
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
      const parsedInstructions = await parseBulkPlatingWithClaude(fullText);

      console.log('✅ Received', parsedInstructions.length, 'plating instructions from Claude');

      // Use ref to get current instructions (avoid stale closure)
      const currentInstructions = currentInstructionsRef.current;
      console.log('📋 Current instructions count:', currentInstructions.length);

      // Add all instructions to the list
      const updatedInstructions = [...currentInstructions, ...parsedInstructions];
      console.log('📋 Updated instructions count:', updatedInstructions.length);
      onChange(updatedInstructions);

      // Reset bulk voice state
      setBulkTranscript({ fullTranscript: '', currentLine: '', lines: [] });
      setBulkProcessing(false);

    } catch (error) {
      console.error('❌ Error parsing bulk plating instructions:', error);
      setBulkError(`Failed to parse plating instructions: ${error.message}`);
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

  return (
    <div className={styles.platingInstructions}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>
          Plating Instructions
          <Badge variant="info" size="small">
            {instructions.length}
          </Badge>
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
        <div className={styles.bulkVoiceIndicator}>
          <button
            type="button"
            className={styles.bulkVoiceMic}
            onClick={handleBulkVoiceStop}
            title="Click to stop recording"
          >
            🎤
          </button>
        </div>
      )}

      {/* Instructions List */}
      {instructions.length > 0 ? (
        <ol className={styles.list}>
          {instructions.map((instruction, index) => (
            <li key={index} className={styles.listItem}>
              {editable ? (
                <div className={styles.editableItem}>
                  <div className={styles.instructionNumber}>•</div>
                  <Input
                    value={instruction}
                    onChange={(e) => handleUpdateInstruction(index, e.target.value)}
                    onFocus={() => handleEditInstructionFocus(index)}
                    size="small"
                    compact
                    className={styles.instructionInput}
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
                      onClick={() => handleMoveInstruction(index, 'up')}
                      className={styles.moveButton}
                      disabled={index === 0}
                      aria-label={`Move instruction ${index + 1} up`}
                      title="Move up"
                    >
                      <span aria-hidden="true">↑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleMoveInstruction(index, 'down')}
                      className={styles.moveButton}
                      disabled={index === instructions.length - 1}
                      aria-label={`Move instruction ${index + 1} down`}
                      title="Move down"
                    >
                      <span aria-hidden="true">↓</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveInstruction(index)}
                      className={styles.removeButton}
                      aria-label={`Remove instruction ${index + 1}`}
                      title="Remove instruction"
                    >
                      <span aria-hidden="true">🗑️</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.readOnlyItem}>
                  <div className={styles.instructionNumber}>•</div>
                  <p className={styles.instructionText}>{instruction}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🍽️</span>
          <p className={styles.emptyText}>
            No plating instructions yet. Add your first instruction below!
          </p>
        </div>
      )}

      {/* Add New Instruction */}
      {editable && (
        <div className={styles.addSection}>
          <div className={styles.addInstructionNumber}>•</div>
          <Input
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            onFocus={handleNewInstructionFocus}
            onKeyPress={handleKeyPress}
            placeholder="Enter new plating instruction..."
            size="small"
            className={styles.instructionInput}
            showVoice={micFlag}
            voiceActive={fieldVoiceActive?.type === 'new'}
            onVoiceClick={handleVoiceStop}
          />
          <Button
            variant="primary"
            size="small"
            onClick={handleAddInstruction}
            disabled={!newInstruction.trim()}
            className={styles.addButton}
          >
            + Add Instruction
          </Button>
        </div>
      )}
    </div>
  );
}

PlatingInstructions.propTypes = {
  /** Array of instruction strings */
  instructions: PropTypes.arrayOf(PropTypes.string),
  /** Change handler (receives updated instructions array) */
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
};

export default PlatingInstructions;
