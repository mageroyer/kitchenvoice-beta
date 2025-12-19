import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/components/menubar.module.css';

/**
 * MenuBar Component
 *
 * The main navigation bar for the application with app title, department selector,
 * action buttons, and dropdown menu. Handles voice/keyboard toggles, sync status,
 * and provides context-sensitive actions based on current page and user permissions.
 *
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.appName='Kitchen Recipe Manager'] - Application name to display
 * @param {string} [props.currentDepartment='Default'] - Currently selected department
 * @param {Array<string>} [props.departments=[]] - Available departments for selection
 * @param {boolean} [props.micFlag=false] - Voice input mode enabled
 * @param {boolean} [props.keypadFlag=false] - Keyboard input mode enabled
 * @param {boolean} [props.isUnlocked=true] - Edit mode enabled (false = view only)
 * @param {boolean} [props.isOwner=false] - User has owner privileges
 * @param {string} [props.userName='Guest'] - Display name of current user
 * @param {'owner'|'editor'|'viewer'} [props.accessLevel='viewer'] - User's access level
 * @param {'browser'|'detail'|'tasks'} [props.page='browser'] - Current page identifier
 * @param {Object} [props.currentRecipe=null] - Current recipe object (for detail page)
 * @param {'idle'|'syncing'|'synced'|'error'} [props.syncStatus='idle'] - Cloud sync status
 * @param {number} [props.criticalStockCount=0] - Count of items with critical stock level
 * @param {number} [props.lowStockCount=0] - Count of items with low stock level
 * @param {Function} [props.onDepartmentChange] - Handler for department selection
 * @param {Function} [props.onBackClick] - Handler for back/recipes button
 * @param {Function} [props.onMicToggle] - Handler for voice toggle (receives new state)
 * @param {Function} [props.onKeypadToggle] - Handler for keyboard toggle (receives new state)
 * @param {Function} [props.onNewRecipe] - Handler for new recipe button
 * @param {Function} [props.onTimerToggle] - Handler for timer button
 * @param {Function} [props.onImportPDF] - Handler for PDF import menu item
 * @param {Function} [props.onImportImage] - Handler for image import menu item
 * @param {Function} [props.onTakeImage] - Handler for camera menu item
 * @param {Function} [props.onDeleteRecipe] - Handler for delete recipe menu item
 * @param {Function} [props.onSettingsClick] - Handler for settings menu item
 * @param {Function} [props.onControlPanelClick] - Handler for control panel menu item
 * @param {Function} [props.onHeartbeatClick] - Handler for heartbeat dashboard menu item
 * @param {Function} [props.onTeamTasksClick] - Handler for team tasks button
 * @param {Function} [props.onInventoryClick] - Handler for inventory badge click (navigates to inventory)
 * @param {Function} [props.onLockToggle] - Handler for lock/unlock menu item
 * @param {Function} [props.onLogout] - Handler for logout menu item
 * @returns {JSX.Element} Rendered menu bar
 *
 * @example
 * // Basic menu bar
 * <MenuBar
 *   appName="My Kitchen"
 *   userName="Chef John"
 *   accessLevel="owner"
 *   isOwner={true}
 *   onNewRecipe={() => navigate('/recipe/new')}
 *   onBackClick={() => navigate('/recipes')}
 * />
 *
 * @example
 * // Menu bar with all features
 * <MenuBar
 *   appName={businessName}
 *   currentDepartment={department}
 *   departments={['Hot Kitchen', 'Cold Kitchen', 'Pastry']}
 *   micFlag={voiceEnabled}
 *   keypadFlag={keyboardEnabled}
 *   isUnlocked={editMode}
 *   isOwner={user.role === 'owner'}
 *   userName={user.name}
 *   accessLevel={user.accessLevel}
 *   page={currentPage}
 *   currentRecipe={selectedRecipe}
 *   syncStatus={cloudSyncStatus}
 *   onDepartmentChange={handleDepartmentChange}
 *   onMicToggle={setVoiceEnabled}
 *   onKeypadToggle={setKeyboardEnabled}
 *   onNewRecipe={createNewRecipe}
 *   onImportPDF={() => navigate('/import/pdf')}
 *   onSettingsClick={() => navigate('/settings')}
 *   onLockToggle={() => setEditMode(!editMode)}
 *   onLogout={handleLogout}
 * />
 */
