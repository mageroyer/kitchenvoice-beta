/**
 * AddRecipeToolModal Component
 *
 * Modal for creating or editing a recipe tool (custom measurement unit)
 * for an inventory item. Recipe tools allow converting tool measurements
 * like "cup", "sac", "botte" to metric weight for price calculation.
 */

import { useState, useEffect } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import styles from '../../styles/components/addrecipetoolmodal.module.css';

// Common tool suggestions with typical weights
const COMMON_TOOLS = [
  { name: 'cup', abbrev: 'c', defaultWeightG: 240, description: 'Tasse (liquide ~240ml)' },
  { name: 'tablespoon', abbrev: 'tbsp', defaultWeightG: 15, description: 'Cuillère à soupe (~15g)' },
  { name: 'teaspoon', abbrev: 'tsp', defaultWeightG: 5, description: 'Cuillère à thé (~5g)' },
  { name: 'botte', abbrev: 'bt', defaultWeightG: 150, description: 'Botte/bunch (~150g)' },
  { name: 'canne', abbrev: 'cn', defaultWeightG: 796, description: 'Canne #10 (~796g)' },
  { name: 'sac', abbrev: 'sac', defaultWeightG: 907, description: 'Sac 2lb (~907g)' },
  { name: 'caisse', abbrev: 'cs', defaultWeightG: 2270, description: 'Caisse 5lb (~2270g)' },
];

// Convert type options
const CONVERT_TYPE_OPTIONS = [
  { value: 'weight', label: 'Poids (g)' },
  { value: 'volume', label: 'Volume (ml)' },
  { value: 'count', label: 'Compte (pièces)' },
];

/**
 * @param {Object} props
 * @param {Object} props.inventoryItem - The inventory item to add tool to
 * @param {Object} props.existingTool - Tool to edit (null for create mode)
 * @param {Function} props.onSave - Called with tool data on save
 * @param {Function} props.onClose - Called when modal is closed
 */
function AddRecipeToolModal({
  inventoryItem,
  existingTool = null,
  onSave,
  onClose
}) {
  const isEditMode = !!existingTool;

  // Form state
  const [name, setName] = useState(existingTool?.name || '');
  const [abbrev, setAbbrev] = useState(existingTool?.abbrev || '');
  const [weightG, setWeightG] = useState(existingTool?.weightG?.toString() || '');
  const [convertType, setConvertType] = useState(existingTool?.convertType || 'weight');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate abbreviation from name
  useEffect(() => {
    if (!isEditMode && name && !abbrev) {
      // Take first 3 characters or common abbreviation
      const commonTool = COMMON_TOOLS.find(t => t.name === name.toLowerCase());
      if (commonTool) {
        setAbbrev(commonTool.abbrev);
      } else {
        setAbbrev(name.substring(0, 3).toLowerCase());
      }
    }
  }, [name, abbrev, isEditMode]);

  // Handle common tool selection
  const handleSelectCommonTool = (tool) => {
    setName(tool.name);
    setAbbrev(tool.abbrev);
    setWeightG(tool.defaultWeightG.toString());
  };

  // Validate and save
  const handleSave = async () => {
    setError('');

    // Validate
    if (!name.trim()) {
      setError('Le nom est requis');
      return;
    }
    if (!abbrev.trim()) {
      setError('L\'abréviation est requise');
      return;
    }

    const weightValue = parseFloat(weightG);
    if (isNaN(weightValue) || weightValue <= 0) {
      setError('Le poids doit être un nombre positif');
      return;
    }

    setSaving(true);
    try {
      const toolData = {
        name: name.trim().toLowerCase(),
        abbrev: abbrev.trim().toLowerCase(),
        weightG: weightValue,
        convertType,
        source: 'user'
      };

      if (isEditMode) {
        toolData.id = existingTool.id;
      }

      await onSave(toolData);
      onClose();
    } catch (err) {
      console.error('Error saving recipe tool:', err);
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>{isEditMode ? 'Modifier l\'outil' : 'Nouvel outil de mesure'}</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {/* Inventory item context */}
          <div className={styles.contextBox}>
            <span className={styles.label}>Pour l'item:</span>
            <span className={styles.itemName}>{inventoryItem?.name}</span>
            {inventoryItem?.unit && (
              <span className={styles.itemUnit}>({inventoryItem.unit})</span>
            )}
          </div>

          {/* Quick suggestions */}
          {!isEditMode && (
            <div className={styles.suggestions}>
              <span className={styles.suggestionsLabel}>Outils courants:</span>
              <div className={styles.suggestionsList}>
                {COMMON_TOOLS.map((tool) => (
                  <button
                    key={tool.name}
                    type="button"
                    className={styles.suggestionChip}
                    onClick={() => handleSelectCommonTool(tool)}
                    title={tool.description}
                  >
                    {tool.abbrev} ({tool.defaultWeightG}g)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nom de l'outil *</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: cup, sac, botte"
                  size="small"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Abréviation *</label>
                <Input
                  type="text"
                  value={abbrev}
                  onChange={(e) => setAbbrev(e.target.value)}
                  placeholder="ex: c, sac, bt"
                  size="small"
                  maxLength={5}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Équivalent en grammes *</label>
                <div className={styles.weightInput}>
                  <Input
                    type="number"
                    value={weightG}
                    onChange={(e) => setWeightG(e.target.value)}
                    placeholder="ex: 125"
                    size="small"
                    min="0"
                    step="0.1"
                  />
                  <span className={styles.weightUnit}>g</span>
                </div>
                <span className={styles.formHint}>
                  1 {abbrev || 'unité'} = {weightG || '?'}g de {inventoryItem?.name}
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type de conversion</label>
                <Dropdown
                  options={CONVERT_TYPE_OPTIONS}
                  value={convertType}
                  onChange={(e) => setConvertType(e.target.value)}
                  size="small"
                />
              </div>
            </div>
          </div>

          {/* Example calculation */}
          {name && weightG && (
            <div className={styles.exampleBox}>
              <span className={styles.exampleLabel}>Exemple:</span>
              <span className={styles.exampleText}>
                "2 {abbrev}" = {(parseFloat(weightG) * 2 || 0).toFixed(0)}g
                {inventoryItem?.currentPrice > 0 && inventoryItem?.weightPerUnit > 0 && (
                  <> ≈ ${((parseFloat(weightG) * 2 / 1000) * (inventoryItem.currentPrice / (inventoryItem.weightPerUnit / 1000))).toFixed(2)}</>
                )}
              </span>
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" size="small" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={handleSave}
            disabled={saving || !name || !abbrev || !weightG}
          >
            {saving ? 'Enregistrement...' : isEditMode ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AddRecipeToolModal;
