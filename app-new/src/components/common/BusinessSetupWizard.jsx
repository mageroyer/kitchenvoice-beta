/**
 * Business Setup Wizard Component
 *
 * Multi-step wizard for first-time user setup:
 * Step 1: Business Information (name, type, contact, logo)
 * Step 2: Departments (add/remove, select default)
 * Step 3: Owner PIN setup
 */

import { useState, useRef } from 'react';
import Button from './Button';
import Input from './Input';
import Alert from './Alert';
import { createInitialOwnerPrivilege } from '../../services/auth/privilegesService';
import {
  saveBusinessInfo,
  markSetupComplete,
  BUSINESS_TYPES,
  SUGGESTED_DEPARTMENTS
} from '../../services/database/businessService';
import { departmentDB, vendorDB, clearAllLocalData } from '../../services/database/indexedDB';
import styles from '../../styles/components/businesssetupwizard.module.css';

const STEPS = [
  { id: 1, title: 'Business Info', icon: '🏢' },
  { id: 2, title: 'Departments', icon: '🍳' },
  { id: 3, title: 'Owner Access', icon: '🔐' }
];

function BusinessSetupWizard({ isOpen, user, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Step 1: Business Info
  const [businessInfo, setBusinessInfo] = useState({
    name: '',
    type: 'restaurant',
    phone: '',
    fax: '',
    email: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'Canada',
    logo: null,
    logoPreview: null
  });

  // Step 2: Departments
  const [departments, setDepartments] = useState(
    SUGGESTED_DEPARTMENTS.map(d => ({ ...d, selected: false }))
  );
  const [customDepartment, setCustomDepartment] = useState('');
  const [defaultDepartment, setDefaultDepartment] = useState('');

  // Step 3: Owner PIN
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const selectedDepartments = departments.filter(d => d.selected);

  // Handle logo upload
  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setBusinessInfo(prev => ({
          ...prev,
          logo: file,
          logoPreview: reader.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Toggle department selection
  const toggleDepartment = (index) => {
    setDepartments(prev => {
      const updated = prev.map((dept, i) => {
        if (i === index) {
          const newSelected = !dept.selected;
          // If deselecting the default, clear it
          if (!newSelected && defaultDepartment === dept.name) {
            setDefaultDepartment('');
          }
          return { ...dept, selected: newSelected };
        }
        return dept;
      });
      return updated;
    });
  };

  // Add custom department
  const addCustomDepartment = () => {
    const name = customDepartment.trim();
    if (!name) return;

    // Check if already exists
    if (departments.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      setError('Department already exists');
      return;
    }

    setDepartments(prev => [
      ...prev,
      { name, description: 'Custom department', selected: true, isCustom: true }
    ]);
    setCustomDepartment('');
    setError('');
  };

  // Remove custom department
  const removeCustomDepartment = (index) => {
    setDepartments(prev => {
      const dept = prev[index];
      if (defaultDepartment === dept.name) {
        setDefaultDepartment('');
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Validate current step
  const validateStep = () => {
    setError('');

    if (currentStep === 1) {
      if (!businessInfo.name.trim()) {
        setError('Business name is required');
        return false;
      }
    }

    if (currentStep === 2) {
      if (selectedDepartments.length === 0) {
        setError('Please select at least one department');
        return false;
      }
      if (!defaultDepartment) {
        setError('Please select a default department');
        return false;
      }
    }

    if (currentStep === 3) {
      if (pin.length < 4) {
        setError('PIN must be at least 4 digits');
        return false;
      }
      if (pin !== confirmPin) {
        setError('PINs do not match');
        return false;
      }
    }

    return true;
  };

  // Handle next step
  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep(prev => prev + 1);
  };

  // Handle previous step
  const handleBack = () => {
    setError('');
    setCurrentStep(prev => prev - 1);
  };

  // Handle final submission
  const handleComplete = async () => {
    if (!validateStep()) return;

    setLoading(true);
    setError('');

    try {
      // 1. Clear all existing local data for fresh start
      await clearAllLocalData();

      // 2. Save business info to Firestore
      await saveBusinessInfo(user.uid, {
        name: businessInfo.name.trim(),
        type: businessInfo.type,
        email: businessInfo.email.trim(),
        phone: businessInfo.phone.trim(),
        fax: businessInfo.fax.trim(),
        address: businessInfo.address.trim(),
        city: businessInfo.city.trim(),
        province: businessInfo.province.trim(),
        postalCode: businessInfo.postalCode.trim(),
        country: businessInfo.country.trim() || null,
        logoUrl: businessInfo.logoPreview || null // Store base64 for now
      });

      // 3. Create ONLY the user-selected departments in IndexedDB (with cloud sync)
      for (const dept of selectedDepartments) {
        await departmentDB.add(dept.name);
      }

      // 4. Create internal business vendor for in-house produced items
      await vendorDB.create({
        name: businessInfo.name.trim(),
        vendorCode: 'INTERNAL',
        email: businessInfo.email.trim(),
        phone: businessInfo.phone.trim(),
        fax: businessInfo.fax.trim(),
        address: businessInfo.address.trim(),
        city: businessInfo.city.trim(),
        province: businessInfo.province.trim(),
        postalCode: businessInfo.postalCode.trim(),
        country: businessInfo.country.trim() || null,
        isActive: true,
        isInternal: true,
        notes: 'Internal vendor for in-house produced items (e.g., sauces, prep items, finished dishes)',
        createdBy: user.uid
      });

      // 5. Set default department
      localStorage.setItem('smartcookbook_department', defaultDepartment);

      // 6. Create owner privilege
      await createInitialOwnerPrivilege(
        user.uid,
        user.displayName || businessInfo.name,
        pin
      );

      // 7. Mark setup as complete
      await markSetupComplete(user.uid);

      // Pass setup data back for auto-authentication
      onComplete({
        pin,
        defaultDepartment,
        ownerName: user.displayName || businessInfo.name
      });
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        {/* Progress Steps */}
        <div className={styles.progressBar}>
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`${styles.progressStep} ${
                currentStep === step.id ? styles.active : ''
              } ${currentStep > step.id ? styles.completed : ''}`}
            >
              <div className={styles.stepCircle}>
                {currentStep > step.id ? '✓' : step.icon}
              </div>
              <span className={styles.stepTitle}>{step.title}</span>
              {index < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="danger" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Step 1: Business Info */}
        {currentStep === 1 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepHeader}>Tell us about your business</h2>
            <p className={styles.stepDescription}>
              This information is used for your internal vendor profile and automated ordering/communications.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Business Name *</label>
                <Input
                  value={businessInfo.name}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Le Petit Bistro"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Business Type</label>
                <select
                  className={styles.select}
                  value={businessInfo.type}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, type: e.target.value }))}
                >
                  {BUSINESS_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email</label>
                <Input
                  type="email"
                  value={businessInfo.email}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="orders@business.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Phone</label>
                <Input
                  type="tel"
                  value={businessInfo.phone}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Fax</label>
                <Input
                  type="tel"
                  value={businessInfo.fax}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, fax: e.target.value }))}
                  placeholder="(555) 123-4568"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Street Address</label>
                <Input
                  value={businessInfo.address}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="123 Main Street"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>City</label>
                <Input
                  value={businessInfo.city}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="Toronto"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Province</label>
                <Input
                  value={businessInfo.province}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, province: e.target.value }))}
                  placeholder="ON"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Postal Code</label>
                <Input
                  value={businessInfo.postalCode}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, postalCode: e.target.value }))}
                  placeholder="A1A 1A1"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Country</label>
                <Input
                  value={businessInfo.country}
                  onChange={(e) => setBusinessInfo(prev => ({ ...prev, country: e.target.value }))}
                  placeholder="Canada"
                />
              </div>

              <div className={styles.formGroup + ' ' + styles.fullWidth}>
                <label className={styles.label}>Logo (optional)</label>
                <div className={styles.logoUpload}>
                  {businessInfo.logoPreview ? (
                    <div className={styles.logoPreview}>
                      <img src={businessInfo.logoPreview} alt="Logo preview" />
                      <button
                        type="button"
                        className={styles.removeLogo}
                        onClick={() => setBusinessInfo(prev => ({ ...prev, logo: null, logoPreview: null }))}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.uploadButton}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span className={styles.uploadIcon}>📷</span>
                      <span>Upload Logo</span>
                      <span className={styles.uploadHint}>Max 2MB</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Departments */}
        {currentStep === 2 && (
          <div className={styles.stepContent}>
            <h2 className={styles.stepHeader}>Set up your departments</h2>
            <p className={styles.stepDescription}>
              Select the kitchen departments you use. You can add more later.
            </p>

            <div className={styles.departmentsGrid}>
              {departments.map((dept, index) => (
                <div
                  key={dept.name}
                  className={`${styles.departmentCard} ${dept.selected ? styles.selected : ''}`}
                >
                  <div
                    className={styles.departmentMain}
                    onClick={() => toggleDepartment(index)}
                  >
                    <div className={styles.checkbox}>
                      {dept.selected && '✓'}
                    </div>
                    <div className={styles.departmentInfo}>
                      <span className={styles.departmentName}>{dept.name}</span>
                      <span className={styles.departmentDesc}>{dept.description}</span>
                    </div>
                  </div>
                  {dept.isCustom && (
                    <button
                      className={styles.removeButton}
                      onClick={() => removeCustomDepartment(index)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Custom Department */}
            <div className={styles.addCustom}>
              <Input
                value={customDepartment}
                onChange={(e) => setCustomDepartment(e.target.value)}
                placeholder="Add custom department..."
                onKeyDown={(e) => e.key === 'Enter' && addCustomDepartment()}
              />
              <Button
                variant="secondary"
                onClick={addCustomDepartment}
                disabled={!customDepartment.trim()}
              >
                Add
              </Button>
            </div>

            {/* Default Department Selection */}
            {selectedDepartments.length > 0 && (
              <div className={styles.defaultSelection}>
                <label className={styles.label}>Default Department *</label>
                <p className={styles.hint}>This will be your main working department.</p>
                <div className={styles.defaultOptions}>
                  {selectedDepartments.map(dept => (
                    <button
                      key={dept.name}
                      type="button"
                      className={`${styles.defaultOption} ${defaultDepartment === dept.name ? styles.active : ''}`}
                      onClick={() => setDefaultDepartment(dept.name)}
                    >
                      {dept.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Owner PIN */}
        {currentStep === 3 && (
          <div className={styles.stepContent}>
            <div className={styles.pinHeader}>
              <div className={styles.pinIcon}>🔐</div>
              <h2 className={styles.stepHeader}>Set Up Owner Access</h2>
              <p className={styles.stepDescription}>
                Create a PIN to unlock full owner privileges in the app.
              </p>
            </div>

            <div className={styles.pinForm}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Create Owner PIN (4-6 digits)</label>
                <Input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 4-6 digit PIN"
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Confirm PIN</label>
                <Input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Confirm your PIN"
                  maxLength={6}
                  inputMode="numeric"
                  error={confirmPin && pin !== confirmPin}
                  errorMessage={confirmPin && pin !== confirmPin ? "PINs don't match" : ''}
                />
              </div>

              <label className={styles.showPinLabel}>
                <input
                  type="checkbox"
                  checked={showPin}
                  onChange={(e) => setShowPin(e.target.checked)}
                />
                <span>Show PIN</span>
              </label>

              {/* PIN Strength Indicator */}
              {pin && (
                <div className={styles.pinStrength}>
                  <div className={styles.strengthDots}>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <div
                        key={index}
                        className={`${styles.dot} ${index < pin.length ? styles.filled : ''}`}
                      />
                    ))}
                  </div>
                  <span className={styles.pinLength}>{pin.length}/6 digits</span>
                </div>
              )}

              <div className={styles.infoBox}>
                <span className={styles.infoIcon}>💡</span>
                <div>
                  <p><strong>You'll use this PIN to:</strong></p>
                  <ul>
                    <li>Access the Control Panel</li>
                    <li>Manage team members and privileges</li>
                    <li>Delete recipes and make critical changes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className={styles.navigation}>
          {currentStep > 1 && (
            <Button variant="secondary" onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}
          <div className={styles.navSpacer} />
          {currentStep < 3 ? (
            <Button variant="primary" onClick={handleNext}>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleComplete}
              loading={loading}
              disabled={loading || pin.length < 4 || pin !== confirmPin}
            >
              {loading ? 'Setting Up...' : 'Complete Setup'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BusinessSetupWizard;
