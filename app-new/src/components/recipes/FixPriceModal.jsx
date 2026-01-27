/**
 * FixPriceModal Component
 *
 * Modal for fixing missing pricePerG on inventory items.
 * Shows the source invoice line item and lets user enter weight per unit.
 * Recalculates pricePerG and updates both line item and inventory item.
 */

import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Dropdown from '../common/Dropdown';
import Spinner from '../common/Spinner';

import { invoiceLineDB } from '../../services/database/invoiceDB';
import { inventoryItemDB } from '../../services/database/indexedDB';
import { extractWeightFromName } from '../../utils/format';
import {
  WEIGHT_UNIT_OPTIONS,
  VOLUME_UNIT_OPTIONS,
  ALL_UNIT_OPTIONS,
  getUnitFactorForPrice,
} from '../../utils/unitConversion';

import styles from '../../styles/components/fixpricemodal.module.css';

// Build lookup objects from shared options
const WEIGHT_UNITS = Object.fromEntries(
  WEIGHT_UNIT_OPTIONS.map(u => [u.value, { label: u.label, factor: u.factor }])
);
const VOLUME_UNITS = Object.fromEntries(
  VOLUME_UNIT_OPTIONS.map(u => [u.value, { label: u.label, factor: u.factor }])
);
const UNIT_OPTIONS = ALL_UNIT_OPTIONS;

/**
 * @param {Object} props
 * @param {string} props.inventoryItemId - The inventory item to fix
 * @param {Function} props.onClose - Called when modal is closed
 * @param {Function} props.onFixed - Called when price is successfully fixed
 */
