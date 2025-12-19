/**
 * Control Panel - Departments Tab
 *
 * Manage departments and categories with add/edit/delete functionality.
 * Extracted from ControlPanelPage for code splitting.
 */

import { useState, useCallback } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import { departmentDB, categoryDB } from '../../services/database/indexedDB';
import styles from '../../styles/pages/controlpanelpage.module.css';

function DepartmentsTab({
  departments,
  categories,
  expandedDepts,
  onToggleDept,
  onDataChange,
}) {
  // Modal state
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Form state
  const [newDeptName, setNewDeptName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [selectedDeptForCat, setSelectedDeptForCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleteItem, setDeleteItem] = useState(null);

  // Get categories for department
  const getCategoriesForDept = useCallback((deptId) => {
    return categories.filter(c => c.departmentId === deptId);
  }, [categories]);

  // Department handlers
  const handleAddDepartment = useCallback(async () => {
    if (!newDeptName.trim()) return;
    try {
      await departmentDB.add(newDeptName.trim());
      setNewDeptName('');
      setShowAddDeptModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error adding department:', error);
      alert('Error adding department: ' + error.message);
    }
  }, [newDeptName, onDataChange]);

  const handleEditDepartment = useCallback(async () => {
    if (!editName.trim() || !editItem) return;
    try {
      await departmentDB.update(editItem.id, editName.trim());
      setEditItem(null);
      setEditName('');
      setShowEditModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error updating department:', error);
    }
  }, [editName, editItem, onDataChange]);

  const handleDeleteDepartment = useCallback(async () => {
    if (!deleteItem) return;
    try {
      const success = await departmentDB.delete(deleteItem.id);
      if (!success) {
        alert('Cannot delete default departments');
      }
      setDeleteItem(null);
      setShowDeleteModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error deleting department:', error);
    }
  }, [deleteItem, onDataChange]);

  // Category handlers
  const handleAddCategory = useCallback(async () => {
    if (!newCatName.trim() || !selectedDeptForCat) return;
    try {
      await categoryDB.add(newCatName.trim(), selectedDeptForCat);
      setNewCatName('');
      setSelectedDeptForCat(null);
      setShowAddCatModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category: ' + error.message);
    }
  }, [newCatName, selectedDeptForCat, onDataChange]);

  const handleEditCategory = useCallback(async () => {
    if (!editName.trim() || !editItem) return;
    try {
      await categoryDB.update(editItem.id, editName.trim());
      setEditItem(null);
      setEditName('');
      setShowEditModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error updating category:', error);
    }
  }, [editName, editItem, onDataChange]);

  const handleDeleteCategory = useCallback(async () => {
    if (!deleteItem) return;
    try {
      const success = await categoryDB.delete(deleteItem.id);
      if (!success) {
        alert('Cannot delete default categories');
      }
      setDeleteItem(null);
      setShowDeleteModal(false);
      onDataChange();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  }, [deleteItem, onDataChange]);

  return (
    <div className={styles.departmentsTab}>
      <div className={styles.sectionHeader}>
        <h2>Manage Departments & Categories</h2>
        <div className={styles.sectionActions}>
          <Button variant="primary" onClick={() => setShowAddDeptModal(true)}>
            + Add Department
          </Button>
        </div>
      </div>

      <div className={styles.deptList}>
        {departments.map(dept => {
          const deptCategories = getCategoriesForDept(dept.id);
          const isExpanded = expandedDepts[dept.id];

          return (
            <Card key={dept.id} className={styles.deptCard}>
              <div className={styles.deptHeader}>
                <div
                  className={styles.deptTitle}
                  onClick={() => onToggleDept(dept.id)}
                >
                  <span className={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className={styles.deptIcon}>🏢</span>
                  <span>{dept.name}</span>
                  {dept.isDefault && (
                    <Badge variant="secondary" size="small">Default</Badge>
                  )}
                </div>
                <div className={styles.deptActions}>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      setSelectedDeptForCat(dept.id);
                      setShowAddCatModal(true);
                    }}
                  >
                    + Category
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      setEditItem({ ...dept, type: 'department' });
                      setEditName(dept.name);
                      setShowEditModal(true);
                    }}
                  >
                    ✏️
                  </Button>
                  {!dept.isDefault && (
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        setDeleteItem({ ...dept, type: 'department' });
                        setShowDeleteModal(true);
                      }}
                    >
                      🗑️
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.catList}>
                  {deptCategories.map(cat => (
                    <div key={cat.id} className={styles.catItem}>
                      <span className={styles.catIcon}>📁</span>
                      <span>{cat.name}</span>
                      {cat.isDefault && (
                        <Badge variant="secondary" size="small">Default</Badge>
                      )}
                      <div className={styles.catActions}>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => {
                            setEditItem({ ...cat, type: 'category' });
                            setEditName(cat.name);
                            setShowEditModal(true);
                          }}
                        >
                          ✏️
                        </Button>
                        {!cat.isDefault && (
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => {
                              setDeleteItem({ ...cat, type: 'category' });
                              setShowDeleteModal(true);
                            }}
                          >
                            🗑️
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {deptCategories.length === 0 && (
                    <p className={styles.emptyText}>No categories in this department</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add Department Modal */}
      <Modal
        isOpen={showAddDeptModal}
        onClose={() => {
          setShowAddDeptModal(false);
          setNewDeptName('');
        }}
        title="Add Department"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddDeptModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddDepartment}>
              Add Department
            </Button>
          </>
        }
      >
        <Input
          label="Department Name"
          value={newDeptName}
          onChange={(e) => setNewDeptName(e.target.value)}
          placeholder="e.g., Pastry Kitchen"
          autoFocus
        />
      </Modal>

      {/* Add Category Modal */}
      <Modal
        isOpen={showAddCatModal}
        onClose={() => {
          setShowAddCatModal(false);
          setNewCatName('');
          setSelectedDeptForCat(null);
        }}
        title="Add Category"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddCatModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddCategory}>
              Add Category
            </Button>
          </>
        }
      >
        <Input
          label="Category Name"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          placeholder="e.g., Appetizers"
          autoFocus
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditItem(null);
          setEditName('');
        }}
        title={`Edit ${editItem?.type === 'department' ? 'Department' : 'Category'}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={editItem?.type === 'department' ? handleEditDepartment : handleEditCategory}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <Input
          label="Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          autoFocus
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteItem(null);
        }}
        title="Confirm Delete"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={deleteItem?.type === 'department' ? handleDeleteDepartment : handleDeleteCategory}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete "{deleteItem?.name}"?
          {deleteItem?.type === 'department' && (
            <span style={{ display: 'block', marginTop: '10px', color: '#e74c3c' }}>
              Warning: This will also delete all categories in this department.
            </span>
          )}
        </p>
      </Modal>
    </div>
  );
}

export default DepartmentsTab;
