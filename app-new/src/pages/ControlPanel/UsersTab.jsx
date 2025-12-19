/**
 * Control Panel - Users Tab
 *
 * User/team member management with access levels.
 * Extracted from ControlPanelPage for code splitting.
 */

import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import UserTaskList from '../../components/users/UserTaskList';
import styles from '../../styles/pages/controlpanelpage.module.css';

function UsersTab({
  user,
  ownerPrivilege,
  onEditUser,
  onAddUser,
  onEditAccount,
  userListRefresh,
}) {
  return (
    <div className={styles.usersTab}>
      {/* Owner Card */}
      {ownerPrivilege && (
        <Card className={styles.ownerCard}>
          <div className={styles.ownerCardHeader}>
            <Badge variant="warning" size="large">Owner</Badge>
          </div>
          <div className={styles.ownerInfo}>
            <div className={styles.ownerAvatar}>
              {ownerPrivilege.name?.charAt(0)?.toUpperCase() || 'O'}
            </div>
            <div className={styles.ownerDetails}>
              <div className={styles.ownerName}>{ownerPrivilege.name}</div>
              <div className={styles.ownerMeta}>
                {ownerPrivilege.position && (
                  <span className={styles.ownerPosition}>{ownerPrivilege.position}</span>
                )}
                <span className={styles.ownerEmail}>{user?.email}</span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="small"
              onClick={onEditAccount}
            >
              Edit Account
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.sectionHeader}>
        <h2>Team Members</h2>
        <Button
          variant="primary"
          size="small"
          onClick={onAddUser}
        >
          + Add
        </Button>
      </div>

      {/* User Task List Component */}
      <UserTaskList
        currentDepartment=""
        onEditUser={onEditUser}
        refreshTrigger={userListRefresh}
      />

      {/* Access Levels Info */}
      <Card className={styles.accessLevelsCard}>
        <div className={styles.accessLevelsInfo}>
          <h4>Access Levels</h4>
          <div className={styles.levelsList}>
            <div className={styles.levelItem}>
              <Badge variant="secondary">Viewer</Badge>
              <span>View recipes only (no PIN required)</span>
            </div>
            <div className={styles.levelItem}>
              <Badge variant="primary">Editor</Badge>
              <span>Edit and create recipes in assigned departments</span>
            </div>
            <div className={styles.levelItem}>
              <Badge variant="warning">Owner</Badge>
              <span>Full access: delete, control panel, all departments</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default UsersTab;
