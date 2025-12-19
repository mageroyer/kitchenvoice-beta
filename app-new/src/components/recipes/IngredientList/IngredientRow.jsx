/**
 * IngredientRow Component
 *
 * Renders a single ingredient row (editable or read-only).
 * Includes ingredient linking functionality with yellow highlight for unlinked.
 * Shows calculated price from linked ingredient database (owner mode only).
 * Memoized to prevent unnecessary re-renders when sibling rows change.
 */

import { memo, useState, useEffect, useMemo } from 'react';
import Input from '../../common/Input';
import Button from '../../common/Button';
import ValidationBadge from '../../common/ValidationBadge';
import { formatMetric } from '../../../utils/format';
import { calculateIngredientPrice } from '../../../services/ai/priceCalculator';
import { validateIngredient, getValidationBadge } from '../../../utils/ingredientValidation';
import { calculateToolFromMetric, formatToolMeasure, findBestToolForQuantity } from '../../../services/inventory/toolSuggestions';
import styles from '../../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {Object} props.ingredient - Ingredient object
 * @param {number} props.index - Index in the ingredients array
 * @param {boolean} props.editable - Whether editing is enabled
 * @param {boolean} props.isFirst - Whether this is the first item
 * @param {boolean} props.isLast - Whether this is the last item
 * @param {boolean} props.isSelected - Whether this row is selected for grouping
 * @param {boolean} props.micFlag - Whether voice mode is enabled
 * @param {Object} props.fieldVoiceActive - Current active field voice { type, index, field }
 * @param {Function} props.onUpdate - Called with (index, field, value) when field changes
 * @param {Function} props.onFieldFocus - Called with (index, fieldName) when field is focused
 * @param {Function} props.onVoiceStop - Called to stop voice recording
 * @param {Function} props.onToggleSelect - Called with (index) to toggle selection
 * @param {Function} props.onMoveUp - Called with (index) to move up
 * @param {Function} props.onMoveDown - Called with (index) to move down
 * @param {Function} props.onRemove - Called with (index) to remove
 * @param {Function} props.scaleMetric - Function to scale metric values
 * @param {boolean} props.isScaled - Whether scaling is active
 * @param {Function} props.onOpenLinkModal - Called with (index) to open linking modal
 * @param {Function} props.onOpenToolSelector - Called with (index) to open tool selector modal
 * @param {string} props.ingredientMode - 'standard' or 'advanced' highlighting mode
 * @param {boolean} props.isOwner - Whether user is owner (shows price field)
 * @param {number} props.scalingFactor - Current scaling factor for price calculation
 * @param {Object} props.linkedInventoryItem - The linked inventory item (for validation)
 * @param {Function} props.onFixPrice - Called with (inventoryItemId) to fix missing price
 */