function MenuBar({
  appName = 'Kitchen Recipe Manager',
  currentDepartment = 'Default',
  departments = [],
  micFlag = false,
  keypadFlag = false,
  isUnlocked = true,
  isOwner = false,
  userName = 'Guest',
  accessLevel = 'viewer',
  page = 'browser',
  currentRecipe = null,
  syncStatus = 'idle',
  // Inventory stock alert props
  criticalStockCount = 0,
  lowStockCount = 0,
  onDepartmentChange = () => {},
  onBackClick = () => {},
  onMicToggle = () => {},
  onKeypadToggle = () => {},
  onNewRecipe = () => {},
  onTimerToggle = () => {},
  onImportPDF = () => {},
  onImportImage = () => {},
  onTakeImage = () => {},
  onDeleteRecipe = () => {},
  onSettingsClick = () => {},
  onControlPanelClick = () => {},
  onHeartbeatClick = () => {},
  onTeamTasksClick = () => {},
  onInventoryClick = () => {},
  onLockToggle = () => {},
  onLogout = () => {},
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const deptDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target)) {
        setShowDeptDropdown(false);
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setShowDropdown(false);
        setShowDeptDropdown(false);
      }
    };

    if (showDropdown || showDeptDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showDropdown, showDeptDropdown]);

  // Get access level display
  const getAccessDisplay = () => {
    switch (accessLevel) {
      case 'owner': return 'Owner';
      case 'editor': return 'Editor';
      default: return 'Viewer';
    }
  };

  const handleMicToggle = () => {
    onMicToggle(!micFlag);
  };

  const handleKeypadToggle = () => {
    onKeypadToggle(!keypadFlag);
  };

  // Sync status indicator
  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing': return '🔄';
      case 'synced': return '☁️';
      case 'error': return '⚠️';
      default: return '☁️';
    }
  };

  const getSyncTitle = () => {
    switch (syncStatus) {
      case 'syncing': return 'Syncing...';
      case 'synced': return 'All changes synced';
      case 'error': return 'Sync error - check connection';
      default: return 'Cloud sync';
    }
  };

  // Handle department selection
  const handleDeptSelect = (dept) => {
    onDepartmentChange(dept);
    setShowDeptDropdown(false);
  };

  return (
    <div className={styles.menuBar}>
      <div className={styles.appNameSection}>
        <div className={styles.appName}>
          {appName}
          <span
            className={`${styles.syncIndicator} ${syncStatus === 'syncing' ? styles.syncing : ''}`}
            title={getSyncTitle()}
          >
            {getSyncIcon()}
          </span>
        </div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{userName}</span>
          <span className={`${styles.accessBadge} ${styles[accessLevel]}`}>
            {getAccessDisplay()}
          </span>
        </div>
      </div>

      {/* Department Selector */}
      <div className={styles.deptSelector} ref={deptDropdownRef} data-tour="department-selector">
        <button
          className={`${styles.deptButton} ${isOwner ? styles.clickable : ''}`}
          onClick={() => isOwner && setShowDeptDropdown(!showDeptDropdown)}
          aria-label={`Current department: ${currentDepartment}${isOwner ? '. Click to switch department' : ''}`}
          aria-expanded={showDeptDropdown}
          aria-haspopup="listbox"
          title={isOwner ? "Click to switch department" : "Department (Owner can switch)"}
        >
          <span aria-hidden="true">🏢</span> {currentDepartment}
          {isOwner && <span className={styles.deptArrow} aria-hidden="true">▼</span>}
        </button>
        {showDeptDropdown && isOwner && departments.length > 0 && (
          <div className={styles.deptDropdown} role="listbox" aria-label="Select department">
            {departments.map(dept => (
              <button
                key={dept}
                role="option"
                aria-selected={dept === currentDepartment}
                className={`${styles.deptOption} ${dept === currentDepartment ? styles.active : ''}`}
                onClick={() => handleDeptSelect(dept)}
              >
                {dept}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recipes button - always rendered, hidden on recipe list page */}
      <button
        className={`${styles.menuButton} ${page === 'browser' ? styles.hidden : ''}`}
        onClick={() => {
          console.log('Recipes button clicked, page:', page);
          onBackClick();
        }}
        title="Back to recipe list"
        disabled={page === 'browser'}
      >
        📖 Recipes
      </button>

      {/* Team Tasks button - always rendered, hidden on team tasks page */}
      <button
        className={`${styles.menuButton} ${page === 'tasks' ? styles.hidden : ''}`}
        onClick={() => {
          console.log('Tasks button clicked, page:', page);
          onTeamTasksClick();
        }}
        title="Team Tasks"
        disabled={page === 'tasks'}
        data-tour="tasks-button"
      >
        📋 Tasks
      </button>

      {/* Inventory Badge - shows for owners when there are low/critical stock items */}
      {isOwner && (criticalStockCount > 0 || lowStockCount > 0) && (
        <button
          className={`${styles.menuButton} ${styles.inventoryBadge} ${criticalStockCount > 0 ? styles.critical : styles.low}`}
          onClick={onInventoryClick}
          title={`Inventory Alerts: ${criticalStockCount} critical, ${lowStockCount} low stock items`}
          aria-label={`${criticalStockCount + lowStockCount} inventory alerts. ${criticalStockCount} critical, ${lowStockCount} low stock.`}
          data-tour="inventory-badge"
        >
          <span aria-hidden="true">📦</span>
          <span className={styles.inventoryCount}>
            {criticalStockCount > 0 ? criticalStockCount : lowStockCount}
          </span>
          {criticalStockCount > 0 && <span className={styles.pulse} aria-hidden="true"></span>}
        </button>
      )}

      {/* New Recipe button - always rendered, hidden when locked */}
      <button
        className={`${styles.menuButton} ${!isUnlocked ? styles.hidden : ''}`}
        onClick={onNewRecipe}
        aria-label="New Recipe"
        title="New Recipe"
        disabled={!isUnlocked}
        data-tour="add-recipe-button"
      >
        <span aria-hidden="true">📝</span>
      </button>

      <button
        className={`${styles.menuButton} ${styles.flag} ${micFlag ? styles.active : ''}`}
        onClick={handleMicToggle}
        aria-label={micFlag ? "Disable voice input" : "Enable voice input"}
        aria-pressed={micFlag}
        title="Toggle voice input"
        data-tour="voice-toggle"
      >
        <span aria-hidden="true">🎤</span>
      </button>

      <button
        className={`${styles.menuButton} ${styles.flag} ${keypadFlag ? styles.active : ''}`}
        onClick={handleKeypadToggle}
        aria-label={keypadFlag ? "Disable keyboard input" : "Enable keyboard input"}
        aria-pressed={keypadFlag}
        title="Toggle keyboard input"
      >
        <span aria-hidden="true">⌨️</span>
      </button>

      <button
        className={styles.menuButton}
        onClick={onTimerToggle}
        aria-label="Timer"
        title="Timer"
      >
        <span aria-hidden="true">⏱️</span>
      </button>

      {/* Dropdown Menu */}
      <div className={styles.dropdown} ref={dropdownRef} data-tour="menu-button">
        <button
          className={styles.menuButton}
          onClick={() => setShowDropdown(!showDropdown)}
          aria-label="More options"
          aria-expanded={showDropdown}
          aria-haspopup="menu"
          title="More options"
        >
          <span aria-hidden="true">⋮</span>
        </button>
        <div
          className={`${styles.dropdownContent} ${showDropdown ? styles.show : ''}`}
          role="menu"
          aria-label="Application menu"
        >
          {isUnlocked && (
            <>
              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onImportPDF();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">📄</span> Import PDF
              </button>
              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onImportImage();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">📷</span> Import Image
              </button>
              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onTakeImage();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">📸</span> Take Image
              </button>
              <div className={styles.dropdownDivider} role="separator"></div>
            </>
          )}

          {page === 'detail' && currentRecipe && isUnlocked && (
            <>
              <button
                className={`${styles.dropdownItem} ${styles.danger}`}
                role="menuitem"
                onClick={() => {
                  onDeleteRecipe();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">🗑️</span> Delete Recipe
              </button>
              <div className={styles.dropdownDivider} role="separator"></div>
            </>
          )}

          {isOwner && (
            <>
              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onControlPanelClick();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">🎛️</span> Control Panel
              </button>

              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onHeartbeatClick();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">💓</span> Heartbeat
              </button>

              <button
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  onSettingsClick();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">⚙️</span> Settings
              </button>
            </>
          )}

          <div className={styles.dropdownDivider} role="separator"></div>

          <button
            className={styles.dropdownItem}
            role="menuitem"
            onClick={() => {
              onLockToggle();
              setShowDropdown(false);
            }}
            data-tour="lock-toggle"
          >
            {isUnlocked ? (
              <>
                <span aria-hidden="true">🔒</span> Lock (View Only)
              </>
            ) : (
              <>
                <span aria-hidden="true">🔓</span> Unlock (Edit Mode)
              </>
            )}
          </button>

          {isOwner && (
            <>
              <div className={styles.dropdownDivider} role="separator"></div>

              <button
                className={`${styles.dropdownItem} ${styles.danger}`}
                role="menuitem"
                onClick={() => {
                  onLogout();
                  setShowDropdown(false);
                }}
              >
                <span aria-hidden="true">🚪</span> Logout
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

MenuBar.propTypes = {
  /** Application name to display */
  appName: PropTypes.string,
  /** Current selected department */
  currentDepartment: PropTypes.string,
  /** List of available departments */
  departments: PropTypes.arrayOf(PropTypes.string),
  /** Voice input enabled state */
  micFlag: PropTypes.bool,
  /** Keyboard input enabled state */
  keypadFlag: PropTypes.bool,
  /** Edit mode enabled state */
  isUnlocked: PropTypes.bool,
  /** Whether user is owner */
  isOwner: PropTypes.bool,
  /** User display name */
  userName: PropTypes.string,
  /** User access level */
  accessLevel: PropTypes.oneOf(['owner', 'editor', 'viewer']),
  /** Current page identifier */
  page: PropTypes.oneOf(['browser', 'detail', 'tasks']),
  /** Current recipe object */
  currentRecipe: PropTypes.object,
  /** Sync status indicator */
  syncStatus: PropTypes.oneOf(['idle', 'syncing', 'synced', 'error']),
  /** Count of items with critical stock level */
  criticalStockCount: PropTypes.number,
  /** Count of items with low stock level */
  lowStockCount: PropTypes.number,
  /** Handler for department change */
  onDepartmentChange: PropTypes.func,
  /** Handler for back button */
  onBackClick: PropTypes.func,
  /** Handler for mic toggle */
  onMicToggle: PropTypes.func,
  /** Handler for keypad toggle */
  onKeypadToggle: PropTypes.func,
  /** Handler for new recipe button */
  onNewRecipe: PropTypes.func,
  /** Handler for timer toggle */
  onTimerToggle: PropTypes.func,
  /** Handler for PDF import */
  onImportPDF: PropTypes.func,
  /** Handler for image import */
  onImportImage: PropTypes.func,
  /** Handler for camera */
  onTakeImage: PropTypes.func,
  /** Handler for recipe deletion */
  onDeleteRecipe: PropTypes.func,
  /** Handler for settings */
  onSettingsClick: PropTypes.func,
  /** Handler for control panel */
  onControlPanelClick: PropTypes.func,
  /** Handler for heartbeat dashboard */
  onHeartbeatClick: PropTypes.func,
  /** Handler for team tasks */
  onTeamTasksClick: PropTypes.func,
  /** Handler for inventory badge click */
  onInventoryClick: PropTypes.func,
  /** Handler for lock/unlock */
  onLockToggle: PropTypes.func,
  /** Handler for logout */
  onLogout: PropTypes.func,
};

export default MenuBar;
