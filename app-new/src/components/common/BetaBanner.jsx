/**
 * BetaBanner Component
 *
 * Displays a persistent banner indicating the app is in beta/development
 */

import { useEffect } from 'react';
import styles from '../../styles/components/betabanner.module.css';

function BetaBanner() {
  // Add class to body to push content down
  useEffect(() => {
    document.body.classList.add('has-beta-banner');
    return () => {
      document.body.classList.remove('has-beta-banner');
    };
  }, []);

  return (
    <div className={styles.banner}>
      <span className={styles.icon}>🚧</span>
      <span className={styles.text}>
        <strong>Version Bêta</strong> — Gratuit pendant la période de test. Les fonctionnalités et données peuvent changer.
      </span>
    </div>
  );
}

export default BetaBanner;