function IngredientRow({
  ingredient,
  index,
  editable,
  isFirst,
  isLast,
  isSelected,
  micFlag,
  fieldVoiceActive,
  onUpdate,
  onFieldFocus,
  onVoiceStop,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  scaleMetric,
  isScaled,
  onOpenLinkModal,
  onOpenToolSelector,
  ingredientMode = 'standard',
  isOwner = false,
  scalingFactor = 1,
  linkedInventoryItem = null,
  onFixPrice,
}) {
  // Price state - fetched from linked ingredient database
  const [priceData, setPriceData] = useState({ price: null, pricePerKg: 0, unit: '', error: null });

  // Check if ingredient is linked to database
  const isLinked = !!ingredient.linkedIngredientId;

  // Check if metric measurement is missing (required for scaling)
  const isMissingMetric = !ingredient.metric || ingredient.metric.trim() === '';

  // Calculate validation status for this ingredient
  // Pass linkedInventoryItem if we have it, or null if linked but item not provided yet
  const validationResult = validateIngredient(
    ingredient,
    isLinked ? linkedInventoryItem : null
  );
  const validationBadge = getValidationBadge(validationResult, ingredient);

  // Calculate tool display from metric (tool is read-only, calculated from metric)
  const calculatedToolDisplay = useMemo(() => {
    // If no tool is selected, show nothing
    if (!ingredient.selectedTool) {
      return { display: '', hasValue: false };
    }

    // Parse metric value (e.g., "300g" -> 300)
    const metricMatch = (ingredient.metric || '').match(/^([\d.,]+)\s*(g|kg|ml|l)?$/i);
    if (!metricMatch) {
      return { display: '', hasValue: false };
    }

    let metricQty = parseFloat(metricMatch[1].replace(',', '.'));
    const metricUnit = (metricMatch[2] || 'g').toLowerCase();

    // Convert to base unit (grams or ml)
    if (metricUnit === 'kg') metricQty *= 1000;
    if (metricUnit === 'l') metricQty *= 1000;

    // Check if using dynamic kitchen tools (auto-selects best tool for qty)
    if (ingredient.selectedTool.type === 'kitchenTool') {
      // Dynamically calculate best tool based on current metric qty
      const bestTool = findBestToolForQuantity(metricQty, ingredient.selectedTool.isLiquid);
      if (bestTool) {
        return {
          display: bestTool.display,
          hasValue: true,
          toolQty: bestTool.quantity,
          abbrev: bestTool.abbrev
        };
      }
      return { display: '', hasValue: false };
    }

    // Standard unit tool (canne, sac, etc.) - needs weightG
    if (!ingredient.selectedTool.weightG) {
      return { display: '', hasValue: false };
    }

    // Calculate tool quantity
    const toolQty = calculateToolFromMetric(metricQty, ingredient.selectedTool.weightG);
    const display = formatToolMeasure(toolQty, ingredient.selectedTool.abbrev);

    return { display, hasValue: toolQty > 0, toolQty, abbrev: ingredient.selectedTool.abbrev };
  }, [ingredient.metric, ingredient.selectedTool]);

  // Calculate scaled tool display for read-only view mode
  const scaledToolDisplay = useMemo(() => {
    if (!calculatedToolDisplay.hasValue || !isScaled) {
      return calculatedToolDisplay.display;
    }
    // When scaling, multiply tool quantity by scaling factor
    const scaledQty = calculatedToolDisplay.toolQty * scalingFactor;
    return formatToolMeasure(scaledQty, calculatedToolDisplay.abbrev);
  }, [calculatedToolDisplay, isScaled, scalingFactor]);

  // Check if ingredient has a tool selected (for display purposes)
  const hasTool = !!ingredient.selectedTool;

  // Handle validation badge actions
  const handleValidationAction = (action, context = {}) => {
    if (action === 'openLinkModal' || action === 'showIssues') {
      // Pass issues and linked item so modal can show fix options
      onOpenLinkModal?.(index, {
        issues: context.issues || validationResult.issues,
        linkedInventoryItem,
        ingredientUnit: ingredient.metricUnit || '',
      });
    }
  };

  // Fetch price from linked ingredient when relevant props change
  useEffect(() => {
    if (!isOwner || !isLinked) {
      setPriceData({ price: null, pricePerKg: 0, unit: '', error: isLinked ? null : 'not_linked' });
      return;
    }

    let isMounted = true;

    const fetchPrice = async () => {
      try {
        const result = await calculateIngredientPrice(ingredient, scalingFactor);
        if (isMounted) {
          setPriceData(result);
        }
      } catch (err) {
        console.error('Error calculating price:', err);
        if (isMounted) {
          setPriceData({ price: null, pricePerKg: 0, unit: '', error: 'calculation_error' });
        }
      }
    };

    fetchPrice();

    return () => {
      isMounted = false;
    };
  // NOTE: linkedInventoryItem?.pricePerG triggers re-fetch when price is fixed via FixPriceModal
  }, [isOwner, isLinked, ingredient.linkedIngredientId, ingredient.metric, scalingFactor, linkedInventoryItem?.pricePerG]);

  const isFieldActive = (field) =>
    fieldVoiceActive?.type === 'edit' &&
    fieldVoiceActive?.index === index &&
    fieldVoiceActive?.field === field;

  if (editable) {
    // Row class - only show green border for linked ingredients
    const rowClasses = [
      styles.editableItem,
      isLinked ? styles.linked : ''
    ].filter(Boolean).join(' ');

    return (
      <div
        className={rowClasses}
        style={ingredient.groupColor ? { backgroundColor: ingredient.groupColor } : {}}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(index)}
          className={styles.groupCheckbox}
          title="Select for grouping"
        />
        <div className={styles.metricWrapper}>
          <Input
            value={formatMetric(ingredient.metric || '')}
            onChange={(e) => onUpdate(index, 'metric', e.target.value)}
            onFocus={() => onFieldFocus(index, 'metric')}
            size="small"
            compact
            className={`${styles.metricInput} ${isMissingMetric ? styles.missingMetric : ''}`}
            showVoice={micFlag}
            voiceActive={isFieldActive('metric')}
            onVoiceClick={onVoiceStop}
            placeholder="0g"
          />
        </div>
        {/* Tool display - shows original from PDF or calculated from metric */}
        <div
          className={`${styles.toolDisplay} ${isLinked ? styles.toolClickable : ''}`}
          onClick={() => {
            if (isLinked) {
              onOpenToolSelector?.(index);
            }
          }}
          title={
            isLinked
              ? hasTool
                ? `${ingredient.selectedTool.name} (1 ${ingredient.selectedTool.abbrev} = ${ingredient.selectedTool.weightG}g) - Click to change`
                : 'Click to select a tool measurement'
              : ingredient.toolMeasure
                ? `Original: ${ingredient.toolMeasure}`
                : ''
          }
        >
          {calculatedToolDisplay.hasValue ? (
            // Linked with selectedTool: show calculated from metric
            <span className={styles.toolValue}>{calculatedToolDisplay.display}</span>
          ) : ingredient.toolMeasure ? (
            // Not linked but has original from PDF: show original value
            <span className={styles.toolOriginal}>{ingredient.toolMeasure}</span>
          ) : isLinked ? (
            // Linked but no tool selected: show placeholder
            <span className={styles.toolPlaceholder}>+ tool</span>
          ) : (
            // Not linked, no original: show dash
            <span className={styles.toolNA}>—</span>
          )}
        </div>
        <Input
          value={isLinked ? (ingredient.linkedName || ingredient.name) : ingredient.name}
          onChange={(e) => onUpdate(index, isLinked ? 'linkedName' : 'name', e.target.value)}
          onFocus={() => onFieldFocus(index, isLinked ? 'linkedName' : 'name')}
          size="small"
          compact
          className={`${styles.nameInput} ${ingredientMode === 'advanced' && !isLinked ? styles.missingLink : ''}`}
          showVoice={micFlag}
          voiceActive={isFieldActive('name') || isFieldActive('linkedName')}
          onVoiceClick={onVoiceStop}
          title={isLinked && ingredient.baseName ? `Original: ${ingredient.baseName}` : ''}
        />
        <Input
          value={ingredient.specification || ''}
          onChange={(e) => onUpdate(index, 'specification', e.target.value)}
          onFocus={() => onFieldFocus(index, 'specification')}
          size="small"
          compact
          className={styles.specificationInput}
          showVoice={micFlag}
          voiceActive={isFieldActive('specification')}
          onVoiceClick={onVoiceStop}
        />
        {/* Price display - read-only, fetched from linked ingredient database */}
        {isOwner && (
          <div className={styles.priceDisplay}>
            {priceData.price !== null ? (
              <span className={styles.calculatedPrice}>
                ${priceData.price.toFixed(2)}
              </span>
            ) : priceData.error === 'not_linked' ? (
              <span className={styles.priceNA} title="Lier l'ingrédient pour voir le prix">
                —
              </span>
            ) : priceData.error === 'no_price' ? (
              <span
                className={`${styles.priceNA} ${styles.priceFixable}`}
                title="Cliquer pour corriger le prix manquant"
                onClick={() => onFixPrice?.(ingredient.linkedIngredientId)}
              >
                $?
              </span>
            ) : priceData.error === 'no_metric' ? (
              <span className={styles.priceNA} title="Ajouter une mesure métrique pour calculer">
                —
              </span>
            ) : (
              <span className={styles.priceNA}>—</span>
            )}
          </div>
        )}
        <div className={styles.actionButtons}>
          {/* Validation Badge - shows link status and validation issues */}
          <ValidationBadge
            badge={validationBadge}
            onAction={handleValidationAction}
            disabled={false}
          />
          <Button
            variant="ghost"
            size="small"
            onClick={() => onMoveUp(index)}
            className={styles.moveButton}
            disabled={isFirst}
            title="Move up"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => onMoveDown(index)}
            className={styles.moveButton}
            disabled={isLast}
            title="Move down"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => onRemove(index)}
            className={styles.removeButton}
            title="Delete"
          >
            🗑️
          </Button>
        </div>
      </div>
    );
  }

  // Read-only mode
  // Determine tool display: calculated (linked) or original (from PDF)
  const toolToShow = calculatedToolDisplay.hasValue
    ? (isScaled ? scaledToolDisplay : calculatedToolDisplay.display)
    : ingredient.toolMeasure || '';

  return (
    <div
      className={styles.readOnlyItem}
      style={ingredient.groupColor ? { backgroundColor: ingredient.groupColor } : {}}
    >
      <span className={styles.ingredientText}>
        {ingredient.metric && (
          <span className={`${styles.viewMetric} ${isScaled ? styles.scaledValue : ''}`}>
            {formatMetric(scaleMetric(ingredient.metric))}
          </span>
        )}
        {toolToShow && (
          <span className={`${styles.viewTool} ${isScaled && calculatedToolDisplay.hasValue ? styles.scaledValue : ''}`}>
            ({toolToShow})
          </span>
        )}
        <span className={styles.viewName}>{ingredient.baseName || ingredient.name}</span>
        {ingredient.specification && (
          <span className={styles.viewSpec}>- {ingredient.specification}</span>
        )}
      </span>
    </div>
  );
}

export default memo(IngredientRow);
