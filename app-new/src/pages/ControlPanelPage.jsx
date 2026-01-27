import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { recipeDB, departmentDB, categoryDB } from '../services/database/indexedDB';
import { subscribeToTasks, deleteTask, TASK_STATUS } from '../services/tasks/tasksService';
import Badge from '../components/common/Badge';
import Spinner from '../components/common/Spinner';
import PrivilegesModal from '../components/common/PrivilegesModal';
import EditAccountModal from '../components/common/EditAccountModal';
import { useAuth } from '../contexts/AuthContext';
import { getAllPrivileges, ACCESS_LEVELS } from '../services/auth/privilegesService';
import styles from '../styles/pages/controlpanelpage.module.css';

// Lazy-loaded tab components for code splitting
const OverviewTab = lazy(() => import('./ControlPanel/OverviewTab'));
const RecipesTab = lazy(() => import('./ControlPanel/RecipesTab'));
const DepartmentsTab = lazy(() => import('./ControlPanel/DepartmentsTab'));
const InventoryTab = lazy(() => import('./ControlPanel/InventoryTab'));
const UsersTab = lazy(() => import('./ControlPanel/UsersTab'));
const BackupTab = lazy(() => import('./ControlPanel/BackupTab'));

/**
 * Control Panel Page - Owner Dashboard
 *
 * Tabs are lazy-loaded for better initial page performance.
 * Each tab is a separate chunk that loads on demand.
 */
function ControlPanelPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial tab from URL or default to 'overview'
  const initialTab = searchParams.get('tab') || 'overview';
  const initialSubTab = searchParams.get('subtab') || 'dashboard';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [inventorySubTab, setInventorySubTab] = useState(initialSubTab);
  const [loading, setLoading] = useState(true);

  // Data state
  const [recipes, setRecipes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);

  // UI state
  const [expandedDepts, setExpandedDepts] = useState({});
  const [expandedCats, setExpandedCats] = useState({});
  const [overviewDeptFilter, setOverviewDeptFilter] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [userListRefresh, setUserListRefresh] = useState(0);
  const [showPrivilegesModal, setShowPrivilegesModal] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [ownerPrivilege, setOwnerPrivilege] = useState(null);

  // Get current user from auth context
  const { user } = useAuth();

  // Load all data
  useEffect(() => {
    loadData();
  }, []);

  // Load owner privilege (or create fallback from Firebase user)
  useEffect(() => {
    const loadOwnerPrivilege = async () => {
      try {
        const privileges = await getAllPrivileges();
        const owner = privileges.find(p => p.accessLevel === ACCESS_LEVELS.OWNER);

        if (owner) {
          setOwnerPrivilege(owner);
        } else if (user) {
          // Fallback: create owner privilege info from Firebase user
          setOwnerPrivilege({
            id: 'firebase-owner',
            name: user.displayName || user.email?.split('@')[0] || 'Owner',
            position: 'Owner',
            accessLevel: ACCESS_LEVELS.OWNER,
            pin: '',
          });
        }
      } catch (error) {
        console.error('Error loading owner privilege:', error);
        if (user) {
          setOwnerPrivilege({
            id: 'firebase-owner',
            name: user.displayName || user.email?.split('@')[0] || 'Owner',
            position: 'Owner',
            accessLevel: ACCESS_LEVELS.OWNER,
            pin: '',
          });
        }
      }
    };
    loadOwnerPrivilege();
  }, [userListRefresh, user]);

  // Subscribe to tasks
  useEffect(() => {
    const unsubscribe = subscribeToTasks((allTasks) => {
      setTasks(allTasks);
    });
    return () => unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recipesData, deptsData, catsData] = await Promise.all([
        recipeDB.getAll(),
        departmentDB.getAll(),
        categoryDB.getAll()
      ]);
      setRecipes(recipesData);
      setDepartments(deptsData);
      setCategories(catsData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  }, []);

  // Task stats - memoized
  const taskStats = useMemo(() => {
    const pending = tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
    const inProgress = tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length;
    const completed = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
    return { pending, inProgress, completed, total: tasks.length };
  }, [tasks]);

  // Task handlers
  const handleDeleteTask = useCallback(async (taskId) => {
    if (confirm('Delete this task?')) {
      try {
        await deleteTask(taskId);
      } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
      }
    }
  }, []);

  // Toggle functions
  const toggleDept = useCallback((deptId) => {
    setExpandedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }));
  }, []);

  const toggleCat = useCallback((catName) => {
    setExpandedCats(prev => ({ ...prev, [catName]: !prev[catName] }));
  }, []);

  // Get recipes by department - memoized
  const getRecipesByDepartment = useCallback((deptName) => {
    return recipes.filter(r => r.department === deptName);
  }, [recipes]);

  // Tab configuration
  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'recipes', label: 'Recipes', icon: '📖' },
    { id: 'departments', label: 'Departments', icon: '🏢' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'backup', label: 'Backup/Export', icon: '💾' },
  ], []);

  // Handle tab change with URL sync
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    if (tabId === 'inventory') {
      setInventorySubTab('dashboard');
      setSearchParams({ tab: tabId, subtab: 'dashboard' });
    } else {
      setSearchParams({ tab: tabId });
    }
  }, [setSearchParams]);

  // Handle inventory sub-tab change with URL sync
  const handleInventorySubTabChange = useCallback((subTabId) => {
    if (subTabId === 'invoices') {
      navigate('/invoices');
      return;
    }
    setInventorySubTab(subTabId);
    setSearchParams({ tab: 'inventory', subtab: subTabId });
  }, [navigate, setSearchParams]);

  // User edit handlers
  const handleEditUser = useCallback((u) => {
    setEditingUser(u);
    setShowPrivilegesModal(true);
  }, []);

  const handleAddUser = useCallback(() => {
    setEditingUser(null);
    setShowPrivilegesModal(true);
  }, []);

  const handleEditAccount = useCallback(() => {
    setShowEditAccountModal(true);
  }, []);

  // Sync URL params with state on mount and URL changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    const subtab = searchParams.get('subtab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
    if (subtab && subtab !== inventorySubTab) {
      setInventorySubTab(subtab);
    }
  }, [searchParams]);

  // Tab content loading fallback
  const TabLoadingFallback = () => (
    <div className={styles.tabLoading}>
      <Spinner size="medium" />
      <p>Loading...</p>
    </div>
  );

  if (loading) {
    return (
      <div className={styles.controlPanel}>
        <div className={styles.loading}>
          <Spinner size="large" />
          <p>Loading Control Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.controlPanel}>
      {/* Header */}
      <div className={styles.header}>
        <h1>Control Panel</h1>
        <Badge variant="info" size="large">Owner Dashboard</Badge>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabNav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content - Lazy Loaded */}
      <div className={styles.tabContent}>
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'overview' && (
            <OverviewTab
              tasks={tasks}
              departments={departments}
              overviewDeptFilter={overviewDeptFilter}
              setOverviewDeptFilter={setOverviewDeptFilter}
              taskStats={taskStats}
              onDeleteTask={handleDeleteTask}
              onEditUser={handleEditUser}
              userListRefresh={userListRefresh}
            />
          )}

          {activeTab === 'recipes' && (
            <RecipesTab
              recipes={recipes}
              departments={departments}
              categories={categories}
              expandedDepts={expandedDepts}
              expandedCats={expandedCats}
              onToggleDept={toggleDept}
              onToggleCat={toggleCat}
            />
          )}

          {activeTab === 'departments' && (
            <DepartmentsTab
              departments={departments}
              categories={categories}
              expandedDepts={expandedDepts}
              onToggleDept={toggleDept}
              onDataChange={loadData}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab
              inventorySubTab={inventorySubTab}
              onSubTabChange={handleInventorySubTabChange}
            />
          )}

          {activeTab === 'users' && (
            <UsersTab
              user={user}
              ownerPrivilege={ownerPrivilege}
              onEditUser={handleEditUser}
              onAddUser={handleAddUser}
              onEditAccount={handleEditAccount}
              userListRefresh={userListRefresh}
              tasks={tasks}
            />
          )}

          {activeTab === 'backup' && (
            <BackupTab
              recipes={recipes}
              departments={departments}
              categories={categories}
              getRecipesByDepartment={getRecipesByDepartment}
            />
          )}
        </Suspense>
      </div>

      {/* Privileges Modal */}
      <PrivilegesModal
        isOpen={showPrivilegesModal}
        onClose={() => {
          setShowPrivilegesModal(false);
          setEditingUser(null);
        }}
        initialUser={editingUser}
        onSaved={() => setUserListRefresh(prev => prev + 1)}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={showEditAccountModal}
        onClose={() => setShowEditAccountModal(false)}
        ownerPrivilege={ownerPrivilege}
        user={user}
        onSaved={() => setUserListRefresh(prev => prev + 1)}
      />
    </div>
  );
}

export default ControlPanelPage;
