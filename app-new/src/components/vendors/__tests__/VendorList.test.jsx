/**
 * VendorList Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import VendorList from '../VendorList';

// Mock VendorCard
vi.mock('../VendorCard', () => ({
  default: ({ vendor, onClick, onEdit, selected, compact }) => (
    <div
      data-testid={`vendor-card-${vendor.id}`}
      data-selected={selected}
      data-compact={compact}
      onClick={() => onClick?.(vendor)}
    >
      {vendor.name}
      <button onClick={(e) => { e.stopPropagation(); onEdit?.(vendor); }}>
        Edit
      </button>
    </div>
  ),
}));

// Mock CSS modules
vi.mock('../../../styles/components/vendorlist.module.css', () => ({
  default: {
    container: 'container',
    toolbar: 'toolbar',
    statsSummary: 'statsSummary',
    statsText: 'statsText',
    alertCount: 'alertCount',
    controls: 'controls',
    toggleLabel: 'toggleLabel',
    toggleInput: 'toggleInput',
    toggleText: 'toggleText',
    sortGroup: 'sortGroup',
    sortLabel: 'sortLabel',
    sortSelect: 'sortSelect',
    viewModes: 'viewModes',
    viewModeButton: 'viewModeButton',
    active: 'active',
    vendorContainer: 'vendorContainer',
    gridView: 'gridView',
    listView: 'listView',
    loadingState: 'loadingState',
    spinner: 'spinner',
    emptyState: 'emptyState',
    emptyIcon: 'emptyIcon',
    emptyText: 'emptyText',
    emptyHint: 'emptyHint',
    noResults: 'noResults',
    showAllButton: 'showAllButton',
  },
}));

describe('VendorList', () => {
  const mockVendors = [
    {
      id: 'vendor-1',
      name: 'Alpha Supplies',
      itemCount: 20,
      rating: 4.5,
      criticalCount: 2,
      lowCount: 1,
      totalValue: 5000,
      isActive: true,
    },
    {
      id: 'vendor-2',
      name: 'Beta Foods',
      itemCount: 15,
      rating: 3.0,
      criticalCount: 0,
      lowCount: 0,
      totalValue: 3000,
      isActive: true,
    },
    {
      id: 'vendor-3',
      name: 'Gamma Products',
      itemCount: 25,
      rating: 5.0,
      criticalCount: 1,
      lowCount: 0,
      totalValue: 8000,
      isActive: false,
    },
  ];

  const defaultProps = {
    vendors: mockVendors,
    onVendorClick: vi.fn(),
    onVendorEdit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active vendors by default (hides inactive)', () => {
    render(<VendorList {...defaultProps} />);

    // Should show only active vendors by default
    expect(screen.getByText('Alpha Supplies')).toBeInTheDocument();
    expect(screen.getByText('Beta Foods')).toBeInTheDocument();
    // Gamma is inactive, so not shown by default
    expect(screen.queryByText('Gamma Products')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<VendorList {...defaultProps} loading />);

    expect(screen.getByText('Loading vendors...')).toBeInTheDocument();
  });

  it('shows empty state with custom message', () => {
    render(
      <VendorList
        {...defaultProps}
        vendors={[]}
        emptyMessage="No vendors found"
      />
    );

    expect(screen.getByText('No vendors found')).toBeInTheDocument();
  });

  it('shows default empty message', () => {
    render(<VendorList {...defaultProps} vendors={[]} />);

    expect(screen.getByText('No vendors found')).toBeInTheDocument();
  });

  it('calls onVendorClick when vendor is clicked', () => {
    render(<VendorList {...defaultProps} />);

    fireEvent.click(screen.getByText('Alpha Supplies'));

    expect(defaultProps.onVendorClick).toHaveBeenCalledWith(mockVendors[0]);
  });

  it('calls onVendorEdit when edit button is clicked', () => {
    render(<VendorList {...defaultProps} />);

    const vendorCard = screen.getByTestId('vendor-card-vendor-1');
    const editButton = within(vendorCard).getByText('Edit');
    fireEvent.click(editButton);

    expect(defaultProps.onVendorEdit).toHaveBeenCalledWith(mockVendors[0]);
  });

  it('marks selected vendor', () => {
    render(<VendorList {...defaultProps} selectedId="vendor-2" />);

    const selectedCard = screen.getByTestId('vendor-card-vendor-2');
    expect(selectedCard).toHaveAttribute('data-selected', 'true');
  });

  it('sorts vendors by name ascending by default', () => {
    render(<VendorList {...defaultProps} />);

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Default is name-asc: Alpha, Beta (Gamma is inactive so hidden)
    expect(vendorCards[0]).toHaveTextContent('Alpha Supplies');
    expect(vendorCards[1]).toHaveTextContent('Beta Foods');
  });

  it('sorts vendors by name descending', () => {
    render(<VendorList {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'name-desc' } });

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Beta, Alpha (Gamma is inactive so hidden)
    expect(vendorCards[0]).toHaveTextContent('Beta Foods');
    expect(vendorCards[1]).toHaveTextContent('Alpha Supplies');
  });

  it('sorts vendors by items count', () => {
    render(<VendorList {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'items-desc' } });

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Sorted descending by itemCount: Alpha (20), Beta (15) - Gamma inactive hidden
    expect(vendorCards[0]).toHaveTextContent('Alpha Supplies');
    expect(vendorCards[1]).toHaveTextContent('Beta Foods');
  });

  it('sorts vendors by rating', () => {
    render(<VendorList {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'rating-desc' } });

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Sorted descending by rating: Alpha (4.5), Beta (3.0)
    expect(vendorCards[0]).toHaveTextContent('Alpha Supplies');
    expect(vendorCards[1]).toHaveTextContent('Beta Foods');
  });

  it('sorts vendors by alerts', () => {
    render(<VendorList {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'alerts-desc' } });

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Sorted descending by total alerts: Alpha (3), Beta (0)
    expect(vendorCards[0]).toHaveTextContent('Alpha Supplies');
    expect(vendorCards[1]).toHaveTextContent('Beta Foods');
  });

  it('sorts vendors by value', () => {
    render(<VendorList {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'value-desc' } });

    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    // Sorted descending by totalValue: Alpha (5000), Beta (3000)
    expect(vendorCards[0]).toHaveTextContent('Alpha Supplies');
    expect(vendorCards[1]).toHaveTextContent('Beta Foods');
  });

  it('shows inactive vendors when checkbox is checked', () => {
    render(<VendorList {...defaultProps} />);

    // Initially only active vendors shown
    expect(screen.queryByText('Gamma Products')).not.toBeInTheDocument();

    // Click "Show inactive" checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Now all vendors should be shown including inactive
    expect(screen.getByText('Gamma Products')).toBeInTheDocument();
    expect(screen.getAllByTestId(/vendor-card-/)).toHaveLength(3);
  });

  it('toggles view mode between grid and list', () => {
    render(<VendorList {...defaultProps} />);

    const listButton = screen.getByTitle('List view');
    fireEvent.click(listButton);

    // Cards should be in compact mode when list view
    const vendorCards = screen.getAllByTestId(/vendor-card-/);
    vendorCards.forEach(card => {
      expect(card).toHaveAttribute('data-compact', 'true');
    });

    // Switch back to grid
    const gridButton = screen.getByTitle('Grid view');
    fireEvent.click(gridButton);

    // Cards should not be compact in grid view
    const updatedCards = screen.getAllByTestId(/vendor-card-/);
    updatedCards.forEach(card => {
      expect(card).toHaveAttribute('data-compact', 'false');
    });
  });

  it('renders with empty vendors array', () => {
    render(<VendorList vendors={[]} />);

    expect(screen.getByText('No vendors found')).toBeInTheDocument();
  });

  it('handles undefined vendors prop', () => {
    render(<VendorList />);

    expect(screen.getByText('No vendors found')).toBeInTheDocument();
  });

  it('displays vendor count in stats', () => {
    render(<VendorList {...defaultProps} />);

    // 2 active vendors shown
    expect(screen.getByText(/2 vendors/)).toBeInTheDocument();
  });

  it('displays alert count in stats when vendors have alerts', () => {
    render(<VendorList {...defaultProps} />);

    expect(screen.getByText(/1 with alerts/)).toBeInTheDocument();
  });
});
