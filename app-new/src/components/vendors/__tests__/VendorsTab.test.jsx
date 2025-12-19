/**
 * VendorsTab Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VendorsTab from '../VendorsTab';

// Mock vendorService
vi.mock('../../../services/inventory/vendorService', () => ({
  getAllVendors: vi.fn(),
  searchVendors: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
  getVendorWithItems: vi.fn(),
  getVendorStats: vi.fn(),
  isVendorNameAvailable: vi.fn(),
  setPreferredVendor: vi.fn(),
}));

// Mock child components
vi.mock('../VendorList', () => ({
  default: ({ vendors, onVendorClick, onVendorEdit, loading, emptyMessage }) => (
    <div data-testid="vendor-list">
      {loading && <span>Loading vendors...</span>}
      {!loading && vendors.length === 0 && <span>{emptyMessage}</span>}
      {vendors.map((v) => (
        <div key={v.id} data-testid={`vendor-${v.id}`} onClick={() => onVendorClick?.(v)}>
          {v.name}
          <button data-testid={`edit-${v.id}`} onClick={(e) => { e.stopPropagation(); onVendorEdit?.(v); }}>
            Edit
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../VendorDetailModal', () => ({
  default: ({ vendor, onClose, onEdit, onDelete, onSetPrimary }) => (
    <div data-testid="vendor-detail-modal">
      <span>{vendor.name}</span>
      <button data-testid="detail-close" onClick={onClose}>Close</button>
      <button data-testid="detail-edit" onClick={() => onEdit(vendor)}>Edit</button>
      <button data-testid="detail-delete" onClick={() => onDelete(vendor)}>Delete</button>
      <button data-testid="detail-primary" onClick={() => onSetPrimary(vendor)}>Set Primary</button>
    </div>
  ),
}));

vi.mock('../AddEditVendorModal', () => ({
  default: ({ vendor, onClose, onSave }) => (
    <div data-testid="add-edit-vendor-modal">
      <span>{vendor ? 'Edit Vendor' : 'Add Vendor'}</span>
      <button data-testid="modal-cancel" onClick={onClose}>Cancel</button>
      <button data-testid="modal-save" onClick={() => onSave({ ...vendor, name: vendor?.name || 'New Vendor' })}>Save</button>
    </div>
  ),
}));

// Mock CSS modules
vi.mock('../../../styles/components/vendorstab.module.css', () => ({
  default: new Proxy({}, {
    get: (target, prop) => prop,
  }),
}));

import {
  getAllVendors,
  searchVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorWithItems,
  getVendorStats,
  isVendorNameAvailable,
  setPreferredVendor,
} from '../../../services/inventory/vendorService';

describe('VendorsTab', () => {
  const mockVendors = [
    { id: 'vendor-1', name: 'Alpha Supplies', isActive: true, criticalCount: 2, lowCount: 1 },
    { id: 'vendor-2', name: 'Beta Foods', isActive: true, criticalCount: 0, lowCount: 0 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getAllVendors.mockResolvedValue(mockVendors);
    searchVendors.mockResolvedValue([]);
    getVendorWithItems.mockResolvedValue({ items: [] });
    getVendorStats.mockResolvedValue({});
    isVendorNameAvailable.mockResolvedValue(true);
    createVendor.mockResolvedValue({ id: 'new-vendor' });
    updateVendor.mockResolvedValue({});
    deleteVendor.mockResolvedValue({});
    setPreferredVendor.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('renders header with title', async () => {
      render(<VendorsTab />);
      expect(screen.getByText('Vendors')).toBeInTheDocument();
    });

    it('loads vendors on mount', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalled();
      });
    });

    it('displays vendors in list', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByText('Alpha Supplies')).toBeInTheDocument();
        expect(screen.getByText('Beta Foods')).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    it('filters by status - active only by default', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalledWith({ isActive: true });
      });
    });

    it('filters by status - all vendors', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });

      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalledWith({});
      });
    });

    it('filters by status - inactive only', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } });

      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalledWith({ isActive: false });
      });
    });
  });

  describe('Vendor Actions', () => {
    it('opens detail modal when vendor is clicked', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByText('Alpha Supplies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('vendor-vendor-1'));

      await waitFor(() => {
        expect(screen.getByTestId('vendor-detail-modal')).toBeInTheDocument();
      });
    });

    it('closes detail modal', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('vendor-vendor-1'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('vendor-detail-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('detail-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('vendor-detail-modal')).not.toBeInTheDocument();
      });
    });

    it('opens edit modal from detail modal', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('vendor-vendor-1'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('detail-edit'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('add-edit-vendor-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Vendor')).toBeInTheDocument();
      });
    });

    it('deletes vendor from detail modal', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('vendor-vendor-1'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('detail-delete'));
      });

      await waitFor(() => {
        expect(deleteVendor).toHaveBeenCalledWith('vendor-1', { force: true });
      });
    });

    it('sets vendor as primary', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('vendor-vendor-1'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('detail-primary'));
      });

      await waitFor(() => {
        expect(setPreferredVendor).toHaveBeenCalledWith('vendor-1');
      });
    });
  });

  describe('Add Vendor', () => {
    it('opens add vendor modal when Add button is clicked', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByText('Add Vendor')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Vendor'));

      await waitFor(() => {
        expect(screen.getByTestId('add-edit-vendor-modal')).toBeInTheDocument();
      });
    });

    it('creates new vendor', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Add Vendor'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('modal-save'));
      });

      await waitFor(() => {
        expect(createVendor).toHaveBeenCalled();
      });
    });

    it('closes add modal on cancel', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Add Vendor'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('add-edit-vendor-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('modal-cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('add-edit-vendor-modal')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edit Vendor', () => {
    it('opens edit modal from list', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-vendor-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('edit-vendor-1'));

      await waitFor(() => {
        expect(screen.getByTestId('add-edit-vendor-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Vendor')).toBeInTheDocument();
      });
    });

    it('updates vendor', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('edit-vendor-1'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('modal-save'));
      });

      await waitFor(() => {
        expect(updateVendor).toHaveBeenCalled();
      });
    });
  });

  describe('Refresh', () => {
    it('refreshes vendor list when refresh button is clicked', async () => {
      render(<VendorsTab />);

      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByLabelText('Refresh vendors'));

      await waitFor(() => {
        expect(getAllVendors).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message when load fails', async () => {
      getAllVendors.mockRejectedValue(new Error('Load failed'));

      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load vendors. Please try again.')).toBeInTheDocument();
      });
    });

    it('dismisses error when dismiss button is clicked', async () => {
      getAllVendors.mockRejectedValue(new Error('Load failed'));

      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load vendors. Please try again.')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Dismiss error'));

      await waitFor(() => {
        expect(screen.queryByText('Failed to load vendors. Please try again.')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible search input', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByLabelText('Search vendors')).toBeInTheDocument();
      });
    });

    it('has accessible status filter', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByLabelText('Status')).toBeInTheDocument();
      });
    });

    it('has accessible refresh button', async () => {
      render(<VendorsTab />);
      await waitFor(() => {
        expect(screen.getByLabelText('Refresh vendors')).toBeInTheDocument();
      });
    });

    it('announces error with role="alert"', async () => {
      getAllVendors.mockRejectedValue(new Error('Load failed'));

      render(<VendorsTab />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });
});
