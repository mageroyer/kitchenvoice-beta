import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Dev tools for browser console (window.clearInventory(), etc.)
import './utils/devTools';

// Initialize app
console.log('✅ SmartCookBook - Modular Architecture Starting...');

// Render React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('✅ React app rendered successfully!');
console.log('🎉 Hot Module Replacement (HMR) is active - edit files to see instant updates');