function FixPriceModal({ inventoryItemId, onClose, onFixed }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Data
  const [inventoryItem, setInventoryItem] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [selectedLineItem, setSelectedLineItem] = useState(null);

  // Form fields
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');

  // Auto-extracted weight info
  const [extractedWeight, setExtractedWeight] = useState(null);

  // Calculated preview
  const [preview, setPreview] = useState(null);

  // Load inventory item and related line items
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError('');

      try {
        // Get inventory item
        const item = await inventoryItemDB.getById(inventoryItemId);
        if (!item) {
          setError('Item d\'inventaire introuvable');
          setLoading(false);
          return;
        }
        setInventoryItem(item);

        // Get invoice line items that created/updated this inventory item
        const lines = await invoiceLineDB.getByInventoryItem(inventoryItemId);
        setLineItems(lines);

        // Select the most recent line item by default
        if (lines.length > 0) {
          setSelectedLineItem(lines[0]);
        }

        // Try to auto-extract weight from item name or line item names
        let extracted = null;

        // First try inventory item name
        extracted = extractWeightFromName(item.name);

        // If not found, try line item names
        if (!extracted && lines.length > 0) {
          for (const line of lines) {
            extracted = extractWeightFromName(line.name);
            if (extracted) break;
          }
        }

        // If found, pre-fill the form
        if (extracted) {
          setExtractedWeight(extracted);
          setWeightValue(extracted.value.toString());
          setWeightUnit(extracted.unit);
        }
      } catch (err) {
        console.error('[FixPriceModal] Error loading data:', err);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    if (inventoryItemId) {
      loadData();
    }
  }, [inventoryItemId]);

  // Calculate preview when weight changes
  useEffect(() => {
    if (!selectedLineItem || !weightValue || !weightUnit) {
      setPreview(null);
      return;
    }

    const weight = parseFloat(weightValue);
    if (isNaN(weight) || weight <= 0) {
      setPreview(null);
      return;
    }

    const unitPrice = selectedLineItem.unitPrice || 0;
    const quantity = selectedLineItem.quantity || 1;

    // Convert weight to base units (grams or ml)
    let totalBaseUnits;
    let pricePerG = null;
    let pricePerML = null;
    let baseUnit;

    if (WEIGHT_UNITS[weightUnit]) {
      totalBaseUnits = weight * WEIGHT_UNITS[weightUnit].factor * quantity;
      pricePerG = unitPrice / (weight * WEIGHT_UNITS[weightUnit].factor);
      baseUnit = 'g';
    } else if (VOLUME_UNITS[weightUnit]) {
      totalBaseUnits = weight * VOLUME_UNITS[weightUnit].factor * quantity;
      pricePerML = unitPrice / (weight * VOLUME_UNITS[weightUnit].factor);
      baseUnit = 'ml';
    }

    setPreview({
      weightPerUnit: `${weight} ${weightUnit}`,
      totalWeight: `${(totalBaseUnits / 1000).toFixed(2)} ${baseUnit === 'g' ? 'kg' : 'L'}`,
      pricePerG,
      pricePerML,
      pricePerKg: pricePerG ? pricePerG * 1000 : null,
      pricePerL: pricePerML ? pricePerML * 1000 : null,
      totalBaseUnits,
      baseUnit,
    });
  }, [selectedLineItem, weightValue, weightUnit]);

  // Handle save
  const handleSave = async () => {
    if (!preview || !selectedLineItem) return;

    setSaving(true);
    setError('');

    try {
      const weight = parseFloat(weightValue);

      // 1. Update invoice line item (SOURCE OF TRUTH)
      await invoiceLineDB.update(selectedLineItem.id, {
        // Store weight per unit
        weightPerUnit: weight,
        weightPerUnitUnit: weightUnit,
        // Store total weight
        weight: preview.totalBaseUnits / (WEIGHT_UNITS[weightUnit]?.factor || VOLUME_UNITS[weightUnit]?.factor || 1),
        weightUnit: weightUnit,
        // Store normalized price
        pricePerG: preview.pricePerG ? Math.round(preview.pricePerG * 1000000) / 1000000 : null,
        pricePerML: preview.pricePerML ? Math.round(preview.pricePerML * 1000000) / 1000000 : null,
        totalBaseUnits: preview.totalBaseUnits,
        baseUnit: preview.baseUnit,
      });

      // 2. Update inventory item (DERIVED)
      await inventoryItemDB.update(inventoryItemId, {
        pricePerG: preview.pricePerG ? Math.round(preview.pricePerG * 1000000) / 1000000 : null,
        pricePerML: preview.pricePerML ? Math.round(preview.pricePerML * 1000000) / 1000000 : null,
      });

      // Notify parent
      onFixed?.();
      onClose();
    } catch (err) {
      console.error('[FixPriceModal] Error saving:', err);
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Corriger le prix manquant"
      size="medium"
    >
      <div className={styles.container}>
        {loading ? (
          <div className={styles.loading}>
            <Spinner size="medium" />
            <p>Chargement...</p>
          </div>
        ) : error && !inventoryItem ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            {/* Inventory Item Info */}
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Item d'inventaire</h4>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{inventoryItem?.name}</span>
                {inventoryItem?.vendorName && (
                  <span className={styles.itemVendor}>— {inventoryItem.vendorName}</span>
                )}
                <span className={styles.itemPrice}>
                  Prix: ${inventoryItem?.currentPrice?.toFixed(2) || '0.00'} / {inventoryItem?.unit || 'unité'}
                </span>
              </div>
            </div>

            {/* Invoice Line Items */}
            {lineItems.length === 0 ? (
              <div className={styles.noLines}>
                <p>Aucune facture trouvée pour cet item.</p>
                <p className={styles.hint}>
                  Importez une facture avec cet item pour pouvoir corriger le prix.
                </p>
              </div>
            ) : (
              <>
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>
                    Ligne de facture source
                    {lineItems.length > 1 && ` (${lineItems.length} disponibles)`}
                  </h4>

                  {lineItems.length > 1 && (
                    <div className={styles.lineSelector}>
                      <Dropdown
                        options={lineItems.map((line, idx) => ({
                          value: line.id,
                          label: `${line.name} - ${line.quantity}x @ $${line.unitPrice?.toFixed(2)} (${new Date(line.createdAt).toLocaleDateString()})`,
                        }))}
                        value={selectedLineItem?.id || ''}
                        onChange={(e) => {
                          const line = lineItems.find(l => l.id === e.target.value);
                          setSelectedLineItem(line);
                        }}
                        size="small"
                      />
                    </div>
                  )}

                  {selectedLineItem && (
                    <div className={styles.lineInfo}>
                      <div className={styles.lineRow}>
                        <span className={styles.lineLabel}>Quantité:</span>
                        <span className={styles.lineValue}>
                          {selectedLineItem.quantity} {selectedLineItem.quantityUnit || 'unité(s)'}
                        </span>
                      </div>
                      <div className={styles.lineRow}>
                        <span className={styles.lineLabel}>Prix unitaire:</span>
                        <span className={styles.lineValue}>
                          ${selectedLineItem.unitPrice?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className={styles.lineRow}>
                        <span className={styles.lineLabel}>Unité:</span>
                        <span className={styles.lineValue}>
                          {selectedLineItem.unit || 'Non spécifié'}
                        </span>
                      </div>
                      <div className={styles.lineRow}>
                        <span className={styles.lineLabel}>Poids:</span>
                        <span className={`${styles.lineValue} ${!selectedLineItem.weight ? styles.missing : ''}`}>
                          {selectedLineItem.weight
                            ? `${selectedLineItem.weight} ${selectedLineItem.weightUnit || ''}`
                            : 'NON SPÉCIFIÉ ← à corriger'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Weight Input */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Entrer le poids par unité</h4>
                  {extractedWeight ? (
                    <p className={styles.autoExtracted}>
                      ✓ Extrait automatiquement: <strong>{extractedWeight.original}</strong>
                    </p>
                  ) : (
                    <p className={styles.hint}>
                      Combien pèse chaque {selectedLineItem?.quantityUnit || 'unité'}?
                    </p>
                  )}
                  <div className={styles.weightInput}>
                    <Input
                      type="number"
                      value={weightValue}
                      onChange={(e) => setWeightValue(e.target.value)}
                      placeholder="ex: 2.84"
                      size="small"
                      className={styles.weightNumber}
                      min="0"
                      step="0.01"
                    />
                    <Dropdown
                      options={UNIT_OPTIONS}
                      value={weightUnit}
                      onChange={(e) => setWeightUnit(e.target.value)}
                      size="small"
                      className={styles.weightUnitSelect}
                    />
                    <span className={styles.perUnit}>
                      par {selectedLineItem?.quantityUnit || 'unité'}
                    </span>
                  </div>
                </div>

                {/* Preview */}
                {preview && (
                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Aperçu du calcul</h4>
                    <div className={styles.preview}>
                      <div className={styles.previewRow}>
                        <span>Poids par unité:</span>
                        <span>{preview.weightPerUnit}</span>
                      </div>
                      <div className={styles.previewRow}>
                        <span>Poids total ({selectedLineItem?.quantity}x):</span>
                        <span>{preview.totalWeight}</span>
                      </div>
                      <div className={`${styles.previewRow} ${styles.previewResult}`}>
                        <span>Prix par {preview.baseUnit === 'g' ? 'kg' : 'L'}:</span>
                        <span className={styles.priceResult}>
                          ${(preview.pricePerKg || preview.pricePerL)?.toFixed(2)}
                        </span>
                      </div>
                      <div className={styles.previewRow}>
                        <span>Prix par {preview.baseUnit}:</span>
                        <span>
                          ${(preview.pricePerG || preview.pricePerML)?.toFixed(6)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {error && <div className={styles.errorMessage}>{error}</div>}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !preview || lineItems.length === 0}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer et calculer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default FixPriceModal;
