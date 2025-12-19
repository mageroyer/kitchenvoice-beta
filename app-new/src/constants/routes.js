// Application route paths
export const ROUTES = {
  HOME: '/',
  RECIPES: '/recipes',
  RECIPE_NEW: '/recipes/new',
  RECIPE_EDIT: '/recipes/:id/edit',
  RECIPE_VIEW: '/recipes/:id',

  // Accounting & Invoice routes
  ACCOUNTING: '/accounting',
  INVOICES: '/invoices',
  INVOICE_UPLOAD: '/invoices/upload',
  INVOICE_REVIEW: '/invoices/:id/review',
  INVOICE_VIEW: '/invoices/:id',

  // Inventory management (via Control Panel)
  INGREDIENTS: '/ingredients',  // Redirects to inventory
  VENDORS: '/vendors',          // Future: standalone vendors page

  // Client management (accountant features)
  CLIENTS: '/clients',
  CLIENT_NEW: '/clients/new',
  CLIENT_EDIT: '/clients/:id/edit',
  CLIENT_DASHBOARD: '/clients/:id/dashboard',

  // Authentication
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  PROFILE: '/profile',

  // Settings
  SETTINGS: '/settings',

  // Admin
  CONTROL_PANEL: '/control-panel',
  SLIDER_CONFIG: '/admin/sliders',

  // Tasks
  TASKS: '/tasks',
  DEPARTMENT_TASKS: '/team-tasks',

  // Dashboard
  HEARTBEAT: '/heartbeat',
};

// Helper function to build route with params
export const buildRoute = (route, params = {}) => {
  let path = route;
  Object.keys(params).forEach(key => {
    path = path.replace(`:${key}`, params[key]);
  });
  return path;
};

// Example usage:
// buildRoute(ROUTES.RECIPE_EDIT, { id: 123 }) => '/recipes/123/edit'
