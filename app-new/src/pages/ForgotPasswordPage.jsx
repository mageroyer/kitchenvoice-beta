import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../services/auth/firebaseAuth';
import { ROUTES } from '../constants/routes';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import Card from '../components/common/Card';
import styles from '../styles/pages/authpage.module.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(email);
      setSuccess(result.message);
      setEmailSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <Card className={styles.authCard}>
          <div className={styles.authHeader}>
            <h1 className={styles.authTitle}>Reset Password</h1>
            <p className={styles.authSubtitle}>
              {emailSent
                ? 'Check your email for reset instructions'
                : "Enter your email and we'll send you a reset link"}
            </p>
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

          {!emailSent ? (
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

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          ) : (
            <div className={styles.emailSentBox}>
              <div className={styles.emailIcon}>📧</div>
              <p>
                We've sent a password reset link to <strong>{email}</strong>.
                Please check your inbox and follow the instructions.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setEmailSent(false);
                  setSuccess('');
                  setEmail('');
                }}
              >
                Send to a different email
              </Button>
            </div>
          )}

          <div className={styles.authFooter}>
            <p>
              Remember your password?{' '}
              <Link to={ROUTES.LOGIN}>Back to Sign In</Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
