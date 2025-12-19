/**
 * AssignTaskModal Component
 *
 * Modal for assigning recipe tasks to cooks
 * Features: multiple task creation, portion scaling, priority, notes
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getAllPrivileges, ACCESS_LEVELS } from '../../services/auth/privilegesService';
import { createTask } from '../../services/tasks/tasksService';
import { recipeDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/assigntaskmodal.module.css';

function AssignTaskModal({ recipe: initialRecipe = null, preselectedUser = null, onClose, onTaskCreated }) {
  // Recipe state
  const [selectedRecipe, setSelectedRecipe] = useState(initialRecipe);
  const [recipes, setRecipes] = useState([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [showRecipeDropdown, setShowRecipeDropdown] = useState(false);

  // Form state
  const [portions, setPortions] = useState(initialRecipe?.portions || 1);
  const [assignedTo, setAssignedTo] = useState(preselectedUser?.id || '');
  const [customTask, setCustomTask] = useState(''); // Free-form task input
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [chefNotes, setChefNotes] = useState('');
  const [priority, setPriority] = useState('normal');

  // Task list state
  const [taskList, setTaskList] = useState([]);

  // Data state
  const [cooks, setCooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calculate scale factor
  const originalPortions = selectedRecipe?.portions || 1;
  const scaleFactor = portions / originalPortions;

  // Load cooks and recipes
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load privileges (cooks)
      const privileges = await getAllPrivileges();
      const cooksList = privileges.filter(p =>
        p.accessLevel === ACCESS_LEVELS.EDITOR ||
        p.accessLevel === ACCESS_LEVELS.VIEWER
      );
      setCooks(cooksList);

      // Load recipes for search
      const allRecipes = await recipeDB.getAll();
      setRecipes(allRecipes);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Filter recipes based on search
  const filteredRecipes = recipes.filter(r =>
    r.name.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  // Handle recipe selection
  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    setPortions(recipe.portions || 1);
    setRecipeSearch('');
    setShowRecipeDropdown(false);
  };

  // Get selected cook info
  const getSelectedCook = () => {
    if (preselectedUser) return preselectedUser;
    return cooks.find(c => c.id === assignedTo) || null;
  };

  // Get department from selected cook (first department in their list)
  const getSelectedCookDepartment = () => {
    const cook = getSelectedCook();
    if (cook?.departments?.length > 0) {
      return cook.departments[0];
    }
    return null;
  };

  // Add custom (free-form) task to list and save to database
  const handleAddCustomTask = async () => {
    if (!customTask.trim()) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const selectedCook = getSelectedCook();
      const department = getSelectedCookDepartment();

      console.log('Creating custom task:', {
        assignedTo: assignedTo || null,
        assignedToName: selectedCook?.name || 'Team',
        department: department,
        cookDepartments: selectedCook?.departments
      });

      const taskId = await createTask({
        recipeId: null,
        recipeName: customTask.trim(),
        portions: 1,
        scaleFactor: 1,
        assignedTo: assignedTo || null,
        assignedToName: selectedCook?.name || 'Team',
        station: null,
        department: department || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        chefNotes,
        priority,
        type: 'custom' // Mark as custom task
      });

      // Add to local list for display
      setTaskList(prev => [...prev, {
        id: taskId,
        recipeName: customTask.trim(),
        portions: 1,
        priority,
        isCustom: true
      }]);

      // Reset custom task input
      setCustomTask('');

      onTaskCreated?.({ id: taskId, recipeName: customTask.trim() });
    } catch (error) {
      console.error('Error creating custom task:', error);
      setError(error.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  // Add recipe task to list and save to database
  const handleAddRecipeTask = async () => {
    if (!selectedRecipe) {
      setError('Please select a recipe');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const selectedCook = getSelectedCook();
      const department = getSelectedCookDepartment();

      const taskId = await createTask({
        recipeId: selectedRecipe.id,
        recipeName: selectedRecipe.name,
        portions,
        scaleFactor,
        assignedTo: assignedTo || null,
        assignedToName: selectedCook?.name || 'Team',
        station: null,
        department: department || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        chefNotes,
        priority,
        type: 'recipe'
      });

      // Add to local list for display
      setTaskList(prev => [...prev, {
        id: taskId,
        recipeName: selectedRecipe.name,
        portions,
        priority,
        isCustom: false
      }]);

      // Reset recipe selection for next task
      if (!initialRecipe) {
        setSelectedRecipe(null);
        setRecipeSearch('');
      }
      setPortions(initialRecipe?.portions || 1);

      onTaskCreated?.({ id: taskId, recipeName: selectedRecipe.name });
    } catch (error) {
      console.error('Error creating task:', error);
      setError(error.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  // Handle Add Task button (save current and reset form)
  const handleAddTask = async () => {
    if (customTask.trim()) {
      await handleAddCustomTask();
    } else if (selectedRecipe) {
      await handleAddRecipeTask();
    }
  };

  // Handle Done button (save current if exists and close)
  const handleDone = async () => {
    if (customTask.trim()) {
      await handleAddCustomTask();
    } else if (selectedRecipe) {
      await handleAddRecipeTask();
    }
    onClose();
  };

  // Handle Enter key on custom task input
  const handleCustomTaskKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomTask();
    }
  };

  // Remove task from list (note: task already saved to DB, this just removes from view)
  const handleRemoveFromList = (index) => {
    setTaskList(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Assign Tasks</h2>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Form */}
        <div className={styles.form}>
          {/* Assign To - TOP */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Assign To</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className={styles.select}
            >
              <option value="">-- Team (anyone can claim) --</option>
              {cooks.map(cook => (
                <option key={cook.id} value={cook.id}>
                  {cook.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Task Input */}
          <div className={styles.taskInputRow}>
            <div className={styles.taskInputWrapper}>
              <label className={styles.label}>Task</label>
              <input
                type="text"
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                onKeyDown={handleCustomTaskKeyDown}
                placeholder="Type a task (e.g., Clean the grill)..."
                className={styles.input}
              />
            </div>
            <div className={styles.addBtnWrapper}>
              <label className={styles.label}>&nbsp;</label>
              <button
                type="button"
                className={styles.addToListBtn}
                onClick={handleAddCustomTask}
                disabled={!customTask.trim() || loading}
              >
                +
              </button>
            </div>
          </div>

          {/* Recipe Row: Search + Portions + Add Button */}
          <div className={styles.recipeRow}>
            {/* Recipe Search */}
            <div className={styles.recipeSearchWrapper}>
              <label className={styles.label}>Recipe</label>
              {selectedRecipe ? (
                <div className={styles.selectedRecipe}>
                  <span className={styles.selectedRecipeName}>{selectedRecipe.name}</span>
                  {!initialRecipe && (
                    <button
                      type="button"
                      className={styles.changeBtn}
                      onClick={() => {
                        setSelectedRecipe(null);
                        setShowRecipeDropdown(true);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className={styles.recipeSearch}
                  onMouseLeave={() => !recipeSearch && setShowRecipeDropdown(false)}
                >
                  <input
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => {
                      setRecipeSearch(e.target.value);
                      setShowRecipeDropdown(true);
                    }}
                    onClick={() => setShowRecipeDropdown(true)}
                    placeholder="Search recipes..."
                    className={styles.input}
                  />
                  {showRecipeDropdown && (
                    <div className={styles.recipeDropdown}>
                      {filteredRecipes.length === 0 ? (
                        <div className={styles.noResults}>No recipes found</div>
                      ) : (
                        filteredRecipes.slice(0, 6).map(r => (
                          <button
                            key={r.id}
                            type="button"
                            className={styles.recipeOption}
                            onClick={() => handleSelectRecipe(r)}
                          >
                            <span>{r.name}</span>
                            {r.category && (
                              <span className={styles.recipeCategory}>{r.category}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Portions */}
            <div className={styles.portionsWrapper}>
              <label className={styles.label}>Qty</label>
              <input
                type="number"
                value={portions}
                onChange={(e) => setPortions(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                className={styles.portionsInput}
              />
            </div>

            {/* Add to List Button */}
            <div className={styles.addBtnWrapper}>
              <label className={styles.label}>&nbsp;</label>
              <button
                type="button"
                className={styles.addToListBtn}
                onClick={handleAddRecipeTask}
                disabled={!selectedRecipe || loading}
              >
                +
              </button>
            </div>
          </div>

          {/* Task List */}
          {taskList.length > 0 && (
            <div className={styles.taskList}>
              <label className={styles.label}>Tasks Added ({taskList.length})</label>
              <div className={styles.taskListItems}>
                {taskList.map((task, index) => (
                  <div key={task.id || index} className={`${styles.taskItem} ${task.isCustom ? styles.customTask : ''}`}>
                    {task.isCustom && <span className={styles.taskType}>Task</span>}
                    {!task.isCustom && <span className={styles.taskType}>Recipe</span>}
                    <span className={styles.taskName}>{task.recipeName}</span>
                    {!task.isCustom && <span className={styles.taskPortions}>x{task.portions}</span>}
                    <span className={`${styles.taskPriority} ${styles[task.priority]}`}>
                      {task.priority}
                    </span>
                    <button
                      type="button"
                      className={styles.deleteTaskBtn}
                      onClick={() => handleRemoveFromList(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Due Date/Time Row */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Due Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          {/* Priority */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Priority</label>
            <div className={styles.priorityButtons}>
              {['low', 'normal', 'high', 'urgent'].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.priorityButton} ${priority === p ? styles.active : ''} ${styles[p]}`}
                  onClick={() => setPriority(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Chef Notes */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Notes</label>
            <textarea
              value={chefNotes}
              onChange={(e) => setChefNotes(e.target.value)}
              placeholder="Special instructions..."
              className={styles.textarea}
              rows={2}
            />
          </div>

          {/* Error */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.addTaskButton}
              onClick={handleAddTask}
              disabled={loading || (!selectedRecipe && !customTask.trim())}
            >
              {loading ? 'Adding...' : 'Add Task'}
            </button>
            <button
              type="button"
              className={styles.doneButton}
              onClick={handleDone}
              disabled={loading}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

AssignTaskModal.propTypes = {
  /** Initial recipe to assign (optional) */
  recipe: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    portions: PropTypes.number,
  }),
  /** Pre-selected user to assign task to */
  preselectedUser: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    departments: PropTypes.arrayOf(PropTypes.string),
  }),
  /** Close handler */
  onClose: PropTypes.func.isRequired,
  /** Callback when task is created */
  onTaskCreated: PropTypes.func,
};

export default AssignTaskModal;
