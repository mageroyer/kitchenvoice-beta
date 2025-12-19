/**
 * InventoryDashboard Component Tests
 *
 * Tests for the main inventory dashboard container component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import InventoryDashboard from '../InventoryDashboard';

// Mock the services
vi.mock('../../../services/inventory/inventoryItemService', () => ({
  getAllItems: vi.fn(),
  searchItems: vi.fn(),
  getCategories: vi.fn(),
  getLowStockItems: vi.fn(),
  getCriticalStockItems: vi.fn(),
  getInventorySummary: vi.fn(),
  getInHouseItems: vi.fn(),
  STOCK_THRESHOLDS: { LOW: 30, CRITICAL: 10 },
}));

vi.mock('../../../services/inventory/vendorService', () => ({
  getAllVendors: vi.fn(),
  getInternalVendor: vi.fn(),
}));

vi.mock('../../../services/inventory/autoOrderService', () => ({
  previewAutoOrders: vi.fn(),
  generateOrdersFromLowStock: vi.fn(),
}));

vi.mock('../../../services/database/indexedDB', () => ({
  departmentDB: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../services/database/businessService', () => ({
  getBusinessInfo: vi.fn().mockResolvedValue({ name: 'Test Business' }),
}));

vi.mock('../../../services/exports/pdfExportService', () => ({
  generateInventoryReportPDF: vi.fn(),
  generateLowStockReportPDF: vi.fn(),
  downloadPDF: vi.fn(),
}));

// Import mocked services
import * as inventoryItemService from '../../../services/inventory/inventoryItemService';
import * as vendorService from '../../../services/inventory/vendorService';

// Sample test data
const mockItems = [
  {
    id: '1',
    name: 'Flour',
    category: 'Dry Goods',
    unit: 'kg',
    currentStock: 5,
    parLevel: 50,
    vendorId: 'v1',
    vendorName: 'Sysco',
  },
  {
    id: '2',
    name: 'Sugar',
    category: 'Dry Goods',
    unit: 'kg',
    currentStock: 15,
    parLevel: 30,
    vendorId: 'v1',
    vendorName: 'Sysco',
  },
  {
    id: '3',
    name: 'Salt',
    category: 'Spices',
    unit: 'kg',
    currentStock: 8,
    parLevel: 10,
    vendorId: 'v2',
    vendorName: 'US Foods',
  },
];

const mockVendors = [
  { id: 'v1', name: 'Sysco' },
  { id: 'v2', name: 'US Foods' },
];

// Categories can be either strings or objects - component handles both defensively
const mockCategories = [
  { id: 'dry-goods', name: 'Dry Goods' },
  { id: 'spices', name: 'Spices' },
];

const mockSummary = {
  totalItems: 3,
  criticalCount: 1,
  lowCount: 1,
  okCount: 1,
};

describe('InventoryDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock implementations
    inventoryItemService.getAllItems.mockResolvedValue(mockItems);
    inventoryItemService.searchItems.mockResolvedValue(mockItems);
    inventoryItemService.getCategories.mockResolvedValue(mockCategories);
    inventoryItemService.getLowStockItems.mockResolvedValue([mockItems[1]]);
    inventoryItemService.getCriticalStockItems.mockResolvedValue([mockItems[0]]);
    inventoryItemService.getInventorySummary.mockResolvedValue(mockSummary);
    inventoryItemService.getInHouseItems.mockResolvedValue([]);
    vendorService.getAllVendors.mockResolvedValue(mockVendors);
    vendorService.getInternalVendor.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading state initially', () => {
      // Make the service call never resolve to keep loading state
      inventoryItemService.getAllItems.mockImplementation(
        () => new Promise(() => {})
      );

      render(<InventoryDashboard />);

      // Spinner has role="status" with aria-label containing "Loading"
      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-label', expect.stringMatching(/loading/i));
    });

    it('shows spinner while loading data', async () => {
      let resolveItems;
      inventoryItemService.getAllItems.mockImplementation(
        () => new Promise((resolve) => { resolveItems = resolve; })
      );

      render(<InventoryDashboard />);

      // Should show loading state
      const loadingContainer = screen.getByRole('status');
      expect(loadingContainer).toBeInTheDocument();

      // Resolve the promise
      resolveItems(mockItems);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  describe('Renders Items', () => {
    it('renders items list after loading', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
        expect(screen.getByText('Sugar')).toBeInTheDocument();
        expect(screen.getByText('Salt')).toBeInTheDocument();
      });
    });

    it('displays correct number of items', async () => {
      render(<InventoryDashboard />);

      // Verify all 3 items are displayed
      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
        expect(screen.getByText('Sugar')).toBeInTheDocument();
        expect(screen.getByText('Salt')).toBeInTheDocument();
      });
    });

    it('shows stock status for items', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        // Look for status indicators
        const criticalBadges = screen.getAllByText(/critical/i);
        expect(criticalBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Empty State', () => {
    it('renders onboarding state when inventory is empty', async () => {
      inventoryItemService.getAllItems.mockResolvedValue([]);
      inventoryItemService.getInventorySummary.mockResolvedValue({
        totalItems: 0,
        criticalCount: 0,
        lowCount: 0,
        okCount: 0,
      });

      render(<InventoryDashboard />);

      // Component shows "Build Your Inventory" for truly empty inventory
      await waitFor(() => {
        expect(screen.getByText(/Build Your Inventory/i)).toBeInTheDocument();
      });
    });

    it('shows filter empty state when filters return no results', async () => {
      // First render with items, then filter to empty
      inventoryItemService.getAllItems.mockResolvedValue([]);
      inventoryItemService.getInventorySummary.mockResolvedValue({
        totalItems: 3, // Has items, just none match filters
        criticalCount: 1,
        lowCount: 1,
        okCount: 1,
      });

      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/No items found matching your filters/i)).toBeInTheDocument();
      });
    });

    it('shows helpful upload message in empty state', async () => {
      inventoryItemService.getAllItems.mockResolvedValue([]);
      inventoryItemService.getInventorySummary.mockResolvedValue({
        totalItems: 0,
        criticalCount: 0,
        lowCount: 0,
        okCount: 0,
      });

      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/populates automatically from invoices/i)).toBeInTheDocument();
      });
    });
  });

  describe('Filters Update List', () => {
    it('filters items by category', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Find and change category filter
      const categorySelect = screen.getByLabelText(/category/i);
      fireEvent.change(categorySelect, { target: { value: 'Spices' } });

      // Component filters client-side, so check items are filtered
      // After filter, Flour (Dry Goods) should not be visible, Salt (Spices) should remain
      await waitFor(() => {
        expect(screen.queryByText('Flour')).not.toBeInTheDocument();
        expect(screen.getByText('Salt')).toBeInTheDocument();
      });
    });

    it('filters items by status', async () => {
      // Mock getCriticalStockItems to return only critical item
      inventoryItemService.getCriticalStockItems.mockResolvedValue([mockItems[0]]);

      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Find status filter by its specific ID
      const statusSelect = document.getElementById('status-filter');
      fireEvent.change(statusSelect, { target: { value: 'critical' } });

      await waitFor(() => {
        expect(inventoryItemService.getCriticalStockItems).toHaveBeenCalled();
      });
    });

    it('accepts search input', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        // Items should be visible after load
        expect(screen.getAllByText('Flour').length).toBeGreaterThan(0);
      });

      // Find search input and verify it exists and accepts input
      const searchInput = screen.getByPlaceholderText(/search/i);
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveValue('');

      // Type in search input
      fireEvent.change(searchInput, { target: { value: 'salt' } });

      // Verify the input value updated
      expect(searchInput).toHaveValue('salt');
    });

    it('refreshes items with refresh button', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Click refresh button
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      // Verify getAllItems was called again
      await waitFor(() => {
        expect(inventoryItemService.getAllItems).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('View Mode Changes', () => {
    it('changes display when view mode changes', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Find view mode button (uses aria-pressed, not tab)
      const byVendorButton = screen.getByRole('button', { name: /by vendor/i });
      fireEvent.click(byVendorButton);

      // Check that view mode changed (uses aria-pressed not aria-selected)
      expect(byVendorButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows by item view by default', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      const byItemButton = screen.getByRole('button', { name: /by item/i });
      expect(byItemButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches to by category view', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      const byCategoryButton = screen.getByRole('button', { name: /by category/i });
      fireEvent.click(byCategoryButton);

      expect(byCategoryButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Item Click Opens Detail', () => {
    it('opens detail modal when item is clicked', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Click on an item
      const flourItem = screen.getByText('Flour').closest('[role="button"]');
      if (flourItem) {
        fireEvent.click(flourItem);
      }

      // Check for detail modal
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('closes detail modal on close button click', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Open detail modal
      const flourItem = screen.getByText('Flour').closest('[role="button"]');
      if (flourItem) {
        fireEvent.click(flourItem);
      }

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close modal
      const closeButton = screen.getByLabelText(/close/i);
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error state when loading fails', async () => {
      inventoryItemService.getAllItems.mockRejectedValue(
        new Error('Failed to load')
      );

      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('allows retry after error', async () => {
      inventoryItemService.getAllItems.mockRejectedValueOnce(
        new Error('Failed to load')
      );
      inventoryItemService.getAllItems.mockResolvedValueOnce(mockItems);

      render(<InventoryDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });

      // Click refresh/retry button
      const refreshButton = screen.getByRole('button', { name: /refresh|retry/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });
    });
  });

  describe('Summary and Data', () => {
    it('loads and displays inventory items with status indicators', async () => {
      render(<InventoryDashboard />);

      await waitFor(() => {
        // All 3 items should be rendered
        expect(screen.getByText('Flour')).toBeInTheDocument();
        expect(screen.getByText('Sugar')).toBeInTheDocument();
        expect(screen.getByText('Salt')).toBeInTheDocument();
      });

      // Verify stock status badges are shown
      const criticalBadges = screen.getAllByText(/critical/i);
      expect(criticalBadges.length).toBeGreaterThan(0);
    });
  });
});
