import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './constants/routes';
import ProtectedRoute, { PublicRoute } from './components/auth/ProtectedRoute';
import Spinner from './components/common/Spinner';

// Core pages - loaded eagerly for fast initial navigation
import RecipeListPage from './pages/RecipeListPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';

// Lazy-loaded pages - loaded on-demand to reduce initial bundle
const RecipeEditorPage = lazy(() => import('./pages/RecipeEditorPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ControlPanelPage = lazy(() => import('./pages/ControlPanelPage'));
const DepartmentTasksPage = lazy(() => import('./pages/DepartmentTasksPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));

// PDF-heavy pages - these import pdfjs-dist (~37MB node_modules)
const PDFImportPage = lazy(() => import('./pages/PDFImportPage'));
const InvoiceUploadPage = lazy(() => import('./pages/InvoiceUploadPage'));

// Accounting pages
const AccountingDashboardPage = lazy(() => import('./pages/AccountingDashboardPage'));
const InvoiceListPage = lazy(() => import('./pages/InvoiceListPage'));

// Heartbeat Dashboard - organism health visualization
const HeartbeatDashboardPage = lazy(() => import('./pages/HeartbeatDashboardPage'));

// Less frequently used pages
const ImageImportPage = lazy(() => import('./pages/ImageImportPage'));
const SliderConfigPage = lazy(() => import('./pages/SliderConfigPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));

// DEV ONLY: Debug/test pages - not loaded in production
const UtilitiesPage = import.meta.env.DEV ? lazy(() => import('./pages/UtilitiesPage')) : null;
const DatabaseTestPage = import.meta.env.DEV ? lazy(() => import('./pages/DatabaseTestPage')) : null;
const FontPreviewPage = import.meta.env.DEV ? lazy(() => import('./pages/FontPreviewPage')) : null;

// Loading fallback component
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '50vh',
    flexDirection: 'column',
    gap: '16px'
  }}>
    <Spinner size="large" />
    <p style={{ color: '#666' }}>Loading...</p>
  </div>
);

/**
 * App route definitions component
 * Handles all routing with lazy loading and access control
 *
 * @param {Object} props
 * @param {boolean} props.micFlag - Microphone toggle state
 * @param {boolean} props.isUnlocked - Whether user has edit privileges
 * @param {string} props.currentDepartment - Current department
 * @param {boolean} props.isOwner - Whether user is owner
 * @param {Object} props.currentPrivilege - Current privilege object
 * @param {React.ComponentType} props.HomePage - Component showcase page component
 */
function AppRoutes({
  micFlag,
  isUnlocked,
  currentDepartment,
  isOwner,
  currentPrivilege,
  HomePage
}) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Landing Page - always accessible, entry point for app */}
        <Route path="/" element={
          <PublicRoute><LandingPage /></PublicRoute>
        } />

        {/* Auth Routes */}
        <Route path={ROUTES.LOGIN} element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />
        <Route path={ROUTES.REGISTER} element={
          <PublicRoute><RegisterPage /></PublicRoute>
        } />
        <Route path={ROUTES.FORGOT_PASSWORD} element={
          <PublicRoute><ForgotPasswordPage /></PublicRoute>
        } />

        {/* Protected Routes - require demo mode or authentication */}
        <Route path={ROUTES.RECIPES} element={
          <ProtectedRoute><RecipeListPage micFlag={micFlag} isUnlocked={isUnlocked} currentDepartment={currentDepartment} /></ProtectedRoute>
        } />
        <Route path={ROUTES.RECIPE_NEW} element={
          <ProtectedRoute><RecipeEditorPage micFlag={micFlag} isUnlocked={isUnlocked} isOwner={isOwner} /></ProtectedRoute>
        } />
        <Route path={ROUTES.RECIPE_EDIT} element={
          <ProtectedRoute><RecipeEditorPage micFlag={micFlag} isUnlocked={isUnlocked} isOwner={isOwner} /></ProtectedRoute>
        } />
        <Route path="/recipes/import-pdf" element={
          <ProtectedRoute><PDFImportPage /></ProtectedRoute>
        } />
        <Route path="/recipes/import-image" element={
          <ProtectedRoute><ImageImportPage /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><SettingsPage /></ProtectedRoute>
        } />
        {/* DEV ONLY: Font preview page */}
        {import.meta.env.DEV && FontPreviewPage && (
          <Route path="/font-preview" element={
            <ProtectedRoute><FontPreviewPage /></ProtectedRoute>
          } />
        )}
        <Route path={ROUTES.CONTROL_PANEL} element={
          <ProtectedRoute>
            {isOwner ? <ControlPanelPage /> : <Navigate to={ROUTES.RECIPES} replace />}
          </ProtectedRoute>
        } />
        <Route path={ROUTES.SLIDER_CONFIG} element={
          <ProtectedRoute>
            {isOwner ? <SliderConfigPage /> : <Navigate to={ROUTES.RECIPES} replace />}
          </ProtectedRoute>
        } />
        <Route path={ROUTES.TASKS} element={
          <ProtectedRoute><TasksPage currentPrivilege={currentPrivilege} /></ProtectedRoute>
        } />
        <Route path={ROUTES.DEPARTMENT_TASKS} element={
          <ProtectedRoute>
            <DepartmentTasksPage
              currentDepartment={currentDepartment}
              currentPrivilege={currentPrivilege}
              isOwner={isOwner}
            />
          </ProtectedRoute>
        } />
        {/* DEV ONLY: Utilities page */}
        {import.meta.env.DEV && UtilitiesPage && (
          <Route path="/utilities" element={
            <ProtectedRoute><UtilitiesPage /></ProtectedRoute>
          } />
        )}
        <Route path="/components" element={
          <ProtectedRoute><HomePage micFlag={micFlag} /></ProtectedRoute>
        } />
        {/* DEV ONLY: Database test page */}
        {import.meta.env.DEV && DatabaseTestPage && (
          <Route path="/database-test" element={
            <ProtectedRoute><DatabaseTestPage /></ProtectedRoute>
          } />
        )}
        <Route path={ROUTES.ACCOUNTING} element={
          <ProtectedRoute><AccountingDashboardPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.HEARTBEAT} element={
          <ProtectedRoute><HeartbeatDashboardPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.INVOICES} element={
          <ProtectedRoute><InvoiceListPage /></ProtectedRoute>
        } />
        <Route path="/invoices/list" element={
          <ProtectedRoute><InvoiceListPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.INVOICE_UPLOAD} element={
          <ProtectedRoute><InvoiceUploadPage /></ProtectedRoute>
        } />
        {/* Ingredients route removed - redirects to inventory */}
        <Route path={ROUTES.INGREDIENTS} element={
          <Navigate to="/control-panel?tab=inventory" replace />
        } />

        {/* Fallback for undefined routes */}
        <Route path="*" element={
          <ProtectedRoute><RecipeListPage micFlag={micFlag} /></ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
