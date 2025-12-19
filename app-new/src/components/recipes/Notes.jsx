import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Alert from '../common/Alert';
import { GoogleCloudVoiceService } from '../../services/speech/googleCloudVoice';
import { parseBulkNotesWithClaude } from '../../services/ai/claudeAPI';
import styles from '../../styles/components/notes.module.css';

/**
 * Notes Component
 *
 * Editable list of personal recipe notes with add/edit/delete
 */
function Notes({
  notes: notesProp = [],
  onChange = () => {},
  editable = true,
  micFlag = false,
  showVoice = false,
  voiceActive = false,
  onVoiceClick = () => {},
}) {
  // Ensure notes is always an array (handles null, undefined, string, etc.)
  const notes = Array.isArray(notesProp) ? notesProp : [];

  const [newNote, setNewNote] = useState('');
  const [fieldVoiceActive, setFieldVoiceActive] = useState(null); // { type: 'new'|'edit', index: number }
  const [fieldVoiceTranscript, setFieldVoiceTranscript] = useState('');

  // Bulk voice dictation state
  const [bulkVoiceActive, setBulkVoiceActive] = useState(false);
  const [bulkTranscript, setBulkTranscript] = useState({ fullTranscript: '', currentLine: '', lines: [] });
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const bulkVoiceRef = useRef(null);
  const fieldVoiceRef = useRef(null);

  // Ref to always have current notes (avoid stale closure)
  const currentNotesRef = useRef(notes);

  // Update ref when notes change
  useEffect(() => {
    currentNotesRef.current = notes;
  }, [notes]);

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

  // Handle input field focus for new note
  const handleNewNoteFocus = async () => {
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
          setNewNote(result.fullTranscript);
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

  // Handle input field focus for editing existing note
  const handleEditNoteFocus = async (index) => {
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
          handleUpdateNote(index, result.fullTranscript);
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

  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const updatedNotes = [...notes, newNote.trim()];
    onChange(updatedNotes);
    setNewNote('');
  };

  const handleRemoveNote = (index) => {
    const updatedNotes = notes.filter((_, i) => i !== index);

    // If no notes left, set to null to hide component
    if (updatedNotes.length === 0) {
      onChange(null);
    } else {
      onChange(updatedNotes);
    }
  };

  const handleUpdateNote = (index, value) => {
    const updatedNotes = notes.map((note, i) => (i === index ? value : note));
    onChange(updatedNotes);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddNote();
    }
  };

  const handleMoveNote = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === notes.length - 1)
    ) {
      return;
    }

    const updatedNotes = [...notes];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedNotes[index], updatedNotes[newIndex]] = [
      updatedNotes[newIndex],
      updatedNotes[index],
    ];
    onChange(updatedNotes);
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
        console.log('🎤 Bulk notes recording started');
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
    console.log('🎤 Bulk notes voice complete:', result);
    setBulkVoiceActive(false);

    const hasContent = result.lines.length > 0 || (result.fullTranscript && result.fullTranscript.trim());
    if (!hasContent) {
      setBulkError('No notes detected. Please try again.');
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
      const parsedNotes = await parseBulkNotesWithClaude(fullText);

      console.log('✅ Received', parsedNotes.length, 'notes from Claude');

      // Use ref to get current notes (avoid stale closure)
      const currentNotes = currentNotesRef.current;
      console.log('📋 Current notes count:', currentNotes.length);

      // Add all notes to the list
      const updatedNotes = [...currentNotes, ...parsedNotes];
      console.log('📋 Updated notes count:', updatedNotes.length);
      onChange(updatedNotes);

      // Reset bulk voice state
      setBulkTranscript({ fullTranscript: '', currentLine: '', lines: [] });
      setBulkProcessing(false);

    } catch (error) {
      console.error('❌ Error parsing bulk notes:', error);
      setBulkError(`Failed to parse notes: ${error.message}`);
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
    <div className={styles.notes}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>
          Notes
          <Badge variant="info" size="small">
            {notes.length}
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

      {/* Notes List */}
      {notes.length > 0 ? (
        <ol className={styles.list}>
          {notes.map((note, index) => (
            <li key={index} className={styles.listItem}>
              {editable ? (
                <div className={styles.editableItem}>
                  <div className={styles.noteNumber}>•</div>
                  <Input
                    value={note}
                    onChange={(e) => handleUpdateNote(index, e.target.value)}
                    onFocus={() => handleEditNoteFocus(index)}
                    size="small"
                    compact
                    className={styles.noteInput}
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
                      onClick={() => handleMoveNote(index, 'up')}
                      className={styles.moveButton}
                      disabled={index === 0}
                      aria-label={`Move note ${index + 1} up`}
                      title="Move up"
                    >
                      <span aria-hidden="true">↑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleMoveNote(index, 'down')}
                      className={styles.moveButton}
                      disabled={index === notes.length - 1}
                      aria-label={`Move note ${index + 1} down`}
                      title="Move down"
                    >
                      <span aria-hidden="true">↓</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => handleRemoveNote(index)}
                      className={styles.removeButton}
                      aria-label={`Remove note ${index + 1}`}
                      title="Remove note"
                    >
                      <span aria-hidden="true">🗑️</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.readOnlyItem}>
                  <div className={styles.noteNumber}>•</div>
                  <p className={styles.noteText}>{note}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📝</span>
          <p className={styles.emptyText}>
            No notes yet. Add your first note below!
          </p>
        </div>
      )}

      {/* Add New Note */}
      {editable && (
        <div className={styles.addSection}>
          <div className={styles.addNoteNumber}>•</div>
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onFocus={handleNewNoteFocus}
            onKeyPress={handleKeyPress}
            placeholder="Enter new note..."
            size="small"
            className={styles.noteInput}
            showVoice={micFlag}
            voiceActive={fieldVoiceActive?.type === 'new'}
            onVoiceClick={handleVoiceStop}
          />
          <Button
            variant="primary"
            size="small"
            onClick={handleAddNote}
            disabled={!newNote.trim()}
            className={styles.addButton}
          >
            + Add Note
          </Button>
        </div>
      )}
    </div>
  );
}

Notes.propTypes = {
  /** Array of note strings */
  notes: PropTypes.arrayOf(PropTypes.string),
  /** Change handler (receives updated notes array or null) */
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

export default Notes;
