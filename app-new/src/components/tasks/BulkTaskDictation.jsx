/**
 * BulkTaskDictation Component
 *
 * Modal for bulk task creation via voice dictation.
 * Features:
 * - Continuous voice recording with pause detection
 * - Real-time transcript display
 * - Automatic recipe/user matching
 * - Task preview with edit capability
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { BulkTaskVoice, PAUSE_PRESETS } from '../../services/voice/bulkTaskVoice';
import { parseTaskTranscript } from '../../services/tasks/taskParser';
import { createTask } from '../../services/tasks/tasksService';
import styles from '../../styles/components/bulktaskdictation.module.css';

function BulkTaskDictation({
  recipes = [],
  users = [],
  currentDepartment = null,
  onTasksCreated,
  onClose
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentLine, setCurrentLine] = useState('');
  const [lines, setLines] = useState([]);

  // Parsed tasks state
  const [parsedTasks, setParsedTasks] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [creationResults, setCreationResults] = useState(null);

  // Voice service ref
  const voiceServiceRef = useRef(null);

  // Initialize voice service
  useEffect(() => {
    voiceServiceRef.current = new BulkTaskVoice({
      pausePreset: 'NORMAL',
      language: 'fr-CA',
      onTranscriptUpdate: handleTranscriptUpdate,
      onComplete: handleRecordingComplete,
      onError: handleRecordingError,
    });

    return () => {
      if (voiceServiceRef.current) {
        voiceServiceRef.current.destroy();
      }
    };
  }, []);

  // Parse tasks when lines change
  useEffect(() => {
    if (lines.length > 0) {
      const fullText = lines.join('. ');
      const tasks = parseTaskTranscript(fullText, recipes, users);
      setParsedTasks(tasks);
    }
  }, [lines, recipes, users]);

  // Handle transcript updates from voice service
  const handleTranscriptUpdate = useCallback((data) => {
    setTranscript(data.fullTranscript);
    setCurrentLine(data.currentLine);
    setLines(data.lines);
  }, []);

  // Handle recording complete
  const handleRecordingComplete = useCallback((result) => {
    setIsRecording(false);
    setLines(result.lines);
  }, []);

  // Handle recording error
  const handleRecordingError = useCallback((err) => {
    setError(`Recording error: ${err}`);
    setIsRecording(false);
  }, []);

  // Toggle recording
  const toggleRecording = () => {
    if (!BulkTaskVoice.isSupported()) {
      setError('Speech recognition is not supported in this browser');
      return;
    }

    if (isRecording) {
      voiceServiceRef.current?.stop();
      setIsRecording(false);
    } else {
      setError(null);
      voiceServiceRef.current?.start();
      setIsRecording(true);
    }
  };

  // Update a parsed task
  const updateTask = (index, updates) => {
    setParsedTasks(prev => {
      const newTasks = [...prev];
      newTasks[index] = { ...newTasks[index], ...updates };
      return newTasks;
    });
    setEditingIndex(null);
  };

  // Remove a parsed task
  const removeTask = (index) => {
    setParsedTasks(prev => prev.filter((_, i) => i !== index));
  };

  // Create all tasks
  const handleCreateTasks = async () => {
    if (parsedTasks.length === 0) return;

    setIsCreating(true);
    setError(null);

    const results = {
      success: [],
      failed: []
    };

    for (const task of parsedTasks) {
      try {
        const taskId = await createTask({
          recipeId: task.recipeId,
          recipeName: task.recipeName,
          portions: task.portions,
          portionUnit: task.unit || '',
          scaleFactor: task.scaleFactor,
          assignedTo: task.assignedTo,
          assignedToName: task.assignedToName,
          station: null,
          department: currentDepartment,
          dueDate: null,
          dueTime: null,
          chefNotes: task.unit ? `${task.portions} ${task.unit}` : '',
          priority: 'normal',
          type: task.type
        });

        results.success.push({ ...task, id: taskId });
      } catch (err) {
        results.failed.push({ ...task, error: err.message });
      }
    }

    setCreationResults(results);
    setIsCreating(false);

    if (results.failed.length === 0) {
      onTasksCreated?.(results.success);
      // Auto-close after short delay
      setTimeout(() => onClose(), 500);
    }
  };

  // Clear and start over
  const handleClear = () => {
    setTranscript('');
    setCurrentLine('');
    setLines([]);
    setParsedTasks([]);
    setCreationResults(null);
    setError(null);
    voiceServiceRef.current?.cancel();
  };

  // Get confidence color
  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#27ae60'; // Green
    if (confidence >= 0.5) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Bulk Task Dictation</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Recording Section */}
        <div className={styles.recordingSection}>
          <button
            className={`${styles.micButton} ${isRecording ? styles.recording : ''}`}
            onClick={toggleRecording}
            disabled={isCreating}
          >
            {isRecording ? '🔴' : '🎤'}
          </button>
          <div className={styles.recordingInfo}>
            <span className={styles.recordingStatus}>
              {isRecording ? 'Listening... Speak your tasks' : 'Click to start recording'}
            </span>
            <span className={styles.recordingHint}>
              Example: "Pour Mage, 2X poulet au beurre. 30 litres de sauce bechamel."
            </span>
          </div>
        </div>

        {/* Transcript Display */}
        {(transcript || currentLine) && (
          <div className={styles.transcriptSection}>
            <label className={styles.sectionLabel}>Transcript</label>
            <div className={styles.transcript}>
              {transcript}
              {currentLine && (
                <span className={styles.currentLine}>{currentLine}</span>
              )}
            </div>
          </div>
        )}

        {/* Parsed Tasks Preview */}
        {parsedTasks.length > 0 && (
          <div className={styles.tasksSection}>
            <label className={styles.sectionLabel}>
              Parsed Tasks ({parsedTasks.length})
            </label>
            <div className={styles.tasksList}>
              {parsedTasks.map((task, index) => (
                <div
                  key={index}
                  className={`${styles.taskItem} ${task.type === 'custom' ? styles.customTask : ''}`}
                >
                  {editingIndex === index ? (
                    // Edit mode
                    <div className={styles.taskEdit}>
                      <input
                        type="text"
                        value={task.recipeName}
                        onChange={(e) => updateTask(index, { recipeName: e.target.value })}
                        className={styles.editInput}
                        autoFocus
                      />
                      <input
                        type="number"
                        value={task.portions}
                        onChange={(e) => updateTask(index, { portions: parseInt(e.target.value) || 1 })}
                        className={styles.editPortions}
                        min="1"
                      />
                      <select
                        value={task.assignedTo || ''}
                        onChange={(e) => {
                          const user = users.find(u => u.id === e.target.value);
                          updateTask(index, {
                            assignedTo: e.target.value || null,
                            assignedToName: user?.name || 'Team'
                          });
                        }}
                        className={styles.editSelect}
                      >
                        <option value="">Team</option>
                        {users.map(user => (
                          <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                      </select>
                      <button
                        className={styles.editDone}
                        onClick={() => setEditingIndex(null)}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    // Display mode
                    <>
                      <span className={`${styles.taskType} ${styles[task.type]}`}>
                        {task.type === 'recipe' ? 'Recipe' : 'Task'}
                      </span>
                      <span className={styles.taskName}>{task.recipeName}</span>
                      {task.type === 'recipe' && (
                        <span className={styles.taskPortions}>
                          x{task.portions}{task.unit ? ` ${task.unit}` : ''}
                        </span>
                      )}
                      <span className={styles.taskAssignee}>
                        {task.assignedToName}
                      </span>
                      {task.type === 'recipe' && (
                        <span
                          className={styles.confidence}
                          style={{ color: getConfidenceColor(task.confidence) }}
                          title={`Match confidence: ${Math.round(task.confidence * 100)}%`}
                        >
                          {task.confidence >= 0.8 ? '✓' : task.confidence >= 0.5 ? '?' : '!'}
                        </span>
                      )}
                      <div className={styles.taskActions}>
                        <button
                          className={styles.editBtn}
                          onClick={() => setEditingIndex(index)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() => removeTask(index)}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className={styles.error}>{error}</div>
        )}

        {/* Creation Results */}
        {creationResults && creationResults.failed.length > 0 && (
          <div className={styles.results}>
            <div className={styles.resultsSuccess}>
              {creationResults.success.length} tasks created successfully
            </div>
            <div className={styles.resultsFailed}>
              {creationResults.failed.length} tasks failed:
              <ul>
                {creationResults.failed.map((task, i) => (
                  <li key={i}>{task.recipeName}: {task.error}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.clearBtn}
            onClick={handleClear}
            disabled={isRecording || isCreating}
          >
            Clear
          </button>
          <button
            className={styles.createBtn}
            onClick={handleCreateTasks}
            disabled={parsedTasks.length === 0 || isRecording || isCreating}
          >
            {isCreating ? 'Creating...' : `Create ${parsedTasks.length} Task${parsedTasks.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

BulkTaskDictation.propTypes = {
  /** Array of recipe objects for matching */
  recipes: PropTypes.array,
  /** Array of user/privilege objects for assignment */
  users: PropTypes.array,
  /** Current department for task assignment */
  currentDepartment: PropTypes.string,
  /** Callback when tasks are created successfully */
  onTasksCreated: PropTypes.func,
  /** Callback to close the modal */
  onClose: PropTypes.func.isRequired,
};

export default BulkTaskDictation;
