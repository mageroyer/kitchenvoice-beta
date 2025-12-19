/**
 * InventoryItemAllFieldsModal Component
 *
 * Simple modal that displays ALL fields from an inventory item.
 * Useful for debugging and seeing the complete data structure.
 */

import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { invoiceLineDB } from '../../services/database/invoiceDB';
import styles from '../../styles/components/inventoryitemallfieldsmodal.module.css';

/**
 * Format a value for display
 */
function formatValue(value, key) {
  if (value === null || value === undefined) {
    return <span className={styles.nullValue}>null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className={styles.boolValue}>{value ? 'true' : 'false'}</span>;
  }

  if (typeof value === 'number') {
    // Format prices with more decimals
    if (key.toLowerCase().includes('priceperg') || key.toLowerCase().includes('priceperml')) {
      return <span className={styles.numberValue}>${value.toFixed(6)}</span>;
    }
    if (key.toLowerCase().includes('price')) {
      return <span className={styles.numberValue}>${value.toFixed(2)}</span>;
    }
    return <span className={styles.numberValue}>{value}</span>;
  }

  if (typeof value === 'string') {
    // Check if it's a date string
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('at')) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return <span className={styles.dateValue}>{date.toLocaleString()}</span>;
      }
    }
    return <span className={styles.stringValue}>{value || '(empty)'}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <span className={styles.arrayValue}>
        [{value.length} items]
        {value.length > 0 && value.length <= 5 && (
          <pre className={styles.jsonPreview}>{JSON.stringify(value, null, 2)}</pre>
        )}
      </span>
    );
  }

  if (typeof value === 'object') {
    return (
      <span className={styles.objectValue}>
        <pre className={styles.jsonPreview}>{JSON.stringify(value, null, 2)}</pre>
      </span>
    );
  }

  return String(value);
}

/**
 * Group fields by category for better organization
 */
function categorizeFields(item) {
  const categories = {
    'Identity': ['id', 'name', 'sku', 'barcode'],
    'Vendor': ['vendorId', 'vendorName', 'vendorCode'],
    'Category': ['category', 'subcategory', 'type'],
    'Pricing': ['currentPrice', 'unitPrice', 'pricePerG', 'pricePerML', 'lastPrice', 'averagePrice'],
    'Stock': ['currentStock', 'stockQuantity', 'stockQuantityUnit', 'stockWeight', 'stockWeightUnit', 'parLevel', 'parQuantity', 'parWeight', 'minStock', 'maxStock', 'reorderPoint', 'reorderQuantity'],
    'Unit': ['unit', 'unitType', 'weightPerUnit', 'weightPerUnitUnit'],
    'Dates': ['createdAt', 'updatedAt', 'lastOrdered', 'lastReceived', 'lastCounted', 'expiryDate'],
    'Flags': ['isActive', 'isInternal', 'isPrimaryVendor', 'trackInventory'],
    'Other': [],
  };

  const categorized = {};
  const usedKeys = new Set();

  // Assign fields to categories
  Object.entries(categories).forEach(([category, keys]) => {
    categorized[category] = {};
    keys.forEach(key => {
      if (item.hasOwnProperty(key)) {
        categorized[category][key] = item[key];
        usedKeys.add(key);
      }
    });
  });

  // Add remaining fields to "Other"
  Object.keys(item).forEach(key => {
    if (!usedKeys.has(key)) {
      categorized['Other'][key] = item[key];
    }
  });

  // Remove empty categories
  Object.keys(categorized).forEach(category => {
    if (Object.keys(categorized[category]).length === 0) {
      delete categorized[category];
    }
  });

  return categorized;
}

/**
 * @param {Object} props
 * @param {Object} props.item - The inventory item to display
 * @param {Function} props.onClose - Called when modal is closed
 */
function InventoryItemAllFieldsModal({ item, onClose }) {
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [showInvoiceLines, setShowInvoiceLines] = useState(false);

  // Load invoice line items when requested
  const handleLoadInvoiceLines = async () => {
    if (!item?.id) return;

    setLoadingLines(true);
    try {
      const lines = await invoiceLineDB.getByInventoryItem(item.id);
      setInvoiceLines(lines);
      setShowInvoiceLines(true);
    } catch (err) {
      console.error('[InventoryItemAllFieldsModal] Error loading invoice lines:', err);
    } finally {
      setLoadingLines(false);
    }
  };

  if (!item) return null;

  const categorizedFields = categorizeFields(item);
  const fieldCount = Object.keys(item).length;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${item.name || 'Item'} - All Fields`}
      size="large"
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.fieldCount}>{fieldCount} fields</span>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigator.clipboard.writeText(JSON.stringify(item, null, 2))}
          >
            Copy JSON
          </Button>
        </div>

        <div className={styles.content}>
          {Object.entries(categorizedFields).map(([category, fields]) => (
            <div key={category} className={styles.category}>
              <h4 className={styles.categoryTitle}>{category}</h4>
              <div className={styles.fieldsList}>
                {Object.entries(fields).map(([key, value]) => (
                  <div key={key} className={styles.fieldRow}>
                    <span className={styles.fieldKey}>{key}</span>
                    <span className={styles.fieldValue}>
                      {formatValue(value, key)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Invoice Line Items Section */}
        <div className={styles.invoiceLinesSection}>
          <div className={styles.invoiceLinesHeader}>
            <h4>Related Invoice Line Items</h4>
            {!showInvoiceLines && (
              <Button
                variant="secondary"
                size="small"
                onClick={handleLoadInvoiceLines}
                disabled={loadingLines}
              >
                {loadingLines ? 'Loading...' : 'Load Invoice Lines'}
              </Button>
            )}
          </div>

          {showInvoiceLines && (
            <div className={styles.invoiceLinesList}>
              {invoiceLines.length === 0 ? (
                <p className={styles.noLines}>No invoice line items found for this inventory item.</p>
              ) : (
                invoiceLines.map((line, idx) => (
                  <div key={line.id || idx} className={styles.invoiceLine}>
                    <div className={styles.invoiceLineHeader}>
                      <span className={styles.lineName}>{line.name || 'Unnamed'}</span>
                      <span className={styles.lineDate}>
                        {line.createdAt ? new Date(line.createdAt).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className={styles.invoiceLineFields}>
                      {Object.entries(line).map(([key, value]) => (
                        <div key={key} className={styles.lineFieldRow}>
                          <span className={styles.lineFieldKey}>{key}</span>
                          <span className={styles.lineFieldValue}>
                            {formatValue(value, key)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default InventoryItemAllFieldsModal;
