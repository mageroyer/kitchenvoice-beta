/**
 * OrganismView Component
 *
 * Layout component that arranges the four organs in the organism pattern
 * with visual flow connections between them
 *
 * Layout:
 * ┌─────────────────┬─────────────────┐
 * │     INVOICE     │     RECIPE      │
 * │   (The Blood)   │    (The DNA)    │
 * └────────┬────────┴────────┬────────┘
 *          │                 │
 *          ▼                 ▼
 * ┌────────────────────────────────────┐
 * │            INVENTORY               │
 * │           (The Cells)              │
 * └────────────────┬───────────────────┘
 *                  │
 *                  ▼
 * ┌────────────────────────────────────┐
 * │              TASK                  │
 * │           (The Muscle)             │
 * └────────────────────────────────────┘
 *
 * @module components/heartbeat/OrganismView
 */

import React from 'react';
import OrganCard from './OrganCard';
import styles from '../../styles/pages/heartbeatdashboard.module.css';

/**
 * Flow Legend - shows what data flows between organs
 * @param {Object} props
 * @param {Array} props.flows - Flow data from dashboard
 */
function FlowLegend({ flows = [] }) {
  return (
    <div className={styles.flowLegend}>
      {flows.map((flow, idx) => (
        <div key={idx} className={styles.flowItem}>
          <span className={`${styles.flowDot} ${flow.active ? styles.active : ''}`} />
          <span>{flow.from} → {flow.to}: {flow.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * OrganismView - Arranges organs in the organism layout
 *
 * @param {Object} props
 * @param {Object} props.organs - Organ data object with invoice, inventory, recipe, task
 * @param {Array} props.flows - Data flow connections
 * @param {Function} props.onOrganClick - Handler when organ card is clicked
 */
function OrganismView({ organs, flows, onOrganClick }) {
  if (!organs) {
    return (
      <div className={styles.errorState}>
        <span className={styles.errorIcon}>🔍</span>
        <p>No organ data available</p>
      </div>
    );
  }

  const { invoice, inventory, recipe, task } = organs;

  return (
    <div className={styles.organismContainer}>
      {/* 2x2 Grid for organs */}
      <div className={styles.organismGrid}>
        {/* Top Row: Invoice (Blood) and Recipe (DNA) */}
        <OrganCard
          organ={invoice}
          onClick={() => onOrganClick?.('invoice')}
        />
        <OrganCard
          organ={recipe}
          onClick={() => onOrganClick?.('recipe')}
        />

        {/* Bottom Row: Inventory (Cells) and Task (Muscle) */}
        <OrganCard
          organ={inventory}
          onClick={() => onOrganClick?.('inventory')}
        />
        <OrganCard
          organ={task}
          onClick={() => onOrganClick?.('task')}
        />
      </div>

      {/* Flow Legend */}
      {flows && flows.length > 0 && (
        <FlowLegend flows={flows} />
      )}
    </div>
  );
}

export default OrganismView;
