import { useState, useEffect } from 'react';
import { isDemoMode } from '../services/demo/demoService';

/**
 * Custom hook to manage inventory stock alert counts
 * Loads and tracks critical/low stock items for owners
 *
 * @param {boolean} isAuthenticated - Whether user is authenticated
 * @param {boolean} authLoading - Whether auth is still loading
 * @param {boolean} isOwner - Whether user is an owner
 * @returns {{ criticalStockCount: number, lowStockCount: number }}
 */
export function useInventoryAlerts(isAuthenticated, authLoading, isOwner) {
  const [criticalStockCount, setCriticalStockCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    const inDemo = isDemoMode();

    // Only load inventory for owners when authenticated or in demo mode
    if ((!isAuthenticated && !inDemo) || authLoading || !isOwner) {
      setCriticalStockCount(0);
      setLowStockCount(0);
      return;
    }

    const loadInventoryAlerts = async () => {
      try {
        const { getCriticalStockItems, getLowStockItems, STOCK_THRESHOLDS } = await import('../services/inventory/inventoryItemService');

        const [criticalItems, lowItems] = await Promise.all([
          getCriticalStockItems(),
          getLowStockItems(STOCK_THRESHOLDS.LOW)
        ]);

        // Low stock includes critical, so subtract to get unique low count
        const uniqueLowCount = lowItems.filter(item =>
          !criticalItems.some(c => c.id === item.id)
        ).length;

        setCriticalStockCount(criticalItems.length);
        setLowStockCount(uniqueLowCount);
      } catch (error) {
        console.error('Error loading inventory alerts:', error);
        setCriticalStockCount(0);
        setLowStockCount(0);
      }
    };

    loadInventoryAlerts();

    // Reload inventory alerts when inventory data changes
    const handleDataSync = (event) => {
      if (event.detail?.type === 'inventoryItems' || event.detail?.type === 'stockTransactions') {
        loadInventoryAlerts();
      }
    };
    window.addEventListener('dataSync', handleDataSync);

    // Also refresh periodically (every 5 minutes)
    const intervalId = setInterval(loadInventoryAlerts, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('dataSync', handleDataSync);
      clearInterval(intervalId);
    };
  }, [isAuthenticated, authLoading, isOwner]);

  return { criticalStockCount, lowStockCount };
}

export default useInventoryAlerts;
