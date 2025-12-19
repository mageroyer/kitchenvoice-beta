/**
 * Control Panel - Inventory Tab
 *
 * Wrapper for inventory management with sub-tabs:
 * - Dashboard (Items list)
 * - Vendors
 * - Orders
 * - Invoices (navigates to dedicated page)
 *
 * Extracted from ControlPanelPage for code splitting.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorsTab } from '../../components/vendors';
import { OrdersTab } from '../../components/orders';
import { InventoryDashboard } from '../../components/inventory';
import * as vendorService from '../../services/inventory/vendorService';
import * as purchaseOrderService from '../../services/inventory/purchaseOrderService';
import * as inventoryItemService from '../../services/inventory/inventoryItemService';
import styles from '../../styles/pages/controlpanelpage.module.css';

// Inventory sub-tabs configuration
const INVENTORY_SUB_TABS = [
  { id: 'dashboard', label: 'Items' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'orders', label: 'Orders' },
  { id: 'invoices', label: 'Invoices' },
];

function InventoryTab({
  inventorySubTab,
  onSubTabChange,
}) {
  const navigate = useNavigate();

  // Handle sub-tab change
  const handleSubTabClick = useCallback((subTabId) => {
    // Navigate to dedicated invoice list page instead of inline component
    if (subTabId === 'invoices') {
      navigate('/invoices');
      return;
    }
    onSubTabChange(subTabId);
  }, [navigate, onSubTabChange]);

  return (
    <div className={styles.inventoryTab}>
      {/* Inventory Sub-tabs Navigation */}
      <div className={styles.subTabNav}>
        {INVENTORY_SUB_TABS.map(subTab => (
          <button
            key={subTab.id}
            className={`${styles.subTab} ${inventorySubTab === subTab.id ? styles.active : ''}`}
            onClick={() => handleSubTabClick(subTab.id)}
          >
            {subTab.label}
          </button>
        ))}
      </div>

      {/* Inventory Sub-tab Content */}
      <div className={styles.subTabContent}>
        {/* Dashboard Sub-tab - Shows Inventory Items List */}
        {inventorySubTab === 'dashboard' && (
          <InventoryDashboard
            onItemSelect={(item) => console.log('Selected item:', item)}
            onGenerateOrders={(orders) => console.log('Generated orders:', orders)}
          />
        )}

        {/* Vendors Sub-tab */}
        {inventorySubTab === 'vendors' && (
          <VendorsTab
            getAllVendors={vendorService.getAllVendors}
            getVendor={vendorService.getVendor}
            createVendor={vendorService.createVendor}
            updateVendor={vendorService.updateVendor}
            deleteVendor={vendorService.deleteVendor}
          />
        )}

        {/* Orders Sub-tab */}
        {inventorySubTab === 'orders' && (
          <OrdersTab
            getAllOrders={purchaseOrderService.getAllOrders}
            getOrder={purchaseOrderService.getOrder}
            createOrder={purchaseOrderService.createOrder}
            updateOrder={purchaseOrderService.updateOrder}
            deleteOrder={purchaseOrderService.deleteOrder}
            sendOrder={purchaseOrderService.sendOrder}
            receiveOrder={purchaseOrderService.receiveOrder}
            cancelOrder={purchaseOrderService.cancelOrder}
            submitForApproval={purchaseOrderService.submitForApproval}
            approveOrder={purchaseOrderService.approveOrder}
            getAllVendors={vendorService.getAllVendors}
            getAllItems={inventoryItemService.getAllItems}
            getLowStockItems={inventoryItemService.getLowStockItems}
          />
        )}

        {/* Invoices Sub-tab - navigates to /invoices page */}
      </div>
    </div>
  );
}

export default InventoryTab;
