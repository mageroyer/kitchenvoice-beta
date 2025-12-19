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
  TASK_STATUS
} from '../services/tasks/tasksService';
import { isDemoMode } from '../services/demo/demoService';
import { DEMO_TASKS } from '../services/demo/demoData';
import AssignTaskModal from '../components/common/AssignTaskModal';
import styles from '../styles/pages/departmenttaskspage.module.css';

function DepartmentTasksPage({ currentDepartment, currentPrivilege, isOwner }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today'); // 'today', 'active', 'all', 'completed'
  const [stationFilter, setStationFilter] = useState('all');
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Subscribe to department tasks (or all tasks if no department set)
  // In demo mode, use mock data instead
  useEffect(() => {
    setLoading(true);

    // Check if in demo mode
    if (isDemoMode()) {
      console.log('📋 Loading demo tasks...');
      // Filter demo tasks by department if set
      const filteredDemoTasks = currentDepartment
        ? DEMO_TASKS.filter(t => t.department === currentDepartment || !t.department)
        : DEMO_TASKS;
      setTasks(filteredDemoTasks);
      setLoading(false);
      return () => {}; // No cleanup needed for demo mode
    }

    // Real mode: Pass null/empty to get all tasks, or specific department to filter
    const unsubscribe = subscribeToDepartmentTasks(currentDepartment || null, (deptTasks) => {
      console.log('Team tasks received:', deptTasks.length, 'department filter:', currentDepartment);
      console.log('Tasks detail:', deptTasks.map(t => ({
        id: t.id,
        name: t.recipeName,
        recipeId: t.recipeId,
        type: t.type,
        hasRecipeId: !!t.recipeId
      })));
      setTasks(deptTasks);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentDepartment]);

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

  // Helper to update demo task locally
  const updateDemoTask = (taskId, updates) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updates } : t
    ));
  };

  // Handle task status toggle
  const handleToggleComplete = async (task) => {
    // Demo mode: update locally
    if (isDemoMode()) {
      const newStatus = task.status === TASK_STATUS.COMPLETED
        ? TASK_STATUS.PENDING
        : TASK_STATUS.COMPLETED;
      updateDemoTask(task.id, {
        status: newStatus,
        completedAt: newStatus === TASK_STATUS.COMPLETED ? new Date() : null
      });
      return;
    }

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
    // Demo mode: update locally
    if (isDemoMode()) {
      updateDemoTask(taskId, { status: TASK_STATUS.IN_PROGRESS });
      return;
    }

    try {
      await updateTaskStatus(taskId, TASK_STATUS.IN_PROGRESS);
    } catch (error) {
      console.error('Error starting task:', error);
    }
  };

  // Handle claim task (team member takes ownership)
  const handleClaimTask = async (taskId) => {
    // Demo mode: update locally with demo owner
    if (isDemoMode()) {
      updateDemoTask(taskId, {
        assignedTo: 'demo-owner',
        assignedToName: 'Demo Owner'
      });
      return;
    }

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
    // Demo mode: update locally
    if (isDemoMode()) {
      updateDemoTask(taskId, {
        assignedTo: null,
        assignedToName: null
      });
      return;
    }

    try {
      await releaseTask(taskId);
    } catch (error) {
      console.error('Error releasing task:', error);
      alert('Failed to release task');
    }
  };

  // Check if current user owns this task
  const isMyTask = (task) => {
    // In demo mode, check for demo-owner
    if (isDemoMode()) {
      return task.assignedTo === 'demo-owner';
    }
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
                  {task.type === 'custom' && (
                    <span className={styles.customBadge}>Task</span>
                  )}
                  <span className={styles.taskName}>{task.recipeName}</span>
                  {task.type !== 'custom' && task.portions > 1 && (
                    <span className={styles.portions}>
                      x{task.portions}
                      {task.scaleFactor !== 1 && ` (${task.scaleFactor.toFixed(1)}x)`}
                    </span>
                  )}
                </div>
                <div className={styles.taskMeta}>
                  {task.station && (
                    <span className={styles.station}>{task.station}</span>
                  )}
                  {isTeamTask(task) ? (
                    <span className={styles.teamBadge}>Team</span>
                  ) : (
                    <span className={`${styles.assignee} ${isMyTask(task) ? styles.myTask : ''}`}>
                      {isMyTask(task) ? 'You' : task.assignedToName}
                    </span>
                  )}
                  {task.dueDate && (
                    <span className={styles.dueTime}>Due: {formatTime(task.dueDate)}</span>
                  )}
                </div>
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
                      console.log('View Recipe clicked, recipeId:', task.recipeId);
                      navigate(`/recipes/${task.recipeId}/edit`);
                    }}
                    title="View recipe"
                  >
                    View
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
    </div>
  );
}

export default DepartmentTasksPage;
