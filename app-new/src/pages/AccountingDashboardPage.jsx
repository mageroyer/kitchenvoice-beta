/**
 * Accounting Dashboard Page
 *
 * Central hub for accountant to:
 * - View pending invoices
 * - Approve invoices for QuickBooks sync
 * - Monitor price changes
 * - Track QuickBooks sync status
 * - View spending summaries
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Spinner from '../components/common/Spinner';
import Alert from '../components/common/Alert';
import { invoiceDB, invoiceLineDB, inventoryItemDB, priceHistoryDB } from '../services/database/indexedDB';
import {
  getQBStatus,
  syncInvoiceToQuickBooks,
  getVendors,
  getQBEnvironment,
  setQBEnvironment,
  connectQuickBooks,
  disconnectQuickBooks
} from '../services/accounting/quickbooksService';
import styles from '../styles/pages/accountingdashboard.module.css';

function AccountingDashboardPage() {
  const navigate = useNavigate();

  // Data state
  const [invoices, setInvoices] = useState([]);
  const [priceChanges, setPriceChanges] = useState([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    approvedCount: 0,
    exportedCount: 0,
    totalAmount: 0,
    thisMonthAmount: 0
  });

  // QuickBooks state
  const [qbStatus, setQbStatus] = useState(null);
  const [qbVendors, setQbVendors] = useState([]);
  const [qbEnvironment, setQbEnvironmentState] = useState(getQBEnvironment());
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbLoading, setQbLoading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState(new Set());

  // Refs for timer cleanup
  const successTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [allInvoices, recentPrices, qbStatusResult] = await Promise.all([
        invoiceDB.getAll(),
        priceHistoryDB.getRecent(7), // Last 7 days
        getQBStatus().catch(() => ({ connected: false }))
      ]);

      // Set invoices (sorted by date, newest first)
      const sortedInvoices = allInvoices.sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      setInvoices(sortedInvoices);

      // Calculate stats
      const pending = sortedInvoices.filter(i => i.status === 'pending_review');
      const approved = sortedInvoices.filter(i => i.status === 'approved');
      const exported = sortedInvoices.filter(i => i.status === 'exported');

      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      const thisMonthInvoices = sortedInvoices.filter(i =>
        new Date(i.createdAt) >= thisMonth
      );

      setStats({
        pendingCount: pending.length,
        approvedCount: approved.length,
        exportedCount: exported.length,
        totalAmount: sortedInvoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0),
        thisMonthAmount: thisMonthInvoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0)
      });

      // Set price changes with inventory item names
      const priceChangesWithNames = await Promise.all(
        recentPrices.slice(0, 10).map(async (pc) => {
          const item = pc.inventoryItemId ? await inventoryItemDB.getById(pc.inventoryItemId) : null;
          return {
            ...pc,
            itemName: item?.name || 'Unknown'
          };
        })
      );
      setPriceChanges(priceChangesWithNames);

      // Set QB status
      setQbStatus(qbStatusResult);

      // Load QB vendors if connected
      if (qbStatusResult?.connected) {
        try {
          const vendors = await getVendors();
          setQbVendors(vendors);
        } catch (err) {
          console.error('Error loading vendors:', err);
        }
      }

    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Handle QB environment change
  const handleEnvironmentChange = async (newEnv) => {
    setQBEnvironment(newEnv);
    setQbEnvironmentState(newEnv);
    setQbLoading(true);
    try {
      const status = await getQBStatus(newEnv);
      setQbStatus(status);
      if (status?.connected) {
        const vendors = await getVendors(newEnv);
        setQbVendors(vendors);
      }
    } catch (err) {
      console.error('Error loading QB status:', err);
      setQbStatus({ connected: false });
    }
    setQbLoading(false);
  };

  // Handle QB connect
  const handleQBConnect = async () => {
    setQbConnecting(true);
    try {
      await connectQuickBooks(qbEnvironment);
    } catch (err) {
      setError('Failed to connect to QuickBooks: ' + err.message);
    }
    setQbConnecting(false);
  };

  // Handle QB disconnect
  const handleQBDisconnect = async () => {
    if (!confirm('Disconnect from QuickBooks? You will need to re-authorize to sync invoices.')) {
      return;
    }
    setQbLoading(true);
    try {
      await disconnectQuickBooks(qbEnvironment);
      setQbStatus({ connected: false });
      setQbVendors([]);
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
    }
    setQbLoading(false);
  };

  // Approve invoice
  const handleApprove = async (invoiceId) => {
    try {
      await invoiceDB.update(invoiceId, { status: 'approved' });
      setInvoices(prev => prev.map(i =>
        i.id === invoiceId ? { ...i, status: 'approved' } : i
      ));
      setStats(prev => ({
        ...prev,
        pendingCount: prev.pendingCount - 1,
        approvedCount: prev.approvedCount + 1
      }));
      setSuccess('Invoice approved');
      successTimerRef.current = setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to approve invoice');
    }
  };

  // Bulk approve selected invoices
  const handleBulkApprove = async () => {
    if (selectedInvoices.size === 0) return;

    try {
      for (const invoiceId of selectedInvoices) {
        await invoiceDB.update(invoiceId, { status: 'approved' });
      }

      setInvoices(prev => prev.map(i =>
        selectedInvoices.has(i.id) ? { ...i, status: 'approved' } : i
      ));

      const count = selectedInvoices.size;
      setStats(prev => ({
        ...prev,
        pendingCount: prev.pendingCount - count,
        approvedCount: prev.approvedCount + count
      }));

      setSelectedInvoices(new Set());
      setSuccess(`${count} invoices approved`);
      successTimerRef.current = setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to approve invoices');
    }
  };

  // Sync invoice to QuickBooks
  const handleSyncToQB = async (invoice) => {
    if (!qbStatus?.connected) {
      setError('QuickBooks not connected. Go to Settings to connect.');
      return;
    }

    setSyncing(prev => ({ ...prev, [invoice.id]: true }));
    setError('');

    try {
      // Load line items from database (they have forAccounting, lineType, etc.)
      const lineItems = await invoiceLineDB.getByInvoice(invoice.id);

      const result = await syncInvoiceToQuickBooks({
        vendorName: invoice.vendorName,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.invoiceDate,
        lineItems: lineItems || [],
        totals: {
          subtotal: invoice.subtotal,
          total: invoice.total || invoice.totalAmount,
        }
      }, qbVendors);

      // Update invoice with QB bill ID
      await invoiceDB.update(invoice.id, {
        status: 'exported',
        qbBillId: result.billId,
        qbSyncedAt: new Date().toISOString()
      });

      setInvoices(prev => prev.map(i =>
        i.id === invoice.id
          ? { ...i, status: 'exported', qbBillId: result.billId }
          : i
      ));

      setStats(prev => ({
        ...prev,
        approvedCount: prev.approvedCount - 1,
        exportedCount: prev.exportedCount + 1
      }));

      setSuccess(`Invoice synced to QuickBooks (Bill #${result.billId})`);
      successTimerRef.current = setTimeout(() => setSuccess(''), 3000);

    } catch (err) {
      console.error('QB sync error:', err);
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(prev => ({ ...prev, [invoice.id]: false }));
    }
  };

  // Toggle invoice selection
  const toggleSelect = (invoiceId) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  };

  // Select all pending
  const selectAllPending = () => {
    const pendingIds = invoices
      .filter(i => i.status === 'pending_review')
      .map(i => i.id);
    setSelectedInvoices(new Set(pendingIds));
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-CA', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Get status badge variant
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="warning">En attente</Badge>;
      case 'approved':
        return <Badge variant="info">Approuvé</Badge>;
      case 'exported':
        return <Badge variant="success">Exporté</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Calculate price change percentage
  const getPriceChangePercent = (pc) => {
    if (!pc.previousPrice || pc.previousPrice === 0) return null;
    return ((pc.price - pc.previousPrice) / pc.previousPrice * 100).toFixed(1);
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" />
        <p>Chargement du tableau de bord...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Tableau de bord comptable</h1>
          <p className={styles.subtitle}>Gérer les factures et suivre les coûts</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            onClick={() => navigate('/invoices/upload')}
          >
            + Nouvelle facture
          </Button>
          <Button
            variant="outline"
            onClick={loadDashboardData}
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <div className={styles.statIcon}>📋</div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.pendingCount}</span>
            <span className={styles.statLabel}>En attente</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statIcon}>✓</div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.approvedCount}</span>
            <span className={styles.statLabel}>Approuvés</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statIcon}>📤</div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{stats.exportedCount}</span>
            <span className={styles.statLabel}>Exportés</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statIcon}>💰</div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{formatCurrency(stats.thisMonthAmount)}</span>
            <span className={styles.statLabel}>Ce mois</span>
          </div>
        </Card>
      </div>

      <div className={styles.mainGrid}>
        {/* Invoices Section */}
        <div className={styles.invoicesSection}>
          <Card>
            <div className={styles.sectionHeader}>
              <h2>Factures</h2>
              <div className={styles.sectionActions}>
                {selectedInvoices.size > 0 && (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleBulkApprove}
                  >
                    Approuver ({selectedInvoices.size})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="small"
                  onClick={selectAllPending}
                  disabled={stats.pendingCount === 0}
                >
                  Sélectionner tout
                </Button>
              </div>
            </div>

            {invoices.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📄</span>
                <p>Aucune facture</p>
                <Button
                  variant="primary"
                  onClick={() => navigate('/invoices/upload')}
                >
                  Importer une facture
                </Button>
              </div>
            ) : (
              <div className={styles.invoicesList}>
                {invoices.slice(0, 20).map(invoice => (
                  <div
                    key={invoice.id}
                    className={`${styles.invoiceRow} ${selectedInvoices.has(invoice.id) ? styles.selected : ''}`}
                  >
                    {invoice.status === 'pending_review' && (
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(invoice.id)}
                        onChange={() => toggleSelect(invoice.id)}
                        className={styles.checkbox}
                      />
                    )}
                    <div className={styles.invoiceInfo}>
                      <span className={styles.invoiceVendor}>
                        {invoice.vendorName || 'Fournisseur inconnu'}
                      </span>
                      <span className={styles.invoiceNumber}>
                        #{invoice.invoiceNumber || '—'}
                      </span>
                    </div>
                    <span className={styles.invoiceDate}>
                      {formatDate(invoice.invoiceDate || invoice.createdAt)}
                    </span>
                    <span className={styles.invoiceAmount}>
                      {formatCurrency(invoice.totalAmount)}
                    </span>
                    {getStatusBadge(invoice.status)}
                    <div className={styles.invoiceActions}>
                      {invoice.status === 'pending_review' && (
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() => handleApprove(invoice.id)}
                        >
                          Approuver
                        </Button>
                      )}
                      {invoice.status === 'approved' && qbStatus?.connected && (
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => handleSyncToQB(invoice)}
                          loading={syncing[invoice.id]}
                          disabled={syncing[invoice.id]}
                        >
                          {syncing[invoice.id] ? 'Sync...' : 'QB Sync'}
                        </Button>
                      )}
                      {invoice.status === 'exported' && invoice.qbBillId && (
                        <span className={styles.qbBillId}>
                          QB #{invoice.qbBillId}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        Voir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {invoices.length > 20 && (
              <div className={styles.viewAll}>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/invoices')}
                >
                  Voir toutes les factures ({invoices.length})
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          {/* QuickBooks Status */}
          <Card className={styles.qbCard}>
            <div className={styles.qbHeader}>
              <div className={styles.qbTitleRow}>
                <span className={styles.qbIcon}>📊</span>
                <h3>QuickBooks Online</h3>
              </div>
              {qbStatus?.connected && (
                <Badge variant="success">Connecté</Badge>
              )}
            </div>
            <p className={styles.qbSubtitle}>
              Connectez QuickBooks pour synchroniser les factures et suivre les dépenses
            </p>

            {/* Environment Toggle */}
            <div className={styles.envSection}>
              <label className={styles.envLabel}>Environment</label>
              <div className={styles.envOptions}>
                <label className={`${styles.envOption} ${qbEnvironment === 'sandbox' ? '' : styles.envUnselected}`}>
                  <input
                    type="radio"
                    name="qb-env"
                    value="sandbox"
                    checked={qbEnvironment === 'sandbox'}
                    onChange={() => handleEnvironmentChange('sandbox')}
                    disabled={qbLoading}
                  />
                  <div className={styles.envContent}>
                    <span className={styles.envName}>Sandbox</span>
                    <span className={styles.envDesc}>Test avec données fictives</span>
                  </div>
                </label>
                <label className={`${styles.envOption} ${qbEnvironment === 'production' ? styles.envSelected : styles.envUnselected}`}>
                  <input
                    type="radio"
                    name="qb-env"
                    value="production"
                    checked={qbEnvironment === 'production'}
                    onChange={() => handleEnvironmentChange('production')}
                    disabled={qbLoading}
                  />
                  <div className={styles.envContent}>
                    <span className={styles.envName}>Production</span>
                    <span className={styles.envDesc}>Données QuickBooks réelles</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Connection Status */}
            {qbLoading ? (
              <div className={styles.qbLoading}>
                <Spinner size="small" />
                <span>Chargement...</span>
              </div>
            ) : qbStatus?.connected ? (
              <div className={styles.qbConnectedBox}>
                <div className={styles.qbConnectedHeader}>
                  <span className={styles.qbCheckIcon}>✓</span>
                  <span>Connecté à <strong>{qbStatus.companyName}</strong></span>
                </div>
                <ul className={styles.qbFeatureList}>
                  <li><span className={styles.checkmark}>✓</span> Créer automatiquement des factures à partir des factures analysées</li>
                  <li><span className={styles.checkmark}>✓</span> Synchroniser fournisseurs/vendeurs</li>
                  <li><span className={styles.checkmark}>✓</span> Mapper les départements aux comptes de dépenses</li>
                </ul>
                <div className={styles.qbActions}>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => navigate('/invoices')}
                  >
                    Tableau de bord factures
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={handleQBDisconnect}
                  >
                    Déconnecter
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.qbDisconnectedBox}>
                <p className={styles.qbDisconnectedText}>
                  Connectez votre compte QuickBooks pour créer automatiquement des factures à partir des factures analysées.
                </p>
                <ul className={styles.qbFeatureList}>
                  <li><span className={styles.checkmark}>✓</span> Créer automatiquement des factures</li>
                  <li><span className={styles.checkmark}>✓</span> Synchroniser fournisseurs/vendeurs</li>
                  <li><span className={styles.checkmark}>✓</span> Mapper départements aux comptes</li>
                </ul>
                <Button
                  variant="primary"
                  onClick={handleQBConnect}
                  loading={qbConnecting}
                  disabled={qbConnecting}
                  className={styles.qbConnectBtn}
                >
                  {qbConnecting ? 'Connexion...' : 'Connect to QuickBooks'}
                </Button>
              </div>
            )}
          </Card>

          {/* Price Changes */}
          <Card className={styles.priceCard}>
            <h3>Changements de prix (7 jours)</h3>
            {priceChanges.length === 0 ? (
              <p className={styles.noPriceChanges}>Aucun changement récent</p>
            ) : (
              <div className={styles.priceList}>
                {priceChanges.map(pc => {
                  const changePercent = getPriceChangePercent(pc);
                  const isUp = changePercent > 0;
                  return (
                    <div key={pc.id} className={styles.priceRow}>
                      <span className={styles.priceName}>{pc.itemName}</span>
                      <div className={styles.priceChange}>
                        <span className={styles.priceValue}>
                          {formatCurrency(pc.price)}/kg
                        </span>
                        {changePercent !== null && (
                          <span className={`${styles.pricePercent} ${isUp ? styles.up : styles.down}`}>
                            {isUp ? '▲' : '▼'} {Math.abs(changePercent)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              variant="ghost"
              size="small"
              onClick={() => navigate('/ingredients')}
              className={styles.viewAllBtn}
            >
              Voir tous les ingrédients
            </Button>
          </Card>

          {/* Quick Actions */}
          <Card className={styles.actionsCard}>
            <h3>Actions rapides</h3>
            <div className={styles.quickActions}>
              <Button
                variant="outline"
                onClick={() => navigate('/invoices/upload')}
                className={styles.actionBtn}
              >
                📄 Importer facture
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/ingredients')}
                className={styles.actionBtn}
              >
                🥕 Ingrédients
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/recipes')}
                className={styles.actionBtn}
              >
                📖 Recettes
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AccountingDashboardPage;
