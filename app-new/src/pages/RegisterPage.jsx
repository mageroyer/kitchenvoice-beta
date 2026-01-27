import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  registerUser,
  validatePasswordStrength,
  getPasswordStrength,
  getPasswordStrengthLabel
} from '../services/auth/firebaseAuth';
import { ROUTES } from '../constants/routes';
import { useAccess } from '../contexts/AccessContext';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import BusinessSetupWizard from '../components/common/BusinessSetupWizard';
import styles from '../styles/pages/authpage.module.css';

// Plan display info
const planInfo = {
  free: { name: 'Essayer', icon: '🌱', color: '#27ae60' },
  pro: { name: 'Professionnel', icon: '🚀', color: '#667eea' },
  enterprise: { name: 'Entreprise', icon: '🏆', color: '#f39c12' },
};

function RegisterPage() {
  const navigate = useNavigate();
  const { authenticateWithPin, updateDepartment } = useAccess();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Ref for timer cleanup
  const redirectTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Get selected plan from sessionStorage
  useEffect(() => {
    const plan = sessionStorage.getItem('selectedPlan');
    if (plan && planInfo[plan]) {
      setSelectedPlan(plan);
    }
  }, []);

  // Calculate password strength
  const passwordStrength = getPasswordStrength(password);
  const strengthInfo = getPasswordStrengthLabel(passwordStrength);

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setPassword(newPassword);

    // Validate password strength in real-time
    if (newPassword) {
      const validation = validatePasswordStrength(newPassword);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordErrors([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate all fields
    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (!password) {
      setError('Please enter a password');
      return;
    }

    // Check password strength
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      setError('Please fix the password requirements');
      setPasswordErrors(validation.errors);
      return;
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Check terms agreement
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    setLoading(true);

    // Mark that we're in setup flow BEFORE registration (prevents redirect race condition)
    sessionStorage.setItem('smartcookbook_in_setup', 'true');

    try {
      const result = await registerUser(email, password, displayName.trim());

      if (result.success) {
        // Store the user info and show setup wizard
        setRegisteredUser({
          uid: result.user.uid,
          displayName: displayName.trim()
        });
        setShowSetupWizard(true);
        setLoading(false);
      }
    } catch (err) {
      // Clear the flag if registration fails
      sessionStorage.removeItem('smartcookbook_in_setup');
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSetupComplete = async (setupData) => {
    // Clear the setup flag
    sessionStorage.removeItem('smartcookbook_in_setup');

    setShowSetupWizard(false);

    // Update the department in context
    if (setupData?.defaultDepartment) {
      updateDepartment(setupData.defaultDepartment);
    }

    // Auto-authenticate with the owner PIN
    if (setupData?.pin) {
      try {
        const result = await authenticateWithPin(setupData.pin);
        if (result.success) {
          // Redirect directly to recipes (user is now authenticated and unlocked)
          navigate(ROUTES.RECIPES);
          return;
        }
      } catch (err) {
        console.error('Auto-auth failed:', err);
      }
    }

    // Fallback: show success message and redirect to login
    setSuccess('Setup complete! Your business and owner access have been configured.');
    redirectTimerRef.current = setTimeout(() => {
      navigate(ROUTES.RECIPES);
    }, 1500);
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <Card className={styles.authCard}>
          <div className={styles.authHeader}>
            <img src="/favicon.svg" alt="" className={styles.authLogo} />
            <h1 className={styles.authTitle}>KitchenCommand</h1>
            <p className={styles.authSubtitle}>Create your account</p>
            {selectedPlan && planInfo[selectedPlan] && (
              <div style={{ marginTop: '12px' }}>
                <Badge
                  variant="primary"
                  size="medium"
                  style={{ backgroundColor: planInfo[selectedPlan].color }}
                >
                  {planInfo[selectedPlan].icon} {planInfo[selectedPlan].name} Plan
                </Badge>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.WELCOME)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    marginLeft: '8px',
                    textDecoration: 'underline'
                  }}
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="danger" dismissible onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert variant="success">
              {success}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className={styles.authForm}>
            <Input
              label="Full Name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your full name"
              required
              autoComplete="name"
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />

            <div className={styles.passwordField}>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Create a strong password"
                required
                autoComplete="new-password"
              />

              {/* Password Strength Indicator */}
              {password && (
                <div className={styles.strengthIndicator}>
                  <div className={styles.strengthBars}>
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className={styles.strengthBar}
                        style={{
                          backgroundColor: index < passwordStrength ? strengthInfo.color : '#e0e0e0'
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={styles.strengthLabel}
                    style={{ color: strengthInfo.color }}
                  >
                    {strengthInfo.label}
                  </span>
                </div>
              )}

              {/* Password Requirements */}
              {passwordErrors.length > 0 && (
                <ul className={styles.passwordRequirements}>
                  {passwordErrors.map((err, index) => (
                    <li key={index} className={styles.requirementError}>
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              error={confirmPassword && password !== confirmPassword}
              errorMessage={confirmPassword && password !== confirmPassword ? "Passwords don't match" : ''}
            />

            {/* Terms Agreement Checkbox */}
            <div className={styles.termsCheckbox}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className={styles.checkbox}
                />
                <span className={styles.checkboxText}>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={loading || passwordErrors.length > 0}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          <div className={styles.authFooter}>
            <p>
              Already have an account?{' '}
              <Link to={ROUTES.LOGIN}>Sign in</Link>
            </p>
          </div>
        </Card>
      </div>

      {/* Business Setup Wizard - shown after successful registration */}
      <BusinessSetupWizard
        isOpen={showSetupWizard}
        user={registeredUser}
        onComplete={handleSetupComplete}
      />
    </div>
  );
}

export default RegisterPage;
