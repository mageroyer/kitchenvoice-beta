/**
 * IngredientLinkModal Component
 *
 * Modal for linking a recipe ingredient to an inventory item.
 * Supports "fix mode" for resolving validation issues:
 * - Missing unit on inventory item → set unit
 * - Unit mismatch → change inventory unit or re-link
 *
 * Also supports Recipe Tools:
 * - Shows available recipe tools for selected inventory item
 * - Allows user to select metric or tool measurement
 * - Allows creating new recipe tools
 */

import { useState, useEffect } from 'react';
import Button from '../../common/Button';
import Dropdown from '../../common/Dropdown';
import Spinner from '../../common/Spinner';
import AddRecipeToolModal from '../AddRecipeToolModal';

import { inventoryItemDB } from '../../../services/database/indexedDB';
// Unit compatibility imports removed - price calculation uses pricePerG directly
import { ValidationIssue } from '../../../utils/ingredientValidation';
import { generateToolSuggestions, getInvoiceUnitSuggestions, detectMeasurementType, findBestToolForQuantity } from '../../../services/inventory/toolSuggestions';
import styles from '../../../styles/components/ingredientlist.module.css';

// Unit options for dropdown
const UNIT_DROPDOWN_OPTIONS = [
  { value: '', label: 'Sélectionner...' },
  { value: 'g', label: 'g (grammes)' },
  { value: 'kg', label: 'kg (kilogrammes)' },
  { value: 'ml', label: 'ml (millilitres)' },
  { value: 'L', label: 'L (litres)' },
  { value: 'ea', label: 'ea (unité)' },
];

/**
 * @param {Object} props
 * @param {string} props.ingredientName - The recipe ingredient name to match
 * @param {string} props.ingredientUnit - The recipe ingredient unit (e.g., 'g', 'ml')
 * @param {number} props.ingredientMetricQty - The recipe ingredient metric quantity (in base units g or ml)
 * @param {number|null} props.currentLinkedId - Currently linked ingredient ID (if any)
 * @param {Object} props.validationContext - { issues, linkedInventoryItem, ingredientUnit }
 * @param {Function} props.onLink - Called with (ingredientId, ingredientName, inventoryItem) when linked
 * @param {Function} props.onUnlink - Called to remove the link
 * @param {Function} props.onUpdateInventoryItem - Called with (itemId, updates) to update inventory item
 * @param {Function} props.onClose - Called when modal is closed
 */
