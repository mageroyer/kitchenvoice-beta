/**
 * Edit Account Modal Component
 *
 * Modal for owner to edit their own account
 * - Profile: name, position, PIN
 * - Security: change password
 * - Business: business name, address, phone
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Alert from './Alert';
import { updatePrivilege, createPrivilege, verifyPin, ACCESS_LEVELS } from '../../services/auth/privilegesService';
import { changePassword, updateUserDisplayName, getPasswordStrength, getPasswordStrengthLabel } from '../../services/auth/firebaseAuth';
import { getBusinessInfo, saveBusinessInfo, BUSINESS_TYPES } from '../../services/database/businessService';
import styles from '../../styles/components/editaccountmodal.module.css';

/**
 * Edit Account Modal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close handler
 * @param {Object} props.ownerPrivilege - Owner's privilege record
 * @param {Object} props.user - Firebase auth user
 * @param {Function} props.onSaved - Callback after save
 */
function EditAccountModal({ isOpen, onClose, ownerPrivilege, user, onSaved }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile form
  const [profileData, setProfileData] = useState({
    name: '',
    position: '',
    pin: '',
  });

  // Password form
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Business form
  const [businessData, setBusinessData] = useState({
    businessName: '',
    businessType: '',
    address: '',
    city: '',
    phone: '',
  });

  // Initialize forms when modal opens
  useEffect(() => {
    if (isOpen) {
      // Profile data from privilege
      if (ownerPrivilege) {
        setProfileData({
          name: ownerPrivilege.name || '',
          position: ownerPrivilege.position || '',
          pin: ownerPrivilege.pin || '',
        });
      }

      // Reset password form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      // Load business info
      if (user?.uid) {
        loadBusinessInfo(user.uid);
      }

      setError('');
      setSuccess('');
    }
  }, [isOpen, ownerPrivilege, user]);

  const loadBusinessInfo = async (userId) => {
    try {
      const info = await getBusinessInfo(userId);
      if (info) {
        setBusinessData({
          businessName: info.businessName || '',
          businessType: info.businessType || '',
          address: info.address || '',
          city: info.city || '',
          phone: info.phone || '',
        });
      }
    } catch (err) {
      console.error('Error loading business info:', err);
    }
  };

  // Handle profile save
  const handleSaveProfile = async () => {
    setError('');
    setSuccess('');

    if (!profileData.name.trim()) {
      setError('Name is required');
      return;
    }

    // Validate PIN format (required for owner)
    if (!profileData.pin || profileData.pin.length < 4 || profileData.pin.length > 6 || !/^\d+$/.test(profileData.pin)) {
      setError('PIN is required and must be 4-6 digits');
      return;
    }

    // Check if PIN is already in use by another user
    if (profileData.pin !== ownerPrivilege?.pin) {
      const existing = await verifyPin(profileData.pin);
      if (existing && existing.id !== ownerPrivilege?.id) {
        setError('This PIN is already in use');
        return;
      }
    }

    setLoading(true);
    try {
      // Check if we need to create or update the privilege record
      if (ownerPrivilege?.id === 'firebase-owner') {
        // Create new privilege record for owner
        await createPrivilege({
          name: profileData.name.trim(),
          position: profileData.position.trim() || 'Owner',
          pin: profileData.pin,
          accessLevel: ACCESS_LEVELS.OWNER,
          departments: [],
        });
      } else {
        // Update existing privilege record
        await updatePrivilege(ownerPrivilege.id, {
          name: profileData.name.trim(),
          position: profileData.position.trim() || null,
          pin: profileData.pin,
        });
      }

      // Update Firebase display name if changed
      if (profileData.name.trim() !== user?.displayName) {
        await updateUserDisplayName(profileData.name.trim());
      }

      setSuccess('Profile updated successfully!');
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Handle password change
  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    if (!passwordData.currentPassword) {
      setError('Current password is required');
      return;
    }

    if (!passwordData.newPassword) {
      setError('New password is required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setSuccess('Password changed successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  // Handle business info save
  const handleSaveBusiness = async () => {
    setError('');
    setSuccess('');

    if (!businessData.businessName.trim()) {
      setError('Business name is required');
      return;
    }

    setLoading(true);
    try {
      await saveBusinessInfo(user.uid, {
        businessName: businessData.businessName.trim(),
        businessType: businessData.businessType,
        address: businessData.address.trim(),
        city: businessData.city.trim(),
        phone: businessData.phone.trim(),
      });
      setSuccess('Business info updated successfully!');
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Failed to update business info');
    } finally {
      setLoading(false);
    }
  };

  // Password strength indicator
  const passwordStrength = getPasswordStrength(passwordData.newPassword);
  const strengthLabel = getPasswordStrengthLabel(passwordStrength);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Account"
      size="medium"
    >
      <div className={styles.container}>
        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'profile' ? styles.active : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'password' ? styles.active : ''}`}
            onClick={() => setActiveTab('password')}
          >
            Password
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'business' ? styles.active : ''}`}
            onClick={() => setActiveTab('business')}
          >
            Business
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

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className={styles.tabContent}>
            <div className={styles.field}>
              <label className={styles.label}>Name *</label>
              <Input
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                placeholder="Your name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Position / Title</label>
              <Input
                value={profileData.position}
                onChange={(e) => setProfileData({ ...profileData, position: e.target.value })}
                placeholder="e.g., Executive Chef"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>PIN (4-6 digits)</label>
              <Input
                type="password"
                value={profileData.pin}
                onChange={(e) => setProfileData({ ...profileData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="Enter PIN"
                maxLength={6}
              />
              <span className={styles.hint}>Used to unlock owner access</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <Input
                value={user?.email || ''}
                disabled
              />
              <span className={styles.hint}>Email cannot be changed</span>
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveProfile} loading={loading}>
                Save Profile
              </Button>
            </div>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <div className={styles.tabContent}>
            <div className={styles.field}>
              <label className={styles.label}>Current Password *</label>
              <Input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                placeholder="Enter current password"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>New Password *</label>
              <Input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Enter new password"
              />
              {passwordData.newPassword && (
                <div className={styles.strengthBar}>
                  <div
                    className={styles.strengthFill}
                    style={{
                      width: `${(passwordStrength / 4) * 100}%`,
                      backgroundColor: strengthLabel.color,
                    }}
                  />
                  <span className={styles.strengthLabel} style={{ color: strengthLabel.color }}>
                    {strengthLabel.label}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password *</label>
              <Input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
              />
              {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                <span className={styles.errorHint}>Passwords do not match</span>
              )}
            </div>

            <div className={styles.passwordRequirements}>
              <p>Password requirements:</p>
              <ul>
                <li>At least 8 characters</li>
                <li>At least 1 uppercase letter</li>
                <li>At least 1 lowercase letter</li>
                <li>At least 1 number</li>
                <li>At least 1 special character (!@#$%^&*)</li>
              </ul>
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleChangePassword} loading={loading}>
                Change Password
              </Button>
            </div>
          </div>
        )}

        {/* Business Tab */}
        {activeTab === 'business' && (
          <div className={styles.tabContent}>
            <div className={styles.field}>
              <label className={styles.label}>Business Name *</label>
              <Input
                value={businessData.businessName}
                onChange={(e) => setBusinessData({ ...businessData, businessName: e.target.value })}
                placeholder="Your business name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Business Type</label>
              <select
                className={styles.select}
                value={businessData.businessType}
                onChange={(e) => setBusinessData({ ...businessData, businessType: e.target.value })}
              >
                <option value="">Select type...</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Address</label>
              <Input
                value={businessData.address}
                onChange={(e) => setBusinessData({ ...businessData, address: e.target.value })}
                placeholder="Street address"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>City</label>
              <Input
                value={businessData.city}
                onChange={(e) => setBusinessData({ ...businessData, city: e.target.value })}
                placeholder="City"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Phone</label>
              <Input
                value={businessData.phone}
                onChange={(e) => setBusinessData({ ...businessData, phone: e.target.value })}
                placeholder="Phone number"
              />
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveBusiness} loading={loading}>
                Save Business Info
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

EditAccountModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  ownerPrivilege: PropTypes.object,
  user: PropTypes.object,
  onSaved: PropTypes.func,
};

export default EditAccountModal;
