/**
 * DepartmentTasksPage
 *
 * Team view for department tasks
 * - Shows all tasks for current department
 * - Team members can check tasks as done
 * - Shows today's progress and overall stats
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  subscribeToDepartmentTasks,
  updateTaskStatus,
  getTaskProgress,
  claimTask,
  releaseTask,
  clearCompletedTasks,
  deleteTask,
  updateTask,
  TASK_STATUS
} from '../services/tasks/tasksService';
import {
  getSuggestionsForDay,
  createTasksFromSuggestions
} from '../services/tasks/taskSuggestionService';
import { getAllPrivileges, ACCESS_LEVELS } from '../services/auth/privilegesService';
import { recipeDB } from '../services/database/indexedDB';
import AssignTaskModal from '../components/common/AssignTaskModal';
import BulkTaskDictation from '../components/tasks/BulkTaskDictation';
import styles from '../styles/pages/departmenttaskspage.module.css';

function DepartmentTasksPage({ currentDepartment, currentPrivilege, isOwner }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today'); // 'today', 'active', 'all', 'completed'
  const [stationFilter, setStationFilter] = useState('all');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showBulkDictation, setShowBulkDictation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [clearingTasks, setClearingTasks] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [users, setUsers] = useState([]);

  // Subscribe to department tasks (or all tasks if no department set)
  useEffect(() => {
    setLoading(true);

    // Pass null/empty to get all tasks, or specific department to filter
    const unsubscribe = subscribeToDepartmentTasks(currentDepartment || null, (deptTasks) => {
      setTasks(deptTasks);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentDepartment]);

  // Load recipes and users for bulk dictation
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load recipes
        const allRecipes = await recipeDB.getAll();
        setRecipes(allRecipes || []);

        // Load users (privileges)
        const privileges = await getAllPrivileges();
        const cooksList = (privileges || []).filter(p =>
          p.accessLevel === ACCESS_LEVELS.EDITOR ||
          p.accessLevel === ACCESS_LEVELS.VIEWER ||
          p.accessLevel === ACCESS_LEVELS.OWNER
        );
        setUsers(cooksList);
      } catch (error) {
        console.error('Error loading data for bulk dictation:', error);
      }
    };
    loadData();
  }, []);

  // Get unique stations from tasks
  const stations = useMemo(() => {
    const stationSet = new Set(tasks.map(t => t.station).filter(Boolean));
    return Array.from(stationSet).sort();
  }, [tasks]);

  // Filter tasks based on current filter
  const filteredTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let result = tasks;

    // Apply time filter
    switch (filter) {
      case 'today':
        result = result.filter(task => {
          const isDueToday = task.dueDate && task.dueDate >= today && task.dueDate < tomorrow;
          const isCreatedToday = task.createdAt && task.createdAt >= today && task.createdAt < tomorrow;
          const isActive = task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.IN_PROGRESS;
          return isDueToday || isCreatedToday || isActive;
        });
        break;
      case 'active':
        result = result.filter(task =>
          task.status === TASK_STATUS.PENDING ||
          task.status === TASK_STATUS.IN_PROGRESS ||
          task.status === TASK_STATUS.PAUSED
        );
        break;
      case 'completed':
        result = result.filter(task => task.status === TASK_STATUS.COMPLETED);
        break;
      // 'all' shows everything
    }

    // Apply station filter
    if (stationFilter !== 'all') {
      result = result.filter(task => task.station === stationFilter);
    }

    // Sort: in_progress first, then pending, then paused, completed at bottom
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const statusOrder = { in_progress: 0, pending: 1, paused: 2, completed: 99 };

    return result.sort((a, b) => {
      // First sort by status (completed always at bottom)
      const statusDiff = (statusOrder[a.status] || 50) - (statusOrder[b.status] || 50);
      if (statusDiff !== 0) return statusDiff;
      // Then by priority
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
  }, [tasks, filter, stationFilter]);

  // Get progress stats
  const progress = useMemo(() => getTaskProgress(filteredTasks), [filteredTasks]);
  const todayProgress = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTasks = tasks.filter(task => {
      const isDueToday = task.dueDate && task.dueDate >= today && task.dueDate < tomorrow;
      const isCreatedToday = task.createdAt && task.createdAt >= today && task.createdAt < tomorrow;
      return isDueToday || isCreatedToday || task.status !== TASK_STATUS.COMPLETED;
    });

    return getTaskProgress(todayTasks);
  }, [tasks]);

  // Handle task status toggle
  const handleToggleComplete = async (task) => {
    try {
      if (task.status === TASK_STATUS.COMPLETED) {
        // Uncomplete - set back to pending
        await updateTaskStatus(task.id, TASK_STATUS.PENDING);
      } else {
        // Complete the task
        await updateTaskStatus(task.id, TASK_STATUS.COMPLETED);
      }
    } catch (error) {
      console.error('Error updating task:', error);

      // Provide specific guidance based on error type
      if (error.message?.includes('Internal vendor not found') ||
          error.message?.includes('business setup')) {
        alert('Complete business setup first.\n\nGo to Settings to configure your business and enable production tracking.');
      } else {
        alert(`Failed to update task: ${error.message || 'Unknown error'}`);
      }
    }
  };

  // Handle start task
  const handleStartTask = async (taskId) => {
    try {
      await updateTaskStatus(taskId, TASK_STATUS.IN_PROGRESS);
    } catch (error) {
      console.error('Error starting task:', error);
    }
  };

  // Handle claim task (team member takes ownership)
  const handleClaimTask = async (taskId) => {
    if (!currentPrivilege) {
      alert('Please log in to claim tasks');
      return;
    }
    try {
      await claimTask(taskId, currentPrivilege.id, currentPrivilege.name);
    } catch (error) {
      console.error('Error claiming task:', error);
      alert('Failed to claim task');
    }
  };

  // Handle release task (give back to team)
  const handleReleaseTask = async (taskId) => {
    try {
      await releaseTask(taskId);
    } catch (error) {
      console.error('Error releasing task:', error);
      alert('Failed to release task');
    }
  };

  // Handle cancel/delete task
  const handleCancelTask = async (task) => {
    const taskName = task.recipeName || 'this task';
    if (!confirm(`Cancel "${taskName}"?\n\nThis will permanently delete the task.`)) {
      return;
    }
    try {
      await deleteTask(task.id);
    } catch (error) {
      console.error('Error canceling task:', error);
      alert('Failed to cancel task: ' + error.message);
    }
  };

  // Handle editing task portions/scale
  const handleEditPortions = async (task) => {
    const currentPortions = task.portions || 1;
    const input = prompt(`Change portions for "${task.recipeName}":\n\nCurrent: ${currentPortions}`, currentPortions);

    if (input === null) return; // Cancelled

    const newPortions = parseInt(input, 10);
    if (isNaN(newPortions) || newPortions < 1) {
      alert('Please enter a valid number (1 or more)');
      return;
    }

    if (newPortions === currentPortions) return; // No change

    try {
      // When user manually sets portions, scaleFactor should be 1
      // (the portions value IS the final quantity they want)
      await updateTask(task.id, {
        portions: newPortions,
        scaleFactor: 1
      });
    } catch (error) {
      console.error('Error updating portions:', error);
      alert('Failed to update portions: ' + error.message);
    }
  };

  // Handle clearing all completed tasks
  const handleClearCompleted = async () => {
    if (!confirm('Clear all completed tasks? History is preserved in production logs.')) {
      return;
    }

    setClearingTasks(true);
    try {
      const result = await clearCompletedTasks();
      alert(`Cleared ${result.deleted} completed task(s).`);
    } catch (error) {
      console.error('Error clearing tasks:', error);
      alert('Failed to clear tasks: ' + error.message);
    } finally {
      setClearingTasks(false);
    }
  };

  // Handle getting task suggestions
  const handleGetSuggestions = async () => {
    setSuggestionsLoading(true);
    setShowSuggestions(true);

    try {
      const result = await getSuggestionsForDay(currentDepartment || null);
      setSuggestions(result);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Failed to get suggestions: ' + error.message);
      setShowSuggestions(false);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  // Handle creating tasks from suggestions
  const handleApplySuggestions = async (selectedSuggestions) => {
    try {
      const result = await createTasksFromSuggestions(selectedSuggestions, {
        department: currentDepartment,
        dueDate: new Date().toISOString().split('T')[0]
      });

      alert(`Created ${result.created} task(s)${result.errors > 0 ? `, ${result.errors} failed` : ''}.`);
      setShowSuggestions(false);
      setSuggestions(null);
    } catch (error) {
      console.error('Error creating tasks:', error);
      alert('Failed to create tasks: ' + error.message);
    }
  };

  // Check if current user owns this task
  const isMyTask = (task) => {
    return currentPrivilege && task.assignedTo === currentPrivilege.id;
  };

  // Check if task is unassigned (available for claiming)
  const isTeamTask = (task) => {
    return !task.assignedTo;
  };

  // Format time
  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('fr-CA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get priority class
  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'urgent': return styles.priorityUrgent;
      case 'high': return styles.priorityHigh;
      case 'low': return styles.priorityLow;
      default: return '';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case TASK_STATUS.COMPLETED: return '✅';
      case TASK_STATUS.IN_PROGRESS: return '🔄';
      case TASK_STATUS.PAUSED: return '⏸️';
      default: return '⬜';
    }
  };


  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.title}>{currentDepartment || 'All Departments'}</h1>
            <span className={styles.subtitle}>Team Tasks</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.iconBtn}
            onClick={handleGetSuggestions}
            disabled={suggestionsLoading}
            title="Suggest tasks based on last week"
          >
            {suggestionsLoading ? '...' : '💡'}
          </button>
          <button
            className={styles.iconBtn}
            onClick={handleClearCompleted}
            disabled={clearingTasks || progress.completed === 0}
            title="Clear all completed tasks"
          >
            {clearingTasks ? '...' : '🗑️'}
          </button>
          <button
            className={styles.dictationBtn}
            onClick={() => setShowBulkDictation(true)}
            title="Bulk Task Dictation"
          >
            🎤
          </button>
          <button
            className={styles.addTaskBtn}
            onClick={() => setShowTaskModal(true)}
          >
            + Add Task
          </button>
          <div className={styles.todayDate}>
            {new Date().toLocaleDateString('fr-CA', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        </div>
      </div>


      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${filter === 'today' ? styles.active : ''}`}
            onClick={() => setFilter('today')}
          >
            Today
          </button>
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

        {stations.length > 0 && (
          <select
            className={styles.stationSelect}
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
          >
            <option value="all">All Stations</option>
            {stations.map(station => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tasks List */}
      <div className={styles.tasksList}>
        {loading ? (
          <div className={styles.loading}>Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              {filter === 'completed' ? '🎉' : '📋'}
            </span>
            <p>
              {filter === 'completed'
                ? 'No completed tasks yet'
                : filter === 'today'
                ? 'No tasks for today!'
                : 'No tasks found'}
            </p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div
              key={task.id}
              className={`${styles.taskItem} ${getPriorityClass(task.priority)} ${
                task.status === TASK_STATUS.COMPLETED ? styles.completed : ''
              }`}
            >
              {/* Checkbox */}
              <button
                className={styles.checkbox}
                onClick={() => handleToggleComplete(task)}
                title={task.status === TASK_STATUS.COMPLETED ? 'Mark as incomplete' : 'Mark as complete'}
              >
                {getStatusIcon(task.status)}
              </button>

              {/* Task Info */}
              <div className={styles.taskContent}>
                <div className={styles.taskMain}>
                  <span className={styles.taskName}>{task.recipeName}</span>
                  {task.type !== 'custom' && (
                    <button
                      className={styles.portionsBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditPortions(task);
                      }}
                      title="Click to change portions"
                    >
                      x{task.portions || 1} {task.portionUnit || ''}
                    </button>
                  )}
                  {task.recipeId && (
                    <span className={styles.linkedIcon} title="Linked to recipe">🔗</span>
                  )}
                  {isTeamTask(task) ? (
                    <span className={styles.teamBadge}>Team</span>
                  ) : (
                    <span className={`${styles.assignee} ${isMyTask(task) ? styles.myTask : ''}`}>
                      {isMyTask(task) ? 'You' : task.assignedToName}
                    </span>
                  )}
                </div>
                {(task.station || task.dueDate || task.chefNotes) && (
                  <div className={styles.taskMeta}>
                    {task.station && (
                      <span className={styles.station}>{task.station}</span>
                    )}
                    {task.dueDate && (
                      <span className={styles.dueTime}>Due: {formatTime(task.dueDate)}</span>
                    )}
                  </div>
                )}
                {task.chefNotes && (
                  <div className={styles.notes}>{task.chefNotes}</div>
                )}
              </div>

              {/* Actions */}
              <div className={styles.taskActions}>
                {/* Claim button for unassigned tasks */}
                {isTeamTask(task) && task.status === TASK_STATUS.PENDING && (
                  <button
                    className={styles.claimBtn}
                    onClick={() => handleClaimTask(task.id)}
                    title="Claim this task"
                  >
                    Claim
                  </button>
                )}
                {/* Release button for my tasks */}
                {isMyTask(task) && task.status !== TASK_STATUS.COMPLETED && (
                  <button
                    className={styles.releaseBtn}
                    onClick={() => handleReleaseTask(task.id)}
                    title="Release to team"
                  >
                    Release
                  </button>
                )}
                {/* Start button for pending tasks that are assigned */}
                {!isTeamTask(task) && task.status === TASK_STATUS.PENDING && (
                  <button
                    className={styles.startBtn}
                    onClick={() => handleStartTask(task.id)}
                    title="Start task"
                  >
                    Start
                  </button>
                )}
{task.recipeId && (
                  <button
                    className={styles.viewBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Pass task portions as query param so recipe opens scaled in view mode
                      const params = new URLSearchParams();
                      if (task.portions) params.set('portions', task.portions);
                      if (task.scaleFactor) params.set('scale', task.scaleFactor);
                      params.set('taskId', task.id);
                      params.set('viewMode', 'true');
                      navigate(`/recipes/${task.recipeId}/edit?${params.toString()}`);
                    }}
                    title="View recipe with task scaling"
                  >
                    View
                  </button>
                )}
                {/* Cancel button - always visible for non-completed tasks */}
                {task.status !== TASK_STATUS.COMPLETED && (
                  <button
                    className={styles.cancelBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelTask(task);
                    }}
                    title="Cancel task"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Priority indicator */}
              {task.priority === 'urgent' && (
                <div className={styles.urgentBadge}>URGENT</div>
              )}
              {task.priority === 'high' && (
                <div className={styles.highBadge}>HIGH</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Task Modal */}
      {showTaskModal && (
        <AssignTaskModal
          recipe={null}
          currentDepartment={currentDepartment}
          preselectedUser={null}
          onClose={() => setShowTaskModal(false)}
          onTaskCreated={() => setShowTaskModal(false)}
        />
      )}

      {/* Bulk Task Dictation Modal */}
      {showBulkDictation && (
        <BulkTaskDictation
          recipes={recipes}
          users={users}
          currentDepartment={currentDepartment}
          onTasksCreated={() => setShowBulkDictation(false)}
          onClose={() => setShowBulkDictation(false)}
        />
      )}

      {/* Task Suggestions Modal */}
      {showSuggestions && (
        <div className={styles.modalOverlay} onClick={() => setShowSuggestions(false)}>
          <div className={styles.suggestionsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.suggestionsHeader}>
              <h2>Task Suggestions</h2>
              <button
                className={styles.closeBtn}
                onClick={() => setShowSuggestions(false)}
              >
                ×
              </button>
            </div>

            {suggestionsLoading ? (
              <div className={styles.loading}>Loading suggestions...</div>
            ) : suggestions?.suggestions?.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📊</span>
                <p>{suggestions?.message || 'No suggestions available.'}</p>
                <p className={styles.hint}>
                  Complete some tasks to build production history!
                </p>
              </div>
            ) : (
              <>
                <div className={styles.suggestionsInfo}>
                  <p>
                    Based on <strong>{suggestions?.dayName}</strong> last week
                    ({suggestions?.referenceDate?.toLocaleDateString('fr-CA')})
                  </p>
                  <p className={styles.suggestionsCount}>
                    {suggestions?.suggestions?.length} recipe(s) found
                  </p>
                </div>

                <div className={styles.suggestionsList}>
                  {suggestions?.suggestions?.map((suggestion, index) => (
                    <div key={index} className={styles.suggestionItem}>
                      <div className={styles.suggestionInfo}>
                        <span className={styles.suggestionName}>
                          {suggestion.recipeName}
                        </span>
                        <span className={styles.suggestionQty}>
                          {suggestion.suggestedPortions} portions
                        </span>
                      </div>
                      <div className={styles.suggestionReason}>
                        {suggestion.reason}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.suggestionsActions}>
                  <button
                    className={styles.cancelBtn}
                    onClick={() => setShowSuggestions(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.applyBtn}
                    onClick={() => handleApplySuggestions(suggestions.suggestions)}
                  >
                    Create {suggestions?.suggestions?.length} Task(s)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DepartmentTasksPage;
