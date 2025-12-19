/**
 * ValidationSummary Component
 *
 * Shows a compact summary of ingredient validation status.
 * Non-blocking - just informational badges that don't prevent any action.
 */

import { useMemo } from 'react';
import Badge from '../../common/Badge';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {Array} props.ingredients - Array of ingredient objects
 * @param {Object} props.linkedInventoryItems - Map of id -> linked inventory item
 * @param {Function} props.onShowIssues - Called when user clicks to see details
 */
function ValidationSummary({ ingredients = [], linkedInventoryItems = {}, onShowIssues }) {
  const summary = useMemo(() => {
    // Count non-section ingredients
    const regularIngredients = ingredients.filter(ing => !ing.isSection);
    const total = regularIngredients.length;

    if (total === 0) {
      return { total: 0, linked: 0, withIssues: 0, ready: 0, status: 'empty' };
    }

    let linked = 0;
    let withIssues = 0;

    regularIngredients.forEach(ing => {
      if (ing.linkedIngredientId) {
        linked++;
        // Check for issues
        const linkedItem = linkedInventoryItems[ing.linkedIngredientId];
        if (!linkedItem) {
          // Linked but item not found
          withIssues++;
        } else {
          // Check unit compatibility
          const ingUnit = ing.metricUnit || '';
          const invUnit = linkedItem.unit || '';
          if (ingUnit && invUnit) {
            // Both have units - check if they're compatible types
            const ingType = getUnitType(ingUnit);
            const invType = getUnitType(invUnit);
            if (ingType !== invType) {
              withIssues++;
            }
          }
        }
      }
    });

    const ready = linked - withIssues;
    const status = withIssues > 0 ? 'warning' : (linked === total ? 'complete' : 'partial');

    return { total, linked, withIssues, ready, status };
  }, [ingredients, linkedInventoryItems]);

  // Don't show anything if no ingredients
  if (summary.total === 0) {
    return null;
  }

  // Calculate unlinked count
  const unlinked = summary.total - summary.linked;

  return (
    <div className={styles.validationSummary}>
      {/* Link status */}
      <Badge
        variant={summary.linked === summary.total ? 'success' : 'default'}
        size="small"
        title={`${summary.linked} of ${summary.total} ingredients linked to inventory`}
      >
        🔗 {summary.linked}/{summary.total}
      </Badge>

      {/* Warning badge if there are issues */}
      {summary.withIssues > 0 && (
        <button
          className={styles.issuesBadge}
          onClick={onShowIssues}
          title={`${summary.withIssues} ingredient(s) have validation issues - click to review`}
        >
          <Badge variant="warning" size="small">
            ⚠️ {summary.withIssues} issue{summary.withIssues !== 1 ? 's' : ''}
          </Badge>
        </button>
      )}

      {/* Unlinked notice if many unlinked */}
      {unlinked > 0 && summary.withIssues === 0 && (
        <span className={styles.unlinkedNotice} title="These ingredients won't be deducted from inventory">
          {unlinked} unlinked
        </span>
      )}
    </div>
  );
}

// Helper to determine unit type (mass vs volume)
function getUnitType(unit) {
  const normalized = unit.toLowerCase().trim();
  if (['g', 'kg', 'oz', 'lb', 'lbs'].includes(normalized)) return 'mass';
  if (['ml', 'l', 'fl oz', 'cup', 'cups', 'tbsp', 'tsp'].includes(normalized)) return 'volume';
  return 'other';
}

export default ValidationSummary;
