/**
 * Control Panel - Overview Tab
 *
 * Displays active tasks and team member overview.
 * Extracted from ControlPanelPage for code splitting.
 */

import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import UserTaskList from '../../components/users/UserTaskList';
import { TASK_STATUS } from '../../services/tasks/tasksService';
import styles from '../../styles/pages/controlpanelpage.module.css';

function OverviewTab({
  tasks,
  departments,
  overviewDeptFilter,
  setOverviewDeptFilter,
  taskStats,
  onDeleteTask,
  onEditUser,
  userListRefresh,
}) {
  const navigate = useNavigate();

  const getStatusBadge = useCallback((status) => {
    const variants = {
      pending: 'secondary',
      in_progress: 'info',
      paused: 'warning',
      completed: 'success',
      cancelled: 'danger'
    };
    return variants[status] || 'secondary';
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== TASK_STATUS.COMPLETED && t.status !== TASK_STATUS.CANCELLED)
      .filter(t => overviewDeptFilter === 'all' || t.department === overviewDeptFilter)
      .slice(0, 10);
  }, [tasks, overviewDeptFilter]);

  return (
    <div className={styles.overview}>
      {/* Department Filter */}
      <div className={styles.overviewFilter}>
        <label className={styles.filterLabel}>Filter by Department:</label>
        <select
          className={styles.deptSelect}
          value={overviewDeptFilter}
          onChange={(e) => setOverviewDeptFilter(e.target.value)}
        >
          <option value="all">All Departments</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.name}>{dept.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.overviewGrid}>
        {/* Active Tasks Section */}
        <div className={styles.overviewSection}>
          <div className={styles.sectionHeader}>
            <h2>Active Tasks</h2>
            <div className={styles.taskStatsRow}>
              <Badge variant="secondary">{taskStats.pending} Pending</Badge>
              <Badge variant="info">{taskStats.inProgress} In Progress</Badge>
              <Badge variant="success">{taskStats.completed} Completed</Badge>
            </div>
          </div>
          <div className={styles.tasksList}>
            {filteredTasks.length === 0 ? (
              <Card className={styles.emptyCard}>
                <p className={styles.emptyText}>No active tasks</p>
              </Card>
            ) : (
              filteredTasks.map(task => (
                <Card key={task.id} className={styles.taskCard}>
                  <div className={styles.taskHeader}>
                    <div className={styles.taskInfo}>
                      <h3 className={styles.taskName}>
                        {task.type === 'custom' && <span className={styles.customBadge}>Task</span>}
                        {task.recipeName}
                      </h3>
                      <div className={styles.taskMeta}>
                        <span>Assigned to: <strong>{task.assignedToName}</strong></span>
                        {task.portions > 1 && <span>{task.portions} portions</span>}
                      </div>
                    </div>
                    <Badge variant={getStatusBadge(task.status)}>
                      {task.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className={styles.taskActions}>
                    {task.recipeId && (
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => navigate(`/recipes/${task.recipeId}/edit`)}
                      >
                        View
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => onDeleteTask(task.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Team Members Section */}
        <div className={styles.overviewSection}>
          <div className={styles.sectionHeader}>
            <h2>Team Members</h2>
          </div>
          <UserTaskList
            currentDepartment={overviewDeptFilter === 'all' ? '' : overviewDeptFilter}
            onEditUser={onEditUser}
            refreshTrigger={userListRefresh}
          />
        </div>
      </div>
    </div>
  );
}

export default OverviewTab;
