/**
 * CreditsDisplay Component
 *
 * Shows user's API credits balance and usage.
 * Updates automatically when credits change.
 */

import { useState, useEffect } from 'react';
import { getCreditSummary, MONTHLY_CREDITS, CREDIT_COSTS, OPERATION_LABELS } from '../../services/credits/creditService';
import { auth } from '../../services/database/firebase';
import styles from '../../styles/components/creditsdisplay.module.css';

function CreditsDisplay() {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCredits();
  }, []);

  const loadCredits = async () => {
    const user = auth?.currentUser;
    if (!user) {
      setError('Please log in to view credits');
      setLoading(false);
      return;
    }

    try {
      const summary = await getCreditSummary(user.uid);
      if (summary.error) {
        setError(summary.error);
      } else {
        setCredits(summary);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.creditsCard}>
        <div className={styles.loading}>Loading credits...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.creditsCard}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  // Owner accounts have unlimited credits
  const isOwner = credits?.isOwner;
  const percentRemaining = isOwner ? 100 : (credits ? Math.round((credits.available / credits.total) * 100) : 0);
  const isLow = !isOwner && percentRemaining < 20;

  return (
    <div className={styles.creditsCard}>
      <h3 className={styles.title}>API Credits</h3>

      {/* Owner Badge */}
      {isOwner && (
        <div className={styles.ownerBadge}>
          Owner Account - Unlimited Credits
        </div>
      )}

      {/* Credits Bar */}
      {!isOwner && (
        <div className={styles.creditsBar}>
          <div className={styles.barContainer}>
            <div
              className={`${styles.barFill} ${isLow ? styles.low : ''}`}
              style={{ width: `${percentRemaining}%` }}
            />
          </div>
          <div className={styles.creditsText}>
            <span className={styles.available}>{credits?.available || 0}</span>
            <span className={styles.separator}>/</span>
            <span className={styles.total}>{credits?.total || MONTHLY_CREDITS}</span>
            <span className={styles.label}>credits</span>
          </div>
        </div>
      )}

      {/* Usage Info */}
      {!isOwner && (
        <div className={styles.usageInfo}>
          <div className={styles.usageItem}>
            <span className={styles.usageLabel}>Used this month:</span>
            <span className={styles.usageValue}>{credits?.used || 0}</span>
          </div>
          <div className={styles.usageItem}>
            <span className={styles.usageLabel}>Resets in:</span>
            <span className={styles.usageValue}>{credits?.daysUntilReset || 0} days</span>
          </div>
        </div>
      )}

      {/* Credit Costs Reference */}
      <div className={styles.costsSection}>
        <h4 className={styles.costsTitle}>Credit Costs {isOwner && '(for regular users)'}</h4>
        <ul className={styles.costsList}>
          {Object.entries(CREDIT_COSTS).map(([key, cost]) => (
            <li key={key} className={styles.costItem}>
              <span className={styles.costLabel}>{OPERATION_LABELS[key] || key}</span>
              <span className={styles.costValue}>{cost} credit{cost > 1 ? 's' : ''}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Low Credits Warning */}
      {isLow && (
        <div className={styles.warning}>
          Running low on credits! Credits reset at the start of each month.
        </div>
      )}

      {/* Refresh Button */}
      <button className={styles.refreshBtn} onClick={loadCredits}>
        Refresh
      </button>
    </div>
  );
}

export default CreditsDisplay;
