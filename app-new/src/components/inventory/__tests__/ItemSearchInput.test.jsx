import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemSearchInput from '../ItemSearchInput';

describe('ItemSearchInput', () => {
  const mockItems = [
    {
      id: 1,
      name: 'Flour',
      sku: 'FLR-001',
      vendorName: 'Sysco Foods',
      currentStock: 15,
      parLevel: 20,
      unit: 'kg',
    },
    {
      id: 2,
      name: 'Sugar',
      sku: 'SGR-001',
      vendorName: 'US Foods',
      currentStock: 3,
      parLevel: 20,
      unit: 'kg',
    },
    {
      id: 3,
      name: 'Salt',
      vendorName: 'Local Farms',
      currentStock: 1,
      parLevel: 10,
      unit: 'kg',
    },
  ];

  const mockOnSearch = vi.fn();
  const mockOnSelect = vi.fn();
  const mockOnChange = vi.fn();
  const mockOnCreateNew = vi.fn();

  beforeEach(() => {
    mockOnSearch.mockResolvedValue(mockItems);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // DEBOUNCE
  // ============================================

  describe('Debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces search calls by 300ms', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'f' } });
      fireEvent.change(input, { target: { value: 'fl' } });
      fireEvent.change(input, { target: { value: 'flo' } });

      // Should not have called search yet
      expect(mockOnSearch).not.toHaveBeenCalled();

      // Advance timers by 300ms
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should call search once with final value
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
      expect(mockOnSearch).toHaveBeenCalledWith('flo');
    });

    it('cancels previous debounce when new input arrives', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');

      fireEvent.change(input, { target: { value: 'flour' } });

      // Advance 200ms (not enough to trigger)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(mockOnSearch).not.toHaveBeenCalled();

      // Type more
      fireEvent.change(input, { target: { value: 'sugar' } });

      // Advance another 200ms
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Still not called
      expect(mockOnSearch).not.toHaveBeenCalled();

      // Advance to trigger
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockOnSearch).toHaveBeenCalledTimes(1);
      expect(mockOnSearch).toHaveBeenCalledWith('sugar');
    });
  });

  // ============================================
  // RESULTS DISPLAY
  // ============================================

  describe('Results Display', () => {
    it('opens dropdown with results after search', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');

      // Initially dropdown should be closed
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'flour' } });

      // Wait for debounce and results to load
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3);
      });
    });

    it('shows vendor names in results', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Sysco Foods')).toBeInTheDocument();
        expect(screen.getByText('US Foods')).toBeInTheDocument();
        expect(screen.getByText('Local Farms')).toBeInTheDocument();
      });
    });

    it('shows stock levels in results', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('15 kg')).toBeInTheDocument();
        expect(screen.getByText('3 kg')).toBeInTheDocument();
        expect(screen.getByText('1 kg')).toBeInTheDocument();
      });
    });

    it('shows SKU when available', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('FLR-001')).toBeInTheDocument();
        expect(screen.getByText('SGR-001')).toBeInTheDocument();
      });
    });

    it('applies correct stock status classes', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'all' } });

      await waitFor(() => {
        const stockElements = screen.getAllByText(/kg$/);
        // Flour (75%) = ok, Sugar (15%) = low, Salt (10%) = critical
        // Use className.toMatch for CSS modules
        expect(stockElements[0].className).toMatch(/ok/); // 15/20 = 75%
        expect(stockElements[1].className).toMatch(/low/); // 3/20 = 15%
        expect(stockElements[2].className).toMatch(/critical/); // 1/10 = 10%
      });
    });
  });

  // ============================================
  // KEYBOARD NAVIGATION
  // ============================================

  describe('Keyboard Navigation', () => {
    it('navigates down with ArrowDown', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(
        screen.getByText('Flour').closest('[role="option"]').className
      ).toMatch(/highlighted/);

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(
        screen.getByText('Sugar').closest('[role="option"]').className
      ).toMatch(/highlighted/);
    });

    it('navigates up with ArrowUp', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      // Navigate to second item
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Navigate back up
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(
        screen.getByText('Flour').closest('[role="option"]').className
      ).toMatch(/highlighted/);
    });

    it('selects item with Enter', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnSelect).toHaveBeenCalledWith(mockItems[0]);
    });

    it('closes dropdown with Escape', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('wraps around at the end of list', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'all' } });

      await waitFor(() => {
        expect(screen.getByText('Salt')).toBeInTheDocument();
      });

      // Navigate to last item
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // One more should wrap to first
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(
        screen.getByText('Flour').closest('[role="option"]').className
      ).toMatch(/highlighted/);
    });
  });

  // ============================================
  // CLICK OUTSIDE
  // ============================================

  describe('Click Outside', () => {
    it('closes dropdown on click outside', async () => {
      render(
        <div>
          <button data-testid="outside">Outside</button>
          <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
        </div>
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ============================================
  // NO RESULTS STATE
  // ============================================

  describe('No Results State', () => {
    it('displays "No items found" when search returns empty', async () => {
      mockOnSearch.mockResolvedValue([]);

      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'xyz' } });

      await waitFor(() => {
        expect(screen.getByText('No items found')).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // CREATE NEW OPTION
  // ============================================

  describe('Create New Option', () => {
    it('shows "Create new" when onCreateNew is provided', async () => {
      mockOnSearch.mockResolvedValue([]);

      render(
        <ItemSearchInput
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
          onCreateNew={mockOnCreateNew}
        />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'New Item' } });

      await waitFor(() => {
        expect(screen.getByText(/Create/)).toBeInTheDocument();
        expect(screen.getByText('New Item')).toBeInTheDocument();
      });
    });

    it('calls onCreateNew when "Create new" is clicked', async () => {
      mockOnSearch.mockResolvedValue([]);

      render(
        <ItemSearchInput
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
          onCreateNew={mockOnCreateNew}
        />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'New Item' } });

      await waitFor(() => {
        expect(screen.getByText(/Create/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Create/).closest('[role="option"]'));

      expect(mockOnCreateNew).toHaveBeenCalledWith('New Item');
    });

    it('does not show "Create new" when exact match exists', async () => {
      mockOnSearch.mockResolvedValue([{ id: 1, name: 'Flour' }]);

      render(
        <ItemSearchInput
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
          onCreateNew={mockOnCreateNew}
        />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'Flour' } });

      // Wait for the result option (not the Create option) to appear
      // This ensures results have loaded and showCreateNew has been recalculated
      await waitFor(() => {
        const options = screen.getAllByRole('option');
        // When exact match exists, Create option should not be present
        // so we should only have the result item
        expect(options.some(opt => opt.textContent.includes('Flour') && !opt.textContent.includes('Create'))).toBe(true);
      });

      // Now verify Create option is not shown
      expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
    });
  });

  // ============================================
  // CLEAR BUTTON
  // ============================================

  describe('Clear Button', () => {
    it('shows clear button when input has value', () => {
      render(
        <ItemSearchInput
          value="flour"
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    it('hides clear button when input is empty', () => {
      render(
        <ItemSearchInput
          value=""
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('clears input when clear button clicked', () => {
      render(
        <ItemSearchInput
          value="flour"
          onChange={mockOnChange}
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.click(screen.getByLabelText('Clear search'));

      expect(mockOnChange).toHaveBeenCalledWith('');
    });
  });

  // ============================================
  // ACCESSIBILITY
  // ============================================

  describe('Accessibility', () => {
    it('has combobox role', () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('has aria-expanded attribute', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('has aria-autocomplete attribute', () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );
      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-autocomplete',
        'list'
      );
    });

    it('updates aria-activedescendant on navigation', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByText('Flour')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(input).toHaveAttribute('aria-activedescendant', 'item-option-0');
    });

    it('listbox has accessible label', async () => {
      render(
        <ItemSearchInput onSearch={mockOnSearch} onSelect={mockOnSelect} />
      );

      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: 'flour' } });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toHaveAttribute(
          'aria-label',
          'Search results'
        );
      });
    });
  });

  // ============================================
  // DISABLED STATE
  // ============================================

  describe('Disabled State', () => {
    it('disables input when disabled prop is true', () => {
      render(
        <ItemSearchInput
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
          disabled
        />
      );

      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('hides clear button when disabled', () => {
      render(
        <ItemSearchInput
          value="flour"
          onSearch={mockOnSearch}
          onSelect={mockOnSelect}
          disabled
        />
      );

      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });
  });
});
