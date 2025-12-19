/**
 * Privileges Modal Component
 *
 * Modal for adding/editing a single team member
 * - Shows form directly (no list view)
 * - Add mode: empty form for new member
 * - Edit mode: pre-filled form for existing member
 */

import { useState, useEffect } from 'react';
import Button from './Button';
import Input from './Input';
import Alert from './Alert';
import {
  createPrivilege,
  updatePrivilege,
  deletePrivilege,
  ACCESS_LEVELS,
  getAccessLevelDisplay
} from '../../services/auth/privilegesService';
import { departmentDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/privilegesmodal.module.css';

/**
 * Privileges Modal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close handler
 * @param {Object} props.initialUser - User to edit (null = add new)
 * @param {Function} props.onSaved - Callback after save/delete
 */
function PrivilegesModal({ isOpen, onClose, initialUser = null, onSaved }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    accessLevel: ACCESS_LEVELS.EDITOR,
    departments: [],
    position: ''
  });

  // Determine if we're in edit mode
  const isEditMode = initialUser !== null;

  // Load departments
  useEffect(() => {
    if (isOpen) {
      loadDepartments();
    }
  }, [isOpen]);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialUser) {
        // Edit mode - pre-fill form
        setFormData({
          name: initialUser.name || '',
          pin: initialUser.pin || '',
          accessLevel: initialUser.accessLevel || ACCESS_LEVELS.EDITOR,
          departments: initialUser.departments || [],
          position: initialUser.position || ''
        });
      } else {
        // Add mode - reset form
        setFormData({
          name: '',
          pin: '',
          accessLevel: ACCESS_LEVELS.EDITOR,
          departments: [],
          position: ''
        });
      }
      setError('');
      setSuccess('');
    }
  }, [isOpen, initialUser]);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const depts = await departmentDB.getAll();
      const deptList = depts.map(d => d.name);
      setDepartments(deptList.length > 0 ? deptList : ['Cuisine']);
    } catch (err) {
      console.error('Error loading departments:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Toggle department selection
  const toggleDepartment = (dept) => {
    setFormData(prev => {
      const depts = prev.departments.includes(dept)
        ? prev.departments.filter(d => d !== dept)
        : [...prev.departments, dept];
      return { ...prev, departments: depts };
    });
  };

  // Save privilege (create or update)
  const handleSave = async () => {
    setError('');
    setSuccess('');

    // Validation
    if (!formData.name.trim()) {
      setError('Employee name is required');
      return;
    }
    if (!formData.pin || formData.pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (formData.accessLevel !== ACCESS_LEVELS.OWNER && formData.departments.length === 0) {
      setError('Please select at least one department');
      return;
    }

    setSaving(true);
    try {
      if (isEditMode) {
        // Update existing
        await updatePrivilege(initialUser.id, formData);
        setSuccess('Member updated successfully');
      } else {
        // Create new
        await createPrivilege(formData);
        setSuccess('Member created successfully');
      }

      // Callback and close after short delay to show success message
      setTimeout(() => {
        onSaved?.();
        onClose();
      }, 500);
    } catch (err) {
      console.error('Error saving privilege:', err);
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Delete privilege
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this team member?')) return;

    setError('');
    setSaving(true);
    try {
      await deletePrivilege(initialUser.id);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Error deleting privilege:', err);
      setError('Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {isEditMode ? 'Edit Member' : 'Add Member'}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Messages */}
        {error && (
          <Alert variant="danger" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert variant="success" dismissible onDismiss={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        {/* Form */}
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <div className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Employee Name</label>
              <Input
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
                placeholder="Jean-Pierre Tremblay"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Position (optional)</label>
              <Input
                value={formData.position}
                onChange={e => handleInputChange('position', e.target.value)}
                placeholder="e.g., Sous Chef, Line Cook, Prep Cook"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>PIN (4-6 digits)</label>
              <Input
                type="password"
                value={formData.pin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  handleInputChange('pin', val);
                }}
                placeholder="1234"
                maxLength={6}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Access Level</label>
              <div className={styles.accessLevels}>
                {Object.values(ACCESS_LEVELS).map(level => (
                  <button
                    key={level}
                    className={`${styles.accessButton} ${formData.accessLevel === level ? styles.active : ''}`}
                    onClick={() => handleInputChange('accessLevel', level)}
                    type="button"
                  >
                    {getAccessLevelDisplay(level)}
                  </button>
                ))}
              </div>
            </div>

            {formData.accessLevel !== ACCESS_LEVELS.OWNER && (
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Departments Access
                  <span className={styles.labelHint}> (select which departments this employee can access)</span>
                </label>
                {departments.length === 0 ? (
                  <div className={styles.noDepartments}>
                    No departments available. Create departments in Control Panel first.
                  </div>
                ) : (
                  <div className={styles.departmentList}>
                    {departments.map(dept => (
                      <label key={dept} className={styles.departmentItem}>
                        <input
                          type="checkbox"
                          checked={formData.departments.includes(dept)}
                          onChange={() => toggleDepartment(dept)}
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                )}
                {formData.departments.length > 0 && (
                  <div className={styles.selectedDepts}>
                    Selected: {formData.departments.join(', ')}
                  </div>
                )}
              </div>
            )}

            <div className={styles.formActions}>
              {isEditMode && (
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete
                </Button>
              )}
              <div className={styles.formActionsSpacer} />
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : (isEditMode ? 'Update' : 'Create')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PrivilegesModal;
