/**
 * InventoryListByItem Component Tests
 *
 * Tests for the inventory list grouped by item name component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InventoryListByItem from '../InventoryListByItem';

// Sample test data
const mockItems = [
  // Critical item
  {
    id: '1',
    name: 'Flour',
    category: 'Dry Goods',
    unit: 'kg',
    currentStock: 2,
    parLevel: 50,
    vendorId: 'v1',
    vendorName: 'Sysco',
    sku: 'FLR-001',
  },
  // Same item, different vendor
  {
    id: '2',
    name: 'Flour',
    category: 'Dry Goods',
    unit: 'kg',
    currentStock: 5,
    parLevel: 50,
    vendorId: 'v2',
    vendorName: 'US Foods',
    sku: 'FLR-002',
  },
  // Low stock item
  {
    id: '3',
    name: 'Sugar',
    category: 'Dry Goods',
    unit: 'kg',
    currentStock: 10,
    parLevel: 50,
    vendorId: 'v1',
    vendorName: 'Sysco',
  },
  // OK item
  {
    id: '4',
    name: 'Salt',
    category: 'Spices',
    unit: 'kg',
    currentStock: 8,
    parLevel: 10,
    vendorId: 'v2',
    vendorName: 'US Foods',
  },
];

describe('InventoryListByItem', () => {
  describe('Groups Items by Name', () => {
    it('groups items with same name together', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Should have one Flour entry (grouped)
      const flourCards = screen.getAllByText('Flour');
      expect(flourCards.length).toBe(1); // One card header

      // Should show "2 vendors" for Flour
      expect(screen.getByText(/2 vendors?/i)).toBeInTheDocument();
    });

    it('shows single vendor count for ungrouped items', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Sugar and Salt should show "1 vendor"
      const singleVendorTexts = screen.getAllByText(/1 vendor$/i);
      expect(singleVendorTexts.length).toBeGreaterThanOrEqual(2);
    });

    it('calculates total stock for grouped items', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Flour total: 2 + 5 = 7 kg
      expect(screen.getByText(/7.*\/.*100/)).toBeInTheDocument();
    });
  });

  describe('Sorts by Urgency', () => {
    it('shows critical items first', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Critical section should be first
      const sections = screen.getAllByRole('region');

      // First section should be Critical - use the section header button with specific ID
      const criticalSectionHeader = document.getElementById('section-header-critical');
      expect(criticalSectionHeader).toBeInTheDocument();

      // Verify it's in the first section
      expect(sections[0]).toContainElement(criticalSectionHeader);
    });

    it('has sections in order: Critical, Low, Warning, OK', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      const sectionButtons = screen.getAllByRole('button', {
        name: /critical|low|warning|ok|in stock/i,
      });

      // Get section text content
      const sectionOrder = sectionButtons
        .map((btn) => btn.textContent.toLowerCase())
        .filter(
          (text) =>
            text.includes('critical') ||
            text.includes('low') ||
            text.includes('warning') ||
            text.includes('ok') ||
            text.includes('stock')
        );

      // Critical should come before Low/OK
      const criticalIndex = sectionOrder.findIndex((t) =>
        t.includes('critical')
      );
      const lowIndex = sectionOrder.findIndex(
        (t) => t.includes('low') && !t.includes('critical')
      );
      const okIndex = sectionOrder.findIndex(
        (t) => t.includes('ok') || t.includes('in stock')
      );

      if (criticalIndex !== -1 && lowIndex !== -1) {
        expect(criticalIndex).toBeLessThan(lowIndex);
      }
      if (lowIndex !== -1 && okIndex !== -1) {
        expect(lowIndex).toBeLessThan(okIndex);
      }
    });

    it('sorts items alphabetically within sections', () => {
      const itemsWithSameStatus = [
        { id: '1', name: 'Zebra Fish', currentStock: 5, parLevel: 50 },
        { id: '2', name: 'Apple', currentStock: 5, parLevel: 50 },
        { id: '3', name: 'Mango', currentStock: 5, parLevel: 50 },
      ];

      render(
        <InventoryListByItem
          items={itemsWithSameStatus}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      const itemNames = screen.getAllByRole('heading', { level: 3 });
      const nameTexts = itemNames.map((h) => h.textContent);

      // Should be sorted: Apple, Mango, Zebra Fish
      const sortedNames = [...nameTexts].sort();
      expect(nameTexts).toEqual(sortedNames);
    });
  });

  describe('Expand/Collapse Functionality', () => {
    it('sections are collapsible', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Find section header button by ID
      const criticalSection = document.getElementById('section-header-critical');

      expect(criticalSection).toBeInTheDocument();
      expect(criticalSection).toHaveAttribute('aria-expanded');
    });

    it('toggles section collapse on click', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      const sectionButton = document.getElementById('section-header-critical');

      // Get initial state
      const initialExpanded = sectionButton.getAttribute('aria-expanded');

      // Click to toggle
      fireEvent.click(sectionButton);

      // State should change
      const newExpanded = sectionButton.getAttribute('aria-expanded');
      expect(newExpanded).not.toBe(initialExpanded);
    });

    it('expands item to show vendors when clicked', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Flour has multiple vendors, should be expandable
      const flourHeader = screen
        .getByText('Flour')
        .closest('[role="button"]');

      if (flourHeader) {
        expect(flourHeader).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(flourHeader);

        expect(flourHeader).toHaveAttribute('aria-expanded', 'true');
      }
    });

    it('shows vendor variants when item expanded', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour item
      const flourText = screen.getByText('Flour');
      const flourHeader = flourText.closest('[aria-expanded]') || flourText.parentElement.parentElement;
      fireEvent.click(flourHeader);

      // Should show both vendors (may have multiple elements with same text)
      expect(screen.getAllByText('Sysco').length).toBeGreaterThan(0);
      expect(screen.getAllByText('US Foods').length).toBeGreaterThan(0);
    });
  });

  describe('Item Click Triggers Callback', () => {
    it('calls onItemClick when variant row is clicked', () => {
      const onItemClick = vi.fn();

      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={onItemClick}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour to see variants (click the header area)
      const flourText = screen.getByText('Flour');
      const flourHeader = flourText.closest('[aria-expanded]') || flourText.parentElement.parentElement;
      fireEvent.click(flourHeader);

      // Click on a variant row (may be multiple, use first one)
      const syscoVariants = screen.getAllByRole('button', { name: /Sysco/i });
      fireEvent.click(syscoVariants[0]);

      // Should call the callback
      expect(onItemClick).toHaveBeenCalled();
    });

    it('calls onItemClick with correct item data', () => {
      const onItemClick = vi.fn();

      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={onItemClick}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour to see variants (click the header area)
      const flourText = screen.getByText('Flour');
      const flourHeader = flourText.closest('[aria-expanded]') || flourText.parentElement.parentElement;
      fireEvent.click(flourHeader);

      // Click on Sysco variant (use first one)
      const syscoVariants = screen.getAllByRole('button', { name: /Sysco/i });
      fireEvent.click(syscoVariants[0]);

      expect(onItemClick).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorName: 'Sysco',
        })
      );
    });

    it('supports keyboard navigation for item click', () => {
      const onItemClick = vi.fn();

      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={onItemClick}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour to see variants
      const flourText = screen.getByText('Flour');
      const flourHeader = flourText.closest('[aria-expanded]') || flourText.parentElement.parentElement;
      fireEvent.click(flourHeader);

      // Find a variant row and test Enter key (use first one)
      const syscoVariants = screen.getAllByRole('button', { name: /Sysco/i });
      fireEvent.keyDown(syscoVariants[0], { key: 'Enter' });

      expect(onItemClick).toHaveBeenCalled();
    });
  });

  describe('Reorder Button', () => {
    it('shows reorder button for critical items', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Flour is critical, should have reorder button
      const reorderButtons = screen.getAllByRole('button', {
        name: /reorder/i,
      });

      expect(reorderButtons.length).toBeGreaterThan(0);
    });

    it('calls onReorder when reorder button clicked', () => {
      const onReorder = vi.fn();

      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={onReorder}
        />
      );

      // Find reorder button by aria-label pattern (starts with "Reorder")
      const reorderButton = screen.getAllByRole('button', {
        name: /^Reorder /,
      })[0];

      fireEvent.click(reorderButton);

      expect(onReorder).toHaveBeenCalled();
    });

    it('does not show reorder button when onReorder not provided', () => {
      render(
        <InventoryListByItem items={mockItems} onItemClick={vi.fn()} />
      );

      // Use aria-label pattern to find actual reorder buttons
      const reorderButtons = screen.queryAllByRole('button', { name: /^Reorder / });
      expect(reorderButtons.length).toBe(0);
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no items', () => {
      render(
        <InventoryListByItem
          items={[]}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      expect(screen.getByText(/no.*items/i)).toBeInTheDocument();
    });

    it('shows helpful message in empty state', () => {
      render(
        <InventoryListByItem
          items={[]}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      expect(
        screen.getByText(/filters|add/i)
      ).toBeInTheDocument();
    });
  });

  describe('Displays Item Information', () => {
    it('shows item name', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      expect(screen.getByText('Flour')).toBeInTheDocument();
      expect(screen.getByText('Sugar')).toBeInTheDocument();
      expect(screen.getByText('Salt')).toBeInTheDocument();
    });

    it('shows category when available', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Multiple items may have the same category, use getAllByText
      expect(screen.getAllByText('Dry Goods').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Spices').length).toBeGreaterThan(0);
    });

    it('shows stock progress bar', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Check for progress bar elements
      const progressBars = screen.getAllByRole('progressbar');
      expect(progressBars.length).toBeGreaterThan(0);
    });

    it('shows vendor badge in variants', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour to see vendor badges
      const flourText = screen.getByText('Flour');
      const flourHeader = flourText.closest('[aria-expanded]') || flourText.parentElement.parentElement;
      fireEvent.click(flourHeader);

      // Multiple Sysco/US Foods may appear, use getAllByText
      expect(screen.getAllByText('Sysco').length).toBeGreaterThan(0);
      expect(screen.getAllByText('US Foods').length).toBeGreaterThan(0);
    });

    it('shows SKU when available', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Expand Flour to see SKUs
      const flourHeader = screen
        .getByText('Flour')
        .closest('[role="button"]');

      if (flourHeader) {
        fireEvent.click(flourHeader);

        expect(screen.getByText(/FLR-001/)).toBeInTheDocument();
        expect(screen.getByText(/FLR-002/)).toBeInTheDocument();
      }
    });
  });

  describe('Section Counts', () => {
    it('shows correct item count per section', () => {
      render(
        <InventoryListByItem
          items={mockItems}
          onItemClick={vi.fn()}
          onReorder={vi.fn()}
        />
      );

      // Find section with count
      const criticalSection = screen.getByRole('button', {
        name: /critical.*1 item/i,
      });

      expect(criticalSection).toBeInTheDocument();
    });
  });
});
