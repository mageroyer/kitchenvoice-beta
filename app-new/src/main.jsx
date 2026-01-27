import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { OfflineIndicator } from './components/common/OfflineIndicator.jsx';

// Dev tools for browser console (window.clearInventory(), etc.)
import './utils/devTools';

// PWA: Register service worker update prompt
import { registerSW } from 'virtual:pwa-register';

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // New content available, prompt user to refresh
    if (confirm('New version available! Reload to update?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    // App is ready to work offline
  },
  onRegistered(registration) {
    // Service worker registered successfully
  },
  onRegisterError(error) {
    console.error('❌ Service Worker registration error:', error);
  }
});

// Render React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OfflineIndicator />
    <App />
  </React.StrictMode>
);
