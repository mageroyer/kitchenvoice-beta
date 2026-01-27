import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Spinner from '../common/Spinner';
import styles from '../../styles/pages/authpage.module.css';

/**
 * ProtectedRoute Component
 *
 * A route wrapper that requires authentication for access.
 * Shows loading spinner while checking auth status, then either renders
 * children or redirects to the landing page.
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

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" />
        <p>Loading...</p>
      </div>
    );
  }

  // Allow access if authenticated
  if (isAuthenticated) {
    return children;
  }

  // Not authenticated - redirect to landing page
  return <Navigate to="/" replace />;
}

/**
 * PublicRoute Component
 *
 * A route wrapper for pages accessible without authentication.
 * Shows loading spinner during auth check, then renders children.
 * If user is authenticated and on an auth page (login/register), redirects to recipes.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {boolean} props.redirectIfAuthenticated - Whether to redirect auth users (default: true for auth pages)
 * @returns {JSX.Element} Children, redirect, or loading spinner
 *
 * @example
 * // Login page - redirects authenticated users
 * <Route
 *   path="/login"
 *   element={
 *     <PublicRoute>
 *       <LoginPage />
 *     </PublicRoute>
 *   }
 * />
 */
export function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" />
        <p>Loading...</p>
      </div>
    );
  }

  // Auth pages that should redirect authenticated users
  const authPages = ['/login', '/register', '/forgot-password'];
  const isAuthPage = authPages.includes(location.pathname);

  // Check if setup wizard is in progress (set by RegisterPage before registration)
  const inSetupFlow = sessionStorage.getItem('smartcookbook_in_setup') === 'true';

  // If authenticated and on an auth page, redirect to recipes
  // BUT NOT if we're in the middle of setup wizard flow
  if (isAuthenticated && isAuthPage && !inSetupFlow) {
    return <Navigate to="/recipes" replace />;
  }

  // Show public content
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
