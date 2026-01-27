/**
 * UserTaskList Component
 *
 * Displays a list of team members (privileges)
 * - Shows user name, position, departments
 * - Click on user to edit their privileges
 * - "Give Task" button to assign tasks
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getAllPrivileges, ACCESS_LEVELS, getAccessLevelDisplay } from '../../services/auth/privilegesService';
import { subscribeToTasks, TASK_STATUS } from '../../services/tasks/tasksService';
import AssignTaskModal from '../common/AssignTaskModal';
import Badge from '../common/Badge';
import Button from '../common/Button';
import styles from '../../styles/components/usertasklist.module.css';

function UserTaskList({ currentDepartment = '', onEditUser, refreshTrigger = 0, tasks: tasksProp = null }) {
  const [users, setUsers] = useState([]);
  const [localTasks, setLocalTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [error, setError] = useState(null);

  // Use provided tasks or local state
  const tasks = tasksProp || localTasks;

  // Load users (privileges) - reload when refreshTrigger changes
  useEffect(() => {
    loadUsers();
  }, [refreshTrigger]);

  // Subscribe to tasks ONLY if not provided as prop (avoids duplicate subscriptions)
  useEffect(() => {
    // Skip subscription if tasks are passed as prop
    if (tasksProp !== null) return;

    const unsubscribe = subscribeToTasks((allTasks) => {
      setLocalTasks(allTasks);
    });
    return () => unsubscribe();
  }, [tasksProp]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const privileges = await getAllPrivileges();

      if (!privileges || !Array.isArray(privileges)) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Show ALL users (not just cooks) so owners can see everyone
      // Filter out owners if you only want to show cooks
      const allUsers = privileges.filter(p =>
        p.accessLevel === ACCESS_LEVELS.EDITOR ||
        p.accessLevel === ACCESS_LEVELS.VIEWER ||
        p.accessLevel === ACCESS_LEVELS.OWNER
      );
      setUsers(allUsers);
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message || 'Failed to load users');
    }
    setLoading(false);
  };

  // Get active tasks count for a user
  const getActiveTasksCount = (userId) => {
    return tasks.filter(task =>
      task.assignedTo === userId &&
      (task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.IN_PROGRESS)
    ).length;
  };

  // Handle click on user name - edit privileges
  const handleUserClick = (user) => {
    if (onEditUser) {
      onEditUser(user);
    }
  };

  // Handle give tasks button click - opens modal directly
  const handleGiveTasksClick = (user, e) => {
    e.stopPropagation();
    setSelectedUser(user);
    setShowTaskModal(true);
  };

  // Handle task creation callback
  const handleTaskCreated = () => {
    setShowTaskModal(false);
    setSelectedUser(null);
  };

  if (loading) {
    return <div className={styles.loading}>Loading users...</div>;
  }

  if (error) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>⚠️</span>
        <p>Error loading users: {error}</p>
        <Button
          variant="secondary"
          onClick={loadUsers}
          style={{ marginTop: '16px' }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.userTaskList}>
      {/* Users List */}
      {users.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>👥</span>
          <p>No team members found.</p>
          <p className={styles.hint}>Create privileges to add team members.</p>
        </div>
      ) : (
        <div className={styles.usersList}>
          {users.map(user => {
            const activeTasks = getActiveTasksCount(user.id);

            return (
              <div
                key={user.id}
                className={styles.userCard}
                onClick={() => handleUserClick(user)}
              >
                <div className={styles.userInfo}>
                  <div className={styles.userAvatar}>
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className={styles.userDetails}>
                    <span className={styles.userName}>{user.name}</span>
                    {user.position && (
                      <span className={styles.userPosition}>{user.position}</span>
                    )}
                    <span className={styles.userRole}>
                      {getAccessLevelDisplay(user.accessLevel)}
                      {user.departments?.length > 0 && (
                        <> · {user.departments.join(', ')}</>
                      )}
                    </span>
                  </div>
                </div>
                <div className={styles.userActions}>
                  {activeTasks > 0 && (
                    <Badge variant="info" size="small">
                      {activeTasks} active
                    </Badge>
                  )}
                  <Button
                    variant="primary"
                    size="small"
                    onClick={(e) => handleGiveTasksClick(user, e)}
                  >
                    Give Task
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Task Modal */}
      {showTaskModal && selectedUser && (
        <AssignTaskModal
          recipe={null}
          currentDepartment={currentDepartment}
          preselectedUser={selectedUser}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedUser(null);
          }}
          onTaskCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}

UserTaskList.propTypes = {
  /** Current department filter */
  currentDepartment: PropTypes.string,
  /** Handler to edit user privileges */
  onEditUser: PropTypes.func,
  /** Trigger to refresh the user list */
  refreshTrigger: PropTypes.number,
};

export default UserTaskList;
