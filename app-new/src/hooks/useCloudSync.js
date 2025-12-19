import { useState, useEffect } from 'react';
import {
  initialSync,
  startRealtimeSync,
  stopRealtimeSync,
  onSyncStatusChange,
  resetSyncState
} from '../services/database/cloudSync';

/**
 * Custom hook to manage cloud sync lifecycle
 * Handles initialization, real-time sync, and cleanup
 *
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} authLoading - Whether auth is still loading
 * @returns {{ syncStatus: string }} Current sync status
 */
export function useCloudSync(isAuthenticated, authLoading) {
  const [syncStatus, setSyncStatus] = useState('idle');

  // Cleanup listeners on browser/tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopRealtimeSync();
      resetSyncState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Initialize cloud sync only when authenticated
  useEffect(() => {
    // Don't sync if not authenticated or still loading
    if (!isAuthenticated || authLoading) {
      return;
    }

    console.log('Initializing cloud sync...');

    // Subscribe to sync status changes
    const unsubscribeStatus = onSyncStatusChange((status) => {
      setSyncStatus(status);
    });

    // Run initial sync then start real-time listeners
    const initSync = async () => {
      try {
        await initialSync();
        // Dispatch event so pages know to reload data
        window.dispatchEvent(new CustomEvent('dataSync', { detail: { type: 'initialSync' } }));
        // Start real-time listeners after initial sync
        startRealtimeSync((dataType) => {
          console.log(`Data changed: ${dataType}`);
          // Force reload by updating a trigger state or dispatch event
          window.dispatchEvent(new CustomEvent('dataSync', { detail: { type: dataType } }));
        });
      } catch (error) {
        console.error('Initial sync failed:', error);
      }
    };
    initSync();

    // Cleanup on unmount or when user logs out
    return () => {
      stopRealtimeSync();
      resetSyncState(); // Clear pending timeouts and reset sync flags
      unsubscribeStatus();
    };
  }, [isAuthenticated, authLoading]);

  return { syncStatus };
}

export default useCloudSync;
