import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isDemoMode } from '../../services/demo/demoService';
import Spinner from '../common/Spinner';
import styles from '../../styles/pages/authpage.module.css';

/**
 * ProtectedRoute Component
 *
 * A route wrapper that requires authentication or demo mode for access.
 * Shows loading spinner while checking auth status, then either renders
 * children or redirects to the landing page.
 *
 * During beta phase: Only demo mode is available (no account registration yet).
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render when access is granted
 * @returns {JSX.Element} Children, loading spinner, or redirect
 *
 * @example
 * // Wrap a protected page route
 * <Route
 *   path="/recipes"
 *   element={
 *     <ProtectedRoute>
 *       <RecipeListPage />
 *     </ProtectedRoute>
 *   }
 * />
 *
 * @example
 * // Multiple protected routes
 * <Routes>
 *   <Route path="/" element={<LandingPage />} />
 *   <Route path="/recipes" element={<ProtectedRoute><RecipeListPage /></ProtectedRoute>} />
 *   <Route path="/recipe/:id" element={<ProtectedRoute><RecipeDetailPage /></ProtectedRoute>} />
 *   <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
 * </Routes>
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const inDemoMode = isDemoMode();

  // Show loading spinner while checking auth (skip if in demo mode)
  if (loading && !inDemoMode) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" />
        <p>Loading...</p>
      </div>
    );
  }

  // Allow access if in demo mode
  if (inDemoMode) {
    return children;
  }

  // Allow access if authenticated (for future use / admin access)
  if (isAuthenticated) {
    return children;
  }

  // Not in demo mode and not authenticated - redirect to landing page
  return <Navigate to="/" replace />;
}

/**
 * PublicRoute Component
 *
 * A route wrapper for pages accessible without authentication.
 * Shows loading spinner during auth check, then renders children.
 * No automatic redirect - users must explicitly enter demo mode.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render
 * @returns {JSX.Element} Children or loading spinner
 *
 * @example
 * // Landing page accessible to all
 * <Route
 *   path="/"
 *   element={
 *     <PublicRoute>
 *       <LandingPage />
 *     </PublicRoute>
 *   }
 * />
 */
export function PublicRoute({ children }) {
  const { loading } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" />
        <p>Loading...</p>
      </div>
    );
  }

  // During beta: Always show public content (landing page, etc.)
  // No automatic redirect - users choose to enter demo mode
  return children;
}

ProtectedRoute.propTypes = {
  /** Child components to render when access is granted */
  children: PropTypes.node.isRequired,
};

PublicRoute.propTypes = {
  /** Child components to render */
  children: PropTypes.node.isRequired,
};

export default ProtectedRoute;
