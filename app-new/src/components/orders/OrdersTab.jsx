/**
 * OrdersTab Component
 *
 * Main container for the Orders tab in the inventory management system.
 * Manages order list, creation, editing, and receiving workflows.
 */

import { memo, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import OrderList from './OrderList';
import OrderDetailModal from './OrderDetailModal';
import OrderEditor from './OrderEditor';
import GenerateOrdersModal from './GenerateOrdersModal';
import ReceiveOrderModal from './ReceiveOrderModal';
import styles from '../../styles/components/orderstab.module.css';

// Import services
import {
  getAllOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  sendOrder,
  receiveOrder,
  cancelOrder,
  submitForApproval,
  approveOrder,
} from '../../services/inventory/purchaseOrderService';
import { getAllVendors, getVendor } from '../../services/inventory/vendorService';
import { getAllItems, getLowStockItems } from '../../services/inventory/inventoryItemService';
import { getBusinessInfo } from '../../services/database/businessService';
import {
  generatePurchaseOrderPDF,
  downloadPDF,
} from '../../services/exports/pdfExportService';

function OrdersTab({ onOrderCreated, onOrderUpdated }) {
  // Data state
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderLines, setSelectedOrderLines] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingLines, setEditingLines] = useState([]);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const [receivingLines, setReceivingLines] = useState([]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load orders and supporting data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [ordersData, vendorsData, itemsData] = await Promise.all([
        getAllOrders(),
        getAllVendors({ isActive: true }),
        getAllItems({ isActive: true }),
      ]);

      setOrders(ordersData || []);
      setVendors(vendorsData || []);
      setInventoryItems(itemsData || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh orders
  const refreshOrders = useCallback(async () => {
    try {
      const ordersData = await getAllOrders();
      setOrders(ordersData || []);
    } catch (err) {
      console.error('Failed to refresh orders:', err);
    }
  }, []);

  // Load low stock items for generate modal
  const loadLowStockItems = useCallback(async () => {
    setGenerateLoading(true);
    try {
      const items = await getLowStockItems();
      setLowStockItems(items || []);
    } catch (err) {
      console.error('Failed to load low stock items:', err);
    } finally {
      setGenerateLoading(false);
    }
  }, []);

  // Order click - show detail modal
  const handleOrderClick = useCallback(async (order) => {
    setSelectedOrder(order);
    setDetailLoading(true);

    try {
      const fullOrder = await getOrder(order.id, { includeLines: true });
      setSelectedOrder(fullOrder);
      setSelectedOrderLines(fullOrder.lines || []);
    } catch (err) {
      console.error('Failed to load order details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Close detail modal
  const handleCloseDetail = useCallback(() => {
    setSelectedOrder(null);
    setSelectedOrderLines([]);
  }, []);

  // Edit order
  const handleEditOrder = useCallback(
    async (order) => {
      setDetailLoading(true);

      try {
        const fullOrder = await getOrder(order.id, { includeLines: true });
        setEditingOrder(fullOrder);
        setEditingLines(fullOrder.lines || []);
        setShowEditor(true);
        setSelectedOrder(null);
      } catch (err) {
        console.error('Failed to load order for editing:', err);
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  // Create new order
  const handleCreateOrder = useCallback(() => {
    setEditingOrder(null);
    setEditingLines([]);
    setShowEditor(true);
  }, []);

  // Close editor
  const handleCloseEditor = useCallback(() => {
    setShowEditor(false);
    setEditingOrder(null);
    setEditingLines([]);
  }, []);

  // Save order (create or update)
  const handleSaveOrder = useCallback(
    async (orderData) => {
      try {
        if (orderData.id) {
          // Update existing order
          await updateOrder(orderData.id, orderData);
          onOrderUpdated?.(orderData);
        } else {
          // Create new order
          const newOrder = await createOrder(orderData.vendorId, {
            ...orderData,
            lines: orderData.lines,
          });
          onOrderCreated?.(newOrder);
        }

        await refreshOrders();
        handleCloseEditor();
      } catch (err) {
        throw err;
      }
    },
    [refreshOrders, handleCloseEditor, onOrderCreated, onOrderUpdated]
  );

  // Send order
  const handleSendOrder = useCallback(
    async (order) => {
      try {
        await sendOrder(order.id, 'email'); // Default to email
        await refreshOrders();
        setSelectedOrder(null);
      } catch (err) {
        console.error('Failed to send order:', err);
      }
    },
    [refreshOrders]
  );

  // Open receive modal
  const handleOpenReceive = useCallback(async (order) => {
    try {
      const fullOrder = await getOrder(order.id, { includeLines: true });
      setReceivingOrder(fullOrder);
      setReceivingLines(fullOrder.lines || []);
      setShowReceiveModal(true);
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to load order for receiving:', err);
    }
  }, []);

  // Close receive modal
  const handleCloseReceive = useCallback(() => {
    setShowReceiveModal(false);
    setReceivingOrder(null);
    setReceivingLines([]);
  }, []);

  // Receive order items
  const handleReceiveItems = useCallback(
    async (order, receivedLines) => {
      try {
        await receiveOrder(order.id, receivedLines);
        await refreshOrders();
        handleCloseReceive();
      } catch (err) {
        throw err;
      }
    },
    [refreshOrders, handleCloseReceive]
  );

  // Cancel order
  const handleCancelOrder = useCallback(
    async (order) => {
      try {
        await cancelOrder(order.id, 'Cancelled by user');
        await refreshOrders();
        setSelectedOrder(null);
      } catch (err) {
        throw err;
      }
    },
    [refreshOrders]
  );

  // Submit for approval
  const handleSubmitForApproval = useCallback(
    async (order) => {
      try {
        await submitForApproval(order.id);
        await refreshOrders();
        // Refresh detail view
        const fullOrder = await getOrder(order.id, { includeLines: true });
        setSelectedOrder(fullOrder);
        setSelectedOrderLines(fullOrder.lines || []);
      } catch (err) {
        console.error('Failed to submit for approval:', err);
      }
    },
    [refreshOrders]
  );

  // Approve order
  const handleApproveOrder = useCallback(
    async (order) => {
      try {
        await approveOrder(order.id);
        await refreshOrders();
        // Refresh detail view
        const fullOrder = await getOrder(order.id, { includeLines: true });
        setSelectedOrder(fullOrder);
        setSelectedOrderLines(fullOrder.lines || []);
      } catch (err) {
        console.error('Failed to approve order:', err);
      }
    },
    [refreshOrders]
  );

  // Open generate orders modal
  const handleOpenGenerate = useCallback(() => {
    loadLowStockItems();
    setShowGenerateModal(true);
  }, [loadLowStockItems]);

  // Close generate modal
  const handleCloseGenerate = useCallback(() => {
    setShowGenerateModal(false);
    setLowStockItems([]);
  }, []);

  // Generate orders from low stock
  const handleGenerateOrders = useCallback(
    async (ordersToCreate) => {
      try {
        for (const orderData of ordersToCreate) {
          await createOrder(orderData.vendorId, {
            vendorName: orderData.vendorName,
            lines: orderData.items,
          });
        }
        await refreshOrders();
        handleCloseGenerate();
      } catch (err) {
        throw err;
      }
    },
    [refreshOrders, handleCloseGenerate]
  );

  // Print/Download order PDF
  const handlePrintOrder = useCallback(async (order) => {
    try {
      // Fetch complete order data including lines
      const orderData = await getOrder(order.id);
      if (!orderData) {
        setError('Order not found');
        return;
      }

      // Fetch vendor details
      const vendor = orderData.vendorId ? await getVendor(orderData.vendorId) : null;

      // Fetch business info for letterhead
      let businessInfo = null;
      try {
        businessInfo = await getBusinessInfo();
      } catch {
        // Business info is optional - continue without it
      }

      // Generate PDF
      const doc = generatePurchaseOrderPDF(
        orderData.order,
        orderData.lines || [],
        vendor,
        businessInfo
      );

      // Download PDF
      const filename = `${orderData.order.orderNumber || 'PO'}_${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPDF(doc, filename);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setError('Failed to generate PDF. Please try again.');
    }
  }, []);

  // Dismiss error
  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Purchase Orders</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleOpenGenerate}
            title="Generate orders from low stock items"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Auto-Generate
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleCreateOrder}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Order
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={loadData}
            title="Refresh orders"
            aria-label="Refresh orders"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={handleDismissError}
            aria-label="Dismiss error"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Order List */}
      <OrderList
        orders={orders}
        loading={loading}
        emptyMessage="No orders yet. Create your first order!"
        onOrderClick={handleOrderClick}
        onOrderEdit={handleEditOrder}
        onOrderSend={handleSendOrder}
        onOrderReceive={handleOpenReceive}
      />

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          lines={selectedOrderLines}
          loading={detailLoading}
          onClose={handleCloseDetail}
          onEdit={handleEditOrder}
          onSend={handleSendOrder}
          onReceive={handleOpenReceive}
          onCancel={handleCancelOrder}
          onApprove={handleApproveOrder}
          onSubmitForApproval={handleSubmitForApproval}
          onPrint={handlePrintOrder}
        />
      )}

      {/* Order Editor Modal */}
      {showEditor && (
        <OrderEditor
          order={editingOrder}
          lines={editingLines}
          vendors={vendors}
          inventoryItems={inventoryItems}
          onSave={handleSaveOrder}
          onClose={handleCloseEditor}
        />
      )}

      {/* Generate Orders Modal */}
      {showGenerateModal && (
        <GenerateOrdersModal
          lowStockItems={lowStockItems}
          vendors={vendors}
          loading={generateLoading}
          onGenerate={handleGenerateOrders}
          onClose={handleCloseGenerate}
        />
      )}

      {/* Receive Order Modal */}
      {showReceiveModal && receivingOrder && (
        <ReceiveOrderModal
          order={receivingOrder}
          lines={receivingLines}
          onReceive={handleReceiveItems}
          onClose={handleCloseReceive}
        />
      )}
    </div>
  );
}

OrdersTab.propTypes = {
  onOrderCreated: PropTypes.func,
  onOrderUpdated: PropTypes.func,
};

export default memo(OrdersTab);
