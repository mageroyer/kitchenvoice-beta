import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser, resendVerificationEmail } from '../services/auth/firebaseAuth';
import { isSetupComplete } from '../services/database/businessService';
import { ROUTES } from '../constants/routes';
import { useAccess } from '../contexts/AccessContext';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import Card from '../components/common/Card';
import BusinessSetupWizard from '../components/common/BusinessSetupWizard';
import styles from '../styles/pages/authpage.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const { authenticateWithPin, updateDepartment } = useAccess();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setNeedsVerification(false);

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      const result = await loginUser(email, password);

      if (result.success) {
        // Check if business setup is complete
        const setupComplete = await isSetupComplete(result.user.uid);

        if (!setupComplete) {
          // Need to complete business setup first
          setLoggedInUser({
            uid: result.user.uid,
            displayName: result.user.displayName || email.split('@')[0]
          });
          setShowSetupWizard(true);
          setLoading(false);
          return;
        }

        // Login successful - redirect
        if (result.needsVerification) {
          setNeedsVerification(true);
          setSuccess('Login successful! Please verify your email when convenient.');
        } else {
          setSuccess('Login successful! Redirecting...');
        }
        redirectTimerRef.current = setTimeout(() => {
          navigate(ROUTES.RECIPES);
        }, 500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingEmail(true);
    setError('');

    try {
      const result = await resendVerificationEmail();
      setSuccess(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSetupComplete = async (setupData) => {
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
          navigate(ROUTES.RECIPES);
          return;
        }
      } catch (err) {
        console.error('Auto-auth failed:', err);
      }
    }

    // Fallback: show success message and redirect
    setSuccess('Setup complete! Redirecting...');
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
            <p className={styles.authSubtitle}>Sign in to your account</p>
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

          {needsVerification && (
            <div className={styles.verificationBox}>
              <p>Didn't receive the email?</p>
              <Button
                variant="secondary"
                size="small"
                onClick={handleResendVerification}
                loading={resendingEmail}
                disabled={resendingEmail}
              >
                Resend Verification Email
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.authForm}>
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            <div className={styles.forgotPassword}>
              <Link to={ROUTES.FORGOT_PASSWORD || '/forgot-password'}>
                Forgot your password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className={styles.authFooter}>
            <p>
              Don't have an account?{' '}
              <Link to={ROUTES.REGISTER}>Create one</Link>
            </p>
          </div>
        </Card>
      </div>

      {/* Business Setup Wizard - shown if setup is incomplete */}
      <BusinessSetupWizard
        isOpen={showSetupWizard}
        user={loggedInUser}
        onComplete={handleSetupComplete}
      />
    </div>
  );
}

export default LoginPage;
