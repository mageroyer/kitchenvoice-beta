/**
 * IngredientList Component (Refactored)
 *
 * Editable list of recipe ingredients with:
 * - Add/remove/reorder functionality
 * - Section tags for organization
 * - Color grouping
 * - Voice dictation (bulk and field-level)
 * - Scaling support
 *
 * @param {Object} props
 * @param {Array} props.ingredients - Array of ingredient objects
 * @param {Function} props.onChange - Change handler (receives updated ingredients array)
 * @param {boolean} props.editable - Enable editing mode
 * @param {boolean} props.micFlag - Global voice mode enabled (from MenuBar)
 * @param {number} props.scalingFactor - Factor to scale measurements by
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import Button from '../../common/Button';
import Badge from '../../common/Badge';
import Alert from '../../common/Alert';

import { useIngredientListState } from './hooks/useIngredientListState';
import { useVoiceDictation } from './hooks/useVoiceDictation';
import { useScaling } from './hooks/useScaling';

import ColorPickerModal from './ColorPickerModal';
import SectionRow from './SectionRow';
import SectionInput from './SectionInput';
import IngredientRow from './IngredientRow';
import AddIngredientForm from './AddIngredientForm';
import IngredientLinkModal from './IngredientLinkModal';
import ValidationSummary from './ValidationSummary';
import FixPriceModal from '../FixPriceModal';

import { parseIngredientField } from '../../../utils/frenchMeasurementParser';
import { parseBulkIngredientsWithClaude } from '../../../services/ai/claudeAPI';
import { getSetting } from '../../../services/settings/settingsStorage';
import { kitchenSettingsDB, RESTRICTION_LEVELS, inventoryItemDB } from '../../../services/database/indexedDB';
// Note: unitConversion utils available if needed: getEnforcedMeasurement, classifyUnit

import styles from '../../../styles/components/ingredientlist.module.css';

function IngredientList({
  ingredients: ingredientsProp = [],
  onChange = () => {},
  editable = true,
  micFlag = false,
  scalingFactor = 1,
  isOwner = false,
}) {
  // Ensure ingredients is always an array
  const ingredients = Array.isArray(ingredientsProp) ? ingredientsProp : [];

  // Hooks
  const { state, actions } = useIngredientListState();
  const { scaleMetric, isScaled } = useScaling(scalingFactor);

  // Get ingredient highlighting mode from settings
  const ingredientModeSetting = getSetting('ingredientMode') || 'standard';

  // Get restriction level from kitchen settings
  const [restrictionLevel, setRestrictionLevel] = useState(RESTRICTION_LEVELS.STANDARD);

  // Store linked inventory items for validation
  const [linkedInventoryItems, setLinkedInventoryItems] = useState({});

  // Fix price modal state
  const [fixPriceModalOpen, setFixPriceModalOpen] = useState(false);
  const [fixPriceInventoryItemId, setFixPriceInventoryItemId] = useState(null);

  useEffect(() => {
    const loadRestrictionLevel = async () => {
      try {
        const level = await kitchenSettingsDB.getRestrictionLevel();
        setRestrictionLevel(level);
      } catch (err) {
        console.error('Error loading restriction level:', err);
      }
    };
    loadRestrictionLevel();
  }, []);

  // Fetch linked inventory items for validation
  useEffect(() => {
    const fetchLinkedItems = async () => {
      // Get all linked ingredient IDs
      const linkedIds = ingredients
        .filter(ing => !ing.isSection && ing.linkedIngredientId)
        .map(ing => ing.linkedIngredientId);

      if (linkedIds.length === 0) {
        setLinkedInventoryItems({});
        return;
      }

      // Fetch all linked items in parallel
      try {
        const items = await Promise.all(
          linkedIds.map(id => inventoryItemDB.getById(id).catch(() => null))
        );

        // Build map of id -> item
        const itemsMap = {};
        linkedIds.forEach((id, idx) => {
          if (items[idx]) {
            itemsMap[id] = items[idx];
          }
        });
        setLinkedInventoryItems(itemsMap);
      } catch (err) {
        console.error('Error fetching linked inventory items:', err);
      }
    };

    fetchLinkedItems();
  }, [ingredients]);

  // Determine effective ingredient mode:
  // - In ACCOUNTING mode (level 3): always show unlinked highlights
  // - Otherwise: use the ingredientMode setting
  const ingredientMode = restrictionLevel === RESTRICTION_LEVELS.ACCOUNTING ? 'advanced' : ingredientModeSetting;

  // Ref to always have current ingredients (avoid stale closure in callbacks)
  const currentIngredientsRef = useRef(ingredients);
  useEffect(() => {
    currentIngredientsRef.current = ingredients;
  }, [ingredients]);

  // ============================================
  // Bulk Voice Dictation
  // ============================================
  const handleBulkComplete = useCallback(async (result) => {
    actions.setBulkVoiceActive(false);

    const hasContent = result.lines.length > 0 || (result.fullTranscript && result.fullTranscript.trim());
    if (!hasContent) {
      actions.setBulkError('No ingredients detected. Please try again.');
      return;
    }

    actions.setBulkProcessing(true);
    actions.setBulkError('');

    try {
      const fullText = result.lines.length > 0
        ? result.lines.join('\n')
        : result.fullTranscript;

      // API key handled server-side via Cloud Function
      const parsedIngredients = await parseBulkIngredientsWithClaude(fullText);
      const updatedIngredients = [...currentIngredientsRef.current, ...parsedIngredients];
      onChange(updatedIngredients);
      actions.resetBulkVoice();
    } catch (error) {
      actions.setBulkError(`Failed to parse ingredients: ${error.message}`);
      actions.setBulkProcessing(false);
    }
  }, [actions, onChange]);

  const bulkVoice = useVoiceDictation({
    language: 'fr-CA',
    onTranscriptUpdate: (data) => actions.setBulkTranscript(data),
    onComplete: handleBulkComplete,
    onError: (error) => {
      actions.setBulkError(`Voice error: ${error}`);
      actions.setBulkVoiceActive(false);
    },
  });

  const handleBulkVoiceToggle = async () => {
    if (state.bulkVoiceActive) {
      actions.setBulkVoiceActive(false);
      bulkVoice.stop();
    } else {
      actions.setBulkError('');
      const started = await bulkVoice.start();
      if (started) {
        actions.setBulkVoiceActive(true);
      }
    }
  };

  // ============================================
  // Field Voice Dictation
  // ============================================
  const handleFieldComplete = useCallback((result, fieldInfo) => {
    if (result.fullTranscript) {
      let parsedValue = parseIngredientField(result.fullTranscript, fieldInfo.field);
      if (fieldInfo.field === 'name' || fieldInfo.field === 'specification') {
        parsedValue = parsedValue.toLowerCase();
      }

      if (fieldInfo.type === 'new') {
        actions.updateNewField(fieldInfo.field, parsedValue);
      } else if (fieldInfo.type === 'edit') {
        const updatedIngredients = ingredients.map((ing, i) =>
          i === fieldInfo.index ? { ...ing, [fieldInfo.field]: parsedValue } : ing
        );
        onChange(updatedIngredients);
      }
    }
    actions.clearFieldVoice();
  }, [actions, ingredients, onChange]);

  // Store fieldInfo for the callback
  const fieldInfoRef = useRef(null);

  const fieldVoice = useVoiceDictation({
    language: 'fr-CA',
    onTranscriptUpdate: (data) => actions.setFieldVoiceTranscript(data.currentLine || ''),
    onComplete: (result) => {
      if (fieldInfoRef.current) {
        handleFieldComplete(result, fieldInfoRef.current);
      }
    },
    onError: () => actions.clearFieldVoice(),
  });

  const handleNewFieldFocus = async (fieldName) => {
    if (!micFlag || state.fieldVoiceActive || state.bulkVoiceActive) return;
    if (!fieldVoice.isSupported()) return;

    fieldInfoRef.current = { type: 'new', field: fieldName };
    actions.setFieldVoiceActive(fieldInfoRef.current);

    const started = await fieldVoice.start();
    if (!started) {
      actions.clearFieldVoice();
    }
  };

  const handleEditFieldFocus = async (index, fieldName) => {
    if (!micFlag || state.fieldVoiceActive || state.bulkVoiceActive) return;
    if (!fieldVoice.isSupported()) return;

    fieldInfoRef.current = { type: 'edit', index, field: fieldName };
    actions.setFieldVoiceActive(fieldInfoRef.current);

    const started = await fieldVoice.start();
    if (!started) {
      actions.clearFieldVoice();
    }
  };

  const handleVoiceStop = () => {
    actions.clearFieldVoice();
    fieldVoice.stop();
  };

  // ============================================
  // Ingredient CRUD Operations
  // ============================================
  const handleAddIngredient = () => {
    if (!state.newIngredient.name.trim()) return;

    const updatedIngredients = [
      ...ingredients,
      {
        groupColor: null,
        metric: state.newIngredient.metric || '',
        metricQty: state.newIngredient.metricQty || '',
        metricUnit: state.newIngredient.metricUnit || '',
        toolQty: state.newIngredient.toolQty || '',
        toolUnit: state.newIngredient.toolUnit || '',
        toolMeasure: state.newIngredient.toolMeasure || '',
        name: state.newIngredient.name.trim().toLowerCase(),
        specification: (state.newIngredient.specification || '').toLowerCase(),
      },
    ];

    onChange(updatedIngredients);
    actions.resetNewIngredient();
  };

  const handleRemoveIngredient = (index) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  const handleUpdateIngredient = (index, field, value) => {
    const processedValue = (field === 'name' || field === 'specification')
      ? value.toLowerCase()
      : value;

    onChange(ingredients.map((ing, i) =>
      i === index ? { ...ing, [field]: processedValue } : ing
    ));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newIngredients = [...ingredients];
    [newIngredients[index - 1], newIngredients[index]] = [newIngredients[index], newIngredients[index - 1]];
    onChange(newIngredients);
  };

  const handleMoveDown = (index) => {
    if (index === ingredients.length - 1) return;
    const newIngredients = [...ingredients];
    [newIngredients[index], newIngredients[index + 1]] = [newIngredients[index + 1], newIngredients[index]];
    onChange(newIngredients);
  };

  // ============================================
  // Section Operations
  // ============================================
  const handleAddSection = () => {
    if (!state.newSectionName.trim()) return;

    const sectionTag = {
      isSection: true,
      sectionName: state.newSectionName.trim().toUpperCase(),
    };

    onChange([sectionTag, ...ingredients]);
    actions.hideSectionInput();
  };

  const handleUpdateSectionName = (index, value) => {
    onChange(ingredients.map((ing, i) =>
      i === index ? { ...ing, sectionName: value.toUpperCase() } : ing
    ));
  };

  // ============================================
  // Grouping/Color Operations
  // ============================================
  const handleApplyColor = (color) => {
    onChange(ingredients.map((ing, i) => {
      if (state.selectedIndices.has(i) && !ing.isSection) {
        return { ...ing, groupColor: color };
      }
      return ing;
    }));
    actions.hideColorPicker();
  };

  const handleClearColor = () => {
    onChange(ingredients.map((ing, i) => {
      if (state.selectedIndices.has(i) && !ing.isSection) {
        return { ...ing, groupColor: null };
      }
      return ing;
    }));
    actions.hideColorPicker();
  };

  const hasSelectedItems = state.selectedIndices.size > 0;

  // ============================================
  // Fix Price Modal
  // ============================================
  const handleFixPrice = (inventoryItemId) => {
    setFixPriceInventoryItemId(inventoryItemId);
    setFixPriceModalOpen(true);
  };

  const handleFixPriceClose = () => {
    setFixPriceModalOpen(false);
    setFixPriceInventoryItemId(null);
  };

  const handlePriceFixed = async () => {
    // Refresh linked inventory items to get updated pricePerG
    const linkedIds = ingredients
      .filter(ing => !ing.isSection && ing.linkedIngredientId)
      .map(ing => ing.linkedIngredientId);

    if (linkedIds.length > 0) {
      try {
        const items = await Promise.all(
          linkedIds.map(id => inventoryItemDB.getById(id).catch(() => null))
        );
        const itemsMap = {};
        linkedIds.forEach((id, idx) => {
          if (items[idx]) {
            itemsMap[id] = items[idx];
          }
        });
        setLinkedInventoryItems(itemsMap);
      } catch (err) {
        console.error('[IngredientList] Error refreshing inventory items:', err);
      }
    }
  };

  // ============================================
  // Render
  // ============================================
  return (
    <div className={styles.ingredientList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            Ingredients
            <Badge variant="info" size="small">
              {ingredients.filter(ing => !ing.isSection).length}
            </Badge>
          </h3>
          {/* Validation Summary - shows link status and issues */}
          <ValidationSummary
            ingredients={ingredients}
            linkedInventoryItems={linkedInventoryItems}
            onShowIssues={() => {
              // Could scroll to first issue or show a modal
              console.log('Show validation issues');
            }}
          />
          {editable && (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={actions.showSectionInput}
                className={styles.sectionButton}
              >
                + Section
              </Button>
              <Button
                variant={hasSelectedItems ? 'primary' : 'secondary'}
                size="small"
                onClick={actions.showColorPicker}
                disabled={!hasSelectedItems}
                className={styles.groupButton}
              >
                🎨 Group
              </Button>
            </>
          )}
        </div>
        {editable && (
          <Button
            variant={state.bulkVoiceActive ? 'danger' : 'primary'}
            size="small"
            onClick={handleBulkVoiceToggle}
            disabled={state.bulkProcessing}
          >
            {state.bulkVoiceActive ? '⏹️ Stop Dictation' : '🎤 Voice Dictation'}
          </Button>
        )}
      </div>

      {/* Color Picker Modal */}
      {state.showColorPicker && (
        <ColorPickerModal
          onSelectColor={handleApplyColor}
          onClearColor={handleClearColor}
          onClose={actions.hideColorPicker}
        />
      )}

      {/* Section Tag Input */}
      {state.showSectionInput && (
        <SectionInput
          value={state.newSectionName}
          onChange={actions.setSectionName}
          onAdd={handleAddSection}
          onCancel={actions.hideSectionInput}
        />
      )}

      {/* Bulk Voice Error */}
      {state.bulkError && (
        <Alert variant="danger" dismissible onDismiss={() => actions.setBulkError('')}>
          {state.bulkError}
        </Alert>
      )}

      {/* Bulk Voice Active Indicator */}
      {state.bulkVoiceActive && (
        <div className={styles.bulkVoiceIndicator}>
          <button
            type="button"
            className={styles.bulkVoiceMic}
            onClick={handleBulkVoiceToggle}
            title="Click to stop recording"
          >
            🎤
          </button>
        </div>
      )}

      {/* Ingredients List */}
      {ingredients.length > 0 ? (
        <ul className={styles.list}>
          {ingredients.map((ingredient, index) => (
            <li
              key={index}
              className={`${styles.listItem} ${ingredient.isSection ? styles.sectionListItem : ''}`}
            >
              {ingredient.isSection ? (
                <SectionRow
                  section={ingredient}
                  index={index}
                  editable={editable}
                  isFirst={index === 0}
                  isLast={index === ingredients.length - 1}
                  onUpdateName={handleUpdateSectionName}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onRemove={handleRemoveIngredient}
                />
              ) : (
                <IngredientRow
                  ingredient={ingredient}
                  index={index}
                  editable={editable}
                  isFirst={index === 0}
                  isLast={index === ingredients.length - 1}
                  isSelected={state.selectedIndices.has(index)}
                  micFlag={micFlag}
                  fieldVoiceActive={state.fieldVoiceActive}
                  onUpdate={handleUpdateIngredient}
                  onFieldFocus={handleEditFieldFocus}
                  onVoiceStop={handleVoiceStop}
                  onToggleSelect={actions.toggleSelect}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onRemove={handleRemoveIngredient}
                  scaleMetric={scaleMetric}
                  isScaled={isScaled}
                  onOpenLinkModal={actions.openLinkModal}
                  onOpenToolSelector={(idx) => {
                    // Open link modal in tool selection mode for linked ingredients
                    const ing = ingredients[idx];
                    if (ing && ing.linkedIngredientId) {
                      actions.openLinkModal(idx, {
                        mode: 'toolSelection',
                        linkedIngredientId: ing.linkedIngredientId,
                        currentTool: ing.selectedTool || null,
                      });
                    }
                  }}
                  ingredientMode={ingredientMode}
                  isOwner={isOwner}
                  scalingFactor={scalingFactor}
                  linkedInventoryItem={linkedInventoryItems[ingredient.linkedIngredientId] || null}
                  onFixPrice={handleFixPrice}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📝</span>
          <p className={styles.emptyText}>No ingredients yet. Add your first ingredient below!</p>
        </div>
      )}

      {/* Add New Ingredient */}
      {editable && (
        <AddIngredientForm
          newIngredient={state.newIngredient}
          micFlag={micFlag}
          fieldVoiceActive={state.fieldVoiceActive}
          onFieldChange={actions.updateNewField}
          onFieldFocus={handleNewFieldFocus}
          onVoiceStop={handleVoiceStop}
          onAdd={handleAddIngredient}
        />
      )}

      {/* Ingredient Link Modal */}
      {state.linkModalOpen && state.linkModalIndex !== null && ingredients[state.linkModalIndex] && (() => {
        const ing = ingredients[state.linkModalIndex];
        // Extract unit and quantity from metric string (e.g., "500g" → qty=500, unit="g")
        let metricQty = 0;
        let unitFromMetric = '';
        if (ing.metric) {
          const match = ing.metric.match(/([\d.,]+)\s*([a-zA-Z]+)?/);
          if (match) {
            metricQty = parseFloat(match[1].replace(',', '.')) || 0;
            unitFromMetric = (match[2] || '').toLowerCase();
            // Convert to base unit (g or ml)
            if (unitFromMetric === 'kg') metricQty *= 1000;
            if (unitFromMetric === 'l') metricQty *= 1000;
          }
        }
        const effectiveUnit = ing.metricUnit || unitFromMetric;

        return (
        <IngredientLinkModal
          ingredientName={ing.name}
          ingredientUnit={effectiveUnit}
          ingredientMetricQty={metricQty}
          currentLinkedId={ing.linkedIngredientId || null}
          validationContext={state.linkModalContext}
          onLink={(ingredientId, ingredientName, inventoryItem, measurementOptions = {}) => {
            // Store linked ingredient info while preserving base name
            const idx = state.linkModalIndex;

            // New linking model: metric value is NEVER changed by linking
            // We only store the detected type and selected tool
            const { detectedType = 'solid', tool = null } = measurementOptions;

            const updatedIngredients = ingredients.map((ing, i) => {
              if (i === idx) {
                const updates = {
                  ...ing,
                  linkedIngredientId: ingredientId,
                  linkedName: ingredientName.toLowerCase(),
                  // Preserve baseName (original recipe name) if not already set
                  baseName: ing.baseName || ing.name,
                  // Store detected type for reference (g for solid, ml for liquid)
                  detectedMetricType: detectedType,
                };

                // DO NOT modify ing.metric - user must manually fix if there's a conflict

                // Store selected tool for convenience display (tool is calculated from metric)
                if (tool) {
                  // For kitchen tools (dynamic), store type and isLiquid for dynamic calculation
                  // For unit tools (fixed), store weightG for fixed ratio calculation
                  updates.selectedTool = {
                    id: tool.id,
                    name: tool.name,
                    abbrev: tool.abbrev,
                    // Dynamic kitchen tools use type/isLiquid instead of weightG
                    ...(tool.type === 'kitchenTool' ? {
                      type: tool.type,
                      isLiquid: tool.isLiquid
                    } : {
                      weightG: tool.weightG,
                      source: tool.source || 'user'
                    })
                  };
                  // Only set toolWeightG for fixed unit tools
                  updates.toolWeightG = tool.type === 'kitchenTool' ? null : tool.weightG;
                } else {
                  updates.selectedTool = null;
                  updates.toolWeightG = null;
                }

                return updates;
              }
              return ing;
            });
            onChange(updatedIngredients);

            // Update cache immediately for instant validation update
            if (inventoryItem) {
              setLinkedInventoryItems(prev => ({
                ...prev,
                [ingredientId]: inventoryItem
              }));
            }
          }}
          onUnlink={() => {
            const linkedId = ingredients[state.linkModalIndex]?.linkedIngredientId;
            handleUpdateIngredient(state.linkModalIndex, 'linkedIngredientId', null);
            // Remove from cache
            if (linkedId) {
              setLinkedInventoryItems(prev => {
                const newCache = { ...prev };
                delete newCache[linkedId];
                return newCache;
              });
            }
          }}
          onUpdateInventoryItem={async (itemId, updates) => {
            // Update inventory item in database
            await inventoryItemDB.update(itemId, updates);

            // Update cache immediately for instant validation update
            setLinkedInventoryItems(prev => ({
              ...prev,
              [itemId]: { ...prev[itemId], ...updates }
            }));
          }}
          onClose={actions.closeLinkModal}
        />
        );
      })()}

      {/* Fix Price Modal */}
      {fixPriceModalOpen && fixPriceInventoryItemId && (
        <FixPriceModal
          inventoryItemId={fixPriceInventoryItemId}
          onClose={handleFixPriceClose}
          onFixed={handlePriceFixed}
        />
      )}
    </div>
  );
}

export default IngredientList;
