/**
 * Heartbeat Dashboard Page
 *
 * Visual representation of the SmartCookBook organism.
 * Shows the health and activity of all four organs:
 * - Invoice (Blood) - brings resources in
 * - Recipe (DNA) - transformation blueprints
 * - Inventory (Cells) - stores state
 * - Task (Muscle) - executes work
 *
 * @module pages/HeartbeatDashboardPage
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';
import OrganismView from '../components/heartbeat/OrganismView';
import dashboardData, { HEALTH_STATUS } from '../services/heartbeat/dashboardData';
import { ROUTES } from '../constants/routes';
import styles from '../styles/pages/heartbeatdashboard.module.css';

/**
 * Get CSS class for overall health status
 * @param {string} status - Health status
 * @returns {string} CSS class name
 */
function getHealthClass(status) {
  switch (status) {
    case HEALTH_STATUS.HEALTHY: return styles.healthy;
    case HEALTH_STATUS.ATTENTION: return styles.attention;
    case HEALTH_STATUS.CRITICAL: return styles.critical;
    default: return styles.attention;
  }
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time string
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * HeartbeatDashboardPage Component
 *
 * Main dashboard showing the organism's health at a glance
 */
function HeartbeatDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Fetch dashboard data from all organs
   */
  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const dashboardResult = await dashboardData.getDashboardData();
      setData(dashboardResult);
    } catch (err) {
      console.error('[Heartbeat] Error fetching dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

  /**
   * Handle organ card click - navigate to relevant page
   */
  const handleOrganClick = useCallback((organType) => {
    switch (organType) {
      case 'invoice':
        navigate(ROUTES.INVOICES);
        break;
      case 'inventory':
        navigate(`${ROUTES.CONTROL_PANEL}?tab=inventory`);
        break;
      case 'recipe':
        navigate(ROUTES.RECIPES);
        break;
      case 'task':
        navigate(ROUTES.TASKS);
        break;
      default:
        break;
    }
  }, [navigate]);

  /**
   * Handle manual refresh
   */
  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  // Loading state
  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loading}>
          <Spinner size="large" />
          <p>Loading organism health...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>⚠️</span>
          <p>{error}</p>
          <Button onClick={() => fetchData()}>Try Again</Button>
        </div>
      </div>
    );
  }

  const { organs, organism, flows, timestamp } = data || {};
  const overallHealth = organism?.health || { score: 0, status: HEALTH_STATUS.ATTENTION };
  const organismMessage = organism?.message || 'Checking organism health...';

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>
            <span className={styles.pulseIcon}>💓</span>
            Heartbeat Dashboard
          </h1>
          <p className={styles.subtitle}>
            Real-time health of your kitchen organism
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.lastUpdated}>
            Updated: {formatTimestamp(timestamp)}
          </span>
          <Button
            variant="secondary"
            size="small"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </header>

      {/* Organism Health Banner */}
      <div className={styles.organismHealth}>
        <div className={styles.healthScore}>
          <div
            className={`${styles.healthCircle} ${getHealthClass(overallHealth.status)}`}
            role="img"
            aria-label={`Overall health: ${overallHealth.score}%`}
          >
            {overallHealth.score}
          </div>
          <div className={styles.healthInfo}>
            <span className={styles.healthLabel}>Organism Health</span>
            <span className={styles.healthMessage}>{organismMessage}</span>
          </div>
        </div>
      </div>

      {/* Organism View (4 Organ Cards) */}
      <OrganismView
        organs={organs}
        flows={flows}
        onOrganClick={handleOrganClick}
      />
    </div>
  );
}

export default HeartbeatDashboardPage;
