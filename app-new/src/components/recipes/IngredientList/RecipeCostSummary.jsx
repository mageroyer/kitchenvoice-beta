/**
 * RecipeCostSummary Component
 *
 * Displays total recipe cost with price variation indicator.
 * Shows at the bottom of ingredient list, before add ingredient form.
 * Includes button to open detailed price changes modal.
 * Automatically calculates price variation from previousPricePerG in inventory items.
 * Also includes packaging costs from plating instructions.
 *
 * @param {Object} props
 * @param {Array} props.ingredients - Array of ingredient objects
 * @param {Object} props.linkedInventoryItems - Map of linkedIngredientId → inventoryItem
 * @param {number} props.scalingFactor - Current scaling factor (default 1)
 * @param {Array} props.packages - Array of package objects from plating instructions (optional)
 * @param {Object} props.linkedPackageItems - Map of linkedPackageId → inventoryItem (optional)
 */

import { useMemo, useState, useEffect } from 'react';
import PriceChangesModal from './PriceChangesModal';
import styles from '../../../styles/components/ingredientlist.module.css';

// Parse metric to grams (same logic as priceCalculator)
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

/**
 * Calculate packaging cost from package item
 *
 * Package qty equals basePortion (1 package per portion).
 * Total = basePortion × scalingFactor × pricePerUnit
 */
function calculatePackageCost(pkg, linkedItem, basePortion, scalingFactor) {
  if (!pkg || !linkedItem) return 0;
  const pricePerUnit = linkedItem.pricePerUnit || linkedItem.unitPrice || 0;
  if (pricePerUnit <= 0) return 0;
  // Qty = basePortion (1 package per portion)
  const totalQty = basePortion * scalingFactor;
  return totalQty * pricePerUnit;
}

