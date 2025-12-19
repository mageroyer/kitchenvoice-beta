/**
 * useScaling Hook
 *
 * Provides scaling utilities for ingredient measurements.
 * Extracts scaling logic from the main component.
 */

import { useMemo, useCallback } from 'react';

/**
 * Format a scaled number nicely (remove unnecessary decimals)
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatScaledNumber(num) {
  if (num % 1 === 0) {
    return num.toString();
  }
  return num.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Hook for scaling ingredient measurements
 * @param {number} scalingFactor - Factor to scale by (1 = no scaling)
 * @returns {Object} { scaleMetric, scaleToolMeasure, isScaled }
 */
export function useScaling(scalingFactor = 1) {
  const isScaled = scalingFactor !== 1;

  /**
   * Scale a metric string (e.g., "500g" → "1000g" when factor=2)
   * @param {string} metricStr - Metric string like "500g" or "1.5kg"
   * @returns {string} Scaled metric string
   */
  const scaleMetric = useCallback((metricStr) => {
    if (!metricStr || scalingFactor === 1) return metricStr;

    // Extract number and unit from metric string
    const match = metricStr.match(/^([\d.,]+)\s*(.*)$/);
    if (!match) return metricStr;

    const num = parseFloat(match[1].replace(',', '.'));
    const unit = match[2];

    if (isNaN(num)) return metricStr;

    const scaled = num * scalingFactor;
    return `${formatScaledNumber(scaled)}${unit}`;
  }, [scalingFactor]);

  /**
   * Scale a tool measurement using toolQty or parsing toolMeasure
   * @param {Object} ingredient - Ingredient object with toolQty, toolUnit, toolMeasure
   * @returns {string} Scaled tool measurement string
   */
  const scaleToolMeasure = useCallback((ingredient) => {
    if (scalingFactor === 1) return ingredient.toolMeasure || '';

    // Use toolQty if available for accurate scaling
    if (ingredient.toolQty) {
      const num = parseFloat(ingredient.toolQty);
      if (!isNaN(num)) {
        const scaled = num * scalingFactor;
        return `${formatScaledNumber(scaled)} ${ingredient.toolUnit || ''}`.trim();
      }
    }

    // Fallback: parse toolMeasure string if toolQty not available
    if (!ingredient.toolMeasure) return '';

    const match = ingredient.toolMeasure.match(/^([\d.,]+)\s*(.*)$/);
    if (!match) return ingredient.toolMeasure;

    const num = parseFloat(match[1].replace(',', '.'));
    const unit = match[2];

    if (isNaN(num)) return ingredient.toolMeasure;

    const scaled = num * scalingFactor;
    return `${formatScaledNumber(scaled)} ${unit}`.trim();
  }, [scalingFactor]);

  return useMemo(() => ({
    scaleMetric,
    scaleToolMeasure,
    isScaled,
  }), [scaleMetric, scaleToolMeasure, isScaled]);
}

export default useScaling;