function IngredientLinkModal({
  ingredientName,
  ingredientUnit = '',
  ingredientMetricQty = 0,
  currentLinkedId = null,
  validationContext = null,
  onLink,
  onUnlink,
  onUpdateInventoryItem,
  onClose
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [showLinkList, setShowLinkList] = useState(!currentLinkedId || !validationContext?.issues?.length);

  // Fix mode state
  const [fixModeUnit, setFixModeUnit] = useState('');

  // Recipe Tools selection state
  const [selectedItem, setSelectedItem] = useState(null); // Item selected for tool choice
  const [showToolSelection, setShowToolSelection] = useState(false);
  const [showAddToolModal, setShowAddToolModal] = useState(false);

  // New linking flow state
  const [measurementType, setMeasurementType] = useState('solid'); // 'solid' or 'liquid' (auto-detected)
  const [selectionType, setSelectionType] = useState(null); // 'unit' | 'tool' | null (radio selection)
  const [selectedUnit, setSelectedUnit] = useState(null); // Selected unit from unitSuggestions
  const [bestTool, setBestTool] = useState(null); // Auto-suggested best kitchen tool
  const [unitSuggestions, setUnitSuggestions] = useState([]); // Item-specific units (canne, sac, etc.)
  const [metricConflict, setMetricConflict] = useState(false); // True if existing metric conflicts with item type

  // Check if we're in tool selection mode (opened by clicking tool field)
  const isToolSelectionMode = validationContext?.mode === 'toolSelection';

  // Determine if we're in fix mode (has issues to fix)
  const issues = validationContext?.issues || [];
  const linkedItem = validationContext?.linkedInventoryItem;
  const hasFixableIssues = issues.some(i => i.type === ValidationIssue.INVENTORY_NOT_FOUND);
  const isFixMode = currentLinkedId && hasFixableIssues && linkedItem && !isToolSelectionMode;

  // Get primary issue for display
  const primaryIssue = issues.find(i => i.severity === 'warning');

  // Load inventory item and go to tool selection when in toolSelectionMode
  useEffect(() => {
    if (isToolSelectionMode && validationContext?.linkedIngredientId) {
      const loadLinkedItem = async () => {
        setLoading(true);
        try {
          const item = await inventoryItemDB.getById(validationContext.linkedIngredientId);
          if (item) {
            setSelectedItem(item);

            // Auto-detect solid/liquid
            const detectedType = detectMeasurementType(item);
            setMeasurementType(detectedType);
            const isLiquid = detectedType === 'liquid';

            // Generate unit suggestions (item-specific: canne, sac, etc.)
            const { units } = generateToolSuggestions(item);

            // Also get units from invoice line items (where user entered weightPerUnit)
            const invoiceUnits = await getInvoiceUnitSuggestions(item.id);

            // Merge: invoice units first (more accurate), then item units
            const mergedUnits = [...invoiceUnits];
            units.forEach(unit => {
              // Only add if not already present (by abbrev)
              if (!mergedUnits.some(u => u.abbrev === unit.abbrev)) {
                mergedUnits.push(unit);
              }
            });
            setUnitSuggestions(mergedUnits);

            // Calculate best kitchen tool for current metric quantity
            if (ingredientMetricQty > 0) {
              const best = findBestToolForQuantity(ingredientMetricQty, isLiquid);
              setBestTool(best);
            }

            // Pre-select current tool type if exists
            if (validationContext.currentTool) {
              const current = validationContext.currentTool;
              // Check if current is a unit (has id starting with 'unit_') or a tool
              if (current.id?.startsWith('tool_')) {
                setSelectionType('tool');
              } else {
                setSelectionType('unit');
                setSelectedUnit(current);
              }
            }

            // Skip to tool selection
            setShowToolSelection(true);
          }
        } catch (err) {
          console.error('Error loading linked item:', err);
          setError(`Erreur: ${err.message}`);
        } finally {
          setLoading(false);
        }
      };
      loadLinkedItem();
    } else if (!isFixMode || showLinkList) {
      loadMatchingIngredients();
    } else {
      setLoading(false);
    }
  }, [ingredientName, isFixMode, showLinkList, isToolSelectionMode, validationContext?.linkedIngredientId, ingredientMetricQty]);

  // Unit fix mode removed - price calculation uses pricePerG directly

  const loadMatchingIngredients = async () => {
    setLoading(true);
    setError('');

    try {
      const allIngredients = await inventoryItemDB.getAll();

      if (allIngredients.length === 0) {
        setError('Aucun item dans inventaire. Importez des factures.');
        setLoading(false);
        return;
      }

      // Simple local keyword search
      const searchTerms = ingredientName.toLowerCase().split(' ').filter(w => w.length > 2);

      const matchingIngredients = allIngredients.filter(item => {
        const itemName = (item.name || '').toLowerCase();
        return searchTerms.some(term => itemName.includes(term));
      });

      setMatches(matchingIngredients);

      if (matchingIngredients.length === 0) {
        setError('Aucun item correspondant dans inventaire.');
      }
    } catch (err) {
      console.error('Error finding matches:', err);
      setError(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMatch = async (item) => {
    // Set selected item and generate suggestions
    setSelectedItem(item);

    // Auto-detect solid/liquid based on inventory item
    const detectedType = detectMeasurementType(item);
    setMeasurementType(detectedType);
    const isLiquid = detectedType === 'liquid';

    // Check if existing metric unit conflicts with detected type
    const solidUnits = ['g', 'kg'];
    const liquidUnits = ['ml', 'l', 'cl', 'dl'];
    const currentUnit = (ingredientUnit || '').toLowerCase();

    let hasConflict = false;
    if (currentUnit) {
      if (detectedType === 'solid' && liquidUnits.includes(currentUnit)) {
        hasConflict = true;
      } else if (detectedType === 'liquid' && solidUnits.includes(currentUnit)) {
        hasConflict = true;
      }
    }
    setMetricConflict(hasConflict);

    // Generate unit suggestions (item-specific)
    const { units } = generateToolSuggestions(item);

    // Also get units from invoice line items (where user entered weightPerUnit)
    const invoiceUnits = await getInvoiceUnitSuggestions(item.id);

    // Merge: invoice units first (more accurate), then item units
    const mergedUnits = [...invoiceUnits];
    units.forEach(unit => {
      // Only add if not already present (by abbrev)
      if (!mergedUnits.some(u => u.abbrev === unit.abbrev)) {
        mergedUnits.push(unit);
      }
    });
    setUnitSuggestions(mergedUnits);

    // Find best kitchen tool for the current metric quantity
    if (ingredientMetricQty > 0) {
      const best = findBestToolForQuantity(ingredientMetricQty, isLiquid);
      setBestTool(best);
    } else {
      setBestTool(null);
    }

    // Reset selection
    setSelectionType(null);
    setSelectedUnit(null);

    // Show tool selection step
    setShowToolSelection(true);
  };

  // Handle adding a new recipe tool
  const handleAddTool = async (toolData) => {
    if (!selectedItem) return;

    try {
      const toolId = await inventoryItemDB.addRecipeTool(selectedItem.id, toolData);
      // Refresh the item to get updated tools
      const updatedItem = await inventoryItemDB.getById(selectedItem.id);

      // Create the tool object directly from the data we have
      const newTool = {
        id: toolId,
        name: toolData.name.toLowerCase(),
        abbrev: toolData.abbrev.toLowerCase(),
        weightG: toolData.weightG,
        description: `1 ${toolData.abbrev} = ${toolData.weightG}g`,
        category: 'unit',
        source: 'user'
      };

      // Directly link with the new tool and close everything
      onLink(updatedItem.id, updatedItem.name, updatedItem, {
        detectedType: measurementType,
        hasConflict: metricConflict,
        tool: newTool
      });
      onClose();
    } catch (err) {
      console.error('Error adding recipe tool:', err);
      setError(err.message);
    }
  };

  // Go back from tool selection to item list (or close if in tool selection mode)
  const handleBackToList = () => {
    if (isToolSelectionMode) {
      // In tool selection mode, there's no list to go back to - just close
      onClose();
    } else {
      setSelectedItem(null);
      setShowToolSelection(false);
    }
  };

  const handleUnlink = () => {
    onUnlink();
    onClose();
  };

  const handleSaveUnit = async () => {
    if (!fixModeUnit || !linkedItem) return;

    setSaving(true);
    try {
      // Update inventory item with new unit
      await onUpdateInventoryItem(linkedItem.id, { unit: fixModeUnit });
      onClose();
    } catch (err) {
      console.error('Error updating inventory item:', err);
      setError(`Erreur: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Render fix mode UI
  const renderFixMode = () => {
    return (
      <div className={styles.fixModeContainer}>
        {/* Issue display */}
        <div className={styles.issueBox}>
          <span className={styles.issueIcon}>⚠️</span>
          <div className={styles.issueText}>
            <strong>{primaryIssue?.message || 'Problème de validation'}</strong>
            {primaryIssue?.suggestion && (
              <p className={styles.issueSuggestion}>{primaryIssue.suggestion}</p>
            )}
          </div>
        </div>

        {/* Linked item info */}
        <div className={styles.linkedItemInfo}>
          <span className={styles.label}>Item lié:</span>
          <span className={styles.linkedItemName}>{linkedItem?.name}</span>
          {linkedItem?.vendorName && (
            <span className={styles.linkedItemVendor}>— {linkedItem.vendorName}</span>
          )}
        </div>

        {/* Unit fix options removed - price calculation uses pricePerG directly */}

        {/* Option to show re-link list */}
        <div className={styles.relinkOption}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowLinkList(true)}
          >
            Lier à un autre item
          </Button>
        </div>
      </div>
    );
  };

  // Handle confirming the link with selected options
  const handleConfirmLink = () => {
    if (!selectedItem) return;

    // Determine which tool to use based on selection type
    let tool = null;
    if (selectionType === 'unit' && selectedUnit) {
      // Specific unit selected (canne, sac, etc.)
      tool = selectedUnit;
    } else if (selectionType === 'tool') {
      // Kitchen tools selected - store flag for dynamic calculation
      // IngredientRow will calculate best tool based on current metric
      tool = {
        id: 'kitchen_tools',
        type: 'kitchenTool',
        isLiquid: measurementType === 'liquid',
        name: 'Kitchen Tools',
        abbrev: 'auto'
      };
    }

    onLink(selectedItem.id, selectedItem.name, selectedItem, {
      detectedType: measurementType,
      hasConflict: metricConflict,
      tool: tool
    });
    onClose();
  };

  // Handle selecting a unit (radio style)
  const handleSelectUnit = (unit) => {
    setSelectionType('unit');
    setSelectedUnit(unit);
  };

  // Handle selecting the kitchen tool option (radio style)
  const handleSelectToolOption = () => {
    setSelectionType('tool');
    setSelectedUnit(null);
  };

  // Render tool selection UI with radio-style selection
  const renderToolSelection = () => {
    const metricUnitDisplay = measurementType === 'liquid' ? 'ml/L' : 'g/kg';
    const isLiquid = measurementType === 'liquid';

    return (
      <div className={styles.toolSelectionContainer}>
        {/* Selected item info */}
        <div className={styles.selectedItemBox}>
          <span className={styles.label}>Item sélectionné:</span>
          <span className={styles.selectedItemName}>{selectedItem?.name}</span>
          {selectedItem?.unit && (
            <span className={styles.selectedItemUnit}>({selectedItem.unit})</span>
          )}
          {selectedItem?.currentPrice > 0 && (
            <span className={styles.selectedItemPrice}>
              — ${selectedItem.currentPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Auto-detected measurement type (read-only indicator) */}
        <div className={styles.measurementTypeSection}>
          <span className={styles.sectionLabel}>Type de mesure métrique:</span>
          <div className={styles.measurementTypeIndicator}>
            <span className={styles.typeIcon}>
              {isLiquid ? '💧' : '⚖️'}
            </span>
            <span className={styles.typeText}>
              {isLiquid ? 'Liquide' : 'Solide'} ({metricUnitDisplay})
            </span>
          </div>
        </div>

        {/* Metric conflict warning */}
        {metricConflict && (
          <div className={styles.metricConflictWarning}>
            <span className={styles.warningIcon}>⚠️</span>
            <div className={styles.warningText}>
              <strong>Unité incompatible</strong>
              <p>
                L'ingrédient utilise {ingredientUnit} mais cet item est {isLiquid ? 'liquide' : 'solide'}.
                Après le lien, modifiez la quantité métrique avec l'unité appropriée ({metricUnitDisplay}).
              </p>
            </div>
          </div>
        )}

        <p className={styles.sectionHint}>
          Choisissez un outil de mesure (optionnel). La métrique reste la mesure principale.
        </p>

        {/* Radio selection: None */}
        <button
          type="button"
          className={`${styles.radioOption} ${selectionType === null ? styles.radioSelected : ''}`}
          onClick={() => { setSelectionType(null); setSelectedUnit(null); }}
        >
          <span className={styles.radioCircle}>{selectionType === null ? '●' : '○'}</span>
          <span className={styles.radioLabel}>Aucun outil</span>
          <span className={styles.radioDesc}>Utiliser seulement la métrique</span>
        </button>

        {/* Radio selection: UNIT (if available) */}
        {unitSuggestions.length > 0 && (
          <div className={styles.radioGroup}>
            <span className={styles.radioGroupLabel}>📦 Unités (de cet item)</span>
            {unitSuggestions.map((unit) => (
              <button
                key={unit.id}
                type="button"
                className={`${styles.radioOption} ${selectionType === 'unit' && selectedUnit?.id === unit.id ? styles.radioSelected : ''}`}
                onClick={() => handleSelectUnit(unit)}
              >
                <span className={styles.radioCircle}>
                  {selectionType === 'unit' && selectedUnit?.id === unit.id ? '●' : '○'}
                </span>
                <span className={styles.radioLabel}>
                  {unit.name}
                  {unit.source === 'invoice' && (
                    <span className={styles.invoiceBadge} title="Poids vérifié depuis facture">✓</span>
                  )}
                </span>
                <span className={styles.radioDesc}>{unit.description}</span>
              </button>
            ))}
            {/* Create custom unit */}
            <button
              type="button"
              className={`${styles.radioOption} ${styles.radioAdd}`}
              onClick={() => setShowAddToolModal(true)}
            >
              <span className={styles.radioCircle}>➕</span>
              <span className={styles.radioLabel}>Créer une unité</span>
            </button>
          </div>
        )}

        {/* Radio selection: TOOL (auto-suggested best tool) */}
        <div className={styles.radioGroup}>
          <span className={styles.radioGroupLabel}>
            🥄 Outil de cuisine
            {!isLiquid && <span className={styles.confidenceNote}> (conversion approximative)</span>}
          </span>
          <button
            type="button"
            className={`${styles.radioOption} ${selectionType === 'tool' ? styles.radioSelected : ''}`}
            onClick={handleSelectToolOption}
          >
            <span className={styles.radioCircle}>{selectionType === 'tool' ? '●' : '○'}</span>
            {bestTool ? (
              <>
                <span className={styles.radioLabel}>{bestTool.name}</span>
                <span className={styles.radioDesc}>
                  {bestTool.quantity} {bestTool.abbrev} = {ingredientMetricQty}{isLiquid ? 'ml' : 'g'}
                  {!isLiquid && ' ~'}
                </span>
              </>
            ) : (
              <>
                <span className={styles.radioLabel}>c.à.t. → c.à.s. → tasse → L</span>
                <span className={styles.radioDesc}>auto selon quantité</span>
              </>
            )}
          </button>
        </div>

        {/* Create custom unit (if no units available) */}
        {unitSuggestions.length === 0 && (
          <div className={styles.radioGroup}>
            <span className={styles.radioGroupLabel}>📦 Unités</span>
            <button
              type="button"
              className={`${styles.radioOption} ${styles.radioAdd}`}
              onClick={() => setShowAddToolModal(true)}
            >
              <span className={styles.radioCircle}>➕</span>
              <span className={styles.radioLabel}>Créer une unité personnalisée</span>
            </button>
          </div>
        )}

        {/* Confirm button */}
        <div className={styles.confirmLinkSection}>
          <Button
            variant="primary"
            size="medium"
            onClick={handleConfirmLink}
          >
            {metricConflict ? 'Lier quand même' : 'Confirmer le lien'}
          </Button>
        </div>
      </div>
    );
  };

  // Determine modal title
  const getModalTitle = () => {
    if (isToolSelectionMode) return 'Changer l\'outil de mesure';
    if (showToolSelection) return 'Choisir la mesure';
    if (isFixMode && !showLinkList) return 'Corriger le lien';
    return 'Lier l\'ingrédient';
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.linkModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.linkModalHeader}>
          <h3>{getModalTitle()}</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.linkModalContent}>
          <div className={styles.ingredientToMatch}>
            <span className={styles.label}>Ingrédient recette:</span>
            <span className={styles.ingredientNameHighlight}>
              {ingredientName}
              {ingredientUnit && <span className={styles.unitBadge}>{ingredientUnit}</span>}
            </span>
          </div>

          {/* Tool selection UI */}
          {showToolSelection && renderToolSelection()}

          {/* Fix mode UI */}
          {!showToolSelection && isFixMode && !showLinkList && renderFixMode()}

          {/* Link list (normal mode or when user wants to re-link) */}
          {!showToolSelection && (!isFixMode || showLinkList) && (
            <>
              {loading ? (
                <div className={styles.loadingState}>
                  <Spinner size="medium" />
                  <p>Recherche des correspondances...</p>
                </div>
              ) : error && matches.length === 0 ? (
                <div className={styles.errorState}>
                  <p>{error}</p>
                </div>
              ) : (
                <>
                  <div className={styles.matchesHeader}>
                    <span>Correspondances trouvées ({matches.length})</span>
                  </div>

                  <ul className={styles.matchesList}>
                    {matches.map((match) => {
                      const itemUnit = match.unit || '';
                      const isCurrent = currentLinkedId === match.id;
                      const hasTools = (match.recipeTools?.length > 0) || match.unitType === 'tool';

                      return (
                        <li
                          key={match.id}
                          className={`${styles.matchItem} ${isCurrent ? styles.currentlyLinked : ''}`}
                          onClick={() => handleSelectMatch(match)}
                        >
                          <span className={styles.matchContent}>
                            <strong>{match.name}</strong>
                            {match.vendorName && (
                              <span className={styles.matchVendor}>— {match.vendorName}</span>
                            )}
                            {match.currentPrice != null && (
                              <span className={styles.matchPrice}>
                                — ${match.currentPrice.toFixed(2)}/{itemUnit || 'ea'}
                              </span>
                            )}
                            {hasTools && (
                              <span className={styles.hasToolsBadge} title="Outils de mesure disponibles">
                                🥄
                              </span>
                            )}
                            {isCurrent && (
                              <span className={styles.linkedBadge}>Lié</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}

          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        <div className={styles.linkModalFooter}>
          {/* Unlink button - only show when linked and not in tool selection mode */}
          {currentLinkedId && !showToolSelection && !isToolSelectionMode && (
            <Button variant="danger" size="small" onClick={handleUnlink}>
              Délier
            </Button>
          )}
          {/* Back button for tool selection */}
          {showToolSelection && !isToolSelectionMode && (
            <Button variant="secondary" size="small" onClick={handleBackToList}>
              Retour
            </Button>
          )}
          {/* Back button for fix mode */}
          {!showToolSelection && isFixMode && showLinkList && (
            <Button variant="secondary" size="small" onClick={() => setShowLinkList(false)}>
              Retour
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={onClose}>
            {isToolSelectionMode ? 'Fermer' : 'Annuler'}
          </Button>
        </div>
      </div>

      {/* Add Recipe Tool Modal */}
      {showAddToolModal && selectedItem && (
        <AddRecipeToolModal
          inventoryItem={selectedItem}
          onSave={handleAddTool}
          onClose={() => setShowAddToolModal(false)}
        />
      )}
    </div>
  );
}

export default IngredientLinkModal;