function RecipeCostSummary({
  ingredients = [],
  linkedInventoryItems = {},
  basePortion = 1,
  scalingFactor = 1,
  packages = [],
  linkedPackageItems = {},
  methodPackagingCost = 0, // Packaging cost from MethodSteps
  onCostChange = null,
}) {
  // Modal state
  const [showModal, setShowModal] = useState(false);

  // Calculate total cost and price variation from all linked ingredients
  const costData = useMemo(() => {
    let totalCost = 0;
    let totalPreviousCost = 0;
    let linkedCount = 0;
    let pricedCount = 0;
    let missingPriceCount = 0;
    let hasAnyPriceChange = false;

    ingredients.forEach((ing) => {
      if (ing.isSection) return; // Skip section tags

      if (ing.linkedIngredientId) {
        linkedCount++;
        const item = linkedInventoryItems[ing.linkedIngredientId];

        if (item) {
          // Determine pricing type and get current/previous prices
          let currentPrice = 0;
          let previousPrice = null;
          let quantity = 0;

          if (item.pricePerG > 0) {
            // Weight-based pricing (pricePerG)
            currentPrice = item.pricePerG;
            previousPrice = item.previousPricePerG;
            quantity = parseMetricToGrams(ing.metric);
          } else if (item.pricePerML > 0) {
            // Volume-based pricing (pricePerML)
            currentPrice = item.pricePerML;
            previousPrice = item.previousPricePerML;
            quantity = parseMetricToGrams(ing.metric); // ml uses same parsing (g=ml, kg=l)
          } else if (item.pricePerUnit > 0) {
            // Unit-based pricing (pricePerUnit) - for packaging/count items
            currentPrice = item.pricePerUnit;
            previousPrice = item.previousPricePerUnit;
            // For unit-based, parse quantity from metric (e.g., "5" or "5 pcs")
            const qtyMatch = (ing.metric || '').match(/^([\d.,]+)/);
            quantity = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : null;
          }

          if (currentPrice > 0 && quantity !== null && quantity > 0) {
            const currentIngCost = quantity * currentPrice * scalingFactor;
            totalCost += currentIngCost;
            pricedCount++;

            // Calculate previous cost for variation
            // Only count as price change if previous price is valid and different
            if (previousPrice != null && previousPrice > 0 && previousPrice !== currentPrice) {
              hasAnyPriceChange = true;
              totalPreviousCost += quantity * previousPrice * scalingFactor;
            } else {
              // No change for this item - use current price
              totalPreviousCost += currentIngCost;
            }
          } else {
            missingPriceCount++; // Has item but no valid price or quantity
          }
        } else {
          missingPriceCount++; // Linked but item not loaded
        }
      }
    });

    const ingredientCount = ingredients.filter((i) => !i.isSection).length;
    const unlinkedCount = ingredientCount - linkedCount;

    // Calculate packaging costs
    let packagingCost = 0;
    let packagingCount = 0;
    let packagingPricedCount = 0;

    packages.forEach((pkg) => {
      if (!pkg?.isPackage) return;
      packagingCount++;

      if (pkg.linkedPackageId) {
        const linkedItem = linkedPackageItems[pkg.linkedPackageId];
        const cost = calculatePackageCost(pkg, linkedItem, basePortion, scalingFactor);
        if (cost > 0) {
          packagingCost += cost;
          packagingPricedCount++;
        }
      }
    });

    // Add packaging to total (plating packages + method step packaging)
    totalCost += packagingCost + methodPackagingCost;

    // Calculate total variation percentage
    let totalVariation = null;
    if (hasAnyPriceChange && totalPreviousCost > 0) {
      const diff = totalCost - totalPreviousCost - packagingCost; // Exclude packaging from variation calc
      const percentChange = (diff / totalPreviousCost) * 100;
      totalVariation = {
        diff,
        percentChange,
        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
      };
    }

    // Combined counts for coverage
    const totalItems = ingredientCount + packagingCount;
    const totalPriced = pricedCount + packagingPricedCount;

    // Combined packaging cost (plating + method steps)
    const totalPackagingCost = packagingCost + methodPackagingCost;

    return {
      totalCost,
      totalPreviousCost,
      totalVariation,
      linkedCount,
      pricedCount,
      missingPriceCount,
      unlinkedCount,
      ingredientCount,
      packagingCost: totalPackagingCost, // Combined packaging
      platingPackagingCost: packagingCost,
      methodPackagingCost,
      packagingCount,
      packagingPricedCount,
      isComplete: totalPriced === totalItems && totalItems > 0,
      coverage: totalItems > 0 ? (totalPriced / totalItems) * 100 : 0,
    };
  }, [ingredients, linkedInventoryItems, basePortion, scalingFactor, packages, linkedPackageItems, methodPackagingCost]);

  // Report cost changes to parent
  useEffect(() => {
    if (onCostChange) {
      onCostChange(costData.totalCost);
    }
  }, [costData.totalCost, onCostChange]);

  // Don't show if no ingredients and no packages
  if (costData.ingredientCount === 0 && costData.packagingCount === 0) {
    return null;
  }

  // Build coverage tooltip
  const coverageTooltip = costData.packagingCount > 0
    ? `${costData.pricedCount}/${costData.ingredientCount} ingrédients + ${costData.packagingPricedCount}/${costData.packagingCount} emballages avec prix`
    : `${costData.pricedCount}/${costData.ingredientCount} ingrédients avec prix`;

  return (
    <>
      <div className={styles.recipeCostSummary}>
        {/* Left side: Label */}
        <div className={styles.costLabel}>
          <span className={styles.costIcon}>💰</span>
          <span className={styles.costText}>Coût total recette</span>
          {costData.packagingCost > 0 && (
            <span className={styles.packagingIndicator} title={`Emballages: $${costData.packagingCost.toFixed(2)}`}>
              📦
            </span>
          )}
          {costData.coverage < 100 && (
            <span className={styles.costCoverage} title={coverageTooltip}>
              ({Math.round(costData.coverage)}%)
            </span>
          )}
        </div>

        {/* Right side: Price + Variation + Details button */}
        <div className={styles.costValue}>
          {/* Total Cost */}
          <span className={styles.costAmount}>
            ${costData.totalCost.toFixed(2)}
          </span>

          {/* Total Variation Indicator */}
          {costData.totalVariation && (
            <span
              className={`${styles.totalVariation} ${
                costData.totalVariation.direction === 'up' ? styles.variationUp : styles.variationDown
              }`}
              title={`Avant: $${costData.totalPreviousCost.toFixed(2)}`}
            >
              {costData.totalVariation.direction === 'up' ? '▲' : '▼'}
              {Math.abs(costData.totalVariation.percentChange).toFixed(1)}%
            </span>
          )}

          {/* Scaling indicator */}
          {scalingFactor !== 1 && (
            <span className={styles.scaledIndicator} title={`Mis à l'échelle ×${scalingFactor}`}>
              ×{scalingFactor}
            </span>
          )}

          {/* Details button */}
          <button
            className={styles.costDetailsButton}
            onClick={() => setShowModal(true)}
            title="Voir les détails des prix"
          >
            📊
          </button>
        </div>
      </div>

      {/* Price Changes Modal */}
      <PriceChangesModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        ingredients={ingredients}
        linkedInventoryItems={linkedInventoryItems}
        scalingFactor={scalingFactor}
      />
    </>
  );
}

export default RecipeCostSummary;
