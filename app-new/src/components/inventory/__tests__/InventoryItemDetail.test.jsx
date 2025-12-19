/**
 * InventoryItemDetail Component Tests
 *
 * Tests for the inventory item detail modal component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InventoryItemDetail from '../InventoryItemDetail';

// Mock the inventory item service
vi.mock('../../../services/inventory/inventoryItemService', () => ({
  getItem: vi.fn(),
  getItemStockHistory: vi.fn(),
}));

import { getItem, getItemStockHistory } from '../../../services/inventory/inventoryItemService';

// Mock item data that matches what the component expects to load
const mockItemData = {
  id: 'item-123',
  name: 'All-Purpose Flour',
  sku: 'FLR-AP-001',
  category: 'Dry Goods',
  unit: 'kg',
  currentStock: 15,
  parLevel: 50,
  minStock: 10,
  reorderPoint: 20,
  reorderQuantity: 30,
  unitPrice: 2.50,
  vendorId: 'v1',
  vendorName: 'Sysco Foods',
  location: 'Dry Storage - Shelf A3',
  barcode: '123456789012',
  notes: 'Store in cool, dry place.',
  alternateVendors: [
    { id: 'v2', name: 'US Foods', price: 2.65 },
  ],
};

const mockTransactions = [
  {
    id: 't1',
    type: 'received',
    quantity: 20,
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    user: 'John Smith',
    notes: 'Regular delivery',
    vendorName: 'Sysco Foods',
  },
  {
    id: 't2',
    type: 'used',
    quantity: -8,
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    user: 'Kitchen Staff',
    notes: 'Daily prep',
  },
];

describe('InventoryItemDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock implementations
    getItem.mockResolvedValue(mockItemData);
    getItemStockHistory.mockResolvedValue(mockTransactions);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Loads Item Data', () => {
    it('shows loading state initially', () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays item name after loading', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });
    });

    it('displays SKU after loading', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/FLR-AP-001/)).toBeInTheDocument();
      });
    });

    it('displays category after loading', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Dry Goods/)).toBeInTheDocument();
      });
    });
  });

  describe('Shows All Fields', () => {
    it('shows stock level section', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/stock level/i)).toBeInTheDocument();
      });
    });

    it('shows current stock value', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for item to load first
      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Current stock stats are shown (there may be multiple "Current" elements)
      const currentLabels = screen.getAllByText(/Current/);
      expect(currentLabels.length).toBeGreaterThan(0);
    });

    it('shows par level', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for item to load first
      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Par level is shown in the stats
      expect(screen.getByText(/Par Level/)).toBeInTheDocument();
    });

    it('shows vendor section', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for item to load first
      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Then check for vendor section header
      expect(screen.getByText('Vendor')).toBeInTheDocument();
    });

    it('shows pricing section', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for item to load first
      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Then check for pricing section header
      expect(screen.getByText('Pricing')).toBeInTheDocument();
    });

    it('shows location when available', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Dry Storage/)).toBeInTheDocument();
      });
    });

    it('shows notes when available', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Store in cool/)).toBeInTheDocument();
      });
    });

    it('shows progress bar for stock level', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });
  });

  describe('Shows Recent Transactions', () => {
    it('displays transactions section', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/recent transactions/i)).toBeInTheDocument();
      });
    });

    it('shows transaction entries', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for item to load first
      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Look for transaction type badges (Received or Used)
      const receivedBadges = screen.queryAllByText(/received/i);
      const usedBadges = screen.queryAllByText(/used/i);
      expect(receivedBadges.length + usedBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Edit Button Works', () => {
    it('shows edit button', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /edit/i })
        ).toBeInTheDocument();
      });
    });

    it('calls onEdit when edit button clicked', async () => {
      const onEdit = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={onEdit}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: /edit/i });
      fireEvent.click(editButton);

      expect(onEdit).toHaveBeenCalled();
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'All-Purpose Flour',
        })
      );
    });

    it('hides edit button when onEdit not provided', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      expect(
        screen.queryByRole('button', { name: /edit item/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Adjust Stock Button Works', () => {
    it('shows adjust stock button', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /adjust.*stock/i })
        ).toBeInTheDocument();
      });
    });

    it('calls onAdjustStock when button clicked', async () => {
      const onAdjustStock = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={onAdjustStock}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /adjust.*stock/i })
        ).toBeInTheDocument();
      });

      const adjustButton = screen.getByRole('button', { name: /adjust.*stock/i });
      fireEvent.click(adjustButton);

      expect(onAdjustStock).toHaveBeenCalled();
      expect(onAdjustStock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'All-Purpose Flour',
        })
      );
    });
  });

  describe('Delete Confirmation', () => {
    it('shows delete button when onDelete provided', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete/i })
        ).toBeInTheDocument();
      });
    });

    it('shows confirmation modal when delete clicked', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
      });
    });

    it('calls onDelete when delete confirmed', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={onClose}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
          onDelete={onDelete}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      // Click delete button
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for confirmation modal
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      // Find confirm delete button - there are two "Delete" buttons,
      // but the confirm button appears after the cancel button in the DOM
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      const confirmButton = deleteButtons[deleteButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalled();
      });
    });

    it('cancels delete when cancel clicked', async () => {
      const onDelete = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
          onDelete={onDelete}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      // Click delete button
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for confirmation modal
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      // Cancel delete
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Confirmation should close
      await waitFor(() => {
        expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
      });

      // Delete should not have been called
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe('Close Works', () => {
    it('calls onClose when close button clicked', async () => {
      const onClose = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={onClose}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Close button should be visible immediately
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when escape key pressed', async () => {
      const onClose = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={onClose}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop clicked', async () => {
      const onClose = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={onClose}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // The overlay div is the dialog - clicking it directly (not on children) triggers close
      const overlay = screen.getByRole('dialog');
      // Simulate clicking directly on the overlay (target === currentTarget)
      fireEvent.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when modal content clicked', async () => {
      const onClose = vi.fn();

      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={onClose}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All-Purpose Flour')).toBeInTheDocument();
      });

      // Click on modal content (role="document") - not the overlay
      const modalContent = screen.getByRole('document');
      fireEvent.click(modalContent);

      // onClose is NOT called because click was on modal content, not overlay
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has dialog role', () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // The overlay div has role="dialog" and aria-modal="true"
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-labelledby for title', async () => {
      render(
        <InventoryItemDetail
          itemId="item-123"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // The overlay div has role="dialog" and aria-labelledby
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'item-detail-title');
    });
  });

  describe('Error State', () => {
    it('handles loading failure gracefully', async () => {
      // When getItem fails, the component's defensive loading function catches
      // the error and returns null, so no error message is shown - just no data
      getItem.mockRejectedValue(new Error('Item not found'));
      getItemStockHistory.mockResolvedValue([]);

      render(
        <InventoryItemDetail
          itemId="invalid-id"
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onAdjustStock={vi.fn()}
        />
      );

      // Wait for loading to finish
      await waitFor(() => {
        // Loading text should disappear
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // No item data should be shown (item is null)
      expect(screen.queryByText('All-Purpose Flour')).not.toBeInTheDocument();
    });
  });
});
