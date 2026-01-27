import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import { invoiceDB, invoiceLineDB, INVOICE_STATUS, DOCUMENT_TYPE, MATCH_STATUS } from '../services/database/invoiceDB';
import { inventoryItemDB, categoryDB } from '../services/database/indexedDB';
import styles from '../styles/pages/inhouseinvoice.module.css';

/**
 * In-House Invoice Page
 *
 * Create manual invoices for in-house produced items.
 * "Selling to yourself" - track production costs with audit trail.
 *
 * Features:
 * - Manual line item entry (item, qty, unit, price)
 * - Auto-calculate totals
 * - Save as invoice with documentType: 'manual'
 * - Edit existing in-house invoices
 * - Reprocess to update inventory
 */

// Common units for in-house production
const UNITS = ['kg', 'g', 'lb', 'oz', 'L', 'ml', 'ea', 'pc', 'portion', 'batch'];

// Generate invoice reference number
const generateInvoiceNumber = () => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `INH-${dateStr}-${random}`;
};

function InHouseInvoicePage() {
  const navigate = useNavigate();
  const { id } = useParams(); // Invoice ID if editing
  const isEditing = !!id;

  // Invoice header state
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  // Line items state
  const [lineItems, setLineItems] = useState([
    { id: 1, description: '', quantity: '', unit: 'kg', unitPrice: '', category: '' }
  ]);
  const [nextLineId, setNextLineId] = useState(2);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [categories, setCategories] = useState([]);
  const [existingItems, setExistingItems] = useState([]);
  const [showItemSearch, setShowItemSearch] = useState(null); // line id for search dropdown

  // Load data on mount
  useEffect(() => {
    loadInitialData();
    if (isEditing) {
      loadExistingInvoice(id);
    } else {
      setInvoiceNumber(generateInvoiceNumber());
    }
  }, [id]);

  const loadInitialData = async () => {
    try {
      const [cats, items] = await Promise.all([
        categoryDB.getAll(),
        inventoryItemDB.getAll()
      ]);
      setCategories(cats || []);
      setExistingItems(items || []);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const loadExistingInvoice = async (invoiceId) => {
    setLoading(true);
    try {
      const invoice = await invoiceDB.getById(parseInt(invoiceId));
      if (!invoice) {
        setError('Invoice not found');
        return;
      }

      setInvoiceNumber(invoice.invoiceNumber || '');
      setInvoiceDate(invoice.invoiceDate || new Date().toISOString().slice(0, 10));
      setNotes(invoice.notes || '');

      // Load line items
      const lines = await invoiceLineDB.getByInvoice(parseInt(invoiceId));
      if (lines && lines.length > 0) {
        setLineItems(lines.map((line, idx) => ({
          id: idx + 1,
          dbId: line.id,
          description: line.description || '',
          quantity: line.quantity || '',
          unit: line.unit || 'kg',
          unitPrice: line.unitPrice || '',
          category: line.category || '',
          inventoryItemId: line.inventoryItemId || null
        })));
        setNextLineId(lines.length + 1);
      }
    } catch (err) {
      console.error('Error loading invoice:', err);
      setError('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let validLines = 0;

    for (const line of lineItems) {
      const qty = parseFloat(line.quantity) || 0;
      const price = parseFloat(line.unitPrice) || 0;
      if (qty > 0 && price > 0) {
        subtotal += qty * price;
        validLines++;
      }
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      total: Math.round(subtotal * 100) / 100, // No tax for in-house
      validLines
    };
  }, [lineItems]);

  // Add new line item
  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { id: nextLineId, description: '', quantity: '', unit: 'kg', unitPrice: '', category: '' }
    ]);
    setNextLineId(prev => prev + 1);
  };

  // Remove line item
  const removeLineItem = (lineId) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter(line => line.id !== lineId));
  };

  // Update line item field
  const updateLineItem = (lineId, field, value) => {
    setLineItems(prev => prev.map(line =>
      line.id === lineId ? { ...line, [field]: value } : line
    ));
  };

  // Select existing inventory item for a line
  const selectExistingItem = (lineId, item) => {
    setLineItems(prev => prev.map(line =>
      line.id === lineId ? {
        ...line,
        description: item.name,
        unit: item.unit || 'kg',
        unitPrice: item.currentPrice || '',
        category: item.category || '',
        inventoryItemId: item.id
      } : line
    ));
    setShowItemSearch(null);
  };

  // Filter items for search dropdown
  const getFilteredItems = (searchText) => {
    if (!searchText || searchText.length < 2) return [];
    const term = searchText.toLowerCase();
    return existingItems
      .filter(item => item.name?.toLowerCase().includes(term))
      .slice(0, 10);
  };

  // Save invoice
  const handleSave = async (processToInventory = false) => {
    // Validate
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required');
      return;
    }

    const validLines = lineItems.filter(line =>
      line.description.trim() &&
      parseFloat(line.quantity) > 0 &&
      parseFloat(line.unitPrice) > 0
    );

    if (validLines.length === 0) {
      setError('At least one valid line item is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let invoiceId;

      if (isEditing) {
        // Update existing invoice
        await invoiceDB.update(parseInt(id), {
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          notes: notes.trim(),
          subtotal: totals.subtotal,
          total: totals.total,
          lineCount: validLines.length,
          status: processToInventory ? INVOICE_STATUS.PROCESSED : INVOICE_STATUS.REVIEWED
        });
        invoiceId = parseInt(id);

        // Delete existing line items and recreate
        await invoiceLineDB.deleteByInvoice(invoiceId);
      } else {
        // Create new invoice
        invoiceId = await invoiceDB.create({
          vendorId: null,
          vendorName: 'In-House Production',
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          documentType: DOCUMENT_TYPE.MANUAL,
          status: processToInventory ? INVOICE_STATUS.PROCESSED : INVOICE_STATUS.REVIEWED,
          subtotal: totals.subtotal,
          total: totals.total,
          lineCount: validLines.length,
          notes: notes.trim()
        });
      }

      // Create line items
      for (let i = 0; i < validLines.length; i++) {
        const line = validLines[i];
        const qty = parseFloat(line.quantity);
        const price = parseFloat(line.unitPrice);

        const lineData = {
          invoiceId,
          lineNumber: i + 1,
          description: line.description.trim(),
          quantity: qty,
          unit: line.unit,
          unitPrice: price,
          totalPrice: Math.round(qty * price * 100) / 100,
          category: line.category || 'In-House',
          matchStatus: line.inventoryItemId ? MATCH_STATUS.MANUAL_MATCHED : MATCH_STATUS.NEW_ITEM,
          inventoryItemId: line.inventoryItemId || null,
          lineType: 'product',
          forInventory: true,
          forAccounting: true
        };

        const lineId = await invoiceLineDB.create(lineData);

        // Process to inventory if requested
        if (processToInventory) {
          if (line.inventoryItemId) {
            // Update existing inventory item
            await inventoryItemDB.updatePriceFromInvoice(
              line.inventoryItemId,
              price,
              { quantity: qty, invoiceId }
            );
          } else {
            // Create new inventory item
            await invoiceLineDB.createInventoryItemFromLine(lineId, {
              category: line.category || 'In-House',
              isInHouse: true
            });
          }
        }
      }

      setSuccess(processToInventory
        ? 'Invoice saved and items added to inventory!'
        : 'Invoice saved successfully!'
      );

      // Navigate back after short delay
      setTimeout(() => {
        navigate('/invoices');
      }, 1500);

    } catch (err) {
      console.error('Error saving invoice:', err);
      setError('Failed to save invoice: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading invoice...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>{isEditing ? 'Edit In-House Invoice' : 'Create In-House Invoice'}</h1>
          <p>Track in-house production with full audit trail</p>
        </div>
        <div className={styles.headerRight}>
          <Button variant="secondary" onClick={() => navigate('/invoices')}>
            Cancel
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          {success}
        </Alert>
      )}

      {/* Invoice Header Form */}
      <Card className={styles.formCard}>
        <h3>Invoice Details</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label>Invoice Reference</label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INH-20260125-001"
            />
          </div>
          <div className={styles.formGroup}>
            <label>Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Vendor</label>
            <Input
              value="In-House Production"
              disabled
              className={styles.vendorInput}
            />
          </div>
        </div>
      </Card>

      {/* Line Items */}
      <Card className={styles.formCard}>
        <div className={styles.lineItemsHeader}>
          <h3>Line Items</h3>
          <Button variant="secondary" size="small" onClick={addLineItem}>
            + Add Item
          </Button>
        </div>

        <div className={styles.lineItemsTable}>
          <div className={styles.tableHeader}>
            <span className={styles.colDescription}>Item Description</span>
            <span className={styles.colQty}>Qty</span>
            <span className={styles.colUnit}>Unit</span>
            <span className={styles.colPrice}>Unit Price</span>
            <span className={styles.colTotal}>Total</span>
            <span className={styles.colCategory}>Category</span>
            <span className={styles.colActions}></span>
          </div>

          {lineItems.map((line, index) => {
            const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
            const filteredItems = showItemSearch === line.id ? getFilteredItems(line.description) : [];

            return (
              <div key={line.id} className={styles.lineRow}>
                <div className={styles.colDescription}>
                  <div className={styles.searchWrapper}>
                    <Input
                      value={line.description}
                      onChange={(e) => {
                        updateLineItem(line.id, 'description', e.target.value);
                        setShowItemSearch(e.target.value.length >= 2 ? line.id : null);
                      }}
                      onFocus={() => line.description.length >= 2 && setShowItemSearch(line.id)}
                      onBlur={() => setTimeout(() => setShowItemSearch(null), 200)}
                      placeholder="Item name (type to search)"
                    />
                    {filteredItems.length > 0 && (
                      <div className={styles.searchDropdown}>
                        {filteredItems.map(item => (
                          <div
                            key={item.id}
                            className={styles.searchItem}
                            onMouseDown={() => selectExistingItem(line.id, item)}
                          >
                            <span className={styles.itemName}>{item.name}</span>
                            <span className={styles.itemMeta}>
                              {item.category} - {formatCurrency(item.currentPrice)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.colQty}>
                  <Input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => updateLineItem(line.id, 'quantity', e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className={styles.colUnit}>
                  <select
                    value={line.unit}
                    onChange={(e) => updateLineItem(line.id, 'unit', e.target.value)}
                    className={styles.unitSelect}
                  >
                    {UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.colPrice}>
                  <Input
                    type="number"
                    value={line.unitPrice}
                    onChange={(e) => updateLineItem(line.id, 'unitPrice', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className={styles.colTotal}>
                  {formatCurrency(lineTotal)}
                </div>
                <div className={styles.colCategory}>
                  <select
                    value={line.category}
                    onChange={(e) => updateLineItem(line.id, 'category', e.target.value)}
                    className={styles.categorySelect}
                  >
                    <option value="">Select...</option>
                    <option value="In-House">In-House</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.colActions}>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeLineItem(line.id)}
                      title="Remove line"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className={styles.totals}>
          <div className={styles.totalsRow}>
            <span>Subtotal ({totals.validLines} items)</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className={`${styles.totalsRow} ${styles.grandTotal}`}>
            <span>Total</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </Card>

      {/* Notes */}
      <Card className={styles.formCard}>
        <h3>Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Production notes, batch numbers, etc."
          className={styles.notesTextarea}
          rows={3}
        />
      </Card>

      {/* Actions */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => navigate('/invoices')} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={saving || totals.validLines === 0}
        >
          {saving ? 'Saving...' : 'Save as Draft'}
        </Button>
        <Button
          variant="primary"
          onClick={() => handleSave(true)}
          disabled={saving || totals.validLines === 0}
        >
          {saving ? 'Processing...' : 'Save & Add to Inventory'}
        </Button>
      </div>
    </div>
  );
}

export default InHouseInvoicePage;
