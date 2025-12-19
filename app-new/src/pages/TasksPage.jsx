/**
 * TasksPage
 *
 * Cook's view for assigned tasks
 * Shows pending and in-progress tasks with status controls
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  subscribeToTasks,
  updateTaskStatus,
  updateTask,
  deleteTask,
  TASK_STATUS
} from '../services/tasks/tasksService';
import styles from '../styles/pages/taskspage.module.css';

function TasksPage({ currentPrivilege }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('active'); // 'active', 'completed', 'all'
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);
  const [cookNote, setCookNote] = useState('');

  // Subscribe to tasks
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToTasks((allTasks) => {
      // Filter by assigned to current privilege if not owner
      let filteredTasks = allTasks;
      if (currentPrivilege && currentPrivilege.accessLevel !== 'owner') {
        filteredTasks = allTasks.filter(t =>
          t.assignedTo === currentPrivilege.id || !t.assignedTo
        );
      }
      setTasks(filteredTasks);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentPrivilege]);

  // Filter tasks based on current filter
  const filteredTasks = tasks.filter(task => {
    if (filter === 'active') {
      return task.status === TASK_STATUS.PENDING ||
             task.status === TASK_STATUS.IN_PROGRESS ||
             task.status === TASK_STATUS.PAUSED;
    }
    if (filter === 'completed') {
      return task.status === TASK_STATUS.COMPLETED;
    }
    return true; // 'all'
  });

  // Handle status change
  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTaskStatus(taskId, newStatus);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update task status');
    }
  };

  // Handle cook note save
  const handleSaveCookNote = async (taskId) => {
    try {
      await updateTask(taskId, { cookNotes: cookNote });
      setCookNote('');
      setExpandedTask(null);
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  // Handle delete task
  const handleDeleteTask = async (taskId) => {
    if (confirm('Delete this task?')) {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
      }
    }
  };

  // Open recipe
  const handleViewRecipe = (recipeId) => {
    navigate(`/recipes/${recipeId}/edit`);
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-CA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge class
  const getStatusClass = (status) => {
    switch (status) {
      case TASK_STATUS.PENDING: return styles.statusPending;
      case TASK_STATUS.IN_PROGRESS: return styles.statusInProgress;
      case TASK_STATUS.PAUSED: return styles.statusPaused;
      case TASK_STATUS.COMPLETED: return styles.statusCompleted;
      default: return '';
    }
  };

  // Get priority class
  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'urgent': return styles.priorityUrgent;
      case 'high': return styles.priorityHigh;
      case 'low': return styles.priorityLow;
      default: return styles.priorityNormal;
    }
  };

  return (
    <div className={styles.tasksPage}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>My Tasks</h1>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${filter === 'active' ? styles.active : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={`${styles.filterTab} ${filter === 'completed' ? styles.active : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
          <button
            className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className={styles.tasksList}>
        {loading ? (
          <div className={styles.loading}>Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              {filter === 'completed' ? '✅' : '📋'}
            </span>
            <p>
              {filter === 'completed'
                ? 'No completed tasks yet'
                : 'No tasks assigned'}
            </p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div
              key={task.id}
              className={`${styles.taskCard} ${getPriorityClass(task.priority)}`}
            >
              {/* Task Header */}
              <div className={styles.taskHeader}>
                <div className={styles.taskInfo}>
                  <h3 className={styles.taskName}>
                    {task.type === 'custom' && <span className={styles.customBadge}>Task</span>}
                    {task.recipeName}
                  </h3>
                  <div className={styles.taskMeta}>
                    {task.type !== 'custom' && task.portions > 1 && (
                      <span className={styles.portions}>
                        {task.portions} portions
                        {task.scaleFactor !== 1 && ` (x${task.scaleFactor.toFixed(2)})`}
                      </span>
                    )}
                    {task.station && (
                      <span className={styles.station}>{task.station}</span>
                    )}
                    {task.dueDate && (
                      <span className={styles.dueDate}>
                        Due: {formatDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`${styles.statusBadge} ${getStatusClass(task.status)}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>

              {/* Chef Notes */}
              {task.chefNotes && (
                <div className={styles.chefNotes}>
                  <strong>Chef:</strong> {task.chefNotes}
                </div>
              )}

              {/* Actions */}
              <div className={styles.taskActions}>
                {task.status === TASK_STATUS.PENDING && (
                  <button
                    className={styles.startButton}
                    onClick={() => handleStatusChange(task.id, TASK_STATUS.IN_PROGRESS)}
                  >
                    Start
                  </button>
                )}
                {task.status === TASK_STATUS.IN_PROGRESS && (
                  <>
                    <button
                      className={styles.pauseButton}
                      onClick={() => handleStatusChange(task.id, TASK_STATUS.PAUSED)}
                    >
                      Pause
                    </button>
                    <button
                      className={styles.completeButton}
                      onClick={() => handleStatusChange(task.id, TASK_STATUS.COMPLETED)}
                    >
                      Complete
                    </button>
                  </>
                )}
                {task.status === TASK_STATUS.PAUSED && (
                  <button
                    className={styles.resumeButton}
                    onClick={() => handleStatusChange(task.id, TASK_STATUS.IN_PROGRESS)}
                  >
                    Resume
                  </button>
                )}
{task.recipeId && (
                  <button
                    className={styles.viewButton}
                    onClick={() => handleViewRecipe(task.recipeId)}
                  >
                    View Recipe
                  </button>
                )}
                <button
                  className={styles.noteButton}
                  onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                >
                  Notes
                </button>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteTask(task.id)}
                  title="Delete task"
                >
                  🗑️
                </button>
              </div>

              {/* Expanded Notes Section */}
              {expandedTask === task.id && (
                <div className={styles.notesSection}>
                  {task.cookNotes && (
                    <div className={styles.existingNote}>
                      <strong>Your note:</strong> {task.cookNotes}
                    </div>
                  )}
                  <textarea
                    value={cookNote}
                    onChange={(e) => setCookNote(e.target.value)}
                    placeholder="Add a note..."
                    className={styles.noteInput}
                    rows={2}
                  />
                  <button
                    className={styles.saveNoteButton}
                    onClick={() => handleSaveCookNote(task.id)}
                    disabled={!cookNote.trim()}
                  >
                    Save Note
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TasksPage;
