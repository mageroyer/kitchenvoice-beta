/**
 * VendorDetailModal Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VendorDetailModal from '../VendorDetailModal';

// Mock CSS modules
vi.mock('../../../styles/components/vendordetailmodal.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

describe('VendorDetailModal', () => {
  const mockVendor = {
    id: 'vendor-1',
    name: 'Test Vendor Inc.',
    legalName: 'Test Vendor Incorporated',
    vendorCode: 'TV001',
    contactName: 'John Doe',
    phone: '5551234567',
    email: 'john@testvendor.com',
    orderPhone: '5559876543',
    orderEmail: 'orders@testvendor.com',
    address: '123 Main St',
    city: 'New York',
    province: 'NY',
    postalCode: '10001',
    website: 'https://testvendor.com',
    paymentTerms: 'net30',
    minimumOrder: 100,
    rating: 4.5,
    isPrimary: false,
    isActive: true,
    notes: 'Great vendor for produce.',
  };

  const mockItems = [
    { id: 'item-1', name: 'Tomatoes', sku: 'TOM-001', currentStock: 50, unit: 'lbs' },
    { id: 'item-2', name: 'Lettuce', sku: 'LET-001', currentStock: 30, unit: 'heads' },
  ];

  const mockStats = {
    itemCount: 25,
    activeItemCount: 20,
    totalInventoryValue: 5000,
    categoryCount: 3,
    categories: ['Produce', 'Dairy'],
    lastOrderDate: '2024-01-15',
    totalSpent: 25000,
  };

  const defaultProps = {
    vendor: mockVendor,
    items: mockItems,
    stats: mockStats,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onSetPrimary: vi.fn(),
    loading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders vendor name', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(screen.getByText('Test Vendor Inc.')).toBeInTheDocument();
  });

  it('renders vendor code', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(screen.getByText('TV001')).toBeInTheDocument();
  });

  it('shows primary star when vendor is primary', () => {
    const primaryVendor = { ...mockVendor, isPrimary: true };
    render(<VendorDetailModal {...defaultProps} vendor={primaryVendor} />);
    expect(screen.getByTitle('Primary vendor')).toBeInTheDocument();
  });

  it('shows inactive badge when vendor is inactive', () => {
    const inactiveVendor = { ...mockVendor, isActive: false };
    render(<VendorDetailModal {...defaultProps} vendor={inactiveVendor} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders tabs', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(screen.getByRole('tab', { name: 'Information' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Items/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Statistics' })).toBeInTheDocument();
  });

  it('switches between tabs', () => {
    render(<VendorDetailModal {...defaultProps} />);

    // Switch to Items tab
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();

    // Switch to Statistics tab
    fireEvent.click(screen.getByRole('tab', { name: 'Statistics' }));
    expect(screen.getByText('Total Items')).toBeInTheDocument();
  });

  it('renders contact information on Info tab', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('(555) 123-4567')).toBeInTheDocument();
  });

  it('renders items on Items tab', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));

    expect(screen.getByText('Tomatoes')).toBeInTheDocument();
    expect(screen.getByText('TOM-001')).toBeInTheDocument();
    expect(screen.getByText('Lettuce')).toBeInTheDocument();
  });

  it('shows empty items message', () => {
    render(<VendorDetailModal {...defaultProps} items={[]} />);
    fireEvent.click(screen.getByRole('tab', { name: /Items/ }));

    expect(screen.getByText('No inventory items linked to this vendor')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<VendorDetailModal {...defaultProps} loading />);
    expect(screen.getByText('Loading vendor details...')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onEdit when Edit button is clicked', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Edit Vendor'));
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockVendor);
  });

  it('shows delete confirmation when Delete is clicked', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Vendor?')).toBeInTheDocument();
  });

  it('cancels delete confirmation', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Vendor?')).not.toBeInTheDocument();
  });

  it('confirms delete', async () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete'));

    // Click the Delete button in the confirmation dialog
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[deleteButtons.length - 1]); // Click the confirm delete button

    await waitFor(() => {
      expect(defaultProps.onDelete).toHaveBeenCalledWith(mockVendor);
    });
  });

  it('calls onSetPrimary when Set as Primary is clicked', () => {
    render(<VendorDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Set as Primary'));
    expect(defaultProps.onSetPrimary).toHaveBeenCalledWith(mockVendor);
  });

  it('hides Set as Primary button for primary vendor', () => {
    const primaryVendor = { ...mockVendor, isPrimary: true };
    render(<VendorDetailModal {...defaultProps} vendor={primaryVendor} />);
    expect(screen.queryByText('Set as Primary')).not.toBeInTheDocument();
  });

  it('locks body scroll when open', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('has proper accessibility attributes', () => {
    render(<VendorDetailModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
