import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Spinner from '../components/common/Spinner';
import { invoiceDB, invoiceLineDB, vendorDB } from '../services/database/indexedDB';
import {
  getQBStatus,
  getVendors,
  syncInvoiceToQuickBooks,
  connectQuickBooks,
  disconnectQuickBooks,
  getQBEnvironment,
  setQBEnvironment
} from '../services/accounting/quickbooksService';
import styles from '../styles/pages/invoicelistpage.module.css';

// Department colors for visual identification
const DEPARTMENT_COLORS = {
  default: '#e9ecef',
  hot: '#ffebee',
  cold: '#e3f2fd',
  pastry: '#fff3e0',
  bar: '#f3e5f5',
  admin: '#e8f5e9',
};

// Status badge colors - must match INVOICE_STATUS in indexedDB.js
const STATUS_COLORS = {
  draft: { bg: '#e9ecef', text: '#6c757d', label: 'Draft' },
  pending: { bg: '#fff3cd', text: '#856404', label: 'Pending' },
  extracting: { bg: '#cce5ff', text: '#004085', label: 'Extracting' },
  extracted: { bg: '#fff3cd', text: '#856404', label: 'Extracted' },
  reviewed: { bg: '#d4edda', text: '#155724', label: 'Reviewed' },
  processed: { bg: '#d1ecf1', text: '#0c5460', label: 'Processed' },
  sent_to_qb: { bg: '#cce5ff', text: '#004085', label: 'Sent to QB' },
  error: { bg: '#f8d7da', text: '#721c24', label: 'Error' },
  archived: { bg: '#e9ecef', text: '#6c757d', label: 'Archived' },
};

/**
 * Invoice List Page
 *
 * View, filter, and manage saved invoices
 */
function InvoiceListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortBy, setSortBy] = useState('date_desc');

  // Modal state
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedLineItems, setSelectedLineItems] = useState([]);
  const [loadingLineItems, setLoadingLineItems] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  // QuickBooks state
  const [qbConnected, setQbConnected] = useState(false);
  const [qbStatus, setQbStatus] = useState(null);
  const [qbVendors, setQbVendors] = useState([]);
  const [qbEnvironment, setQbEnvironmentState] = useState(getQBEnvironment());
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbLoading, setQbLoading] = useState(true);
  const [syncingInvoice, setSyncingInvoice] = useState(null);
  const [syncSuccess, setSyncSuccess] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [invoiceToSync, setInvoiceToSync] = useState(null);

  // Handle QuickBooks OAuth callback (URL params for fallback, postMessage for popup)
  useEffect(() => {
    // Handle URL params (fallback if popup doesn't work)
    const qbConnectedParam = searchParams.get('qb_connected');
    const qbError = searchParams.get('qb_error');

    if (qbConnectedParam === 'true') {
      setSuccessMessage('Successfully connected to QuickBooks!');
      checkQBConnection();
      // Clean up URL
      searchParams.delete('qb_connected');
      searchParams.delete('qb_env');
      setSearchParams(searchParams, { replace: true });
    }

    if (qbError) {
      setError(`QuickBooks connection failed: ${qbError}`);
      searchParams.delete('qb_error');
      setSearchParams(searchParams, { replace: true });
    }

    // Listen for postMessage from OAuth popup
    const handleMessage = (event) => {
      // Verify origin for security
      if (event.origin !== window.location.origin &&
          !event.origin.includes('smartcookbook-2afe2') &&
          !event.origin.includes('cloudfunctions.net')) {
        return;
      }

      if (event.data?.type === 'QB_CONNECTED') {
        setSuccessMessage('Successfully connected to QuickBooks!');
        checkQBConnection(event.data.environment);
      } else if (event.data?.type === 'QB_ERROR') {
        setError(`QuickBooks connection failed: ${event.data.error}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [searchParams, setSearchParams]);

  // Load data
  useEffect(() => {
    loadData();
    checkQBConnection();
  }, []);

  // Check QuickBooks connection
  const checkQBConnection = async (env = null) => {
    setQbLoading(true);
    try {
      const status = await getQBStatus(env || qbEnvironment);
      setQbStatus(status);
      setQbConnected(status.connected);
      if (status.connected) {
        const vendors = await getVendors(env || qbEnvironment);
        setQbVendors(vendors);
      }
    } catch (err) {
      console.error('QB check error:', err);
      setQbConnected(false);
    } finally {
      setQbLoading(false);
    }
  };

  // Handle environment change
  const handleEnvironmentChange = async (newEnv) => {
    setQBEnvironment(newEnv);
    setQbEnvironmentState(newEnv);
    await checkQBConnection(newEnv);
  };

  // Handle QuickBooks connect
  const handleQBConnect = async () => {
    setQbConnecting(true);
    try {
      await connectQuickBooks(qbEnvironment);
      // User will be redirected to QuickBooks, then back here
    } catch (err) {
      setError('Failed to connect to QuickBooks: ' + err.message);
    }
    setQbConnecting(false);
  };

  // Handle QuickBooks disconnect
  const handleQBDisconnect = async () => {
    if (!confirm('Disconnect from QuickBooks? You will need to re-authorize to sync invoices.')) {
      return;
    }

    setQbLoading(true);
    try {
      await disconnectQuickBooks(qbEnvironment);
      setQbConnected(false);
      setQbStatus({ connected: false });
      setQbVendors([]);
      setSuccessMessage('Disconnected from QuickBooks');
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
    }
    setQbLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoiceData, vendorData] = await Promise.all([
        invoiceDB.getAll(),
        vendorDB.getAll()
      ]);
      setInvoices(invoiceData || []);
      setVendors(vendorData || []);
    } catch (err) {
      console.error('Error loading invoices:', err);
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  // Get vendor name by ID
  const getVendorName = (invoice) => {
    // First check if vendorName is stored on invoice
    if (invoice.vendorName) return invoice.vendorName;
    // Fall back to lookup
    const vendor = vendors.find(v => v.id === invoice.vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(inv =>
        inv.invoiceNumber?.toLowerCase().includes(term) ||
        getVendorName(inv).toLowerCase().includes(term) ||
        inv.departmentName?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(inv => inv.status === statusFilter);
    }

    // Vendor filter
    if (vendorFilter !== 'all') {
      const filterVendorId = parseInt(vendorFilter);
      result = result.filter(inv => inv.vendorId === filterVendorId);
    }

    // Department filter
    if (departmentFilter !== 'all') {
      result = result.filter(inv => inv.department === departmentFilter);
    }

    // Date range filter
    if (dateRange.start) {
      result = result.filter(inv => inv.invoiceDate >= dateRange.start);
    }
    if (dateRange.end) {
      result = result.filter(inv => inv.invoiceDate <= dateRange.end);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return (b.invoiceDate || '').localeCompare(a.invoiceDate || '');
        case 'date_asc':
          return (a.invoiceDate || '').localeCompare(b.invoiceDate || '');
        case 'amount_desc':
          return (b.total || 0) - (a.total || 0);
        case 'amount_asc':
          return (a.total || 0) - (b.total || 0);
        case 'vendor':
          return getVendorName(a).localeCompare(getVendorName(b));
        default:
          return 0;
      }
    });

    return result;
  }, [invoices, searchTerm, statusFilter, vendorFilter, departmentFilter, dateRange, sortBy, vendors]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const pending = filteredInvoices.filter(inv => ['pending', 'extracted'].includes(inv.status)).length;
    const reviewed = filteredInvoices.filter(inv => ['reviewed', 'processed', 'sent_to_qb'].includes(inv.status)).length;
    return { total, count: filteredInvoices.length, pending, reviewed };
  }, [filteredInvoices]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Handle status change
  const handleStatusChange = async (invoiceId, newStatus) => {
    try {
      await invoiceDB.update(invoiceId, { status: newStatus });
      setInvoices(prev => prev.map(inv =>
        inv.id === invoiceId ? { ...inv, status: newStatus } : inv
      ));
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update invoice status');
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!invoiceToDelete) return;
    try {
      await invoiceDB.delete(invoiceToDelete.id);
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceToDelete.id));
      setShowDeleteConfirm(false);
      setInvoiceToDelete(null);
    } catch (err) {
      console.error('Error deleting invoice:', err);
      setError('Failed to delete invoice');
    }
  };

  // View invoice details - load line items from database
  const viewInvoiceDetails = async (invoice) => {
    setSelectedInvoice(invoice);
    setSelectedLineItems([]);
    setLoadingLineItems(true);
    setShowDetailModal(true);

    try {
      // Load line items from invoiceLineItems table
      const lineItems = await invoiceLineDB.getByInvoice(invoice.id);
      setSelectedLineItems(lineItems || []);
    } catch (err) {
      console.error('Error loading line items:', err);
    } finally {
      setLoadingLineItems(false);
    }
  };

  // Sync invoice to QuickBooks
  const handleSyncToQB = async (invoice) => {
    if (!qbConnected) {
      setError('Please connect to QuickBooks first using the button above');
      return;
    }

    setSyncingInvoice(invoice.id);
    setError('');
    setSyncSuccess('');

    try {
      // Prepare invoice data for QB
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        vendorName: getVendorName(invoice),
        date: invoice.invoiceDate,
        items: invoice.parsedItems || []
      };

      const result = await syncInvoiceToQuickBooks(invoiceData, qbVendors);

      // Update invoice status to sent_to_qb
      await invoiceDB.update(invoice.id, {
        status: 'sent_to_qb',
        qbBillId: result.billId,
        qbSyncedAt: new Date().toISOString()
      });

      // Update local state
      setInvoices(prev => prev.map(inv =>
        inv.id === invoice.id
          ? { ...inv, status: 'sent_to_qb', qbBillId: result.billId }
          : inv
      ));

      setSyncSuccess(`Invoice synced to QuickBooks! Bill #${result.billId}`);
      setShowSyncModal(false);

    } catch (err) {
      console.error('QB sync error:', err);
      setError(`Failed to sync: ${err.message}`);
    } finally {
      setSyncingInvoice(null);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setVendorFilter('all');
    setDepartmentFilter('all');
    setDateRange({ start: '', end: '' });
  };

  if (loading) {
    return (
      <div className={styles.invoiceListPage}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.invoiceListPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Invoices</h1>
          <p>Manage vendor invoices and track expenses</p>
        </div>
        <div className={styles.headerRight}>
          {qbLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '10px' }}>
              <Spinner size="small" />
              <span style={{ fontSize: '14px', color: '#666' }}>Checking QB...</span>
            </div>
          ) : qbConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '10px' }}>
              <Badge variant="success" size="medium">
                {qbStatus?.companyName || 'QuickBooks Connected'}
              </Badge>
              <Badge variant={qbEnvironment === 'production' ? 'warning' : 'info'} size="small">
                {qbEnvironment === 'production' ? 'Production' : 'Sandbox'}
              </Badge>
              <Button
                variant="secondary"
                size="small"
                onClick={handleQBDisconnect}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '10px' }}>
              <select
                value={qbEnvironment}
                onChange={(e) => handleEnvironmentChange(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: qbEnvironment === 'production' ? '#E8F5E9' : '#E3F2FD'
                }}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
              <Button
                variant="outline"
                size="small"
                onClick={handleQBConnect}
                disabled={qbConnecting}
              >
                {qbConnecting ? 'Connecting...' : 'Connect QuickBooks'}
              </Button>
            </div>
          )}
          <Button variant="primary" onClick={() => navigate('/invoices/upload')}>
            + Upload Invoice
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" dismissible onDismiss={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {syncSuccess && (
        <Alert variant="success" dismissible onDismiss={() => setSyncSuccess('')}>
          {syncSuccess}
        </Alert>
      )}

      {/* Stats Cards */}
      <div className={styles.stats}>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>{stats.count}</div>
          <div className={styles.statLabel}>Total Invoices</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>{formatCurrency(stats.total)}</div>
          <div className={styles.statLabel}>Total Amount</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.pending}`}>{stats.pending}</div>
          <div className={styles.statLabel}>Pending Review</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.reviewed}`}>{stats.reviewed}</div>
          <div className={styles.statLabel}>Reviewed</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className={styles.filtersCard}>
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <div className={styles.searchWrapper}>
              <Input
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="extracting">Extracting</option>
              <option value="extracted">Extracted</option>
              <option value="reviewed">Reviewed</option>
              <option value="processed">Processed</option>
              <option value="sent_to_qb">Sent to QB</option>
              <option value="error">Error</option>
              <option value="archived">Archived</option>
            </select>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Vendors</option>
              {vendors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Departments</option>
              <option value="default">Cuisine</option>
              <option value="hot">Hot Kitchen</option>
              <option value="cold">Garde Manger</option>
              <option value="pastry">Pastry</option>
              <option value="bar">Bar</option>
              <option value="admin">Administration</option>
            </select>
          </div>
          <div className={styles.filterRow}>
            <div className={styles.dateFilters}>
              <label>From:</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className={styles.dateInput}
              />
              <label>To:</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className={styles.dateInput}
              />
            </div>
            <div className={styles.sortWrapper}>
              <label>Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="date_desc">Date (Newest)</option>
                <option value="date_asc">Date (Oldest)</option>
                <option value="amount_desc">Amount (High-Low)</option>
                <option value="amount_asc">Amount (Low-High)</option>
                <option value="vendor">Vendor (A-Z)</option>
              </select>
            </div>
            {(searchTerm || statusFilter !== 'all' || vendorFilter !== 'all' || departmentFilter !== 'all' || dateRange.start || dateRange.end) && (
              <Button variant="secondary" onClick={clearFilters} style={{ padding: '8px 12px' }}>
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Invoice List */}
      <Card className={styles.tableCard}>
        {filteredInvoices.length === 0 ? (
          <div className={styles.emptyState}>
            {invoices.length === 0 ? (
              <>
                <p>No invoices yet</p>
                <Button variant="primary" onClick={() => navigate('/invoices/upload')}>
                  Upload Your First Invoice
                </Button>
              </>
            ) : (
              <p>No invoices match your filters</p>
            )}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Vendor</th>
                  <th>Date</th>
                  <th>Department</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(invoice => {
                  const statusInfo = STATUS_COLORS[invoice.status] || STATUS_COLORS.pending;
                  const deptColor = DEPARTMENT_COLORS[invoice.department] || DEPARTMENT_COLORS.default;
                  return (
                    <tr key={invoice.id}>
                      <td className={styles.invoiceNumber}>
                        <strong>{invoice.invoiceNumber || '-'}</strong>
                        {invoice.parentInvoiceNumber && (
                          <small>Split from: {invoice.parentInvoiceNumber}</small>
                        )}
                      </td>
                      <td>{getVendorName(invoice)}</td>
                      <td>{formatDate(invoice.invoiceDate)}</td>
                      <td>
                        {invoice.departmentName && (
                          <span
                            className={styles.departmentBadge}
                            style={{ backgroundColor: deptColor }}
                          >
                            {invoice.departmentName}
                          </span>
                        )}
                      </td>
                      <td>{invoice.parsedItems?.length || 0}</td>
                      <td className={styles.amount}>{formatCurrency(invoice.total)}</td>
                      <td>
                        <span
                          className={styles.statusBadge}
                          style={{ backgroundColor: statusInfo.bg, color: statusInfo.text }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className={styles.actions}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            viewInvoiceDetails(invoice);
                          }}
                          title="View Details"
                        >
                          👁️
                        </button>
                        {qbConnected && invoice.status !== 'sent_to_qb' && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.syncBtn}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSyncToQB(invoice);
                            }}
                            disabled={syncingInvoice === invoice.id}
                            title="Sync to QuickBooks"
                          >
                            {syncingInvoice === invoice.id ? '⏳' : '📤'}
                          </button>
                        )}
                        {invoice.qbBillId && (
                          <Badge variant="success" size="small" title={`QB Bill #${invoice.qbBillId}`}>
                            QB
                          </Badge>
                        )}
                        <select
                          value={invoice.status}
                          onChange={(e) => handleStatusChange(invoice.id, e.target.value)}
                          className={styles.statusSelect}
                          title="Change Status"
                        >
                          <option value="draft">Draft</option>
                          <option value="pending">Pending</option>
                          <option value="extracted">Extracted</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="processed">Processed</option>
                          <option value="sent_to_qb">Sent to QB</option>
                          <option value="archived">Archived</option>
                        </select>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setInvoiceToDelete(invoice);
                            setShowDeleteConfirm(true);
                          }}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filteredInvoices.length > 0 && (
          <div className={styles.tableFooter}>
            Showing {filteredInvoices.length} of {invoices.length} invoices
          </div>
        )}
      </Card>

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <Modal isOpen={true}
          title={`Invoice ${selectedInvoice.invoiceNumber || ''}`}
          onClose={() => setShowDetailModal(false)}
          size="large"
        >
          <div className={styles.invoiceDetail}>
            {/* Header Info */}
            <div className={styles.detailSection}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <label>Vendor</label>
                  <span>{getVendorName(selectedInvoice)}</span>
                </div>
                <div className={styles.detailItem}>
                  <label>Date</label>
                  <span>{formatDate(selectedInvoice.invoiceDate)}</span>
                </div>
                <div className={styles.detailItem}>
                  <label>Department</label>
                  <span>{selectedInvoice.departmentName || 'Default'}</span>
                </div>
                <div className={styles.detailItem}>
                  <label>Total</label>
                  <span className={styles.detailAmount}>{formatCurrency(selectedInvoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className={styles.detailSection}>
              <h4>Line Items ({selectedLineItems.length || selectedInvoice.lineCount || 0})</h4>
              {loadingLineItems ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <Spinner size="small" />
                  <p>Loading line items...</p>
                </div>
              ) : selectedLineItems.length > 0 ? (
                <div className={styles.detailItemsTable}>
                  <div className={styles.detailTableHeader}>
                    <span>Item</span>
                    <span>Category</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span>Total</span>
                  </div>
                  <div className={styles.detailTableBody}>
                    {selectedLineItems.map((item, index) => (
                      <div key={item.id || index} className={styles.detailTableRow}>
                        <span>
                          <strong>{item.description || item.name || item.rawDescription}</strong>
                        </span>
                        <span>{item.category || '-'}</span>
                        <span>{item.quantity} {item.unit}</span>
                        <span>{formatCurrency(item.unitPrice)}</span>
                        <span>{formatCurrency(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No line items found for this invoice.</p>
              )}
            </div>

            {/* Notes */}
            {selectedInvoice.notes && (
              <div className={styles.detailSection}>
                <h4>Notes</h4>
                <p className={styles.detailNotes}>{selectedInvoice.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal isOpen={true}
          title="Delete Invoice"
          onClose={() => {
            setShowDeleteConfirm(false);
            setInvoiceToDelete(null);
          }}
          size="small"
        >
          <div className={styles.deleteConfirm}>
            <p>Are you sure you want to delete invoice <strong>{invoiceToDelete?.invoiceNumber}</strong>?</p>
            <p className={styles.deleteWarning}>This action cannot be undone.</p>
            <div className={styles.deleteActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setInvoiceToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete Invoice
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default InvoiceListPage;
