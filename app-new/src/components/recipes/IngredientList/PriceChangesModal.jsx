/**
 * PriceChangesModal Component
 *
 * Shows detailed price variation for all recipe ingredients.
 * Displays before/after prices and percentage changes.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close handler
 * @param {Array} props.ingredients - Recipe ingredients
 * @param {Object} props.linkedInventoryItems - Map of linkedIngredientId → inventoryItem
 * @param {number} props.scalingFactor - Current scaling factor
 */

import { useMemo } from 'react';
import Button from '../../common/Button';
import styles from '../../../styles/components/ingredientlist.module.css';

// Parse metric to grams
const METRIC_TO_GRAMS = { g: 1, kg: 1000, ml: 1, l: 1000, cl: 10 };

function parseMetricToGrams(metric) {
  if (!metric || typeof metric !== 'string') return null;
  const match = metric.trim().match(/^([\d.,]+)\s*(g|kg|ml|l|cl)?$/i);
  if (!match) return null;
  const quantity = parseFloat(match[1].replace(',', '.'));
  if (isNaN(quantity) || quantity < 0) return null;
  const unit = (match[2] || 'g').toLowerCase();
  return quantity * (METRIC_TO_GRAMS[unit] || 1);
}

function PriceChangesModal({
  isOpen,
  onClose,
  ingredients = [],
  linkedInventoryItems = {},
  scalingFactor = 1,
}) {
  // Calculate price changes for all ingredients
  const priceChanges = useMemo(() => {
    const changes = [];
    let totalCurrentCost = 0;
    let totalPreviousCost = 0;
    let hasAnyChange = false;

    ingredients.forEach((ing) => {
      if (ing.isSection) return;

      const item = linkedInventoryItems[ing.linkedIngredientId];
      if (!item) return;

      // Determine pricing type and get current/previous prices
      let currentPrice = 0;
      let previousPrice = null;
      let quantity = 0;
      let priceType = '';

      if (item.pricePerG > 0) {
        // Weight-based pricing (pricePerG)
        currentPrice = item.pricePerG;
        previousPrice = item.previousPricePerG > 0 ? item.previousPricePerG : null;
        quantity = parseMetricToGrams(ing.metric);
        priceType = 'g';
      } else if (item.pricePerML > 0) {
        // Volume-based pricing (pricePerML)
        currentPrice = item.pricePerML;
        previousPrice = item.previousPricePerML > 0 ? item.previousPricePerML : null;
        quantity = parseMetricToGrams(ing.metric); // ml uses same parsing (g=ml, kg=l)
        priceType = 'ml';
      } else if (item.pricePerUnit > 0) {
        // Unit-based pricing (pricePerUnit) - for packaging/count items
        currentPrice = item.pricePerUnit;
        previousPrice = item.previousPricePerUnit > 0 ? item.previousPricePerUnit : null;
        // For unit-based, parse quantity from metric (e.g., "5" or "5 pcs")
        const qtyMatch = (ing.metric || '').match(/^([\d.,]+)/);
        quantity = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : null;
        priceType = 'unit';
      }

      if (!quantity || quantity <= 0 || currentPrice <= 0) return;

      const currentCost = quantity * currentPrice * scalingFactor;
      const previousCost = previousPrice ? quantity * previousPrice * scalingFactor : null;

      totalCurrentCost += currentCost;
      if (previousCost !== null) {
        totalPreviousCost += previousCost;
      } else {
        totalPreviousCost += currentCost; // No change for this item
      }

      const hasChange = previousPrice !== null && previousPrice !== currentPrice;
      if (hasChange) hasAnyChange = true;

      const percentChange = hasChange
        ? ((currentPrice - previousPrice) / previousPrice) * 100
        : null;

      changes.push({
        name: ing.linkedName || ing.name,
        metric: ing.metric,
        currentCost,
        previousCost,
        hasChange,
        percentChange,
        direction: hasChange ? (currentPrice > previousPrice ? 'up' : 'down') : null,
        priceType,
      });
    });

    // Calculate total change
    const totalPercentChange = totalPreviousCost > 0
      ? ((totalCurrentCost - totalPreviousCost) / totalPreviousCost) * 100
      : null;

    return {
      items: changes,
      totalCurrentCost,
      totalPreviousCost,
      totalPercentChange,
      hasAnyChange,
      totalDirection: totalCurrentCost > totalPreviousCost ? 'up' : totalCurrentCost < totalPreviousCost ? 'down' : null,
    };
  }, [ingredients, linkedInventoryItems, scalingFactor]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.priceChangesModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.priceChangesHeader}>
          <h3>Variations de prix</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.priceChangesContent}>
          {priceChanges.items.length === 0 ? (
            <p className={styles.noChanges}>Aucun ingrédient avec prix disponible</p>
          ) : (
            <table className={styles.priceChangesTable}>
              <thead>
                <tr>
                  <th>Ingrédient</th>
                  <th>Avant</th>
                  <th>Maintenant</th>
                  <th>Variation</th>
                </tr>
              </thead>
              <tbody>
                {priceChanges.items.map((item, index) => (
                  <tr key={index} className={item.hasChange ? styles.hasChange : ''}>
                    <td className={styles.ingredientName}>
                      <span>{item.name}</span>
                      <span className={styles.ingredientMetric}>{item.metric}</span>
                    </td>
                    <td className={styles.priceCell}>
                      {item.previousCost !== null ? `$${item.previousCost.toFixed(2)}` : '—'}
                    </td>
                    <td className={styles.priceCell}>
                      ${item.currentCost.toFixed(2)}
                    </td>
                    <td className={styles.changeCell}>
                      {item.hasChange ? (
                        <span className={item.direction === 'up' ? styles.changeUp : styles.changeDown}>
                          {item.direction === 'up' ? '▲' : '▼'} {Math.abs(item.percentChange).toFixed(1)}%
                        </span>
                      ) : (
                        <span className={styles.noChange}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td><strong>Total</strong></td>
                  <td className={styles.priceCell}>
                    <strong>${priceChanges.totalPreviousCost.toFixed(2)}</strong>
                  </td>
                  <td className={styles.priceCell}>
                    <strong>${priceChanges.totalCurrentCost.toFixed(2)}</strong>
                  </td>
                  <td className={styles.changeCell}>
                    {priceChanges.totalPercentChange !== null && priceChanges.totalDirection ? (
                      <strong className={priceChanges.totalDirection === 'up' ? styles.changeUp : styles.changeDown}>
                        {priceChanges.totalDirection === 'up' ? '▲' : '▼'} {Math.abs(priceChanges.totalPercentChange).toFixed(1)}%
                      </strong>
                    ) : (
                      <span className={styles.noChange}>—</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className={styles.priceChangesFooter}>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PriceChangesModal;
