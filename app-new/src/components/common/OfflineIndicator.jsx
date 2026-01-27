/**
 * OfflineIndicator Component
 *
 * Displays a banner when the app is offline or just came back online.
 * Non-intrusive, appears at the top of the screen.
 */
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import styles from '../../styles/components/offlineindicator.module.css';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();

  // Don't show anything if online and wasn't recently offline
  if (isOnline && !wasOffline) {
    return null;
  }

  return (
    <div className={`${styles.indicator} ${isOnline ? styles.online : styles.offline}`}>
      <div className={styles.content}>
        {isOnline ? (
          <>
            <span className={styles.icon}>✓</span>
            <span>Back online - syncing data...</span>
          </>
        ) : (
          <>
            <span className={styles.icon}>⚠</span>
            <span>You're offline - changes will sync when connected</span>
          </>
        )}
      </div>
    </div>
  );
}

export default OfflineIndicator;
